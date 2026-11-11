import type { EffectAssembly } from "../features/construction/types.js";
import { createEffectAssembly } from "../features/construction/factory.js";

/** Prepare one selected GM graph; native Effect owns its eventual construction. */
export function effectFor<C>(): EffectAssembly<C> {
  return createEffectAssembly<C>();
}
