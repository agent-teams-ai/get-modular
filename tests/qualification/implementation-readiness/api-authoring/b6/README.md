# Hostile-key-and-serialization — worker b6

Disposable TypeScript API-authoring fixture at the assigned path. It models required, optional, and bounded ordered many dependencies plus metadata keys `__proto__`, `constructor`, `then`, and Unicode. Its deterministic snapshot probe sorts own keys into a null-prototype record before JSON serialization; it is not the accepted canonical-byte implementation.

Base SHA: `0f7d2fc64ae7258781e6c2676ca1e0ccc377f418`

Commands: the original worker used Node `v24.16.0`, so `pnpm runtime:preflight` failed because the contract requires `>=24.18.0 <25`; `node run.mjs` now compiles the fixture into an ephemeral OS-temporary directory and passes hostile-key preservation, deterministic ordering, JSON round-trip, forbidden-value rejection, and no executable import. The generated output is intentionally not required to be tracked.

The fixture keeps declaration/data authoring small; deterministic snapshot glue is intentionally compact; one module edits one TypeScript file plus config; binding edits are in one dependency-array location per slot; explicit types and literal inference are used; diagnostics are TypeScript-only; bounded hostile-shape probing explicitly rejects unsupported values, fractional or unsafe numbers, lone surrogates, accessors, symbols, non-enumerable properties, hooks, cycles, non-canonical array indexes, negative zero, and sparse/oversized arrays; it does not prove RFC 8785 ordering or the full resource profile; removal is deleting the object/entries; framework leakage none.

Scenario set covered: required, optional, many, missing, duplicate, ambiguity, cycle, disabled, unreachable, multiple roots, deterministic ordering, hostile keys, unknown fields, no fallback, serializability, declaration emit, and no executable import during discovery. Only hostile-key, serialization, declaration-emit, and import-side-effect checks execute here; the rest are authoring-shape coverage, not engine conformance.

Failure modes: naïve assignment to `__proto__` can mutate a prototype; null-prototype normalization avoids that. The fixture rejects non-safe-integer numbers, lone surrogates, functions, symbols, `undefined`, accessors, custom prototypes, and `toJSON` hooks before serialization. This is a closed-value probe, not a canonicalization or trust-boundary implementation. Recommendation (non-authoritative): concise object literals are viable only if production normalization is prototype-safe and rejects unsupported values and unknown fields explicitly.
