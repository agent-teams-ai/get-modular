import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isDeepStrictEqual } from "node:util";
import { admitObjectInput } from "../../../dist/features/input-admission/object-admission.js";
import { analyzeCompositionSemantics } from "../../../dist/features/composition-semantics/semantic-analysis.js";
import { collectGraphResourceLimits, semanticResourceLimits } from "../../../dist/features/composition-semantics/graph-resources.js";
import { createDeclarationCensus } from "../../../dist/features/composition-semantics/declaration-census.js";
import { createDiagnosticCollector } from "../../../dist/features/diagnostics/internal.js";
import { createOwnedJcs } from "../../../dist/features/canonicalization/owned-jcs/factory.js";
import { createPlanOutput } from "../../../dist/features/plan-output/factory.js";

const root = new URL("../../../../../", import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), "utf8"));
const handbook = await json("tests/qualification/compiler-engineer/examples.json");
const manifest = await json("architecture/qualification/v1/qualification-case-manifest.json");
const normalization = await json("architecture/qualification/v1/normalization-vectors.json");
const limits = (await json("architecture/qualification/v1/resource-profile-v2.json")).limits;
const collector = () => createDiagnosticCollector(createOwnedJcs().canonicalize);
function compile(input) { const c = collector(); return analyzeCompositionSemantics(admitObjectInput(input, c), c); }
const capability = () => ({ capabilityId: "x/cap", compatibility: { family: "exact", familyVersion: 1, token: "x/cap" } });
const declaration = (id, slots = [], provides = []) => ({ kind: "get-modular.module-declaration", schemaVersion: 1,
  moduleId: `x/${id}`, implementationId: `x/${id}/i`, owner: { authority: "x", path: [id] }, slots, provides });
const slot = (slotId = "dep", cardinality = { kind: "required" }) => ({ slotId, ...capability(), cardinality });
const binding = (consumer, providerImplementationIds = [], slotId = "dep") => ({ consumerImplementationId: consumer.implementationId, slotId, providerImplementationIds });
const profile = (declarations, bindings = [], roots = [declarations[0].moduleId]) => ({ kind: "get-modular.composition-profile", schemaVersion: 1,
  profileId: "x/main", selections: declarations.map(({ moduleId, implementationId }) => ({ moduleId, implementationId })), bindings, roots });
const field = value => ({ kind: "field", value });
const index = value => ({ kind: "index", value });
const limitError = (name, phase, path = []) => ({ code: "input.limit-exceeded", phase, path, coordinate: {},
  details: { limitName: name, limit: limits[name], actual: limits[name] + 1 } });
function permutations(values) { return values.length ? values.flatMap((value, i) => permutations(values.filter((_v, j) => j !== i)).map(tail => [value, ...tail])) : [[]]; }

test("the private admission-to-semantics pipeline executes every accepted trusted-object handbook expectation", () => {
  for (const fixture of handbook.cases.filter(row => row.expected)) {
    const result = compile(structuredClone(fixture.input));
    assert.equal(result.ok, fixture.expected.ok, fixture.id);
    if (fixture.expected.ok) assert.deepEqual(result.plan, fixture.expected.plan, fixture.id);
    else if (fixture.expected.surface === "complete-diagnostics") assert.deepEqual(result.diagnostics, fixture.expected.diagnostics, fixture.id);
    else for (const diagnostic of fixture.expected.diagnostics) assert.ok(result.diagnostics.some(actual => isDeepStrictEqual(actual, diagnostic)), fixture.id);
    assert.equal(Object.hasOwn(result, "digest"), false, "digest belongs to the output feature, not this private stage");
  }
});

test("all eight accepted complete object diagnostic partitions run against production stages", () => {
  const cases = manifest.staticConformanceProtocol.cases.filter(row => row.caseId.startsWith("diag.object."));
  assert.equal(cases.length, 8);
  for (const fixture of cases) {
    for (const declarations of permutations(structuredClone(fixture.input.declarations))) {
      // Pre-identity schema locators intentionally depend on invocation order.
      if (fixture.caseId === "diag.object.pre-identity-index.v1") {
        assert.deepEqual(compile(structuredClone(fixture.input)), fixture.expected, fixture.caseId);
        break;
      }
      assert.deepEqual(compile({ ...structuredClone(fixture.input), declarations }), fixture.expected, fixture.caseId);
    }
  }
});

