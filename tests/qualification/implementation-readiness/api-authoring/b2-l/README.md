# typed-define-module / b2

Disposable fixture at base SHA `0f7d2fc64ae7258781e6c2676ca1e0ccc377f418`.
Typed `defineModule({...})` authoring only; no graph compiler, runtime/module
engine, executable discovery, or production imports.

## Commands

From the repository root, `node_modules/.bin/tsc -p qualification/spikes/api-authoring/typed-define-module/b2/tsconfig.json` — passed; declaration-only output in `dist/`.

From the repository root, `node architecture/checks/node-version.mjs` — failed: Node `v24.16.0`; contract requires `>=24.18.0 <25`.

No JavaScript is emitted or executed, so discovery performs no executable import.

## Scenario matrix

| Scenario | Result/evidence |
| --- | --- |
| required, optional, many | Authored in `baseline.dependencies` union |
| missing, duplicate, ambiguity, cycle | Not measured: no compiler |
| disabled, unreachable, multiple roots | Not measured: no profile/graph |
| deterministic ordering | Explicit `orderBy: implementationId` |
| hostile keys | `__proto__`, `constructor`, `then`, `Ünicode` as data |
| unknown fields, no fallback | Type-level excess-property checks; no defaults |
| serializability | Data-only readonly shape; inspection pass |
| declaration emit | `tsc --emitDeclarationOnly` passed |
| no executable import during discovery | Passed by declaration-only/no execution |

## Measurements

- Authoring LOC: 14 (`scenarios.ts`, excluding blanks/comments).
- Generic glue LOC: 4 (`api.ts`).
- Files changed for one module: 1 (`scenarios.ts`; helper shared).
- Binding edit locations: 1 call site; binding semantics absent.
- Explicit types: IDs, provides, dependency discriminants.
- Inference: literal IDs/providers retained by `const` generics; metadata scalar union widened.
- Diagnostics: TypeScript errors only; no structured graph diagnostics.
- Serializability: functions/symbols/ambient state excluded by type.
- Removal cost: remove one call and import (2 edits).
- Framework leakage: none; local helper only.

## Failure modes and recommendation

Strong local inference and low ceremony, but cannot validate graph scenarios
(missing, duplicate, ambiguity, cycle, disabled, unreachable, roots), and has
no structured diagnostics or bindings. Recommend only as an inert declaration
surface behind a separate validated profile/compiler; not conformance evidence.
