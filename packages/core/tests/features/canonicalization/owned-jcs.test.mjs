import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import canonicalizeOracle from "canonicalize";
import { canonicalize as secondOracle } from "json-canonicalize";
import { createOwnedJcs } from "../../../dist-test/features/canonicalization/owned-jcs/factory.js";
import { ownedJcsDeclaration, ownedJcsImplementation } from "../../../dist-test/features/canonicalization/owned-jcs/declaration.js";
import { canonicalBytesCapabilityId, canonicalBytesToken, canonicalizationModuleId } from "../../../dist-test/features/canonicalization/identity.js";

const root = new URL("../../../../../", import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), "utf8"));
const subject = createOwnedJcs({});
const utf8 = text => new TextEncoder().encode(text);

for (const item of (await read("architecture/qualification/v1/canonicalization-vectors.json")).cases) {
  test(`accepted JCS bytes: ${item.name}`, () => {
    assert.deepEqual(subject.canonicalize(item.value), utf8(item.canonicalUtf8));
  });
}
for (const item of (await read("architecture/contracts/v1/canonical-vectors.json")).positive) {
  test(`accepted plan envelope bytes: ${item.name}`, () => {
    assert.deepEqual(subject.canonicalize(item.envelope), utf8(item.canonicalUtf8));
  });
}

test("uses UTF-16 order instead of numeric, UTF-8, locale, or insertion order", () => {
  const entries = [["2", 2], ["10", 10], ["😀", 1], ["\ue000", 0], ["a", 3]];
  const expected = utf8('{"10":10,"2":2,"a":3,"😀":1,"\ue000":0}');
  for (let offset = 0; offset < entries.length; offset += 1) {
    const rotated = [...entries.slice(offset), ...entries.slice(0, offset)];
    assert.deepEqual(subject.canonicalize(Object.fromEntries(rotated)), expected);
    assert.deepEqual(subject.canonicalize(Object.fromEntries(rotated.reverse())), expected);
  }
});

test("preserves ordered arrays, duplicate values, Unicode spelling and ordinary JSON keys", () => {
  const value = JSON.parse('{"__proto__":{"constructor":1},"value":["é","é",2,1,2],"toJSON":0}');
  assert.deepEqual(subject.canonicalize(value), utf8('{"__proto__":{"constructor":1},"toJSON":0,"value":["é","é",2,1,2]}'));
  assert.deepEqual(subject.canonicalize(Object.assign(Object.create(null), { z: 1, a: 2 })), utf8('{"a":2,"z":1}'));
});

test("serializes JSON primitives using JCS rather than the compiler numeric domain", () => {
  const values = [null, true, false, "", -0, Number.MIN_VALUE, Number.MAX_VALUE, 1e-6, 1e-7, 1e20, 1e21];
  const expected = '[null,true,false,"",0,5e-324,1.7976931348623157e+308,0.000001,1e-7,100000000000000000000,1e+21]';
  assert.deepEqual(subject.canonicalize(values), utf8(expected));
});

test("agrees with both independent dev-only oracles over deterministic mixed JSON", () => {
  let seed = 0x8785;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  const keys = ["2", "10", "a", "Z", "é", "é", "😀", "\ue000", "__proto__", "\n"];
  const value = depth => {
    const choice = next() % (depth === 0 ? 4 : 6);
    if (choice === 0) return null;
    if (choice === 1) return (next() & 1) === 0;
    if (choice === 2) return (next() - 0x80000000) * 10 ** ((next() % 45) - 22);
    if (choice === 3) return keys[next() % keys.length] + '"\\\t';
    if (choice === 4) return Array.from({ length: next() % 5 }, () => value(depth - 1));
    return Object.fromEntries(Array.from({ length: next() % 5 }, () => [keys[next() % keys.length], value(depth - 1)]));
  };
  for (let index = 0; index < 300; index += 1) {
    const input = value(4);
    const expected = canonicalizeOracle(input);
    assert.equal(secondOracle(input), expected);
    assert.deepEqual(subject.canonicalize(input), utf8(expected));
  }
});

