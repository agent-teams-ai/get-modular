// Archived P/R semantic probes, ported to the public package build and real resource scopes.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { delivered, liveSubscriptions } from "../dist/testing.js";
import { world, scoped, codeOf, debtsOf, deferred, tick, settle, follow, startLoad, stubbornLoader, regionLoad, stats } from "./support/world.mjs";

test("T29 [P1] a commit between reading and subscribing is not lost", async () => {
    const { store, facet, module } = world();
    let current;
    const first = follow(facet, module.resources, ["a"], "w", (next) => { current = next.values.a; return undefined; }, () => { store.set({ a: 5 }); });
    current ??= first.values.a;
    await settle();
    assert.equal(current, 5);
});

test("T34 [P2] the subscription is detached when its scope starts closing, before the drain finishes", async () => {
    const { store, facet, module } = world();
    const seen = [];
    follow(facet, module.resources, ["a"], "w", (next) => { seen.push(next.values.a); return undefined; });
    const load = stubbornLoader();
    startLoad(facet, module.resources, ["region"], "catalog", load.handlers);
    store.set({ a: 1 });
    await settle();
    assert.deepEqual(seen, [1]);
    assert.equal(load.calls.length, 1);
    assert.equal(stats(store).live, 2);
    let closed = false;
    const closing = module.control.close().then((report) => { closed = true; return report; });
    assert.equal(stats(store).live, 0, "detached synchronously by close()");
    assert.equal(load.calls[0]?.signal.aborted, true, "the running load is aborted at once");
    store.set({ a: 2, region: "r1" });
    await settle();
    assert.equal(closed, false, "the drain still waits for the stubborn load");
    assert.deepEqual(seen, [1], "no delivery after the scope started closing");
    assert.equal(load.calls.length, 1, "no new load after the scope started closing");
    load.calls[0]?.gate.resolve("late");
    const report = await closing;
    assert.deepEqual(debtsOf(report), []);
    assert.equal(report.complete, true);
    await settle(); // close drains the loader; its later publication must also have a chance to run
    assert.deepEqual(load.published, [], "a result after close is dropped");
});

test("T63 T104 [P5] coalescing: 10 000 commits in one task give one delivery of the newest value", async () => {
    const { store, facet, module } = world();
    const seen = [];
    follow(facet, module.resources, ["a"], "w", (next) => { seen.push(next.values.a); return undefined; });
    let maxDirty = 0;
    for (let i = 1; i <= 10_000; i += 1) {
        store.set({ a: i });
        maxDirty = Math.max(maxDirty, stats(store).dirty);
    }
    await settle();
    assert.deepEqual(seen, [10_000]);
    assert.equal(maxDirty, 1, "one buffered entry per subscription, whatever the number of commits");
    assert.equal(stats(store).deliveries, 1);
});

test("T63 T104 [P7] dispatch visits only subscriptions of the changed keys (hundreds of watchers)", async (t) => {
    for (const watchers of [10, 100, 1000]) {
        const { store, facet, module } = world({ a: 0, b: 0, region: "r0" }, { maxSubscriptionsPerScope: 2048 });
        for (let i = 0; i < watchers; i += 1)
            follow(facet, module.resources, ["a"], `a${i}`, () => undefined);
        follow(facet, module.resources, ["b"], "b", () => undefined);
        const before = stats(store).visits;
        store.set({ b: 1 });
        assert.equal(stats(store).visits - before, 1, `${watchers} watchers on a: a change of b visits one`);
        store.set({ a: 1 });
        assert.equal(stats(store).visits - before - 1, watchers);

        for (let i = 2; i < 2_002; i += 1)
            store.set({ b: i });

        await settle();
        await module.control.close();
    }
});

