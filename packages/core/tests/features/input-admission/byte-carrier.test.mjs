import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import {
  classifyByteCarrier,
  copyByteCarrier,
} from "../../../dist-test/features/input-admission/byte-carrier.js";

function assertAdmitted(value, visibleLength) {
  const result = classifyByteCarrier(value);
  assert.deepEqual(result, { kind: "admitted", visibleLength });
  assert.deepEqual(Reflect.ownKeys(result), ["kind", "visibleLength"]);
}

function assertRejected(value, reason, message) {
  const result = classifyByteCarrier(value);
  assert.deepEqual(result, { kind: "rejected", reason }, message);
  assert.deepEqual(Reflect.ownKeys(result), ["kind", "reason"], message);
}

function assertOwnedBytes(bytes, expected, sourceBuffer) {
  assert.equal(Object.getPrototypeOf(bytes), Uint8Array.prototype);
  assert.equal(Object.getPrototypeOf(bytes.buffer), ArrayBuffer.prototype);
  assert.notEqual(bytes.buffer, sourceBuffer);
  assert.equal(bytes.byteOffset, 0);
  assert.equal(bytes.length, expected.length);
  assert.equal(bytes.byteLength, expected.length);
  assert.equal(bytes.buffer.byteLength, expected.length);
  assert.equal(bytes.buffer.maxByteLength, expected.length);
  assert.equal(bytes.buffer.resizable, false);
  assert.deepEqual(Array.from(bytes), expected);
}

function poisonReads(target, reads) {
  const keys = [
    "buffer", "byteLength", "byteOffset", "length", "constructor",
    "resizable", "maxByteLength", "slice", "subarray", "at", "set",
    "copyWithin", "values", "entries", "keys", "forEach",
    Symbol.iterator, Symbol.species, Symbol.toStringTag,
  ];
  for (const key of keys) {
    Object.defineProperty(target, key, {
      configurable: true,
      get() {
        reads.push(key);
        throw new Error("Forbidden carrier property read");
      },
    });
  }
  return target;
}

test("copies only the visible fixed-buffer bytes with independent ownership", () => {
  const storage = new Uint8Array([200, 1, 2, 3, 201]);
  const input = new Uint8Array(storage.buffer, 1, 3);
  assertAdmitted(input, 3);
  const copy = copyByteCarrier(input);
  assertOwnedBytes(copy, [1, 2, 3], storage.buffer);

  input[0] = 9;
  assertOwnedBytes(copy, [1, 2, 3], storage.buffer);
  copy[1] = 8;
  assert.deepEqual(Array.from(storage), [200, 9, 2, 3, 201]);

  const another = copyByteCarrier(input);
  assertOwnedBytes(another, [9, 2, 3], storage.buffer);
  assert.notEqual(another.buffer, copy.buffer);
});

test("admits usable empty views and gives each copy its own empty buffer", () => {
  for (const input of [
    new Uint8Array(0),
    new Uint8Array(new ArrayBuffer(5), 3, 0),
    new Uint8Array(new ArrayBuffer(5), 5, 0),
  ]) {
    assertAdmitted(input, 0);
    const first = copyByteCarrier(input);
    const second = copyByteCarrier(input);
    assertOwnedBytes(first, [], input.buffer);
    assertOwnedBytes(second, [], input.buffer);
    assert.notEqual(first.buffer, second.buffer);
  }
});

