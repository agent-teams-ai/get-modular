import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { posix } from "node:path";
import ts from "typescript-minimum";
import { GENERATED_PRODUCTION_PATH } from "./generated-production-source.mjs";

export const LIFECYCLE_DECISION_PATH =
  "docs/decisions/0029-admit-an-optional-lifecycle-kernel-candidate.md";
export const LIFECYCLE_MANIFEST_PATH = "packages/lifecycle-kernel/package.json";
const ROOT = "packages/lifecycle-kernel";
const SOURCE_ROOT = `${ROOT}/src/`;
const DECISION_DIGEST =
  "sha256:9247eb2c2eb70cbbc215426446101314b1085d1d03fee02b6dc0467a737eac00";
const DECISION_ENTRY = Object.freeze({
  id: "ADR-0029",
  path: LIFECYCLE_DECISION_PATH,
  immutableDigest: "sha256:4162e78542ac053ee03e3b330880495ddd9ffd261c0a578fe100035bdf910d64",
});
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
const SOURCE_INDEX = `${SOURCE_ROOT}index.ts`;
const REQUIRED_TESTS = Object.freeze([
  `${ROOT}/tests/kernel.test.mjs`,
  `${ROOT}/tests/packed-root.test.mjs`,
]);
const CHECK_COMMANDS = Object.freeze({
  "lifecycle:build": "node architecture/tooling/build-lifecycle-kernel.mjs",
  "lifecycle:typecheck":
    "node node_modules/typescript/bin/tsc -p packages/lifecycle-kernel/tsconfig.json --noEmit"
    + " && node node_modules/typescript/bin/tsc -p packages/lifecycle-kernel/tsconfig.types.json --noEmit"
    + " && node node_modules/typescript/bin/tsc -p packages/lifecycle-kernel/tsconfig.types.bundler.json --noEmit",
  "lifecycle:test": "node --test packages/lifecycle-kernel/tests/kernel.test.mjs",
  "lifecycle:pack": "node --test packages/lifecycle-kernel/tests/packed-root.test.mjs",
  "lifecycle:check":
    "pnpm lifecycle:build && pnpm lifecycle:typecheck && pnpm lifecycle:test && pnpm lifecycle:pack",
});

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

