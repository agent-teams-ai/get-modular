import assert from "node:assert/strict";
import test from "node:test";
import { assemblyFor } from "@get-modular/assembly";
import { compile, declaration, deferred, prepared, synthetic } from "./fixture.mjs";

test("ordered many, optional presence, diamond sharing, roots without provides", async () => {
  for (const options of [{}, { logger: true, reverse: true }]) {
    const host = await synthetic(options);
    assert.deepEqual(host.trace, []);
    const result = await host.prepared.run();
    assert.equal(result.status, "succeeded");
    const app = result.roots.app, deps = app.deps;
    assert.equal(app.output, options.reverse ? "AB" : "BA");
    assert.equal(Object.hasOwn(deps, "logger"), true);
    assert.equal(deps.logger === undefined, !options.logger);
    assert.equal(Object.getPrototypeOf(deps), null);
    assert.equal(Object.getPrototypeOf(result.roots), null);
    assert.ok(Object.isFrozen(deps) && Object.isFrozen(deps.filters) && Object.isFrozen(result.created));
    for (const filter of deps.filters) assert.equal(filter.store, deps.store);
    assert.equal(Object.isFrozen(deps.store), false);
    const store = result.created.find((entry) => entry.implementationId === "synthetic/store");
    assert.notEqual(store.instance, store.capabilities["synthetic/store"]);
    assert.equal(store.capabilities["synthetic/store"], deps.store);
    assert.deepEqual(host.trace, host.input.composition.plan.dependencyOrder);
    for (const entry of result.created) {
      assert.ok(Object.isFrozen(entry) && Object.isFrozen(entry.capabilities));
      assert.equal(Object.getPrototypeOf(entry.capabilities), null);
    }
  }
});

test("a pending provider prevents later invocations and concurrent attempts are isolated", async () => {
  const pending = [deferred(), deferred()];
  let invocation = 0;
  const host = await synthetic({ storeFactory: () => pending[invocation++].promise });
  const first = host.prepared.run(), second = host.prepared.run();
  assert.deepEqual(host.trace, ["synthetic/store", "synthetic/store"]);
  const left = { initial: "L" }, right = { initial: "R" };
  pending[1].resolve({ instance: {}, capabilities: { "synthetic/store": right } });
  const b = await second;
  assert.equal(b.roots.app.output, "RBA");
  assert.equal(host.trace.filter((id) => id === "synthetic/app").length, 1);
  pending[0].resolve({ instance: {}, capabilities: { "synthetic/store": left } });
  const a = await first;
  assert.equal(a.roots.app.output, "LBA");
  assert.notEqual(a.created, b.created);
  assert.notEqual(a.roots.app.deps.filters, b.roots.app.deps.filters);
  assert.notEqual(a.roots.app.deps.store, b.roots.app.deps.store);
});

test("repeated and finite nested runs use separate journals and dependency maps", async () => {
  const api = assemblyFor(), item = declaration("nested", ["synthetic/value"]);
  let nesting = false, runnable, inner, count = 0;
  const handle = api.bindFactory(item, async () => {
    const instance = { sequence: ++count };
    if (!nesting) {
      nesting = true;
      inner = await runnable.run();
      nesting = false;
    }
    return { instance, capabilities: { "synthetic/value": instance } };
  });
  runnable = await prepared(api, { composition: await compile([item]), factories: [handle], roots: { root: handle } });
  const first = await runnable.run(), firstInner = inner, second = await runnable.run();
  assert.equal(first.status, "succeeded");
  assert.equal(firstInner.status, "succeeded");
  assert.notEqual(first.roots.root, firstInner.roots.root);
  assert.notEqual(first.created, second.created);
  assert.notEqual(first.roots.root, second.roots.root);
  assert.equal(count, 4);
});

test("several capabilities and defined undefined values never fall back to instance", async () => {
  const api = assemblyFor(), provider = declaration("provider", ["synthetic/left", "synthetic/right", "synthetic/empty"]);
  const instance = {}, left = {}, right = {};
  const handle = api.bindFactory(provider, async () => ({ instance, capabilities: { "synthetic/left": left, "synthetic/right": right, "synthetic/empty": undefined } }));
  const result = await (await prepared(api, { composition: await compile([provider]), factories: [handle], roots: { root: handle } })).run();
  assert.equal(result.status, "succeeded");
  assert.equal(result.roots.root, instance);
  assert.equal(result.created[0].capabilities["synthetic/left"], left);
  assert.equal(result.created[0].capabilities["synthetic/right"], right);
  assert.ok(Object.hasOwn(result.created[0].capabilities, "synthetic/empty"));
  assert.equal(result.created[0].capabilities["synthetic/empty"], undefined);
});

test("already aborted means no calls; valid late fulfillment is journaled before cancellation", async () => {
  const gate = deferred(), entered = deferred(), controller = new AbortController();
  const host = await synthetic({ storeFactory: () => { entered.resolve(); return gate.promise; } });
  const already = new AbortController();
  already.abort("before");
  assert.deepEqual(await host.prepared.run({ signal: already.signal }), { status: "cancelled", reason: "before", created: [] });
  assert.deepEqual(host.trace, []);
  const running = host.prepared.run({ signal: controller.signal });
  await entered.promise;
  controller.abort("during");
  let finished = false;
  running.then(() => { finished = true; });
  await Promise.resolve();
  assert.equal(finished, false);
  const instance = {}, store = { initial: "" };
  gate.resolve({ instance, capabilities: { "synthetic/store": store } });
  const result = await running;
  assert.equal(result.status, "cancelled");
  assert.equal(result.reason, "during");
  assert.equal(result.created.length, 1);
  assert.equal(result.created[0].instance, instance);
  assert.deepEqual(host.trace, ["synthetic/store"]);
});

test("abort during final fulfillment cancels; settled outcomes remain terminal", async () => {
  const controller = new AbortController();
  const host = await synthetic({ appFactory: async () => { controller.abort("final"); return { instance: {}, capabilities: {} }; } });
  const result = await host.prepared.run({ signal: controller.signal });
  assert.equal(result.status, "cancelled");
  assert.equal(result.created.length, 4);
  const normal = await synthetic(), signal = new AbortController();
  const succeeded = await normal.prepared.run({ signal: signal.signal });
  signal.abort("too-late");
  assert.equal(succeeded.status, "succeeded");
  assert.equal(succeeded.created.length, 4);
});

test("Host cleanup can deduplicate resources shared by instances and capabilities", async () => {
  let disposed = 0;
  const resource = { initial: "", dispose() { disposed++; } };
  const cause = new Error("app failed");
  const host = await synthetic({
    storeFactory: async () => ({ instance: resource, capabilities: { "synthetic/store": resource } }),
    appFactory: async () => { throw cause; },
  });
  const result = await host.prepared.run();
  assert.equal(result.status, "failed");
  assert.equal(result.cause, cause);
  assert.equal(disposed, 0);
  const resources = new Set();
  for (const entry of result.created) {
    for (const value of [entry.instance, ...Object.values(entry.capabilities)]) {
      if (value && typeof value.dispose === "function") resources.add(value);
    }
  }
  for (const resource of resources) resource.dispose();
  assert.equal(disposed, 1);
});
