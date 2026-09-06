import type { CompilerFacadePort } from "../features/compiler-facade/ports.js";
import { createOwnedJcs } from "../features/canonicalization/owned-jcs/factory.js";
import { createCompositionSemantics } from "../features/composition-semantics/factory.js";
import { createPlanOutput } from "../features/plan-output/factory.js";
import { createOwnedRawScanner } from "../features/raw-scanner/owned-iterative/factory.js";
import { createInputAdmission } from "../features/input-admission/factory.js";
import { createCompilerFacade } from "../features/compiler-facade/factory.js";

const canonicalizer = createOwnedJcs({});
const semantics = createCompositionSemantics({ canonicalizer });
const output = createPlanOutput({ canonicalizer });
const scanner = createOwnedRawScanner({});
const admission = createInputAdmission({ scanner });
const compiler = createCompilerFacade({ admission, semantics, output });

export const root: CompilerFacadePort = compiler;
