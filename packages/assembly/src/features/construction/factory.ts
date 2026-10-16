import type { Assembly, AssemblyPrepareInput, InputEntries, ModuleItem, RootEntries } from "./types.js";
import type { ConstructionPorts } from "./ports.js";
import { prepareConstruction } from "./prepare.js";

export function createConstruction<C>(ports: ConstructionPorts): Assembly<C> {
  return Object.freeze({
    prepare: async <const R extends RootEntries<C>, const N extends InputEntries<C> = {},
      const M extends readonly ModuleItem<C>[] = readonly ModuleItem<C>[]>(input: AssemblyPrepareInput<C, R, N, M>) =>
      prepareConstruction<C, R, N, M>(input, ports),
  });
}
export { AssemblyBindingError, implement, input } from "./entry.js";
export { entriesOf, group } from "./group.js";
export { declareModule, defineContract } from "./contract.js";
