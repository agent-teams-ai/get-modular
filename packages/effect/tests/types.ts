import {
  assemblyFor, declareModule, defineContract, group as promiseGroup, implement as promiseImplement,
  type AnyEntry, type CapabilitiesOf,
} from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { Context, Effect, Layer } from "effect";
import { effectFor, entriesOf, group, implement, input, InvalidInputs } from "../dist/index.js";
import type { PromiseIsolate } from "../../../tests/effect-carrier.types.ts";

class ConstructionConfig extends Context.Service<ConstructionConfig, { readonly value: string }>()("native-types/Config") {}
class Request extends Context.Service<Request, { readonly id: string }>()("native-types/Request") {}
class ConstructionFailure extends Error { readonly _tag = "ConstructionFailure"; }
class OperationFailure extends Error { readonly _tag = "OperationFailure"; }
interface Service { readonly read: Effect.Effect<string, OperationFailure, Request> }
const Port = defineContract<Service>()({ id: "types/service", revision: 1 });
const External = defineContract<number>()({ id: "types/external", revision: 1 });
interface Services extends CapabilitiesOf<typeof Port | typeof External> {}
const providerDeclaration = declareModule({ moduleId: "types/provider", implementationId: "types/provider",
  owner: { authority: "types", path: ["provider"] }, provides: [Port.provide()], slots: [] });
const appDeclaration = declareModule({ moduleId: "types/app", implementationId: "types/app",
  owner: { authority: "types", path: ["app"] }, provides: [], slots: [Port.slot("service", required())] });
const native = implement<Services>()(providerDeclaration, () => Effect.gen(function* () {
  const config = yield* ConstructionConfig;
  if (config.value === "bad") return yield* Effect.fail(new ConstructionFailure());
  yield* Effect.acquireRelease(Effect.void, () => Effect.void);
  const value: Service = { read: Effect.flatMap(Request, request => request.id === "bad"
    ? Effect.fail(new OperationFailure()) : Effect.succeed(config.value + request.id)) };
  return { instance: value, capabilities: { [Port.id]: value } };
}));
const app = implement<Services>()(appDeclaration, ({ service }) => Effect.succeed({ instance: service, capabilities: {} }));
class Roots extends Context.Service<Roots, { readonly app: Service }>()("native-types/Roots") {}
class WrongRoots extends Context.Service<WrongRoots, { readonly wrong: number }>()("native-types/WrongRoots") {}
class ExtraRoots extends Context.Service<ExtraRoots, { readonly app: Service; readonly extra: number }>()("native-types/ExtraRoots") {}
class NarrowRoots extends Context.Service<NarrowRoots, { readonly app: Service & { readonly complete: true } }>()("native-types/NarrowRoots") {}
class WiderRoots extends Context.Service<WiderRoots, { readonly app: unknown }>()("native-types/WiderRoots") {}
const feature = group("feature", [native, app]);
const flattened = entriesOf([feature]);
const union: readonly (typeof native | typeof app)[] = flattened;
void union;

async function nativeTypes(): Promise<void> {
  const result = await effectFor<Services>().prepare({ profileId: "types/default", modules: [feature], roots: { app } });
  if (result.status !== "prepared") return;
  const layer: Layer.Layer<Roots, ConstructionFailure | InvalidInputs, ConstructionConfig> = result.prepared.layer(Roots);
  const closed = Layer.provide(layer, Layer.succeed(ConstructionConfig, { value: "ok" }));
  const construction: Effect.Effect<{ readonly app: Service }, ConstructionFailure | InvalidInputs> = Effect.provide(Roots, closed);
  void construction;
  // @ts-expect-error construction retains its own required configuration
  Effect.runPromise(Effect.provide(Roots, layer));
  // @ts-expect-error expected construction failures are not erased to never
  const missingError: Layer.Layer<Roots, never, ConstructionConfig> = result.prepared.layer(Roots);
  // @ts-expect-error the produced root record cannot fulfill an unrelated caller key
  result.prepared.layer(WrongRoots);
  // @ts-expect-error the produced root record does not supply an additional required field
  result.prepared.layer(ExtraRoots);
  // @ts-expect-error the caller key cannot require a narrower app service than the factory returns
  result.prepared.layer(NarrowRoots);
  const wider: Layer.Layer<WiderRoots, ConstructionFailure | InvalidInputs, ConstructionConfig> = result.prepared.layer(WiderRoots);
  const key: Context.Key<Roots, { readonly app: Service }> = Roots;
  const byKey: Layer.Layer<Roots, ConstructionFailure | InvalidInputs, ConstructionConfig> = result.prepared.layer(key);
  void [wider, byKey];
  const operation = Effect.provide(Effect.flatMap(Roots, value => value.app.read), closed);
  // @ts-expect-error operation Request stays required even though construction is closed
  Effect.runPromise(operation);
  void missingError;
}
void nativeTypes;

