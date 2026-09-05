import type { Diagnostic } from "../authoring/internal.js";

export type DiagnosticCandidate = Exclude<Diagnostic, { readonly code: "diagnostics.truncated" }>;
export type CanonicalizeDetails = (details: Diagnostic["details"]) => Uint8Array;

export type CollectorStatistics = {
  readonly retainedCount: number;
  readonly peakRetained: number;
  readonly comparisons: number;
  readonly saturatedFailureCount: number;
  readonly failureCountSaturated: boolean;
};

export type DiagnosticCollector = {
  // Producers normalize, establish eligibility and deduplicate BEFORE this
  // boundary (ADR-0007). Keeping a global set here would defeat bounded space;
  // deduplicating only retained records would corrupt the omission count.
  readonly addUnique: (candidate: DiagnosticCandidate) => void;
  readonly finish: () => readonly Diagnostic[];
  readonly statistics: () => CollectorStatistics;
};
