// T15 T103
// Compiled with exactOptionalPropertyTypes=false: set must still reject undefined for a string key.
import type { Resources } from "@get-modular/resources";
import { createStore, type ListenerError } from "../dist/index.js";
declare const resources: Resources;
declare const reportError: (report: ListenerError) => undefined;
const store = createStore<{ readonly theme: string; readonly accent: string | undefined }>({ theme: "light", accent: undefined }, { name: "s", resources, reportError });
// @ts-expect-error undefined for a string key
store.set({ theme: undefined });
// @ts-expect-error unknown key
store.set({ colour: "red" });
const ok: number = store.set({ theme: "dark", accent: undefined });
void ok;
