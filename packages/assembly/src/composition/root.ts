import { compileComposition } from "@get-modular/core";
import type { Assembly, CapabilitySchema } from "../features/construction/types.js";
import type { EntryFamily } from "../features/construction/wiring-types.js";
import { createConstruction, createEntryFamily as createFamily } from "../features/construction/factory.js";

export function assemblyFor<C extends CapabilitySchema<C>>(): Assembly<C> {
  return createConstruction<C>({ compileComposition });
}

/** Captures one executor's entries and shares Core-backed preparation without exposing compiler hooks. */
export function createEntryFamily<F extends (...args: never[]) => unknown>(): EntryFamily<F> {
  return createFamily<F>({ compileComposition });
}
