import assert from "node:assert/strict";
import test from "node:test";
import { admitObjectInput } from "../../../dist-test/features/input-admission/object-admission.js";
import { analyzeCompositionSemantics } from "../../../dist-test/features/composition-semantics/semantic-analysis.js";
import { createDeclarationCensus } from "../../../dist-test/features/composition-semantics/declaration-census.js";
import { collectGraphResourceLimits } from "../../../dist-test/features/composition-semantics/graph-resources.js";
import { createDiagnosticCollector } from "../../../dist-test/features/diagnostics/internal.js";
import { createOwnedJcs } from "../../../dist-test/features/canonicalization/owned-jcs/factory.js";

const capability = () => ({ capabilityId: "x/cap", compatibility: { family: "exact", familyVersion: 1, token: "x/cap" } });
const slot = (cardinality = { kind: "many", min: 0, max: 1024, order: "profile" }) => ({ slotId: "dep", ...capability(), cardinality });
const declaration = (name, slots = []) => ({ kind: "get-modular.module-declaration", schemaVersion: 1,
  moduleId: `x/${name}`, implementationId: `x/${name}/i`, owner: { authority: "x", path: [name] }, provides: [capability()], slots });
const selection = ({ moduleId, implementationId }) => ({ moduleId, implementationId });
const badSelection = () => ({ moduleId: "x/bad", implementationId: "BAD" });
const binding = (consumerImplementationId = "x/app/i", slotId = "dep", count = 1025) => ({ consumerImplementationId,
  slotId, providerImplementationIds: new Array(count).fill("x/app/i") });
const profile = (selections, bindings) => ({ kind: "get-modular.composition-profile", schemaVersion: 1,
  profileId: "x/main", roots: ["x/app"], selections, bindings });
const path = (...tokens) => tokens.map(value => typeof value === "string" ? { kind: "field", value } : { kind: "index", value });
const schemaError = (code, tokens, reason = "invalid-format") => ({ code, phase: "schema", coordinate: {},
  path: path(...tokens), details: { reason } });
const oversized = ordinal => schemaError("schema.invalid-value", ["profile", "bindings", ordinal, "providerImplementationIds"]);
const invalidSelection = (ordinal, field = "implementationId") => schemaError("identity.invalid", ["profile", "selections", ordinal, field]);
const manyError = ordinal => ({ code: "input.limit-exceeded", phase: "binding", coordinate: {},
  path: path("profile", "bindings", ordinal, "providerImplementationIds"),
  details: { limitName: "providersPerManySlot", limit: 1024, actual: 1025 } });
const edgeError = () => ({ code: "input.limit-exceeded", phase: "graph", coordinate: {}, path: [],
  details: { limitName: "graphEdges", limit: 262144, actual: 262145 } });
const reasonError = (code, phase, coordinate, reason, tokens = []) => ({ code, phase, coordinate,
  path: path(...tokens), details: { reason } });
const duplicateConsumer = implementationId => reasonError("declaration.duplicate-implementation", "declaration", { implementationId }, "duplicate");
const duplicateSlot = () => reasonError("declaration.duplicate-slot", "declaration",
  { implementationId: "x/app/i", slotId: "dep" }, "duplicate", ["slots", 1]);
const collector = () => createDiagnosticCollector(createOwnedJcs().canonicalize);
function compile(input) {
  const c = collector();
  const admitted = admitObjectInput(input, c);
  return { admitted, result: analyzeCompositionSemantics(admitted, c) };
}
function resourceResult(admitted) {
  const c = collector();
  const census = createDeclarationCensus(admitted.declarations, admitted.allDeclarationsAdmitted, c);
  const resources = collectGraphResourceLimits(admitted.profileResources, census, c);
  return { resources, diagnostics: c.finish() };
}

test("a malformed selection before or after known membership preserves many overflow and the original binding ordinal", () => {
  for (const badOrdinal of [0, 1]) {
    for (const badField of ["moduleId", "implementationId"]) {
      const app = declaration("app", [slot()]);
      const selections = [selection(app)];
      selections.splice(badOrdinal, 0, { moduleId: "x/bad", implementationId: "x/bad/i", [badField]: "BAD" });
      const input = { declarations: [app], profile: profile(selections, [null, binding()]) };
      const { admitted, result } = compile(input);
      assert.equal(admitted.profile, null);
      assert.deepEqual(admitted.profileResources, { selections: [selection(app)], selectionCensusComplete: false,
        bindings: [{ ordinal: 1, consumerImplementationId: "x/app/i", slotId: "dep", providerOccurrences: 1025 }] });
      assert.deepEqual(result, { ok: false, diagnostics: [
        schemaError("schema.invalid-value", ["profile", "bindings", 0], "invalid-type"),
        oversized(1), invalidSelection(badOrdinal, badField), manyError(1),
      ] });
      for (const value of [admitted.profileResources, admitted.profileResources.selections,
        ...admitted.profileResources.selections, admitted.profileResources.bindings, ...admitted.profileResources.bindings]) {
        assert.equal(Object.isFrozen(value), true);
      }
      const retained = structuredClone(admitted.profileResources);
      selections[1 - badOrdinal].implementationId = "x/changed/i";
      input.profile.bindings[1].providerImplementationIds.length = 0;
      assert.deepEqual(admitted.profileResources, retained);
    }
  }
});

