import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const examples = JSON.parse(await readFile(new URL("../../../../../tests/qualification/compiler-engineer/examples.json", import.meta.url)));
import { admitRawInput } from "../../../dist-test/features/input-admission/raw-admission.js";
import { admitObjectInput } from "../../../dist-test/features/input-admission/object-admission.js";
import { createOwnedRawScanner } from "../../../dist-test/features/raw-scanner/owned-iterative/factory.js";
import { createDiagnosticCollector } from "../../../dist-test/features/diagnostics/internal.js";
import { createOwnedJcs } from "../../../dist-test/features/canonicalization/owned-jcs/factory.js";

const encoder = new TextEncoder();
const bytes = value => encoder.encode(JSON.stringify(value));
const rawWorld = input => ({ declarations: input.declarations.map(bytes), profile: bytes(input.profile) });
const world = () => structuredClone(examples.cases[0].input);
const scanner = createOwnedRawScanner({});
const field = value => ({ kind: "field", value });
const index = value => ({ kind: "index", value });
function admission(input, port = scanner) {
  const collector = createDiagnosticCollector(createOwnedJcs({}).canonicalize);
  const value = admitRawInput(input, collector, port);
  return { value, diagnostics: collector.finish() };
}
function objectAdmission(input) {
  const collector = createDiagnosticCollector(createOwnedJcs({}).canonicalize);
  const value = admitObjectInput(input, collector);
  return { value, diagnostics: collector.finish() };
}

test("raw and object admission agree on every plain handbook world before semantics", () => {
  const cases = examples.cases.filter(row => row.setup === "plain");
  assert.ok(cases.length > 0);
  for (const row of cases) assert.deepEqual(admission(rawWorld(row.input)), objectAdmission(row.input), row.id);
});

test("all visible bytes are copied before the first scanner call and snapshots own every record", () => {
  const input = world();
  input.declarations.push(structuredClone(input.declarations[0]));
  const raw = rawWorld(input);
  const sources = [...raw.declarations, raw.profile];
  let opens = 0;
  const result = admission(raw, { open(owned) {
    if (opens++ === 0) for (const source of sources) source.fill(0xff);
    assert.ok(sources.every(source => source.buffer !== owned.buffer));
    return scanner.open(owned);
  } });
  assert.deepEqual(result, objectAdmission(input));
  function inspect(value) {
    if (value === null || typeof value !== "object") return;
    assert.equal(Object.isFrozen(value), true);
    assert.equal(Object.getPrototypeOf(value), Array.isArray(value) ? Array.prototype : null);
    for (const child of Object.values(value)) inspect(child);
  }
  for (const declaration of result.value.declarations) inspect(declaration);
  inspect(result.value.profile);
  assert.notEqual(result.value.declarations[0], result.value.declarations[1]);
  assert.notEqual(result.value.declarations[0].owner, result.value.declarations[1].owner);
});

test("carrier and decode failures preserve source ordinals and independent document admission", () => {
  const input = world();
  const raw = rawWorld(input);
  raw.declarations.unshift(undefined, encoder.encode('{"a":'), encoder.encode('{"owner":{"path":0,"path":1}}'));
  const result = admission(raw);
  assert.deepEqual(result.value.declarations, objectAdmission(input).value.declarations);
  assert.deepEqual(result.value.profile, objectAdmission(input).value.profile);
  assert.equal(result.value.allDeclarationsAdmitted, false);
  assert.equal(result.value.hasErrors, true);
  assert.deepEqual(result.diagnostics.map(row => [row.code, row.path]), [
    ["input.invalid-byte-carrier", [field("declarations"), index(0)]],
    ["decode.invalid-json", [field("declarations"), index(1)]],
    ["decode.duplicate-key", [field("declarations"), index(2), field("owner"), field("path")]],
  ]);
});

test("duplicate paths stop at contextual unknown fields and earlier duplicates survive malformed suffixes", () => {
  const raw = rawWorld(world());
  raw.profile = encoder.encode('{"selections":[{"secret":{"moduleId":0,"moduleId":1}}],"profileId":0,"profileId":1,}');
  const result = admission(raw);
  assert.equal(result.value.profile, null);
  assert.equal(result.value.profileResources, null);
  assert.deepEqual(result.diagnostics.map(row => [row.code, row.path]), [
    ["decode.invalid-json", [field("profile")]],
    ["decode.duplicate-key", [field("profile"), field("profileId")]],
    ["decode.duplicate-key", [field("profile"), field("selections"), index(0)]],
  ]);
  assert.equal(JSON.stringify(result.diagnostics).includes("secret"), false);
});

