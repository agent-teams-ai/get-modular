const START_MARKER = "<!-- get-modular:private-core-start -->";
const END_MARKER = "<!-- /get-modular:private-core-start -->";
const FIELDS = ["repository", "baseCommit", "authorityDigest", "approvedBy", "approvedOn", "status", "package", "scope", "excluded"];
const SCOPE = ["private-semantics", "object-candidate-evidence"];
const EXCLUDED = ["public-exports", "raw-carriers", "publication", "runtime-lifecycle", "conformance-claims", "proposed-contract-claims", "generated-self-composition-claims"];

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
}) {
  const starts = markdown.split(START_MARKER);
  const ends = markdown.split(END_MARKER);
  if (starts.length === 1 && ends.length === 1) {
    if (productionArtifacts.length > 0) fail("record is required before adding a private package");
    return;
  }
  if (starts.length !== 2 || ends.length !== 2) fail("record must occur exactly once");
  const body = starts[1].split(END_MARKER);
  if (body.length !== 2) fail("record markers are out of order");
  const fenced = /^\s*```json\s*\n([\s\S]*?)\n```\s*$/u.exec(body[0]);
  if (!fenced) fail("record must contain one JSON block");
  let record;
  try { record = JSON.parse(fenced[1]); } catch { fail("record must be valid JSON"); }
  if (record === null || typeof record !== "object" || Array.isArray(record)
    || !exactList(Object.keys(record), FIELDS)) fail("record fields are not the closed format");
  if (record.repository !== "agent-teams-ai/get-modular") fail("repository does not match");
  if (record.approvedBy !== "product-owner" || record.status !== "authorized"
    || !/^\d{4}-\d{2}-\d{2}$/u.test(record.approvedOn)) fail("owner authorization is missing or inactive");
  if (record.authorityDigest !== authorityDigest) fail("accepted authority has changed");
  if (record.package !== "@get-modular/core") fail("package is not authorized");
  if (!exactList(record.scope, SCOPE) || !exactList(record.excluded, EXCLUDED)) fail("scope is not the bounded private checkpoint");
  if (productionArtifacts.some(path => !path.startsWith("packages/core/"))) fail("artifact is outside the authorized package root");
  if (typeof record.baseCommit !== "string" || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(record.baseCommit)) fail("base must be an exact Git commit");
  if (!await isStartingBase(record.baseCommit)) fail("base is not an ancestor of this checkout");
}
