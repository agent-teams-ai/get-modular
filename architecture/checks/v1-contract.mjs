import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const CONTRACT_PATH = /^architecture\/contracts\/v1\/[a-z0-9.-]+\.json$/u;

function fail(message) {
  throw new Error(`V1_CONTRACT_CHECK_FAILED: ${message}`);
}

function same(left, right) {
  return isDeepStrictEqual(left, right);
}

export async function validateContractLedger({ ledger, readBytes, listedPaths }) {
  if (ledger?.schemaVersion !== 1 || ledger.algorithm !== "sha256-bytes") {
    fail("unsupported accepted-contracts ledger");
  }
  const paths = [];
  const ids = new Set();
  for (const artifact of ledger.artifacts ?? []) {
    if (typeof artifact?.id !== "string" || ids.has(artifact.id)) {
      fail("contract artifact IDs must be unique strings");
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
    const digest = createHash("sha256").update(vector.canonicalUtf8, "utf8").digest("hex");
    if (vector.digest !== `gm-plan:v1:sha-256:${digest}`) {
      fail(`${vector.name} has an invalid digest`);
    }
  }
  if ((vectors?.positive?.length ?? 0) === 0 || (vectors?.negative?.length ?? 0) === 0) {
    fail("canonical vectors require positive and negative cases");
  }
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath));
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(resolve(root, relativePath), "utf8"));
}

async function main() {
  const directory = "architecture/contracts/v1";
  const ledgerPath = "architecture/authority/accepted-contracts.json";
  const ledgerBytes = await read(ledgerPath);
  const ledgerDigest = `sha256:${createHash("sha256").update(ledgerBytes).digest("hex")}`;
  const resolvingDecision = await readFile(
    resolve(root, "docs/decisions/0005-freeze-v1-compatibility-diagnostics-and-resource-profile.md"),
    "utf8",
  );
  if (!resolvingDecision.includes(`The accepted contract ledger is anchored as\n\`${ledgerDigest}\`.`)) {
    fail("accepted contract ledger is not anchored by ADR-0005");
  }
  const listedPaths = (await readdir(resolve(root, directory)))
    .filter(filename => filename.endsWith(".json"))
    .map(filename => `${directory}/${filename}`);
  await validateContractLedger({
    ledger: JSON.parse(ledgerBytes),
    readBytes: read,
    listedPaths,
  });
  validateContractCoherence({
    schema: await readJson(`${directory}/composition.schema.json`),
    catalog: await readJson(`${directory}/diagnostic-catalog.json`),
    profile: await readJson(`${directory}/resource-profile.json`),
    vectors: await readJson(`${directory}/canonical-vectors.json`),
  });
  process.stdout.write("Get Modular V1 contract check passed.\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
