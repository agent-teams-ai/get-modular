/** Structural platform boundary: production imports no runtime-specific module. */
type BuiltinRuntime = { readonly getBuiltinModule?: (id: string) => unknown };
type TaskScheduler = (callback: () => void) => unknown;
export type ContextStorage<T> = {
  readonly run: <R>(context: T, callback: () => R) => R;
  readonly getStore: () => T | undefined;
  readonly exit: <R>(callback: () => R) => R;
};
const runtime = (globalThis as { readonly process?: BuiltinRuntime }).process;
function builtin(name: string): unknown {
  return typeof runtime?.getBuiltinModule === "function" ? runtime.getBuiltinModule(name) : undefined;
}
const timers = builtin("node:timers") as { readonly setImmediate?: unknown } | undefined;
const hooks = builtin("node:async_hooks") as {
  readonly AsyncLocalStorage?: new <T>() => ContextStorage<T>;
} | undefined;
const clockModule = builtin("node:perf_hooks") as {
  readonly performance?: { readonly now?: () => number };
} | undefined;

export const scheduleTask: TaskScheduler = (() => {
  const fromTimers = timers?.setImmediate;
  if (typeof fromTimers === "function") {return (callback) => { Reflect.apply(fromTimers, undefined, [callback]); };}
  const immediate = (globalThis as { readonly setImmediate?: unknown }).setImmediate;
  if (typeof immediate === "function") {return (callback) => { Reflect.apply(immediate, globalThis, [callback]); };}
  const timeout = globalThis.setTimeout;
  return (callback) => timeout(callback, 0);
})();
export const realNow: () => number = (() => {
  const clock = typeof clockModule?.performance?.now === "function" ? clockModule.performance : globalThis.performance;
  return typeof clock.now === "function" ? clock.now.bind(clock) : Date.now;
})();
const microtask = globalThis.queueMicrotask;
export const queueTaskMicrotask: (callback: () => void) => void =
  typeof microtask === "function" ? microtask.bind(globalThis) : (callback) => { scheduleTask(callback); };

export function createContextStorage<T>(): ContextStorage<T> | undefined {
  const Storage = hooks?.AsyncLocalStorage;
  return typeof Storage === "function" ? new Storage<T>() : undefined;
}