test("T37 T38 [P8] a repeated watch in a long-lived scope fails with a coded error, in that scope only", async () => {
    const { facet, module, store, host } = world();
    follow(facet, module.resources, ["a"], "per-request", () => undefined);
    assert.throws(() => follow(facet, module.resources, ["a"], "per-request", () => undefined), (error) => codeOf(error) === "observation.subscription.duplicate-name");
    assert.equal(stats(store).live, 1);
    // Generated names bypass the name check; the per-scope limit (default 64) stops them in the leaking scope.
    let accepted = 1;
    assert.throws(() => {
        for (let i = 0; i < 1000; i += 1) {
            follow(facet, module.resources, ["a"], `request-${i}`, () => undefined);
            accepted += 1;
        }
    }, (error) => codeOf(error) === "observation.subscriptions.limit");
    assert.equal(accepted, 64);
    // Another module is not affected by the leak.
    const other = host.resources.child({ name: "other" });
    follow(facet, other.resources, ["a"], "other/a", () => undefined);
    assert.equal(liveSubscriptions(facet, other.resources), 1);
    assert.equal(liveSubscriptions(facet, module.resources), 64);
    await module.control.close();
    await other.control.close();
    assert.equal(stats(store).live, 0);
});

test("T34 [P9] the documented pattern: one child scope per request does not accumulate", async () => {
    const { facet, module, store } = world();
    for (let i = 0; i < 1000; i += 1) {
        const request = module.resources.child({ name: "request" });
        follow(facet, request.resources, ["a"], "per-request", () => undefined);
        const report = await request.control.close();
        assert.equal(report.complete, true);
    }
    assert.equal(stats(store).live, 0);
    assert.equal(stats(store).buckets, 0);
    await module.control.close();
});

test("T38 [P10] limits: 64 per subscriber scope by default; the owner's per-store safety limit across scopes", async () => {
    const { facet, host } = world({ a: 0, b: 0, region: "r0" }, { maxSubscriptions: 100 });
    const scopes = Array.from({ length: 3 }, (_, i) => host.resources.child({ name: `m${i}` }));
    let accepted = 0;
    assert.throws(() => {
        for (const scope of scopes)
            for (let i = 0; i < 40; i += 1) {
                follow(facet, scope.resources, ["a"], `w${i}`, () => undefined);
                accepted += 1;
            }
    }, (error) => codeOf(error) === "observation.subscriptions.limit");
    assert.equal(accepted, 100);
    for (const scope of scopes)
        await scope.control.close();
});

test("T43 [P20] either handler closes their shared scope and exactly one runs", async () => {
  const { store, facet, module } = world();
  let calls = 0;
  for (const name of ["first", "second"]) follow(facet, module.resources, ["a"], name, () => { calls += 1; void module.control.close(); });
  store.set({ a: 1 });
  await delivered();
  assert.equal(calls, 1);
});

test("T61 [P16] after subscribing, nothing is called back synchronously", async () => {
    const { store, facet, module } = world();
    let calls = 0;
    follow(facet, module.resources, ["a"], "w", () => { calls += 1; return undefined; }, () => { store.set({ a: 9 }); });
    for (let i = 0; i < 50; i += 1) await Promise.resolve();
    assert.equal(calls, 0);
});

describe("T34 [R1] the subscription is released when the subscriber scope closes", () => {
    test("T34 [R1] no delivery and no new load after close() is called, while the drain is still waiting", async () => {
        const { store, facet, module } = world({ level: "info", region: "eu", theme: "light" });
        const seen = [];
        facet.watch(facet.read(["level"]), { resources: module.resources, name: "logger", onChange: ({ values }) => { seen.push(values.level); } });
        const load = regionLoad(facet, module.resources, true);
        store.set({ level: "debug" });
        await settle();
        assert.deepEqual(seen, ["debug"]);
        assert.equal(stats(store).live, 2);
        let closed = false;
        const closing = module.control.close().then((report) => { closed = true; return report; });
        assert.equal(stats(store).live, 0, "both subscriptions detached synchronously by close()");
        store.set({ level: "warn", region: "us" });
        await settle();
        assert.equal(closed, false, "the drain still waits for the running load");
        assert.deepEqual(seen, ["debug"], "no delivery after close() was called");
        assert.equal(load.runs.length, 1, "no new load after close() was called");
        load.runs[0]?.release("late");
        const report = await closing;
        assert.equal(report.complete, true);
        await settle(); // close drains the loader; its later publication must also have a chance to run
        assert.deepEqual(load.published, [], "the late result of a closed load is dropped");
    });
});

