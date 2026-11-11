import type { FamilyEntriesOf, InputEntries } from "@get-modular/assembly";
import type {
  EffectAssembly, EffectAssemblyPreparationResult, EffectAssemblyPrepareInput, EffectErrorsOf,
  EffectModuleItem, EffectRequirementsOf, EffectRootEntries, EffectRootInstances, PreparedEffectAssembly,
} from "./types.js";
import { nativeEntries } from "./entry.js";
import { lower } from "./lower.js";

export { implement, group, entriesOf } from "./entry.js";
export { InvalidInputs } from "./inputs.js";

async function prepare<C, const R extends EffectRootEntries<C>, const N extends InputEntries<C> = {},
  const M extends readonly EffectModuleItem<C>[] = readonly EffectModuleItem<C>[]>(
  input: EffectAssemblyPrepareInput<C, R, N, M>,
): Promise<EffectAssemblyPreparationResult<EffectRootInstances<R>,
  EffectErrorsOf<FamilyEntriesOf<M[number]>>, EffectRequirementsOf<FamilyEntriesOf<M[number]>>, N>> {
  const result = await nativeEntries.prepare(input);
  if (result.status === "failed") { return result; }
  type Prepared = PreparedEffectAssembly<EffectRootInstances<R>,
    EffectErrorsOf<FamilyEntriesOf<M[number]>>, EffectRequirementsOf<FamilyEntriesOf<M[number]>>, N>;
  // The family authenticated this concrete M/R/N inventory and captured its
  // exact factories before Core compilation. Only heterogeneous lowering erases
  // the corresponding roots/E/R; the public API retains those same witnesses.
  const layer = lower(result.wiring) as Prepared["layer"];
  return Object.freeze({ status: "prepared", prepared: Object.freeze({ layer }), composition: result.composition });
}

export function createEffectAssembly<C>(): EffectAssembly<C> {
  return Object.freeze({ prepare });
}
