// Qualification-only direct subject. Never exported or packed as a subpath.
import { root } from "../src/composition/stage0.js";
import type { CompileCompositionResult } from "../src/features/authoring/internal.js";

export const compileComposition: (input: {
  readonly declarations: readonly unknown[];
  readonly profile: unknown;
}) => Promise<CompileCompositionResult> = root.compileComposition;
export { defineModule, required, optional, many } from "../src/features/authoring/internal.js";
export type {
  CompileCompositionResult, ModuleDeclaration, CompositionProfile, CompositionPlan,
  Diagnostic, DiagnosticCode, PlanDigest,
} from "../src/features/authoring/internal.js";
