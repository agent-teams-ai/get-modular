import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const NON_PORTABLE_PATH_CHARACTERS = /[<>:"|?*\u0000-\u001f]/u;
const SAFE_RELATIVE_PATH = /^(?![\\/])(?!.*(?:^|[\\/])\.\.(?:[\\/]|$))[^\\]+$/u;
const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.[^/]*)?$/iu;
const GIT_OBJECT_ID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const REGULAR_FILE_MODE = /^(?:100644|100755)$/u;
const SYMBOLIC_LINK_MODE = "120000";
const MAX_GIT_OUTPUT_BYTES = 16 * 1024 * 1024;
const INDEX_SNAPSHOT_VERSION = 1;
const EMPTY_BLOB_OIDS = new Set([
  "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
  "473a0f4c3be8a93681a267e3b1e9a7dcda1185436fe141f7749120a303721813",
]);

// Git must observe only the repository below repositoryRoot: no GIT_DIR,
// GIT_WORK_TREE, GIT_INDEX_FILE, replace refs, or user/system configuration.
function hermeticGitEnvironment() {
  const environment = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith("GIT_")) environment[name] = value;
  }
  // Git special-cases the literal "/dev/null" on every platform, including Windows.
  environment.GIT_CONFIG_GLOBAL = "/dev/null";
  environment.GIT_CONFIG_SYSTEM = "/dev/null";
  environment.GIT_CONFIG_NOSYSTEM = "1";
  environment.LC_ALL = "C";
  return environment;
}

function safeRepositoryPath(value) {
  return typeof value === "string"
    && SAFE_RELATIVE_PATH.test(value)
    && !/^[A-Za-z]:[\\/]/u.test(value)
    && !NON_PORTABLE_PATH_CHARACTERS.test(value)
    && value.split("/").every(segment => segment !== ""
      && segment !== "."
      && segment !== ".."
      && !/[. ]$/u.test(segment)
      && !WINDOWS_DEVICE_NAME.test(segment));
}

async function inspectWorkingTreePath(relativePath, repositoryRoot) {
  if (!safeRepositoryPath(relativePath)) return { kind: "unsafe" };
  const parts = relativePath.split("/");
  let current = repositoryRoot;
  let status;
  for (const [index, part] of parts.entries()) {
    current = resolve(current, part);
    try {
      status = await lstat(current);
    } catch (error) {
      if (["ENOENT", "ENOTDIR"].includes(error?.code)) return { kind: "missing" };
      throw error;
    }
    if (status.isSymbolicLink()) return { kind: "symlink" };
    if (index < parts.length - 1 && !status.isDirectory()) {
      return { kind: "non-regular" };
    }
  }
  if (!status?.isFile()) return { kind: "non-regular" };

  const repositoryRealPath = await realpath(repositoryRoot);
  const fileRealPath = await realpath(current);
  if (fileRealPath !== repositoryRealPath
    && !fileRealPath.startsWith(`${repositoryRealPath}${sep}`)) {
    return { kind: "outside" };
  }
  return { kind: "regular", path: current };
}

