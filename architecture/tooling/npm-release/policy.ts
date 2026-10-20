import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { parse } from "yaml";

export const repository = "agent-teams-ai/get-modular";
export const packageIds = ["core", "assembly", "resources", "conformance", "observation"] as const;
export type PackageId = typeof packageIds[number];
export interface ReleasePackage {
  name: string;
  version: string;
  file: string;
  sha256: string;
  integrity: string;
}
export interface ReleaseManifest {
  schemaVersion: 1;
  repository: string;
  source: string;
  packages: ReleasePackage[];
}
export function record(value: unknown): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "release.object");
  return value as Record<string, unknown>;
}
export function text(value: unknown): string {
  assert(typeof value === "string", "release.string");
  return value;
}
export function list(value: unknown): unknown[] {
  assert(Array.isArray(value), "release.array");
  return value;
}
export function json(source: string): unknown { return JSON.parse(source); }
function exactKeys(value: Record<string, unknown>, keys: string[]): void {
  assert.deepEqual(Object.keys(value).sort(), keys.sort(), "release.unexpected-fields");
}
export function archiveHashes(bytes: Uint8Array): { sha256: string; integrity: string } {
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
  };
}
export function manifestFrom(value: unknown, source: string): ReleaseManifest {
  const manifest = record(value);
  exactKeys(manifest, ["schemaVersion", "repository", "source", "packages"]);
  assert.equal(manifest.schemaVersion, 1, "release.schema");
  assert.equal(manifest.repository, repository, "release.repository");
  assert.match(source, /^[a-f0-9]{40}$/u, "release.source");
  assert.equal(manifest.source, source, "release.source-mismatch");
  const packages = list(manifest.packages).map(item => {
    const entry = record(item);
    exactKeys(entry, ["name", "version", "file", "sha256", "integrity"]);
    const name = text(entry.name);
    const version = text(entry.version);
    const file = text(entry.file);
    const sha256 = text(entry.sha256);
    const integrity = text(entry.integrity);
    assert.match(version, /^\d+\.\d+\.\d+$/u, "release.stable-version");
    assert.equal(file, `${name.replace(/^@/u, "").replace("/", "-")}-${version}.tgz`, "release.filename");
    assert.match(sha256, /^[a-f0-9]{64}$/u, "release.sha256");
    assert.match(integrity, /^sha512-[A-Za-z0-9+/]{86}==$/u, "release.integrity");
    return { name, version, file, sha256, integrity };
  });
  assert.deepEqual(packages.map(item => item.name).sort(), packageIds.map(id => `@get-modular/${id}`).sort(), "release.public-package-set");
  assert.equal(new Set(packages.map(item => item.file)).size, packages.length, "release.duplicate-file");
  return { schemaVersion: 1, repository, source, packages };
}

function stableVersion(value: string): number[] {
  assert.match(value, /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u, "release.stable-version");
  const parts = value.split(".").map(Number);
  assert(parts.every(Number.isSafeInteger), "release.version-range");
  return parts;
}
export function requiresRelease(version: string, exact: string | undefined, latest: string | undefined): boolean {
  const current = stableVersion(version);
  if (exact !== undefined) assert.equal(exact, version, "release.registry-version-mismatch");
  if (latest !== undefined) {
    const published = stableVersion(latest);
    for (const [index, component] of published.entries()) {
      const target = current[index]; assert(target !== undefined);
      assert(component <= target, "release.version-regression");
      if (component < target) break;
    }
  }
  return exact === undefined || latest !== version;
}

// Expand the actual closed include matrices, rather than assuming a job count.
export function expectedCiJobNames(workflowSource: string): string[] {
  const workflow = record(parse(workflowSource));
  assert.equal(workflow.name, "CI", "release.ci-name");
  const names: string[] = [];
  for (const [id, unknownJob] of Object.entries(record(workflow.jobs))) {
    const job = record(unknownJob);
    const name = text(job.name ?? id);
    if (!job.strategy) { names.push(name); continue; }
    const matrix = record(record(job.strategy).matrix);
    exactKeys(matrix, ["include"]);
    for (const rowValue of list(matrix.include)) {
      const row = record(rowValue);
      const expanded = name.replace(/\$\{\{\s*matrix\.([a-zA-Z0-9_]+)\s*\}\}/gu,
        (_match: string, key: string) => text(row[key]));
      assert(!expanded.includes("${{"), "release.ci-expression");
      names.push(expanded);
    }
  }
  assert(names.length > 0 && new Set(names).size === names.length, "release.ci-unique-jobs");
  return names.sort();
}
export function assertQualifiedCi(runValue: unknown, jobsValue: unknown[], expected: string[], source: string): void {
  const run = record(runValue);
  assert.equal(run.head_sha, source, "release.ci-source");
  assert.equal(run.head_branch, "main", "release.ci-branch");
  assert.equal(run.path, ".github/workflows/ci.yml", "release.ci-workflow");
  assert(["push", "workflow_dispatch"].includes(text(run.event)), "release.ci-event");
  assert.equal(record(run.repository).full_name, repository, "release.ci-repository");
  assert.equal(record(run.head_repository).full_name, repository, "release.ci-head-repository");
  assert.equal(run.status, "completed", "release.ci-incomplete");
  assert.equal(run.conclusion, "success", "release.ci-failed");
  const jobs = jobsValue.map(record);
  assert.deepEqual(jobs.map(job => text(job.name)).sort(), expected, "release.ci-incomplete-roster");
  for (const job of jobs) {
    assert.equal(job.head_sha, source, "release.ci-job-source");
    assert.equal(job.status, "completed", "release.ci-job-incomplete");
    assert.equal(job.conclusion, "success", "release.ci-job-not-successful");
  }
}