describe("T32 T63 T104 [R3] buffers stay bounded under 10 000 rapid set calls", () => {
    test("T32 T63 T104 [R3] 10 000 sets in one task: one delivery per subscription, one buffered entry per subscription", async () => {
        const { store, facet, module } = world({ level: "0", region: "eu", theme: "light" });
        const deliveries = [0, 0, 0];
        for (const index of [0, 1, 2]) {
            facet.watch(facet.read(["level"]), { resources: module.resources, name: `w${index}`, onChange: () => { deliveries[index] = (deliveries[index] ?? 0) + 1; } });
        }
        let maxDirty = 0;
        for (let i = 1; i <= 10_000; i += 1) {
            store.set({ level: String(i) });
            maxDirty = Math.max(maxDirty, stats(store).dirty);
        }
        await settle();
        assert.deepEqual(deliveries, [1, 1, 1]);
        assert.equal(maxDirty, 3, "the buffer is the set of subscriptions, not the list of commits");
    });
    test("T32 T63 T104 [R3] 10 000 sets over 100 tasks: at most one delivery per task per subscription, the newest value", async () => {
        const { store, facet, module } = world({ level: "0", region: "eu", theme: "light" });
        let task = 0;
        const perTask = new Map();
        let last = "";
        facet.watch(facet.read(["level"]), {
            resources: module.resources, name: "w",
            onChange: ({ values }) => { perTask.set(task, (perTask.get(task) ?? 0) + 1); last = values.level; },
        });
        for (let i = 1; i <= 10_000; i += 1) {
            store.set({ level: String(i) });
            if (i % 100 === 0) {
                await tick();
                task += 1;
            }
        }
        await settle();
        assert.ok(Math.max(...perTask.values()) <= 1, "never two deliveries in one task");
        assert.ok(perTask.size <= 101);
        assert.equal(last, "10000");
    });
    test("T32 T63 T104 [R3] 10 000 region changes while a load runs: one active, at most one pending, 2 loader calls", async () => {
        const { store, facet, module } = world({ level: "info", region: "r0", theme: "light" });
        const load = regionLoad(facet, module.resources, true);
        await settle();
        let maxPending = 0;
        for (let i = 1; i <= 10_000; i += 1) {
            store.set({ region: `r${i}` });
            if (i % 10 === 0)
                await tick(); // 1 000 deliveries, each replaces the single pending slot
            maxPending = Math.max(maxPending, stats(store).loadsPending);
        }
        assert.equal(maxPending, 1);
        assert.equal(load.runs.length, 1);
        load.runs[0]?.release("r0 result");
        await settle();
        assert.equal(load.runs.length, 2);
        assert.equal(load.runs[1]?.region, "r10000");
        load.runs[1]?.release("r10000 result");
        await settle();
        assert.deepEqual(load.published, ["r10000 result"]);
        await module.control.close();
    });
});

describe("T63 T104 [R4] dispatch cost: 500 subscriptions on different keys versus one changed key", () => {
    test("T63 T104 [R4] a set of one key: 1 index lookup, 1 visit, 1 callback; ten keys: 10 of each", async (t) => {
        const keys = Array.from({ length: 500 }, (_, i) => `k${String(i).padStart(3, "0")}`); // test data only
        const { store, facet, module } = world(Object.fromEntries(keys.map((key) => [key, 0])), { maxSubscriptionsPerScope: 1024 });
        const calls = new Map();
        for (const key of keys) {
            facet.watch(facet.read([key]), { resources: module.resources, name: key, onChange: () => { calls.set(key, (calls.get(key) ?? 0) + 1); } });
        }
        const before = stats(store);
        store.set({ k123: 1 });
        await settle();
        const one = stats(store);
        assert.deepEqual({ lookups: one.indexLookups - before.indexLookups, visits: one.visits - before.visits, callbacks: [...calls.values()].reduce((a, b) => a + b, 0) }, { lookups: 1, visits: 1, callbacks: 1 });
        store.set({ k000: 2, k001: 2, k002: 2, k003: 2, k004: 2, k005: 2, k006: 2, k007: 2, k008: 2, k009: 2 });
        await settle();
        const ten = stats(store);
        assert.deepEqual({ lookups: ten.indexLookups - one.indexLookups, visits: ten.visits - one.visits, callbacks: [...calls.values()].reduce((a, b) => a + b, 0) - 1 }, { lookups: 10, visits: 10, callbacks: 10 });

        for (let i = 3; i < 10_003; i += 1)
            store.set({ k499: i });

        await module.control.close();
    });
    test("T63 T104 [R4] contrast: 500 subscriptions on the same key get 500 callbacks from one set", async () => {
        const { store, facet, module } = world({ level: "info", region: "eu", theme: "light" }, { maxSubscriptionsPerScope: 1024 });
        let callbacks = 0;
        for (let i = 0; i < 500; i += 1)
            facet.watch(facet.read(["level"]), { resources: module.resources, name: `w${i}`, onChange: () => { callbacks += 1; } });
        const before = stats(store);
        store.set({ theme: "dark" });
        await settle();
        assert.equal(stats(store).visits - before.visits, 0, "a key nobody follows costs no visit");
        store.set({ level: "debug" });
        await settle();
        assert.equal(callbacks, 500);
        await module.control.close();
    });
});