test("escapes all controls while preserving valid surrogate pairs", () => {
  const controls = String.fromCharCode(...Array.from({ length: 32 }, (_, index) => index));
  const escapes = '\\u0000\\u0001\\u0002\\u0003\\u0004\\u0005\\u0006\\u0007\\b\\t\\n\\u000b\\f\\r\\u000e\\u000f\\u0010\\u0011\\u0012\\u0013\\u0014\\u0015\\u0016\\u0017\\u0018\\u0019\\u001a\\u001b\\u001c\\u001d\\u001e\\u001f';
  assert.deepEqual(subject.canonicalize(controls + '"\\/😀'), utf8('"' + escapes + '\\"\\\\/😀"'));
});

for (const [name, value] of [
  ["undefined", undefined], ["function", () => 1], ["symbol", Symbol("x")], ["bigint", 1n],
  ["NaN", NaN], ["infinity", Infinity], ["negative infinity", -Infinity],
  ["high surrogate", "\ud800"], ["low surrogate", "\udfff"], ["broken pair", "\ud800a"],
  ["surrogate key", { ["\ud800"]: 0 }], ["undefined member", { a: undefined }],
  ["sparse array", Array(1)], ["extra array key", Object.assign([], { extra: 1 })],
  ["symbol key", { [Symbol("x")]: 1 }], ["date", new Date(0)], ["map", new Map()],
  ["boxed number", Object(1)], ["custom prototype", Object.create({ inherited: 1 })],
  ["non-enumerable", Object.defineProperty({}, "a", { value: 1 })],
]) {
  test(`rejects invalid internal JSON: ${name}`, () => assert.throws(() => subject.canonicalize(value), TypeError));
}

test("does not execute accessors or toJSON callbacks", () => {
  let calls = 0;
  const accessor = Object.defineProperty({}, "a", { enumerable: true, get() { calls += 1; return 0; } });
  const array = Object.defineProperty([0], "0", { get() { calls += 1; return 0; } });
  const callback = { toJSON() { calls += 1; return 0; } };
  for (const value of [accessor, array, callback]) assert.throws(() => subject.canonicalize(value), TypeError);
  assert.equal(calls, 0);
});

test("rejects ancestor cycles but expands repeated acyclic references", () => {
  const shared = Object.freeze({ a: 1 });
  assert.deepEqual(subject.canonicalize([shared, shared]), utf8('[{"a":1},{"a":1}]'));
  const object = {};
  object.self = object;
  const array = [];
  array.push({ array });
  assert.throws(() => subject.canonicalize(object), TypeError);
  assert.throws(() => subject.canonicalize(array), TypeError);
  assert.deepEqual(subject.canonicalize(null), utf8("null"));
});

test("is stack safe on deep data and keeps all state local to a call", () => {
  let value = 0;
  const depth = 12_000;
  for (let index = 0; index < depth; index += 1) value = [value];
  assert.deepEqual(subject.canonicalize(value), utf8("[".repeat(depth) + "0" + "]".repeat(depth)));
  const input = Object.freeze({ a: Object.freeze([2, 1]) });
  const first = subject.canonicalize(input);
  first.fill(0);
  assert.deepEqual(subject.canonicalize(input), utf8('{"a":[2,1]}'));
  assert.deepEqual(input, { a: [2, 1] });
});

test("declares the owned implementation as deeply frozen inert data", () => {
  assert.equal(ownedJcsDeclaration.moduleId, canonicalizationModuleId);
  assert.equal(ownedJcsDeclaration.implementationId, ownedJcsImplementation);
  assert.deepEqual(ownedJcsDeclaration.provides, [{ capabilityId: canonicalBytesCapabilityId, compatibility: { family: "exact", familyVersion: 1, token: canonicalBytesToken } }]);
  assert.deepEqual(ownedJcsDeclaration.owner, { authority: "get-modular", path: ["canonicalization"] });
  assert.deepEqual(ownedJcsDeclaration.slots, []);
  for (const value of [ownedJcsDeclaration, ownedJcsDeclaration.owner, ownedJcsDeclaration.owner.path, ownedJcsDeclaration.provides, ownedJcsDeclaration.provides[0], ownedJcsDeclaration.provides[0].compatibility, ownedJcsDeclaration.slots, subject]) {
    assert.equal(Object.isFrozen(value), true);
  }
});
