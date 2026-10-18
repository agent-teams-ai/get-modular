// Archived P/R semantic probes, ported to the public package build and real resource scopes.
import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import { asyncDetection, delivered, liveSubscriptions, settled } from "../dist/testing.js";
import { world, codeOf, deferred } from "./support/world.mjs";

describe("T71 [R10] the testing entry point", () => {
    test("T71 [R10] liveSubscriptions per store and per scope; settled() waits for loads, delivered() does not", async () => {
        const { store, facet, module, host } = world({ level: "info", region: "eu", theme: "light" });
        const request = host.resources.child({ name: "request" });
        facet.watch(facet.read(["level"]), { resources: module.resources, name: "m/level", onChange: () => undefined });
        facet.watch(facet.read(["level"]), { resources: request.resources, name: "r/level", onChange: () => undefined });
        assert.deepEqual([liveSubscriptions(facet), liveSubscriptions(facet, module.resources), liveSubscriptions(facet, request.resources)], [2, 1, 1]);
        await request.control.close();
        assert.equal(liveSubscriptions(facet, request.resources), 0);
        let release;
        const results = [];
        facet.load(facet.read(["region"]), {
            resources: module.resources, name: "m/catalog",
            loader: () => new Promise((resolve) => { release = resolve; }),
            onLoading: () => undefined, onResult: (value) => { results.push(value); }, onError: () => undefined,
        });
        await delivered(); // the load is queued and running; delivered() does not wait for it
        assert.deepEqual(results, []);
        const done = settled();
        release("eu models");
        await done;
        assert.deepEqual(results, ["eu models"]);
        void store;
        await module.control.close();
    });
});

describe("T71 T72 [R12] the testing entry point waits only for what it is asked, and never forever", () => {
    test("T71 T72 [R12] C5: delivered({ stores }) resolves while an unrelated store commits every task", async () => {
        const busy = world({ level: "0", region: "eu", theme: "light" });
        const quiet = world({ level: "0", region: "eu", theme: "light" });
        let running = true;
        void (async () => { let n = 0; while (running) {
            busy.store.set({ level: String(n += 1) });
            await new Promise((resolve) => { setImmediate(resolve); });
        } })();
        quiet.store.set({ level: "1" });
        await delivered({ stores: [quiet.facet] });
        const abort = new AbortController();
        const pending = delivered({ signal: abort.signal });
        abort.abort();
        await assert.rejects(pending, (error) => codeOf(error) === "observation.testing.timeout");
        running = false;
    });
    test("T71 T72 [R12] C6: settled({ stores }) ignores an unrelated open long-poll; a global settled() gives up with a code", async () => {
        const other = world({ level: "0", region: "eu", theme: "light" });
        let release;
        other.facet.load(other.facet.read(["level"]), { resources: other.module.resources, name: "other/long-poll",
            loader: () => new Promise((resolve) => { release = () => { resolve(1); }; }), onLoading: () => undefined, onResult: () => undefined, onError: () => undefined });
        const mine = world({ level: "0", region: "eu", theme: "light" });
        mine.store.set({ level: "5" });
        await settled({ stores: [mine.facet] });
        const abort = new AbortController();
        setTimeout(() => { abort.abort(); }, 50);
        await assert.rejects(settled({ signal: abort.signal }), (error) => codeOf(error) === "observation.testing.timeout");
        release();
        await other.module.control.close();
    });
});

describe("T06 T68 T72 T73 [R14] the testing deadline is always on and fake timers cannot stall it (M4)", () => {
    test("T06 T68 T72 T73 [R14] W1: a signal that never aborts does not switch the deadline off", async () => {
        const busy = world({ level: "0", region: "eu", theme: "light" });
        let running = true;
        void (async () => { let n = 0; while (running) {
            busy.store.set({ level: String(n += 1) });
            await new Promise((resolve) => { setImmediate(resolve); });
        } })();
        const never = new AbortController();

        await assert.rejects(delivered({ signal: never.signal, timeoutMs: 200 }), (error) => codeOf(error) === "observation.testing.timeout");

        running = false;
    });
    test("T06 T68 T72 T73 [R14] W2: mock.timers on setImmediate, setTimeout and Date after import: deliveries and the deadline keep working", async () => {
        const { store, facet, module } = world({ level: "0", region: "eu", theme: "light" });
        const seen = [];
        facet.watch(facet.read(["level"]), { resources: module.resources, name: "m/level", onChange: ({ values }) => { seen.push(values.level); } });
        let release;
        facet.load(facet.read(["region"]), { resources: module.resources, name: "m/never", loader: () => new Promise((resolve) => { release = () => { resolve(1); }; }),
            onLoading: () => undefined, onResult: () => undefined, onError: () => undefined });
        mock.timers.enable({ apis: ["setImmediate", "setTimeout", "Date"] });
        try {
            store.set({ level: "7" });
            await delivered({ stores: [facet], timeoutMs: 1_000 });
            assert.deepEqual(seen, ["7"], "the delivery ran on the real setImmediate");
            await assert.rejects(settled({ stores: [facet], timeoutMs: 200 }), (error) => codeOf(error) === "observation.testing.timeout");
        }
        finally {
            mock.timers.reset();
        }
        release();
        await module.control.close();
    });
    test("T06 T68 T72 T73 [R14] the detection flag tells a test preset whether async echoes are detected (Node: true)", () => {
        assert.equal(asyncDetection, true);
    });
});

test("T47 T71 T72 testing wait validation, explicit Infinity, signal cause and default deadline", { timeout: 10000 }, async () => {
  const { facet, module } = world({ a: 0 }); const gate = deferred();
  facet.load(facet.read(["a"]), { resources: module.resources, name: "held", loader: () => gate.promise,
    onLoading: () => undefined, onResult: () => undefined, onError: () => undefined });
  await delivered();
  for (const timeoutMs of [0, -1, NaN, "1"]) await assert.rejects(settled({ timeoutMs }), { code: "observation.argument.invalid" });
  await assert.rejects(delivered({ stores: [{}] }), { code: "observation.argument.invalid" });
  assert.throws(() => liveSubscriptions({}), error => error.code === "observation.argument.invalid" && /not a store of this package copy/.test(error.message));
  const reason = new Error("stop waiting");
  await assert.rejects(settled({ stores: [facet], timeoutMs: Infinity, signal: AbortSignal.abort(reason) }),
    error => error.code === "observation.testing.timeout" && error.cause === reason);
  await assert.rejects(settled({ stores: [facet] }), { code: "observation.testing.timeout" });
  let finished = false;
  const waiting = settled({ stores: [facet], timeoutMs: Infinity }).then(() => { finished = true; });
  await delivered(); assert.equal(finished, false); gate.resolve(1); await waiting; assert.equal(finished, true);
});
