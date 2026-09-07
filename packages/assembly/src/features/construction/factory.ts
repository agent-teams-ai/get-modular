import type { Assembly, AssemblyPrepareInput, RootHandles } from "./types.js";
import type { ConstructionPorts } from "./ports.js";
import { bindFactoryFor } from "./bind.js";
import { prepareConstruction } from "./prepare.js";

export function createConstruction<C>(ports: ConstructionPorts): Assembly<C> {
  return Object.freeze({
    bindFactory: bindFactoryFor<C>(),
    prepare: <const R extends RootHandles<C>>(input: AssemblyPrepareInput<C, R>) =>
      prepareConstruction<C, R>(input, ports),
  });
}
export { AssemblyBindingError } from "./bind.js";
