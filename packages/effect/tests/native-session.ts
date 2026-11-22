import { declareModule, defineContract, type CapabilitiesOf } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { Context, Deferred, Effect, Fiber, Stream } from "effect";
import { effectFor, implement } from "../dist/index.js";
import { nativeProgress, type NativeProgressOwner, type ProgressEvents, type ProgressPublisher } from "../../../tests/qualification/effect-communication/native.ts";
import type { ProgressEvent } from "../../../tests/qualification/effect-communication/progress.ts";

const Events = defineContract<ProgressEvents>()({ id: "recipes/progress", revision: 1 });
interface Ports extends CapabilitiesOf<typeof Events> {}
export class ProgressRoots extends Context.Service<ProgressRoots, {
  readonly source: NativeProgressOwner;
  readonly left: ProgressEvents;
  readonly right: ProgressEvents;
}>()("recipes/Roots") {}
const owner = { authority: "recipes", path: ["progress"] };

/** Preparation selects one source; each execution owns a fresh native lifetime. */
export async function prepareProgressGraph(capacity = 4) {
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
  if (result.status !== "prepared") throw new Error("progress preparation failed", { cause: result });
  return result.prepared;
}

/** A finite Host: ready readers, two local sessions, joined work, then source close. */
export async function runNativeProgressExample() {
  const graph = await prepareProgressGraph();
  let publisher: ProgressPublisher | undefined;
  const sessions = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const roots = yield* ProgressRoots;
    publisher = roots.source.publisher;
    const ready = yield* Deferred.make<void>();
    const sibling = yield* Effect.forkScoped(Effect.scoped(Effect.gen(function* () {
      const events = yield* roots.right.subscribe;
      yield* Deferred.succeed(ready, undefined);
      return yield* Stream.runCollect(Stream.take(events, 3));
    })));
    yield* Effect.raceFirst(Deferred.await(ready), Fiber.join(sibling));
    const first = yield* Effect.scoped(Effect.gen(function* () {
      const events = yield* roots.left.subscribe;
      const reader = yield* Effect.forkScoped(Stream.runCollect(Stream.take(events, 2)));
      const duplicate: ProgressEvent = Object.freeze({ jobId: "native", completed: 1 });
      for (let occurrence = 0; occurrence < 2; occurrence += 1) {
        if (!(yield* roots.source.publisher.publish(duplicate))) {
          return yield* Effect.fail(new Error("progress source closed before publication"));
        }
      }
      return yield* Fiber.join(reader);
    }));
    // The first subscription is closed; its sibling and the source are still live.
    const fresh = yield* Effect.scoped(Effect.gen(function* () {
      const events = yield* roots.left.subscribe;
      if (!(yield* roots.source.publisher.publish({ jobId: "native", completed: 2 }))) {
        return yield* Effect.fail(new Error("progress source closed before publication"));
      }
      return yield* Stream.runCollect(Stream.take(events, 1));
    }));
    return { first, fresh, sibling: yield* Fiber.join(sibling) };
  })).pipe(Effect.provide(graph.layer(ProgressRoots))));
  if (publisher === undefined) throw new Error("progress source was not constructed");
  // A retained publisher can observe refusal; it does not keep its resource alive.
  const afterClose = await Effect.runPromise(publisher.publish({ jobId: "native", completed: 3 }));
  return { ...sessions, afterClose };
}
