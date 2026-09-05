import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { validateDeclarationShape, validateProfileShape } from "../../../dist/features/input-admission/document-shape.js";

const root = new URL("../../../../../", import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), "utf8"));
const schema = await json("architecture/contracts/v1/composition.schema.json");
const examples = await json("tests/qualification/compiler-engineer/examples.json");
const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addSchema(schema);
const declarationOracle = ajv.getSchema(`${schema.$id}#/$defs/moduleDeclaration`);
const profileOracle = ajv.getSchema(`${schema.$id}#/$defs/compositionProfile`);
const sample = examples.cases.find(entry => entry.id === "many-maximum").input;
const declaration = () => structuredClone(sample.declarations[0]);
const profile = () => structuredClone(sample.profile);
const check = (validate, value) => {
  const violations = [];
  const valid = validate(value, violation => violations.push(violation));
  assert.equal(valid, violations.length === 0);
  return { valid, violations };
};
const at = (value, path) => path.reduce((current, key) => current[key], value);
function paths(value, path = []) {
  const result = [path];
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) result.push(...paths(value[key], [...path, Array.isArray(value) ? Number(key) : key]));
  }
  return result;
}

test("production document checks agree with the accepted schema for every handbook document", () => {
  for (const entry of examples.cases) {
    for (const value of entry.input.declarations) {
      assert.equal(check(validateDeclarationShape, value).valid, declarationOracle(value), entry.id);
    }
    assert.equal(check(validateProfileShape, entry.input.profile).valid, profileOracle(entry.input.profile), entry.id);
  }
});

test("independent schema rejects and accepts mutations at every nested field and array position", () => {
  let comparisons = 0;
  const worlds = [
    [sample.declarations[0], validateDeclarationShape, declarationOracle],
    [sample.declarations[1], validateDeclarationShape, declarationOracle],
    [sample.profile, validateProfileShape, profileOracle],
  ];
  for (const [source, validate, oracle] of worlds) for (const path of paths(source)) {
    for (const replacement of [null, true, false, -1, 0, 1, 2, 1025, 1.5, "", "x", "x/y", [], {}, ["x/y"], [false]]) {
      const value = structuredClone(source);
      if (path.length === 0) {
        assert.equal(check(validate, replacement).valid, oracle(replacement));
      } else {
        at(value, path.slice(0, -1))[path.at(-1)] = replacement;
        assert.equal(check(validate, value).valid, oracle(value), JSON.stringify({ path, replacement }));
      }
      comparisons += 1;
    }
    if (path.length > 0 && typeof path.at(-1) === "string") {
      const missing = structuredClone(source);
      delete at(missing, path.slice(0, -1))[path.at(-1)];
      assert.equal(check(validate, missing).valid, false, `missing ${path}`);
      assert.equal(oracle(missing), false);
      comparisons += 1;
    }
    const child = at(source, path);
    if (child && typeof child === "object" && !Array.isArray(child)) {
      const extended = structuredClone(source);
      at(extended, path).unrecognized = "private value";
      assert.equal(check(validate, extended).valid, false, `extended ${path}`);
      assert.equal(oracle(extended), false);
      comparisons += 1;
    }
  }
  assert.ok(comparisons > 1_000, comparisons);
});

test("all closed array dimensions accept exact bounds and stop before inspecting a rejected dimension", () => {
  const dimensions = [
    [declaration, validateDeclarationShape, ["owner", "path"], 1, 8, "app"],
    [declaration, validateDeclarationShape, ["provides"], 0, 64, sample.declarations[1].provides[0]],
    [declaration, validateDeclarationShape, ["slots"], 0, 128, sample.declarations[0].slots[0]],
    [profile, validateProfileShape, ["roots"], 1, 1024, "example/app"],
    [profile, validateProfileShape, ["selections"], 1, 4096, sample.profile.selections[0]],
    [profile, validateProfileShape, ["bindings"], 0, 65_536, sample.profile.bindings[0]],
    [profile, validateProfileShape, ["bindings", 0, "providerImplementationIds"], 0, 1024, "example/p-one/default"],
  ];
  for (const [make, validate, path, min, max, item] of dimensions) {
    for (const size of new Set([min, max, max + 1, ...(min ? [min - 1] : [])])) {
      const value = make();
      at(value, path.slice(0, -1))[path.at(-1)] = Array(size).fill(item);
      assert.equal(check(validate, value).valid, size >= min && size <= max, `${path} ${size}`);
    }
    const value = make();
    const oversized = Array(max + 1);
    Object.defineProperty(oversized, 0, { get() { throw new Error("must not inspect rejected array"); } });
    at(value, path.slice(0, -1))[path.at(-1)] = oversized;
    assert.deepEqual(check(validate, value).violations, [{ rule: "size", path }]);
  }
});