function assertSourceEdges(path, source) {
  const { parsed, specifiers } = parseSource(path, source);
  for (const specifier of specifiers) {
    assert(specifier.startsWith("./") || specifier.startsWith("../"),
      `${path} has a forbidden package or builtin import: ${specifier}`);
    const target = posix.normalize(posix.join(posix.dirname(path), specifier));
    assert(target.startsWith(SOURCE_ROOT),
      `${path} imports outside lifecycle source: ${specifier}`);
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

/**
 * L0 authenticates the candidate exception while retaining the old package
 * guards. L1 must satisfy this boundary and then atomically update the other
 * package, Foundation, lock and archive gates for an implemented root.
 */
export async function validateLifecycleCandidateAdmission({
  productionArtifacts,
  readBytes,
  readPackageManifest,
  readProductionSource,
  packageJson,
  sdkGrowthStatus,
}) {
  assert(Array.isArray(productionArtifacts), "lifecycle admission needs an artifact inventory");
  assert.equal(sha256(await readBytes(LIFECYCLE_DECISION_PATH)), DECISION_DIGEST,
    "lifecycle admission requires exact accepted ADR-0029 bytes");
  const registry = JSON.parse((await readBytes(
    "architecture/decisions/accepted-decisions.json",
  )).toString("utf8"));
  assert.equal(registry.schemaVersion, 1);
  assert.equal(registry.algorithm, "sha256");
  assert(Array.isArray(registry.decisions), "lifecycle admission needs the accepted ADR registry");
  assert.deepEqual(registry.decisions.filter(entry => entry?.id === "ADR-0029"
    || entry?.path === LIFECYCLE_DECISION_PATH), [DECISION_ENTRY],
  "lifecycle admission requires exact registered ADR-0029 identity");
  assert(sdkGrowthStatus?.status === "pending"
    && sdkGrowthStatus.activation === "hold"
    && sdkGrowthStatus.qualified === false
    && record(sdkGrowthStatus.claims)
    && Object.values(sdkGrowthStatus.claims).every(value => value === false),
  "lifecycle candidate must not promote G1 or claim public qualification");

  const acceptedRoots = new Set(["core", "assembly", "lifecycle-kernel"]);
  for (const path of productionArtifacts.filter(path => path.startsWith("packages/"))) {
    const packageRoot = path.split("/")[1];
    assert(acceptedRoots.has(packageRoot),
      `lifecycle candidate rejects unknown or differently named production root: ${path}`);
  }

  const artifacts = productionArtifacts.filter(path => path.startsWith(`${ROOT}/`));
  if (artifacts.length === 0) return Object.freeze([]);
  assert(artifacts.every(path => path === LIFECYCLE_MANIFEST_PATH
    || path.startsWith(SOURCE_ROOT) || path.startsWith(`${ROOT}/tests/`)),
  "lifecycle candidate rejects ungoverned development output");
  assert(artifacts.includes(LIFECYCLE_MANIFEST_PATH),
    "lifecycle candidate requires its exact package root manifest");
  assert(artifacts.every(path => !path.endsWith("/package.json")
    || path === LIFECYCLE_MANIFEST_PATH),
  "lifecycle candidate rejects nested manifests");
  const manifest = await readPackageManifest(LIFECYCLE_MANIFEST_PATH);
  assert(record(manifest) && manifest.name === "@get-modular/lifecycle-kernel",
    "lifecycle candidate requires its exact package identity");
  assert.equal(manifest.private, true, "lifecycle candidate must remain private");
  assert.equal(manifest.type, "module", "lifecycle candidate must use ESM");
  for (const field of PUBLICATION_FIELDS) {
    assert.equal(manifest[field], undefined,
      `lifecycle candidate must not claim publication through ${field}`);
  }
  assert.deepEqual(manifest.exports, ROOT_EXPORT,
    "lifecycle candidate requires one root-only ESM export and no deep import");
  assert(Array.isArray(manifest.files) && manifest.files.length > 0
    && manifest.files.every(path => typeof path === "string"
      && /^(?:dist|README\.md|LICENSE|CHANGELOG\.md)(?:\/[A-Za-z0-9._/-]+)?$/u.test(path)
      && !path.split("/").includes("..")),
  "lifecycle candidate requires a bounded archive files allowlist");
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    assert(manifest[field] === undefined
      || record(manifest[field]) && Object.keys(manifest[field]).length === 0,
    `lifecycle candidate must have zero ${field}`);
  }
  assert(manifest.scripts === undefined || record(manifest.scripts),
    "lifecycle candidate scripts must be an object");
  for (const script of Object.keys(manifest.scripts ?? {})) {
    assert(!INSTALL_SCRIPTS.has(script),
      `lifecycle candidate forbids install or publication script ${script}`);
  }
  const sources = artifacts.filter(path => path.startsWith(SOURCE_ROOT) && SOURCE.test(path));
  assert(sources.includes(SOURCE_INDEX), "lifecycle candidate requires src/index.ts");
  assert(sources.length > 0, "lifecycle candidate cannot have empty source");
  for (const path of REQUIRED_TESTS) {
    assert(artifacts.includes(path), `lifecycle candidate requires a real test: ${path}`);
  }
  let substantive = false;
  for (const path of sources) {
    const source = await readProductionSource(path);
    assert(typeof source === "string" && source.trim().length > 0,
      `${path} cannot be empty`);
    const parsed = assertSourceEdges(path, source);
    if (substantiveSource(parsed)) substantive = true;
  }
  assert(substantive, "lifecycle candidate requires substantive executable source");
  for (const path of productionArtifacts.filter(path =>
    /^packages\/(?:core|assembly)\/src\//u.test(path)
      && SOURCE.test(path) && path !== GENERATED_PRODUCTION_PATH)) {
    const source = await readProductionSource(path);
    for (const specifier of parseSource(path, source, false).specifiers) {
      const target = specifier.startsWith(".")
        ? posix.normalize(posix.join(posix.dirname(path), specifier)) : specifier;
      assert(!target.startsWith("@get-modular/lifecycle-kernel")
        && !target.startsWith(`${ROOT}/`),
      `${path} must not import the lifecycle candidate: ${specifier}`);
    }
  }
  for (const [name, expected] of Object.entries(CHECK_COMMANDS)) {
    assert.equal(packageJson?.scripts?.[name], expected,
      `lifecycle candidate requires a non-no-op ${name} command`);
  }
  for (const command of ["check", "check:fast"]) {
    const steps = packageJson.scripts?.[command]?.split(" && ") ?? [];
    assert(steps.length > 0
      && steps.every(step => /^pnpm [a-z][a-z0-9:-]*$/u.test(step))
      && steps.includes("pnpm lifecycle:check"),
    `${command} must execute lifecycle:check as a top-level command`);
  }
  return Object.freeze(artifacts);
}
