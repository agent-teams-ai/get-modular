import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { checkObjectResourceCoverage, coverageDirectory } from "./object-resource-coverage.mjs";
import { checkImplementationClarifications } from "./implementation-clarifications.mjs";

import canonicalize from "canonicalize";
import { canonicalize as canonicalizeOracle } from "json-canonicalize";

import {
  createSchemaValidators,
  validateCanonicalizationQualification,
  validateDecoderQualification,
  validateDiagnosticQualification,
  validateNormalizationQualification,
  validateQualificationCaseManifest,
  validateQualificationLedger,
  validateResourceBoundaryQualification,
} from "./v1-qualification.mjs";
import {
  assertGitIndexSnapshotCurrent,
  captureGitIndexSnapshot,
  indexSnapshotPaths,
  readIndexSnapshotFile,
} from "./tracked-file-custody.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const CONTRACT_PATH = /^architecture\/contracts\/v1\/[a-z0-9.-]+\.json$/u;
const CONTRACT_ARTIFACT_ID = /^GM-V1-[A-Z0-9]+(?:-[A-Z0-9]+)*$/u;

function fail(message) {
  throw new Error(`V1_CONTRACT_CHECK_FAILED: ${message}`);
}

function same(left, right) {
  return isDeepStrictEqual(left, right);
}

function exactKeys(value, expectedKeys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expectedKeys].sort())) {
    fail(`${label} must contain exactly: ${expectedKeys.join(", ")}`);
  }
}

export function qualificationLedgerAnchor(digest) {
  return "The exact qualification ledger `architecture/authority/"
    + "v1-qualification-ledger.json`\nis anchored as\n`"
    + digest
    + "`.";
}

export async function validateContractLedger({ ledger, readBytes, listedPaths }) {
  exactKeys(ledger, ["algorithm", "artifacts", "schemaVersion"], "accepted-contracts ledger");
  if (ledger?.schemaVersion !== 1 || ledger.algorithm !== "sha256-bytes") {
    fail("unsupported accepted-contracts ledger");
  }
  if (!Array.isArray(ledger.artifacts)) {
    fail("accepted-contracts ledger artifacts must be an array");
  }
  const paths = [];
  const ids = new Set();
  for (const artifact of ledger.artifacts ?? []) {
    exactKeys(artifact, ["id", "immutableDigest", "path"], "contract artifact");
    if (typeof artifact?.id !== "string" || !CONTRACT_ARTIFACT_ID.test(artifact.id)
      || ids.has(artifact.id)) {
      fail("contract artifact IDs must be unique canonical GM-V1 strings");
    }
    ids.add(artifact.id);
    if (!CONTRACT_PATH.test(artifact.path ?? "")) {
      fail(`${artifact.id} has an invalid contract path`);
    }
    if (!SHA256.test(artifact.immutableDigest ?? "")) {
      fail(`${artifact.id} has an invalid digest`);
    }
    const bytes = await readBytes(artifact.path);
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (digest !== artifact.immutableDigest) {
      fail(`${artifact.id} differs from the accepted contract`);
    }
    paths.push(artifact.path);
  }
  if (paths.length === 0 || !same([...paths].sort(), [...listedPaths].sort())) {
    fail("accepted-contracts ledger does not match the V1 contract directory");
  }
}

export async function listLedgerJsonPaths({ repositoryRoot, snapshot, directory }) {
  const paths = new Set((await readdir(resolve(repositoryRoot, directory)))
    .filter(filename => filename.endsWith(".json"))
    .map(filename => `${directory}/${filename}`));
  const directJsonPath = new RegExp(`^${directory.replaceAll("/", "\\/")}\\/[^/]+\\.json$`, "u");
  for (const path of indexSnapshotPaths(snapshot)) {
    if (directJsonPath.test(path)) paths.add(path);
  }
  return [...paths].sort();
}

