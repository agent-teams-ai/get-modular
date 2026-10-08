# Train 2 type sketch: how it was run and what it showed (2026-10-04)

Re-verification of the revision-window authoring types against get-modular `main` `81063ad`
(Assembly types after GM-3b, #137). The original 2026-10-02 sketch was lost; this one was rebuilt
from the current `packages/assembly/src/features/construction/types.ts`.

Files (all stored as `.txt` so no repository gate treats them as production source):

| File | Role |
| --- | --- |
| `core-stub.d.ts.txt` | Minimal Core wire types at declaration schema 2 (`revision`, `compatibleFrom`), used as `node_modules/@get-modular/core/index.d.ts` |
| `assembly-index.d.ts.txt` | Train 2 Assembly types: flat `${id}@${revision}` keys, `Earlier`, key-remapped `CapabilitiesOf`, window intersection for providers, unchanged handle brand. Used as `node_modules/@get-modular/assembly/index.d.ts` |
| `use.ts.txt` | Positive and negative fixtures (9 `@ts-expect-error`) |
| `host-prebuilt.ts.txt` | A train 2 Host that binds and prepares a module whose `.d.ts` was emitted against the 0.3.0 types |
| `emitted-0.3.0-*.d.ts.txt` | The `.d.ts` emitted by TypeScript 7.0.2 and 5.8.3 (identical) for a contract and a module built against the 0.3.0 types on `main` |
| `contract-value.ts.txt` | Conformance `ContractValue<T>` under flat keys |
| `expect.mjs.txt` | Removes each `@ts-expect-error` in turn and requires errors exactly on the guarded line |
| `gen.mjs.txt` | Generates the 500/1000-handle scale fixtures; imports a copy of `tests/assembly/type-scale.mjs` from `main` |
| `rt.mjs.txt` | Runtime body of `defineContract` with `compatibleFrom` validation |
| `define-contract-impl.ts.txt` | The typed `defineContract` body that T2-4 prescribes; compiles on both compilers |
| `rejected-distributive-capabilitiesof.d.ts.txt` | Same types with the distributive `CapabilitiesOf` of the 2026-10-02 sketch |
| `alternative-earlier-descriptors.d.ts.txt` | Alternative API: `earlier: [Db3, Db4]` descriptors instead of the `Earlier` type parameter |

Compilers: TypeScript 7.0.2 (native) and 5.8.3 (`typescript-minimum` of the repository).
Options: `strict`, `skipLibCheck: false`; NodeNext with `exactOptionalPropertyTypes: true`, Bundler with `false`.

## Results

| Check | TS 7.0.2 | TS 5.8.3 |
| --- | --- | --- |
| `use.ts` NodeNext and Bundler | exit 0 | exit 0 |
| `expect.mjs` (each directive removed, error only on the guarded line) | 9/9 | 9/9 |
| 0.3.0-emitted module `.d.ts` bound and prepared by a train 2 Host with window 3..5 | exit 0 | exit 0 |
| Declaration emit keeps alias names (`Contract<"acme/db", DbR5, 5, 3, {3: DbR3; 4: DbR4}>`, `ProvidedEntry<"acme/db", 5, 3, 3 \| 4 \| 5>`) | yes | not run |
| `ContractValue<T>` via conditional extraction (generic indexing with `["value"]` fails with TS2536) | exit 0 | exit 0 |
| Runtime body: refuses revision 0, 1.5, 2^31, `compatibleFrom` 0, `"1"` and `> revision` with `assembly.bind.invalid-declaration` | Node 24.21.0 | - |

Negative fixtures that fire: r3 consumer uses a member only r4+ has; r5 consumer uses a member r5 removed;
a provider serving 3..5 without the r3-only member (intersection `DbR3 & DbR4 & DbR5`); a Host map without
`acme/db@3` preparing an r3 consumer (`"capabilities missing from the preparing map": "acme/db@3"`); a
consumer bound under a mutated r3 type; `compatibleFrom` without a value type in `Earlier`; a hand-written
entry in `declareModule`; a widened `number` revision at `bindFactory`; a Host map without the capability.

Type-check time, whole `tsc` process wall clock, Apple Silicon, 1-2 runs, so read as ranges:

| Fixture | TS 7.0.2 | TS 5.8.3 |
| --- | --- | --- |
| 0.3.0 types on `main`, `fragmentSource(500)` | 2.1-2.2 s | 5.5-7.2 s |
| 0.3.0 types on `main`, `fragmentSource(1000)` | 5.2 s | 13.9 s |
| Train 2, distributive `CapabilitiesOf`, 500 handles, window 1 | 2.6-2.9 s | 6.6-7.2 s |
| Train 2, distributive `CapabilitiesOf`, 500 handles, window 3, half the teams on an older revision | **TS2589** at `host.prepare` | 11.4-15.5 s |
| Train 2, key-remapped `CapabilitiesOf`, 500 handles, window 1 / window 3 | 1.2 s / 1.2 s | 2.7 s / 4.4 s |
| Train 2, key-remapped `CapabilitiesOf`, 1000 handles, window 1 / window 3 | 3.1 s / 2.7 s | 4.4 s / 7.0 s |
| Alternative `earlier: [descriptors]`, key-remapped, 1000 handles, window 3 | 7.9 s | 19.9 s |

The briefs inline the sketch's exported `EarlierValues` constraint as `{ readonly [revision: number]: unknown }`, so
Assembly gains no export.

Conclusions used by the briefs:

1. `CapabilitiesOf` must build the map with one key-remapped mapped type over `{ key, value }` revision
   pairs. The distributive form reaches TS2589 on TypeScript 7.0.2 with windows at 500 handles.
2. The `Earlier` type parameter is about 3x cheaper than earlier-revision descriptors at 1000 handles and
   needs no runtime surface; the descriptor form is rejected.
3. Module `.d.ts` emitted against 0.3.0 re-resolve under the train 2 types.

## Core prototype and corpus measurement (2026-10-04)

| File | Role |
| --- | --- |
| `prototype-schema2-core.diff.txt` | Schema-2-only Core (no schema 1 reading, the decided design) on `81063ad`: wire types, mismatch details, shape, snapshot, window rule, collector, plan output, six own declarations, emitter and the root construction witness; `pnpm core:build` green. The diff does not include the Core-local witness copy `packages/core/tests/qualification-support/support/construction-witness.mjs`: copy the root witness over it, then `construction-witness.test.mjs` passes (338 of 338) and 49 test files fail; without the copy, 50 |
| `prototype-failing-core-tests.txt` | The 49 of 88 Core test files that fail on the prototype (all 88 pass on the base) |
| `replay-lifted-corpus.mjs.txt` | Lifts the M2 corpus to schema 2 (allocation, entry lift, version lexeme rule, plan revision, oracle digest, mismatch details) and compares with the prototype's output |
| `measure-corpus.mjs.txt` | Static counts per category: eligible tokens, paths inside `compatibility`, limit diagnostics, byte deltas |

Results: 818 of 818 object outcomes and 123 of 123 raw-document outcomes equal after lifting; the 62 raw invocations
contain no tokens; no corpus diagnostic path points inside `compatibility`; under Q1 = A, 12 raw documents with
declaration versions that are not admitted integers would retire (the 12 lexemes whose projection in the
raw-document number table is `invalid-type` or `invalid-format`; the static script undercounts them because
`JSON.parse` rounds `1.0000000000000001` and `1e-400`). The static script's older retire rule also flagged 6 object
rows that carry count limits (`providersPerManySlot` and similar); the lifted replay shows their outcomes unchanged,
which is why the T2-2 retire rule is limited to byte limits. The replay harness first showed differences only
for its own artifacts (re-encoding detached, shared and invalid UTF-8 carriers, stripping a BOM, untouched version
lexemes `1.0`, `1e0`, `10e-1`, `1.0000000000000000`); each was fixed in the harness, not in Core.

## Upgrade step prototype (option D, evidence only: rejected by the owner on 2026-10-08)

| File | Role |
| --- | --- |
| `prototype-upgrade-step-core.diff.txt` | Not part of the plan. The schema-2 prototype plus `previous-declaration.ts` (overlay `DocumentView`, 142 lines), the schema 1 compatibility record shape, the projection supplement and the object/raw call sites; about 400 changed lines; `pnpm core:build` green |
| `prototype-upgrade-step-failing-core-tests.txt` | 48 of 88 Core test files fail until migrated |
| `replay-upgrade-path.mjs.txt` | Replays the corpus with schema 1 kept, tokens rewritten to `<capabilityId>/r<N>`, version 2 rewritten to 3 |
| `upgrade-equivalence.mjs.txt` | Compares the prototype with Core 0.3.0 (`BASE_DIST`) on 24 invalid schema 1 documents and 2 designed differences |

Results: 818 of 818 object and 123 of 123 raw-document outcomes equal through the production upgrade step, nothing
retired; 24 of 24 invalid schema 1 documents get the same diagnostics as in Core 0.3.0; designed differences: a
non-builder token fails at the token path, and a version-less document with schema 2 entries gets only the version
diagnostic. Projection: `['slots', 0, 'compatibility', 'token']` keeps four segments,
`['slots', 0, 'compatibility', 'min']` stops at `compatibility`, `['slots', 0, 'compatibleFrom']` stops at the slot.

The owner chose B (no reading of schema 1 anywhere) because schema 1 is the project's own pre-release format. These D
files only show that a separate upgrade step would have been feasible.