const ordinary = promiseImplement<Services>()(providerDeclaration, async () => ({
  instance: { read: Effect.succeed("ordinary") }, capabilities: { [Port.id]: { read: Effect.succeed("ordinary") } },
}));
// @ts-expect-error Effect entries cannot enter ordinary Promise preparation
assemblyFor<Services>().prepare({ profileId: "types/wrong", modules: [native], roots: { app: native } });
// @ts-expect-error native entry does not satisfy Promise-only carrier
const ordinaryView: AnyEntry = native;
// @ts-expect-error native groups reject Promise entries
group("mixed", [native, ordinary]);
// @ts-expect-error existing Promise groups must retain carrier rejection
promiseGroup("mixed", [ordinary, native]);
// @ts-expect-error native prepare rejects an ordinary Promise factory
effectFor<Services>().prepare({ profileId: "types/wrong", modules: [ordinary], roots: { app: ordinary } });
// @ts-expect-error native implement requires a native Effect carrier
implement<Services>()(providerDeclaration, async () => ({ instance: {}, capabilities: {} }));
// @ts-expect-error a factory cannot read undeclared slots
implement<Services>()(appDeclaration, ({ undeclared }) => Effect.succeed({ instance: undeclared, capabilities: {} }));
void ordinaryView;

function rejectPromiseConformance(promiseIsolate: PromiseIsolate): void {
  // @ts-expect-error Promise-only Conformance cannot execute a native factory
  promiseIsolate(native, { dependencies: {} });
}
void rejectPromiseConformance;

const externalDeclaration = declareModule({ moduleId: "types/external", implementationId: "types/external",
  owner: { authority: "types", path: ["external"] }, provides: [External.provide()], slots: [] });
const external = input<Services>()(externalDeclaration);
const borrowedApp = implement<Services>()(declareModule({ moduleId: "types/borrowed", implementationId: "types/borrowed",
  owner: { authority: "types", path: ["app"] }, provides: [], slots: [External.slot("value", required())] }),
  ({ value }) => Effect.succeed({ instance: value, capabilities: {} }));
class BorrowedRoots extends Context.Service<BorrowedRoots, { readonly app: number }>()("native-types/BorrowedRoots") {}
async function inputTypes(): Promise<void> {
  const result = await effectFor<Services>().prepare({ profileId: "types/borrowed", modules: [borrowedApp], roots: { app: borrowedApp }, inputs: { external } });
  if (result.status !== "prepared") return;
  const layer: Layer.Layer<BorrowedRoots, InvalidInputs> = result.prepared.layer(BorrowedRoots, { inputs: { external: { [External.id]: 1 } } });
  // @ts-expect-error declared inputs are required for each Layer instantiation
  result.prepared.layer(BorrowedRoots);
  // @ts-expect-error all declared input aliases are required
  result.prepared.layer(BorrowedRoots, { inputs: {} });
  // @ts-expect-error each input capability keeps its value contract
  result.prepared.layer(BorrowedRoots, { inputs: { external: { [External.id]: "wrong" } } });
  void layer;
}
void inputTypes;

const fake = implement<Services>()(providerDeclaration, () => Effect.succeed({
  instance: { read: Effect.succeed("fake") }, capabilities: { [Port.id]: { read: Effect.succeed("fake") } },
}));
async function exactFakeVariant(): Promise<void> {
  const result = await effectFor<Services>().prepare({ profileId: "types/fake", modules: [fake, app], roots: { app } });
  if (result.status !== "prepared") return;
  // No removed live ConstructionConfig, Scope or ConstructionFailure in the fake inventory.
  const layer: Layer.Layer<Roots, InvalidInputs> = result.prepared.layer(Roots);
  const closed: Effect.Effect<{ readonly app: Service }, InvalidInputs> = Effect.provide(Roots, layer);
  void closed;
}
void exactFakeVariant;

const later = defineContract<Service>()({ id: "types/service", revision: 2 });
interface LaterMap extends CapabilitiesOf<typeof later> {}
const laterEntry = implement<LaterMap>()(declareModule({ moduleId: "types/later", implementationId: "types/later",
  owner: { authority: "types", path: ["later"] }, provides: [later.provide()], slots: [] }), () => Effect.succeed({
    instance: { read: Effect.succeed("later") }, capabilities: { [later.id]: { read: Effect.succeed("later") } },
  }));
// @ts-expect-error conflicting contract revisions are rejected at the preparing map
effectFor<Services>().prepare({ profileId: "types/revision", modules: [group("later", [laterEntry])], roots: { app: laterEntry } });
// @ts-expect-error an empty preparing map cannot erase the capability used in a native group
effectFor<{}>().prepare({ profileId: "types/missing", modules: [feature], roots: { app } });
