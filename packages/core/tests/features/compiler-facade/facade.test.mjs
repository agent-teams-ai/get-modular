import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerFacade } from "../../../dist-test/features/compiler-facade/factory.js";
import { compilerFacadeDeclaration } from "../../../dist-test/features/compiler-facade/declaration.js";

const plan = name => Object.freeze({ kind: "get-modular.composition-plan", schemaVersion: 1,
  profileId: `example/${name}`, roots: Object.freeze([]), selections: Object.freeze([]),
  bindings: Object.freeze([]), dependencyOrder: Object.freeze([]) });
const digest = `gm-plan:v1:sha-256:${"0".repeat(64)}`;

test("facade keeps collectors local and completes interleaved output in its own invocation", async () => {
  let sequence = 0;
  const admittedByCollector = new Map();
  const pending = new Map();
  const events = [];
  const facade = createCompilerFacade({
    admission: { admitObjectInput(input, collector) {
      events.push(["admission", collector.id]);
      const admitted = { ...input };
      admittedByCollector.set(collector, admitted);
      return admitted;
    } },
    semantics: {
      newCollector() { const collector = { id: ++sequence }; events.push(["collector", collector.id]); return collector; },
      analyze(admitted, collector) {
        assert.equal(admitted, admittedByCollector.get(collector));
        events.push(["analysis", collector.id]);
        return { ok: true, plan: plan(admitted.profile) };
      },
    },
    output: { emit(value) {
      events.push(["output", value.profileId]);
      return new Promise(resolve => pending.set(value.profileId, () => resolve({ plan: value, digest })));
    } },
  });
  assert.deepEqual(events, [], "pure construction invokes no dependency");
  assert.ok(Object.isFrozen(facade));
  const first = facade.compileComposition({ declarations: [], profile: "one" });
  const second = facade.compileComposition({ declarations: [], profile: "two" });
  assert.deepEqual(events, [["collector", 1], ["admission", 1], ["analysis", 1], ["output", "example/one"],
    ["collector", 2], ["admission", 2], ["analysis", 2], ["output", "example/two"]]);
  pending.get("example/two")();
  const secondResult = await second;
  assert.deepEqual(secondResult, { ok: true, plan: plan("two"), digest });
  pending.get("example/one")();
  const firstResult = await first;
  assert.deepEqual(firstResult, { ok: true, plan: plan("one"), digest });
  assert.ok(Object.isFrozen(firstResult) && Object.isFrozen(secondResult));
});

test("semantic failure is returned intact and never reaches output", async () => {
  const failure = Object.freeze({ ok: false, diagnostics: Object.freeze([{ code: "graph.cycle", phase: "graph",
    coordinate: {}, path: [], details: { component: ["example/loop/default"] } }]) });
  const facade = createCompilerFacade({ admission: { admitObjectInput: input => input },
    semantics: { newCollector: () => ({}), analyze: () => failure },
    output: { emit() { assert.fail("output called on semantic failure"); } } });
  const result = await facade.compileComposition({ declarations: [], profile: null });
  assert.equal(result, failure);
  assert.equal(Object.hasOwn(result, "plan"), false);
  assert.equal(Object.hasOwn(result, "digest"), false);
});

for (const boundary of ["collector", "admission", "analysis", "output"]) {
  test(`${boundary} failure rejects the Promise without a synthetic diagnostic`, async () => {
    const failure = new Error(`${boundary} failed`);
    const fail = () => { throw failure; };
    const facade = createCompilerFacade({
      admission: { admitObjectInput: boundary === "admission" ? fail : input => input },
      semantics: { newCollector: boundary === "collector" ? fail : () => ({}),
        analyze: boundary === "analysis" ? fail : () => ({ ok: true, plan: plan("root") }) },
      output: { emit: boundary === "output" ? () => Promise.reject(failure) : async value => ({ plan: value, digest }) },
    });
    let promise;
    assert.doesNotThrow(() => { promise = facade.compileComposition({ declarations: [], profile: null }); });
    assert.ok(promise instanceof Promise);
    await assert.rejects(promise, error => error === failure);
  });
}

test("facade metadata declares exactly its three required dependencies", () => {
  assert.equal(compilerFacadeDeclaration.moduleId, "get-modular/compiler-facade");
  assert.equal(compilerFacadeDeclaration.implementationId, "get-modular/compiler-facade/default");
  assert.deepEqual(compilerFacadeDeclaration.provides, []);
  assert.deepEqual(compilerFacadeDeclaration.slots.map(slot => [slot.slotId, slot.capabilityId, slot.compatibility.token, slot.cardinality]), [
    ["admission", "get-modular/admitted-input", "get-modular/admitted-input/v1", { kind: "required" }],
    ["semantics", "get-modular/semantic-analysis", "get-modular/semantic-analysis/v1", { kind: "required" }],
    ["output", "get-modular/plan-emission", "get-modular/plan-emission/v1", { kind: "required" }],
  ]);
});
