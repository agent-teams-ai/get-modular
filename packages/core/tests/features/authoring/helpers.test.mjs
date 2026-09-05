import assert from "node:assert/strict";
import test from "node:test";
import { defineModule, required, optional, many } from "../../../dist-test/features/authoring/internal.js";

test("defineModule passes through every input without reading it", () => {
  for (const value of [null, undefined, 0, "invalid", {}, Object.freeze({})]) {
    assert.equal(defineModule(value), value);
  }
  let reads = 0;
  const value = new Proxy({}, {
    get() { reads += 1; throw new Error("get"); },
    ownKeys() { reads += 1; throw new Error("keys"); },
    getPrototypeOf() { reads += 1; throw new Error("prototype"); },
  });
  assert.equal(defineModule(value), value);
  assert.equal(reads, 0);
});

test("cardinality helpers return fresh mutable ordinary records with exact keys", () => {
  for (const [helper, args, expected] of [
    [required, [], { kind: "required" }],
    [optional, [], { kind: "optional" }],
    [many, [{ min: 0, max: 3 }], { kind: "many", min: 0, max: 3, order: "profile" }],
  ]) {
    const first = helper(...args);
    const second = helper(...args);
    assert.notEqual(first, second);
    assert.equal(Object.getPrototypeOf(first), Object.prototype);
    assert.deepEqual(first, expected);
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(first))) {
      assert.equal(descriptor.writable, true);
      assert.equal(descriptor.configurable, true);
      assert.equal(descriptor.enumerable, true);
    }
    first.extra = true;
    assert.equal(second.extra, undefined);
  }
});

test("many does no validation, normalization, defaulting or freezing", () => {
  for (const [min, max] of [[0, 0], [5, 2], [-1, -0], [NaN, Infinity], [1.5, -Infinity], [undefined, undefined]]) {
    const input = { min, max, ignored: true };
    const output = many(input);
    assert.ok(Object.is(output.min, min));
    assert.ok(Object.is(output.max, max));
    assert.deepEqual(Object.keys(output), ["kind", "min", "max", "order"]);
    assert.equal(Object.isFrozen(input), false);
  }
  assert.throws(() => many(null), TypeError);
  assert.throws(() => many(undefined), TypeError);
  const error = new Error("caller getter");
  assert.throws(() => many({ get min() { throw error; } }), value => value === error);
});

test("many uses ordinary min then max reads exactly once", () => {
  const reads = [];
  const input = Object.create({ get min() { reads.push("min"); return 1; }, get max() { reads.push("max"); return 2; } });
  assert.deepEqual(many(input), { kind: "many", min: 1, max: 2, order: "profile" });
  assert.deepEqual(reads, ["min", "max"]);
});

test("authored modules retain the caller's references and mutable helper data", () => {
  const cardinality = many({ min: 0, max: 1 });
  const slots = [{ slotId: "items", cardinality }];
  const input = { slots };
  const authored = defineModule(input);
  assert.equal(authored, input);
  assert.equal(authored.slots, slots);
  cardinality.max = 2;
  assert.equal(authored.slots[0].cardinality.max, 2);
});
