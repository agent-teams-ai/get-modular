import type { CompositionProfile, ModuleDeclaration } from "../src/features/authoring/internal.js";
import { ownedJcsDeclaration } from "../src/features/canonicalization/owned-jcs/declaration.js";
import { witnessVariantDeclaration } from "../tests/features/canonicalization/witness-variant/declaration.js";
import { ownDeclarations as baseDeclarations, ownProfile as baseProfile } from "./own-profile.js";

export const ownDeclarations: readonly ModuleDeclaration[] = Object.freeze([
  ...baseDeclarations, witnessVariantDeclaration,
]);

// One selection and exactly its two provider bindings change; profile identity
// and every consumer remain the same. Identities belong to the declarations.
export const ownProfile: CompositionProfile = Object.freeze({
  ...baseProfile,
  selections: Object.freeze(baseProfile.selections.map(selection => selection.moduleId === ownedJcsDeclaration.moduleId
    ? Object.freeze({ moduleId: witnessVariantDeclaration.moduleId, implementationId: witnessVariantDeclaration.implementationId })
    : selection)),
  bindings: Object.freeze(baseProfile.bindings.map(binding => Object.freeze({
    ...binding,
    providerImplementationIds: Object.freeze(binding.providerImplementationIds.map(provider =>
      provider === ownedJcsDeclaration.implementationId ? witnessVariantDeclaration.implementationId : provider)),
  }))),
});
