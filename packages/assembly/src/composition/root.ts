import { compileComposition } from "@get-modular/core";
import type { Assembly, CapabilitySchema } from "../features/construction/types.js";
import { createConstruction } from "../features/construction/factory.js";

export function assemblyFor<C extends CapabilitySchema<C>>(): Assembly<C> {
  return createConstruction<C>({ compileComposition });
}
