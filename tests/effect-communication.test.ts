import assert from "node:assert/strict";
import test from "node:test";
import { getEventListeners } from "node:events";
import { createStore, type ListenerError, type ReadonlyStore } from "@get-modular/observation";
import { delivered, liveSubscriptions } from "@get-modular/observation/testing";
import { createScope } from "@get-modular/resources";
import { Cause, Deferred, Effect, Exit, Fiber, Stream } from "effect";
import { callbackProgress } from "./qualification/effect-communication/callback.ts";
import { eventTargetProgress } from "./qualification/effect-communication/event-target.ts";
import { progressFixture, type ProgressEvent, type ProgressSource } from "./qualification/effect-communication/progress.ts";
import { closeWatchScope, observedProgress } from "./qualification/effect-communication/state.ts";
import type { ProgressState } from "./qualification/effect-communication/watch-progress.ts";

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

test("communication: failed subscribe exposes no prefix and retains its error even after overflow", { timeout: 10000 }, async () => {
  for (const failure of [new Error("foreign subscribe failed"), undefined]) {
    for (const initial of [[], [event(1)], [event(1), event(2)]]) {
      const fixture = progressFixture({ initial, acquireFailure: failure });
      const seen: ProgressEvent[] = [];
      const result = await Effect.runPromiseExit(Stream.runDrain(Stream.take(Stream.tap(
        callbackProgress(fixture.source, 1), value => Effect.sync(() => { seen.push(value); }),
      ), 1)));
      assert.ok(Exit.isFailure(result), "take(1) must not hide a later synchronous subscribe failure");
      assert.equal(result.cause.reasons.length, 1);
      const [reason] = result.cause.reasons;
      assert.ok(reason !== undefined && Cause.isFailReason(reason) && reason.error._tag === "SubscribeFailed");
      assert.equal(reason.error.cause, failure, "the original subscription failure is retained by identity");
      assert.deepEqual(seen, [], "no occurrence escapes an unsuccessful subscription acquisition");
      assert.deepEqual(fixture.inspect(), { live: 0, acquired: 0, released: 0 });
    }
  }
});

test("communication: processing failure and foreign teardown defect are not converted into success", async () => {
  for (const brokenCleanup of [false, true]) {
    const processing = new Error("processing failed"), cleanup = new Error("unsubscribe failed");
    const fixture = progressFixture({ initial: [event(1)], ...(brokenCleanup ? { releaseFailure: cleanup } : {}) });
    const result = await Effect.runPromiseExit(Stream.runDrain(
      Stream.mapEffect(callbackProgress(fixture.source), () => Effect.fail(processing)),
    ));
    assert.ok(Exit.isFailure(result));
    assert.equal(result.cause.reasons.length, brokenCleanup ? 2 : 1);
    if (brokenCleanup) {
      // Native finalization retains both original error objects as defects here.
      // Do not fabricate the original typed Fail classification after failed cleanup.
      const defects = result.cause.reasons.filter(Cause.isDieReason).map(reason => reason.defect);
      assert.equal(defects.length, 2);
      assert.ok(defects.includes(processing));
      assert.ok(defects.includes(cleanup));
    } else {
      const [reason] = result.cause.reasons;
      assert.ok(reason !== undefined && Cause.isFailReason(reason));
      assert.equal(reason.error, processing, "the original processing failure is retained by identity");
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
    assert.equal(result.cause.reasons.length, 1);
    const defects = result.cause.reasons.filter(Cause.isDieReason).map(reason => reason.defect);
    assert.equal(defects.length, 1);
    assert.ok(defects[0] instanceof Error);
    assert.equal(defects[0].message, "Observation bridge cleanup incomplete");
    const report = defects[0].cause;
    assert.ok(report !== null && typeof report === "object"
      && "complete" in report && "settled" in report && "debts" in report);
    assert.equal(report.complete, false);
    assert.equal(report.settled, true);
    assert.ok(Array.isArray(report.debts));
    assert.equal(report.debts.length, 1);
    const debt: unknown = report.debts[0];
    assert.ok(debt !== null && typeof debt === "object" && "state" in debt && "cause" in debt);
    assert.equal(debt.state, "failed");
    assert.equal(debt.cause, failure, "the cleanup report retains the original release failure");
    assert.equal(attempts, 1);
  } finally {
    // A separate owner decision in this fixture, not an automatic bridge retry.
    fail = false;
    assert.equal((await scope.control.close()).complete, true);
  }
});


test("communication: overflow behind a held handler discards all unprocessed occurrences", { timeout: 10000 }, async () => {
  const fixture = progressFixture({ initial: [event(1), event(2), event(3)] });
  const seen: number[] = [];
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const ready = yield* Deferred.make<void>();
    const resume = yield* Deferred.make<void>();
    const reader = yield* Effect.forkScoped(Stream.runForEach(callbackProgress(fixture.source, 3), value =>
      Effect.gen(function* () {
        seen.push(value.completed);
        if (value.completed === 1) {
          yield* Deferred.succeed(ready, undefined);
          yield* Deferred.await(resume);
        }
      })));
    yield* Deferred.await(ready);
    // A batched pull would already retain 2 and 3 outside the bounded queue.
    for (const completed of [4, 5, 6, 7]) fixture.emit(event(completed));
    assert.deepEqual(seen, [1]);
    yield* Deferred.succeed(resume, undefined);
    const exit = yield* Fiber.await(reader);
    assert.ok(Exit.isFailure(exit));
    assert.deepEqual(exit.cause.reasons.filter(Cause.isFailReason).map(reason => reason.error),
      [{ _tag: "ProgressOverflow", capacity: 3 }]);
    assert.deepEqual(seen, [1], "a direct sequential consumer starts no handler after the known gap");
    assert.deepEqual(fixture.inspect(), { live: 0, acquired: 1, released: 1 });
  })));
});

