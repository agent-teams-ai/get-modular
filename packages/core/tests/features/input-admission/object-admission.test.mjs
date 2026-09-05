import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { admitObjectInput } from "../../../dist/features/input-admission/object-admission.js";
import { createDiagnosticCollector } from "../../../dist/features/diagnostics/internal.js";
import { createOwnedJcs } from "../../../dist/features/canonicalization/owned-jcs/factory.js";
import { admissionLimits } from "../../../dist/features/input-admission/resource-limits.js";

const root = new URL("../../../../../", import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), "utf8"));
const { cases } = await json("tests/qualification/compiler-engineer/examples.json");
const limits = (await json("architecture/qualification/v1/resource-profile-v2.json")).limits;
const compatibility = () => ({ family: "exact", familyVersion: 1, token: "x/y" });
const capability = () => ({ capabilityId: "x/y", compatibility: compatibility() });
const slot = () => ({ ...capability(), slotId: "s", cardinality: { kind: "required" } });
const declaration = () => ({ kind: "get-modular.module-declaration", schemaVersion: 1,
  moduleId: "x/m", implementationId: "x/i", owner: { authority: "x", path: ["m"] }, provides: [], slots: [] });
const selection = () => ({ moduleId: "x/m", implementationId: "x/i" });
const binding = () => ({ consumerImplementationId: "x/i", slotId: "s", providerImplementationIds: [] });
const profile = () => ({ kind: "get-modular.composition-profile", schemaVersion: 1,
  profileId: "x/p", roots: ["x/m"], selections: [selection()], bindings: [] });
const world = () => ({ declarations: [declaration()], profile: profile() });
const field = value => ({ kind: "field", value });
const index = value => ({ kind: "index", value });
const limitDiagnostic = (name, phase, path = []) => ({ code: "input.limit-exceeded", phase,
  coordinate: {}, path, details: { limitName: name, limit: limits[name], actual: limits[name] + 1 } });
function admit(input) {
  const collector = createDiagnosticCollector(createOwnedJcs().canonicalize);
  const value = admitObjectInput(input, collector);
  return { value, diagnostics: collector.finish(), statistics: collector.statistics() };
}
function containers(value, found = new Set()) {
  if (value === null || typeof value !== "object" || found.has(value)) return found;
  found.add(value);
  for (const child of Object.values(value)) containers(child, found);
  return found;
}

test("admission owns all containers synchronously, preserving every caller order and occurrence", () => {
  const input = world();
  input.declarations[0].provides = [capability(), capability()];
  input.declarations[0].slots = [slot()];
  input.profile.bindings = [{ ...binding(), providerImplementationIds: ["x/b", "x/a"] }];
  const before = structuredClone(input);
  const caller = containers(input);
  const { value, diagnostics } = admit(input);
  assert.equal(value.hasErrors, false);
  assert.equal(value.allDeclarationsAdmitted, true);
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(value.declarations, before.declarations);
  assert.deepEqual(value.profile, before.profile);
  for (const item of containers(value)) { assert.equal(Object.isFrozen(item), true); assert.equal(caller.has(item), false); }
  for (const item of caller) assert.equal(Object.isFrozen(item), false);
  input.declarations[0].owner.path[0] = "changed";
  input.declarations.length = 0;
  input.profile.bindings[0].providerImplementationIds.reverse();
  input.profile.selections[0].implementationId = "x/changed";
  assert.deepEqual(value.declarations, before.declarations);
  assert.deepEqual(value.profile, before.profile);
  assert.deepEqual(value.profileResources, { selections: before.profile.selections, selectionCensusComplete: true,
    bindings: [{ ordinal: 0, consumerImplementationId: "x/i", slotId: "s", providerOccurrences: 2 }] });
});

test("schema-invalid declarations supply no partial records and independent declarations/profile remain admitted", () => {
  for (const id of ["invalid-declaration-suppresses-absence", "renamed-unknown-declaration-field"]) {
    const fixture = cases.find(entry => entry.id === id);
    const { value, diagnostics } = admit(structuredClone(fixture.input));
    assert.equal(value.hasErrors, true);
    assert.equal(value.allDeclarationsAdmitted, false);
    assert.equal(value.declarations.length, fixture.input.declarations.length - 1);
    assert.deepEqual(value.profile, fixture.input.profile);
    assert.deepEqual(diagnostics, fixture.expected.diagnostics, id);
  }
  const input = world(); input.declarations.unshift(null, { schemaVersion: 2 });
  const { value, diagnostics } = admit(input);
  assert.deepEqual(value.declarations, [input.declarations[2]]);
  assert.deepEqual(diagnostics.map(item => item.code), ["schema.unsupported-version", "schema.invalid-value"]);
  assert.equal(value.allDeclarationsAdmitted, false);
});

