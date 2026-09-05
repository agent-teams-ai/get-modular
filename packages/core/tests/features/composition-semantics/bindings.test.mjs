import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createDeclarationCensus } from "../../../dist-test/features/composition-semantics/declaration-census.js";
import { createProfileCensus } from "../../../dist-test/features/composition-semantics/profile-census.js";
import { validateSelectedBindings } from "../../../dist-test/features/composition-semantics/selected-bindings.js";
import { analyzeSelectedGraph } from "../../../dist-test/features/composition-semantics/selected-graph.js";
import { collectGraphFailures } from "../../../dist-test/features/composition-semantics/graph-diagnostics.js";
import { createDiagnosticCollector } from "../../../dist-test/features/diagnostics/internal.js";
import { createOwnedJcs } from "../../../dist-test/features/canonicalization/owned-jcs/factory.js";
import { admitObjectInput } from "../../../dist-test/features/input-admission/object-admission.js";

const root = new URL("../../../../../", import.meta.url);
const handbook = JSON.parse(await readFile(new URL("tests/qualification/compiler-engineer/examples.json", root), "utf8"));
const resourceCases = JSON.parse(await readFile(new URL("architecture/qualification/v1/resource-boundary-vectors.json", root), "utf8"));
const compatibility = (token = "example/cap/v1") => ({ family: "exact", familyVersion: 1, token });
const capability = (token) => ({ capabilityId: "example/cap", compatibility: compatibility(token) });
const slot = (slotId = "dep", cardinality = { kind: "required" }) => ({ slotId, ...capability(), cardinality });
const declaration = (name, slots = [], provides = []) => ({ kind: "get-modular.module-declaration", schemaVersion: 1,
  moduleId: `example/${name}`, implementationId: `example/${name}/default`, owner: { authority: "example", path: [name] }, slots, provides });
const binding = (consumer, providers = [], slotId = "dep") => ({ consumerImplementationId: consumer.implementationId,
  slotId, providerImplementationIds: providers.map(provider => typeof provider === "string" ? provider : provider.implementationId) });
const profile = (declarations, bindings = []) => ({ kind: "get-modular.composition-profile", schemaVersion: 1, profileId: "example/main",
  roots: [declarations[0].moduleId], selections: declarations.map(({ moduleId, implementationId }) => ({ moduleId, implementationId })), bindings });
function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function permutations(values) { return values.length ? values.flatMap((value, i) => permutations(values.filter((_v, j) => j !== i)).map(tail => [value, ...tail])) : [[]]; }
function analyze(declarations, p, complete = true) {
  const collector = createDiagnosticCollector(createOwnedJcs().canonicalize);
  const census = createDeclarationCensus(freeze(declarations), complete, collector);
  const selected = createProfileCensus(freeze(p), census, collector);
  const result = validateSelectedBindings(p, census, selected, collector);
  return { result, selected, collector, census };
}
const coordinate = (consumer, slotId = "dep", provider) => ({ implementationId: consumer.implementationId, slotId,
  ...(provider === undefined ? {} : { providerImplementationId: typeof provider === "string" ? provider : provider.implementationId }) });
const diagnostic = (code, coordinate, details) => ({ code, phase: "binding", path: [], coordinate, details });
const reason = (code, coordinate, reason) => diagnostic(code, coordinate, { reason });
const cardinalityError = (consumer, kind, count) => diagnostic("binding.cardinality", coordinate(consumer), { expectedCardinality: kind, actualCardinality: count });

test("handbook binding expectations execute against real validation across declaration and record permutations", () => {
  const ids = ["optional-empty", "optional-missing", "many-zero", "many-minimum", "many-maximum", "many-overflow", "many-duplicate", "hostile-slot-names", "unknown-binding-coordinates"];
  for (const id of ids) {
    const fixture = handbook.cases.find(row => row.id === id);
    for (const declarations of permutations(structuredClone(fixture.input.declarations))) {
      for (const bindings of permutations(structuredClone(fixture.input.profile.bindings))) {
        const { result, collector } = analyze(declarations, { ...structuredClone(fixture.input.profile), bindings });
        assert.deepEqual(collector.finish(), fixture.expected.diagnostics ?? [], id);
        if (fixture.expected.ok) {
          // Binding projection only: no public compiler, plan-output or digest qualification.
          assert.deepEqual(result.validBindings.map(({ binding, slot }) => ({ ...binding, capabilityId: slot.capabilityId,
            compatibility: slot.compatibility })), fixture.expected.plan.bindings, id);
          assert.equal(result.hasErrors, false);
        }
      }
    }
  }
});

