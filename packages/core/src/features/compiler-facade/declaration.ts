import type { ModuleDeclaration } from "../authoring/internal.js";
import { admittedInputCapabilityId, admittedInputToken } from "../input-admission/declaration.js";
import { semanticAnalysisCapabilityId, semanticAnalysisToken } from "../composition-semantics/declaration.js";
import { planEmissionCapabilityId, planEmissionToken } from "../plan-output/declaration.js";

export const compilerFacadeModuleId = "get-modular/compiler-facade";
export const compilerFacadeImplementation: `${typeof compilerFacadeModuleId}/default` = `${compilerFacadeModuleId}/default`;
export const compilerFacadeDeclaration: ModuleDeclaration = Object.freeze<ModuleDeclaration>({
  kind: "get-modular.module-declaration", schemaVersion: 1,
  moduleId: compilerFacadeModuleId, implementationId: compilerFacadeImplementation,
  owner: Object.freeze({ authority: "get-modular", path: Object.freeze(["compiler-facade"]) }),
  provides: Object.freeze([]),
  slots: Object.freeze([
    Object.freeze({ slotId: "admission", capabilityId: admittedInputCapabilityId,
      compatibility: Object.freeze({ family: "exact", familyVersion: 1, token: admittedInputToken }),
      cardinality: Object.freeze({ kind: "required" }) }),
    Object.freeze({ slotId: "semantics", capabilityId: semanticAnalysisCapabilityId,
      compatibility: Object.freeze({ family: "exact", familyVersion: 1, token: semanticAnalysisToken }),
      cardinality: Object.freeze({ kind: "required" }) }),
    Object.freeze({ slotId: "output", capabilityId: planEmissionCapabilityId,
      compatibility: Object.freeze({ family: "exact", familyVersion: 1, token: planEmissionToken }),
      cardinality: Object.freeze({ kind: "required" }) }),
  ]),
});