test("exact raw version values reach schema admission before any Number rounding", () => {
  for (const [lexeme, code, reason] of [
    ["1.0000000000000001", "schema.invalid-value", "invalid-type"],
    ["1e-400", "schema.invalid-value", "invalid-type"],
    ["-0", "schema.invalid-value", "invalid-format"],
    ["2", "schema.unsupported-version", "unsupported-version"],
  ]) {
    const input = rawWorld(world());
    input.profile = encoder.encode(JSON.stringify(world().profile).replace('"schemaVersion":1', '"schemaVersion":' + lexeme));
    const result = admission(input);
    assert.equal(result.value.profile, null);
    assert.equal(result.value.profileResources, null);
    assert.deepEqual(result.diagnostics, [{ code, phase: "schema", path: [field("profile"), field("schemaVersion")],
      coordinate: {}, details: { reason } }]);
  }
});

test("decoded schema-invalid profiles retain only positive resource facts", () => {
  const input = world();
  input.profile.profileId = null;
  input.profile.bindings[0].providerImplementationIds = Array(1025).fill(null);
  const result = admission(rawWorld(input));
  assert.deepEqual(result, objectAdmission(input));
  assert.equal(result.value.profile, null);
  assert.equal(result.value.profileResources.bindings[0].providerOccurrences, 1025);
});

test("numeric admission preserves its reason before nonnumeric field and discriminator checks", () => {
  for (const [lexeme, reason] of [["-0", "invalid-format"], ["-0.0e100", "invalid-format"],
    ["9007199254740992", "invalid-format"], ["1.0000000000000001", "invalid-type"]]) {
    const input = world();
    const raw = rawWorld(input);
    raw.profile = encoder.encode(JSON.stringify(input.profile).replace(JSON.stringify(input.profile.profileId), lexeme));
    assert.deepEqual(admission(raw).diagnostics, [{ code: "schema.invalid-value", phase: "schema",
      path: [field("profile"), field("profileId")], coordinate: {}, details: { reason } }]);
    const declaration = input.declarations[0];
    raw.profile = bytes(input.profile);
    raw.declarations[0] = encoder.encode(JSON.stringify(declaration).replace('"kind":"optional"', '"kind":' + lexeme));
    assert.deepEqual(admission(raw).diagnostics, [{ code: "schema.invalid-value", phase: "schema",
      path: [field("declarations"), index(0), field("slots"), index(0), field("cardinality"), field("kind")],
      coordinate: {}, details: { reason } }]);
  }
});

test("aggregate byte rejection prevents every scanner call", () => {
  const full = new Uint8Array(1_048_576);
  const result = admission({ declarations: Array(16).fill(full), profile: bytes(null) },
    { open() { assert.fail("scanner reached byte-rejected batch"); } });
  assert.equal(result.value.declarations.length, 0);
  assert.deepEqual(result.diagnostics.map(row => row.details.limitName), ["aggregateRawBytes"]);
});

test("batch value exhaustion stops before views, schema validation or semantic snapshots", () => {
  const document = encoder.encode("[" + "null,".repeat(199_999) + "null]");
  let opens = 0;
  const result = admission({ declarations: Array(11).fill(document), profile: bytes(world().profile) },
    { open(owned) { opens += 1; return scanner.open(owned); } });
  assert.equal(opens, 11);
  assert.equal(result.value.profile, null);
  assert.equal(result.value.profileResources, null);
  assert.equal(result.value.declarations.length, 0);
  assert.deepEqual(result.diagnostics.map(row => row.details.limitName), ["jsonValueOccurrences"]);
});

test("string exhaustion is batch-wide while excessive depth remains document-local", () => {
  const document = encoder.encode('"' + "x".repeat(1_048_574) + '"');
  const blocked = admission({ declarations: Array(9).fill(document), profile: bytes(world().profile) });
  assert.equal(blocked.value.profile, null);
  assert.deepEqual(blocked.diagnostics.map(row => row.details.limitName), ["aggregateStringBytes"]);
  const input = rawWorld(world());
  input.declarations.unshift(encoder.encode("[".repeat(33) + "0" + "]".repeat(33)));
  const result = admission(input);
  assert.equal(result.value.declarations.length, 1);
  assert.notEqual(result.value.profile, null);
  assert.deepEqual(result.diagnostics.map(row => [row.details.limitName, row.path]),
    [["jsonDepth", [field("declarations"), index(0), ...Array(30).fill(0).map(index)]]]);
});

