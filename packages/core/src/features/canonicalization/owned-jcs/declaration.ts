import {
  canonicalBytesCapabilityId,
  canonicalBytesToken,
  canonicalizationModuleId,
} from "../identity.js";
import type { ModuleDeclaration } from "../../authoring/internal.js";

export const ownedJcsImplementation: `${typeof canonicalizationModuleId}/owned-jcs` = `${canonicalizationModuleId}/owned-jcs`;

export const ownedJcsDeclaration: ModuleDeclaration = Object.freeze<ModuleDeclaration>({
  kind: "get-modular.module-declaration",
  schemaVersion: 1,
  moduleId: canonicalizationModuleId,
  implementationId: ownedJcsImplementation,
  owner: Object.freeze({ authority: "get-modular", path: Object.freeze(["canonicalization"]) }),
  provides: Object.freeze([Object.freeze({
    capabilityId: canonicalBytesCapabilityId,
    compatibility: Object.freeze({ family: "exact", familyVersion: 1, token: canonicalBytesToken }),
  })]),
  slots: Object.freeze([]),
});
