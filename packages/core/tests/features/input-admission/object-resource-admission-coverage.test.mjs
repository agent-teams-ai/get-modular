import assert from "node:assert/strict";
import test from "node:test";
import { admitObjectInput } from "../../../dist/features/input-admission/object-admission.js";
import { createObjectResourceMeter } from "../../../dist/features/input-admission/object-resource-meter.js";
import { createDiagnosticCollector } from "../../../dist/features/diagnostics/internal.js";
import { createOwnedJcs } from "../../../dist/features/canonicalization/owned-jcs/factory.js";
import { coverageInput } from "./object-resource-coverage-cases.mjs";


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