describe("T37 T38 [R5] repeated watch in one long-lived scope (per-request pattern)", () => {
    test("T37 T38 [R5] same name: observation.subscription.duplicate-name, the first subscription stays", () => {
        const { store, facet, module } = world({ level: "info", region: "eu", theme: "light" });
        const handle = () => { facet.watch(facet.read(["level"]), { resources: module.resources, name: "request", onChange: () => undefined }); };
        handle();
        assert.throws(handle, (error) => codeOf(error) === "observation.subscription.duplicate-name");
        assert.equal(stats(store).live, 1);
    });
    test("T37 T38 [R5] generated names: observation.subscriptions.limit at 64 in the leaking scope; other scopes are not affected", () => {
        const { store, facet, module, host } = world({ level: "info", region: "eu", theme: "light" });
        let accepted = 0;
        assert.throws(() => {
            for (let i = 0; i < 5_000; i += 1) {
                facet.watch(facet.read(["level"]), { resources: module.resources, name: `request-${i}`, onChange: () => undefined });
                accepted += 1;
            }
        }, (error) => codeOf(error) === "observation.subscriptions.limit");
        assert.equal(accepted, 64);
        const healthy = host.resources.child({ name: "healthy" });
        facet.watch(facet.read(["level"]), { resources: healthy.resources, name: "healthy/level", onChange: () => undefined });
        assert.deepEqual([liveSubscriptions(facet, module.resources), liveSubscriptions(facet, healthy.resources), stats(store).live], [64, 1, 65]);
    });
    test("T37 T38 [R5] recommended guard: a child scope per request, closed when the request ends (10 000 requests)", async () => {
        const { store, facet, module } = world({ level: "info", region: "eu", theme: "light" });
        for (let i = 0; i < 10_000; i += 1) {
            const request = module.resources.child({ name: "request" });
            facet.watch(facet.read(["level"]), { resources: request.resources, name: "level", onChange: () => undefined });
            const report = await request.control.close();
            assert.equal(report.complete, true);
        }
        assert.deepEqual([stats(store).live, stats(store).buckets], [0, 0]);
    });
});

describe("T48 [R8] watch and load when resources.signal is already aborted: its reason is rethrown, nothing registered", () => {
    test("T48 [R8] the scope's close was requested while the factory awaited: resources.scope.closed", async () => {
        const { store, facet, module } = world({ level: "info", region: "eu", theme: "light" });
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        const factory = (async () => {
            const level = facet.read(["level"]);
            await gate;
            facet.watch(level, { resources: module.resources, name: "m/level", onChange: () => undefined });
        })();
        const closing = module.control.close();
        release();
        await assert.rejects(factory, (error) => codeOf(error) === "resources.scope.closed");
        assert.equal(stats(store).live, 0);
        assert.equal((await closing).complete, true);
    });
    test("T48 [R8] the run that constructs the module was cancelled while the factory awaited (scoped()): the Host's reason", async () => {
        const { store, facet, host } = world({ level: "info", region: "eu", theme: "light" });
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        const run = new AbortController();
        const reason = new Error("the Host cancelled this construction");
        const factory = scoped("acme/module", async (_deps, { resources }) => {
            const region = facet.read(["region"]);
            await gate;
            facet.load(region, {
                resources, name: "m/catalog",
                loader: async () => "never", onLoading: () => undefined, onResult: () => undefined, onError: () => undefined,
            });
            return "built";
        });
        const pending = factory(undefined, { signal: run.signal, scope: host.resources });
        run.abort(reason);
        release();
        await assert.rejects(pending, (error) => error === reason);
        assert.equal(stats(store).live, 0);
        assert.equal((await host.control.close()).complete, true);
    });
});

