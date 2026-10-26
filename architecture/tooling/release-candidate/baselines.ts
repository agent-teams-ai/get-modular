import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parse } from "yaml";
import type { ExpectedInputs } from "@agent-teams/release-checks";
import { ASSEMBLY_PAIR_DECISIONS } from "../../checks/assembly-admission.mjs";
import type { PreparedRelease } from "./host.ts";
import { assertCustody, custody, execute, git, hash, identity, record, snapshot, treeDigest, type SourceTree } from "./io.ts";

export const baselinePaths = ["architecture/public-api/core.json", "architecture/public-api/assembly.json"] as const;
const configPath = "architecture/foundation/public-api-compatibility.yaml";
const metadataAuthority = ASSEMBLY_PAIR_DECISIONS["0.7.1"];
export const metadataDecision = metadataAuthority.path;
// Full accepted bytes, not a permission inferred from a version or a filename.
export const metadataDecisionDigest = metadataAuthority.bytesDigest;
export function plannedBaselines(tree: SourceTree, plan: ExpectedInputs["plan"]): readonly string[] {
  if (tree[configPath] === undefined) {return [];}
  const pair = plan.releases.filter(item => ["@get-modular/core", "@get-modular/assembly"].includes(item.packageName)
    && item.oldVersion !== item.newVersion);
  if (pair.length === 0) {return [];}
  assert.equal(hash(tree[metadataDecision]?.contents ?? ""), metadataDecisionDigest, "candidate.metadata-release-authority");
  const registry = record(JSON.parse(tree["architecture/decisions/accepted-decisions.json"]?.contents ?? "{}"));
  assert(Array.isArray(registry["decisions"]), "candidate.metadata-release-registry");
  assert.deepEqual(registry["decisions"].filter(value => {
    const row = record(value); return row["id"] === metadataAuthority.entry.id || row["path"] === metadataDecision;
  }), [metadataAuthority.entry], "candidate.metadata-release-registry");
  for (const [name, version] of [["resources", "0.2.1"], ["observation", "0.2.0"]]) {
    assert.equal(record(JSON.parse(tree[`packages/${name}/package.json`]?.contents ?? "{}"))["version"], version,
      "candidate.metadata-release-unchanged-leaves");
  }
  const rows = plan.releases.filter(item => item.oldVersion !== item.newVersion)
    .map(item => [item.packageName, item.oldVersion, item.newVersion, item.type]).toSorted();
  assert.deepEqual(rows, [["@get-modular/assembly", "0.7.0", "0.7.1", "patch"],
    ["@get-modular/conformance", "0.5.0", "0.5.1", "patch"], ["@get-modular/core", "0.7.0", "0.7.1", "patch"]],
  "candidate.metadata-release-cohort");
  const policy = record(parse(tree[configPath].contents));
  assert(Array.isArray(policy["packages"]), "candidate.public-baseline-policy");
  assert.deepEqual(policy["packages"].map(value => {
    const row = record(value); return [row["packageName"], row["releasedBaselinePath"]];
  }), [["@get-modular/core", baselinePaths[0]], ["@get-modular/assembly", baselinePaths[1]]], "candidate.public-baseline-policy");
  return baselinePaths;
}
export function assertMetadataBaseline(path: string, before: SourceTree, after: SourceTree): void {
  const old = before[path]; const current = after[path]; assert(old && current, "candidate.baseline-missing");
  assert.deepEqual([old.leaf.type, old.leaf.mode, current.leaf.type, current.leaf.mode], ["file", "100644", "file", "100644"], "candidate.baseline-file");
  const previous = record(JSON.parse(old.contents)); const promoted = record(JSON.parse(current.contents));
  assert.equal(previous["packageVersion"], "0.7.0", "candidate.baseline-preimage-version");
  assert.equal(promoted["packageVersion"], "0.7.1", "candidate.baseline-release-version");
  assert.deepEqual({ ...promoted, packageVersion: previous["packageVersion"] }, previous, "candidate.baseline-api-changed");
}
function assertBuildTools(prepared: PreparedRelease, work: string): void {
  const observed = custody(work);
  assert.deepEqual(observed.engine, prepared.execution.engine, "candidate.promotion-engine-drift");
  assert.deepEqual(observed.producer, prepared.execution.producer, "candidate.promotion-producer-drift");
  assert.deepEqual(observed.buildTools, prepared.execution.buildTools, "candidate.promotion-build-tool-drift");
}
function linkInstall(source: string, target: string): void {
  mkdirSync(join(target, "node_modules"));
  for (const entry of readdirSync(join(source, "node_modules"))) {
    if (entry === "@get-modular" || !statSync(join(source, "node_modules", entry)).isDirectory()) {continue;}
    symlinkSync(resolve(source, "node_modules", entry), join(target, "node_modules", entry), process.platform === "win32" ? "junction" : "dir");
  }
  mkdirSync(join(target, "node_modules/@get-modular"));
  const observed: { name: string; version: unknown; path: string }[] = [];
  for (const name of ["core", "assembly", "conformance", "resources", "observation", "lifecycle-kernel"]) {
    const owned = resolve(target, "packages", name);
    const alias = join(target, "node_modules/@get-modular", name);
    symlinkSync(owned, alias, process.platform === "win32" ? "junction" : "dir");
    assert.equal(realpathSync(alias), realpathSync(owned), "candidate.promotion-workspace-alias");
    const manifest = record(JSON.parse(readFileSync(join(alias, "package.json"), "utf8")));
    if (name === "core" || name === "assembly") {assert.equal(manifest["version"], "0.7.1", "candidate.promotion-workspace-version");}
    observed.push({ name, version: manifest["version"], path: realpathSync(alias) });
  }
  console.log(JSON.stringify({ phase: "public-promotion-workspace", packages: observed }));
}
export function assertPromotionBranch(root: string): void {
  assert.equal(git(root, "branch", "--show-current").trim(), "changeset-release/main", "candidate.promotion-branch");
}
/** Owns a disposable trusted branch; never mutates caller refs or copies build output. */
export function produceBaselines(prepared: PreparedRelease, candidate: SourceTree, paths: readonly string[]): void {
  if (paths.length === 0) {return;}
  assert(prepared.hasRelease && prepared.execution.producer, "candidate.public-producer-required");
  assert.deepEqual(paths, baselinePaths, "candidate.public-baseline-paths");
  const caller = prepared.execution.root; const producer = prepared.execution.producer;
  assertCustody(prepared.execution, custody(caller));
  const temporary = mkdtempSync(join(tmpdir(), "get-modular-public-promotion-TEST-"));
  const store = join(temporary, "repository.git"); const work = join(temporary, "source");
  try {
    git(caller, "clone", "--quiet", "--bare", "--shared", "--no-hardlinks", caller, store);
    git(store, "update-ref", "refs/heads/changeset-release/main", prepared.execution.source);
    git(store, "-c", "core.autocrlf=false", "worktree", "add", work, "changeset-release/main");
    assertPromotionBranch(work);
    for (const path of new Set([...Object.keys(prepared.before), ...Object.keys(candidate)])) {
      if (identity(prepared.before[path]?.leaf ?? null) === identity(candidate[path]?.leaf ?? null)) {continue;}
      const file = candidate[path];
      if (file === undefined) {rmSync(join(work, path)); continue;}
      assert(file.leaf.type === "file" && file.leaf.mode === "100644", "candidate.promotion-input-file");
      mkdirSync(dirname(join(work, path)), { recursive: true }); writeFileSync(join(work, path), file.contents);
    }
    linkInstall(caller, work);
    assert.equal(treeDigest(snapshot(work)), treeDigest(candidate), "candidate.promotion-input-drift");
    assertBuildTools(prepared, work);
    execute(work, process.execPath, ["architecture/tooling/build-core.mjs"]);
    execute(work, process.execPath, ["architecture/tooling/build-assembly.mjs"]);
    assertBuildTools(prepared, work);
    const built = snapshot(work);
    for (const [path, file] of Object.entries(candidate)) {assert.deepEqual(built[path], file, "candidate.build-source-drift");}
    assertCustody(prepared.execution, custody(caller));
    execute(work, process.execPath, [producer.entrypoint, "public-api-promote-release", "--consumer", work, "--json"]);
    assertBuildTools(prepared, work);
    const promoted = snapshot(work);
    const changed = [...new Set([...Object.keys(built), ...Object.keys(promoted)])]
      .filter(path => identity(built[path]?.leaf ?? null) !== identity(promoted[path]?.leaf ?? null)).toSorted();
    assert.deepEqual(changed, [...paths].toSorted(), "candidate.producer-extra-output");
    for (const path of paths) {assertMetadataBaseline(path, prepared.before, promoted);}
    assertCustody(prepared.execution, custody(caller));
    assert.equal(treeDigest(snapshot(caller)), treeDigest(candidate), "candidate.promotion-caller-drift");
    // Re-observe every source and baseline preimage before the first caller write.
    for (const path of paths) {assert.deepEqual(candidate[path], prepared.before[path], "candidate.baseline-preimage-drift");}
    for (const path of paths) {writeFileSync(join(caller, path), promoted[path]!.contents);}
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
