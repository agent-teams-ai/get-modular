import { admit } from "./admission.js";
import { callbackOf, checkedOptions, checkedSpec } from "./arguments.js";
import { StoreEngine } from "./engine.js";
import { LoadRegistration } from "./load.js";
import type { FixedKeys, Store, StoreOptions } from "./types.js";
import { captureRecord, freezeNodes } from "./values.js";
import { WatchRegistration } from "./watch.js";

/**
 * Own ordinary non-Proxy data in the module's scope; hand other modules only the read-only facet. Objects transfer
 * in place, so callers must not pass Proxy-backed graphs even where a native Proxy detector is unavailable.
 */
export function createStore<V extends object & Required<V> & FixedKeys<V>>(initial: V, options: StoreOptions): Store<V> {
  const checked = checkedOptions(options);
  const nodes = new Set<object>();
  const entries = captureRecord(initial, "initial", nodes);
  const engine = new StoreEngine(entries, checked);
  checked.resources.use({ [Symbol.dispose]: () => { engine.close(); } }, `store:${checked.name}`);
  freezeNodes(nodes);
  engine.counters.walked += nodes.size;
  const facet = Object.freeze({
    read: (keys: unknown) => engine.read(keys),
    watch: (snapshot: unknown, value: unknown): undefined => {
      const spec = checkedSpec(value);
      const onChange = callbackOf(spec, "onChange");
      const admission = admit(engine, snapshot, spec);
      const registration = new WatchRegistration(engine, admission, onChange);
      registration.subscribe();
      return undefined;
    },
    load: (snapshot: unknown, value: unknown): undefined => {
      const spec = checkedSpec(value);
      const callbacks = {
        loader: callbackOf(spec, "loader"), onLoading: callbackOf(spec, "onLoading"),
        onResult: callbackOf(spec, "onResult"), onError: callbackOf(spec, "onError"),
      };
      const admission = admit(engine, snapshot, spec);
      const registration = new LoadRegistration(engine, admission, callbacks);
      registration.subscribe();
      return undefined;
    },
  });
  const owner = Object.freeze({
    read: (keys: unknown) => engine.readOwner(keys), set: (patch: unknown) => engine.set(patch),
    readonly: () => facet, close: (): undefined => { engine.close(); return undefined; },
  });
  engine.register(owner);
  engine.register(facet);
  // Initial values and every operation are validated above or by the engine; it alone creates
  // origin-registered snapshots. This boundary supplies the public type-only ownership brands.
  return owner as Store<V>;
}
