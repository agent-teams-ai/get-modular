import type { Resources } from "@get-modular/resources";
import { asyncDetection as detection, later } from "../delivery/context.js";
import { pending } from "../delivery/pending.js";
import { realNow } from "../delivery/platform.js";
import { invalidArgument, ObservationError } from "../errors/errors.js";
import { engineInfo, type EngineInfo } from "../store/registry.js";
import type { ReadonlyStore } from "../store/types.js";

export type WaitOptions = {
  /** Prefer the stores under test. An omitted list waits for this installed package copy. */
  readonly stores?: readonly ReadonlyStore<object>[];
  /** Ends this wait with observation.testing.timeout; does not remove its deadline. */
  readonly signal?: AbortSignal;
  /** Defaults to 5000 ms of real time. Only explicit Infinity removes the deadline. */
  readonly timeoutMs?: number;
};
/** True where asynchronous echoes/cascades are detected through AsyncLocalStorage. */
export const asyncDetection: boolean = detection;
export function liveSubscriptions(store: ReadonlyStore<object>, resources?: Resources): number {
  return engineInfo(store).liveIn(resources);
}
function checkedWait(value: unknown): { readonly infos: readonly EngineInfo[] | undefined; readonly timeout: number } {
  if (typeof value !== "object" || value === null) {throw invalidArgument("wait options must be an object");}
  const options = value as WaitOptions;
  const suppliedTimeout = options.timeoutMs;
  const timeout = suppliedTimeout === undefined ? 5000 : suppliedTimeout;
  if (typeof timeout !== "number" || !(timeout > 0)) {throw invalidArgument("timeoutMs must be a positive number or Infinity");}
  if (options.signal !== undefined && !(options.signal instanceof AbortSignal)) {throw invalidArgument("signal must be an AbortSignal");}
  if (options.stores !== undefined && !Array.isArray(options.stores)) {throw invalidArgument("stores must be an array");}
  return { infos: options.stores?.map(engineInfo), timeout };
}
function quiet(infos: readonly EngineInfo[] | undefined, includeLoads: boolean): boolean {
  if (infos === undefined) {return pending.flushes === 0 && (!includeLoads || pending.loads === 0);}
  return infos.every((info) => !info.pendingFlush() && (!includeLoads || info.pendingLoads() === 0));
}
async function waitUntil(options: WaitOptions, includeLoads: boolean, what: string): Promise<void> {
  const { infos, timeout } = checkedWait(options);
  const deadline = realNow() + timeout;
  for (;;) {
    await new Promise<void>((resolve) => { later(resolve); });
    if (options.signal?.aborted === true) {
      throw new ObservationError("observation.testing.timeout", `${what} was abandoned: the signal aborted`, { cause: options.signal.reason });
    }
    if (realNow() > deadline) {
      throw new ObservationError("observation.testing.timeout", `${what} did not happen within ${timeout} ms; another store may commit every task, or a load stays open (pass { stores })`);
    }
    if (quiet(infos, includeLoads)) {return;}
  }
}
/** Wait through pending delivery tasks and their callback microtasks, without awaiting active loaders. */
export async function delivered(options: WaitOptions = {}): Promise<void> { await waitUntil(options, false, "delivered()"); }
/** Like delivered(), and additionally await running/queued loaders. These waits belong only in tests. */
export async function settled(options: WaitOptions = {}): Promise<void> { await waitUntil(options, true, "settled()"); }
