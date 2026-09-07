import { root } from "./composition/generated/stage1.js";
import type { CompileCompositionResult } from "./features/authoring/internal.js";

// The private root has its provided port; the public declaration stays closed.
export const compileComposition: (input: {
  readonly declarations: readonly unknown[];
  readonly profile: unknown;
}) => Promise<CompileCompositionResult> = root.compileComposition;
export const compileCompositionJson: (input: {
  readonly declarations: readonly Uint8Array[];
  readonly profile: Uint8Array;
}) => Promise<CompileCompositionResult> = root.compileCompositionJson;
export { defineModule, required, optional, many } from "./features/authoring/internal.js";
export type {
  CompileCompositionResult, ModuleDeclaration, CompositionProfile, CompositionPlan,
  Diagnostic, DiagnosticCode, PlanDigest,
} from "./features/authoring/internal.js";
