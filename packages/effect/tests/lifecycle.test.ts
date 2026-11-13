import assert from "node:assert/strict";
import { mkdtemp, open, rm, writeFile, type FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { declareModule, defineContract, type CapabilitiesOf } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { Cause, Context, Deferred, Effect, Exit } from "effect";
import { effectFor, implement } from "../dist/index.js";
import { BootFailure, prepared } from "./support.ts";

const File = defineContract<FileHandle>()({ id: "lifecycle/file", revision: 1 });
interface LifecycleMap extends CapabilitiesOf<typeof File> {}
const owner = { authority: "lifecycle", path: ["test"] };
const ioError = (error: unknown): Error => error instanceof Error ? error : new Error(String(error));

async function assertAlive(file: FileHandle): Promise<void> {
  const { buffer, bytesRead } = await file.read(new Uint8Array(5), 0, 5, 0);
  assert.equal(bytesRead, 5);
  assert.equal(new TextDecoder().decode(buffer), "alive");
}

test("partial parallel startup joins sibling cleanup, retains its dependency and permits a fresh build", { timeout: 10000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "gm-effect-partial-startup-"));
  const filename = join(directory, "resource.txt");
  await writeFile(filename, "alive");
  const siblingRunning = Deferred.makeUnsafe<void>();
  const siblingFinalizing = Deferred.makeUnsafe<void>();
  const allowCleanup = Deferred.makeUnsafe<void>();
  const controller = new AbortController();
  const files: FileHandle[] = [];
  const events: string[] = [];
  const failure = new BootFailure("parallel-startup");
  let firstAttempt = true;
  let acquired = 0;
  let released = 0;
  let siblingReleases = 0;
  let published = 0;
  let completed = false;
  let pending: Promise<Exit.Exit<void, unknown>> | undefined;
  try {
    class Roots extends Context.Service<Roots, { readonly left: FileHandle; readonly right: string }>()("lifecycle/ParallelRoots") {}
    const resource = implement<LifecycleMap>()(declareModule({ moduleId: "parallel/resource", implementationId: "parallel/resource",
      owner, provides: [File.provide()], slots: [] }), () => Effect.acquireRelease(
      Effect.tryPromise({ try: async () => {
        const file = await open(filename, "r");
        files.push(file);
        acquired += 1;
        events.push("resource-opened");
        return file;
      }, catch: ioError }),
      file => Effect.promise(async () => { await file.close(); released += 1; events.push("resource-closed"); }),
    ).pipe(Effect.map(instance => ({ instance, capabilities: { [File.id]: instance } }))));
    const left = implement<LifecycleMap>()(declareModule({ moduleId: "parallel/left", implementationId: "parallel/left",
      owner, provides: [], slots: [File.slot("file", required())] }), ({ file }) => Effect.gen(function* () {
      yield* Effect.acquireRelease(Effect.succeed(file), () => Effect.gen(function* () {
        yield* Deferred.succeed(siblingFinalizing, undefined);
        yield* Deferred.await(allowCleanup);
        yield* Effect.promise(() => assertAlive(file));
        siblingReleases += 1;
        events.push("sibling-closed");
      }));
      // The failing branch may proceed only after this branch owns its finalizer.
      yield* Deferred.succeed(siblingRunning, undefined);
      if (firstAttempt) yield* Effect.never;
      return { instance: file, capabilities: {} };
    }));
    const right = implement<LifecycleMap>()(declareModule({ moduleId: "parallel/right", implementationId: "parallel/right",
      owner, provides: [], slots: [File.slot("file", required())] }), ({ file }) => Effect.gen(function* () {
      yield* Deferred.await(siblingRunning);
      yield* Effect.promise(() => assertAlive(file));
      if (firstAttempt) return yield* Effect.fail(failure);
      return { instance: "ready", capabilities: {} };
    }));
    const graph = prepared(await effectFor<LifecycleMap>().prepare({
      profileId: "parallel/test", modules: [resource, left, right], roots: { left, right },
    }));
    const layer = graph.layer(Roots);
    const operation = Effect.gen(function* () {
      const roots = yield* Roots;
      published += 1;
      assert.equal(roots.right, "ready");
      yield* Effect.promise(() => assertAlive(roots.left));
    }).pipe(Effect.provide(layer));
    pending = Effect.runPromiseExit(operation, { signal: controller.signal }).then(exit => { completed = true; return exit; });
    await Effect.runPromise(Deferred.await(siblingFinalizing));
    assert.equal(completed, false);
    assert.equal(published, 0);
    assert.equal(acquired, 1);
    assert.equal(released, 0);
    const firstFile = files[0];
    assert.ok(firstFile);
    await assertAlive(firstFile);
    assert.deepEqual(events, ["resource-opened"]);
    await Effect.runPromise(Deferred.succeed(allowCleanup, undefined));
    const exit = await pending;
    assert.ok(Exit.isFailure(exit));
    const failures = exit.cause.reasons.filter(Cause.isFailReason).map(reason => reason.error);
    assert.equal(failures.length, 1);
    assert.equal(failures[0], failure);
    assert.equal(Exit.hasDies(exit), false);
    assert.equal(published, 0);
    assert.equal(released, 1);
    assert.equal(siblingReleases, 1);
    assert.equal(firstFile.fd, -1);
    assert.deepEqual(events, ["resource-opened", "sibling-closed", "resource-closed"]);

    // Same returned Layer, a new native build/Scope: a failed build is not an application cache.
    firstAttempt = false;
    await Effect.runPromise(operation);
    assert.equal(published, 1);
    assert.equal(acquired, 2);
    assert.equal(released, 2);
    assert.equal(siblingReleases, 2);
    assert.notEqual(files[0], files[1]);
    assert.ok(files.every(file => file.fd === -1));
    assert.deepEqual(events, ["resource-opened", "sibling-closed", "resource-closed",
      "resource-opened", "sibling-closed", "resource-closed"]);
  } finally {
    controller.abort();
    await Effect.runPromise(Deferred.succeed(allowCleanup, undefined));
    await pending;
    for (const file of files) if (file.fd !== -1) await file.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("interruption during foreign acquisition retains the late file through joined cleanup and a later build", { timeout: 10000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "gm-effect-late-acquisition-"));
  const filename = join(directory, "resource.txt");
  await writeFile(filename, "alive");
  const foreignStarted = Promise.withResolvers<void>();
  const allowAcquisition = Promise.withResolvers<void>();
  const finalizing = Deferred.makeUnsafe<void>();
  const allowClose = Promise.withResolvers<void>();
  const controller = new AbortController();
  const files: FileHandle[] = [];
  const events: string[] = [];
  let acquired = 0;
  let released = 0;
  let published = 0;
  let completed = false;
  let pending: Promise<Exit.Exit<void, unknown>> | undefined;
  try {
    class Roots extends Context.Service<Roots, { readonly app: FileHandle }>()("lifecycle/LateRoots") {}
    const app = implement<LifecycleMap>()(declareModule({ moduleId: "late/app", implementationId: "late/app",
      owner, provides: [], slots: [] }), () => Effect.acquireRelease(
      // Default acquireRelease protects acquisition until release ownership is installed.
      // This foreign operation deliberately cannot abort; its finite completion is controlled here.
      Effect.tryPromise({ try: async () => {
        foreignStarted.resolve();
        await allowAcquisition.promise;
        const file = await open(filename, "r");
        files.push(file);
        acquired += 1;
        events.push("resource-opened");
        return file;
      }, catch: ioError }),
      file => Effect.gen(function* () {
        yield* Deferred.succeed(finalizing, undefined);
        yield* Effect.promise(async () => {
          await allowClose.promise;
          await file.close();
          released += 1;
          events.push("resource-closed");
        });
      }),
    ).pipe(Effect.map(instance => ({ instance, capabilities: {} }))));
    const graph = prepared(await effectFor<LifecycleMap>().prepare({ profileId: "late/test", modules: [app], roots: { app } }));
    const layer = graph.layer(Roots);
    const operation = Effect.gen(function* () {
      const roots = yield* Roots;
      published += 1;
      yield* Effect.promise(() => assertAlive(roots.app));
    }).pipe(Effect.provide(layer));
    pending = Effect.runPromiseExit(operation, { signal: controller.signal }).then(exit => { completed = true; return exit; });
    await foreignStarted.promise;
    controller.abort();
    assert.equal(completed, false);
    assert.equal(acquired, 0);
    assert.equal(published, 0);
    allowAcquisition.resolve();
    await Effect.runPromise(Deferred.await(finalizing));
    assert.equal(completed, false);
    assert.equal(acquired, 1);
    assert.equal(released, 0);
    assert.equal(published, 0);
    const firstFile = files[0];
    assert.ok(firstFile);
    await assertAlive(firstFile);
    assert.deepEqual(events, ["resource-opened"]);
    allowClose.resolve();
    const exit = await pending;
    assert.ok(Exit.hasInterrupts(exit));
    assert.equal(Exit.hasFails(exit), false);
    assert.equal(Exit.hasDies(exit), false);
    assert.equal(released, 1);
    assert.equal(published, 0);
    assert.equal(firstFile.fd, -1);
    assert.deepEqual(events, ["resource-opened", "resource-closed"]);

    await Effect.runPromise(operation);
    assert.equal(published, 1);
    assert.equal(acquired, 2);
    assert.equal(released, 2);
    assert.notEqual(files[0], files[1]);
    assert.ok(files.every(file => file.fd === -1));
    assert.deepEqual(events, ["resource-opened", "resource-closed", "resource-opened", "resource-closed"]);
  } finally {
    controller.abort();
    allowAcquisition.resolve();
    allowClose.resolve();
    await pending;
    for (const file of files) if (file.fd !== -1) await file.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("malformed product rejection joins cleanup of the resource acquired by that same factory", { timeout: 10000 }, async context => {
  const directory = await mkdtemp(join(tmpdir(), "gm-effect-malformed-product-"));
  const filename = join(directory, "resource.txt");
  const finalizing = Deferred.makeUnsafe<void>();
  const allowClose = Deferred.makeUnsafe<void>();
  const controller = new AbortController();
  const files: FileHandle[] = [];
  const events: string[] = [];
  let acquired = 0;
  let released = 0;
  let getterReads = 0;
  let published = 0;
  let completed = false;
  let pending: Promise<Exit.Exit<void, unknown>> | undefined;
  try {
    await writeFile(filename, "alive");
    class Roots extends Context.Service<Roots, { readonly app: FileHandle }>()("lifecycle/MalformedRoots") {}
    const app = implement<LifecycleMap>()(declareModule({ moduleId: "malformed/app", implementationId: "malformed/app",
      owner, provides: [], slots: [] }), () => Effect.acquireRelease(
      Effect.tryPromise({ try: async () => {
        const file = await open(filename, "r");
        files.push(file);
        acquired += 1;
        events.push("resource-opened");
        return file;
      }, catch: ioError }),
      file => Effect.gen(function* () {
        events.push("cleanup-started");
        yield* Deferred.succeed(finalizing, undefined);
        yield* Deferred.await(allowClose);
        yield* Effect.promise(async () => {
          await assertAlive(file);
          await file.close();
          released += 1;
          events.push("resource-closed");
        });
      }),
    ).pipe(Effect.map(instance => {
      const product = { instance, capabilities: {} };
      // The value has the declared TypeScript shape, but accessors are not an
      // accepted product record. Its already acquired resource must stay owned.
      Object.defineProperty(product, "instance", { get: () => { getterReads += 1; return instance; } });
      return product;
    })));
    const graph = prepared(await effectFor<LifecycleMap>().prepare({ profileId: "malformed/test", modules: [app], roots: { app } }));
    const operation = Effect.gen(function* () {
      const roots = yield* Roots;
      published += 1;
      yield* Effect.promise(() => assertAlive(roots.app));
    }).pipe(Effect.provide(graph.layer(Roots)));
    pending = Effect.runPromiseExit(operation, { signal: controller.signal }).then(exit => { completed = true; return exit; });
    await Effect.runPromise(Deferred.await(finalizing), { signal: context.signal });
    assert.equal(completed, false);
    assert.equal(published, 0);
    assert.equal(getterReads, 0);
    assert.equal(acquired, 1);
    assert.equal(released, 0);
    const file = files[0];
    assert.ok(file);
    await assertAlive(file);
    assert.deepEqual(events, ["resource-opened", "cleanup-started"]);
    await Effect.runPromise(Deferred.succeed(allowClose, undefined));
    const exit = await pending;
    assert.ok(Exit.isFailure(exit));
    assert.equal(Exit.hasDies(exit), true);
    const defects = exit.cause.reasons.filter(Cause.isDieReason).map(reason => reason.defect);
    assert.equal(defects.length, 1);
    const defect = defects[0];
    assert.ok(defect instanceof Error);
    assert.equal(defect.message, "assembly.snapshot.shape");
    assert.equal(Exit.hasFails(exit), false);
    assert.equal(Exit.hasInterrupts(exit), false);
    assert.equal(getterReads, 0);
    assert.equal(published, 0);
    assert.equal(released, 1);
    assert.equal(file.fd, -1);
    assert.deepEqual(events, ["resource-opened", "cleanup-started", "resource-closed"]);
  } finally {
    controller.abort();
    await Effect.runPromise(Deferred.succeed(allowClose, undefined));
    await pending;
    for (const file of files) if (file.fd !== -1) await file.close();
    await rm(directory, { recursive: true, force: true });
  }
});