test("cardinality uses inclusive admitted many bounds and all input occurrences", () => {
  const providers = Array.from({ length: 5 }, (_v, i) => declaration(`p${i}`, [], [capability()]));
  const variants = [{ kind: "required" }, { kind: "optional" },
    ...Array.from({ length: 5 }, (_v, min) => Array.from({ length: 4 }, (_w, index) => ({ kind: "many", min, max: index + 1, order: "profile" })))
      .flat().filter(row => row.min <= row.max)];
  for (const variant of variants) {
    for (let count = 0; count <= 5; count += 1) {
      const app = declaration("app", [slot("dep", variant)]);
      const world = [app, ...providers];
      const { result, collector } = analyze(world, profile(world, [binding(app, providers.slice(0, count))]));
      const allowedCounts = variant.kind === "required" ? [1] : variant.kind === "optional" ? [0, 1]
        : [0, 1, 2, 3, 4, 5].filter(value => value >= variant.min && value <= variant.max);
      const valid = allowedCounts.includes(count);
      assert.deepEqual(collector.finish(), valid ? [] : [cardinalityError(app, variant.kind, count)]);
      assert.equal(result.frontierComplete(app.implementationId), valid);
      assert.equal(result.validBindings.length, Number(valid));
    }
  }
});

test("missing rows never become optional empty or zero-count cardinality failures", () => {
  for (const variant of [{ kind: "required" }, { kind: "optional" }, { kind: "many", min: 2, max: 2, order: "profile" }]) {
    const app = declaration("app", [slot("dep", variant)]);
    const { result, collector } = analyze([app], profile([app]));
    assert.deepEqual(collector.finish(), [reason("binding.missing", coordinate(app), "missing")]);
    assert.equal(result.frontierComplete(app.implementationId), false);
  }
});

test("accepted inverted many definition fails admission before count checks and contributes no partial declaration", () => {
  const fixture = resourceCases.semanticCases.find(row => row.name === "many-min-cannot-exceed-max");
  const app = declaration("app", [slot("dep", structuredClone(fixture.cardinality))]);
  const good = declaration("good");
  for (const declarations of [[app, good], [good, app]]) {
    const collector = createDiagnosticCollector(createOwnedJcs().canonicalize);
    const p = profile([app, good], [binding(app, [])]);
    const admitted = admitObjectInput({ declarations, profile: p }, collector);
    assert.equal(admitted.allDeclarationsAdmitted, false);
    assert.deepEqual(admitted.declarations.map(row => row.implementationId), [good.implementationId]);
    const census = createDeclarationCensus(admitted.declarations, admitted.allDeclarationsAdmitted, collector);
    const selected = createProfileCensus(admitted.profile, census, collector);
    const result = validateSelectedBindings(admitted.profile, census, selected, collector);
    assert.equal(result.frontierComplete(app.implementationId), false);
    assert.deepEqual(result.validBindings, []);
    assert.deepEqual(collector.finish(), [{ code: fixture.diagnosticCode, phase: "schema", coordinate: {}, details: { reason: "invalid-format" },
      path: [{ kind: "field", value: "declarations" }, { kind: "index", value: declarations.indexOf(app) },
        { kind: "field", value: "slots" }, { kind: "index", value: 0 }, { kind: "field", value: "cardinality" }] }]);
  }
});

test("duplicate, cardinality and provider failures coexist without salvaging any edge from the row", () => {
  const app = declaration("app", [slot()]);
  const good = declaration("good", [], [capability()]);
  const absentCap = declaration("absent");
  const wrongToken = declaration("wrong", [], [capability("example/other")]);
  const unknown = "example/unknown/default";
  const world = [app, good, absentCap, wrongToken];
  const p = profile(world, [binding(app, [good, good, absentCap, wrongToken, unknown, unknown])]);
  const { result, collector } = analyze(world, p);
  assert.deepEqual(collector.finish(), [
    reason("binding.duplicate", coordinate(app, "dep", good), "duplicate"),
    reason("binding.duplicate", coordinate(app, "dep", unknown), "duplicate"),
    reason("binding.unknown-provider", coordinate(app, "dep", unknown), "unknown"),
    cardinalityError(app, "required", 6),
    reason("binding.capability-missing", coordinate(app, "dep", absentCap), "missing"),
    diagnostic("binding.compatibility-mismatch", coordinate(app, "dep", wrongToken),
      { expectedCompatibility: compatibility(), actualCompatibility: compatibility("example/other") }),
  ]);
  assert.deepEqual(result.validBindings, []);
  assert.equal(result.frontierComplete(app.implementationId), false);
});