async function readWorkingTreeRegularFile(relativePath, repositoryRoot) {
  const before = await inspectWorkingTreePath(relativePath, repositoryRoot);
  if (before.kind !== "regular") return before;

  let handle;
  try {
    handle = await open(before.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const status = await handle.stat();
    if (!status.isFile()) return { kind: "non-regular" };
    const bytes = await handle.readFile();
    const after = await inspectWorkingTreePath(relativePath, repositoryRoot);
    if (after.kind !== "regular") return after;
    return { kind: "regular", bytes };
  } catch (error) {
    if (["ELOOP", "ENOENT", "ENOTDIR"].includes(error?.code)) {
      return { kind: error.code === "ELOOP" ? "symlink" : "missing" };
    }
    throw error;
  } finally {
    await handle?.close();
  }
}

async function runGit(repositoryRoot, args) {
  return execFileAsync("git", ["--no-replace-objects", "--literal-pathspecs", ...args], {
    cwd: repositoryRoot,
    encoding: null,
    env: hermeticGitEnvironment(),
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  });
}

async function assertRepositoryToplevel(repositoryRoot) {
  const { stdout } = await runGit(repositoryRoot, ["rev-parse", "--show-toplevel"]);
  const toplevel = await realpath(stdout.toString("utf8").replace(/\r?\n$/u, ""));
  if (toplevel !== await realpath(repositoryRoot)) {
    throw new Error(
      `TRACKED_FILE_CUSTODY_FAILED: Git top level ${toplevel} is not the repository root ${repositoryRoot}`,
    );
  }
}

async function exactIndexEntry(relativePath, repositoryRoot) {
  try {
    const snapshot = await captureGitIndexSnapshot(repositoryRoot);
    return snapshot.entries.get(relativePath) ?? { kind: "untracked" };
  } catch {
    return { kind: "invalid-index-entry" };
  }
}

function parseStagedIndexEntries(output) {
  if (!Buffer.isBuffer(output)) throw new TypeError("Git index snapshot must be bytes");
  const entries = new Map();
  let offset = 0;
  while (offset < output.length) {
    const terminator = output.indexOf(0, offset);
    if (terminator < 0) throw new Error("invalid unterminated Git index snapshot");
    const record = output.subarray(offset, terminator);
    const tab = record.indexOf(0x09);
    if (tab < 0) throw new Error("invalid Git index snapshot entry");
    const match = /^(\S+) (\S+) (\S+)$/u.exec(record.subarray(0, tab).toString("ascii"));
    if (!match) throw new Error("invalid Git index snapshot header");
    const pathBytes = record.subarray(tab + 1);
    const path = pathBytes.toString("utf8");
    if (!Buffer.from(path, "utf8").equals(pathBytes) || !safeRepositoryPath(path)) {
      throw new Error("Git index snapshot contains an unsafe or non-UTF-8 path");
    }
    const [, mode, oid, stage] = match;
    offset = terminator + 1;
    if (!GIT_OBJECT_ID.test(oid) || !/^[0-3]$/u.test(stage)) {
      throw new Error("invalid Git index snapshot identity");
    }
    if (entries.has(path)) throw new Error("duplicate path in Git index snapshot");
    entries.set(path, { mode, oid, stage });
  }
  return entries;
}

function parseMaterializedTree(output) {
  if (!Buffer.isBuffer(output)) throw new TypeError("Git tree listing must be bytes");
  const entries = new Map();
  let offset = 0;
  while (offset < output.length) {
    const terminator = output.indexOf(0, offset);
    if (terminator < 0) throw new Error("invalid unterminated Git tree listing");
    const record = output.subarray(offset, terminator);
    offset = terminator + 1;
    const tab = record.indexOf(0x09);
    if (tab < 0) throw new Error("invalid Git tree listing entry");
    const match = /^(\S+) (\S+) (\S+)$/u.exec(record.subarray(0, tab).toString("ascii"));
    if (!match) throw new Error("invalid Git tree listing header");
    const pathBytes = record.subarray(tab + 1);
    const path = pathBytes.toString("utf8");
    if (!Buffer.from(path, "utf8").equals(pathBytes) || !safeRepositoryPath(path)) {
      throw new Error("Git tree listing contains an unsafe or non-UTF-8 path");
    }
    const [, mode, type, oid] = match;
    if (!/^[0-7]{6}$/u.test(mode) || !GIT_OBJECT_ID.test(oid) || entries.has(path)) {
      throw new Error("invalid or duplicate Git tree identity");
    }
    entries.set(path, { mode, type, oid });
  }
  return entries;
}

function parseRawIndexDiff(output) {
  if (!Buffer.isBuffer(output)) throw new TypeError("Git index diff must be bytes");
  const entries = new Map();
  let offset = 0;
  while (offset < output.length) {
    const headerEnd = output.indexOf(0, offset);
    if (headerEnd < 0) throw new Error("invalid unterminated Git index diff header");
    const header = output.subarray(offset, headerEnd).toString("ascii");
    const match = /^:(\S+) (\S+) (\S+) (\S+) ([A-Z])$/u.exec(header);
    if (!match) throw new Error("invalid Git index diff header");
    const pathEnd = output.indexOf(0, headerEnd + 1);
    if (pathEnd < 0) throw new Error("invalid unterminated Git index diff path");
    const pathBytes = output.subarray(headerEnd + 1, pathEnd);
    const path = pathBytes.toString("utf8");
    if (!Buffer.from(path, "utf8").equals(pathBytes) || !safeRepositoryPath(path)) {
      throw new Error("Git index diff contains an unsafe or non-UTF-8 path");
    }
    const [, oldMode, newMode, oldOid, newOid, status] = match;
    if (!/^[0-7]{6}$/u.test(oldMode) || !/^[0-7]{6}$/u.test(newMode)
      || !GIT_OBJECT_ID.test(oldOid) || !GIT_OBJECT_ID.test(newOid)
      || entries.has(path)) {
      throw new Error("invalid or duplicate Git index diff identity");
    }
    entries.set(path, { oldMode, newMode, oldOid, newOid, status });
    offset = pathEnd + 1;
  }
  return entries;
}

function materializeIndexEntries(stagedEntries, headEntries, diffEntries) {
  const entries = new Map();
  const unmatchedDiffPaths = new Set(diffEntries.keys());
  for (const [path, entry] of stagedEntries) {
    if (entry.stage !== "0") throw new Error("Git index snapshot contains an unmerged entry");
    if (!REGULAR_FILE_MODE.test(entry.mode) && entry.mode !== SYMBOLIC_LINK_MODE) {
      throw new Error("Git index snapshot contains an unsupported file mode");
    }
    const headEntry = headEntries.get(path);
    const diffEntry = diffEntries.get(path);
    const matchesHead = headEntry?.type === "blob"
      && headEntry.mode === entry.mode
      && headEntry.oid === entry.oid;
    const matchesDiff = diffEntry?.status !== "D"
      && diffEntry?.newMode === entry.mode
      && diffEntry?.newOid === entry.oid;
    if (!matchesHead && !matchesDiff) {
      if (!REGULAR_FILE_MODE.test(entry.mode) || !EMPTY_BLOB_OIDS.has(entry.oid)) {
        throw new Error("Git index snapshot differs from its HEAD and materialized diff");
      }
      entries.set(path, { kind: "intent-to-add", ...entry });
      continue;
    }
    if (diffEntry) unmatchedDiffPaths.delete(path);
    entries.set(path, {
      kind: entry.mode === SYMBOLIC_LINK_MODE ? "symlink" : "regular",
      ...entry,
    });
  }
  for (const path of unmatchedDiffPaths) {
    if (diffEntries.get(path)?.status !== "D") {
      throw new Error("Git index snapshot omits materialized diff paths");
    }
  }
  return entries;
}

function parseTreeOid(output) {
  const oid = output.toString("ascii").replace(/\r?\n$/u, "");
  if (!GIT_OBJECT_ID.test(oid)) throw new Error("invalid materialized Git tree identity");
  return oid;
}

function parseNulPaths(output) {
  if (!Buffer.isBuffer(output)) throw new TypeError("Git path listing must be bytes");
  if (output.length === 0) return [];
  if (output.at(-1) !== 0) throw new Error("invalid unterminated Git path listing");
  const paths = [];
  let offset = 0;
  while (offset < output.length) {
    const terminator = output.indexOf(0, offset);
    const pathBytes = output.subarray(offset, terminator);
    offset = terminator + 1;
    const path = pathBytes.toString("utf8");
    if (!Buffer.from(path, "utf8").equals(pathBytes) || !safeRepositoryPath(path)) {
      throw new Error("Git path listing contains an unsafe or non-UTF-8 path");
    }
    paths.push(path);
  }
  return paths;
}

export async function captureGitIndexSnapshot(repositoryRoot) {
  await assertRepositoryToplevel(repositoryRoot);
  let headTreeOid = null;
  let headTreeBytes = Buffer.alloc(0);
  try {
    const { stdout } = await runGit(repositoryRoot, [
      "rev-parse", "--verify", "--quiet", "HEAD^{tree}",
    ]);
    headTreeOid = parseTreeOid(stdout);
    ({ stdout: headTreeBytes } = await runGit(repositoryRoot, [
      "ls-tree", "--full-tree", "-r", "-z", headTreeOid,
    ]));
  } catch (error) {
    if (error?.code !== 1) throw error;
  }
  const { stdout: stagedBytes } = await runGit(repositoryRoot, ["ls-files", "--stage", "-z"]);
  const { stdout: diffBytes } = await runGit(repositoryRoot, [
    "diff", "--cached", "--raw", "--no-abbrev", "--no-renames",
    "--ita-invisible-in-index", "-z",
  ]);
  return Object.freeze({
    version: INDEX_SNAPSHOT_VERSION,
    repositoryRoot,
    headTreeOid,
    entries: materializeIndexEntries(
      parseStagedIndexEntries(stagedBytes),
      parseMaterializedTree(headTreeBytes),
      parseRawIndexDiff(diffBytes),
    ),
  });
}

export function indexSnapshotPaths(snapshot) {
  if (snapshot?.version !== INDEX_SNAPSHOT_VERSION || !(snapshot.entries instanceof Map)) {
    throw new TypeError("invalid Git index snapshot");
  }
  return [...snapshot.entries.keys()];
}

export function indexSnapshotSymlinkPaths(snapshot) {
  return indexSnapshotPaths(snapshot)
    .filter(path => snapshot.entries.get(path)?.kind === "symlink");
}

export async function assertGitIndexSnapshotCurrent(snapshot) {
  const expectedPaths = indexSnapshotPaths(snapshot);
  const current = await captureGitIndexSnapshot(snapshot.repositoryRoot);
  const currentPaths = indexSnapshotPaths(current);
  if (snapshot.headTreeOid !== current.headTreeOid || expectedPaths.length !== currentPaths.length) {
    throw new Error("TRACKED_FILE_CUSTODY_FAILED: Git index changed after snapshot");
  }
  for (const path of expectedPaths) {
    const expected = snapshot.entries.get(path);
    const observed = current.entries.get(path);
    if (expected?.kind !== observed?.kind
      || expected?.mode !== observed?.mode
      || expected?.oid !== observed?.oid
      || expected?.stage !== observed?.stage) {
      throw new Error("TRACKED_FILE_CUSTODY_FAILED: Git index changed after snapshot");
    }
  }
}

export async function untrackedPathsInScope(snapshot, pathspecs) {
  const { stdout } = await runGit(snapshot.repositoryRoot, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
    "--",
    ...pathspecs,
  ]);
  return parseNulPaths(stdout);
}

