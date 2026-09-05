import type { CompileCompositionResult } from "../features/authoring/internal.js";
import { createOwnedJcs } from "../features/canonicalization/owned-jcs/factory.js";
import { createCompositionSemantics } from "../features/composition-semantics/factory.js";
import { createInputAdmission } from "../features/input-admission/factory.js";
import { createPlanOutput } from "../features/plan-output/factory.js";
import { createCompilerFacade } from "../features/compiler-facade/factory.js";

const canonicalizer = createOwnedJcs({});
const semantics = createCompositionSemantics({ canonicalizer });
const admission = createInputAdmission({});
const output = createPlanOutput({ canonicalizer });
const compiler = createCompilerFacade({ admission, semantics, output });

// Keep the public declaration closure independent from private feature ports.
export const compileComposition: (input: {
  readonly declarations: readonly unknown[];
  readonly profile: unknown;
}) => Promise<CompileCompositionResult> = compiler.compileComposition;
