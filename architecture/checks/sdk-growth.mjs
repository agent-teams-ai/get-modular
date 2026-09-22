import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { parse } from "yaml";

const execute = promisify(execFile);
const require = createRequire(import.meta.url);

export const PROFILE_PATH = "architecture/sdk-growth/profile.yaml";
const STATUS_PATH = "architecture/sdk-growth/status.json";
const QUALIFICATION_POLICY_PATH = "architecture/sdk-growth/qualification-policy.yaml";
const PUBLIC_API_POLICY_PATH = "architecture/foundation/public-api-compatibility.yaml";
const FOUNDATION_CONFIG_PATH = "foundation.config.yaml";
const WORKFLOW_PATH = "architecture/foundation/repository-agent-workflow.yaml";
const SDK_COMMAND = "node architecture/checks/sdk-growth.mjs && node --test tests/sdk-growth.test.mjs && node tests/qualification/sdk-growth-admission.mjs && node tests/qualification/sdk-growth-packed-consumers.mjs && node tests/qualification/sdk-growth-registry-consumer.mjs";
const OBSOLETE_ACTIVE_RECORDS = Object.freeze([
  "architecture/sdk-growth/activation.json",
  "architecture/sdk-growth/evidence/completion.json",
  "architecture/sdk-growth/evidence/decisions.json",
  "architecture/sdk-growth/evidence/grant.json",
  "architecture/sdk-growth/evidence/receipt.json",
  "architecture/sdk-growth/evidence/report.json",
  "architecture/sdk-growth/evidence/trusted-base.json",
]);
const FOUNDATION = Object.freeze({
  package: "@agent-teams/engineering-foundation",
  version: "1.5.1",
  integrity: "sha512-29r5QUvMIFdvsPaJ5m0Yx1Uo6bL85J/teP1p1ThNg7jMEz54cVxyrEnsLx/DN5cc/2CAzq2i8iLnPKgZN1cT8A==",
  tarballSha256: "bd0c476d2940168ac1b020f42726107cce81580b7b1b014e74aceabbafa9e951",
  sourceMergeCommit: "1674c4a9459c286f52861dd9beacbb0421a2118b",
  sourceReleaseCommit: "54424334c2e839a8358cdb88945fb45e20714a88",
});
const PACKAGES = Object.freeze([
  Object.freeze({ packageName: "@get-modular/assembly", packageRoot: "packages/assembly",
    manifestPath: "packages/assembly/package.json", historyPath: "architecture/sdk-growth/evidence/history-assembly.json",
    releasedBaselinePath: "architecture/public-api/assembly.json", exportPath: ".",
    declarationEntryPoint: "packages/assembly/dist/index.d.ts", runtimeEntryPoint: "packages/assembly/dist/index.js" }),
  Object.freeze({ packageName: "@get-modular/core", packageRoot: "packages/core",
    manifestPath: "packages/core/package.json", historyPath: "architecture/sdk-growth/evidence/history-core.json",
    releasedBaselinePath: "architecture/public-api/core.json", exportPath: ".",
    declarationEntryPoint: "packages/core/dist/index.d.ts", runtimeEntryPoint: "packages/core/dist/index.js" }),
]);
const RELEASES = Object.freeze({
  "@get-modular/assembly": Object.freeze({ version: "0.1.0",
    tarball: "https://registry.npmjs.org/@get-modular/assembly/-/assembly-0.1.0.tgz",
    integrity: "sha512-wxK49abnnAWLkCuI8EwL8cJENP2IfDmEm29UHi0w5t0/BL/c2IdTNbOTvQDo/8+hl0ZCJZtwqIqPZ3AnxJ7WNQ==",
    shasum: "d5c0dced8ef754b265276fabbfebe7600e4fa0c5", sha256: "e89207171e44afd5e813aa5e7a0db8abc999b42338559d38b44b4db71da228ab",
    publishedAt: "2026-09-08T00:05:03.721Z" }),
  "@get-modular/core": Object.freeze({ version: "0.1.0",
    tarball: "https://registry.npmjs.org/@get-modular/core/-/core-0.1.0.tgz",
    integrity: "sha512-0aqzW7sbh7O8aAPBGJIPZBbhgeYnk+HuZdVf27dimkQ3d/zb9zpsYIMdLGt3EXi1B8MaBjw09ApzLaiIRiAgIQ==",
    shasum: "df2387f1944afea722cd4244e76a4ac30a4cdd39", sha256: "50803ea69e2fb4078013a897f858908b4d73d26296336ab155a6118809dfb8ba",
    publishedAt: "2026-09-07T18:22:35.862Z" }),
});

