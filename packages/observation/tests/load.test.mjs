// Archived P/R semantic probes, ported to the public package build and real resource scopes.
import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import { createServer, request } from "node:http";
import { createStore, ObservationError } from "../dist/index.js";
import { asyncDetection, delivered, liveSubscriptions, settled } from "../dist/testing.js";
import { world, createScope, scoped, codeOf, debtsOf, deferred, tick, settle, follow, startLoad,
  stubbornLoader, cooperativeLoader, regionLoad, stats, pendingWork, MAX_CASCADE_DEPTH } from "./support/world.mjs";

test("T32 [P6] load: one active and one pending run; a stale result never publishes", async () => {
    const { store, facet, module } = world();
    const load = stubbornLoader();
    startLoad(facet, module.resources, ["region"], "catalog", load.handlers);
    await settle();
    assert.equal(load.calls.length, 1);
    let maxPending = 0;
    for (let i = 1; i <= 100; i += 1) {
        store.set({ region: `r${i}` });
        await tick(); // one delivery per change: the pending slot is replaced 100 times
        maxPending = Math.max(maxPending, stats(store).loadsPending);
    }
    assert.equal(maxPending, 1);
    assert.equal(load.calls.length, 1, "no second run while the first is active");
    assert.equal(load.calls[0]?.signal.aborted, true, "the superseded run is aborted");
    load.calls[0]?.gate.resolve("result for r0");
    await settle();
    assert.equal(load.calls.length, 2, "only the newest change ran");
    assert.equal(load.calls[1]?.region, "r100");
    load.calls[1]?.gate.resolve("result for r100");
    await settle();
    assert.deepEqual(load.published, ["result for r100"], "every publication is recorded: the stale one never appeared");
    await module.control.close();
});

test("T36 [P11] closing the subscriber scope during a cooperative load: complete, no debts, nothing published", async () => {
    const { facet, module } = world();
    const load = cooperativeLoader();
    startLoad(facet, module.resources, ["region"], "catalog", load.handlers);
    await settle();
    const report = await module.control.close();
    assert.equal(report.complete, true);
    assert.deepEqual(debtsOf(report), []);
    assert.equal(load.calls[0]?.aborted, true);
    await settle();
    assert.deepEqual(load.published, [], "an aborted run reports nothing");
});

test("T36 [P12] a load that ignores abort: escalate gives a failed debt with a code; a retry completes", async () => {
    const { facet, module } = world();
    const load = stubbornLoader();
    startLoad(facet, module.resources, ["region"], "catalog", load.handlers);
    await settle();
    const escalate = new AbortController();
    const closing = module.control.close({ escalate: escalate.signal });
    escalate.abort();
    const report = await closing;
    assert.equal(report.complete, false);
    assert.deepEqual(debtsOf(report), [
        { path: "host/module/load:catalog/drain", state: "failed", code: "observation.load.still-running" },
    ]);
    load.calls[0]?.gate.resolve("late");
    await settle();
    assert.deepEqual(load.published, [], "a late result after close is dropped");
    const retry = await module.control.close();
    assert.equal(retry.complete, true);
});

test("T36 [P13] a load that ignores abort: abandon gives a pending debt and settled: false", async () => {
    const { facet, module } = world();
    const load = stubbornLoader();
    startLoad(facet, module.resources, ["region"], "catalog", load.handlers);
    await settle();
    const abandon = new AbortController();
    const closing = module.control.close({ abandon: abandon.signal });
    await settle();
    abandon.abort();
    const report = await closing;
    assert.equal(report.settled, false);
    assert.deepEqual(debtsOf(report), [{ path: "host/module/load:catalog/drain", state: "pending", code: undefined }]);
    load.calls[0]?.gate.resolve("late");
    const final = await module.control.close();
    assert.equal(final.complete, true);
});

test("T45 [P14] store.close() during a load aborts it; the drain stays in the subscriber scope", async () => {
    const { store, facet, module, owner, reports } = world();
    const load = stubbornLoader();
    startLoad(facet, module.resources, ["region"], "catalog", load.handlers);
    await settle();
    store.close();
    assert.equal(load.calls[0]?.signal.aborted, true);
    assert.equal(stats(store).live, 0);
    assert.deepEqual(reports.map((r) => codeOf(r.cause)), ["observation.source.closed"]);
    load.calls[0]?.gate.resolve("late");
    await settle();
    assert.deepEqual(load.published, []);
    const moduleReport = await module.control.close();
    assert.equal(moduleReport.complete, true);
    const ownerReport = await owner.control.close();
    assert.equal(ownerReport.complete, true, "store close is idempotent at the owner's LIFO slot");
});

