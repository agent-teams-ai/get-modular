// T24 T49 T103 T117
// F1 on get-modular origin/main sources (Assembly 0.5.0 line, implement<C>()(declaration, factory, scoped)): slices through contracts.
import { declareModule, defineContract, implement, type CapabilitiesOf } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { scoped } from "@get-modular/resources";
import { createStore, type ListenerError, type ReadonlyStore } from "@get-modular/observation";

// Owner-published contract over the whole record (one contract, many consumers).
type AppSettings = { readonly logLevel: "debug" | "info"; readonly theme: string };
export const Settings = defineContract<ReadonlyStore<AppSettings>>()({ id: "acme/settings", revision: 1 });
export type ErrorsPort = { readonly report: (report: ListenerError) => undefined };
export const Errors = defineContract<ErrorsPort>()({ id: "acme/errors", revision: 1 });
export type LoggerPort = { readonly log: (message: string) => undefined };
export const Logger = defineContract<LoggerPort>()({ id: "acme/logger", revision: 1 });
interface Caps extends CapabilitiesOf<typeof Settings | typeof Errors | typeof Logger> {}

const settingsDeclaration = declareModule({
  moduleId: "acme/settings", implementationId: "acme/settings/default", owner: { authority: "acme", path: ["settings"] },
  provides: [Settings.provide()], slots: [Errors.slot("errors", required())],
});
export const settingsModule = implement<Caps>()(settingsDeclaration, async (deps, { resources }) => {
  const store = createStore<AppSettings>({ logLevel: "info", theme: "light" }, { name: "settings", resources, reportError: deps.errors.report });
  return { instance: undefined, capabilities: { "acme/settings": store.readonly() } };
}, scoped);

// Consumer: the slot gives ReadonlyStore<AppSettings>; the application layer types its own slice.
type LoggingSlice = { readonly logLevel: "debug" | "info" };
function startLogger(settings: ReadonlyStore<LoggingSlice>, resources: Parameters<ReadonlyStore<LoggingSlice>["watch"]>[1]["resources"]): LoggerPort {
  const first = settings.read(["logLevel"]);
  let level = first.values.logLevel;
  settings.watch(first, { resources, name: "logger/level", onChange: ({ values }) => { level = values.logLevel; } });
  return { log: (message) => { if (level === "debug") { console.debug(message); } return undefined; } };
}
const loggerDeclaration = declareModule({
  moduleId: "acme/logger", implementationId: "acme/logger/default", owner: { authority: "acme", path: ["logger"] },
  provides: [Logger.provide()], slots: [Settings.slot("settings", required())],
});
export const loggerModule = implement<Caps>()(loggerDeclaration, async (deps, { resources }) => {
  const port = startLogger(deps.settings, resources);
  return { instance: undefined, capabilities: { "acme/logger": port } };
}, scoped);

// Wrong slice in the application layer is caught (alias comparison):
type WrongSlice = { readonly logLevel: number };
declare function startWrong(settings: ReadonlyStore<WrongSlice>): void;
export const wrongModule = implement<Caps>()(loggerDeclaration, async (deps) => {
  // @ts-expect-error wrong slice through ReadonlyStore<>
  startWrong(deps.settings);
  return { instance: undefined, capabilities: { "acme/logger": { log: () => undefined } } };
}, scoped);
// ...but not through a member-picked port (structural comparison):
declare function startPicked(settings: Pick<ReadonlyStore<WrongSlice>, "read">): void;
export const pickedModule = implement<Caps>()(loggerDeclaration, async (deps) => {
  // @ts-expect-error wrong slice through Pick<ReadonlyStore<>, "read">
  startPicked(deps.settings);
  return { instance: undefined, capabilities: { "acme/logger": { log: () => undefined } } };
}, scoped);
