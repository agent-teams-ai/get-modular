import { compileComposition, defineModule, many, optional, required } from "@get-modular/core";
import { assemblyFor } from "@get-modular/assembly";
import type { CapabilityContract } from "@get-modular/assembly";

type Capabilities = {
  "synthetic/store": CapabilityContract<{ readonly value: string }, "synthetic/v1">;
  "synthetic/filter": CapabilityContract<{ readonly apply: (value: string) => string }, "synthetic/v1">;
  "synthetic/logger": CapabilityContract<{ readonly log: (value: string) => void }, "synthetic/v1">;
};
function exact(): { readonly family: "exact"; readonly familyVersion: 1; readonly "token": "synthetic/v1" } {
  return { family: "exact", familyVersion: 1, "token": "synthetic/v1" };
}
const owner = { authority: "synthetic", path: ["types"] };
const storeDeclaration = defineModule({
  kind: "get-modular.module-declaration", schemaVersion: 1,
  moduleId: "synthetic/store", implementationId: "synthetic/store", owner,
  provides: [{ capabilityId: "synthetic/store", compatibility: exact() }], slots: [],
});
const rootDeclaration = defineModule({
  kind: "get-modular.module-declaration", schemaVersion: 1,
  moduleId: "synthetic/root", implementationId: "synthetic/root", owner,
  provides: [], slots: [
    { slotId: "store", capabilityId: "synthetic/store", compatibility: exact(), cardinality: required() },
    { slotId: "logger", capabilityId: "synthetic/logger", compatibility: exact(), cardinality: optional() },
    { slotId: "filters", capabilityId: "synthetic/filter", compatibility: exact(), cardinality: many({ min: 0, max: 10 }) },
  ],
});
const api = assemblyFor<Capabilities>();
const store = api.bindFactory(storeDeclaration, async () => {
  return { instance: { host: true }, capabilities: { "synthetic/store": { value: "data" } } };
});
const root = api.bindFactory(rootDeclaration, async (deps) => {
  const value: string = deps.store.value;
  deps.logger?.log(value);
  return { instance: { render: () => deps.filters.reduce((input, filter) => filter.apply(input), value) }, capabilities: {} };
});
const composition = await compileComposition({
  declarations: [storeDeclaration, rootDeclaration],
  profile: {
    kind: "get-modular.composition-profile", schemaVersion: 1, profileId: "synthetic/types",
    roots: ["synthetic/root", "synthetic/store"],
    selections: [storeDeclaration, rootDeclaration].map(({ moduleId, implementationId }) => ({ moduleId, implementationId })),
    bindings: [
      { consumerImplementationId: "synthetic/root", slotId: "store", providerImplementationIds: ["synthetic/store"] },
      { consumerImplementationId: "synthetic/root", slotId: "logger", providerImplementationIds: [] },
      { consumerImplementationId: "synthetic/root", slotId: "filters", providerImplementationIds: [] },
    ],
  },
});
if (!("plan" in composition)) throw new Error(JSON.stringify(composition));
const ready = await api.prepare({ composition, factories: [store, root], roots: { app: root, storage: store } });
if (ready.status !== "prepared") throw new Error(JSON.stringify(ready));
const outcome = await ready.prepared.run();
if (outcome.status !== "succeeded") throw new Error(JSON.stringify(outcome));
const rendered: string = outcome.roots.app.render();
const host: boolean = outcome.roots.storage.host;
if (rendered !== "data" || host !== true) throw new Error("Incorrect typed consumer wiring");
