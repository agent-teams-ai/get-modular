// Copied into the isolated registry consumer and executed using installed package roots.
import { declareModule } from "@get-modular/assembly";
import { effectFor, implement as implementEffect } from "../dist/index.js";
import { Context, Effect } from "effect";

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
