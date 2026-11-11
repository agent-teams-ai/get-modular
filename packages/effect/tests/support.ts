import assert from "node:assert/strict";
import { declareModule, defineContract, type CapabilitiesOf } from "@get-modular/assembly";
import { many, optional, required } from "@get-modular/core";
import { Context, Effect } from "effect";
import { effectFor, group, implement } from "../dist/index.js";

export interface Database { readonly label: string; readonly serial: number }
export const DatabasePort = defineContract<Database>()({ id: "native/database", revision: 1 });
export const LeftPort = defineContract<{ readonly database: Database }>()({ id: "native/left", revision: 1 });
export const RightPort = defineContract<{ readonly database: Database }>()({ id: "native/right", revision: 1 });
export const LoggerPort = defineContract<{ readonly log: (message: string) => void }>()({ id: "native/logger", revision: 1 });
export interface TestMap extends CapabilitiesOf<typeof DatabasePort | typeof LeftPort | typeof RightPort | typeof LoggerPort> {}
export class Config extends Context.Service<Config, { readonly prefix: string }>()("native-tests/Config") {}
export interface Application {
  readonly primary: Database;
  readonly archive: Database;
  readonly left: { readonly database: Database };
  readonly right: { readonly database: Database };
  readonly logger: { readonly log: (message: string) => void } | undefined;
  readonly ordered: readonly Database[];
  readonly single: readonly Database[];
}
export class Roots extends Context.Service<Roots, { readonly app: Application }>()("native-tests/Roots") {}
export class BootFailure extends Error { readonly _tag = "BootFailure"; }

export function prepared<P>(result:
  | { readonly status: "prepared"; readonly prepared: P }
  | { readonly status: "failed"; readonly error: { readonly code: string; readonly cause: unknown } },
): P {
  if (result.status !== "prepared") throw new Error(result.error.code, { cause: result.error.cause });
  return result.prepared;
}

export function fixture() {
  const stats = { acquired: 0, released: 0, calls: 0 };
  const ownerPath = ["fixture"];
  const owner = { authority: "native", path: ownerPath };
  const primaryDeclaration = declareModule({ moduleId: "native/primary", implementationId: "native/primary-v1", owner,
    provides: [DatabasePort.provide()], slots: [] });
  const archiveDeclaration = declareModule({ moduleId: "native/archive", implementationId: "native/archive-v1", owner,
    provides: [DatabasePort.provide()], slots: [] });
  const database = (label: string) => Effect.gen(function* () {
    const config = yield* Config;
    return yield* Effect.acquireRelease(
      Effect.sync(() => {
        stats.acquired += 1;
        stats.calls += 1;
        const value = { label: config.prefix + label, serial: stats.acquired };
        return { instance: value, capabilities: { [DatabasePort.id]: value } };
      }),
      () => Effect.sync(() => { stats.released += 1; }),
    );
  });
  const primary = implement<TestMap>()(primaryDeclaration, () => database("primary"));
  const archive = implement<TestMap>()(archiveDeclaration, () => database("archive"));
  const left = implement<TestMap>()(declareModule({ moduleId: "native/left", implementationId: "native/left-v1", owner,
    provides: [LeftPort.provide()], slots: [DatabasePort.slot("database", required())] }), ({ database }) => Effect.sync(() => {
      stats.calls += 1;
      const value = { database };
      return { instance: value, capabilities: { [LeftPort.id]: value } };
    }));
  const right = implement<TestMap>()(declareModule({ moduleId: "native/right", implementationId: "native/right-v1", owner,
    provides: [RightPort.provide()], slots: [DatabasePort.slot("database", required())] }), ({ database }) => Effect.sync(() => {
      stats.calls += 1;
      const value = { database };
      return { instance: value, capabilities: { [RightPort.id]: value } };
    }));
  const app = implement<TestMap>()(declareModule({ moduleId: "native/app", implementationId: "native/app-v1", owner,
    provides: [], slots: [DatabasePort.slot("primary", required()), DatabasePort.slot("archive", required()),
      LeftPort.slot("left", required()), RightPort.slot("right", required()), LoggerPort.slot("logger", optional()),
      DatabasePort.slot("ordered", many({ min: 1, max: 2 })),
      DatabasePort.slot("single", many({ min: 1, max: 1 }))] }), (dependencies) => Effect.sync(() => {
      stats.calls += 1;
      return { instance: dependencies, capabilities: {} };
    }));
  const bindings = [
    { consumerImplementationId: app.declaration.implementationId, slotId: "primary", providerImplementationIds: [primary.declaration.implementationId] },
    { consumerImplementationId: app.declaration.implementationId, slotId: "archive", providerImplementationIds: [archive.declaration.implementationId] },
    { consumerImplementationId: app.declaration.implementationId, slotId: "logger", providerImplementationIds: [] },
    { consumerImplementationId: app.declaration.implementationId, slotId: "ordered", providerImplementationIds: [archive.declaration.implementationId, primary.declaration.implementationId] },
    { consumerImplementationId: app.declaration.implementationId, slotId: "single", providerImplementationIds: [primary.declaration.implementationId] },
    { consumerImplementationId: left.declaration.implementationId, slotId: "database", providerImplementationIds: [primary.declaration.implementationId] },
    { consumerImplementationId: right.declaration.implementationId, slotId: "database", providerImplementationIds: [primary.declaration.implementationId] },
  ];
  const modules = [primary, archive, left, right, app] as const;
  return { stats, ownerPath, primary, archive, left, right, app, modules, bindings,
    prepare: () => effectFor<TestMap>().prepare({ profileId: "native/test", modules: [group("application", modules)], roots: { app }, bindings }) };
}

/** Runtime hostile-input fixtures deliberately cross the typed public boundary. */
export async function uncheckedPreparation(api: { readonly prepare: unknown }, input: unknown): Promise<unknown> {
  assert.ok(typeof api.prepare === "function");
  const result: unknown = await Reflect.apply(api.prepare, api, [input]);
  return result;
}

export function assertPreparationFailure(value: unknown, code?: string): void {
  assert.ok(value !== null && typeof value === "object" && "status" in value);
  assert.equal(value.status, "failed");
  if (code !== undefined) {
    assert.ok("error" in value && value.error !== null && typeof value.error === "object" && "code" in value.error);
    assert.equal(value.error.code, code);
  }
}
