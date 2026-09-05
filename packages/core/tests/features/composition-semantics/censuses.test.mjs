import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createDeclarationCensus } from "../../../dist-test/features/composition-semantics/declaration-census.js";
import { createProfileCensus } from "../../../dist-test/features/composition-semantics/profile-census.js";
import { createDiagnosticCollector } from "../../../dist-test/features/diagnostics/internal.js";
import { createOwnedJcs } from "../../../dist-test/features/canonicalization/owned-jcs/factory.js";

const root = new URL("../../../../../", import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), "utf8"));
const handbook = await json("tests/qualification/compiler-engineer/examples.json");
const manifest = await json("architecture/qualification/v1/qualification-case-manifest.json");
const snapshots = (await json("architecture/qualification/v1/diagnostic-snapshots.json")).snapshots;
const declaration = (moduleId = "example/app", implementationId = `${moduleId}/default`) => ({ kind: "get-modular.module-declaration", schemaVersion: 1,
  moduleId, implementationId, owner: { authority: "example", path: ["app"] }, provides: [], slots: [] });
const capability = (capabilityId = "example/cap", token = "example/cap/v1") => ({ capabilityId, compatibility: { family: "exact", familyVersion: 1, token } });
const slot = (slotId = "database") => ({ slotId, ...capability(), cardinality: { kind: "required" } });
const selection = (moduleId = "example/app", implementationId = `${moduleId}/default`) => ({ moduleId, implementationId });
const profile = () => ({ kind: "get-modular.composition-profile", schemaVersion: 1, profileId: "example/main", roots: ["example/app"], selections: [selection()], bindings: [] });
function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const reasonDiagnostic = (code, phase, coordinate, reason, path = []) => ({ code, phase, coordinate, path, details: { reason } });
const field = value => ({ kind: "field", value });
const index = value => ({ kind: "index", value });
function analyze(declarations, inputProfile = profile(), complete = true) {
  const collector = createDiagnosticCollector(createOwnedJcs().canonicalize);
  const census = createDeclarationCensus(freeze(declarations), complete, collector);
  const selected = createProfileCensus(freeze(inputProfile), census, collector);
  return { census, selected, diagnostics: collector.finish(), statistics: collector.statistics() };
}
function permutations(values) {
  return values.length ? values.flatMap((value, i) => permutations(values.filter((_item, j) => j !== i)).map(tail => [value, ...tail])) : [[]];
}

test("legal module alternatives retain exact selected implementations without a central winner", () => {
  const a = declaration("example/service", "example/service/a");
  const b = declaration("example/service", "example/service/b");
  const p = { ...profile(), roots: ["example/service"], selections: [selection("example/service", b.implementationId)] };
  for (const declarations of [[a, b], [b, a]]) {
    const { census, selected, diagnostics } = analyze(declarations, p);
    assert.deepEqual(diagnostics, []);
    assert.equal(census.identityCensusComplete, true);
    assert.equal(census.moduleCensusComplete, true);
    assert.equal(census.hasModule("example/service"), true);
    assert.equal(census.implementation(a.implementationId).declaration, a);
    assert.deepEqual(selected.selectedImplementationIds, [b.implementationId]);
    assert.deepEqual(selected.resolvedRoots, [b.implementationId]);
    assert.deepEqual(selected.resolvedNodes.map(row => row.declaration.implementationId), [b.implementationId]);
    assert.equal(selected.isSelected(a.implementationId), false);
  }
});

test("duplicate implementation lookup is ambiguous and suppresses the exact negative-census candidate", () => {
  const fixture = manifest.staticConformanceProtocol.cases.find(row => row.caseId === "diag.object.negative-census-suppression.v1");
  for (const declarations of permutations(structuredClone(fixture.input.declarations))) {
    const { census, selected, diagnostics } = analyze(declarations, structuredClone(fixture.input.profile));
    assert.deepEqual(diagnostics, fixture.expected.diagnostics);
    assert.equal(census.identityCensusComplete, false);
    assert.equal(census.moduleCensusComplete, true);
    assert.equal(census.implementation(declarations[0].implementationId), null);
    assert.equal(selected.resolvedNodes, null);
  }
});

