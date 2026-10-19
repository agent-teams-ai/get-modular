import { afterEach } from "node:test";
import { createScope as scope, scoped } from "@get-modular/resources";
import { createStore } from "../../dist/index.js";
import { delivered } from "../../dist/testing.js";
import { storeStats } from "../../dist/features/store/registry.js";
export { createStore, scoped };
export { asyncDetection, delivered, liveSubscriptions, settled } from "../../dist/testing.js";
export { storeStats as stats } from "../../dist/features/store/registry.js";
export const MAX_CASCADE_DEPTH = 64;
export const tick = () => new Promise(resolve => { setImmediate(resolve); });
export const settle = delivered;
export const codeOf = error => error?.code;
export const debtsOf = report => report.debts.map(debt => ({ path: debt.path.join("/"), state: debt.state,
  code: debt.state === "failed" ? codeOf(debt.cause) : undefined }));
const scopes = [];
export function createScope(options) { const result = scope(options); scopes.push(result); return result; }
afterEach(async () => {
  const closed = scopes.splice(0);
  await Promise.all(closed.map(item => item.control.close({ escalate: AbortSignal.abort() })));
  await delivered();
});
export function deferred() {
  let resolve; let reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
export function world(initial = { a: 0, b: 0, region: "r0" }, limits = {}) {
  const reports = [];
  const host = createScope({ name: "host" });
  const owner = host.resources.child({ name: "owner" });
  const store = createStore(initial, { name: "settings", resources: owner.resources,
    reportError: report => { reports.push(report); }, ...limits });
  const module = host.resources.child({ name: "module" });
  return { host, owner, store, facet: store.readonly(), module, reports };
}
export function follow(facet, resources, keys, name, onChange, between) {
  const first = facet.read(keys);
  between?.();
  facet.watch(first, { resources, name, onChange });
  return first;
}
export function startLoad(facet, resources, keys, name, handlers) {
  facet.load(facet.read(keys), { resources, name, ...handlers });
}
export function stubbornLoader() {
  const calls = []; const published = [];
  const handlers = {
    loader: async (next, { signal }) => { const gate = deferred(); calls.push({ region: next.values.region, signal, gate }); return gate.promise; },
    onLoading: () => undefined,
    onResult: result => { published.push(result); }, onError: cause => { published.push(cause); },
  };
  return { calls, published, handlers };
}
export function cooperativeLoader() {
  const calls = []; const published = [];
  const handlers = {
    loader: (_next, { signal }) => new Promise((_resolve, reject) => {
      calls.push(signal); signal.addEventListener("abort", () => { reject(signal.reason); }, { once: true });
    }),
    onLoading: () => undefined,
    onResult: result => { published.push(result); }, onError: cause => { published.push(cause); },
  };
  return { calls, published, handlers };
}
export function regionLoad(facet, resources, stubborn) {
  const runs = []; const published = [];
  facet.load(facet.read(["region"]), { resources, name: "catalog",
    loader: ({ values }, { signal }) => new Promise((resolve, reject) => {
      runs.push({ region: values.region, signal, release: resolve });
      if (!stubborn) signal.addEventListener("abort", () => { reject(signal.reason); }, { once: true });
    }),
    onLoading: () => undefined,
    onResult: result => { published.push(result); }, onError: cause => { published.push(`error:${String(cause)}`); },
  });
  return { runs, published };
}
export function pendingWork(stores) {
  return { flushes: stores.reduce((count, store) => count + storeStats(store).pendingDeliveries, 0) };
}
