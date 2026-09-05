import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateDeclarationShape, validateProfileShape } from "../../../dist/features/input-admission/document-shape.js";
import { schemaDiagnostic } from "../../../dist/features/input-admission/schema-diagnostic.js";

const root = new URL("../../../../../", import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), "utf8"));
const examples = await json("tests/qualification/compiler-engineer/examples.json");
const manifest = await json("architecture/qualification/v1/qualification-case-manifest.json");
const module = () => structuredClone(examples.cases.find(entry => entry.id === "many-maximum").input.declarations[0]);
const profile = () => structuredClone(examples.cases[0].input.profile);
const project = (validate, value, locator) => {
  const diagnostics = [];
  const valid = validate(value, violation => diagnostics.push(schemaDiagnostic(violation, locator)));
  return { valid, diagnostics };
};
const field = value => ({ kind: "field", value });
const index = value => ({ kind: "index", value });
const expected = (code, path, reason) => ({ code, phase: "schema", path, coordinate: {}, details: { reason } });

test("schema projection matches the accepted object null-document case exactly", () => {
  const fixture = manifest.staticConformanceProtocol.cases.find(entry => entry.caseId === "diag.object.pre-identity-index.v1");
  const result = project(validateDeclarationShape, fixture.input.declarations[0], { kind: "declaration", ordinal: 0 });
  assert.equal(result.valid, false);
  assert.deepEqual(result.diagnostics, fixture.expected.diagnostics);
});

test("unknown declaration keys retain the complete handbook diagnostics after renaming", () => {
  for (const id of ["invalid-declaration-suppresses-absence", "renamed-unknown-declaration-field"]) {
    const fixture = examples.cases.find(entry => entry.id === id);
    const diagnostics = fixture.input.declarations.flatMap((value, ordinal) =>
      project(validateDeclarationShape, value, { kind: "declaration", ordinal }).diagnostics);
    assert.deepEqual(diagnostics, fixture.expected.diagnostics, id);
  }
});

test("unsupported document versions do not invent this version's missing fields", () => {
  // Schema-only projection of the accepted already-decoded value, not a raw
  // decoder or complete execution of the multi-document conformance case.
  const fixture = manifest.staticConformanceProtocol.cases.find(entry => entry.caseId === "diag.raw.multi-document-independent.v1");
  const value = JSON.parse(fixture.input.declarationsUtf8[1]);
  const result = project(validateDeclarationShape, value, { kind: "declaration", ordinal: 1 });
  const expectedVersion = fixture.expected.diagnostics.filter(diagnostic => diagnostic.code === "schema.unsupported-version");
  assert.deepEqual(result.diagnostics, expectedVersion);
  assert.deepEqual(project(validateProfileShape, { schemaVersion: 2 }, { kind: "profile" }).diagnostics,
    [expected("schema.unsupported-version", [field("profile"), field("schemaVersion")], "unsupported-version")]);
});

test("numeric schema failures preserve invalid-type versus invalid-format without retaining values", () => {
  for (const [value, reason] of [[0.5, "invalid-type"], [NaN, "invalid-type"], [Infinity, "invalid-type"],
    [-0, "invalid-format"], [Number.MAX_SAFE_INTEGER + 1, "invalid-format"], [-1, "invalid-format"], [1025, "invalid-format"]]) {
    const input = module(); input.slots[0].cardinality.min = value;
    const path = [field("declarations"), index(0), field("slots"), index(0), field("cardinality"), field("min")];
    assert.deepEqual(project(validateDeclarationShape, input, { kind: "declaration", ordinal: 0 }).diagnostics,
      [expected("schema.invalid-value", path, reason)]);
  }
  for (const [value, reason] of [[0.5, "invalid-type"], [-0, "invalid-format"], [Number.MAX_SAFE_INTEGER + 1, "invalid-format"]]) {
    const input = profile(); input.schemaVersion = value;
    assert.deepEqual(project(validateProfileShape, input, { kind: "profile" }).diagnostics,
      [expected("schema.invalid-value", [field("profile"), field("schemaVersion")], reason)]);
  }
});

test("independent schema failures keep safe paths and empty coordinates even beside a valid identity", () => {
  const value = module(); value.owner.authority = "BAD"; delete value.moduleId;
  value.owner["password=do-not-emit"] = "secret";
  const result = project(validateDeclarationShape, value, { kind: "declaration", ordinal: 3 });
  assert.deepEqual(result.diagnostics, [
    expected("schema.invalid-value", [field("declarations"), index(3), field("moduleId")], "invalid-type"),
    expected("schema.unknown-field", [field("declarations"), index(3), field("owner")], "unknown-field"),
    expected("identity.invalid", [field("declarations"), index(3), field("owner"), field("authority")], "invalid-format"),
  ]);
  assert.equal(JSON.stringify(result).includes("password"), false);
  assert.equal(JSON.stringify(result).includes(value.implementationId), false);
});

test("schema diagnostic records own and freeze all containers and count locator segments in clipping", () => {
  const path = Array.from({ length: 32 }, () => "owner");
  const diagnostic = schemaDiagnostic({ rule: "type", path }, { kind: "declaration", ordinal: 0 });
  path[0] = "caller changed";
  assert.equal(diagnostic.path.length, 32);
  assert.deepEqual(diagnostic.path.slice(0, 3), [field("declarations"), index(0), field("owner")]);
  for (const container of [diagnostic, diagnostic.path, ...diagnostic.path, diagnostic.coordinate, diagnostic.details]) {
    assert.equal(Object.isFrozen(container), true);
  }
});
