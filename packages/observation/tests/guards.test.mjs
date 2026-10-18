// Archived P/R semantic probes, ported to the public package build and real resource scopes.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createServer, request } from "node:http";
import { createStore } from "../dist/index.js";
import { delivered, settled } from "../dist/testing.js";
import { world, createScope, codeOf, deferred, settle, follow, startLoad, stats, MAX_CASCADE_DEPTH } from "./support/world.mjs";

test("T50 T51 T54 [P18] echo: a handler that changes a key it follows fails at the first delivery, reported and thrown", async () => {
    const { store, facet, module, reports } = world();
    let calls = 0;
    follow(facet, module.resources, ["a"], "echo", (next) => {
        calls += 1;
        if (calls <= 1000)
            store.set({ a: Number(next.values.a) + 1 }); // the probe's own stop if the guard is missing
        return undefined;
    });
    store.set({ a: 1 });
    await settle();
    assert.equal(calls, 1, "stopped at the first round, not after 64");
    assert.equal(store.read(["a"]).values.a, 1, "the echoing commit changed nothing");
    assert.deepEqual(reports.map((r) => [r.subscription, codeOf(r.cause)]), [["echo", "observation.delivery.echo"]], "reported once");
    // Writing another key of the same store, or another store, is not an echo.
    follow(facet, module.resources, ["region"], "derive-b", (next) => { store.set({ b: String(next.values.region).length }); return undefined; });
    store.set({ region: "abcd" });
    await settle();
    assert.equal(store.read(["b"]).values.b, 4);
    await module.control.close();
});

test("T52 T53 [P19] cascade guard: shared across stores (ping-pong), legitimate chains pass, coalescing keeps the largest depth", async () => {
    const first = world();
    const second = world();
    let calls = 0;
    follow(first.facet, first.module.resources, ["a"], "ping", (next) => { calls += 1; if (calls <= 1000)
        second.store.set({ a: Number(next.values.a) + 1 }); return undefined; });
    follow(second.facet, second.module.resources, ["a"], "pong", (next) => { calls += 1; if (calls <= 1000)
        first.store.set({ a: Number(next.values.a) + 1 }); return undefined; });
    first.store.set({ a: 1 });
    await settle();
    assert.equal(calls, MAX_CASCADE_DEPTH + 1, "one bound for the whole chain across both stores");
    assert.equal(first.reports.length + second.reports.length, 1);
    // A chain of 20 derived stores, each set by a handler of the previous one, completes.
    const chain = Array.from({ length: 21 }, () => world());
    chain.slice(0, 20).forEach((link, i) => {
        follow(link.facet, link.module.resources, ["a"], `link-${i}`, (next) => { chain[i + 1]?.store.set({ a: next.values.a }); return undefined; });
    });
    chain[0]?.store.set({ a: 42 });
    await settle();
    assert.equal(chain[20]?.store.read(["a"]).values.a, 42);
    assert.equal(chain.reduce((n, link) => n + link.reports.length, 0), 0);
    // 10 000 commits at depth 0 coalesce into one delivery at depth 0, not at depth 10 000.
    const burst = world();
    let echoes = 0;
    follow(burst.facet, burst.module.resources, ["a"], "burst", (next) => { echoes += 1; if (echoes === 1)
        burst.store.set({ b: Number(next.values.a) }); return undefined; });
    for (let i = 1; i <= 10_000; i += 1)
        burst.store.set({ a: i });
    await settle();
    assert.equal(burst.reports.length, 0);
    assert.equal(burst.store.read(["b"]).values.b, 10_000);
});

