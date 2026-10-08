import assert from "node:assert/strict";
import test from "node:test";
import { assemblyFor, AssemblyBindingError } from "@get-modular/assembly";
import { binding, compile, declaration, prepared, profile, slot } from "./fixture.mjs";

const tick = () => new Promise((resolve) => { setImmediate(resolve); });

// ADR-0031: a slot-free input module whose capability record every run supplies.
async function sessionHost() {
  const api = assemblyFor(), calls = [];
  const session = declaration("session", ["synthetic/session"]);
  const store = declaration("store", ["synthetic/store"], [slot("session", "synthetic/session")]);
  const declarations = [session, store];
  const composition = await compile(declarations, profile(declarations, [binding("synthetic/store", "session", ["synthetic/session"])]));
  const input = api.bindInput(session);
  const factory = api.bindFactory(store, async (deps) => {
    calls.push(deps.session);
    await tick();
    return { instance: { session: deps.session }, capabilities: { "synthetic/store": deps.session } };
  });
  const ready = await prepared(api, { composition, factories: [factory], roots: { store: factory }, inputs: { session: input } });
  return { api, calls, composition, input, factory, store, prepared: ready };
}

test("concurrent runs of one prepared assembly never mix their inputs", async () => {
  const host = await sessionHost();
  const values = Array.from({ length: 64 }, (_, index) => ({ id: `s${index}` }));
  const outcomes = await Promise.all(values.map((value) => host.prepared.run({ inputs: { session: { "synthetic/session": value } } })));
  for (const [index, outcome] of outcomes.entries()) {
    assert.equal(outcome.status, "succeeded");
    assert.equal(outcome.roots.store.session, values[index]);
    assert.deepEqual(outcome.created.map(({ implementationId }) => implementationId), ["synthetic/store"]);
  }
  assert.equal(Object.isFrozen(values[0]), false, "inputs are borrowed, not frozen");
});

test("invalid inputs fail before the first factory without invoking accessors", async () => {
  const host = await sessionHost();
  let reads = 0;
  const getterRecord = {};
  Object.defineProperty(getterRecord, "synthetic/session", { enumerable: true, get() { reads++; return "x"; } });
  const getterAliases = {};
  Object.defineProperty(getterAliases, "session", { enumerable: true, get() { reads++; return { "synthetic/session": "x" }; } });
  for (const [index, inputs] of [
    undefined, null, "session", [], {}, getterAliases,
    { session: { "synthetic/session": "x" }, other: {} },
    { session: {} }, { session: { "synthetic/session": "x", extra: 1 } }, { session: getterRecord },
    { session: new (class Record { "synthetic/session" = "x"; })() },
  ].entries()) {
    const outcome = await host.prepared.run({ inputs });
    assert.equal(outcome.status, "failed", `case ${index}`);
    assert.equal(outcome.phase, "inputs");
    assert.equal(outcome.code, "assembly.run.invalid-inputs");
    assert.equal(outcome.implementationId, undefined);
    assert.equal(outcome.returned, undefined);
    assert.deepEqual(outcome.created, []);
  }
  assert.deepEqual(host.calls, []);
  assert.equal(reads, 0);
});

test("an input declares no slots and never enters the created journal", async () => {
  const host = await sessionHost();
  assert.throws(() => host.api.bindInput(host.store),
    (error) => error instanceof AssemblyBindingError && error.code === "assembly.bind.invalid-declaration");
  const outcome = await host.prepared.run({ inputs: { session: { "synthetic/session": "s1" } } });
  assert.equal(outcome.status, "succeeded");
  assert.equal(outcome.created.some(({ implementationId }) => implementationId === "synthetic/session"), false);
});

// A plain factory ordered before the input module must still see isolated runs and never run on bad inputs.
async function clockHost() {
  const api = assemblyFor();
  let clockCalls = 0;
  const clock = declaration("a-clock", ["synthetic/a-clock"]);
  const session = declaration("session", ["synthetic/session"]);
  const store = declaration("store", ["synthetic/store"], [slot("clock", "synthetic/a-clock"), slot("session", "synthetic/session")]);
  const declarations = [clock, session, store];
  const composition = await compile(declarations, profile(declarations, [
    binding("synthetic/store", "clock", ["synthetic/a-clock"]), binding("synthetic/store", "session", ["synthetic/session"]),
  ]));
  assert.deepEqual(composition.plan.dependencyOrder, ["synthetic/a-clock", "synthetic/session", "synthetic/store"]);
  const input = api.bindInput(session);
  const clockFactory = api.bindFactory(clock, async () => {
    clockCalls++;
    await tick();
    return { instance: {}, capabilities: { "synthetic/a-clock": { now: 0 } } };
  });
  const storeFactory = api.bindFactory(store, (deps) => Promise.resolve({
    instance: { session: deps.session }, capabilities: { "synthetic/store": deps.session },
  }));
  const ready = await prepared(api, { composition, factories: [clockFactory, storeFactory], roots: { store: storeFactory }, inputs: { session: input } });
  return { clockCalls: () => clockCalls, prepared: ready };
}

test("runs ordered after an earlier factory keep their own inputs", async () => {
  const host = await clockHost();
  const values = Array.from({ length: 16 }, (_, index) => ({ id: `s${index}` }));
  const outcomes = await Promise.all(values.map((value) => host.prepared.run({ inputs: { session: { "synthetic/session": value } } })));
  for (const [index, outcome] of outcomes.entries()) {
    assert.equal(outcome.status, "succeeded");
    assert.equal(outcome.roots.store.session, values[index]);
  }
});

test("invalid inputs fail before an earlier ordinary factory runs", async () => {
  const host = await clockHost();
  const outcome = await host.prepared.run({ inputs: { session: {} } });
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.phase, "inputs");
  assert.equal(outcome.code, "assembly.run.invalid-inputs");
  assert.equal(host.clockCalls(), 0);
});

test("input handles must match the prepared selection", async () => {
  const api = assemblyFor();
  const lone = declaration("lone", ["synthetic/lone"]);
  const extra = declaration("extra", ["synthetic/extra"]);
  const composition = await compile([lone], profile([lone]));
  const factory = api.bindFactory(lone, () => Promise.resolve({ instance: {}, capabilities: { "synthetic/lone": {} } }));
  const ready = await prepared(api, { composition, factories: [factory], roots: { lone: factory } });
  const outcome = await ready.run({ inputs: { x: {} } });
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.code, "assembly.run.invalid-inputs");
  const rejected = await api.prepare({ composition, factories: [factory], roots: { lone: factory }, inputs: { extra: api.bindInput(extra) } });
  assert.equal(rejected.status, "failed");
  assert.equal(rejected.error.code, "assembly.prepare.handles");
});