test("T35 T38 T43 watch uses only a signal binding, supports stress limits, recovers capacity and defers new watches", async () => {
  const { store, facet, module } = world({ a: 0 }, { maxSubscriptionsPerScope: 1000 });
  let resourceCalls = 0;
  const resources = { signal: module.resources.signal,
    use: (...args) => { resourceCalls += 1; return module.resources.use(...args); },
    child: (...args) => { resourceCalls += 1; return module.resources.child(...args); },
    setup: (...args) => { resourceCalls += 1; return module.resources.setup(...args); } };
  const warnings = []; const warning = value => { warnings.push(value); };
  process.on("warning", warning);
  try {
    for (let i = 0; i < 1000; i += 1) facet.watch(facet.read(["a"]), { resources, name: `w${i}`, onChange: () => undefined });
    assert.equal(resourceCalls, 0);
    await module.control.close(); await tick();
    assert.deepEqual(warnings, []);
    assert.equal(liveSubscriptions(facet), 0);
  } finally { process.off("warning", warning); }
  const w = world({ a: 0 }); let lateCalls = 0;
  const first = w.facet.read(["a"]);
  w.facet.watch(first, { resources: w.module.resources, name: "first", onChange: () => {
    w.facet.watch(first, { resources: w.module.resources, name: "late", onChange: () => { lateCalls += 1; } });
    assert.equal(lateCalls, 0);
  } });
  w.store.set({ a: 1 }); await delivered(); assert.equal(lateCalls, 1);
});

test("T38 default store limit is exactly 8192 and detach recovers capacity", async () => {
  const { host, facet, module } = world({ a: 0 });
  const scopes = Array.from({ length: 128 }, (_, i) => host.resources.child({ name: `scope${i}` }));
  for (const scope of scopes) for (let i = 0; i < 64; i += 1) {
    facet.watch(facet.read(["a"]), { resources: scope.resources, name: `w${i}`, onChange: () => undefined });
  }
  assert.equal(liveSubscriptions(facet), 8192);
  assert.throws(() => facet.watch(facet.read(["a"]), { resources: module.resources, name: "extra", onChange: () => undefined }),
    error => error.code === "observation.subscriptions.limit" && /in 128 scopes, at most 64 in one/.test(error.message));
  await scopes[0].control.close();
  facet.watch(facet.read(["a"]), { resources: module.resources, name: "recovered", onChange: () => undefined });
  assert.equal(liveSubscriptions(facet), 8129);
});

for (const kind of ["throw", "scalar", "null", "getter", "promise", "async-echo", "getter-echo", "then-echo"]) {
  test(`T40 T54 T114 [R18] ${kind} return isolation keeps sibling and later delivery`, async () => {
    const { store, facet, module, reports } = world({ a: 0 });
    const sentinel = new Error("ordinary failure"); let reads = 0; let thenCalls = 0; let calls = 0; let sibling = 0;
    const fail = () => { store.set({ a: 99 }); };
    facet.watch(facet.read(["a"]), { resources: module.resources, name: "offender", onChange: () => {
      calls += 1;
      if (calls > 1) return undefined;
      if (kind === "throw") throw sentinel;
      if (kind === "scalar") return 3;
      if (kind === "null") return null;
      if (kind === "promise") return Promise.reject(sentinel);
      if (kind === "async-echo") return Promise.resolve().then(fail);
      if (kind === "getter") return { get then() { reads += 1; throw sentinel; } };
      if (kind === "getter-echo") return { get then() { reads += 1; fail(); } };
      return { get then() { reads += 1; return () => { thenCalls += 1; fail(); }; } };
    } });
    facet.watch(facet.read(["a"]), { resources: module.resources, name: "healthy", onChange: () => { sibling += 1; } });
    store.set({ a: 1 }); await delivered();
    assert.equal(store.read(["a"]).values.a, 1);
    assert.equal(calls, 1); assert.equal(sibling, 1);
    const codes = reports.map(report => codeOf(report.cause));
    assert.equal(codes.filter(code => code === "observation.callback.returned-value").length, kind === "throw" ? 0 : 1);
    assert.equal(codes.filter(code => code === "observation.delivery.echo").length, kind.endsWith("echo") ? 1 : 0);
    if (["getter", "promise", "throw"].includes(kind)) assert.equal(reports.filter(report => report.cause === sentinel).length, 1);
    if (kind.startsWith("getter") || kind === "then-echo") assert.equal(reads, 1);
    if (kind === "then-echo") assert.equal(thenCalls, 1);
    assert.ok(reports.every(report => report.subscription === "offender" && report.revision === 1 && Object.isFrozen(report)));
    store.set({ a: 2 }); await delivered(); assert.equal(calls, 2); assert.equal(sibling, 2);
  });
}

