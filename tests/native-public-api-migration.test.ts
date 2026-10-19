import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  admitOrdinary, assertPublicQualification, digest, inputDirectory, jsonBytes,
  qualifyOrdinaryResult, record, snapshotPinnedInputs, type InvocationResult,
} from "../architecture/checks/native-public-api-migration-admission.ts";
import { acquireHistoricalData, invoke, parseReportArguments, reportDestination, writeReport } from "../architecture/checks/native-public-api-migration.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFile(join(root, path));
const request = record(JSON.parse((await read(`${inputDirectory}/request.json`)).toString("utf8")));
const review = record(request["review"]);
const empty = { errors: 0, warnings: 0, infos: 0 };
function ordinary(passed = false) {
  const diagnostics = ["assembly", "core"].map(name => ({
    ruleId: "package.public-api-compatibility.baseline-tool-mismatch", severity: "error", subject: `@get-modular/${name}`,
    message: "Released baseline uses API Extractor 7.58.12; current adapter uses typescript-native/7.0.2.",
    location: { path: `architecture/public-api/${name}.json` }, relatedLocations: [], evidence: [],
    remediation: "Regenerate the released baseline only through the release workflow after reviewing the tool upgrade.", requiresArchitectureReview: true,
  }));
  const names = ["architecture.source-dependencies", "documentation.local-references", "governance.architecture-decisions", "package.public-api-compatibility", "quality.source-coverage", "quality.suppression-governance", "repository.agent-workflow", "workspace.dependency-declarations"];
  const report = {
    reportSchemaVersion: 1, foundationVersion: "fixture-native", coverage: "full", outcome: passed ? "passed" : "violations",
    summary: passed ? empty : { ...empty, errors: 2 },
    capabilities: names.map(capabilityId => {
      const mismatch = !passed && capabilityId === "package.public-api-compatibility";
      return { capabilityId, capabilityConfigSchemaVersion: capabilityId === "architecture.source-dependencies" ? 3 : 1,
        outcome: mismatch ? "violations" : "passed", summary: mismatch ? { ...empty, errors: 2 } : empty, diagnostics: mismatch ? diagnostics : [] };
    }),
  };
  return { report, result: { stdout: `${JSON.stringify(report)}\n`, stderr: "actual ordinary stderr\n", exitCode: passed ? 0 : 1 } };
}
function capability(report: ReturnType<typeof ordinary>["report"], index: number) {
  const value = report.capabilities[index]; assert.ok(value); return value;
}
function diagnostic(report: ReturnType<typeof ordinary>["report"]) {
  const value = capability(report, 3).diagnostics[0]; assert.ok(value); return value;
}
async function publicFixture(): Promise<InvocationResult> {
  // Reconstruct the reviewed native A from retained B and the five complete
  // reviewed after-items. Known A digests bind this transport fixture.
  const difference = record(JSON.parse((await read(`${inputDirectory}/tool-diff.json`)).toString("utf8")));
  const changes = (difference["packages"] as Record<string, unknown>[]);
  const pins = review["packages"] as Record<string, unknown>[];
  const packages = [];
  for (const pin of pins) {
    const name = String(pin["packageName"]).replace("@get-modular/", "");
    const baseline = record(JSON.parse((await read(`${inputDirectory}/baseline-${name}.json`)).toString("utf8")));
    const native = structuredClone(baseline); native["extractorVersion"] = "typescript-native/7.0.2";
    const entry = record((native["entrypoints"] as unknown[])[0]);
    const diffPackage = record(changes.find(p => p["packageName"] === pin["packageName"]));
    const diffEntry = record((diffPackage["entrypoints"] as unknown[])[0]);
    const afters = (diffEntry["changed"] as Record<string, unknown>[]).map(c => record(c["after"]));
    entry["items"] = (entry["items"] as Record<string, unknown>[]).map(item => afters.find(after => after["canonicalReference"] === item["canonicalReference"]) ?? item);
    assert.equal(digest(jsonBytes(native)), pin["nativeReleasedDigest"]);
    packages.push({ ...pin, baseline, nativeReleased: native, nativeCandidate: native });
  }
  const observation = { kind: "foundation:public-api-native-migration:observation:1", policyDigest: review["policyDigest"], toolchainIdentity: JSON.stringify({ extractor: "typescript-native/7.0.2", compiler: "7.0.2" }), packages, toolDiff: difference, toolDiffDigest: review["toolDiffDigest"], typedDiagnostics: [], artifactDiagnostics: [] };
  return { stdout: JSON.stringify({ schemaVersion: 1, kind: "foundation:public-api-native-transition:result:1", outcome: "qualified", migrationApplied: false, writes: [], reviewDigest: digest(jsonBytes(review)), observationDigest: digest(jsonBytes(observation)), observation }), stderr: "", exitCode: 0 };
}
const publicResult = await publicFixture();
await test("exact ordinary success reads no migration files and performs no acquisition", async () => {
  const result = await qualifyOrdinaryResult({ ...ordinary(true), read: async () => { throw new Error("unexpected read"); }, observe: async () => { throw new Error("unexpected acquisition"); } });
  assert.equal(result.outcome, "ordinary-passed");
});
await test("exact reviewed two-package observation qualifies separately and preserves actual ordinary bytes/exit", async () => {
  const actual = ordinary(); let calls = 0;
  const result = await qualifyOrdinaryResult({ ...actual, read, observe: async () => { calls++; return publicResult; } });
  assert.equal(result.outcome, "named-migration-qualified"); assert.equal(calls, 1); assert.deepEqual(result.ordinary, actual.result);
});
await test("unrelated errors, inventory changes and malformed mismatch fields never acquire", async t => {
  for (const [name, mutate] of [
    ["unrelated diagnostic", (r: ReturnType<typeof ordinary>["report"]) => { capability(r, 0).diagnostics.push({ ...diagnostic(r), ruleId: "unrelated" }); }],
    ["missing capability", (r: ReturnType<typeof ordinary>["report"]) => { r.capabilities.pop(); }],
    ["duplicate capability", (r: ReturnType<typeof ordinary>["report"]) => { r.capabilities.push(capability(r, 0)); }],
    ["selected coverage", (r: ReturnType<typeof ordinary>["report"]) => { r.coverage = "selected"; }],
    ["wrong anchor", (r: ReturnType<typeof ordinary>["report"]) => { diagnostic(r).location.path = "other.json"; }],
  ] as const) {await t.test(name, async () => {
    const actual = ordinary(); mutate(actual.report);
    await assert.rejects(qualifyOrdinaryResult({ ...actual, read: async () => { throw new Error("must reject before input read"); }, observe: async () => { throw new Error("must not acquire"); } }), /qualification/);
  });}
});
await test("each physical B, policy, packet and lock binding rejects drift before acquisition", async t => {
  for (const path of ["architecture/public-api/core.json", "architecture/public-api/assembly.json", "architecture/foundation/public-api-compatibility.yaml", `${inputDirectory}/request.json`, `${inputDirectory}/historical/tsconfig.base.json`, `${inputDirectory}/foundation-presets-1.7.4.tgz`, `${inputDirectory}/declaration-realization.json`, `${inputDirectory}/custody.json`]) {
    await t.test(path, async () => {
      let calls = 0;
      await assert.rejects(qualifyOrdinaryResult({ ...ordinary(), read: async p => p === path ? Buffer.from("changed") : read(p), observe: async () => { calls++; return publicResult; } }), /reviewed input differs/);
      assert.equal(calls, 0);
    });
  }
});
await test("historical staging retains exact presets and Core declarations without a runtime installation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gm-native-api-declarations-"));
  try {
    const requestPath = await acquireHistoricalData(directory);
    assert.equal(requestPath, join(directory, "inputs/request.json"));
    const historical = join(directory, "inputs/historical");
    const preset = record(record(JSON.parse((await read(`${inputDirectory}/declaration-realization.json`)).toString("utf8")))["foundationPresetArchive"]);
    for (const [member, hash] of Object.entries(record(preset["members"]))) {
      assert.equal(digest(await readFile(join(historical, "node_modules/@agent-teams/engineering-foundation", member))), hash);
    }
    assert.deepEqual(await readFile(join(historical, "node_modules/@get-modular/core/package.json")),
      await readFile(join(historical, "packages/core/package.json")));
    for (const absent of ["node_modules/@agent-teams/engineering-foundation/dist/cli.js", "node_modules/@microsoft/api-extractor/package.json",
      "node_modules/typescript/package.json", "node_modules/argparse/package.json", "node_modules/sprintf-js/package.json"]) {
      await assert.rejects(readFile(join(historical, absent)), /ENOENT/);
    }
    await assert.rejects(readFile(join(directory, "inputs/dependencies/package-lock.json")), /ENOENT/);
    assert.ok((await read(`${inputDirectory}/README.md`)).length > 0);
    await assert.rejects(readFile(join(directory, "inputs/README.md")), /ENOENT/,
      "unlisted source members must not enter the materialized namespace");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
await test("historical staging refuses an occupied symlink namespace before any outside write", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gm-native-api-occupied-"));
  try {
    const outside = join(directory, "outside"); await mkdir(outside);
    await symlink(outside, join(directory, "inputs"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(acquireHistoricalData(directory), /EEXIST/);
    assert.deepEqual(await readdir(outside), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
await test("real fixture file drift during observation fails with the original initial pins", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gm-native-api-drift-"));
  try {
    const snapshot = await snapshotPinnedInputs(read);
    for (const path of snapshot.keys()) { await mkdir(dirname(join(directory, path)), { recursive: true }); await cp(join(root, path), join(directory, path)); }
    const fixtureRead = (p: string) => readFile(join(directory, p));
    await assert.rejects(qualifyOrdinaryResult({ ...ordinary(), read: fixtureRead, observe: async () => {
      await writeFile(join(directory, "architecture/public-api/core.json"), "changed during observation"); return publicResult;
    } }), /input changed during qualification/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
await test("public output cannot turn writes, partial coverage or different review into qualification", () => {
  for (const field of ["migrationApplied", "reviewDigest", "observationDigest", "writes"]) {
    const output = record(JSON.parse(publicResult.stdout)); output[field] = field === "writes" ? ["write"] : "changed";
    assert.throws(() =>{  assertPublicQualification(publicResult, output, request); }, /qualification/);
  }
  assert.throws(() =>{  assertPublicQualification({ ...publicResult, exitCode: 1 }, JSON.parse(publicResult.stdout), request); }, /qualification/);
});
await test("exit2 and zero-exit violations cannot qualify", () => {
  const actual = ordinary();
  assert.throws(() => admitOrdinary({ ...actual.result, exitCode: 2 }, actual.report));
  assert.throws(() => admitOrdinary({ ...actual.result, exitCode: 0 }, actual.report));
});
await test("real failed subprocess preserves its raw stdout, stderr and numeric exit", async () => {
  const actual = await invoke(process.execPath, [join(root, "tests/fixtures/native-public-api-ordinary-failure.ts")], root);
  assert.deepEqual(actual, { stdout: "{\n  \"actual\": \"ordinary failure\"\n}\n", stderr: "actual child stderr\n", exitCode: 7 });
});
await test("report writes refuse overwrite and an outside symlink into the checkout", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gm-native-api-report-"));
  try {
    const report = join(directory, "report.json"); await writeReport(report, "first");
    await assert.rejects(writeReport(report, "second"), /EEXIST/); assert.equal(await readFile(report, "utf8"), "first");
    const link = join(directory, "checkout"); await symlink(root, link, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(writeReport(join(link, "native-report-must-not-exist", "report.json"), "blocked"), /outside the source checkout/);
    await assert.rejects(readFile(join(root, "native-report-must-not-exist", "report.json")), /ENOENT/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
await test("command exposes report paths only and refuses checkout destinations", () => {
  assert.deepEqual(parseReportArguments([]), {});
  assert.throws(() => parseReportArguments(["--consumer", "/tmp/other"]));
  assert.throws(() => parseReportArguments(["--ordinary-report", "/tmp/a", "--ordinary-report", "/tmp/b"]));
  assert.throws(() => reportDestination(root, join(root, "report.json")));
  const outside = join(tmpdir(), "gm-native-report.json");
  assert.equal(reportDestination(root, outside), outside);
});
