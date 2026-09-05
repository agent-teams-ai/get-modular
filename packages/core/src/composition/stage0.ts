import type { CompilerFacadePort } from "../features/compiler-facade/ports.js";
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

export const root: CompilerFacadePort = compiler;
