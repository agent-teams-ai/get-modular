import { visit } from "jsonc-parser";

import { PUBLICATION_FIELDS } from "./production-artifacts.mjs";
import { validateM2StartAuthority } from "./m2-evidence.mjs";

const START_MARKER = "<!-- get-modular:private-core-start -->";
const END_MARKER = "<!-- /get-modular:private-core-start -->";
const FIELDS = ["repository", "baseCommit", "authorityDigest", "approvedBy", "approvedOn", "status", "package", "scope", "excluded"];
const SCOPE = ["semantics", "object-entry", "publication-not-claimed"];
const EXCLUDED = ["raw-carriers", "raw-entry-export", "runtime-lifecycle", "conformance-claims", "proposed-contract-claims", "generated-self-composition-claims"];
const M2_SCOPE = [...SCOPE, "raw-carriers", "raw-entry-export", "duplicate-binding-records"];
const M2_EXCLUDED = EXCLUDED.filter(value => value !== "raw-carriers" && value !== "raw-entry-export");
// M3 admits generated implementation only; qualification and promotion remain
// separate gates. Both expanded scopes require the same verified M2 authority.
const M3_SCOPE = [...M2_SCOPE, "generated-self-composition"];
const M3_EXCLUDED = M2_EXCLUDED.filter(value => value !== "generated-self-composition-claims");
// The excluded list is enforced against the manifest, not only recorded. The
// current record excludes neither publication nor public exports, so these
// rules are the enforcement that keeps the field meaningful whenever a future
// owner record narrows the scope again.
const EXCLUSION_MANIFEST_RULES = Object.freeze([
  { exclusion: "publication", fields: PUBLICATION_FIELDS },
  { exclusion: "public-exports", fields: ["exports"] },
]);

export function manifestExclusionViolations(excluded, manifest) {
  const excludedSet = new Set(excluded);
  return EXCLUSION_MANIFEST_RULES
    .filter(rule => excludedSet.has(rule.exclusion))
    .map(rule => ({
      exclusion: rule.exclusion,
      declared: rule.fields.filter(field => manifest?.[field] !== undefined),
    }))
    .filter(violation => violation.declared.length > 0);
}

function fail(message) {
  throw new Error(`GOVERNANCE_CHECK_FAILED: private Core start ${message}`);
}

function exactList(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length
    && [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
}

export async function validatePrivateCoreStart({
  markdown,
  productionArtifacts,
  authorityDigest,
  isStartingBase,
  readPackageManifest,
  readM2Authority,
}) {
  const starts = markdown.split(START_MARKER);
  const ends = markdown.split(END_MARKER);
  if (starts.length === 1 && ends.length === 1) {
    if (productionArtifacts.length > 0) {
      fail("record is required before adding the first production package");
    }
    return Object.freeze({ generatedSelfComposition: false });
  }
  if (starts.length !== 2 || ends.length !== 2) fail("record must occur exactly once");
  const body = starts[1].split(END_MARKER);
  if (body.length !== 2) fail("record markers are out of order");
  const fenced = /^\s*```json\s*\n([\s\S]*?)\n```\s*$/u.exec(body[0]);
  if (!fenced) fail("record must contain one JSON block");
  let record;
  try { record = JSON.parse(fenced[1]); } catch { fail("record must be valid JSON"); }
  const objects = [];
  visit(fenced[1], {
    onObjectBegin() { objects.push(new Set()); },
    onObjectProperty(name) {
      const keys = objects.at(-1);
      if (keys.has(name)) fail("record has duplicate members");
      keys.add(name);
    },
    onObjectEnd() { objects.pop(); },
  });
  if (record === null || typeof record !== "object" || Array.isArray(record)) fail("record fields are not the closed format");
  const m2 = Object.hasOwn(record, "m2Authority");
  if (!exactList(Object.keys(record), m2 ? [...FIELDS, "m2Authority"] : FIELDS)) fail("record fields are not the closed format");
  if (record.repository !== "agent-teams-ai/get-modular") fail("repository does not match");
  if (record.approvedBy !== "product-owner" || record.status !== "authorized"
    || !/^\d{4}-\d{2}-\d{2}$/u.test(record.approvedOn)) fail("owner authorization is missing or inactive");
  if (record.authorityDigest !== authorityDigest) fail("accepted authority has changed");
  if (record.package !== "@get-modular/core") fail("package is not authorized");
  const boundedScope = m2
    ? (exactList(record.scope, M2_SCOPE) && exactList(record.excluded, M2_EXCLUDED))
      || (exactList(record.scope, M3_SCOPE) && exactList(record.excluded, M3_EXCLUDED))
    : exactList(record.scope, SCOPE) && exactList(record.excluded, EXCLUDED);
  if (!boundedScope) fail("scope is not the bounded private checkpoint");
  if (m2) {
    const authority = record.m2Authority;
    if (!authority || typeof authority !== "object" || Array.isArray(authority)
      || !exactList(Object.keys(authority), ["decisionId", "ledgerDigest"])
      || authority.decisionId !== "ADR-0021"
      || !/^sha256:[a-f0-9]{64}$/u.test(authority.ledgerDigest)
      || typeof readM2Authority !== "function") fail("M2 accepted authority is missing");
    try {
      const input = await readM2Authority();
      await validateM2StartAuthority({ ...input, expectedLedgerDigest: authority.ledgerDigest });
    } catch (error) {
      fail(`M2 authority verification failed: ${error.message}`);
    }
  }
  if (productionArtifacts.some(path => !path.startsWith("packages/core/"))) fail("artifact is outside the authorized package root");
  if (productionArtifacts.length > 0) {
    const manifest = await readPackageManifest("packages/core/package.json");
    if (manifest?.name !== record.package) fail("manifest identity does not match the authorized package");
    for (const violation of manifestExclusionViolations(record.excluded, manifest)) {
      fail(`record excludes ${violation.exclusion} but the manifest declares `
        + `${violation.declared.join(", ")}`);
    }
  }
  if (typeof record.baseCommit !== "string" || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(record.baseCommit)) fail("base must be an exact Git commit");
  if (!await isStartingBase(record.baseCommit)) fail("base is not an ancestor of this checkout");
  return Object.freeze({
    generatedSelfComposition: m2
      && exactList(record.scope, M3_SCOPE)
      && exactList(record.excluded, M3_EXCLUDED),
  });
}
