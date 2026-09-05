import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

export const coverageDirectory = "architecture/qualification/object-resource-coverage";
export const coverageLedger = "architecture/authority/object-resource-coverage-ledger.json";
export const coverageDecision = "docs/decisions/0020-define-diagnostic-coverage-outside-object-resource-admission.md";
const contractPath = `${coverageDirectory}/contract.json`;
const casesPath = `${coverageDirectory}/cases.json`;
const digest = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const fail = message => { throw Error(`OBJECT_RESOURCE_COVERAGE_FAILED: ${message}`); };
const same = (actual, expected, label) => { if (!isDeepStrictEqual(actual, expected)) fail(label); };
const keys = (value, names, label) => same(Object.keys(value ?? {}).sort(), names.toSorted(), label);

export async function checkObjectResourceCoverage({ readBytes, listedPaths, validateDiagnostic }) {
  same([...listedPaths].sort(), [casesPath, contractPath], "coverage directory must contain exactly its two artifacts");
  const ledgerBytes = await readBytes(coverageLedger);
  const ledger = JSON.parse(ledgerBytes);
  keys(ledger, ["schemaVersion", "algorithm", "artifacts"], "closed ledger shape");
  same([ledger.schemaVersion, ledger.algorithm], [1, "sha256-bytes"], "ledger identity");
  same(ledger.artifacts?.map(item => [item.id, item.path]), [
    ["OBJECT-RESOURCE-COVERAGE", contractPath], ["OBJECT-RESOURCE-COVERAGE-CASES", casesPath],
  ], "closed artifact identity/order");
  for (const item of ledger.artifacts) {
    keys(item, ["id", "path", "immutableDigest"], "closed artifact shape");
    same(digest(await readBytes(item.path)), item.immutableDigest, "artifact byte drift");
  }
  const decision = (await readBytes(coverageDecision)).toString("utf8");
  if (!decision.includes(`The object resource coverage ledger \`${coverageLedger}\` is anchored as \`${digest(ledgerBytes)}\`.`)) {
    fail("missing accepted decision anchor");
  }
  const contract = JSON.parse(await readBytes(contractPath));
  same([contract.kind, contract.authority, contract.selection],
    ["get-modular.object-resource-coverage", "ADR-0020", "A"], "fixed selected rule");
  same(contract.batchLimits, ["jsonValueOccurrences", "aggregateStringBytes"], "batch limits");
  same(contract.depthScope, "document-local", "depth scope");
  same(contract.actual, "limit-plus-one", "saturation");
  const vectors = JSON.parse(await readBytes(casesPath));
  keys(vectors, ["kind", "authority", "entryPoint", "cases"], "closed vector shape");
  same([vectors.kind, vectors.authority, vectors.entryPoint], ["get-modular.object-resource-coverage-cases",
    "ADR-0020", "trusted-object-admission-and-semantic-result"], "vector identity/scope");
  same(vectors.cases.map(row => row.id), ["key-order", "depth-string-order", "binding-order", "oversized-array-hidden-tail",
    "multiple-depth-documents", "prior-depth-then-batch", "shallow-then-batch", "in-envelope-malformed", "cycle-beside-shared-dag"], "closed recipe inventory");
  const { limits } = JSON.parse(await readBytes("architecture/qualification/v1/resource-profile-v2.json"));
  for (const row of vectors.cases) {
    keys(row, ["id", "domain", "variants", "permittedResults"], `${row.id} shape`);
    const inside = ["in-envelope-malformed", "cycle-beside-shared-dag"].includes(row.id);
    same(row.domain, inside ? "inside-envelope" : "outside-envelope", `${row.id} envelope`);
    if (!Array.isArray(row.variants) || !row.variants.length || row.variants.some(id => typeof id !== "string")
      || new Set(row.variants).size !== row.variants.length || !Array.isArray(row.permittedResults)
      || !row.permittedResults.length || (inside && row.permittedResults.length !== 1)) fail(`${row.id} cases missing`);
    for (const result of row.permittedResults) {
      keys(result, ["ok", "diagnostics"], `${row.id} must expose only a failure`);
      if (result.ok !== false || !Array.isArray(result.diagnostics) || !result.diagnostics.length) fail(`${row.id} empty failure`);
      if (!inside && !result.diagnostics.some(d => d.code === "input.limit-exceeded")) fail(`${row.id} missing resource proof`);
      for (const diagnostic of result.diagnostics) {
        if (!validateDiagnostic(diagnostic)) fail(`${row.id} invalid diagnostic shape`);
        if (diagnostic.code === "input.limit-exceeded") {
          const limit = limits[diagnostic.details.limitName];
          same([diagnostic.details.limit, diagnostic.details.actual], [limit, limit + 1], `${row.id} false resource saturation`);
        }
      }
    }
  }
}
