import { AssemblyBindingError, createEntryFamily } from "@get-modular/assembly";
import type { FamilyEntriesOf, ValidDeclaration } from "@get-modular/assembly";
import type { ModuleDeclaration } from "@get-modular/core";
import type {
  AnyEffectModuleEntry, EffectEntryFactory, EffectModuleEntry, EffectModuleFactory, EffectModuleGroup,
} from "./types.js";

export const nativeEntries: ReturnType<typeof createEntryFamily<EffectEntryFactory>> = createEntryFamily<EffectEntryFactory>();

/** Capture a native factory and immutable declaration without calling it. */
export function implement<C>(): <const D extends ModuleDeclaration, I, E, R>(
  declaration: D & ValidDeclaration<C, NoInfer<D>>,
  factory: EffectModuleFactory<C, NoInfer<D>, I, E, R>,
) => EffectModuleEntry<C, D, I, E, R> {
  function bind(declaration: ModuleDeclaration, factory: unknown): unknown {
    if (typeof factory !== "function") {
      throw new AssemblyBindingError("assembly.bind.invalid-factory", new TypeError("Expected a native Effect factory"));
    }
    // The public signature retains the exact factory witnesses. Carrier
    // validation belongs to lowering, when this captured callable is executed.
    return nativeEntries.capture(declaration, factory as EffectEntryFactory);
  }
  // The constructor's exact D/I/E/R are type witnesses for this captured callable.
  // Runtime membership is authenticated by the private family, never by this brand.
  return bind as never;
}

/** Static native groups use Assembly's one bounded capture and flattening policy. */
export function group<const M extends readonly (AnyEffectModuleEntry<unknown> | EffectModuleGroup)[]>(
  name: string, members: M & (number extends M["length"] ? never : unknown),
): EffectModuleGroup<FamilyEntriesOf<M[number]>> {
  return nativeEntries.group(name, members);
}

export function entriesOf<const M extends readonly (AnyEffectModuleEntry<unknown> | EffectModuleGroup)[]>(
  modules: M,
): readonly FamilyEntriesOf<M[number]>[] {
  return nativeEntries.entriesOf(modules);
}
