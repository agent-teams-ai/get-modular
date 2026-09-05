import type { AllowlistHandle } from "./allowlist-types.js";
import { allowlist as productionAllowlist } from "./allowlist.js";
import { witnessVariantImplementation, witnessVariantDeclaration } from "../tests/features/canonicalization/witness-variant/declaration.js";
import { createWitnessVariant } from "../tests/features/canonicalization/witness-variant/factory.js";

export const allowlist: ReadonlyMap<string, AllowlistHandle> = new Map<string, AllowlistHandle>([
  ...productionAllowlist,
  [witnessVariantImplementation, { declaration: witnessVariantDeclaration, factory: createWitnessVariant,
    importPath: "../../../tests/features/canonicalization/witness-variant/factory.js", factoryExport: "createWitnessVariant",
    declarationExport: "witnessVariantDeclaration", localName: "canonicalizerVariant" }],
]);
