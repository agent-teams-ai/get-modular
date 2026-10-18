// Archived P/R semantic probes, ported to the public package build and real resource scopes.
import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import { createServer, request } from "node:http";
import { createStore, ObservationError } from "../dist/index.js";
import { asyncDetection, delivered, liveSubscriptions, settled } from "../dist/testing.js";
import { world, createScope, scoped, codeOf, debtsOf, deferred, tick, settle, follow, startLoad,
  stubbornLoader, cooperativeLoader, regionLoad, stats, pendingWork, MAX_CASCADE_DEPTH } from "./support/world.mjs";

test("T21 [P21] set takes ownership: values are frozen in place; frozen nodes are not walked again", (t) => {
    const { store } = world({ a: 0, b: 0, region: "r0", rows: [] });
    const mine = { theme: "light" };
    store.set({ b: mine });
    assert.equal(Object.isFrozen(mine), true);
    let rows = Array.from({ length: 50_000 }, (_, id) => ({ id }));
    store.set({ rows });

    const walked = stats(store).walked;
    for (let i = 0; i < 1; i += 1) {
        rows = [...rows, { id: 50_000 + i }];
        store.set({ rows });
    }

    assert.equal(stats(store).walked - walked, 2);
});

test("T46 [P25] the owner's read works after close; a save-on-close entry registered after createStore sees the last values", async () => {
    const host = createScope({ name: "host" });
    const module = host.resources.child({ name: "prefs" });
    const saved = [];
    const store = createStore({ theme: "light" }, { name: "prefs", resources: module.resources, reportError: () => undefined });
    module.resources.use({ [Symbol.dispose]: () => { saved.push(store.read(["theme"]).values.theme); } }, "prefs/save");
    store.set({ theme: "dark" });
    const report = await module.control.close();
    assert.equal(report.complete, true);
    assert.deepEqual(saved, ["dark"]);
    assert.equal(store.read(["theme"]).values.theme, "dark", "the owner still reads after close");
    assert.throws(() => store.readonly().read(["theme"]), (error) => codeOf(error) === "observation.store.closed");
});

test("T21 T38 [P26] a failed set leaves the caller's objects unfrozen; the global limit names scope counts", () => {
    const { store } = world({ a: 0, b: 0, region: "r0", rows: [] });
    const mine = { list: [1, 2] };
    assert.throws(() => store.set({ a: mine, b: new Date() }), (error) => codeOf(error) === "observation.values.not-plain");
    assert.equal(Object.isFrozen(mine), false);
    assert.equal(Object.isFrozen(mine.list), false);
    const limited = world({ a: 0, b: 0, region: "r0" }, { maxSubscriptions: 3 });
    for (let i = 0; i < 3; i += 1)
        follow(limited.facet, limited.host.resources.child({ name: `request-${i}` }).resources, ["a"], "m/a", () => undefined);
    assert.throws(() => follow(limited.facet, limited.module.resources, ["a"], "innocent/a", () => undefined), (error) => codeOf(error) === "observation.subscriptions.limit" && /in 3 scopes, at most 1 in one/.test(error.message));
});

test("T40 T47 [P15] callback failures go to reportError with the subscription name", async () => {
    const { store, facet, module, reports } = world();
    follow(facet, module.resources, ["a"], "throws", () => { throw new Error("boom"); });
    follow(facet, module.resources, ["a"], "returns", (() => 1)); // a JS caller
    store.set({ a: 1 });
    await settle();
    assert.deepEqual(reports.map((r) => [r.subscription, codeOf(r.cause) ?? r.cause.message]), [["throws", "boom"], ["returns", "observation.callback.returned-value"]]);
    assert.ok(reports.every((r) => r.source === "settings"));
    await module.control.close();
});

test("T11 T27 [PB] a snapshot of another store or a copy is rejected with a code", () => {
    const first = world();
    const second = world();
    const snapshot = first.facet.read(["a"]);
    assert.throws(() => second.facet.watch(snapshot, { resources: second.module.resources, name: "w", onChange: () => undefined }), (error) => codeOf(error) === "observation.snapshot.foreign");
    assert.throws(() => first.facet.watch({ ...snapshot }, { resources: first.module.resources, name: "w", onChange: () => undefined }), (error) => codeOf(error) === "observation.snapshot.foreign");
});

