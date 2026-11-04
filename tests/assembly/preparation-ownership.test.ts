import assert from "node:assert/strict";
import test from "node:test";
import { assemblyFor, declareModule, defineContract, implement, type AssemblyOutcome, type AssemblyPreparationResult, type CapabilitiesOf } from "@get-modular/assembly";
import { compileComposition, required } from "@get-modular/core";

const Value = defineContract<number>()({ id: "ownership/value", revision: 1 });
type Capabilities = CapabilitiesOf<typeof Value>;

async function fixture() {
  const calls: string[] = [];
  const providerDeclaration = declareModule({
    moduleId: "ownership/provider", implementationId: "ownership/provider",
    owner: { authority: "ownership", path: ["provider"] }, provides: [Value.provide()], slots: [],
  });
  const consumerDeclaration = declareModule({
    moduleId: "ownership/consumer", implementationId: "ownership/consumer",
    owner: { authority: "ownership", path: ["consumer"] }, provides: [], slots: [Value.slot("value", required())],
  });
  const provider = implement<Capabilities>()(providerDeclaration, async () => {
    calls.push("ownership/provider");
    return { instance: "provider", capabilities: { [Value.id]: 7 } };
  });
  const consumer = implement<Capabilities>()(consumerDeclaration, async ({ value }) => {
    calls.push("ownership/consumer");
    return { instance: value, capabilities: {} };
  });
  const composition = await compileComposition({
    declarations: [providerDeclaration, consumerDeclaration],
    profile: {
      kind: "get-modular.composition-profile", schemaVersion: 1, profileId: "ownership/profile",
      roots: [consumerDeclaration.moduleId],
      selections: [providerDeclaration, consumerDeclaration].map(({ moduleId, implementationId }) => ({ moduleId, implementationId })),
      bindings: [{ consumerImplementationId: consumerDeclaration.implementationId, slotId: "value",
        providerImplementationIds: [providerDeclaration.implementationId] }],
    },
  });
  assert.equal(composition.ok, true);
  if (!composition.ok) throw new Error("fixture compilation failed");
  return { calls, composition, modules: [provider, consumer] as const, roots: { consumer } };
}

test("explicit preparation returns an owned canonical composition matching the executed graph", async () => {
  const { calls, composition, modules, roots } = await fixture();
  const supplied = structuredClone(composition);
  const pending = assemblyFor<Capabilities>().prepare({ composition: supplied, modules, roots });
  // Deliberately mutate the JavaScript carrier while prepare is awaiting Core.
  Reflect.set(supplied.plan, "profileId", "ownership/changed");
  Reflect.set(supplied.plan.selections[0]!, "implementationId", "ownership/not-built");
  Reflect.set(supplied.plan.bindings[0]!, "providerImplementationIds", []);
  Reflect.set(supplied, "digest", "sha256:" + "0".repeat(64));
  const result = await pending;
  assert.equal(result.status, "prepared");
  if (result.status !== "prepared") throw new Error("preparation failed");
  assert.notEqual(result.composition, supplied);
  assert.deepEqual(result.composition, composition);
  assert.ok(Object.isFrozen(result.composition));
  assert.ok(Object.isFrozen(result.composition.plan.bindings[0]!.providerImplementationIds));
  assert.equal(Object.isFrozen(supplied), false);
  Reflect.set(supplied.plan, "roots", []);
  assert.deepEqual(result.composition, composition);
  const outcome = await result.prepared.run();
  assert.equal(outcome.status, "succeeded");
  if (outcome.status !== "succeeded") throw new Error("construction failed");
  assert.equal(outcome.roots.consumer, 7);
  assert.deepEqual(calls, result.composition.plan.dependencyOrder);
});

test("preparation captures root aliases before awaiting Core in both modes", async () => {
  const firstDeclaration = declareModule({
    moduleId: "ownership/first", implementationId: "ownership/first",
    owner: { authority: "ownership", path: ["first"] }, provides: [], slots: [],
  });
  const secondDeclaration = declareModule({
    moduleId: "ownership/second", implementationId: "ownership/second",
    owner: { authority: "ownership", path: ["second"] }, provides: [], slots: [],
  });
  const first = implement<Capabilities>()(firstDeclaration, async () => ({ instance: "first", capabilities: {} }));
  const second = implement<Capabilities>()(secondDeclaration, async () => ({ instance: "second", capabilities: {} }));
  const modules = [first, second] as const;
  const composition = await compileComposition({
    declarations: [firstDeclaration, secondDeclaration],
    profile: {
      kind: "get-modular.composition-profile", schemaVersion: 1, profileId: "ownership/roots",
      roots: ["ownership/first", "ownership/second"],
      selections: [
        { moduleId: "ownership/first", implementationId: "ownership/first" },
        { moduleId: "ownership/second", implementationId: "ownership/second" },
      ],
      bindings: [],
    },
  });
  assert.equal(composition.ok, true);
  if (!composition.ok) throw new Error("root fixture compilation failed");
  const api = assemblyFor<Capabilities>();
  for (const mode of ["profile", "composition"] as const) {
    for (const nullPrototype of [false, true]) {
      for (const mutation of ["swap", "replace", "delete"] as const) {
        const label = `${mode}, null prototype ${String(nullPrototype)}, ${mutation}`;
        // These ordinary alias names must remain own data, including on a null-prototype map.
        const roots = { ["__proto__"]: first, constructor: second };
        if (nullPrototype) Object.setPrototypeOf(roots, null);
        const pending: Promise<AssemblyPreparationResult<typeof roots>> = mode === "profile"
          ? api.prepare({ profileId: "ownership/roots", modules, roots })
          : api.prepare({ composition, modules, roots });
        // Mutate immediately: the caller retains its map while Core resolves its digest.
        if (mutation === "swap") {
          assert.equal(Reflect.set(roots, "__proto__", second), true, label);
          assert.equal(Reflect.set(roots, "constructor", first), true, label);
        } else if (mutation === "replace") {
          assert.equal(Reflect.set(roots, "__proto__", { forged: true }), true, label);
        } else {
          assert.equal(Reflect.deleteProperty(roots, "__proto__"), true, label);
        }
        const prepared = await pending;
        assert.equal(prepared.status, "prepared", label);
        if (prepared.status !== "prepared") throw new Error(`root preparation failed: ${label}`);
        assert.deepEqual(prepared.composition, composition, label);
        assert.equal(Object.isFrozen(roots), false, label);
        for (let run = 0; run < 2; run += 1) {
          const outcome: AssemblyOutcome<typeof roots> = await prepared.prepared.run();
          assert.equal(outcome.status, "succeeded", label);
          if (outcome.status !== "succeeded") throw new Error(`root construction failed: ${label}`);
          assert.deepEqual(Object.keys(outcome.roots), ["__proto__", "constructor"], label);
          assert.equal(outcome.roots.__proto__, "first", label);
          assert.equal(outcome.roots.constructor, "second", label);
          assert.equal(Reflect.set(roots, "constructor", first), true, label);
        }
      }
    }
  }
});

