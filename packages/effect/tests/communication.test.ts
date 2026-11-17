import assert from "node:assert/strict";
import test from "node:test";
import { declareModule, defineContract, type CapabilitiesOf } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { Cause, Context, Deferred, Effect, Exit, Fiber, Stream } from "effect";
import { effectFor, implement } from "../dist/index.js";
import { nativeProgress, type NativeProgressOwner, type ProgressEvents, type ProgressPublisher } from "../../../tests/qualification/effect-communication/native.ts";
import type { ProgressEvent } from "../../../tests/qualification/effect-communication/progress.ts";

const event = (completed: number): ProgressEvent => ({ jobId: "example", completed });
const Events = defineContract<ProgressEvents>()({ id: "recipes/progress", revision: 1 });
interface Ports extends CapabilitiesOf<typeof Events> {}
class Roots extends Context.Service<Roots, {
  readonly source: NativeProgressOwner;
  readonly left: ProgressEvents;
  readonly right: ProgressEvents;
}>()("recipes/Roots") {}
const owner = { authority: "recipes", path: ["progress"] };

async function nativeGraph(capacity = 4) {
  const source = implement<Ports>()(declareModule({ moduleId: "recipes/source", implementationId: "recipes/source",
    owner, provides: [Events.provide()], slots: [] }), () => Effect.map(nativeProgress(capacity), value => ({
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


test("communication: GM backpressure resumes after the slow consumer is cancelled, without losing sibling delivery", { timeout: 10000 }, async () => {
  const graph = await nativeGraph(2);
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
      const blocked = yield* Effect.forkScoped(roots.source.publisher.publish(event(3)), { startImmediately: true });
      yield* Deferred.await(firstTwo);
      assert.equal(blocked.pollUnsafe(), undefined, "publication really waits for the full slow subscription");
      yield* Fiber.interrupt(slow);
      assert.equal(yield* Fiber.join(blocked), true, "consumer-scope retirement releases backpressure");
      for (let completed = 4; completed <= 32; completed += 1) {
        assert.equal(yield* roots.source.publisher.publish(event(completed)), true);
      }
      assert.deepEqual((yield* Fiber.join(fast)).map(value => value.completed),
        Array.from({ length: 32 }, (_, index) => index + 1));
    })).pipe(Effect.provide(graph.layer(Roots))));
    assert.ok(retained.publisher);
    assert.equal(await Effect.runPromise(retained.publisher.publish(event(round))), false);
  }
});