test("T51 T57 [P22] asynchronous echo is caught at the first round: async command, microtask, loader body (Node)", async () => {
    const { store, facet, module, reports, host } = world();
    const thrown = [];
    // C1: an async command called from a handler
    const requestA = async (a) => { await Promise.resolve(); store.set({ a }); return "accepted"; };
    let c1 = 0;
    follow(facet, module.resources, ["a"], "c1", (next) => { c1 += 1; if (c1 <= 1000)
        requestA(Number(next.values.a) + 1).catch((e) => { thrown.push(e); }); return undefined; });
    store.set({ a: 1 });
    await settle();
    await settle();
    assert.equal(c1, 1);
    // C2: queueMicrotask from a handler
    const second = host.resources.child({ name: "second" });
    let c2 = 0;
    follow(facet, second.resources, ["b"], "c2", (next) => {
        c2 += 1;
        if (c2 <= 1000)
            queueMicrotask(() => { try {
                store.set({ b: Number(next.values.b) + 1 });
            }
            catch (e) {
                thrown.push(e);
            } });
        return undefined;
    });
    store.set({ b: 1 });
    await settle();
    assert.equal(c2, 1);
    // C10: the loader body moves the key the load follows
    let fetches = 0;
    const errors = [];
    startLoad(facet, module.resources, ["region"], "c10", {
        loader: async (next) => { fetches += 1; await Promise.resolve(); if (fetches <= 1000)
            store.set({ region: `${String(next.values.region)}+` }); return next.values.region; },
        onLoading: () => undefined, onResult: () => undefined, onError: (cause) => { errors.push(cause); return undefined; },
    });
    await settle();
    await settle();
    assert.equal(fetches, 1);
    assert.deepEqual(errors.map(codeOf), ["observation.delivery.echo"], "the loader's own failure reaches its onError");
    assert.deepEqual(thrown.map(codeOf), ["observation.delivery.echo", "observation.delivery.echo"]);
    assert.deepEqual(reports.map((r) => [r.subscription, codeOf(r.cause)]), [["c1", "observation.delivery.echo"], ["c2", "observation.delivery.echo"], ["c10", "observation.delivery.echo"]]);
    await module.control.close();
    await second.control.close();
});

test("T53 [P23] an asynchronous ping-pong across two stores stops at 64 steps (Node)", async () => {
    const first = world();
    const second = world();
    let calls = 0;
    const thrown = [];
    const command = (target) => async (a) => { await Promise.resolve(); target.set({ a }); };
    const toSecond = command(second.store);
    const toFirst = command(first.store);
    follow(first.facet, first.module.resources, ["a"], "ping", (next) => { calls += 1; if (calls <= 1000)
        toSecond(Number(next.values.a) + 1).catch((e) => { thrown.push(e); }); return undefined; });
    follow(second.facet, second.module.resources, ["a"], "pong", (next) => { calls += 1; if (calls <= 1000)
        toFirst(Number(next.values.a) + 1).catch((e) => { thrown.push(e); }); return undefined; });
    first.store.set({ a: 1 });
    for (let round = 0; round < 3; round += 1)
        await settle();
    assert.equal(calls, MAX_CASCADE_DEPTH + 1);
    assert.deepEqual(thrown.map(codeOf), ["observation.delivery.cascade"]);
    assert.equal(first.reports.length + second.reports.length, 1);
});