test("T32 [P17] load: onLoading when a newer run is queued; a result that lands after set() is dropped", async () => {
    const { store, facet, module } = world();
    const events = [];
    const gates = [];
    startLoad(facet, module.resources, ["region"], "catalog", {
        loader: (next) => new Promise((resolve) => { gates.push({ region: next.values.region, release: resolve }); }),
        onLoading: (snapshot) => { events.push(`loading ${String(snapshot.values.region)}`); return undefined; },
        onResult: (result) => { events.push(`result ${String(result)}`); return undefined; },
        onError: (cause) => { events.push(`error ${String(cause)}`); return undefined; },
    });
    assert.deepEqual(events, [], "nothing is called back synchronously");
    await settle();
    assert.deepEqual(events, ["loading r0"], "the first run is announced");
    gates[0]?.release("r0 models");
    await settle();
    store.set({ region: "jp" });
    await settle();
    assert.deepEqual(events.slice(1), ["result r0 models", "loading jp"]);
    store.set({ region: "br" }); // br chosen; jp still running and not yet aborted
    gates[1]?.release("jp models"); // jp lands in the same task, before the delivery of br
    await settle();
    assert.deepEqual(events.slice(3), ["loading br"], "the jp result is dropped against the store revision");
    gates[2]?.release("br models");
    await settle();
    assert.deepEqual(events.slice(4), ["result br models"]);
    // A commit may also land after publication was queued but before its delivery task. Comparing only lastOffered
    // would publish the old result ahead of the newer load's flush.
    store.set({ region: "au" });
    await settle();
    assert.equal(pendingWork([store]).flushes, 0, "the au load is running with no delivery queued");
    gates[3]?.release("au models");
    await Promise.resolve();
    assert.equal(pendingWork([store]).flushes, 1, "the au publication is queued before ca is committed");
    store.set({ region: "ca" });
    await settle();
    assert.deepEqual(events.slice(5), ["loading au", "loading ca"], "queued publication rechecks the store revision");
    gates[4]?.release("ca models");
    await settle();
    assert.deepEqual(events.slice(7), ["result ca models"]);
    await module.control.close();
});

test("T32 [P24] pagination as a loop inside one loader passes 100 pages", async () => {
    const { facet, module } = world();
    let rows = [];
    startLoad(facet, module.resources, ["region"], "pages", {
        loader: async () => { const all = []; for (let page = 0; page < 100; page += 1) {
            await Promise.resolve();
            all.push(page);
        } return all; },
        onLoading: () => undefined, onResult: (result) => { rows = result; return undefined; }, onError: () => undefined,
    });
    await settled();
    assert.equal(rows.length, 100);
    await module.control.close();
});

describe("T36 [R6] closing while a load is still running", () => {
    test("T36 [R6] subscriber scope closes, loader honors abort: abort reaches the loader, complete, no debts", async () => {
        const { facet, module } = world({ level: "info", region: "eu", theme: "light" });
        const load = regionLoad(facet, module.resources, false);
        await settle();
        const report = await module.control.close();
        assert.equal(load.runs[0]?.signal.aborted, true);
        assert.equal(report.complete, true);
        assert.deepEqual(debtsOf(report), []);
        await settle();
        assert.deepEqual(load.published, [], "an aborted run reports neither result nor error");
    });
    test("T36 [R6] subscriber scope closes, loader ignores abort, Host escalates: failed debt with a code; a retry completes", async () => {
        const { facet, module } = world({ level: "info", region: "eu", theme: "light" });
        const load = regionLoad(facet, module.resources, true);
        await settle();
        const escalate = new AbortController();
        const closing = module.control.close({ escalate: escalate.signal });
        assert.equal(load.runs[0]?.signal.aborted, true, "abort reaches the loader when the close starts");
        escalate.abort();
        const report = await closing;
        assert.equal(report.complete, false);
        assert.deepEqual(debtsOf(report), [{ path: "host/module/load:catalog/drain", state: "failed", code: "observation.load.still-running" }]);
        load.runs[0]?.release("late");
        await settle();
        assert.deepEqual(load.published, []);
        assert.equal((await module.control.close()).complete, true);
    });
    test("T36 [R6] subscriber scope closes, loader ignores abort, Host abandons: pending debt, settled false", async () => {
        const { facet, module } = world({ level: "info", region: "eu", theme: "light" });
        const load = regionLoad(facet, module.resources, true);
        await settle();
        const abandon = new AbortController();
        const closing = module.control.close({ abandon: abandon.signal });
        await settle();
        abandon.abort();
        const report = await closing;
        assert.equal(report.settled, false);
        assert.deepEqual(debtsOf(report), [{ path: "host/module/load:catalog/drain", state: "pending", code: undefined }]);
        load.runs[0]?.release("late");
        assert.equal((await module.control.close()).complete, true);
    });
    test("T36 [R6] store.close() during a load: abort reaches the loader; the owner closes clean; the subscriber's drain owns the debt", async () => {
        const { store, facet, module, owner, reports } = world({ level: "info", region: "eu", theme: "light" });
        const load = regionLoad(facet, module.resources, true);
        await settle();
        store.close();
        assert.equal(load.runs[0]?.signal.aborted, true);
        assert.equal(stats(store).live, 0);
        assert.deepEqual(reports.map((r) => codeOf(r.cause)), ["observation.source.closed"]);
        const ownerReport = await owner.control.close();
        assert.equal(ownerReport.complete, true, "store close is synchronous and leaves no debt in the owner's scope");
        const escalate = new AbortController();
        escalate.abort();
        const moduleReport = await module.control.close({ escalate: escalate.signal });
        assert.deepEqual(debtsOf(moduleReport), [{ path: "host/module/load:catalog/drain", state: "failed", code: "observation.load.still-running" }]);
        load.runs[0]?.release("late");
        await settle();
        assert.deepEqual(load.published, []);
        assert.equal((await module.control.close()).complete, true);
    });
});

