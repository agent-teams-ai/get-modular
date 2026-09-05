// Curated library surface. No factory, declaration, compiler, or composition root.
export { defineModule, required, optional, many } from "./helpers.js";
export type { ModuleDeclaration, CompositionProfile, CompositionPlan, PlanDigest } from "./wire-types.js";
export type { CompileCompositionResult, Diagnostic, DiagnosticCode } from "./diagnostic-types.js";
