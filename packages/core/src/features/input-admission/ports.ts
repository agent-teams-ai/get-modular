import type { CompositionProfile, ModuleDeclaration } from "../authoring/internal.js";
import type { DiagnosticCollector } from "../diagnostics/internal.js";

export type ObjectInput = { readonly declarations: readonly unknown[]; readonly profile: unknown };

export type BindingResourceCount = {
  readonly ordinal: number;
  readonly consumerImplementationId: string;
  readonly slotId: string | null;
  readonly providerOccurrences: number;
};
// These are resource-only observations, never an admitted semantic profile.
// A schema-invalid profile cannot create declarations, edges or plan bindings.
export type ProfileResourceFacts = {
  readonly selections: CompositionProfile["selections"];
  readonly selectionCensusComplete: boolean;
  readonly bindings: readonly BindingResourceCount[];
};

export type AdmittedObjectInput = {
  readonly declarations: readonly ModuleDeclaration[];
  // Complete admission is necessary, but not sufficient, for semantic identity
  // uniqueness. Semantics must still establish its own identity/module census.
  readonly allDeclarationsAdmitted: boolean;
  readonly profile: CompositionProfile | null;
  readonly profileResources: ProfileResourceFacts | null;
  readonly hasErrors: boolean;
};

export type AdmissionDiagnosticSink = Pick<DiagnosticCollector, "addUnique">;

export interface InputAdmissionPort {
  readonly admitObjectInput: (input: ObjectInput, collector: AdmissionDiagnosticSink) => AdmittedObjectInput;
}

export type InputAdmissionDeps = Readonly<Record<string, never>>;
