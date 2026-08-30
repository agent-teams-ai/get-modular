import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const PRODUCTION_SOURCE = /\.[cm]?[jt]sx?$/u;
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
    const path = `${relativeDirectory}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      files.push(path);
    } else if (entry.isDirectory()) {
      files.push(...await filesBelow(repositoryRoot, path, includeProductionFiles));
    } else if (includeProductionFiles && entry.isFile() && isProductionArtifactName(path)) {
      files.push(path);
    }
  }
  return files;
}

export function productionArtifactsOutsidePackages(productionArtifacts) {
  return productionArtifacts.filter(path => !path.startsWith("packages/"));
}

export async function productionArtifactPaths(repositoryRoot = process.cwd()) {
  const artifacts = [];
  const rootPackage = JSON.parse(await readFile(resolve(repositoryRoot, "package.json"), "utf8"));
  if (rootPackage.private !== true) artifacts.push("package.json#private");
  for (const field of ["bin", "exports", "files", "main", "module", "types", "typings"]) {
    if (rootPackage[field] !== undefined) artifacts.push(`package.json#${field}`);
  }

  for (const entry of await readdir(repositoryRoot, { withFileTypes: true })) {
    if (UNTRACKED_DIRECTORIES.has(entry.name)) continue;
    if (entry.isSymbolicLink()) {
      artifacts.push(entry.name);
    } else if (entry.isDirectory()) {
      artifacts.push(...await filesBelow(
        repositoryRoot,
        entry.name,
        !NON_PRODUCTION_DIRECTORIES.has(entry.name),
      ));
    } else if (entry.isFile() && PRODUCTION_SOURCE.test(entry.name)) {
      artifacts.push(entry.name);
    }
  }
  return artifacts.sort(compareStrings);
}