describe("T50 T51 T53 T57 [R9] echo and cascade guards", () => {
    test("T50 T51 T53 T57 [R9] a handler that changes the key it follows: one delivery, observation.delivery.echo reported once", async () => {
        const { store, facet, module, reports } = world({ level: "0", region: "eu", theme: "light" });
        let calls = 0;
        facet.watch(facet.read(["level"]), {
            resources: module.resources, name: "m/echo",
            onChange: ({ values }) => { calls += 1; if (calls <= 1000)
                store.set({ level: String(Number(values.level) + 1) }); },
        });
        store.set({ level: "1" });
        await settle();
        assert.equal(calls, 1);
        assert.deepEqual(reports.map((r) => [r.subscription, codeOf(r.cause)]), [["m/echo", "observation.delivery.echo"]]);
    });
    test("T50 T51 T53 T57 [R9] C1, C2, C10: async command, queueMicrotask and loader body echo are caught at the first round (Node)", async () => {
        const { store, facet, module, reports } = world({ level: 0, cursor: 0 });
        const thrown = [];
        const requestLevel = async (level) => { await Promise.resolve(); store.set({ level }); return "accepted"; };
        let c1 = 0;
        facet.watch(facet.read(["level"]), { resources: module.resources, name: "m/echo-async", onChange: ({ values }) => {
                c1 += 1;
                if (c1 <= 1000)
                    requestLevel(values.level + 1).catch((e) => { thrown.push(e); });
            } });
        let c2 = 0;
        facet.watch(facet.read(["level"]), { resources: module.resources, name: "m/echo-micro", onChange: ({ values }) => {
                c2 += 1;
                if (c2 <= 1000)
                    queueMicrotask(() => { try {
                        store.set({ level: values.level + 10 });
                    }
                    catch (e) {
                        thrown.push(e);
                    } });
            } });
        let fetches = 0;
        facet.load(facet.read(["cursor"]), {
            resources: module.resources, name: "m/pages",
            loader: async ({ values }) => { fetches += 1; await Promise.resolve(); if (fetches <= 1000)
                store.set({ cursor: values.cursor + 1 }); return values.cursor; },
            onLoading: () => undefined, onResult: () => undefined, onError: (cause) => { thrown.push(cause); },
        });
        store.set({ level: 1 });
        for (let round = 0; round < 3; round += 1)
            await settle();
        assert.deepEqual([c1, c2, fetches], [1, 1, 1]);
        assert.ok(thrown.length === 3 && thrown.every((e) => codeOf(e) === "observation.delivery.echo"));
        assert.deepEqual(reports.map((r) => [r.subscription, codeOf(r.cause)]).sort(), [["m/echo-async", "observation.delivery.echo"], ["m/echo-micro", "observation.delivery.echo"], ["m/pages", "observation.delivery.echo"]]);
        await module.control.close();
    });
    test("T50 T51 T53 T57 [R9] an asynchronous ping-pong across two stores through commands stops at 65 deliveries (Node)", async () => {
        const one = world({ level: "0", region: "eu", theme: "light" });
        const two = world({ level: "0", region: "eu", theme: "light" });
        let calls = 0;
        const thrown = [];
        const bump = (target) => async (level) => { await Promise.resolve(); target.set({ level }); };
        const toTwo = bump(two.store);
        const toOne = bump(one.store);
        one.facet.watch(one.facet.read(["level"]), { resources: one.module.resources, name: "one/ping", onChange: ({ values }) => {
                calls += 1;
                if (calls <= 1000)
                    toTwo(String(Number(values.level) + 1)).catch((e) => { thrown.push(e); });
            } });
        two.facet.watch(two.facet.read(["level"]), { resources: two.module.resources, name: "two/pong", onChange: ({ values }) => {
                calls += 1;
                if (calls <= 1000)
                    toOne(String(Number(values.level) + 1)).catch((e) => { thrown.push(e); });
            } });
        one.store.set({ level: "1" });
        for (let round = 0; round < 3; round += 1)
            await settle();
        assert.equal(calls, MAX_CASCADE_DEPTH + 1);
        assert.deepEqual(thrown.map(codeOf), ["observation.delivery.cascade"]);
        assert.equal(one.reports.length + two.reports.length, 1);
    });
});

