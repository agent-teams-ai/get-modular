import assert from "node:assert/strict";
import test from "node:test";
import { compileComposition, required } from "@get-modular/core";
import { assemblyFor, declareModule, defineContract, implement } from "@get-modular/assembly";
import { isolate } from "@get-modular/conformance";
import { createScope, scoped } from "@get-modular/resources";
import { createStore } from "@get-modular/observation";
import { delivered, liveSubscriptions } from "@get-modular/observation/testing";

const Settings = defineContract()({ id: "observation-test/settings", revision: 1 });
const View = defineContract()({ id: "observation-test/view", revision: 1 });
const authority = { authority: "observation-test", path: ["integration"] };
const ownerDeclaration = declareModule({
  moduleId: "observation-test/settings", implementationId: "observation-test/settings/default",
  owner: authority, provides: [Settings.provide()], slots: [],
});
const consumerDeclaration = declareModule({
  moduleId: "observation-test/view", implementationId: "observation-test/view/default",
  owner: authority, provides: [View.provide()], slots: [Settings.slot("settings", required())],
});
function ownerEntry(reports) {
  let store;
  const entry = implement()(ownerDeclaration, async (_deps, { resources }) => {
    store = createStore({ theme: "light" }, { name: "settings", resources,
      reportError: report => { reports.push(report); } });
    return { instance: store, capabilities: { "observation-test/settings": store.readonly() } };
  }, scoped);
  return { entry, store: () => store };
}
async function prepare(owner, consumer) {
  const declarations = [ownerDeclaration, consumerDeclaration];
  const composition = await compileComposition({ declarations, profile: {
    kind: "get-modular.composition-profile", schemaVersion: 1, profileId: "observation-test/profile",
    roots: [consumerDeclaration.moduleId],
    selections: declarations.map(({ moduleId, implementationId }) => ({ moduleId, implementationId })),
    bindings: [{ consumerImplementationId: consumerDeclaration.implementationId, slotId: "settings",
      providerImplementationIds: [ownerDeclaration.implementationId] }],
  } });
  assert.equal(composition.ok, true, JSON.stringify(composition.diagnostics));
  const preparation = await assemblyFor().prepare({ composition, modules: [owner, consumer], roots: { view: consumer } });
  assert.equal(preparation.status, "prepared", JSON.stringify(preparation));
  return preparation.prepared;
}

test("T04 T07 T18 T29 T75 an Assembly required slot carries a facet and closes the consumer before its owner", async t => {
  const reports = []; const owner = ownerEntry(reports); const seen = [];
  const consumer = implement()(consumerDeclaration, async ({ settings }, { resources }) => {
    const initial = settings.read(["theme"]); seen.push(initial.values.theme);
    settings.watch(initial, { resources, name: "view/theme", onChange: ({ values }) => { seen.push(values.theme); } });
    const view = { current: () => seen.at(-1) };
    return { instance: view, capabilities: { "observation-test/view": view } };
  }, scoped);
  const prepared = await prepare(owner.entry, consumer);
  const attempt = createScope({ name: "attempt" }); t.after(() => attempt.control.close());
  const outcome = await prepared.run({ scope: attempt.resources });
  assert.equal(outcome.status, "succeeded");
  const store = owner.store(); const facet = store.readonly();
  assert.equal(liveSubscriptions(facet), 1); assert.equal(outcome.roots.view.current(), "light");
  store.set({ theme: "dark" }); await delivered({ stores: [facet] });
  assert.deepEqual(seen, ["light", "dark"]); assert.equal(outcome.roots.view.current(), "dark");
  const closed = await attempt.control.close();
  assert.equal(closed.complete, true); assert.deepEqual(closed.debts, []);
  assert.equal(liveSubscriptions(facet), 0); assert.deepEqual(reports, []);
  assert.equal(store.read(["theme"]).values.theme, "dark");
  assert.throws(() => facet.read(["theme"]), { code: "observation.store.closed" });
});

test("T04 T18 conformance isolate accepts the readonly facet's own-property port", async t => {
  const reports = []; const owner = ownerEntry(reports);
  const isolated = await isolate(owner.entry, { dependencies: {} }); t.after(() => isolated.close());
  const facet = isolated.capabilities["observation-test/settings"];
  assert.deepEqual(Object.keys(facet).sort(), ["load", "read", "watch"]);
  assert.ok(Object.keys(facet).every(key => Object.hasOwn(facet, key)));
  assert.equal(facet.read(["theme"]).values.theme, "light");
  assert.equal((await isolated.close()).complete, true); assert.equal(liveSubscriptions(facet), 0);
  assert.deepEqual(reports, []);
});

test("T28 an awaiting Assembly factory observes the identical Host cancellation reason without subscriptions", async t => {
  const reports = []; const owner = ownerEntry(reports); const entered = Promise.withResolvers();
  const resume = Promise.withResolvers(); const attempts = []; let consumerResources;
  const consumer = implement()(consumerDeclaration, async ({ settings }, { resources }) => {
    consumerResources = resources;
    const snapshot = settings.read(["theme"]); entered.resolve(); await resume.promise;
    for (const kind of ["watch", "load"]) {
      try {
        if (kind === "watch") settings.watch(snapshot, { resources, name: "cancel/watch", onChange: () => undefined });
        else settings.load(snapshot, { resources, name: "cancel/load", loader: () => "unused",
          onLoading: () => undefined, onResult: () => undefined, onError: () => undefined });
        assert.fail(`${kind} registered after construction cancellation`);
      } catch (cause) { attempts.push({ kind, cause }); }
    }
    throw attempts[0].cause;
  }, scoped);
  const prepared = await prepare(owner.entry, consumer);
  const attempt = createScope({ name: "cancel-attempt" }); t.after(() => attempt.control.close());
  const cancellation = new AbortController(); const reason = new Error("Host cancelled construction");
  const running = prepared.run({ scope: attempt.resources, signal: cancellation.signal });
  await entered.promise; cancellation.abort(reason);
  assert.equal(consumerResources.signal.aborted, true); assert.equal(consumerResources.signal.reason, reason);
  resume.resolve(); const outcome = await running;
  assert.deepEqual(attempts.map(({ kind }) => kind), ["watch", "load"]);
  assert.ok(attempts.every(({ cause }) => cause === reason));
  assert.equal(outcome.status, "failed"); assert.equal(outcome.code, "assembly.run.factory-rejected");
  assert.equal(outcome.cause, reason); assert.equal(outcome.cancellation.reason, reason);
  const facet = owner.store().readonly(); assert.equal(liveSubscriptions(facet), 0);
  assert.equal((await attempt.control.close()).complete, true); assert.equal(liveSubscriptions(facet), 0);
  assert.deepEqual(reports, []);
});
