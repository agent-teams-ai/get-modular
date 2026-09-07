import assert from "node:assert/strict";
import { compileComposition, many, optional, required } from "@get-modular/core";
import { assemblyFor } from "@get-modular/assembly";

export const exact = (compatibilityToken = "synthetic/v1") => ({ family: "exact", familyVersion: 1, "token": compatibilityToken });
export const provide = (capabilityId) => ({ capabilityId, compatibility: exact() });
export const slot = (slotId, capabilityId, cardinality = required()) => ({ slotId, ...provide(capabilityId), cardinality });
export function declaration(name, provides = [], slots = []) {
  const id = `synthetic/${name}`;
  return {
    kind: "get-modular.module-declaration", schemaVersion: 1,
    moduleId: id, implementationId: id, owner: { authority: "synthetic", path: [name] },
    provides: provides.map(provide), slots,
  };
}
export const binding = (consumerImplementationId, slotId, providerImplementationIds) => ({
  consumerImplementationId, slotId, providerImplementationIds,
});
export function profile(declarations, bindings = [], roots = [declarations.at(-1).implementationId]) {
  return {
    kind: "get-modular.composition-profile", schemaVersion: 1, profileId: "synthetic/profile",
    roots, selections: declarations.map(({ moduleId, implementationId }) => ({ moduleId, implementationId })), bindings,
  };
}
export async function compile(declarations, selectedProfile = profile(declarations)) {
  const result = await compileComposition({ declarations, profile: selectedProfile });
  assert.ok(Object.hasOwn(result, "plan"), JSON.stringify(result));
  return result;
}
export async function prepared(api, input) {
  const result = await api.prepare(input);
  assert.equal(result.status, "prepared", JSON.stringify(result));
  return result.prepared;
}
export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export async function synthetic({ logger = false, reverse = false, appFactory, storeFactory } = {}) {
  const api = assemblyFor(), trace = [];
  const store = declaration("store", ["synthetic/store"]);
  const a = declaration("filter-a", ["synthetic/filter"], [slot("store", "synthetic/store")]);
  const b = declaration("filter-b", ["synthetic/filter"], [slot("store", "synthetic/store")]);
  const log = declaration("logger", ["synthetic/logger"]);
  const app = declaration("app", [], [
    slot("store", "synthetic/store"), slot("logger", "synthetic/logger", optional()),
    slot("filters", "synthetic/filter", many({ min: 2, max: 2 })),
  ]);
  const declarations = [store, a, b, ...(logger ? [log] : []), app];
  const rows = [
    binding("synthetic/filter-a", "store", ["synthetic/store"]), binding("synthetic/filter-b", "store", ["synthetic/store"]),
    binding("synthetic/app", "store", ["synthetic/store"]), binding("synthetic/app", "logger", logger ? ["synthetic/logger"] : []),
    binding("synthetic/app", "filters", reverse ? ["synthetic/filter-a", "synthetic/filter-b"] : ["synthetic/filter-b", "synthetic/filter-a"]),
  ];
  const factories = declarations.map((item) => api.bindFactory(item, (deps, context) => {
    trace.push(item.implementationId);
    if (item === store && storeFactory) return storeFactory(deps, context);
    if (item === app && appFactory) return appFactory(deps, context);
    if (item === store) { const value = { initial: "" }; return Promise.resolve({ instance: { host: true }, capabilities: { "synthetic/store": value } }); }
    if (item === log) return Promise.resolve({ instance: {}, capabilities: { "synthetic/logger": { log() {} } } });
    if (item === app) return Promise.resolve({ instance: { deps, output: deps.filters.reduce((value, filter) => filter.apply(value), deps.store.initial) }, capabilities: {} });
    return Promise.resolve({ instance: {}, capabilities: { "synthetic/filter": { store: deps.store, apply: (value) => value + (item === a ? "A" : "B") } } });
  }));
  const input = { composition: await compile(declarations, profile(declarations, rows)), factories, roots: { app: factories.at(-1) } };
  return { api, trace, input, declarations, prepared: await prepared(api, input) };
}
