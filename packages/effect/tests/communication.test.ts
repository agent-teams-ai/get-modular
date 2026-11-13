import assert from "node:assert/strict";
import test from "node:test";
import { declareModule, defineContract, type CapabilitiesOf } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { createStore, type ListenerError } from "@get-modular/observation";
import { delivered, liveSubscriptions } from "@get-modular/observation/testing";
import { createScope } from "@get-modular/resources";
import { Cause, Context, Deferred, Effect, Exit, Fiber, Stream } from "effect";
import { effectFor, implement } from "../dist/index.js";
import { callbackProgress } from "./communication/callback.ts";
import { nativeProgress, type NativeProgressOwner, type ProgressEvents, type ProgressPublisher } from "./communication/native.ts";
import { progressFixture, type ProgressEvent } from "./communication/progress.ts";
import { closeWatchScope, observedProgress } from "./communication/state.ts";

const event = (completed: number): ProgressEvent => ({ jobId: "example", completed });
const Events = defineContract<ProgressEvents>()({ id: "recipes/progress", revision: 1 });
interface Ports extends CapabilitiesOf<typeof Events> {}
class Roots extends Context.Service<Roots, {
  readonly source: NativeProgressOwner;
  readonly left: ProgressEvents;
  readonly right: ProgressEvents;
}>()("recipes/Roots") {}
const owner = { authority: "recipes", path: ["progress"] };

async function nativeGraph() {
  const source = implement<Ports>()(declareModule({ moduleId: "recipes/source", implementationId: "recipes/source",
    owner, provides: [Events.provide()], slots: [] }), () => Effect.map(nativeProgress(4), value => ({
      instance: value, capabilities: { [Events.id]: value.events },
    })));
  const consumer = (name: string) => implement<Ports>()(declareModule({
    moduleId: `recipes/${name}`, implementationId: `recipes/${name}`, owner,
    provides: [], slots: [Events.slot("events", required())],
  }), deps => Effect.succeed({ instance: deps.events, capabilities: {} }));
  const left = consumer("left"), right = consumer("right");
  const result = await effectFor<Ports>().prepare({
    profileId: "recipes/native", modules: [source, left, right], roots: { source, left, right },
  });
  assert.equal(result.status, "prepared");
  if (result.status !== "prepared") throw new Error("recipe preparation failed");
  return result.prepared;
}

test("communication: GM selects one native source; early or failed subscriber exit leaves its sibling alive", { timeout: 10000 }, async () => {
  const graph = await nativeGraph();
  for (const failLeft of [false, true]) {
    const retained: { publisher?: ProgressPublisher } = {};
    const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const roots = yield* Roots;
      assert.equal(roots.left, roots.right);
      assert.deepEqual(Object.keys(roots.left), ["subscribe"]);
      retained.publisher = roots.source.publisher;
      // Acquiring, not merely returning a Stream, establishes subscription readiness.
      const right = yield* roots.right.subscribe;
      const rightWork = yield* Effect.forkScoped(Stream.runCollect(Stream.take(right, 3)));
      yield* Effect.scoped(Effect.gen(function* () {
        const left = yield* roots.left.subscribe;
        const duplicate = event(1);
        yield* roots.source.publisher.publish(duplicate);
        yield* roots.source.publisher.publish(duplicate);
        if (failLeft) {
          const failure = new Error("left processing failed");
          const exit = yield* Effect.exit(Stream.runDrain(Stream.mapEffect(left, () => Effect.fail(failure))));
          assert.ok(Exit.isFailure(exit));
          assert.ok(exit.cause.reasons.filter(Cause.isFailReason).some(reason => reason.error === failure));
        } else {
          assert.deepEqual(yield* Stream.runCollect(Stream.take(left, 2)), [duplicate, duplicate]);
        }
      }));
      yield* roots.source.publisher.publish(event(2));
      return yield* Fiber.join(rightWork);
    })).pipe(Effect.provide(graph.layer(Roots))));
    assert.deepEqual(result.map(value => value.completed), [1, 1, 2]);
    assert.ok(retained.publisher);
    const afterClose = await Effect.runPromiseExit(retained.publisher.publish(event(3)));
    assert.ok(Exit.hasInterrupts(afterClose), "the graph's source is no longer live");
  }
});

test("communication: native subscribe acquires before first publication and does not replay old events", async () => {
  const values = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const source = yield* nativeProgress(2);
    yield* source.publisher.publish(event(0));
    const subscription = yield* source.events.subscribe;
    yield* source.publisher.publish(event(1));
    return yield* Stream.runCollect(Stream.take(subscription, 1));
  })));
  assert.deepEqual(values, [event(1)]);
});

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
  const processing = new Error("processing failed"), cleanup = new Error("unsubscribe failed");
  const fixture = progressFixture({ initial: [event(1)], releaseFailure: cleanup });
  const result = await Effect.runPromiseExit(Stream.runDrain(
    Stream.mapEffect(callbackProgress(fixture.source), () => Effect.fail(processing)),
  ));
  assert.ok(Exit.isFailure(result));
  assert.ok(result.cause.reasons.filter(Cause.isFailReason).some(reason => reason.error === processing));
  assert.ok(result.cause.reasons.filter(Cause.isDieReason).some(reason => reason.defect === cleanup));
  assert.deepEqual(fixture.inspect(), { live: 0, acquired: 1, released: 1 });
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
      const seen: number[] = [];
      const reader = yield* Effect.forkScoped(Stream.runCollect(Stream.take(Stream.tap(
        observedProgress(facet), snapshot => Effect.gen(function* () {
          seen.push(snapshot.values.completed);
          yield* Deferred.succeed(ready, undefined);
        }),
      ), 2)));
      yield* Deferred.await(ready);
      assert.equal(liveSubscriptions(facet), 1);
      store.set({ unrelated: "b" });
      yield* Effect.promise(() => delivered({ stores: [facet] }));
      assert.deepEqual(seen, [0]);
      store.set({ completed: 1 });
      store.set({ completed: 2 });
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
      let completed = false;
      const reader = yield* Effect.forkScoped(Stream.runDrain(Stream.tap(
        observedProgress(facet), () => Deferred.succeed(ready, undefined),
      )).pipe(Effect.andThen(Effect.sync(() => { completed = true; }))));
      yield* Deferred.await(ready);
      store.close();
      yield* Effect.promise(() => delivered({ stores: [facet] }));
      assert.equal(liveSubscriptions(facet), 0);
      assert.equal(reports.length, 1);
      assert.equal(completed, false);
      yield* Fiber.interrupt(reader);
      assert.equal(completed, false);
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
