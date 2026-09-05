// Private ordering/collection only. Candidate generation, normalization,
// deduplication and public compiler qualification remain producer/integration gates.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import canonicalizeOracle from "canonicalize";
import { canonicalize as secondOracle } from "json-canonicalize";
import { compareDiagnostics, createDiagnosticCollector } from "../../../dist-test/features/diagnostics/internal.js";
import { createOwnedJcs } from "../../../dist-test/features/canonicalization/owned-jcs/factory.js";

const root = new URL("../../../../../", import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), "utf8"));
const snapshots = await read("architecture/qualification/v1/diagnostic-snapshots.json");
const catalog = await read("architecture/contracts/v1/diagnostic-catalog.json");
const resource = (await read("architecture/qualification/v1/resource-boundary-vectors.json")).diagnosticCollector;
const byName = new Map(snapshots.snapshots.map(value => [value.name, value.diagnostic]));
const canonicalize = createOwnedJcs({}).canonicalize;
const compare = (a, b) => compareDiagnostics(a, b, canonicalize);
const permutations = values => values.length === 0 ? [[]] : values.flatMap((value, index) =>
  permutations(values.filter((_, other) => other !== index)).map(rest => [value, ...rest]));
const materialize = operand => Object.assign(structuredClone(byName.get(operand.snapshot)), structuredClone(operand.override ?? {}));

for (const vector of snapshots.orderingCases) {
  test(`normative comparator axis: ${vector.name}`, () => {
    const operands = vector.operands.map(operand => ({ name: operand.name, diagnostic: materialize(operand) }));
    for (const order of permutations(operands)) {
      assert.deepEqual(order.sort((a, b) => compare(a.diagnostic, b.diagnostic)).map(value => value.name), vector.expected);
    }
    for (const a of operands) for (const b of operands) {
      assert.equal(Math.sign(compare(a.diagnostic, b.diagnostic)) || 0, -Math.sign(compare(b.diagnostic, a.diagnostic)) || 0);
    }
  });
}

test("orders every emittable snapshot by phase then catalog rank", () => {
  const expected = catalog.ordering.phases.flatMap(phase => catalog.ordering.codes.flatMap(code =>
    snapshots.snapshots.filter(item => item.diagnostic.phase === phase && item.diagnostic.code === code)));
  assert.equal(expected.length, 30);
  for (let start = 0; start < expected.length; start += 1) {
    const rotated = [...expected.slice(start), ...expected.slice(0, start)].reverse();
    assert.deepEqual(rotated.sort((a, b) => compare(a.diagnostic, b.diagnostic)), expected);
  }
});

test("orders SCC arrays lexicographically with shorter prefixes first", () => {
  const components = [["example/a"], ["example/a", "example/b"], ["example/a", "example/c"], ["example/b"]];
  const diagnostics = components.map(component => ({ code: "graph.cycle", phase: "graph", path: [], coordinate: {}, details: { component } }));
  const noCanonicalizer = () => { throw new Error("SCC order must not use canonical detail bytes"); };
  for (const order of permutations(diagnostics)) {
    assert.deepEqual(order.sort((a, b) => compareDiagnostics(a, b, noCanonicalizer)), diagnostics);
  }
});

test("absent coordinate fields never consult inherited getters", () => {
  const entry = new URL("../../../dist-test/features/diagnostics/internal.js", import.meta.url).href;
  // Isolate the prototype mutation from the test runner and all other tests.
  const script = `import assert from 'node:assert/strict';
    import {compareDiagnostics} from ${JSON.stringify(entry)};
    const left={code:'binding.unknown-provider',phase:'binding',path:[],
      coordinate:{implementationId:'example/a',slotId:'dependency',providerImplementationId:'example/provider'},details:{reason:'unknown'}};
    const right={...left,coordinate:{...left.coordinate,implementationId:'example/z'}};
    Object.defineProperty(Object.prototype,'moduleId',{configurable:true,get(){throw new Error('inherited getter called');}});
    try {assert.ok(compareDiagnostics(left,right,()=>{throw new Error('details are not decisive');})<0);}
    finally {delete Object.prototype.moduleId;}`;
  execFileSync(process.execPath, ["--input-type=module", "-e", script], { timeout: 10_000 });
});

test("uses complete RFC8785 detail bytes from the supplied function", () => {
  for (const vector of snapshots.detailCanonicalizationCases) {
    const text = canonicalizeOracle(vector.details);
    assert.equal(secondOracle(vector.details), text);
    assert.equal(Buffer.from(canonicalize(vector.details)).toString("hex"), vector.canonicalUtf8Hex);
  }
  const vector = snapshots.orderingCases.find(item => item.axis === "details.rfc8785");
  const [left, right] = vector.operands.map(materialize);
  assert.ok(compare(left, right) < 0);
  let calls = 0;
  const storage = new Uint8Array(5);
  const witness = details => {
    calls += 1;
    storage.set([255, details.actual === 10 ? 2 : 1, 0, 0, 255]);
    return storage.subarray(1, 4);
  };
  // Decisive provider bytes reverse the result. Reused scratch storage and a
  // nonzero view offset must not erase the first operand or expose padding.
  assert.ok(compareDiagnostics(left, right, witness) > 0);
  assert.equal(calls, 2);
  const prefix = details => details.actual === 10 ? Uint8Array.of(1) : Uint8Array.of(1, 0);
  assert.ok(compareDiagnostics(left, right, prefix) < 0);
  const failure = new Error("private-detail-primitive-failure");
  assert.throws(() => compareDiagnostics(left, right, () => { throw failure; }), error => error === failure);
});

