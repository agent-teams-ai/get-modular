import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import { assertCompilerFloor, assertFoundationCompilerFloor, CompilerFloorError } from "../../architecture/checks/compiler-floor.ts";
import { isDirectExecution } from "../../architecture/checks/node-version.mjs";
import { resolveNpmCli } from "./support/npm-cli.mjs";

const execute = promisify(execFile);
const workspace = resolve(import.meta.dirname, "../..");
const PACKAGE = "@agent-teams/engineering-foundation";
const registry = "https://registry.npmjs.org/";
const retained = Object.freeze([
  { version: "1.5.1", integrity: "sha512-29r5QUvMIFdvsPaJ5m0Yx1Uo6bL85J/teP1p1ThNg7jMEz54cVxyrEnsLx/DN5cc/2CAzq2i8iLnPKgZN1cT8A==",
    tarballSha256: "bd0c476d2940168ac1b020f42726107cce81580b7b1b014e74aceabbafa9e951", publishedAt: "2026-09-22T08:23:18.839Z" },
  { version: "1.7.4", integrity: "sha512-BU9SqHvrPYtizl0u1J1UwGl89GmfHsKrwvExY7v8bpa2AD0C9YS71qDHIxcZU1zfzzORGk1SjJwNrPXR5MmZRA==" },
]);
interface RegistryPin {
  readonly version: string;
  readonly integrity: string;
  readonly tarballSha256?: string;
  readonly publishedAt?: string;
}
interface PackedCandidate extends RegistryPin { readonly archivePath: string; readonly tarballSha256: string }
interface Packument {
  readonly time: Readonly<Record<string, string>>;
  readonly versions: Readonly<Record<string, { readonly dist: { readonly tarball: string; readonly integrity: string; readonly shasum: string } }>>;
}
interface RegistryTools {
  readonly npm: string;
  readonly metadata: Packument;
  readonly environment: NodeJS.ProcessEnv;
}
function record(value: unknown): Record<string, unknown> {
  assert.ok(typeof value === "object" && value !== null && !Array.isArray(value));
  return value as Record<string, unknown>;
}
async function json(path: string) { return record(JSON.parse(await readFile(path, "utf8"))); }
function sha256(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }
function integrity(bytes: Uint8Array) { return `sha512-${createHash("sha512").update(bytes).digest("base64")}`; }
function tarballUrl(version: string) { return `${registry}${PACKAGE}/-/engineering-foundation-${version}.tgz`; }

async function install(root: string, npm: string, subject: string, environment: NodeJS.ProcessEnv, purpose: "archive-custody" | "current-public-import" = "current-public-import") {
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "gm-sdk-registry-qualification", private: true, type: "module" }));
  const budgetMs = process.platform === "win32" ? 300_000 : 120_000;
  const started = performance.now();
  let outcome = "failed";
  console.log(JSON.stringify({ phase: "foundation-registry-install", subject, purpose, event: "start", budgetMs, elapsedMs: 0 }));
  try {
    // Historical installs retain the original data-only ignore-scripts route;
    // 1.5.1's Node 24 engine promise is not requalified by this custody check.
    await execute(process.execPath, [npm, "install", "--ignore-scripts", "--package-lock=true",
      ...(purpose === "current-public-import" ? ["--engine-strict"] : []), "--no-audit", "--no-fund",
      `--registry=${registry}`, subject], { cwd: root, timeout: budgetMs, maxBuffer: 8_000_000, env: environment });
    outcome = "completed";
  } finally {
    console.log(JSON.stringify({ phase: "foundation-registry-install", subject, purpose, event: "final", budgetMs,
      elapsedMs: Math.max(0, Math.floor(performance.now() - started)), outcome }));
  }
}

