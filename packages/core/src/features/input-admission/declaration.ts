import type { ModuleDeclaration } from "../authoring/internal.js";

export const inputAdmissionModuleId = "get-modular/input-admission";
export const admittedInputCapabilityId = "get-modular/admitted-input";
export const admittedInputToken: `${typeof admittedInputCapabilityId}/v1` = `${admittedInputCapabilityId}/v1`;
export const inputAdmissionImplementation: `${typeof inputAdmissionModuleId}/default` = `${inputAdmissionModuleId}/default`;

export const inputAdmissionDeclaration: ModuleDeclaration = Object.freeze<ModuleDeclaration>({
  kind: "get-modular.module-declaration",
  schemaVersion: 1,
  moduleId: inputAdmissionModuleId,
  implementationId: inputAdmissionImplementation,
  owner: Object.freeze({ authority: "get-modular", path: Object.freeze(["input-admission"]) }),
  provides: Object.freeze([Object.freeze({
    capabilityId: admittedInputCapabilityId,
    compatibility: Object.freeze({ family: "exact", familyVersion: 1, token: admittedInputToken }),
  })]),
  slots: Object.freeze([]),
});
