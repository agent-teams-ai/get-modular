// Copied into an isolated installed consumer; every import is a public package root.
import { required } from "@get-modular/core";
import { assemblyFor, declareModule, defineContract, implement, type CapabilitiesOf } from "@get-modular/assembly";
import { createScope, scoped } from "@get-modular/resources";
import { isolate } from "@get-modular/conformance";
import { createStore, type ReadonlyStore } from "@get-modular/observation";
import { delivered, liveSubscriptions } from "@get-modular/observation/testing";
import { effectFor, implement as implementEffect } from "@get-modular/effect";
import { Context, Effect } from "effect";

type State = { readonly count: number };
const StateContract = defineContract<ReadonlyStore<State>>()({ id: "release/state", revision: 1 });
interface Capabilities extends CapabilitiesOf<typeof StateContract> {}
const ownerDeclaration = declareModule({ moduleId: "release/owner", implementationId: "release/owner/default",
  owner: { authority: "release", path: ["owner"] }, provides: [StateContract.provide()], slots: [] });
const readerDeclaration = declareModule({ moduleId: "release/reader", implementationId: "release/reader/default",
  owner: { authority: "release", path: ["reader"] }, provides: [], slots: [StateContract.slot("state", required())] });
const host = createScope({ name: "release/host" });
const store = createStore<State>({ count: 0 }, { name: "release/state", resources: host.resources, reportError: error => { throw error; } });
const owner = implement<Capabilities>()(ownerDeclaration,
  async () => ({ instance: store, capabilities: { "release/state": store.readonly() } }));
const reader = implement<Capabilities>()(readerDeclaration, async ({ state }, { resources }) => {
  let current = state.read(["count"]).values.count;
  state.watch(state.read(["count"]), { name: "release/reader", resources, onChange: snapshot => { current = snapshot.values.count; } });
  return { instance: () => current, capabilities: {} };
}, scoped);
const prepared = await assemblyFor<Capabilities>().prepare({ profileId: "release/consumer", modules: [owner, reader], roots: { reader } });
if (prepared.status !== "prepared") throw new Error("release.consumer.prepare");
const attempt = createScope({ name: "release/attempt" });
const outcome = await prepared.prepared.run({ scope: attempt.resources });
if (outcome.status !== "succeeded") throw new Error("release.consumer.run");
store.set({ count: 42 });
await delivered({ stores: [store.readonly()] });
if (outcome.roots.reader() !== 42) throw new Error("release.consumer.observation");
if (!(await attempt.control.close()).complete || liveSubscriptions(store.readonly()) !== 0) throw new Error("release.consumer.leak");
const isolated = await isolate(reader, { dependencies: { state: store.readonly() } });
if (isolated.instance() !== 42 || !(await isolated.close()).complete) throw new Error("release.consumer.isolate");
if (!(await host.control.close()).complete) throw new Error("release.consumer.close");

// Exercise actual downloaded Effect adapter and its qualified peer under a native Scope.
let released = false;
const native = implementEffect()(declareModule({ moduleId: "release/native", implementationId: "release/native/default",
  owner: { authority: "release", path: ["native"] }, provides: [], slots: [] }),
  () => Effect.map(Effect.acquireRelease(Effect.succeed(42), () => Effect.sync(() => { released = true; })),
    value => ({ instance: value, capabilities: {} })));
class NativeRoots extends Context.Service<NativeRoots, { readonly native: number }>()("release/NativeRoots") {}
const nativePrepared = await effectFor().prepare({ profileId: "release/native", modules: [native], roots: { native } });
if (nativePrepared.status !== "prepared") { throw new Error("release.consumer.native-prepare"); }
const value = await Effect.runPromise(Effect.provide(Effect.map(NativeRoots, roots => roots.native),
  nativePrepared.prepared.layer(NativeRoots)));
if (value !== 42 || !released) { throw new Error("release.consumer.native-scope"); }
