import type { Resources } from "@get-modular/resources";
import { currentContext, deliveryTask, MAX_CASCADE_DEPTH, reportedByStore, runInContext,
  type DeliveryContext, type DeliveryOrigin, type Live } from "../delivery/context.js";
import { pending } from "../delivery/pending.js";
import { queueTaskMicrotask } from "../delivery/platform.js";
import { ObservationError } from "../errors/errors.js";
import { checkedKeys, type EngineOptions } from "./arguments.js";
import { engines, origins, type Stats } from "./registry.js";
import { captureRecord, defineRecord, freezeNodes, type Entry, type RawSnapshot } from "./values.js";

export interface Registration {
  readonly id: number;
  readonly origin: DeliveryOrigin;
  readonly keys: readonly string[];
  readonly name: string;
  readonly resources: Resources;
  readonly names: Set<string>;
  depth: number;
  flush(live: Live): void;
  detach(): void;
  release(): void;
}
type Cause = { readonly revision: number; readonly depth: number; readonly live: Live | undefined };
type Counters = { commits: number; visits: number; indexLookups: number; deliveries: number; walked: number;
  loaderCalls: number; loadsActive: number; loadsPending: number };

export class StoreEngine {
  readonly token: object = Object.freeze({});
  readonly options: EngineOptions;
  readonly counters: Counters = { commits: 0, visits: 0, indexLookups: 0, deliveries: 0, walked: 0,
    loaderCalls: 0, loadsActive: 0, loadsPending: 0 };
  readonly #values: Map<string, unknown>;
  readonly #keys: Set<string>;
  readonly #lastTouched = new Map<string, number>();
  readonly #latestRevisionAtDepth = new Map<string, number[]>();
  readonly #lastWriteCause = new Map<string, Cause>();
  readonly #buckets = new Map<string, Set<Registration>>();
  readonly #registrations = new Set<Registration>();
  readonly #dirty = new Set<Registration>();
  readonly #namesByScope = new WeakMap<object, Set<string>>();
  #sequence = 0;
  #closed = false;
  #flushScheduled = false;
  #queuedPublications = 0;