describe("T58 T59 T60 [R13] the delivery context ends with the delivery task (M1): no false echo or cascade from work that outlives it", () => {
    const httpGet = async (server) => {
      if (!server.listening) await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
      return new Promise((resolve, reject) => {
        const port = server.address().port;
        request({ hostname: "127.0.0.1", port, path: "/" }, res => {
          let body = "";
          res.on("data", chunk => { body += String(chunk); });
          res.on("end", () => { resolve(body); });
        }).on("error", reject).end();
      });
    };
    test("T58 T59 T60 [R13] heartbeat: a timer the owner starts from a command called by a handler writes freely", { timeout: 5000 }, async (t) => {
        const reports = [];
        const host = createScope({ name: "host" });
        const connection = createStore({ server: "a", status: "idle" }, { name: "connection", resources: host.resources, reportError: (r) => { reports.push(r); return undefined; } });
        let heartbeat;
        t.after(() => { clearInterval(heartbeat); });
        let beats = 0;
        const enough = deferred();
        const ensureConnected = () => {
            heartbeat ??= setInterval(() => { beats += 1; connection.set({ status: `alive ${beats}` }); if (beats >= 5) enough.resolve(); }, 5); // the owner's own timer
            return "accepted";
        };
        const facet = connection.readonly();
        const ui = host.resources.child({ name: "ui" });
        facet.watch(facet.read(["server", "status"]), { resources: ui.resources, name: "ui/connection", onChange: () => { ensureConnected(); } });
        connection.set({ server: "b" });
        await enough.promise;
        clearInterval(heartbeat);
        assert.ok(beats >= 5, `the heartbeat ran (${beats} beats)`);
        assert.deepEqual(reports, [], "no false echo from the owner's timer");
        await host.control.close();
    });
    test("T58 T59 T60 [R13] server: requests to a server restarted by a handler are independent user actions", async (t) => {
        const reports = [];
        const host = createScope({ name: "host" });
        const settings = createStore({ port: 1, motd: "hi" }, { name: "settings", resources: host.resources, reportError: (r) => { reports.push(r); return undefined; } });
        const requestPort = (port) => { settings.set({ port }); return "accepted"; }; // the owner's command
        let server;
        t.after(() => { server?.closeAllConnections(); server?.close(); });
        let served = 0;
        const start = () => {
            server?.close();
            server = createServer((_req, res) => {
                served += 1;
                try {
                    requestPort(served + 1);
                    res.end("ok");
                }
                catch (error) {
                    res.end(`failed: ${String(codeOf(error))}`);
                }
            });
            server.listen(0, "127.0.0.1");
        };
        start();
        const facet = settings.readonly();
        const module = host.resources.child({ name: "server-module" });
        facet.watch(facet.read(["port"]), { resources: module.resources, name: "server/port", onChange: () => { start(); } });
        const results = [];
        for (let i = 0; i < 30; i += 1) {
            results.push(await httpGet(server));
            await delivered();
        }
        server?.close();
        assert.deepEqual(results.filter((r) => r !== "ok"), [], "every admin request succeeded");
        assert.deepEqual(reports, []);
        await host.control.close();
    });
    test("T58 T59 T60 [R13] depth: independent requests through a restarted server do not accumulate cascade depth", async (t) => {
        const reports = [];
        const host = createScope({ name: "host" });
        const report = (r) => { reports.push(r); return undefined; };
        const config = createStore({ listen: 0 }, { name: "config", resources: host.resources, reportError: report });
        const hits = createStore({ hits: 0 }, { name: "stats", resources: host.resources, reportError: report });
        let server;
        t.after(() => { server?.closeAllConnections(); server?.close(); });
        const start = () => {
            server?.close();
            server = createServer((_req, res) => {
                try {
                    hits.set({ hits: hits.read(["hits"]).values.hits + 1 });
                    res.end("ok");
                }
                catch (error) {
                    res.end(`failed: ${String(codeOf(error))}`);
                }
            });
            server.listen(0, "127.0.0.1");
        };
        start();
        const module = host.resources.child({ name: "m" });
        const c = config.readonly();
        const h = hits.readonly();
        c.watch(c.read(["listen"]), { resources: module.resources, name: "server/restart", onChange: () => { start(); } });
        h.watch(h.read(["hits"]), { resources: module.resources, name: "config/derive", onChange: ({ values }) => { config.set({ listen: values.hits }); } });
        const results = [];
        for (let i = 0; i < 40; i += 1) {
            results.push(await httpGet(server));
            await delivered();
        }
        await settle();
        server?.close();
        assert.deepEqual(results.filter((r) => r !== "ok"), []);
        assert.deepEqual(reports, [], "no cascade report: depth starts at 0 for every request");
        assert.equal(config.read(["listen"]).values.listen, hits.read(["hits"]).values.hits);
        await host.control.close();
    });
    test("T58 T59 T60 [R13] C4: pagination through a load that advances the cursor it follows fails at the first page", async () => {
        const reports = [];
        const host = createScope({ name: "host" });
        const pages = createStore({ cursor: 0, rows: [] }, { name: "catalog/pages", resources: host.resources, reportError: (r) => { reports.push(r); return undefined; } });
        const facet = pages.readonly();
        const module = host.resources.child({ name: "catalog" });
        let loads = 0;
        facet.load(facet.read(["cursor"]), {
            resources: module.resources, name: "catalog/page",
            loader: async ({ values }) => { loads += 1; return [values.cursor]; },
            onLoading: () => undefined,
            onResult: (rows, { values }) => { if (loads <= 1000)
                pages.set({ rows: [...pages.read(["rows"]).values.rows, ...rows], cursor: values.cursor + 1 }); },
            onError: () => undefined,
        });
        await settled({ stores: [facet] });
        assert.equal(loads, 1);
        assert.deepEqual(reports.map((r) => [r.subscription, codeOf(r.cause)]), [["catalog/page", "observation.delivery.echo"]]);
        await host.control.close();
    });
});

