import type { CompositionProfile } from "../authoring/internal.js";
import { isLocalTokenFormat, isPortableIdFormat } from "./identity-format.js";
import type { BindingResourceCount, ProfileResourceFacts } from "./ports.js";
import { admissionLimits } from "./resource-limits.js";

export function ownValue(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}
function portable(value: unknown): value is string {
  return typeof value === "string" && value.length <= admissionLimits.identifierBytes && isPortableIdFormat(value);
}

/** Only a completely resource-bounded, plain cooperative document enters. */
export function profileResourceFacts(value: unknown): ProfileResourceFacts {
  const selections: CompositionProfile["selections"][number][] = [];
  let selectionCensusComplete = false;
  const selectionRows = ownValue(value, "selections");
  if (Array.isArray(selectionRows) && selectionRows.length <= admissionLimits.selections) {
    selectionCensusComplete = true;
    for (const row of selectionRows) {
      const moduleId = ownValue(row, "moduleId");
      const implementationId = ownValue(row, "implementationId");
      // A failed row withholds completeness, not other positive membership.
      if (!portable(moduleId) || !portable(implementationId)) { selectionCensusComplete = false; continue; }
      selections.push(Object.freeze({ moduleId, implementationId }));
    }
  }
  const bindings: BindingResourceCount[] = [];
  const bindingRows = ownValue(value, "bindings");
  if (Array.isArray(bindingRows) && bindingRows.length <= admissionLimits.bindings) {
    for (let ordinal = 0; ordinal < bindingRows.length; ordinal += 1) {
      const row = bindingRows[ordinal];
      const consumerImplementationId = ownValue(row, "consumerImplementationId");
      const slot = ownValue(row, "slotId");
      const providers = ownValue(row, "providerImplementationIds");
      if (!portable(consumerImplementationId) || !Array.isArray(providers)) continue;
      const slotId = typeof slot === "string" && slot.length <= 64 && isLocalTokenFormat(slot) ? slot : null;
      bindings.push(Object.freeze({ ordinal, consumerImplementationId, slotId, providerOccurrences: providers.length }));
    }
  }
  return Object.freeze({ selections: Object.freeze(selections), selectionCensusComplete, bindings: Object.freeze(bindings) });
}
