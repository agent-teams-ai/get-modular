import assert from "node:assert/strict";
import test from "node:test";
import { assemblyFor, declareModule, defineContract, implement as implementPromise, type CapabilitiesOf } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { Context, Deferred, Effect, Exit, Fiber, Layer } from "effect";
import { effectFor, implement, input, InvalidInputs } from "../dist/index.js";
import { assertPreparationFailure, BootFailure, Config, DatabasePort, fixture, prepared, Roots, type TestMap, uncheckedPreparation } from "./support.ts";

test("native construction is lazy and preserves local providers, diamond sharing and slot shapes", async () => {
  const f = fixture();
  const graph = prepared(await f.prepare());
  const layer = graph.layer(Roots);
  assert.deepEqual(f.stats, { acquired: 0, released: 0, calls: 0 });
  const run = Effect.gen(function* () {
    const { app } = yield* Roots;
    assert.equal(app.primary.label, "test/primary");
    assert.equal(app.archive.label, "test/archive");
    assert.notEqual(app.primary, app.archive);
    assert.equal(app.left.database, app.primary);
    assert.equal(app.right.database, app.primary);
    assert.equal(app.logger, undefined);
    assert.deepEqual(app.ordered.map(value => value.label), ["test/archive", "test/primary"]);
    assert.deepEqual(app.single, [app.primary]);
    assert.equal(Object.isFrozen(app.single), true);
    assert.equal(Object.isFrozen(app), true);
    assert.equal(f.stats.acquired - f.stats.released, 2);
    return app.primary.serial;
  }).pipe(Effect.provide(Layer.provide(layer, Layer.succeed(Config, { prefix: "test/" }))));
  const first = await Effect.runPromise(run);
  assert.deepEqual(f.stats, { acquired: 2, released: 2, calls: 5 });
  const second = await Effect.runPromise(run);
  assert.notEqual(first, second);
  assert.deepEqual(f.stats, { acquired: 4, released: 4, calls: 10 });
});

test("native entries and profiles capture metadata before asynchronous preparation", async () => {
  const f = fixture();
  const rows = [...f.bindings];
  const pending = effectFor<TestMap>().prepare({ profileId: "native/capture", modules: f.modules, roots: { app: f.app }, bindings: rows });
  rows.length = 0;
  f.ownerPath.push("later-mutation");
  const result = await pending;
  assert.equal(result.status, "prepared");
  assert.deepEqual(f.primary.declaration.owner.path, ["fixture"]);
  assert.deepEqual(f.stats, { acquired: 0, released: 0, calls: 0 });
  const app = await Effect.runPromise(Effect.provide(Roots,
    Layer.provide(prepared(result).layer(Roots), Layer.succeed(Config, { prefix: "captured/" }))));
  assert.equal(app.app.primary.label, "captured/primary");
});

test("invalid inventory, forged entries, mixed carriers and plan tampering fail before factories", async () => {
  const f = fixture();
  const good = await f.prepare();
  assert.equal(good.status, "prepared");
  if (good.status !== "prepared") throw new Error("invalid fixture");
  const base = { composition: good.composition, modules: f.modules, roots: { app: f.app } };
  for (const modules of [[...f.modules, f.primary], [f.archive, f.left, f.right, f.app],
    [{ ...f.primary }, f.archive, f.left, f.right, f.app]]) {
    assertPreparationFailure(await uncheckedPreparation(effectFor<TestMap>(), { ...base, modules }));
  }
  const ordinary = implementPromise<TestMap>()(f.primary.declaration, async () => ({
    instance: { label: "ordinary", serial: 0 }, capabilities: { [DatabasePort.id]: { label: "ordinary", serial: 0 } },
  }));
  assertPreparationFailure(await uncheckedPreparation(effectFor<TestMap>(), { ...base, modules: [ordinary, ...f.modules.slice(1)] }));
  assertPreparationFailure(await uncheckedPreparation(assemblyFor<TestMap>(), base));
  assertPreparationFailure(await uncheckedPreparation(effectFor<TestMap>(), { ...base,
    composition: { ...good.composition, plan: { ...good.composition.plan, dependencyOrder: [] } } }));
  assert.deepEqual(f.stats, { acquired: 0, released: 0, calls: 0 });
});

