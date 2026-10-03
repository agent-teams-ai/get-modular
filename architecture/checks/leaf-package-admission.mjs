import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { posix } from "node:path";
import ts from "typescript-minimum";
import { GENERATED_PRODUCTION_PATH } from "./generated-production-source.mjs";
import {
  assertLeafPackageTable, LEAF_PACKAGES, leafManifestPath, PUBLIC, PUBLIC_FILES, PUBLIC_PUBLISH_CONFIG,
  publicRepository,
} from "./leaf-packages.mjs";

const PUBLICATION_FIELDS = Object.freeze([
  "bin", "browser", "main", "module", "publishConfig",
  "types", "typesVersions", "typings",
]);
const ROOT_EXPORT = Object.freeze({
  ".": {
    import: { types: "./dist/index.d.ts", default: "./dist/index.js" },
    default: "./dist/index.js",
  },
});
const INSTALL_SCRIPTS = new Set([
  "dependencies", "install", "pnpm:devPreinstall", "postinstall", "postpack",
  "postprepare", "postpublish", "postuninstall", "preinstall", "prepack",
  "preprepare", "prepare", "prepublish", "prepublishOnly", "preuninstall",
  "publish", "uninstall",
]);
const SOURCE = /\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/u;

const sha256 = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);

function parseSource(path, source, forbidDynamic = true) {
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  assert.equal(parsed.parseDiagnostics.length, 0,
    `${path} must parse as production source`);
  const references = ts.preProcessFile(source, true, true);
  const specifiers = [
    ...references.referencedFiles,
    ...references.typeReferenceDirectives,
    ...references.libReferenceDirectives,
  ].map(reference => reference.fileName);
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier) {
      assert(ts.isStringLiteral(node.moduleSpecifier), `${path} has an unresolved import`);
      specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isImportEqualsDeclaration(node)) {
      assert.fail(`${path} must not use import-equals`);
    } else if (ts.isImportTypeNode(node)) {
      const argument = node.argument;
      assert(ts.isLiteralTypeNode(argument) && ts.isStringLiteral(argument.literal),
        `${path} has an unresolved import type`);
      specifiers.push(argument.literal.text);
    } else if (ts.isCallExpression(node)
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || ts.isIdentifier(node.expression) && node.expression.text === "require")) {
      if (forbidDynamic) assert.fail(`${path} must not use dynamic import or require`);
      assert(node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0]),
        `${path} has an unresolved dynamic import or require`);
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return { parsed, specifiers };
}

function assertSourceEdges(leaf, path, source) {
  const { parsed, specifiers } = parseSource(path, source);
  for (const specifier of specifiers) {
    assert(specifier.startsWith("./") || specifier.startsWith("../"),
      `${path} has a forbidden package or builtin import: ${specifier}`);
    const target = posix.normalize(posix.join(posix.dirname(path), specifier));
    assert(target.startsWith(`${leaf.root}/src/`),
      `${path} imports outside ${leaf.id} source: ${specifier}`);
  }
  return parsed;
}

function substantiveSource(parsed) {
  let substantive = false;
  function visit(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)
      || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)
      || ts.isArrowFunction(node)) && node.body &&
      node.body.statements?.some(statement =>
        !ts.isEmptyStatement(statement) && !ts.isDebuggerStatement(statement))) substantive = true;
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return substantive;
}

// The decision is authenticated whether or not its root exists yet, so a row
// cannot stand in for an accepted decision while the package is still absent.
async function authenticateLeafDecision(leaf, { readBytes, registry, sdkGrowthStatus }) {
  const { decision } = leaf;
  assert.equal(sha256(await readBytes(decision.path)), decision.fileDigest,
    `${leaf.name} admission requires exact accepted ${decision.id} bytes`);
  assert.deepEqual(registry.decisions.filter(entry => entry?.id === decision.id
    || entry?.path === decision.path),
  [{ id: decision.id, path: decision.path, immutableDigest: decision.immutableDigest }],
  `${leaf.name} admission requires exact registered ${decision.id} identity`);
  assert(sdkGrowthStatus?.status === "pending"
    && sdkGrowthStatus.activation === "hold"
    && sdkGrowthStatus.qualified === false
    && record(sdkGrowthStatus.claims)
    && Object.values(sdkGrowthStatus.claims).every(value => value === false),
  `${leaf.name} must not promote G1 or claim public qualification`);
}