async function registrySubject(root: string, pin: RegistryPin, tools: RegistryTools,
  purpose: "archive-custody" | "current-public-import" = "current-public-import") {
  const { npm, metadata, environment } = tools;
  const published = metadata.versions[pin.version];
  assert.ok(published, `Missing exact registry version ${pin.version}`);
  assert.equal(published.dist.integrity, pin.integrity);
  assert.equal(published.dist.tarball, tarballUrl(pin.version));
  assert.equal(typeof metadata.time[pin.version], "string");
  if (pin.publishedAt !== undefined) { assert.equal(metadata.time[pin.version], pin.publishedAt); }
  await install(root, npm, `${PACKAGE}@${pin.version}`, environment, purpose);
  const manifest = await json(join(root, "node_modules", PACKAGE, "package.json"));
  assert.equal(manifest.name, PACKAGE);
  assert.equal(manifest.version, pin.version);
  const locked = record(record((await json(join(root, "package-lock.json"))).packages)[`node_modules/${PACKAGE}`]);
  assert.equal(locked.version, pin.version);
  assert.equal(locked.integrity, pin.integrity);
  assert.equal(locked.resolved, tarballUrl(pin.version));
  await execute(process.execPath, [npm, "pack", `${PACKAGE}@${pin.version}`, "--ignore-scripts", "--pack-destination", root,
    `--registry=${registry}`], { cwd: root, timeout: 120_000, maxBuffer: 8_000_000, env: environment });
  const archives = (await readdir(root)).filter(name => name.endsWith(".tgz"));
  assert.equal(archives.length, 1);
  const bytes = await readFile(join(root, archives[0]!));
  assert.equal(integrity(bytes), pin.integrity);
  assert.equal(createHash("sha1").update(bytes).digest("hex"), published.dist.shasum);
  if (pin.tarballSha256 !== undefined) { assert.equal(sha256(bytes), pin.tarballSha256); }
  return { version: pin.version, integrity: pin.integrity, tarballUrl: tarballUrl(pin.version),
    tarballSha256: sha256(bytes), publishedAt: metadata.time[pin.version] };
}

export function assertRetainedFloorRefusal(root: string) {
  let diagnostic: unknown;
  assert.throws(() => assertFoundationCompilerFloor(root), (error: unknown) => {
    assert.ok(error instanceof CompilerFloorError);
    const observed = record(error.diagnostic);
    assert.equal(observed.code, "TYPESCRIPT_COMPILER_FLOOR_BLOCKED");
    assert.equal(observed.reason, "compiler-below-floor");
    assert.ok(observed.role === "foundation.compiler" || observed.role === "foundation.api-extractor.compiler");
    assert.equal(observed.observedVersion, "5.9.3");
    diagnostic = observed;
    return true;
  });
  return diagnostic;
}

export async function importCurrentPublicSdk(root: string) {
  const floor = assertFoundationCompilerFloor(root);
  // Copy maintained, strictly checked source. The child repeats its own metadata
  // guard before dynamically evaluating the WHOLE declared public entrypoint.
  for (const path of ["tests/qualification/sdk-growth-public-import.ts", "architecture/checks/compiler-floor.ts", "architecture/checks/node-version.mjs"]) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await cp(join(workspace, path), join(root, path));
  }
  const result = await execute(process.execPath, [join(root, "tests/qualification/sdk-growth-public-import.ts")],
    { cwd: root, timeout: 30_000, maxBuffer: 1_000_000 });
  const receipt: unknown = JSON.parse(result.stdout);
  assert.deepEqual(receipt, { outcome: "passed", publicEntry: `${PACKAGE}/sdk-growth-authority`, imports: 1,
    extractorVersion: floor.extractorVersion });
  return receipt;
}

async function currentPin(): Promise<RegistryPin> {
  const { parse } = await import("yaml");
  const profile = record(parse(await readFile(join(workspace, "architecture/sdk-growth/profile.yaml"), "utf8")));
  const foundation = record(profile.foundation);
  assert.equal(foundation.package, PACKAGE);
  assert.equal(typeof foundation.version, "string");
  assert.equal(typeof foundation.integrity, "string");
  const version = foundation.version as string;
  const sri = foundation.integrity as string;
  assert.match(version, /^\d+\.\d+\.\d+$/u);
  assert.match(sri, /^sha512-[A-Za-z0-9+/]{86}==$/u);
  assert.equal(record((await json(join(workspace, "package.json"))).devDependencies)[PACKAGE], version);
  return { version, integrity: sri };
}