describe("T46 [R11] the owner keeps reading after close: save on close (C11)", () => {
    test("T46 [R11] a resource opened before the store saves the last value in its cleanup", async () => {
        const host = createScope({ name: "host" });
        const module = host.resources.child({ name: "prefs" });
        const file = await module.resources.setup({
            name: "prefs/file",
            setup: () => ({ saved: "", initial: { theme: "light" } }),
            cleanup: (opened) => { opened.saved = store.read(["theme"]).values.theme; },
        });
        const store = createStore({ ...file.initial }, { name: "prefs", resources: module.resources, reportError: () => undefined });
        store.set({ theme: "dark" });
        const report = await module.control.close();
        assert.equal(report.complete, true);
        assert.equal(file.saved, "dark");
        assert.throws(() => store.readonly().read(["theme"]), (error) => codeOf(error) === "observation.store.closed");
    });
});

describe("T46 [R15] save on close with an asynchronous writer (M5)", () => {
    test("T46 [R15] an asyncDispose entry registered after createStore is awaited before the file closes", async () => {
        const host = createScope({ name: "host" });
        const module = host.resources.child({ name: "prefs" });
        const log = [];
        const file = await module.resources.setup({
            name: "prefs/file",
            setup: () => ({
                initial: { theme: "light" },
                write: async (values) => {
                    await new Promise((resolve) => { setTimeout(resolve, 5); });
                    log.push(`wrote ${values.theme}`);
                },
                close: async () => { log.push("closed"); },
            }),
            cleanup: (opened) => opened.close(),
        });
        const store = createStore({ ...file.initial }, { name: "prefs", resources: module.resources, reportError: () => undefined });
        module.resources.use({ [Symbol.asyncDispose]: async () => { await file.write(store.read(["theme"]).values); } }, "prefs/save");
        store.set({ theme: "dark" });
        const report = await module.control.close();
        assert.equal(report.complete, true);
        assert.deepEqual(log, ["wrote dark", "closed"], "the write finished before the file closed");
    });
});

test("T14 T16 T19 T20 T21 T22 T23 T26 T28 T47 [R20] plain values, atomic patches, revisions and capabilities", async () => {
  const nested = { list: [1, , { n: 2 }] };
  const cyclic = { nested }; cyclic.self = cyclic;
  const { store, facet, owner } = world({ a: 0, b: NaN, node: cyclic, zero: -0 });
  assert.equal(Object.isFrozen(cyclic), true);
  assert.equal(Object.isFrozen(nested.list[2]), true);
  assert.equal(1 in nested.list, false);
  assert.equal(store.readonly(), facet);
  assert.deepEqual(Object.keys(store), ["read", "set", "readonly", "close"]);
  assert.deepEqual(Object.keys(facet), ["read", "watch", "load"]);
  assert.ok(Object.isFrozen(store) && Object.isFrozen(facet));
  assert.equal(store.set({ a: 0, b: NaN, node: cyclic }), 0);
  assert.equal(store.set({}), 0);
  assert.equal(store.set({ zero: +0 }), 1);
  assert.equal(store.set({ a: 2, b: 3 }), 2);
  assert.deepEqual(store.read(["a", "b", "a"]), { revision: 2, values: { a: 2, b: 3 } });
  assert.equal(store.read(["node"]).revision, 0);
  assert.throws(() => facet.read([]), { code: "observation.keys.empty" });
  assert.throws(() => store.read(["missing"]), { code: "observation.keys.unknown" });
  const incoming = { child: {} };
  assert.throws(() => store.set({ missing: incoming }), { code: "observation.keys.unknown" });
  assert.equal(Object.isFrozen(incoming.child), false);
  const snapshot = facet.read(["a"]);
  assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.values));
  await owner.control.close();
  assert.equal(store.read(["a"]).values.a, 2);
  assert.throws(() => facet.read(["a"]), { code: "observation.store.closed" });
});