test("admits actual foreign-realm views and copies into this realm", () => {
  const foreign = runInNewContext(`(() => {
    const storage = new ArrayBuffer(7);
    new Uint8Array(storage).set([90, 91, 5, 0, 255, 92, 93]);
    return {
      storage,
      view: new Uint8Array(storage, 2, 3),
      empty: new Uint8Array(storage, 7, 0),
    };
  })()`);
  assert.notEqual(Object.getPrototypeOf(foreign.view), Uint8Array.prototype);
  assert.notEqual(Object.getPrototypeOf(foreign.storage), ArrayBuffer.prototype);
  assertAdmitted(foreign.view, 3);
  assertAdmitted(foreign.empty, 0);
  const copy = copyByteCarrier(foreign.view);
  const emptyCopy = copyByteCarrier(foreign.empty);
  assertOwnedBytes(copy, [5, 0, 255], foreign.storage);
  assertOwnedBytes(emptyCopy, [], foreign.storage);

  foreign.view.fill(42);
  const transferred = structuredClone(foreign.storage, { transfer: [foreign.storage] });
  new Uint8Array(transferred).fill(0);
  assertOwnedBytes(copy, [5, 0, 255], foreign.storage);
  assertOwnedBytes(emptyCopy, [], foreign.storage);
});

test("ignores hostile own getters on a genuine view and its backing buffer", () => {
  const reads = [];
  const storage = new ArrayBuffer(6);
  new Uint8Array(storage).set([80, 11, 22, 33, 81, 82]);
  const input = new Uint8Array(storage, 1, 3);
  poisonReads(input, reads);
  poisonReads(storage, reads);

  assertAdmitted(input, 3);
  const copy = copyByteCarrier(input);
  assertOwnedBytes(copy, [11, 22, 33], storage);
  input[0] = 99;
  assertOwnedBytes(copy, [11, 22, 33], storage);
  assert.deepEqual(reads, []);
});

test("ignores subclass getters, iterator hooks, constructor and species", () => {
  const reads = [];
  class HostileBytes extends Uint8Array {
    static get [Symbol.species]() {
      reads.push("species");
      throw new Error("Forbidden species lookup");
    }
  }
  const storage = new ArrayBuffer(7);
  new Uint8Array(storage).set([90, 91, 7, 8, 9, 92, 93]);
  const input = new HostileBytes(storage, 2, 3);
  const empty = new HostileBytes(storage, 7, 0);
  poisonReads(HostileBytes.prototype, reads);

  assertAdmitted(input, 3);
  assertAdmitted(empty, 0);
  assertOwnedBytes(copyByteCarrier(input), [7, 8, 9], storage);
  assertOwnedBytes(copyByteCarrier(empty), [], storage);
  assert.deepEqual(reads, []);
});

test("uses internal slots even when a genuine view has a null prototype", () => {
  const input = new Uint8Array([6, 7]);
  const storage = input.buffer;
  Object.setPrototypeOf(input, null);
  assertAdmitted(input, 2);
  assertOwnedBytes(copyByteCarrier(input), [6, 7], storage);
});

test("copies an offset Node Buffer without outside bytes or Buffer aliasing", () => {
  const storage = Buffer.from([200, 17, 34, 51, 201]);
  const input = storage.subarray(1, 4);
  assert.ok(input.byteOffset > 0);
  assertAdmitted(input, 3);
  const copy = copyByteCarrier(input);
  assertOwnedBytes(copy, [17, 34, 51], storage.buffer);

  storage.fill(0);
  assertOwnedBytes(copy, [17, 34, 51], storage.buffer);
  copy[0] = 99;
  assert.equal(input[0], 0);

  const empty = storage.subarray(3, 3);
  assertAdmitted(empty, 0);
  assertOwnedBytes(copyByteCarrier(empty), [], storage.buffer);
});

