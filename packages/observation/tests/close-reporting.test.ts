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

test("T36 T45 escalation reports the active revision and retains dependencies through the loader's finally", { timeout: 30_000 }, async context => {
  const host = createScope({ name: "close-reporting-load" });
  const run = Promise.withResolvers<number>();
  const cleanup = Promise.withResolvers<void>();
  context.after(async () => {
    run.resolve(0);
    cleanup.resolve();
    await host.control.close();
  });
  const owner = host.resources.child({ name: "owner" });
  const trace: string[] = [];
  host.resources.use({ [Symbol.dispose]: () => { trace.push("provider:close"); } }, "provider");
  const subscriber = host.resources.child({ name: "subscriber" });
  const entered = Promise.withResolvers<AbortSignal>();
  const cleanupEntered = Promise.withResolvers<void>();
  const stillRunning = Promise.withResolvers<ListenerError>();
  const reports: ListenerError[] = [];
  const publications: unknown[] = [];
  let closing: Promise<CloseReport> | undefined;
  let parentClosing: Promise<CloseReport> | undefined;
  let reporterClosing: Promise<CloseReport> | undefined;
  let closeFinished = false;
  let cleanups = 0;
  let loadings = 0;
  let changes = 0;
  const store = createStore({ value: 0 }, {
    name: "state", resources: owner.resources,
    reportError: report => {
      reports.push(report);
      if (typeof report.cause === "object" && report.cause !== null && "code" in report.cause && report.cause.code === "observation.load.still-running") {
        reporterClosing = host.control.close();
        stillRunning.resolve(report);
      } else {
        closing ??= subscriber.control.close();
      }
    },
  });
  const facet = store.readonly();
  facet.watch(facet.read(["value"]), {
    resources: subscriber.resources, name: "consumer/watch",
    onChange: () => { changes += 1; },
  });
  facet.load(facet.read(["value"]), {
    resources: subscriber.resources, name: "consumer/load",
    loader: async (_snapshot, { signal }) => {
      entered.resolve(signal);
      try { return await run.promise; }
      finally {
        trace.push("load:finally");
        cleanupEntered.resolve();
        await cleanup.promise;
        cleanups += 1;
        trace.push("load:finished");
      }
    },
    onLoading: () => { loadings += 1; },
    onResult: result => { publications.push(result); },
    onError: cause => { publications.push(cause); },
  });
  const signal = await entered.promise;
  store.set({ value: 1 });
  await delivered({ stores: [facet] }); // revision 1 is offered while revision 0 still owns the read
  assert.equal(changes, 1);
  store.close();
  assertClosedReports(reports, ["consumer/watch", "consumer/load"], 1);
  assert.equal(signal.aborted, true);
  assert.equal(liveSubscriptions(facet), 0);
  assert.ok(closing !== undefined);
  parentClosing = host.control.close({ escalate: AbortSignal.abort() });
  const completed = parentClosing.then(report => { closeFinished = true; return report; });
  const first = await Promise.race([
    stillRunning.promise.then(report => ({ kind: "reported", report } as const)),
    completed.then(() => ({ kind: "premature-close" } as const)),
  ]);
  assert.equal(first.kind, "reported", "escalation must not finish cleanup while the loader is running");
  if (first.kind !== "reported") {return;}
  assert.equal(first.report.source, "state");
  assert.equal(first.report.subscription, "consumer/load");
  assert.equal(first.report.revision, 0, "attribute the active run, not the newer queued revision");
  assert.equal(reporterClosing, parentClosing, "a reentrant reporter joins the same parent flight");
  const snapshot = await host.control.close({ abandon: AbortSignal.abort() });
  assert.equal(snapshot.settled, false);
  assert.ok(snapshot.debts.some(debt => debt.state === "pending" && debt.path.join("/") === "close-reporting-load/subscriber/load:consumer/load/drain"));
  assert.ok(snapshot.debts.some(debt => debt.state === "not-run" && debt.path.join("/") === "close-reporting-load/provider"));
  assert.equal(closeFinished, false, "scope close must wait for the running operation");
  assert.deepEqual(trace, [], "the provider stays open after escalation and abandonment");
  assert.deepEqual(publications, []);

  run.resolve(42);
  await cleanupEntered.promise;
  assert.equal(closeFinished, false, "the loader promise still owns its unfinished cleanup");
  assert.deepEqual(trace, ["load:finally"]);
  cleanup.resolve();
  assert.deepEqual(await completed, { complete: true, settled: true, debts: [] });
  assert.deepEqual(await closing, { complete: true, settled: true, debts: [] });
  await settled({ stores: [facet] });
  assert.equal(cleanups, 1);
  assert.equal(loadings, 2);
  assert.equal(changes, 1, "no watch delivery after the scope detached");
  assert.deepEqual(publications, []);
  assert.deepEqual(trace, ["load:finally", "load:finished", "provider:close"]);
  assert.equal(reports.length, 3, "repeated close and reporter reentry must not duplicate the escalation report");

  store.close();
  assertClosedReports(reports.filter(report => report !== first.report), ["consumer/watch", "consumer/load"], 1);
  assert.deepEqual(await subscriber.control.close(), { complete: true, settled: true, debts: [] });
});
