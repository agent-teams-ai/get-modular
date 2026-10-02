import assert from "node:assert/strict";
import test from "node:test";
import { compileComposition, defineModule, required } from "@get-modular/core";
import { assemblyFor, declareModule, defineContract } from "@get-modular/assembly";
import { createScope, scoped } from "@get-modular/resources";

// ADR-0030 with ADR-0031: real Core and Assembly from this workspace construct
// modules wrapped by scoped(); each run receives its own scope.
const tick = () => new Promise(resolve => { setImmediate(resolve); });
const compatibility = { family: "exact", familyVersion: 1, token: "t/v1" };
const owner = { authority: "t", path: ["t"] };
const moduleId = index => `t/m${index}`;
const capabilityId = index => `t/c${index}`;
const declare = (id, provides, slots = []) => defineModule({
  kind: "get-modular.module-declaration", schemaVersion: 1, moduleId: id, implementationId: id, owner,
  provides: provides.map(capability => ({ capabilityId: capability, compatibility })),
  slots: slots.map(([slotId, capability]) => ({
    slotId, capabilityId: capability, compatibility, cardinality: { kind: "required" },
  })),
});
const profile = (declarations, roots, bindings) => ({
  kind: "get-modular.composition-profile", schemaVersion: 1, profileId: "t/p", roots,
  selections: declarations.map(({ moduleId: id, implementationId }) => ({ moduleId: id, implementationId })),
  bindings,
});
const bind = (consumer, slotId, provider) => ({
  consumerImplementationId: consumer, slotId, providerImplementationIds: [provider],
});
const invalidRunScope = outcome => outcome.status === "failed" && outcome.cause instanceof TypeError
  && outcome.cause.code === "resources.scoped.invalid-run-scope";

async function chain(length) {
  const declarations = Array.from({ length }, (_, index) =>
    declare(moduleId(index + 1), [capabilityId(index + 1)], index === 0 ? [] : [["dep", capabilityId(index)]]));
  const bindings = declarations.slice(1).map((_, index) => bind(moduleId(index + 2), "dep", moduleId(index + 1)));
  const composition = await compileComposition({ declarations, profile: profile(declarations, [moduleId(length)], bindings) });
  assert.equal(composition.ok, true, JSON.stringify(composition.diagnostics));
  return { declarations, composition };
}
async function prepare(api, input) {
  const preparation = await api.prepare(input);
  assert.equal(preparation.status, "prepared", JSON.stringify(preparation));
  return preparation.prepared;
}

test("A1 a failure at module k releases k..1 in reverse; later modules are never created", async () => {
  const { declarations, composition } = await chain(5);
  const api = assemblyFor();
  const log = [];
  const handles = declarations.map((declaration, index) => api.bindFactory(declaration,
    scoped(declaration.implementationId, async (_deps, { resources }) => {
      await resources.setup({ name: "r", setup: () => index, cleanup: () => { log.push(`m${index + 1}`); } });
      if (index === 2) throw new Error("m3 failed");
      return { instance: index, capabilities: { [capabilityId(index + 1)]: index } };
    })));
  const prepared = await prepare(api, { composition, factories: handles, roots: { root: handles[4] } });
  const attempt = createScope({ name: "attempt" });
  const outcome = await prepared.run({ scope: attempt.resources });
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.code, "assembly.run.factory-rejected");
  assert.equal((await attempt.control.close()).complete, true);
  assert.deepEqual(log, ["m3", "m2", "m1"]);
});

