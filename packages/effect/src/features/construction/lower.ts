import { injectionDependencies, snapshotFactoryProduct } from "@get-modular/assembly";
import type { CreatedEntry, Wiring, WiringInjection, WiringMetadata } from "@get-modular/assembly";
import { Context, Effect, Layer } from "effect";
import type { EffectEntryFactory } from "./types.js";
import { captureInputs, InvalidInputs } from "./inputs.js";

type PrivateId = { readonly _module: unique symbol };
type PrivateKey = Context.Key<PrivateId, CreatedEntry>;
type PrivateLayer = Layer.Layer<PrivateId, unknown, unknown>;
type LayerFactory = <Id>(root: Context.Key<Id, Readonly<Record<string, unknown>>>, options?: unknown) => Layer.Layer<Id, unknown, unknown>;
let nextGraph = 0;

function nullRecord(): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  Object.setPrototypeOf(value, null);
  return value;
}
function required<T>(map: ReadonlyMap<string, T>, id: string): T {
  const value = map.get(id);
  if (value === undefined) { throw new Error("effect.internal.missing-verified-provider"); }
  return value;
}
function merge(layers: readonly PrivateLayer[]): PrivateLayer | undefined {
  const [first, ...rest] = layers;
  return first === undefined ? undefined : Layer.mergeAll(first, ...rest);
}

function dependencies(injections: readonly WiringInjection[], keys: ReadonlyMap<string, PrivateKey>):
Effect.Effect<Readonly<Record<string, unknown>>, never, PrivateId> {
  return Effect.gen(function*() {
    const products = new Map<string, CreatedEntry>();
    for (const injection of injections) {
      for (const id of injection.providers) {
        if (!products.has(id)) { products.set(id, yield* required(keys, id)); }
      }
    }
    return injectionDependencies(injections, (id, capability) => {
      const product = required(products, id);
      if (!Object.hasOwn(product.capabilities, capability)) { throw new Error("effect.internal.missing-verified-capability"); }
      return product.capabilities[capability];
    });
  });
}

function acquire(metadata: WiringMetadata<EffectEntryFactory>, injections: readonly WiringInjection[],
  keys: ReadonlyMap<string, PrivateKey>): Effect.Effect<CreatedEntry, unknown, unknown> {
  return Effect.flatMap(dependencies(injections, keys), (record) => Effect.suspend(() => {
    if (metadata.input === true) { return Effect.die(new Error("effect.internal.input-invoked")); }
    // Only this verified slot record reaches the erased callable; no Context bag
    // or runtime is supplied to a module. The family captured this exact factory.
    const result: unknown = Reflect.apply(metadata.factory, undefined, [record]);
    if (!Effect.isEffect(result)) { return Effect.die(new TypeError("effect.factory.unsupported-carrier")); }
    return Effect.map(result, (product) => snapshotFactoryProduct(metadata.declaration, product));
  }));
}

function graph(wiring: Wiring<EffectEntryFactory>, inputs: ReadonlyMap<string, CreatedEntry>): {
  readonly keys: ReadonlyMap<string, PrivateKey>;
  readonly layers: ReadonlyMap<string, PrivateLayer>;
} {
  const prefix = `@get-modular/effect/${++nextGraph}/`;
  const keys = new Map<string, PrivateKey>();
  const layers = new Map<string, PrivateLayer>();
  for (const step of wiring.steps) {
    const id = step.metadata.declaration.implementationId;
    const key = Context.Service<PrivateId, CreatedEntry>(`${prefix}${id}`);
    keys.set(id, key);
    if (step.metadata.input === true) {
      layers.set(id, Layer.succeed(key, required(inputs, id)));
      continue;
    }
    const ids = new Set(step.injections.flatMap((injection) => injection.providers));
    const providers = merge([...ids].map((provider) => required(layers, provider)));
    const node = Layer.effect(key, acquire(step.metadata, step.injections, keys));
    layers.set(id, providers === undefined ? node : Layer.provide(node, providers));
  }
  return { keys, layers };
}

/** Each call creates fresh mapper identities; returned Layers keep native memoization. */
export function lower(wiring: Wiring<EffectEntryFactory>): LayerFactory {
  return (root, options) => {
    const inputs = captureInputs(wiring, options);
    if (inputs instanceof InvalidInputs) { return Layer.effect(root, Effect.fail(inputs)); }
    const { keys, layers } = graph(wiring, inputs);
    const roots = Effect.gen(function*() {
      const result = nullRecord();
      for (const entry of wiring.roots) {
        result[entry.alias] = (yield* required(keys, entry.implementationId)).instance;
      }
      return Object.freeze(result);
    });
    const providers = merge(wiring.roots.map((entry) => required(layers, entry.implementationId)));
    const result = Layer.effect(root, roots);
    return providers === undefined ? result : Layer.provide(result, providers);
  };
}