test("non-plain and depth failures are document-local, invoke no getters and cannot enter semantic data", () => {
  let invoked = 0;
  const accessor = declaration(); Object.defineProperty(accessor, "moduleId", { get() { invoked += 1; throw Error("called"); } });
  let deep = null; for (let depth = 0; depth < 12_000; depth += 1) deep = [deep];
  const input = world(); input.declarations.unshift(accessor, deep);
  const { value, diagnostics } = admit(input);
  assert.equal(invoked, 0);
  assert.deepEqual(value.declarations, [input.declarations[2]]);
  assert.deepEqual(value.profile, input.profile);
  assert.deepEqual(diagnostics, [limitDiagnostic("jsonDepth", "decode", [field("declarations"), index(1)]),
    { code: "schema.non-plain-value", phase: "schema", path: [field("declarations"), index(0)], coordinate: {}, details: { reason: "non-plain-value" } }]);
});

test("declaration limit is inclusive and overflow is rejected before inspecting or copying positions", () => {
  const at = world(); at.declarations = new Array(limits.declarations).fill(declaration());
  assert.equal(admit(at).value.declarations.length, limits.declarations);
  const over = new Array(limits.declarations + 1);
  Object.defineProperty(over, "0", { get() { throw Error("inspected rejected list"); } });
  const { value, diagnostics } = admit({ declarations: over, profile: profile() });
  assert.deepEqual(diagnostics, [limitDiagnostic("declarations", "declaration")]);
  assert.deepEqual(value, { declarations: [], allDeclarationsAdmitted: false, profile: null, profileResources: null, hasErrors: true });
});

test("batch JSON/string exhaustion never promotes earlier valid documents or a partial resource profile", () => {
  for (const [name, payload, phase] of [["jsonValueOccurrences", new Array(limits.jsonValueOccurrences), "schema"],
    ["aggregateStringBytes", "x".repeat(limits.aggregateStringBytes), "decode"]]) {
    const input = world(); input.profile.unknown = payload;
    const { value, diagnostics } = admit(input);
    assert.deepEqual(diagnostics, [limitDiagnostic(name, phase)]);
    assert.equal(value.hasErrors, true);
    assert.equal(value.allDeclarationsAdmitted, false);
    assert.deepEqual(value.declarations, []);
    assert.equal(value.profile, null);
    assert.equal(value.profileResources, null);
  }
});

test("all structural document limits accept their boundary and emit a saturated resource failure one above", () => {
  const rows = [
    ["ownerPathSegments", "declaration", ["owner", "path"], "m"],
    ["capabilitiesPerDeclaration", "declaration", ["provides"], capability()],
    ["slotsPerDeclaration", "declaration", ["slots"], slot()],
    ["roots", "profile", ["roots"], "x/m"],
    ["selections", "profile", ["selections"], selection()],
    ["bindings", "profile", ["bindings"], binding()],
  ];
  for (const [name, phase, path, item] of rows) {
    for (const extra of [0, 1]) {
      const input = world();
      const target = phase === "declaration" ? input.declarations[0] : input.profile;
      const parent = path.slice(0, -1).reduce((value, key) => value[key], target);
      parent[path.at(-1)] = new Array(limits[name] + extra).fill(item);
      const { value, diagnostics } = admit(input);
      const resource = diagnostics.filter(diagnostic => diagnostic.code === "input.limit-exceeded");
      const prefix = phase === "declaration" ? [field("declarations"), index(0)] : [field("profile")];
      assert.deepEqual(resource, extra ? [limitDiagnostic(name, phase, [...prefix, ...path.map(field)])] : [], name);
      assert.equal(value.hasErrors, extra === 1, name);
      if (extra) assert.ok(diagnostics.some(diagnostic => diagnostic.code === "schema.invalid-value"), name);
    }
  }
});

test("identifier byte limits follow complete grammar validation, including local-token schema overlaps", () => {
  for (const [key, lengths, make] of [["moduleId", [128, 129, 1000], n => `a/${"b".repeat(n - 2)}`],
    ["authority", [64, 65, 128, 129], n => "a".repeat(n)]]) {
    for (const length of lengths) {
      const input = world();
      (key === "authority" ? input.declarations[0].owner : input.declarations[0])[key] = make(length);
      const { diagnostics } = admit(input);
      assert.equal(diagnostics.filter(item => item.code === "input.limit-exceeded").length, length > 128 ? 1 : 0);
      assert.equal(diagnostics.filter(item => item.code === "identity.invalid").length, length > (key === "authority" ? 64 : 128) ? 1 : 0);
      if (length > 128) assert.equal(diagnostics.find(item => item.code === "input.limit-exceeded").details.actual, 129);
    }
  }
  for (const invalid of [`a/${"b".repeat(127)}!`, "é".repeat(129), `${"x".repeat(129)}/`]) {
    const input = world(); input.declarations[0].moduleId = invalid;
    assert.deepEqual(admit(input).diagnostics.map(item => item.code), ["identity.invalid"]);
  }
});

