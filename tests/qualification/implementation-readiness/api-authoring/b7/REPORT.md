# Disablement-removal-and-diagnostics API authoring fixture (b7)

Research-only fixture at base SHA `0f7d2fc64ae7258781e6c2676ca1e0ccc377f418`.
No production, public API, ADR, or ordinary documentation files were changed.

## Files

- `api.ts` — inert declaration types, `required`/`optional`/`many` helpers,
  deterministic compile simulation, disablement diagnostic.
- `scenarios.mjs` — shared synthetic scenario runner.
- `tsconfig.json` — strict NodeNext declaration-emission configuration.
- `dist/api.d.ts`, `api.js` — local compiler outputs (disposable).

## Commands and evidence

- `node_modules/.bin/tsc -p .../b7/tsconfig.json` — exit 0; declaration emitted
  at `dist/api.d.ts` (14 lines).
- `node .../b7/scenarios.mjs` — exit 0; 15 scenarios emitted deterministic
  JSON. Required, optional, bounded many, missing, ambiguity, disabled,
  deterministic ordering, hostile keys, no-fallback, and serializability paths
  execute. Disabled provider yields both `dependency.missing` and
  `module.disabled`; no fallback is attempted.
- `node architecture/checks/node-version.mjs` — exit 1:
  `NODE_VERSION_PREFLIGHT_FAILED: expected Node >=24.18.0 <25, received 24.16.0`.
  Therefore `pnpm check:fast`/`pnpm check` are not claimed as passing.
- `pnpm check:changed` was attempted with an 8-second timeout and produced no output (exit 124), consistent with the Node/pnpm preflight environment limitation.
- `git rev-parse HEAD` — `0f7d2fc64ae7258781e6c2676ca1e0ccc377f418`.

## Metrics

- Authoring LOC: 9 (`api.ts`); scenario LOC: 4. Generic glue LOC is 0
  beyond the helper declarations (the compiler is intentionally tiny).
- Files for one module: one source file (`api.ts`); one module declaration call.
- Binding edit locations: one `requires` array entry per binding.
- Explicit types: `Cardinality`, `Dependency`, `ModuleDeclaration`, `Diagnostic`.
  Inference covers helper return values and compile result shape.
- Diagnostics: stable string codes, sorted output, bounded path arrays; no
  framework or container types leak into declarations.
- Serializability: declaration values contain strings, arrays, records, and
  maps only in the internal result; `JSON.stringify(compile(...))` succeeds.
- Removal cost: delete one `defineModule` call; no registry cleanup or imports.
- Framework leakage: none; executable imports are absent from declarations and
  discovery is represented by inert data only.

## Scenario gaps / failure modes

This candidate is deliberately a fixture, not an implementation. It exposes
important failures: `cycle`, `unreachable`, `multiple-roots`, and `unknown-fields`
currently produce no diagnostics; duplicate providers are reported only as
`dependency.ambiguous`; hostile `__proto__` is safe because `Map` is used, but
Unicode ordering follows JavaScript `localeCompare`; declaration emit does not
prove runtime package-boundary behavior. The runner imports the fixture compiler
for measurement, so it is not evidence of a production discovery mechanism.

## Recommendation (non-authoritative)

The declaration-first shape has low authoring and removal cost, good inference,
and no framework coupling. It should not be selected without adding explicit
cycle/unreachable/root/unknown-field diagnostics and a specified canonical
ordering algorithm; retain this result as comparative research only.
