import assert from "node:assert/strict";
import test from "node:test";
import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, Scope, Stream } from "effect";
import { nativeProgress, type ProgressPublisher } from "../../../tests/qualification/effect-communication/native.ts";
import type { ProgressEvent } from "../../../tests/qualification/effect-communication/progress.ts";
import { prepareProgressGraph, ProgressRoots as Roots, runNativeProgressExample } from "./native-session.ts";

const event = (completed: number): ProgressEvent => ({ jobId: "example", completed });

test("communication: GM selects one native source; early or failed subscriber exit leaves its sibling alive", { timeout: 10000 }, async () => {
  const graph = await prepareProgressGraph();
  for (const failLeft of [false, true]) {
    const retained: { publisher?: ProgressPublisher; left?: Stream.Stream<ProgressEvent> } = {};
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
        retained.left = left;
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
      assert.ok(retained.left);
      const closedReader = yield* Effect.forkScoped(Stream.runDrain(Stream.take(retained.left, 1)));
      assert.ok(Exit.hasInterrupts(yield* Fiber.await(closedReader)), "closed subscriber must be detached");
      yield* roots.source.publisher.publish(event(2));
      return yield* Fiber.join(rightWork);
    })).pipe(Effect.provide(graph.layer(Roots))));
    assert.deepEqual(result.map(value => value.completed), [1, 1, 2]);
    assert.ok(retained.publisher);
    const afterClose = await Effect.runPromise(retained.publisher.publish(event(3)));
    assert.equal(afterClose, false, "the closed source refuses publication");
  }
});

test("communication: native subscribe acquires before first publication and does not replay old events", { timeout: 10000 }, async () => {
  const values = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const source = yield* nativeProgress(2);
    yield* source.publisher.publish(event(0));
    const subscription = yield* source.events.subscribe;
    yield* source.publisher.publish(event(1));
    return yield* Stream.runCollect(Stream.take(subscription, 1));
  })));
  assert.deepEqual(values, [event(1)]);
});


test("communication: GM backpressure resumes after the slow consumer is cancelled, without losing sibling delivery", { timeout: 10000 }, async () => {
  const graph = await prepareProgressGraph(2);
  // Reusing preparation must not retain a subscription or source from the prior graph run.
  for (const round of [1, 2]) {
    const retained: { publisher?: ProgressPublisher } = {};
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const roots = yield* Roots;
      retained.publisher = roots.source.publisher;
      const fastReady = yield* Deferred.make<void>(), slowReady = yield* Deferred.make<void>();
      const firstTwo = yield* Deferred.make<void>();
      const fast = yield* Effect.forkScoped(Effect.scoped(Effect.gen(function* () {
        const stream = yield* roots.right.subscribe;
        yield* Deferred.succeed(fastReady, undefined);
        return yield* Stream.runCollect(Stream.take(Stream.tap(stream, value =>
          value.completed === 2 ? Deferred.succeed(firstTwo, undefined) : Effect.void), 32));
      })));
      const slow = yield* Effect.forkScoped(Effect.scoped(Effect.gen(function* () {
        yield* roots.left.subscribe;
        yield* Deferred.succeed(slowReady, undefined);
        // A real, acquired subscriber deliberately does not consume its queue.
        yield* Effect.never;
      })));
      yield* Effect.raceFirst(Deferred.await(fastReady), Fiber.join(fast));
      yield* Effect.raceFirst(Deferred.await(slowReady), Fiber.join(slow));
      assert.equal(yield* roots.source.publisher.publish(event(1)), true);
      assert.equal(yield* roots.source.publisher.publish(event(2)), true);
      const cancelled = yield* Effect.forkScoped(roots.source.publisher.publish(event(99)), { startImmediately: true });
      yield* Deferred.await(firstTwo);
      assert.equal(cancelled.pollUnsafe(), undefined, "the publication to cancel really waits for capacity");
      yield* Fiber.interrupt(cancelled);
      assert.ok(Exit.hasInterrupts(yield* Fiber.await(cancelled)));
      const blocked = yield* Effect.forkScoped(roots.source.publisher.publish(event(3)), { startImmediately: true });
      assert.equal(blocked.pollUnsafe(), undefined, "publication really waits for the full slow subscription");
      yield* Fiber.interrupt(slow);
      assert.equal(yield* Fiber.join(blocked), true, "consumer-scope retirement releases backpressure");
      for (let completed = 4; completed <= 32; completed += 1) {
        assert.equal(yield* roots.source.publisher.publish(event(completed)), true);
      }
      assert.deepEqual((yield* Fiber.join(fast)).map(value => value.completed),
        Array.from({ length: 32 }, (_, index) => index + 1), "cancelled publication never appears later");
    })).pipe(Effect.provide(graph.layer(Roots))));
    assert.ok(retained.publisher);
    assert.equal(await Effect.runPromise(retained.publisher.publish(event(round))), false);
  }
});

test("communication: forced source retirement interrupts its pending reader and rejects later publication", { timeout: 10000 }, async () => {
  const graph = await prepareProgressGraph(1);
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    // Deliberately retire the source while a separately owned consumer is live.
    // Both scopes still have finalizers if an assertion fails.
    const sourceScope = yield* Effect.acquireRelease(Scope.make(), scope => Scope.close(scope, Exit.void));
    const roots = Context.get(yield* Scope.provide(Layer.build(graph.layer(Roots)), sourceScope), Roots);
    const subscription = yield* roots.left.subscribe;
    const reader = yield* Effect.forkScoped(Stream.runDrain(subscription), { startImmediately: true });
    assert.equal(reader.pollUnsafe(), undefined, "an acquired reader waits before source retirement");
    yield* Scope.close(sourceScope, Exit.void);
    assert.ok(Exit.hasInterrupts(yield* Fiber.await(reader)), "source shutdown interrupts pending reads");
    assert.equal(yield* roots.source.publisher.publish(event(1)), false);
  })));
});

test("communication: complete native session example joins readers before source retirement", { timeout: 10000 }, async () => {
  const result = await runNativeProgressExample();
  assert.deepEqual(result.first, [{ jobId: "native", completed: 1 }, { jobId: "native", completed: 1 }]);
  assert.deepEqual(result.fresh, [{ jobId: "native", completed: 2 }]);
  assert.deepEqual(result.sibling, [...result.first, ...result.fresh]);
  assert.equal(result.afterClose, false);
});
