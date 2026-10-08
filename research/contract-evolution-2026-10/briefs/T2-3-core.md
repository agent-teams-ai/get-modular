# T2-3 brief: Core 0.4.0 checks contract revision windows (stack base)

PR title: `feat(core): check contract revision windows`. Base `main`. This PR is the base of a stack: T2-4
(Assembly and conformance) targets this PR's branch, each gets its own review, T2-4 is merged into this branch, and
this PR then lands in `main` as one squash (decided on 2026-10-04 during planning).

Q1 is an owner decision (2026-10-08): Core admits only declaration schema 2; schema 1 is `schema.unsupported-version`;
the historical corpus replays through the T2-2 test-side lift. Authority: ADR-NNNN ("Replace exact compatibility
tokens with revision windows"). Read it, the T2-2 evidence (`architecture/qualification/revision-windows/*`,
`tests/qualification/support/revision-window-transform.mjs`) and `docs/qualification/compiler-engineer-handbook.md`
before editing. Where this brief and the ADR differ, stop.

This design was prototyped on `81063ad` (archived under `research/contract-evolution-2026-10/raw/sketch/`:
`prototype-schema2-core.diff.txt`, `prototype-failing-core-tests.txt`, `replay-lifted-corpus.mjs.txt`): 17 files,
about 180 changed lines; `pnpm core:build` green including the construction witness. The archived diff edits the root
witness only; copy it over the Core-local copy (`packages/core/tests/qualification-support/support/construction-witness.mjs`)
as item 9a says, then `qualification/construction-witness.test.mjs` passes (338 of 338) and 49 of 88 Core test files
fail until migrated. The class table below covers all 49. The lift reproduced the M2 corpus against the prototype:
818 of 818 object and 123 of 123 raw-document outcomes, no unliftable entry.

## Re-verify before start

1. `git fetch origin`; record `origin/main`. T2-2 is merged (`architecture/authority/revision-window-ledger.json`
   exists). Source work may start after T2-1; commit 3 needs T2-2 on `main`.
2. Train 1 is released: `packages/core/package.json` and `packages/assembly/package.json` are at 0.3.0, resources and
   conformance at 0.1.0, `.changeset/` holds no train 1 changeset (`core-0-3-0-pair`, `assembly-run-scope`,
   `assembly-authoring-builder`, `add-resources-package`, `add-conformance-package`, `node-26-compatibility`), and
   `approvedBreakingChanges` of Core and Assembly in `architecture/foundation/public-api-compatibility.yaml` are empty.
   `npm view @get-modular/core version` prints `0.3.0`. Otherwise stop: train 2 must not land on unreleased train 1
   changesets (`changeset version` would fold both trains into 0.3.0).
3. `git diff --stat 81063ad origin/main -- packages/core tests/qualification/support/construction-witness.mjs`: on
   2026-10-08 (`8fe924d`) only `packages/core/tests/package/packed-root.test.mjs` and
   `packages/core/tests/qualification-support/support/m1-packed-consumers.mjs` changed (Node 26 tooling, `2ef00da`);
   REL-1 also moves `packages/core/package.json` and `packages/core/CHANGELOG.md` (0.3.0); anything more, or a
   source change: read it and report. Main also runs every check lane on Node 24.21.0 and
   Node 26.10.0 now (30 lanes, six `check (<os>[, Node 26])` aggregates) and starts `pnpm check` with
   `lockfile:peers:check`, `runtime:policy:typecheck` and `runtime:policy:test`.
4. Inventory to compare: `git grep -c familyVersion -- packages/core` (on 2026-10-04: 11 files in `src`, 34 in
   `tests`, 1 in `self-composition`); `git grep -n compatibility -- packages/core/src packages/core/self-composition`.
5. Node per `.node-version`; `pnpm install --frozen-lockfile` in your own worktree; branch `feat/core-revision-windows`.
6. Baseline: `pnpm core:build && pnpm core:test` on the base, record time and that all 88 Core test files pass.

## Owner decisions (facts) and open questions

