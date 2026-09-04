# DX-and-navigation-at-scale — disposable API authoring fixture

Candidate: typed declaration helpers (`defineModule`, `required`, `optional`, `many`). Base SHA: `0f7d2fc64ae7258781e6c2676ca1e0ccc377f418`.

Created only here: `src/api.ts`, `src/authoring.ts`, `tsconfig.json`, and this report. No production, package, ADR, or ordinary docs files changed.

## Commands and outputs

`node --version` → `v24.16.0`.
`node_modules/.bin/tsc -p .../b8/tsconfig.json --pretty false` → exit 0.
`pnpm runtime:preflight` is not a passing full gate: the contract requires Node >=24.18.0 <25 and this environment is 24.16.0.

## Shared scenario evidence

The `scenarios` union/list covers required, optional, many, missing, duplicate,
ambiguity, cycle, disabled, unreachable, multiple roots, deterministic ordering,
hostile keys (`__proto__`, `constructor`, `then`, Unicode), unknown fields,
no fallback, serializability, declaration emit, and no executable import during
discovery. `evidence` is deterministic typed data and `jsonEvidence` uses
`JSON.stringify`; discovery has no dynamic import and uses `import type`.

## Measurements

| Metric | Evidence |
| --- | --- |
| Authoring LOC | 17 (`src/api.ts`) |
| Generic glue LOC | 14 (`src/authoring.ts`) |
| Files for one module | 1 declaration file; runner is shared glue |
| Binding edit locations | 1 inline dependency list |
| Explicit types | Cardinality, Dependency, ModuleDeclaration, result/diagnostic unions |
| Inference | `defineModule<const T>` preserves literal IDs and readonly shapes |
| Diagnostics | Stable string union with scenario-specific codes |
| Serializability | Declarations/results contain data only; JSON conversion |
| Removal cost | Remove one object and references; helpers remain reusable |
| Framework leakage | None; TypeScript and standard Set/JSON only |

## Limitations and recommendation

Inline dependencies become hard to navigate at scale because identity, bindings,
and policy occupy one literal. Several labels are scenario branches rather than
full semantic fixtures, so this is authoring evidence, not compiler conformance;
declaration emit is not exercised by the no-emit check. Recommendation
(non-authoritative): keep typed helpers for exploration, then split large
declarations into named sections and use table-driven expected diagnostics.