export function validateContractCoherence({ schema, catalog, profile, vectors }) {
  if (schema?.$defs?.diagnostic?.properties?.code?.enum === undefined) {
    fail("composition schema has no closed diagnostic code set");
  }
  if (!same(schema.$defs.diagnostic.properties.code.enum, catalog?.ordering?.codes)) {
    fail("diagnostic schema and catalog codes differ");
  }
  if (!same(Object.keys(catalog.detailPolicy ?? {}), catalog.ordering.codes)) {
    fail("diagnostic detail policy is not closed over the code catalog");
  }
  if (profile?.profileId !== "get-modular/resource-profile/v1-standard"
    || profile.profileVersion !== 1) {
    fail("unknown V1 resource profile");
  }
  for (const [name, value] of Object.entries(profile.limits ?? {})) {
    if (!/^[a-z][A-Za-z0-9]*$/u.test(name) || !Number.isSafeInteger(value) || value <= 0) {
      fail(`resource limit ${name} must be a positive safe integer`);
    }
  }
  if (schema.$defs.portableId.maxLength !== profile.limits.identifierBytes
    || schema.$defs.owner.properties.path.maxItems !== profile.limits.ownerPathSegments
    || schema.$defs.moduleDeclaration.properties.provides.maxItems
      !== profile.limits.capabilitiesPerDeclaration
    || schema.$defs.moduleDeclaration.properties.slots.maxItems
      !== profile.limits.slotsPerDeclaration
    || schema.$defs.compositionProfile.properties.roots.maxItems !== profile.limits.roots
    || schema.$defs.compositionProfile.properties.selections.maxItems
      !== profile.limits.selections
    || schema.$defs.compositionProfile.properties.bindings.maxItems
      !== profile.limits.bindings
    || schema.$defs.binding.properties.providerImplementationIds.maxItems
      !== profile.limits.providersPerManySlot
    || schema.$defs.diagnostic.properties.path.maxItems
      !== profile.limits.diagnosticPathSegments) {
    fail("schema maxima differ from the accepted resource profile");
  }

  for (const vector of vectors?.positive ?? []) {
    const parsed = JSON.parse(vector.canonicalUtf8);
    if (!same(parsed, vector.envelope)) fail(`${vector.name} canonical bytes decode differently`);
    const canonical = canonicalize(vector.envelope);
    const differential = canonicalizeOracle(vector.envelope);
    if (canonical !== differential || canonical !== vector.canonicalUtf8) {
      fail(`${vector.name} is not independently reproducible RFC 8785 output`);
    }
    const digest = createHash("sha256").update(vector.canonicalUtf8, "utf8").digest("hex");
    if (vector.digest !== `gm-plan:v1:sha-256:${digest}`) {
      fail(`${vector.name} has an invalid digest`);
    }
  }
  if ((vectors?.positive?.length ?? 0) === 0 || (vectors?.negative?.length ?? 0) === 0) {
    fail("canonical vectors require positive and negative cases");
  }
}

