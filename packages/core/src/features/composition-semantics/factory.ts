import { createDiagnosticCollector, type DiagnosticCollector } from "../diagnostics/internal.js";
import type { CompositionSemanticsDeps, CompositionSemanticsPort } from "./ports.js";
import { analyzeCompositionSemantics } from "./semantic-analysis.js";

export function createCompositionSemantics({ canonicalizer }: CompositionSemanticsDeps): CompositionSemanticsPort {
  return Object.freeze({
    newCollector(): DiagnosticCollector {
      return createDiagnosticCollector(details => canonicalizer.canonicalize(details));
    },
    analyze: analyzeCompositionSemantics,
  });
}
