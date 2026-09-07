import { compileComposition, defineModule, many, optional, required } from "@get-modular/core";
import type { ModuleDeclaration } from "@get-modular/core";
import { assemblyFor } from "@get-modular/assembly";
import type { CapabilityContract, SuccessfulComposition } from "@get-modular/assembly";

type Store = { readonly value: string };
type Filter = { readonly apply: (value: string) => string };
type Capabilities = {
  store: CapabilityContract<Store, "v1">;
  filter: CapabilityContract<Filter, "v1">;
  logger: CapabilityContract<{ readonly log: (value: string) => void }, "v1">;
};
function exact<const T extends string>(token: T): { readonly family: "exact"; readonly familyVersion: 1; readonly token: T } {
  return { family: "exact", familyVersion: 1, token };
}
const owner = { authority: "synthetic", path: ["types"] };
const storeDeclaration = defineModule({
  kind: "get-modular.module-declaration", schemaVersion: 1, moduleId: "store", implementationId: "store", owner,
  provides: [{ capabilityId: "store", compatibility: exact("v1") }], slots: [],
});
const rootDeclaration = defineModule({
  kind: "get-modular.module-declaration", schemaVersion: 1, moduleId: "root", implementationId: "root", owner,
  provides: [], slots: [
    { slotId: "store", capabilityId: "store", compatibility: exact("v1"), cardinality: required() },
    { slotId: "logger", capabilityId: "logger", compatibility: exact("v1"), cardinality: optional() },
    { slotId: "filters", capabilityId: "filter", compatibility: exact("v1"), cardinality: many({ min: 0, max: 10 }) },
  ],
});
const api = assemblyFor<Capabilities>();
const store = api.bindFactory(storeDeclaration, async (deps, { signal }) => {
  const empty: Readonly<Record<string, never>> = deps;
  const hostSignal: AbortSignal = signal;
  return { instance: { host: true }, capabilities: { store: { value: "data" } } };
});
const root = api.bindFactory(rootDeclaration, async (deps) => {
  const value: string = deps.store.value;
  const filters: readonly Filter[] = deps.filters;
  deps.logger?.log(value);
  // @ts-expect-error Optional slots require narrowing.
  deps.logger.log(value);
  // @ts-expect-error Dependencies are closed.
  deps.undeclared;
  // @ts-expect-error Many injections cannot be mutated.
  deps.filters.push({ apply: (input: string) => input });
  // @ts-expect-error Dependency fields are readonly.
  deps.store = { value: "other" };
  return { instance: { render: () => filters.reduce((input, filter) => filter.apply(input), value) }, capabilities: {} };
});
async function consume(composition: SuccessfulComposition) {
  const result = await api.prepare({ composition, factories: [store, root], roots: { app: root, storage: store } });
  if (result.status !== "prepared") return;
  const outcome = await result.prepared.run();
  if (outcome.status !== "succeeded") return;
  const rendered: string = outcome.roots.app.render();
  const host: boolean = outcome.roots.storage.host;
  // @ts-expect-error Root instances retain their distinct result types.
  outcome.roots.storage.render();
}
// @ts-expect-error Callback parameter inference cannot widen declaration slots.
api.bindFactory(rootDeclaration, async (deps: { store: number }) => ({ instance: deps.store, capabilities: {} }));
// @ts-expect-error Capability values must match the Host contract.
api.bindFactory(storeDeclaration, async () => ({ instance: {}, capabilities: { store: 12 } }));
// @ts-expect-error Declared capabilities cannot be omitted.
api.bindFactory(storeDeclaration, async () => ({ instance: {}, capabilities: {} }));
const wrongIdentity = defineModule({ ...storeDeclaration, provides: [{ capabilityId: "store", compatibility: exact("v2") }] });
// @ts-expect-error Exact compatibility identities are part of the mapping.
api.bindFactory(wrongIdentity, async () => ({ instance: {}, capabilities: { store: { value: "" } } }));
const unknownCapability = defineModule({ ...storeDeclaration, provides: [{ capabilityId: "missing", compatibility: exact("v1") }] });
// @ts-expect-error Unknown capability identifiers are not added by a callback.
api.bindFactory(unknownCapability, async () => ({ instance: {}, capabilities: { missing: {} } }));
const widened: ModuleDeclaration = storeDeclaration;
// @ts-expect-error Widened declarations do not grant a precise injection contract.
api.bindFactory(widened, async () => ({ instance: {}, capabilities: {} }));
type Narrower = { store: CapabilityContract<Store & { readonly extra: true }, "v1">; filter: Capabilities["filter"]; logger: Capabilities["logger"] };
const narrower = assemblyFor<Narrower>();
declare const composition: SuccessfulComposition;
// @ts-expect-error Host mappings are invariant even when values are covariantly assignable.
narrower.prepare({ composition, factories: [store], roots: { store } });
type OtherIdentity = { store: CapabilityContract<Store, "v2"> };
// @ts-expect-error Handles with different exact identities cannot cross mappings.
assemblyFor<OtherIdentity>().prepare({ composition, factories: [store], roots: { store } });
function largeSlot<const S extends string>(slotId: S) {
  return { slotId, capabilityId: "store" as const, compatibility: exact("v1"), cardinality: required() };
}
const large = defineModule({
  ...rootDeclaration, slots: [
    largeSlot("s00"), largeSlot("s01"), largeSlot("s02"), largeSlot("s03"), largeSlot("s04"), largeSlot("s05"), largeSlot("s06"), largeSlot("s07"),
    largeSlot("s08"), largeSlot("s09"), largeSlot("s10"), largeSlot("s11"), largeSlot("s12"), largeSlot("s13"), largeSlot("s14"), largeSlot("s15"),
    largeSlot("s16"), largeSlot("s17"), largeSlot("s18"), largeSlot("s19"), largeSlot("s20"), largeSlot("s21"), largeSlot("s22"), largeSlot("s23"),
    largeSlot("s24"), largeSlot("s25"), largeSlot("s26"), largeSlot("s27"), largeSlot("s28"), largeSlot("s29"), largeSlot("s30"), largeSlot("s31"),
    largeSlot("s32"), largeSlot("s33"), largeSlot("s34"), largeSlot("s35"), largeSlot("s36"), largeSlot("s37"), largeSlot("s38"), largeSlot("s39"),
    largeSlot("s40"), largeSlot("s41"), largeSlot("s42"), largeSlot("s43"), largeSlot("s44"), largeSlot("s45"), largeSlot("s46"), largeSlot("s47"),
    largeSlot("s48"), largeSlot("s49"), largeSlot("s50"), largeSlot("s51"), largeSlot("s52"), largeSlot("s53"), largeSlot("s54"), largeSlot("s55"),
    largeSlot("s56"), largeSlot("s57"), largeSlot("s58"), largeSlot("s59"), largeSlot("s60"), largeSlot("s61"), largeSlot("s62"), largeSlot("s63"),
  ],
});
api.bindFactory(large, async (deps) => {
  const last: string = deps.s63.value;
  // @ts-expect-error Large literal fixtures remain closed.
  deps.s64;
  return { instance: last, capabilities: {} };
});
