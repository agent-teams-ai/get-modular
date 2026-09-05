import type { DiagnosticCollector } from "../diagnostics/internal.js";
import { selectedGraphDepthLimit, type SelectedGraphAnalysis } from "./selected-graph.js";

// The caller has established selected-node and positive-edge prerequisites
// before graph analysis. This function does not infer them from an empty graph
// or finalize the collector while other independent candidates remain.
export function collectGraphFailures(analysis: SelectedGraphAnalysis, collector: Pick<DiagnosticCollector, "addUnique">): void {
  if (analysis.residualDepth > selectedGraphDepthLimit) {
    collector.addUnique(Object.freeze({ code: "input.limit-exceeded", phase: "graph", path: Object.freeze([]),
      coordinate: Object.freeze({}), details: Object.freeze({ limitName: "graphDepth", limit: selectedGraphDepthLimit,
        actual: selectedGraphDepthLimit + 1 }) }));
  }
  // Each SCC is unique by construction. The source graph and its member arrays
  // are owned and immutable; no raw caller data is copied into diagnostics.
  for (const component of analysis.cycles) {
    collector.addUnique(Object.freeze({ code: "graph.cycle", phase: "graph", path: Object.freeze([]),
      coordinate: Object.freeze({}), details: Object.freeze({ component }) }));
  }
}
