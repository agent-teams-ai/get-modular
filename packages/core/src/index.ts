import { root } from "./composition/stage0.js";
import type { CompileCompositionResult } from "./features/authoring/internal.js";

// The private root has its provided port; the public declaration stays closed.
export const compileComposition: (input: {
  readonly declarations: readonly unknown[];
  readonly profile: unknown;
}) => Promise<CompileCompositionResult> = root.compileComposition;
export { defineModule, required, optional, many } from "./features/authoring/internal.js";
export type {
  CompileCompositionResult, ModuleDeclaration, CompositionProfile, CompositionPlan,
  Diagnostic, DiagnosticCode, PlanDigest,
} from "./features/authoring/internal.js";
