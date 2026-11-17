/** A consumer-owned occurrence contract. No GM or Effect dependency. */
export type ProgressEvent = { readonly jobId: string; readonly completed: number };
export type ProgressListener = (event: ProgressEvent) => undefined;

/**
 * Borrowed, synchronous, live notifications; duplicates are separate occurrences.
 * subscribe may emit synchronously. On throw it rolls back its own partial work.
 * The returned synchronous disposer detaches this subscription only. No replay, completion,
 * asynchronous processing acknowledgement, or durable-delivery promise.
 * The producer keeps admitted records stable; readonly is not a runtime snapshot.
 */
export interface ProgressSource {
  readonly subscribe: (listener: ProgressListener) => () => undefined;
}

/** Test source for the recipes, not a shared events implementation. */
export function progressFixture(options: {
  /** Injected synchronously during each acquisition, not replayed publication history. */
  readonly initial?: readonly ProgressEvent[];
  readonly acquireFailure?: unknown;
  readonly releaseFailure?: unknown;
} = {}) {
  const listeners = new Set<ProgressListener>();
  let acquired = 0;
  let released = 0;
  let lastRetired: ProgressListener | undefined;
  const source: ProgressSource = {
    subscribe: listener => {
      // Subscription ownership is distinct even when the callback is reused.
      const registration: ProgressListener = event => listener(event);
      listeners.add(registration);
      try {
        for (const event of options.initial ?? []) registration(event);
        if (Object.hasOwn(options, "acquireFailure")) throw options.acquireFailure;
      } catch (error) {
        listeners.delete(registration);
        lastRetired = registration;
        throw error;
      }
      acquired += 1;
      let closed = false;
      return () => {
        if (closed) throw new Error("duplicate subscription release");
        closed = true;
        listeners.delete(registration);
        lastRetired = registration;
        released += 1;
        if (Object.hasOwn(options, "releaseFailure")) throw options.releaseFailure;
        return undefined;
      };
    },
  };
  return {
    source,
    emit(event: ProgressEvent): void { for (const listener of [...listeners]) listener(event); },
    // Deliberately exercise the most recently retired foreign callback.
    late(event: ProgressEvent): void { lastRetired?.(event); },
    inspect: () => ({ live: listeners.size, acquired, released }),
  };
}
