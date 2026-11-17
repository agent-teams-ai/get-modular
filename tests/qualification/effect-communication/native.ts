import { Effect, PubSub, Stream, type Scope } from "effect";
import type { ProgressEvent } from "./progress.ts";

/** Native technical facet: deliberately NOT an Effect-neutral interface. */
export interface ProgressEvents {
  /**
   * Acquire and consume inside one consumer-owned Effect.scoped operation.
   * Completing only the Stream does not close a longer-lived acquisition Scope.
   */
  readonly subscribe: Effect.Effect<Stream.Stream<ProgressEvent>, never, Scope.Scope>;
}
export interface ProgressPublisher {
  /**
   * Waits while the bounded hub is full; returns false after source shutdown.
   * Admission to live subscribers is NOT acknowledgement of business processing.
   */
  readonly publish: (event: ProgressEvent) => Effect.Effect<boolean>;
}
export interface NativeProgressOwner {
  readonly events: ProgressEvents;
  readonly publisher: ProgressPublisher;
}

/** One source owner; subscriber scopes release subscriptions, never this hub. */
export function nativeProgress(capacity = 16): Effect.Effect<NativeProgressOwner, never, Scope.Scope> {
  return Effect.suspend(() => {
    if (!Number.isSafeInteger(capacity) || capacity < 1) return Effect.die(new RangeError("positive capacity required"));
    return Effect.map(Effect.acquireRelease(PubSub.bounded<ProgressEvent>(capacity), PubSub.shutdown), hub => ({
      events: {
        subscribe: Effect.map(PubSub.subscribe(hub), subscription => Stream.fromEffectRepeat(PubSub.take(subscription))),
      },
      publisher: { publish: (event: ProgressEvent) => PubSub.publish(hub, event) },
    }));
  });
}
