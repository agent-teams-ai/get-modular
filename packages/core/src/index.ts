export { compileComposition } from "./composition/stage0.js";
export { defineModule, required, optional, many } from "./features/authoring/internal.js";
export type {
  CompileCompositionResult, ModuleDeclaration, CompositionProfile, CompositionPlan,
  Diagnostic, DiagnosticCode, PlanDigest,
} from "./features/authoring/internal.js";
