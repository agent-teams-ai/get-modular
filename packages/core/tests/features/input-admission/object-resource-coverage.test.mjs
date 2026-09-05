import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import test from "node:test";
import { admitObjectInput } from "../../../dist/features/input-admission/object-admission.js";
import { createObjectResourceMeter } from "../../../dist/features/input-admission/object-resource-meter.js";
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

test("batch rejection allocates no downstream document snapshot, including earlier valid documents", () => {
  const original = Object.freeze;
  let snapshots = 0;
  Object.freeze = value => {
    if (["get-modular.module-declaration", "get-modular.composition-profile"].includes(value?.kind)) snapshots += 1;
    return original(value);
  };
  try {
    for (const variant of ["string-first", "values-first"]) {
      const input = coverageInput("key-order", variant);
      const collector = createDiagnosticCollector(createOwnedJcs().canonicalize);
      const result = admitObjectInput(input, collector);
      assert.equal(result.hasErrors, true);
    }
    assert.equal(snapshots, 0, "observe the actual snapshot freeze boundary, not returned counts");
  } finally { Object.freeze = original; }
});

test("oversized hidden tails stop before any proportional descriptor scan or getter", () => {
  const original = Object.getOwnPropertyDescriptors;
  let calls = 0;
  try {
    for (const variant of ["string-first", "string-last", "depth-first", "depth-last"]) {
      const values = coverageInput("oversized-array-hidden-tail", variant).profile.unknown;
      Object.defineProperty(values, "1", { enumerable: true, get() { calls += 1; throw Error("getter"); } });
      Object.getOwnPropertyDescriptors = value => {
        assert.notEqual(value, values, "rejected length must precede descriptor table allocation");
        return original(value);
      };
      const meter = createObjectResourceMeter();
      assert.deepEqual(meter.scanDocument(values), { jsonDepth: 1, nonPlainValue: false, stoppedBy: "jsonValueOccurrences" });
      const stopped = meter.statistics();
      assert.deepEqual(stopped, { jsonValueOccurrences: 2_097_153, aggregateStringBytes: 0,
        peakOpenContainers: 0, ownKeyVisits: 0, arrayIndexCodeUnits: 0 });
      meter.scanDocument({ later: "untouched" });
      assert.deepEqual(meter.statistics(), stopped);
    }
    assert.equal(calls, 0);
  } finally { Object.getOwnPropertyDescriptors = original; }
});

test("symbol/accessor tails preserve bounded parent sibling accounting", () => {
  let calls = 0;
  for (const count of [1, 10_000]) {
    const child = {};
    Object.defineProperty(child, "value", { enumerable: true, get() { calls += 1; throw Error("getter"); } });
    for (let n = 0; n < count; n += 1) child[Symbol()] = "unread";
    const meter = createObjectResourceMeter();
    assert.deepEqual(meter.scanDocument({ child, later: "x" }), { jsonDepth: 2, nonPlainValue: true, stoppedBy: null });
    assert.deepEqual(meter.statistics(), { jsonValueOccurrences: 3, aggregateStringBytes: 16,
      peakOpenContainers: 2, ownKeyVisits: 4, arrayIndexCodeUnits: 0 });
  }
  assert.equal(calls, 0);
});
