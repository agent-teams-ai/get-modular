/** A consumer-owned occurrence contract. No GM or Effect dependency. */
export type ProgressEvent = { readonly jobId: string; readonly completed: number };
export type ProgressListener = (event: ProgressEvent) => undefined;

/**
 * Borrowed, synchronous, live notifications; duplicates are separate occurrences.
 * subscribe may emit synchronously. On throw it rolls back its own partial work.
 * The returned disposer detaches this listener only. No replay, completion,
 * asynchronous processing acknowledgement, or durable-delivery promise.
 */
export interface ProgressSource {
  readonly subscribe: (listener: ProgressListener) => () => void;
}

/** Test source for the recipes, not a shared events implementation. */
export function progressFixture(options: {
  readonly initial?: readonly ProgressEvent[];
  readonly acquireFailure?: unknown;
  readonly releaseFailure?: unknown;
} = {}) {
  const listeners = new Set<ProgressListener>();
  let acquired = 0;
  let released = 0;
  let lastListener: ProgressListener | undefined;
  const source: ProgressSource = {
    subscribe: listener => {
      listeners.add(listener);
      lastListener = listener;
      try {
        for (const event of options.initial ?? []) listener(event);
        if (options.acquireFailure !== undefined) throw options.acquireFailure;
      } catch (error) {
        listeners.delete(listener);
        throw error;
      }
      acquired += 1;
      let closed = false;
      return () => {
        if (closed) throw new Error("duplicate subscription release");
        closed = true;
        listeners.delete(listener);
        released += 1;
        if (options.releaseFailure !== undefined) throw options.releaseFailure;
      };
    },
  };
  return {
    source,
    emit(event: ProgressEvent): void { for (const listener of [...listeners]) listener(event); },
    // Deliberately exercise a foreign callback retained after unsubscribe.
    late(event: ProgressEvent): void { lastListener?.(event); },
    inspect: () => ({ live: listeners.size, acquired, released }),
  };
}
