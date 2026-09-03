# typed-define-module (worker b2)

Disposable API-authoring research fixture at exact base SHA `0f7d2fc64ae7258781e6c2676ca1e0ccc377f418`. No production, public API, ADR, or ordinary documentation files were changed.

## Files created

- `fixture.ts` — generic `defineModule` API, inert discovery declaration, and shared synthetic scenario table.
- `tsconfig.json` — strict NodeNext TypeScript config with declaration emit.
- `dist/fixture.js`, `dist/fixture.d.ts` — generated local emit used as evidence.

## Commands and outputs

- `node --version` → `v24.16.0` (repository preflight requires `>=24.18 <25`; therefore the full gate is not claimed).
- `npx tsc -p tests/qualification/implementation-readiness/api-authoring/b2-v/tsconfig.json` → exit 0.
- `node --input-type=module -e 'import(...).then(m => console.log(JSON.stringify(m.measure(), null, 2)))'` → all 17 scenario records observed at their expected result; `executableImports: 0`; serialized declaration is `{"id":"acme/root","provides":["acme/service"]}`.

Scenario set covered: required, optional, many, missing, duplicate, ambiguity, cycle, disabled, unreachable, multiple roots, deterministic ordering, hostile keys (`__proto__`, `constructor`, `then`, Unicode), unknown fields, no fallback, serializability, declaration emit, and no executable import during discovery.

## Measurements

- Authoring LOC: 4 LOC for the module declaration call (the `discoveryOnly` declaration).
- Generic glue LOC: 5 LOC (`Cardinality`, `Dependency`, `ModuleSpec`, and `defineModule`).
- Files changed for one module: 1 authored source file (`fixture.ts`); 2 config/evidence files are fixture support.
- Binding edit locations: 1 (the `provides`/`dependencies` object literal).
- Explicit types: `Cardinality`, `Dependency`, `ModuleSpec<P>`, and `Scenario`.
- Inference: literal provider capability is inferred as `"acme/service"` via const generic.
- Diagnostics: scenario table records pass/diagnostic outcomes; no runtime compiler diagnostics implemented in this authoring-only fixture.
- Serializability: declaration payload round-trips through JSON; factory is omitted from payload.
- Declaration emit: `dist/fixture.d.ts` generated successfully.
- Removal cost: delete one declaration expression and its import-free factory symbol (2 source locations in this fixture).
- Framework leakage: none; only TypeScript built-ins and plain data/function types.

## Failure modes and limitations

This is an authoring-syntax fixture, not a module engine: scenario outcomes are recorded synthetic expectations rather than graph compilation. It does not prove semantic validation, ordering algorithms, or production diagnostics. `defineModule` accepts a factory field for discovery-safety measurement but does not invoke it. Full repository checks were intentionally not run because Node 24.16.0 violates the declared runtime preflight (`>=24.18 <25`). `npx` emitted only environment config warnings and used the existing installed TypeScript; no packages were installed or fetched.

## Recommendation (non-authoritative)

Typed `defineModule<const P>` is compact and gives useful capability-literal inference with low binding edit surface and no framework leakage. Its main risk is that generic typing alone cannot enforce graph semantics or strict unknown-field rejection; those remain compiler/schema responsibilities.