test("known unselected providers retain independent capability/compatibility failures; absent ones do not become not-selected", () => {
  const app = declaration("app", [slot()]);
  for (const provides of [[], [capability("example/other")], [capability()]]) {
    const provider = declaration("provider", [], provides);
    const { result, collector } = analyze([app, provider], profile([app], [binding(app, [provider])]));
    const expected = [reason("binding.provider-not-selected", coordinate(app, "dep", provider), "mismatch")];
    if (!provides.length) expected.push(reason("binding.capability-missing", coordinate(app, "dep", provider), "missing"));
    else if (provides[0].compatibility.token !== compatibility().token) expected.push(diagnostic("binding.compatibility-mismatch",
      coordinate(app, "dep", provider), { expectedCompatibility: compatibility(), actualCompatibility: compatibility("example/other") }));
    assert.deepEqual(collector.finish(), expected);
    assert.deepEqual(result.validBindings, []);
  }
});

test("unknown consumer and slot suppress their derivatives while normalizing repeated consumer coordinates", () => {
  const app = declaration("app");
  const unknown = declaration("unknown");
  const p = profile([app], [binding(unknown, ["example/missing"], "one"), binding(unknown, [], "two"), binding(app, ["example/missing"], "bad")]);
  const { collector, result } = analyze([app], p);
  assert.deepEqual(collector.finish(), [
    reason("binding.unknown-consumer", { implementationId: unknown.implementationId }, "unknown"),
    reason("binding.unknown-slot", coordinate(app, "bad"), "unknown"),
  ]);
  assert.equal(result.frontierComplete(app.implementationId), false);
  assert.equal(result.frontierComplete(unknown.implementationId), false);
});

test("incomplete declaration admission suppresses negative identities but retains known slot duplicates and counts", () => {
  const app = declaration("app", [slot(), slot("missing", { kind: "optional" })]);
  const unknown = "example/unknown/default";
  const p = profile([app], [binding(app, [unknown, unknown]), binding(app, [unknown], "bad"), binding(declaration("absent"), [])]);
  const { result, collector } = analyze([app], p, false);
  assert.deepEqual(collector.finish(), [
    reason("binding.duplicate", coordinate(app, "dep", unknown), "duplicate"),
    reason("binding.missing", coordinate(app, "missing"), "missing"),
    cardinalityError(app, "required", 2),
  ]);
  assert.deepEqual(result.validBindings, []);
});

test("known unselected consumer rows are inert while independent selected rows remain valid", () => {
  const app = declaration("app", [slot("dep", { kind: "optional" })]);
  const unused = declaration("unused", [slot()]);
  const p = profile([app], [binding(app, []), binding(unused, new Array(100).fill("example/absent"), "bad")]);
  const { result, collector } = analyze([app, unused], p);
  assert.deepEqual(collector.finish(), []);
  assert.equal(result.validBindings.length, 1);
  assert.equal(result.frontierComplete(app.implementationId), true);
  assert.equal(result.frontierComplete(unused.implementationId), false);
});

test("ambiguous slots/capabilities/implementations never choose a winner or invent absence diagnostics", () => {
  for (const ambiguity of ["slot", "capability", "implementation"]) {
    const app = declaration("app", [slot()]);
    const provider = declaration("provider", [], [capability()]);
    const world = [app, provider];
    if (ambiguity === "slot") app.slots.push(slot());
    if (ambiguity === "capability") provider.provides.push(capability("example/other"));
    if (ambiguity === "implementation") world.push(structuredClone(provider));
    const { result, collector } = analyze(world, profile([app, provider], [binding(app, [provider])]));
    assert.equal(collector.finish().every(row => row.phase === "declaration"), true);
    assert.equal(result.frontierComplete(app.implementationId), false);
    assert.deepEqual(result.validBindings, []);
  }
});

test("independent cycles survive a mixed valid/unknown provider row, whose whole edge set stays absent", () => {
  for (const id of ["cycle-with-tail", "partial-binding-with-independent-cycle"]) {
    const fixture = handbook.cases.find(row => row.id === id);
    for (const rows of permutations(structuredClone(fixture.input.profile.bindings))) {
      const { result, selected, collector } = analyze(structuredClone(fixture.input.declarations), { ...structuredClone(fixture.input.profile), bindings: rows });
      const edges = result.validBindings.flatMap(({ binding }) => binding.providerImplementationIds.map(id => [id, binding.consumerImplementationId]));
      const graph = analyzeSelectedGraph(selected.selectedImplementationIds, edges, selected.resolvedRoots);
      collectGraphFailures(graph, collector);
      assert.deepEqual(collector.finish(), fixture.expected.diagnostics, id);
      if (id === "partial-binding-with-independent-cycle") {
        const invalid = rows.find(row => row.providerImplementationIds.some(id => id.includes("missing")));
        assert.equal(edges.some(edge => edge[1] === invalid.consumerImplementationId), false);
        assert.equal(result.frontierComplete(invalid.consumerImplementationId), false);
      }
    }
  }
});

