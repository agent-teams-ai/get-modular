import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { createDiagnosticComparator } from
  "../architecture/checks/v1-qualification.mjs";

const root = new URL("../", import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), "utf8"));
const corpus = await json("tests/qualification/compiler-engineer/examples.json");
const schema = await json("architecture/contracts/v1/composition.schema.json");
const diagnosticContract = await json(
  "architecture/qualification/v1/diagnostic-contract.json",
);
const diagnosticCatalog = await json("architecture/contracts/v1/diagnostic-catalog.json");
const compareDiagnostics = createDiagnosticComparator({
  contract: diagnosticContract,
  catalog: diagnosticCatalog,
});
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
  "hostile-slot-names", "invalid-declaration-suppresses-absence",
  "renamed-unknown-declaration-field",
  "duplicate-selection-with-mismatch", "unknown-binding-coordinates",
  "partial-binding-with-independent-cycle",
  "unreached-invalid-binding-preserves-unreachable", "frozen-input",
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
    assert.ok(entry.authorities.length >= 3);
    for (const path of entry.authorities) {
      assert.match(path,
        /^(docs\/decisions|architecture\/(contracts|qualification))\//u);
      assert.doesNotMatch(path, /\.\./u);
      assert.ok((await readFile(new URL(path, root))).length > 0);
    }
  }
});

for (const entry of corpus.cases) {
  test(`engineer fixture schema consistency: ${entry.id}`, () => {
    // This validates literal examples, not the behavior of a compiler subject.
    const invalidDeclarations = new Set(entry.invalidInput?.declarations ?? []);
    for (const [index, declaration] of entry.input.declarations.entries()) {
      const validate = validates("moduleDeclaration");
      assert.equal(validate(declaration), !invalidDeclarations.has(index),
        JSON.stringify(validate.errors));
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
        const variant = diagnosticContract.variants.find(
          candidate => candidate.code === diagnostic.code,
        );
        assert.ok(variant, diagnostic.code);
        assert.ok(variant.phases.includes(diagnostic.phase), diagnostic.code);
        assert.deepEqual(Object.keys(diagnostic.coordinate).sort(),
          [...variant.coordinate.required].sort(), diagnostic.code);
        assert.deepEqual(Object.keys(diagnostic.details).sort(),
          [...variant.details.required].sort(), diagnostic.code);
        const pathPolicy = diagnosticContract.pathPolicyByCode[diagnostic.code];
        assert.equal(diagnostic.path.length === 0, pathPolicy === "empty",
          diagnostic.code);
      }
      const sorted = [...expectation.diagnostics].sort(compareDiagnostics);
      assert.deepEqual(expectation.diagnostics, sorted,
        `${entry.id}: normative diagnostic ordering`);
      assert.equal(entry.expected.surface, "complete-diagnostics");
      assert.equal("unresolved" in entry.expected, false);
    }
  });
}

test("handbook covers the exact fact vocabulary and every literal example", async () => {
  const handbook = await readFile(new URL(
    "docs/qualification/compiler-engineer-handbook.md", root,
  ), "utf8");
  const rows = [...handbook.matchAll(/^\| `([^`]+)` \/ ([a-z]+) \|/gmu)]
    .map(([, factId, scope]) => ({ factId, scope }));
  assert.deepEqual(rows, diagnosticContract.prerequisiteCatalog.factModel.facts);
  for (const id of ids) assert.ok(handbook.includes(`| \`${id}\` |`), id);
});

test("fixtures tied to exact fact partitions preserve accepted eligible codes", () => {
  const exactCases = new Map(diagnosticContract.prerequisiteCatalog.exactCases
    .map(entry => [entry.caseId, entry]));
  for (const entry of corpus.cases.filter(candidate => candidate.authorityCase)) {
    const authority = exactCases.get(entry.authorityCase);
    assert.ok(authority, entry.authorityCase);
    assert.deepEqual(entry.expected.diagnostics.map(diagnostic => diagnostic.code),
      authority.eligibleCodes);
    assert.equal(authority.suppressedCodes.some(code => (
      entry.expected.diagnostics.some(diagnostic => diagnostic.code === code)
    )), false);
  }
});

test("unknown declaration fields retain only the invocation locator", () => {
  const prefix = diagnosticContract.boundedEmissionProtocol.invocationPrefixes
    .objectDeclaration.map(segment => segment.kind === "index"
      ? { kind: "index", value: 0 }
      : segment);
  const assertSafeFixture = entry => {
    const validate = validates("moduleDeclaration");
    assert.equal(validate(entry.input.declarations[0]), false);
    assert.deepEqual(validate.errors.map(error => [error.keyword, error.instancePath]),
      [["additionalProperties", ""]]);
    assert.deepEqual(entry.expected.diagnostics.map(item => item.code),
      ["schema.unknown-field"]);
    assert.deepEqual(entry.expected.diagnostics[0].path, prefix);
  };
  const original = byId("invalid-declaration-suppresses-absence");
  const renamed = byId("renamed-unknown-declaration-field");
  assertSafeFixture(original);
  assertSafeFixture(renamed);
  assert.deepEqual(renamed.expected, original.expected);
  for (const path of [[], [{ kind: "field", value: "unknown" }],
    [...prefix, { kind: "field", value: "another-field" }]]) {
    const mutant = structuredClone(original);
    mutant.expected.diagnostics[0].path = path;
    assert.throws(() => assertSafeFixture(mutant), assert.AssertionError);
  }
});

test("an unreached invalid binding does not invalidate the reached frontier example", () => {
  const entry = byId("unreached-invalid-binding-preserves-unreachable");
  const [root, orphan] = entry.input.declarations;
  assert.deepEqual(entry.input.profile.roots, [root.moduleId]);
  assert.deepEqual(root.slots, []);
  assert.equal(entry.input.profile.bindings[0].consumerImplementationId,
    orphan.implementationId);
  assert.notEqual(orphan.implementationId, root.implementationId);
  assert.deepEqual(entry.expected.diagnostics.map(item => item.code),
    ["binding.unknown-provider", "profile.unreachable-selection"]);
  assert.deepEqual(entry.expected.diagnostics[1].coordinate,
    { moduleId: orphan.moduleId, implementationId: orphan.implementationId });
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