async function candidateInput(path: string): Promise<PackedCandidate> {
  const value = await json(path);
  assert.deepEqual(Object.keys(value).toSorted(), ["archivePath", "integrity", "tarballSha256", "version"]);
  for (const key of ["archivePath", "integrity", "tarballSha256", "version"]) { assert.equal(typeof value[key], "string"); }
  assert.match(value.version as string, /^\d+\.\d+\.\d+$/u);
  assert.match(value.tarballSha256 as string, /^[a-f0-9]{64}$/u);
  assert.match(value.integrity as string, /^sha512-[A-Za-z0-9+/]{86}==$/u);
  return { version: value.version as string, integrity: value.integrity as string,
    tarballSha256: value.tarballSha256 as string, archivePath: resolve(dirname(path), value.archivePath as string) };
}

export async function qualifyRegistrySdkConsumer(candidate?: PackedCandidate) {
  if (candidate === undefined) { assertCompilerFloor(workspace); }
  const npm = await resolveNpmCli();
  const temporary = await mkdtemp(join(tmpdir(), "gm-sdk-registry-"));
  const environment = { ...process.env, npm_config_cache: join(temporary, "npm-cache"), npm_config_update_notifier: "false" };
  try {
    const response = await fetch(`${registry}@agent-teams%2fengineering-foundation`);
    assert.equal(response.ok, true, `Registry metadata returned ${response.status}`);
    const metadata = await response.json() as Packument;
    const tools = { npm, metadata, environment };
    for (const pin of retained) {
      const root = join(temporary, pin.version);
      const custody = await registrySubject(root, pin, tools, "archive-custody");
      const diagnostic = assertRetainedFloorRefusal(root);
      console.log(JSON.stringify({ status: "passed", kind: "historical-foundation-registry", package: PACKAGE, ...custody,
        outcome: "supported-floor-refusal", imports: 0, historicalPositiveReexecuted: false, diagnostic }));
    }
    const root = join(temporary, "current");
    let custody;
    if (candidate === undefined) {
      const pin = await currentPin();
      custody = await registrySubject(root, pin, tools);
    } else {
      const bytes = await readFile(candidate.archivePath);
      assert.equal(sha256(bytes), candidate.tarballSha256);
      assert.equal(integrity(bytes), candidate.integrity);
      await install(root, npm, candidate.archivePath, environment);
      const manifest = await json(join(root, "node_modules", PACKAGE, "package.json"));
      assert.equal(manifest.name, PACKAGE);
      assert.equal(manifest.version, candidate.version);
      custody = { version: candidate.version, integrity: candidate.integrity, tarballSha256: candidate.tarballSha256 };
    }
    const manifest = await json(join(root, "node_modules", PACKAGE, "package.json"));
    assert.equal(typeof record(manifest.bin)["agent-teams-node-test"], "string");
    const publicImport = await importCurrentPublicSdk(root);
    console.log(JSON.stringify({ status: "passed", kind: candidate === undefined ? "current-foundation-registry" : "isolated-native-packed-candidate",
      package: PACKAGE, ...custody, publicImport, authority: "unverified", activation: "hold", releaseEligible: false,
      productionAdoption: false, finalRegistryQualification: candidate === undefined }));
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

if (isDirectExecution(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.ok(args.length === 0 || args.length === 2 && args[0] === "--candidate", "Expected no arguments, or --candidate <exact-input.json> for isolated development only");
  await qualifyRegistrySdkConsumer(args.length === 0 ? undefined : await candidateInput(resolve(args[1]!)));
}