test("graphEdges stays unavailable with partial selections even above its limit; repairing only the bad selection enables it", () => {
  for (const complete of [false, true]) {
    const app = declaration("app", [slot()]);
    const selections = [selection(app), ...(complete ? [] : [badSelection()])];
    const { admitted, result } = compile({ declarations: [app],
      profile: profile(selections, [binding("x/app/i", "dep", 262145)]) });
    assert.equal(admitted.profile, null);
    assert.equal(admitted.profileResources.selectionCensusComplete, complete);
    assert.deepEqual(result, { ok: false, diagnostics: [oversized(0),
      ...(complete ? [] : [invalidSelection(1)]), manyError(0), ...(complete ? [edgeError()] : [])] });
    assert.deepEqual(resourceResult(admitted), {
      resources: { countedInputEdges: complete ? 262145 : null, edgeLimitExceeded: complete },
      diagnostics: [manyError(0), ...(complete ? [edgeError()] : [])],
    });
  }
});

test("partial observations cannot supply semantic bindings or a self-loop, and 1024 providers do not exceed the many limit", () => {
  const app = declaration("app", [slot()]);
  for (const count of [1, 1024]) {
    const { admitted, result } = compile({ declarations: [app],
      profile: profile([selection(app), badSelection()], [binding("x/app/i", "dep", count)]) });
    assert.equal(admitted.profile, null);
    assert.deepEqual(result, { ok: false, diagnostics: [invalidSelection(1)] });
    assert.deepEqual(resourceResult(admitted), {
      resources: { countedInputEdges: null, edgeLimitExceeded: false }, diagnostics: [],
    });
  }
  assert.deepEqual(compile({ declarations: [app],
    profile: profile([selection(app)], [binding("x/app/i", "dep", 1)]) }).result,
  { ok: false, diagnostics: [{ code: "graph.cycle", phase: "graph", coordinate: {}, path: [],
    details: { component: ["x/app/i"] } }] });
});

test("partial membership does not infer a many violation from an unresolved consumer or slot", () => {
  for (const variant of ["unknown-consumer", "unselected-consumer", "unknown-slot", "ambiguous-consumer", "ambiguous-slot", "required", "optional"]) {
    const app = declaration("app", [slot()]);
    const input = { declarations: [app], profile: profile([selection(app), badSelection()], [binding()]) };
    const declarationFailures = [];
    if (variant === "unknown-consumer") {
      input.profile.selections[0].implementationId = "x/unknown/i";
      input.profile.bindings[0].consumerImplementationId = "x/unknown/i";
    }
    if (variant === "unselected-consumer") {
      const other = declaration("other"); input.declarations.push(other);
      input.profile.selections[0] = selection(other);
    }
    if (variant === "unknown-slot") input.profile.bindings[0].slotId = "unknown";
    if (variant === "ambiguous-consumer") {
      const duplicate = structuredClone(app); duplicate.slots[0].cardinality = { kind: "required" };
      input.declarations.push(duplicate); declarationFailures.push(duplicateConsumer("x/app/i"));
    }
    if (variant === "ambiguous-slot") {
      app.slots.push(slot({ kind: "required" })); declarationFailures.push(duplicateSlot());
    }
    if (variant === "required" || variant === "optional") app.slots[0].cardinality = { kind: variant };
    // The invalid profile supplies no semantic unknown-consumer/slot candidates.
    const expected = { ok: false, diagnostics: [oversized(0), invalidSelection(1), ...declarationFailures] };
    assert.deepEqual(compile(input).result, expected, variant);
    if (variant === "ambiguous-consumer" || variant === "ambiguous-slot") {
      input.declarations.reverse(); app.slots.reverse();
      assert.deepEqual(compile(input).result, expected, `${variant} reversed`);
    }
  }
});

test("an unrelated rejected declaration does not erase known many evidence under partial selections", () => {
  const app = declaration("app", [slot()]);
  const bad = { ...declaration("bad"), extra: true };
  const { admitted, result } = compile({ declarations: [bad, app],
    profile: profile([selection(app), badSelection()], [binding()]) });
  assert.equal(admitted.allDeclarationsAdmitted, false);
  assert.deepEqual(admitted.declarations.map(row => row.implementationId), ["x/app/i"]);
  assert.deepEqual(result, { ok: false, diagnostics: [
    schemaError("schema.unknown-field", ["declarations", 0], "unknown-field"),
    oversized(0), invalidSelection(1), manyError(0),
  ] });
});

test("schema-valid profiles preserve absent-versus-ambiguous consumer and slot diagnostics", () => {
  const app = declaration("app");
  const unknownRow = binding("x/unknown/i", "dep", 1);
  assert.deepEqual(compile({ declarations: [app], profile: profile([selection(app)], [unknownRow]) }).result,
    { ok: false, diagnostics: [reasonError("binding.unknown-consumer", "binding", { implementationId: "x/unknown/i" }, "unknown")] });
  const ambiguous = declaration("unknown", [slot()]);
  assert.deepEqual(compile({ declarations: [app, ambiguous, structuredClone(ambiguous)],
    profile: profile([selection(app)], [unknownRow]) }).result,
  { ok: false, diagnostics: [duplicateConsumer("x/unknown/i")] });
  const row = binding("x/app/i", "dep", 1);
  assert.deepEqual(compile({ declarations: [app], profile: profile([selection(app)], [row]) }).result,
    { ok: false, diagnostics: [reasonError("binding.unknown-slot", "binding", { implementationId: "x/app/i", slotId: "dep" }, "unknown")] });
  app.slots = [slot(), slot({ kind: "required" })];
  assert.deepEqual(compile({ declarations: [app], profile: profile([selection(app)], [row]) }).result,
    { ok: false, diagnostics: [duplicateSlot()] });
});
