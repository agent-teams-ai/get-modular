import { injectionDependencies, snapshotFactoryProduct } from "@get-modular/assembly";
import type { CreatedEntry, Wiring, WiringInjection, WiringMetadata } from "@get-modular/assembly";
import { Context, Effect, Layer } from "effect";
import type { EffectEntryFactory } from "./types.js";
import { captureInputs, InvalidInputs } from "./inputs.js";

type PrivateId = { readonly _module: unique symbol };
type PrivateKey = Context.Key<PrivateId, CreatedEntry>;
type PrivateLayer = Layer.Layer<PrivateId, unknown, unknown>;
type PrivateNode = { readonly key: PrivateKey; readonly layer: PrivateLayer };
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

function dependencies(injections: readonly WiringInjection[], providers: ReadonlyMap<string, PrivateNode>):
Effect.Effect<Readonly<Record<string, unknown>>, never, PrivateId> {
  return Effect.gen(function*() {
    const products = new Map<string, CreatedEntry>();
    for (const [id, provider] of providers) { products.set(id, yield* provider.key); }
    return injectionDependencies(injections, (id, capability) => {
      const product = required(products, id);
      if (!Object.hasOwn(product.capabilities, capability)) { throw new Error("effect.internal.missing-verified-capability"); }
      return product.capabilities[capability];
    });
  });
}

function acquire(metadata: WiringMetadata<EffectEntryFactory>, injections: readonly WiringInjection[],
  providers: ReadonlyMap<string, PrivateNode>): Effect.Effect<CreatedEntry, unknown, unknown> {
  return Effect.flatMap(dependencies(injections, providers), (record) => Effect.suspend(() => {
    if (metadata.input === true) { return Effect.die(new Error("effect.internal.input-invoked")); }
    // Only this verified slot record reaches the erased callable; no Context bag
    // or runtime is supplied to a module. The family captured this exact factory.
    const result: unknown = Reflect.apply(metadata.factory, undefined, [record]);
    if (!Effect.isEffect(result)) { return Effect.die(new TypeError("effect.factory.unsupported-carrier")); }
    return Effect.map(result, (product) => snapshotFactoryProduct(metadata.declaration, product));
  }));
}

function graph(wiring: Wiring<EffectEntryFactory>, inputs: ReadonlyMap<string, CreatedEntry>): ReadonlyMap<string, PrivateNode> {
  const prefix = `@get-modular/effect/${++nextGraph}/`;
  const nodes = new Map<string, PrivateNode>();
  for (const step of wiring.steps) {
    const id = step.metadata.declaration.implementationId;
    const key = Context.Service<PrivateId, CreatedEntry>(`${prefix}${id}`);
    if (step.metadata.input === true) {
      nodes.set(id, { key, layer: Layer.succeed(key, required(inputs, id)) });
      continue;
    }
    const ids = new Set(step.injections.flatMap((injection) => injection.providers));
    // Resolve each selected provider once. Provision and acquisition capture the
    // same nodes, rather than retaining a deferred lookup into the whole graph.
    const providers = new Map([...ids].map((provider) => [provider, required(nodes, provider)] as const));
    const provision = merge([...providers.values()].map((provider) => provider.layer));
    const node = Layer.effect(key, acquire(step.metadata, step.injections, providers));
    nodes.set(id, { key, layer: provision === undefined ? node : Layer.provide(node, provision) });
  }
  return nodes;
}

/** Each call creates fresh mapper identities; returned Layers keep native memoization. */
export function lower(wiring: Wiring<EffectEntryFactory>): LayerFactory {
  return (root, options) => {
    const inputs = captureInputs(wiring, options);
    if (inputs instanceof InvalidInputs) { return Layer.effect(root, Effect.fail(inputs)); }
    const nodes = graph(wiring, inputs);
    const selected = wiring.roots.map((entry) => ({ alias: entry.alias, node: required(nodes, entry.implementationId) }));
    const roots = Effect.gen(function*() {
      const result = nullRecord();
      for (const { alias, node } of selected) {
        result[alias] = (yield* node.key).instance;
      }
      return Object.freeze(result);
    });
    const providers = merge(selected.map(({ node }) => node.layer));
    const result = Layer.effect(root, roots);
    return providers === undefined ? result : Layer.provide(result, providers);
  };
}
