import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const workspace = resolve(import.meta.dirname, "../..");
const foundationManifestPath = resolve(workspace, "node_modules/@agent-teams/engineering-foundation/package.json");
const foundationManifest = JSON.parse(await readFile(foundationManifestPath, "utf8"));
const foundationRoot = dirname(foundationManifestPath);
const foundationCli = resolve(foundationRoot, foundationManifest.bin["agent-teams-foundation"]);
const packageName = "@fixture/sdk-growth";
const foundationModule = path => import(pathToFileURL(join(foundationRoot, path)));
const [{ createGrowthObservation }, { createPublicApiExtractor }, { NodeChangeFingerprint }] = await Promise.all([
  foundationModule("dist/capabilities/public-api-compatibility/application/use-cases/observe-sdk-growth.js"),
  foundationModule("dist/capabilities/public-api-compatibility/module.js"),
  foundationModule("dist/capabilities/public-api-compatibility/adapters/outbound/crypto/node-change-fingerprint.js"),
]);
const fixedDigest = `sha256:${"0".repeat(64)}`;
const observationInvocation = Object.freeze({
  repository: "fixture:sdk-growth-qualification",
  sourceCommit: "0".repeat(40),
  sourceTree: "0".repeat(40),
  topologyDigest: fixedDigest,
  lockDigest: fixedDigest,
  toolchainDigest: fixedDigest,
  artifactDigests: Object.freeze([fixedDigest]),
  tool: Object.freeze({ version: foundationManifest.version, artifactDigest: fixedDigest,
    extractorVersion: foundationManifest.dependencies["@microsoft/api-extractor"] }),
});
const cancellation = Object.freeze({ throwIfCancelled() {} });

async function put(root, path, content) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

async function commit(root, message) {
  await execute("git", ["add", "."], { cwd: root });
  await execute("git", ["-c", "user.name=SDK Growth Fixture", "-c", "user.email=sdk-growth@example.invalid",
    "commit", "--quiet", "-m", message], { cwd: root });
}

async function commitPackages(root, message) {
  await execute("git", ["add", "packages"], { cwd: root });
  await execute("git", ["-c", "user.name=SDK Growth Fixture", "-c", "user.email=sdk-growth@example.invalid",
    "commit", "--quiet", "-m", message], { cwd: root });
}

async function runGrowth(root) {
  let result;
  try {
    result = await execute(process.execPath, [foundationCli, "check", "package.public-api-compatibility",
      "--consumer", root, "--format", "json"], { cwd: root, timeout: 120_000, maxBuffer: 8_000_000 });
  } catch (error) {
    result = error;
  }
  assert.equal(result.code ?? result.status, 2, `${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  const commandReport = JSON.parse(result.stdout);
  assert.equal(commandReport.capabilities[0].problem.code, "SDK_GROWTH_EVIDENCE_INCOMPLETE", JSON.stringify(commandReport));
  const report = JSON.parse(await readFile(join(root, "reports/sdk.json"), "utf8"));
  assert.equal(report.verdict, "incomplete");
  assert.equal(report.releaseEligible, false);
  assert.deepEqual(report.transitionReceipts, []);
  assert.equal(report.authority.status, "unverified");
  assert.equal(report.trustedBaseComparison.status, "incomplete");
  assert.equal(report.candidate.status, "available", JSON.stringify(report.candidate));
  const typedCoverage = report.coverage.find(row => row.packageName === packageName)
    ?.dimensions.find(row => row.dimension === "typed");
  assert.equal(typedCoverage?.status, "limited", `typed report coverage missing: ${JSON.stringify(typedCoverage)}`);
  assert.deepEqual(Object.keys(report.candidate.value).toSorted(), [
    "artifactDigests", "lockDigest", "sourceCommit", "sourceTree", "surfaceDigest", "toolchainDigest", "topologyDigest",
  ], "Foundation 1.5.1 reports a candidate observation reference, not invented surface entries");
  return report;
}

async function observeTypedSurface(root) {
  const manifest = JSON.parse(await readFile(join(root, "packages/sdk/package.json"), "utf8"));
  const policy = {
    packageName,
    packageRoot: "packages/sdk",
    manifestPath: "packages/sdk/package.json",
    entrypoints: [{ exportPath: ".", declarationEntryPoint: "packages/sdk/dist/index.d.ts" }],
    nonTypeExports: [],
    tsconfigPath: "packages/sdk/tsconfig.json",
    releasedBaselinePath: "architecture/public-api/sdk-growth.json",
    approvedBreakingChanges: [],
  };
  const observer = createGrowthObservation({ consumerRoot: root, workspaceManifestPath: "pnpm-workspace.yaml",
    subjects: [{ packageVersion: manifest.version, policy }] }, {
    workspace: { async read() {
      return { packages: [{ name: packageName, rootPath: policy.packageRoot, manifestPath: policy.manifestPath,
        moduleType: manifest.type, dependencies: [], bundledDependencies: [],
        exportSurface: { explicit: true, entries: [{ subpath: ".", target: manifest.exports["."], availability: "available" }] } }],
      catalogs: [] };
    } },
    typed: createPublicApiExtractor(),
    artifact: { async inspect() {
      return [{ schemaVersion: 1, packageName, packageVersion: manifest.version, status: "release-candidate",
        wildcardExports: [], jsonSchemas: [] }];
    } },
    fingerprint: new NodeChangeFingerprint(),
  });
  const execution = await observer.observe(observationInvocation, cancellation);
  assert.equal(execution.surface.status, "available", JSON.stringify(execution.surface));
  const coverage = execution.surface.value.coverage.find(row => row.packageName === packageName)
    ?.dimensions.find(row => row.dimension === "typed");
  assert.equal(coverage?.status, "limited", `typed growth observation missing: ${JSON.stringify(coverage)}`);
  const compatibility = execution.compatibilitySnapshots.find(row => row.packageName === packageName)?.typed;
  assert.equal(compatibility?.kind, "typed", "typed compatibility observation missing");
  assert.equal(compatibility.snapshot.status, "available", JSON.stringify(compatibility.snapshot));
  const coordinates = execution.surface.value.entries
    .filter(row => row.coordinate.packageName === packageName && row.coordinate.subject.kind === "typed")
    .map(row => row.coordinate);
  const items = compatibility.snapshot.value.entrypoints.flatMap(entry => entry.items);
  return { coordinates, items, entries: execution.surface.value.entries.filter(row => row.coordinate.subject.kind === "typed") };
}

function typedCoordinate(canonicalReference) {
  return { packageName, exportPath: ".", resolutionBranch: [{ condition: "import" }, { condition: "types" }],
    subject: { kind: "typed", canonicalReference } };
}

function interfaceItems(name, member, type) {
  const interfaceReference = `${packageName}!${name}:interface`;
  return [{
    canonicalReference: `${packageName}!${name}#${member}:member`,
    kind: "PropertySignature",
    parentReference: interfaceReference,
    parentKind: "Interface",
    signature: `readonly ${member}: ${type};`,
  }, {
    canonicalReference: interfaceReference,
    kind: "Interface",
    parentReference: `${packageName}!`,
    parentKind: "EntryPoint",
    signature: `export interface ${name}`,
  }];
}

