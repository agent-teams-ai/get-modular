import type { Resources, Scope } from "@get-modular/resources";
import { later, runInContext, type DeliveryOrigin, type Live } from "../delivery/context.js";
import { pending } from "../delivery/pending.js";
import { ObservationError } from "../errors/errors.js";
import type { Admission } from "./admission.js";
import type { Registration, StoreEngine } from "./engine.js";
import type { RawSnapshot } from "./values.js";

export type LoadCallbacks = {
  readonly loader: (snapshot: RawSnapshot, context: { readonly signal: AbortSignal }) => unknown;
  readonly onLoading: (snapshot: RawSnapshot) => unknown;
  readonly onResult: (result: unknown, snapshot: RawSnapshot) => unknown;
  readonly onError: (cause: unknown, snapshot: RawSnapshot) => unknown;
};
type Job = { readonly snapshot: RawSnapshot; readonly revision: number; readonly depth: number };
type Active = { readonly controller: AbortController; readonly settled: Promise<void> };
const noop = (): void => {};

export class LoadRegistration implements Registration {
  readonly id: number;
  readonly origin: DeliveryOrigin;
  readonly keys: readonly string[];
  readonly name: string;
  readonly resources: Resources;
  readonly names: Set<string>;
  depth: number;
  readonly #engine: StoreEngine;
  readonly #callbacks: LoadCallbacks;
  readonly #scope: Scope;
  #open = true;
  #lastOffered = -1;
  #delivered = -1;
  #pending: Job | undefined;
  #active: Active | undefined;
  constructor(engine: StoreEngine, admission: Admission, callbacks: LoadCallbacks) {
    this.#engine = engine;
    this.#callbacks = callbacks;
    this.id = engine.nextId();
    this.keys = admission.origin.keys;
    this.name = admission.name;
    this.resources = admission.resources;
    this.names = admission.names;
    this.origin = Object.freeze({ engine: engine.token, keys: this.keys, name: this.name });
    this.depth = engine.initialLoadDepth(this.keys);
    this.#scope = this.resources.child({ name: `load:${this.name}` });
    void this.#scope.resources.setup({
      name: "drain",
      setup: () => (escalate: AbortSignal) => this.#closeAndDrain(escalate),
      cleanup: (drain, { escalate }) => { this.detach(); return drain(escalate); },
    }).then(noop, (cause: unknown) => {
      if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "resources.scope.closed") {return;}
      engine.report(this.name, this.#lastOffered, cause);
    });
  }
  subscribe(): void { this.#engine.attach(this); this.#engine.markDirty(this); }
  #isOpen(): boolean { return this.#open; }
  readonly detach = (): void => {
    if (!this.#open) {return;}
    this.#open = false;
    this.#engine.unlink(this);
    this.#clearPending();
    if (this.#active !== undefined) {this.#abort(this.#active.controller);}
  };
  release(): void { void this.#scope.control.close(); }
  flush(live: Live): void {
    if (!this.#open) {return;}
    const revision = this.#engine.latest(this.keys);
    const depth = this.depth;
    this.depth = 0;
    if (revision <= this.#delivered) {return;}
    this.#delivered = revision;
    this.#engine.counters.deliveries += 1;
    this.#offer({ revision, depth, snapshot: this.#engine.snapshot(this.keys, revision) }, live);
  }
  #abort(controller: AbortController): void {
    try { controller.abort(); }
    catch (cause) { this.#engine.report(this.name, this.#lastOffered, cause); }
  }
  #isCurrent(job: Job, controller: AbortController): boolean {
    return this.#open && !controller.signal.aborted && job.revision === this.#lastOffered
      && job.revision === this.#engine.latest(this.keys);
  }
  #clearPending(): Job | undefined {
    const job = this.#pending;
    if (job !== undefined) {
      this.#pending = undefined;
      this.#engine.counters.loadsPending -= 1;
      pending.loads -= 1;
    }
    return job;
  }
  #offer(job: Job, live: Live): void {
    if (!this.#open || job.revision <= this.#lastOffered) {return;}
    this.#lastOffered = job.revision;
    this.#engine.invoke({ depth: job.depth, origin: this.origin, live }, job.revision,
      () => this.#callbacks.onLoading(job.snapshot));
    // A callback or its reporter can synchronously close the subscriber or source.
    if (!this.#isOpen()) {return;}
    if (this.#active === undefined) { this.#start(job); return; }
    if (this.#pending === undefined) { this.#engine.counters.loadsPending += 1; pending.loads += 1; }
    this.#pending = job;
    this.#abort(this.#active.controller);
  }
  #publish(job: Job, controller: AbortController, callback: () => unknown): void {
    if (!this.#isCurrent(job, controller)) {return;}
    this.#engine.publish((live) => {
      if (this.#isCurrent(job, controller)) {
        this.#engine.invoke({ depth: job.depth, origin: this.origin, live }, job.revision, callback);
      }
    });
  }
  #start(job: Job): void {
    const controller = new AbortController();
    this.#engine.counters.loadsActive += 1;
    pending.loads += 1;
    const settled = this.#run(job, controller).finally(() => {
      this.#engine.counters.loadsActive -= 1;
      pending.loads -= 1;
      this.#active = undefined;
      const next = this.#clearPending();
      if (this.#open && next !== undefined) {this.#start(next);}
    });
    this.#active = { controller, settled };
  }
  async #run(job: Job, controller: AbortController): Promise<void> {
    await Promise.resolve();
    // Also checks the current store revision: a newer commit may not have flushed yet.
    if (!this.#isCurrent(job, controller)) {return;}
    const runLive: Live = { open: true };
    this.#engine.counters.loaderCalls += 1;
    let callback: () => unknown;
    try {
      const value = await runInContext({ depth: job.depth, origin: this.origin, live: runLive },
        () => this.#callbacks.loader(job.snapshot, Object.freeze({ signal: controller.signal })));
      callback = () => this.#callbacks.onResult(value, job.snapshot);
    } catch (cause) {
      callback = () => this.#callbacks.onError(cause, job.snapshot);
    } finally { runLive.open = false; }
    // Queued publication is delivery work, independent from physical loader completion.
    this.#publish(job, controller, callback);
  }
  async #closeAndDrain(escalate: AbortSignal): Promise<void> {
    this.detach();
    const active = this.#active;
    if (active === undefined) {return;}
    let onEscalate = noop;
    const escalated = new Promise<"escalated">((resolve) => {
      onEscalate = () => { resolve("escalated"); };
      if (escalate.aborted) {onEscalate();}
      else {escalate.addEventListener("abort", onEscalate, { once: true });}
    });
    const outcome = await Promise.race([active.settled.then(() => "drained"), escalated]);
    escalate.removeEventListener("abort", onEscalate);
    if (outcome === "drained") {return;}
    await new Promise<void>((resolve) => { later(resolve); });
    if (this.#active !== undefined) {
      throw new ObservationError("observation.load.still-running", `load ${this.name} is still running after escalation`);
    }
  }
}
