import assert from "node:assert/strict";
import test from "node:test";
import { assemblyFor, AssemblyBindingError } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { binding, compile, declaration, prepared, profile, slot, synthetic } from "./fixture.mjs";

test("all plan fields, digest and closed shapes participate in preflight", async () => {
  const host = await synthetic();
  const changes = [
    (c) => { c.digest = c.digest.slice(0, -1) + (c.digest.endsWith("0") ? "1" : "0"); },
    (c) => { c.plan.profileId = "changed"; },
    (c) => { c.plan.kind = "other"; },
    (c) => { c.plan.schemaVersion = 2; },
    (c) => { c.plan.dependencyOrder.reverse(); },
    (c) => { c.plan.selections.reverse(); },
    (c) => { c.plan.bindings.reverse(); },
    (c) => { c.plan.selections[0].moduleId = "other"; },
    (c) => { c.plan.bindings[0].capabilityId = "other"; },
    (c) => { c.plan.bindings[0].compatibility.token = "changed"; },
    (c) => { c.plan.bindings[0].compatibility.familyVersion = 2; },
    (c) => { c.plan.bindings.find((b) => b.slotId === "filters").providerImplementationIds.reverse(); },
    (c) => { c.plan.bindings = c.plan.bindings.filter((b) => b.slotId !== "logger"); },
    (c) => { c.plan.roots = ["store"]; },
    (c) => { c.plan.extra = true; },
    (c) => { c.plan.selections[0].extra = true; },
    (c) => { c.plan.bindings[0].extra = true; },
  ];
  for (const change of changes) {
    const composition = structuredClone(host.input.composition);
    change(composition);
    assert.equal((await host.api.prepare({ ...host.input, composition })).status, "failed");
  }
  assert.deepEqual(host.trace, []);
});

test("exact authenticated handles, complete roots and data-only aliases are required", async () => {
  const host = await synthetic(), { factories } = host.input;
  const forged = Object.create(Object.getPrototypeOf(factories[0]), Object.getOwnPropertyDescriptors(factories[0]));
  const equivalent = host.api.bindFactory(host.declarations[0], async () => ({ instance: {}, capabilities: { store: {} } }));
  const changes = [
    { factories: factories.slice(1) },
    { factories: [...factories, factories[0]] },
    { factories: [forged, ...factories.slice(1)] },
    { factories: [...factories, equivalent] },
    { roots: {} },
    { roots: { app: factories.at(-1), duplicate: factories.at(-1) } },
    { roots: { app: factories[0] } },
    { roots: { app: equivalent } },
  ];
  let reads = 0;
  changes.push({ roots: { get app() { reads++; return factories.at(-1); } } });
  for (const change of changes) assert.equal((await host.api.prepare({ ...host.input, ...change })).status, "failed");
  assert.equal(reads, 0);
  assert.deepEqual(host.trace, []);
});

test("binding and synchronous preparation snapshots survive later input mutation", async () => {
  const api = assemblyFor();
  const provider = declaration("provider", ["value"]), consumer = declaration("consumer", [], [slot("value", "value")]);
  const declarations = [provider, consumer], value = {};
  const composition = structuredClone(await compile(declarations, profile(declarations, [binding("consumer", "value", ["provider"])])));
  const p = api.bindFactory(provider, async () => ({ instance: {}, capabilities: { value } }));
  const c = api.bindFactory(consumer, async (deps) => ({ instance: deps.value, capabilities: {} }));
  consumer.slots[0].cardinality = { kind: "many", min: 0, max: 1, order: "profile" };
  provider.provides.length = 0;
  assert.equal(Object.isFrozen(provider), false);
  const factories = [p, c], roots = { result: c };
  const pending = api.prepare({ composition, factories, roots });
  factories.length = 0;
  delete roots.result;
  composition.plan.bindings[0].providerImplementationIds.length = 0;
  composition.plan.dependencyOrder.reverse();
  const result = await pending;
  assert.equal(result.status, "prepared");
  const outcome = await result.prepared.run();
  assert.equal(outcome.status, "succeeded");
  assert.equal(outcome.roots.result, value);
});

test("malformed declarations and plan getters are refused without invoking accessors", async () => {
  const api = assemblyFor();
  let reads = 0;
  const malformed = declaration("bad");
  Object.defineProperty(malformed, "provides", { get() { reads++; return []; }, enumerable: true });
  assert.throws(() => api.bindFactory(malformed, async () => ({})), (error) => error instanceof AssemblyBindingError && error.code === "assembly.bind.invalid-declaration");
  const host = await synthetic(), composition = structuredClone(host.input.composition);
  Object.defineProperty(composition.plan.bindings[0], "compatibility", { get() { reads++; return {}; }, enumerable: true });
  assert.equal((await host.api.prepare({ ...host.input, composition })).status, "failed");
  assert.equal(reads, 0);
  assert.deepEqual(host.trace, []);
});

test("a late incompatible declaration preserves separate Core diagnostics and calls no factory", async () => {
  const host = await synthetic(), altered = structuredClone(host.declarations.at(-1));
  altered.slots.find((s) => s.slotId === "logger").cardinality = required();
  const replacement = host.api.bindFactory(altered, async () => { throw new Error("must not run"); });
  const factories = [...host.input.factories.slice(0, -1), replacement];
  const result = await host.api.prepare({ ...host.input, factories, roots: { app: replacement } });
  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "assembly.prepare.core-rejected");
  assert.ok(result.diagnostics.length > 0);
  assert.deepEqual(host.trace, []);
});
