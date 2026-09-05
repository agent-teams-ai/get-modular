import type { CompositionProfile, ModuleDeclaration } from "../authoring/internal.js";

// Consumer-owned resource observations. Structurally supplied by admission;
// this feature does not import its implementation or interpret raw objects.
export type ProfileResourceObservations = {
  readonly selections: CompositionProfile["selections"] | null;
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