async function assertLeafManifest(leaf, readPackageManifest) {
  const manifest = await readPackageManifest(leafManifestPath(leaf));
  assert(record(manifest) && manifest.name === leaf.name,
    `${leaf.name} requires its exact package identity`);
  const isPublic = leaf.publication === PUBLIC;
  if (isPublic) {
    assert.equal(manifest.private, undefined, `${leaf.name} public package must not be private`);
    assert.deepEqual(manifest.publishConfig, PUBLIC_PUBLISH_CONFIG,
      `${leaf.name} public package requires the exact npm publishConfig`);
    assert.deepEqual(manifest.repository, publicRepository(leaf),
      `${leaf.name} public package requires its exact repository directory`);
    assert.deepEqual(manifest.files, PUBLIC_FILES,
      `${leaf.name} public package requires the exact files list`);
  } else {
    assert.equal(manifest.private, true, `${leaf.name} candidate must remain private`);
  }
  assert.equal(manifest.type, "module", `${leaf.name} must use ESM`);
  for (const field of PUBLICATION_FIELDS) {
    if (isPublic && field === "publishConfig") continue;
    assert.equal(manifest[field], undefined,
      `${leaf.name} must not claim publication through ${field}`);
  }
  assert.deepEqual(manifest.exports, ROOT_EXPORT,
    `${leaf.name} requires one root-only ESM export and no deep import`);
  assert(Array.isArray(manifest.files) && manifest.files.length > 0
    && manifest.files.every(path => typeof path === "string"
      && /^(?:dist|README\.md|LICENSE|CHANGELOG\.md)(?:\/[A-Za-z0-9._/-]+)?$/u.test(path)
      && !path.split("/").includes("..")),
  `${leaf.name} requires a bounded archive files allowlist`);
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    assert(manifest[field] === undefined
      || record(manifest[field]) && Object.keys(manifest[field]).length === 0,
    `${leaf.name} must have zero ${field}`);
  }
  assert(manifest.scripts === undefined || record(manifest.scripts),
    `${leaf.name} scripts must be an object`);
  for (const script of Object.keys(manifest.scripts ?? {})) {
    assert(!INSTALL_SCRIPTS.has(script),
      `${leaf.name} forbids install or publication script ${script}`);
  }
}

async function validateLeafRoot(leaf, artifacts, input) {
  const { readPackageManifest, readProductionSource, packageJson } = input;
  const manifestPath = leafManifestPath(leaf);
  const sourceRoot = `${leaf.root}/src/`;
  assert(artifacts.every(path => path === manifestPath
    || path.startsWith(sourceRoot) || path.startsWith(`${leaf.root}/tests/`)),
  `${leaf.name} rejects ungoverned development output`);
  assert(artifacts.includes(manifestPath),
    `${leaf.name} requires its exact package root manifest`);
  assert(artifacts.every(path => !path.endsWith("/package.json") || path === manifestPath),
    `${leaf.name} rejects nested manifests`);
  await assertLeafManifest(leaf, readPackageManifest);
  const sources = artifacts.filter(path => path.startsWith(sourceRoot) && SOURCE.test(path));
  assert(sources.includes(`${sourceRoot}index.ts`), `${leaf.name} requires src/index.ts`);
  assert(sources.length > 0, `${leaf.name} cannot have empty source`);
  for (const path of leaf.requiredTests) {
    assert(artifacts.includes(path), `${leaf.name} requires a real test: ${path}`);
  }
  let substantive = false;
  for (const path of sources) {
    const source = await readProductionSource(path);
    assert(typeof source === "string" && source.trim().length > 0,
      `${path} cannot be empty`);
    const parsed = assertSourceEdges(leaf, path, source);
    if (substantiveSource(parsed)) substantive = true;
  }
  assert(substantive, `${leaf.name} requires substantive executable source`);
  for (const [name, expected] of Object.entries(leaf.commands)) {
    assert.equal(packageJson?.scripts?.[name], expected,
      `${leaf.name} requires a non-no-op ${name} command`);
  }
  for (const command of ["check", "check:fast"]) {
    const steps = packageJson.scripts?.[command]?.split(" && ") ?? [];
    assert(steps.length > 0
      && steps.every(step => /^pnpm [a-z][a-z0-9:-]*$/u.test(step))
      && steps.includes(`pnpm ${leaf.gate}`),
    `${command} must execute ${leaf.gate} as a top-level command`);
  }
}

