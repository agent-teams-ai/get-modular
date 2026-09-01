import { execFile } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const NON_PORTABLE_PATH_CHARACTERS = /[<>:"|?*\u0000-\u001f]/u;
const SAFE_RELATIVE_PATH = /^(?![\\/])(?!.*(?:^|[\\/])\.\.(?:[\\/]|$))[^\\]+$/u;
const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.[^/]*)?$/iu;

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

export async function inspectTrackedRegularFile(relativePath, repositoryRoot) {
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

  let indexOutput;
  try {
    ({ stdout: indexOutput } = await execFileAsync(
      "git",
      ["ls-files", "--error-unmatch", "--stage", "--", relativePath],
      { cwd: repositoryRoot },
    ));
  } catch (error) {
    if (error?.code === 1) return { kind: "untracked" };
    throw error;
  }
  if (!/^(?:100644|100755) [a-f0-9]{40} 0\t/u.test(indexOutput)) {
    return { kind: "untracked" };
  }
  return { kind: "regular", tracked: true, bytes: await readFile(current) };
}

export async function readTrackedRegularFile(relativePath, repositoryRoot, label) {
  const file = await inspectTrackedRegularFile(relativePath, repositoryRoot);
  if (file.kind !== "regular" || file.tracked !== true) {
    throw new Error(
      `TRACKED_FILE_CUSTODY_FAILED: ${label} must be a regular tracked file `
      + `with no symbolic-link path: ${relativePath} (${file.kind})`,
    );
  }
  return file.bytes;
}