describe("T50 T51 T53 T57 T58 [R16] load result and error callbacks own a complete delivery task", () => {
    for (const kind of ["onResult", "onError"]) {
        for (const continuation of ["synchronous", "microtask", "nested microtasks", "awaited command"]) {
            test(`T50 T51 T53 T57 T58 [R16] ${kind}: ${continuation} echo is rejected at the first result`, async () => {
                const { host, module, store, facet, reports } = world({ cursor: 0 });
                const thrown = [];
                let calls = 0;
                const advance = (cursor) => {
                    calls += 1;
                    if (calls >= 5)
                        return undefined; // keep a broken guard finite, without making the expected result pass
                    const write = () => { try {
                        store.set({ cursor: cursor + 1 });
                    }
                    catch (cause) {
                        thrown.push(cause);
                    } };
                    if (continuation === "synchronous")
                        write();
                    else if (continuation === "microtask")
                        queueMicrotask(write);
                    else if (continuation === "nested microtasks")
                        queueMicrotask(() => { queueMicrotask(() => { queueMicrotask(write); }); });
                    else {
                        const command = async () => { await Promise.resolve(); await Promise.resolve(); write(); };
                        void command(); // the callback itself remains synchronous, as the public type requires
                    }
                    return undefined;
                };
                facet.load(facet.read(["cursor"]), {
                    resources: module.resources, name: "consumer/page",
                    loader: async () => { if (kind === "onError")
                        throw new Error("fetch failed"); return "page"; },
                    onLoading: () => undefined,
                    onResult: (_result, { values }) => { if (kind === "onResult")
                        advance(values.cursor); },
                    onError: (_cause, { values }) => { if (kind === "onError")
                        advance(values.cursor); },
                });
                try {
                    await settled({ stores: [facet] });
                    assert.equal(calls, 1);
                    assert.equal(store.read(["cursor"]).values.cursor, 0);
                    assert.deepEqual(thrown.map(codeOf), ["observation.delivery.echo"]);
                    assert.deepEqual(reports.map((report) => [report.subscription, codeOf(report.cause)]), [["consumer/page", "observation.delivery.echo"]]);
                }
                finally {
                    await host.control.close();
                }
            });
        }
        test(`T50 T51 T53 T57 T58 [R16] ${kind}: a timer started by the callback is a later independent action`, async () => {
            const { host, module, store, facet, reports } = world({ cursor: 0 });
            const thrown = [];
            let calls = 0;
            let timerFinished;
            const timer = new Promise((resolve) => { timerFinished = resolve; });
            const advanceLater = (cursor) => {
                calls += 1;
                if (cursor === 0)
                    setTimeout(() => {
                        try {
                            store.set({ cursor: 1 });
                        }
                        catch (cause) {
                            thrown.push(cause);
                        }
                        timerFinished();
                    }, 0);
                return undefined;
            };
            facet.load(facet.read(["cursor"]), {
                resources: module.resources, name: "consumer/page",
                loader: async () => { if (kind === "onError")
                    throw new Error("fetch failed"); return "page"; },
                onLoading: () => undefined,
                onResult: (_result, { values }) => { if (kind === "onResult")
                    advanceLater(values.cursor); },
                onError: (_cause, { values }) => { if (kind === "onError")
                    advanceLater(values.cursor); },
            });
            try {
                await timer;
                await settled({ stores: [facet] });
                assert.equal(calls, 2);
                assert.equal(store.read(["cursor"]).values.cursor, 1);
                assert.deepEqual(thrown, []);
                assert.deepEqual(reports, []);
            }
            finally {
                await host.control.close();
            }
        });
    }
    test("T50 T51 T53 T57 T58 [R16] a load callback and a watcher preserve cascade depth across stores", async () => {
        const one = world({ cursor: 0 });
        const two = world({ cursor: 0 });
        let attempts = 0;
        const thrown = [];
        const send = (store, cursor) => {
            attempts += 1;
            if (attempts > MAX_CASCADE_DEPTH + 5)
                return undefined;
            try {
                store.set({ cursor });
            }
            catch (cause) {
                thrown.push(cause);
            }
            return undefined;
        };
        one.facet.load(one.facet.read(["cursor"]), {
            resources: one.module.resources, name: "one/load", loader: async ({ values }) => values.cursor,
            onLoading: () => undefined, onError: () => undefined,
            onResult: (cursor) => { queueMicrotask(() => { queueMicrotask(() => { send(two.store, cursor + 1); }); }); },
        });
        two.facet.watch(two.facet.read(["cursor"]), {
            resources: two.module.resources, name: "two/watch",
            onChange: ({ values }) => { send(one.store, values.cursor + 1); },
        });
        try {
            await settled({ stores: [one.facet, two.facet] });
            assert.equal(attempts, MAX_CASCADE_DEPTH + 1);
            assert.deepEqual(thrown.map(codeOf), ["observation.delivery.cascade"]);
            assert.deepEqual([...one.reports, ...two.reports].map((report) => codeOf(report.cause)), ["observation.delivery.cascade"]);
        }
        finally {
            await one.host.control.close();
            await two.host.control.close();
        }
    });
});