test("identity grammar is whole-string ASCII, length bounded, and allows ordinary prototype names", () => {
  for (const id of ["a/b", `${"a".repeat(126)}/b`, "constructor/then", "a-b/c-d"]) {
    const value = declaration(); value.moduleId = id;
    assert.equal(check(validateDeclarationShape, value).valid, true, id);
  }
  for (const id of ["a", "A/b", "a//b", "a-/b", "a/b-", "a_b/c", "a/b\n", "a/b\r", "a/b\u2028", "a/é", "a/\ud83d\ude00", `${"a".repeat(127)}/b`]) {
    const value = declaration(); value.moduleId = id;
    assert.deepEqual(check(validateDeclarationShape, value).violations, [{ rule: "identity", path: ["moduleId"] }]);
  }
  for (const token of ["constructor", "then", "a".repeat(64)]) {
    const value = declaration(); value.slots[0].slotId = token;
    assert.equal(check(validateDeclarationShape, value).valid, true);
  }
  for (const token of ["__proto__", "a/b", "a".repeat(65), "then\n"]) {
    const value = declaration(); value.slots[0].slotId = token;
    assert.equal(check(validateDeclarationShape, value).valid, false);
  }
});

test("malformed UTF-16 precedes identity grammar and length bounds", () => {
  for (const id of ["a/\ud800", "a/\udfff", "A/\ud800", `${"a".repeat(129)}\ud800`]) {
    const value = declaration(); value.moduleId = id;
    assert.deepEqual(check(validateDeclarationShape, value).violations, [{ rule: "unicode", path: ["moduleId"] }]);
  }
  for (const token of ["\ud800", "\udfff", "BAD\ud800", `${"a".repeat(65)}\ud800`]) {
    const value = declaration(); value.slots[0].slotId = token;
    assert.deepEqual(check(validateDeclarationShape, value).violations, [{ rule: "unicode", path: ["slots", 0, "slotId"] }]);
  }
});

test("numeric bounds reject invalid scalars and the accepted min/max relational refinement", () => {
  for (const field of ["min", "max"]) {
    for (const number of [-0, NaN, Infinity, -Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1, -1, 1025]) {
      const value = declaration(); value.slots[0].cardinality[field] = number;
      assert.equal(check(validateDeclarationShape, value).valid, false, `${field} ${number}`);
    }
  }
  const value = declaration();
  for (const pair of [[0, 1], [1024, 1024]]) {
    [value.slots[0].cardinality.min, value.slots[0].cardinality.max] = pair;
    assert.equal(check(validateDeclarationShape, value).valid, true);
  }
  [value.slots[0].cardinality.min, value.slots[0].cardinality.max] = [2, 1];
  assert.equal(declarationOracle(value), true, "the accepted refinement is additional to the wire schema");
  assert.deepEqual(check(validateDeclarationShape, value).violations, [{ rule: "range", path: ["slots", 0, "cardinality"] }]);
  value.unknown = true;
  assert.deepEqual(check(validateDeclarationShape, value).violations,
    [{ rule: "closed", path: [] }, { rule: "range", path: ["slots", 0, "cardinality"] }]);
  delete value.unknown;
  value.slots[0].cardinality.max = 0;
  assert.equal(check(validateDeclarationShape, value).valid, false);
});

test("cardinality variants are closed and unsupported discriminators cannot borrow a valid branch", () => {
  for (const cardinality of [{ kind: "required" }, { kind: "optional" }, { kind: "many", min: 0, max: 1024, order: "profile" }]) {
    const value = declaration(); value.slots[0].cardinality = cardinality;
    assert.equal(check(validateDeclarationShape, value).valid, true);
    cardinality.extra = true;
    assert.equal(check(validateDeclarationShape, value).valid, false);
  }
  for (const cardinality of [{}, { kind: "fallback" }, { kind: 1 }, { kind: "required", min: 0 }, { kind: "many", min: 0, max: 1 }, null, []]) {
    const value = declaration(); value.slots[0].cardinality = cardinality;
    assert.equal(check(validateDeclarationShape, value).valid, false);
  }
});

test("independent safe violations continue and hostile keys and values never enter retained paths", () => {
  for (const secret of ["credential-secret", "constructor", "__proto__", "/private/user/file", "unknown\ud800"]) {
    const value = declaration();
    Object.defineProperty(value, secret, { value: { password: secret }, enumerable: true });
    value.owner.authority = 7;
    delete value.slots[0].capabilityId;
    const result = check(validateDeclarationShape, value);
    assert.deepEqual(result.violations, [
      { rule: "closed", path: [] },
      { rule: "type", path: ["owner", "authority"] },
      { rule: "required", path: ["slots", 0, "capabilityId"] },
    ]);
    assert.equal(JSON.stringify(result).includes(secret), false);
    for (const violation of result.violations) {
      assert.equal(Object.isFrozen(violation), true);
      assert.equal(Object.isFrozen(violation.path), true);
    }
  }
});

test("shape inspection invokes no getters and has isolated per-document state", () => {
  let calls = 0;
  const get = () => { calls += 1; throw new Error("getter invoked"); };
  for (const path of [["moduleId"], ["slots", 0, "cardinality", "kind"], ["owner", "path", 0]]) {
    const value = declaration();
    Object.defineProperty(at(value, path.slice(0, -1)), path.at(-1), { get, enumerable: true });
    assert.equal(check(validateDeclarationShape, value).valid, false);
  }
  assert.equal(calls, 0);
  assert.equal(check(validateDeclarationShape, declaration()).valid, true);
  assert.equal(check(validateProfileShape, profile()).valid, true);
  assert.throws(() => validateDeclarationShape(null, () => { throw new Error("report failure"); }), /report failure/);
});
