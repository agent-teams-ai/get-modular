# Train 2: contract revision windows (Core and Assembly 0.4.0) - plan index

Status: deferred by the owner on 2026-10-10. While Get Modular is used only by our own projects, a contract changes in place: the provider and all consumers are updated in the same change (the 0.3.0 exact-revision scheme), with a short changelog note. Per-capability revision windows return when separately built plugins appear. The 0.3.0 descriptor call form already means a window of one revision, so adopting windows later is additive for module authors. This plan stays as the design for that moment.

Status: planned, not started. Written 2026-10-04 against get-modular `main` `81063ad` (#142); revised 2026-10-08 after
an independent review, two re-checks, prototype measurements and the owner's decision on Q1 (schema 1 is refused).
Drift up to `8fe924d` is noted in section 1. Train 2 starts
after train 1 is released and Agent Runtime has migrated to it (owner decision). Every brief starts with a
"Re-verify before start" section; `main` moves within days.

This index replaces the 2026-10-02 staging plan "Train 2: contract evolution" as the working document. That plan
stays as background (archived by T2-0 under `raw/`); where they differ, this index and the briefs win.

Files:

| File | What |
| --- | --- |
| `index.md` | this page: verified state, delta to the staging plan, decisions, PR set, placement |
| `T2-0-briefs-into-get-modular.md` | docs PR that lands this plan in get-modular (not archived itself) |
| `T2-1-adr.md` | the train 2 ADR, full text, accepted through `pnpm docs:new` |
| `T2-2-qualification-successor.md` | pinned successor evidence: schema, catalog, contract, transform, cases, ledger, checker |
| `T2-3-core.md` | Core 0.4.0 (stack base, lands together with T2-4) |
| `T2-4-assembly-conformance.md` | Assembly 0.4.0 types and runtime, conformance 0.2.0 (stacked on T2-3) |
| `T2-5-standard-and-docs.md` | Consumer Module Standard for 0.4.0, contract docs, guide, quickstart, pins, rehearsal |
| `REL-2-release.md` | release PR for Core/Assembly 0.4.0 and conformance 0.2.0 |
| `sketch/` | the re-verified type sketch and its measurements (`sketch/RESULTS.md`), the schema-2 Core prototype and the upgrade-step prototype (diffs, failing-test lists), the corpus replay and equivalence scripts |

## 1. Verified state of `main` (81063ad)

- Core is unchanged since `0023106` (the staging plan's base): `git diff --stat 0023106 81063ad -- packages/core`
  is empty. Compatibility is exact-token only: `packages/core/src/features/composition-semantics/binding-record.ts:56`
  `capability.compatibility.token !== slot.compatibility.token`.
- Assembly builder (#137): `packages/assembly/src/features/construction/contract.ts` is the only place that spells the
  wire: `SCHEMA_VERSION = 1` (`:7`), `MAXIMUM_REVISION = 2147483647` (`:10`, checked at `:29`), token
  `` `${id}/r${revision}` `` (`:33`). Types in `types.ts`: `CapabilityContract<Value, Token>` (`:3-6`),
  `ProvidedEntry<Id, Rev>` and `SlotEntry<Id, Rev, S, K>` with an inline compatibility record (`:19-33`; there is no
  `ContractCompatibility` type at all), `Contract<Id, V, Rev>` (`:35-42`), `CapabilitiesOf` keyed by capability id
  (`:48-51`), `UsedCapability`/`CapabilityBrand`/`KnownCapabilities` (`:68-76`, `:168-172`).
- Conformance (#141) depends on the wire generation in three places:
  `packages/conformance/src/features/suites/suite.ts:53-63` (`runContractSuite` requires the subject to provide
  exactly `contract.provide()`; message reads `compatibility.token`), `src/features/harness/isolate.ts:73-76,86-89`
  (fake providers spell `kind`, `schemaVersion: 1` and copy the slot's `compatibility`), and
  `src/features/suites/types.ts:8` (`ContractValue<T> = CapabilitiesOf<T>[T["id"]]["value"]` indexes a map by id).
- `familyVersion` occurs in 110 tracked files (260 occurrences); 15 of them are the research archive. New since the
  staging inventory: `contract.ts`, `tests/assembly/builder-types.ts`, `tests/assembly/builder.test.mjs`,
  `tests/resources/assembly-scope.test.mjs`; `packages/assembly/examples/basic-host.mjs` no longer has one.
- Both diagnostic catalogs carry the mismatch detail fields:
  `architecture/contracts/v1/diagnostic-catalog.json` and
  `architecture/qualification/generation-two/catalog.json` `detailPolicy["binding.compatibility-mismatch"] =
  ["expectedCompatibility", "actualCompatibility"]`.
- Pair admission: `architecture/checks/assembly-admission.mjs:43-54` (`ASSEMBLY_PAIR_DECISIONS` 0.2.0, 0.3.0) and
  `architecture/checks/production-artifacts.mjs:233,255` (`PUBLIC_ASSEMBLY_VERSIONS`). Tests assert that 0.4.0 is
  rejected today: `tests/assembly-admission.test.mjs:622` and `tests/feature-module-standard-profile.test.mjs:915`
  (`tests/assembly-admission.test.mjs:654` only mutates ADR-0031 bytes and stays green).
- Current CMS digest literal: only `tests/ownership-checkpoint.test.mjs:156`
  (`49d08b6d...7ba7`). `architecture/checks/sdk-growth.mjs:23` pins retained P0 bytes read from an accepted commit and
  does not follow the working tree.
- Accepted ADR bytes are immutable: `tests/ownership-checkpoint.test.mjs:80-84` compares every ADR present at the
  checkpoint base byte for byte. Supersession is written in the new ADR only.
- CI on `81063ad` (run 37199039142): 15 lanes, 15 min timeout each. Since `2ef00da` every lane also runs on Node
  26.10.0: 30 lanes and six `check (<os>[, Node 26])` aggregates; installs use `--engine-strict
  --strict-peer-dependencies` and `pnpm check` starts with `lockfile:peers:check`, `runtime:policy:typecheck`,
  `runtime:policy:test`. Slowest lanes on `8fe924d` (run 37713349145): 611 s (windows static), 530 s (windows core),
  528 s (windows Node 26 core), 527 s (windows packaging).
- Drift `81063ad..8fe924d` (`2ef00da`, `28dcb49`, `8fe924d`): Node 26 tooling and CI lanes, `AGENTS.md` gate order,
  `current-contract.md` and `mvp-implementation-roadmap.md` prose (the T2-5 quotes are still present),
  `tests/feature-module-standard-profile.test.mjs` (the 0.3.0 version loop is now at `:943`, the rejected 0.4.0
  probe at `:951`), `packages/core/tests/package/packed-root.test.mjs` and its `m1-packed-consumers.mjs`. Core and
  Assembly sources, the CMS and the admission checks are unchanged.
- Agent Runtime `main` `0ace1cce` is still on Core/Assembly 0.2.x with hand-written tokens
  (`packages/apps/embedded-runtime/src/composition/runtime-setup-assembly.ts:34`,
  `.../ordinary-session-runtime/composition/ordinary-runtime-assembly.ts:7`,
  `.../tests/package/runtime-setup-assembly.types.ts:31`, `scripts/architecture/ordinary-composition-evidence.mjs:45`).
  It does not call `compileCompositionJson` and stores no plan digests. AR-1b moves it to descriptors before train 2.
- Type sketch re-verified on TypeScript 7.0.2 and 5.8.3 (`sketch/RESULTS.md`): flat `${id}@${revision}` keys, the
  `Earlier` type parameter, window intersection for providers, unchanged handle brand; 9/9 negative fixtures fire
  on the guarded line on both compilers; module `.d.ts` emitted against 0.3.0 still bind and prepare. The
  distributive `CapabilitiesOf` of the staging sketch reaches **TS2589 on TypeScript 7.0.2** at 500 handles with
  windows; a key-remapped `CapabilitiesOf` passes 1000 windowed handles in 2.7 s (7.0.2) and 7.0 s (5.8.3), faster
  than 0.3.0 on `main` (5.2 s and 13.9 s at 1000 handles).

### 1a. Prototype and corpus measurement (2026-10-04)

- A schema-2-only Core was built in a disposable copy (`sketch/prototype-schema2-core.diff.txt`: 17 files, about 180
  changed lines; `pnpm core:build` green after editing the construction witness and `emit.ts`). The archived diff
  edits the root witness only; with the Core-local copy synced, `construction-witness.test.mjs` passes (338 of 338).
- All 88 Core test files pass on the base; 49 fail on the prototype (`sketch/prototype-failing-core-tests.txt`; 50
  if the Core-local witness copy is not synced).
  Root `contracts:test`, `qualification:*` and the `sdk-growth` packed-consumer check do not execute Core wire data.
- Lifted replay (`sketch/replay-lifted-corpus.mjs.txt`): 818 of 818 M2 object outcomes and 123 of 123 raw-document
  outcomes equal their transformed expectations against the prototype. 0 of 62 raw invocations contain tokens.
- Static measure (`sketch/measure-corpus.mjs.txt`): no expected diagnostic in these corpora has a path inside
  `compatibility`. Not measured: the descriptor, M3 runtime, object-subject and v1-vector suites; they use the same lift
  through their templates or comparison sites (T2-3 classes T, C and V).
- `tests/qualification/compiler-engineer/examples.json` (13 of 16 cases with tokens) is checked by an independent
  oracle in `contracts:test`, not by Core; it does not change.

### 1b. Evidence only: the upgrade-step prototype (option D, rejected by the owner)

Before the owner's final answer, a separate Core upgrade step (schema 1 presented as schema 2 before one-shape
admission) was prototyped on the same base: about 400 changed lines in 18 files including a 142-line overlay
`DocumentView`; the M2 corpus replayed through it (818 of 818, 123 of 123) and 24 of 24 invalid schema 1 documents
kept their 0.3.0 diagnostics. It was feasible; the owner rejected it because schema 1 is the project's own
pre-release format and the project carries no legacy at this stage. The files `sketch/prototype-upgrade-step-*`,
`replay-upgrade-path.mjs.txt` and `upgrade-equivalence.mjs.txt` are kept as evidence only and are not part of the
plan.

## 2. Delta to the staging plan

| # | Staging plan (2026-10-02) | Now | Correction |
| --- | --- | --- | --- |
| D1 | `checkNamespaces` lives in conformance (lines 21-22, 311, 471) | cut on 2026-10-02 (late); plugins track | ADR drops it; namespace rules stay in the CMS section "Identity and namespaces" |
| D2 | plugin requirements in the ADR (lines 23-26, 111-114, 285, 380-382) | owner amendment (staging lines 612-614): no plugin requirements in train 2 | ADR speaks of independently released module packages; plugins appear only in the short "Plugin readiness" note (open items for the plugins track), nothing else about plugins |
| D3 | train 1 seams S1-S12 open (section 3) | S1, S2 (by shape), S3, S4, S6, S7, S8 (plan), S9, S10 done on `main`. S5 and S11 not done | train 2 does S5 (CMS rule: maps only via `CapabilitiesOf`, import port types, never index a map by id) and S11 (Assembly fixtures through descriptors where the literal is not the subject) |
| D4 | conformance not in scope (did not exist) | conformance spells the wire (section 1) and ADR-0033 requires a conformance minor for every peer minor | T2-4 changes conformance; conformance 0.2.0 ships with its own minor changeset |
| D5 | gen-2 catalog "reused by digest" (2.2, ADR text "Qualification") | both catalogs name the old mismatch detail fields | successor copies `catalog.json` with only that `detailPolicy` entry replaced; codes, ranks, phases, order unchanged |
| D6 | distributive `CapabilitiesOf` (ADR sketch lines 258-259) | TS2589 on 7.0.2 with windows at 500 handles (measured) | key-remapped `CapabilitiesOf` (T2-4 gives the exact type) |
| D7 | `pnpm exec docs-protocol new ... --type adr --title ...` without `--id`; "ADR-0033 is reserved" | the ADR profile requires explicit `--id`; ADR-0033 is the conformance kit | `pnpm docs:new --type adr --id ADR-NNNN ...`; NNNN is the next free number (0034 unless the observation track took it) |
| D8 | inventory 107 files | 110 files, 260 occurrences | numbers in section 1; T2-3/T2-4 re-run the inventory |
| D9 | N-1 inside the shape check, also in Assembly's runtime (Q5) | schema 1 is the project's own pre-release format | owner decision 2026-10-08: no N-1; Core, Assembly and conformance accept schema 2 only; the corpus replays through a test-side lift |
| D10 | pair admission "adds a row" (S9) | also `PUBLIC_ASSEMBLY_VERSIONS` and two tests that assert 0.4.0 is rejected (`tests/assembly-admission.test.mjs:622`, `tests/feature-module-standard-profile.test.mjs:915`; `:654` mutates ADR-0031 bytes and stays) | T2-4 step A6 lists every edit; "rejected" probes move to 0.5.0 |
| D11 | CMS pins in `ownership-checkpoint.test.mjs` and `CMS_SHA256` in `sdk-growth.mjs` | only the ownership-checkpoint literal follows the working tree | T2-5 updates that literal only; AR and TEST move their own pins |
| D12 | CI single job, 90% rule | five lanes per OS since `4b56072` | new contract tests are appended to the existing `contracts:test` script (static lane); no lane-test change; stop at 810 s per lane |
| D13 | Core and Assembly as separately mergeable PRs (2.4) | a Core wire-type change breaks Assembly types and runtime and conformance in the same `pnpm check` | T2-3 and T2-4 are stacked and land as one squash (Q2, decided A) |
| D14 | transform rules in prose | needs a deterministic token-to-revision rule, raw-document handling and a boundary-sensitivity retirement rule | T2-2 specifies all three |
| D15 | Core public API "unchanged export set" | true, but Core's `.d.ts` changes | Core gets its first `approvedBreakingChanges` entry under the train 2 ADR |
| D16 | 10-14 days | conformance, stacking, the measured 49-file test migration and review rounds added | 12-15 days of implementation (section 4) |
| D17 | sketch in a session scratch directory | lost | rebuilt in `sketch/`, archived by T2-0 |
| D18 | Assembly README "hand-written maps and literal Core declarations remain valid in 0.3.0" (`packages/assembly/README.md:20-22`) | still the README text | 0.4.0 typed binding accepts descriptor entries only; migration note in the changeset |
| D19 | not covered | `pnpm core:build` runs the root construction witness (`architecture/tooling/generate-core.mjs:84,141`), which checks schema 1 (`tests/qualification/support/construction-witness.mjs:354,499,524-535`); `self-composition/emit.ts:109` checks `plan.schemaVersion === 1` | T2-3 item 9 and 9a edit both witness copies and the emitter (verified on the prototype: build green) |
| D20 | "Core reads schema 1" with paths "as supplied" | schema 1 is refused, so projection knows schema 2 names only | `schema-safe-path` cases with schema 1 names are replaced by schema 2 names (T2-3) |
| D21 | "54 Core test files" counted statically | prototype: 49 of 88 Core test files fail until migrated | T2-3 assigns each of the 49 (plus three hygiene files) to one migration class (R, T, C, V, S, L) with one rule; materialized inputs are never transformed, run-style suites are transformed at the comparison site |
| D22 | "no new exports" | Foundation 1.7.2 runs API Extractor with `ae-forgotten-export` as an error; non-exported helpers fail `foundation:check` | Assembly exports six helper types (`ContractSpec`, `ValuesOf`, `RevisionPairs`, `EntryKeys`, `ValueAt`, `ValuesAll`) as part of the 0.4.0 API (decided on 2026-10-04 during planning) |
| D23 | train 2 "after train 1" without a check | pending 0.3.0 changesets would fold both trains into one 0.3.0 | hard stop in every code brief until train 1 (0.3.0) is released (decided on 2026-10-04 during planning) |
| D24 | historical `schemaVersion: 2` inputs | 11 raw documents use version 2 to force `unsupported-version` | transform rewrites their version lexeme 2 -> 3 (same length) instead of retiring them |

## 3. Decisions

### 3.1 Decisions already taken (facts for every brief)

1. One monotonic line per contract id; no `/v2` ids.
2. A provider declares `revision` and `compatibleFrom`. A consumer's revision is fixed by the version of the contract
   package it depends on (an ordinary dependency, never a peer).
3. Binding is allowed iff `compatibleFrom <= consumer revision <= provider revision`.
4. Any change of `revision` or `compatibleFrom` releases a contract package version that a caret range does not
   accept: a new minor while 0.x, a new major from 1.0.
5. Catalog codes are not renamed. The earlier decision that Core reads the previous declaration schema (N-1) is
   withdrawn by the owner decision of 2026-10-08 (Q1).
6. Types per revision; authors never write wire records.
7. Raising a contract revision keeps every `implementationId` that uses it.
8. Breaking changes are allowed; all `@get-modular/*` stay 0.x; a break ships as a minor with changelog and migration
   notes; no compatibility shims.
9. Out of scope: plugins and everything for them (`checkNamespaces`, grants, isolation), hooks/observation.
10. Train 2 starts right after train 1 and the Agent Runtime migration; final owner decisions before start.
11. Train 2 code lands only after train 1 is released (REL-1 merged, 0.3.0 published, no train 1 changeset left);
    every code brief stops otherwise (decided on 2026-10-04 during planning).
12. T2-3 and T2-4 are stacked PRs with separate reviews and land in `main` as one squash (decided on 2026-10-04 during
    planning, Q2).
13. Assembly 0.4.0 exports the six helper types API Extractor needs (decided on 2026-10-04 during planning).
14. Release mechanics (owner, 2026-10-08, standing rule for every REL): no force push and no deletion of
    `changeset-release/main`, which stays at the previous release's final head after its squash merge; the next REL
    starts detached at `origin/main` with `git merge -s ours` of that head (tree equal to `main`, second parent that
    head), adds the release commit and pushes plainly (a rejected push is a stop); when `main` moves, a merge update
    if no release input changed, otherwise a verified tree-replacement commit (`git commit-tree "${FRESH}^{tree}" -p
    "${OLD}" -p origin/main`); REL stays open, archives are packed from its final head after review and CI, and the
    owner merges it (squash, explicit subject and body, no `--delete-branch`) after signing off the consumer checks.
15. Plugins are postponed, not cancelled (owner, 2026-10-08): the ADR's "Plugin readiness" note lists as open items of
    the plugins track the declaration compatibility policy for plugins (for example upgrade steps between schema
    generations, or a commitment at Get Modular 1.0) and the stability of the plugin-facing authoring API under 0.x
    caret peer ranges.
16. Q1 (owner decision 2026-10-08): Core, Assembly and conformance accept only declaration schema 2; schema 1 is
    `schema.unsupported-version` in Core and `assembly.bind.invalid-declaration` in Assembly; the historical corpus
    replays through a test-side lift; the ADR withdraws decision 5 and ADR-0032's promise of a previous-schema decoder.

### 3.2 Resolved by this plan (reliability / confidence)

| # | Decision | Why | R / C |
| --- | --- | --- | --- |
| R1 | Capability map keys are `` `${id}@${revision}` ``; `CapabilitiesOf` is one key-remapped mapped type over revision pairs | handle brand of ADR-0032 unchanged; measured (section 1) | 9 / 8 |
| R2 | `defineContract<Value, Earlier = {}>()({ id, revision, compatibleFrom? })`; `compatibleFrom` defaults to `revision`; `Earlier` is a type literal (an interface is rejected with TS2344) | additive over 0.3.0 descriptors and `.d.ts`; the descriptor alternative (`earlier: [Db3, Db4]`) is about 3x slower at 1000 handles and adds runtime surface | 8 / 8 |
| R3 | `Earlier` lists exactly the revisions from `compatibleFrom` to `revision - 1`; a gap fails closed at Host preparation; extra lower keys are dropped by the owner (documented in the CMS) | a type-level range check over 31-bit numbers is not feasible; both failure modes are fail-closed in Core | 7 / 8 |
| R4 | `CapabilityContract<Value>`; typed `bindFactory`/`bindInput` accept only descriptor entries; runtime binding checks shape only | maps and declarations come only from descriptors (S5) | 8 / 8 |
| R5 | Mismatch details `{ capabilityId, reason, consumerRevision, providerRevision, providerCompatibleFrom }` | a Host can say which side to update without arithmetic | 8 / 8 |
| R6 | Plan bindings record the consumer `revision` only; profiles stay schema 1; digest protocol unchanged | no consumer for provider revisions | 8 / 8 |
| R7 | Delta successor: pinned lift transform plus authored cases, one ledger, no retained capture | ADR-0009 requires a successor ledger; measured: the lift replays the M2 corpus (818 object and 123 raw-document outcomes) with nothing retired and no unliftable entry | 8 / 8 |
| R8 | Conformance: window check in `runContractSuite`, fakes through `defineContract`/`declareModule`, `ContractValue` by conditional extraction, conformance 0.2.0 | conformance stops spelling the wire | 8 / 8 |
| R9 | Resources and lifecycle-kernel unchanged, no release | no dependency on the changed surface | 9 / 9 |
| R10 | No new gate for "contract package is a dependency, not a peer" | CMS rule; the check would not pay for itself now | 7 / 7 |
| R12 | Migration notes in changesets plus an "Upgrading from 0.3" README section; no `MIGRATION.md` | ADR-0009 requires it only after an outside consumer | 8 / 8 |
| R13 | Briefs live in get-modular `research/contract-evolution-2026-10/` (section 5) | precedent; ADR/OD are the only `docs:new` types | 8 / 8 |
| R15 | The transform rewrites historical `schemaVersion: 2` inputs to 3 (one digit, same length) | keeps the collector and unsupported-version cases instead of retiring them | 8 / 8 |
| R16 | A contract package lists Get Modular in `peerDependencies`; a Get Modular minor that changes the authoring surface re-releases every contract line in use (ADR and CMS say so) | descriptors are created by the one installed Assembly; windows work within one Get Modular minor | 8 / 7 |

(R11, the schema 1 removal bound, became moot: schema 1 is not read at all.)

### 3.3 Q1 and Q2 (decided)

**Q1 (owner decision 2026-10-08: B).** Core, Assembly and conformance accept only declaration schema 2; schema 1 is
`schema.unsupported-version` in Core and `assembly.bind.invalid-declaration` in Assembly; the historical corpus replays
through the test-side lift of T2-2. The owner's reason: schema 1 is the project's own pre-release declaration format;
the packages are being built now, so do it right once instead of supporting legacy versions.

Record of the choice. At this MVP stage the project carries no compatibility shims (ADR-0009). The lift reproduced the
M2 corpus without N-1 (818 of 818 object and 123 of 123 raw-document outcomes, no unliftable entry), so replay needs
no reader for schema 1 in Core. A (schema 1 inside the shape check) and C (also in Assembly's runtime) would add
admission forms nobody produces. D (a separate upgrade step) was prototyped and is feasible (section 1b), but it would
carry the same legacy format; the owner rejected it. B is also the cheapest: about 1-1.5 days less than A or D. The
ADR withdraws decision 5 and ADR-0032's promise of a previous-schema decoder with this reason, and its "Plugin
readiness" note leaves the declaration compatibility policy for plugins to the plugins track.

**Q2 (decided on 2026-10-04 during planning: A). How does the atomic wire break land?** Core's public wire types are used by
Assembly and conformance, so `pnpm check` is green only when Core, Assembly and conformance change together (D13).
Stacked PRs: T2-3 (Core) targets `main`; T2-4 (Assembly and conformance) targets the T2-3 branch; each gets its own
independent review; T2-4 is merged into the T2-3 branch when clean; T2-3 is reviewed once more as a whole, goes green
and is squash-merged with `--match-head-commit`. Consequence the owner should know: every CI lane builds Assembly
first, so the T2-3 PR alone is red in all 30 lanes and its reviewer works from local evidence; the first CI signal is
the whole stack. Rejected: one 3-4k-line PR (7/8), a long-lived `train-2` branch (6/6).

## 4. PR set, dependencies and size

| PR | Title | Needs | Size (approx.) | Days |
| --- | --- | --- | --- | --- |
| T2-0 | `docs(research): add the contract revision window train plan` | Q1 and Q2 recorded (done) | ~3k lines Markdown + sketch `.txt` | 0.5 |
| T2-1 | `docs(architecture): accept ADR-NNNN for contract revision windows` | owner approval of the ADR text | ADR ~220 lines, registry, index, checkpoint pin | 0.5 + owner |
| T2-2 | `feat(qualification): add the revision-window successor evidence` | T2-1 merged, train 1 released | transform ~300, checker ~350, tests ~250, JSON ~2-3k | 2.5-3.5 |
| T2-3 | `feat(core): check contract revision windows` (stack base) | T2-2 merged | src about +100/-90 (prototype: about 180 changed lines); tests +/-1.5..3k across 49 files | 3.5-4.5 |
| T2-4 | `feat(assembly): revision-window builder and maps` (stacked) | T2-3 branch, first commit pushed | Assembly src +220/-120, conformance +70/-50, tests +500/-250 | 2.5-3 |
| T2-5 | `docs(architecture): revise the consumer standard for the 0.4.0 train` | T2-3+T2-4 on `main` | docs +280/-130, one test literal | 1-1.5 |
| REL-2 | `chore(release): prepare Core and Assembly 0.4.0 and conformance 0.2.0` | T2-5 on `main` | generated | 0.5 + owner |
| TEST-2, AR-3 | follow-up briefs in their repositories, run on the REL-2 archives | REL-2 final head | - | 1.5-2 |

Order: T2-0 -> T2-1 -> (train 1 released) -> T2-2 -> (T2-3 + T2-4) -> T2-5 -> REL-2 open -> TEST-2/AR-3 on its
archives -> owner merges REL-2 -> owner publishes. Parallel: Core source work of T2-3 next to T2-2; T2-4 after the
first T2-3 commit; T2-5 drafting next to T2-4. Total 12-15 days plus review rounds; about
8-10 calendar days with two lines.

## 5. Where the briefs live in get-modular

- Path: `research/contract-evolution-2026-10/` with `README.md` (this index, English, with the owner answers in
  place of section 3.3), `briefs/T2-*.md` and `briefs/REL-2-release.md`, `raw/` (the Russian staging plan, redacted)
  and `raw/sketch/` (the files of `sketch/`, all `.txt`). Link it from `docs/README.md` section "Evidence" next to
  "Module resource scopes and foundation review".
- Why not `docs/`: the docs protocol creates only `adr` and `open-decision` records (`docs:new`), and governed
  `docs/` documents need a metadata type from `docs/metadata.schema.json` (`adr`, `architecture`, `index`,
  `open-decision`, `qualification`, `requirements`). A plan is none of these; an OD would block runtime claims
  (ADR-0015). `research/<topic>-<yyyy-mm>/` is the established home for plans and evidence (owner rule
  2026-10-02).
- Rules: Markdown passes `markdownlint-cli2` with the root config; English text passes `cspell` (add
  `research/contract-evolution-2026-10/raw/**` to `.cspell.json` `ignorePaths`, as for the module-resources raw
  folder; add real words only); code samples outside `packages/` are stored as `.txt`; the repository is public, so
  no local paths, host names, machine ids, e-mail addresses beyond commit metadata, private-repository excerpts or
  tool names of the review process. The ADR itself is created by T2-1 with `pnpm docs:new`, never by hand, and is
  immutable once accepted.
- Timing: land T2-0 now (Q1 and Q2 are decided), even before train 1 is released. Each brief's re-verify
  section absorbs the drift; whoever hands a brief out re-checks it first.

## 6. Consumer proof (follow-up briefs, written by the planning side)

The owner rule requires a disposable TEST project and one real consumer in the same delivery. TEST-2 (in
modularity-host-test) and AR-3 (in agent-runtime) are follow-up briefs that the planning side writes and lands in
their repositories before REL-2 starts; REL-2 is not merged or published until both pass on the REL-2 archives (same
pattern as train 1: archives packed from the final REL head, owner sign-off, then merge). Scope each brief must cover:

- AR-3: re-verify AR-1b landed (no `familyVersion`, `compatibility:` or hand-written `CapabilityContract` in AR
  sources, tests and `scripts/architecture/*`; declarations from `declareModule`; maps through `CapabilitiesOf`); bump
  Core/Assembly to 0.4.0 and conformance to 0.2.0, peer ranges `^0.4.0`; replace map indexing by capability id with
  port types; move the CMS pin (`architecture/get-modular/consumer-profile.json`,
  `architecture/consumer-module-standard/contained-turn-profile.json`, review path in
  `scripts/architecture/check-cms-pin.mjs`) from `81063ad` to the T2-5 commit with its reviewed delta; expected test
  changes only where a test reads mismatch details, plan bindings or digests; gate as for the train 1 AR draft
  (milestone checks green locally, required draft PR checks and the Node 26.10 job green; GM findings block
  publication, AR-only defects do not).
- TEST-2: the 0.3.0 train is the only live subject after TEST-1; move it to the REL-2 archives and add one window
  scenario (provider r5 serving 3..5, consumers built with r3 and r5, a consumer at r2 refused with
  `consumer-too-old`).

## 7. Top risks and global stop rules

| Risk | Mitigation / stop |
| --- | --- |
| The transform hides a regression in the historical replay | transform pinned, its own rejecting tests, digest oracle checked against the pinned v1 vector, exact retired set |
| Byte-limit boundary fixtures leave their boundary after a rewrite | retire rule limited to byte limits; class V fixtures re-padded in the materializer, never in immutable vectors |
| Type-check time or TS2589 in real Hosts | key-remapped `CapabilitiesOf`; windowed 500-handle fixture with distinct revision types; stop above 3x |
| API Extractor rejects the public surface | six helper types exported; `foundation:check` gate in T2-4 A1 |
| A suite outside the measured M2 corpus does not lift cleanly | T2-2 rule 4 stops with the case id and path; class T lifts templates, class C transforms at the comparison site; never a silent drop |
| A descriptor or runtime test silently stops observing descriptors | class T forbids copying materialized inputs; the review checks `getterCalls() === 0` and attributes stay asserted |
| Train 2 lands on unreleased train 1 | hard stop in every code brief |
| The ADR number collides with the observation track | T2-1 takes the next free number and checks open PRs |
| Stacked PRs drift from `main` | rebase T2-3 (own branch), re-run the gates; never merge T2-3 alone |
| A gate is in the way | never weaken it; stop unless a brief says how to disable it with a comment |
| CI lane above 810 s (90% of 15 min) | stop and report |

Any ambiguity in a brief: stop and ask.

## 8. Independent review of these briefs (2026-10-04) and its disposition

| Finding | Disposition |
| --- | --- |
| P1-1 path projection | moot under B: schema 1 is refused; projection uses schema 2 names, schema 1 projection cases are replaced |
| P1-2 construction witness outside scope | applied: T2-3 scope and item 9a, both copies; also `emit.ts:109` (found by the prototype) |
| P1-3 test migration classes | applied: T2-3 table over the 49 measured files with classes R, T, C, V, S, L, H; T2-2 derives `retired` from row-form categories only |
| P1-4 `ae-forgotten-export` | applied: six exported helper types in ADR, T2-4, changeset, REL-2 |
| P1-5 train 1 not released | applied: hard stop in T2-2..T2-5 and REL-2 |
| P2-1 `DbV5` in TSDoc | applied: `DbR5` everywhere; T2-4 explains the regex |
| P2-2 all lanes red on T2-3 | applied: T2-3 and Q2 text (30 lanes since `2ef00da`) |
| P2-3 `isPortableId` | applied: pattern plus 3..128 length in T2-2 and T2-3 |
| P2-4 retire rule for byte limits | applied: byte limits and boundary recipes only; count limits never retire |
| P2-5 retire count | applied and measured: the lift retires nothing in the M2 corpus (0 object, 0 raw, 0 invocations) |
| P2-6 REL-2 branch handling | applied: owner answer of 2026-10-08 is the standing rule (decision 14) |
| P2-7 Variant B vs ADR-0032 | applied: the ADR withdraws ADR-0032's decoder promise and decision 5, with the owner's reason |
| P2-8 contract package peer and re-release | applied: ADR, CMS, R16 |
| P2-9 self-composition guide prose | applied: T2-5 lists every passage |
| P2-10 TEST-2/AR-3 owners | applied: follow-up briefs by the planning side, landed before REL-2 starts |
| P2-11 `docs:new --help` | applied: T2-1 re-verify uses `docs:info` and the dry run |
| P3-1 to P3-15 | all applied (Host wording, `Earlier` literal and exact keys, distinct revision types in the scale fixture, `bounds.test.mjs`, six declarations, D10, quickstart conformance, "owner" in place of the planning role, normalized quote matching, landing wording, T2-0 copy rules, plugin date redaction, ADR-0021 precedence, churn estimate) |

## 9. Re-check of 2026-10-08 and its disposition

| Finding | Disposition |
| --- | --- |
| R2-P1-1 class R breaks descriptor and runtime fixtures | applied: class T lifts templates before materialization (`materializeCase` gains an optional templates parameter); materialized inputs are never copied |
| R2-P2-1 run-style suites in class R | applied: class C transforms at the comparison site (`object-subject`, `executeM2RawCase`); T2-2 derives `retired` from row-form categories only |
| R2-P2-2 T2-3 not fully B | applied: T2-3 is written for B throughout (mutations, checklist, Done, risks) |
| R2-P2-3 unliftable entries undefined | applied: T2-2 rule 4 stops with case id and path, never drops |
| R2-P2-4 drift to 30 lanes and `lockfile:peers:check` | applied in all briefs; FMS test lines `:943`/`:951` located by text |
| R2-P2-5 "whole corpus" wording | applied: index and ADR state the measured scope (M2 corpus) only |
| P3 witness copy, Assembly refusal code, `duplicate-records` ports, planning-role wording | applied: sketch notes and T2-3 (witness), ADR (refusal code), class V (`liftDeclaration` inputs), decisions phrased "owner decision" or "decided during planning" |
