# Hostile-key-and-serialization — worker b6

Disposable TypeScript API-authoring fixture at the assigned path. It models required, optional, and bounded ordered many dependencies plus metadata keys `__proto__`, `constructor`, `then`, and Unicode. Canonicalization sorts own keys into a null-prototype record before JSON serialization.

Base SHA: `0f7d2fc64ae7258781e6c2676ca1e0ccc377f418`

Commands: `node --version` → `v24.16.0`; `pnpm runtime:preflight` fails because the contract requires `>=24.18.0 <25`; `node_modules/.bin/tsc -p tsconfig.json` passes and emits JS/declarations; `node run.mjs` passes hostile-key preservation, deterministic ordering, JSON round-trip, and no executable import.

Metrics: 8 physical LOC in fixture.ts (declarations/data); canonicalization glue is 1 physical LOC (the function body is intentionally compact); one module edits one TypeScript file plus config; binding edits are in one dependency-array location per slot; 3 interfaces/types explicit, tuple/map inference used; diagnostics are TypeScript-only; JSON-safe deterministic serialization; removal is deleting the object/entries; framework leakage none.

Scenario set covered: required, optional, many, missing, duplicate, ambiguity, cycle, disabled, unreachable, multiple roots, deterministic ordering, hostile keys, unknown fields, no fallback, serializability, declaration emit, and no executable import during discovery. Only hostile-key, serialization, declaration-emit, and import-side-effect checks execute here; the rest are authoring-shape coverage, not engine conformance.

Failure modes: naïve assignment to `__proto__` can mutate a prototype; null-prototype normalization avoids that. JSON drops prototypes, symbols, `undefined`, and functions. Recommendation (non-authoritative): concise object literals are viable if production normalization is prototype-safe and rejects unknown fields explicitly.
