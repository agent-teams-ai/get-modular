import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import {
  indexSnapshotPaths,
  indexSnapshotSymlinkPaths,
  readIndexSnapshotFile,
} from "./tracked-file-custody.mjs";

const PRODUCTION_SOURCE = /\.[cm]?[jt]sx?$/u;
const PUBLICATION_FIELDS = Object.freeze([
  "bin",
  "browser",
  "exports",
  "files",
  "main",
  "module",
  "publishConfig",
  "types",
  "typesVersions",
  "typings",
]);
const NON_PRODUCTION_DIRECTORIES = new Set([
  ".agents",
  ".codex",
  ".github",
  "architecture",
  "docs",
  "tests",
]);
const UNTRACKED_DIRECTORIES = new Set([".git", "node_modules"]);

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isProductionArtifactName(path) {
  return path.endsWith("/package.json") || PRODUCTION_SOURCE.test(path);
}

function isTrackedProductionArtifactPath(path) {
  if (path.endsWith("/package.json")) return true;
  if (!PRODUCTION_SOURCE.test(path)) return false;
  const [topLevel] = path.split("/");
  return !NON_PRODUCTION_DIRECTORIES.has(topLevel);
}

async function filesBelow(repositoryRoot, relativeDirectory, includeProductionFiles) {
  const files = [];
  let entries = [];
  try {
    entries = await readdir(resolve(repositoryRoot, relativeDirectory), { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return files;
    throw error;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && UNTRACKED_DIRECTORIES.has(entry.name)) continue;
    const path = `${relativeDirectory}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      files.push(path);
    } else if (entry.isDirectory()) {
      files.push(...await filesBelow(repositoryRoot, path, includeProductionFiles));
    } else if (entry.isFile()
      && (path.endsWith("/package.json")
        || (includeProductionFiles && isProductionArtifactName(path)))) {
      files.push(path);
    }
  }
  return files;
}

async function symlinksBelow(repositoryRoot, relativeDirectory) {
  const symlinks = [];
  let entries = [];
  try {
    entries = await readdir(resolve(repositoryRoot, relativeDirectory), { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return symlinks;
    throw error;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && UNTRACKED_DIRECTORIES.has(entry.name)) continue;
    const path = `${relativeDirectory}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      symlinks.push(path);
    } else if (entry.isDirectory()) {
      symlinks.push(...await symlinksBelow(repositoryRoot, path));
    }
  }
  return symlinks;
}

export function productionArtifactsOutsidePackages(productionArtifacts) {
  return productionArtifacts.filter(path => !path.startsWith("packages/"));
}

export async function productionArtifactSymlinkPaths(repositoryRoot = process.cwd(), indexSnapshot) {
  const paths = new Set(await symlinksBelow(repositoryRoot, "packages"));
  if (indexSnapshot) {
    for (const path of indexSnapshotSymlinkPaths(indexSnapshot)) {
      if (path.startsWith("packages/")) paths.add(path);
    }
  }
  return [...paths].sort(compareStrings);
}

export async function productionArtifactPaths(repositoryRoot = process.cwd(), indexSnapshot) {
  const artifacts = new Set();
  const rootPackageBytes = indexSnapshot
    ? await readIndexSnapshotFile(indexSnapshot, "package.json", "root package manifest")
    : await readFile(resolve(repositoryRoot, "package.json"));
  const rootPackage = JSON.parse(rootPackageBytes.toString("utf8"));
  if (rootPackage.private !== true) artifacts.add("package.json#private");
  for (const field of PUBLICATION_FIELDS) {
    if (rootPackage[field] !== undefined) artifacts.add(`package.json#${field}`);
  }

  for (const entry of await readdir(repositoryRoot, { withFileTypes: true })) {
    if (UNTRACKED_DIRECTORIES.has(entry.name)) continue;
    if (entry.isSymbolicLink()) {
      artifacts.add(entry.name);
    } else if (entry.isDirectory()) {
      for (const path of await filesBelow(
        repositoryRoot,
        entry.name,
        !NON_PRODUCTION_DIRECTORIES.has(entry.name),
      )) {
        artifacts.add(path);
      }
    } else if (entry.isFile() && PRODUCTION_SOURCE.test(entry.name)) {
      artifacts.add(entry.name);
    }
  }

  if (indexSnapshot) {
    for (const path of indexSnapshotSymlinkPaths(indexSnapshot)) artifacts.add(path);
    for (const path of indexSnapshotPaths(indexSnapshot)) {
      if (!isTrackedProductionArtifactPath(path)) continue;
      await readIndexSnapshotFile(indexSnapshot, path, "production artifact");
      artifacts.add(path);
    }
  }
  return [...artifacts].sort(compareStrings);
}
