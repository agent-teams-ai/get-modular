import type { CompositionPlan, CompositionProfile } from "../authoring/internal.js";
import type { DiagnosticCollector } from "../diagnostics/internal.js";
import { createDeclarationCensus } from "./declaration-census.js";
import { createProfileCensus, type ProfileCensus } from "./profile-census.js";
import { collectGraphResourceLimits, type GraphResourceResult } from "./graph-resources.js";
import { validateSelectedBindings, type SelectedBindings } from "./selected-bindings.js";
import { analyzeSelectedGraph, type ProviderEdge } from "./selected-graph.js";
import { collectGraphFailures } from "./graph-diagnostics.js";
import type { SemanticInput, SemanticResult } from "./ports.js";

type Graph = ReturnType<typeof analyzeSelectedGraph>;

function ordered<T>(values: readonly T[], compare: (left: T, right: T) => number): T[] {
  const result = [...values];
  result.sort(compare);
  return result;
}

function buildGraph(selected: ProfileCensus | null, bindings: SelectedBindings | null,
  resources: GraphResourceResult, collector: DiagnosticCollector): Graph | null {
  if (!selected?.resolvedNodes || !bindings || resources.countedInputEdges === null || resources.edgeLimitExceeded) {return null;}
  const edges: ProviderEdge[] = [];
  for (const { binding } of bindings.validBindings) {
    for (const provider of binding.providerImplementationIds) {edges.push([provider, binding.consumerImplementationId]);}
  }
  const graph = analyzeSelectedGraph(selected.selectedImplementationIds, edges, selected.resolvedRoots ?? []);
  collectGraphFailures(graph, collector);
  if (!selected.resolvedRoots || !graph.rootClosure.every(id => bindings.frontierComplete(id))) {return graph;}
  const reached = new Set(graph.rootClosure);
  for (const node of selected.resolvedNodes) {
    const { moduleId, implementationId } = node.declaration;
    if (reached.has(implementationId)) {continue;}
    collector.addUnique(Object.freeze({ code: "profile.unreachable-selection", phase: "graph", path: Object.freeze([]),
      coordinate: Object.freeze({ moduleId, implementationId }), details: Object.freeze({ reason: "unreachable" }) }));
  }
  return graph;
}

type AnalysisState = { readonly input: SemanticInput; readonly bindings: SelectedBindings | null; readonly graph: Graph | null };
type CompleteAnalysis = {
  readonly input: SemanticInput & { readonly profile: CompositionProfile };
  readonly bindings: SelectedBindings;
  readonly graph: Graph & { readonly dependencyOrder: readonly string[] };
};

function assertPrerequisites(state: AnalysisState, declarations: ReturnType<typeof createDeclarationCensus>,
  selected: ProfileCensus | null): asserts state is AnalysisState & CompleteAnalysis {
  const { input, bindings, graph } = state;
  if (input.hasErrors || !input.allDeclarationsAdmitted || declarations.hasErrors || selected === null || selected.hasErrors
    || bindings === null || bindings.hasErrors || input.profile === null || selected.resolvedRoots === null
    || graph === null || graph.dependencyOrder === null) {
    throw new Error("Semantic prerequisites are incomplete without diagnostic evidence");
  }
}

function createPlan(input: SemanticInput & { readonly profile: CompositionProfile },
  bindings: SelectedBindings, graph: Graph & { readonly dependencyOrder: readonly string[] }): CompositionPlan {
  const profile = input.profile;
  return Object.freeze({ kind: "get-modular.composition-plan", schemaVersion: 1, profileId: profile.profileId,
    roots: Object.freeze(ordered(profile.roots, (left, right) => left < right ? -1 : left > right ? 1 : 0)),
    selections: Object.freeze(ordered(profile.selections.map(selection => Object.freeze({ ...selection })),
      (a, b) => a.moduleId < b.moduleId ? -1 : a.moduleId > b.moduleId ? 1 : 0)),
    bindings: Object.freeze(bindings.validBindings.map(({ binding, slot }) => Object.freeze({ ...binding,
      capabilityId: slot.capabilityId, compatibility: Object.freeze({ ...slot.compatibility }) }))),
    dependencyOrder: graph.dependencyOrder });
}

/** Owned admitted input, truthful resource observations and its complete admission diagnostic stream. */
export function analyzeCompositionSemantics(input: SemanticInput, collector: DiagnosticCollector): SemanticResult {
  const declarations = createDeclarationCensus(input.declarations, input.allDeclarationsAdmitted, collector);
  const resources = collectGraphResourceLimits(input.profileResources, declarations, collector);
  const selected = input.profile ? createProfileCensus(input.profile, declarations, collector) : null;
  // Budget failure prevents proportional edge allocation, not independent
  // bounded binding diagnostics. Valid rows borrow already-owned input data.
  const bindings = input.profile && selected ? validateSelectedBindings(input.profile, declarations, selected, collector) : null;
  const graph = buildGraph(selected, bindings, resources, collector);
  const diagnostics = collector.finish();
  if (diagnostics.length > 0) {return Object.freeze({ ok: false, diagnostics });}
  const state: AnalysisState = { input, bindings, graph };
  assertPrerequisites(state, declarations, selected);
  return Object.freeze({ ok: true, plan: createPlan(state.input, state.bindings, state.graph) });
}
