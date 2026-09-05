import type { DiagnosticCollector } from "../diagnostics/internal.js";
import type { DeclarationCensus } from "./declaration-census.js";
import type { ProfileResourceObservations } from "./semantic-input.js";

const limits = { graphEdges: 262_144, providersPerManySlot: 1024 } as const;
export const semanticResourceLimits: typeof limits = Object.freeze(limits);
export type GraphResourceResult = { readonly countedInputEdges: number | null; readonly edgeLimitExceeded: boolean };

/** Resource-only evidence is never promoted to semantic rows or graph edges. */
export function collectGraphResourceLimits(observations: ProfileResourceObservations | null, declarations: DeclarationCensus,
  collector: Pick<DiagnosticCollector, "addUnique">): GraphResourceResult {
  if (!observations?.selections) return Object.freeze({ countedInputEdges: null, edgeLimitExceeded: false });
  const selected = new Set(observations.selections.map(row => row.implementationId));
  let inputEdges = 0;
  for (const binding of observations.bindings) {
    if (!selected.has(binding.consumerImplementationId)) continue;
    // Einput counts occurrences even when the consumer, slot or provider will
    // later fail validation. It is neither Evalid nor distinct adjacency.
    inputEdges = Math.min(semanticResourceLimits.graphEdges + 1, inputEdges + binding.providerOccurrences);
    if (binding.slotId === null || binding.providerOccurrences <= semanticResourceLimits.providersPerManySlot) continue;
    const consumer = declarations.implementation(binding.consumerImplementationId);
    const slot = consumer?.slot(binding.slotId);
    if (slot?.cardinality.kind !== "many") continue;
    collector.addUnique(Object.freeze({ code: "input.limit-exceeded", phase: "binding", coordinate: Object.freeze({}),
      path: Object.freeze([Object.freeze({ kind: "field", value: "profile" }), Object.freeze({ kind: "field", value: "bindings" }),
        Object.freeze({ kind: "index", value: binding.ordinal }), Object.freeze({ kind: "field", value: "providerImplementationIds" })]),
      details: Object.freeze({ limitName: "providersPerManySlot", limit: semanticResourceLimits.providersPerManySlot,
        actual: semanticResourceLimits.providersPerManySlot + 1 }) }));
  }
  const edgeLimitExceeded = inputEdges > semanticResourceLimits.graphEdges;
  if (edgeLimitExceeded) collector.addUnique(Object.freeze({ code: "input.limit-exceeded", phase: "graph", coordinate: Object.freeze({}),
    path: Object.freeze([]), details: Object.freeze({ limitName: "graphEdges", limit: semanticResourceLimits.graphEdges,
      actual: semanticResourceLimits.graphEdges + 1 }) }));
  // Absence of a proven overflow is not graph admission. The caller still
  // requires a complete schema-valid profile before constructing graph data.
  return Object.freeze({ countedInputEdges: inputEdges, edgeLimitExceeded });
}
