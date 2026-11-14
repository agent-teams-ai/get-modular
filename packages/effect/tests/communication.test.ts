import assert from "node:assert/strict";
import test from "node:test";
import { declareModule, defineContract, type CapabilitiesOf } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { Cause, Context, Effect, Exit, Fiber, Stream } from "effect";
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