test("normalized plans and real output digests equal independent multi-root and ordered-many vectors", async () => {
  const output = createPlanOutput({ canonicalizer: createOwnedJcs() });
  for (const fixture of normalization.cases) {
    for (const order of fixture.declarationOrders) {
      for (const p of fixture.equivalentProfiles) {
        const byId = new Map(fixture.declarations.map(row => [row.implementationId, row]));
        const declarations = order.map(id => byId.get(id));
        const result = compile(structuredClone({ declarations, profile: p }));
        assert.equal(result.ok, true);
        assert.deepEqual(result.plan, fixture.expectedPlan);
        assert.deepEqual(await output.emit(result.plan), { plan: fixture.expectedPlan, digest: fixture.digest });
      }
    }
  }
});

test("a non-root selection mismatch prevents an unsupported unreachable conclusion", () => {
  const app = declaration("app"), other = declaration("other"), wrong = declaration("wrong");
  const p = profile([app, other]); p.selections[1].implementationId = wrong.implementationId;
  assert.deepEqual(compile({ declarations: [app, other, wrong], profile: p }), { ok: false, diagnostics: [{
    code: "profile.implementation-mismatch", phase: "profile", path: [],
    coordinate: { moduleId: other.moduleId, implementationId: wrong.implementationId }, details: { reason: "mismatch" },
  }] });
});

test("positive cycles remain eligible when unrelated declaration errors prevent a successful plan", () => {
  const a = declaration("a", [slot()], [capability()]), b = declaration("b", [slot()], [capability()]);
  const bad = { ...declaration("bad"), extra: true };
  const p = profile([a, b], [binding(a, [b.implementationId]), binding(b, [a.implementationId])]);
  const result = compile({ declarations: [bad, a, b], profile: p });
  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics.map(row => row.code), ["schema.unknown-field", "graph.cycle"]);
  assert.deepEqual(result.diagnostics[1].details, { component: [a.implementationId, b.implementationId] });
  assert.equal(Object.hasOwn(result, "plan"), false);
});

test("many-resource limits use original binding ordinals without promoting a schema-invalid profile", () => {
  const app = declaration("app", [slot("dep", { kind: "many", min: 0, max: 1024, order: "profile" })]);
  const p = profile([app], [null, binding(app, new Array(1025).fill(app.implementationId))]);
  const result = compile({ declarations: [app], profile: p });
  assert.deepEqual(result, { ok: false, diagnostics: [
    { code: "schema.invalid-value", phase: "schema", coordinate: {}, path: [field("profile"), field("bindings"), index(0)], details: { reason: "invalid-type" } },
    { code: "schema.invalid-value", phase: "schema", coordinate: {}, path: [field("profile"), field("bindings"), index(1), field("providerImplementationIds")], details: { reason: "invalid-format" } },
    limitError("providersPerManySlot", "binding", [field("profile"), field("bindings"), index(1), field("providerImplementationIds")]),
  ] });
});

test("many resource evidence requires a selected known consumer and a unique known many slot", () => {
  const variants = ["unknown-consumer", "unselected", "unknown-slot", "ambiguous-slot", "required", "optional", "incomplete-selections"];
  for (const variant of variants) {
    const app = declaration("app", [slot("dep", { kind: "many", min: 0, max: 1024, order: "profile" })]);
    const extra = declaration("extra");
    if (variant === "ambiguous-slot") app.slots.push(structuredClone(app.slots[0]));
    if (["required", "optional"].includes(variant)) app.slots[0].cardinality = { kind: variant };
    const row = binding(app, new Array(1025).fill(app.implementationId));
    if (variant === "unknown-consumer") row.consumerImplementationId = "x/unknown";
    if (variant === "unknown-slot") row.slotId = "unknown";
    const p = profile(variant === "unselected" ? [extra] : [app], [row]);
    if (variant === "incomplete-selections") p.selections.push({ moduleId: null, implementationId: "x/unknown" });
    const result = compile({ declarations: [app, extra], profile: p });
    assert.equal(result.ok, false, variant);
    assert.equal(result.diagnostics.some(row => row.details.limitName === "providersPerManySlot"), false, variant);
    assert.equal(result.diagnostics.some(row => row.code.startsWith("binding.")), false, variant);
  }
});