test("communication: real EventTarget flows through the callback and state bridges across fresh sessions", { timeout: 10000 }, async () => {
  const target = new EventTarget();
  const notifications = eventTargetProgress(target);
  let acquired = 0, released = 0;
  let subscriptionReady = Promise.withResolvers<void>();
  const source: ProgressSource = {
    subscribe: listener => {
      const unsubscribe = notifications.source.subscribe(listener);
      acquired += 1;
      subscriptionReady.resolve();
      return () => { unsubscribe(); released += 1; return undefined; };
    },
  };
  const sourceOwner = createScope({ name: "event-target-state" });
  const reports: ListenerError[] = [];
  const store = createStore({ completed: 0 }, { name: "event-target-progress", resources: sourceOwner.resources,
    reportError: report => { reports.push(report); return undefined; } });
  const facet = store.readonly();
  // Deliberately reuse the same lazy streams: each run must acquire fresh ownership.
  const occurrences = callbackProgress(source, 2), snapshots = observedProgress(facet);
  try {
    for (const completed of [1, 2]) {
      subscriptionReady = Promise.withResolvers<void>();
      await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
        const projectionReady = yield* Deferred.make<void>();
        const projection = yield* Effect.forkScoped(Stream.runCollect(Stream.take(Stream.tap(
          snapshots, () => Deferred.succeed(projectionReady, undefined)), 2)));
        yield* Deferred.await(projectionReady);
        const ingest = yield* Effect.forkScoped(Stream.runForEach(occurrences, value =>
          Effect.sync(() => { store.set({ completed: value.completed }); })));
        yield* Effect.promise(() => subscriptionReady.promise);
        assert.equal(acquired - released, 1);
        assert.equal(getEventListeners(target, "progress").length, 1);
        assert.equal(liveSubscriptions(facet), 1);
        notifications.publish(event(completed));
        assert.deepEqual((yield* Fiber.join(projection)).map(value => value.values.completed), [completed - 1, completed]);
        yield* Fiber.interrupt(ingest);
        assert.equal(acquired, completed);
        assert.equal(released, completed);
        assert.equal(getEventListeners(target, "progress").length, 0, "the actual listener is removed, not just muted");
        assert.equal(liveSubscriptions(facet), 0);
      })));
      notifications.publish(event(99));
      assert.equal(facet.read(["completed"]).values.completed, completed, "retired ingestion has no effects");
    }
    const direct: ProgressEvent[] = [];
    const unsubscribe = source.subscribe(value => { direct.push(value); return undefined; });
    try { notifications.publish(event(7)); }
    finally { unsubscribe(); }
    assert.deepEqual(direct, [event(7)], "the borrowed source still works without an Effect consumer");
    assert.equal(acquired, released);
    assert.equal(getEventListeners(target, "progress").length, 0);
    assert.deepEqual(reports, []);
  } finally {
    const report = await sourceOwner.control.close();
    assert.equal(report.complete && report.settled, true);
  }
});

