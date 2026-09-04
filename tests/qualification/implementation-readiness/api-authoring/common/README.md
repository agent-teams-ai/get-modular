# Common API authoring qualification lab

This disposable comparison is non-authoritative, qualification-only, and not
production code. It compares an inert descriptor object, typed `defineModule`,
and a separate inert declaration plus typed activation factory against one
immutable 30-scenario corpus and one independent deterministic oracle.

Run from the repository root:

```sh
node node_modules/typescript/bin/tsc -p tests/qualification/implementation-readiness/api-authoring/common/tsconfig.json
node tests/qualification/implementation-readiness/api-authoring/common/run.mjs
```

The first command emits JavaScript and `.d.ts` files for every candidate plus
compile-time positive and negative probes. The runner executes 90 candidate ×
scenario cells, checks corpus identity, inertness, hostile keys, discovery
imports, fallback and permutation behavior, generates 10/100/1000 declaration
type-scale probes only below the OS temporary directory, and removes them.
Machine-readable JSON is printed and written to `dist/result-summary.json`.
The reviewed research handoff retains a generated copy at
`research/implementation-readiness/evidence/api-authoring-exact-run.json`;
the adjacent `api-authoring-execution.json` binds its result hash, committed
inputs, toolchain identity, emitted declarations and command outcome. This is
coordinator-observed execution, not a signed attestation or contract conformance.

After committing executable inputs, capture once to a new external directory:

```sh
node tests/qualification/implementation-readiness/api-authoring/common/execution-capture.mjs --capture /tmp/gm-api-observation
node tests/qualification/implementation-readiness/api-authoring/common/execution-capture.mjs --verify research/implementation-readiness/evidence/api-authoring-execution.json research/implementation-readiness/evidence/api-authoring-exact-run.json
node --test tests/qualification/implementation-readiness/api-authoring/common/execution-capture.test.mjs
node --test tests/qualification/implementation-readiness/api-authoring/common/authoring-edits.test.mjs
```

The coordinator retains both output files together in a later evidence commit.
Verification permits that later commit only when all executable input hashes
and the complete input set still match the captured source commit. Result hash
verification does not certify a compiler or repeat a timing measurement.

Metrics use the same nonblank/non-comment LOC rule. Marked authoring/glue
regions are supplemented with all remaining candidate source and the split
association file; `totalSupportLoc` includes helpers and translation code.
Shared oracle/types/runner code is excluded from this candidate-specific ratio,
which is not a product generic-glue percentage. Declaration measures use emitted
`.d.ts` bytes. File and edit counts now come from six generated before/after
source experiments per candidate, each starting with ten declarations. Every
source tree is compiled and its emitted input compared with the intended input;
the oracle then checks actual outcomes. Git numstat with fixed diff options counts
changed lines; file hashes and binding-record coordinates identify changed loci.
The identical feature-local layout has declaration/factory files, an explicit
catalog, a complete profile and separate test-Host desired state. Support and
fixed test entrypoints do not count as author edits. These are measured synthetic
edits, not product measurements or human task times; no runtime construction,
cleanup or loader-regeneration cost is included in them. Desired-state filtering is
performed by an explicit test-Host before the oracle, which rejects a raw desired
profile. This is a fixture policy, not a production desired-state contract. Split factories
are associated and exercised only in the two host probes, with mismatched ID
rejection and compile-time dependency checks. Split scale probes emit both
metadata/ref and factory files; other candidates emit declarations only.
Compile duration is an observation, not a threshold or an equal-workload ranking.
The catalog permits alternate implementations of a module; repeated selections
are rejected, and either individual alternative is tested. Semantic code names
come from the pinned accepted catalog, but diagnostic payloads and normalized
capability fields are deliberately simplified. S19 distinguishes valid SlotIds
from arbitrary hostile record keys using the pinned grammar. None of these
checks replaces the future full wire, comparator, SCC or resource conformance.
Tree-shaking and runtime performance are `not-measured` because this lab has no
pinned bundler and no production runtime subject.