test("T16 T21 T116 [R20] subclasses, prototype arrays and nonplain data reject before ownership transfer", () => {
  let getters = 0;
  class Shifty extends Array { #offset = 0; get changed() { getters += 1; return this[0] + this.#offset; } move() { this.#offset += 1; } }
  class Instance { value = 1; }
  const custom = [1]; Object.setPrototypeOf(custom, { get changed() { getters += 1; return 2; } });
  const getter = {}; Object.defineProperty(getter, "x", { get() { getters += 1; return 1; } });
  const symbolKey = { [Symbol("key")]: 1 };
  for (const bad of [new Shifty(10), custom, new Instance(), new Date(), new Map(), new Set(), new Uint8Array(2), () => 1, Symbol(), getter, symbolKey]) {
    const host = createScope({ name: "bad" });
    const options = { resources: host.resources, name: "bad", reportError: () => undefined };
    const graph = { good: {} , bad };
    assert.throws(() => createStore({ value: graph }, options), { code: "observation.values.not-plain" });
    assert.equal(Object.isFrozen(graph.good), false);
    const { store } = world({ value: null });
    assert.throws(() => store.set({ value: graph }), { code: "observation.values.not-plain" });
    assert.equal(Object.isFrozen(graph), false);
    assert.equal(store.read(["value"]).revision, 0);
  }
  assert.equal(getters, 0);
  const record = Object.create(null); record.__proto__ = { okay: true };
  const { store } = world(record);
  assert.deepEqual(store.read(["__proto__"]).values.__proto__, { okay: true });
  assert.equal(Object.getPrototypeOf(store.read(["__proto__"]).values), Object.prototype);
});

test("T14 T17 T21 T33 T46 T47 argument ordering and closed owner creation transfer nothing", async () => {
  const host = createScope({ name: "validation" });
  const valid = { name: "settings", resources: host.resources, reportError: () => undefined };
  for (const options of [null, {}, { ...valid, name: "" }, { ...valid, resources: {} }, { ...valid, reportError: 1 },
    ...[0, -1, NaN, Infinity, 1.5].map(maxSubscriptions => ({ ...valid, maxSubscriptions }))]) {
    assert.throws(() => createStore({ a: {} }, options), error => error instanceof ObservationError && error.code === "observation.argument.invalid");
  }
  const { facet, store, module } = world();
  for (const spec of [undefined, null, 1, {}, { resources: module.resources, name: "w", onChange: 1 }]) {
    assert.throws(() => facet.watch({}, spec), { code: "observation.argument.invalid" });
  }
  const snapshot = facet.read(["a"]);
  const watch = { resources: module.resources, name: "w", onChange: () => undefined };
  store.close();
  assert.throws(() => facet.watch({}, watch), { code: "observation.snapshot.foreign" });
  assert.throws(() => facet.watch(snapshot, watch), { code: "observation.store.closed" });
  assert.throws(() => facet.load(snapshot, { ...watch, loader: () => 1, onLoading: () => undefined, onResult: () => undefined, onError: () => undefined }), { code: "observation.store.closed" });
  assert.throws(() => store.set({ a: 1 }), { code: "observation.store.closed" });
  await host.control.close();
  const graph = { nested: {} };
  assert.throws(() => createStore({ a: graph }, valid), { code: "resources.scope.closed" });
  assert.equal(Object.isFrozen(graph), false);
  assert.equal(Object.isFrozen(graph.nested), false);
});

test("T28 T29 T117 [R21] fresh runtime values follow the declared domain after a narrowed starting snapshot", async () => {
  const { store, facet, module } = world({ status: "ready", count: 0 });
  const snapshot = facet.read(["status"]);
  const seen = [];
  facet.watch(snapshot, { resources: module.resources, name: "status", onChange: next => { seen.push(next.values.status); } });
  store.set({ status: "loading" });
  await delivered();
  assert.deepEqual(seen, ["loading"]);
  assert.deepEqual(Object.keys(facet.read(["count"]).values), ["count"]);
  store.set({ status: "ready" }); store.set({ status: "loading" });
  await delivered();
  assert.deepEqual(seen, ["loading", "loading"]);
});
test("T18 T19 T29 public semantic suite on the local build", async context => {
  const observation = await import("../dist/index.js"); const testing = await import("../dist/testing.js");
  const { runSemanticSuite } = await import("./semantic-suite.mjs");
  await runSemanticSuite(observation, testing, context);
});
