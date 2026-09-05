import type { CompileCompositionResult, CompositionPlan, PlanDigest } from "../authoring/internal.js";
import type { DiagnosticCollector } from "../diagnostics/internal.js";
import type { AdmittedObjectInput } from "../input-admission/ports.js";
import type { SemanticInput, SemanticResult } from "../composition-semantics/ports.js";

export type ObjectCompilationInput = {
  readonly declarations: readonly unknown[];
  readonly profile: unknown;
};

// The facade owns these driven ports; provider implementations join structurally.
export interface AdmissionPort {
  readonly admitObjectInput: (input: ObjectCompilationInput, collector: DiagnosticCollector) => AdmittedObjectInput;
}
export interface SemanticsPort {
  readonly newCollector: () => DiagnosticCollector;
  readonly analyze: (input: SemanticInput, collector: DiagnosticCollector) => SemanticResult;
}
export interface OutputPort {
  readonly emit: (plan: CompositionPlan) => Promise<{ readonly plan: CompositionPlan; readonly digest: PlanDigest }>;
}
export interface CompilerFacadeDeps {
  readonly admission: AdmissionPort;
  readonly semantics: SemanticsPort;
  readonly output: OutputPort;
}
export interface CompilerFacadePort {
  readonly compileComposition: (input: ObjectCompilationInput) => Promise<CompileCompositionResult>;
}
