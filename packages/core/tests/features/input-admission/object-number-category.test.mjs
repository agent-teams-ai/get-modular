import assert from "node:assert/strict";
import test from "node:test";
import { createObjectResourceMeter } from "../../../dist-test/features/input-admission/object-resource-meter.js";

test("non-finite own values fail plain admission while finite number semantics remain in schema", () => {
  for (const value of [NaN, Infinity, -Infinity, -0, 1.5, 1e100, Number.MAX_SAFE_INTEGER]) {
    for (const input of [value, { schemaVersion: value }, { unknown: value }, [value]]) {
      const meter = createObjectResourceMeter();
      const scan = meter.scanDocument(input);
      assert.equal(scan.nonPlainValue, !Number.isFinite(value));
      assert.equal(scan.stoppedBy, null);
      assert.equal(meter.statistics().jsonValueOccurrences, typeof input === "object" ? 2 : 1);
    }
  }
});

test("a non-finite value does not stop sibling resource accounting or the next document", () => {
  const meter = createObjectResourceMeter();
  assert.equal(meter.scanDocument({ a: NaN, b: [Infinity, "é"] }).nonPlainValue, true);
  assert.equal(meter.scanDocument({ a: 1 }).nonPlainValue, false);
  assert.equal(meter.statistics().jsonValueOccurrences, 7);
  assert.equal(meter.statistics().aggregateStringBytes, 5);
});