One monotonic line per contract id, no `/v2` ids; a provider declares `revision` and `compatibleFrom`; binding iff
`compatibleFrom <= consumer revision <= provider revision`; the consumer's revision is fixed by the version of its
contract package (an ordinary dependency); any change of `revision` or `compatibleFrom` releases a version a caret
range does not accept; raising a revision keeps every `implementationId`; Core, Assembly and conformance accept only
declaration schema 2, schema 1 is refused (`schema.unsupported-version` in Core, `assembly.bind.invalid-declaration`
in Assembly) and the historical corpus replays through a test-side lift (owner decision 2026-10-08); T2-3 and T2-4 are
stacked PRs with separate reviews that land in `main` as one squash, and train 2 lands only after train 1 is released
(decided on 2026-10-04 during planning); all `@get-modular/*` stay 0.x and a break ships as a minor with migration
notes; plugins and observation are out of scope. Open questions: none. Anything this brief does not cover: stop and
ask.

## Scope

Core source, Core tests, Core README, one changeset, and the construction witness that `pnpm core:build` runs
(`architecture/tooling/generate-core.mjs:84,141` imports it): `tests/qualification/support/construction-witness.mjs`
and its byte-identical copy `packages/core/tests/qualification-support/support/construction-witness.mjs`. Nothing in
`packages/assembly`, `packages/conformance`, `packages/resources`, `architecture/`, CI, root `tests/` other than the
witness, or docs outside `packages/core/README.md`.

Non-goals: Assembly, conformance, pair admission, API approvals (all T2-4); CMS and contract docs (T2-5); new
diagnostic codes; catalog order or ranks; immutable artifacts; the retained-evidence executors of class H.

## Changes, file by file (locate by text; line numbers are from `81063ad`)

1. `src/features/authoring/wire-types.ts`: `ModuleDeclaration.schemaVersion: 2`; provided entry
   `{ capabilityId: string; revision: number; compatibleFrom: number }`; slot
   `{ capabilityId: string; revision: number; slotId: string; cardinality: ... }`; `CompositionPlan.schemaVersion: 2`;
   plan binding `{ consumerImplementationId; slotId; providerImplementationIds; capabilityId; revision: number }`.
   `CompositionProfile` unchanged. No other exported type.
2. `src/features/authoring/diagnostic-types.ts:105-115`: mismatch details become
   `{ readonly capabilityId: string; readonly reason: "consumer-too-old" | "provider-too-old"; readonly consumerRevision: number; readonly providerRevision: number; readonly providerCompatibleFrom: number }`.
3. `src/features/input-admission/document-shape.ts` (one admission shape):
   - `const revision = integer(1, 2147483647);`
   - shapes: `provided = record({ capabilityId: portable, revision, compatibleFrom: revision })`,
     `slot = record({ slotId: local, capabilityId: portable, revision, cardinality })`, declaration shape with
     `schemaVersion: literal(2)`; the `compatibility` record shape is deleted.
   - window rule: after a provided entry passes its record check and both numbers are admitted integers,
     `compatibleFrom > revision` reports `fail("range", <path of the provided entry>)`, following `checkCardinality`
     (`many.min > many.max`, `:204-216`).
   - version dispatch (`supportedDocumentVersion`, `:244-253`): declarations admitted 2 -> the shape; any other
     admitted integer, 1 included -> `unsupported-version`; missing or not admitted -> the shape. Profiles: as today
     (only 1).
   - path projection (`schemaSafeLocalPath`) uses the schema 2 shape only. Schema 1 field names (`compatibility`,
     `family`, `familyVersion`, `token`) are unknown path tokens from now on; the `schema-safe-path` cases that project
     them are replaced by the same cases with `revision` and `compatibleFrom`.
4. `src/features/input-admission/document-snapshot.ts`: reads `revision` and `compatibleFrom`; `schemaVersion: 2`.
   Remove the `Compatibility` type and helper. No token is parsed anywhere in Core.
