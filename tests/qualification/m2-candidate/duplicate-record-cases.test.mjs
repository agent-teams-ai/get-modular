// Candidate fixture consistency only; no production subject is invoked.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import canonicalize from "canonicalize";
import { canonicalize as secondOracle } from "json-canonicalize";
import { duplicateRecordBaseCases, duplicateRecordRowFailureCases,
  duplicateRecordOverlapCases, duplicateRecordPermutationCases } from "./duplicate-record-cases.mjs";
import { duplicateRecordOrderingCases, duplicateRecordShuffledOrderingCases,
  duplicateRecordCollectorCases } from "./duplicate-record-ordering.mjs";

const manifest = JSON.parse(await readFile(new URL("./duplicate-record-recipes.json", import.meta.url), "utf8"));
const schema = JSON.parse(await readFile(new URL("../../../architecture/contracts/v1/composition.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addSchema(schema);
const declaration = ajv.getSchema(`${schema.$id}#/$defs/moduleDeclaration`);
const profile = ajv.getSchema(`${schema.$id}#/$defs/compositionProfile`);
const diagnostic = ajv.getSchema(`${schema.$id}#/$defs/diagnostic`);

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
  assert.deepEqual(streamIdentity(duplicateRecordRowFailureCases()), manifest.streams.rowFailures);
  assert.deepEqual(streamIdentity(duplicateRecordOverlapCases()), manifest.streams.overlap);
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
    const counts = value.input.profile.bindings.map(row => row.providerImplementationIds.length);
    const invalidCounts = counts.filter(count => cardinality === "required" ? count !== 1
      : cardinality === "optional" ? count > 1 : count < 1 || count > 2);
    assert.deepEqual(invalidCounts, recipe === "one-row-cardinality-invalid"
      ? [{ required: 0, optional: 2, many: 3 }[cardinality]] : []);
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
  const sources = new Map([...duplicateRecordBaseCases(), ...duplicateRecordRowFailureCases()].map(value => [value.caseId, value]));
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

const consumer = "example/consumer/default";
const firstProvider = "example/provider-one/default";
const thirdProvider = "example/provider-three/default";
const slotCoordinate = { implementationId: consumer, slotId: "dependency" };
const baseCompatibility = { family: "exact", familyVersion: 1, token: "example/service/v1" };
const expectedRows = {
  "duplicate-provider": { providers: [firstProvider, firstProvider], code: "binding.duplicate", details: { reason: "duplicate" } },
  "unknown-provider": { providers: ["example/absent/default"], code: "binding.unknown-provider", details: { reason: "unknown" } },
  "provider-not-selected": { providers: [thirdProvider], code: "binding.provider-not-selected", details: { reason: "mismatch" } },
  "cardinality-under": { providers: [], code: "binding.cardinality", details: { expectedCardinality: "many", actualCardinality: 0 } },
  "cardinality-over": { providers: [firstProvider, "example/provider-two/default", thirdProvider], code: "binding.cardinality", details: { expectedCardinality: "many", actualCardinality: 3 } },
  "capability-missing": { providers: [thirdProvider], code: "binding.capability-missing", details: { reason: "missing" } },
  "compatibility-mismatch": { providers: [thirdProvider], code: "binding.compatibility-mismatch",
    details: { expectedCompatibility: baseCompatibility, actualCompatibility: { ...baseCompatibility, token: "example/service/v2" } } },
};

function assertWorld(value) {
  assert.equal(value.proposedOnly, true);
  assert.equal(value.entryPoint, "compileCompositionV1");
  for (const item of value.input.declarations) assert.equal(declaration(item), true, JSON.stringify(declaration.errors));
  assert.equal(profile(value.input.profile), true, JSON.stringify(profile.errors));
  assert.deepEqual(Object.keys(value.expected).sort(), ["diagnostics", "ok"]);
  assert.equal(value.expected.ok, false);
  for (const item of value.expected.diagnostics.slice(1)) assert.equal(diagnostic(item), true, JSON.stringify(diagnostic.errors));
}

test("all seven row-local failures remain exact at every record position", () => {
  const positions = [];
  for (const value of duplicateRecordRowFailureCases()) {
    assertWorld(value);
    const { fault, faultPosition, recordCount } = value.parameters;
    positions.push([fault, recordCount, faultPosition]);
    const expected = expectedRows[fault];
    const rows = value.input.profile.bindings;
    assert.equal(rows.length, recordCount);
    assert.deepEqual(rows[faultPosition].providerImplementationIds, expected.providers);
    for (let index = 0; index < rows.length; index += 1) if (index !== faultPosition) {
      assert.deepEqual(rows[index].providerImplementationIds, [firstProvider, "example/provider-two/default"]);
    }
    const coordinate = expected.code === "binding.cardinality" ? slotCoordinate
      : { ...slotCoordinate, providerImplementationId: expected.providers[0] };
    assert.deepEqual(value.expected, { ok: false, diagnostics: [
      { code: "binding.duplicate-record", phase: "binding", path: [], coordinate: slotCoordinate, details: { reason: "duplicate" } },
      { code: expected.code, phase: "binding", path: [], coordinate, details: expected.details },
    ] });
    const third = value.input.declarations.find(item => item.implementationId === thirdProvider);
    assert.equal(value.input.profile.selections.some(item => item.implementationId === thirdProvider), fault !== "provider-not-selected");
    assert.deepEqual(third.provides, fault === "capability-missing" ? [] : [{ capabilityId: "example/service",
      compatibility: fault === "compatibility-mismatch" ? { ...baseCompatibility, token: "example/service/v2" } : baseCompatibility }]);
  }
  assert.deepEqual(positions, manifest.domains.rowFaults.flatMap(fault => [2, 3].flatMap(count =>
    Array.from({ length: count }, (_, position) => [fault, count, position]))));
  assert.equal(positions.length, 35);
});

test("lookup overlaps have no accidental missing-slot or unreachable candidates", () => {
  const cases = [...duplicateRecordOverlapCases()].slice(0, 3);
  for (const value of cases) {
    assertWorld(value);
    const profileInput = value.input.profile;
    assert.equal(profileInput.selections.length, 1);
    const root = value.input.declarations.find(item => item.moduleId === profileInput.roots[0]);
    assert.deepEqual(root.slots, []);
    assert.equal(value.expected.diagnostics.filter(item => item.code === "binding.duplicate-record").length, 1);
    assert.deepEqual(value.expected.diagnostics.map(item => item.code), value.parameters.fault === "unselected-consumer"
      ? ["binding.duplicate-record"] : ["binding.duplicate-record", `binding.${value.parameters.fault}`]);
    if (value.parameters.fault === "unknown-consumer") {
      assert.equal(value.input.declarations.some(item => item.implementationId === "example/absent/default"), false);
      assert.deepEqual(value.expected.diagnostics[1].coordinate, { implementationId: "example/absent/default" });
    } else if (value.parameters.fault === "unknown-slot") {
      assert.deepEqual(value.expected.diagnostics[1].coordinate, slotCoordinate);
    } else {
      assert.equal(profileInput.selections.some(item => item.implementationId === consumer), false);
      assert.equal(value.input.declarations.some(item => item.implementationId === consumer), true);
    }
  }
});

test("graph worlds distinguish invalid-group edge leakage from independent positive facts", () => {
  const [reached, unreached] = [...duplicateRecordOverlapCases()].slice(3);
  assertWorld(reached); assertWorld(unreached);
  assert.deepEqual(reached.input.profile.bindings.map(item => [item.consumerImplementationId, item.providerImplementationIds]), [
    [consumer, [consumer]], [consumer, [firstProvider]],
    ["example/provider-two/default", [thirdProvider]], [thirdProvider, ["example/provider-two/default"]],
  ]);
  assert.deepEqual(reached.expected.diagnostics.slice(1), [{ code: "graph.cycle", phase: "graph", path: [], coordinate: {},
    details: { component: [thirdProvider, "example/provider-two/default"] } }]);
  assert.deepEqual(unreached.input.profile.roots, ["example/provider-one"]);
  assert.deepEqual(unreached.input.declarations[1].slots, []);
  assert.deepEqual(unreached.expected.diagnostics.slice(1), ["example/consumer", "example/provider-three", "example/provider-two"].map(moduleId => ({
    code: "profile.unreachable-selection", phase: "graph", path: [],
    coordinate: { moduleId, implementationId: `${moduleId}/default` }, details: { reason: "unreachable" },
  })));
  assert.deepEqual([...duplicateRecordOverlapCases()].map(value => value.caseId), manifest.overlapCaseIds);
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

test("pins the candidate ordering, seeded shuffle and collector streams", () => {
  assert.deepEqual(streamIdentity(duplicateRecordOrderingCases()), manifest.streams.ordering);
  assert.deepEqual(streamIdentity(duplicateRecordShuffledOrderingCases()), manifest.streams.orderingShuffle);
  assert.deepEqual(streamIdentity(duplicateRecordCollectorCases()), manifest.streams.collector);
});

test("ordering worlds separate phase, new code priority and ASCII coordinates", () => {
  const cases = [...duplicateRecordOrderingCases()];
  for (const value of cases) {
    for (const item of value.input.declarations) assert.equal(declaration(item), true, JSON.stringify(declaration.errors));
    assert.equal(profile(value.input.profile), true, JSON.stringify(profile.errors));
    assert.equal(value.proposedOnly, true);
    assert.deepEqual(Object.keys(value.expected).sort(), ["diagnostics", "ok"]);
    assert.equal(value.expected.ok, false);
    for (const item of value.expected.diagnostics.filter(item => item.code !== "binding.duplicate-record")) {
      assert.equal(diagnostic(item), true, JSON.stringify(diagnostic.errors));
    }
  }
  assert.deepEqual(cases[0].expected, [...duplicateRecordOverlapCases()].at(-1).expected);
  assert.deepEqual(cases[1].expected.diagnostics, [
    { code: "binding.duplicate-record", phase: "binding", path: [],
      coordinate: { implementationId: "example/z/default", slotId: "dependency" }, details: { reason: "duplicate" } },
    { code: "binding.duplicate", phase: "binding", path: [], coordinate: { implementationId: "example/a/default",
      slotId: "dependency", providerImplementationId: "example/provider-two/default" }, details: { reason: "duplicate" } },
  ]);
  assert.deepEqual(cases[1].input.profile.bindings[0].providerImplementationIds,
    ["example/provider-two/default", "example/provider-two/default", "example/provider-one/default"]);
  assert.deepEqual(cases[2].expected.diagnostics.map(item => item.coordinate), [
    { implementationId: "example/c-10/default", slotId: "slot-10" },
    { implementationId: "example/c-10/default", slotId: "slot-2" },
    { implementationId: "example/c-2/default", slotId: "slot-0" },
  ]);
});

test("fixed shuffle uses one unsigned stream per case and never shuffles providers", () => {
  const sources = [...duplicateRecordOrderingCases()];
  for (const [index, value] of [...duplicateRecordShuffledOrderingCases()].entries()) {
    const source = sources[index];
    const lists = input => [input.declarations, input.profile.roots, input.profile.selections, input.profile.bindings];
    assert.deepEqual(value.expected, source.expected);
    assert.equal(value.sourceCaseId, source.caseId);
    // These full index permutations were derived independently with Python
    // masked integer arithmetic; no source PRNG generates the test oracle.
    const indices = manifest.shuffleIndicesByAxis[source.parameters.axis];
    assert.deepEqual(lists(value.input), lists(source.input).map((list, i) => indices[i].map(j => list[j])));
  }
  assert.deepEqual(sources, [...duplicateRecordOrderingCases()]);
});

test("collector worlds contain exactly N eligible groups and the complete capped outcome", async () => {
  const resource = JSON.parse(await readFile(new URL("../../../architecture/qualification/v1/resource-profile-v2.json", import.meta.url), "utf8"));
  assert.equal(resource.limits.diagnostics, 256);
  const results = new Map();
  for (const value of duplicateRecordCollectorCases()) {
    const { count, order } = value.parameters;
    const { declarations, profile: input } = value.input;
    assert.equal(value.proposedOnly, true);
    assert.deepEqual(Object.keys(value.expected).sort(), ["diagnostics", "ok"]);
    assert.equal(value.expected.ok, false);
    assert.equal(declarations.length, count);
    assert.equal(input.bindings.length, count * 2);
    assert.equal(profile(input), true, JSON.stringify(profile.errors));
    const seen = new Set();
    for (const item of declarations) {
      assert.equal(declaration(item), true, JSON.stringify(declaration.errors));
      assert.deepEqual(item.provides, []);
      assert.deepEqual(item.slots.map(slot => [slot.slotId, slot.cardinality]), [["dependency", { kind: "optional" }]]);
      assert.equal(seen.has(item.implementationId), false); seen.add(item.implementationId);
      assert.ok(input.roots.includes(item.moduleId));
      assert.ok(input.selections.some(row => row.moduleId === item.moduleId && row.implementationId === item.implementationId));
      assert.deepEqual(input.bindings.filter(row => row.consumerImplementationId === item.implementationId),
        Array.from({ length: 2 }, () => ({ consumerImplementationId: item.implementationId,
          slotId: "dependency", providerImplementationIds: [] })));
    }
    const ids = [...seen].sort();
    const expectedIds = Array.from({ length: count }, (_, index) => `example/c${String(index).padStart(4, "0")}/default`);
    assert.deepEqual(ids, expectedIds);
    if (order === "ascending") assert.deepEqual([...seen], expectedIds);
    if (order === "reverse") assert.deepEqual([...seen], [...expectedIds].reverse());
    if (order === "stride-17") assert.deepEqual([...seen], Array.from({ length: count }, (_, index) => expectedIds[(count - 1 + 17 * index) % count]));
    // ASCII JSON byte length upper-bounds both all string bytes and value
    // occurrences in these worlds, keeping this suite inside the C2 envelope.
    assert.ok(Buffer.byteLength(JSON.stringify(value.input)) < Math.min(resource.limits.aggregateStringBytes, resource.limits.jsonValueOccurrences));
    const expected = expectedIds.slice(0, count === 256 ? 256 : 255).map(implementationId => ({
      code: "binding.duplicate-record", phase: "binding", path: [], coordinate: { implementationId, slotId: "dependency" }, details: { reason: "duplicate" } }));
    if (count > 256) expected.push({ code: "diagnostics.truncated", phase: "output", path: [], coordinate: {}, details: { omitted: count === 257 ? 2 : 3 } });
    assert.deepEqual(value.expected.diagnostics, expected);
    if (results.has(count)) assert.deepEqual(value.expected, results.get(count));
    results.set(count, value.expected);
  }
  assert.deepEqual([...results.keys()], [256, 257, 258]);
});
