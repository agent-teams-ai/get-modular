import type { CompositionProfile, ModuleDeclaration } from "../authoring/internal.js";
import type { DiagnosticCollector } from "../diagnostics/internal.js";
import type { DeclarationCensus } from "./declaration-census.js";
import type { ProfileCensus } from "./profile-census.js";

type Binding = CompositionProfile["bindings"][number];
type Slot = ModuleDeclaration["slots"][number];
type BindingRecordDiagnostic = Extract<Parameters<DiagnosticCollector["addUnique"]>[0], {
  readonly code: "binding.duplicate" | "binding.unknown-provider" | "binding.provider-not-selected"
    | "binding.cardinality" | "binding.capability-missing" | "binding.compatibility-mismatch";
}>;
type BindingRecordSink = { readonly addUnique: (diagnostic: BindingRecordDiagnostic) => void };

/** Consumer/slot definitions passed admission, including ordered many bounds. Counts precede deduplication. */
export function validateBindingRecord(binding: Binding, slot: Slot, declarations: DeclarationCensus,
  selected: ProfileCensus, collector: BindingRecordSink): boolean {
  let valid = true;
  const coordinate = Object.freeze({ implementationId: binding.consumerImplementationId, slotId: binding.slotId });
  const path = Object.freeze([]);
  const add: BindingRecordSink["addUnique"] = diagnostic => { valid = false; collector.addUnique(diagnostic); };
  const count = binding.providerImplementationIds.length;
  const cardinality = slot.cardinality;
  const allowed = cardinality.kind === "many" ? count >= cardinality.min && count <= cardinality.max
    : cardinality.kind === "required" ? count === 1 : count <= 1;
  if (!allowed) add(Object.freeze({ code: "binding.cardinality", phase: "binding", path, coordinate,
    details: Object.freeze({ expectedCardinality: cardinality.kind, actualCardinality: count }) }));

  const providers = new Map<string, number>();
  for (const id of binding.providerImplementationIds) providers.set(id, (providers.get(id) ?? 0) + 1);
  for (const [providerImplementationId, occurrences] of providers) {
    const providerCoordinate = Object.freeze({ ...coordinate, providerImplementationId });
    if (occurrences > 1) add(Object.freeze({ code: "binding.duplicate", phase: "binding", path,
      coordinate: providerCoordinate, details: Object.freeze({ reason: "duplicate" }) }));
    const provider = declarations.implementation(providerImplementationId);
    if (!provider) {
      valid = false;
      if (provider === undefined && declarations.identityCensusComplete) {
        add(Object.freeze({ code: "binding.unknown-provider", phase: "binding", path,
          coordinate: providerCoordinate, details: Object.freeze({ reason: "unknown" }) }));
      }
      // Unknown or ambiguous is not a known-but-unselected provider.
      continue;
    }
    if (!selected.isSelected(providerImplementationId)) {
      add(Object.freeze({ code: "binding.provider-not-selected", phase: "binding", path,
        coordinate: providerCoordinate, details: Object.freeze({ reason: "mismatch" }) }));
    }
    const capability = provider.capability(slot.capabilityId);
    if (!capability) {
      valid = false;
      if (capability === undefined) add(Object.freeze({ code: "binding.capability-missing", phase: "binding", path,
        coordinate: providerCoordinate, details: Object.freeze({ reason: "missing" }) }));
      // An absent/ambiguous capability supplies no compatibility value.
      continue;
    }
    if (capability.compatibility.token !== slot.compatibility.token) {
      add(Object.freeze({ code: "binding.compatibility-mismatch", phase: "binding", path,
        coordinate: providerCoordinate, details: Object.freeze({ expectedCompatibility: slot.compatibility,
          actualCompatibility: capability.compatibility }) }));
    }
  }
  return valid;
}

/** One nonempty coordinate group; every row keeps its own counts and checks. */
export function validateBindingRecords(bindings: readonly Binding[], slot: Slot, declarations: DeclarationCensus,
  selected: ProfileCensus, collector: Pick<DiagnosticCollector, "addUnique">): boolean {
  let valid = bindings.length === 1;
  // These sets live for one coordinate only, bounded by its admitted rows and
  // provider occurrences. No complete diagnostic stream is retained globally.
  // The slot fixes expected cardinality/compatibility; a resolved provider
  // fixes actual compatibility. Thus count, or code plus provider identity,
  // distinguishes every possible normalized row-local candidate in this group.
  const cardinalities = new Set<number>();
  const providerFailures = new Map<BindingRecordDiagnostic["code"], Set<string>>();
  const rowCollector: BindingRecordSink = {
    addUnique: diagnostic => {
      if (diagnostic.code === "binding.cardinality") {
        const count = diagnostic.details.actualCardinality;
        if (cardinalities.has(count)) return;
        cardinalities.add(count);
      } else {
        const providerImplementationId = diagnostic.coordinate.providerImplementationId;
        let seen = providerFailures.get(diagnostic.code);
        if (!seen) { seen = new Set<string>(); providerFailures.set(diagnostic.code, seen); }
        if (seen.has(providerImplementationId)) return;
        seen.add(providerImplementationId);
      }
      collector.addUnique(diagnostic);
    },
  };
  for (const binding of bindings) {
    // A suppressed duplicate candidate still invalidates its original row.
    // Never short-circuit later checks because this group is already invalid.
    if (!validateBindingRecord(binding, slot, declarations, selected, rowCollector)) valid = false;
  }
  return valid;
}
