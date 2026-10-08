import assert from "node:assert/strict";
import test from "node:test";
import { compileComposition, required } from "@get-modular/core";
import { assemblyFor, declareModule, defineContract } from "@get-modular/assembly";

// ADR-0032: contract descriptors and declareModule emit the current wire generation.
const isDeclarationError = (error) => error?.code === "assembly.bind.invalid-declaration";
const Db = defineContract()({ id: "acme/db", revision: 3 });
const Orders = defineContract()({ id: "acme/orders", revision: 1 });
const owner = (path) => ({ authority: "acme", path: [path] });
const database = declareModule({
  moduleId: "acme/db", implementationId: "acme/db/pg", owner: owner("db"), provides: [Db.provide()], slots: [],
});
const orders = declareModule({
  moduleId: "acme/orders", implementationId: "acme/orders/default", owner: owner("orders"),
  provides: [Orders.provide()], slots: [Db.slot("db", required())],
});
const ordersProfile = (declarations) => ({
  kind: "get-modular.composition-profile", schemaVersion: 1, profileId: "acme/main", roots: ["acme/orders"],
  selections: declarations.map(({ moduleId, implementationId }) => ({ moduleId, implementationId })),
  bindings: [{ consumerImplementationId: "acme/orders/default", slotId: "db", providerImplementationIds: ["acme/db/pg"] }],
});

test("the builder emits exactly the current wire generation and refuses wire fields", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(orders)), {
    moduleId: "acme/orders", implementationId: "acme/orders/default", owner: { authority: "acme", path: ["orders"] },
    provides: [{ capabilityId: "acme/orders", compatibility: { family: "exact", familyVersion: 1, token: "acme/orders/r1" } }],
    slots: [{ slotId: "db", capabilityId: "acme/db", compatibility: { family: "exact", familyVersion: 1, token: "acme/db/r3" },
      cardinality: { kind: "required" } }],
    kind: "get-modular.module-declaration", schemaVersion: 1,
  });
  assert.ok(Object.isFrozen(Db) && Object.isFrozen(orders) && Object.isFrozen(orders.slots[0])
    && Object.isFrozen(orders.slots[0].compatibility));
  assert.ok(Object.isFrozen(orders.provides[0]) && Object.isFrozen(orders.provides[0].compatibility));
  const spec = { moduleId: "acme/db", implementationId: "acme/db/pg", owner: owner("db"), provides: [Db.provide()], slots: [] };
  assert.deepEqual(JSON.parse(JSON.stringify(declareModule(spec))), JSON.parse(JSON.stringify(database)));
  for (const invalid of [{ ...orders }, { ...spec, kind: undefined }, { ...spec, schemaVersion: 1 }, null, "acme/db"]) {
    assert.throws(() => declareModule(invalid), isDeclarationError);
  }
  for (const spec of [{ id: "", revision: 1 }, { id: 1, revision: 1 }, { id: "acme/db", revision: 0 },
    { id: "acme/db", revision: 1.5 }, { id: "acme/db", revision: Number.NaN }, { id: "acme/db", revision: "1" },
    { id: "acme/db", revision: 2147483648 }, { id: "acme/db", revision: Number.MAX_SAFE_INTEGER }, null]) {
    assert.throws(() => defineContract()(spec), isDeclarationError);
  }
  // The largest revision the next wire generation carries stays valid.
  assert.equal(defineContract()({ id: "acme/db", revision: 2147483647 }).provide().compatibility.token, "acme/db/r2147483647");
});

test("handles bound by different Assembly instances prepare and run together", async () => {
  const composition = await compileComposition({ declarations: [database, orders], profile: ordersProfile([database, orders]) });
  assert.equal(composition.ok, true, JSON.stringify(composition.diagnostics));
  const team = assemblyFor(), host = assemblyFor();
  const ordersHandle = team.bindFactory(orders, async ({ db }) => ({ instance: db.query(), capabilities: { "acme/orders": {} } }));
  const dbHandle = host.bindFactory(database, async () => ({ instance: 0, capabilities: { "acme/db": { query: () => 42 } } }));
  const ready = await host.prepare({ composition, factories: [dbHandle, ordersHandle], roots: { orders: ordersHandle } });
  assert.equal(ready.status, "prepared", JSON.stringify(ready));
  const outcome = await ready.prepared.run();
  assert.equal(outcome.status, "succeeded");
  assert.equal(outcome.roots.orders, 42);
});

test("Core rejects a slot built from another revision of a contract", async () => {
  const stale = declareModule({
    moduleId: "acme/orders", implementationId: "acme/orders/default", owner: owner("orders"),
    provides: [Orders.provide()], slots: [defineContract()({ id: "acme/db", revision: 2 }).slot("db", required())],
  });
  const result = await compileComposition({ declarations: [database, stale], profile: ordersProfile([database, stale]) });
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some(({ code }) => code === "binding.compatibility-mismatch"), JSON.stringify(result.diagnostics));
});
