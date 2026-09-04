import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import {
  indexSnapshotPaths,
  indexSnapshotSymlinkPaths,
  readIndexSnapshotFile,
} from "./tracked-file-custody.mjs";

const PRODUCTION_SOURCE = /\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/u;
export const ACCEPTED_PACKAGE_NAMES = new Set([
  "@get-modular/conformance",
  "@get-modular/core",
]);
const PACKAGE_MANIFEST = /^packages\/.+\/package\.json$/u;
const PACKAGE_ROOT_MANIFEST = /^packages\/[^/]+\/package\.json$/u;
export const PUBLICATION_FIELDS = Object.freeze([
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
// ADR-0012 requires the accepted carrier to omit these root manifest fields and
// every lifecycle script a package manager runs on install or publish. The rule
// is a property of the accepted carrier, so it holds whether or not a
// publication blocker is open.
export const PROHIBITED_MANIFEST_FIELDS = Object.freeze([
  "main",
  "module",
  "types",
  "typesVersions",
  "typings",
]);
export const PROHIBITED_LIFECYCLE_SCRIPTS = Object.freeze([
  "install",
  "postinstall",
  "postpack",
  "postpublish",
  "postuninstall",
  "preinstall",
  "prepack",
  "prepare",
  "prepublish",
  "prepublishOnly",
  "preuninstall",
  "publish",
  "uninstall",
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

export function isProductionSourceArtifactPath(path) {
  return typeof path === "string" && PRODUCTION_SOURCE.test(path);
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

async function defaultReadPackageManifest(path, repositoryRoot) {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), "utf8"));
}

// Reads every direct package manifest below packages/. An unreadable manifest is
// recorded with `manifest: undefined` so every consumer fails closed on it.
export async function packageManifestInventory(
  productionArtifacts,
  {
    repositoryRoot = process.cwd(),
    readPackageManifest = defaultReadPackageManifest,
  } = {},
) {
  const inventory = [];
  for (const path of productionArtifacts.filter(candidate => PACKAGE_MANIFEST.test(candidate))) {
    let manifest;
    try {
      manifest = await readPackageManifest(path, repositoryRoot);
    } catch {
      manifest = undefined;
    }
    const readable = manifest !== null && typeof manifest === "object" && !Array.isArray(manifest);
    const scripts = readable && manifest.scripts !== null
      && typeof manifest.scripts === "object"
      && !Array.isArray(manifest.scripts)
      ? manifest.scripts
      : {};
    inventory.push({
      path,
      root: path.slice(0, -"/package.json".length),
      manifest: readable ? manifest : undefined,
      name: readable ? manifest.name : undefined,
      isPackageRoot: PACKAGE_ROOT_MANIFEST.test(path),
      publicationFields: readable
        ? PUBLICATION_FIELDS.filter(field => manifest[field] !== undefined)
        : [],
      prohibitedFields: readable
        ? PROHIBITED_MANIFEST_FIELDS.filter(field => manifest[field] !== undefined)
        : [],
      prohibitedScripts: readable
        ? PROHIBITED_LIFECYCLE_SCRIPTS.filter(script => scripts[script] !== undefined)
        : [],
      isPrivate: readable && manifest.private === true,
    });
  }
  return inventory;
}

// Accepted package identity is an ADR-0003 rule and applies regardless of any
// open decision: every manifest below packages/ must be readable and must name
// an accepted package. ADR-0012 exposes exactly one package root, so a manifest
// nested below a package root is never an admitted identity.
export function packageIdentityViolations(inventory) {
  return inventory
    .filter(entry => (
      entry.isPackageRoot !== true
      || entry.manifest === undefined
      || !ACCEPTED_PACKAGE_NAMES.has(entry.name)
    ))
    .map(entry => entry.path);
}

// ADR-0012 fixes the carrier shape of the accepted package manifest itself.
// These prohibitions are independent of the publication blockers because they
// describe the accepted carrier, not the decision to publish it.
export function manifestCarrierViolations(inventory) {
  return inventory
    .filter(entry => (
      entry.manifest !== undefined
      && (entry.prohibitedFields.length > 0 || entry.prohibitedScripts.length > 0)
    ))
    .map(entry => ({
      path: entry.path,
      fields: entry.prohibitedFields,
      scripts: entry.prohibitedScripts,
    }));
}

export async function productionArtifactsBlockedByOpenDecisions(
  productionArtifacts,
  options = {},
) {
  const packageRoots = productionArtifacts
    .filter(path => path.endsWith("/package.json"))
    .map(path => path.slice(0, -"/package.json".length));
  const privatePackageRoots = new Set();
  for (const entry of await packageManifestInventory(productionArtifacts, options)) {
    if (entry.manifest !== undefined
      && entry.isPackageRoot === true
      && ACCEPTED_PACKAGE_NAMES.has(entry.name)
      && entry.isPrivate
      && entry.publicationFields.length === 0) {
      privatePackageRoots.add(entry.root);
    }
  }

  return productionArtifacts.filter(path => {
    const owningPackageRoot = packageRoots
      .filter(packageRoot => (
        path === `${packageRoot}/package.json` || path.startsWith(`${packageRoot}/`)
      ))
      .sort((left, right) => right.length - left.length)[0];
    return owningPackageRoot === undefined || !privatePackageRoots.has(owningPackageRoot);
  });
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
