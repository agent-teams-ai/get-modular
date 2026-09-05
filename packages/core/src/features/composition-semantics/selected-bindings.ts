import type { CompositionProfile, ModuleDeclaration } from "../authoring/internal.js";
import type { DiagnosticCollector } from "../diagnostics/internal.js";
import type { DeclarationCensus } from "./declaration-census.js";
import type { ProfileCensus } from "./profile-census.js";
import { validateBindingRecord } from "./binding-record.js";

type Binding = CompositionProfile["bindings"][number];
type Slot = ModuleDeclaration["slots"][number];
export type ResolvedBinding = { readonly binding: Binding; readonly slot: Slot };
export type SelectedBindings = {
  readonly validBindings: readonly ResolvedBinding[];
  readonly frontierComplete: (implementationId: string) => boolean;
  readonly hasErrors: boolean;
};

/**
 * Owner-private: bounded, owned profile/declarations admitted under all accepted refinements;
 * unique binding records per consumer/slot and admitted selected-provider budget.
 * This is not raw/resource admission, a compiler success gate or the M2 record policy.
 */
export function validateSelectedBindings(profile: CompositionProfile, declarations: DeclarationCensus,
  selected: ProfileCensus, collector: Pick<DiagnosticCollector, "addUnique">): SelectedBindings {
  const groups = new Map<string, Map<string, Binding>>();
  for (const binding of profile.bindings) {
    let slots = groups.get(binding.consumerImplementationId);
    if (!slots) { slots = new Map<string, Binding>(); groups.set(binding.consumerImplementationId, slots); }
    if (slots.has(binding.slotId)) throw new Error("Unique binding records are required by this private stage");
    slots.set(binding.slotId, binding);
  }
  let hasErrors = false;
  const add: DiagnosticCollector["addUnique"] = diagnostic => { hasErrors = true; collector.addUnique(diagnostic); };
  const frontiers = new Map<string, boolean>();
  const validBindings: ResolvedBinding[] = [];
  for (const implementationId of selected.selectedImplementationIds) frontiers.set(implementationId, true);
  for (const [implementationId, slots] of groups) {
    const consumer = declarations.implementation(implementationId);
    if (!consumer) {
      if (selected.isSelected(implementationId)) frontiers.set(implementationId, false);
      if (consumer === undefined && declarations.identityCensusComplete) {
        add(Object.freeze({ code: "binding.unknown-consumer", phase: "binding", path: Object.freeze([]),
          coordinate: Object.freeze({ implementationId }), details: Object.freeze({ reason: "unknown" }) }));
      }
      continue;
    }
    // Known unselected declarations and their bindings are graph/plan-inert.
    if (!selected.isSelected(implementationId)) continue;
    for (const [slotId, binding] of slots) {
      const slot = consumer.slot(slotId);
      if (!slot) {
        frontiers.set(implementationId, false);
        if (slot === undefined && declarations.identityCensusComplete) {
          add(Object.freeze({ code: "binding.unknown-slot", phase: "binding", path: Object.freeze([]),
            coordinate: Object.freeze({ implementationId, slotId }), details: Object.freeze({ reason: "unknown" }) }));
        }
        continue;
      }
      if (validateBindingRecord(binding, slot, declarations, selected, { addUnique: add })) {
        validBindings.push(Object.freeze({ binding, slot }));
      } else frontiers.set(implementationId, false);
    }
  }
  for (const implementationId of selected.selectedImplementationIds) {
    const consumer = declarations.implementation(implementationId);
    if (!consumer) { frontiers.set(implementationId, false); continue; }
    if (consumer.uniqueSlots.length !== consumer.declaration.slots.length) frontiers.set(implementationId, false);
    const records = groups.get(implementationId);
    for (const slot of consumer.uniqueSlots) {
      if (records?.has(slot.slotId)) continue;
      frontiers.set(implementationId, false);
      add(Object.freeze({ code: "binding.missing", phase: "binding", path: Object.freeze([]),
        coordinate: Object.freeze({ implementationId, slotId: slot.slotId }), details: Object.freeze({ reason: "missing" }) }));
    }
  }
  // Whole valid rows only; profile provider order is untouched. This list is
  // an observation, never a partial plan that could escape after other errors.
  validBindings.sort((left, right) => {
    const a = left.binding, b = right.binding;
    return a.consumerImplementationId < b.consumerImplementationId ? -1 : a.consumerImplementationId > b.consumerImplementationId ? 1
      : a.slotId < b.slotId ? -1 : a.slotId > b.slotId ? 1 : 0;
  });
  return Object.freeze({ validBindings: Object.freeze(validBindings),
    frontierComplete: (implementationId: string) => frontiers.get(implementationId) === true, hasErrors });
}
