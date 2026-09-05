import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import test from "node:test";
import { admitObjectInput } from "../../../dist/features/input-admission/object-admission.js";
import { analyzeCompositionSemantics } from "../../../dist/features/composition-semantics/semantic-analysis.js";
import { createDiagnosticCollector } from "../../../dist/features/diagnostics/internal.js";
import { createOwnedJcs } from "../../../dist/features/canonicalization/owned-jcs/factory.js";
import { coverageInput } from "./object-resource-coverage-cases.mjs";

const { cases } = JSON.parse(await readFile(new URL(
  "../../../../../architecture/qualification/object-resource-coverage/cases.json", import.meta.url), "utf8"));
const containers = (value, found = new Set()) => {
  if (value === null || typeof value !== "object" || found.has(value)) return found;
  found.add(value);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (Object.hasOwn(descriptor, "value")) containers(descriptor.value, found);
  }
  return found;
};

for (const row of cases) test(`ADR-0020 ${row.id} obeys its complete permitted failure set`, () => {
  const observations = [];
  for (const variant of row.variants) {
    const input = coverageInput(row.id, variant);
    const collector = createDiagnosticCollector(createOwnedJcs().canonicalize);
    const admitted = admitObjectInput(input, collector);
    const result = analyzeCompositionSemantics(admitted, collector);
    assert.ok(row.permittedResults.some(expected => isDeepStrictEqual(result, expected)), `${variant}: ${JSON.stringify(result)}`);
    // These families vary the exhausted dimension, not its enumeration. Their
    // union cannot authorize a limit that this particular input never reaches.
    if (["prior-depth-then-batch", "shallow-then-batch"].includes(row.id)) {
      const expectedLimit = variant === "string" ? "aggregateStringBytes" : "jsonValueOccurrences";
      assert.deepEqual(result.diagnostics.filter(d => ["jsonValueOccurrences", "aggregateStringBytes"].includes(d.details.limitName))
        .map(d => d.details.limitName), [expectedLimit], `${row.id}/${variant}: truthful batch limit`);
    }
    const batchRejected = result.diagnostics.some(d => ["jsonValueOccurrences", "aggregateStringBytes"].includes(d.details.limitName));
    if (batchRejected) assert.deepEqual(admitted, { declarations: [], allDeclarationsAdmitted: false,
      profile: null, profileResources: null, hasErrors: true });
    // Inspect the bounded retained result, not the rejected caller's huge graph.
    for (const value of containers(admitted)) assert.ok(Object.isFrozen(value));
    const before = JSON.stringify({ admitted, result });
    input.declarations.length = 0; input.profile.roots.length = 0;
    assert.equal(JSON.stringify({ admitted, result }), before, "no surviving caller aliases");
    observations.push(result);
  }
  if (row.domain === "inside-envelope") for (const result of observations) assert.deepEqual(result, observations[0]);
});
