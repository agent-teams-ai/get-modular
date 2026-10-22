import { assertCompilerFloor } from "./compiler-floor.ts";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
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
const CMS_PATH = "architecture/sdk-growth/evidence/consumer-module-standard.json";
const FEASIBILITY_PATH = "architecture/sdk-growth/evidence/p0-feasibility.json";
const ROOT_CLASSIFICATION_PATH = "architecture/sdk-growth/root-classification.json";
const CMS_SHA256 = "d39806eef8e001bb1290e7d7787297ba446ae900dd1e9e217604a99ffa0350ec";
const PREVIOUS_CMS = Object.freeze({
  "commit": "a7d8db433fb3c4187fbeab4dcec4e6d69a4f70ca",
  "gitBlob": "1da86de15c6def505aa57e212154e4d5ee5d6042",
  "sha256": "8f92029eec9610f6f83afe6f86352557f268b1abd8e2a241f16d86f5f0eaada9"
});
const P0_CMS = Object.freeze({
  commit: "24d6557a1b04b01a3a73c64b1d9a9afd83d89c8f",
  gitBlob: "63540f7b0420134ba685002d01770da2f213c65a",
  sha256: "33b41d5babf0a431c97e8e596a56e6ec1557ba1a0b26d39bf23e13d9a19e1fbd",
});
const CMS_EVIDENCE = Object.freeze({
  "currentDocumentPath": "architecture/sdk-growth/evidence/cms-guidance-drain-bun-20261022/common-assembly.txt",
  "previousDocumentPath": "architecture/sdk-growth/evidence/cms-guidance-bun-20261020/common-assembly.txt",
  "p0DocumentPath": "architecture/sdk-growth/evidence/cms-guidance-20261020/previous-common-assembly.txt",
  "deltaPath": "architecture/sdk-growth/evidence/cms-guidance-drain-bun-20261022/common-assembly.diff",
  "deltaSha256": "bac7e8717a12fe59c8947c6069a27434d7bb1783ee7f70c3fbb11e9c2329e36d",
  "previousReviewPath": "architecture/sdk-growth/evidence/cms-guidance-drain-bun-20261022/previous-review.json",
  "previousReviewSha256": "4fcb40247d8ddc525b79592e8ed39e42e9466bae63f2f97df6eb070c7b7c75e3",
  "growthPreviousDocumentPath": "architecture/sdk-growth/evidence/cms-guidance-drain-bun-20261022/growth-previous-common-assembly.txt",
  "growthDeltaPath": "architecture/sdk-growth/evidence/cms-guidance-drain-bun-20261022/growth-common-assembly.diff",
  "growthDeltaSha256": "fab73eb3c3d0ae3807e518fc03b5fbb70baebca6d60e93764a1ebc7ded4d10b0",
  "growthPreviousReviewPath": "architecture/sdk-growth/evidence/cms-guidance-drain-bun-20261022/growth-previous-source.ts.txt",
  "growthPreviousReviewSha256": "511ef4cb1875f3b6cde8504a32a77e5031df3653979807f9a5212b4ee543f3d0"
});
const CMS_300E = Object.freeze({
  "commit": "300e7e1c459c08f5e271627e4ca7d2486bdf5e1f",
  "gitBlob": "ae6792543bd19acc948e177e8d55632c9d51134e",
  "sha256": "c2fe582a14ff6e79620b232ca7ffc914afb0474ec21fd43f208251dd7252f4a3"
});
const PREVIOUS_BUN_EVIDENCE = Object.freeze({
  documentPath: "architecture/sdk-growth/evidence/cms-guidance-20261020/common-assembly.txt",
  deltaPath: "architecture/sdk-growth/evidence/cms-guidance-bun-20261020/common-assembly.diff",
  deltaSha256: "1bcf57cb7310df87db515147f23e06a303c3ba6306afa455d8bd97b0210c6064",
  reviewPath: "architecture/sdk-growth/evidence/cms-guidance-bun-20261020/previous-review.json",
  reviewSha256: "c4ecc5751ba0bce47b9d99767df15d66ba61cfa12314ddda211454d75ee9c989",
});
const GROWTH_CMS_SCOPE_REVIEW = Object.freeze({
  "previousCurrent": {
    "commit": "7131d0d7a6bb5dd4c3e8906ccac065c0be0e0333",
    "gitBlob": "dad8b6280cf999d9079d3106094e5626b63d83f4",
    "sha256": "a6dac5d303adf80be3151c6703c919b715fd880a941a4ad68e927c87a7ee5882"
  },
  "classification": "repository-verification-command-guidance",
  "changesSelectedFlatCompositionContract": false,
  "observation": "not-selected",
  "productionAdoption": "unchanged",
  "qualification": "pending-current-subject"
});
const HISTORICAL_CMS_DELTA = Object.freeze({
  path: "architecture/sdk-growth/evidence/cms-guidance-20261020/common-assembly.diff",
  sha256: "3cc0eac2e324e1b8298370ae0649b3b39c30f285ea8b16b66f6bf0ac6e6b555f",
});
const P0_CMS_REVIEW = Object.freeze({
  path: "architecture/sdk-growth/evidence/cms-guidance-20261020/previous-review.json",
  sha256: "c7b6aae11a8be3ec39479ca3136d195780cbb2cd4b62a5baed8ac9d51cff3e0e",
});
const CMS_SCOPE_REVIEW = Object.freeze({
  "scope": "sdk-growth-development-tooling",
  "classification": "fixed-development-tooling",
  "assemblyRuntime": "not-used",
  "guidanceReview": "complete",
  "qualification": "pending",
  "activation": "hold",
  "outstanding": [
    "trusted-external-authority-transport-unavailable",
    "trusted-pr-base-and-exact-candidate-binding-unavailable",
    "authenticated-released-artifact-source-binding-unavailable",
    "released-growth-observations-and-custody-receipts-unavailable"
  ]
});
const SDK_COMMAND = "node architecture/checks/compiler-floor.ts && node architecture/tooling/runtime/command.ts run sdk-growth:typecheck && node architecture/checks/sdk-growth.mjs && node --test tests/sdk-growth.test.mjs && node tests/qualification/sdk-growth-admission.mjs && node tests/qualification/sdk-growth-packed-consumers.mjs && node tests/qualification/sdk-growth-registry-consumer.ts";
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
  version: "2.1.1",
  integrity: "sha512-NvjLwYgUILVpOHrvJwJLjG/5/vQcIPQwtDxNnUjna+Fdys5qJeZnw2IBgLlFi0sEYZ0DoZgondIBUAxiCkd9pQ==",
});
const RETAINED_FOUNDATION = Object.freeze({
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
  const cmsReview = await readJson(root, CMS_PATH);
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
    cmsReview,
    // Current guidance and frozen P0 inputs have independent identities.
    cmsBytes: await readFile(join(root, CMS_EVIDENCE.currentDocumentPath)),
    cmsPreviousBytes: await readFile(join(root, CMS_EVIDENCE.previousDocumentPath)),
    cmsP0Bytes: await readFile(join(root, CMS_EVIDENCE.p0DocumentPath)),
    cmsSourceBytes: await readFile(join(root, "docs/architecture/common-assembly.md")),
    cmsDeltaBytes: await readFile(join(root, CMS_EVIDENCE.deltaPath)),
    cmsPreviousReviewBytes: await readFile(join(root, CMS_EVIDENCE.previousReviewPath)),
    cmsHistoricalDeltaBytes: await readFile(join(root, HISTORICAL_CMS_DELTA.path)),
    cmsP0ReviewBytes: await readFile(join(root, P0_CMS_REVIEW.path)),
    cms300eBytes: await readFile(join(root, PREVIOUS_BUN_EVIDENCE.documentPath)),
    cmsBunDeltaBytes: await readFile(join(root, PREVIOUS_BUN_EVIDENCE.deltaPath)),
    cmsBunReviewBytes: await readFile(join(root, PREVIOUS_BUN_EVIDENCE.reviewPath)),
    cmsGrowthPreviousBytes: await readFile(join(root, CMS_EVIDENCE.growthPreviousDocumentPath)),
    cmsGrowthDeltaBytes: await readFile(join(root, CMS_EVIDENCE.growthDeltaPath)),
    cmsGrowthReviewBytes: await readFile(join(root, CMS_EVIDENCE.growthPreviousReviewPath)),
    feasibility: await readJson(root, FEASIBILITY_PATH),
    rootClassification: await readJson(root, ROOT_CLASSIFICATION_PATH),
    tracked,
  };
}

