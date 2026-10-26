import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
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
const receiptDirectory = ".agent-teams-local/foundation-operation-lock.completed-evidence";
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
/** Exact Repository Mutation 0.4.2 successful-release evidence, never candidate content. */
export function assertPromotionReceipt(path: string, contents: string, pid: number): string {
  assert(Buffer.byteLength(contents, "utf8") <= 8192, "candidate.producer-receipt-size");
  assert(new RegExp(`^${receiptDirectory.replaceAll(".", "\\.")}/released\\.${uuid}/evidence$`, "u").test(path),
    "candidate.producer-receipt-path");
  const row = record(JSON.parse(contents));
  assert.equal(row["host"], hostname(), "candidate.producer-receipt-host");
  assert.equal(row["pid"], pid, "candidate.producer-receipt-process");
  assert(Number.isSafeInteger(pid) && pid > 0, "candidate.producer-receipt-process");
  assert(typeof row["token"] === "string" && new RegExp(`^${uuid}$`, "u").test(row["token"]),
    "candidate.producer-receipt-token");
  // The installed writer emits this exact closed JSON shape/order. Byte equality
  // also rejects duplicate keys, BOMs, trailing data and noncanonical encodings.
  assert.equal(contents, JSON.stringify({ host: hostname(), kind: "active", pid, schemaVersion: 1, token: row["token"] }) + "\n",
    "candidate.producer-receipt-shape");
  return row["token"];
}
function archivePromotionReceipts(work: string, temporary: string, before: SourceTree, after: SourceTree, pid: number): readonly string[] {
  assert(!Object.keys(before).some(path => path.startsWith(".agent-teams-local/")), "candidate.producer-receipt-preimage");
  const paths = Object.keys(after).filter(path => path.startsWith(".agent-teams-local/")).toSorted();
  assert.equal(paths.length, 2, "candidate.producer-receipt-count");
  const tokens = new Set<string>(); const receipts: { path: string; contents: string; digest: string }[] = [];
  assert.deepEqual(readdirSync(join(work, ".agent-teams-local")), ["foundation-operation-lock.completed-evidence"],
    "candidate.producer-receipt-state");
  assert.deepEqual(readdirSync(join(work, receiptDirectory)).toSorted(), paths.map(path => path.split("/")[2]),
    "candidate.producer-receipt-census");
  for (const path of paths) {
    const file = after[path]!;
    assert.deepEqual([file.leaf.type, file.leaf.mode], ["file", "100644"], "candidate.producer-receipt-file");
    for (const directory of [".agent-teams-local", receiptDirectory, dirname(path)]) {
      assert(lstatSync(join(work, directory)).isDirectory(), "candidate.producer-receipt-directory");
    }
    assert.deepEqual(readdirSync(join(work, dirname(path))), ["evidence"], "candidate.producer-receipt-census");
    const physical = join(work, path); const previous = lstatSync(physical, { bigint: true });
    assert(previous.isFile() && previous.size <= 8192n, "candidate.producer-receipt-file");
    const bytes = readFileSync(physical); const current = lstatSync(physical, { bigint: true });
    for (const field of ["dev", "ino", "mode", "nlink", "size", "mtimeNs", "ctimeNs", "birthtimeNs"] as const) {
      assert.equal(current[field], previous[field], "candidate.producer-receipt-drift");
    }
    assert.equal(hash(bytes), file.leaf.digest, "candidate.producer-receipt-drift");
    const contents = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    const token = assertPromotionReceipt(path, contents, pid);
    assert(!tokens.has(token), "candidate.producer-receipt-duplicate"); tokens.add(token);
    receipts.push({ path, contents, digest: hash(bytes) });
  }
  const delta = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(path => identity(before[path]?.leaf ?? null) !== identity(after[path]?.leaf ?? null)).toSorted();
  assert.deepEqual(delta, [...baselinePaths, ...paths].toSorted(), "candidate.producer-extra-output");
  // Observe and retain the complete private delta before archiving the closed
  // auxiliary set. No source ignore, general cleanup or caller write is involved.
  console.log(JSON.stringify({ phase: "public-promotion-execution-evidence", root: realpathSync(work), pid, delta, receipts }));
  renameSync(join(work, ".agent-teams-local"), join(temporary, "execution-evidence"));
  return paths;
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
    assert(!existsSync(join(work, ".agent-teams-local")), "candidate.producer-receipt-preimage");
    const invocation = spawnSync(process.execPath, [producer.entrypoint, "public-api-promote-release", "--consumer", work, "--json"],
      { cwd: work, encoding: "utf8", timeout: 120_000, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, NODE_OPTIONS: "",
        // The public CLI starts its own workers; it is not the parent test runner's child.
        NODE_TEST_CONTEXT: process.env["NODE_TEST_CONTEXT"] === "child-v8" ? undefined : process.env["NODE_TEST_CONTEXT"] } });
    assert.ifError(invocation.error);
    assert.equal(invocation.status, 0, `candidate.public-producer-failed:${invocation.stderr}`);
    assertBuildTools(prepared, work);
    const observed = snapshot(work);
    archivePromotionReceipts(work, temporary, built, observed, invocation.pid);
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
