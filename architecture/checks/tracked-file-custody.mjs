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
const MAX_GIT_OUTPUT_BYTES = 16 * 1024 * 1024;
const INDEX_SNAPSHOT_VERSION = 1;

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
  return execFileAsync("git", args, {
    cwd: repositoryRoot,
    encoding: null,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  });
}

function parseExactIndexEntry(output, relativePath) {
  if (!Buffer.isBuffer(output) || output.length === 0) {
    return { kind: "invalid-index-entry" };
  }
  const terminator = output.indexOf(0);
  if (terminator < 0 || output.indexOf(0, terminator + 1) >= 0) {
    return { kind: "invalid-index-entry" };
  }
  const record = output.subarray(0, terminator);
  const debug = output.subarray(terminator + 1).toString("ascii");
  const flagsMatch = /\n  size: [0-9]+\tflags: ([a-f0-9]+)\n$/u.exec(debug);
  if (!flagsMatch) return { kind: "invalid-index-entry" };
  const tab = record.indexOf(0x09);
  if (tab < 0) return { kind: "invalid-index-entry" };
  const header = record.subarray(0, tab).toString("ascii");
  const match = /^(\S+) (\S+) (\S+)$/u.exec(header);
  if (!match) return { kind: "invalid-index-entry" };
  const [, mode, oid, stage] = match;
  if (!record.subarray(tab + 1).equals(Buffer.from(relativePath, "utf8"))) {
    return { kind: "invalid-index-entry" };
  }
  if (!GIT_OBJECT_ID.test(oid)) return { kind: "invalid-index-entry" };
  const flags = Number.parseInt(flagsMatch[1], 16);
  if (/^0+$/u.test(oid) || (flags & 0x20000000) !== 0) {
    return { kind: "intent-to-add" };
  }
  if (stage !== "0" || !REGULAR_FILE_MODE.test(mode)) {
    return { kind: "non-regular" };
  }
  return { kind: "regular", mode, oid };
}

async function exactIndexEntry(relativePath, repositoryRoot) {
  let output;
  try {
    ({ stdout: output } = await runGit(repositoryRoot, [
      "--literal-pathspecs",
      "ls-files",
      "--error-unmatch",
      "--stage",
      "--debug",
      "-z",
      "--",
      relativePath,
    ]));
  } catch (error) {
    if (error?.code === 1) return { kind: "untracked" };
    throw error;
  }
  return parseExactIndexEntry(output, relativePath);
}

function parseIndexSnapshot(output) {
  if (!Buffer.isBuffer(output)) throw new TypeError("Git index snapshot must be bytes");
  const entries = new Map();
  let offset = 0;
  while (offset < output.length) {
    const terminator = output.indexOf(0, offset);
    if (terminator < 0) throw new Error("invalid unterminated Git index snapshot");
    const record = output.subarray(offset, terminator);
    offset = terminator + 1;
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
    let entry;
    if (!GIT_OBJECT_ID.test(oid)) {
      entry = { kind: "invalid-index-entry" };
    } else if (/^0+$/u.test(oid)) {
      entry = { kind: "intent-to-add" };
    } else if (stage !== "0" || !REGULAR_FILE_MODE.test(mode)) {
      entry = { kind: "non-regular" };
    } else {
      entry = { kind: "regular", mode, oid };
    }
    if (entries.has(path)) entry = { kind: "non-regular" };
    entries.set(path, entry);
  }
  return entries;
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
  const { stdout } = await runGit(repositoryRoot, [
    "--literal-pathspecs",
    "ls-files",
    "--stage",
    "-z",
  ]);
  return Object.freeze({
    version: INDEX_SNAPSHOT_VERSION,
    repositoryRoot,
    entries: parseIndexSnapshot(stdout),
  });
}

export function indexSnapshotPaths(snapshot) {
  if (snapshot?.version !== INDEX_SNAPSHOT_VERSION || !(snapshot.entries instanceof Map)) {
    throw new TypeError("invalid Git index snapshot");
  }
  return [...snapshot.entries.keys()];
}

export async function untrackedPathsInScope(snapshot, pathspecs) {
  const { stdout } = await runGit(snapshot.repositoryRoot, [
    "--literal-pathspecs",
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
  let commits;
  try {
    const { stdout } = await runGit(repositoryRoot, [
      "log",
      "-z",
      "--format=%H",
      "HEAD",
      "--",
      relativePath,
    ]);
    commits = parseNulPaths(stdout);
  } catch (error) {
    if (error?.code === 128) return [];
    throw error;
  }
  const versions = [];
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
    const { stdout: bytes } = await runGit(repositoryRoot, ["cat-file", "blob", match[3]]);
    versions.push(bytes);
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