export async function inspectIndexSnapshotFile(
  snapshot,
  relativePath,
  { afterIndexLookup } = {},
) {
  if (!safeRepositoryPath(relativePath)) return { kind: "unsafe" };
  const indexEntry = snapshot?.entries?.get(relativePath);
  if (!indexEntry) {
    const workingTree = await readWorkingTreeRegularFile(relativePath, snapshot.repositoryRoot);
    return workingTree.kind === "regular" ? { kind: "untracked" } : workingTree;
  }
  if (indexEntry.kind !== "regular") return { kind: indexEntry.kind };
  const workingTree = await readWorkingTreeRegularFile(relativePath, snapshot.repositoryRoot);
  if (workingTree.kind !== "regular") return workingTree;
  const { stdout: bytes } = await runGit(snapshot.repositoryRoot, [
    "cat-file",
    "blob",
    indexEntry.oid,
  ]);
  if (!workingTree.bytes.equals(bytes)) return { kind: "working-tree-diverged" };
  await afterIndexLookup?.({ oid: indexEntry.oid, path: relativePath });
  return {
    kind: "regular",
    tracked: true,
    oid: indexEntry.oid,
    bytes,
  };
}

export async function readIndexSnapshotFile(snapshot, relativePath, label, options) {
  const file = await inspectIndexSnapshotFile(snapshot, relativePath, options);
  if (file.kind !== "regular" || file.tracked !== true) {
    throw new Error(
      `TRACKED_FILE_CUSTODY_FAILED: ${label} must be a regular file from the captured Git index `
      + `whose working-tree bytes match that snapshot and whose path has no symbolic link: `
      + `${relativePath} (${file.kind})`,
    );
  }
  return file.bytes;
}

