import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { parse } from "yaml";
import {
  manifestCarrierViolations,
  packageManifestInventory,
} from "./production-artifacts.mjs";
import { safeRepositoryPath } from "./tracked-file-custody.mjs";

export const ASSEMBLY_MANIFEST_PATH = "packages/assembly/package.json";
export const ASSEMBLY_DECISION_PATH =
  "docs/decisions/0023-add-a-thin-host-owned-assembly-component-above-core.md";
export const M2_HISTORICAL_LOCK_DIGEST =
  "sha256:7420fcef084e65d3a61eba8e907a17bba9efbd255d1e9fe72b8370d216bdec99";
const ASSEMBLY_DECISION_BYTES_DIGEST =
  "sha256:9278531aaeb898397e525bb8170e497749b28bbe7844e1aa75c8d1aef2fe76de";
const ASSEMBLY_REGISTRY_ENTRY = Object.freeze({
  id: "ADR-0023",
  path: ASSEMBLY_DECISION_PATH,
  immutableDigest: "sha256:0b7ae923c25d069e951b36cb46a2500888e3193d597f17990d069577983935dc",
});
const ASSEMBLY_IMPORTER = Buffer.from(
  "  packages/assembly:\n"
  + "    dependencies:\n"
  + "      '@get-modular/core':\n"
  + "        specifier: workspace:*\n"
  + "        version: link:../core\n\n",
);
const digest = bytes => {
  assert(Buffer.isBuffer(bytes), "Assembly admission requires file bytes");
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
};

async function validateAssemblyPackage({ readBytes, readPackageManifest }) {
  // Pin the complete accepted document, including its approval metadata.
  // The registry identity separately follows the existing Docs Protocol format.
  assert.equal(digest(await readBytes(ASSEMBLY_DECISION_PATH)),
    ASSEMBLY_DECISION_BYTES_DIGEST, "Assembly admission requires unchanged accepted ADR-0023");
  const registry = JSON.parse((await readBytes(
    "architecture/decisions/accepted-decisions.json",
  )).toString("utf8"));
  assert.equal(registry.schemaVersion, 1);
  assert.equal(registry.algorithm, "sha256");
  assert(Array.isArray(registry.decisions), "Assembly admission requires the decision registry");
  assert.deepEqual(registry.decisions.filter(entry => entry?.id === "ADR-0023"
    || entry?.path === ASSEMBLY_DECISION_PATH), [ASSEMBLY_REGISTRY_ENTRY],
  "Assembly admission requires the registered ADR-0023 identity");
  const manifest = await readPackageManifest(ASSEMBLY_MANIFEST_PATH);
  assert(manifest && typeof manifest === "object" && !Array.isArray(manifest)
    && manifest.name === "@get-modular/assembly", "Assembly admission manifest identity differs");
  const inventory = await packageManifestInventory([ASSEMBLY_MANIFEST_PATH], {
    readPackageManifest: async () => manifest,
  });
  const violations = manifestCarrierViolations(inventory);
  assert.equal(violations.length, 0,
    `Assembly admission manifest violates ADR-0023 or carrier rules: ${JSON.stringify(violations)}`);
}

// Invert only the supplied six-line addition, then authenticate the entire
// remainder before interpreting it as historical evidence.
function verifyAssemblyLockDelta(currentBytes) {
  assert(Buffer.isBuffer(currentBytes), "Assembly admission requires current lock bytes");
  const offset = currentBytes.indexOf(ASSEMBLY_IMPORTER);
  assert(offset >= 0 && currentBytes.indexOf(ASSEMBLY_IMPORTER, offset + 1) === -1,
    "Assembly admission requires exactly the reviewed lock importer addition");
  const historicalBytes = Buffer.concat([
    currentBytes.subarray(0, offset),
    currentBytes.subarray(offset + ASSEMBLY_IMPORTER.length),
  ]);
  assert.equal(digest(historicalBytes), M2_HISTORICAL_LOCK_DIGEST,
    "Assembly admission current lock differs beyond the sole importer addition");
  const historical = parse(historicalBytes.toString("utf8"));
  const current = parse(currentBytes.toString("utf8"));
  assert.deepEqual(current, {
    ...historical,
    importers: {
      ...historical.importers,
      "packages/assembly": {
        dependencies: {
          "@get-modular/core": { specifier: "workspace:*", version: "link:../core" },
        },
      },
    },
  }, "Assembly admission current dependency graph must add only Assembly to Core");
  return historicalBytes;
}

export async function validateAssemblyAdmission({
  productionArtifacts, readBytes, readPackageManifest,
}) {
  const artifacts = productionArtifacts.filter(path => path.startsWith("packages/assembly/"));
  if (artifacts.length === 0) return Object.freeze([]);
  assert(artifacts.every(path => safeRepositoryPath(path)
    && (!path.endsWith("/package.json") || path === ASSEMBLY_MANIFEST_PATH)),
  "Assembly admission rejects unsafe paths and nested manifests");
  assert(artifacts.includes(ASSEMBLY_MANIFEST_PATH),
    "Assembly admission requires its package root manifest");
  assert(productionArtifacts.includes("packages/core/package.json"),
    "Assembly admission requires the Core package");
  await validateAssemblyPackage({ readBytes, readPackageManifest });
  verifyAssemblyLockDelta(await readBytes("pnpm-lock.yaml"));
  return Object.freeze(artifacts);
}

// This reader belongs only to historical M2 evidence verification. The caller's
// current-file reader and all other evidence paths retain their existing meaning.
export async function createHistoricalM2EvidenceReader({
  ledgerBytes, expectedLedgerDigest, readBytes,
}) {
  assert.equal(digest(ledgerBytes), expectedLedgerDigest, "M2 evidence ledger digest changed");
  const ledger = JSON.parse(ledgerBytes.toString("utf8"));
  assert.deepEqual(ledger.artifacts.filter(entry => entry.path === "pnpm-lock.yaml"), [{
    id: "pnpm-lock.yaml", path: "pnpm-lock.yaml",
    immutableDigest: M2_HISTORICAL_LOCK_DIGEST,
  }], "M2 evidence must retain its exact historical lock identity");
  const currentBytes = Buffer.from(await readBytes("pnpm-lock.yaml"));
  let historicalBytes = currentBytes;
  if (digest(currentBytes) !== M2_HISTORICAL_LOCK_DIGEST) {
    await validateAssemblyPackage({
      readBytes,
      readPackageManifest: async path => JSON.parse((await readBytes(path)).toString("utf8")),
    });
    historicalBytes = verifyAssemblyLockDelta(currentBytes);
  }
  return async path => path === "pnpm-lock.yaml"
    ? Buffer.from(historicalBytes) : readBytes(path);
}