test("aggregate capabilities and slots cover all candidates and block proportional semantic snapshots", () => {
  for (const [name, fieldName, perDocument, item] of [["totalCapabilities", "provides", 64, capability()],
    ["totalSlots", "slots", 128, slot()]]) {
    for (const extra of [0, 1]) {
      const input = world();
      input.declarations = new Array(limits[name] / perDocument).fill({ ...declaration(), [fieldName]: new Array(perDocument).fill(item) });
      if (extra) input.declarations.push({ ...declaration(), [fieldName]: [item] });
      const { value, diagnostics } = admit(input);
      assert.deepEqual(diagnostics, extra ? [limitDiagnostic(name, "declaration")] : [], name);
      assert.equal(value.allDeclarationsAdmitted, extra === 0, name);
      assert.equal(value.declarations.length, extra ? 0 : input.declarations.length, name);
      assert.equal(value.profile === null, extra === 1, name);
    }
  }
});

test("independently proven aggregate failures survive a later JSON admission stop", () => {
  const input = world();
  input.declarations[0].provides = new Array(limits.jsonValueOccurrences);
  const { diagnostics } = admit(input);
  assert.deepEqual(diagnostics, [limitDiagnostic("jsonValueOccurrences", "schema"), limitDiagnostic("totalCapabilities", "declaration")]);
});

test("resource-only profile counts retain oversized and duplicate provider occurrences without admitting the profile", () => {
  const input = world(); input.declarations[0].slots = [{ ...slot(), cardinality: { kind: "many", min: 0, max: 1024, order: "profile" } }];
  input.profile.bindings = [{ ...binding(), providerImplementationIds: new Array(1025).fill("x/i") }];
  const { value, diagnostics } = admit(input);
  assert.equal(value.profile, null);
  assert.equal(value.allDeclarationsAdmitted, true);
  assert.deepEqual(value.profileResources, { selections: input.profile.selections, selectionCensusComplete: true,
    bindings: [{ ordinal: 0, consumerImplementationId: "x/i", slotId: "s", providerOccurrences: 1025 }] });
  assert.deepEqual(diagnostics.map(item => item.code), ["schema.invalid-value"]);
  // The named many/graph limits still need semantic consumer/slot/selection
  // prerequisites. Admission must neither invent them nor hide their counts.
  assert.ok(diagnostics.every(item => item.code !== "input.limit-exceeded"));
});

test("resource evidence preserves incomplete selection census and never stores malformed IDs or provider contents", () => {
  const input = world(); input.profile.selections.push({ moduleId: "secret!", implementationId: "x/i" });
  input.profile.bindings = [{ ...binding(), slotId: "INVALID", providerImplementationIds: ["secret!", null] },
    { ...binding(), consumerImplementationId: "INVALID" }];
  const { value } = admit(input);
  assert.equal(value.profile, null);
  assert.deepEqual(value.profileResources, { selections: [selection()], selectionCensusComplete: false,
    bindings: [{ ordinal: 0, consumerImplementationId: "x/i", slotId: null, providerOccurrences: 2 }] });
  assert.equal(JSON.stringify(value).includes("secret"), false);
  const version = world(); version.profile.schemaVersion = 2;
  assert.equal(admit(version).value.profileResources, null);
});

test("admission streams every unique error past K+1 and leaves collector completion to its caller", () => {
  const input = world(); input.declarations = new Array(300).fill(null);
  const collector = createDiagnosticCollector(createOwnedJcs().canonicalize);
  const value = admitObjectInput(input, { addUnique: collector.addUnique });
  assert.equal(value.hasErrors, true);
  // Add an independent later semantic failure, proving admission did not finish.
  collector.addUnique({ code: "profile.duplicate-root", phase: "profile", path: [], coordinate: { moduleId: "x/m" }, details: { reason: "duplicate" } });
  const diagnostics = collector.finish();
  assert.equal(diagnostics.length, 256);
  assert.deepEqual(diagnostics.at(-1), { code: "diagnostics.truncated", phase: "output", path: [], coordinate: {}, details: { omitted: 46 } });
  assert.equal(collector.statistics().peakRetained, 256);
  assert.equal(collector.statistics().saturatedFailureCount, 301);
  assert.deepEqual(diagnostics[254].path, [field("declarations"), index(254)]);
});

test("resource observations preserve original binding locators when malformed rows are excluded", () => {
  const input = world();
  input.profile.bindings = [null, { ...binding(), consumerImplementationId: "INVALID" },
    { ...binding(), providerImplementationIds: new Array(1025).fill("x/i") }];
  assert.deepEqual(admit(input).value.profileResources.bindings,
    [{ ordinal: 2, consumerImplementationId: "x/i", slotId: "s", providerOccurrences: 1025 }]);
});

test("unknown sibling keys normalize once and all invocation-local state is isolated", () => {
  const input = world(); input.declarations[0].secret = "one"; input.declarations[0].password = "two";
  const invalid = admit(input);
  assert.equal(invalid.diagnostics.length, 1);
  assert.equal(invalid.statistics.saturatedFailureCount, 1);
  assert.equal(admit(world()).value.hasErrors, false);
  assert.throws(() => admitObjectInput(input, { addUnique() { throw Error("internal collector failure"); } }), /internal collector failure/);
});

test("all implemented fixed admission limits match the accepted profile and remain immutable", () => {
  for (const [name, value] of Object.entries(admissionLimits)) assert.equal(value, limits[name], name);
  assert.equal(Object.isFrozen(admissionLimits), true);
});
