import assert from "node:assert/strict";
import { ASSEMBLY_PAIR_DECISIONS } from "../../checks/assembly-admission.mjs";
import { hash, record } from "./io.ts";

export const metadataAuthority = ASSEMBLY_PAIR_DECISIONS["0.7.1"];
export const metadataDecision = metadataAuthority.path;
export const metadataDecisionDigest = metadataAuthority.bytesDigest;

/** One exact accepted decision authorizes both metadata delivery mechanisms. */
export function assertMetadataAuthority(document: string, registrySource: string): void {
  assert.equal(hash(document), metadataDecisionDigest, "candidate.metadata-release-authority");
  const registry = record(JSON.parse(registrySource));
  assert(Array.isArray(registry["decisions"]), "candidate.metadata-release-registry");
  assert.deepEqual(registry["decisions"].filter(value => {
    const row = record(value); return row["id"] === metadataAuthority.entry.id || row["path"] === metadataDecision;
  }), [metadataAuthority.entry], "candidate.metadata-release-registry");
}