test("private collector witness reverses and restores accepted detail operands", () => {
  // Comparator operands only: a single input is not claimed to emit both errors.
  // The composition-semantics consumer-factory regression joins its later slice.
  const vector = snapshots.orderingCases.find(item => item.axis === "details.rfc8785");
  const operands = vector.operands.map(materialize);
  const witness = details => Uint8Array.of(details.actual === 10 ? 2 : 1);
  const finish = (provider, values) => {
    const collector = createDiagnosticCollector(provider);
    for (const value of values) collector.addUnique(value);
    return collector.finish();
  };
  for (const values of permutations(operands)) {
    assert.deepEqual(finish(canonicalize, values), operands);
    assert.deepEqual(finish(witness, values), [...operands].reverse());
    assert.deepEqual(finish(canonicalize, values), operands);
  }
});

function candidate(index) {
  const id = `${resource.candidateTemplate.idPrefix}${String(index).padStart(resource.candidateTemplate.decimalWidth, "0")}`;
  return { code: "profile.unknown-root", phase: "profile", path: [],
    coordinate: { moduleId: `example/${id}` }, details: { reason: "unknown" } };
}

for (const vector of resource.cases) for (const permutationName of vector.permutationNames) {
  test(`bounded collection: ${vector.name}/${permutationName}`, () => {
    const collector = createDiagnosticCollector(canonicalize);
    const permutation = resource.permutations.find(item => item.name === permutationName);
    for (let offset = 0; offset < vector.failureCount; offset += 1) {
      const index = permutation.kind === "ascending" ? offset
        : permutation.kind === "reverse" ? vector.failureCount - 1 - offset
          : (permutation.start + offset * permutation.stride) % vector.failureCount;
      collector.addUnique(candidate(index));
      if (offset === 256) assert.equal(collector.statistics().retainedCount, 256);
    }
    const result = collector.finish();
    const expected = resource.expectedRetainedIdSets[vector.expectedRetainedIdSet];
    assert.deepEqual(result.filter(item => item.code !== "diagnostics.truncated").map(item => item.coordinate.moduleId), expected.map(id => `example/${id}`));
    assert.deepEqual(result.filter(item => item.code === "diagnostics.truncated"), vector.expectedTruncation === null ? [] : [{
      code: "diagnostics.truncated", phase: "output", path: [], coordinate: {}, details: vector.expectedTruncation,
    }]);
    const statistics = collector.statistics();
    assert.equal(statistics.peakRetained, vector.expectedPeakRetained);
    assert.equal(statistics.saturatedFailureCount, vector.expectedSaturatedFailureCount);
    assert.equal(statistics.failureCountSaturated, vector.expectedFailureCountSaturated);
    assert.ok(statistics.retainedCount <= 256);
    assert.ok(statistics.comparisons <= vector.failureCount * 20 + 256 * 16, "heap processing is bounded by logarithmic K work per candidate");
    assert.equal(collector.finish(), result);
    assert.equal(Object.isFrozen(result), true);
    assert.throws(() => collector.addUnique(candidate(0)), /finalized/u);
  });
}

test("empty and small collections retain every error and isolate calls", () => {
  const empty = createDiagnosticCollector(canonicalize);
  assert.deepEqual(empty.finish(), []);
  assert.equal(empty.statistics().retainedCount, 0);
  const first = createDiagnosticCollector(canonicalize);
  const second = createDiagnosticCollector(canonicalize);
  first.addUnique(candidate(1));
  second.addUnique(candidate(2));
  assert.deepEqual(first.finish(), [candidate(1)]);
  assert.deepEqual(second.finish(), [candidate(2)]);
});

test("retained diagnostics own and freeze every nested container", () => {
  const collector = createDiagnosticCollector(canonicalize);
  const sources = snapshots.snapshots.filter(item => item.diagnostic.code !== "diagnostics.truncated")
    .map(item => structuredClone(item.diagnostic));
  const expected = structuredClone(sources).sort(compare);
  const containers = value => {
    const seen = new Set();
    const pending = [value];
    while (pending.length > 0) {
      const item = pending.pop();
      if (item === null || typeof item !== "object" || seen.has(item)) continue;
      seen.add(item);
      pending.push(...Object.values(item));
    }
    return seen;
  };
  const originalContainers = containers(sources);
  for (const value of sources) collector.addUnique(value);
  for (const item of originalContainers) {
    assert.equal(Object.isFrozen(item), false);
    if (Array.isArray(item)) item.length = 0;
    else for (const key of Object.keys(item)) item[key] = "caller-mutation";
  }
  const result = collector.finish();
  assert.deepEqual(result, expected);
  for (const item of containers(result)) {
    assert.equal(originalContainers.has(item), false);
    assert.equal(Object.isFrozen(item), true);
    assert.throws(() => Object.defineProperty(item, "mutated", { value: 1 }), TypeError);
  }
});

test("retains late decisive detail failures using the injected canonicalizer", () => {
  // Each actual value is a distinct normalized candidate; generation deduplication
  // is deliberately not simulated by an unbounded set in the production heap.
  const make = actual => ({ code: "input.limit-exceeded", phase: "schema", path: [], coordinate: {},
    details: { limitName: "jsonValueOccurrences", limit: 1, actual } });
  const reverseNumeric = details => Uint8Array.of(255 - (details.actual >>> 8), 255 - (details.actual & 255));
  const collector = createDiagnosticCollector(reverseNumeric);
  for (let index = 1; index <= 258; index += 1) collector.addUnique(make(index));
  const result = collector.finish();
  assert.deepEqual(result.slice(0, -1).map(item => item.details.actual), Array.from({ length: 255 }, (_, index) => 258 - index));
  assert.equal(result.at(-1).details.omitted, 3);
  assert.ok(collector.statistics().comparisons < 258 * 20 + 256 * 16);
});
