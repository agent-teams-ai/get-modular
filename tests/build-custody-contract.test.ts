import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { parse, stringify } from "yaml";

function record(value: unknown): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value));
  return Object.fromEntries(Object.entries(value));
}

function records(value: unknown): Record<string, unknown>[] {
  assert(Array.isArray(value));
  return value.map(record);
}

function strings(value: unknown): string[] {
  assert(Array.isArray(value) && value.every(item => typeof item === "string"));
  return value;
}

const repository = new URL("../", import.meta.url);
const witness = "tests/qualification/support/construction-witness.ts";
const projection = "packages/core/tests/qualification-support/support/construction-witness.ts";
const generator = "architecture/tooling/generate-core.ts";
const consumer = "packages/core/tests/qualification/construction-witness.test.ts";
const publicEntry = "packages/core/src/index.ts";
const production = "packages/core/src/features/canonicalization/owned-jcs/factory.ts";
const policyPath = "architecture/foundation/source-dependencies.yaml";

test("construction witness preserves package direction and remains forbidden in production", async t => {
  const directory = await mkdtemp(join(tmpdir(), "gm-witness-boundary-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const policy = record(parse(await readFile(new URL(policyPath, repository), "utf8")));
  const subjects = new Map<string, readonly string[]>([
    ["repository.development", [generator, witness]],
    ["core-development", [projection, consumer]],
    ["core-public-entrypoint", [publicEntry]],
    ["core-canonicalization-owned-jcs", [production]],
  ]);
  const boundaries = records(policy.boundaries)
    .filter(boundary => typeof boundary.id === "string" && subjects.has(boundary.id))
    .map(boundary => {
      assert.equal(typeof boundary.id, "string");
      const id = String(boundary.id);
      const paths = subjects.get(id);
      assert(paths);
      const allow = record(boundary.allow);
      // Preserve the actual entrypoint and dependency decisions. Only the
      // disposable fixture's physical source inventory is reduced.
      return {
        ...boundary,
        roots: paths,
        entrypoints: strings(boundary.entrypoints).filter(entry => paths.includes(entry)),
        allow: { ...allow, boundaries: strings(allow.boundaries).filter(target => subjects.has(target)) },
      };
    });
  assert.equal(boundaries.length, 4);
  const configuration = {
    ...policy, packageRoots: ["packages/core"], rootPackage: true,
    governedRoots: ["architecture/tooling", "packages/core/src", "packages/core/tests", "tests/qualification/support"], boundaries,
  };
  const consumerSource = 'import { proof } from "../qualification-support/support/construction-witness.ts"; export const checked = proof;\n';
  const productionSource = "export const factory = true;\n";
  const files = new Map([
    ["package.json", await readFile(new URL("package.json", repository), "utf8")],
    ["packages/core/package.json", await readFile(new URL("packages/core/package.json", repository), "utf8")],
    ["pnpm-workspace.yaml", 'packages:\n  - "packages/*"\n'],
    ["foundation.config.yaml", stringify({ schemaVersion: 1, project: { id: "witness-boundary" },
      capabilities: { "architecture.source-dependencies": { configPath: policyPath } } })],
    [policyPath, stringify(configuration)],
    [witness, "export const proof = true;\n"],
    [projection, "export const proof = true;\n"],
    // Keep the ordinary repository-to-Core package edge and both local witness
    // imports. A fixture containing only the reverse edge hid the package cycle
    // caused by Core's former direct import of the root witness.
    [generator, 'import { publicProbe } from "@get-modular/core";\n'
      + 'import { proof } from "../../tests/qualification/support/construction-witness.ts";\n'
      + 'export const built = proof && publicProbe;\n'],
    [publicEntry, "export const publicProbe = true;\n"],
    [consumer, consumerSource],
    [production, productionSource],
  ]);
  for (const [path, contents] of files) {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), contents);
  }
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve("@agent-teams/engineering-foundation/package.json");
  const manifest = record(JSON.parse(await readFile(manifestPath, "utf8")));
  const bin = record(manifest.bin)["agent-teams-foundation"];
  assert.equal(typeof bin, "string");
  const command = join(dirname(manifestPath), String(bin));
  const check = () => {
    const result = spawnSync(process.execPath, [command, "check", "architecture.source-dependencies",
      "--consumer", directory, "--format", "json"], { encoding: "utf8", timeout: 30_000, maxBuffer: 2_000_000 });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    return { status: result.status, report: record(JSON.parse(result.stdout)) };
  };
  const admitted = check();
  assert.equal(admitted.status, 0, JSON.stringify(admitted.report));
  assert.equal(admitted.report.outcome, "passed", JSON.stringify(admitted.report));
  const mutations: readonly (readonly [string, string, string, string])[] = [
    [production, 'import { proof } from "../../../../tests/qualification-support/support/construction-witness.ts"; export const factory = proof;\n',
      productionSource, "architecture.source-dependencies.runtime-boundary-imports-development-boundary"],
    [consumer, consumerSource + 'import { built } from "../../../../architecture/tooling/generate-core.ts"; export const cycle = built;\n',
      consumerSource, "architecture.source-dependencies.package-runtime-cycle"],
  ];
  for (const [path, changed, original, rule] of mutations) {
    await writeFile(join(directory, path), changed);
    const rejected = check();
    assert.notEqual(rejected.status, 0);
    assert.equal(rejected.report.outcome, "violations", JSON.stringify(rejected.report));
    const diagnostics = records(rejected.report.capabilities).flatMap(capability => records(capability.diagnostics));
    assert(diagnostics.some(diagnostic => diagnostic.ruleId === rule), JSON.stringify(rejected.report));
    await writeFile(join(directory, path), original);
  }
});

test("migrated build qualification tests retain strict checking and normal test selection", async () => {
  const project = record(JSON.parse(await readFile(new URL("tests/tsconfig.native-tooling.json", repository), "utf8")));
  const files = strings(project.files);
  const manifest = record(JSON.parse(await readFile(new URL("package.json", repository), "utf8")));
  const scripts = record(manifest.scripts);
  assert.equal(scripts["core:test"], 'node --test "packages/core/tests/**/*.test.mjs" "packages/core/tests/**/*.test.ts"');
  for (const path of [consumer, "packages/core/tests/qualification/production-generation.test.ts",
    "packages/core/tests/package/build-closure.test.ts"]) {
    assert(files.includes(`../${path}`), path);
    await readFile(new URL(path, repository));
  }
  assert(files.includes("qualification/support/construction-witness.ts"), witness);
  assert(files.includes(`../${projection}`), projection);
  const governance = scripts["governance:test"];
  assert.equal(typeof governance, "string");
  for (const name of ["generated-production-source.test.ts", "tracked-file-custody.test.ts",
    "build-custody-contract.test.ts", "construction-witness-projection.test.ts"]) {
    assert(files.includes(name), name);
    assert(String(governance).split(" ").includes(`tests/${name}`), name);
  }
});
