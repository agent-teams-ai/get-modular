import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync, statSync } from "node:fs";
import { createRequire, findPackageJSON } from "node:module";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { FileLeaf, JsonRecord } from "@agent-teams/release-checks";

export interface SourceFile { readonly leaf: FileLeaf; readonly contents: string }
export type SourceTree = Readonly<Record<string, SourceFile>>;
export interface EngineIdentity {
  readonly entrypoint: string;
  readonly installations: readonly string[];
  readonly resolutions: readonly { readonly from: string; readonly dependencies: Readonly<Record<string, string>> }[];
  readonly digest: string;
  readonly version: "3.0.2";
}
export type FoundationIdentity = Omit<EngineIdentity, "version"> & { readonly version: "3.0.0" };
export interface DirectoryIdentity { readonly device: string; readonly inode: string }
export interface ExecutionCustody {
  readonly root: string;
  readonly gitDirectory: string;
  readonly rootIdentity: DirectoryIdentity;
  readonly gitDirectoryIdentity: DirectoryIdentity;
  readonly source: string;
  readonly engine: EngineIdentity;
  readonly producer: FoundationIdentity | null;
  readonly buildTools: readonly Omit<EngineIdentity, "version">[];
  readonly runtime: { readonly kind: "node"; readonly version: string; readonly executable: string };
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
/** Complete immutable commit membership, reusing the existing byte/type/mode reader. */
export function historicalSnapshot(root: string, revision: string): SourceTree {
  assert.match(revision, /^[a-f0-9]{40}$/u, "candidate.source-identity");
  const files: Record<string, SourceFile> = Object.create(null) as Record<string, SourceFile>;
  const entries = git(root, "ls-tree", "-r", "-z", revision).split("\0").filter(Boolean).map(row => {
    const match = /^([0-7]{6}) blob ([a-f0-9]{40})\t([\s\S]+)$/u.exec(row);
    assert(match, "candidate.historical-tree-entry");
    return { mode: match[1]!, oid: match[2]!, path: match[3]! };
  });
  if (entries.length === 0) {return files;}
  // One exact Git batch preserves binary payloads and object order. No checkout,
  // path decoding, per-file subprocess or candidate-provided bytes are involved.
  const bytes = execFileSync("git", ["cat-file", "--batch"], { cwd: root,
    input: entries.map(entry => entry.oid).join("\n") + "\n", maxBuffer: 256 * 1024 * 1024 });
  return decodeHistoricalBatch(entries, bytes);
}
export function decodeHistoricalBatch(entries: readonly { readonly mode: string; readonly oid: string; readonly path: string }[], bytes: Buffer): SourceTree {
  const files: Record<string, SourceFile> = Object.create(null) as Record<string, SourceFile>;
  let offset = 0;
  for (const entry of entries) {
    const newline = bytes.indexOf(10, offset); assert(newline >= offset, "candidate.historical-batch-header");
    const header = /^([a-f0-9]{40}) blob ([0-9]+)$/u.exec(bytes.subarray(offset, newline).toString("ascii"));
    assert(header && header[1] === entry.oid, "candidate.historical-batch-object");
    const size = Number(header[2]); offset = newline + 1;
    assert(Number.isSafeInteger(size) && size >= 0 && size <= bytes.length - offset - 1,
      "candidate.historical-batch-size");
    const end = offset + size; assert.equal(bytes[end], 10, "candidate.historical-batch-framing");
    files[entry.path] = sourceFile(bytes.subarray(offset, end), entry.mode);
    offset = end + 1;
  }
  assert.equal(offset, bytes.length, "candidate.historical-batch-trailing-data");
  return files;
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
    // The Node public resolver handles import-only packages whose exports hide
    // package.json and have no require condition (for example node-or-bun).
    const path = findPackageJSON(name, pathToFileURL(from));
    assert(path !== undefined, `candidate.unresolved-engine-package:${name}`);
    const actual = realpathSync(path);
    assert.equal(record(JSON.parse(readFileSync(actual, "utf8")))["name"], name, "candidate.engine-package-identity");
    return actual;
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
function installedToolAt(root: string, name: string, version: string, bin?: string): Omit<EngineIdentity, "version"> {
  const cliManifest = packageManifest(join(root, "package.json"), name);
  const cli = record(JSON.parse(readFileSync(cliManifest, "utf8")));
  assert.equal(cli["version"], version, "candidate.engine-version");
  const entrypoint = bin === undefined ? cliManifest : realpathSync(resolve(dirname(cliManifest), text(record(cli["bin"])[bin])));
  assert(contained(dirname(cliManifest), entrypoint), "candidate.foreign-engine-entrypoint");
  const pending = [cliManifest];
  const observed = new Map<string, unknown>();
  const files = new Map<string, ReturnType<typeof installedFiles>>();
  const resolutions = new Map<string, Record<string, string>>();
  const packageFiles = (path: string): ReturnType<typeof installedFiles> => {
    let value = files.get(path);
    if (value === undefined) {value = installedFiles(dirname(path)); files.set(path, value);}
    return value;
  };
  while (pending.length > 0) {
    const path = pending.shift(); assert(path !== undefined && path !== "");
    if (observed.has(path)) {continue;}
    const manifest = record(JSON.parse(readFileSync(path, "utf8")));
    const edges: Record<string, string> = {};
    const resolved: Record<string, string> = {};
    const optional = record(manifest["optionalDependencies"] ?? {});
    const peers = record(manifest["peerDependenciesMeta"] ?? {});
    for (const name of Object.keys({ ...record(manifest["dependencies"] ?? {}), ...record(manifest["peerDependencies"] ?? {}), ...optional }).toSorted()) {
      let dependency;
      try { dependency = packageManifest(path, name); }
      catch (error) {
        if (name in optional || record(peers[name] ?? {})["optional"] === true) { edges[name] = "absent-optional"; resolved[name] = "absent-optional"; continue; }
        throw error;
      }
      const target = record(JSON.parse(readFileSync(dependency, "utf8")));
      edges[name] = `${text(target["name"])}@${text(target["version"])}:${identity(packageFiles(dependency))}`;
      resolved[name] = dependency;
      pending.push(dependency);
    }
    resolutions.set(path, resolved);
    observed.set(path, { name: manifest["name"], version: manifest["version"], edges, files: packageFiles(path) });
  }
  const content = [...observed.values()].toSorted((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0);
  return { entrypoint, installations: [...observed.keys()].toSorted(),
    resolutions: [...resolutions.entries()].toSorted(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([from, dependencies]) => ({ from, dependencies })), digest: identity(content) };
}
export function engineAt(root: string): EngineIdentity {
  return { ...installedToolAt(root, "@changesets/cli", "3.0.2", "changeset"), version: "3.0.2" };
}
export function foundationAt(root: string): FoundationIdentity {
  return { ...installedToolAt(root, "@agent-teams/engineering-foundation", "3.0.0", "agent-teams-foundation"), version: "3.0.0" };
}
/** Version generation uses the unchanged-source pnpm installation route, never a manager projection. */
export function assertNodeQualification(root: string): void {
  assert(!("bun" in process.versions), "candidate.node-runtime-required");
  const manifest = record(JSON.parse(readFileSync(join(root, "package.json"), "utf8")));
  assert.equal(manifest["packageManager"], "bun@1.4.3", "candidate.qualification-source-manager");
  assert(existsSync(join(root, "node_modules/.pnpm")) && !existsSync(join(root, "node_modules/.bun"))
    && !existsSync(join(root, ".get-modular-node-profile.json")), "candidate.node-qualification-install-required");
}
function directoryIdentity(path: string): DirectoryIdentity {
  const status = statSync(path, { bigint: true });
  assert(status.isDirectory() && status.ino !== 0n, "candidate.directory-identity-unavailable");
  return { device: status.dev.toString(), inode: status.ino.toString() };
}
export function custody(root: string): ExecutionCustody {
  assert(!("bun" in process.versions), "candidate.node-runtime-required");
  const actual = realpathSync(root);
  // Git can expand a Windows short directory alias that Node preserves.
  // Bind physical objects without weakening case-sensitive filesystem checks.
  const rootIdentity = directoryIdentity(actual);
  assert.deepEqual(directoryIdentity(realpathSync(git(actual, "rev-parse", "--show-toplevel").trim())),
    rootIdentity, "candidate.foreign-root");
  const source = git(actual, "rev-parse", "HEAD").trim();
  assert.match(source, /^[a-f0-9]{40}$/u, "candidate.source-identity");
  const producer = existsSync(join(actual, "architecture/foundation/public-api-compatibility.yaml")) ? foundationAt(actual) : null;
  const gitDirectory = realpathSync(git(actual, "rev-parse", "--absolute-git-dir").trim());
  return { root: actual, gitDirectory, rootIdentity, gitDirectoryIdentity: directoryIdentity(gitDirectory), source, engine: engineAt(actual),
    producer, buildTools: producer === null ? [] : [installedToolAt(actual, "typescript", "7.0.2", "tsc"), installedToolAt(actual, "canonicalize", "4.0.0")],
    runtime: { kind: "node", version: process.versions.node, executable: realpathSync(process.execPath) } };
}
export function assertCustody(expected: ExecutionCustody, observed: ExecutionCustody): void {
  assert.deepEqual(observed, expected, "candidate.execution-custody-drift");
}
