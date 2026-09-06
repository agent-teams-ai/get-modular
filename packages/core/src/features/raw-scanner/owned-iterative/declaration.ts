import {
  rawScannerCapabilityId,
  rawScannerModuleId,
  rawScannerToken,
} from "../identity.js";
import type { ModuleDeclaration } from "../../authoring/internal.js";

export const ownedRawScannerImplementation: `${typeof rawScannerModuleId}/owned-iterative` = `${rawScannerModuleId}/owned-iterative`;

export const ownedRawScannerDeclaration: ModuleDeclaration = Object.freeze<ModuleDeclaration>({
  kind: "get-modular.module-declaration",
  schemaVersion: 1,
  moduleId: rawScannerModuleId,
  implementationId: ownedRawScannerImplementation,
  owner: Object.freeze({ authority: "get-modular", path: Object.freeze(["raw-scanner"]) }),
  provides: Object.freeze([Object.freeze({
    capabilityId: rawScannerCapabilityId,
    compatibility: Object.freeze({ family: "exact", familyVersion: 1, token: rawScannerToken }),
  })]),
  slots: Object.freeze([]),
});
