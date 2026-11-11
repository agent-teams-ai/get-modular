import type { ModuleDeclaration } from "@get-modular/core";
import type {
  ContextAdapter, InputEntry, ModuleEntry, ModuleFactory, ValidDeclaration,
} from "./types.js";
import type { ExecutableFactory } from "./ports.js";
import { AssemblyBindingError, captureDeclaration, captureInput, createEntryStore, type EntryStore } from "./entry-store.js";
export { AssemblyBindingError, isInputEntry } from "./entry-store.js";

export const promiseEntries: EntryStore<ExecutableFactory> = createEntryStore<ExecutableFactory>();
export const metadataFor: EntryStore<ExecutableFactory>["metadataFor"] = promiseEntries.metadataFor;
export const isModuleEntry: EntryStore<ExecutableFactory>["isModuleEntry"] = promiseEntries.isModuleEntry;

/** Creates a slot-free input entry `{ declaration }`. */
export function input<C>() {
  return function inputEntry<const D extends ModuleDeclaration & { readonly slots: readonly [] }>(
    declaration: D & ValidDeclaration<C, NoInfer<D>>,
  ): InputEntry<C, D> {
    return captureInput(declaration) as InputEntry<C, D>;
  };
}

/** Creates a module entry; the optional adapter turns a factory for another context into one for `FactoryContext`. */
export function implement<C>(): {
  <const D extends ModuleDeclaration, I>(declaration: D & ValidDeclaration<C, NoInfer<D>>,
    factory: ModuleFactory<C, NoInfer<D>, I>): ModuleEntry<C, D, I>;
  <const D extends ModuleDeclaration, I, X>(declaration: D & ValidDeclaration<C, NoInfer<D>>,
    factory: ModuleFactory<C, NoInfer<D>, I, X>, adapter: ContextAdapter<X>): ModuleEntry<C, D, I>;
} {
  function implementEntry(declaration: unknown, factory: unknown, adapter?: unknown): unknown {
    if (typeof factory !== "function") {throw new AssemblyBindingError("assembly.bind.invalid-factory", new TypeError("Expected a factory function"));}
    if (adapter !== undefined && typeof adapter !== "function") {throw new AssemblyBindingError("assembly.bind.invalid-factory", new TypeError("Expected an adapter function"));}
    const captured = captureDeclaration(declaration);
    let adapted: unknown = factory;
    if (adapter !== undefined) {
      try {
        adapted = (adapter as (name: string, factory: unknown) => unknown)(captured.implementationId, factory);
      } catch (cause) {
        throw new AssemblyBindingError("assembly.bind.invalid-factory", cause);
      }
    }
    if (typeof adapted !== "function") {throw new AssemblyBindingError("assembly.bind.invalid-factory", new TypeError("An adapter returns a factory function"));}
    const executable: ExecutableFactory = function forwardFactory(this: unknown, dependencies, context) {
      return Reflect.apply(adapted, this, [dependencies, context]);
    };
    return promiseEntries.captureSnapshot(captured, executable);
  }
  return implementEntry as never;
}