export const retainedSource = "2cd561688bb223f944425718cc093e55ff4bc20d";
export const retainedBuildPaths = [
  ".node-version", ".npmrc", "LICENSE", "tsconfig.base.json", "pnpm-lock.yaml", "pnpm-workspace.yaml",
  "architecture/tooling/build-core.mjs", "architecture/tooling/generate-core.mjs",
  "architecture/tooling/build-assembly.mjs", "architecture/tooling/build-leaf-package.mjs",
  "architecture/checks/leaf-packages.mjs", "tests/qualification/support/construction-witness.mjs",
] as const;
export function releaseBuildPolicy(value: unknown): Record<string, unknown> {
  const manifest = record(value);
  const scripts = record(manifest.scripts);
  return { packageManager: manifest.packageManager, engines: manifest.engines, devDependencies: manifest.devDependencies,
    scripts: Object.fromEntries(["core:build", "assembly:build", "resources:build", "conformance:build", "observation:build"].map(name => [name, scripts[name]])) };
}
export function assertRetainedBuildInputs(current: Record<string, string>, qualified: Record<string, string>, currentPolicy: unknown, qualifiedPolicy: unknown): void {
  exactKeys(current, [...retainedBuildPaths]);
  exactKeys(qualified, [...retainedBuildPaths]);
  assert.deepEqual(current, qualified, "release.retained-build-input-drift");
  assert.deepEqual(releaseBuildPolicy(currentPolicy), releaseBuildPolicy(qualifiedPolicy), "release.retained-build-policy-drift");
}

export interface RetainedPackage extends ReleasePackage { tree: string }
const retained: RetainedPackage[] = [
  { name: "@get-modular/core", version: "0.6.0", tree: "07c13c9fdd7b69282f5b46aabc7c7f410894c70b", file: "get-modular-core-0.6.0.tgz", sha256: "a1a64aeaadf5ae0f9143cf26038853cf42d90b060e083f5ff2f4acf7e2e8d1b0", integrity: "sha512-s7HmZAkQtioOAbUxBbeVgLCpmplDB7J36GdugMU0XkGWOEmNvUeSaLhKZWJ0uB49QDqCPPiXjcDf6EGlSFSXDA==" },
  { name: "@get-modular/assembly", version: "0.6.0", tree: "cd42707e48907a231c46895d247d243579dbc3f6", file: "get-modular-assembly-0.6.0.tgz", sha256: "3330afe53ab9615a1dc81273cf9c45b8b9fb68b1d95571af060971e58a9be606", integrity: "sha512-y7H5RQpwQnKPXoqj/SnUIiOnWMbg/CI4USIUIlL+arkl3+eJncDyLUSikBG0k85vNuv9QuKt3XztpUJK1GvF9Q==" },
  { name: "@get-modular/resources", version: "0.2.0", tree: "44aab0974d2f88e30d362f609a5095bd4bbc78bb", file: "get-modular-resources-0.2.0.tgz", sha256: "2d1aaab67b0002a426fda69b01bda9f7697662ea9685a990b33a12d18658f46b", integrity: "sha512-G8PYU8o/DJTFBQcs9N12CgwxC9PJ+gOqFjariwYCbw+w7vGE+11lU2JiX2QrHBog6VpchKIenIinb7mBJtu/4g==" },
  { name: "@get-modular/conformance", version: "0.4.0", tree: "8edceba6669c4202bdb796f7c77bc26c9d20201b", file: "get-modular-conformance-0.4.0.tgz", sha256: "2182cf9702879b2ab78928646db59d91d8a7b128ee870c4b0a2283f51e0d352a", integrity: "sha512-Ienld3tq0+XASpCGnd3fwvZbNxLTrViYspGzYGyu9mJAKnvBQLLoopyj2uumDeo4SJVzTI8Sl2oSFotr+BDslg==" },
  { name: "@get-modular/observation", version: "0.1.0", tree: "2c5f9124db7d5f3874994a06d5d9aa883a987c42", file: "get-modular-observation-0.1.0.tgz", sha256: "083bed3ca61e586d6ce91c272be4b4d07c3c68ae00aa9b414febee20e60f1915", integrity: "sha512-df9ki8A5Yi8rKR3SCpNeFwpnXLzSzEeawld8J24IYmxy98xVVr8a7xJCDyV37PBuOJJ10JltyVpmRJDJVsZhyg==" },
];
export function retainedPackage(name: string, version: string, tree: string): RetainedPackage | undefined {
  const entry = retained.find(item => item.name === name && item.version === version);
  if (entry) assert.equal(tree, entry.tree, "release.retained-source-drift: bump the version for changed package source");
  return entry;
}
export function assertArchive(entry: ReleasePackage, bytes: Uint8Array): void {
  assert.deepEqual(archiveHashes(bytes), { sha256: entry.sha256, integrity: entry.integrity }, "release.archive-mismatch");
}
export function assertRegistryReceipt(value: unknown, manifest: ReleaseManifest, runId: string): void {
  const receipt = record(value);
  exactKeys(receipt, ["schemaVersion", "repository", "source", "runId", "candidateTag", "packages", "complete"]);
  assert.equal(receipt.complete, true, "release.receipt-incomplete");
  assert.equal(receipt.runId, runId, "release.receipt-run");
  assert.equal(receipt.candidateTag, `candidate-run-${runId}`, "release.candidate-tag");
  assert.deepEqual(manifestFrom({ schemaVersion: receipt.schemaVersion, repository: receipt.repository,
    source: receipt.source, packages: receipt.packages }, manifest.source), manifest, "release.receipt-manifest");
}
