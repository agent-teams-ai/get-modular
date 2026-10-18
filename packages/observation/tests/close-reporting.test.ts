import assert from "node:assert/strict";
import test from "node:test";
import { createScope, type CloseReport } from "@get-modular/resources";
import { createStore, type ListenerError } from "../dist/index.js";
import { delivered, liveSubscriptions, settled } from "../dist/testing.js";

function assertClosedReports(reports: readonly ListenerError[], names: readonly string[], revision: number): void {
  assert.deepEqual(reports.map(report => report.subscription).toSorted(), names.toSorted());
  for (const report of reports) {
    assert.equal(report.source, "state");
    assert.equal(report.revision, revision);
    assert.ok(typeof report.cause === "object" && report.cause !== null && "code" in report.cause);
    assert.equal(report.cause.code, "observation.source.closed");
  }
}

test("T45 close reports every live watch when its reporter closes their shared subscriber scope", { timeout: 30_000 }, async context => {
  const host = createScope({ name: "close-reporting" });
  context.after(() => host.control.close());
  const owner = host.resources.child({ name: "owner" });
  const subscriber = host.resources.child({ name: "subscriber" });
  const detached = host.resources.child({ name: "already-detached" });
  const reports: ListenerError[] = [];
  let closing: Promise<CloseReport> | undefined;
  let changes = 0;
  const store = createStore({ value: 0 }, {
    name: "state", resources: owner.resources,
    reportError: report => {
      reports.push(report);
      closing ??= subscriber.control.close();
    },
  });
  const facet = store.readonly();
  const names = ["consumer/one", "consumer/two"];
  for (const name of names) {
    facet.watch(facet.read(["value"]), {
      resources: subscriber.resources, name, onChange: () => { changes += 1; },
    });
  }
  facet.watch(facet.read(["value"]), {
    resources: detached.resources, name: "consumer/detached", onChange: () => { changes += 1; },
  });
  assert.equal((await detached.control.close()).complete, true);
  assert.equal(liveSubscriptions(facet), 2);
  assert.deepEqual(reports, []);

  store.set({ value: 1 });
  store.close();
  assertClosedReports(reports, names, 1);
  assert.equal(liveSubscriptions(facet), 0);
  assert.ok(closing !== undefined);
  assert.deepEqual(await closing, { complete: true, settled: true, debts: [] });
  await delivered({ stores: [facet] });
  assert.equal(changes, 0);

  store.close();
  assertClosedReports(reports, names, 1);
  assert.equal(liveSubscriptions(facet), 0);
  assert.equal(store.read(["value"]).values.value, 1);
});

test("T36 T45 close reports watch and active load siblings while retaining the load's physical drain", { timeout: 30_000 }, async context => {
  const host = createScope({ name: "close-reporting-load" });
  const run = Promise.withResolvers<number>();
  const cleanup = Promise.withResolvers<void>();
  context.after(async () => {
    run.resolve(0);
    cleanup.resolve();
    await host.control.close();
  });
  const owner = host.resources.child({ name: "owner" });
  const subscriber = host.resources.child({ name: "subscriber" });
  const entered = Promise.withResolvers<AbortSignal>();
  const cleanupEntered = Promise.withResolvers<void>();
  const reports: ListenerError[] = [];
  const publications: unknown[] = [];
  let closing: Promise<CloseReport> | undefined;
  let closeFinished = false;
  let cleanups = 0;
  let loadings = 0;
  const store = createStore({ value: 0 }, {
    name: "state", resources: owner.resources,
    reportError: report => {
      reports.push(report);
      closing ??= subscriber.control.close();
    },
  });
  const facet = store.readonly();
  facet.watch(facet.read(["value"]), {
    resources: subscriber.resources, name: "consumer/watch",
    onChange: snapshot => { publications.push(snapshot); },
  });
  facet.load(facet.read(["value"]), {
    resources: subscriber.resources, name: "consumer/load",
    loader: async (_snapshot, { signal }) => {
      entered.resolve(signal);
      try { return await run.promise; }
      finally {
        cleanupEntered.resolve();
        await cleanup.promise;
        cleanups += 1;
      }
    },
    onLoading: () => { loadings += 1; },
    onResult: result => { publications.push(result); },
    onError: cause => { publications.push(cause); },
  });
  const signal = await entered.promise;
  store.set({ value: 1 });
  store.close();
  assertClosedReports(reports, ["consumer/watch", "consumer/load"], 1);
  assert.equal(signal.aborted, true);
  assert.equal(liveSubscriptions(facet), 0);
  assert.ok(closing !== undefined);
  const completed = closing.then(report => { closeFinished = true; return report; });
  await delivered({ stores: [facet] });
  assert.equal(closeFinished, false, "scope close must wait for the running operation");
  assert.deepEqual(publications, []);

  run.resolve(42);
  await cleanupEntered.promise;
  await delivered({ stores: [facet] });
  assert.equal(closeFinished, false, "the loader promise still owns its unfinished cleanup");
  cleanup.resolve();
  assert.deepEqual(await completed, { complete: true, settled: true, debts: [] });
  await settled({ stores: [facet] });
  assert.equal(cleanups, 1);
  assert.equal(loadings, 1);
  assert.deepEqual(publications, []);

  store.close();
  assertClosedReports(reports, ["consumer/watch", "consumer/load"], 1);
  assert.deepEqual(await subscriber.control.close(), { complete: true, settled: true, debts: [] });
});