function rawProfileDiagnostics(source) {
  const input = rawWorld(world());
  input.profile = encoder.encode(source);
  return admission(input);
}
const diagnostic = (code, path, reason) => ({ code, phase: code.startsWith("decode.") ? "decode" : "schema",
  coordinate: {}, path: [field("profile"), ...path.map(part => typeof part === "number" ? index(part) : field(part))], details: { reason } });

test("raw duplicate producer emits one complete candidate per normalized path", () => {
  for (const [source, paths] of [
    ['{"privateA":{"x":0,"x":1},"privateB":{"y":0,"y":1}}', [[]]],
    ['{"profileId":0,"profileId":1,"profileId":2}', [["profileId"]]],
    ['{"selections":[{"moduleId":0,"moduleId":1}],"selections":[{"moduleId":2,"moduleId":3}]}', [["selections"], ["selections",0,"moduleId"]]],
  ]) {
    const result = rawProfileDiagnostics(source);
    assert.deepEqual(result.diagnostics, paths.map(path => diagnostic("decode.duplicate-key", path, "duplicate-key")));
    assert.equal(result.value.profile, null);
    assert.equal(result.value.profileResources, null);
  }
});

test("whole raw numeric admission preserves independent errors under unsupported schema", () => {
  const result = rawProfileDiagnostics('{"schemaVersion":2,"privateA":[1e-400,-0,1e-400],"privateB":{"x":-0},"profileId":-0}');
  assert.deepEqual(result.diagnostics, [
    diagnostic("schema.unsupported-version", ["schemaVersion"], "unsupported-version"),
    diagnostic("schema.invalid-value", [], "invalid-format"),
    diagnostic("schema.invalid-value", [], "invalid-type"),
    diagnostic("schema.invalid-value", ["profileId"], "invalid-format"),
  ]);
  assert.equal(result.value.profile, null);
  assert.equal(result.value.profileResources, null);
});

test("schema and numeric producers deduplicate only the same reason at the same path", () => {
  assert.deepEqual(rawProfileDiagnostics('[1e-400]').diagnostics, [
    diagnostic("schema.invalid-value", [], "invalid-type"), diagnostic("schema.invalid-value", [0], "invalid-type"),
  ]);
  assert.deepEqual(rawProfileDiagnostics('[-0]').diagnostics, [
    diagnostic("schema.invalid-value", [], "invalid-type"), diagnostic("schema.invalid-value", [0], "invalid-format"),
  ]);
  for (const [source, expected] of [
    ['{"x":-0,"x":1e-400}', [diagnostic("decode.duplicate-key", [], "duplicate-key")]],
    ['{"x":-0,', [diagnostic("decode.invalid-json", [], "invalid-json")]],
  ]) assert.deepEqual(rawProfileDiagnostics(source).diagnostics, expected);
});

test("numeric failures in oversized arrays retain their paths and withhold snapshots", () => {
  const input = world().profile;
  input.roots = Array(257).fill("example/root");
  const source = JSON.stringify(input).replace('"roots":["example/root"', '"roots":[-0');
  const result = rawProfileDiagnostics(source);
  assert.equal(result.value.profile, null);
  assert.ok(result.diagnostics.some(row => row.code === "schema.invalid-value"
    && row.details.reason === "invalid-format" && JSON.stringify(row.path) === JSON.stringify([field("profile"),field("roots"),index(0)])));
});

test("depth failures preserve attempted positions and apply invocation-inclusive clipping", () => {
  for (const [source, path] of [
    ['['.repeat(33) + '0' + ']'.repeat(33), Array(31).fill(0)],
    ['[0,0,' + '['.repeat(32) + '0' + ']'.repeat(32) + ']', [2, ...Array(30).fill(0)]],
    ['{"profileId":' + '['.repeat(32) + '0' + ']'.repeat(32) + '}', ['profileId', ...Array(30).fill(0)]],
    ['{"private":' + '['.repeat(32) + '0' + ']'.repeat(32) + '}', []],
  ]) {
    assert.deepEqual(rawProfileDiagnostics(source).diagnostics, [{
      code: "input.limit-exceeded", phase: "decode", coordinate: {},
      path: [field("profile"), ...path.map(part => typeof part === "number" ? index(part) : field(part))],
      details: { limitName: "jsonDepth", limit: 32, actual: 33 },
    }]);
  }
});
