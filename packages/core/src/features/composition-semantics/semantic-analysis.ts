import type { CompositionPlan } from "../authoring/internal.js";
import type { DiagnosticCollector } from "../diagnostics/internal.js";
import { createDeclarationCensus } from "./declaration-census.js";
import { createProfileCensus } from "./profile-census.js";
import { collectGraphResourceLimits } from "./graph-resources.js";
import { validateSelectedBindings } from "./selected-bindings.js";
import { analyzeSelectedGraph, type ProviderEdge } from "./selected-graph.js";
import { collectGraphFailures } from "./graph-diagnostics.js";
import type { SemanticInput, SemanticResult } from "./ports.js";

/** Owned admitted input, truthful resource observations and its complete admission diagnostic stream. */
export function analyzeCompositionSemantics(input: SemanticInput, collector: DiagnosticCollector): SemanticResult {
  const declarations = createDeclarationCensus(input.declarations, input.allDeclarationsAdmitted, collector);
  const resources = collectGraphResourceLimits(input.profileResources, declarations, collector);
  const selected = input.profile ? createProfileCensus(input.profile, declarations, collector) : null;
  // Budget failure prevents proportional edge allocation, not independent
  // bounded binding diagnostics. Valid rows borrow already-owned input data.
  const bindings = input.profile && selected ? validateSelectedBindings(input.profile, declarations, selected, collector) : null;
  let graph: ReturnType<typeof analyzeSelectedGraph> | null = null;
  if (selected?.resolvedNodes && bindings && resources.countedInputEdges !== null && !resources.edgeLimitExceeded) {
    const edges: ProviderEdge[] = [];
    for (const { binding } of bindings.validBindings) {
      for (const provider of binding.providerImplementationIds) edges.push([provider, binding.consumerImplementationId]);
    }
    graph = analyzeSelectedGraph(selected.selectedImplementationIds, edges, selected.resolvedRoots ?? []);
    collectGraphFailures(graph, collector);
    if (selected.resolvedRoots && graph.rootClosure.every(id => bindings.frontierComplete(id))) {
      const reached = new Set(graph.rootClosure);
      for (const node of selected.resolvedNodes) {
        const { moduleId, implementationId } = node.declaration;
        if (reached.has(implementationId)) continue;
        collector.addUnique(Object.freeze({ code: "profile.unreachable-selection", phase: "graph", path: Object.freeze([]),
          coordinate: Object.freeze({ moduleId, implementationId }), details: Object.freeze({ reason: "unreachable" }) }));
      }
    }
  }
  const diagnostics = collector.finish();
  if (diagnostics.length > 0) return Object.freeze({ ok: false, diagnostics });
  if (input.hasErrors || !input.allDeclarationsAdmitted || declarations.hasErrors || selected?.hasErrors || bindings?.hasErrors
    || !input.profile || !selected?.resolvedRoots || !bindings || !graph?.dependencyOrder) {
    throw new Error("Semantic prerequisites are incomplete without diagnostic evidence");
  }
  const profile = input.profile;
  const plan: CompositionPlan = Object.freeze({ kind: "get-modular.composition-plan", schemaVersion: 1, profileId: profile.profileId,
    roots: Object.freeze([...profile.roots].sort()),
    selections: Object.freeze([...profile.selections].sort((a, b) => a.moduleId < b.moduleId ? -1 : a.moduleId > b.moduleId ? 1 : 0)),
    bindings: Object.freeze(bindings.validBindings.map(({ binding, slot }) => Object.freeze({ ...binding,
      capabilityId: slot.capabilityId, compatibility: slot.compatibility }))), dependencyOrder: graph.dependencyOrder });
  return Object.freeze({ ok: true, plan });
}
