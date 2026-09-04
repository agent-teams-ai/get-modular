# API authoring lab remediation worker

Work from exact commit `ae1a13869643ef4ae421baad7c377d4ef9198aeb` in a clean standalone workspace.

You own only:

`tests/qualification/implementation-readiness/api-authoring/common/**`

Do not change package scripts, architecture checks, documentation, accepted ADRs, production source, or existing candidate directories. Do not install packages or use the network. Use the repository-pinned TypeScript and Node toolchain already present.

Implement a disposable, qualification-only comparison of the three syntax candidates named by the goal:

1. inert descriptor object;
2. typed `defineModule`;
3. separate inert declaration and typed activation factory.

Requirements:

- one immutable, plain-data corpus with exactly the 30 numbered scenarios in the goal;
- exactly the same corpus and expected outcomes for all three candidates;
- one small deterministic qualification oracle, with no import from production Core;
- candidate adapters only encode/decode syntax and may not change semantics, add fallback, or copy expected output into observed output;
- 90 meaningful executions, with exact scenario IDs and evidence class;
- declaration/profile data remain inert and JSON-compatible;
- factories stay outside declarations and are used only by the direct-Pure-DI and selected-literal-loader host probes;
- no decorators, reflection, container, resolver, filesystem discovery, registration-order semantics, framework leakage, or executable discovery imports;
- hostile keys include own `__proto__`, `constructor`, `then`, composed/decomposed Unicode and must be handled without inherited lookup;
- deterministic diagnostics and inventory under input permutation;
- `.d.ts` emit for all candidates and compile-time type probes;
- measured common-denominator metrics: authoring LOC, generic glue LOC/ratio, files/module, binding loci, explicit annotations, declaration lines/bytes/exports, compile duration, serialized bytes, import counters, removal/disable edits; mark tree-shaking and runtime performance `not-measured` when no pinned tool or runtime subject exists;
- generated 10/100/1000 declaration type-scale probes may use an OS-temporary directory only;
- a machine-readable scenario matrix/result summary and a concise README that mark the result non-authoritative and non-production.

The executable runner must fail if:

- there are not exactly 30 unique corpus IDs;
- any candidate does not execute all 30;
- candidate corpus digests differ;
- an observed outcome is absent or manufactured directly from the expectation;
- declaration data contain executable values;
- a candidate imports executable implementation code during discovery;
- a hidden fallback or registration-order dependency changes an outcome;
- diagnostics or inventory differ under equivalent input reordering.

Run focused TypeScript emit and the executable suite. Return a patch/handoff with exact commands and outputs. Keep the implementation compact, preferably 750-1,000 non-generated LOC. If honest semantic coverage cannot fit without becoming a prototype production compiler, stop and report the smallest missing seam instead of widening scope.