  constructor(entries: readonly Entry[], options: EngineOptions) {
    this.options = options;
    this.#values = new Map(entries);
    this.#keys = new Set(this.#values.keys());
  }
  get closed(): boolean { return this.#closed; }
  get size(): number { return this.#registrations.size; }
  nextId(): number { this.#sequence += 1; return this.#sequence; }
  assertOpen(): void {
    if (this.#closed) throw new ObservationError("observation.store.closed", `store ${this.options.name} is closed`);
  }
  scopeNames(resources: Resources): Set<string> {
    let names = this.#namesByScope.get(resources);
    if (names === undefined) { names = new Set(); this.#namesByScope.set(resources, names); }
    return names;
  }
  scopeCounts(): ReadonlyMap<Resources, number> {
    const counts = new Map<Resources, number>();
    for (const registration of this.#registrations) counts.set(registration.resources, (counts.get(registration.resources) ?? 0) + 1);
    return counts;
  }
  latest(keys: readonly string[]): number {
    let revision = 0;
    for (const key of keys) revision = Math.max(revision, this.#lastTouched.get(key) ?? 0);
    return revision;
  }
  snapshot(keys: readonly string[], revision: number): RawSnapshot {
    const snapshot = Object.freeze({ revision, values: defineRecord(keys.map((key) => [key, this.#values.get(key)] as const)) });
    origins.set(snapshot, { engine: this.token, keys, revision });
    return snapshot;
  }
  read(keys: unknown): RawSnapshot { this.assertOpen(); return this.readOwner(keys); }
  readOwner(keys: unknown): RawSnapshot {
    const checked = checkedKeys(keys, this.#keys);
    return this.snapshot(checked, this.latest(checked));
  }
  missedDepth(keys: readonly string[], revision: number): number {
    let depth = 0;
    for (const key of keys) {
      const slots = this.#latestRevisionAtDepth.get(key);
      if (slots === undefined) continue;
      for (let candidate = MAX_CASCADE_DEPTH; candidate > depth; candidate -= 1) {
        if ((slots[candidate] ?? 0) > revision) { depth = candidate; break; }
      }
    }
    return depth;
  }
  initialLoadDepth(keys: readonly string[]): number {
    const context = currentContext();
    if (context === undefined) return 0;
    let depth = context.depth;
    for (const key of keys) {
      const cause = this.#lastWriteCause.get(key);
      if (cause?.live === context.live) depth = Math.max(depth, cause.depth);
    }
    return depth;
  }
  attach(registration: Registration): void {
    this.#registrations.add(registration);
    for (const key of registration.keys) {
      let bucket = this.#buckets.get(key);
      if (bucket === undefined) { bucket = new Set(); this.#buckets.set(key, bucket); }
      bucket.add(registration);
    }
    registration.names.add(registration.name);
    registration.resources.signal.addEventListener("abort", registration.detach, { once: true });
  }
  unlink(registration: Registration): void {
    this.#registrations.delete(registration);
    this.#dirty.delete(registration);
    for (const key of registration.keys) {
      const bucket = this.#buckets.get(key);
      bucket?.delete(registration);
      if (bucket?.size === 0) this.#buckets.delete(key);
    }
    registration.names.delete(registration.name);
    registration.resources.signal.removeEventListener("abort", registration.detach);
  }
  markDirty(registration: Registration): void { this.#dirty.add(registration); this.schedule(); }
  report(name: string, revision: number, cause: unknown): void {
    try { this.options.reportError(Object.freeze({ source: this.options.name, subscription: name, revision, cause })); }
    catch (failure) { queueTaskMicrotask(() => { throw failure; }); }
  }
  #reportFailure(name: string, revision: number, cause: unknown): void {
    if (typeof cause !== "object" || cause === null || !reportedByStore.has(cause)) this.report(name, revision, cause);
  }
  /** Isolate both callback execution and return inspection under its existing context window. */
  invoke(context: DeliveryContext, revision: number, callback: () => unknown): void {
    const { name } = context.origin;
    let result: unknown;
    try { result = runInContext(context, callback); }
    catch (cause) { this.#reportFailure(name, revision, cause); return; }
    if (result === undefined) return;
    this.report(name, revision, new ObservationError("observation.callback.returned-value", `${name} returned a value`));
    try {
      runInContext(context, () => { this.#observeReturn(result, context, revision); });
    } catch (cause) { this.#reportFailure(name, revision, cause); }
  }
  #observeReturn(result: unknown, context: DeliveryContext, revision: number): void {
    if (result === null || (typeof result !== "object" && typeof result !== "function")) return;
    const then: unknown = Reflect.get(result, "then");
    if (typeof then !== "function") return;
    // Capture then once. Its assimilation job re-enters the same token, including synchronous-only runtimes.
    const observed = Promise.resolve({ then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void): void => {
      runInContext(context, () => { Reflect.apply(then, result, [resolve, reject]); });
    } });
    void observed.catch((cause: unknown) => { this.#reportFailure(context.origin.name, revision, cause); });
  }
  schedule(): void {
    if (this.#flushScheduled) return;
    this.#flushScheduled = true;
    pending.flushes += 1;
    deliveryTask((live) => { this.#flush(live); }, () => {});
  }
  #flush(live: Live): void {
    this.#flushScheduled = false;
    pending.flushes -= 1;
    const batch = [...this.#dirty].sort((a, b) => a.id - b.id);
    this.#dirty.clear();
    for (const registration of batch) {
      if (this.#closed) return;
      registration.flush(live);
    }
  }
  publish(run: (live: Live) => void): void {
    this.#queuedPublications += 1;
    pending.flushes += 1;
    deliveryTask(run, () => { this.#queuedPublications -= 1; pending.flushes -= 1; });
  }
  #guard(changed: readonly Entry[], context: DeliveryContext | undefined, depth: number): void {
    if (context === undefined) return;
    let error: ObservationError | undefined;
    if (context.origin.engine === this.token && changed.some(([key]) => context.origin.keys.includes(key))) {
      error = new ObservationError("observation.delivery.echo", `${context.origin.name} changed a key of ${this.options.name} which it follows`);
    } else if (depth > MAX_CASCADE_DEPTH) {
      error = new ObservationError("observation.delivery.cascade", `a commit to ${this.options.name} is ${depth} delivery steps deep (limit ${MAX_CASCADE_DEPTH}), started from ${context.origin.name}`);
    }
    if (error !== undefined) {
      reportedByStore.add(error);
      this.report(context.origin.name, this.counters.commits, error);
      throw error;
    }
  }
  set(patch: unknown): number {
    this.assertOpen();
    const nodes = new Set<object>();
    const entries = captureRecord(patch, "patch", nodes);
    for (const [key] of entries) {
      if (!this.#keys.has(key)) throw new ObservationError("observation.keys.unknown", `unknown key: ${key}`);
    }
    const changed = entries.filter(([key, value]) => !Object.is(this.#values.get(key), value));
    if (changed.length === 0) return this.counters.commits;
    const context = currentContext();
    const depth = context === undefined ? 0 : context.depth + 1;
    this.#guard(changed, context, depth);
    freezeNodes(nodes);
    this.counters.walked += nodes.size;
    this.counters.commits += 1;
    for (const [key, value] of changed) {
      this.#values.set(key, value);
      this.#touch(key, depth, context?.live);
    }
    this.schedule();
    return this.counters.commits;
  }
  #touch(key: string, depth: number, live: Live | undefined): void {
    const revision = this.counters.commits;
    this.#lastTouched.set(key, revision);
    let slots = this.#latestRevisionAtDepth.get(key);
    if (slots === undefined) { slots = Array<number>(MAX_CASCADE_DEPTH + 1).fill(0); this.#latestRevisionAtDepth.set(key, slots); }
    slots[depth] = revision;
    this.#lastWriteCause.set(key, { revision, depth, live });
    this.counters.indexLookups += 1;
    for (const registration of this.#buckets.get(key) ?? []) {
      this.counters.visits += 1;
      registration.depth = Math.max(registration.depth, depth);
      this.#dirty.add(registration);
    }
  }
  close(): undefined {
    if (this.#closed) return undefined;
    this.#closed = true;
    this.#dirty.clear();
    this.#latestRevisionAtDepth.clear();
    this.#lastWriteCause.clear();
    for (const registration of [...this.#registrations]) {
      this.report(registration.name, this.counters.commits,
        new ObservationError("observation.source.closed", `store ${this.options.name} closed before ${registration.name}`));
      registration.detach();
      registration.release();
    }
    return undefined;
  }
  register(target: object): void {
    engines.set(target, {
      stats: (): Stats => Object.freeze({ ...this.counters, live: this.#registrations.size, dirty: this.#dirty.size, buckets: this.#buckets.size, pendingDeliveries: Number(this.#flushScheduled) + this.#queuedPublications }),
      liveIn: (resources) => resources === undefined ? this.#registrations.size : this.#namesByScope.get(resources)?.size ?? 0,
      pendingFlush: () => this.#flushScheduled || this.#queuedPublications > 0,
      pendingLoads: () => this.counters.loadsActive + this.counters.loadsPending,
    });
  }
}
