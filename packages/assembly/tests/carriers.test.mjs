import assert from "node:assert/strict";
import test from "node:test";
import { compileComposition } from "@get-modular/core";
import { prepareConstruction } from "../dist/features/construction/prepare.js";
import { deferred, synthetic } from "./fixture.mjs";

test("unsupported carriers never call then or an own constructor getter", async () => {
  let reads = 0;
  const thenable = { then() { reads++; } };
  const native = Promise.resolve({ instance: {}, capabilities: {} });
  Object.defineProperty(native, "constructor", { get() { reads++; throw new Error("getter"); } });
  class Subclass extends Promise {}
  const fake = Object.create(Promise.prototype);
  for (const carrier of [thenable, native, new Subclass((resolve) => resolve({})), fake, 1, undefined]) {
    const host = await synthetic({ appFactory: () => carrier });
    const outcome = await host.prepared.run();
    assert.equal(outcome.status, "failed");
    assert.equal(outcome.code, "assembly.run.unsupported-carrier");
    assert.equal(outcome.implementationId, "app");
    assert.equal(outcome.created.length, 3);
    assert.equal(outcome.returned, undefined);
  }
  assert.equal(reads, 0);
});

test("nested instance and capability then methods remain opaque and unfrozen", async () => {
  let calls = 0;
  const value = { initial: "", then() { calls++; throw new Error("opaque"); } };
  const host = await synthetic({ storeFactory: async () => ({ instance: value, capabilities: { store: value } }) });
  const result = await host.prepared.run();
  assert.equal(result.status, "succeeded");
  assert.equal(result.roots.app.deps.store, value);
  assert.equal(Object.isFrozen(value), false);
  assert.equal(calls, 0);
});

test("throw, rejection and malformed completion retain causes and ownership", async () => {
  const thrown = new Error("synchronous"), rejected = 17;
  for (const [factory, code, cause] of [
    [() => { throw thrown; }, "assembly.run.factory-threw", thrown],
    [() => Promise.reject(rejected), "assembly.run.factory-rejected", rejected],
  ]) {
    const host = await synthetic({ appFactory: factory }), result = await host.prepared.run();
    assert.equal(result.status, "failed");
    assert.equal(result.code, code);
    assert.equal(result.cause, cause);
    assert.equal(result.created.length, 3);
    assert.equal(result.returned, undefined);
    assert.equal(result.cancellation, undefined);
  }
  let reads = 0;
  const products = [
    null, 42, { instance: {} }, { instance: {}, capabilities: { extra: true } },
    { get instance() { reads++; return {}; }, capabilities: {} },
    { instance: {}, get capabilities() { reads++; return {}; } },
  ];
  for (const product of products) {
    const host = await synthetic({ appFactory: async () => product }), result = await host.prepared.run();
    assert.equal(result.code, "assembly.run.invalid-product");
    assert.equal(result.phase, "completion");
    assert.equal(result.created.length, 3);
    assert.equal(result.returned.product, product);
    assert.equal(result.returned.implementationId, "app");
  }
  assert.equal(reads, 0);
});

test("late rejection and malformed fulfillment fail while separately recording abort", async () => {
  for (const mode of ["reject", "invalid"]) {
    const controller = new AbortController(), gate = deferred();
    const product = { instance: {} }, cause = Symbol("rejection");
    const host = await synthetic({ storeFactory: () => gate.promise });
    const running = host.prepared.run({ signal: controller.signal });
    controller.abort("cancelled");
    if (mode === "reject") gate.reject(cause); else gate.resolve(product);
    const outcome = await running;
    assert.equal(outcome.status, "failed");
    assert.equal(outcome.cancellation.reason, "cancelled");
    assert.equal(outcome.created.length, 0);
    assert.deepEqual(host.trace, ["store"]);
    if (mode === "reject") assert.equal(outcome.cause, cause);
    else assert.equal(outcome.returned.product, product);
  }
});

test("internal journal seam proves handoff before and after commit", async () => {
  for (const afterCommit of [false, true]) {
    const marker = new Error("controlled internal failure"), controller = new AbortController();
    const host = await synthetic();
    let product;
    const original = host.declarations.at(-1);
    const replacement = host.api.bindFactory(original, async () => {
      product = { instance: {}, capabilities: {} };
      controller.abort("observed");
      return product;
    });
    const input = { ...host.input, factories: [...host.input.factories.slice(0, -1), replacement], roots: { app: replacement } };
    const result = await prepareConstruction(input, {
      compileComposition,
      commitCreated(journal, entry) {
        if (entry.implementationId !== "app" || afterCommit) journal.push(entry);
        if (entry.implementationId === "app") throw marker;
      },
    });
    assert.equal(result.status, "prepared");
    const outcome = await result.prepared.run({ signal: controller.signal });
    assert.equal(outcome.code, "assembly.run.internal");
    assert.equal(outcome.cause, marker);
    assert.equal(outcome.cancellation.reason, "observed");
    assert.equal(outcome.created.length, afterCommit ? 4 : 3);
    if (afterCommit) assert.equal(outcome.returned, undefined);
    else assert.equal(outcome.returned.product, product);
  }
});
