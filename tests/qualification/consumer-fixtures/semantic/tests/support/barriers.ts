export interface Barrier {
  readonly reached: Promise<void>;
  readonly release: () => void;
}

export function barrier(): Barrier {
  const gate = Promise.withResolvers<void>();
  return { reached: gate.promise, release: () => gate.resolve() };
}

export function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise(resolve => signal.addEventListener("abort", () => resolve(), { once: true }));
}
