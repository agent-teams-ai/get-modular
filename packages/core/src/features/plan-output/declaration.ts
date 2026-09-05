import type { ModuleDeclaration } from "../authoring/internal.js";
import { canonicalBytesCapabilityId, canonicalBytesToken } from "../canonicalization/identity.js";

export const planOutputModuleId = "get-modular/plan-output";
export const planEmissionCapabilityId = "get-modular/plan-emission";
export const planEmissionToken: `${typeof planEmissionCapabilityId}/v1` = `${planEmissionCapabilityId}/v1`;
export const planOutputImplementation: `${typeof planOutputModuleId}/default` = `${planOutputModuleId}/default`;

export const planOutputDeclaration: ModuleDeclaration = Object.freeze<ModuleDeclaration>({
  kind: "get-modular.module-declaration",
  schemaVersion: 1,
  moduleId: planOutputModuleId,
  implementationId: planOutputImplementation,
  owner: Object.freeze({ authority: "get-modular", path: Object.freeze(["plan-output"]) }),
  provides: Object.freeze([Object.freeze({
    capabilityId: planEmissionCapabilityId,
    compatibility: Object.freeze({ family: "exact", familyVersion: 1, token: planEmissionToken }),
  })]),
  slots: Object.freeze([Object.freeze({
    slotId: "canonicalizer",
    capabilityId: canonicalBytesCapabilityId,
    compatibility: Object.freeze({ family: "exact", familyVersion: 1, token: canonicalBytesToken }),
    cardinality: Object.freeze({ kind: "required" }),
  })]),
});