test("A2 one prepared assembly, two concurrent runs: closing run 1 never touches run 2", async () => {
  const { declarations, composition } = await chain(2);
  const api = assemblyFor();
  const released = [];
  const handles = declarations.map((declaration, index) => api.bindFactory(declaration,
    scoped(declaration.implementationId, async (_deps, { resources }) => {
      await tick();
      const connection = await resources.setup({
        name: "conn", setup: () => ({ id: "" }), cleanup: value => { released.push(value.id); },
      });
      return { instance: connection, capabilities: { [capabilityId(index + 1)]: connection } };
    })));
  const prepared = await prepare(api, { composition, factories: handles, roots: { root: handles[1] } });
  const one = createScope({ name: "session-1" });
  const two = createScope({ name: "session-2" });
  const [first, second] = await Promise.all([
    prepared.run({ scope: one.resources }), prepared.run({ scope: two.resources }),
  ]);
  assert.equal(first.status, "succeeded");
  assert.equal(second.status, "succeeded");
  for (const entry of first.created) entry.instance.id = `1:${entry.implementationId}`;
  for (const entry of second.created) entry.instance.id = `2:${entry.implementationId}`;
  assert.equal((await one.control.close()).complete, true);
  assert.deepEqual(released, ["1:t/m2", "1:t/m1"]);
  assert.equal(two.resources.signal.aborted, false);
  assert.equal((await prepared.run({ scope: createScope({ name: "session-3" }).resources })).status, "succeeded");
  assert.equal((await two.control.close()).complete, true);
  assert.deepEqual(released, ["1:t/m2", "1:t/m1", "2:t/m2", "2:t/m1"]);

  let acquired = 0;
  const strict = assemblyFor();
  const [single] = declarations;
  const handle = strict.bindFactory(single, scoped("m1", async (_deps, { resources }) => {
    await resources.setup({ name: "r", setup: () => { acquired += 1; }, cleanup: () => {} });
    return { instance: 1, capabilities: { [capabilityId(1)]: 1 } };
  }));
  const alone = await compileComposition({ declarations: [single], profile: profile([single], [moduleId(1)], []) });
  const lone = await prepare(strict, { composition: alone, factories: [handle], roots: { root: handle } });
  // The Scope itself instead of scope.resources is the typical Host mistake.
  for (const scope of [undefined, {}, { child() {} }, one.resources.child, one]) {
    assert.ok(invalidRunScope(await lone.run({ scope })), String(scope));
  }
  assert.equal(acquired, 0);
});

test("A3 concurrent runs of one prepared assembly never mix inputs, and inputs never enter created", async () => {
  const input = declare("s/input", ["session/id"]);
  const store = declare("s/store", ["s/store"], [["id", "session/id"]]);
  const composition = await compileComposition({
    declarations: [input, store], profile: profile([input, store], ["s/store"], [bind("s/store", "id", "s/input")]),
  });
  const api = assemblyFor();
  const inputHandle = api.bindInput(input);
  const storeHandle = api.bindFactory(store, scoped("s/store", async (deps) => {
    await tick();
    return { instance: deps.id, capabilities: { "s/store": deps.id } };
  }));
  const prepared = await prepare(api, {
    composition, factories: [storeHandle], roots: { store: storeHandle }, inputs: { session: inputHandle },
  });
  const host = createScope({ name: "host" });
  const outcomes = await Promise.all(Array.from({ length: 64 }, (_, index) => prepared.run({
    scope: host.resources.child({ name: `s${index}` }).resources,
    inputs: { session: { "session/id": `s${index}` } },
  })));
  assert.deepEqual(outcomes.map(outcome => outcome.roots.store), outcomes.map((_, index) => `s${index}`));
  assert.ok(outcomes.every(outcome => outcome.created.length === 1 && outcome.created[0].implementationId === "s/store"));
  assert.equal((await host.control.close()).complete, true);
});

