// Private resource pass only. Closed schema, owned snapshots, diagnostics and
// the public object compiler remain separate admission/integration gates.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createObjectResourceMeter } from "../../../dist-test/features/input-admission/object-resource-meter.js";
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
      aggregateStringBytes: 0, peakOpenContainers: 0, ownKeyVisits: 0, arrayIndexCodeUnits: 0 });
  } finally { Object.getOwnPropertyDescriptors = original; }
  assert.deepEqual(measure([new Array(3)]).statistics, {
    jsonValueOccurrences: 4, aggregateStringBytes: 0, peakOpenContainers: 1, ownKeyVisits: 1, arrayIndexCodeUnits: 0,
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
    jsonValueOccurrences: 0, aggregateStringBytes: 0, peakOpenContainers: 0, ownKeyVisits: 0, arrayIndexCodeUnits: 0,
  });
  assert.equal(Object.isFrozen(first), true);
});

test("forbidden symbol and array-property tails have constant own work without losing parent siblings", () => {
  for (const array of [false, true]) {
    const observations = [];
    for (const count of [1, 10_000]) {
      const value = array ? [] : {};
      for (let i = 0; i < count; i += 1) Object.defineProperty(value, Symbol(), {
        enumerable: true, get() { throw new Error("forbidden descriptor value must not be read"); },
      });
      const measured = measure([value]);
      assert.deepEqual(measured.documents, [{ jsonDepth: 1, nonPlainValue: true, stoppedBy: null }]);
      assert.equal(measured.statistics.ownKeyVisits, array ? 2 : 1);
      assert.equal(measured.statistics.arrayIndexCodeUnits, 0);
      assert.equal(measured.statistics.jsonValueOccurrences, 1);
      assert.equal(measured.statistics.aggregateStringBytes, 0);
      observations.push(measured);
      const siblings = measure([{ a: value, b: "later" }]);
      assert.deepEqual(siblings.documents, [{ jsonDepth: 2, nonPlainValue: true, stoppedBy: null }]);
      assert.equal(siblings.statistics.ownKeyVisits, array ? 4 : 3);
      assert.equal(siblings.statistics.aggregateStringBytes, 7);
      assert.equal(siblings.statistics.jsonValueOccurrences, 3);
    }
    assert.deepEqual(observations[0], observations[1]);
  }
  for (const key of ["", "x".repeat(1_000_000), "12345678901", "00", "-0", "-1", "0e0", "1e0", "0.5", "4294967295", "4294967296"]) {
    const value = ["ok"];
    Object.defineProperty(value, key, { enumerable: true, get() { throw new Error("extension getter"); } });
    for (let i = 0; i < 10_000; i += 1) value[`tail${i}`] = "not counted";
    const result = measure([value]);
    assert.deepEqual(result.documents, [{ jsonDepth: 1, nonPlainValue: true, stoppedBy: null }]);
    assert.equal(result.statistics.ownKeyVisits, 3);
    assert.equal(result.statistics.jsonValueOccurrences, 2);
    assert.equal(result.statistics.aggregateStringBytes, 2);
    assert.ok(result.statistics.arrayIndexCodeUnits <= 22);
    if (key.length === 0 || key.length > 10) assert.equal(result.statistics.arrayIndexCodeUnits, 2);
    const siblings = measure([{ a: value, b: "later" }]);
    assert.deepEqual(siblings.documents, [{ jsonDepth: 2, nonPlainValue: true, stoppedBy: null }]);
    assert.equal(siblings.statistics.ownKeyVisits, 5);
    assert.equal(siblings.statistics.arrayIndexCodeUnits, result.statistics.arrayIndexCodeUnits);
    assert.equal(siblings.statistics.jsonValueOccurrences, 4);
    assert.equal(siblings.statistics.aggregateStringBytes, 9);
  }
});

test("accepted numeric array keys and ordinary record keys retain their accounting", () => {
  const array = [];
  for (let index = 11; index >= 0; index -= 1) array[index] = null;
  const measured = measure([array]);
  assert.deepEqual(measured.documents, [{ jsonDepth: 1, nonPlainValue: false, stoppedBy: null }]);
  assert.deepEqual(measured.statistics, {
    jsonValueOccurrences: 13, aggregateStringBytes: 0, peakOpenContainers: 1,
    ownKeyVisits: 13, arrayIndexCodeUnits: 28,
  });
  const record = measure([{ "00": "ok", "4294967295": "next" }]);
  assert.deepEqual(record.documents, [{ jsonDepth: 1, nonPlainValue: false, stoppedBy: null }]);
  assert.deepEqual(record.statistics, {
    jsonValueOccurrences: 3, aggregateStringBytes: 18, peakOpenContainers: 1,
    ownKeyVisits: 2, arrayIndexCodeUnits: 0,
  });
});
