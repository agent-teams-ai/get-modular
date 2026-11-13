import assert from "node:assert/strict";
import { mkdtemp, open, rm, writeFile, type FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { declareModule, defineContract, type CapabilitiesOf } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, Stream } from "effect";
import { effectFor, implement, input } from "../dist/index.js";
import { BootFailure, prepared } from "./support.ts";

const File = defineContract<FileHandle>()({ id: "consumer/file", revision: 1 });
interface ConsumerMap extends CapabilitiesOf<typeof File> {}
class ApplicationRoots extends Context.Service<ApplicationRoots, { readonly app: FileHandle }>()("consumer/ApplicationRoots") {}
class SessionRoots extends Context.Service<SessionRoots, { readonly session: Stream.Stream<string, Error> }>()("consumer/SessionRoots") {}
const sharedInput = input<ConsumerMap>()(declareModule({ moduleId: "consumer/input", implementationId: "consumer/input",
  owner: { authority: "consumer", path: ["input"] }, provides: [File.provide()], slots: [] }));

async function readAlive(file: FileHandle): Promise<string> {
  const { buffer, bytesRead } = await file.read(new Uint8Array(5), 0, 5, 0);
  assert.equal(bytesRead, 5);
  return new TextDecoder().decode(buffer);
}
const ioError = (error: unknown): Error => error instanceof Error ? error : new Error(String(error));

