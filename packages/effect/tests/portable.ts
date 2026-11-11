import { declareModule, defineContract, type CapabilitiesOf } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { Context, Effect, Layer } from "effect";
import { effectFor, implement, InvalidInputs } from "../dist/index.js";

interface Store { readonly get: Effect.Effect<string> }
const StorePort = defineContract<Store>()({ id: "portable/store", revision: 1 });
interface Ports extends CapabilitiesOf<typeof StorePort> {}
class Config extends Context.Service<Config, { readonly prefix: string }>()("portable/Config") {}
class BootFailure extends Error { readonly _tag = "BootFailure"; }
class Roots extends Context.Service<Roots, { readonly app: Store }>()("portable/Roots") {}
const owner = { authority: "portable", path: ["example"] };
const store = implement<Ports>()(declareModule({ moduleId: "portable/store", implementationId: "portable/store", owner,
  provides: [StorePort.provide()], slots: [] }), () => Effect.gen(function* () {
    const config = yield* Config;
    if (config.prefix === "bad") return yield* Effect.fail(new BootFailure());
    yield* Effect.acquireRelease(Effect.void, () => Effect.void);
    const value: Store = { get: Effect.succeed(config.prefix + "value") };
    return { instance: value, capabilities: { [StorePort.id]: value } };
  }));
const app = implement<Ports>()(declareModule({ moduleId: "portable/app", implementationId: "portable/app", owner,
  provides: [], slots: [StorePort.slot("store", required())] }), ({ store }) => Effect.succeed({ instance: store, capabilities: {} }));

/** A browser-shaped public consumer: no Node declarations or private package paths. */
export async function runPortable(): Promise<string> {
  const result = await effectFor<Ports>().prepare({ profileId: "portable/default", modules: [store, app], roots: { app } });
  if (result.status !== "prepared") throw new Error("invalid portable composition");
  const layer: Layer.Layer<Roots, BootFailure | InvalidInputs, Config> = result.prepared.layer(Roots);
  // @ts-expect-error construction configuration must still be provided by the caller
  const missingConfig: Layer.Layer<Roots, BootFailure | InvalidInputs> = layer;
  // @ts-expect-error native construction errors cannot be erased to never
  const missingError: Layer.Layer<Roots, never, Config> = layer;
  void missingConfig;
  void missingError;
  const program = Effect.flatMap(Roots, roots => roots.app.get);
  return Effect.runPromise(program.pipe(Effect.provide(Layer.provide(layer, Layer.succeed(Config, { prefix: "packed/" })))));
}
