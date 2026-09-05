import type { ModuleDeclaration } from "../authoring/internal.js";
import { canonicalBytesCapabilityId, canonicalBytesToken } from "../canonicalization/identity.js";

export const compositionSemanticsModuleId = "get-modular/composition-semantics";
export const semanticAnalysisCapabilityId = "get-modular/semantic-analysis";
export const semanticAnalysisToken: `${typeof semanticAnalysisCapabilityId}/v1` = `${semanticAnalysisCapabilityId}/v1`;
export const compositionSemanticsImplementation: `${typeof compositionSemanticsModuleId}/default` = `${compositionSemanticsModuleId}/default`;

export const compositionSemanticsDeclaration: ModuleDeclaration = Object.freeze<ModuleDeclaration>({
  kind: "get-modular.module-declaration",
  schemaVersion: 1,
  moduleId: compositionSemanticsModuleId,
  implementationId: compositionSemanticsImplementation,
  owner: Object.freeze({ authority: "get-modular", path: Object.freeze(["composition-semantics"]) }),
  provides: Object.freeze([Object.freeze({
    capabilityId: semanticAnalysisCapabilityId,
    compatibility: Object.freeze({ family: "exact", familyVersion: 1, token: semanticAnalysisToken }),
  })]),
  slots: Object.freeze([Object.freeze({
    slotId: "canonicalizer",
    capabilityId: canonicalBytesCapabilityId,
    compatibility: Object.freeze({ family: "exact", familyVersion: 1, token: canonicalBytesToken }),
    cardinality: Object.freeze({ kind: "required" }),
  })]),
});