async function validateInstalledFoundation(model) {
  same(model.profile.foundation, FOUNDATION, "Foundation identity");
  same(model.profile.retainedFoundation, RETAINED_FOUNDATION, "retained Foundation evidence identity");
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
  assertCompilerFloor();
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
    if (baseline.packageName !== pkg.packageName || baseline.packageVersion !== manifest.version) fail(`${pkg.packageName} retained v1 baseline drifted`);
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

export function validateCmsGuidance(model) {
  const cms = model.cmsReview;
  same(cms.pinned, {
    commit: "669a750d8db451e04f075cdeb36576c6606fba6e",
    gitBlob: "7bf511f88d4f3547b107cad9ec85d54b009ed033",
    sha256: "e6cd8d26b4317bf5f94ddd22f6e36bf25e90548f72265d94808eaf20b947e553",
  }, "original CMS pin");
  same(cms.acceptedCurrent, {
    commit: "0c2ea846f11532b216520e0e84e19ea1abf58342",
    gitBlob: "4bd50920f9b81d9f41456ceb3df9500b497e0453",
    sha256: CMS_SHA256,
  }, "current CMS pin");
  same(cms.delta.fromAcceptedCurrent, PREVIOUS_CMS, "previous CMS pin");
  if (cms.delta.classification !== "observation-load-drain-lifecycle-guidance" || cms.delta.changedHunks !== 1
    || cms.delta.addedLines !== 7 || cms.delta.removedLines !== 0
    || cms.delta.changesGetModularCompositionContract !== true
    || cms.delta.pinAction !== "advance-reviewed-current-pin-with-historical-pin-retained") fail("CMS delta review drifted");
  same(cms.retainedEvidence, CMS_EVIDENCE, "CMS retained evidence identity");
  same(cms.scopeReview, CMS_SCOPE_REVIEW, "CMS scope review");
  same(cms.growthScopeReview, GROWTH_CMS_SCOPE_REVIEW, "growth CMS scope review");
  for (const [bytes, pin, label] of [
    [model.cmsBytes, cms.acceptedCurrent, "CMS document bytes"],
    [model.cmsPreviousBytes, PREVIOUS_CMS, "previous CMS document bytes"],
    [model.cmsP0Bytes, P0_CMS, "historical P0 CMS document bytes"],
    [model.cms300eBytes, CMS_300E, "historical 300e CMS document bytes"],
    [model.cmsGrowthPreviousBytes, GROWTH_CMS_SCOPE_REVIEW.previousCurrent, "growth previous CMS document bytes"],
    [model.cmsSourceBytes, cms.acceptedCurrent, "current source CMS document bytes"],
  ]) {
    if (createHash("sha256").update(bytes).digest("hex") !== pin.sha256
      || createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") !== pin.gitBlob) fail(`${label} drifted`);
  }
  if (createHash("sha256").update(model.cmsDeltaBytes).digest("hex") !== CMS_EVIDENCE.deltaSha256
    || createHash("sha256").update(model.cmsPreviousReviewBytes).digest("hex") !== CMS_EVIDENCE.previousReviewSha256) {
    fail("CMS retained delta or previous review bytes drifted");
  }
  if (createHash("sha256").update(model.cmsHistoricalDeltaBytes).digest("hex") !== HISTORICAL_CMS_DELTA.sha256
    || createHash("sha256").update(model.cmsP0ReviewBytes).digest("hex") !== P0_CMS_REVIEW.sha256) {
    fail("CMS historical delta or P0 review bytes drifted");
  }
  if (createHash("sha256").update(model.cmsBunDeltaBytes).digest("hex") !== PREVIOUS_BUN_EVIDENCE.deltaSha256
    || createHash("sha256").update(model.cmsBunReviewBytes).digest("hex") !== PREVIOUS_BUN_EVIDENCE.reviewSha256
    || createHash("sha256").update(model.cmsGrowthDeltaBytes).digest("hex") !== CMS_EVIDENCE.growthDeltaSha256
    || createHash("sha256").update(model.cmsGrowthReviewBytes).digest("hex") !== CMS_EVIDENCE.growthPreviousReviewSha256) {
    fail("CMS Bun or growth historical evidence bytes drifted");
  }
  const evidence = model.feasibility;
  if (evidence.schemaVersion !== 1 || evidence.kind !== "g1-p0-feasibility-not-qualification"
    || evidence.sourceCommit !== P0_CMS.commit || evidence.disposition !== "hold"
    || evidence.standard?.currentSha256 !== P0_CMS.sha256 || evidence.standard?.reviewPath !== CMS_PATH) fail("P0 disposition or standard drifted");
}

function validateP0Evidence(model) {
  validateCmsGuidance(model);
  const evidence = model.feasibility;
  if (evidence.foundation?.installedPublishedVersion !== RETAINED_FOUNDATION.version
    || evidence.foundation?.semanticC0Revision !== 6
    || evidence.foundation?.frozenConsumerPolicyLiteral !== "foundation:sdk-growth:c0:5"
    || evidence.foundation?.currentSourcePublication !== "unverified"
    || evidence.foundation?.pinAction !== "retain-1.5.1-until-published-v3-archive-verified"
    || evidence.foundation?.authorityProtocol !== model.status.authorityProtocol) fail("P0 EF contract drifted");
  if (model.profile.contractRevision !== evidence.foundation.frozenConsumerPolicyLiteral) fail("P0 frozen policy literal drifted");
  same(evidence.identityMatrix.map(row => row.identity), [
    "registry-transport-archive", "canonical-archive-inventory", "trusted-source-binding", "installed-observation",
  ], "P0 distinct proof identities");
  if (evidence.identityMatrix.some(row => !row.owner || !row.proof || !row.notEquivalentTo)
    || evidence.ownerDecisionRequired?.length !== 4) fail("P0 proof limits or owner decisions missing");
  same(evidence.releases.map(row => ({ packageName: row.packageName, version: row.version,
    historyPath: row.historyPath, transportSha256: row.transportSha256 })).toSorted((a, b) => a.packageName.localeCompare(b.packageName)),
  PACKAGES.map(pkg => ({ packageName: pkg.packageName, version: RELEASES[pkg.packageName].version,
    historyPath: pkg.historyPath, transportSha256: RELEASES[pkg.packageName].sha256 })).toSorted((a, b) => a.packageName.localeCompare(b.packageName)), "P0 release identities");
  const core = evidence.releases.find(row => row.packageName === "@get-modular/core");
  const assembly = evidence.releases.find(row => row.packageName === "@get-modular/assembly");
  if (core.sourceLead?.kind !== "actions-build-artifact" || core.sourceLead?.runId !== 34140432571
    || core.sourceLead?.sourceCommit !== "bbc5053c2f2f96e7c524bd65c42288fc88cd7358"
    || core.sourceLead?.artifactId !== 10025685624 || core.sourceLead?.zipSha256 !== "28bd843ea264dace196ba992504549585eb558145e3d9ef529a722014012d4f8"
    || core.sourceLead?.containedFile !== "core.tgz" || core.sourceLead?.containedBytes !== 48013
    || core.sourceLead?.containedSha256 !== core.transportSha256
    || core.sourceLead?.diagnosticsArtifactId !== 10025686345 || core.sourceLead?.collectorArtifactId !== 10025871778
    || core.sourceLead?.collectorClaim !== "not-claimed" || core.sourceLead?.buildArtifactExpires !== "2026-12-06") fail("Core recovery lead drifted");
  if (assembly.sourceLead?.kind !== "plausible-pr-without-retained-artifact" || assembly.sourceLead?.prNumber !== 99
    || assembly.sourceLead?.candidateCommit !== "a05f2cb51553e1efc5ba89be352e4aba04675088"
    || assembly.sourceLead?.ciRunId !== 34169464634 || assembly.sourceLead?.retainedArtifactCount !== 0) fail("Assembly recovery lead drifted");
  for (const row of evidence.releases) {
    const history = model.histories[row.packageName];
    if (row.registryGitHead !== "absent" || row.registryAttestation !== "absent" || row.publisherCustody !== "unavailable"
      || row.sourceBinding !== "unavailable" || row.growthObservation !== "unavailable"
      || history.sourceBinding.status !== row.sourceBinding || history.growthObservation.status !== row.growthObservation) {
      fail(`${row.packageName} P0 cannot promote release evidence`);
    }
  }
  same(evidence.scope.releasedPackageRoots, PACKAGES.map(pkg => pkg.packageRoot), "P0 released roots");
  if (evidence.scope.metadataRoot !== ROOT_CLASSIFICATION_PATH || evidence.scope.metadataRootPath !== model.rootClassification.rootPath
    || model.rootClassification.kind !== "non-release-metadata-root" || model.rootClassification.releaseHistory !== "none"
    || evidence.scope.lifecycleRoot !== "packages/lifecycle-kernel" || evidence.scope.lifecycleClassification !== "private-candidate-pending-separate-admission"
    || evidence.scope.productionHostRoot !== "none-in-this-repository") fail("P0 root classification drifted");
  if (evidence.checks.pendingGate !== "pnpm sdk-growth:check" || evidence.checks.currentCompatibility !== model.status.activeCompatibilityGate
    || evidence.checks.futureGrowthQualification !== `${model.status.growthQualification}-pending`
    || evidence.checks.fastGate !== "pnpm check:fast" || evidence.checks.fullGate !== "pnpm check"
    || evidence.deployment?.renderIsolationPreflight !== "pending-live-readback") fail("P0 gate or deployment claim drifted");
}

function validateWiring(model) {
  if (model.packageJson.scripts?.["sdk-growth:check"] !== SDK_COMMAND) fail("pending SDK command is missing or a no-op");
  for (const command of ["check", "check:fast"]) if (!model.packageJson.scripts?.[command]?.includes("node architecture/tooling/runtime/command.ts run sdk-growth:check")) fail(`${command} bypasses pending SDK guard`);
  const required = ["architecture/checks/sdk-growth.mjs", "architecture/sdk-growth", "tests/sdk-growth.test.mjs",
    "tests/qualification/sdk-growth-admission.mjs", "tests/qualification/sdk-growth-packed-consumers.mjs",
    "tests/qualification/sdk-growth-registry-consumer.ts", "tests/qualification/sdk-growth-public-import.ts", "tests/qualification/sdk-growth-synthetic-predecessor.ts",
    "tests/tsconfig.sdk-growth-registry.json"];
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
  validateP0Evidence(model);
  validateWiring(model);
  validateScope(model);
  return { packages: PACKAGES.length, releasedPackages: PACKAGES.length, compatibility: "v1-retained",
    growthQualification: "v2", activation: "pending", status: "hold" };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await validateSdkGrowth(await loadSdkGrowthModel());
  process.stdout.write(`${JSON.stringify({ result: "passed", ...result })}\n`);
}
