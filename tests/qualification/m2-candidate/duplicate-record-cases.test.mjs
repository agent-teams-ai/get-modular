// Candidate fixture consistency only; no production subject is invoked.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import canonicalize from "canonicalize";
import { canonicalize as secondOracle } from "json-canonicalize";
import { duplicateRecordBaseCases, duplicateRecordPermutationCases } from "./duplicate-record-cases.mjs";

const manifest = JSON.parse(await readFile(new URL("./duplicate-record-recipes.json", import.meta.url), "utf8"));
const schema = JSON.parse(await readFile(new URL("../../../architecture/contracts/v1/composition.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addSchema(schema);
const declaration = ajv.getSchema(`${schema.$id}#/$defs/moduleDeclaration`);
const profile = ajv.getSchema(`${schema.$id}#/$defs/compositionProfile`);

function streamIdentity(cases) {
  const hash = createHash("sha256");
  const seen = new Set();
  let count = 0;
  for (const value of cases) {
    assert.equal(seen.has(value.caseId), false, `duplicate case ID ${value.caseId}`);
    seen.add(value.caseId);
    const bytes = canonicalize(value);
    assert.equal(secondOracle(value), bytes);
    hash.update(bytes, "utf8").update("\n");
    count += 1;
  }
  return { count, sha256: hash.digest("hex") };
}

test("pins the proposed cardinality and exhaustive-permutation streams", () => {
  assert.equal(manifest.status, "proposed-fixture-only");
  assert.deepEqual(streamIdentity(duplicateRecordBaseCases()), manifest.streams.cardinality);
  assert.deepEqual(streamIdentity(duplicateRecordPermutationCases()), manifest.streams.permutations);
});

test("all eighteen complete worlds obey the accepted input wire schema", () => {
  const observed = [];
  for (const value of duplicateRecordBaseCases()) {
    const { cardinality, recordCount, recipe } = value.parameters;
    observed.push([cardinality, recordCount, recipe]);
    assert.equal(value.proposedOnly, true);
    assert.equal(value.entryPoint, "compileCompositionV1");
    for (const item of value.input.declarations) assert.equal(declaration(item), true, JSON.stringify(declaration.errors));
    assert.equal(profile(value.input.profile), true, JSON.stringify(profile.errors));
    assert.equal(value.input.profile.bindings.length, recordCount);
    const diagnostics = value.expected.diagnostics;
    assert.deepEqual(Object.keys(value.expected).sort(), ["diagnostics", "ok"]);
    assert.equal(value.expected.ok, false);
    assert.deepEqual(diagnostics[0], { code: "binding.duplicate-record", phase: "binding", path: [],
      coordinate: { implementationId: "example/consumer/default", slotId: "dependency" }, details: { reason: "duplicate" } });
    if (recipe === "one-row-cardinality-invalid") {
      assert.deepEqual(diagnostics[1], { code: "binding.cardinality", phase: "binding", path: [],
        coordinate: { implementationId: "example/consumer/default", slotId: "dependency" },
        details: { expectedCardinality: cardinality, actualCardinality: { required: 0, optional: 2, many: 3 }[cardinality] } });
      assert.equal(diagnostics.length, 2);
    } else assert.equal(diagnostics.length, 1);
  }
  assert.deepEqual(observed, manifest.domains.cardinalities.flatMap(kind => manifest.domains.recordCounts.flatMap(count =>
    manifest.domains.rowRecipes.map(recipe => [kind, count, recipe]))));
});

test("every enumerated record and provider permutation keeps its complete expected failure", () => {
  const sources = new Map([...duplicateRecordBaseCases()].map(value => [value.caseId, value]));
  const actualBySource = new Map();
  for (const value of duplicateRecordPermutationCases()) {
    const source = sources.get(value.sourceCaseId);
    assert.ok(source);
    assert.equal(profile(value.input.profile), true, JSON.stringify(profile.errors));
    assert.deepEqual(value.expected, source.expected);
    const rows = value.input.profile.bindings;
    const multiset = list => list.map(row => JSON.stringify([...row.providerImplementationIds].sort())).sort();
    assert.deepEqual(multiset(rows), multiset(source.input.profile.bindings));
    actualBySource.set(value.sourceCaseId, (actualBySource.get(value.sourceCaseId) ?? 0) + 1);
  }
  assert.deepEqual(Object.fromEntries(actualBySource), manifest.permutationsPerSource);
});

test("stream identity detects removal, reordering, inserted and altered outcomes", () => {
  const source = [...duplicateRecordBaseCases()];
  const altered = structuredClone(source);
  altered[0].expected.diagnostics[0].code = "binding.duplicate";
  for (const mutation of [source.slice(1), [...source].reverse(), [...source, { ...source[0], caseId: "unexpected" }], altered]) {
    assert.notDeepEqual(streamIdentity(mutation), manifest.streams.cardinality);
  }
  assert.throws(() => streamIdentity([...source, source[0]]), /duplicate case ID/u);
});
