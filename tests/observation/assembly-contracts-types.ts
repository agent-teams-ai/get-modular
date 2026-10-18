// T24 T49 T103 T117
// Variant B inside real Get Modular 0.4.0 contracts: a consumer-owned slice contract, a wide owner store, ModuleFactory.
import { declareModule, defineContract, type CapabilitiesOf, type ModuleFactory } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import type { ModuleContext } from "@get-modular/resources";
import { createStore, type ListenerError, type ReadonlyStore } from "../../packages/observation/dist/index.js";

// Consumer-owned slice and port (the logger package owns them).
export type LoggingSettings = { readonly logLevel: "debug" | "info" };
export type LoggerPort = { readonly log: (message: string) => undefined };
export const LoggingSettingsContract = defineContract<ReadonlyStore<LoggingSettings>>()({ id: "acme/logger/settings", revision: 1 });
export const Logger = defineContract<LoggerPort>()({ id: "acme/logger", revision: 1 });
export type ErrorsPort = { readonly report: (report: ListenerError) => undefined };
export const Errors = defineContract<ErrorsPort>()({ id: "acme/errors", revision: 1 });

export const loggerDeclaration = declareModule({
  moduleId: "acme/logger", implementationId: "acme/logger/default", owner: { authority: "acme", path: ["logger"] },
  provides: [Logger.provide()], slots: [LoggingSettingsContract.slot("settings", required())],
});
export const createLogger: ModuleFactory<
  CapabilitiesOf<typeof LoggingSettingsContract | typeof Logger>, typeof loggerDeclaration, undefined, ModuleContext
> = async (deps, { resources }) => {
  const first = deps.settings.read(["logLevel"]);
  let level = first.values.logLevel;
  deps.settings.watch(first, { resources, name: "logger/level", onChange: ({ values }) => { level = values.logLevel; } });
  const port: LoggerPort = { log: (message) => { if (level === "debug") { console.debug(message); } return undefined; } };
  return { instance: undefined, capabilities: { "acme/logger": port } };
};

// The settings owner: one wide store, the readonly facet serves the slice contract by covariance.
type AppSettings = { readonly logLevel: "debug" | "info"; readonly theme: string };
export const settingsDeclaration = declareModule({
  moduleId: "acme/settings", implementationId: "acme/settings/default", owner: { authority: "acme", path: ["settings"] },
  provides: [LoggingSettingsContract.provide()], slots: [Errors.slot("errors", required())],
});
export const createSettings: ModuleFactory<
  CapabilitiesOf<typeof LoggingSettingsContract | typeof Errors>, typeof settingsDeclaration, undefined, ModuleContext
> = async (deps, { resources }) => {
  const store = createStore<AppSettings>({ logLevel: "info", theme: "light" }, { name: "settings", resources, reportError: deps.errors.report });
  return { instance: undefined, capabilities: { "acme/logger/settings": store.readonly() } };
};

// @ts-expect-error the owner cannot hand out the writable store
export const leaky: ModuleFactory<CapabilitiesOf<typeof LoggingSettingsContract | typeof Errors>, typeof settingsDeclaration, undefined, ModuleContext> = async (deps, { resources }) => ({ instance: undefined, capabilities: { "acme/logger/settings": createStore<AppSettings>({ logLevel: "info", theme: "light" }, { name: "settings", resources, reportError: deps.errors.report }) } });
type Unrelated = { readonly logLevel: number };
// @ts-expect-error a store of a different value type cannot serve the slice
export const wrong: ModuleFactory<CapabilitiesOf<typeof LoggingSettingsContract | typeof Errors>, typeof settingsDeclaration, undefined, ModuleContext> = async (deps, { resources }) => ({ instance: undefined, capabilities: { "acme/logger/settings": createStore<Unrelated>({ logLevel: 1 }, { name: "settings", resources, reportError: deps.errors.report }).readonly() } });
