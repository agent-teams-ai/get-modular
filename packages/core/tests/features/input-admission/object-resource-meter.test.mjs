// Private resource pass only. Closed schema, owned snapshots, diagnostics and
// the public object compiler remain separate admission/integration gates.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createObjectResourceMeter } from "../../../dist/features/input-admission/object-resource-meter.js";
import { meterJsonResources } from "../../../../../tests/qualification/support/resource-profile-v2.mjs";

const limits = JSON.parse(await readFile(new URL("../../../../../architecture/qualification/v1/resource-profile-v2.json", import.meta.url), "utf8")).limits;
const chain = count => { let value = null; for (let i = 0; i < count; i += 1) value = [value]; return value; };

function measure(values) {
  const meter = createObjectResourceMeter();
  const documents = values.map(value => meter.scanDocument(value));
  return { documents, statistics: meter.statistics() };
}

test("counts roots, containers, scalars, keys and shared occurrences like the independent oracle", () => {
  const shared = { "😀": "é" };
  const cycle = {}; cycle.self = cycle;
  const values = [null, true, 42, "abc", { a: shared, b: shared }, [shared, shared], cycle, new Array(3)];
  const expected = meterJsonResources(values, limits);
  const { documents, statistics } = measure(values);
  assert.equal(statistics.jsonValueOccurrences, expected.jsonValueOccurrences);
  assert.equal(statistics.aggregateStringBytes, expected.aggregateStringBytes);
  assert.equal(Math.max(...documents.map(item => item.jsonDepth)), expected.jsonDepth);
  assert.deepEqual(documents.map(item => item.nonPlainValue), [false, false, false, false, false, false, true, true]);
  assert.ok(documents.every(item => item.stoppedBy === null));
});

test("UTF-8 accounting agrees with Buffer for all scalar widths and surrogate spellings", () => {
  const samples = ["", "a", "\u007f", "\u0080", "\u07ff", "\u0800", "\uffff", "😀", "\ud800", "\udc00", "\ud800a", "a\udc00", "\ud800\ud800\udc00"];
  const meter = createObjectResourceMeter();
  for (const value of samples) assert.equal(meter.scanDocument(value).stoppedBy, null);
  assert.equal(meter.statistics().aggregateStringBytes, samples.reduce((sum, item) => sum + Buffer.byteLength(item), 0));
  assert.equal(meter.statistics().jsonValueOccurrences, samples.length);
});

test("string budget includes unknown keys and is inclusive with saturating overflow", () => {
  const at = { "é": "x".repeat(limits.aggregateStringBytes - 2) };
  const meter = createObjectResourceMeter();
  assert.equal(meter.scanDocument(at).stoppedBy, null);
  assert.equal(meter.statistics().aggregateStringBytes, limits.aggregateStringBytes);
  assert.equal(meter.scanDocument("a").stoppedBy, "aggregateStringBytes");
  assert.equal(meter.statistics().aggregateStringBytes, limits.aggregateStringBytes + 1);
  const statistics = meter.statistics();
  assert.equal(meter.scanDocument({ hidden: "not visited" }).stoppedBy, "aggregateStringBytes");
  assert.deepEqual(meter.statistics(), statistics);
});

test("shared dense arrays reach the value boundary without deduplicating their identities", () => {
  const shared = new Array(1024).fill(null);
  // 1 outer array + 2047 positions + 2046 * 1024 inner positions = 2097152.
  const values = [...new Array(2046).fill(shared), null];
  const meter = createObjectResourceMeter();
  assert.deepEqual(meter.scanDocument(values), { jsonDepth: 2, nonPlainValue: false, stoppedBy: null });
  assert.equal(meter.statistics().jsonValueOccurrences, limits.jsonValueOccurrences);
  assert.equal(meter.statistics().peakOpenContainers, 2);
  assert.equal(meter.scanDocument(null).stoppedBy, "jsonValueOccurrences");
  assert.equal(meter.statistics().jsonValueOccurrences, limits.jsonValueOccurrences + 1);
  const statistics = meter.statistics();
  meter.scanDocument(values);
  assert.deepEqual(meter.statistics(), statistics);
});

test("sparse attempted positions are reserved before rejected-dimension reflection", () => {
  const oversized = new Array(0xffffffff);
  const original = Object.getOwnPropertyDescriptors;
  Object.getOwnPropertyDescriptors = value => {
    if (value === oversized) throw new Error("proportional reflection after rejected length");
    return original(value);
  };
  try {
    const meter = createObjectResourceMeter();
    assert.equal(meter.scanDocument(oversized).stoppedBy, "jsonValueOccurrences");
    assert.deepEqual(meter.statistics(), { jsonValueOccurrences: limits.jsonValueOccurrences + 1,
      aggregateStringBytes: 0, peakOpenContainers: 0 });
  } finally { Object.getOwnPropertyDescriptors = original; }
  assert.deepEqual(measure([new Array(3)]).statistics, {
    jsonValueOccurrences: 4, aggregateStringBytes: 0, peakOpenContainers: 1,
  });
});

test("depth 32 passes, depth 33 stops locally, and later independent documents continue", () => {
  const meter = createObjectResourceMeter();
  assert.deepEqual(meter.scanDocument(chain(limits.jsonDepth)), { jsonDepth: 32, nonPlainValue: false, stoppedBy: null });
  assert.deepEqual(meter.scanDocument(chain(12_000)), { jsonDepth: 33, nonPlainValue: false, stoppedBy: "jsonDepth" });
  assert.deepEqual(meter.scanDocument({ next: "document" }), { jsonDepth: 1, nonPlainValue: false, stoppedBy: null });
  assert.equal(meter.statistics().peakOpenContainers, 32);
  assert.equal(meter.statistics().jsonValueOccurrences, 33 + 33 + 2);
});

test("rejectable descriptor forms are observed without invoking any accessor", () => {
  let calls = 0;
  const getter = () => { calls += 1; throw new Error("getter must not run"); };
  const accessor = Object.defineProperty({}, "value", { enumerable: true, get: getter });
  const hidden = Object.defineProperty({}, "value", { value: "text", enumerable: false });
  const symbols = { [Symbol("private")]: "text" };
  const extended = Object.assign([], { extension: "text" });
  const indexed = Object.defineProperty(new Array(1), "0", { enumerable: true, get: getter });
  for (const value of [accessor, hidden, symbols, extended, indexed, new Date(), undefined, () => {}]) {
    const result = measure([value]);
    assert.equal(result.documents[0].nonPlainValue, true);
    assert.equal(result.documents[0].stoppedBy, null);
  }
  assert.equal(calls, 0);
  assert.equal(measure([indexed]).statistics.jsonValueOccurrences, 2, "array positions precede descriptor rejection");
});

test("property names stay data and completed calls retain no active traversal state", () => {
  const value = JSON.parse('{"__proto__":1,"constructor":2,"toJSON":3}');
  const meter = createObjectResourceMeter();
  assert.deepEqual(meter.scanDocument(value), { jsonDepth: 1, nonPlainValue: false, stoppedBy: null });
  const first = meter.statistics();
  value.toJSON = "changed";
  assert.deepEqual(meter.statistics(), first);
  assert.equal(meter.scanDocument(value).nonPlainValue, false);
  assert.equal(meter.statistics().jsonValueOccurrences, 8);
  assert.deepEqual(createObjectResourceMeter().statistics(), {
    jsonValueOccurrences: 0, aggregateStringBytes: 0, peakOpenContainers: 0,
  });
  assert.equal(Object.isFrozen(first), true);
});
