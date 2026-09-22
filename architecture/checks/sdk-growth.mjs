import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import { parse } from "yaml";

const execute = promisify(execFile);
export const PROFILE_PATH = "architecture/sdk-growth/profile.yaml";
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const BASE = "6373d7fc7c43a8c161e4a145ec850041825aa628";
const EF = Object.freeze({
  package: "@agent-teams/engineering-foundation",
  version: "1.5.1",
  integrity: "sha512-29r5QUvMIFdvsPaJ5m0Yx1Uo6bL85J/teP1p1ThNg7jMEz54cVxyrEnsLx/DN5cc/2CAzq2i8iLnPKgZN1cT8A==",
  tarballSha256: "bd0c476d2940168ac1b020f42726107cce81580b7b1b014e74aceabbafa9e951",
  sourceMergeCommit: "1674c4a9459c286f52861dd9beacbb0421a2118b",
  sourceReleaseCommit: "54424334c2e839a8358cdb88945fb45e20714a88",
  requiredCommand: "sdk-growth:check",
});
const SDK_COMMAND = "node architecture/checks/sdk-growth.mjs && node --test tests/sdk-growth.test.mjs && node tests/qualification/sdk-growth-packed-consumers.mjs && node tests/qualification/sdk-growth-registry-consumer.mjs";
const SURFACES = Object.freeze([
  Object.freeze({ packageName: "@get-modular/assembly", packageRoot: "packages/assembly",
    manifestPath: "packages/assembly/package.json", historyPath: "architecture/sdk-growth/evidence/history-assembly.json",
    exports: Object.freeze([Object.freeze({ exportPath: ".", declarationPath: "packages/assembly/dist/index.d.ts", runtimePath: "packages/assembly/dist/index.js" })]) }),
  Object.freeze({ packageName: "@get-modular/core", packageRoot: "packages/core",
    manifestPath: "packages/core/package.json", historyPath: "architecture/sdk-growth/evidence/history-core.json",
    exports: Object.freeze([Object.freeze({ exportPath: ".", declarationPath: "packages/core/dist/index.d.ts", runtimePath: "packages/core/dist/index.js" })]) }),
]);
const COORDINATES = Object.freeze([
  "@get-modular/assembly:.", "@get-modular/core:.", "@get-modular/repository:metadata-root",
]);
const PHASES = Object.freeze([
  "topology", "observation", "packed", "decision", "trusted-base", "released", "authority",
]);