// Core and Assembly must not import an implemented leaf, including through
// type-only, dynamic or relative edges.
async function assertNoCoreOrAssemblyLeafImport(leaves, productionArtifacts, readProductionSource) {
  for (const path of productionArtifacts.filter(path =>
    /^packages\/(?:core|assembly)\/src\//u.test(path)
      && SOURCE.test(path) && path !== GENERATED_PRODUCTION_PATH)) {
    const source = await readProductionSource(path);
    for (const specifier of parseSource(path, source, false).specifiers) {
      const target = specifier.startsWith(".")
        ? posix.normalize(posix.join(posix.dirname(path), specifier)) : specifier;
      for (const leaf of leaves) {
        assert(!target.startsWith(leaf.name) && !target.startsWith(`${leaf.root}/`),
          `${path} must not import the leaf package ${leaf.name}: ${specifier}`);
      }
    }
  }
}

/**
 * Every row authenticates its accepted decision while retaining the Core and
 * Assembly package guards. A row admits its root only as an implemented
 * package together with its exact manifest, source edges, tests and commands.
 */
export async function validateLeafPackageAdmission({
  productionArtifacts,
  readBytes,
  readPackageManifest,
  readProductionSource,
  packageJson,
  sdkGrowthStatus,
  leaves = LEAF_PACKAGES,
}) {
  assert(Array.isArray(productionArtifacts), "leaf package admission needs an artifact inventory");
  assertLeafPackageTable(leaves);
  const registry = JSON.parse((await readBytes(
    "architecture/decisions/accepted-decisions.json",
  )).toString("utf8"));
  assert.equal(registry.schemaVersion, 1);
  assert.equal(registry.algorithm, "sha256");
  assert(Array.isArray(registry.decisions), "leaf package admission needs the accepted ADR registry");
  for (const leaf of leaves) {
    await authenticateLeafDecision(leaf, { readBytes, registry, sdkGrowthStatus });
  }

  const acceptedRoots = new Set(["core", "assembly", ...leaves.map(leaf => posix.basename(leaf.root))]);
  for (const path of productionArtifacts.filter(path => path.startsWith("packages/"))) {
    const packageRoot = path.split("/")[1];
    assert(acceptedRoots.has(packageRoot),
      `leaf package admission rejects unknown or differently named production root: ${path}`);
  }

  const admitted = [];
  const implemented = [];
  for (const leaf of leaves) {
    const artifacts = productionArtifacts.filter(path => path.startsWith(`${leaf.root}/`));
    if (artifacts.length === 0) continue;
    await validateLeafRoot(leaf, artifacts, { readPackageManifest, readProductionSource, packageJson });
    implemented.push(leaf);
    admitted.push(...artifacts);
  }
  if (implemented.length > 0) {
    await assertNoCoreOrAssemblyLeafImport(implemented, productionArtifacts, readProductionSource);
  }
  return Object.freeze(admitted);
}
