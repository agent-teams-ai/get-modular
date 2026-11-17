/** A consumer-owned occurrence contract. No GM or Effect dependency. */
export type ProgressEvent = { readonly jobId: string; readonly completed: number };
export type ProgressListener = (event: ProgressEvent) => undefined;

/**
 * Borrowed, synchronous, live notifications; duplicates are separate occurrences.
 * subscribe may emit synchronously. On throw it rolls back its own partial work.
 * The returned disposer detaches this listener only. No replay, completion,
 * asynchronous processing acknowledgement, or durable-delivery promise.
 * The producer keeps admitted records stable; readonly is not a runtime snapshot.
 */
export interface ProgressSource {
  readonly subscribe: (listener: ProgressListener) => () => void;
}

/** Test source for the recipes, not a shared events implementation. */
export function progressFixture(options: {
  /** Fresh synchronous occurrences injected per registration, not retained history. */
  readonly initial?: readonly ProgressEvent[];
  readonly acquireFailure?: unknown;
  readonly releaseFailure?: unknown;
} = {}) {
  const listeners = new Set<ProgressListener>();
  let acquired = 0;
  let released = 0;
  let lastReleasedListener: ProgressListener | undefined;
  const source: ProgressSource = {
    subscribe: listener => {
      // Registration identity belongs to the subscription, not the callback.
      const entry: ProgressListener = event => listener(event);
      listeners.add(entry);
      try {
        for (const event of options.initial ?? []) entry(event);
        if (options.acquireFailure !== undefined) throw options.acquireFailure;
      } catch (error) {
        listeners.delete(entry);
        throw error;
      }
      acquired += 1;
      let closed = false;
      return () => {
        if (closed) throw new Error("duplicate subscription release");
        closed = true;
        listeners.delete(entry);
        lastReleasedListener = entry;
        released += 1;
        if (options.releaseFailure !== undefined) throw options.releaseFailure;
      };
    },
  };
  return {
    source,
    emit(event: ProgressEvent): void { for (const listener of [...listeners]) listener(event); },
    // Deliberately exercise a foreign callback retained after unsubscribe.
    late(event: ProgressEvent): void { lastReleasedListener?.(event); },
    inspect: () => ({ live: listeners.size, acquired, released }),
  };
}
