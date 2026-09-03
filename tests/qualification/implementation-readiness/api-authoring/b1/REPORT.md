# Descriptor-object API authoring fixture (b1)

Disposable fixture at exact SHA 0f7d2fc64ae7258781e6c2676ca1e0ccc377f418. No production code or module engine.

## Commands and evidence

node --version: v24.16.0
tsc 7.0.2 strict no-emit check: pass
node run.mjs: {scenarios:17,serializability:"not-executed",evidenceStatus:"source-probe-only",executableImports:0}
pnpm check:fast: sandbox cannot start (bwrap uid map); Node 24.16.0 is below required >=24.18 <25.

## Shared scenarios

All 17 requested scenarios are named in fixture.ts: required, optional, many, missing, duplicate, ambiguity, cycle, disabled, unreachable, multiple roots, deterministic ordering, hostile keys (__proto__, constructor, then, Unicode), unknown fields, no fallback, serializability, declaration emit, and no executable import during discovery. Syntax alone supplies no semantic diagnostics; a compiler would need to provide them.

## Measurements

| Measure | Result |
| --- | --- |
| Authoring LOC | 19 |
| Generic glue LOC | 17 |
| Files changed for one module | 1 (fixture.ts; harness/report excluded) |
| Binding edit locations | 1 nested dependencies object |
| Explicit types | ModuleDescriptor, DependencySpec, DemoDeps |
| Inference | defineModule preserves dependency keys; helpers infer cardinality |
| Diagnostics | None at authoring boundary; semantic errors deferred/untyped |
| Serializability | Not executed; source probe only |
| Declaration emit | Typecheck passes; emit not claimed due preflight limitation |
| Removal cost | Delete one dependencies property |
| Framework leakage | None; built-in structuredClone only |

## Failure modes and recommendation

Cardinality and capability are strings; the fixture uses an erased optional type marker and explicit helper generics to associate descriptors with dependency types without placing executable type values in the declaration. Unknown fields, duplicate keys, ambiguity, cycles, reachability, and ordering have no syntax-level diagnostics. Recommend for further research as authoring syntax, contingent on a typed compiler and supported-Node declaration emit run. Non-authoritative evidence only.
