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
