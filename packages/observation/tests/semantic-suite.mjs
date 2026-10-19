import assert from "node:assert/strict";
import { createScope } from "@get-modular/resources";

/** The same public behavior runs against the local build and the installed exact archive. */
export async function runSemanticSuite({ createStore }, { delivered, settled, liveSubscriptions }, context) {
  await context.test("T18 T19 T22 T26 T29 T34 a facet catches up across await and releases with its subscriber", async () => {
    const host = createScope({ name: "host" }); const consumer = host.resources.child({ name: "consumer" });
    const reports = []; const seen = [];
    const owner = createStore({ value: 0, untouched: "x" }, { resources: host.resources, name: "settings", reportError: report => { reports.push(report); } });
    const facet = owner.readonly(); const snapshot = facet.read(["value"]);
    owner.set({ value: 1 }); await Promise.resolve();
    facet.watch(snapshot, { resources: consumer.resources, name: "consumer/value", onChange: next => { seen.push(next); } });
    await delivered({ stores: [facet] });
    assert.deepEqual(seen, [{ revision: 1, values: { value: 1 } }]);
    assert.ok(Object.isFrozen(seen[0]) && Object.isFrozen(seen[0].values));
    assert.equal(liveSubscriptions(facet), 1);
    assert.equal((await consumer.control.close()).complete, true);
    owner.set({ value: 2 }); await delivered({ stores: [facet] });
    assert.equal(seen.length, 1); assert.equal(liveSubscriptions(facet), 0); assert.deepEqual(reports, []);
    await host.control.close();
    assert.equal(owner.read(["value"]).values.value, 2);
    assert.throws(() => facet.read(["value"]), { code: "observation.store.closed" });
  });
  await context.test("T31 T32 T36 T65 a superseded physical load drains before the newest run", async () => {
    const host = createScope({ name: "host" }); const consumer = host.resources.child({ name: "consumer" });
    const store = createStore({ region: "eu" }, { resources: host.resources, name: "settings", reportError: () => undefined });
    const facet = store.readonly(); const runs = []; const results = [];
    facet.load(facet.read(["region"]), { resources: consumer.resources, name: "consumer/query",
      loader: ({ values }, { signal }) => new Promise(resolve => { runs.push({ value: values.region, signal, resolve }); }),
      onLoading: () => undefined, onResult: result => { results.push(result); }, onError: cause => { throw cause; },
    });
    await delivered({ stores: [facet] }); store.set({ region: "us" }); await delivered({ stores: [facet] });
    assert.equal(runs.length, 1); assert.equal(runs[0].signal.aborted, true);
    runs[0].resolve("old"); await delivered({ stores: [facet] });
    assert.equal(runs.length, 2); assert.equal(runs[1].value, "us");
    runs[1].resolve("current"); await settled({ stores: [facet] });
    assert.deepEqual(results, ["current"]);
    assert.equal((await consumer.control.close()).complete, true); assert.equal(liveSubscriptions(facet), 0);
    await host.control.close();
  });
  await context.test("T40 T51 T54 callback failure and echo preserve sibling delivery and exact report causes", async () => {
    const host = createScope({ name: "host" }); const reports = []; let healthy = 0;
    const store = createStore({ value: 0 }, { resources: host.resources, name: "settings", reportError: report => { reports.push(report); } });
    const facet = store.readonly(); const boom = new Error("callback failed");
    facet.watch(facet.read(["value"]), { resources: host.resources, name: "throw", onChange: () => { throw boom; } });
    facet.watch(facet.read(["value"]), { resources: host.resources, name: "echo", onChange: () => { store.set({ value: 2 }); } });
    facet.watch(facet.read(["value"]), { resources: host.resources, name: "healthy", onChange: () => { healthy += 1; } });
    store.set({ value: 1 }); await delivered({ stores: [facet] });
    assert.equal(healthy, 1); assert.equal(store.read(["value"]).values.value, 1);
    assert.equal(reports.find(report => report.subscription === "throw").cause, boom);
    assert.equal(reports.filter(report => report.cause?.code === "observation.delivery.echo").length, 1);
    await host.control.close(); assert.equal(liveSubscriptions(facet), 0);
  });
}
