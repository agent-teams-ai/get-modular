import { Cause, Effect, Queue, Stream } from "effect";
import type { ProgressEvent, ProgressSource } from "./progress.ts";

export type ProgressFailure =
  | { readonly _tag: "SubscribeFailed"; readonly cause: unknown }
  | { readonly _tag: "ProgressOverflow"; readonly capacity: number };

/**
 * One foreign subscription per stream consumption. Bounded and fail-on-overflow:
 * a synchronous callback cannot await native backpressure. The borrowed source
 * must outlive the consumer; no source-close or completion event is invented.
 */
export function callbackProgress(source: ProgressSource, capacity = 16): Stream.Stream<ProgressEvent, ProgressFailure> {
  if (!Number.isSafeInteger(capacity) || capacity < 1) throw new RangeError("positive capacity required");
  return Stream.unwrap(Effect.gen(function* () {
    const queue = yield* Effect.acquireRelease(
      Queue.make<ProgressEvent, ProgressFailure>({ capacity, strategy: "dropping" }),
      Queue.shutdown,
    );
    let accepting = true;
    // Finish acquisition before exposing any occurrence. Relaying its error into
    // the queue could hide it behind take(1) or an earlier overflow failure.
    yield* Effect.acquireRelease(
      Effect.try({
        try: () => source.subscribe(event => {
          if (accepting && !Queue.offerUnsafe(queue, event)) {
            accepting = false;
            const failure: ProgressFailure = { _tag: "ProgressOverflow", capacity };
            Queue.failCauseUnsafe(queue, Cause.fail(failure));
            // Discard the prefix too: do not keep processing after a known gap.
            Queue.shutdownUnsafe(queue);
          }
          return undefined;
        }),
        catch: (cause): ProgressFailure => ({ _tag: "SubscribeFailed", cause }),
      }),
      unsubscribe => Effect.sync(() => {
        accepting = false;
        unsubscribe(); // A failed disposer remains a native defect, not success.
      }),
    );
    // Single-item pulls leave no unprocessed batch outside the bounded queue.
    return Stream.fromEffectRepeat(Queue.take(queue));
  }));
}
