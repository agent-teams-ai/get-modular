import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { FileLeaf, JsonRecord } from "@agent-teams/release-checks";

export interface SourceFile { readonly leaf: FileLeaf; readonly contents: string }
export type SourceTree = Readonly<Record<string, SourceFile>>;
export interface EngineIdentity {
  readonly entrypoint: string;
  readonly installations: readonly string[];
  readonly digest: string;
  readonly version: "3.0.2";
}
export interface ExecutionCustody {
  readonly root: string;
  readonly gitDirectory: string;
  readonly source: string;
  readonly engine: EngineIdentity;
}

export function record(value: unknown): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "candidate.record");
  return value as Record<string, unknown>;
}
export function text(value: unknown): string {
  assert(typeof value === "string", "candidate.string");
  return value;
}
export function array(value: unknown): unknown[] {
  assert(Array.isArray(value), "candidate.array");
  return value;
}
export function semantic(value: SourceFile): JsonRecord {
  return record(JSON.parse(value.contents)) as JsonRecord;
}
export function hash(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {return value.map(canonical);}
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).toSorted(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}
export function identity(value: unknown): string { return hash(JSON.stringify(canonical(value))); }
export function execute(root: string, command: string, args: readonly string[]): string {
  return execFileSync(command, [...args], { cwd: root, encoding: "utf8", timeout: 120_000,
    maxBuffer: 32 * 1024 * 1024, env: { ...process.env, NODE_OPTIONS: "" } });
}
export function git(root: string, ...args: string[]): string {
  for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES"]) {
    assert.equal(process.env[name], undefined, `candidate.foreign-git-environment:${name}`);
  }
  return execute(root, "git", ["-c", "core.autocrlf=false", ...args]);
}
export function clean(root: string): void {
  assert.equal(git(root, "status", "--porcelain=v1", "--untracked-files=all"), "", "candidate.dirty-source");
}
function modeAt(root: string, path: string, revision?: string): string | undefined {
  const result = revision === undefined ? git(root, "ls-files", "--stage", "-z", "--", path)
    : git(root, "ls-tree", "-z", revision, "--", path);
  return result === "" ? undefined : result.slice(0, 6);
}
function sourceFile(bytes: Buffer, mode: string): SourceFile {
  assert(["100644", "100755", "120000"].includes(mode), "candidate.unsupported-file-type");
  const leaf: FileLeaf = mode === "120000" ? { type: "symlink", mode, digest: hash(bytes) }
    : { type: "file", mode: mode as "100644" | "100755", digest: hash(bytes) };
  return { leaf, contents: bytes.toString("utf8") };
}
export function historicalFile(root: string, revision: string, path: string): SourceFile | undefined {
  assert.match(revision, /^[a-f0-9]{40}$/u, "candidate.source-identity");
  const mode = modeAt(root, path, revision);
  if (mode === undefined) {return undefined;}
  const bytes = execFileSync("git", ["show", `${revision}:${path}`], { cwd: root, maxBuffer: 32 * 1024 * 1024 });
  return sourceFile(bytes, mode);
}
/** Includes ignored generation output too; installed package-manager trees have separate engine custody. */
export function snapshot(root: string): SourceTree {
  const tracked = git(root, "ls-files", "--stage", "-z").split("\0").filter(Boolean);
  const modes = new Map(tracked.map(line => {
    const separator = line.indexOf("\t");
    assert(separator > 0, "candidate.git-index");
    assert.equal(line.slice(separator - 1, separator), "0", "candidate.unmerged-index");
    return [line.slice(separator + 1), line.slice(0, 6)];
  }));
  const other = git(root, "ls-files", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean);
  const ignored = git(root, "ls-files", "--others", "--ignored", "--exclude-standard", "-z").split("\0")
    .filter(path => path !== "" && !path.split("/").some(segment => segment === "node_modules" || segment === ".pnpm-store"));
  const paths = [...new Set([...modes.keys(), ...other, ...ignored])].toSorted();
  const files: Record<string, SourceFile> = Object.create(null) as Record<string, SourceFile>;
  for (const path of paths) {
    const destination = join(root, path);
    let status;
    try { status = lstatSync(destination); }
    catch (error) { if (record(error)["code"] === "ENOENT") {continue;} throw error; }
    assert(status.isFile() || status.isSymbolicLink(), `candidate.unsupported-file-type:${path}`);
    const bytes = status.isSymbolicLink() ? Buffer.from(readlinkSync(destination)) : readFileSync(destination);
    const mode = status.isSymbolicLink() ? "120000" : process.platform === "win32" ? modes.get(path) ?? "100644"
      : (status.mode & 0o111) === 0 ? "100644" : "100755";
    files[path] = sourceFile(bytes, mode);
  }
  return files;
}
export function treeDigest(tree: SourceTree): string {
  return identity(Object.fromEntries(Object.entries(tree).map(([path, file]) => [path, file.leaf])));
}
function contained(parent: string, target: string): boolean {
  const path = relative(parent, target);
  return path === "" || !isAbsolute(path) && path !== ".." && !path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`);
}
function packageManifest(from: string, name: string): string {
  const require = createRequire(from);
  try { return realpathSync(require.resolve(`${name}/package.json`)); }
  catch {
    let directory = dirname(realpathSync(require.resolve(name)));
    while (dirname(directory) !== directory) {
      try {
        const path = join(directory, "package.json");
        if (record(JSON.parse(readFileSync(path, "utf8")))["name"] === name) {return path;}
      } catch (error) { if (record(error)["code"] !== "ENOENT") {throw error;} }
      directory = dirname(directory);
    }
    throw new Error(`candidate.unresolved-engine-package:${name}`);
  }
}
function installedFiles(root: string, prefix = ""): readonly [string, string][] {
  return readdirSync(join(root, prefix), { withFileTypes: true }).filter(entry => entry.name !== "node_modules")
    .toSorted((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0).flatMap(entry => {
      const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      assert(!entry.isSymbolicLink(), `candidate.engine-symlink:${path}`);
      if (entry.isDirectory()) {return installedFiles(root, path);}
      assert(entry.isFile(), "candidate.engine-file-type");
      return [[path, hash(readFileSync(join(root, path)))]] as [string, string][];
    });
}
/** Binds the resolved CLI and its installed runtime dependency closure, including formatter code. */
export function engineAt(root: string): EngineIdentity {
  const cliManifest = packageManifest(join(root, "package.json"), "@changesets/cli");
  const cli = record(JSON.parse(readFileSync(cliManifest, "utf8")));
  assert.equal(cli["version"], "3.0.2", "candidate.engine-version");
  const entrypoint = realpathSync(resolve(dirname(cliManifest), text(record(cli["bin"])["changeset"])));
  assert(contained(dirname(cliManifest), entrypoint), "candidate.foreign-engine-entrypoint");
  const pending = [cliManifest];
  const observed = new Map<string, unknown>();
  while (pending.length > 0) {
    const path = pending.shift(); assert(path !== undefined && path !== "");
    if (observed.has(path)) {continue;}
    const manifest = record(JSON.parse(readFileSync(path, "utf8")));
    const edges: Record<string, string> = {};
    const optional = record(manifest["optionalDependencies"] ?? {});
    const peers = record(manifest["peerDependenciesMeta"] ?? {});
    for (const name of Object.keys({ ...record(manifest["dependencies"] ?? {}), ...record(manifest["peerDependencies"] ?? {}), ...optional }).toSorted()) {
      let dependency;
      try { dependency = packageManifest(path, name); }
      catch (error) {
        if (name in optional || record(peers[name] ?? {})["optional"] === true) { edges[name] = "absent-optional"; continue; }
        throw error;
      }
      const target = record(JSON.parse(readFileSync(dependency, "utf8")));
      edges[name] = `${text(target["name"])}@${text(target["version"])}`;
      pending.push(dependency);
    }
    observed.set(path, { name: manifest["name"], version: manifest["version"], edges, files: installedFiles(dirname(path)) });
  }
  const content = [...observed.values()].toSorted((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0);
  return { version: "3.0.2", entrypoint, installations: [...observed.keys()].toSorted(), digest: identity(content) };
}
export function custody(root: string): ExecutionCustody {
  const actual = realpathSync(root);
  assert.equal(realpathSync(git(actual, "rev-parse", "--show-toplevel").trim()), actual, "candidate.foreign-root");
  const source = git(actual, "rev-parse", "HEAD").trim();
  assert.match(source, /^[a-f0-9]{40}$/u, "candidate.source-identity");
  return { root: actual, gitDirectory: realpathSync(git(actual, "rev-parse", "--absolute-git-dir").trim()), source, engine: engineAt(actual) };
}
export function assertCustody(expected: ExecutionCustody, observed: ExecutionCustody): void {
  assert.deepEqual(observed, expected, "candidate.execution-custody-drift");
}