test("rejects non-byte brands, fake views and proxies without invoking hooks", () => {
  const reads = [];
  const forbidden = () => {
    reads.push("proxy trap");
    throw new Error("Forbidden proxy trap");
  };
  const handler = {
    get: forbidden,
    getPrototypeOf: forbidden,
    getOwnPropertyDescriptor: forbidden,
    ownKeys: forbidden,
    has: forbidden,
  };
  const revoked = Proxy.revocable(new Uint8Array([1]), handler);
  revoked.revoke();
  const fake = poisonReads(Object.create(null), reads);
  const spoofed = { 0: 1, length: 1, [Symbol.toStringTag]: "Uint8Array" };
  const cases = [
    ["undefined", undefined], ["null", null], ["boolean", true],
    ["number", 1], ["bigint", 1n], ["string", "bytes"],
    ["symbol", Symbol("bytes")], ["function", () => {}],
    ["record", {}], ["array", [1]], ["fake getters", fake],
    ["spoofed tag", spoofed],
    ["borrowed prototype", Object.create(Uint8Array.prototype)],
    ["inherited genuine view", Object.create(new Uint8Array([1]))],
    ["array buffer", new ArrayBuffer(2)],
    ["shared buffer", new SharedArrayBuffer(2)],
    ["data view", new DataView(new ArrayBuffer(2))],
    ["signed bytes", new Int8Array(1)],
    ["clamped bytes", new Uint8ClampedArray(1)],
    ["unsigned words", new Uint16Array(1)],
    ["signed words", new Int16Array(1)],
    ["unsigned integers", new Uint32Array(1)],
    ["signed integers", new Int32Array(1)],
    ["floats", new Float32Array(1)],
    ["doubles", new Float64Array(1)],
    ["signed bigints", new BigInt64Array(1)],
    ["unsigned bigints", new BigUint64Array(1)],
    ["transparent proxy", new Proxy(new Uint8Array([1]), {})],
    ["hostile proxy", new Proxy(new Uint8Array([1]), handler)],
    ["revoked proxy", revoked.proxy],
    ["foreign wrong brand", runInNewContext("new Uint8ClampedArray(1)")],
  ];
  for (const [label, value] of cases) {
    assertRejected(value, "not-uint8array", label);
  }
  assert.deepEqual(reads, []);
});

test("rejects fixed, growable and foreign shared storage, including empty views", () => {
  const cases = [
    [new SharedArrayBuffer(4), false],
    [new SharedArrayBuffer(4, { maxByteLength: 8 }), true],
    [runInNewContext("new SharedArrayBuffer(4)"), false],
    [runInNewContext("new SharedArrayBuffer(4, { maxByteLength: 8 })"), true],
  ];
  for (const [storage, growable] of cases) {
    assert.equal(storage.growable, growable);
    for (const [offset, length] of [[0, 0], [1, 0], [1, 2]]) {
      const input = new Uint8Array(storage, offset, length);
      Object.defineProperty(input, "buffer", { value: new ArrayBuffer(2) });
      assertRejected(input, "shared-storage");
    }
    const tracking = new Uint8Array(storage);
    assertRejected(tracking, "shared-storage");
    if (growable) {
      storage.grow(8);
      assertRejected(tracking, "shared-storage");
    }

    const otherBrand = new Uint8ClampedArray(storage);
    Object.defineProperty(otherBrand, Symbol.toStringTag, { value: "Uint8Array" });
    assertRejected(otherBrand, "not-uint8array");
  }
  for (const expression of [
    "new Uint8Array(new SharedArrayBuffer(4), 1, 2)",
    "new Uint8Array(new SharedArrayBuffer(4, { maxByteLength: 8 }), 1, 0)",
  ]) {
    assertRejected(runInNewContext(expression), "shared-storage");
  }
});

test("rejects detached originally empty and nonempty views as unusable", () => {
  for (const initialLength of [0, 4]) {
    const storage = new ArrayBuffer(initialLength);
    const input = new Uint8Array(storage);
    const empty = new Uint8Array(storage, initialLength, 0);
    const otherBrand = new Uint8ClampedArray(storage);
    assertAdmitted(input, initialLength);
    assertAdmitted(empty, 0);

    const transferred = structuredClone(storage, { transfer: [storage] });
    assert.equal(transferred.byteLength, initialLength);
    assert.throws(() => new Uint8Array(storage), TypeError);
    assertRejected(input, "unusable-view");
    assertRejected(empty, "unusable-view");
    assertRejected(otherBrand, "not-uint8array");
  }

  const foreign = runInNewContext("[new Uint8Array(0), new Uint8Array([1, 2, 3])]");
  for (const input of foreign) {
    const storage = input.buffer;
    structuredClone(storage, { transfer: [storage] });
    assertRejected(input, "unusable-view");
  }
});