async function atDepth(depth, action) {
  const nodes = Array.from({ length: depth + 1 }, () => world({ value: 0 }));
  for (const [index, node] of nodes.entries()) {
    node.facet.watch(node.facet.read(["value"]), { resources: node.module.resources, name: `depth${index}`, onChange: () => {
      if (index === depth) action(); else nodes[index + 1].store.set({ value: 1 });
    } });
  }
  nodes[0].store.set({ value: 1 }); await delivered();
  assert.deepEqual(nodes.flatMap(node => node.reports), []);
}

for (const late of [false, true]) {
  test(`T21 T53 T54 T118 [R22] ${late ? "late" : "pre-attached"} watch chain rejects the first depth-65 commit`, async () => {
    const nodes = Array.from({ length: 71 }, () => world({ value: 0, node: null }));
    const saved = nodes.map(node => node.facet.read(["value"])); const calls = []; const attempted = { data: {} };
    const attach = index => {
      const node = nodes[index];
      node.facet.watch(saved[index], { resources: node.module.resources, name: `watch${index}`, onChange: () => {
        calls.push(index);
        if (index + 1 >= nodes.length) return;
        nodes[index + 1].store.set({ value: 1, node: attempted });
        if (late) attach(index + 1);
      } });
    };
    if (late) attach(0); else for (let i = 0; i < nodes.length; i += 1) attach(i);
    nodes[0].store.set({ value: 1 }); await delivered();
    assert.equal(calls.length, 65); assert.equal(nodes[65].store.read(["value"]).values.value, 0);
    const reports = nodes.flatMap(node => node.reports);
    assert.equal(reports.length, 1); assert.equal(codeOf(reports[0].cause), "observation.delivery.cascade");
  });
}

