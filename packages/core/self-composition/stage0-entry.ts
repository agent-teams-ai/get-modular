// Qualification-only direct subject. Never exported or packed as a subpath.
export { compileComposition } from "../src/composition/stage0.js";
export { defineModule, required, optional, many } from "../src/features/authoring/internal.js";
export type {
  CompileCompositionResult, ModuleDeclaration, CompositionProfile, CompositionPlan,
  Diagnostic, DiagnosticCode, PlanDigest,
} from "../src/features/authoring/internal.js";