test("an unreached invalid frontier leaves the reached frontier complete, without itself emitting unreachable diagnostics", () => {
  const fixture = handbook.cases.find(row => row.id === "unreached-invalid-binding-preserves-unreachable");
  const { result, selected, collector } = analyze(structuredClone(fixture.input.declarations), structuredClone(fixture.input.profile));
  const graph = analyzeSelectedGraph(selected.selectedImplementationIds, [], selected.resolvedRoots);
  assert.deepEqual(collector.finish(), fixture.expected.diagnostics.filter(row => row.phase === "binding"));
  assert.equal(graph.rootClosure.every(id => result.frontierComplete(id)), true);
  assert.equal(result.frontierComplete("example/orphan/default"), false);
  // Actual prerequisite orchestration and unreachable emission are a later slice.
});

test("maximum admitted many list keeps all 1024 providers in profile order; repeated occurrences normalize once", () => {
  const app = declaration("app", [slot("dep", { kind: "many", min: 0, max: 1024, order: "profile" })]);
  const providers = Array.from({ length: 1024 }, (_v, i) => declaration(`p${i}`, [], [capability()]));
  const world = [app, ...providers];
  const row = binding(app, [...providers].reverse());
  const { result, collector } = analyze(world, profile(world, [row]));
  assert.deepEqual(collector.finish(), []);
  assert.deepEqual(result.validBindings[0].binding.providerImplementationIds, row.providerImplementationIds);
  const repeated = analyze(world, profile(world, [binding(app, new Array(1024).fill(providers[0]))]));
  assert.deepEqual(repeated.collector.finish(), [reason("binding.duplicate", coordinate(app, "dep", providers[0]), "duplicate")]);
  assert.equal(repeated.collector.statistics().saturatedFailureCount, 1);
  assert.deepEqual(repeated.result.validBindings, []);
});

test("binding producers stream past K+1, deduplicating only within their bounded consumer/slot groups", () => {
  const app = declaration("app");
  const unknown = Array.from({ length: 300 }, (_v, i) => declaration(`u${String(i).padStart(4, "0")}`));
  const p = profile([app], unknown.flatMap(consumer => [binding(consumer, [], "one"), binding(consumer, [], "two")]));
  const { collector } = analyze([app], p);
  assert.equal(collector.statistics().saturatedFailureCount, 300);
  const errors = collector.finish();
  assert.equal(errors.length, 256);
  assert.equal(errors[254].coordinate.implementationId, unknown[254].implementationId);
  assert.deepEqual(errors.at(-1).details, { omitted: 45 });
});

test("owned results preserve frozen records, sorted bindings, safe slot keys and invocation isolation", () => {
  const app = declaration("app", [slot("then", { kind: "optional" }), slot("constructor", { kind: "optional" })]);
  const p = profile([app], [binding(app, [], "then"), binding(app, [], "constructor")]);
  const { result, collector } = analyze([app], p);
  assert.deepEqual(collector.finish(), []);
  assert.deepEqual(result.validBindings.map(row => row.binding.slotId), ["constructor", "then"]);
  assert.equal(result.validBindings[0].binding, p.bindings[1], "the stage borrows only already-owned frozen data");
  for (const value of [result, result.validBindings, ...result.validBindings, result.validBindings[0].binding, result.validBindings[0].slot]) assert.equal(Object.isFrozen(value), true);
  assert.throws(() => result.validBindings[0].binding.providerImplementationIds.push("example/mutation"), TypeError);
  const other = analyze([app], profile([app]));
  assert.equal(other.result.frontierComplete(app.implementationId), false);
  assert.equal(result.frontierComplete(app.implementationId), true);
});

test("violated private record precondition and collector faults propagate without fabricated diagnostics", () => {
  const app = declaration("app", [slot()]);
  const { census, selected } = analyze([app], profile([app]));
  const failure = Error("internal collector failure");
  assert.throws(() => validateSelectedBindings(freeze(profile([app])), census, selected, { addUnique() { throw failure; } }), error => error === failure);
  assert.throws(() => validateSelectedBindings(freeze(profile([app], [binding(app, []), binding(app, [])])), census, selected,
    { addUnique() { assert.fail("record precondition must be checked before emitting"); } }), /Unique binding records/);
});