test("a provider's private Layer stays open through operations and its dependent asynchronous finalizer", { timeout: 10000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "gm-effect-dependent-"));
  const filename = join(directory, "resource.txt");
  await writeFile(filename, "alive");
  try {
    const events: string[] = [];
    const finalizing = Deferred.makeUnsafe<void>();
    const proceed = Deferred.makeUnsafe<void>();
    class PrivateFile extends Context.Service<PrivateFile, FileHandle>()("consumer/PrivateFile") {}
    const privateFileLive = Layer.effect(PrivateFile, Effect.acquireRelease(
      Effect.tryPromise({ try: () => open(filename, "r"), catch: ioError }),
      file => Effect.promise(async () => { await file.close(); events.push("provider-closed"); }),
    ));
    const provider = implement<ConsumerMap>()(declareModule({ moduleId: "dependent/file", implementationId: "dependent/file",
      owner: { authority: "consumer", path: ["file"] }, provides: [File.provide()], slots: [] }), () => Effect.gen(function* () {
        const file = Context.get(yield* Layer.build(privateFileLive), PrivateFile);
        return { instance: file, capabilities: { [File.id]: file } };
      }));
    const app = implement<ConsumerMap>()(declareModule({ moduleId: "dependent/app", implementationId: "dependent/app",
      owner: { authority: "consumer", path: ["app"] }, provides: [], slots: [File.slot("file", required())] }), ({ file }) =>
      Effect.acquireRelease(Effect.succeed(file), () => Effect.gen(function* () {
        yield* Deferred.succeed(finalizing, undefined);
        yield* Deferred.await(proceed);
        yield* Effect.promise(async () => { assert.equal(await readAlive(file), "alive"); events.push("dependent-closed"); });
      })).pipe(Effect.map(instance => ({ instance, capabilities: {} }))));
    const graph = prepared(await effectFor<ConsumerMap>().prepare({ profileId: "dependent/test", modules: [provider, app], roots: { app } }));
    await Effect.runPromise(Effect.gen(function* () {
      const operation = Effect.gen(function* () {
        const { app } = yield* ApplicationRoots;
        yield* Effect.promise(async () => { assert.equal(await readAlive(app), "alive"); events.push("operation-read"); });
      });
      const work = yield* Effect.forkChild(Effect.provide(operation, graph.layer(ApplicationRoots)));
      yield* Deferred.await(finalizing);
      assert.deepEqual(events, ["operation-read"]);
      yield* Deferred.succeed(proceed, undefined);
      yield* Fiber.join(work);
    }));
    assert.deepEqual(events, ["operation-read", "dependent-closed", "provider-closed"]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("finalizer defects preserve both causes and close a shared file after every dependent", { timeout: 10000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "gm-effect-finalizer-defects-"));
  const filename = join(directory, "resource.txt");
  await writeFile(filename, "alive");
  try {
    const events: string[] = [];
    const dependentDefect = new Error("dependent-finalizer-defect");
    const providerDefect = new Error("provider-finalizer-defect");
    let acquired = 0;
    let released = 0;
    class DefectRoots extends Context.Service<DefectRoots, { readonly left: FileHandle; readonly right: FileHandle }>()("consumer/DefectRoots") {}
    const owner = { authority: "defects", path: ["test"] };
    const resource = implement<ConsumerMap>()(declareModule({ moduleId: "defects/resource", implementationId: "defects/resource",
      owner, provides: [File.provide()], slots: [] }), () => Effect.acquireRelease(
      Effect.tryPromise({ try: async () => {
        const file = await open(filename, "r");
        acquired += 1;
        return file;
      }, catch: ioError }),
      file => Effect.gen(function* () {
        yield* Effect.promise(async () => { await file.close(); released += 1; events.push("provider-closed"); });
        return yield* Effect.die(providerDefect);
      }),
    ).pipe(Effect.map(file => ({ instance: file, capabilities: { [File.id]: file } }))));
    const consumer = (name: "left" | "right") => implement<ConsumerMap>()(declareModule({
      moduleId: `defects/${name}`, implementationId: `defects/${name}`, owner,
      provides: [], slots: [File.slot("file", required())],
    }), ({ file }) => Effect.acquireRelease(Effect.succeed(file), () => Effect.gen(function* () {
      yield* Effect.promise(async () => { assert.equal(await readAlive(file), "alive"); events.push(`${name}-closed`); });
      if (name === "left") return yield* Effect.die(dependentDefect);
    })).pipe(Effect.map(instance => ({ instance, capabilities: {} }))));
    const left = consumer("left"), right = consumer("right");
    const graph = prepared(await effectFor<ConsumerMap>().prepare({
      profileId: "defects/test", modules: [resource, left, right], roots: { left, right },
    }));
    const exit = await Effect.runPromiseExit(Effect.gen(function* () {
      const roots = yield* DefectRoots;
      assert.equal(roots.left, roots.right);
      yield* Effect.promise(async () => { assert.equal(await readAlive(roots.left), "alive"); });
    }).pipe(Effect.provide(graph.layer(DefectRoots))));
    assert.ok(Exit.isFailure(exit));
    const defects = exit.cause.reasons.filter(Cause.isDieReason).map(reason => reason.defect);
    assert.equal(defects.length, 2);
    assert.ok(defects.includes(dependentDefect));
    assert.ok(defects.includes(providerDefect));
    assert.equal(Exit.hasFails(exit), false);
    assert.equal(Exit.hasInterrupts(exit), false);
    assert.equal(acquired, 1);
    assert.equal(released, 1);
    assert.equal(events.at(-1), "provider-closed");
    assert.equal(events.filter(event => event === "left-closed").length, 1);
    assert.equal(events.filter(event => event === "right-closed").length, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("a shared application resource outlives both local sessions and their async finalizers", { timeout: 10000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "gm-effect-consumer-"));
  const filename = join(directory, "journal.txt");
  await writeFile(filename, "alive");
  try {
    for (const failFirst of [false, true]) {
      const events: string[] = [];
      let localCount = 0;
      const bothStarted = Deferred.makeUnsafe<void>();
      const app = implement<ConsumerMap>()(declareModule({ moduleId: "consumer/app", implementationId: "consumer/app",
        owner: { authority: "consumer", path: ["app"] }, provides: [], slots: [] }), () => Effect.acquireRelease(
          Effect.tryPromise({ try: () => open(filename, "r"), catch: ioError }),
          file => Effect.promise(async () => { await file.close(); events.push("shared-closed"); }),
        ).pipe(Effect.map(file => { events.push("shared-open"); return { instance: file, capabilities: {} }; })));
      const application = prepared(await effectFor<ConsumerMap>().prepare({ profileId: "consumer/application", modules: [app], roots: { app } }));

      const makeSession = async (name: string) => {
        const session = implement<ConsumerMap>()(declareModule({ moduleId: "consumer/session", implementationId: "consumer/session",
          owner: { authority: "consumer", path: ["session"] }, provides: [], slots: [File.slot("file", required())] }), ({ file }) => Effect.gen(function* () {
            yield* Effect.acquireRelease(Effect.sync(() => { events.push(`${name}-open`); localCount += 1; }),
              () => Effect.promise(async () => {
                await Promise.resolve();
                assert.equal(await readAlive(file), "alive");
                events.push(`${name}-closed`);
              }));
            if (localCount === 2) yield* Deferred.succeed(bothStarted, undefined);
            const first = Effect.gen(function* () {
              yield* Deferred.await(bothStarted);
              if (failFirst && name === "a") return yield* Effect.fail(new BootFailure("session-a"));
              const text = yield* Effect.tryPromise({ try: () => readAlive(file), catch: ioError });
              events.push(`${name}-read`);
              return text;
            });
            return { instance: Stream.concat(Stream.fromEffect(first), Stream.never), capabilities: {} };
          }));
        return prepared(await effectFor<ConsumerMap>().prepare({ profileId: `consumer/${name}`, modules: [session],
          roots: { session }, inputs: { shared: sharedInput } }));
      };
      const sessions = await Promise.all([makeSession("a"), makeSession("b")]);
      const program = Effect.scoped(Effect.gen(function* () {
        const shared = Context.get(yield* Layer.build(application.layer(ApplicationRoots)), ApplicationRoots).app;
        yield* Effect.forEach(sessions, session => Effect.scoped(Effect.gen(function* () {
          const root = Context.get(yield* Layer.build(session.layer(SessionRoots, { inputs: { shared: { [File.id]: shared } } })), SessionRoots);
          yield* Stream.runDrain(failFirst ? root.session : Stream.take(root.session, 1));
        })), { concurrency: 2, discard: true });
      }));
      const result = await Effect.runPromiseExit(program);
      assert.equal(Exit.isFailure(result), failFirst);
      assert.equal(events[0], "shared-open");
      assert.equal(events.at(-1), "shared-closed");
      assert.equal(events.filter(value => value === "a-closed").length, 1);
      assert.equal(events.filter(value => value === "b-closed").length, 1);
      assert.equal(events.filter(value => value === "shared-closed").length, 1);
      if (!failFirst) assert.ok(events.includes("a-read") && events.includes("b-read"));
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("an observed worker failure interrupts foreground and finishes its resource-using finalizer", { timeout: 10000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "gm-effect-worker-"));
  const filename = join(directory, "resource.txt");
  await writeFile(filename, "alive");
  try {
    const events: string[] = [];
    const foregroundStarted = Deferred.makeUnsafe<void>();
    const finalizerStarted = Deferred.makeUnsafe<void>();
    const permitFinalizer = Deferred.makeUnsafe<void>();
    const app = implement<ConsumerMap>()(declareModule({ moduleId: "worker/app", implementationId: "worker/app",
      owner: { authority: "worker", path: ["app"] }, provides: [], slots: [] }), () => Effect.acquireRelease(
        Effect.tryPromise({ try: () => open(filename, "r"), catch: ioError }),
        file => Effect.promise(async () => { await file.close(); events.push("resource-closed"); }),
      ).pipe(Effect.map(file => ({ instance: file, capabilities: {} }))));
    const graph = prepared(await effectFor<ConsumerMap>().prepare({ profileId: "worker/test", modules: [app], roots: { app } }));
    const work = Effect.scoped(Effect.gen(function* () {
      const resource = Context.get(yield* Layer.build(graph.layer(ApplicationRoots)), ApplicationRoots).app;
      const worker = yield* Effect.forkScoped(Effect.gen(function* () {
        yield* Deferred.await(foregroundStarted);
        return yield* Effect.fail(new BootFailure("worker-failed"));
      }));
      const foreground = Effect.gen(function* () {
        yield* Deferred.succeed(foregroundStarted, undefined);
        yield* Effect.never;
      }).pipe(Effect.ensuring(Effect.gen(function* () {
        yield* Deferred.succeed(finalizerStarted, undefined);
        yield* Deferred.await(permitFinalizer);
        yield* Effect.promise(async () => { assert.equal(await readAlive(resource), "alive"); events.push("foreground-finalized"); });
      })));
      yield* Effect.raceFirst(Fiber.join(worker), foreground);
    }));
    const result = await Effect.runPromise(Effect.gen(function* () {
      const running = yield* Effect.forkChild(work);
      yield* Deferred.await(finalizerStarted);
      assert.deepEqual(events, []);
      yield* Deferred.succeed(permitFinalizer, undefined);
      return yield* Fiber.await(running);
    }));
    assert.equal(Exit.isFailure(result), true);
    assert.deepEqual(events, ["foreground-finalized", "resource-closed"]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

const Ready = defineContract<{ readonly ready: boolean }>()({ id: "startup/ready", revision: 1 });
interface StartupMap extends CapabilitiesOf<typeof Ready> {}
class StartupRoots extends Context.Service<StartupRoots, { readonly worker: string }>()("consumer/StartupRoots") {}

test("application setup runs before eager worker acquisition and failure prevents startup", async () => {
  for (const failSetup of [false, true]) {
    const events: string[] = [];
    const ready = input<StartupMap>()(declareModule({ moduleId: "startup/ready", implementationId: "startup/ready",
      owner: { authority: "startup", path: ["ready"] }, provides: [Ready.provide()], slots: [] }));
    const worker = implement<StartupMap>()(declareModule({ moduleId: "startup/worker", implementationId: "startup/worker",
      owner: { authority: "startup", path: ["worker"] }, provides: [], slots: [Ready.slot("ready", required())] }), ({ ready }) => Effect.sync(() => {
        assert.equal(ready.ready, true);
        events.push("worker-started");
        return { instance: "worker", capabilities: {} };
      }));
    const graph = prepared(await effectFor<StartupMap>().prepare({ profileId: "startup/default", modules: [worker], roots: { worker }, inputs: { ready } }));
    const program = Effect.scoped(Effect.gen(function* () {
      const state = yield* Effect.acquireRelease(Effect.sync(() => { events.push("prerequisites"); return { ready: false }; }),
        () => Effect.sync(() => { events.push("prerequisites-closed"); }));
      events.push("setup");
      if (failSetup) return yield* Effect.fail(new BootFailure("setup"));
      state.ready = true;
      yield* Layer.build(graph.layer(StartupRoots, { inputs: { ready: { [Ready.id]: state } } }));
      events.push("admitted");
    }));
    assert.equal(Exit.isFailure(await Effect.runPromiseExit(program)), failSetup);
    assert.deepEqual(events, failSetup ? ["prerequisites", "setup", "prerequisites-closed"]
      : ["prerequisites", "setup", "worker-started", "admitted", "prerequisites-closed"]);
  }
});

test("typed fake composition omits the live provider and its private resource graph", async () => {
  const Value = defineContract<string>()({ id: "variant/value", revision: 1 });
  const Database = defineContract<string>()({ id: "variant/database", revision: 1 });
  interface Map extends CapabilitiesOf<typeof Value | typeof Database> {}
  class VariantRoots extends Context.Service<VariantRoots, { readonly app: string }>()("consumer/VariantRoots") {}
  let acquisitions = 0;
  const owner = { authority: "variant", path: ["test"] };
  const db = implement<Map>()(declareModule({ moduleId: "variant/database", implementationId: "variant/database", owner,
    provides: [Database.provide()], slots: [] }), () => Effect.sync(() => {
      acquisitions += 1;
      return { instance: "database", capabilities: { [Database.id]: "database" } };
    }));
  const live = implement<Map>()(declareModule({ moduleId: "variant/repository", implementationId: "variant/live", owner,
    provides: [Value.provide()], slots: [Database.slot("database", required())] }), ({ database }) =>
      Effect.succeed({ instance: database, capabilities: { [Value.id]: database } }));
  const fake = implement<Map>()(declareModule({ moduleId: "variant/repository", implementationId: "variant/fake", owner,
    provides: [Value.provide()], slots: [] }), () => Effect.succeed({ instance: "fake", capabilities: { [Value.id]: "fake" } }));
  const app = implement<Map>()(declareModule({ moduleId: "variant/app", implementationId: "variant/app", owner,
    provides: [], slots: [Value.slot("value", required())] }), ({ value }) => Effect.succeed({ instance: value, capabilities: {} }));
  const liveGraph = prepared(await effectFor<Map>().prepare({ profileId: "variant/live", modules: [db, live, app], roots: { app } }));
  const fakeGraph = prepared(await effectFor<Map>().prepare({ profileId: "variant/fake", modules: [fake, app], roots: { app } }));
  assert.equal((await Effect.runPromise(Effect.provide(VariantRoots, fakeGraph.layer(VariantRoots)))).app, "fake");
  assert.equal(acquisitions, 0);
  assert.equal((await Effect.runPromise(Effect.provide(VariantRoots, liveGraph.layer(VariantRoots)))).app, "database");
  assert.equal(acquisitions, 1);
});
