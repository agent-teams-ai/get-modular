# Declaration-and-activation (b3) fixture

Disposable API-authoring research at base `0f7d2fc64ae7258781e6c2676ca1e0ccc377f418`.
Discovery is inert (`executable` is a host loader key); activation consumes an explicit profile.

## Commands and outputs

* `node --version` -> `v24.16.0`.
* `pnpm runtime:preflight` -> fails: required Node `>=24.18.0 <25`.
* `pnpm exec tsc -p tests/qualification/implementation-readiness/api-authoring/b3-v/tsconfig.json` -> passes; emits `dist/fixture.d.ts`.
* `node --experimental-strip-types tests/qualification/implementation-readiness/api-authoring/b3-v/fixture.ts` -> passes; JSON reports 17/17 scenarios `ok:true`.

## Metrics

* Authoring LOC: 5 (declaration plus activation); generic glue LOC: 14; files for one module: 3; binding edit locations: 1.
* Explicit types: 4 aliases; inference handles literals and activation result.
* Diagnostics: only thrown strings (no stable code/path model).
* Serializability: declaration JSON round-trip passes; activation output is data-only.
* Removal cost: delete declaration and profile entry; no registry cleanup.
* Framework leakage: none; loader key is host-owned.

## Scenarios, limitations, recommendation

The shared set covers required, optional, many, missing, duplicate, ambiguity,
cycle, disabled, unreachable, multiple roots, deterministic ordering, hostile
keys (`__proto__`, `constructor`, `then`, Unicode), unknown fields, no fallback,
serializability, declaration emit, and no executable import during discovery.
All 17 synthetic checks pass. Duplicate/ambiguity/cycle/unreachable/unknown
checks are sentinels, not a complete compiler: spread demonstrates overwrite
risk, and ordering uses default lexical sort. No runtime/module engine or
executable import is used.

Recommendation (non-authoritative): promising for small modules because one
explicit profile localizes bindings and discovery remains inert. Adoption would
require closed-world validation, structured diagnostics, duplicate rejection,
and canonical ordering.
