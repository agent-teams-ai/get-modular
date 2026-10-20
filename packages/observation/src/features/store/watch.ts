import type { Resources } from "@get-modular/resources";
import type { DeliveryOrigin, Live } from "../delivery/context.js";
import type { Admission } from "./admission.js";
import type { Registration, StoreEngine } from "./engine.js";
import type { RawSnapshot } from "./values.js";

export class WatchRegistration implements Registration {
  readonly id: number;
  readonly origin: DeliveryOrigin;
  readonly keys: readonly string[];
  readonly name: string;
  readonly resources: Resources;
  readonly names: Set<string>;
  depth: number;
  readonly #engine: StoreEngine;
  readonly #onChange: (snapshot: RawSnapshot) => unknown;
  #delivered: number;
  #attached = true;
  constructor(engine: StoreEngine, admission: Admission, onChange: (snapshot: RawSnapshot) => unknown) {
    this.#engine = engine;
    this.id = engine.nextId();
    this.keys = admission.origin.keys;
    this.name = admission.name;
    this.resources = admission.resources;
    this.names = admission.names;
    this.origin = Object.freeze({ engine: engine.token, keys: this.keys, name: this.name });
    this.depth = engine.missedDepth(this.keys, admission.origin.revision);
    this.#delivered = admission.origin.revision;
    this.#onChange = onChange;
  }
  subscribe(): void {
    this.#engine.attach(this);
    if (this.#engine.latest(this.keys) > this.#delivered) {this.#engine.markDirty(this);}
  }
  readonly detach = (): void => {
    if (!this.#attached) {return;}
    this.#attached = false;
    this.#engine.unlink(this);
  };
  release(): void {}
  flush(live: Live): void {
    if (!this.#attached) {return;}
    const depth = this.depth;
    this.depth = 0;
    const revision = this.#engine.latest(this.keys);
    if (revision <= this.#delivered) {return;}
    this.#delivered = revision;
    this.#engine.counters.deliveries += 1;
    const snapshot = this.#engine.snapshot(this.keys, revision);
    this.#engine.invoke({ depth, origin: this.origin, live }, revision, () => this.#onChange(snapshot));
  }
}
