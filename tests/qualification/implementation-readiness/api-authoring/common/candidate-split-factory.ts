import type { Declaration } from "./types.js";
import type { ActivationFactory } from "./candidate-split.js";

// A disposable product-composition association, not a proposed public helper.
export function associateFactory<D extends Declaration, Dependencies, Result>(
  declaration: D,
  implementationId: D["implementationId"],
  activate: ActivationFactory<Dependencies, Result>,
): Readonly<{ implementationId: D["implementationId"]; activate: ActivationFactory<Dependencies, Result> }> {
  if (implementationId !== declaration.implementationId) throw new Error("factory identity mismatch");
  return { implementationId, activate };
}
