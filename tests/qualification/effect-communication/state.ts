import type { ReadonlyStore } from "@get-modular/observation";
import { createScope } from "@get-modular/resources";
import { Effect, Queue, Stream } from "effect";
import { watchProgress, type ProgressSnapshot, type ProgressState, type ProgressSubscriptionLimit } from "./watch-progress.ts";

/** Only the bridge-owned watch scope is closed. No timeout or automatic retry. */
export function closeWatchScope(scope: ReturnType<typeof createScope>): Effect.Effect<void> {
  return Effect.flatMap(Effect.promise(() => scope.control.close()), report =>
    report.complete && report.settled
      ? Effect.void
      : Effect.die(new Error("Observation bridge cleanup incomplete", { cause: report })));
}

/**
 * One-way latest-state projection, not occurrence delivery or an adaptation of load.
 * The source owner MUST outlive consumption. Unexpected source close is reported
 * by Observation to its owner, not as completion of this Stream.
 * Watch capacity refusal is expected; other acquisition/cleanup errors are defects.
 */
export function observedProgress(source: ReadonlyStore<ProgressState>): Stream.Stream<ProgressSnapshot, ProgressSubscriptionLimit> {
  return Stream.callback<ProgressSnapshot, ProgressSubscriptionLimit>(queue => Effect.flatMap(
    Effect.acquireRelease(Effect.sync(() => createScope({ name: "effect/progress-watch" })), closeWatchScope),
    scope => Effect.flatMap(Effect.sync(() => {
      const admission = watchProgress(source, {
        name: "progress/latest",
        resources: scope.resources,
        onChange: snapshot => {
          if (!scope.resources.signal.aborted) Queue.offerUnsafe(queue, snapshot);
          return undefined;
        },
      });
      // Keep read, registration and initial delivery in one synchronous section.
      // A refused watch must not let take(1) hide failed admission.
      if (admission.status === "subscribed") Queue.offerUnsafe(queue, admission.initial);
      return admission;
    }), admission => admission.status === "refused" ? Effect.fail(admission.failure) : Effect.void),
  ), { bufferSize: 1, strategy: "sliding" });
}
