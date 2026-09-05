import type { CompositionProfile, ModuleDeclaration } from "../authoring/internal.js";

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