for (const late of [false, true]) for (const fresh of [false, true]) {
  test(`T53 T118 [R22] load result chain ${late ? "late" : "attached"} ${fresh ? "fresh" : "saved"} keys preserves commit depth`, async () => {
    const nodes = Array.from({ length: 71 }, () => world({ value: 0 }));
    const saved = nodes.map(node => node.facet.read(["value"])); const calls = [];
    const attach = index => {
      const node = nodes[index];
      node.facet.load(fresh ? node.facet.read(["value"]) : saved[index], { resources: node.module.resources, name: `load${index}`,
        loader: ({ values }) => values.value, onLoading: () => undefined, onError: cause => { throw cause; },
        onResult: result => {
          if (result === 0) return;
          calls.push(index);
          if (index + 1 >= nodes.length) return;
          nodes[index + 1].store.set({ value: 1 });
          if (late) attach(index + 1);
        },
      });
    };
    if (late) attach(0); else for (let i = 0; i < nodes.length; i += 1) attach(i);
    await settled(); nodes[0].store.set({ value: 1 }); await settled();
    assert.equal(calls.length, 65); assert.equal(nodes[65].store.read(["value"]).values.value, 0);
    assert.deepEqual(nodes.flatMap(node => node.reports).map(report => codeOf(report.cause)), ["observation.delivery.cascade"]);
  });
}

test("T53 T118 [R22] onLoading set-then-load keeps its increment", async () => {
  const nodes = Array.from({ length: 71 }, () => world({ value: 0 })); let calls = 0;
  const attach = index => {
    const node = nodes[index];
    node.facet.load(node.facet.read(["value"]), { resources: node.module.resources, name: `load${index}`,
      loader: ({ values }) => values.value, onResult: () => undefined, onError: () => undefined,
      onLoading: () => { calls += 1; if (index + 1 < nodes.length) { nodes[index + 1].store.set({ value: 1 }); attach(index + 1); } },
    });
  };
  attach(0); await settled(); assert.equal(calls, 65);
  assert.deepEqual(nodes.flatMap(node => node.reports).map(report => codeOf(report.cause)), ["observation.delivery.cascade"]);
});

for (const baseline of ["old", "between", "mixed", "fresh"]) {
  test(`T21 T53 T54 T118 [R22] bounded catch-up provenance for ${baseline} snapshots`, async () => {
    const target = world({ a: 0, b: 0, unrelated: 0 }); const sink = world({ value: null });
    const first = target.facet.read(["a", "b"]);
    const sinkFirst = sink.facet.read(["value"]);
    await atDepth(63, () => { target.store.set({ a: 1 }); });
    const between = target.facet.read(["a", "b"]);
    await atDepth(0, () => { target.store.set({ a: 2 }); });
    await atDepth(63, () => { target.store.set({ unrelated: 1 }); });
    if (baseline === "mixed") await atDepth(8, () => { target.store.set({ b: 1 }); });
    const snapshot = baseline === "old" ? first : baseline === "fresh" ? target.facet.read(["a", "b"]) : between;
    const incoming = { nested: {} }; let calls = 0;
    target.facet.watch(snapshot, { resources: target.module.resources, name: "catch-up", onChange: () => {
      calls += 1; sink.store.set({ value: incoming });
    } });
    if (baseline === "fresh") { await delivered(); assert.equal(calls, 0); target.store.set({ a: 3 }); }
    await delivered(); assert.equal(calls, 1);
    if (baseline === "old") {
      assert.equal(sink.store.read(["value"]).values.value, null); assert.equal(Object.isFrozen(incoming.nested), false);
      assert.deepEqual(sink.reports.map(report => codeOf(report.cause)), ["observation.delivery.cascade"]);
    } else {
      assert.equal(sink.store.read(["value"]).values.value, incoming); assert.deepEqual(sink.reports, []);
      // Following the emitted value preserves exactly the missed depth, excluding older/unselected keys.
      const remaining = baseline === "mixed" ? 54 : baseline === "between" ? 62 : 63;
      const chain = Array.from({ length: remaining + 2 }, () => world({ value: 0 })); let reached = 0;
      for (let index = 0; index < chain.length; index += 1) chain[index].facet.watch(chain[index].facet.read(["value"]), {
        resources: chain[index].module.resources, name: `tail${index}`, onChange: () => {
          reached += 1; if (index + 1 < chain.length) chain[index + 1].store.set({ value: 1 });
        },
      });
      sink.facet.watch(sinkFirst, { resources: sink.module.resources, name: "tail", onChange: () => { chain[0].store.set({ value: 1 }); } });
      await delivered();
      assert.equal(reached, remaining);
      assert.deepEqual(chain.flatMap(node => node.reports).map(report => codeOf(report.cause)), ["observation.delivery.cascade"]);
    }
  });
}