test("the accepted duplicate-selection and independent mismatch survive every declaration/row permutation", () => {
  const fixture = handbook.cases.find(row => row.id === "duplicate-selection-with-mismatch");
  for (const declarations of permutations(structuredClone(fixture.input.declarations))) {
    for (const selections of permutations(structuredClone(fixture.input.profile.selections))) {
      const { selected, diagnostics } = analyze(declarations, { ...structuredClone(fixture.input.profile), selections });
      assert.deepEqual(diagnostics, fixture.expected.diagnostics);
      assert.equal(selected.selectionsUnique, false);
      assert.equal(selected.selection("example/app"), null);
      assert.equal(selected.resolvedRoots, null);
      assert.ok(selected.resolvedNodes !== null, "known selected nodes are separate from module selection uniqueness");
    }
  }
});

test("incomplete admitted declarations withhold absence claims while independent positive duplicates continue", () => {
  const input = profile(); input.roots = ["example/absent", "example/absent", "example/app"];
  input.selections = [selection("example/absent"), selection("example/absent")];
  const { census, selected, diagnostics } = analyze([declaration()], input, false);
  assert.equal(census.moduleCensusComplete, false);
  assert.equal(census.identityCensusComplete, false);
  assert.deepEqual(diagnostics, [
    reasonDiagnostic("profile.duplicate-root", "profile", { moduleId: "example/absent" }, "duplicate"),
    reasonDiagnostic("profile.duplicate-selection", "profile", { moduleId: "example/absent" }, "duplicate"),
  ]);
  assert.equal(selected.resolvedNodes, null);
  const duplicate = analyze([declaration(), declaration()], profile(), false);
  assert.deepEqual(duplicate.diagnostics.map(row => row.code), ["declaration.duplicate-implementation"]);
});

test("complete independent unknown-root/module/implementation and missing-root-selection conditions coexist", () => {
  const p = profile(); p.roots = ["example/absent", "example/app"];
  p.selections = [selection("example/absent")];
  const { selected, diagnostics } = analyze([declaration()], p);
  assert.deepEqual(diagnostics, [
    reasonDiagnostic("profile.unknown-root", "profile", { moduleId: "example/absent" }, "unknown"),
    reasonDiagnostic("profile.unknown-module", "profile", { moduleId: "example/absent" }, "unknown"),
    reasonDiagnostic("profile.unknown-implementation", "profile", { moduleId: "example/absent", implementationId: "example/absent/default" }, "unknown"),
    reasonDiagnostic("profile.missing-selection", "profile", { moduleId: "example/app" }, "missing"),
  ]);
  assert.equal(selected.resolvedRoots, null);
  assert.equal(selected.resolvedNodes, null);
  assert.equal(selected.selection("example/app"), undefined);
});

test("unselected declaration modules do not require profile selections", () => {
  assert.deepEqual(analyze([declaration(), declaration("example/unused")]).diagnostics, []);
  const p = profile(); p.roots.push("example/unused");
  assert.deepEqual(analyze([declaration(), declaration("example/unused")], p).diagnostics,
    [snapshots.find(row => row.name === "missing-selection").diagnostic].map(row => ({ ...row, coordinate: { moduleId: "example/unused" } })));
});

test("an unresolved non-root selection withholds closure even when every root resolves", () => {
  for (const complete of [false, true]) for (const kind of ["unknown", "mismatch"]) {
    const app = declaration();
    const other = declaration("example/other");
    const implementationId = kind === "unknown" ? "example/missing" : app.implementationId;
    const p = { ...profile(), selections: [selection(), selection(other.moduleId, implementationId)] };
    const { selected, diagnostics } = analyze([app, other], p, complete);
    assert.equal(selected.selectionsUnique, true);
    assert.equal(selected.resolvedRoots, null);
    assert.deepEqual(diagnostics, complete ? [reasonDiagnostic(
      kind === "unknown" ? "profile.unknown-implementation" : "profile.implementation-mismatch",
      "profile", { moduleId: other.moduleId, implementationId }, kind)] : []);
  }
  const other = declaration("example/other");
  const { selected, diagnostics } = analyze([declaration(), other],
    { ...profile(), selections: [selection(), selection(other.moduleId)] });
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(selected.resolvedRoots, ["example/app/default"]);
});

test("declaration duplicate paths match snapshots and use sorted identity positions across input permutations", () => {
  const duplicateCap = snapshots.find(row => row.name === "duplicate-capability").diagnostic;
  const duplicateSlot = snapshots.find(row => row.name === "duplicate-slot").diagnostic;
  for (const provides of permutations([capability("example/a"), capability("example/a", "example/other"), capability("example/z")])) {
    for (const slots of permutations([slot("database"), slot("database"), slot("then")])) {
      const d = { ...declaration(), provides, slots };
      const { census, diagnostics } = analyze([d]);
      assert.deepEqual(diagnostics, [duplicateCap, duplicateSlot]);
      const known = census.implementation(d.implementationId);
      assert.equal(known.capability("example/a"), null);
      assert.equal(known.slot("database"), null);
      assert.equal(known.capability("example/missing"), undefined);
      assert.equal(known.slot("missing"), undefined);
      assert.deepEqual(known.uniqueSlots.map(row => row.slotId), ["then"]);
      assert.equal(known.capability("example/z").capabilityId, "example/z");
    }
  }
});

