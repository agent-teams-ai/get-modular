<!-- cspell:ignore Builtin builtins behaviour bunprobe immediates microtask microtasks mjs nodenext oxlint oxlintrc realpath rewalk subpath subpaths -->

# Implementation plan: `@get-modular/observation` 0.1.0

Planning document for the implementing track, written on 2026-10-17 against get-modular `main` at `a20d261`, the
ADR-0034 text of pull request #154 at `6cfeb2d` and this research directory on branch
`docs/module-communication-research` at `b43ef11` (pull request #182). It implements nothing.

A fresh agent starts at section 5, Phase 0, and works through the phase cards in order. Each card names its inputs,
outputs, commands, done criteria and stop conditions. When a source is silent, section 4 gives the default and section
15 answers the usual questions.

Path conventions: paths are relative to the get-modular root; `raw/` means `research/module-communication-2026-10/raw/`;
in sections 10 and 11, `src/` and `t/` mean `packages/observation/src/` and `packages/observation/tests/`.

## 1. Purpose, scope and authority

### 1.1 Purpose and scope

Deliver `@get-modular/observation` 0.1.0 as ADR-0034 admits it: one optional public leaf package with the root export
and `./testing`, its rejecting tests, its leaf admission, the Consumer Module Standard (CMS) changes, and the bounded
TEST consumer run on the release archives.

Out of scope (ADR non-goals and known items): events, a contribution registry, selectors, a computed graph,
`readonly(keys)`, multi-store watches, adapters to signals or observables, pluggable schedulers, history, cross-store
transactions, readiness or health contracts, lifecycle methods, CommonJS builds, shims, `Resources.path`, echo detection
across timers or I/O, browsers, G1 enrolment, any production consumer and new writer rounds.

### 1.2 Sources of truth, highest first

1. ADR-0034, `docs/decisions/0034-admit-the-module-change-observation-package.md` (on `main` once #154 merges).
2. The public types: `raw/api-design/b-snapshot/api.d.ts.txt` and `testing.d.ts.txt`.
3. The package README draft: `raw/api-design/b-snapshot/README.md`.
4. `raw/api-design/b-snapshot/RATIONALE.txt` (sections 2, 3, 5, 6, 9 and 13 matter most).
5. The prototype: `raw/api-design/runtime/` and `raw/api-design/runtime-b/`. Evidence, not code to copy; the line
   numbers of section 7 refer to its `runtime/core.ts.txt`.

`implementation-brief.md` and `findings.md` give context; this plan refines the brief. If two sources disagree, the
higher one wins and the pull request description records the difference.

### 1.3 Recorded differences between sources

| # | Where | Difference | Resolution |
| --- | --- | --- | --- |
| 1 | Brief vs ADR | The brief asks for one pull request; the ADR says the Standard changes "in the delivery that adds the package". | Two consecutive pull requests, both merged before the release pull request (Q1). |
| 2 | ADR vs repository | The ADR says the `consumer-module-standard` SDK-growth evidence changes. That file is a frozen P0 observation: `validateP0Evidence` in `architecture/checks/sdk-growth.mjs` hard-codes its `pinned`, `acceptedCurrent` and `delta` (owner decision A, 2026-10-01), and CMS revisions #164 and #176 did not touch it. The reviewed bytes of the current CMS are pinned in `tests/ownership-checkpoint.test.mjs`. | Q3. |
| 3 | ADR vs prototype | "One internal deferral queue per package copy"; the prototype schedules a pair of immediates per store with package-wide pending counters. | Keep the measured per-store scheduling; the package-copy deferral state is the scheduler resolved at load plus the package-wide counters. No new global queue, which would change measured ordering. Say so in PR 1. |
| 4 | Types and README vs ADR | `Subscription.resources` JSDoc and README line 37 say "composition or adapter code". | Rule 11: "in the module's composition file" (known fix of the brief). |
| 5 | Types vs brief | `loader` has two JSDoc blocks in a row. | Merge them (known fix). |
| 6 | README vs ADR | "Bun verified". | ADR wording: Bun 1.3 observed to behave the same except for unhandled rejections; not in the admission matrix. |
| 7 | Types and prototype vs ADR known item | `ListenerError.path` "planned in resources 0.2"; the prototype reads `resources.path` by duck typing. | Keep `path?` in the type, never set it in 0.1.0, no duck typing. |
| 8 | Prototype vs ADR | `TypeError("not a store of this stub")`, `setTimeout` in the drain, global `queueMicrotask`, `OBSERVATION_STUB_*` switches. | Every package error is an `ObservationError`; the drain and the rethrow use the scheduler and microtask function captured at load; no switch of any kind (mutations patch a copy, section 9.3). |
| 9 | Prototype probes vs ADR | W1 asserts elapsed time below 2 s; probe 21 measures milliseconds. | Counts and order only (section 9). |
| 10 | `CMS-RULE5-DRAFT.txt` vs ADR | The draft predates the ADR. | ADR wording only (section 12). |
| 11 | CMS snippet vs ADR | A later oxlint override replaces `no-restricted-imports` for its files, and `@get-modular/*` does not match a two-segment subpath. Verified on 2026-10-17 with oxlint 1.83.0: an `adapters/` file could then import `/testing`. | The `paths` entry goes into a new override and into the layer override (section 12.4). |

## 2. Re-verify before start

Run in a fresh worktree of get-modular (`$GM`) and record the outputs in the PR 1 description.

```sh
cd "$GM" && A=docs/decisions/0034-admit-the-module-change-observation-package.md && git fetch origin
git rev-parse origin/main                                                                                  # 1
git show "origin/main:$A" | head -8; git show "origin/main:$A" | shasum -a 256                             # 2
jq '.decisions[] | select(.id == "ADR-0034")' architecture/decisions/accepted-decisions.json               # 2
jq -r .version packages/resources/package.json; npm view @get-modular/resources dist-tags; git diff a20d261 origin/main --stat -- packages/resources/src  # 3
node node_modules/typescript/bin/tsc -v; node node_modules/typescript-minimum/bin/tsc -v                   # 4
cat .node-version; node -e 'console.log(typeof process.getBuiltinModule("node:timers").setImmediate)'     # 5
jq -r .version node_modules/oxlint/package.json node_modules/@agent-teams/engineering-foundation/package.json  # 6, 8
grep -n "lane: \|timeout-minutes\|ROOT_CI_NODE_VERSION: \|node-version: 24" .github/workflows/ci.yml       # 5, 7
jq -r .version node_modules/@changesets/cli/package.json; ls node_modules/.pnpm | grep assemble-release    # 9
git show origin/main:research/module-communication-2026-10/README.md | head -3                            # 10
shasum -a 256 docs/architecture/common-assembly.md; grep -n -B2 "current CMS successor" tests/ownership-checkpoint.test.mjs  # 11
```

| # | Expected on 2026-10-17 | If different |
| --- | --- | --- |
| 1 | `a20d261` or a descendant. | Read `git log a20d261..origin/main --stat`; re-read every file this plan edits and adapt. |
| 2 | ADR-0034 accepted on `main`; file SHA-256 `dfaf70b8…924f` and registry `immutableDigest` `sha256:36867eb9…bc61`, as at `6cfeb2d`. These become the row's `fileDigest` and `immutableDigest`. | Not merged: STOP, PR 1 cannot pass `authenticateLeafDecision`. Other file digest: the text changed; diff it against `6cfeb2d` and update this plan first. Only `immutableDigest` differs: use the value on `main`. |
| 3 | Resources `0.1.0` (`latest=0.1.0`); no source change; no `Resources.path`. | A new resources minor needs an observation minor (ADR). `Resources.path` exists: a known-item trigger fired; STOP and ask. |
| 4 | `7.0.2` and `5.8.3`. | Use the catalog pins; run the type controls first after a compiler update. |
| 5 | `26.11.1`; Node 24 lanes `24.21.0`; `function`. | Change engines only together with every other leaf. |
| 6 | `1.83.0`; `no-restricted-imports` supports `paths` with messages (verified with a scratch fixture). | Re-run the lint fixture of section 9.6 before PR 2. |
| 7 | Lanes core, assembly, packaging, governance, static on three OS and two Node lines, `timeout-minutes: 15`, plus `node-24-compatibility`. | Re-plan Q2. |
| 8 | `1.7.4`, source-dependencies schema v3 with `packageExports`. | Check that `packageExports` still accepts `./testing`. |
| 9 | `3.0.2` and `assemble-release-plan@7.0.0`. | Re-check the peer bump rule of section 13. |
| 10 | Pull request #182 merged. | Copy fixtures from branch `docs/module-communication-research` at `b43ef11` and cite it. |
| 11 | `e5cb510c…0919` in both places. | The CMS changed meanwhile: rebase PR 2 and recompute. |

## 3. Decisions to confirm before coding

Scores are reliability and confidence out of 10. The first option is the default unless the delivery lead decides
otherwise; record the choice in the PR description.

- **Q1, pull request split.** (Recommended) Two pull requests, release only after both: code review and normative review
  stay apart and PR 1 stays reviewable; 8 and 8. One pull request as the brief says: 8 and 6 (about 10 000 changed lines
  with fixtures). Three pull requests, with Phase 1a as its own pull request (synthetic rows only; the ADR allows it
  because no observation entry precedes the package): 8 and 7, the fallback if PR 1 grows too large.
- **Q2, CI placement of `observation:check`.** (Recommended) A sixth matrix lane `observation`: CI run 38982281074 on
  `a20d261` took 7 to 10 minutes per Windows lane (packaging payload 7 min 54 s) against the 15-minute limit pinned by
  `tests/ci-check-lanes.test.mjs`, and `observation:check` is estimated at 4 to 7 minutes on Windows; 9 and 7. The
  packaging lane like other leaves: 5 and 8 (likely timeout). Packaging plus moving the heavy evidence to a root script
  in another lane: 6 and 6 (every Windows lane is at 7 to 9 minutes).
- **Q3, SDK-growth evidence (difference 2).** (Recommended) Keep the frozen P0 fields byte-identical and add a top-level
  `successorReviews` array with one entry: `fromSha256` (the digest of the ownership test before PR 2), `sha256` and
  `gitBlob` of the new CMS bytes (`shasum -a 256`, `git hash-object`), `classification: "module-communication-rules"`,
  `semanticChanges` (one string per changed rule), `changesGetModularCompositionContract: false`,
  `pinAction: "consumers-review-delta"`; review checks the digests; 7 and 6. The same plus a check in
  `architecture/checks/sdk-growth.mjs` and a rejecting test: 8 and 5 (a second pin of the same bytes). Advancing
  `acceptedCurrent`: rejected, it rewrites frozen P0 evidence; 3.
- **Q4, resources release for its documentation change.** (Recommended) A resources patch changeset, so the published
  README and JSDoc match the Standard; the TEST consumer then runs on resources 0.1.1; 8 and 6. No changeset; the text
  ships with the next resources release and the owner has one publication fewer: 7 and 7.

## 4. VERIFY items and their defaults

When a check cannot be made, take the default, continue, and record the evidence named here in the PR description. A
default never overrides a STOP of a phase card.

| # | Item | Default when it cannot be checked | Evidence to record |
| --- | --- | --- | --- |
| V1 | ADR-0034 merged with the digests of section 2 | none: without it STOP | output of section 2 check 2 |
| V2 | npm registry state of resources | `latest=0.1.0`, as `research/releases/0.5.0-train/release-intent.md` records | "registry not reachable on <date>" |
| V3 | Foundation accepts `packageExports: ["./testing"]` | yes: schema v3 `exactPackageExport` admits it (read on 2026-10-17) | `pnpm foundation:check` output |
| V4 | Foundation ignores `process.getBuiltinModule(...)` calls | yes: it parses imports, `require` and dynamic imports | `pnpm foundation:check` output; if it fails, STOP |
| V5 | Changesets peer behavior | an in-range patch of resources bumps nothing else; an out-of-range minor gives observation only a patch (ADR) | `pnpm changeset status --verbose` in PR 2 and the release pull request |
| V6 | Windows time of the `observation` lane | Q2 default lane | job durations of the PR 1 CI run |
| V7 | Expected failing gate of each writer negative | the manifest of section 9.4, taken from `raw/api-design/results/control.negative-*.txt` | the gate table that `writer-gate.test.mjs` prints |
| V8 | Expected result of the type controls | no annotation: clean; parameter form: TS2636 only, on both compilers (archived) | `type-controls.test.mjs` output |
| V9 | Consumers that pin the CMS | `agent-teams-ai/agent-runtime` (`architecture/consumer-module-standard/contained-turn-profile.json`, `docs/architecture/get-modular-adoption.md`) and `agent-teams-ai/modularity-host-test` (`docs/lifecycle-kernel-h04.md`) | search output, or "search unavailable; plan list used" |
| V10 | TEST consumer location | repository `agent-teams-ai/modularity-host-test`, branch `test/observation-0.1.0`, directory `observation-0.1.0/` | repository URL and commit SHA of the run |
| V11 | Release record directory | `research/releases/observation-0.1.0/` (the 0.5.0 train used `research/releases/0.5.0-train/`) | path in the record pull request |
| V12 | npm dist-tag for the first publication | propose `latest` for observation 0.1.0 and for resources 0.1.1; the owner decides | the owner's answer in the release intent |
| V13 | Permission to merge | none: stop at "ready to merge" and report to the delivery lead, unless the assignment explicitly includes merging | the lead's message |
| V14 | Does `pnpm lint:typed` lint test files | no, only the `compilerProjects` of `quality-source-coverage.yaml` | if it reports test files, fix them; never suppress |
| V15 | The default 5000 ms deadline | real time; one test waits for it (about 5 s) | test duration in the output |

## 5. Phase cards

Rules for every phase: commit with the repository's own git identity (`git config --local user.email`) and no AI
attribution; edit, `git add -A`, commit, and only then run `pnpm check` (several tests clone `HEAD`, and tracked-file
custody compares the working tree with the index); update a branch by merging `origin/main` locally, never with
`gh pr update-branch` (the `commit-author-identity` check rejects GitHub's merge commit); never edit accepted ADR bytes,
`architecture/decisions/accepted-decisions.json`, `architecture/public-api/**`, `architecture/contracts/**` or
`architecture/sdk-growth/status.json`, and never narrow a governed root or add an exclusion to get green. Run
`pnpm check:changed` while editing, `pnpm check:fast` before review and `pnpm check` on the final commit. Every test
title starts with the traceability IDs it proves (section 10), for example
`test("T29 [P1] a commit between read and watch is delivered", …)`; type tests carry the IDs in a comment above each
case.

### Phase 0: preconditions and decisions (no code)

- **Inputs:** this plan, sections 1 to 4; ADR-0034 on `main`.
- **Outputs:** a draft PR 1 description with the section 2 outputs, the choices for Q1 to Q4 and the VERIFY evidence.
- **Commands:** the block of section 2.
- **Done:** every row of section 2 matches, or its "if different" action is done.
- **Stop:** ADR-0034 not on `main`; its file digest differs; `Resources.path` exists; a resources minor was released; a
  compiler or oxlint update makes a section 2 check fail.

### Phase 1a: the checks learn row subpaths (PR 1, commit 1)

- **Inputs:** `architecture/checks/leaf-packages.mjs`, `leaf-package-admission.mjs`, `production-artifacts.mjs` (lines
  315 to 400), `architecture/tooling/build-leaf-package.mjs`, `tests/leaf-package-admission.test.mjs`; section 11.1.
- **Outputs:** the helpers and checks of section 11.1; synthetic-row tests. No observation row, no package file.
- **Commands:** `node --test tests/leaf-package-admission.test.mjs tests/governance.test.mjs`, `pnpm governance:check`,
  then commit `feat(architecture): let a leaf row list package subpaths`.
- **Done:** every existing row behaves as before (one root); a synthetic row with `subpaths: [".", "./testing"]` is
  admitted only with both exports and both `src` entries; all tests green.
- **Stop:** an existing test needs a changed expectation for Core, Assembly or an existing leaf.

### Phase 1b: skeleton and source (PR 1, commit 2)

- **Inputs:** section 6 (skeleton), section 7 (engine), section 8 (types), `raw/api-design/b-snapshot/api.d.ts.txt`,
  `testing.d.ts.txt`, `README.md`, `raw/api-design/runtime/core.ts.txt`, `runtime/testing.ts.txt`,
  `packages/resources/src/**` (style).
- **Outputs:** every `packages/observation` file of section 6 marked `1b`.
- **Commands:** `node architecture/tooling/build-leaf-package.mjs observation` fails until Phase 1d adds the row; use
  `node node_modules/typescript/bin/tsc -p packages/observation/tsconfig.json` to build meanwhile. Commit
  `feat(observation): add the store, facets, subscriptions and the testing entry`.
- **Done:** the build emits exactly the `dist/` files of section 6;
  `rg -n "process.env|from \"node:" packages/observation/src` finds nothing; the public types equal `api.d.ts.txt` and
  `testing.d.ts.txt` except the fixes of section 8.
- **Stop:** a public type or name would need to differ from the sources beyond section 8; a lint rule forces a design
  change of the public API.

### Phase 1c: tests and fixtures (PR 1, commit 3)

- **Inputs:** section 9 and section 10; `raw/api-design/runtime/probes.test.ts.txt`, `runtime-b/probes.test.ts.txt`,
  `runtime-b/env-probe.ts.txt`, `b-snapshot/type-tests.ts.txt`, `probes/p3`, `p5`, `p6`, `p7`, `p8`, `p9`, `p10`
  (`.txt`), `tools/mutations*.sh.txt`, `tools/static-rules.mjs.txt`, `tools/tsc-both.mjs.txt`, `check.sh.txt`,
  `tasks/**`, `reference/**`, `results/control.*.txt`; `packages/resources/tests/**` and
  `packages/conformance/tests/packed-root.test.mjs` (style).
- **Outputs:** every test file of section 6 marked `1c` (the root `tests/observation/*` files come in Phase 1d).
- **Commands:** `pnpm resources:build`; `node node_modules/typescript/bin/tsc -p packages/observation/tsconfig.json`;
  then `node --test` on every `packages/observation/tests/*.test.mjs` except `packed-root.test.mjs` (it needs Phase 1d's
  `pnpm install`), with Node 26 and again with Node 24. Commit
  `test(observation): carry over the archived probes, mutations and writer gate`.
- **Done:** every row of section 10 that names a PR 1 test has a test whose title carries its ID
  (`rg -o "T[0-9]+" packages/observation/tests` lists them; the root tests follow in Phase 1d); every archived probe of
  section 9 is ported or listed as dropped; the tests run green on both Node lines.
- **Stop:** an archived probe fails on the package for a reason other than a stub internal (section 15, Q6); a writer
  negative fails at another gate than the manifest says; a mutation is not caught.

### Phase 1d: admission wiring and CI (PR 1, commit 4)

- **Inputs:** section 11; `git show a01a129` (the conformance admission) for every touched file.
- **Outputs:** the row, root scripts, `pnpm-lock.yaml`, FMS profile, Foundation policy, quality configs, CI, the two
  `tsconfig.types*.json` files and the root tests of section 6 marked `1d`.
- **Commands:**

```sh
pnpm install            # once, writes the observation importer into pnpm-lock.yaml
pnpm assembly:build && pnpm lifecycle:build && pnpm resources:build && pnpm conformance:build
pnpm install --frozen-lockfile --ignore-scripts --engine-strict --strict-peer-dependencies
pnpm lockfile:peers:check && pnpm observation:check
pnpm governance:check && pnpm governance:test && pnpm release-owned-files:check
pnpm foundation:check && pnpm lint:typed && pnpm sdk-growth:check
pnpm architecture:feature-module-profile && pnpm architecture:feature-module-profile:test
```

- **Done:** all commands green; commit `feat(observation): admit the package as a public leaf with ./testing`.
- **Stop:** V4 fails; a check would need weakening for every row; `foundation:check` rejects a test import of `../dist`.

### Phase 1e: documentation, changeset and the full gate (PR 1, commit 5)

- **Inputs:** section 11.6 (README and FMS text), section 13.
- **Outputs:** `README.md`, `docs/architecture/feature-module-standard.md`, `.changeset/add-observation-package.md`.
- **Commands:** `pnpm docs:quality`; commit `docs: list the observation package`; then `pnpm check`; push; open PR 1
  with the description of Phase 0.
- **Done:** `pnpm check` green on the final commit; every CI lane green, the Windows `observation` lane under 13
  minutes.
- **Stop:** a CI lane fails only on one OS (section 16); the Windows lane exceeds 13 minutes after the mitigations.

### Phase 1f: review and merge readiness (PR 1)

- **Inputs:** the PR diff; section 10; section 17.
- **Outputs:** an independent review by an agent that wrote none of the code (model and place per the workspace rules);
  fixes; a repeated review of the fixes.
- **Commands:** `gh pr checks <number>`; after fixes, `git add -A`, commit, `pnpm check`, push.
- **Done:** review clean; CI green; every PR 1 row of section 10 ticked in the description.
- **Stop:** V13 (merge only with explicit permission); an unresolved review finding about public behavior.

### Phase 2a: Standard and guide (PR 2)

- **Inputs:** section 12; `docs/architecture/common-assembly.md` sections "Module resource scopes", "Feature layout and
  implementation form", "Module packages and contracts", "Testing modules", "Executable examples and adoption status";
  `docs/guides/module-authoring.md` sections 0, 9, 19 and 20; `raw/practices/practices-catalog-v2.md`;
  `tests/assembly/consumer-standard-examples.test.mjs`.
- **Outputs:** the CMS and guide edits, `tests/assembly/consumer-standard-lint.test.mjs`, the examples test change.
- **Commands:**
  `pnpm assembly:build && pnpm lifecycle:build && pnpm resources:build && pnpm conformance:build && pnpm observation:build && pnpm assembly:test`;
  `pnpm docs:protocol:check`.
- **Done:** the guide example `communication` compiles on both compilers and both resolutions; the lint test passes.
- **Stop:** an example needs an API the package does not have; the lint test needs an oxlint version change.

### Phase 2b: resources documentation, evidence and digests (PR 2)

- **Inputs:** section 12.5, Q3, Q4, `tests/ownership-checkpoint.test.mjs` (line 171),
  `architecture/sdk-growth/evidence/consumer-module-standard.json`.
- **Outputs:** the `Resources.signal` text in `packages/resources/src/features/scope/types.ts` and
  `packages/resources/README.md`, `.changeset/resources-signal-documentation.md`, the new CMS digest in the ownership
  test, the `successorReviews` entry.
- **Commands:** `pnpm resources:check`, `pnpm ownership:checkpoint:test`, `pnpm sdk-growth:check`,
  `pnpm changeset status --verbose`; commit; `pnpm check`.
- **Done:** all green; the changeset status shows only observation (minor) and resources (patch).
- **Stop:** the changeset status shows a bump of conformance or of observation beyond minor.

### Phase 2c: review and merge readiness (PR 2)

- **Inputs:** the PR diff; section 12; V9.
- **Outputs:** the PR description lists each pinning consumer and its outstanding work ("review the CMS delta at
  `<new sha256>` and migrate the pin"); an independent review; fixes.
- **Commands:** as Phase 1f.
- **Done:** review clean; CI green; PR 2 rows of section 10 ticked.
- **Stop:** V13; issues in other repositories need the lead's go-ahead.

### Phase 3a: release pull request and archives

- **Inputs:** `research/releases/0.5.0-train/release-intent.md` (format); `AGENTS.md` (release-owned files).
- **Outputs:** branch `changeset-release/main` with `pnpm release:version` applied (observation 0.1.0, resources 0.1.1
  per Q4), titled `chore(release): prepare observation 0.1.0`; archives packed once from its head.
- **Commands:**

```sh
pnpm changeset status --verbose && pnpm release:version
pnpm observation:build && pnpm resources:build
OUT="<a scratch directory outside the repository>"; mkdir -p "$OUT" && pnpm --dir packages/observation pack --pack-destination "$OUT" && pnpm --dir packages/resources pack --pack-destination "$OUT"
(cd "$OUT" && shasum -a 256 *.tgz > SHA256SUMS)
```

- **Done:** CI green on the release head; the archive SHA-256s recorded.
- **Stop:** the changeset status shows a resources minor without an observation minor (T93); any CI failure.

### Phase 3b: TEST consumer on the release archives

- **Inputs:** section 14; V10; the archives of Phase 3a.
- **Outputs:** the TEST run record (V10 evidence).
- **Commands:** in the TEST project: verify `SHA256SUMS`, install the tarballs offline, run its typecheck and tests on
  Node 24.21.0 and 26.11.1.
- **Done:** every check of section 14 passes on both Node lines.
- **Stop:** any failure: these archives are not released; fix on `main`, regenerate the release head, run again (ADR).

### Phase 3c: merge, record and hand over publication

- **Inputs:** Phase 3a and 3b outputs.
- **Outputs:** the merged release pull request (V13), a record pull request on branch
  `docs/release-archives-observation-0.1.0` with the archives, `SHA256SUMS`, `INTEGRITY` and `release-intent.md` under
  the V11 directory, including the publish commands for the owner (V12).
- **Commands:** `gh pr checks`; `shasum -a 256 -c SHA256SUMS` on the merged commit's fresh pack (resources may differ
  only by the normalized content digest, as in the 0.5.0 record).
- **Done:** the record pull request is reviewed and merged; the owner has the publish commands.
- **Stop:** never publish; publication is the owner's step.

## 6. Skeleton listing for PR 1

Phase tags say which card creates the file. `.txt` files are fixtures that only compile or run inside a temporary
project; their relative imports resolve only there, so Foundation, lint and the typecheck must not read them.

```text
packages/observation/
  package.json                         1b manifest (below)
  tsconfig.json                        1b build: resources copy, files src/index.ts and src/testing.ts
  tsconfig.types.json                  1d type tests, NodeNext: the six tests/types*.ts and two root type files
  tsconfig.types.bundler.json          1d the same with module ESNext, moduleResolution Bundler
  README.md                            1b package README (section 8)
  CHANGELOG.md                         1b "# Changelog"
  LICENSE                              1b copy of packages/resources/LICENSE
  src/index.ts                         1b root: createStore, ObservationError, the public types
  src/testing.ts                       1b ./testing: liveSubscriptions, delivered, settled, asyncDetection, WaitOptions
  src/composition/root.ts              1b seam: export { createStore } from the store feature
  src/composition/testing.ts           1b seam: the four testing values (the root never loads this file)
  src/features/errors/errors.ts        1b ObservationError, ObservationErrorCode, invalidArgument()
  src/features/delivery/platform.ts    1b scheduler, AsyncLocalStorage, clock, queueMicrotask, resolved at load
  src/features/delivery/context.ts     1b DeliveryOrigin, Live, DeliveryContext, runInContext, currentContext, later
  src/features/delivery/pending.ts     1b package-wide counts of scheduled flushes and running or queued loads
  src/features/store/types.ts          1b the public types of api.d.ts
  src/features/store/values.ts         1b plain-data validation, ownership freezing, frozenNodes, walk count
  src/features/store/registry.ts       1b origins and engines WeakMaps, EngineInfo, storeStats() (internal hook)
  src/features/store/arguments.ts      1b option, key and spec validation
  src/features/store/engine.ts         1b StoreEngine: record, revisions, key index, dirty set, flush, set, read, close
  src/features/store/admission.ts      1b admit(): the check order of section 7.3
  src/features/store/watch.ts          1b WatchRegistration
  src/features/store/load.ts           1b LoadRegistration and its lane
  src/features/store/store.ts          1b createStore(): engine, owner Store, facet, store:<name> entry
  src/features/testing/waits.ts        1b liveSubscriptions, delivered, settled, asyncDetection, WaitOptions
  tests/types.ts                       1c type-tests.ts (contract types)
  tests/types-structural.ts            1c p8 and p3 (slices, marker, variance)
  tests/types-traps.ts                 1c p9 (FixedKeys, Frozen, handlers)
  tests/types-runtime-only.ts          1c p6 (compiles; run time rejects it)
  tests/types-loose-optional.ts        1c p7 (also compiled without exactOptionalPropertyTypes)
  tests/types-testing.ts               1c ./testing types: a root facet is accepted, an owner Store is not
  tests/support/world.mjs              1c shared helpers: world(), codeOf, debtsOf, deferred, loaders, tick
  tests/support/compilers.mjs          1c resolves typescript and typescript-minimum, runs tsc, parses diagnostics
  tests/support/static-rules.mjs       1c port of tools/static-rules.mjs (writer gate rules)
  tests/store.test.mjs                 1c values, set, read, close, errors, snapshots
  tests/subscriptions.test.mjs         1c watch, lifetime, limits, names, dispatch, isolation
  tests/load.test.mjs                  1c load lane, drain, debts, stale results
  tests/guards.test.mjs                1c echo, cascade, context window, event-loop order
  tests/testing-entry.test.mjs         1c waits, deadline, fake timers, asyncDetection
  tests/processes.test.mjs             1c spawns the probes below and asserts their output and exit codes
  tests/gc-probe.mjs                   1c garbage-collection probe, run with --expose-gc
  tests/env-probe.mjs                  1c delivery and detection under a prepared environment
  tests/env-setup-fake-before.mjs      1c preload: a global setImmediate that never fires
  tests/env-setup-no-builtin-module.mjs  1c preload: process.getBuiltinModule undefined
  tests/env-setup-no-node.mjs          1c preload: no getBuiltinModule and no global setImmediate
  tests/process-probe.mjs              1c echo-exit, abort-listener, abort-listener-unhandled, throwing-reporter, import-idle
  tests/semantic-suite.mjs             1c runSemanticSuite(observation, testing, context), as in resources
  tests/type-controls.test.mjs         1c variance controls and loose optional properties
  tests/mutations.test.mjs             1c mutation harness
  tests/mutations/defects.mjs          1c the 18 defects (section 9.3)
  tests/writer-gate.test.mjs           1c writer gate against the build
  tests/writer-tasks/manifest.json     1c sets, tasks and expected gates (section 9.4)
  tests/writer-tasks/harness.mjs.txt   1c archived harness with the three edits of section 9.4
  tests/writer-tasks/tasks/            1c <task>.types.ts.txt and <task>.accept.ts.txt for the ten tasks
  tests/writer-tasks/fakes/            1c <task>.types.js.txt for the ten tasks
  tests/writer-tasks/scenarios/        1c <task>.scenario.mjs.txt for the ten tasks
  tests/writer-tasks/solutions/        1c reference/, alternative/, negative-b-behaviour-1/ to -7/, negative-rules-compile/
  tests/packed-root.test.mjs           1c ADR-0012 packed root, one instance, dist source rules
tests/observation/assembly-contracts-types.ts   1d p5 against workspace Assembly, Core and resources
tests/observation/assembly-implement-types.ts   1d p10: implement, scoped and slices
tests/observation/assembly-integration.test.mjs 1d facet as a capability, real Assembly run, cancellation
tests/observation/readme-examples.test.mjs      1d compiles the package README examples
.changeset/add-observation-package.md           1e section 13
```

The ten tasks are `a-logger`, `b-catalog`, `c-pricing-context`, `d-greeter`, `e-async-factory`, `e-sessions`,
`f-watch-and-load`, `g-hierarchy`, `h-requests` and `i-errors`. `solutions/` copies, unchanged: `reference/` from
`raw/api-design/reference/b-snapshot/` (ten), `alternative/` from `reference/alternative/b-snapshot-2/` (`h-requests`),
`negative-b-behaviour-1/` to `-7/` from `reference/negative/b-behaviour-1/` to `-7/` (ten, four, then one each), and
`negative-rules-compile/` from `reference/negative/b-rules-compile/` (`a-logger`, `b-catalog`, `d-greeter`; its
`c-pricing-context` is not copied, because the archive never asserted it).

Files changed by PR 1 are listed in section 11. `packages/observation/package.json`:

```json
{
  "name": "@get-modular/observation",
  "version": "0.0.0",
  "description": "State with one writer, read-only facets and subscriptions owned by the subscriber's resource scope.",
  "publishConfig": { "access": "public", "registry": "https://registry.npmjs.org/" },
  "repository": { "type": "git", "url": "git+https://github.com/agent-teams-ai/get-modular.git", "directory": "packages/observation" },
  "license": "Apache-2.0",
  "type": "module",
  "sideEffects": false,
  "engines": { "node": ">=24.18.0 <25 || >=26.10.0 <27" },
  "exports": {
    ".": { "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }, "default": "./dist/index.js" },
    "./testing": { "import": { "types": "./dist/testing.d.ts", "default": "./dist/testing.js" }, "default": "./dist/testing.js" }
  },
  "files": ["dist", "LICENSE", "README.md", "CHANGELOG.md"],
  "peerDependencies": { "@get-modular/resources": "workspace:^" },
  "scripts": {
    "build": "node ../../architecture/tooling/build-leaf-package.mjs observation",
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.types.json && tsc -p tsconfig.types.bundler.json",
    "test": "node --test tests/*.test.mjs",
    "check": "pnpm build && pnpm typecheck && pnpm test"
  }
}
```

No `dependencies`, `optionalDependencies`, `devDependencies` or `peerDependenciesMeta`. `tsconfig.json` copies the
resources one with `"files": ["src/index.ts", "src/testing.ts"]` (`types: []` from the base keeps Node types out).
`tsconfig.types.json` copies the resources one (`rootDir: "../.."`) with `files`: the six `tests/types*.ts` files and
the two `../../tests/observation/assembly-*-types.ts` files. The build emits `dist/index.js`, `dist/index.d.ts`,
`dist/testing.js`, `dist/testing.d.ts` and one `.js` and `.d.ts` per source file, nothing else. Both entries reach
`dist/features/store/registry.js` and `dist/features/delivery/*.js`, so ESM caching gives one instance per installed
copy. Every file stays within the Foundation oxlint limits (500 lines, 150 per function, complexity 20, depth 4, five
parameters) and type-aware rules. Feature imports are acyclic: `errors` and `delivery` import nothing of the package;
`store` imports both; `testing` imports all three.

## 7. Engine design

### 7.1 Platform and values (`delivery/platform.ts`, `store/values.ts`; core.ts 132–139, 185–207, 224–275)

Read `process` structurally from `globalThis`. Scheduler: `setImmediate` of `getBuiltinModule("node:timers")` called
through `Reflect.apply`, else the global `setImmediate` bound to `globalThis`, else `setTimeout(callback, 0)`; never a
bare `setImmediate` identifier, so importing never throws a `ReferenceError`. Context storage: `new AsyncLocalStorage()`
from `getBuiltinModule("node:async_hooks")`, else `undefined`; `asyncDetection` is `storage !== undefined`. Clock:
`performance.now` bound at load, else `Date.now`. Microtask: the global `queueMicrotask` captured at load, else the
scheduler. No `import` of a `node:` module, no top-level `await` (it breaks `require(esm)`), no `process.env`.

Port `captureRecord`, `collectPlain`, `freezeNodes` and `defineRecord`: own data properties only; symbol keys and
accessors rejected at every level and read once; primitives, arrays and plain or null-prototype objects allowed;
functions, symbols, `Date`, `Map`, `Set`, typed arrays and class instances fail with `observation.values.not-plain`;
cycles terminate; `__proto__` is defined with `Object.defineProperty`. Validate first, collect the new nodes, freeze
only after every check of the call passed (echo and cascade included), then add them to the package-wide `frozenNodes`
WeakSet so they are never walked again; count walked nodes (`walked`). At run time the key set of `initial` is the
store's.

### 7.2 Revisions, flush, context and guards (`store/engine.ts`, `delivery/context.ts`; core.ts 124–156, 323–403, 655–698)

`commit` counts effective commits; `lastTouched: Map<key, revision>`; a snapshot's revision is the largest `lastTouched`
of its keys. `buckets: Map<key, Set<Registration>>`: `set` looks up only the changed keys (one index lookup each), marks
their registrations dirty and keeps on each the largest commit depth. A patch that changes nothing by `Object.is`
commits nothing and returns the current revision. `dirty: Set<Registration>` holds at most one entry per subscription.
`schedule()` is idempotent per store: it increments the pending flush count, creates `live = { open: true }`, calls
`later(() => flush(live))` and right behind it `later(() => { live.open = false; })`. `later` leaves any delivery
context (`storage.exit(() => scheduler(fn))`), so a flush never inherits the context that scheduled it; the two
callbacks are adjacent in the immediate queue, so the context closes after the flush's microtask checkpoint and before
any timer or I/O callback. `flush` snapshots `dirty` sorted by registration id, clears it and rechecks `closed` before
each registration; a commit made during a flush schedules a new flush.

`context.ts` defines `DeliveryOrigin = { engine: object; keys: readonly string[]; name: string }`, implemented by the
store's registrations, so `delivery` never imports `store`. `DeliveryContext = { depth, origin, live }`. `runInContext`
sets a module-level `syncContext` for the synchronous part and runs the callback in `storage.run` when storage exists;
`currentContext()` returns `syncContext ?? storage?.getStore()` only while `live.open`. A handler's context lives until
its flush task ends; a loader's run has its own `runLive`, closed in the run's `finally`. In `set`, after validation and
before freezing: with a live context whose origin belongs to this store and follows a changed key, create
`observation.delivery.echo`; otherwise with `context.depth + 1 > 64`, create `observation.delivery.cascade`. Add the
error to the package-wide `reportedByStore` WeakSet (in `context.ts`), report it to this store's `reportError` with the
origin's name and the current revision, then throw; `invoke` does not report it again.

### 7.3 Admission, watch and load (`store/admission.ts`, `watch.ts`, `load.ts`; core.ts 405–642)

Order of checks: spec is an object with function callbacks (`observation.argument.invalid`); snapshot origin
(`observation.snapshot.foreign`); store open (`observation.store.closed`); `resources` structurally valid (`signal` is
an `AbortSignal`; `use`, `child` and `setup` are functions); non-empty `name`; `resources.signal.throwIfAborted()` (its
reason rethrown as it is); duplicate name per store and scope (`observation.subscription.duplicate-name`); per-scope,
then per-store limit (`observation.subscriptions.limit`; keep the prototype's "in N scopes, at most M in one" wording).
A scope is its `Resources` object: `namesByScope: WeakMap<Resources, Set<string>>` per store. Snapshots are branded by
the package-wide `origins: WeakMap<snapshot, { engine, keys, revision }>`; a copy, a hand-built object or a snapshot of
another store or package copy is foreign. Limits are positive safe integers (64 and 8192).

- Watch: attach to the buckets, the registration set and `namesByScope`, then
  `resources.signal.addEventListener("abort", detach, { once: true })`; nothing is registered in the scope. `detach` is
  idempotent, unlinks everything and removes the listener, the only link from the subscriber's scope. If the keys'
  revision is already past the snapshot's, mark dirty and schedule (the commit between `read` and `watch`). A flush
  delivers only when the revision moved past the last delivered one, with a fresh snapshot, in its delivery context.
  Never call back synchronously.
- Load lane: `resources.child({ name: "load:<name>" })` takes its slot synchronously; its `setup` entry `drain` returns
  `closeAndDrain`, and the cleanup receives `{ escalate }`, detaches and drains (a setup rejection with
  `resources.scope.closed` is expected, anything else is reported). One active run and one pending slot: `offer` ignores
  revisions at or below `lastOffered`, records the new one, invokes `onLoading` in the delivery context (the first run
  included), then starts the run or replaces the pending job and aborts the active `AbortController`. A run awaits one
  microtask so `active` is set before user code, skips if already aborted, calls
  `loader(snapshot, Object.freeze({ signal }))` inside `runInContext` with its `runLive`, and delivers `onResult` or
  `onError` only if the lane is open, the signal not aborted, the job the last offered and its revision still the
  store's revision for the keys. The first run uses the newest values.
- `closeAndDrain(escalate)`: close the lane, wait for the active run or `escalate`; after escalation wait one task with
  the captured scheduler and throw `observation.load.still-running` if the run is still active, so resources records a
  failed debt.

### 7.4 Close, reports, testing entry and counter hook (core.ts 358–382, 699–709; runtime/testing.ts)

`close()` is idempotent and synchronous: set `closed`, clear `dirty`, and per live registration report
`observation.source.closed`, detach it (removes the listener, aborts its run) and release it (a load's
`laneScope.control.close()`, voided; it never rejects). Afterwards `set`, `watch`, `load` and the facet's `read` throw
`observation.store.closed`; the owner's `read` keeps working. `createStore` registers `{ [Symbol.dispose]: close }` as
`store:<name>` before it freezes `initial`, so a failing `createStore` freezes nothing. Reports are frozen
`{ source, subscription, revision, cause }`. `invoke` reports a throw with the raw value as `cause`, a returned value as
`observation.callback.returned-value`, and also attaches a reporting rejection handler to a returned thenable.
`reportError` runs in `try`; its throw is rethrown through the captured `queueMicrotask` as an uncaught exception and
delivery continues. A throwing abort listener is not isolated (platform behavior); `abort()` stays in `try`.

`liveSubscriptions(storeOrFacet, resources?)` reads `EngineInfo` from the registry; an unknown object is
`observation.argument.invalid` ("not a store of this package copy"); a closed store has 0. `delivered` and `settled`
await one task through the captured scheduler per round, resolve when the pending counts (of `stores`, or package-wide)
are zero, and reject with `observation.testing.timeout` when `signal` aborted (its reason as `cause`) or the captured
clock passed the deadline. `timeoutMs` defaults to 5000 and accepts `Infinity` only explicitly; `NaN`, zero, negative
values and unknown stores are `observation.argument.invalid`. `registry.ts` holds `EngineInfo` (`stats()`, `liveIn()`,
`pendingFlush()`, `pendingLoads()`), so it never imports `engine.ts`. `storeStats(storeOrFacet)` returns a frozen
`{ commits, visits, indexLookups, deliveries, live, dirty, buckets, walked, loaderCalls, loadsActive, loadsPending }`.
It is exported from `registry.ts` only, never from an entry; counters are always on.

### 7.5 Port versus rewrite

Port the algorithms above. Rewrite the 420-line `createEngine` closure as `StoreEngine`, `WatchRegistration` and
`LoadRegistration` classes with `#` fields, as resources does; the untyped adapter of `runtime/b-snapshot.ts` as typed
internals with one documented cast at the public boundary (brands are type-only); argument validation for every public
call, including non-object specs. Delete every `mutation` and `OBSERVATION_STUB_*` read, the `graveyard` and
`duplicates` arrays, the `watchMode` measurement modes and `releasableEntry`, `pathOf`, and every `TypeError` the
package creates. The facet and the owner `Store` are frozen objects of own arrow-function properties: they are returned
as capabilities, and conformance rejects prototype members. Behaviors the sources do not decide keep the prototype's:
`createStore({})` is accepted, duplicate keys in `read` are deduplicated, `set({})` returns the current revision.

## 8. Types and README

- `api.d.ts.txt` becomes `src/features/store/types.ts`; `snapshotBrand`, `listenerErrorBrand` and `storeValue` stay
  file-local `declare const … : unique symbol`. `ObservationErrorCode` and the `ObservationError` class move to
  `features/errors/errors.ts` (a real class with `name = "ObservationError"`, `readonly code` and `ErrorOptions`).
  `createStore` keeps `<V extends object & Required<V> & FixedKeys<V>>(initial: V, options: StoreOptions): Store<V>`.
  `testing.d.ts.txt` becomes the declarations of `testing/waits.ts`, including `WaitOptions`.
- Fixes: one JSDoc block for `loader`; `Subscription.resources`: "Your module's scope, or a `child()` of it for work
  that ends earlier. Call `watch` and `load` in the module's composition file, which receives `resources`; adapters
  receive values or a consumer-owned port."; `ListenerError.path`: "Present once `@get-modular/resources` provides
  `Resources.path`."
- Explicit types on every export (`isolatedDeclarations`), no enums or parameter properties (`erasableSyntaxOnly`);
  `ReadonlyStore<out V>` and `Store<in out V>` stay; the marker carries the slice check.
- README: title `@get-modular/observation`, no variant or task references (line 170), differences 4 to 7 of section 1.3,
  the abort-listener and `reportError` rules, fail fast with the Host's process policy, "a Host installs one copy",
  `/testing` in tests only, a "Mechanism and trust" paragraph (T77 to T79), and the ADR-0034 known items with owners and
  triggers. Examples keep compiling with the prelude of `raw/api-design/tools/readme-check.mjs.txt`; add a prelude
  declaration only for a name a new example introduces.

## 9. Test plan

Lane "observation" is the lane of Q2 (three OS, Node 26 and 24). M1, M2 and R: MUST before PR 1, PR 2 or the release
pull request merges. Package test paths are under `packages/observation/tests/`. Archived probe IDs: P1 to P26 and PB
(`runtime/probes.test.ts.txt`), R1 to R15 (`runtime-b/probes.test.ts.txt`); each ported test title carries them in
brackets after its T-IDs.

| Archived check | Test | Lane | Level |
| --- | --- | --- | --- |
| `type-tests.ts`, p3, p6, p7, p8, p9 | the six `types*.ts` files via `observation:typecheck` (7.0.2 and 5.8.3, NodeNext and Bundler) | observation | M1 |
| p5 GM contracts, p10 `implement` and `scoped` | `tests/observation/assembly-*-types.ts`, same typecheck | observation | M1 |
| p7 without `exactOptionalPropertyTypes`; controls `b-no-variance-annotation` (passes) and `b-v-in-param` (TS2636) | `type-controls.test.mjs` | observation | M1 |
| `readme-examples` | `tests/observation/readme-examples.test.mjs` | observation | M1 |
| P1, P15, P16, P21, P25, P26, PB; R11, R15; sketch v4 value defects | `store.test.mjs` | observation | M1 |
| P2, P5, P7, P8, P9, P10, P20; R1, R3, R4, R5, R8; 1000 watches on one signal without a process warning | `subscriptions.test.mjs` | observation | M1 |
| P6, P11, P12, P13, P14, P17, P24; R6, R7 | `load.test.mjs` | observation | M1 |
| P18, P19, P22, P23; R9; R13 heartbeat, server, depth and C4; event-loop order probe | `guards.test.mjs` | observation | M1 |
| R10, R12, R14 (W1, W2, `asyncDetection`) | `testing-entry.test.mjs` | observation | M1 |
| P3, P4 and R2 (garbage collection); env-probe; `sync-guards-without-async-context`; ADR subprocess cases | `gc-probe.mjs`, `env-probe.mjs`, `process-probe.mjs` via `processes.test.mjs` | observation | M1 |
| `runtime.mutations`, `runtime-b.mutations` | `mutations.test.mjs` | observation | M1 |
| references, `alternative-h`, `e-sessions` by name, negative controls, every negative task fails | `writer-gate.test.mjs` | observation | M1 |
| ADR-0012 packed root, one instance, `require(esm)`, `dist` source rules | `packed-root.test.mjs` | observation | M1 |
| facet as a capability, real Assembly run and cancellation | `tests/observation/assembly-integration.test.mjs` | observation | M1 |
| installed archives on Node 24 | `tests/node-runtime-compatibility.test.mjs` | governance, `node-24-compatibility` | M1 |
| CMS lint snippet rejects `/testing` outside tests | `tests/assembly/consumer-standard-lint.test.mjs` | assembly | M2 |
| guide example `communication` | `tests/assembly/consumer-standard-examples.test.mjs` | assembly | M2 |
| bounded TEST consumer | outside the repository (section 14) | Phase 3b | R |

Dropped, with the reason in PR 1: variant A (`a-keys`, `a-no-noinfer`, `negative-a-behaviour-1`); `probes/standalone`
and `standalone-f9` (exploration, covered by p9); `probe.tsc7-variance-divergence` (a compiler note for the owner);
`measure-watch-memory.ts` (bytes, not counts); the runtime-b check "is the origin/main build" (setup of the archive
only).

### 9.1 Runtime probes

Tests import the build by relative paths: `../dist/index.js`, `../dist/testing.js` and, for `storeStats` only,
`../dist/features/store/registry.js` (helpers in `support/world.mjs` do the same with `../../dist/`). They never import
the package by name, and no environment variable ever selects the package under test. Port the variant B probes to
`.mjs`: `stats()` becomes `storeStats()`; drivers and `VARIANT` loops disappear (call variant B directly); wall-clock
assertions become counts (W1 asserts the rejection code; a test-level `timeout` guards hangs); P21 asserts `walked`
(appending one row to a frozen 50 000-element array walks two nodes); timing printouts are dropped. Servers listen on
`127.0.0.1` port 0; heartbeats wait for a count of beats with a deadline. Add the sketch v4 regressions: patch accessors
read once, `__proto__` keys kept, a flush that stops after `close()` inside a handler, and every publication recorded so
a stale result in A, B, A never appears. The order probe asserts that an immediate's `nextTick`, promise and
`queueMicrotask` callbacks all run before the next immediate
(`raw/api-design/reviews/critic-adv/bunprobe/order.mjs.txt`).

### 9.2 Process probes

`processes.test.mjs` spawns each probe with `process.execPath`, `NODE_OPTIONS: ""`, cwd the package root derived from
`import.meta.url` (so the same file works in the mutation copy), a 60 s timeout, and asserts exit codes and output,
never durations.

- `gc-probe.mjs <mode>` runs with `--expose-gc` and prints one JSON line `{ "alive": n, "controlAlive": m }`. 200
  subjects and 200 control subjects; references are dropped inside a function scope; collect with up to ten rounds of
  "await one `setImmediate` task, then `gc()`" until `alive` stays equal for two rounds. Asserts `alive <= 2` and
  `controlAlive === 200`. Modes: `subscriber-closed` (P3: handlers of closed subscriber scopes; control: open scopes),
  `store-closed` (P4, R2: closed stores followed by one open, referenced subscriber scope; control: open stores).
- `env-probe.mjs <mode>` runs as `node --import ./tests/env-setup-<mode>.mjs tests/env-probe.mjs <mode>`, so the
  environment is prepared before the static imports evaluate. `fake-before`: a delivery runs and
  `delivered({ stores, timeoutMs: 2000 })` resolves; `asyncDetection` is true. `no-builtin-module`: a delivery through
  the global `setImmediate`; `asyncDetection` false; a synchronous echo is caught at the first round. `no-node`: a
  delivery through `setTimeout`; `asyncDetection` false; a synchronous echo caught at the first round; a synchronous
  ping-pong across two stores stopped with `observation.delivery.cascade`. Each prints `ok <mode>` and exits 0.
- `process-probe.mjs <mode>`: `echo-exit` (a handler calls an async function without awaiting it; the function awaits
  once and then sets the followed key; exit code 1; stdout has exactly one `REPORT observation.delivery.echo` line
  printed by `reportError`); `abort-listener` (a loader adds an abort listener that throws `listener boom`; a
  `process.on("uncaughtException")` handler records errors; a change aborts the run; a second subscription on another
  key still receives a later revision; prints JSON, exit 0, exactly one recorded `listener boom`);
  `abort-listener-unhandled` (the same without the handler: exit code 1, stderr has `listener boom`);
  `throwing-reporter` (`reportError` throws `reporter boom` on a handler failure: exit code 1, stderr has
  `reporter boom`); `import-idle` (imports both entries; `process.getActiveResourcesInfo()` has no `Immediate` and no
  `Timeout`; exit 0).

### 9.3 Mutation check

`tests/mutations/defects.mjs` exports an array of `{ id, file, find, replace, mayHang }`, `file` relative to `dist/` and
`find` an exact anchor in the built JavaScript. `mutations.test.mjs`:

1. Copies `package.json`, `dist/` and `tests/` (without `writer-tasks/`) into `<tmp>/observation/`, and creates the
   junction `<tmp>/observation/node_modules/@get-modular/resources` to `packages/resources`, so the copied tests'
   relative imports reach the copied build.
2. Runs `node --test` on the copied `store`, `subscriptions`, `load`, `guards`, `testing-entry` and `processes` test
   files: the unmodified copy must pass, otherwise the harness is broken.
3. Per defect: a fresh copy; asserts that `find` occurs exactly once in `file`; replaces it; runs the same files with a
   120 s timeout. Caught means at least one failing test, or a timeout when `mayHang` is set.
4. Runs defects with concurrency `Math.max(1, availableParallelism() - 1)`, prints which tests failed per defect, fails
   if any defect is not caught.

| Defect (16 of `tools/mutations*.sh.txt`, two from `RATIONALE.txt`) | Expected to be caught by |
| --- | --- |
| `leak-detached`: detached registrations stay in a module-level array | GC probes P3, P4 |
| `no-key-index`: `set` visits every registration | P7, R4 counters |
| `unbounded-dirty`: one buffered entry per commit | P5, R3 counters |
| `queue-loads`: every change queues its own run | P6, P24, R3 |
| `late-detach`: no abort listener on `resources.signal` | P2, P20, R1, R5 |
| `no-name-check`: duplicate names accepted | P8, R5 |
| `publish-stale`: `isCurrent` always true | P6, P11, P12, P14, P17, R6, R7 |
| `compare-last-offered`: result compared with the last offered run, not the store | P17, R7 |
| `no-loading-signal`: `onLoading` never called | P17, R7 |
| `no-cascade-guard`: depth bound not enforced | P19, P23, R9 |
| `retain-after-close`: `close()` keeps listeners and lane scopes | GC probe P4, R2 |
| `no-scope-limit`: per-scope limit not enforced | P8, R5 |
| `no-echo-guard`: echo check skipped | P18, P22, R9 |
| `no-async-context`: AsyncLocalStorage not obtained | P22, P23, R14 |
| `facet-read-after-close`: the facet's `read` works after close | P25, R11 |
| `unbounded-context`: `live.open` ignored | R13 |
| `global-timers-only`: the scheduler ignores `node:timers` | env-probe `fake-before` |
| `rewalk-frozen`: frozen nodes walked again | P21 (`walked`) |

Catching a defect with other tests than expected is fine; record the actual list in the PR.

### 9.4 Writer-task gate

`writer-gate.test.mjs` builds one temporary project:

- `<tmp>/package.json` `{ "type": "module" }`; junctions `<tmp>/node_modules/@get-modular/observation` and
  `@get-modular/resources` to the package roots (Node resolves real paths, so the solution and the harness share one
  instance).
- Per set, `<tmp>/<set>/` gets, with the `.txt` removed: `<task>.types.ts`, `<task>.accept.ts`, the fake as
  `<task>.types.js`, `<task>.scenario.mjs`, `harness.mjs` and the solution `<task>.ts`.
- `harness.mjs.txt` is the archived harness with three edits: it imports `createStore` from `@get-modular/observation`,
  the waits from `@get-modular/observation/testing` and `storeStats` as `stats` from
  `../node_modules/@get-modular/observation/dist/features/store/registry.js`; it no longer reads adapter and core paths
  from `argv`; its variant A branch is removed.
- Gates per solution, as `check.sh.txt` runs them: `rules` (`support/static-rules.mjs`) and `compile` always;
  `behaviour` only when `compile` passed. Compile: one `tsc` run per compiler over all sets, options of
  `raw/api-design/tsconfig.base.json.txt`, errors attributed per file to their set and task. Behaviour:
  `node --expose-gc <task>.scenario.mjs` in `<tmp>/<set>/`, 30 s timeout, pass on exit 0.

`writer-tasks/manifest.json` (expected failing gates; `null` means any):

```json
{
  "sets": [
    { "dir": "reference", "expect": "pass", "tasks": ["a-logger", "b-catalog", "c-pricing-context", "d-greeter", "e-async-factory", "e-sessions", "f-watch-and-load", "g-hierarchy", "h-requests", "i-errors"] },
    { "dir": "alternative", "expect": "pass", "tasks": ["h-requests"] },
    { "dir": "negative-b-behaviour-1", "expect": "fail", "gates": { "a-logger": ["behaviour"], "b-catalog": ["behaviour"], "c-pricing-context": ["behaviour"], "d-greeter": ["behaviour"], "e-async-factory": ["behaviour"], "e-sessions": null, "f-watch-and-load": ["behaviour"], "g-hierarchy": ["behaviour"], "h-requests": ["behaviour"], "i-errors": ["behaviour"] } },
    { "dir": "negative-b-behaviour-2", "expect": "fail", "gates": { "e-async-factory": ["behaviour"], "g-hierarchy": ["behaviour"], "h-requests": ["behaviour"], "i-errors": ["behaviour"] } },
    { "dir": "negative-b-behaviour-3", "expect": "fail", "gates": { "h-requests": ["behaviour"] } },
    { "dir": "negative-b-behaviour-4", "expect": "fail", "gates": { "h-requests": ["behaviour"] } },
    { "dir": "negative-b-behaviour-5", "expect": "fail", "gates": { "e-async-factory": ["behaviour"] } },
    { "dir": "negative-b-behaviour-6", "expect": "fail", "gates": { "e-async-factory": ["behaviour"] } },
    { "dir": "negative-b-behaviour-7", "expect": "fail", "gates": { "h-requests": ["behaviour"] } },
    { "dir": "negative-rules-compile", "expect": "fail", "gates": { "a-logger": ["compile"], "b-catalog": ["rules", "compile"], "d-greeter": ["rules", "compile"] } }
  ]
}
```

The test asserts that every pass set passes all gates and that every negative task fails exactly at its listed gates.

### 9.5 Packed-root test, type tests and controls

Model the packed-root test on `packages/conformance/tests/packed-root.test.mjs`: pack observation and resources with the
pinned pnpm and extract both into `consumer/node_modules/@get-modular/`. Archive: outside `dist/` exactly
`CHANGELOG.md`, `LICENSE`, `README.md`, `package.json`; `dist/index.*` and `dist/testing.*` present; only `.js` and
`.d.ts` in `dist/`. Manifest: `Object.keys(exports)` is `[".", "./testing"]` with the exact carrier shape;
`peerDependencies` exactly `{ "@get-modular/resources": "^<resources version>" }`; no other dependency field; engines
equal the source; not private. Runtime, in consumer scripts run as subprocesses: exact export names of both entries (no
`storeStats`); `require()` of each returns the same namespace as `import`; a store created through the root is counted
by `liveSubscriptions` from `/testing`; a snapshot read through the installed copy is foreign to a second copy extracted
to `consumer/copy/` (`observation.snapshot.foreign`); `import.meta.resolve` stays inside the consumer; `dist/index.js`,
`dist/testing.js`, `package.json` and `unknown` fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`; `tests/semantic-suite.mjs`
passes on the installed copy. Types: a `check.ts` importing both entries and passing a root facet to `liveSubscriptions`
compiles with `typescript` and `typescript-minimum`, NodeNext and Bundler, `skipLibCheck: false`. Source rules on
`dist/**/*.js`: no `process.env`, no `node:` import, `getBuiltinModule` only with `"node:timers"` and
`"node:async_hooks"`, and the import graph of `dist/testing.js` is relative files only.

`type-controls.test.mjs` copies `package.json` and `dist/**/*.d.ts` into `<tmp>/node_modules/@get-modular/observation`,
links resources, writes the test type files with `"../dist/index.js"` and `"../dist/testing.js"` replaced by the package
specifiers, edits one anchor exactly once per control and compiles on both compilers: without `out` in
`ReadonlyStore<out V>`, `types-structural.ts` stays clean; with `watch` in the parameter form
`<K extends Key<V>>(snapshot: Snapshot<V, K>, spec: WatchSpec<Snapshot<V, K>>) => undefined`, `types.ts` fails with
TS2636 errors only, all in the edited declaration; and `types-loose-optional.ts` stays clean with
`exactOptionalPropertyTypes: false`.

### 9.6 Root integration tests and the lint fixture

`tests/observation/assembly-contracts-types.ts` and `assembly-implement-types.ts` port p5 and p10 against the workspace
Assembly, Core and resources. `readme-examples.test.mjs` extracts the `ts` blocks of the package README into a temporary
directory with junctions `node_modules/@get-modular/{core,assembly,resources,observation}` to the workspace packages (as
`tests/assembly/consumer-standard-examples.test.mjs` does), prepends the prelude of
`raw/api-design/tools/readme-check.mjs.txt` and compiles them with `testAssemblyTypes` from
`architecture/tooling/test-assembly-types.mjs`. `assembly-integration.test.mjs`: an owner built with
`implement(..., scoped)` returns `store.readonly()` as a capability; a consumer with a `required` slot watches it;
`prepare`, `run` with an attempt scope, `set`, `delivered`, close: complete report and `liveSubscriptions(facet) === 0`;
`isolate` from conformance accepts the owner (own-property port check); a run cancelled while the consumer awaits
rethrows the Host's reason. PR 2's `consumer-standard-lint.test.mjs` writes the CMS JSON snippet as `.oxlintrc.json` in
a temporary directory with `src/features/a/composition/a.module.ts`, `src/features/a/adapters/outbound/x.ts` and
`src/features/a/composition/a.test.ts`, each importing `@get-modular/observation/testing`, runs
`node node_modules/oxlint/bin/oxlint -c .oxlintrc.json .` and asserts exit code 1 with two `no-restricted-imports`
errors (module and adapter) and none for the test file.

## 10. Traceability matrix

Every normative sentence of ADR-0034 has a row. "Doc only" rows give the reason no test applies. Test titles (or a
comment above a type case) start with the row ID. Reviewers tick the IDs in the PR description.

| ID | ADR-0034 statement | Implemented in | Proven by | PR |
| --- | --- | --- | --- | --- |
| T01 | One optional runtime package `@get-modular/observation` at `packages/observation`. | leaf row; `package.json` | `tests/leaf-package-admission.test.mjs` (observation row); `pnpm governance:check` | 1 |
| T02 | Resources is the only peer, with `workspace:^`; no `dependencies`, `optionalDependencies` or `devDependencies`. | `package.json` | `tests/leaf-package-admission.test.mjs` (manifest rejections); `t/packed-root.test.mjs` | 1 |
| T03 | The package's own tests use the workspace link. | lock importer | `tests/ownership-checkpoint.test.mjs` and the assembly admission check (`expectedLeafImporter`); `pnpm lockfile:peers:check` | 1 |
| T04 | Imports resources by root name only, no Core, Assembly, lifecycle kernel, product or tooling package; Core and Assembly do not import it. | `src/**` | `pnpm governance:check` (leaf source edges, Core and Assembly guard); `pnpm foundation:check` | 1 |
| T05 | Imports no Node built-in module, also not as a type. | `src/**`; `types: []` | `pnpm governance:check`; `t/packed-root.test.mjs` (source rules) | 1 |
| T06 | With `process.getBuiltinModule`, `AsyncLocalStorage` and `setImmediate` come through it at load; elsewhere fallbacks. | `src/features/delivery/platform.ts` | `t/processes.test.mjs` (env modes); `t/testing-entry.test.mjs`; mutations `no-async-context`, `global-timers-only` | 1 |
| T07 | Root and `./testing`, each with the ADR-0012 carrier shape; one current unversioned API. | `package.json` `exports` | `tests/leaf-package-admission.test.mjs`; `tests/governance.test.mjs`; `t/packed-root.test.mjs` | 1 |
| T08 | `./testing` carries no test runner and no test dependency. | `src/testing.ts`, `src/composition/testing.ts`, `waits.ts` | `t/packed-root.test.mjs` (import graph of `dist/testing.js`; no dependency fields) | 1 |
| T09 | Engines equal the supported Node range of the other packages. | `package.json` `engines` | `tests/governance.test.mjs` (`SUPPORTED_NODE_RANGE` over every leaf); `t/packed-root.test.mjs` | 1 |
| T10 | No registry of participants and no hub. | none | doc only: an absence; T13 pins the export list | 1 |
| T11 | One copy per Host; snapshots from another store or another copy fail at run time. | `registry.ts` (`origins`) | `t/store.test.mjs` [PB]; `t/packed-root.test.mjs` (second copy) | 1 |
| T12 | No global or ambient channel; the only ambient state is the internal delivery context, which no API exposes. | `context.ts` | doc only for the absence; T13 pins that no context API is exported | 1 |
| T13 | Root: `createStore`, `ObservationError` and the 15 types; `./testing`: `liveSubscriptions`, `delivered`, `settled`, `asyncDetection`, `WaitOptions`. | `src/index.ts`, `src/testing.ts` | `t/packed-root.test.mjs` (exact runtime names); `t/types.ts` and `t/types-testing.ts` (every type imports) | 1 |
| T14 | `createStore(initial, { name, resources, reportError })`; the key set is that of `initial`. | `store.ts`, `engine.ts` | `t/store.test.mjs` (unknown key in `read` and `set`; option validation) | 1 |
| T15 | Optional properties or an index signature do not compile. | `types.ts` | `t/types.ts`; `t/types-traps.ts` | 1 |
| T16 | Plain data only: accessors, class instances, functions, `Date`, `Map` and `Set` rejected. | `values.ts` | `t/store.test.mjs` (each kind, nested, in `initial` and in `set`) | 1 |
| T17 | The store closes when the owner's scope releases its entry. | `store.ts` | `t/store.test.mjs` (owner scope closed: facet `read` throws `observation.store.closed`) | 1 |
| T18 | The owner's `Store` has `read`, `set`, `readonly` and `close`. | `store.ts` | `t/types.ts`; `t/semantic-suite.mjs` | 1 |
| T19 | `set(patch)` commits the patch keys, keeps the others and returns the revision. | `engine.ts` | `t/store.test.mjs` | 1 |
| T20 | A patch that changes nothing by `Object.is` commits nothing. | `engine.ts` | `t/store.test.mjs` (`NaN`, `-0` and `+0`, same object; `commits` unchanged) | 1 |
| T21 | `set` validates every value first, then takes ownership and freezes in place. | `values.ts` | `t/store.test.mjs` [P21, P26] | 1 |
| T22 | `readonly()` returns the facet other modules receive. | `store.ts` | `t/store.test.mjs` (same frozen object, own properties); `tests/observation/assembly-integration.test.mjs` | 1 |
| T23 | The facet has `read`, `watch` and `load` and no way to write or close. | `store.ts`, `types.ts` | `t/types.ts`; `t/store.test.mjs` (no `set` or `close` at run time) | 1 |
| T24 | The marker rejects another record through aliases, `Readonly`, intersections, containers, `Pick` and hand-written ports with `read`; a wider record serves a narrower slice. | `types.ts` | `t/types-structural.ts`; `tests/observation/assembly-implement-types.ts`; `t/type-controls.test.mjs` | 1 |
| T25 | A port of `watch` alone is still accepted, so dependencies are typed only as `ReadonlyStore<Slice>`. | `types.ts` | `t/types-structural.ts` (pins that it compiles); README rule | 1 |
| T26 | `read(keys)` returns the revision and the frozen values of exactly those keys. | `engine.ts` | `t/store.test.mjs` (keys, frozen, `observation.keys.empty`) | 1 |
| T27 | Snapshots are branded: a hand-built one does not compile; a copied or foreign one fails at run time. | `types.ts`, `registry.ts` | `t/types.ts`; `t/types-runtime-only.ts`; `t/store.test.mjs` [PB] | 1 |
| T28 | A revision is a commit number, not proof of a change; handlers apply idempotently. | `engine.ts` | `t/store.test.mjs` (one revision per effective commit); idempotence is doc only (a handler property) | 1 |
| T29 | `watch` follows every key of the snapshot from its revision; a commit between `read` and `watch`, also across `await`, is delivered. | `watch.ts` | `t/subscriptions.test.mjs` [P1]; writer gate `e-async-factory` | 1 |
| T30 | No separate starting revision and no key list. | `types.ts` | `t/types.ts` (unknown option) | 1 |
| T31 | `load` uses the snapshot for its keys only; the first run uses the newest values. | `load.ts` | `t/load.test.mjs` (commit between `read` and `load`) | 1 |
| T32 | One active run, at most one pending; a change aborts the run; `onLoading` when a newer run is queued; results only if no commit touched the keys since the run started. | `load.ts` | `t/load.test.mjs` [P6, P17, R3, R7]; four mutations | 1 |
| T33 | `resources` is required. | `types.ts`, `admission.ts` | `t/types.ts`; `t/store.test.mjs` (missing or invalid: `observation.argument.invalid`) | 1 |
| T34 | A watch binds to `resources.signal` and detaches when it aborts: scope or ancestor closing, or the constructing run cancelled. | `watch.ts` | `t/subscriptions.test.mjs` [P2, R1]; `tests/observation/assembly-integration.test.mjs` | 1 |
| T35 | Nothing is registered in the scope for a watch. | `watch.ts` | `t/gc-probe.mjs` `store-closed` [P4, R2]; mutation `retain-after-close` | 1 |
| T36 | A load opens `load:<name>` that drains its run; a run still going after escalation is a failed debt. | `load.ts` | `t/load.test.mjs` [P11, P12, P13, P14, R6] | 1 |
| T37 | `name` is required and unique per store within one scope; a duplicate throws. | `admission.ts` | `t/subscriptions.test.mjs` [P8, R5]; `t/types.ts` | 1 |
| T38 | Limits 64 per scope and store, 8192 per store; at the store limit every new subscription fails until released; the message gives scopes and the largest count. | `admission.ts` | `t/subscriptions.test.mjs` [P8, P10, P26, R5] | 1 |
| T39 | Handlers are synchronous and typed to return `undefined`. | `types.ts` | `t/types.ts`; `t/types-traps.ts` | 1 |
| T40 | Each callback is isolated: a throw or returned value is reported with name and revision, stops no other delivery, keeps the subscription. | `engine.ts` (`invoke`) | `t/subscriptions.test.mjs` [P15] | 1 |
| T41 | `ListenerError` is branded; only the store creates reports. | `types.ts` | `t/types.ts` | 1 |
| T42 | `reportError` must not throw; a throw is rethrown as an uncaught exception. | `engine.ts` (`report`) | `t/processes.test.mjs` (`throwing-reporter`) | 1 |
| T43 | A detached subscription is never called again, also mid-delivery; one added during a delivery waits for the next. | `engine.ts` (`flush`) | `t/subscriptions.test.mjs` [P20] and an added-during-delivery case | 1 |
| T44 | Call order within one delivery is deterministic but not part of the contract. | `engine.ts` | doc only: no test may pin the order | 1 |
| T45 | `close()` detaches every live subscription, sends each one `observation.source.closed` and aborts running loads. | `engine.ts` | `t/store.test.mjs` [P4]; `t/load.test.mjs` [P14]; `t/gc-probe.mjs` | 1 |
| T46 | After `close()`, `set`, `watch`, `load` and the facet's `read` throw `observation.store.closed`; the owner's `read` returns the last values. | `engine.ts`, `store.ts` | `t/store.test.mjs` [P25, R11, R15] | 1 |
| T47 | Every package error is an `ObservationError` with an `observation.<area>.<reason>` code; a report keeps the handler's throw as `cause`. | `errors.ts` | `t/store.test.mjs` (a table of every thrown code; `cause` identity) | 1 |
| T48 | An already aborted `resources.signal`: nothing registered, its reason rethrown as it is. | `admission.ts` | `t/subscriptions.test.mjs` [R8] | 1 |
| T49 | `Store` invariant, `ReadonlyStore` covariant; the marker carries the slice check. | `types.ts` | `t/types-structural.ts`; `t/type-controls.test.mjs` | 1 |
| T50 | Deliveries and load runs carry a delivery context. | `context.ts` | `t/guards.test.mjs` (with T51 to T60) | 1 |
| T51 | A live-context commit to a key the delivering subscription follows on the same store fails at once with `observation.delivery.echo`. | `engine.ts` (`set`) | `t/guards.test.mjs` [P18, P22, R9, C4]; mutation `no-echo-guard` | 1 |
| T52 | Other live-context commits are one step deeper; outside any context depth 0; a delivery takes the largest coalesced depth. | `engine.ts`, `context.ts` | `t/guards.test.mjs` [P19] | 1 |
| T53 | A commit deeper than 64 steps fails with `observation.delivery.cascade`. | `engine.ts` | `t/guards.test.mjs` [P19, P23, R9]; mutation `no-cascade-guard` | 1 |
| T54 | A failing commit changes nothing, is reported to the committing store's `reportError`, then throws. | `engine.ts` | `t/guards.test.mjs` (value unchanged; one report; error thrown) | 1 |
| T55 | In a fire-and-forget continuation it is an unhandled rejection that ends a Node process. | platform | `t/processes.test.mjs` (`echo-exit`) | 1 |
| T56 | A Host may choose its own unhandled-rejection policy. | README | doc only: Host policy | 1 |
| T57 | The context is carried synchronously everywhere and through `await` where `AsyncLocalStorage` exists. | `context.ts` | `t/guards.test.mjs` [P22]; `t/processes.test.mjs` (`no-node`) | 1 |
| T58 | It counts only while live: a handler until its delivery task ends, a loader while its run is active. | `context.ts`, `engine.ts`, `load.ts` | `t/guards.test.mjs` [R13] and the order probe; mutation `unbounded-context` | 1 |
| T59 | Work started in a context that commits after the window has depth zero: no false echo. | `context.ts` | `t/guards.test.mjs` [R13 heartbeat, server, depth] | 1 |
| T60 | A loader's window is its whole run: long-lived work it starts that writes a followed key during the run is an echo. | `load.ts` | `t/guards.test.mjs` (pins the documented behavior); README rule | 1 |
| T61 | Delivery runs in a later task. | `engine.ts`, `platform.ts` | `t/subscriptions.test.mjs` [P16] (none during `watch` or after 50 microtasks) | 1 |
| T62 | "A later task" is resolved once at load: `node:timers`, else global `setImmediate`, else a zero-delay timer. | `platform.ts` | `t/processes.test.mjs` (three env modes); mutation `global-timers-only` | 1 |
| T63 | Deferred delivery keeps `set` non-reentrant; one commit reaches many subscriptions once. | `engine.ts` | `t/subscriptions.test.mjs` [P5, P7, R3, R4] | 1 |
| T64 | The root owns no deadline, retry or process control and starts no work that no call asked for; only `./testing` waits have a deadline. | `platform.ts`, `waits.ts` | `t/processes.test.mjs` (`import-idle`); `t/testing-entry.test.mjs` | 1 |
| T65 | A load run is aborted through an `AbortController` the package owns. | `load.ts` | `t/load.test.mjs` (the loader's signal is not `resources.signal`) | 1 |
| T66 | A throwing listener on such a signal is uncaught; the package cannot isolate it. | platform | `t/processes.test.mjs` (`abort-listener`, `abort-listener-unhandled`) | 1 |
| T67 | The same holds for every signal Get Modular packages hand to module code. | CMS | doc only: a rule for module code (section 12.2, rule 7) | 2 |
| T68 | Supported: Node 24 and 26 with asynchronous detection and `setImmediate` ordering. | engines; CI | `observation` lane on both lines; `t/testing-entry.test.mjs`; order probe | 1 |
| T69 | Bun 1.3 observed, not in the admission matrix. | README | doc only: not in the matrix | 1 |
| T70 | Without `getBuiltinModule` or `AsyncLocalStorage`: imports and works with synchronous detection only. | `platform.ts` | `t/processes.test.mjs` (`no-builtin-module`, `no-node`) | 1 |
| T71 | `./testing` gives `liveSubscriptions(facet, resources?)`, `delivered`, `settled` with `stores`, `signal` and deadline, and `asyncDetection`. | `waits.ts` | `t/testing-entry.test.mjs` [R10, R12]; `t/types-testing.ts` | 1 |
| T72 | The deadline is on by default (5000 ms); only an explicit `Infinity` removes it; a signal ends earlier without removing it. | `waits.ts` | `t/testing-entry.test.mjs` [R14 W1] (default deadline, `Infinity`, `NaN`, 0) | 1 |
| T73 | `setImmediate` and the clock are captured at load, so fake timers before or after the import stall nothing; `mock.timers` after import. | `platform.ts` | `t/testing-entry.test.mjs` [R14 W2]; `t/processes.test.mjs` (`fake-before`) | 1 |
| T74 | Without `getBuiltinModule`, fake timers installed before the import can stall deliveries. | `platform.ts` | doc only: a documented limitation | 1 |
| T75 | A module test closes its scopes and asserts `liveSubscriptions(facet) === 0`. | README; CMS | writer gate scenarios; CMS testing rule 11 | 1, 2 |
| T76 | Production code does not import `./testing`. | CMS snippet | `tests/assembly/consumer-standard-lint.test.mjs` | 2 |
| T77 | Mechanism and authority: drain, fencing and readiness meanings; `system-boundary.md` unchanged. | README | doc only; the PR diff leaves `docs/architecture/system-boundary.md` untouched | 1 |
| T78 | Trust: in-process code only; an ignored signal is a debt, not a stop; plugin store reports; no plugin SPI. | README | doc only (the debt itself is T36) | 1 |
| T79 | A dynamic Host closes the plugin's scope or a child at quiesce; no kernel admission check. | README | doc only: Host policy | 1 |
| T80 | Rule 5 of module resource scopes. | CMS | review against section 12.1; ownership digest test | 2 |
| T81 | Rule 6 note. | CMS | review against section 12.1 | 2 |
| T82 | Rule 11 sentence. | CMS | review against section 12.1 | 2 |
| T83 | Read only at construction, or follow one's own slice. | CMS 12.2 rule 1; guide | `tests/assembly/consumer-standard-examples.test.mjs` (`communication`) | 2 |
| T84 | Area contracts with the same facet. | CMS rule 3; guide | the same example | 2 |
| T85 | A child asks through a command port; no module writes another's state. | CMS rule 4; guide | the same example | 2 |
| T86 | `./testing` from test files only; snippet path; fixture rejected by the pinned oxlint. | CMS; snippet | `tests/assembly/consumer-standard-lint.test.mjs` | 2 |
| T87 | The error-code namespaces gain `observation.<area>.<reason>`. | CMS | review | 2 |
| T88 | `Resources.signal` documentation. | resources `types.ts`, README | review; `pnpm resources:check` | 2 |
| T89 | The guide gains a module communication section; the Standard links it. | guide | `pnpm docs:check`; the examples test | 2 |
| T90 | The Standard, its examples and the SDK-growth evidence change in the delivery; pinning consumers review the delta. | CMS; evidence | `pnpm sdk-growth:check`; PR 2 description (V9) | 2 |
| T91 | Reading a durable authority each time stays valid; a store is not a cache. | CMS rule 6 | doc only: guidance | 2 |
| T92 | The packed archive names exactly one 0.x minor of resources. | `workspace:^` | `t/packed-root.test.mjs` | 1 |
| T93 | A resources minor needs its own observation minor changeset. | process | Phase 3a stop condition | 3 |
| T94 | The row declares resources as its only peer and lists after resources. | leaf row | `tests/leaf-package-admission.test.mjs` | 1 |
| T95 | The row lists its subpaths; export checks admit exactly two for this row and one root for the others. | leaf checks | `tests/leaf-package-admission.test.mjs`; `tests/governance.test.mjs` | 1 |
| T96 | The leaf build requires `dist/testing.js` and `dist/testing.d.ts`. | `build-leaf-package.mjs` | `tests/leaf-package-admission.test.mjs` (`leafBuildOutputs`); `pnpm observation:build` | 1 |
| T97 | Packed root: `import` and `require(esm)` for both; deep-import, manifest and unknown-subpath negatives. | — | `t/packed-root.test.mjs` | 1 |
| T98 | The admission entry arrives with the root and implementation; nothing precedes them. | PR 1 | commit 1a adds no row; "a root outside the table stays rejected" stays green | 1 |
| T99 | Public from 0.1.0 through Changesets in the first release pull request; TEST consumer on its archives. | Phase 3 | Phase 3a and 3b done criteria | 3 |
| T100 | Uploads follow ADR-0030's release rules; no unattended publisher. | Phase 3c | doc only: the owner publishes | 3 |
| T101 | Pre-1.0 breaks ship as minors with a changelog entry and a migration note. | `AGENTS.md` | doc only: future releases | later |
| T102 | Not enrolled in `package.public-api-compatibility` or G1. | do-not-touch list | `pnpm sdk-growth:check`; `public-api-compatibility.yaml` unchanged | 1 |
| T103 | Type probes on 5.8.3 and 7.0.2 with NodeNext and Bundler. | tests | `pnpm observation:typecheck` | 1 |
| T104 | Buffers and dispatch probed through an internal counter hook that is not exported. | `registry.ts` | `t/subscriptions.test.mjs` [P5, P7, R3, R4]; `t/packed-root.test.mjs` (no `storeStats` export) | 1 |
| T105 | Every runtime probe runs on each Node line in the Linux, macOS and Windows lanes. | CI | `tests/ci-check-lanes.test.mjs` | 1 |
| T106 | Probes assert counts and order, not wall-clock thresholds. | tests | review: a search for `performance.now` and `Date.now` in the tests finds no elapsed-time assertion | 1 |
| T107 | Mutation check per archived defect, a patched copy each, never a switch. | tests | `t/mutations.test.mjs` | 1 |
| T108 | Writer references pass and every negative fails, against the package build. | tests | `t/writer-gate.test.mjs` | 1 |
| T109 | Subprocess tests for the echo exit, the abort listener and `reportError`. | tests | `t/processes.test.mjs` (T55, T66, T42) | 1 |
| T110 | The packed-root test installs the archive with the resources archive on the supported Node lines. | tests | `t/packed-root.test.mjs` in both Node lanes; `tests/node-runtime-compatibility.test.mjs` | 1 |
| T111 | A bounded TEST consumer passes on the release archives before the release pull request merges. | TEST project | Phase 3b | 3 |
| T112 | Every known item has an owner and a trigger. | README | doc only: listed with links to ADR-0034 | 1 |

## 11. Repository check changes (PR 1)

### 11.1 Leaf checks (Phase 1a)

Add to `architecture/checks/leaf-packages.mjs`:

```js
// A row lists its export subpaths; "." maps to dist/index, "./<name>" to dist/<name>.
export const leafSubpaths = leaf => leaf.subpaths ?? ["."];
const subpathFile = subpath => (subpath === "." ? "index" : subpath.slice(2));
export const expectedLeafExports = leaf => Object.fromEntries(leafSubpaths(leaf).map(subpath => {
  const file = subpathFile(subpath);
  return [subpath, { import: { types: `./dist/${file}.d.ts`, default: `./dist/${file}.js` }, default: `./dist/${file}.js` }];
}));
export const leafEntrySources = leaf => leafSubpaths(leaf).map(subpath => `${leaf.root}/src/${subpathFile(subpath)}.ts`);
export const leafBuildOutputs = leaf => leafSubpaths(leaf)
  .flatMap(subpath => [`dist/${subpathFile(subpath)}.js`, `dist/${subpathFile(subpath)}.d.ts`]);
```

`identityProblem` returns `"subpaths"` when `subpaths` is present and is not an array whose first element is `"."`,
whose elements are unique and whose others match `/^\.\/[a-z][a-z0-9-]*$/u`, or when the row is not `PUBLIC`.
`leaf-package-admission.mjs`: compare `manifest.exports` with `expectedLeafExports(leaf)` (message "requires exactly its
row's ESM export subpaths and no deep import") and require every `leafEntrySources(leaf)` file; drop `ROOT_EXPORT`.
`production-artifacts.mjs`: `exportMapViolations(exportsField, publicationBlocked, subpaths)` checks that the keys equal
`subpaths` and validates each subpath with the existing carrier rules (labels `exports["<subpath>"]`, the `.` messages
unchanged); `manifestCarrierViolations` passes `leafSubpaths` of the row, or `["."]` for Core and Assembly.
`build-leaf-package.mjs`: `access` every `leafBuildOutputs(leaf)` path under the package root. Tests in
`tests/leaf-package-admission.test.mjs`: fixtures from `expectedLeafExports`; a synthetic row with `./testing` that is
admitted only with both exports and both `src` entries; invalid `subpaths` values rejected.

### 11.2 The observation row (Phase 1d)

Append after the conformance row:

```js
  Object.freeze({
    id: "observation",
    name: "@get-modular/observation",
    root: "packages/observation",
    publication: PUBLIC,
    // ADR-0034: public 0.x; 0.0.0 only until the first Changesets release; 1.0.0 needs a decision.
    version: /^0\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u,
    peers: Object.freeze(["@get-modular/resources"]),
    // ADR-0034 is the ADR-0012 successor decision for this row's second subpath.
    subpaths: Object.freeze([".", "./testing"]),
    decision: Object.freeze({
      id: "ADR-0034",
      path: "docs/decisions/0034-admit-the-module-change-observation-package.md",
      fileDigest: "sha256:<section 2, check 2>",
      immutableDigest: "sha256:<section 2, check 2>",
    }),
    extension: Object.freeze({
      id: "module-change-observation",
      authority: "docs/decisions/0034-admit-the-module-change-observation-package.md",
    }),
    requiredTests: Object.freeze([
      "packages/observation/tests/store.test.mjs",
      "packages/observation/tests/guards.test.mjs",
      "packages/observation/tests/mutations.test.mjs",
      "packages/observation/tests/writer-gate.test.mjs",
      "packages/observation/tests/packed-root.test.mjs",
    ]),
    commands: Object.freeze({
      "observation:build": "node architecture/tooling/build-leaf-package.mjs observation",
      "observation:typecheck":
        "node node_modules/typescript/bin/tsc -p packages/observation/tsconfig.json --noEmit"
        + " && node node_modules/typescript/bin/tsc -p packages/observation/tsconfig.types.json --noEmit"
        + " && node node_modules/typescript/bin/tsc -p packages/observation/tsconfig.types.bundler.json --noEmit"
        + " && node node_modules/typescript-minimum/bin/tsc -p packages/observation/tsconfig.types.json --noEmit"
        + " && node node_modules/typescript-minimum/bin/tsc -p packages/observation/tsconfig.types.bundler.json --noEmit",
      "observation:test": "node --test packages/observation/tests/store.test.mjs packages/observation/tests/subscriptions.test.mjs"
        + " packages/observation/tests/load.test.mjs packages/observation/tests/guards.test.mjs"
        + " packages/observation/tests/testing-entry.test.mjs packages/observation/tests/processes.test.mjs"
        + " packages/observation/tests/type-controls.test.mjs tests/observation/assembly-integration.test.mjs"
        + " tests/observation/readme-examples.test.mjs",
      "observation:evidence":
        "node --test packages/observation/tests/mutations.test.mjs packages/observation/tests/writer-gate.test.mjs",
      "observation:pack": "node --test packages/observation/tests/packed-root.test.mjs",
      "observation:check": "pnpm observation:build && pnpm observation:typecheck && pnpm observation:test"
        + " && pnpm observation:evidence && pnpm observation:pack",
    }),
    gate: "observation:check",
  }),
```

Root `package.json`: the same six scripts with the same strings; `"@get-modular/observation": "workspace:*"` in
`devDependencies`; `pnpm observation:check` right after `pnpm conformance:check` in `check` and `check:fast`. Then
`pnpm install` writes the importer that `expectedLeafImporter` expects. `tests/leaf-package-admission.test.mjs` gains an
observation row test in the style of the conformance one (peers, subpaths, required tests, command names, order after
resources) and a pin that only `observation` lists subpaths; `tests/governance.test.mjs` gains three cases: an
observation manifest with `./testing` passes, without it fails, and a conformance manifest with `./testing` fails.

### 11.3 CI

In `.github/workflows/ci.yml`, the shared matrix gains the row below; `observation:build` goes right after
`conformance:build` in the core, assembly, governance and static rows and right after `conformance:check` in the
packaging row; the `node-24-compatibility` job gains `pnpm observation:build` after `pnpm conformance:build` and
`pnpm --dir packages/observation pack --pack-destination "$RUNNER_TEMP/node24-pack"` after the conformance pack line.

```yaml
          - lane: observation
            scripts: runtime:preflight governance:check assembly:build lifecycle:build resources:build conformance:build observation:check
```

`tests/ci-check-lanes.test.mjs`: `observation:check` after `conformance:check` in `baseline`;
`primary.observation = ["observation:check"]`; `observation:build` in the allowed scripts; the setup rule becomes
"runtime:preflight, assembly:build, governance:check (except governance), and the build of every leaf whose `:check` is
not in the lane's primary"; the order rule gains "`observation:build` is at `lifecycle + 3`" for the core, assembly,
governance and static lanes. `tests/node-runtime-compatibility.test.mjs`: `observation` in `packageNames`; the consumer
imports both entries, checks their names, `require` identity, the negative subpaths (`dist/index.js`, `dist/testing.js`,
`package.json`, `unknown`) and one delivery awaited with `delivered()`.

### 11.4 FMS profile and Foundation policy

`architecture/feature-module-standard-profile.json` gains, after each conformance entry: `"packages/observation/src"` in
`productionRoots`;
`{ "id": "observation", "moduleRoot": "packages/observation", "sourceRoot": "packages/observation/src" }` in
`productionModules`; the `abstractLayout` module with `featuresRoot` `packages/observation/src/features`,
`moduleComposition` `packages/observation/src/composition`, `publicEntrypoint` `packages/observation/src/index.ts` and
`testRoot` `packages/observation/tests`; and the extension
`{ "id": "module-change-observation", "authority": "docs/decisions/0034-admit-the-module-change-observation-package.md" }`.
`tests/feature-module-standard-profile.test.mjs` gains the same root and module.

`architecture/foundation/source-dependencies.yaml`: `packages/observation` in `packageRoots`; `packages/observation/src`
and `packages/observation/tests` in `governedRoots`; these boundaries after the conformance ones (every `allow` key not
shown is `[]`; `S` stands for `packages/observation/src`):

```yaml
  - id: observation-errors          # roots and entrypoints: S/features/errors/errors.ts
  - id: observation-delivery        # roots and entrypoints: S/features/delivery/platform.ts, context.ts, pending.ts
  - id: observation-store           # roots: the nine files of S/features/store/; entrypoints: types.ts, registry.ts, store.ts
    # allow: boundaries [observation-errors, observation-delivery]; packages ["@get-modular/resources"]
  - id: observation-testing         # roots and entrypoints: S/features/testing/waits.ts
    # allow: boundaries [observation-errors, observation-delivery, observation-store]; packages ["@get-modular/resources"]
  - id: observation-composition     # roots and entrypoints: S/composition/root.ts, S/composition/testing.ts
    # allow: boundaries [observation-store, observation-testing]
  - id: observation-public-entrypoint     # packageExports ["."]; roots and entrypoints: S/index.ts
    # allow: boundaries [observation-composition, observation-errors, observation-store]
  - id: observation-testing-entrypoint    # packageExports ["./testing"]; roots and entrypoints: S/testing.ts
    # allow: boundaries [observation-composition, observation-testing]
  - id: observation-development     # dependencyMode development; roots: packages/observation/tests
    # entrypoints: every .mjs and .ts file of tests/ (not .txt); allow: packages ["@get-modular/resources"];
    # builtins: node:assert/strict, node:child_process, node:fs/promises, node:http, node:module, node:os,
    # node:path, node:test, node:url (add only what a test really imports)
```

Write each boundary in the full form of the resources boundaries (explicit `roots`, `entrypoints` and the four `allow`
lists); the comments above only give the content. Add `"@get-modular/observation"` to the packages of
`repository.development`. Add the observation entries next to conformance in
`architecture/foundation/quality-source-coverage.yaml` (`packages/observation/tsconfig.json`),
`suppression-governance.yaml` (`packages/observation/src`) and the `fullScanPaths` of `repository-agent-workflow.yaml`
(`packages/observation/tsconfig.json`, `package.json`, `tsconfig.types.json`, `tsconfig.types.bundler.json`).

### 11.5 Do not touch

`architecture/public-api/**`, `architecture/foundation/public-api-compatibility.yaml` (no G1 enrolment),
`architecture/sdk-growth/status.json`, `architecture/contracts/**`, `architecture/checks/release-owned-files.mjs`
(nothing here is release-owned; run its check) and `docs/architecture/system-boundary.md` (the ADR keeps it).

### 11.6 Documentation listing (Phase 1e)

`README.md`: after the conformance bullet add "- [`@get-modular/observation`](packages/observation/README.md) gives
modules state with one writer: the owner creates a store, other modules receive a read-only facet and follow the keys
they read with `watch` or `load`, bound to their own resource scope. Resources is its only peer; Core and Assembly do
not import it." and name the observation archive in the Node 24 compatibility sentence (line 14).
`docs/architecture/feature-module-standard.md`: in "Scope mapping" add "and `ADR-0034` the optional public observation
module"; in "Local extensions" add "- The observation package has the features errors, delivery, store and testing, thin
`src/composition/root.ts` and `src/composition/testing.ts` seams, the curated root export `src/index.ts` and a second
curated surface `src/testing.ts` for `./testing`, the `testing` public module surface of FMS v1. Its only package is the
resources peer, imported by root name, and it imports no builtin. Its Assembly integration tests live in root
`tests/observation`."; in "Enforcement" add ADR-0034 to the list of admitting decisions.

## 12. Consumer Module Standard and documentation (PR 2)

Edits in `docs/architecture/common-assembly.md` unless named otherwise. Add `ADR-0034` to `related`. The blocks below
are the exact replacement text.

### 12.1 Module resource scopes, rules 5, 6 and 11

```markdown
5. Subscribe in your own scope, through an API that takes your `resources` and binds to `resources.signal`, such
   as `watch` and `load` of `@get-modular/observation`. Work shorter than the module subscribes in a `child()`
   scope that it closes when the work ends. A provider API that still returns a disposer is wrapped as
   `{ [Symbol.dispose]: unsubscribe }` and registered with `resources.use`.
6. Running work is not a resource. Register dependencies, then the drain set, then the subscription, so release
   runs unsubscribe, drain, close; or make each operation a `child()`. A subscription bound to the scope's signal
   detaches before any cleanup, whatever its registration order; the order applies to subscriptions released by a
   disposer.
11. Domain and application code never sees `Resources`; only the composition or adapter layer of the module does.
    Only the `scoped` adapter reads `FactoryContext.scope`; never cast it. `watch` and `load` are called in the
    module's composition file, which receives `resources`; adapters receive values or a consumer-owned port,
    because domain and application code never see `Resources` and the lint snippet in
    [Feature layout and implementation form](#feature-layout-and-implementation-form) keeps `@get-modular/*` out
    of `adapters/`.
```

### 12.2 New subsection after "Module resource scopes"

```markdown
### Module communication

[ADR-0034](../decisions/0034-admit-the-module-change-observation-package.md) admits the optional
`@get-modular/observation` package: state with one writer, read-only facets and subscriptions owned by the
subscriber's scope. Core and Assembly do not import it; a module that does not follow changes needs nothing from
it. The [module authoring guide](../guides/module-authoring.md#21-module-communication) shows each rule.

1. A module that needs a value only at construction reads it and does not follow it. A module that follows a
   value depends on its own slice, typed only as `ReadonlyStore<Slice>`.
2. A store has one writer, its owner. The owner creates it in its own scope, wires `reportError` to the Host's
   error port and hands out `store.readonly()` through an ordinary contract and a `required` slot. Any module may
   own a store, so a parent passes changed data to its children by owning a derived store.
3. An owner publishes a few area contracts, such as theme, logging and region, and hands out the same facet under
   each, so a new key changes only its area's consumers.
4. A child asks its owner for a change through a command port that returns a typed result; the confirmed change
   comes back as new state. A module never writes another module's state.
5. A handler never changes a key its subscription follows, directly or through a command; such a commit fails
   with `observation.delivery.echo`.
6. Reading a durable authority, such as a database or a file, at the moment of each operation stays valid; a
   store is for state that modules follow, not a cache in front of such an authority.
7. A listener that module code adds to a signal a Get Modular package hands out must not throw: the platform
   reports it as an uncaught exception, which no package can isolate.
```

### 12.3 Testing modules, new rule 11

```markdown
11. Import `@get-modular/observation/testing` only from test files; in production code its waits would be a hidden
    global synchronization point between modules. The lint snippet rejects it in every non-test file. A module
    test that uses a store closes its scopes, asserts the store-wide `liveSubscriptions(facet) === 0` and waits
    with `delivered({ stores })` or `settled({ stores })`, never with a tick count.
```

### 12.4 Lint snippet

Add as the first override, and add the same `paths` entry next to `patterns` in the
`contracts/domain/application/adapters` override (a later override replaces the rule; the declaration override's `*`
pattern already covers it):

```json
{ "files": ["src/**/*.ts"], "excludeFiles": ["**/*.test.ts"], "rules": {
  "no-restricted-imports": ["error", { "paths": [
    { "name": "@get-modular/observation/testing", "message": "@get-modular/observation/testing is imported only from test files" }] }] } }
```

### 12.5 Error codes, examples, resources and guide

- "Identify errors by `code`": `assembly.<area>.<reason>`, `resources.<area>.<reason>`, `conformance.<area>.<reason>`
  and `observation.<area>.<reason>`.
- "Executable examples and adoption status": name the lint test and the guide example, and that observation's own tests
  run in `pnpm observation:check`.
- `Resources.signal` in `packages/resources/src/features/scope/types.ts`, and the matching sentence in
  `packages/resources/README.md`: "Aborted when this scope or an ancestor starts closing, or when the run that
  constructs the module is cancelled before its factory settles. It stops acquisition, and subscriptions bound to it
  detach then; it never closes anything." Resources does not name observation.
- `docs/guides/module-authoring.md`, appended so existing anchors stay (ADR-0034 in `related`): section 0, a line
  linking section 21; section 9, the rule 5 summary; section 19, rows for a string-topic bus or mediator, writing
  another module's state, following a raw and a derived value, an event as a store key, and `/testing` in production;
  section 20, checklist lines; new `## 21. Module communication`: 21.1 choosing the mechanism (the catalog's decision
  table), 21.2 owning a store with the compiled example `<!-- module-authoring-example: communication -->` (an owner
  with an area contract and a command port, a consumer that watches and loads its slice, a `node:test` leak check), 21.3
  following a value, 21.4 asynchronous data, 21.5 child to parent, 21.6 parent to child, 21.7 errors, echo and cascades,
  21.8 testing, 21.9 anti-patterns from sections A to F of `raw/practices/practices-catalog-v2.md`.
- `tests/assembly/consumer-standard-examples.test.mjs`: `"communication"` in `guideExamples` and `observation` in the
  junction list of `compileExample`.

## 13. Changesets

`.changeset/add-observation-package.md` (PR 1):

```markdown
---
"@get-modular/observation": minor
---

Add `@get-modular/observation` (ADR-0034): state with one writer, read-only facets and subscriptions owned by the
subscriber's resource scope.

- `createStore(initial, { name, resources, reportError })` creates a store whose key set is fixed by `initial`. The
  owner keeps `read`, `set`, `readonly` and `close`; other modules receive `store.readonly()`, which has `read`,
  `watch` and `load`.
- `watch(snapshot, { resources, name, onChange })` follows exactly the keys of a snapshot from its revision.
  `load(snapshot, { resources, name, loader, onLoading, onResult, onError })` keeps an asynchronous result in step
  with them: one run at a time, stale results dropped.
- Subscriptions bind to the subscriber's `resources.signal` and end when that scope starts closing; a load drains its
  running run in a `load:<name>` child scope.
- Delivery runs in a later task, coalesced, and every callback is isolated: failures go to the owner's `reportError`.
  A handler that changes a key it follows fails with `observation.delivery.echo`; chains deeper than 64 steps fail
  with `observation.delivery.cascade`.
- `@get-modular/observation/testing` gives test files `liveSubscriptions`, `delivered`, `settled` and `asyncDetection`.
- Errors carry stable `observation.<area>.<reason>` codes. `@get-modular/resources` is the only peer dependency.

Authoring surface changed: yes
```

`.changeset/resources-signal-documentation.md` (PR 2, Q4):

```markdown
---
"@get-modular/resources": patch
---

Document that `Resources.signal` also aborts when the run that constructs the module is cancelled before its factory
settles, and that subscriptions bound to the signal detach then. No API or behavior change.

Authoring surface changed: no
```

Standing ADR rule (T93): a resources minor needs its own observation minor changeset in the same release, because
Changesets 3.0.2 gives an out-of-range peer dependent only a patch.

## 14. Bounded TEST consumer

- Location: V10.
- Inputs: the release head's exact archives (observation 0.1.0, resources per Q4, Core and Assembly 0.5.0, conformance
  0.3.0), SHA-256 checked, installed from the tarballs offline with engine checks; Node 24.21.0 and 26.11.1; TypeScript
  5.8.3 and 7.0.2. The fixtures come from `packages/observation/tests/writer-tasks/**` and
  `tests/support/static-rules.mjs` at the release head; record that commit.
- Checks, bounded and without network: (1) the writer gate of section 9.4 against the installed archives instead of
  junctions; (2) one composition of a settings owner with area contracts and the `a-logger`, `b-catalog` and
  `c-pricing-context` references as `implement(..., scoped)` entries in a group under one root: `prepare`, `run` with an
  attempt scope, a settings change delivered, close complete, `liveSubscriptions(facet) === 0` for every store; (3)
  `smoke` from conformance over that root (facets pass the port check); (4) typecheck of (2) on both compilers, NodeNext
  and Bundler, `skipLibCheck: false`; (5) `asyncDetection === true`; (6) the CMS lint snippet rejects a non-test
  `/testing` import; (7) an echo in a fire-and-forget continuation ends a child process with exit code 1 after one
  report.
- Output: a record of archive hashes, OS, Node and TypeScript versions and per-check results, summarized in the release
  intent ("Consumer checks on these bytes"). A failure stops these archives; fix on `main`, regenerate, run again.

## 15. Questions a fresh agent will ask

1. **Where does the scheduler live?** `src/features/delivery/platform.ts` resolves "a later task" once at load;
   `StoreEngine.schedule()` in `src/features/store/engine.ts` queues the flush and the closing immediate per store;
   `src/features/delivery/pending.ts` counts scheduled flushes and loads for the waits.
2. **How does `./testing` reach internal state without exporting it?** `src/testing.ts` re-exports
   `src/composition/testing.ts`, which re-exports `src/features/testing/waits.ts`; `waits.ts` imports
   `src/features/store/registry.ts` and `src/features/delivery/pending.ts`, the same files the root reaches through
   `store.ts`. ESM loads each file once per installed copy; `packed-root.test.mjs` proves it.
3. **How do I run two compilers?** `node node_modules/typescript/bin/tsc` (7.0.2) and
   `node node_modules/typescript-minimum/bin/tsc` (5.8.3, an npm alias in the pnpm catalog). Bundler comes from
   `tsconfig.types.bundler.json` or the flags `--module ESNext --moduleResolution Bundler`. In tests,
   `support/compilers.mjs` resolves both with `createRequire(<workspace>/package.json).resolve("<name>/package.json")`;
   root tests use `testAssemblyTypes`.
4. **How do I write a GC probe that is stable on Windows?** Run it in its own process with `--expose-gc` (section 9.2):
   many subjects, a retained control, references dropped inside a function scope, collection rounds that await a
   `setImmediate` task before each `gc()` (`WeakRef` targets are cleared only after the current job), a stable-count
   stop, a small tolerance, and no timing.
5. **How do I apply mutations without switches?** Patch a copy of `dist/` by exact anchor and run the copied tests
   against it (section 9.3). The shipped code never reads an environment variable or a flag.
6. **A prototype probe assumes stub internals. What now?** `stats()` becomes `storeStats()`; drivers and `VARIANT` go;
   `OBSERVATION_STUB_*` modes are dropped; "is the origin/main build" is dropped. If a probe needs a number `storeStats`
   lacks, add an internal counter to `Stats` (never a public export, never a cast to private fields) and say so in the
   PR.
7. **Package test or root test?** A test that imports Assembly, Core or conformance lives in `tests/observation/`;
   everything else in `packages/observation/tests/`, importing the build by relative path.
8. **May I change a public type or name?** No, apart from section 8. Anything else: STOP (Phase 1b).
9. **Which error messages are fixed?** Codes always; text only where a test matches it: the per-store limit ("in N
   scopes, at most M in one") and "not a store of this package copy".
10. **The lint or the typecheck rejects a pattern. May I suppress it?** No: `reportUnusedDisableDirectives` is an error
    and no waivers exist. Rewrite the code.
11. **Why `.txt` fixtures?** Their relative imports resolve only inside the temporary project; as `.ts` they would be
    parsed by Foundation, lint and the typecheck in place and fail.
12. **Which Node do I use locally?** 26.11.1 by default and 24.21.0 for the Node 24 line, from existing installations;
    do not install Node versions globally.
13. **How do environment probes set up the runtime before the package loads?** With a preload:
    `node --import ./tests/env-setup-<mode>.mjs tests/env-probe.mjs <mode>`; no dynamic import is needed.
14. **What do I do when a writer negative fails at a different gate?** STOP and report the gate table; never edit the
    manifest to match (V7).
15. **What if Windows CI is slower than 13 minutes allow?** Batch compiler runs and raise test concurrency; then split
    the `observation` lane in two and update `tests/ci-check-lanes.test.mjs`; never raise `timeout-minutes`.
16. **Who merges and who publishes?** Merging needs the lead's explicit permission (V13); publishing is the owner's step
    (Phase 3c).
17. **What if the sources do not decide a behavior?** Keep the prototype's behavior (section 7.5), add no rule, and list
    it in the PR.

## 16. Risks and stop conditions

| Risk | Detection | Action |
| --- | --- | --- |
| Event-loop order differs on a platform (Windows) | The order probe or R13 fails on one OS | STOP; never weaken the probe. Report OS, Node version and output; a real difference needs an ADR change to the supported environments. |
| GC flakiness | A GC probe fails, then passes on rerun | Raise the rounds within the bound, keep counts and the retained control; never retry or skip in CI. Still flaky: STOP with the data. |
| `getBuiltinModule` missing in a test runner | `asyncDetection` false; R14 fails | Our CI uses `node:test` only. For consumers it is a known item; the README shows a preset asserting `asyncDetection`. |
| pnpm or Changesets peer behavior | `pnpm lockfile:peers:check` fails; `pnpm changeset status --verbose` shows an unexpected bump; the packed peer range is not `^<resources version>` | Rewrite the importer with `pnpm install`, never by hand; add the observation minor whenever resources goes minor. |
| Checks that assume one root | `governance:check`, `governance:test`, `foundation:check` or `architecture:feature-module-profile:test` fail on `./testing`; `rg -n "ROOT_EXPORT" architecture tests` | Make the check row-driven (section 11.1); never weaken a rule for all rows. |
| Foundation reads `process.getBuiltinModule` as a builtin reference | `pnpm foundation:check` fails on an observation boundary | STOP; do not add `node:*` to any production allow list; report to the lead. |
| Windows lane time | The `observation` lane above 13 minutes | Question 15. |
| Size of PR 1 | `git diff --stat origin/main...HEAD` above about 8000 lines without fixtures | Take the three-pull-request fallback of Q1. |
| Lint limits | `pnpm lint:typed` reports `max-lines`, `max-lines-per-function` or `complexity` | Split by responsibility (section 6); no suppressions. |
| A writer fixture fails for the wrong reason | A negative task fails at another gate than recorded | Question 14. |

## 17. Definition of done

1. ADR-0034 is on `main`; PR 1 and PR 2 are merged with clean independent reviews and green CI on every lane.
2. Every M1 and M2 row of section 9 passes on Ubuntu, macOS and Windows with Node 24 and 26.
3. Every row of section 10 is ticked: its test exists and passes, or it is doc only with the reason given.
4. Exactly `.` and `./testing` with the ADR-0012 carrier shape, one instance across both, no dependency but the
   resources peer, no Node built-in import and no `process.env` in `dist/`.
5. Every defect of section 9.3 is caught; every writer reference passes and every negative fails at its gate.
6. Section 12 and Q3 are done, and every pinning consumer has its outstanding work recorded.
7. The release pull request ships observation 0.1.0 (and resources 0.1.1 per Q4) only after the TEST consumer passed on
   its exact archives; the archives and record are retained; publication stays with the owner.
8. The README lists the ADR-0034 known items with owner and trigger; nothing out of scope (section 1.1) was added.