test("T114 [R18] an observed thenable keeps the original window and permits a later timer write", async () => {
  const { store, facet, module, reports } = world({ a: 0 });
  const completed = deferred(); let reads = 0; let calls = 0;
  facet.watch(facet.read(["a"]), { resources: module.resources, name: "thenable", onChange: ({ values }) => {
    if (values.a !== 1) return undefined;
    return { get then() {
      reads += 1;
      return (resolve) => {
        calls += 1;
        setTimeout(() => {
          try { store.set({ a: 2 }); resolve(undefined); completed.resolve(); }
          catch (cause) { completed.reject(cause); }
        }, 10);
      };
    } };
  } });
  store.set({ a: 1 }); await completed.promise; await delivered();
  assert.equal(store.read(["a"]).values.a, 2); assert.equal(reads, 1); assert.equal(calls, 1);
  assert.deepEqual(reports.map(report => codeOf(report.cause)), ["observation.callback.returned-value"]);
});


for (const member of ["onChange", "loader", "onLoading", "onResult", "onError"]) {
  test(`T34 T40 T43 T48 ${member} is captured once before admission, including callback-getter close`, async () => {
    for (const closeOnRead of [1, 2]) {
      const { store, facet, host } = world({ value: 0 }); const subscriber = host.resources.child({ name: "getter" });
      let reads = 0; let calls = 0;
      const callback = () => { calls += 1; return undefined; };
      const spec = member === "onChange"
        ? { resources: subscriber.resources, name: "getter/watch", onChange: callback }
        : { resources: subscriber.resources, name: "getter/load", loader: callback, onLoading: callback, onResult: callback, onError: callback };
      Object.defineProperty(spec, member, { get: () => {
        reads += 1; if (reads === closeOnRead) void subscriber.control.close(); return callback;
      } });
      const snapshot = facet.read(["value"]);
      const subscribe = () => { if (member === "onChange") facet.watch(snapshot, spec); else facet.load(snapshot, spec); };
      if (closeOnRead === 1) {
        assert.throws(subscribe, cause => cause === subscriber.resources.signal.reason);
        assert.equal(liveSubscriptions(facet), 0);
      } else {
        subscribe(); assert.equal(liveSubscriptions(facet), 1);
      }
      assert.equal(reads, 1); await subscriber.control.close(); store.set({ value: 1 }); await delivered({ stores: [facet] });
      assert.equal(liveSubscriptions(facet), 0); assert.equal(calls, 0); assert.equal(reads, 1);
    }
  });
}

for (const method of ["watch", "load"]) for (const member of ["name", "resources"]) {
  test(`T34 T43 ${method} refuses a source closed by its ${member} getter during admission`, async () => {
    const { store, facet, module, reports } = world({ value: 0 });
    const snapshot = facet.read(["value"]); store.set({ value: 1 });
    let reads = 0; let calls = 0;
    const callback = () => { calls += 1; return undefined; };
    const spec = { resources: module.resources, name: "source-closing", onChange: callback,
      loader: callback, onLoading: callback, onResult: callback, onError: callback };
    Object.defineProperty(spec, member, { get: () => {
      reads += 1; store.close(); return member === "name" ? "source-closing" : module.resources;
    } });
    assert.throws(() => facet[method](snapshot, spec), { code: "observation.store.closed" });
    assert.equal(reads, 1); assert.equal(liveSubscriptions(facet), 0);
    await delivered({ stores: [facet] });
    assert.equal(calls, 0); assert.equal(liveSubscriptions(facet), 0); assert.deepEqual(reports, []);
    assert.equal(store.read(["value"]).values.value, 1);
  });
}
