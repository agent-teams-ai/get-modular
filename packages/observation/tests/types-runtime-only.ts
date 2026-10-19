// T27
// Variant B: cases the compiler cannot see; the run time must reject them with a coded error.
import type { Resources } from "@get-modular/resources";
import { createStore, type ListenerError } from "../dist/index.js";
type Theme = { readonly theme: string };
declare const resources: Resources;
declare const reportError: (report: ListenerError) => undefined;
const one = createStore<Theme>({ theme: "light" }, { name: "one", resources, reportError }).readonly();
const two = createStore<Theme>({ theme: "dark" }, { name: "two", resources, reportError }).readonly();
const snapshot = one.read(["theme"]);
// COMPILES, run time: observation.snapshot.foreign (a snapshot of another store with the same record type)
two.watch(snapshot, { resources, name: "x", onChange: () => undefined });
// COMPILES, run time: observation.snapshot.foreign (a spread copy keeps the type-only brand)
one.watch({ ...snapshot, revision: 0 }, { resources, name: "x", onChange: () => undefined });
// COMPILES, run time: observation.argument.invalid (empty name)
one.watch(snapshot, { resources, name: "", onChange: () => undefined });