test("normalized duplicates across repeated declarations are emitted once without dropping distinct positions", () => {
  const d = { ...declaration(), provides: [capability(), capability(), capability()], slots: [slot(), slot(), slot()] };
  const { diagnostics, statistics } = analyze([structuredClone(d), structuredClone(d), structuredClone(d)]);
  assert.deepEqual(diagnostics, [
    reasonDiagnostic("declaration.duplicate-implementation", "declaration", { implementationId: d.implementationId }, "duplicate"),
    ...[1, 2].map(i => reasonDiagnostic("declaration.duplicate-capability", "declaration", { implementationId: d.implementationId }, "duplicate", [field("provides"), index(i)])),
    ...[1, 2].map(i => reasonDiagnostic("declaration.duplicate-slot", "declaration", { implementationId: d.implementationId, slotId: "database" }, "duplicate", [field("slots"), index(i)])),
  ]);
  assert.equal(statistics.saturatedFailureCount, 5);
});

test("ambiguous implementation groups retain every known module without assigning either declaration", () => {
  const first = declaration("example/one", "example/shared");
  const second = declaration("example/two", "example/shared");
  for (const declarations of [[first, second], [second, first]]) {
    const { census } = analyze(declarations, { ...profile(), roots: ["example/one"], selections: [selection("example/one", "example/shared")] });
    assert.equal(census.implementation("example/shared"), null);
    assert.equal(census.hasModule("example/one"), true);
    assert.equal(census.hasModule("example/two"), true);
  }
});

test("repeated identical selection rows deduplicate pair diagnostics but remain ambiguous selections", () => {
  const p = profile(); p.selections = new Array(300).fill(selection("example/app", "example/missing"));
  const { selected, diagnostics, statistics } = analyze([declaration()], p);
  assert.deepEqual(diagnostics.map(row => row.code), ["profile.duplicate-selection", "profile.unknown-implementation"]);
  assert.equal(statistics.saturatedFailureCount, 2);
  assert.equal(selected.selection("example/app"), null);
});

test("census producers continue through a diagnostic storm and leave finalization to their caller", () => {
  const declarations = Array.from({ length: 300 }, (_value, i) => {
    const d = declaration(`example/m${String(i).padStart(4, "0")}`);
    return [d, structuredClone(d)];
  }).flat();
  const collector = createDiagnosticCollector(createOwnedJcs().canonicalize);
  const census = createDeclarationCensus(freeze(declarations), true, collector);
  assert.equal(census.hasErrors, true);
  const p = { ...profile(), roots: ["example/m0000"], selections: [selection("example/m0000")] };
  createProfileCensus(freeze(p), census, collector);
  assert.equal(collector.statistics().saturatedFailureCount, 300);
  const diagnostics = collector.finish();
  assert.equal(diagnostics.length, 256);
  assert.deepEqual(diagnostics.at(-1).details, { omitted: 45 });
  assert.equal(diagnostics[254].coordinate.implementationId, "example/m0254/default");
});

test("safe lookup records stay frozen, prototype-like slot names are data, and invocations are isolated", () => {
  const d = { ...declaration(), slots: [slot("then"), slot("constructor")] };
  const { census, selected } = analyze([d]);
  const known = census.implementation(d.implementationId);
  assert.equal(known.slot("constructor").slotId, "constructor");
  assert.equal(known.slot("then").slotId, "then");
  assert.equal(known.slot("toString"), undefined);
  assert.deepEqual(known.uniqueSlots.map(row => row.slotId), ["constructor", "then"]);
  for (const value of [census, known, known.declaration, known.uniqueSlots, selected, selected.resolvedRoots, selected.resolvedNodes, selected.selectedImplementationIds]) {
    assert.equal(Object.isFrozen(value), true);
  }
  assert.equal(analyze([declaration()]).census.implementation(d.implementationId).slot("then"), undefined);
  assert.throws(() => createDeclarationCensus(freeze([declaration(), declaration()]), true,
    { addUnique() { throw Error("internal collector failure"); } }), /internal collector failure/);
});