describe("T32 [R7] load never shows data of older values while newer values load", () => {
    test("T32 [R7] onLoading on queue; a result that lands after set() but before delivery is dropped (store revision)", async () => {
        const { store, facet, module } = world({ level: "info", region: "eu", theme: "light" });
        const shown = []; // every state the module ever published, so a transient stale state is visible
        const gates = [];
        facet.load(facet.read(["region"]), {
            resources: module.resources, name: "catalog",
            loader: ({ values }) => new Promise((resolve) => { gates.push({ region: values.region, release: resolve }); }),
            onLoading: () => { shown.push("loading"); },
            onResult: (models, { values }) => { shown.push(`ready ${values.region}: ${models}`); },
            onError: () => undefined,
        });
        await settle();
        gates[0]?.release("eu models");
        await settle();
        store.set({ region: "us" });
        await settle();
        store.set({ region: "br" });
        gates[1]?.release("us models"); // lands after set(br), before its delivery
        await settle();
        gates[2]?.release("br models");
        await settle();
        assert.deepEqual(shown, ["loading", "ready eu: eu models", "loading", "loading", "ready br: br models"], "eu is never shown while us loads, and the late us result is never shown");
        // Recheck the independent publication task too: its source can change after the loader settled.
        store.set({ region: "au" });
        await settle();
        assert.equal(pendingWork([store]).flushes, 0, "the au load is running with no delivery queued");
        gates[3]?.release("au models");
        await Promise.resolve();
        assert.equal(pendingWork([store]).flushes, 1, "the au publication is queued before ca is committed");
        store.set({ region: "ca" });
        await settle();
        assert.deepEqual(shown.slice(5), ["loading", "loading"], "the queued au result is dropped before ca is delivered");
        gates[4]?.release("ca models");
        await settle();
        assert.deepEqual(shown.slice(7), ["ready ca: ca models"]);
        await module.control.close();
    });
});

