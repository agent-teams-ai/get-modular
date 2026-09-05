import { lstat, readFile, readdir } from "node:fs/promises";
import { posix, resolve } from "node:path";

import {
  indexSnapshotPaths,
  indexSnapshotSymlinkPaths,
  readIndexSnapshotFile,
} from "./tracked-file-custody.mjs";

const PRODUCTION_SOURCE = /\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/u;
// Current Core builds compile .ts inputs to .js and .d.ts only.
const CORE_EMITTED_SOURCE = /(?:\.js|\.d\.ts)$/u;
export const ACCEPTED_PACKAGE_NAMES = new Set([
  "@get-modular/conformance",
  "@get-modular/core",
]);
export const ESM_CARRIER_PACKAGE_NAME = "@get-modular/core";
const PACKAGE_MANIFEST = /^packages\/(?:.+\/)?package\.json$/u;
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
// ADR-0012 describes the carrier of `@get-modular/core`: it omits these root
// manifest fields and exposes exactly one ESM package root. Those rules bind
// that package only. The lifecycle-script prohibition is different in kind,
// because an install script runs code on every consumer, so it binds every
// accepted identity. Both hold whether or not a publication blocker is open.
export const PROHIBITED_MANIFEST_FIELDS = Object.freeze([
  "browser",
  "main",
  "module",
  "types",
  "typesVersions",
  "typings",
]);
export const PROHIBITED_LIFECYCLE_SCRIPTS = Object.freeze([
  "dependencies",
  "install",
  "pnpm:devPreinstall",
  "postinstall",
  "postpack",
  "postprepare",
  "postpublish",
  "postuninstall",
  "preinstall",
  "prepack",
  "preprepare",
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
const CORE_BUILD_SOURCE_ROOTS = ["dist", "dist-test", "dist-stage0"]
  .map(directory => `packages/core/${directory}/`);

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

// Reads every package manifest at or below packages/, at any depth. An
// unreadable manifest is
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
    const scriptsDeclared = readable && manifest.scripts !== undefined;
    const scriptsMalformed = scriptsDeclared
      && (manifest.scripts === null
        || typeof manifest.scripts !== "object"
        || Array.isArray(manifest.scripts));
    const scripts = scriptsDeclared && !scriptsMalformed ? manifest.scripts : {};
    inventory.push({
      path,
      root: path.slice(0, -"/package.json".length),
      manifest: readable ? manifest : undefined,
      name: readable ? manifest.name : undefined,
      isPackageRoot: PACKAGE_ROOT_MANIFEST.test(path),
      publicationFields: readable
        ? PUBLICATION_FIELDS.filter(field => manifest[field] !== undefined)
        : [],
      prohibitedFields: readable && manifest.name === ESM_CARRIER_PACKAGE_NAME
        ? PROHIBITED_MANIFEST_FIELDS.filter(field => manifest[field] !== undefined)
        : [],
      prohibitedScripts: readable
        ? PROHIBITED_LIFECYCLE_SCRIPTS.filter(script => scripts[script] !== undefined)
        : [],
      scriptsMalformed,
      exportsField: readable ? manifest.exports : undefined,
      carrierShapeViolations: readable && manifest.name === ESM_CARRIER_PACKAGE_NAME
        ? filesAllowlistViolations(manifest.files)
        : [],
      moduleTypeViolation: readable
        && manifest.name === ESM_CARRIER_PACKAGE_NAME
        && manifest.type !== "module",
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

// ADR-0012 exposes exactly one package root through one ESM target: a single
// `.` subpath whose `import` condition carries `types` and `default`, plus a
// sibling top-level `default` for `require(esm)`. Any other subpath, any
// environment-specific condition and any `require` condition are prohibited.
const EXPORT_ROOT_SUBPATH = ".";
const EXPORT_IMPORT_CONDITIONS = Object.freeze(["types", "default"]);
const EXPORT_ROOT_CONDITIONS = Object.freeze(["import", "default"]);

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function relativeTarget(value, label) {
  if (typeof value !== "string") {
    return [`${label} must be a relative file target, not a nested condition object`];
  }
  const escapes = value.split("/").includes("..");
  if (!value.startsWith("./") || value.includes("*") || escapes) {
    return [`${label} must be a relative file target below the package root: ${value}`];
  }
  return [];
}

function exportMapViolations(exportsField, publicationBlocked) {
  // A carrier without an export map has no package root at all: Node falls back
  // to directory resolution and the archive hands out its whole tree, which is
  // the opposite of exposing exactly one root. The exemption follows the
  // publication blockers rather than `private`, for two reasons. While a
  // blocker is open the manifest is forbidden to declare `exports` at all, so
  // requiring it there would make that state unsatisfiable. And `private` is
  // not a publication barrier that can be relied on: the npm guard that refuses
  // a private manifest fires only on a workspace publish, so a direct
  // `npm publish` from the package directory reaches the registry.
  if (exportsField === undefined) {
    return publicationBlocked
      ? []
      : ['exports must declare the accepted package root; without it a published '
        + 'archive exposes its whole tree to deep imports'];
  }
  if (!plainObject(exportsField)) {
    return ['exports must be an object with one "." subpath'];
  }
  const subpaths = Object.keys(exportsField);
  const extraSubpaths = subpaths.filter(key => key !== EXPORT_ROOT_SUBPATH);
  if (extraSubpaths.length > 0) {
    return [`exports must declare no subpath beyond "." : ${extraSubpaths.join(", ")}`];
  }
  if (!subpaths.includes(EXPORT_ROOT_SUBPATH)) {
    return ['exports must declare the "." subpath'];
  }
  const root = exportsField[EXPORT_ROOT_SUBPATH];
  if (!plainObject(root)) {
    return ['exports["."] must be a condition object'];
  }
  // Condition order is normative: a runtime selects the first matching key, so
  // `import` must precede the sibling `default` and `types` must precede the
  // nested `default`.
  const rootConditions = Object.keys(root);
  const rootOrder = conditionOrderViolations(rootConditions, EXPORT_ROOT_CONDITIONS, 'exports["."]');
  if (rootOrder.length > 0) return rootOrder;
  if (!plainObject(root.import)) {
    return ['exports["."].import must be a condition object'];
  }
  const importConditions = Object.keys(root.import);
  const importOrder = conditionOrderViolations(
    importConditions,
    EXPORT_IMPORT_CONDITIONS,
    'exports["."].import',
  );
  if (importOrder.length > 0) return importOrder;

  const targets = [
    ...relativeTarget(root.import.types, 'exports["."].import.types'),
    ...relativeTarget(root.import.default, 'exports["."].import.default'),
    ...relativeTarget(root.default, 'exports["."].default'),
  ];
  if (targets.length > 0) return targets;

  // The sibling `default` is a second resolution path to one implementation,
  // never a second build.
  if (root.default !== root.import.default) {
    return ['exports["."].default must resolve to the same file as '
      + `exports["."].import.default: ${root.default} against ${root.import.default}`];
  }
  return [];
}

function conditionOrderViolations(actual, expected, label) {
  const unexpected = actual.filter(key => !expected.includes(key));
  if (unexpected.length > 0) {
    return [`${label} must declare no condition beyond ${expected.join(" and ")}: `
      + unexpected.join(", ")];
  }
  const missing = expected.filter(key => !actual.includes(key));
  if (missing.length > 0) {
    return [`${label} must declare the ${expected.join(" and ")} conditions: `
      + missing.join(", ")];
  }
  if (actual.join(",") !== expected.join(",")) {
    return [`${label} must declare its conditions in the order ${expected.join(", ")}: `
      + actual.join(", ")];
  }
  return [];
}

// ADR-0012 keeps the publication allowlist closed: source, tests, fixtures and
// repository configuration stay out of the archive. A `files` entry that names
// the package root defeats that allowlist outright, whatever the export map
// hides from importers. The archive inventory itself is verified by the packed
// evidence, not here.
// A literal list of spellings loses against a glob language: `./**` ships the
// same tree as `**`. The entry is normalized first, then rejected when it
// resolves to the package root or when its first path segment is a wildcard,
// which is what makes it match every top-level directory.
// Enumerating the wildcard spellings is the same mistake one level down: a real
// `npm pack` ships the whole tree for `?*`, `[a-z]*`, `{,**}` and `/**` just as
// it does for `**`. The predicate is inverted instead: the first path segment
// must be a literal directory name.
const GLOB_METACHARACTERS = /[*?[\]{}!()]/u;

function normalizedFilesEntry(entry) {
  return posix.normalize(entry.trim());
}

function rootedFilesEntry(entry) {
  const normalized = normalizedFilesEntry(entry);
  // Preserve the original prefix restriction too: normalizing */../dist must
  // not erase a prohibited wildcard and turn it into an admitted literal root.
  const original = entry.trim().replace(/^(?:\.\/)+/u, "");
  // Brace/extglob branches can hide `..` or an empty segment that changes the
  // meaning of a later parent traversal. POSIX normalization does not expand
  // patterns. Require parent traversal to be independent of glob expansion.
  // A brace group spanning `/` can hide its parent alternative in a segment
  // with no glob marker, or concatenate two separate `.` alternatives. Keep
  // brace groups within one path component; callers can list paths separately.
  let braceDepth = 0;
  for (const character of original) {
    if (character === "{") braceDepth += 1;
    else if (character === "}") {
      // npm may recover malformed groups by treating an earlier close as
      // literal. Reject unmatched closes instead of accepting that recovery.
      if (braceDepth === 0) return true;
      braceDepth -= 1;
    }
    else if (character === "/" && braceDepth > 0) return true;
  }
  if (braceDepth !== 0) return true;
  let seenPattern = false;
  for (const segment of original.split("/")) {
    const pattern = GLOB_METACHARACTERS.test(segment);
    // Even .{,safe}. expands to `..`. Dot-bearing brace segments must use
    // separate literal allowlist entries; no brace-expansion engine is needed.
    if (/[{}]/u.test(segment) && segment.includes(".")) return true;
    if (pattern && segment.includes("..") || seenPattern && segment === "..") return true;
    seenPattern ||= pattern;
  }
  return [original, normalized].some(value => {
    // Require POSIX spelling rather than guessing whether a backslash escapes
    // glob syntax or separates directories. Drive prefixes are not relative roots.
    if (value.includes("\\") || /^[A-Za-z]:/u.test(value)) return true;
    const first = value.split("/")[0];
    return first === "" || first === "." || first === ".." || GLOB_METACHARACTERS.test(first);
  });
}

function filesAllowlistViolations(filesField) {
  if (filesField === undefined) return [];
  if (!Array.isArray(filesField) || filesField.some(entry => typeof entry !== "string")) {
    return ["files must be an array of path patterns"];
  }
  const rootEntries = filesField.filter(entry => rootedFilesEntry(entry));
  if (rootEntries.length > 0) {
    return [`files must not resolve to the package root or start with a wildcard `
      + `segment, which defeats the publication allowlist: ${rootEntries.join(", ")}`];
  }
  return [];
}

// ADR-0009 prohibits an identifier that ends in `V` followed by a decimal
// generation anywhere in package source. The rule is syntactic on purpose: a
// checker cannot read intent, and the accepted evidence names live only in the
// immutable qualification artifacts and the checkers that execute them, none of
// which sit below packages/.
const VERSIONED_IDENTIFIER = /\b[A-Za-z_$][A-Za-z0-9_$]*V\d+\b/gu;

export function versionedIdentifierMatches(source) {
  return [...new Set(String(source).match(VERSIONED_IDENTIFIER) ?? [])].sort();
}

export async function versionedIdentifierViolations(productionArtifacts, readSource) {
  const violations = [];
  for (const path of productionArtifacts.filter(candidate => PRODUCTION_SOURCE.test(candidate))) {
    const matches = versionedIdentifierMatches(await readSource(path));
    if (matches.length > 0) violations.push({ path, identifiers: matches });
  }
  return violations;
}

// ADR-0012 fixes the carrier shape of the accepted package manifest itself.
// These prohibitions are independent of the publication blockers because they
// describe the accepted carrier, not the decision to publish it.
export function manifestCarrierViolations(inventory, { publicationBlocked = false } = {}) {
  return inventory
    .map(entry => ({
      path: entry.path,
      manifest: entry.manifest,
      fields: entry.prohibitedFields,
      scripts: [
        ...(entry.scriptsMalformed === true ? ["scripts must be an object"] : []),
        ...entry.prohibitedScripts.map(script => `scripts.${script}`),
        ...entry.carrierShapeViolations,
        ...(entry.name === ESM_CARRIER_PACKAGE_NAME
          ? exportMapViolations(entry.exportsField, publicationBlocked)
          : []),
        ...(entry.moduleTypeViolation === true
          ? ['type must be "module" because the carrier is ESM-only']
          : []),
      ],
    }))
    .filter(entry => (
      entry.manifest !== undefined
      && (entry.fields.length > 0 || entry.scripts.length > 0)
    ))
    .map(({ path, fields, scripts }) => ({ path, fields, scripts }));
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
  const capturedPaths = new Set(indexSnapshot ? indexSnapshotPaths(indexSnapshot) : []);
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
    for (const path of capturedPaths) {
      if (!isTrackedProductionArtifactPath(path)) continue;
      await readIndexSnapshotFile(indexSnapshot, path, "production artifact");
      artifacts.add(path);
    }
  }
  // The Core build emits ignored JavaScript/declarations into three explicit
  // output trees (production, component tests, and direct qualification). They are
  // qualified as build/archive output, not as authored Git-index source. Keep
  // authored TypeScript, staged output, manifests, symlinks, and every other location in the source
  // inventory. An orphan dist tree cannot stand in for a real source package.
  if (indexSnapshot && artifacts.has("packages/core/package.json")
    && [...artifacts].some(path => path.startsWith("packages/core/src/") && PRODUCTION_SOURCE.test(path))) {
    for (const path of artifacts) {
      if (CORE_BUILD_SOURCE_ROOTS.some(root => path.startsWith(root)) && CORE_EMITTED_SOURCE.test(path) && !capturedPaths.has(path)
        && (await lstat(resolve(repositoryRoot, path))).isFile()) {
        artifacts.delete(path);
      }
    }
  }
  return [...artifacts].sort(compareStrings);
}
