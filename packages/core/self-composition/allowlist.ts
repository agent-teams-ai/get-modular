import type { AllowlistHandle } from "./allowlist-types.js";
import { ownedJcsImplementation, ownedJcsDeclaration } from "../src/features/canonicalization/owned-jcs/declaration.js";
import { createOwnedJcs } from "../src/features/canonicalization/owned-jcs/factory.js";
import { compositionSemanticsImplementation, compositionSemanticsDeclaration } from "../src/features/composition-semantics/declaration.js";
import { createCompositionSemantics } from "../src/features/composition-semantics/factory.js";
import { planOutputImplementation, planOutputDeclaration } from "../src/features/plan-output/declaration.js";
import { createPlanOutput } from "../src/features/plan-output/factory.js";
import { ownedRawScannerImplementation, ownedRawScannerDeclaration } from "../src/features/raw-scanner/owned-iterative/declaration.js";
import { createOwnedRawScanner } from "../src/features/raw-scanner/owned-iterative/factory.js";
import { inputAdmissionImplementation, inputAdmissionDeclaration } from "../src/features/input-admission/declaration.js";
import { createInputAdmission } from "../src/features/input-admission/factory.js";
import { compilerFacadeImplementation, compilerFacadeDeclaration } from "../src/features/compiler-facade/declaration.js";
import { createCompilerFacade } from "../src/features/compiler-facade/factory.js";

// importPath is relative to src/composition/generated, including before M3.
// The independent witness verifies its correspondence to these static imports.
export const allowlist: ReadonlyMap<string, AllowlistHandle> = new Map<string, AllowlistHandle>([
  [ownedJcsImplementation, { declaration: ownedJcsDeclaration, factory: createOwnedJcs,
    importPath: "../../features/canonicalization/owned-jcs/factory.js", factoryExport: "createOwnedJcs",
    declarationExport: "ownedJcsDeclaration", localName: "canonicalizer" }],
  [compositionSemanticsImplementation, { declaration: compositionSemanticsDeclaration, factory: createCompositionSemantics,
    importPath: "../../features/composition-semantics/factory.js", factoryExport: "createCompositionSemantics",
    declarationExport: "compositionSemanticsDeclaration", localName: "semantics" }],
  [planOutputImplementation, { declaration: planOutputDeclaration, factory: createPlanOutput,
    importPath: "../../features/plan-output/factory.js", factoryExport: "createPlanOutput",
    declarationExport: "planOutputDeclaration", localName: "output" }],
  [ownedRawScannerImplementation, { declaration: ownedRawScannerDeclaration, factory: createOwnedRawScanner,
    importPath: "../../features/raw-scanner/owned-iterative/factory.js", factoryExport: "createOwnedRawScanner",
    declarationExport: "ownedRawScannerDeclaration", localName: "scanner" }],
  [inputAdmissionImplementation, { declaration: inputAdmissionDeclaration, factory: createInputAdmission,
    importPath: "../../features/input-admission/factory.js", factoryExport: "createInputAdmission",
    declarationExport: "inputAdmissionDeclaration", localName: "admission" }],
  [compilerFacadeImplementation, { declaration: compilerFacadeDeclaration, factory: createCompilerFacade,
    importPath: "../../features/compiler-facade/factory.js", factoryExport: "createCompilerFacade",
    declarationExport: "compilerFacadeDeclaration", localName: "compiler" }],
]);
