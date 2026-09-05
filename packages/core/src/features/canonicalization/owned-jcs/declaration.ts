import {
  canonicalBytesCapabilityId,
  canonicalBytesToken,
  canonicalizationModuleId,
} from "../identity.js";

export const ownedJcsImplementation: `${typeof canonicalizationModuleId}/owned-jcs` = `${canonicalizationModuleId}/owned-jcs`;

const declaration: {
  readonly kind: "get-modular.module-declaration";
  readonly schemaVersion: 1;
  readonly moduleId: typeof canonicalizationModuleId;
  readonly implementationId: typeof ownedJcsImplementation;
  readonly owner: { readonly authority: "get-modular"; readonly path: readonly ["canonicalization"] };
  readonly provides: readonly [{
    readonly capabilityId: typeof canonicalBytesCapabilityId;
    readonly compatibility: {
      readonly family: "exact";
      readonly familyVersion: 1;
      readonly token: typeof canonicalBytesToken;
    };
  }];
  readonly slots: readonly [];
} = {
  kind: "get-modular.module-declaration",
  schemaVersion: 1,
  moduleId: canonicalizationModuleId,
  implementationId: ownedJcsImplementation,
  owner: { authority: "get-modular", path: ["canonicalization"] },
  provides: [{
    capabilityId: canonicalBytesCapabilityId,
    compatibility: { family: "exact", familyVersion: 1, token: canonicalBytesToken },
  }],
  slots: [],
} as const;

Object.freeze(declaration.owner.path);
Object.freeze(declaration.owner);
Object.freeze(declaration.provides[0].compatibility);
Object.freeze(declaration.provides[0]);
Object.freeze(declaration.provides);
Object.freeze(declaration.slots);
export const ownedJcsDeclaration: typeof declaration = Object.freeze(declaration);