5. `src/features/composition-semantics/binding-record.ts:56-60`:

   ```ts
   const consumerRevision = slot.revision;
   if (consumerRevision < capability.compatibleFrom || consumerRevision > capability.revision) {
     add(Object.freeze({ code: "binding.compatibility-mismatch", phase: "binding", path,
       coordinate: providerCoordinate, details: Object.freeze({ capabilityId: slot.capabilityId,
         reason: consumerRevision < capability.compatibleFrom ? "consumer-too-old" : "provider-too-old",
         consumerRevision, providerRevision: capability.revision,
         providerCompatibleFrom: capability.compatibleFrom }) }));
   }
   ```

   Update the comments at `:53` and `:71-73` ("the slot fixes the consumer revision; a resolved provider fixes its
   window").
6. `src/features/diagnostics/collector.ts:15-20`: the mismatch details are flat; drop the special branch.
7. `src/features/composition-semantics/semantic-analysis.ts:59-64`: plan `schemaVersion: 2`; bindings
   `{ ...binding, capabilityId: slot.capabilityId, revision: slot.revision }`.
8. `src/features/plan-output/factory.ts:16-26`: snapshot `revision: binding.revision` instead of the compatibility
   record. Envelope and digest code unchanged.
9. Self-composition: the five feature declarations (`canonicalization/owned-jcs`, `composition-semantics`,
   `input-admission`, `plan-output`, `raw-scanner/owned-iterative`) plus `compiler-facade/declaration.ts`, six files,
   declare `schemaVersion: 2`, provides `revision: 1, compatibleFrom: 1`, slots `revision: 1`. Delete the `*Token`
   constants (`canonicalBytesToken` in `canonicalization/identity.ts`, `planEmissionToken`, `semanticAnalysisToken`,
   `admittedInputToken`, `rawScannerToken` in `raw-scanner/identity.ts`) and their imports.
   `self-composition/emit.ts`: replace `compatibility()`/`same()` by a revision check (integer 1..2147483647),
   provided fields `capabilityId`, `revision`, `compatibleFrom` with `compatibleFrom <= revision`, slot fields
   `slotId`, `capabilityId`, `revision`, `cardinality`, the declaration check `schemaVersion === 2`, the result check
   `plan.schemaVersion === 2` (`:109`, TypeScript rejects the old literal), binding fields with `revision`, and the
   correspondence `binding.revision === slot.revision && provided.compatibleFrom <= slot.revision && slot.revision <= provided.revision`.
   Keep every emitter error code. `tests/features/canonicalization/witness-variant/declaration.ts` likewise.
   9a. `construction-witness.mjs` (both copies, kept byte-identical): declarations `schemaVersion === 2`, provided
   `revision`/`compatibleFrom` integers with `compatibleFrom <= revision`, slots `revision`, plan `schemaVersion === 2`,
   bindings with `revision`; correspondence `binding.revision === slot.revision` and
   `provided.compatibleFrom <= slot.revision <= provided.revision`. Keep every witness error code (`compatibility`,
   `binding-correspondence`, ...).
10. `packages/core/README.md`: the examples use `schemaVersion: 2`; one paragraph after the first example: "A provided
    capability declares `revision` and `compatibleFrom`, a slot its `revision`; Core binds them when
    `compatibleFrom <= slot revision <= revision` and otherwise reports `binding.compatibility-mismatch` with a
    `reason` of `consumer-too-old` or `provider-too-old`. Declarations with `schemaVersion: 1` fail with
    `schema.unsupported-version`; rebuild them with Assembly's builder or write the schema 2 fields."
11. `.changeset/core-revision-windows.md`:

    ```markdown
    ---
    "@get-modular/core": minor
    ---

    Check contract revision windows (ADR-NNNN). Module declarations and composition plans move to `schemaVersion: 2`.

    - A provided capability is `{ capabilityId, revision, compatibleFrom }` and a slot is
      `{ slotId, capabilityId, revision, cardinality }`; the `compatibility` record is gone. Revisions are integers from
      1 to 2147483647 and `compatibleFrom <= revision`.
    - A provider is compatible iff `compatibleFrom <= slot revision <= revision`. `binding.compatibility-mismatch`
      details are `{ capabilityId, reason, consumerRevision, providerRevision, providerCompatibleFrom }` with `reason`
      `consumer-too-old` or `provider-too-old`. No diagnostic code was added or renamed.
    - Plan bindings carry the consumer `revision`. Every plan digest changes once; the digest protocol is unchanged.
    - Declarations with `schemaVersion: 1` fail with `schema.unsupported-version`, including those written by the
      Assembly 0.3.0 builder: schema 1 was the project's own pre-release format and is not carried as legacy.
      Profiles stay at `schemaVersion: 1`.

    Migration: declarations written with Assembly's builder need no source change; rebuild them with Assembly 0.4.0
    (persisted schema 1 documents are refused). Hand-written declarations replace
    `compatibility` by `revision` (plus `compatibleFrom` on provided capabilities) and use `schemaVersion: 2`. Code
    that reads `expectedCompatibility`, `actualCompatibility` or plan `bindings[].compatibility` reads the new fields.
    Hosts that keep plan digests record them again.

    Authoring surface changed: yes
    ```

## Test migration classes (commit 0 deliverable, then the rules for every later commit)

`isPortableId` everywhere below means: a string of 3 to 128 UTF-16 code units that matches the `portableId` pattern of
`architecture/contracts/v1/composition.schema.json` (Core's identity check); build it from `minLength`, `maxLength`
and `pattern`. The digest oracle is `json-canonicalize` plus SHA-256 over
`{ kind: "get-modular.plan-content", protocolVersion: 1, canonicalization: "RFC8785", hashAlgorithm: "SHA-256", plan }`,
spelled `gm-plan:v1:sha-256:<hex>`; it must reproduce the positive vector of
`architecture/contracts/v1/canonical-vectors.json` before computing anything. Transform functions are those of
T2-2 (`transformObjectCase`, `transformRawCase`, `liftDeclaration`, `liftDeclarations`, `transformExpected`).

Before commit 1, run the base suite file by file and record that these 49 files are the ones that will need work
(they fail on the prototype); put this table, with your actual counts, in the PR body. A failing file that is not in
the table, or a table file whose failure has another cause: stop and ask. Materialized inputs are never transformed or
copied; raw byte documents are the exception: T2-2 rule 9 edits their bytes, and carriers are passed by reference.
An entry that cannot be lifted is a stop with its case id and path (T2-2 rule 4), never a silent drop.

| Class | Files (under `packages/core/tests`) | Rule |
| --- | --- | --- |
| R: row-form corpus replays | `public/m2-successor` (the 818 object rows of the nine generators), `public/m2-isolation`, `qualification/m2-raw-documents-integration`, `qualification/m2-raw-invocation-integration`, `qualification/m2-carrier-mutations`, `qualification/m2-wrapper-mutations`, `qualification/m2-resource-outcomes` | Generators and recipes stay byte-identical. The test applies `transformObjectCase`/`transformRawCase` to each JSON row before the call and compares with the transformed expectation; rows in `cases.json` `retired` are skipped and the skipped set is asserted equal to it; counts are asserted exactly. Raw invocations carry no tokens (measured) and pass unchanged. |
| T: templates before materialization | `qualification/m2-object-descriptors`, `qualification/runtime-descriptor-portable`, `qualification/runtime-portable`, `qualification/runtime-p500-portable`, `qualification/runtime-semantic-portable` | Lift the JSON templates before materialization and map each expectation with `transformExpected`: the Core-local `qualification-support/m2-candidate/object-descriptor-cases.mjs` gains one optional parameter, `materializeCase(caseId, templates = { declarations: BASELINE.declarations, appended: WORLD.appendedDeclaration })` (check the real template names first); `CASES`, `BASELINE`, `WORLD` and the root mirror stay byte-identical. The M3 descriptor, invocation, semantic, runtime and P500 fixtures pass lifted templates to their materializers (including the `vm` ones). A test that observes getter calls, property attributes or prototypes keeps observing them (22 of the 68 descriptor cases expect a plan for frozen, sealed, data or accessor documents). |
| C: run-style suites, transform at the comparison site | `public/object-subject` (`qualification-support/support/object-subject-cases.mjs`, `object-resource-admission.mjs`, `object-resource-semantics.mjs`, `scale-output.mjs`), the raw part of `public/m2-successor` and of `qualification/generated-composition` (`executeM2RawCase` in `qualification-support/support/m2-packed-raw-cases.mjs`) | These suites embed their expectations (`complete(compile, input, expected)`, `executeM2RawCase`). Edit the Core-local support module so that every comparison passes the input and the expected value through the transform (object entry) or through `transformRawCase` (raw entry); JSON vectors and recipes stay unchanged. A case whose subject is a schema 1 field (for example the `provided-token`, `slot-token` and `family` cases of `object-resource-admission.mjs`) is replaced by the matching schema 2 field case and listed in the PR body. These suites never retire a case; one that cannot be transformed: stop. |
| V: feature tests over v1 vectors or boundary materializers | `features/composition-semantics/{bindings,duplicate-records,module,partial-resource-selection,scale-integration,semantic-analysis}`, `features/input-admission/{document-reader,document-shape,document-snapshot,identity-format,module,object-admission,object-resource-coverage,raw-admission,raw-document,raw-module,schema-diagnostic,schema-safe-path}`, `features/plan-output/output`, `features/diagnostics/diagnostics`, `features/compiler-facade/{facade,raw-facade}` | Wrap each vector or materialized input as `{ caseId, input, expected }` and apply the transform. Tests of ports after admission (semantics including `duplicate-records`, which calls `createDeclarationCensus` and `validateSelectedBindings`, plan output, facade internals) take `liftDeclaration` inputs, because those ports receive the admitted model. A case whose subject is a schema 1 field is replaced by the matching schema 2 field case (missing, wrong type, out of range, unknown member). Mismatch-detail snapshots (`diagnostics`) take the new details. Byte-limit boundary fixtures of `resource-profile-v2.mjs` (`rawDocumentBytes`, `aggregateRawBytes`, `aggregateStringBytes`, `identifierBytes`) are checked with the independent meter after the lift: a case that leaves its boundary is re-padded in the materializer, never by editing the immutable vector. |
| S: self-composition and own declarations | `qualification/{own-profile,emitter,emitter-growth,generated-variant,canonicalizer-replacement}`, `qualification/generated-composition` (own-plan part), `package/generated-javascript-closure`, `features/canonicalization/owned-jcs`, `features/raw-scanner/scanner`, `features/authoring/types` | Expectations follow the new own declarations (revision 1, schema 2). Own plan digests are recomputed with the oracle and re-pinned with a comment naming ADR-NNNN. Emitter growth fixtures generate schema 2 declarations. The type fixtures of `authoring/types` take the new wire and detail types. |
| L: hand-written literals and packed consumers | `package/static-consumer` (`qualification-support/support/static-consumer-source.mjs`), `package/packed-root` (`support/m1-packed-consumers.mjs`, `m1-declarations-closure.mjs`, `m1-javascript-closure.mjs`), `package/ordinary-retained-results` (literal declaration; `support/scale-output.mjs` `expectedP500Plan`, `p500Digest`), `public/m2-ordered-many` (two pinned digests), plus the passing files with stale literals `features/composition-semantics/censuses`, `package/declarations-closure`, `qualification/construction-witness` | Rewrite through `wire.mjs`. A `schemaVersion: 2` that forced `unsupported-version` becomes `3`. Pinned plan digests are recomputed with the oracle, never copied from Core output, and re-pinned with a comment naming ADR-NNNN. |
| H: retained evidence, unchanged | `qualification-support/m1-retained-session.mjs`, `qualification-support/m3-*.mjs` (their `package/m3-*.test.mjs` pass unchanged), root `tests/qualification/{m1-*,m3-*}.mjs` and `tests/qualification/support/*` except the construction witness, the manual workflow `.github/workflows/m3-runtime-matrix.yml` | Unchanged. Record in the PR body that they qualify 0.3.x and that `m3-runtime-matrix.yml` is not run against 0.4.0 until a separate decision. |

Counts per class on the prototype: R 7, T 5, C 1, V 22, S 10, L 4 (49); `public/m2-successor` and
`qualification/generated-composition` also carry class C parts.

`tests/qualification-support/support/wire.mjs` (new): `provided(capabilityId, revision, compatibleFrom = revision)`,
`slot(slotId, capabilityId, revision, cardinality)`, `declaration({ ... })` with `schemaVersion: 2`.
`tests/qualification-support/support/revision-window-transform.mjs`: a byte-identical copy of
`tests/qualification/support/revision-window-transform.mjs`; a test asserts its SHA-256 equals the
`GM-REVISION-WINDOW-TRANSFORM` digest of the ledger (read with `loadRepoJson`).
`tests/public/revision-window-successor.test.mjs` (new): for `production` (`dist`) and `direct` (`dist-stage0`), object
and raw entries, every authored case of `cases.json` equals its expected result.

Focused unit tests only where risk is: window rule (both bounds, both reasons, `compatibleFrom = revision`); version
dispatch (1, 2, 3, missing, `1.5`); path projection of schema 2 field names and of the now unknown schema 1 names;
collector copy of the new details.

## Commits and gates

Every CI lane runs `assembly:build` and `conformance:build` first, so all 30 lanes (Node 24.21.0 and Node 26.10.0 on
Ubuntu, macOS and Windows) and the six aggregates fail on this branch until T2-4 is merged into it; CI gives no Core
signal here. Record local gates with exit codes and timings in the PR body; the first
CI evidence is the whole stack after T2-4.

Each commit: `pnpm core:build` (it runs the construction witness) and `pnpm core:typecheck:prepared` exit 0, plus:

1. `feat(core): admit revision windows in module declarations` - items 1-9a and the focused unit tests.
   Gate: `node --test` over the focused files.
2. `test(core): migrate literal and self-composition tests to schema 2` - `wire.mjs`, classes L and S.
   Gate: `node --test` over the class L and S files.
3. `test(core): replay historical qualification through the revision-window transform` - transform copy, classes R,
   T, C and V, authored cases. Gates: `pnpm core:test`, `pnpm contracts:check`, `pnpm contracts:test`,
   `pnpm qualification:v1-diagnostics-protocol`, `pnpm qualification:v1-graph-semantics`,
   `pnpm qualification:resource-profile`, `pnpm qualification:self-composition-templates`, `pnpm governance:check`,
   `pnpm governance:test`, all exit 0. Record `core:test` time against the baseline.
4. `docs(core): describe revision windows and the 0.4.0 changeset` - items 10 and 11. Gate: `pnpm docs:protocol:check`.

After T2-4 is merged into this branch, commit nothing new; run
`GIT_CONFIG_GLOBAL=<file with only a [user] section> pnpm check` (create it with
`printf '[user]\n\tname = %s\n\temail = %s\n' "$(git config user.name)" "$(git config user.email)" > <tmp>/gitconfig-nohooks`),
exit 0, then CI green on all 30 lanes and six aggregates, each lane under 810 s (slowest lane on `8fe924d`: 611 s,
windows static).

PR body: the class table with counts, replay counts per category, retired counts per reason, the replaced schema 1
field cases,
`core:test` time before and after, the CI note above, and "lands together with T2-4".

## Risks and stop conditions

| Risk | Stop / action |
| --- | --- |
| train 1 not released (re-verify step 2) | stop |
| a Core test fails outside the class table, or for another reason than its class | stop and report |
| a historical row fails replay and is not in `retired` | stop; never edit expectations by hand, never extend the transform here (T2-2 owns it) |
| an entry cannot be lifted | stop with the case id and path; never drop it |
| a class T test would need a copied or re-created materialized input | stop; lift the templates instead |
| a byte-limit boundary fixture leaves its boundary and cannot be re-padded in the materializer | stop and report |
| `core:test` grows by more than 30% or a lane passes 810 s | stop and report |
| a gate needs weakening | stop |

## Must not

- Touch immutable artifacts or ledgers, the T2-2 transform (only copy it), the catalog order, `DiagnosticCode`, the
  class H executors.
- Add exports to Core (ADR-0009 export set is closed). Use a `V<digit>` suffix in any identifier. Read or upgrade
  schema 1 anywhere in Core.
- Merge this PR alone. Merge, request reviewers or comment outside the own PRs. Override the git identity, add
  co-author trailers or tool attribution.

## Done

Core implements the ADR; every Core gate green; replay and authored cases pass on both subjects and both entries;
changeset present; T2-4 merged into the branch and the complete gate green on all 30 lanes.

## Review checklist

- Diffs of `binding-record.ts`, `document-shape.ts`, `document-snapshot.ts`, `semantic-analysis.ts`,
  `plan-output/factory.ts`, `emit.ts` and the witness against the ADR sections "Wire generation", "Compatibility rule",
  "Diagnostics", "Schema 1 declarations", "Plan and digest".
- `git grep -n "familyVersion\|compatibility" -- packages/core/src packages/core/self-composition` returns only the
  `binding.compatibility-mismatch` code; `cmp` of the two witness copies and of the two transform copies exits 0;
  `packages/core/src/index.ts` is unchanged.
- The class table in the PR body lists 49 files plus the three hygiene files, each with one class; class T tests
  still assert `getterCalls() === 0` and the descriptor attributes.
- The replay test asserts exact counts and the exact retired set; no immutable file changed
  (`git diff origin/main -- architecture/qualification architecture/contracts` empty).
- Mutation spot-checks (local, then revert), each must make `pnpm core:test` fail:
  1. `binding-record.ts`: `<` to `<=` in `consumerRevision < capability.compatibleFrom`;
  2. swap the two `reason` strings;
  3. admit `schemaVersion: 1` in the version dispatch;
  4. in the snapshot, read `compatibleFrom` from `revision`;
  5. emit `schemaVersion: 1` in the plan;
  6. accept a provided entry with `compatibleFrom > revision`.
