// Qualification-only direct variant; public names match the current milestone.
import { root } from "./stage0.variant.js";
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
