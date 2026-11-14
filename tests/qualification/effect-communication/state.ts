import type { ReadonlyStore, Snapshot } from "@get-modular/observation";
import { createScope } from "@get-modular/resources";
import { Effect, Queue, Stream } from "effect";

export type ProgressState = { readonly completed: number };
export type ProgressSnapshot = Snapshot<ProgressState>;

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
 */
export function observedProgress(source: ReadonlyStore<ProgressState>): Stream.Stream<ProgressSnapshot> {
  return Stream.callback<ProgressSnapshot>(queue => Effect.flatMap(
    Effect.acquireRelease(Effect.sync(() => createScope({ name: "effect/progress-watch" })), closeWatchScope),
    scope => Effect.sync(() => {
      const initial = source.read(["completed"]);
      source.watch(initial, {
        name: "progress/latest",
        resources: scope.resources,
        onChange: snapshot => {
          if (!scope.resources.signal.aborted) Queue.offerUnsafe(queue, snapshot);
          return undefined;
        },
      });
      // watch never calls back synchronously and follows changes since this read.
      Queue.offerUnsafe(queue, initial);
    }),
  ), { bufferSize: 1, strategy: "sliding" });
}