test("distinguishes resizable out-of-bounds views from usable empty views", () => {
  const storage = new ArrayBuffer(8, { maxByteLength: 16 });
  assert.equal(storage.resizable, true);
  const views = [
    new Uint8Array(storage, 2, 3),
    new Uint8Array(storage, 2),
    new Uint8Array(storage, 8, 0),
    new Uint8Array(storage, 8),
    new Uint8Array(storage, 0, 0),
    new Uint8Array(storage),
  ];
  // null denotes an unusable view, whose intrinsic length alone is also zero.
  const transitions = [
    [8, [3, 6, 0, 0, 0, 8]],
    [5, [3, 3, null, null, 0, 5]],
    [4, [null, 2, null, null, 0, 4]],
    [2, [null, 0, null, null, 0, 2]],
    [1, [null, null, null, null, 0, 1]],
    [0, [null, null, null, null, 0, 0]],
    [8, [3, 6, 0, 0, 0, 8]],
  ];
  for (const [size, expectedLengths] of transitions) {
    storage.resize(size);
    for (let index = 0; index < views.length; index += 1) {
      const expectedLength = expectedLengths[index];
      if (expectedLength === null) {
        assert.equal(views[index].length, 0);
        assertRejected(views[index], "unusable-view");
      } else {
        assertAdmitted(views[index], expectedLength);
      }
    }
  }

  const otherBrand = new Uint8ClampedArray(storage, 2, 3);
  storage.resize(0);
  assertRejected(otherBrand, "not-uint8array");
});

test("classifies foreign resizable views through bounds transitions", () => {
  const foreign = runInNewContext(`(() => {
    const storage = new ArrayBuffer(4, { maxByteLength: 8 });
    new Uint8Array(storage).set([90, 91, 12, 13]);
    return {
      storage,
      fixed: new Uint8Array(storage, 2, 2),
      tracking: new Uint8Array(storage, 2),
    };
  })()`);
  assert.equal(foreign.storage.resizable, true);
  assertAdmitted(foreign.fixed, 2);
  assertAdmitted(foreign.tracking, 2);
  const copy = copyByteCarrier(foreign.fixed);
  foreign.storage.resize(2);
  assertRejected(foreign.fixed, "unusable-view");
  assertAdmitted(foreign.tracking, 0);
  assertOwnedBytes(copyByteCarrier(foreign.tracking), [], foreign.storage);
  foreign.storage.resize(1);
  assertRejected(foreign.tracking, "unusable-view");
  foreign.storage.resize(4);
  assertAdmitted(foreign.fixed, 2);
  assertOwnedBytes(copyByteCarrier(foreign.fixed), [0, 0], foreign.storage);
  assertOwnedBytes(copy, [12, 13], foreign.storage);
});

test("copies current resizable view contents before later mutation, resize and detach", () => {
  for (const tracking of [false, true]) {
    const storage = new ArrayBuffer(8, { maxByteLength: 16 });
    new Uint8Array(storage).set([90, 91, 10, 20, 30, 93, 94, 95]);
    const input = tracking
      ? new Uint8Array(storage, 2)
      : new Uint8Array(storage, 2, 3);
    const expected = tracking ? [10, 20, 30, 93, 94, 95] : [10, 20, 30];
    assertAdmitted(input, expected.length);
    const copy = copyByteCarrier(input);
    assertOwnedBytes(copy, expected, storage);

    storage.resize(5);
    assertAdmitted(input, 3);
    const shortened = copyByteCarrier(input);
    assertOwnedBytes(shortened, [10, 20, 30], storage);
    assert.notEqual(copy.buffer, shortened.buffer);

    input[0] = 200;
    storage.resize(1);
    assertRejected(input, "unusable-view");
    assertOwnedBytes(copy, expected, storage);
    assertOwnedBytes(shortened, [10, 20, 30], storage);

    storage.resize(12);
    new Uint8Array(storage).fill(0);
    assertOwnedBytes(copy, expected, storage);
    assertOwnedBytes(shortened, [10, 20, 30], storage);

    const transferred = structuredClone(storage, { transfer: [storage] });
    new Uint8Array(transferred).fill(255);
    assertRejected(input, "unusable-view");
    assertOwnedBytes(copy, expected, storage);
    assertOwnedBytes(shortened, [10, 20, 30], storage);
  }
});

