import assert from "node:assert/strict";
import test from "node:test";
import { createStore, type ListenerError } from "@get-modular/observation";
import { delivered, liveSubscriptions } from "@get-modular/observation/testing";
import { createScope } from "@get-modular/resources";
import { Cause, Deferred, Effect, Exit, Fiber, Stream } from "effect";
import { callbackProgress } from "./qualification/effect-communication/callback.ts";
import { progressFixture, type ProgressEvent } from "./qualification/effect-communication/progress.ts";
import { closeWatchScope, observedProgress } from "./qualification/effect-communication/state.ts";

const event = (completed: number): ProgressEvent => ({ jobId: "example", completed });
test("communication: callback consumers unsubscribe independently without closing their borrowed source", { timeout: 10000 }, async () => {
  const fixture = progressFixture({ initial: [event(0)] });
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const leftReady = yield* Deferred.make<void>();
    const rightReady = yield* Deferred.make<void>();
    const left = yield* Effect.forkScoped(Stream.runCollect(Stream.take(
      Stream.tap(callbackProgress(fixture.source), () => Deferred.succeed(leftReady, undefined)), 2)));
    const right = yield* Effect.forkScoped(Stream.runCollect(Stream.take(
      Stream.tap(callbackProgress(fixture.source), () => Deferred.succeed(rightReady, undefined)), 3)));
    yield* Deferred.await(leftReady);
    yield* Deferred.await(rightReady);
    assert.equal(fixture.inspect().live, 2);
    fixture.emit(event(1));
    assert.deepEqual(yield* Fiber.join(left), [event(0), event(1)]);
    assert.deepEqual(fixture.inspect(), { live: 1, acquired: 2, released: 1 });
    fixture.emit(event(2));
    assert.deepEqual(yield* Fiber.join(right), [event(0), event(1), event(2)]);
  })));
  assert.deepEqual(fixture.inspect(), { live: 0, acquired: 2, released: 2 });
  // A new direct, non-Effect subscriber can still use the borrowed source.
  const seen: ProgressEvent[] = [];
  const unsubscribe = fixture.source.subscribe(value => { seen.push(value); return undefined; });
  fixture.emit(event(9));
  unsubscribe();
  assert.deepEqual(seen, [event(0), event(9)]);
});

test("communication: synchronous callback duplicates survive and late callbacks cannot revive a closed consumer", async () => {
  const duplicate = event(7);
  const fixture = progressFixture({ initial: [duplicate, duplicate] });
  const values = await Effect.runPromise(Stream.runCollect(Stream.take(callbackProgress(fixture.source, 2), 2)));
  assert.deepEqual(values, [duplicate, duplicate]);
  assert.deepEqual(fixture.inspect(), { live: 0, acquired: 1, released: 1 });
  assert.doesNotThrow(() => fixture.late(event(8)));
  assert.deepEqual(values, [duplicate, duplicate]);
});

test("communication: an unpausable callback burst fails explicitly on overflow and releases its subscription", async () => {
  const fixture = progressFixture({ initial: [event(1), event(2), event(3)] });
  const result = await Effect.runPromiseExit(Stream.runCollect(callbackProgress(fixture.source, 1)));
  assert.ok(Exit.isFailure(result));
  assert.deepEqual(result.cause.reasons.filter(Cause.isFailReason).map(reason => reason.error),
    [{ _tag: "ProgressOverflow", capacity: 1 }]);
  assert.deepEqual(fixture.inspect(), { live: 0, acquired: 1, released: 1 });
});

test("communication: a failed foreign subscribe retains its error and the source rolls back partial acquisition", async () => {
  const failure = new Error("foreign subscribe failed");
  const fixture = progressFixture({ initial: [event(1)], acquireFailure: failure });
  const result = await Effect.runPromiseExit(Stream.runDrain(callbackProgress(fixture.source)));
  assert.ok(Exit.isFailure(result));
  assert.deepEqual(result.cause.reasons.filter(Cause.isFailReason).map(reason => reason.error),
    [{ _tag: "SubscribeFailed", cause: failure }]);
  assert.deepEqual(fixture.inspect(), { live: 0, acquired: 0, released: 0 });
});