function assertTypedSymbols(observation, expectedItems, label) {
  assert.deepEqual(observation.items, expectedItems, `${label}: exact typed member values`);
  assert.deepEqual(observation.coordinates, expectedItems.map(item => typedCoordinate(item.canonicalReference)),
    `${label}: exact typed growth coordinates`);
  assert.deepEqual(observation.entries.map(entry => entry.value.state), expectedItems.map(() => "present"),
    `${label}: typed coordinates must carry observed values`);
}

function valuesByReference(observation) {
  return new Map(observation.entries.map(entry => [entry.coordinate.subject.canonicalReference, entry.value.digest]));
}

const temporary = await mkdtemp(join(tmpdir(), "gm-sdk-growth-admission-"));
try {
  await symlink(join(workspace, "node_modules"), join(temporary, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  await put(temporary, "package.json", `${JSON.stringify({ name: "sdk-growth-qualification-root", private: true, version: "0.0.0" }, null, 2)}\n`);
  await put(temporary, "pnpm-workspace.yaml", "packages:\n  - packages/*\n");
  await put(temporary, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  await put(temporary, "foundation.config.yaml", `schemaVersion: 1
project:
  id: sdk-growth-qualification
capabilities:
  package.public-api-compatibility:
    configPath: policy.yaml
`);
  await put(temporary, "policy.yaml", `schemaVersion: 2
acceptedDecisionBaselinePath: architecture/decisions/accepted-decisions.json
governanceConfigPath: architecture/foundation/governance-architecture-decisions.yaml
changesetDirectory: .changeset
packages:
  - packageName: "${packageName}"
    packageRoot: packages/sdk
    manifestPath: packages/sdk/package.json
    entrypoints:
      - exportPath: "."
        declarationEntryPoint: packages/sdk/dist/index.d.ts
    nonTypeExports: []
    tsconfigPath: packages/sdk/tsconfig.json
    releasedBaselinePath: architecture/public-api/sdk-growth.json
    approvedBreakingChanges: []
sdkGrowth:
  contractRevision: foundation:sdk-growth:c0:5
  policyVersion: foundation:sdk-growth:policy:1
  comparison:
    trustedBasePath: evidence/base.json
    released:
      - packageName: "${packageName}"
        kind: released
        observationPath: evidence/released.json
  decisionsPath: evidence/decisions.json
  reportPath: reports/sdk.json
`);
  await put(temporary, "architecture/foundation/governance-architecture-decisions.yaml", `schemaVersion: 1
adrRoots:
  - docs/decisions
index:
  path: docs/decisions/README.md
  sections:
    proposed: Proposed decisions
    accepted: Accepted decisions
    superseded: Superseded decisions
acceptedBaselinePath: architecture/decisions/accepted-decisions.json
`);
  await put(temporary, "architecture/decisions/accepted-decisions.json", `${JSON.stringify({ schemaVersion: 1, algorithm: "sha256", decisions: [] }, null, 2)}\n`);
  await put(temporary, "docs/decisions/README.md", "# Decisions\n\n## Proposed decisions\n\n## Accepted decisions\n\n## Superseded decisions\n");
  await put(temporary, ".changeset/config.json", `${JSON.stringify({ $schema: "https://unpkg.com/@changesets/config@3.1.2/schema.json", changelog: false,
    commit: false, fixed: [], linked: [], access: "restricted", baseBranch: "main", updateInternalDependencies: "patch", ignore: [] }, null, 2)}\n`);
  await put(temporary, "packages/sdk/package.json", `${JSON.stringify({ name: packageName, version: "0.2.0", type: "module",
    exports: { ".": { import: { types: "./dist/index.d.ts", default: "./dist/index.js" }, default: "./dist/index.js" } } }, null, 2)}\n`);
  await put(temporary, "packages/sdk/tsconfig.json", `${JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true },
    include: ["dist/index.d.ts"] }, null, 2)}\n`);
  await put(temporary, "packages/sdk/dist/index.js", "export const stable = value => value;\n");
  const stableDeclaration = "export interface Stable { readonly value: string; }\n";
  await put(temporary, "packages/sdk/dist/index.d.ts", stableDeclaration);
  const emptySnapshot = { schemaVersion: 1, packageName, packageVersion: "0.1.0", extractorVersion: "7.58.12",
    entrypoints: [{ exportPath: ".", items: [] }] };
  await put(temporary, "architecture/public-api/sdk-growth.json", `${JSON.stringify(emptySnapshot, null, 2)}\n`);
  await put(temporary, "evidence/released.json", `${JSON.stringify({ typed: emptySnapshot,
    artifact: { ...emptySnapshot, extractorVersion: "package-artifact-inventory/1" } }, null, 2)}\n`);
  await put(temporary, "evidence/decisions.json", "[]\n");
  await mkdir(join(temporary, "reports"), { recursive: true });
  await execute("git", ["init", "--quiet"], { cwd: temporary });
  await commit(temporary, "baseline fixture");

  await runGrowth(temporary);
  const first = await observeTypedSurface(temporary);
  const stableItems = interfaceItems("Stable", "value", "string");
  assertTypedSymbols(first, stableItems, "baseline");

  await put(temporary, "packages/sdk/dist/index.d.ts", "export interface Stable { readonly value: number; }\n");
  await commitPackages(temporary, "change interface member type");
  await runGrowth(temporary);
  const memberChange = await observeTypedSurface(temporary);
  const changedMemberItems = interfaceItems("Stable", "value", "number");
  assertTypedSymbols(memberChange, changedMemberItems, "member change");
  const firstValues = valuesByReference(first), memberChangeValues = valuesByReference(memberChange);
  assert.notEqual(memberChangeValues.get(`${packageName}!Stable#value:member`),
    firstValues.get(`${packageName}!Stable#value:member`), "changed member value must change its observed digest");
  assert.equal(memberChangeValues.get(`${packageName}!Stable:interface`),
    firstValues.get(`${packageName}!Stable:interface`), "unchanged interface value must retain its observed digest");

  await put(temporary, "packages/sdk/dist/index.d.ts", `${stableDeclaration}export interface Added { readonly enabled: boolean; }\n`);
  await commitPackages(temporary, "add API member");
  await runGrowth(temporary);
  const addition = await observeTypedSurface(temporary);
  const addedItems = [...interfaceItems("Added", "enabled", "boolean"), ...stableItems];
  assertTypedSymbols(addition, addedItems, "addition");
  const additionValues = valuesByReference(addition);
  for (const item of stableItems) {
    assert.equal(additionValues.get(item.canonicalReference), firstValues.get(item.canonicalReference),
      `addition must retain ${item.canonicalReference}`);
  }

  await put(temporary, "packages/sdk/dist/index.d.ts", "export interface Replacement { readonly value: string; }\n");
  await commitPackages(temporary, "replace API at the same symbol count");
  await runGrowth(temporary);
  const replacement = await observeTypedSurface(temporary);
  assert.equal(replacement.items.length, first.items.length, "replacement fixture must preserve the typed symbol count");
  assertTypedSymbols(replacement, interfaceItems("Replacement", "value", "string"), "same-count replacement");

  await put(temporary, "packages/sdk/dist/index.d.ts", "export {};\n");
  await commitPackages(temporary, "remove API");
  await runGrowth(temporary);
  const removal = await observeTypedSurface(temporary);
  assertTypedSymbols(removal, [], "removal");

  process.stdout.write(`${JSON.stringify({ status: "passed", subject: "Foundation 1.5.1 v2 admission",
    authority: "unverified", activation: "hold", observedTypedSurfaces: 5, observedTransitions: 4,
    transitionComparison: "unavailable-without-trusted-base" })}\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