describe("T32 T45 T58 T71 [R17] scheduled load publication stays current and is visible to testing waits", () => {
    for (const kind of ["onResult", "onError"]) {
        test(`T32 T45 T58 T71 [R17] ${kind}: a commit before its queued delivery drops the old outcome`, async () => {
            const { host, module, store, facet } = world({ cursor: 0 });
            const loading = [];
            const published = [];
            let finish;
            facet.load(facet.read(["cursor"]), {
                resources: module.resources, name: "consumer/page",
                loader: ({ values }) => new Promise((resolve, reject) => {
                    const complete = () => { if (kind === "onError")
                        reject(new Error("fetch failed"));
                    else
                        resolve(values.cursor); };
                    if (values.cursor === 0)
                        finish = complete;
                    else
                        complete();
                }),
                onLoading: ({ values }) => { loading.push(values.cursor); },
                onResult: (_result, { values }) => { published.push(values.cursor); },
                onError: (_cause, { values }) => { published.push(values.cursor); },
            });
            try {
                await delivered({ stores: [facet] });
                finish();
                await Promise.resolve(); // the loader has settled and queued its callback; its delivery has not run
                store.set({ cursor: 1 });
                await settled({ stores: [facet] });
                assert.deepEqual(loading, [0, 1]);
                assert.deepEqual(published, [1]);
            }
            finally {
                await host.control.close();
            }
        });
        test(`T32 T45 T58 T71 [R17] ${kind}: closing before publication drops it and drains the lane`, async () => {
            const { host, module, facet } = world({ cursor: 0 });
            const published = [];
            let finish;
            facet.load(facet.read(["cursor"]), {
                resources: module.resources, name: "consumer/page",
                loader: () => new Promise((resolve, reject) => {
                    finish = () => { if (kind === "onError")
                        reject(new Error("fetch failed"));
                    else
                        resolve(1); };
                }),
                onLoading: () => undefined,
                onResult: (value) => { published.push(value); },
                onError: (cause) => { published.push(cause); },
            });
            try {
                await delivered({ stores: [facet] });
                finish();
                await Promise.resolve();
                const report = await module.control.close();
                await delivered({ stores: [facet] });
                await settled();
                assert.equal(report.complete, true);
                assert.deepEqual(published, []);
            }
            finally {
                await host.control.close();
            }
        });
        test(`T32 T45 T58 T71 [R17] ${kind}: escalation never turns a completed loader into a drain debt`, async () => {
            const { host, module, facet } = world({ cursor: 0 });
            let callbacks = 0;
            let finish;
            facet.load(facet.read(["cursor"]), {
                resources: module.resources, name: "consumer/page",
                loader: () => new Promise((resolve, reject) => {
                    finish = () => { if (kind === "onError")
                        reject(new Error("fetch failed"));
                    else
                        resolve(1); };
                }),
                onLoading: () => undefined,
                onResult: () => { callbacks += 1; },
                onError: () => { callbacks += 1; },
            });
            try {
                await delivered({ stores: [facet] });
                finish();
                await Promise.resolve(); // the outcome is queued for a later task
                const closing = module.control.close({ escalate: AbortSignal.abort() });
                // Host cleanup has Promise continuations and synchronous work before the loop returns to its timer phase.
                for (let step = 0; step < 12; step += 1)
                    await Promise.resolve();

                const report = await closing;
                await settled({ stores: [facet] });
                assert.equal(callbacks, 0);
                assert.equal(report.complete, true);
                assert.deepEqual(report.debts, [], "only an actual unfinished loader can produce observation.load.still-running");
            }
            finally {
                await host.control.close();
            }
        });
    }
    for (const filtered of [true, false]) {
        test(`T32 T45 T58 T71 [R17] delivered(${filtered ? "{ stores }" : ""}) includes queued callbacks and their microtasks`, async () => {
            const { host, module, facet } = world({ cursor: 0 });
            let finish;
            let shown;
            facet.load(facet.read(["cursor"]), {
                resources: module.resources, name: "consumer/page",
                loader: () => new Promise((resolve) => { finish = resolve; }),
                onLoading: () => undefined, onError: () => undefined,
                onResult: (value) => { queueMicrotask(() => { queueMicrotask(() => { shown = value; }); }); },
            });
            try {
                await delivered({ stores: [facet] });
                // The wait's first task is queued before publication: it must inspect pending publication, not just dirty stores.
                const waiting = delivered(filtered ? { stores: [facet] } : {});
                finish(7);
                await waiting;
                assert.equal(shown, 7);
                await settled({ stores: [facet] });
            }
            finally {
                await host.control.close();
            }
        });
    }
});

for (const hook of ["onLoading", "onResult", "onError"]) for (const failure of ["throw", "scalar"]) {
  test(`T40 T114 [R18] ${hook} ${failure} preserves attribution, sibling and later delivery`, async () => {
    const { store, facet, module, reports } = world({ a: 0 });
    let calls = 0; let healthy = 0; const sentinel = new Error("callback failed");
    const callbacks = {
      loader: ({ values }) => { if (hook === "onError") throw new Error("query failed"); return values.a; },
      onLoading: () => undefined, onResult: () => undefined, onError: () => undefined,
      [hook]: () => { calls += 1; if (calls > 1) return undefined; if (failure === "throw") throw sentinel; return 1; },
    };
    facet.load(facet.read(["a"]), { resources: module.resources, name: "offender", ...callbacks });
    facet.watch(facet.read(["a"]), { resources: module.resources, name: "healthy", onChange: () => { healthy += 1; } });
    store.set({ a: 1 }); await settled();
    assert.equal(calls, 1); assert.equal(healthy, 1); assert.equal(reports.length, 1);
    assert.equal(reports[0].subscription, "offender"); assert.equal(reports[0].revision, 1);
    if (failure === "throw") assert.equal(reports[0].cause, sentinel);
    else assert.equal(codeOf(reports[0].cause), "observation.callback.returned-value");
    store.set({ a: 2 }); await settled(); assert.equal(calls, 2); assert.equal(healthy, 2);
  });
}

