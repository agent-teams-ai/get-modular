import {
  canonicalBytesCapabilityId, canonicalBytesToken, canonicalizationModuleId,
} from "../../../../src/features/canonicalization/identity.js";
import type { ModuleDeclaration } from "../../../../src/features/authoring/internal.js";

export const witnessVariantImplementation: `${typeof canonicalizationModuleId}/witness-variant` = `${canonicalizationModuleId}/witness-variant`;

export const witnessVariantDeclaration: ModuleDeclaration = Object.freeze<ModuleDeclaration>({
  kind: "get-modular.module-declaration", schemaVersion: 1,
  moduleId: canonicalizationModuleId, implementationId: witnessVariantImplementation,
  owner: Object.freeze({ authority: "get-modular", path: Object.freeze(["canonicalization"]) }),
  provides: Object.freeze([Object.freeze({
    capabilityId: canonicalBytesCapabilityId,
    compatibility: Object.freeze({ family: "exact", familyVersion: 1, token: canonicalBytesToken }),
  })]),
  slots: Object.freeze([]),
});