export async function historicalFileVersions(relativePath, repositoryRoot) {
  if (!safeRepositoryPath(relativePath)) throw new TypeError("unsafe historical file path");
  const { stdout: shallowBytes } = await runGit(repositoryRoot, [
    "rev-parse",
    "--is-shallow-repository",
  ]);
  if (shallowBytes.toString("utf8").trim() !== "false") {
    throw new Error("historical custody requires a complete non-shallow Git history");
  }
  await assertRepositoryToplevel(repositoryRoot);
  try {
    await runGit(repositoryRoot, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  } catch {
    throw new Error("historical custody requires a committed HEAD; an unborn branch has no history");
  }
  const { stdout: logBytes } = await runGit(repositoryRoot, [
    "log",
    "--full-history",
    "-z",
    "--format=%H",
    "HEAD",
    "--",
    relativePath,
  ]);
  const commits = parseNulPaths(logBytes).filter(commit => GIT_OBJECT_ID.test(commit));
  if (commits.length === 0) {
    throw new Error(`historical custody file has no committed history: ${relativePath}`);
  }
  const oids = [];
  for (const commit of commits) {
    const { stdout: entryBytes } = await runGit(repositoryRoot, [
      "ls-tree",
      "-z",
      commit,
      "--",
      relativePath,
    ]);
    if (entryBytes.length === 0) continue;
    if (entryBytes.at(-1) !== 0 || entryBytes.indexOf(0) !== entryBytes.length - 1) {
      throw new Error(`historical custody file is not regular at ${commit}: ${relativePath}`);
    }
    const record = entryBytes.subarray(0, -1);
    const tab = record.indexOf(0x09);
    const header = tab < 0 ? "" : record.subarray(0, tab).toString("ascii");
    const match = /^(\S+) (\S+) (\S+)$/u.exec(header);
    const pathBytes = tab < 0 ? Buffer.alloc(0) : record.subarray(tab + 1);
    if (!match
      || !REGULAR_FILE_MODE.test(match[1])
      || match[2] !== "blob"
      || !GIT_OBJECT_ID.test(match[3])
      || !pathBytes.equals(Buffer.from(relativePath, "utf8"))) {
      throw new Error(`historical custody file is not regular at ${commit}: ${relativePath}`);
    }
    oids.push(match[3]);
  }
  return readBlobBatch(repositoryRoot, oids);
}

// One cat-file process for every historical blob; the stream is
// "<oid> blob <size>\n<bytes>\n" per requested object.
async function readBlobBatch(repositoryRoot, oids) {
  if (oids.length === 0) return [];
  const child = execFile("git", [
    "--no-replace-objects", "cat-file", "--batch=%(objectname) %(objecttype) %(objectsize)",
  ], {
    cwd: repositoryRoot,
    encoding: "buffer",
    env: hermeticGitEnvironment(),
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  });
  const finished = new Promise((resolveOutput, reject) => {
    const chunks = [];
    child.stdout.on("data", chunk => chunks.push(chunk));
    child.on("error", reject);
    child.on("close", code => {
      if (code !== 0) reject(new Error(`git cat-file --batch exited with ${code}`));
      else resolveOutput(Buffer.concat(chunks));
    });
  });
  child.stdin.end(`${oids.join("\n")}\n`);
  const output = await finished;
  const versions = [];
  let offset = 0;
  for (const oid of oids) {
    const newline = output.indexOf(0x0a, offset);
    if (newline < 0) throw new Error("invalid git cat-file batch stream");
    const header = /^(\S+) (\S+) ([0-9]+)$/u.exec(output.subarray(offset, newline).toString("ascii"));
    if (!header || header[1] !== oid || header[2] !== "blob") {
      throw new Error(`historical custody blob ${oid} is missing or not a blob`);
    }
    const size = Number(header[3]);
    const start = newline + 1;
    versions.push(output.subarray(start, start + size));
    offset = start + size + 1;
  }
  return versions;
}

// Navigation reads intentionally observe the working tree so local edits are visible.
// They prove only that the path is a tracked, in-repository regular file.
export async function inspectTrackedWorkingTreeRegularFile(relativePath, repositoryRoot) {
  const workingTree = await readWorkingTreeRegularFile(relativePath, repositoryRoot);
  if (workingTree.kind !== "regular") return workingTree;
  const indexEntry = await exactIndexEntry(relativePath, repositoryRoot);
  if (indexEntry.kind !== "regular") return { kind: indexEntry.kind };
  return {
    kind: "regular",
    tracked: true,
    bytes: workingTree.bytes,
  };
}

export async function readTrackedWorkingTreeRegularFile(relativePath, repositoryRoot, label) {
  const file = await inspectTrackedWorkingTreeRegularFile(relativePath, repositoryRoot);
  if (file.kind !== "regular" || file.tracked !== true) {
    throw new Error(
      `TRACKED_FILE_CUSTODY_FAILED: ${label} must be a regular tracked file `
      + `with no symbolic-link path: ${relativePath} (${file.kind})`,
    );
  }
  return file.bytes;
}

// Accepted authority reads use the exact blob named by the index, never pathname bytes.
// The callback is a narrow test seam for deterministic replacement-race regression evidence.
export async function inspectAcceptedAuthorityFile(
  relativePath,
  repositoryRoot,
  { afterIndexLookup } = {},
) {
  const workingTree = await readWorkingTreeRegularFile(relativePath, repositoryRoot);
  if (workingTree.kind !== "regular") return workingTree;
  const indexEntry = await exactIndexEntry(relativePath, repositoryRoot);
  if (indexEntry.kind !== "regular") return { kind: indexEntry.kind };
  const { stdout: bytes } = await runGit(repositoryRoot, ["cat-file", "blob", indexEntry.oid]);
  if (!workingTree.bytes.equals(bytes)) return { kind: "working-tree-diverged" };
  await afterIndexLookup?.({ oid: indexEntry.oid, path: relativePath });
  return {
    kind: "regular",
    tracked: true,
    oid: indexEntry.oid,
    bytes,
  };
}

export async function readAcceptedAuthorityFile(relativePath, repositoryRoot, label, options) {
  const file = await inspectAcceptedAuthorityFile(relativePath, repositoryRoot, options);
  if (file.kind !== "regular" || file.tracked !== true) {
    throw new Error(
      `TRACKED_FILE_CUSTODY_FAILED: ${label} must be a regular tracked index file `
      + `whose working-tree bytes match the index and whose path has no symbolic link: `
      + `${relativePath} (${file.kind})`,
    );
  }
  return file.bytes;
}
