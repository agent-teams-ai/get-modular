import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const root = new URL("../", import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), "utf8"));
const corpus = await json("tests/qualification/compiler-engineer/examples.json");
const schema = await json("architecture/contracts/v1/composition.schema.json");
const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addSchema(schema);
const validates = name => ajv.getSchema(`${schema.$id}#/$defs/${name}`);
const assertSchema = (name, value) => {
  const validate = validates(name);
  assert.equal(validate(value), true, JSON.stringify(validate.errors));
};
const ids = [
  "optional-empty", "optional-missing", "many-zero", "many-minimum",
  "many-maximum", "many-overflow", "many-duplicate", "cycle-with-tail",
  "hostile-slot-names", "frozen-input",
];
const byId = id => corpus.cases.find(entry => entry.id === id);
const freeze = value => {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

test("engineer examples have a closed inventory and resolvable authority", async () => {
  assert.equal(corpus.kind, "get-modular.engineer-examples");
  assert.equal(corpus.evidence, "hand-authored-expectations-no-production-subject");
  assert.deepEqual(corpus.cases.map(entry => entry.id), ids);
  for (const entry of corpus.cases) {
    assert.equal(entry.entryPoint, "trusted-object-qualification-candidate");
    assert.ok(["plain", "deep-freeze"].includes(entry.setup));
    assert.equal(entry.authorities.length, entry.setup === "deep-freeze" ? 4 : 3);
    for (const path of entry.authorities) {
      assert.match(path, /^(docs\/decisions|architecture\/contracts)\//u);
      assert.doesNotMatch(path, /\.\./u);
      assert.ok((await readFile(new URL(path, root))).length > 0);
    }
  }
});

for (const entry of corpus.cases) {
  test(`engineer fixture schema consistency: ${entry.id}`, () => {
    // This validates literal examples, not the behavior of a compiler subject.
    for (const declaration of entry.input.declarations) {
      assertSchema("moduleDeclaration", declaration);
    }
    assertSchema("compositionProfile", entry.input.profile);
    const expectation = entry.expected ?? entry.candidateExpectation;
    if (entry.setup === "deep-freeze") {
      assert.equal(entry.authorityClass, "proposed-only");
      assert.equal("expected" in entry, false);
    } else {
      assert.equal("candidateExpectation" in entry, false);
    }
    assert.equal("digest" in expectation, false);
    if (expectation.ok) {
      assert.equal(expectation.surface, "complete-plan-without-digest");
      assertSchema("compositionPlan", expectation.plan);
      assert.equal("diagnostics" in expectation, false);
    } else {
      assert.equal("plan" in expectation, false);
      assert.ok(expectation.diagnostics.length > 0);
      for (const diagnostic of expectation.diagnostics) {
        assertSchema("diagnostic", diagnostic);
      }
      if (entry.id === "cycle-with-tail") {
        assert.equal(entry.expected.surface, "required-diagnostic-only");
        assert.equal(entry.expected.unresolved.length, 1);
      } else {
        assert.equal(entry.expected.surface, "complete-diagnostics");
      }
    }
  });
}

test("handbook covers the exact fact vocabulary and every literal example", async () => {
  const contract = await json("architecture/qualification/v1/diagnostic-contract.json");
  const handbook = await readFile(new URL(
    "docs/qualification/compiler-engineer-handbook.md", root,
  ), "utf8");
  const rows = [...handbook.matchAll(/^\| `([^`]+)` \/ ([a-z]+) \|/gmu)]
    .map(([, factId, scope]) => ({ factId, scope }));
  assert.deepEqual(rows, contract.prerequisiteCatalog.factModel.facts);
  for (const id of ids) assert.ok(handbook.includes(`| \`${id}\` |`), id);
});

test("proposed frozen setup preserves nested input without an accepted result", () => {
  const source = byId("frozen-input");
  const input = freeze(structuredClone(source.input));
  assert.deepEqual(input, byId("optional-empty").input);
  assert.equal("expected" in source, false);
  assert.deepEqual(source.candidateExpectation, byId("optional-empty").expected);
  const assertFrozen = value => {
    if (value !== null && typeof value === "object") {
      assert.ok(Object.isFrozen(value));
      for (const child of Object.values(value)) assertFrozen(child);
    }
  };
  assertFrozen(input);
  assert.throws(() => input.profile.bindings[0].providerImplementationIds.push("example/new"), TypeError);
  assert.throws(() => { input.declarations[0].slots[0].slotId = "changed"; }, TypeError);
  for (const declaration of input.declarations) assertSchema("moduleDeclaration", declaration);
  assertSchema("compositionProfile", input.profile);
});

test("legal hostile slot tokens differ from invalid prototype spellings", () => {
  const input = structuredClone(byId("hostile-slot-names").input);
  assert.deepEqual(input.declarations[0].slots.map(slot => slot.slotId), ["constructor", "then"]);
  assertSchema("moduleDeclaration", input.declarations[0]);
  input.declarations[0].slots[0].slotId = "__proto__";
  assert.equal(validates("moduleDeclaration")(input.declarations[0]), false);
  input.profile.bindings[0].slotId = "__proto__";
  assert.equal(validates("compositionProfile")(input.profile), false);
});