test("independent providers acquire concurrently without weakening dependency order", { timeout: 5000 }, async () => {
  const f = fixture();
  const primaryStarted = Deferred.makeUnsafe<void>();
  const archiveStarted = Deferred.makeUnsafe<void>();
  const proceed = Deferred.makeUnsafe<void>();
  const open = (label: string, entered: Deferred.Deferred<void>) => Effect.gen(function* () {
    yield* Deferred.succeed(entered, undefined);
    yield* Deferred.await(proceed);
    const value = { label, serial: 1 };
    return { instance: value, capabilities: { [DatabasePort.id]: value } };
  });
  const primary = implement<TestMap>()(f.primary.declaration, () => open("primary", primaryStarted));
  const archive = implement<TestMap>()(f.archive.declaration, () => open("archive", archiveStarted));
  const graph = prepared(await effectFor<TestMap>().prepare({ profileId: "native/parallel", modules: [primary, archive, f.left, f.right, f.app],
    roots: { app: f.app }, bindings: f.bindings }));
  await Effect.runPromise(Effect.gen(function* () {
    const build = yield* Effect.forkChild(Effect.provide(Roots, graph.layer(Roots)));
    yield* Deferred.await(primaryStarted);
    yield* Deferred.await(archiveStarted);
    yield* Deferred.succeed(proceed, undefined);
    const roots = yield* Fiber.join(build);
    assert.equal(roots.app.left.database, roots.app.primary);
  }));
});

const Resource = defineContract<{ readonly live: () => boolean }>()({ id: "failure/resource", revision: 1 });
interface FailureMap extends CapabilitiesOf<typeof Resource> {}
class FailureRoots extends Context.Service<FailureRoots, { readonly app: string }>()("native-tests/FailureRoots") {}

async function failing(mode: "fail" | "cancel" | "throw" | "malformed", entered: Deferred.Deferred<void>) {
  const stats = { acquired: 0, released: 0, live: false, getterReads: 0 };
  const resource = implement<FailureMap>()(declareModule({ moduleId: "failure/resource", implementationId: "failure/resource",
    owner: { authority: "failure", path: ["resource"] }, provides: [Resource.provide()], slots: [] }), () => Effect.acquireRelease(
      Effect.sync(() => { stats.acquired += 1; stats.live = true; return { live: () => stats.live }; }),
      () => Effect.sync(() => { stats.released += 1; stats.live = false; }),
    ).pipe(Effect.map(value => ({ instance: value, capabilities: { [Resource.id]: value } }))));
  const app = implement<FailureMap>()(declareModule({ moduleId: "failure/app", implementationId: "failure/app",
    owner: { authority: "failure", path: ["app"] }, provides: [], slots: [Resource.slot("resource", required())] }), ({ resource }) => {
      if (mode === "throw") throw new Error("factory-defect");
      return Effect.gen(function* () {
        assert.equal(resource.live(), true);
        yield* Deferred.succeed(entered, undefined);
        if (mode === "fail") return yield* Effect.fail(new BootFailure("construction"));
        if (mode === "cancel") yield* Effect.never;
        const product = { instance: "app", capabilities: {} };
        if (mode === "malformed") Object.defineProperty(product, "instance", { get: () => { stats.getterReads += 1; throw new Error("getter-must-not-run"); } });
        return product;
      });
    });
  return { stats, graph: prepared(await effectFor<FailureMap>().prepare({ profileId: "failure/default", modules: [resource, app], roots: { app } })) };
}

test("typed acquisition failure releases acquired dependencies and preserves the expected error", async () => {
  const f = await failing("fail", Deferred.makeUnsafe<void>());
  const result = await Effect.runPromise(Effect.result(Effect.provide(FailureRoots, f.graph.layer(FailureRoots))));
  assert.equal(result._tag, "Failure");
  if (result._tag === "Failure") assert.ok(result.failure instanceof BootFailure);
  assert.deepEqual(f.stats, { acquired: 1, released: 1, live: false, getterReads: 0 });
});

test("interrupting native acquisition joins cleanup before the caller completes", { timeout: 5000 }, async () => {
  const entered = Deferred.makeUnsafe<void>();
  const f = await failing("cancel", entered);
  await Effect.runPromise(Effect.gen(function* () {
    const build = yield* Effect.forkChild(Effect.provide(FailureRoots, f.graph.layer(FailureRoots)));
    yield* Deferred.await(entered);
    yield* Fiber.interrupt(build);
    assert.equal(Exit.hasInterrupts(yield* Fiber.await(build)), true);
  }));
  assert.deepEqual(f.stats, { acquired: 1, released: 1, live: false, getterReads: 0 });
});

test("factory throws and malformed products remain defects while owned resources release", async () => {
  for (const mode of ["throw", "malformed"] as const) {
    const f = await failing(mode, Deferred.makeUnsafe<void>());
    const result = await Effect.runPromiseExit(Effect.provide(FailureRoots, f.graph.layer(FailureRoots)));
    assert.equal(Exit.isFailure(result), true);
    assert.equal(Exit.hasDies(result), true);
    assert.equal(Exit.hasFails(result), false);
    assert.deepEqual(f.stats, { acquired: 1, released: 1, live: false, getterReads: 0 });
  }
});

const Borrowed = defineContract<{ label: string }>()({ id: "inputs/borrowed", revision: 1 });
interface InputMap extends CapabilitiesOf<typeof Borrowed> {}
class InputRoots extends Context.Service<InputRoots, { readonly app: { readonly label: string; readonly borrowed: { label: string } } }>()("native-tests/InputRoots") {}