test("resource observations count all selected occurrences before validation and saturate independently of slot knowledge", () => {
  const app = declaration("app");
  const c = collector(); const declarations = createDeclarationCensus([app], true, c);
  const observations = { selections: profile([app]).selections, bindings: [
    { ordinal: 0, consumerImplementationId: app.implementationId, slotId: null, providerOccurrences: 262144 },
    { ordinal: 1, consumerImplementationId: app.implementationId, slotId: "unknown", providerOccurrences: 1000 },
    { ordinal: 2, consumerImplementationId: "x/unselected", slotId: null, providerOccurrences: 999999 },
  ] };
  const result = collectGraphResourceLimits(observations, declarations, c);
  assert.deepEqual(result, { countedInputEdges: 262145, edgeLimitExceeded: true });
  assert.deepEqual(c.finish(), [limitError("graphEdges", "graph")]);
  assert.equal(Object.isFrozen(result), true);
  for (const input of [null, { selections: null, bindings: observations.bindings }]) {
    const c = collector();
    assert.deepEqual(collectGraphResourceLimits(input, declarations, c), { countedInputEdges: null, edgeLimitExceeded: false });
    assert.deepEqual(c.finish(), []);
  }
  for (const [name, value] of Object.entries(semanticResourceLimits)) assert.equal(value, limits[name]);
});

test("the real pipeline admits exactly 262144 input edges; plus one blocks graph allocation but keeps binding failures", () => {
  const providers = Array.from({ length: 1024 }, (_v, i) => declaration(`p${String(i).padStart(4, "0")}`, [], [capability()]));
  const slots = Array.from({ length: 128 }, (_v, i) => slot(`s${String(i).padStart(3, "0")}`, { kind: "many", min: 0, max: 1024, order: "profile" }));
  const a = declaration("a", slots), b = declaration("b", slots);
  const references = providers.map(row => row.implementationId);
  const rows = [a, b].flatMap(consumer => slots.map(slot => binding(consumer, references, slot.slotId)));
  const p = profile([a, b, ...providers], rows, [a.moduleId, b.moduleId]);
  const result = compile({ declarations: [a, b, ...providers], profile: p });
  assert.equal(result.ok, true);
  assert.equal(result.plan.bindings.length, 256);
  assert.equal(result.plan.bindings.reduce((n, row) => n + row.providerImplementationIds.length, 0), 262144);
  assert.deepEqual(result.plan.dependencyOrder, [...references, a.implementationId, b.implementationId]);
  const c = declaration("c");
  const over = structuredClone(p);
  over.selections.push({ moduleId: c.moduleId, implementationId: c.implementationId });
  over.bindings.push(binding(c, [references[0]], "unknown"));
  assert.deepEqual(compile({ declarations: [a, b, c, ...providers], profile: over }), { ok: false, diagnostics: [
    { code: "binding.unknown-slot", phase: "binding", path: [], coordinate: { implementationId: c.implementationId, slotId: "unknown" }, details: { reason: "unknown" } },
    limitError("graphEdges", "graph"),
  ] });
});

test("success is deeply immutable and preserves the synchronous admission snapshot through later caller mutation", () => {
  const app = declaration("app", [slot("dep", { kind: "optional" })]);
  const input = { declarations: [app], profile: profile([app], [binding(app)]) };
  const c = collector(); const admitted = admitObjectInput(input, c);
  input.profile.bindings[0].providerImplementationIds.push("x/mutation"); app.slots.length = 0;
  const result = analyzeCompositionSemantics(admitted, c);
  assert.equal(result.ok, true);
  assert.deepEqual(result.plan.bindings[0].providerImplementationIds, []);
  function frozen(value) { if (value && typeof value === "object") { assert.equal(Object.isFrozen(value), true); Object.values(value).forEach(frozen); } }
  frozen(result);
  assert.throws(() => result.plan.selections.push({}), TypeError);
});

test("lost admission evidence is an internal failure, never an invented successful plan or empty diagnostic failure", () => {
  const c = collector();
  const bad = { declarations: [], allDeclarationsAdmitted: false, profile: null, profileResources: null, hasErrors: true };
  assert.throws(() => analyzeCompositionSemantics(bad, c), /Semantic prerequisites/);
});
