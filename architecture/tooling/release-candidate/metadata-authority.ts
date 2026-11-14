import assert from "node:assert/strict";
import { ASSEMBLY_PAIR_DECISIONS, RELEASE_POLICY_DECISION } from "../../checks/assembly-admission.mjs";
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

/** The release decision is separately authenticated; ADR-0042 remains immutable. */
export function assertReleasePolicyAuthority(document: string, registrySource: string): void {
  const authority = RELEASE_POLICY_DECISION;
  assert(authority, "candidate.effect-release-authority-missing");
  assert.equal(hash(document), authority.bytesDigest, "candidate.effect-release-authority");
  const registry = record(JSON.parse(registrySource));
  assert(Array.isArray(registry["decisions"]), "candidate.effect-release-registry");
  assert.deepEqual(registry["decisions"].filter(value => {
    const row = record(value); return row["id"] === authority.entry.id || row["path"] === authority.path;
  }), [authority.entry], "candidate.effect-release-registry");
}