function fail(message) { throw new Error(`SDK_GROWTH_INVALID: ${message}`); }
function same(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} drifted`);
}
function digest(bytes) { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
function exactKeys(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  same(Object.keys(value).toSorted(), [...keys].toSorted(), `${label} keys`);
}
function requireDigest(value, label) { if (!SHA256.test(value)) fail(`${label} must be a SHA-256 digest`); }

async function gitBytes(revision, path) {
  const result = await execute("git", ["show", `${revision}:${path}`], { encoding: "buffer", maxBuffer: 4_000_000 });
  return result.stdout;
}

export async function loadSdkGrowthModel(root = process.cwd()) {
  const get = path => readFile(`${root}/${path}`);
  const profileBytes = await get(PROFILE_PATH);
  const profile = parse(profileBytes.toString("utf8"));
  const recordEntries = await Promise.all(Object.entries(profile.records).map(async ([name, path]) =>
    [name, { path, bytes: await get(path), value: JSON.parse(await get(path)) }]));
  const packageEntries = await Promise.all(profile.packages.map(async surface =>
    [surface.packageName, JSON.parse(await get(surface.manifestPath))]));
  const packageJsonBytes = await get("package.json");
  const lockBytes = await get("pnpm-lock.yaml");
  const workflowBytes = await get("architecture/foundation/repository-agent-workflow.yaml");
  const classificationBytes = await get(profile.metadataRoot.classificationPath);
  const standardBytes = await get(profile.standardReviewPath);
  const tracked = (await execute("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root })).stdout
    .trim().split("\n").filter(Boolean);
  const trackedEntries = await Promise.all(tracked.map(async path => [path, await get(path)]));
  return {
    root, profileBytes, profile, records: Object.fromEntries(recordEntries),
    manifests: Object.fromEntries(packageEntries), packageJsonBytes, packageJson: JSON.parse(packageJsonBytes),
    lockBytes, workflow: parse(workflowBytes.toString("utf8")), classificationBytes,
    classification: JSON.parse(classificationBytes), standardBytes, standard: JSON.parse(standardBytes),
    tracked: Object.fromEntries(trackedEntries),
  };
}

function validateFoundation(model) {
  same(model.profile.foundation, EF, "Foundation identity");
  if (model.packageJson.devDependencies?.[EF.package] !== EF.version) fail("Foundation must be an exact dev dependency");
  if (!model.lockBytes.toString("utf8").includes(`'@agent-teams/engineering-foundation@${EF.version}':`)
    || !model.lockBytes.toString("utf8").includes(EF.integrity)) fail("lockfile lacks exact Foundation registry identity");
  const sdk = model.packageJson.scripts?.[EF.requiredCommand];
  if (sdk !== SDK_COMMAND) fail("required SDK command is missing or a no-op");
  for (const command of ["check", "check:fast"]) {
    if (!model.packageJson.scripts?.[command]?.includes("pnpm sdk-growth:check")) fail(`${command} bypasses SDK activation`);
  }
}

function validateSurfaces(model) {
  same(model.profile.packages, SURFACES, "C0 package surfaces");
  for (const surface of SURFACES) {
    const manifest = model.manifests[surface.packageName];
    if (manifest?.name !== surface.packageName) fail(`${surface.packageName} manifest identity drifted`);
    same(Object.keys(manifest.exports), surface.exports.map(item => item.exportPath), `${surface.packageName} exports`);
    const target = manifest.exports["."];
    same(Object.keys(target), ["import", "default"], `${surface.packageName} root condition order`);
    same(Object.keys(target.import), ["types", "default"], `${surface.packageName} import condition order`);
    if (target?.import?.types !== `./${surface.exports[0].declarationPath.split("/").slice(2).join("/")}`
      || target?.import?.default !== `./${surface.exports[0].runtimePath.split("/").slice(2).join("/")}`
      || target?.default !== `./${surface.exports[0].runtimePath.split("/").slice(2).join("/")}`) {
      fail(`${surface.packageName} ordered root resolution drifted`);
    }
  }
  exactKeys(model.profile.metadataRoot,
    ["packageName", "rootPath", "manifestPath", "classificationPath", "kind"], "metadata root profile");
  same(model.profile.metadataRoot, { packageName: "@get-modular/repository", rootPath: ".", manifestPath: "package.json",
    classificationPath: "architecture/sdk-growth/root-classification.json", kind: "non-release-metadata-root" }, "metadata root");
  same(model.classification, { schemaVersion: "foundation:sdk-growth:metadata-root:1", kind: "non-release-metadata-root",
    packageName: "@get-modular/repository", rootPath: ".", manifestPath: "package.json",
    decisionId: "GM-G1-ROOT-CLASSIFICATION", ownerRef: "get-modular/architecture", releaseHistory: "none" }, "metadata classification");
}

async function validateStandard(model) {
  const review = model.standard;
  const path = "docs/architecture/common-assembly.md";
  const pinned = await gitBytes(review.pinned.commit, path);
  const current = await gitBytes(review.acceptedCurrent.commit, path);
  if (digest(pinned) !== `sha256:${review.pinned.sha256}`.replace("sha256:sha256:", "sha256:")) fail("pinned standard bytes drifted");
  if (digest(current) !== `sha256:${review.acceptedCurrent.sha256}`.replace("sha256:sha256:", "sha256:")) fail("current standard bytes drifted");
  if (digest(await readFile(`${model.root}/${path}`)) !== `sha256:${review.acceptedCurrent.sha256}`.replace("sha256:sha256:", "sha256:")) fail("working standard is not the accepted current bytes");
  same(review.delta, { classification: "reciprocal-consumer-evidence-only", changedHunks: 1, removedLines: 6, addedLines: 11,
    semanticChanges: ["Record accepted Agent Runtime PR 168 passive setup and ordinary-session composition.",
      "Retain the exact 669a750d Consumer Module Standard pin in that consumer.",
      "Keep contained-turn and dynamic plugin runtime scope outside admission."],
    changesGetModularCompositionContract: false, pinAction: "retain-reviewed-pin" }, "standard delta");
}

function validateEvidence(model) {
  const value = name => model.records[name].value;
  const bytesDigest = name => digest(model.records[name].bytes);
  const grant = value("grant"), completion = value("completion"), receipt = value("receipt"), report = value("report"), activation = value("activation");
  if (grant.authority?.boundary !== "@agent-teams/engineering-foundation/sdk-growth-authority"
    || grant.authority?.candidateControlled !== false) fail("authority must be external and candidate-independent");
  same(grant.authorizedCoordinates, COORDINATES, "grant coordinates");
  same(grant.requiredPhases, PHASES, "grant phases");
  if (grant.target.baseCommit !== BASE || grant.target.profileDigest !== digest(model.profileBytes)) fail("grant target drifted");
  if (grant.trustedBaseDigest !== bytesDigest("trustedBase") || grant.decisionsDigest !== bytesDigest("decisions")
    || grant.classificationDigest !== digest(model.classificationBytes) || grant.standardReviewDigest !== digest(model.standardBytes)) fail("grant evidence drifted");
  for (const surface of SURFACES) {
    const name = surface.packageName.endsWith("core") ? "history-core" : "history-assembly";
    if (grant.historyDigests[surface.packageName] !== digest(model.tracked[surface.historyPath])) fail(`${surface.packageName} history drifted`);
    const history = JSON.parse(model.tracked[surface.historyPath]);
    if (history.kind !== "initial-unreleased-history" || history.packageName !== surface.packageName) fail(`${name} is not exact initial history`);
  }
  if (completion.grantDigest !== bytesDigest("grant") || completion.status !== "complete") fail("completion does not bind grant");
  if (receipt.grantDigest !== bytesDigest("grant") || receipt.completionDigest !== bytesDigest("completion")
    || receipt.qualification !== "qualified" || receipt.verdict !== "admitted") fail("receipt is not qualified");
  if (report.grantDigest !== bytesDigest("grant") || report.completionDigest !== bytesDigest("completion")
    || report.receiptDigest !== bytesDigest("receipt") || report.activation !== "active") fail("report chain drifted");
  same(report.surfaces, COORDINATES, "reported surfaces");
  same(report.phases, PHASES.map(name => ({ name, status: "complete" })), "reported phases");
  if (activation.status !== "active" || activation.baseCommit !== BASE || activation.profileDigest !== digest(model.profileBytes)
    || activation.reportDigest !== bytesDigest("report") || activation.receiptDigest !== bytesDigest("receipt")) fail("activation record drifted");
  same(activation.foundation, { package: EF.package, version: EF.version, integrity: EF.integrity,
    tarballSha256: EF.tarballSha256, sourceMergeCommit: EF.sourceMergeCommit, sourceReleaseCommit: EF.sourceReleaseCommit }, "activation Foundation identity");
  if (activation.compositionChange || activation.ownershipSurfaceAdded || activation.lifecycleBehaviorAdded || activation.dynamicPluginsAdded) fail("G1 scope expanded");
}

function validateRouting(model) {
  const required = ["architecture/checks/sdk-growth.mjs", "architecture/sdk-growth",
    "tests/sdk-growth.test.mjs", "tests/qualification/sdk-growth-packed-consumers.mjs",
    "tests/qualification/sdk-growth-registry-consumer.mjs"];
  for (const path of required) if (!model.workflow.fullScanPaths?.includes(path)) fail(`changed-file routing omits ${path}`);
}

function validateScans(model) {
  const localDependencyPattern = new RegExp(`["']${["file", ":"].join("")}`, "u");
  for (const [path, bytes] of Object.entries(model.tracked)) {
    const text = bytes.toString("utf8");
    if ((path === "pnpm-lock.yaml" || path.endsWith("/package.json") || path === "package.json")
      && localDependencyPattern.test(text)) fail(`tracked local dependency in ${path}`);
    if ((path.startsWith("packages/core/src/") || path.startsWith("packages/assembly/src/"))
      && text.includes("@agent-teams/engineering-foundation")) fail(`production Foundation import in ${path}`);
  }
  if (Object.keys(model.tracked).some(path => path.startsWith("packages/ownership/"))) fail("ownership package surface was added");
}

export async function validateSdkGrowth(model) {
  if (model.profile.schemaVersion !== 1 || model.profile.contractRevision !== "foundation:sdk-growth:c0:5"
    || model.profile.policyVersion !== "foundation:sdk-growth:policy:1" || model.profile.baseCommit !== BASE) fail("profile identity drifted");
  validateFoundation(model);
  validateSurfaces(model);
  await validateStandard(model);
  validateEvidence(model);
  validateRouting(model);
  validateScans(model);
  return { packages: SURFACES.length, exports: SURFACES.reduce((count, item) => count + item.exports.length, 0),
    metadataRoots: 1, phases: PHASES.length, activation: "active" };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await validateSdkGrowth(await loadSdkGrowthModel());
  process.stdout.write(`${JSON.stringify({ status: "passed", ...result })}\n`);
}