for (const depth of [63, 64]) test(`T53 T118 [R22] initial load without a new commit inherits depth ${depth} without increment`, async () => {
  const target = world({ a: 0 }); const sink = world({ value: null }); const incoming = {};
  await atDepth(depth, () => {
    target.facet.load(target.facet.read(["a"]), { resources: target.module.resources, name: "initial",
      loader: () => 1, onLoading: () => undefined, onError: () => undefined, onResult: () => { sink.store.set({ value: incoming }); },
    });
  });
  await settled();
  assert.equal(sink.store.read(["value"]).values.value, depth === 63 ? incoming : null);
  assert.equal(Object.isFrozen(incoming), depth === 63);
  assert.deepEqual(sink.reports.map(report => codeOf(report.cause)), depth === 63 ? [] : ["observation.delivery.cascade"]);
});

test("T31 T118 [R22] independent initial loads ignore old depth and argument revision", async () => {
  const target = world({ a: 0 }); const saved = target.facet.read(["a"]);
  await atDepth(63, () => { target.store.set({ a: 1 }); });
  for (const [index, snapshot] of [saved, target.facet.read(["a"])].entries()) {
    const sink = world({ value: 0 });
    target.facet.load(snapshot, { resources: target.module.resources, name: `independent${index}`,
      loader: ({ values }) => values.a, onLoading: () => undefined, onError: () => undefined,
      onResult: value => { sink.store.set({ value }); },
    });
    await settled(); assert.equal(sink.store.read(["value"]).values.value, 1); assert.deepEqual(sink.reports, []);
  }
});

test("T21 T51 T54 echo rejection leaves incoming graphs unfrozen and revision unchanged", async () => {
  const { store, facet, module, reports } = world({ a: null }); const incoming = { nested: {} };
  facet.watch(facet.read(["a"]), { resources: module.resources, name: "echo", onChange: () => { store.set({ a: incoming }); } });
  store.set({ a: 1 }); await delivered();
  assert.equal(Object.isFrozen(incoming.nested), false); assert.equal(store.read(["a"]).revision, 1);
  assert.deepEqual(reports.map(report => [report.revision, codeOf(report.cause)]), [[1, "observation.delivery.echo"]]);
});
test("T58 T62 T68 T113 FIFO preserves each native task checkpoint and external interleaving", async () => {
  const nodes = [world({ a: 0 }), world({ a: 0 }), world({ a: 0 })]; const order = [];
  for (const [index, node] of nodes.entries()) node.facet.watch(node.facet.read(["a"]), {
    resources: node.module.resources, name: `w${index}`, onChange: () => {
      order.push(`store${index}`);
      if (index === 0) {
        process.nextTick(() => { order.push("nextTick"); });
        void Promise.resolve().then(() => { order.push("promise"); });
        queueMicrotask(() => { order.push("microtask"); nodes[2].store.set({ a: 1 }); });
      }
    },
  });
  await new Promise(resolve => { setImmediate(() => {
    nodes[0].store.set({ a: 1 });
    setImmediate(() => { order.push("external"); });
    nodes[1].store.set({ a: 1 }); resolve();
  }); });
  await delivered();
  assert.deepEqual(order, ["store0", "nextTick", "promise", "microtask", "external", "store1", "store2"]);
});
