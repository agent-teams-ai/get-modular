# independent-low-ceremony-candidate (worker b4)

Disposable TypeScript API-authoring fixture at base SHA `0f7d2fc64ae7258781e6c2676ca1e0ccc377f418`. It contains inert declarations and a diagnostic helper only: no production imports, factories, loader, runtime engine, or package dependency.

## Commands

`node --version` -> `v24.16.0`.

`pnpm exec tsc -p tests/qualification/implementation-readiness/api-authoring/b4-v/tsconfig.json` (pass), then `node tests/qualification/implementation-readiness/api-authoring/b4-v/dist/run.js` (all scenarios pass; cycle intentionally reports `missing`, documenting the limitation).

The full repository gate is not claimable because preflight requires Node `>=24.18 <25` and this worker has 24.16.0.

## Metrics

- Source authoring: 39 LOC (`src/*.ts`); generic glue: 0 LOC.
- One module touches 1 file (`src/scenarios.ts`); binding edit locations: 1 (`needs`).
- Explicit types: 7 exported aliases/signatures; scenario inputs infer through helpers.
- Diagnostics are serializable `{code,path}` records sorted lexically; JSON.stringify witness and declaration emit pass.
- Removal cost is deleting one scenario entry; no registry cleanup. Framework leakage: none.

Scenarios cover required, optional, many, missing, duplicate, ambiguity, cycle, disabled, unreachable, multiple roots, deterministic ordering, hostile keys (`__proto__`, `constructor`, `then`, Unicode), unknown fields, no fallback, serializability, declaration emit, and no executable import during discovery.

Recommendation (non-authoritative): low ceremony and visible bindings are promising, but a real graph compiler is required to distinguish cycles, reachability, roots, and disabled-provider semantics before production use.
