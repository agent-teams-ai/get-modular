import { invalidArgument, ObservationError } from "../errors/errors.js";

export type Origin = { readonly engine: object; readonly keys: readonly string[]; readonly revision: number };
export type Stats = {
  readonly commits: number; readonly visits: number; readonly indexLookups: number; readonly deliveries: number;
  readonly live: number; readonly dirty: number; readonly buckets: number; readonly walked: number;
  readonly pendingDeliveries: number; readonly loaderCalls: number; readonly loadsActive: number; readonly loadsPending: number;
};
export type EngineInfo = {
  readonly stats: () => Stats;
  readonly liveIn: (resources?: object) => number;
  readonly pendingFlush: () => boolean;
  readonly pendingLoads: () => number;
};
export const origins: WeakMap<object, Origin> = new WeakMap();
export const engines: WeakMap<object, EngineInfo> = new WeakMap();
export function engineInfo(value: unknown): EngineInfo {
  const info = typeof value === "object" && value !== null ? engines.get(value) : undefined;
  if (info === undefined) {throw invalidArgument("not a store of this package copy");}
  return info;
}
export function originOf(candidate: unknown, token: object): Origin {
  const origin = typeof candidate === "object" && candidate !== null ? origins.get(candidate) : undefined;
  if (origin === undefined || origin.engine !== token) {
    throw new ObservationError("observation.snapshot.foreign", "pass a snapshot that this store returned");
  }
  return origin;
}
/** Internal operation counters; neither public entrypoint exports this hook. */
export function storeStats(storeOrFacet: object): Stats { return engineInfo(storeOrFacet).stats(); }