function fail(message) { throw new Error(`SDK_GROWTH_PENDING_INVALID: ${message}`); }
function same(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} drifted`);
}

async function readYaml(root, path) { return parse(await readFile(join(root, path), "utf8")); }
async function readJson(root, path) { return JSON.parse(await readFile(join(root, path), "utf8")); }

export async function loadSdkGrowthModel(root = process.cwd()) {
  const listed = (await execute("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root })).stdout
    .trim().split("\n").filter(Boolean);
  const tracked = [];
  for (const path of listed) {
    try { await access(join(root, path)); tracked.push(path); } catch {}
  }
  const profile = await readYaml(root, PROFILE_PATH);
  return {
    root,
    profile,
    status: await readJson(root, STATUS_PATH),
    qualificationPolicy: await readYaml(root, QUALIFICATION_POLICY_PATH),
    publicApiPolicy: await readYaml(root, PUBLIC_API_POLICY_PATH),
    foundationConfig: await readYaml(root, FOUNDATION_CONFIG_PATH),
    workflow: await readYaml(root, WORKFLOW_PATH),
    packageJson: await readJson(root, "package.json"),
    lockText: await readFile(join(root, "pnpm-lock.yaml"), "utf8"),
    manifests: Object.fromEntries(await Promise.all(PACKAGES.map(async pkg => [pkg.packageName, await readJson(root, pkg.manifestPath)]))),
    baselines: Object.fromEntries(await Promise.all(PACKAGES.map(async pkg => [pkg.packageName, await readJson(root, pkg.releasedBaselinePath)]))),
    histories: Object.fromEntries(await Promise.all(PACKAGES.map(async pkg => [pkg.packageName, await readJson(root, pkg.historyPath)]))),
    tracked,
  };
}

async function validateInstalledFoundation(model) {
  same(model.profile.foundation, FOUNDATION, "Foundation identity");
  if (model.packageJson.devDependencies?.[FOUNDATION.package] !== FOUNDATION.version) fail("Foundation must be an exact dev dependency");
  if (!model.lockText.includes(`'${FOUNDATION.package}@${FOUNDATION.version}':`) || !model.lockText.includes(FOUNDATION.integrity)) {
    fail("lockfile lacks exact Foundation registry identity");
  }
  const manifestPath = require.resolve(`${FOUNDATION.package}/package.json`);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.version !== FOUNDATION.version || manifest.exports?.["./sdk-growth-authority"] === undefined) {
    fail("installed Foundation SDK authority export drifted");
  }
  const sdkTarget = manifest.exports["./sdk-growth-authority"].import;
  const sdk = await import(pathToFileURL(join(dirname(manifestPath), sdkTarget)));
  if (typeof sdk.createSdkGrowthAuthorityVerifier !== "function") fail("installed Foundation SDK verifier is unavailable");
}

function validatePendingState(model) {
  same(model.status, {
    schemaVersion: 1,
    kind: "get-modular-g1-sdk-adoption-status",
    status: "pending",
    activation: "hold",
    qualified: false,
    activeCompatibilityGate: "package.public-api-compatibility/v1",
    growthQualification: "package.public-api-compatibility/v2",
    authorityProtocol: "reviewrouter:sdk-growth-authority:3",
    blockers: [
      "trusted-external-authority-transport-unavailable",
      "trusted-pr-base-and-exact-candidate-binding-unavailable",
      "authenticated-released-artifact-source-binding-unavailable",
      "released-growth-observations-and-custody-receipts-unavailable",
    ],
    claims: { activation: false, authority: false, qualification: false, releaseEligible: false },
  }, "pending status");
  for (const path of OBSOLETE_ACTIVE_RECORDS) if (model.tracked.includes(path)) fail(`obsolete self-authored active evidence remains: ${path}`);
}

function validateProfiles(model) {
  if (model.profile.schemaVersion !== 1 || model.profile.status !== "pending" || model.profile.activation !== "hold"
    || model.profile.qualificationPolicyPath !== QUALIFICATION_POLICY_PATH || model.profile.statusPath !== STATUS_PATH) {
    fail("pending profile identity drifted");
  }
  if (model.foundationConfig.capabilities?.["package.public-api-compatibility"]?.configPath !== PUBLIC_API_POLICY_PATH
    || model.publicApiPolicy.schemaVersion !== 1) fail("v1 compatibility retention drifted");
  if (model.qualificationPolicy.schemaVersion !== 2
    || model.qualificationPolicy.sdkGrowth?.contractRevision !== "foundation:sdk-growth:c0:5"
    || model.qualificationPolicy.sdkGrowth?.policyVersion !== "foundation:sdk-growth:policy:1") fail("v2 qualification policy drifted");
  const activeNames = model.publicApiPolicy.packages.map(row => row.packageName).toSorted();
  const qualifiedNames = model.qualificationPolicy.packages.map(row => row.packageName).toSorted();
  same(activeNames, PACKAGES.map(row => row.packageName).toSorted(), "v1 package scope");
  same(qualifiedNames, activeNames, "v2 package scope");
  same(model.profile.packages, PACKAGES.map(pkg => ({
    packageName: pkg.packageName,
    packageRoot: pkg.packageRoot,
    manifestPath: pkg.manifestPath,
    historyPath: pkg.historyPath,
    releasedBaselinePath: pkg.releasedBaselinePath,
    exports: [{ exportPath: pkg.exportPath, declarationPath: pkg.declarationEntryPoint,
      runtimePath: pkg.runtimeEntryPoint }],
  })), "packed profile package/export scope");
  const released = model.qualificationPolicy.sdkGrowth.comparison.released;
  same(released.map(row => ({ packageName: row.packageName, kind: row.kind })), PACKAGES.map(row => ({ packageName: row.packageName, kind: "released" })).toSorted((a, b) => a.packageName.localeCompare(b.packageName)), "published release classification");
  if (released.some(row => row.kind === "initial-unreleased")) fail("published package classified as initial-unreleased");
}

function validatePackages(model) {
  for (const pkg of PACKAGES) {
    const manifest = model.manifests[pkg.packageName];
    const active = model.publicApiPolicy.packages.find(row => row.packageName === pkg.packageName);
    const qualified = model.qualificationPolicy.packages.find(row => row.packageName === pkg.packageName);
    if (manifest.name !== pkg.packageName || !Object.hasOwn(manifest.exports, pkg.exportPath)) fail(`${pkg.packageName} manifest scope drifted`);
    for (const policy of [active, qualified]) {
      if (policy?.packageRoot !== pkg.packageRoot || policy?.manifestPath !== pkg.manifestPath
        || policy?.releasedBaselinePath !== pkg.releasedBaselinePath
        || JSON.stringify(policy.entrypoints) !== JSON.stringify([{ exportPath: pkg.exportPath, declarationEntryPoint: pkg.declarationEntryPoint }])) {
        fail(`${pkg.packageName} policy scope drifted`);
      }
    }
    const baseline = model.baselines[pkg.packageName];
    if (baseline.packageName !== pkg.packageName || baseline.packageVersion !== "0.2.0") fail(`${pkg.packageName} retained v1 baseline drifted`);
    const history = model.histories[pkg.packageName];
    if (history.kind !== "published-release-history" || history.packageName !== pkg.packageName || history.classification !== "released") {
      fail(`${pkg.packageName} release history classification drifted`);
    }
    same(history.published, RELEASES[pkg.packageName], `${pkg.packageName} published artifact`);
    if (history.sourceBinding.status !== "unavailable" || history.growthObservation.status !== "unavailable") {
      fail(`${pkg.packageName} unverified release evidence was promoted`);
    }
  }
}

function validateWiring(model) {
  if (model.packageJson.scripts?.["sdk-growth:check"] !== SDK_COMMAND) fail("pending SDK command is missing or a no-op");
  for (const command of ["check", "check:fast"]) if (!model.packageJson.scripts?.[command]?.includes("pnpm sdk-growth:check")) fail(`${command} bypasses pending SDK guard`);
  const required = ["architecture/checks/sdk-growth.mjs", "architecture/sdk-growth", "tests/sdk-growth.test.mjs",
    "tests/qualification/sdk-growth-admission.mjs", "tests/qualification/sdk-growth-packed-consumers.mjs",
    "tests/qualification/sdk-growth-registry-consumer.mjs"];
  for (const path of required) if (!model.workflow.fullScanPaths?.includes(path)) fail(`changed-file routing omits ${path}`);
}

function validateScope(model) {
  for (const path of model.tracked) if (path.startsWith("packages/ownership/")) fail("ownership package surface was added");
}

export async function validateSdkGrowth(model) {
  await validateInstalledFoundation(model);
  validatePendingState(model);
  validateProfiles(model);
  validatePackages(model);
  validateWiring(model);
  validateScope(model);
  return { packages: PACKAGES.length, releasedPackages: PACKAGES.length, compatibility: "v1-retained",
    growthQualification: "v2", activation: "pending", status: "hold" };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await validateSdkGrowth(await loadSdkGrowthModel());
  process.stdout.write(`${JSON.stringify({ result: "passed", ...result })}\n`);
}