async function borrowedFixture() {
  let calls = 0;
  const external = input<InputMap>()(declareModule({ moduleId: "inputs/external", implementationId: "inputs/external",
    owner: { authority: "inputs", path: ["external"] }, provides: [Borrowed.provide()], slots: [] }));
  const app = implement<InputMap>()(declareModule({ moduleId: "inputs/app", implementationId: "inputs/app",
    owner: { authority: "inputs", path: ["app"] }, provides: [], slots: [Borrowed.slot("borrowed", required())] }), ({ borrowed }) => Effect.sync(() => {
      calls += 1;
      return { instance: { label: borrowed.label, borrowed }, capabilities: {} };
    }));
  return { calls: () => calls, graph: prepared(await effectFor<InputMap>().prepare({ profileId: "inputs/default", modules: [app], roots: { app }, inputs: { external } })) };
}

test("borrowed input records are captured at layer creation without freezing their values", async () => {
  const f = await borrowedFixture();
  const first = { label: "first" };
  const values = { external: { [Borrowed.id]: first } };
  const layer = f.graph.layer(InputRoots, { inputs: values });
  values.external[Borrowed.id] = { label: "replacement" };
  assert.equal(f.calls(), 0);
  const roots = await Effect.runPromise(Effect.provide(InputRoots, layer));
  assert.equal(roots.app.borrowed, first);
  assert.equal(Object.isFrozen(first), false);
  assert.equal(roots.app.label, "first");
});

test("invalid borrowed inputs fail through InvalidInputs without evaluating accessors or factories", async () => {
  const f = await borrowedFixture();
  let reads = 0;
  const supplied = { external: { [Borrowed.id]: { label: "valid" } } };
  Object.defineProperty(supplied.external, Borrowed.id, { get: () => { reads += 1; return { label: "bad" }; } });
  const layer = f.graph.layer(InputRoots, { inputs: supplied });
  assert.equal(reads, 0);
  assert.equal(f.calls(), 0);
  const result = await Effect.runPromise(Effect.result(Effect.provide(InputRoots, layer)));
  assert.equal(result._tag, "Failure");
  if (result._tag === "Failure") assert.ok(result.failure instanceof InvalidInputs);
  assert.equal(reads, 0);
  assert.equal(f.calls(), 0);
});

test("each layer call isolates mapper memoization and explicit reuse shares within one native build", async () => {
  const f = await borrowedFixture();
  const first = f.graph.layer(InputRoots, { inputs: { external: { [Borrowed.id]: { label: "first" } } } });
  const second = f.graph.layer(InputRoots, { inputs: { external: { [Borrowed.id]: { label: "second" } } } });
  class A extends Context.Service<A, string>()("native-tests/A") {}
  class B extends Context.Service<B, string>()("native-tests/B") {}
  const a = Layer.effect(A, Effect.map(InputRoots, roots => roots.app.label)).pipe(Layer.provide(first));
  const b = Layer.effect(B, Effect.map(InputRoots, roots => roots.app.label)).pipe(Layer.provide(second));
  const result = await Effect.runPromise(Effect.all([A, B]).pipe(Effect.provide(Layer.mergeAll(a, b))));
  assert.deepEqual(result, ["first", "second"]);
  assert.equal(f.calls(), 2);
  const sharedB = Layer.effect(B, Effect.map(InputRoots, roots => roots.app.label)).pipe(Layer.provide(first));
  assert.deepEqual(await Effect.runPromise(Effect.all([A, B]).pipe(Effect.provide(Layer.mergeAll(a, sharedB)))), ["first", "first"]);
  assert.equal(f.calls(), 3);
});

test("fresh mapper identities also isolate ambient requirements with no borrowed inputs", async () => {
  const f = fixture();
  const graph = prepared(await f.prepare());
  class A extends Context.Service<A, string>()("native-tests/ConfigA") {}
  class B extends Context.Service<B, string>()("native-tests/ConfigB") {}
  const a = Layer.effect(A, Effect.map(Roots, roots => roots.app.primary.label)).pipe(
    Layer.provide(graph.layer(Roots)), Layer.provide(Layer.succeed(Config, { prefix: "a/" })));
  const b = Layer.effect(B, Effect.map(Roots, roots => roots.app.primary.label)).pipe(
    Layer.provide(graph.layer(Roots)), Layer.provide(Layer.succeed(Config, { prefix: "b/" })));
  assert.deepEqual(await Effect.runPromise(Effect.all([A, B]).pipe(Effect.provide(Layer.mergeAll(a, b)))), ["a/primary", "b/primary"]);
  assert.equal(f.stats.acquired, 4);
  assert.equal(f.stats.released, 4);
});