test("communication: Observation capacity refusal is recoverable without hiding other acquisition failures", { timeout: 10000 }, async () => {
  const ownerScope = createScope({ name: "admission-state-owner" });
  const reports: ListenerError[] = [];
  const store = createStore({ completed: 0 }, { name: "admission-progress", resources: ownerScope.resources,
    maxSubscriptions: 1, reportError: report => { reports.push(report); return undefined; } });
  const facet = store.readonly();
  let refusedCause: unknown;
  const traced: ReadonlyStore<ProgressState> = {
    ...facet,
    watch: (snapshot, spec) => {
      try { return facet.watch(snapshot, spec); }
      catch (cause) { refusedCause = cause; throw cause; }
    },
  };
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const ready = yield* Deferred.make<void>(), updated = yield* Deferred.make<void>();
      const seen: number[] = [];
      const first = yield* Effect.forkScoped(Stream.runForEach(observedProgress(facet), snapshot => Effect.gen(function* () {
        seen.push(snapshot.values.completed);
        yield* Deferred.succeed(snapshot.values.completed === 0 ? ready : updated, undefined);
      })));
      yield* Effect.raceFirst(Deferred.await(ready), Fiber.join(first));
      assert.equal(liveSubscriptions(facet), 1);

      const refusedValues: number[] = [];
      const refused = yield* Effect.exit(Stream.runDrain(Stream.take(Stream.tap(
        observedProgress(traced), snapshot => Effect.sync(() => { refusedValues.push(snapshot.values.completed); }),
      ), 1)));
      assert.ok(Exit.isFailure(refused));
      assert.equal(refused.cause.reasons.length, 1);
      const [reason] = refused.cause.reasons;
      assert.ok(reason !== undefined && Cause.isFailReason(reason));
      assert.equal(reason.error._tag, "ProgressSubscriptionLimit");
      assert.equal(reason.error.cause, refusedCause, "the real admission error is retained by identity");
      assert.ok(refusedCause instanceof Error && "code" in refusedCause
        && refusedCause.code === "observation.subscriptions.limit");
      assert.deepEqual(refusedValues, [], "take(1) cannot conceal refused admission behind initial state");
      assert.equal(liveSubscriptions(facet), 1, "refusal preserves the first subscription");

      store.set({ completed: 1 });
      yield* Effect.raceFirst(Deferred.await(updated), Fiber.join(first));
      assert.deepEqual(seen, [0, 1]);
      yield* Fiber.interrupt(first);
      assert.equal(liveSubscriptions(facet), 0);

      const recovered = yield* Stream.runCollect(Stream.take(observedProgress(facet), 1));
      assert.deepEqual(recovered.map(snapshot => snapshot.values.completed), [1]);
      assert.equal(liveSubscriptions(facet), 0, "explicit reacquisition also releases on early completion");

      const readFailure = { code: "observation.subscriptions.limit" };
      const watchFailure = new Error("non-limit watch failure");
      const unreadableFailure = { get code() { throw new Error("error discrimination failed"); } };
      const faults: readonly { readonly source: ReadonlyStore<ProgressState>; readonly cause: unknown }[] = [
        { source: { ...facet, read: () => { throw readFailure; } }, cause: readFailure },
        { source: { ...facet, watch: () => { throw watchFailure; } }, cause: watchFailure },
        { source: { ...facet, watch: () => { throw unreadableFailure; } }, cause: unreadableFailure },
      ];
      for (const fault of faults) {
        const result = yield* Effect.exit(Stream.runDrain(observedProgress(fault.source)));
        assert.ok(Exit.isFailure(result));
        assert.equal(result.cause.reasons.length, 1);
        const [defect] = result.cause.reasons;
        assert.ok(defect !== undefined && Cause.isDieReason(defect));
        assert.equal(defect.defect, fault.cause, "only the watch call's budget refusal enters the expected error channel");
      }
      assert.equal(liveSubscriptions(facet), 0);
      assert.deepEqual(reports, []);
    })));
  } finally {
    const report = await ownerScope.control.close();
    assert.equal(report.complete && report.settled, true);
  }
});
