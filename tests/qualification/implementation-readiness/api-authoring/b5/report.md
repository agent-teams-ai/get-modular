# TypeScript inference and declaration emit — b5

Research fixture at base SHA `0f7d2fc64ae7258781e6c2676ca1e0ccc377f418`. This is disposable evidence, not an API recommendation or production code.

## Files created

- `api.ts` — generic authoring surface (`required`, `optional`, `many`, `defineModule`, JSON declaration).
- `scenarios.ts` — 17 shared synthetic scenarios and executable serialization probe.
- `tsconfig.json`, `fixture-package.json` — local compiler commands.
- `evidence.json` — output from the emitted JavaScript run.
- `dist/api.{js,d.ts}`, `dist/scenarios.{js,d.ts}` — declaration/build output (generated fixture files).

## Commands and outputs

- `node --version` → `v24.16.0`.
- `node architecture/checks/node-version.mjs` → exit 1, `NODE_VERSION_PREFLIGHT_FAILED: expected Node >=24.18.0 <25, received 24.16.0`. Full repository gates were not claimed.
- `/var/data/gm-implementation-readiness-api-20260903/base/node_modules/.bin/tsc -p tsconfig.json --noEmit` → pass.
- same `tsc -p tsconfig.json` → pass; emitted four files under `dist/`.
- `node dist/scenarios.js` → pass, `scenarioCount: 17`, `serializedBytes: 506`, `deterministicStable: true`.

## Measurements

| Measure | Evidence |
| --- | --- |
| Authoring LOC | 5 lines in `scenarios.ts` (module + scenario table); 8 lines API helper; 13 total nonblank LOC |
| Generic glue LOC | 1 `defineModule` signature line plus 4 cardinality helper/type lines (5) |
| Files for one module | 1 authoring source file (`scenarios.ts`); 3 support/config files |
| Binding edit locations | 1 dependencies object literal; each slot is one property edit |
| Explicit types | `Cardinality`, `Slot`, `ModuleSpec`, `Scenario` (4 declarations) |
| Inference | const generics preserve module id, provides tuple, dependency keys; `inferredKeys` emitted at runtime |
| Diagnostics | no compiler/semantic diagnostics implemented; table records expected diagnostic outcomes only |
| Serializability | JSON output succeeds, but hostile `__proto__` property is dropped (`hasProtoKey: false`); reordered inputs produced identical bytes (`deterministicStable: true`) |
| Declaration emit | `api.d.ts` and `scenarios.d.ts` emitted successfully |
| Removal cost | delete one dependency property and its helper import if unused; no registry edits |
| Framework leakage | none; only TypeScript and standard JSON/runtime APIs |

## Scenario coverage and failure modes

The table covers required, optional, many, missing, duplicate, ambiguity, cycle, disabled, unreachable, multiple roots, deterministic ordering, hostile keys (`__proto__`, `constructor`, `then`, Unicode), unknown fields, no fallback, serializability, declaration emit, and no executable import during discovery. Only authoring/serialization mechanics are executable here; graph and diagnostic scenarios are labeled expected outcomes, not proven compiler behavior.

The concrete failure is material: an object-literal `__proto__` key does not become an own enumerable property, so a naïve inferred-record API cannot faithfully serialize that hostile key. `constructor`, `then`, and `é` survive. No executable module import occurs during discovery because declarations are inert values.

## Recommendation (non-authoritative)

Inference and declaration emit are low-glue and ergonomic for ordinary keys, with one binding edit location and no framework coupling. Do not advance this shape without changing record construction/validation to preserve hostile keys and adding real closed-world diagnostics for missing, duplicate, ambiguity, cycles, disabled/unreachable, unknown-field, and no-fallback cases.
