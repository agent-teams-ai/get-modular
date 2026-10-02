import type { Assembly, AssemblyPrepareInput, InputHandles, RootHandles } from "./types.js";
import type { ConstructionPorts } from "./ports.js";
import { bindFactoryFor, bindInputFor } from "./bind.js";
import { prepareConstruction } from "./prepare.js";

export function createConstruction<C>(ports: ConstructionPorts): Assembly<C> {
  return Object.freeze({
    bindFactory: bindFactoryFor<C>(),
    bindInput: bindInputFor<C>(),
    prepare: async <const R extends RootHandles<C>, const N extends InputHandles<C> = {}>(input: AssemblyPrepareInput<C, R, N>) =>
      prepareConstruction<C, R, N>(input, ports),
  });
}
export { AssemblyBindingError } from "./bind.js";
export { declareModule, defineContract } from "./contract.js";
