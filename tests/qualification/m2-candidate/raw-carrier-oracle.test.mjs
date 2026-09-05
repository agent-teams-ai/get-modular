// Candidate Node-only probes. These do not accept ADR-0013, execute Core,
// qualify another runtime, or replace the full successor evidence transaction.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import test from "node:test";
import {
  classifyByteCarrier, declarationByteLimit, snapshotDeclarationCarrier,
} from "./raw-carrier-oracle.mjs";

const accepted = [
  ["same-realm", () => new Uint8Array([1, 2, 3]), [1, 2, 3]],
  ["empty", () => new Uint8Array(), []],
  ["offset", () => new Uint8Array(new Uint8Array([9, 1, 2, 8]).buffer, 1, 2), [1, 2]],
  ["empty-offset", () => new Uint8Array(new ArrayBuffer(8), 5, 0), []],
  ["cross-realm", () => runInNewContext("new Uint8Array([1, 2, 3])"), [1, 2, 3]],
  ["subclass", () => new (class extends Uint8Array {})([1, 2, 3]), [1, 2, 3]],
  ["node-buffer-offset", () => Buffer.from([9, 1, 2, 8]).subarray(1, 3), [1, 2]],
  ["frozen-empty", () => Object.freeze(new Uint8Array()), []],
  ["nonextensible", () => Object.preventExtensions(new Uint8Array([1, 2, 3])), [1, 2, 3]],
];

for (const [id, make, expected] of accepted) {
  test(`candidate raw carrier: ${id}`, () => {
    const input = make();
    const result = snapshotDeclarationCarrier(input);
    assert.equal(result.ok, true);
    assert.deepEqual([...result.bytes], expected);
    assert.equal(result.copiedBytes, expected.length);
    assert.equal(Object.getPrototypeOf(result.bytes), Uint8Array.prototype);
    assert.equal(result.bytes.buffer.resizable, false);
    assert.equal(result.bytes.byteOffset, 0);
    assert.equal(result.bytes.buffer.byteLength, expected.length);
    assert.notEqual(result.bytes.buffer, input.buffer);
    input.fill(99);
    assert.deepEqual([...result.bytes], expected);
    result.bytes.fill(0);
    assert.deepEqual([...input], expected.map(() => 99));
  });
}

const invalidBrands = [
  ["array", () => [1, 2]], ["arraybuffer", () => new ArrayBuffer(2)],
  ["dataview", () => new DataView(new ArrayBuffer(2))],
  ["uint8clamped", () => new Uint8ClampedArray([1, 2])],
  ["uint16", () => new Uint16Array([1, 2])],
  ["string", () => "{}"], ["null", () => null], ["undefined", () => undefined],
  ["fake-prototype", () => Object.create(Uint8Array.prototype)],
  ["fake-tag", () => ({ [Symbol.toStringTag]: "Uint8Array", length: 2, 0: 1, 1: 2 })],
  ["proxy", () => new Proxy(new Uint8Array([1, 2]), { get() { throw new Error("get trap"); } })],
  ["revoked-proxy", () => { const { proxy, revoke } = Proxy.revocable(new Uint8Array(), {}); revoke(); return proxy; }],
];
for (const [id, make] of invalidBrands) {
  test(`candidate rejects wrong brand: ${id}`, () => {
    assert.deepEqual(snapshotDeclarationCarrier(make()), {
      ok: false, carrierReason: "not-uint8array", copiedBytes: 0,
    });
  });
}

for (const fixedLength of [false, true]) {
  test(`candidate resizable view: ${fixedLength ? "fixed-length" : "length-tracking"}`, () => {
    const buffer = new ArrayBuffer(6, { maxByteLength: 12 });
    const input = fixedLength ? new Uint8Array(buffer, 2, 3) : new Uint8Array(buffer, 2);
    input.set([1, 2, 3]);
    const expected = fixedLength ? [1, 2, 3] : [1, 2, 3, 0];
    const snapshot = snapshotDeclarationCarrier(input);
    assert.deepEqual([...snapshot.bytes], expected);
    buffer.resize(1);
    assert.deepEqual(classifyByteCarrier(input), { reason: "unusable-view" });
    assert.deepEqual([...snapshot.bytes], expected);
    buffer.resize(8);
    const restored = snapshotDeclarationCarrier(input);
    assert.equal(restored.ok, true);
    assert.equal(restored.bytes.length, fixedLength ? 3 : 6);
    assert.deepEqual([...snapshot.bytes], expected);
    buffer.transfer();
    assert.deepEqual(classifyByteCarrier(input), { reason: "unusable-view" });
    assert.deepEqual([...snapshot.bytes], expected);
  });
}

test("candidate distinguishes an in-bounds empty view from an out-of-bounds empty view", () => {
  const buffer = new ArrayBuffer(4, { maxByteLength: 8 });
  const view = new Uint8Array(buffer, 4, 0);
  assert.deepEqual(classifyByteCarrier(view), { visibleLength: 0 });
  buffer.resize(3);
  assert.deepEqual(classifyByteCarrier(view), { reason: "unusable-view" });
  buffer.resize(4);
  assert.deepEqual(classifyByteCarrier(view), { visibleLength: 0 });
});

