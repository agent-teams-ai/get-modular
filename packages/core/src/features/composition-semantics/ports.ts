import type {
  CompositionPlan, CompositionProfile, CompileCompositionResult, ModuleDeclaration,
} from "../authoring/internal.js";
import type { JsonValue } from "../canonicalization/ports.js";
import type { DiagnosticCollector } from "../diagnostics/internal.js";

// This consumer owns the driven port; structural typing joins the provider.
export interface CanonicalBytesPort {
  readonly canonicalize: (value: JsonValue) => Uint8Array;
}

// Consumer-owned resource observations. Structurally supplied by admission;
// this feature does not import its implementation or interpret raw objects.
export type ProfileResourceObservations = {
  // Positive identity evidence survives an incomplete census; it cannot prove absence.
  readonly selections: CompositionProfile["selections"];
  readonly selectionCensusComplete: boolean;
  readonly bindings: readonly {
    readonly ordinal: number;
    readonly consumerImplementationId: string;
    readonly slotId: string | null;
    readonly providerOccurrences: number;
  }[];
};
export type SemanticInput = {
  readonly declarations: readonly ModuleDeclaration[];
  readonly allDeclarationsAdmitted: boolean;
  readonly profile: CompositionProfile | null;
  readonly profileResources: ProfileResourceObservations | null;
  readonly hasErrors: boolean;
};

export type SemanticResult = { readonly ok: true; readonly plan: CompositionPlan }
  | Extract<CompileCompositionResult, { readonly ok: false }>;

export interface CompositionSemanticsPort {
  /** One fresh collector per invocation, passed through admission and analysis. */
  readonly newCollector: () => DiagnosticCollector;
  readonly analyze: (input: SemanticInput, collector: DiagnosticCollector) => SemanticResult;
}

export interface CompositionSemanticsDeps {
  readonly canonicalizer: CanonicalBytesPort;
}