test("A4 cancelling run() reaches a hung setup; the module lifetime is not tied to the run signal", async () => {
  const { declarations, composition } = await chain(1);
  const api = assemblyFor();
  let mode = "hang";
  let captured;
  const handle = api.bindFactory(declarations[0], scoped("m1", async (_deps, context) => {
    assert.deepEqual(Object.keys(context).sort(), ["resources", "signal"]);
    await context.resources.setup({ name: "conn", cleanup: () => {}, setup: ({ signal }) => new Promise((resolve, reject) => {
      if (mode === "hang") signal.addEventListener("abort", () => { reject(signal.reason); }, { once: true });
      else resolve(1);
    }) });
    captured = context.resources;
    return { instance: 1, capabilities: { [capabilityId(1)]: 1 } };
  }));
  const prepared = await prepare(api, { composition, factories: [handle], roots: { root: handle } });
  const host = createScope({ name: "host" });
  const attempt = host.resources.child({ name: "attempt" });
  const run = new AbortController();
  const outcome = prepared.run({ signal: run.signal, scope: attempt.resources });
  await tick();
  const reason = new Error("cancel construction");
  run.abort(reason);
  let timer;
  const settled = await Promise.race([outcome, new Promise(resolve => { timer = setTimeout(resolve, 500, "HANG"); })]);
  clearTimeout(timer);
  assert.notEqual(settled, "HANG");
  assert.equal(settled.status, "failed");
  assert.equal(settled.code, "assembly.run.factory-rejected");
  assert.equal(settled.cancellation.reason, reason);
  assert.equal((await attempt.control.close()).complete, true);
  mode = "ok";
  const live = host.resources.child({ name: "live" });
  const request = new AbortController();
  assert.equal((await prepared.run({ signal: request.signal, scope: live.resources })).status, "succeeded");
  request.abort();
  assert.equal(captured.signal.aborted, false);
  await assert.doesNotReject(captured.setup({ name: "later", setup: () => 3, cleanup: () => {} }));
  assert.equal((await host.control.close()).complete, true);
});

test("A5 scoped() forwards every context field except the run scope", async () => {
  const host = createScope({ name: "host" });
  const seen = [];
  const wrapped = scoped("m", (_deps, context) => { seen.push(...Object.keys(context).sort()); return 1; });
  wrapped({}, { signal: new AbortController().signal, scope: host.resources, extra: 7 });
  assert.deepEqual(seen, ["extra", "resources", "signal"]);
  assert.equal((await host.control.close()).complete, true);
});

test("A6 a builder fragment bound under its own map runs scoped inside the Host's assembly", async () => {
  const Db = defineContract()({ id: "acme/db", revision: 3 });
  const Orders = defineContract()({ id: "acme/orders", revision: 1 });
  const database = declareModule({ moduleId: "acme/db", implementationId: "acme/db/pg",
    owner: { authority: "acme", path: ["db"] }, provides: [Db.provide()], slots: [] });
  const orders = declareModule({ moduleId: "acme/orders", implementationId: "acme/orders/default",
    owner: { authority: "acme", path: ["orders"] }, provides: [Orders.provide()], slots: [Db.slot("db", required())] });
  const composition = await compileComposition({ declarations: [database, orders], profile: {
    kind: "get-modular.composition-profile", schemaVersion: 1, profileId: "acme/main", roots: ["acme/orders"],
    selections: [database, orders].map(({ moduleId: id, implementationId }) => ({ moduleId: id, implementationId })),
    bindings: [bind("acme/orders/default", "db", "acme/db/pg")],
  } });
  assert.equal(composition.ok, true, JSON.stringify(composition.diagnostics));
  const released = [];
  const team = assemblyFor();
  const host = assemblyFor();
  const ordersHandle = team.bindFactory(orders, scoped(orders.implementationId, async (deps, { resources }) => {
    const count = await resources.setup({ name: "conn", setup: () => deps.db.query(), cleanup: () => { released.push("conn"); } });
    return { instance: count, capabilities: { "acme/orders": { list: () => count } } };
  }));
  const databaseHandle = host.bindFactory(database, async () => ({ instance: 0, capabilities: { "acme/db": { query: () => 42 } } }));
  const prepared = await prepare(host, { composition, factories: [databaseHandle, ordersHandle], roots: { orders: ordersHandle } });
  const attempt = createScope({ name: "attempt" });
  const outcome = await prepared.run({ scope: attempt.resources });
  assert.equal(outcome.status, "succeeded");
  assert.equal(outcome.roots.orders, 42);
  assert.equal((await attempt.control.close()).complete, true);
  assert.deepEqual(released, ["conn"]);
});