async function main() {
  const snapshot = await captureGitIndexSnapshot(root);
  const read = relativePath => readIndexSnapshotFile(
    snapshot,
    relativePath,
    "accepted V1 ledger or artifact",
  );
  const readJson = async relativePath => JSON.parse((await read(relativePath)).toString("utf8"));
  const directory = "architecture/contracts/v1";
  const ledgerPath = "architecture/authority/accepted-contracts.json";
  const ledgerBytes = await read(ledgerPath);
  const ledgerDigest = `sha256:${createHash("sha256").update(ledgerBytes).digest("hex")}`;
  const resolvingDecision = (await read(
    "docs/decisions/0005-freeze-v1-compatibility-diagnostics-and-resource-profile.md",
  )).toString("utf8");
  if (!resolvingDecision.includes(`The accepted contract ledger is anchored as\n\`${ledgerDigest}\`.`)) {
    fail("accepted contract ledger is not anchored by ADR-0005");
  }
  const listedPaths = await listLedgerJsonPaths({ repositoryRoot: root, snapshot, directory });
  await validateContractLedger({
    ledger: JSON.parse(ledgerBytes),
    readBytes: read,
    listedPaths,
  });

  const qualificationDirectory = "architecture/qualification/v1";
  const qualificationLedgerPath = "architecture/authority/v1-qualification-ledger.json";
  const qualificationLedgerBytes = await read(qualificationLedgerPath);
  const qualificationLedgerDigest = `sha256:${createHash("sha256")
    .update(qualificationLedgerBytes).digest("hex")}`;
  const qualificationDecision = (await read(
    "docs/decisions/0007-require-executable-v1-conformance-amendments.md",
  )).toString("utf8");
  if (!qualificationDecision.includes(qualificationLedgerAnchor(qualificationLedgerDigest))) {
    fail("V1 qualification ledger is not anchored by ADR-0007");
  }
  const qualificationPaths = await listLedgerJsonPaths({
    repositoryRoot: root,
    snapshot,
    directory: qualificationDirectory,
  });
  await validateQualificationLedger({
    ledger: JSON.parse(qualificationLedgerBytes),
    readBytes: read,
    listedPaths: qualificationPaths,
  });

  const schema = await readJson(`${directory}/composition.schema.json`);
  const catalog = await readJson(`${directory}/diagnostic-catalog.json`);
  const profile = await readJson(`${directory}/resource-profile.json`);
  const acceptedCanonicalVectors = await readJson(`${directory}/canonical-vectors.json`);
  validateContractCoherence({
    schema,
    catalog,
    profile,
    vectors: acceptedCanonicalVectors,
  });
  const validators = createSchemaValidators(schema);
  const diagnosticContract = await readJson(
    `${qualificationDirectory}/diagnostic-contract.json`,
  );
  const canonicalizationVectors = await readJson(
    `${qualificationDirectory}/canonicalization-vectors.json`,
  );
  const decoderVectors = await readJson(`${qualificationDirectory}/decoder-vectors.json`);
  const effectiveResourceProfile = await readJson(
    `${qualificationDirectory}/resource-profile-v2.json`,
  );
  validateQualificationCaseManifest({
    manifest: await readJson(`${qualificationDirectory}/qualification-case-manifest.json`),
    decoderVectors,
    canonicalizationVectors,
    acceptedCanonicalVectors,
    diagnosticContract,
    diagnosticCatalog: catalog,
    resourceProfile: effectiveResourceProfile,
    ...validators,
  });
  validateCanonicalizationQualification(canonicalizationVectors);
  validateDecoderQualification(
    decoderVectors,
    {
      maxDepth: effectiveResourceProfile.limits.jsonDepth,
      validateDocument: validators.validateDocument,
    },
  );
  validateDiagnosticQualification({
    contract: diagnosticContract,
    snapshots: await readJson(`${qualificationDirectory}/diagnostic-snapshots.json`),
    catalog,
    profile: effectiveResourceProfile,
    coordinateFields: Object.keys(schema.$defs.diagnostic.properties.coordinate.properties),
    validateDiagnostic: validators.validateDiagnostic,
  });
  validateNormalizationQualification({
    vectors: await readJson(`${qualificationDirectory}/normalization-vectors.json`),
    validateDocument: validators.validateDocument,
  });
  validateResourceBoundaryQualification({
    vectors: await readJson(`${qualificationDirectory}/resource-boundary-vectors.json`),
    profile,
    contract: diagnosticContract,
    catalog,
    validateDiagnostic: validators.validateDiagnostic,
    maximumOmitted: schema.$defs.diagnostic.properties.details
      .properties.omitted.maximum,
  });
  const clarificationDirectory = "architecture/qualification/implementation-clarifications";
  await checkImplementationClarifications({
    readBytes: read,
    listedPaths: await listLedgerJsonPaths({
      repositoryRoot: root, snapshot, directory: clarificationDirectory,
    }),
  });
  await checkObjectResourceCoverage({
    readBytes: read,
    listedPaths: await listLedgerJsonPaths({ repositoryRoot: root, snapshot, directory: coverageDirectory }),
    validateDiagnostic: validators.validateDiagnostic,
  });
  await assertGitIndexSnapshotCurrent(snapshot);
  process.stdout.write("Get Modular V1 contract and qualification checks passed.\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