test("communication: processing failure and foreign teardown defect are not converted into success", async () => {
  for (const brokenCleanup of [false, true]) {
    const processing = new Error("processing failed"), cleanup = new Error("unsubscribe failed");
    const fixture = progressFixture({ initial: [event(1)], ...(brokenCleanup ? { releaseFailure: cleanup } : {}) });
    const result = await Effect.runPromiseExit(Stream.runDrain(
      Stream.mapEffect(callbackProgress(fixture.source), () => Effect.fail(processing)),
    ));
    assert.ok(Exit.isFailure(result));
    if (brokenCleanup) {
      // Native finalization retains both original error objects as defects here.
      // Do not fabricate the original typed Fail classification after failed cleanup.
      const defects = result.cause.reasons.filter(Cause.isDieReason).map(reason => reason.defect);
      assert.equal(defects.length, 2);
      assert.ok(defects.includes(processing));
      assert.ok(defects.includes(cleanup));
    } else {
      assert.deepEqual(result.cause.reasons.filter(Cause.isFailReason).map(reason => reason.error), [processing]);
      assert.equal(result.cause.reasons.some(Cause.isDieReason), false);
    }
    assert.deepEqual(fixture.inspect(), { live: 0, acquired: 1, released: 1 });
  }
});

test("communication: native interruption waits for callback subscription teardown", { timeout: 10000 }, async () => {
  const fixture = progressFixture({ initial: [event(0)] });
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const ready = yield* Deferred.make<void>();
    const reader = yield* Effect.forkScoped(Stream.runDrain(Stream.tap(
      callbackProgress(fixture.source), () => Deferred.succeed(ready, undefined),
    )));
    yield* Deferred.await(ready);
    assert.equal(fixture.inspect().live, 1);
    yield* Fiber.interrupt(reader);
    assert.deepEqual(fixture.inspect(), { live: 0, acquired: 1, released: 1 });
    fixture.late(event(1));
  })));
});

test("communication: Observation projection preserves latest-state semantics and selected keys", { timeout: 10000 }, async () => {
  const ownerScope = createScope({ name: "state-owner" });
  const reports: ListenerError[] = [];
  const store = createStore({ completed: 0, unrelated: "a" }, {
    name: "progress", resources: ownerScope.resources,
    reportError: report => { reports.push(report); return undefined; },
  });
  const facet = store.readonly();
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const ready = yield* Deferred.make<void>();
      const resume = yield* Deferred.make<void>();
      const seen: number[] = [];
      const reader = yield* Effect.forkScoped(Stream.runCollect(Stream.take(Stream.tap(
        observedProgress(facet), snapshot => Effect.gen(function* () {
          seen.push(snapshot.values.completed);
          yield* Deferred.succeed(ready, undefined);
          if (snapshot.values.completed === 0) yield* Deferred.await(resume);
        }),
      ), 2)));
      yield* Deferred.await(ready);
      assert.equal(liveSubscriptions(facet), 1);
      store.set({ unrelated: "b" });
      yield* Effect.promise(() => delivered({ stores: [facet] }));
      assert.deepEqual(seen, [0]);
      store.set({ completed: 1 });
      yield* Effect.promise(() => delivered({ stores: [facet] }));
      store.set({ completed: 2 });
      yield* Effect.promise(() => delivered({ stores: [facet] }));
      assert.deepEqual(seen, [0], "a slow consumer has not processed the queued snapshots");
      yield* Deferred.succeed(resume, undefined);
      const snapshots = yield* Fiber.join(reader);
      assert.deepEqual(snapshots.map(snapshot => snapshot.values.completed), [0, 2]);
      assert.equal(liveSubscriptions(facet), 0);
      assert.equal(facet.read(["completed"]).values.completed, 2);
    })));
    assert.deepEqual(reports, []);
  } finally { assert.equal((await ownerScope.control.close()).complete, true); }
});

