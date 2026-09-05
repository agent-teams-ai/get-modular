import type { CompositionProfile, ModuleDeclaration } from "../src/features/authoring/internal.js";
import { ownedJcsDeclaration } from "../src/features/canonicalization/owned-jcs/declaration.js";
import { compositionSemanticsDeclaration } from "../src/features/composition-semantics/declaration.js";
import { inputAdmissionDeclaration } from "../src/features/input-admission/declaration.js";
import { planOutputDeclaration } from "../src/features/plan-output/declaration.js";
import { compilerFacadeDeclaration } from "../src/features/compiler-facade/declaration.js";

export const ownDeclarations: readonly ModuleDeclaration[] = Object.freeze([
  ownedJcsDeclaration, compositionSemanticsDeclaration, inputAdmissionDeclaration,
  planOutputDeclaration, compilerFacadeDeclaration,
]);

export const ownProfile: CompositionProfile = Object.freeze({
  kind: "get-modular.composition-profile",
  schemaVersion: 1,
  profileId: "get-modular/own-profile",
  roots: Object.freeze([compilerFacadeDeclaration.moduleId]),
  selections: Object.freeze(ownDeclarations.map(declaration => Object.freeze({
    moduleId: declaration.moduleId, implementationId: declaration.implementationId,
  }))),
  bindings: Object.freeze([
    Object.freeze({ consumerImplementationId: compilerFacadeDeclaration.implementationId,
      slotId: "admission", providerImplementationIds: Object.freeze([inputAdmissionDeclaration.implementationId]) }),
    Object.freeze({ consumerImplementationId: compilerFacadeDeclaration.implementationId,
      slotId: "semantics", providerImplementationIds: Object.freeze([compositionSemanticsDeclaration.implementationId]) }),
    Object.freeze({ consumerImplementationId: compilerFacadeDeclaration.implementationId,
      slotId: "output", providerImplementationIds: Object.freeze([planOutputDeclaration.implementationId]) }),
    Object.freeze({ consumerImplementationId: planOutputDeclaration.implementationId,
      slotId: "canonicalizer", providerImplementationIds: Object.freeze([ownedJcsDeclaration.implementationId]) }),
    Object.freeze({ consumerImplementationId: compositionSemanticsDeclaration.implementationId,
      slotId: "canonicalizer", providerImplementationIds: Object.freeze([ownedJcsDeclaration.implementationId]) }),
  ]),
});