test("T31 T65 T117 [R21] load uses newest values, only selected keys, and an owned signal", async () => {
  const { store, facet, module } = world({ status: "ready", count: 0 });
  const snapshot = facet.read(["status"]); store.set({ status: "loading" });
  const seen = []; let signal;
  facet.load(snapshot, { resources: module.resources, name: "query",
    loader: (next, context) => { signal = context.signal; seen.push(["loader", next.values]); return 4; },
    onLoading: next => { seen.push(["loading", next.values]); },
    onResult: (result, next) => { seen.push([result, next.values]); }, onError: () => undefined,
  });
  await settled();
  assert.deepEqual(seen, [["loading", { status: "loading" }], ["loader", { status: "loading" }], [4, { status: "loading" }]]);
  assert.ok(signal instanceof AbortSignal); assert.notEqual(signal, module.resources.signal);
});

test("T32 T119 [R23] a pending obsolete startup is skipped before newer flush", async () => {
  const { store, facet, module } = world({ a: 0 });
  const gate = deferred(); const calls = []; const published = [];
  facet.load(facet.read(["a"]), { resources: module.resources, name: "query",
    loader: ({ values }) => { calls.push(values.a); return values.a === 0 ? gate.promise : values.a; },
    onLoading: () => undefined, onResult: value => { published.push(value); }, onError: cause => { throw cause; },
  });
  await delivered(); store.set({ a: 1 }); await delivered();
  assert.equal(stats(facet).loadsPending, 1);
  store.set({ a: 2 }); gate.resolve(0);
  await settled();
  assert.deepEqual(calls, [0, 2]); assert.deepEqual(published, [2]);
  assert.equal(stats(facet).loadsActive + stats(facet).loadsPending, 0);
});

test("T31 T119 [R23] first startup is rechecked after its microtask", async () => {
  const { store, facet, module } = world({ a: 0, b: 0 }); const calls = []; const published = [];
  facet.load(facet.read(["a"]), { resources: module.resources, name: "query",
    loader: ({ values }) => { calls.push(values.a); return values.a; },
    onLoading: () => undefined, onResult: value => { published.push(value); }, onError: cause => { throw cause; },
  });
  facet.watch(facet.read(["b"]), { resources: module.resources, name: "invalidate", onChange: () => { store.set({ a: 1 }); } });
  store.set({ b: 1 }); await settled();
  assert.deepEqual(calls, [1]); assert.deepEqual(published, [1]);
});

for (const source of ["callback", "reporter"]) {
  test(`T43 T45 T119 [R23] onLoading close by ${source} cannot reacquire pending work`, async () => {
    const host = createScope({ name: "close-boundary" }); const module = host.resources.child({ name: "subscriber" });
    let closing; const reports = [];
    const store = createStore({ a: 0 }, { name: "settings", resources: host.resources, reportError: report => {
      reports.push(report); if (source === "reporter") closing = module.control.close();
    } });
    const facet = store.readonly(); const gate = deferred(); const calls = []; const published = [];
    facet.load(facet.read(["a"]), { resources: module.resources, name: "query",
      loader: ({ values }) => { calls.push(values.a); return gate.promise; },
      onLoading: ({ values }) => { if (values.a === 1) { if (source === "reporter") throw new Error("close"); closing = module.control.close(); } },
      onResult: value => { published.push(value); }, onError: cause => { published.push(cause); },
    });
    await delivered(); store.set({ a: 1 }); await delivered();
    assert.equal(liveSubscriptions(facet), 0); assert.equal(stats(facet).loadsPending, 0); assert.equal(stats(facet).loadsActive, 1);
    gate.resolve(0); const report = await closing; await settled();
    assert.equal(report.complete, true); assert.deepEqual(report.debts, []);
    assert.deepEqual(calls, [0]); assert.deepEqual(published, []); assert.equal(stats(facet).loadsActive, 0);
  });
}