test("communication: two Observation projections own separate watches and neither closes the store", { timeout: 10000 }, async () => {
  const ownerScope = createScope({ name: "shared-state-owner" });
  const reports: ListenerError[] = [];
  const store = createStore({ completed: 0 }, { name: "shared-progress", resources: ownerScope.resources,
    reportError: report => { reports.push(report); return undefined; } });
  const facet = store.readonly();
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const aReady = yield* Deferred.make<void>(), bReady = yield* Deferred.make<void>();
      const a = yield* Effect.forkScoped(Stream.runDrain(Stream.tap(observedProgress(facet), () => Deferred.succeed(aReady, undefined))));
      const b = yield* Effect.forkScoped(Stream.runCollect(Stream.take(Stream.tap(
        observedProgress(facet), () => Deferred.succeed(bReady, undefined),
      ), 2)));
      yield* Deferred.await(aReady);
      yield* Deferred.await(bReady);
      assert.equal(liveSubscriptions(facet), 2);
      yield* Fiber.interrupt(a);
      assert.equal(liveSubscriptions(facet), 1);
      store.set({ completed: 3 });
      assert.deepEqual((yield* Fiber.join(b)).map(snapshot => snapshot.values.completed), [0, 3]);
      assert.equal(liveSubscriptions(facet), 0);
      assert.equal(facet.read(["completed"]).values.completed, 3);
    })));
    assert.deepEqual(reports, []);
  } finally { assert.equal((await ownerScope.control.close()).complete, true); }
});

test("communication: unexpected Observation source close is owner-reported, not invented Stream completion", { timeout: 10000 }, async () => {
  const ownerScope = createScope({ name: "closing-state-owner" });
  const reports: ListenerError[] = [];
  const store = createStore({ completed: 0 }, { name: "closing-progress", resources: ownerScope.resources,
    reportError: report => { reports.push(report); return undefined; } });
  const facet = store.readonly();
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const ready = yield* Deferred.make<void>();
      let settled = false;
      const reader = yield* Effect.forkScoped(Stream.runDrain(Stream.tap(
        observedProgress(facet), () => Deferred.succeed(ready, undefined),
      )).pipe(Effect.ensuring(Effect.sync(() => { settled = true; }))));
      yield* Deferred.await(ready);
      store.close();
      yield* Effect.promise(() => delivered({ stores: [facet] }));
      assert.equal(liveSubscriptions(facet), 0);
      assert.equal(reports.length, 1);
      assert.equal(settled, false, "no successful or failed terminal signal is invented");
      yield* Fiber.interrupt(reader);
      assert.equal(settled, true, "the Host owns consumer retirement");
    })));
    const closedRead = await Effect.runPromiseExit(Stream.runDrain(observedProgress(facet)));
    assert.ok(Exit.isFailure(closedRead));
    assert.ok(closedRead.cause.reasons.some(Cause.isDieReason), "using a closed source remains a lifecycle defect");
    assert.equal(liveSubscriptions(facet), 0);
  } finally { assert.equal((await ownerScope.control.close()).complete, true); }
});

test("communication: incomplete bridge-owned Resources close remains visible and is not automatically retried", async () => {
  const scope = createScope({ name: "incomplete-watch-owner" });
  const failure = new Error("cleanup failed");
  let fail = true, attempts = 0;
  scope.resources.use({ [Symbol.dispose]: () => { attempts += 1; if (fail) throw failure; } }, "failure-probe");
  try {
    const result = await Effect.runPromiseExit(closeWatchScope(scope));
    assert.ok(Exit.isFailure(result));
    const defects = result.cause.reasons.filter(Cause.isDieReason).map(reason => reason.defect);
    assert.equal(defects.length, 1);
    assert.ok(defects[0] instanceof Error);
    assert.equal(defects[0].message, "Observation bridge cleanup incomplete");
    assert.ok(defects[0].cause, "retain the actual Resources close report");
    assert.equal(attempts, 1);
  } finally {
    // A separate owner decision in this fixture, not an automatic bridge retry.
    fail = false;
    assert.equal((await scope.control.close()).complete, true);
  }
});
