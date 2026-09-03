# Hostile-key-and-serialization — worker b6

Disposable TypeScript API-authoring fixture at the assigned path. It models required, optional, and bounded ordered many dependencies plus metadata keys `__proto__`, `constructor`, `then`, and Unicode. Canonicalization sorts own keys into a null-prototype record before JSON serialization.

Base SHA: `0f7d2fc64ae7258781e6c2676ca1e0ccc377f418`

Commands: the original worker used Node `v24.16.0`, so `pnpm runtime:preflight` failed because the contract requires `>=24.18.0 <25`; `node run.mjs` now compiles the fixture into an ephemeral OS-temporary directory and passes hostile-key preservation, deterministic ordering, JSON round-trip, forbidden-value rejection, and no executable import. The generated output is intentionally not required to be tracked.

Metrics: 8 physical LOC in fixture.ts (declarations/data); canonicalization glue is intentionally compact; one module edits one TypeScript file plus config; binding edits are in one dependency-array location per slot; 4 interfaces/types explicit, tuple/map inference used; diagnostics are TypeScript-only; bounded JSON-safe deterministic serialization with explicit rejection of unsupported values, accessors, symbols, non-enumerable properties, hooks, cycles, non-canonical array indexes, negative zero, and sparse/oversized arrays; removal is deleting the object/entries; framework leakage none.

Scenario set covered: required, optional, many, missing, duplicate, ambiguity, cycle, disabled, unreachable, multiple roots, deterministic ordering, hostile keys, unknown fields, no fallback, serializability, declaration emit, and no executable import during discovery. Only hostile-key, serialization, declaration-emit, and import-side-effect checks execute here; the rest are authoring-shape coverage, not engine conformance.

Failure modes: naïve assignment to `__proto__` can mutate a prototype; null-prototype normalization avoids that. The fixture rejects non-finite numbers, functions, symbols, `undefined`, accessors, custom prototypes, and `toJSON` hooks before serialization. This is a closed-value probe, not a canonicalization or trust-boundary implementation. Recommendation (non-authoritative): concise object literals are viable only if production normalization is prototype-safe and rejects unsupported values and unknown fields explicitly.