for (const crossRealm of [false, true]) {
  test(`candidate shared-storage rejection: ${crossRealm ? "cross-realm" : "same-realm"}`, () => {
    const values = crossRealm
      ? runInNewContext("[new Uint8Array(new SharedArrayBuffer(4)), new Uint8Array(new SharedArrayBuffer(4, {maxByteLength:8}))]")
      : [new Uint8Array(new SharedArrayBuffer(4)), new Uint8Array(new SharedArrayBuffer(4, { maxByteLength: 8 }))];
    for (const view of values) {
      assert.deepEqual(snapshotDeclarationCarrier(view), { ok: false, carrierReason: "shared-storage", copiedBytes: 0 });
    }
  });
}

test("candidate detachment and caller mutation before first continuation preserve copied bytes", async () => {
  const input = new Uint8Array([1, 2, 3]);
  const pending = (async () => { const value = snapshotDeclarationCarrier(input); await Promise.resolve(); return value; })();
  input.fill(9);
  structuredClone(input.buffer, { transfer: [input.buffer] });
  assert.deepEqual(classifyByteCarrier(input), { reason: "unusable-view" });
  assert.deepEqual([...(await pending).bytes], [1, 2, 3]);
});

test("candidate intrinsics ignore overridden candidate properties, iterator and species", () => {
  let reads = 0;
  const fail = () => { reads += 1; throw new Error("caller getter executed"); };
  class Poisoned extends Uint8Array { static get [Symbol.species]() { return fail(); } }
  const view = new Poisoned([1, 2, 3]);
  for (const key of ["buffer", "length", "byteOffset", "byteLength", "constructor", "slice", "subarray", Symbol.iterator, Symbol.toStringTag]) {
    Object.defineProperty(view, key, { get: fail });
  }
  const result = snapshotDeclarationCarrier(view);
  assert.equal(result.ok, true);
  assert.deepEqual([...result.bytes], [1, 2, 3]);
  assert.equal(reads, 0);
});

test("candidate intrinsic brand is realm-neutral; instanceof mutation is falsified", () => {
  const crossRealm = runInNewContext("new Uint8Array([1,2])");
  assert.equal(crossRealm instanceof Uint8Array, false);
  assert.deepEqual(classifyByteCarrier(crossRealm), { visibleLength: 2 });
  const poisoned = new Uint8Array([1]);
  Object.defineProperty(poisoned, Symbol.toStringTag, { value: "not-a-view" });
  assert.notEqual(Object.prototype.toString.call(poisoned), "[object Uint8Array]");
  assert.deepEqual(classifyByteCarrier(poisoned), { visibleLength: 1 });
});

test("candidate byte limit uses visible length and does not copy a rejected document", () => {
  const buffer = new ArrayBuffer(declarationByteLimit + 2);
  const exact = new Uint8Array(buffer, 1, declarationByteLimit);
  exact[0] = 7;
  const admitted = snapshotDeclarationCarrier(exact);
  assert.equal(admitted.ok, true);
  assert.equal(admitted.copiedBytes, declarationByteLimit);
  assert.equal(admitted.bytes.buffer.byteLength, declarationByteLimit);
  assert.equal(admitted.bytes[0], 7);
  assert.deepEqual(snapshotDeclarationCarrier(new Uint8Array(buffer, 1)), {
    ok: false, limitName: "declarationRawDocumentBytes", limit: declarationByteLimit,
    actual: declarationByteLimit + 1, copiedBytes: 0,
  });
});

test("candidate allocation witness catches copying before the byte-limit check", () => {
  // Isolated realm instrumentation observes actual constructor calls, rather
  // than trusting the oracle's reported copiedBytes counter. No public hook.
  const oracle = new URL("./raw-carrier-oracle.mjs", import.meta.url).href;
  const script = `import assert from 'node:assert/strict';
    const Native = Uint8Array;
    const allocations = [];
    globalThis.Uint8Array = new Proxy(Native, { construct(target, args) {
      allocations.push(args);
      return Reflect.construct(target, args);
    }});
    const {snapshotDeclarationCarrier, declarationByteLimit} = await import(${JSON.stringify(oracle)});
    const backing = new ArrayBuffer(declarationByteLimit + 2);
    const rejected = new Native(backing, 1);
    assert.equal(snapshotDeclarationCarrier(rejected).ok, false);
    assert.equal(allocations.length, 0);
    const admitted = new Native(backing, 1, declarationByteLimit);
    const result = snapshotDeclarationCarrier(admitted);
    assert.equal(result.ok, true);
    assert.equal(allocations.length, 1);
    assert.equal(allocations[0].length, 1);
    assert.equal(allocations[0][0], admitted);
    assert.equal(result.bytes.buffer.byteLength, declarationByteLimit);`;
  execFileSync(process.execPath, ["--input-type=module", "-e", script], { timeout: 10_000 });
});

test("candidate probes falsify aliasing and whole-buffer copy alternatives", () => {
  const input = Buffer.from([9, 1, 2, 8]).subarray(1, 3);
  const alias = input.slice();
  const correct = snapshotDeclarationCarrier(input).bytes;
  input.fill(7);
  assert.deepEqual([...correct], [1, 2]);
  assert.notDeepEqual([...alias], [1, 2]);
  assert.notEqual(input.buffer.byteLength, correct.buffer.byteLength);
});
