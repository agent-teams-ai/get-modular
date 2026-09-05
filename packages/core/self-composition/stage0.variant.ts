import type { CompilerFacadePort } from "../src/features/compiler-facade/ports.js";
import { createWitnessVariant } from "../tests/features/canonicalization/witness-variant/factory.js";
import { createCompositionSemantics } from "../src/features/composition-semantics/factory.js";
import { createInputAdmission } from "../src/features/input-admission/factory.js";
import { createPlanOutput } from "../src/features/plan-output/factory.js";
import { createCompilerFacade } from "../src/features/compiler-facade/factory.js";

const canonicalizerVariant = createWitnessVariant({});
const semantics = createCompositionSemantics({ canonicalizer: canonicalizerVariant });
const admission = createInputAdmission({});
const output = createPlanOutput({ canonicalizer: canonicalizerVariant });
const compiler = createCompilerFacade({ admission, semantics, output });

export const root: CompilerFacadePort = compiler;