test("empty resizable-view copies stay empty after growth and detachment", () => {
  for (const tracking of [false, true]) {
    const storage = new ArrayBuffer(4, { maxByteLength: 8 });
    const input = tracking
      ? new Uint8Array(storage, 4)
      : new Uint8Array(storage, 4, 0);
    assertAdmitted(input, 0);
    const copy = copyByteCarrier(input);
    storage.resize(8);
    new Uint8Array(storage).fill(7);
    assertAdmitted(input, tracking ? 4 : 0);
    assertOwnedBytes(copy, [], storage);
    structuredClone(storage, { transfer: [storage] });
    assertOwnedBytes(copy, [], storage);
  }
});

test("classification and copying use intrinsics captured before later patches", () => {
  const ordinary = new Uint8Array([4, 5]);
  const storage = ordinary.buffer;
  const empty = new Uint8Array(0);
  const shared = new Uint8Array(new SharedArrayBuffer(2));
  const otherBrand = new Uint8ClampedArray(1);
  const detached = new Uint8Array(1);
  structuredClone(detached.buffer, { transfer: [detached.buffer] });
  const resizable = new ArrayBuffer(4, { maxByteLength: 8 });
  const outOfBounds = new Uint8Array(resizable, 2, 2);
  resizable.resize(1);
  const inputs = [ordinary, empty, shared, otherBrand, detached, outOfBounds];

  const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
  const defineProperty = Object.defineProperty;
  let forbiddenCalls = 0;
  const forbidden = () => {
    forbiddenCalls += 1;
    throw new Error("A replaced intrinsic was consulted");
  };
  const changes = [
    [typedArrayPrototype, Symbol.toStringTag, { get: forbidden }],
    [typedArrayPrototype, "buffer", { get: forbidden }],
    [typedArrayPrototype, "length", { get: forbidden }],
    [typedArrayPrototype, "at", { value: forbidden }],
    [ArrayBuffer.prototype, "byteLength", { get: forbidden }],
    [Object, "getPrototypeOf", { value: forbidden }],
    [Object, "getOwnPropertyDescriptor", { value: forbidden }],
    [Function.prototype, "call", { value: forbidden }],
    [Function.prototype, "apply", { value: forbidden }],
    [Reflect, "apply", { value: forbidden }],
    [globalThis, "Uint8Array", { value: forbidden }],
    [globalThis, "ArrayBuffer", { value: forbidden }],
  ];
  const originals = changes.map(([target, key]) => {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    assert.ok(descriptor);
    return descriptor;
  });
  let classifications;
  let copy;
  // No await or assertions while realm intrinsics are temporarily replaced.
  try {
    for (let index = 0; index < changes.length; index += 1) {
      const [target, key, replacement] = changes[index];
      defineProperty(target, key, { ...originals[index], ...replacement });
    }
    classifications = inputs.map((value) => classifyByteCarrier(value));
    copy = copyByteCarrier(ordinary);
  } finally {
    for (let index = changes.length - 1; index >= 0; index -= 1) {
      const [target, key] = changes[index];
      defineProperty(target, key, originals[index]);
    }
  }

  assert.equal(forbiddenCalls, 0);
  assert.deepEqual(classifications, [
    { kind: "admitted", visibleLength: 2 },
    { kind: "admitted", visibleLength: 0 },
    { kind: "rejected", reason: "shared-storage" },
    { kind: "rejected", reason: "not-uint8array" },
    { kind: "rejected", reason: "unusable-view" },
    { kind: "rejected", reason: "unusable-view" },
  ]);
  assertOwnedBytes(copy, [4, 5], storage);
});
