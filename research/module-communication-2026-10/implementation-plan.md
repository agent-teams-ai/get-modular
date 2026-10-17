<!-- cspell:ignore Valtio Builtin builtins behaviour bunprobe immediates microtask microtasks mjs nodenext oxlint oxlintrc realpath rewalk subpath subpaths -->

# Implementation plan: `@get-modular/observation` 0.1.0

Planning document for the implementing track, revised on 2026-10-17 against get-modular `main` at
`132317e14bbc01b788e56b8e4f21c381b3277262`, the ADR-0034 text of pull request #154 at
`945e9a151a516ce4ce6e73b6e18893d4e5b27cfe`, and the reviewed corrections in pull request #183 at
`cfdaa18f152aac614194be710a474f4d4b06f59a` (section 2.2). Pull request #182 is merged; #154 and #183 were still open at this review.
The owner then requested incorporation of the ten-critic API/watch study, TypeScript 7.0.2 or newer, and three
rounds of three independent plan critics. Their dispositions belong to [plan-review.md](plan-review.md).
This is an implementation plan, not package implementation or completed admission evidence.

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
higher one wins and the pull request description records the difference. The explicit owner instruction of
2026-10-17 raises the compiler floor to 7.0.2 (section 2.3); it is authorization for that change, not a claim that
the old ADR, active compiler routes or archived evidence have already been migrated. The corrective obligations
in sections 7 to 9 refine the selected types/prototype under the ADR contract; a contradictory archived
expectation remains historical and cannot override the reviewed correction. A genuine semantic change follows
the owner route in section 1.4.

### 1.3 Recorded differences between sources

| # | Where | Difference | Resolution |
| --- | --- | --- | --- |
| 1 | Brief vs ADR | The brief asks for one pull request; the ADR says the Standard changes "in the delivery that adds the package". | Two consecutive pull requests, both merged before the release pull request (Q1). |
| 2 | Old brief and plan vs current ADR | The earlier instruction to change the CMS SDK-growth evidence is obsolete. The current ADR explicitly preserves that frozen observation; `validateP0Evidence` pins its historical fields and reads its historical CMS commit. Current CMS bytes have a separate pin in `tests/ownership-checkpoint.test.mjs`. | Q3: preserve the entire SDK-growth evidence file; update only the reviewed current CMS pin and describe the consumer delta. |
| 3 | ADR vs prototype | The ADR requires one internal deferral queue per package copy; the prototype registers per-store task pairs directly with the captured scheduler. | Put one private FIFO behind `delivery/context.ts`'s `later`. Enqueue and immediately register one native task per callback, removing exactly one queue item per native task. Preserve each store's consecutive flush/context-close pair and coalescing; do not batch callbacks or wait for a previous task to finish before scheduling the next. Nothing is public or configurable. |
| 4 | Types and README vs ADR | `Subscription.resources` JSDoc and README line 37 say "composition or adapter code". | Rule 11: "in the module's composition file" (known fix of the brief). |
| 5 | Types vs brief | `loader` has two JSDoc blocks in a row. | Merge them (known fix). |
| 6 | README vs ADR | "Bun verified". | ADR wording: Bun 1.3 observed to behave the same except for unhandled rejections; not in the admission matrix. |
| 7 | Types and prototype vs ADR known item | `ListenerError.path` "planned in resources 0.2"; the prototype reads `resources.path` by duck typing. | Keep `path?` in the type, never set it in 0.1.0, no duck typing. |
| 8 | Prototype vs ADR | `TypeError("not a store of this stub")`, `setTimeout` in the drain, global `queueMicrotask`, `OBSERVATION_STUB_*` switches. | Every package error is an `ObservationError`; the drain and the rethrow use the scheduler and microtask function captured at load; the timer fallback also captures its function at load; no switch of any kind (mutations patch a copy, section 9.3). |
| 9 | Prototype probes vs ADR | W1 asserts elapsed time below 2 s; probe 21 measures milliseconds. | Counts and order only (section 9). |
| 10 | `CMS-RULE5-DRAFT.txt` vs ADR | The draft predates the ADR. | ADR wording only (section 12). |
| 11 | CMS snippet vs ADR | A later oxlint override replaces `no-restricted-imports` for its files, and `@get-modular/*` does not match a two-segment subpath. Verified on 2026-10-17 with oxlint 1.83.0: an `adapters/` file could then import `/testing`. | The `paths` entry goes into a new override and into the layer override (section 12.4). |
| 12 | Original archive vs subsequent review | The original callback context, global clock and `FixedKeys` admitted the defects reproduced in #183; the synchronous loader also needs its context entered after the startup await. | Sections 7 to 9 include the corrected algorithms and R16/R17, fake-clock and mixed-key controls. Original passing archive results do not prove these fixes. |

### 1.4 Owner vision and what this review adopts

The owner wants hundreds of isolated modules, mostly written by AI agents, with explicit typed dependencies,
one owner for each mutable fact, reproducible behavior, visible failures and predictable cleanup. Reliability
outweighs shorter syntax; boilerplate earns its place only by making ownership or an invariant visible. Modules
remain ordinary factories. Product decisions, authorization, process policy and readiness stay with their owners.

The ten independent API/watch critics examined that vision, the complete selected API and the corrected prototype.
Their useful findings are assigned to existing implementation files and tests below. The retained decisions are:

- Keep `read` followed by `watch` or `load`, scoped subscriptions, area facets, one writer and explicit command ports.
  A snapshot carries the selected keys and starting revision, so callers do not duplicate that information.
- Repair the six reproduced fault groups in sections 7 to 9 before admitting the package: invalid callback returns,
  async-context retention, array prototype escape, read/future/structural type holes, late watch/load cascade depth
  and loader startup/close boundaries. These are concrete counterexamples, not arguments for replacing the architecture.
- Add an author recipe distinguishing state, commands and events, one atomic aggregate for correlated state,
  explicit ownership of asynchronous completion, and diagnostic meanings. Keep the runtime surface unchanged.
- Borrow specific lessons from the seven libraries in section 19. Adopt no library dependency, ambient reactive
  graph, selector framework, generic reducer runtime, event transport or new queueing platform on that evidence.
- Keep one bounded consumer proof and coordinate with the merged fixture plan. Its optional restart, 500/1000-module
  growth and load studies retain their own owners and are not added to the observation release gate.

An accepted semantic change is not hidden inside a bug fix. Record the exact controlling sentence, smallest
counterexample, proposed result, consequences and a compliant alternative in the existing review record. Only the
explicit TypeScript floor change has already been authorized by the latest owner instruction. If an additional
semantic change is necessary, its dependent implementation waits for owner acceptance; unrelated plan work and
contract-preserving corrections continue. A count of agreeing critics supplies evidence, not contract authority.

## 2. Re-verify before start

Run in a fresh worktree of get-modular (`$GM`) based on the fetched `origin/main`, and record the outputs in the
PR 1 description. Select the executables as described in section 2.1 first. Commands stop on a missing ADR instead
of hashing empty output. Compute both digests from the same fetched `origin/main`; never copy old digest literals
from a planning snapshot and never edit the accepted registry to make a leaf row pass.

```sh
set -eu
cd "$GM"
GM_ADR=docs/decisions/0034-admit-the-module-change-observation-package.md
git fetch origin
git merge-base --is-ancestor origin/main HEAD
git cat-file -e "origin/main:$GM_ADR"   # missing ADR: STOP before installing/building the package
git rev-parse origin/main                                                                                  # 1
git show "origin/main:$GM_ADR" | head -8
git show "origin/main:$GM_ADR" | shasum -a 256                                                               # 2 fileDigest
git show origin/main:architecture/decisions/accepted-decisions.json | jq '.decisions[] | select(.id == "ADR-0034")'  # 2 immutableDigest
pnpm install --frozen-lockfile --ignore-scripts --engine-strict --strict-peer-dependencies
jq -r .version packages/resources/package.json
if ! npm view @get-modular/resources dist-tags; then printf '%s\n' 'Record the V2 registry-unavailable fallback'; fi
git diff a20d261 origin/main --stat -- packages/resources/src                                                # 3
node node_modules/typescript/bin/tsc -v                                                                 # 4
rg -n "typescript-minimum|5\.8\.3|testAssemblyTypes" package.json pnpm-workspace.yaml architecture/tooling/test-assembly-types.mjs  # 4 migration inventory only
cat .node-version; node -e 'console.log(typeof process.getBuiltinModule("node:timers").setImmediate)'     # 5
jq -r .version node_modules/oxlint/package.json node_modules/@agent-teams/engineering-foundation/package.json  # 6, 8
rg -n "lane: |timeout-minutes|ROOT_CI_NODE_VERSION: |node-version: 24" .github/workflows/ci.yml             # 5, 7
jq -r .version node_modules/@changesets/cli/package.json; ls node_modules/.pnpm | rg assemble-release       # 9
git show origin/main:research/module-communication-2026-10/README.md | head -3                            # 10
shasum -a 256 docs/architecture/common-assembly.md; rg -n -B2 "current CMS successor" tests/ownership-checkpoint.test.mjs  # 11
```

| # | Expected on 2026-10-17 | If different |
| --- | --- | --- |
| 1 | `132317e` or a descendant. | Read `git log 132317e..origin/main --stat`; re-read every file this plan edits and adapt. |
| 2 | ADR-0034 accepted on `main`; `fileDigest` is SHA-256 of its exact merged file bytes, while `immutableDigest` is the ADR-0034 registry value from that same commit. | Not merged: STOP, PR 1 cannot pass `authenticateLeafDecision`. Compare the merged text with reviewed `945e9a1`; a difference needs review and plan reconciliation, not an automatic ADR rewrite. Record the actual digests even when the text matches. |
| 3 | Resources `0.1.0` (`latest=0.1.0`); no source change; no `Resources.path`. | A new resources minor needs an observation minor (ADR). `Resources.path` exists: a known-item trigger fired; STOP and ask. |
| 4 | Build/current compiler `7.0.2`; every new observation compiler is at least `7.0.2`. | Follow the already authorized floor migration in section 2.3 before claiming the package gate. Never run a new observation fixture on 5.8.3. |
| 5 | `26.11.1`; Node 24 lanes `24.21.0`; `function`. | Change engines only together with every other leaf. |
| 6 | `1.83.0`; `no-restricted-imports` supports `paths` with messages (verified with a scratch fixture). | Re-run the lint fixture of section 9.6 before PR 2. |
| 7 | Lanes core, assembly, packaging, governance, static on three OS and two Node lines, `timeout-minutes: 15`, plus `node-24-compatibility`. | Re-plan Q2. |
| 8 | `1.7.4`, source-dependencies schema v3 with `packageExports`. | Check that `packageExports` still accepts `./testing`. |
| 9 | `3.0.2` and `assemble-release-plan@7.0.0`. | Re-check the peer bump rule of section 13. |
| 10 | Pull request #182 merged (`a3a079b`); the #183 corrections reconciled as section 2.2 requires. | Missing research/corrections: resolve the predecessor before Phase 1b; do not copy the original known defects from an old branch. |
| 11 | `e5cb510c…0919` in both places. | The CMS changed meanwhile: rebase PR 2 and recompute. |

### 2.1 Executable paths and bootstrap

The root/tooling Node 24 floor is 24.21.0; public packages retain the separate 24.18.0 floor. Use Node 26.11.1 for
the default gate and Node 24.21.0 for the compatibility run. Resolve absolute executable paths first and record
`process.execPath`, `node --version` and `pnpm --version`; the shell's default Node is not evidence of either pin.
The original machine used `/usr/local/n/versions/node/26.11.1/bin/node` and
`/usr/local/n/versions/node/24.21.0/bin/node`. Those paths are examples, not portable prerequisites. On a different
machine, use existing installations or restore the exact versions to a disposable tool directory; do not change
global installations or repository engine policy.

Set `GM_NODE26` and `GM_NODE24` to those absolute executables, and `GM_PNPM_BIN` to the directory containing
the pinned pnpm 11.20.0 executable. The command below establishes the default shell for this plan:

```sh
test -x "$GM_NODE26" && test -x "$GM_NODE24" && test -x "$GM_PNPM_BIN/pnpm"
"$GM_NODE26" --version
"$GM_NODE24" --version
export PATH="$(dirname "$GM_NODE26"):$GM_PNPM_BIN:$PATH"
node -p 'process.execPath'
pnpm --version
```

If a pnpm launcher selects its own Node, invoke the pinned pnpm CLI with the selected executable instead:
`"$GM_NODE26" /absolute/path/to/pnpm/bin/pnpm.cjs <command>`. Keep the selected Node first on `PATH` for child
processes. Run Node 24 checks with `PATH="$(dirname "$GM_NODE24"):$GM_PNPM_BIN:$PATH"` and that executable.
Once section 2's ADR check passes, the frozen install restores dependencies without editing the lockfile;
`pnpm resources:build` must precede the first observation source compile. Network-dependent registry observation
is V2 evidence, not permission to upgrade any pin.

### 2.2 Research correction predecessor

The reviewed #183 head is `cfdaa18f152aac614194be710a474f4d4b06f59a`; re-read its current head and the diff before implementation because it is
owned by another track. Its corrections must be on `main`, or supplied as an explicitly coordinated reviewed
predecessor, before Phase 1b. This plan changes none of #183's files and does not claim that its evidence is merged.
Use `raw/api-design/corrections-2026-10-17/README.md`,
`raw/api-design/runtime-b/review-regressions.test.ts.txt`, the revised `runtime-b/env-probe.ts.txt`,
`probes/p9-traps.b.ts.txt`, `runtime/core.ts.txt`, `runtime/testing.ts.txt` and `b-snapshot/api.d.ts.txt` from that
predecessor. Record the exact commit used. R16/R17 and the strengthened stale/close oracles join the original probes;
historical writer outputs and their original 43-step result remain historical evidence.

PR #184 is merged in `4773f6e`; its three files under `docs/qualification/module-fixture-*.md` own the separate
consumer/scale track. Its documentation correction #187 is merged in `132317e`: the semantic projects are proposed
implementation, and the existing record-size bound uses four `false` values. Section 14 reuses its small consumer direction without making its recovery or growth phases
observation prerequisites. PR #186 still owns the CMS maintenance instruction. Read its live state and the current
`AGENTS.md` for coordination; neither track authorizes rewriting accepted ADRs or expanding this delivery.

### 2.3 TypeScript 7.0.2 minimum: authorized policy and concrete migration

The owner's instruction on 2026-10-17 is **TypeScript 7.0.2 or newer only**. The observation source, new type probes,
new consumer examples and new isolated spikes use that floor. The build compiler at this checkpoint is 7.0.2.
The supported test set is the exact pinned minimum and exact pinned current compiler, deduplicated by version;
today it has one compiler and two resolver cases, NodeNext and Bundler, with `skipLibCheck: false`. Record the
resolved manifest version. Do not use a floating `latest`, a nightly, `npx` or `dlx` to choose a compiler.

The repository has not completed that floor migration at `132317e`. The following is the concrete active-owner
inventory, not permission to change immutable evidence or an observation-specific bypass:

| Active owner | Migration subject |
| --- | --- |
| Workspace compiler pins and leaf script contracts | `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`, `architecture/checks/leaf-packages.mjs` and its assertions in `tests/leaf-package-admission.test.mjs` still select or pin the 5.8.3 minimum. |
| Active governance and ownership parsers | `architecture/checks/leaf-package-admission.mjs` imports the legacy parser for current leaf source checks; Phase 1a's leaf/governance tests already invoke it. `tests/ownership-checkpoint.test.mjs` uses that parser for the current ownership declaration and runs through full-gate `precheck`. |
| Shared Assembly/example type gate | `architecture/tooling/test-assembly-types.mjs` asserts 5.8.3 and returns four observations; `tests/assembly/consumer-standard-examples.test.mjs` pins that count. Keep this helper and update its callers/counts after deduplication. |
| Current Core archive and declaration/JavaScript audit | `packages/core/tests/package/packed-root.test.mjs` packs the current package; its `qualification-support/support/m1-packed-consumers.mjs`, `m1-declarations-closure.mjs`, `m1-javascript-closure.mjs` and `qualification-support/m3-stage-direct.mjs` use/assert legacy compiler/parser APIs. Follow existing ownership/copy rules for their `tests/qualification/` counterparts. Historical names do not make active uses immutable replays. |
| Current support documentation and authority | Core/Assembly READMEs and `docs/architecture/current-contract.md` describe the old floor/diagnostic cases. ADR-0030's admission-evidence clause and ADR-0034's compiler sentence both name 5.8.3; record their already-authorized compiler-policy successor through the owning route. |

Importing the shared helper unchanged would silently compile the new observation example with a forbidden compiler.

The installed TypeScript 7.0.2 package root resolves to `lib/version.cjs` and exposes version metadata, not the old
`createSourceFile`, `createProgram` or `preProcessFile` JavaScript API. The manifest instead exposes explicit
`./unstable/*` APIs alongside the compiler CLI. Thus changing an alias/version assertion alone is not a parser
migration. The existing owners must record their exact pinned TS7 API/CLI paths and adapt their callers. Preserve
the source-edge, ownership-declaration, syntax/purpose and typed declaration-closure policies, including checker
semantics where currently required; syntax-only or text matching is not a substitute for that evidence. Qualify
the adapter with those owners' existing positive/rejecting cases. No third parser, generic compiler framework or
observation-local compatibility helper is introduced by this plan.

Before the **first parser/compiler-dependent Phase 1a command**, integrate one compiler-owner checkpoint into the
implementation base. Read-only planning and source inspection can proceed while it is pending:

1. Align the active inventory and search its tooling/callers for remaining legacy selections. Migrate current-subject
   adapters, declaration-parser uses, compiler identities, meaningful diagnostic oracles and owned helper copies
   together. Keep manifest resolution, deduplicate equal versions, and adjust actual expected counts. Introduce no
   observation-specific bypass, compiler-selection framework or second helper.
2. Reconcile every still-binding compiler-evidence clause, including ADR-0030 and ADR-0034, and the current public
   support text/release note. For the still-unmerged #154 coordinate the authorized update with its owner; accepted
   records use the normal successor route. Preserve accepted bytes. This instruction already authorizes the floor
   increase; it does not require asking the owner to choose that floor again.
3. Preserve frozen historical bytes, logs and metadata as evidence of their original source. This permits retaining
   old results, **not launching a new compiler below 7.0.2 in this delivery**. An active gate on today's package must
   migrate even if its filename begins with `m1-`. If a genuinely immutable replay cannot be migrated under its
   owner route, name its precise pending status; never weaken the full gate or claim a current TS7 pass for it.
4. Run the current positive/negative consumer type cases on 7.0.2 with both resolutions; then integrate the
   observation soundness cases in section 8.1. A compiler diagnostic change needs inspection, not suppression or a
   changed negative oracle merely to make the run pass.

This planning PR records the migration; it changes no package pins or implementation. If the compiler checkpoint
is not yet on the implementation base, the dependent Phase 1a governance/parser commands and later package gates
remain pending. Record the checkpoint's package-version/changeset disposition: if it leaves legitimate pending
support changesets, reconcile Phase 2b/3 release expectations against that exact base rather than treating them as
unexpected observation bumps; if already consumed, record that release base. No additional release is mandated.
Documentation and
research can proceed. When the pinned current compiler later advances, keep 7.0.2 as minimum and run each distinct
version; update the literal observation script and existing helper together at that compiler upgrade.

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
- **Q3, SDK-growth evidence (resolved by the current ADR, not a new choice).** Keep the entire
  `architecture/sdk-growth/evidence/consumer-module-standard.json` byte-identical, including its historical
  `pinned`, `acceptedCurrent` and `delta`. Add no `successorReviews` field. Recompute only the current CMS successor
  digest in `tests/ownership-checkpoint.test.mjs`; record the previous/current SHA-256, new Git blob, changed rules
  and each consumer's pin migration or outstanding work in PR 2. The existing historical SDK checker remains intact.
- **Q4, resources release for its documentation change.** (Recommended) A resources patch changeset, so the published
  README and JSDoc match the Standard; the TEST consumer then runs on resources 0.1.1; 8 and 6. No changeset; the text
  ships with the next resources release and the owner has one publication fewer: 7 and 7.

## 4. VERIFY items and their defaults

When a check cannot be made, take the default, continue, and record the evidence named here in the PR description. A
default never overrides a STOP of a phase card.

| # | Item | Default when it cannot be checked | Evidence to record |
| --- | --- | --- | --- |
| V1 | ADR-0034 merged; digests calculated from that merged commit | none: without it STOP | output of section 2 check 2 |
| V2 | npm registry state of resources | `latest=0.1.0`, as `research/releases/0.5.0-train/release-intent.md` records | "registry not reachable on <date>" |
| V3 | Foundation accepts `packageExports: ["./testing"]` | yes: schema v3 `exactPackageExport` admits it (read on 2026-10-17) | `pnpm foundation:check` output |
| V4 | Foundation ignores `process.getBuiltinModule(...)` calls | yes: it parses imports, `require` and dynamic imports | `pnpm foundation:check` output; if it fails, STOP |
| V5 | Changesets peer behavior | an in-range patch of resources bumps nothing else; an out-of-range minor gives observation only a patch (ADR) | `pnpm changeset status --verbose` in PR 2 and the release pull request |
| V6 | Windows time of the `observation` lane | Q2 default lane | job durations of the PR 1 CI run |
| V7 | Expected failing gate of each writer negative | the manifest of section 9.4, taken from `raw/api-design/results/control.negative-*.txt` | the gate table that `writer-gate.test.mjs` prints |
| V8 | Expected result of the type controls | no annotation: clean; parameter form: variance diagnostics in the changed declaration; section 8.1 supplies the new soundness controls on the supported compiler set | `type-controls.test.mjs` output; retain raw diagnostics and distinguish a compiler shift from a behavior change |
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
- **Stop:** ADR-0034 not on `main`; its merged text has an unreconciled difference; `Resources.path` exists; a resources minor was released; a
  compiler or oxlint update makes a section 2 check fail. Record the authorized compiler checkpoint of section 2.3;
  missing migration blocks Phase 1a's parser-dependent commands, not this plan update.

### Phase 1a: the checks learn row subpaths (PR 1, commit 1)

- **Inputs:** `architecture/checks/leaf-packages.mjs`, `leaf-package-admission.mjs`, `production-artifacts.mjs` (lines
  315 to 400), `architecture/tooling/build-leaf-package.mjs`, `tests/leaf-package-admission.test.mjs`; section 11.1;
  the completed section 2.3 compiler/parser checkpoint on this base.
- **Outputs:** the helpers and checks of section 11.1; synthetic-row tests. No observation row, no package file.
- **Commands:** `node --test tests/leaf-package-admission.test.mjs tests/governance.test.mjs`, `pnpm governance:check`,
  then commit `feat(architecture): let a leaf row list package subpaths`.
- **Done:** every existing row behaves as before (one root); a synthetic row with `subpaths: [".", "./testing"]` is
  admitted only with both exports and both `src` entries; all tests green.
- **Stop:** the compiler/parser checkpoint is missing (do not execute the old parser); an existing test needs a
  changed expectation for Core, Assembly or an existing leaf beyond that already-integrated checkpoint.

### Phase 1b: skeleton and source (PR 1, commit 2)

- **Inputs:** section 6 (skeleton), section 7 (engine), section 8 (types), `raw/api-design/b-snapshot/api.d.ts.txt`,
  `testing.d.ts.txt`, `README.md`, `raw/api-design/runtime/core.ts.txt`, `runtime/testing.ts.txt`,
  `packages/resources/src/**` (style).
- **Outputs:** every `packages/observation` file of section 6 marked `1b`.
- **Commands:** `pnpm resources:build`; `node architecture/tooling/build-leaf-package.mjs observation` fails until
  Phase 1d adds the row, so use `node node_modules/typescript/bin/tsc -p packages/observation/tsconfig.json` meanwhile. Commit
  `feat(observation): add the store, facets, subscriptions and the testing entry`.
- **Done:** the build emits exactly the `dist/` files of section 6;
  `rg -n "process.env|from \"node:" packages/observation/src` finds nothing; the public types equal `api.d.ts.txt` and
  `testing.d.ts.txt` except the fixes of section 8.
- **Stop:** the section 2.2 correction predecessor is missing; the section 2.3 compiler checkpoint is missing; a public type or name would need to differ from the sources beyond section 8; a lint rule forces a design
  change of the public API.

### Phase 1c: tests and fixtures (PR 1, commit 3)

- **Inputs:** section 9 and section 10; `raw/api-design/runtime/probes.test.ts.txt`, `runtime-b/probes.test.ts.txt`,
  `runtime-b/env-probe.ts.txt`, `runtime-b/review-regressions.test.ts.txt`, `b-snapshot/type-tests.ts.txt`, the exact
  variant B probe paths in section 9.0, `tools/mutations*.sh.txt`, `tools/static-rules.mjs.txt`, `tools/tsc-both.mjs.txt`, `check.sh.txt`,
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
- **Stop:** an archived probe fails outside the documented stub replacements (section 15, Q6) or corrective
  cases (sections 8.1 and 9.7); a writer
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
- **Done:** the guide example `communication` compiles on the section 2.3 compiler set and both resolutions; the lint test passes.
- **Stop:** an example needs an API the package does not have; the lint test needs an oxlint version change.

### Phase 2b: resources documentation, evidence and digests (PR 2)

- **Inputs:** section 12.5, Q3, Q4, `tests/ownership-checkpoint.test.mjs` (line 171),
  `architecture/sdk-growth/evidence/consumer-module-standard.json`.
- **Outputs:** the `Resources.signal` text in `packages/resources/src/features/scope/types.ts` and
  `packages/resources/README.md`, `.changeset/resources-signal-documentation.md`, the new CMS digest in the ownership
  test, and the reviewed CMS delta/consumer pin record in the PR description. The frozen SDK-growth evidence is unchanged.
- **Commands:** `pnpm resources:check`, `pnpm ownership:checkpoint:test`, `pnpm sdk-growth:check`,
  `pnpm changeset status --verbose`; commit; `pnpm check`.
- **Done:** all green; after the section 2.3 predecessor disposition, this phase adds only observation (minor) and
  resources (patch), or leaves the compiler checkpoint's already-recorded legitimate pending changesets present.
- **Stop:** an unexplained conformance bump or observation bump beyond minor. Reconcile a legitimate compiler
  predecessor's package versions/changesets before applying these phase-local expectations; never silently discard it.

Apply these edits after merging the #154 predecessor and updating PR 2 from PR 1. In
`tests/ownership-checkpoint.test.mjs`, preserve the accepted ADR list and ADR-0034 digest introduced by #154,
and preserve every historical CMS digest. Change only the assertion labeled `current CMS successor` to the SHA-256
of the reviewed `docs/architecture/common-assembly.md` bytes. Recompute after resolving any content conflict; never
resolve this shared-file overlap by taking one side's whole file. `pnpm ownership:checkpoint:test` checks both pins.

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
pnpm assembly:build && pnpm resources:build && pnpm conformance:build && pnpm observation:build
GM_ARCHIVES="<an empty scratch directory outside the repository>"
mkdir -p "$GM_ARCHIVES"
for GM_PACKAGE in core assembly resources conformance observation; do
  pnpm --dir "packages/$GM_PACKAGE" pack --pack-destination "$GM_ARCHIVES"
done
(cd "$GM_ARCHIVES" && shasum -a 256 *.tgz > SHA256SUMS)
```

- **Done:** CI green on the release head; the archive SHA-256s recorded.
- **Stop:** the changeset status shows a resources minor without an observation minor (T93); any CI failure.

The TEST consumer uses all five archives from this exact head. Packing Core, Assembly and conformance supplies
the existing peers and does not bump or republish them. The release intent lists the complete input set and limits
the owner's publication commands to packages actually changed by this release. Retain the tested archives; a later
fresh pack is a comparison subject, not an untested replacement for the bytes that passed TEST.

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
- **Commands:** `gh pr checks`; verify the retained TEST archives with `shasum -a 256 -c SHA256SUMS` and their
  recorded integrity, then compare a fresh post-merge pack with them. The 0.5.0 record's normalized-content exception
  concerns **conformance's peer-key ordering**, not resources. Use that established comparison only for this known
  manifest-key variation; an unexplained difference in any archive remains a failure. The retained tested bytes
  remain the publication subject, never the fresh comparison pack.
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
  src/features/delivery/context.ts     1b DeliveryOrigin, Live, DeliveryContext, context helpers, private FIFO, later
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
  tests/support/compilers.mjs          1c resolves the supported compiler set (section 2.3), runs tsc, parses diagnostics
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
  tests/env-setup-fake-clock-before.mjs 1c preload: frozen global performance and Date clocks
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
through `Reflect.apply`, else the global `setImmediate` bound to `globalThis`, else the captured global
`setTimeout(callback, 0)`; never a
bare `setImmediate` identifier, so importing never throws a `ReferenceError`. Context storage: `new AsyncLocalStorage()`
from `getBuiltinModule("node:async_hooks")`, else `undefined`; `asyncDetection` is `storage !== undefined`. Clock:
obtain `performance.now` through `getBuiltinModule("node:perf_hooks")` and bind it at load; otherwise capture the
global `performance.now`, then `Date.now` as the last fallback. Freezing or replacing the global clocks before import
does not replace the builtin clock. A mock that replaces the builtin method itself must be installed after import;
without the builtin, a pre-faked global clock remains a documented fallback limitation. Microtask: the global
`queueMicrotask` captured at load, else the
scheduler. No `import` of a `node:` module, no top-level `await` (it breaks `require(esm)`), no `process.env`.

Port `captureRecord`, `collectPlain`, `freezeNodes` and `defineRecord`: own data properties only; symbol keys and
accessors rejected at every level and read once; primitives, arrays and plain or null-prototype objects allowed;
functions, symbols, `Date`, `Map`, `Set`, typed arrays and class instances fail with `observation.values.not-plain`;
arrays have exactly the captured intrinsic `Array.prototype`, and records have exactly `Object.prototype` or
`null`. Check prototypes on arrays too: `Array.isArray` alone admits subclasses whose private fields or inherited
getters can change a frozen snapshot without a commit. Reject subclass/custom-prototype arrays at every nesting
level in both `initial` and `set`; retain ordinary arrays, holes, nested plain values and null-prototype records.
Do not clone the graph or freeze global prototypes to compensate. Cross-realm/custom-prototype values are not
silently admitted as ordinary local plain values; any broader carrier needs its own evidence and decision.
Cycles terminate; `__proto__` is defined with `Object.defineProperty`. Validate first, collect the new nodes, freeze
only after every check of the call passed (echo and cascade included), then add them to the package-wide `frozenNodes`
WeakSet so they are never walked again; count walked nodes (`walked`). At run time the key set of `initial` is the
store's.

### 7.2 Revisions, flush, context and guards (`store/engine.ts`, `delivery/context.ts`; core.ts 124–156, 323–403, 655–698)

`commit` counts effective commits; `lastTouched: Map<key, revision>`; a snapshot's revision is the largest `lastTouched`
of its keys. `buckets: Map<key, Set<Registration>>`: `set` looks up only the changed keys (one index lookup each), marks
their registrations dirty and keeps on each the largest commit depth. A patch that changes nothing by `Object.is`
commits nothing and returns the current revision. `dirty: Set<Registration>` holds at most one entry per subscription.

For late watch admission, retain `latestRevisionAtDepth[key][0..64]`: the newest effective revision at each admitted
depth for that key. An effective commit updates one numeric slot per changed key; a rejected/no-op patch updates
nothing. A snapshot starting at revision `r` seeds the maximum depth whose slot is greater than `r`, over its actual
selected keys, with zero as the empty maximum. This is at most 65 numeric slots per store key, independent of commit
count and snapshot age; admission scans at most 65 slots per selected key. Already attached registrations retain
their existing scalar maximum. No snapshot, user value, callback or per-revision log is retained by this table.
Keep the table for the store lifetime and clear it on close. Do not invent expiration of an unseen committed depth
when a flush ends: the ADR's live-window rule determines the depth of a **new commit**, whereas watch catch-up
delivers the commits since its starting revision. A fresh independent read excludes old commits naturally.

Initial load admission also needs the latest write's provenance for each selected key. Keep one private
`lastWriteCause[key] = { revision, depth, live }` alongside the revision slots. `live` is only the existing plain
`{ open }` token, never a context/origin/registration; outside a live context it is absent. Replace this record on an
effective write and release it on close. Section 7.3 uses it only while its token is the registering call's current
live token. This is one bounded record per key, not a retained async-resource graph.

`delivery/context.ts` owns one module-scoped linked FIFO of deferred callbacks per installed package copy.
`later(fn)` appends one task and immediately registers one callback with the captured scheduler, outside the current
delivery context (`storage.exit` when available). That callback removes exactly one queue node before invoking it,
clears the removed link and clears both head/tail when empty. Enqueue during a callback appends and registers its own
native task immediately. Do not batch-drain the FIFO or schedule the next task only after the previous one finishes:
either would change interleaving and microtask checkpoints. No queue length enters testing pending counts.

`schedule()` is idempotent per store while its flush is scheduled: increment the pending flush count, create
`live = { open: true }` and consecutively enqueue `flush(live)` and the callback that closes `live`. The two native
callbacks stay adjacent, so the context closes after the flush's microtask checkpoint and before a timer or I/O
callback from a later loop iteration. The pair belongs to one store flush, not to each subscriber. `flush` clears its
scheduled flag/count, snapshots `dirty` sorted by registration id, clears it and invokes registrations synchronously,
rechecking `closed` before each; a commit made during a flush can schedule a new pair. Result/error publication uses
the same queue for its own delivery/context-close pair and the pending-publication accounting of section 7.4.

`context.ts` defines `DeliveryOrigin = { engine: object; keys: readonly string[]; name: string }` as a **detached
runtime value**, constructed from an empty per-engine identity token, the frozen key list and the subscription name.
`engine` is that opaque token, never the `StoreEngine`. Pass this record into context, never a `Registration` with a
narrower TypeScript annotation: an ALS store retains the actual value and otherwise keeps callbacks, resources and
payloads alive through unrelated timers after `live.open` becomes false. The token has no reverse strong reference
or registry entry pointing to its engine. `delivery` imports no `store` code. `DeliveryContext = { depth, origin, live }`. `runInContext`
sets a module-level `syncContext` for the synchronous part and runs the callback in `storage.run` when storage exists;
`currentContext()` returns `syncContext ?? storage?.getStore()` only while `live.open`. A handler's context lives until
its delivery task ends, including that task's microtasks; a loader's run has its own `runLive`, closed in the run's
`finally`. `onResult` and `onError` receive a new delivery context, not the completed loader's context. In `set`, after validation and
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
  revision is already past the snapshot's, mark dirty and schedule (the commit between `read` and `watch`). Preserve
  the depth of missed changes with section 7.2's revision-threshold query; do not initialize every late watch at zero.
  For one key, revision 1 at depth 64 followed by revision 2 at depth 1 yields depth 64 from a revision-0 snapshot,
  but depth 1 from a snapshot read after revision 1. This remains true after the original flush has ended: an old
  snapshot deliberately catches up on an unseen commit. A new independent read after revision 2 has no catch-up;
  a later outside-context commit has depth zero. This distinction preserves both catch-up and the ADR's finite
  context lifetime without a new expiration policy. A flush
  delivers only when the revision moved past the last delivered one, with a fresh snapshot, in its delivery context.
  Never call back synchronously.
- Load lane: `resources.child({ name: "load:<name>" })` takes its slot synchronously; its `setup` entry `drain` returns
  `closeAndDrain`, and the cleanup receives `{ escalate }`, detaches and drains (a setup rejection with
  `resources.scope.closed` is expected, anything else is reported). The input snapshot supplies **keys only**, including
  for causal seeding; its revision never sets an initial-load history threshold. At registration, read
  `currentContext()`. If absent, seed depth zero. If live, seed the maximum of its depth and the current selected-key
  `lastWriteCause` depths whose `live` token is identical to that context's token. Do not add one at admission: only
  a commit increases depth. Subsequent effective commits merge their depth into the attached registration normally.
  Carry the resulting depth through first `onLoading`, the loader and its separate result/error publication. This
  covers both saved and fresh input snapshots in a set-next-then-load chain; merely copying the current callback's
  depth would erase the increment made by `set`. An independently registered initial load outside a live context
  starts at zero, regardless of old committed state. Section 9.7 pins these distinct watch/load rules.

  One active run and one pending slot: `offer` ignores
  revisions at or below `lastOffered`, records the new one, invokes `onLoading` in the delivery context (the first run
  included), **rechecks the lane's canonical open/attached state immediately after the callback**, then starts the run
  or replaces the pending job and aborts the active `AbortController`. If `onLoading` or its synchronous error reporter
  closed the scope/source, return before acquiring a run, changing pending counters or aborting again; closure must
  not be undone by the rest of `offer`. A run awaits one
  microtask so `active` is set before user code. **After that await and immediately before calling user code**, skip
  the run when closed, aborted, no longer the last offered, or its selected-key revision differs from the store's
  current selected-key revision. This applies to the first run and to a pending run promoted after its predecessor
  settles. An obsolete pending snapshot must not start a loader merely because the newer commit's flush has not
  run yet. Leave that newer flush responsible for offering the fresh job; do not poll or manufacture a second lane.
  A current run calls `loader(snapshot, Object.freeze({ signal }))` directly inside `runInContext` with its `runLive`.
  A skipped startup releases the active slot/counters through the same `finally` path and publishes nothing.
  When the loader settles, enqueue `onResult` or `onError` as its own delivery task, with a new live context that
  includes the complete callback microtask checkpoint. Immediately before invoking it, recheck that the lane is open,
  the signal is not aborted, the job is the last offered and its revision is still the store's revision for the keys.
  A commit after publication was queued must suppress the old result. The first run uses the newest values.
  End the loader's active run and `runLive` independently of queued publication; a settled loader must not become
  drain debt merely because its callback is waiting for a delivery task.
- `closeAndDrain(escalate)`: close the lane, wait for the active run or `escalate`; after escalation wait one task with
  the captured scheduler and throw `observation.load.still-running` if the run is still active, so resources records a
  failed debt.

### 7.4 Close, reports, testing entry and counter hook (core.ts 358–382, 699–709; runtime/testing.ts)

`close()` is idempotent and synchronous: set `closed`, clear `dirty`, and per live registration report
`observation.source.closed`, detach it (removes the listener, aborts its run) and release it (a load's
`laneScope.control.close()`, voided; it never rejects). Afterwards `set`, `watch`, `load` and the facet's `read` throw
`observation.store.closed`; the owner's `read` keeps working. `createStore` registers `{ [Symbol.dispose]: close }` as
`store:<name>` before it freezes `initial`, so a failing `createStore` freezes nothing. Reports are frozen
`{ source, subscription, revision, cause }`. `invoke` isolates both the callback **and all handling of its returned
value**. Report a thrown value unchanged; a non-`undefined` return produces `observation.callback.returned-value`.
`null` is a scalar invalid return, never an object to dereference. Reading a thenable's `then`, calling/assimilating
it and attaching rejection handling all belong inside the isolation boundary; a getter/call failure is reported
with that raw cause and cannot escape the flush. Execute user-controlled return inspection and initiate assimilation
under the callback's **same detached origin, depth and existing live token**, so a returned getter or Node promise
assimilation job cannot make a followed-key write after the package accidentally drops its context. Re-entering
`runInContext` for that initiation is sufficient; keep the invalid-return report and `reportError` policy as before.
The existing paired task still closes the token: do not create a return-specific window, extend `live.open` or add
pending-work accounting. A returned thenable's later timer remains outside the ended window. A returned rejected promise is observed so it does not create an
unhandled rejection; its rejection is a separate reported cause from the invalid-return report. Avoid reading
`then` twice. Apply the same `reportedByStore` identity check to **every** failure path: direct throw, return
inspection/assimilation failure and asynchronous returned-promise rejection. An already-reported guard error is
observed without reporting it again; the invalid-return diagnostic and a distinct ordinary rejection/getter cause
remain reported. Check the existing WeakSet, never suppress by error code. The observer does not wait: do not
await an invalid callback promise in a flush or keep a load active for it. None of these paths detaches the
subscription or prevents a healthy sibling or later delivery.
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

Pending delivery includes both a scheduled store flush and queued result/error publication. Track publication
counts per store and per package, increment before enqueue, and decrement only in the paired callback that closes
the delivery context after its microtasks, including when publication is canceled. `pendingFlush()` stays truthy
until both kinds are drained. `delivered()` waits for pending deliveries but not active loaders; `settled()` also
waits for running and queued loaders. Both filtered and package-wide waits must observe queued publication. These
delivery counts do not keep a settled loader active for the drain; R17 independently checks that distinction.

### 7.5 Port versus rewrite

Port the algorithms above. Rewrite the 420-line `createEngine` closure as `StoreEngine`, `WatchRegistration` and
`LoadRegistration` classes with `#` fields, as resources does; the untyped adapter of `runtime/b-snapshot.ts` as typed
internals with one documented cast at the public boundary (brands are type-only); argument validation for every public
call, including non-object specs. Delete every `mutation` and `OBSERVATION_STUB_*` read, the `graveyard` and
`duplicates` arrays, the `watchMode` measurement modes and `releasableEntry`, `pathOf`, and every `TypeError` the
package creates. The facet and the owner `Store` are frozen objects of own arrow-function properties: they are returned
as capabilities, and conformance rejects prototype members. Behaviors the sources do not decide keep the prototype's:
an untyped JavaScript `createStore({})` is accepted (the TypeScript fixed-key constraint already rejects an empty
record), duplicate keys in `read` are deduplicated, and `set({})` returns the current revision.

### 7.6 State, commands, asynchronous completion and diagnostics

These are the owner/consumer recipes for the README and guide, supported by the existing contract rather than new
runtime facilities. They address the AI-authoring failure modes found in the holistic review.

| Need | Mechanism and owner | Consequence for the consumer |
| --- | --- | --- |
| Read a value once | Plain input or `facet.read` at construction/operation | No subscription or extra store is needed. A durable authority may be read directly for each operation. |
| Follow the newest configuration/projection | `watch`, owned by the subscriber's scope | Intermediate commits can disappear. Apply idempotently; a callback is not acknowledgement of a business operation. |
| Derive a replaceable asynchronous result | `load` and a consumer-owned query port | One active/one pending; only current results publish. Treat abort as a request and retain physical completion ownership. |
| Ask an owner to do work/change state | Ordinary typed command port with a typed outcome | The owner validates, performs its transition and returns the outcome. It alone writes its state. |
| Preserve each occurrence or every accepted operation | A separately designed event/operation contract | Observation cannot carry that requirement. Events remain deferred; do not encode them as a counter, timestamp or growing array in a store. |

The decision question is: **would dropping every intermediate update and keeping only the newest state preserve the
meaning?** If not, the work needs an explicit command/event outcome. An `idle -> running -> idle` burst may deliver
only `idle` at a later revision. Closing the subscriber before delivery can produce zero callbacks after a successful
`set`. A throwing handler gets a report, not an automatic replay; writing the identical value does not retry it.
These are documented semantics, not defects to repair with a hidden reliable-message queue.

**Correlated state and atomicity.** One `set` validates and commits its whole patch synchronously. Several `set`
calls are several observable states even if their notifications coalesce. For correlated fields, use one owned
aggregate such as `{ state: OrderState }`, where `OrderState` is a discriminated union. A top-level union spread
across independent keys is not a proof that partial patches preserve that correlation. Keep an optional pure
`decide(current, command) -> next + outcome` function inside the owner when it simplifies the domain; commit its
complete aggregate once. This is an ordinary function, not a required reducer interface or a framework service.
A consumer checks the discriminant on each newly delivered snapshot rather than carrying an old narrowing forward.

**Derived values and ordering.** A consumer reads either the raw inputs it owns the derivation of or the owner's
published aggregate. It must not depend on one subscriber updating a cache before another subscriber runs. An
uneven diamond may temporarily show values from different commits. If those values must be consistent, one owner
computes/publishes the aggregate in one commit; do not add a global computed graph, cross-store transaction or
subscription-order API. Internal deterministic order does not make inter-module side effects order-independent.

**Lifetime of asynchronous work.** A loader's returned promise must cover all work that run starts, including its
cleanup. A `Promise.race` timeout does not terminate the losing operation, and an aborted signal does not retract
an external write. Use latest-only `load` for queries/replaceable projections; sending a message, placing an order or
consuming a quota needs a command owner retaining its final outcome and any required idempotency/reconciliation.
Acquire/use/release temporary resources within the run; do not return an open resource through a result that may
be discarded without an explicit recipient/owner protocol. Start independently long-lived timers or services in
factory/setup ownership, outside the loader. An uncooperative run may block later runs indefinitely: bounded lane
slots are not a completion deadline. No retry, deadline or durable operation registry is added to this package.

`onLoading` expresses whether the consumer clears old output, marks it stale, or deliberately keeps it; show that
choice in the example. It means a newer job was offered, not that user loader code necessarily started: a job can
be superseded before startup. `=> undefined` rejects a returned promise, but cannot prevent a block-bodied handler
from starting fire-and-forget work. Keep synchronous application in the example and show the explicit query/command
owner for asynchronous work; do not claim that the type checker proves physical completion.

**Diagnostics and release.** Ordinary callback reports identify the delivering source, subscription and delivered
revision. Echo/cascade reports instead identify the committing target store and its current revision, with the
origin subscription's name, exactly as the ADR requires; the rejected commit creates no revision. `source.closed`
uses the source's close-time current revision. Update `ListenerError` JSDoc to describe these distinct meanings;
never label every field "revision being delivered" or reroute guard reports to make that wording true. A revision
is local to its store; it is not a global causal ID or business operation ID. Where multiple live instances need
separate attribution, compose `name` from the Host's already-owned instance identity and purpose. Do not invent
another identity allocator or tracing registry. `path` remains absent in 0.1.0.

Brands prevent ordinary construction/type mistakes; they do not authenticate in-process code. A copied/spread
snapshot is rejected by the runtime origin registry; a type-only `ListenerError` brand alone is not proof that a
hostile participant could never copy a genuine report. The trusted owner controls its reporting sink and capability
distribution. A read-only facet is a writer separation mechanism, not a field-level authorization projection.

Closing a store preserves the owner's final read. If a long-lived owner repeatedly creates temporary stores, give
each such store a child scope, close that child and release all owner handles when finished. `liveSubscriptions === 0`
proves detached subscriptions, not that no owner intentionally retains final state. Filtered testing waits cover
only the named stores; they are neither a transitive graph barrier nor a production readiness protocol.

**Cost model.** Preserve the existing key index and one dirty entry per subscription. A commit with C changed keys
performs C lookups and visits the subscriptions indexed under each changed key; a subscription following several
changed keys may be visited several times but is delivered once per flush. For the verified 100-subscription,
50-key, 100-commit fixture this means 5000 lookups and 500000 visits, not 100 units of work. Limits cap registrations
and buffered jobs, not retained user bytes or execution time. The measured roughly 1 KB/watch is a fixture
observation, not a worst-case memory bound. A large collection under one key notifies every follower of that key;
replacing its container still scans its own entries even when child nodes were frozen before. Begin with area
contracts and meaningful aggregate boundaries. Selectors or per-entity storage wait for a measured consumer need.

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
- Carry forward the reviewed #183 `FixedKeys` correction: check every constituent of `keyof V` for an open key set,
  so a named property does not hide a numeric or template index signature. Keep the existing empty-record type
  rejection and finite literal-key positive controls. This repairs enforcement of the accepted fixed-key contract;
  it does not introduce a new public type/name or authorize another API redesign.
- Explicit types on every export (`isolatedDeclarations`), no enums or parameter properties (`erasableSyntaxOnly`);
  `ReadonlyStore<out V>` and `Store<in out V>` stay; the marker carries the slice check.
- README: title `@get-modular/observation`, no variant or task references (line 170), differences 4 to 7 of section 1.3,
  the abort-listener and `reportError` rules, fail fast with the Host's process policy, "a Host installs one copy",
  `/testing` in tests only, a "Mechanism and trust" paragraph (T77 to T79), and the ADR-0034 known items with owners and
  triggers. Examples keep compiling with the prelude of `raw/api-design/tools/readme-check.mjs.txt`; add a prelude
  declaration only for a name a new example introduces.

### 8.1 Sound read/future snapshots and structural writer types

The selected shape stays `watch(snapshot, spec)` / `load(snapshot, spec)`. The correction is that **future values
come from the facet's declared `V`, not from arbitrary refinements of the particular input snapshot `S`**. With
`WatchSpec<S>`, a legitimate predicate narrowing today's `status` to `"ready"` also claims that every later delivery
is `"ready"`; the corrected prototype can actually deliver `"loading"`. The same defect reaches `loader`,
`onLoading`, `onResult`'s snapshot and `onError`'s snapshot. No cast or `any` is needed in the counterexample.

First correct both owner and facet `read` return types. `K[number]` describes possible keys, not necessarily keys
present in this call: `read([choose ? "status" : "count"])` reads one key, although the old signature makes both
values required. A future helper cannot repair that false guarantee after it has entered the starting snapshot.
Keep fixed tuples and provable required prefixes precise, merely possible keys optional and other keys inaccessible. Do not ban dynamic
selection, read additional keys at runtime, or repeat a key list at `watch`/`load`.

Private feasibility sketch, exercised on TypeScript 7.0.2 with both resolutions; these are helpers to qualify in
emitted declarations, not new public exports:

```ts
type ContainsReadKey<K extends readonly unknown[], P> =
  K extends readonly [infer H, ...infer R]
    ? [H] extends [P] ? true : ContainsReadKey<R, P>
    : false;
type RequiredReadKeys<K extends readonly string[]> = {
  [P in K[number]]: false extends ContainsReadKey<K, P> ? never : P
}[K[number]];
type ReadSnapshot<V, K extends Keys<V>> =
  Omit<Snapshot<V, K[number]>, "values"> & {
    readonly values:
      Frozen<Pick<V, RequiredReadKeys<K> & keyof V>> &
      Partial<Frozen<Pick<V, Exclude<K[number], RequiredReadKeys<K>>>>>;
  };
// Both existing read members:
// read: <const K extends Keys<V>>(keys: K) => ReadSnapshot<V, K>;

type RequiredValueKeys<X> = {
  [P in keyof X]-?: {} extends Pick<X, P> ? never : P
}[keyof X];
type FutureSnapshot<V, S extends { readonly values: object }> =
  S extends unknown
    ? Omit<Snapshot<V, keyof S["values"] & keyof V>, "values"> & {
        readonly values:
          Snapshot<V, RequiredValueKeys<S["values"]> & keyof V>["values"] &
          Partial<Snapshot<
            V,
            Exclude<keyof S["values"], RequiredValueKeys<S["values"]>> & keyof V
          >["values"]>;
      }
    : never;
// Members of ReadonlyStore<out V>:
// watch: <S extends SnapshotOf<V>>(snapshot: S, spec: WatchSpec<FutureSnapshot<V, S>>) => undefined;
// load: <S extends SnapshotOf<V>, T>(snapshot: S, spec: LoadSpec<FutureSnapshot<V, S>, T>) => undefined;
```

`ContainsReadKey` distributes over tuple alternatives. A key is required only when every alternative proves an
occurrence; a union-valued element or unbounded rest alone proves none. The supported controls are:

| Key selection | Required values | Optional values |
| --- | --- | --- |
| `["status"]`, including a duplicate `"status"` | `status` | none |
| `["status", "count"]` | both | none |
| `["status" \| "count"]` | none | both |
| `["status"] \| ["count"]` | none, or an equivalent sound snapshot union | possible alternatives |
| `["status", ...("status" \| "count")[]]` | `status` | `count` |
| Broad `Keys<V>`, also supplied as an explicit type argument | only what that key type guarantees | other possible keys |

The sketch is deliberately conservative after an unbounded rest: in `["status", ...extra, "count"]`, `count` can
remain optional even though it occurs at runtime. Put known required keys before the rest when that precision is
useful. No suffix-aware type algorithm or extra qualification campaign is required for this delivery.

A naive `Snapshot<V, keyof S["values"] & keyof V>` is insufficient for broad `SnapshotOf<V>`: its possible keys
may not have been read. Also distribute `FutureSnapshot` over `S` **before** computing each branch's keys.
For `choose ? facet.read(["status"]) : facet.read(["count"])`, the non-distributive helper erases non-common keys;
the corrected helper preserves ordinary `in` narrowing while rebuilding every value from declared `V`.
Keep `T` inferred from the loader's actual result, independent of refinements on its starting snapshot. Preserve wider-record-to-narrower-area facet
assignment, mixed-key rejection from #183, branding and foreign-snapshot runtime rejection. This private helper
must survive emitted declarations, both resolvers and the real Assembly contracts, not just a stand-alone alias.

Strengthen the writer type structurally as well. `Store<in out V>` catches alias-to-alias comparison, but variance
annotations alone do not govern all structural comparisons. The reproduced spread, `Pick<Store<V>, "set">` and
extracted member routes widen a `"light" | "dark"` writer to `string` and allow `"pink"`. Place a private invariant
witness on the **callable `set` member**, so extracting the member retains the check:

```ts
// Member of Store<in out V>; storeValue remains a file-local unique symbol.
// set: {
//   <const K extends Key<V>>(patch: { readonly [P in K]: Frozen<V[P]> }): number;
//   readonly [storeValue]: (value: V) => V;
// };
```

The marker is type-only, uses the same single documented boundary cast as the existing brands, adds no runtime
property and exports no new name. Verify same-type use and ordinary `set` inference as positive controls, then
reject writer widening through aliases, spread, `Readonly`, `Pick` and the extracted function. Keep ordinary typed
command ports as the inter-module write path; this repair does not make a structurally invented write port safe to
publish or protect against explicit casts. Do not claim variance annotations alone establish the guarantee.

Port the complete archived type groups first, then add these cases in `types-structural.ts` / `types-traps.ts` and
their runtime witnesses in the existing store/load tests. If a formerly passing unsafe case now rejects, preserve
its old archive and record the exact corrective reason; do not change arbitrary negative gates to fit output.
**Disposition of the historical watch-only residual (T25).** ADR-0034's Contract describes a port containing only
`watch`, or the extracted member, as structurally accepted and requires full `ReadonlyStore<Slice>` dependencies.
The archived p8 lines 29/30 demonstrate wrong-record `Pick<ReadonlyStore<Unrelated>, "watch">` and
`ReadonlyStore<Unrelated>["watch"]` assignments. These two cases now reject with TS2322 because future values depend
on the facet's declared `V`. Preserve the archived bytes; mark exactly these two live-fixture expectations as
deliberate rejecting corrections under T117 and retain same-record positives. The supported full-facet recipe and
runtime behavior are unchanged. The ADR's affirmative residual observation no longer describes the corrected
declarations; record that enforcement correction in the implementation port note and reconcile any normative text
through the ADR owner route, preserving accepted bytes. Do not restore the hole or claim the old positive still
passes. If an owner instead requires compatibility for that already-disallowed dependency shape, that is the
specific competing semantic decision under section 1.4, not a new requirement to ask about the TypeScript floor.

README and guide get the same short owner recipe: `State = { state: StateUnion }`, read that one key, narrow each
fresh value, and publish one complete transition. Include a rejected impossible aggregate and a positive valid
transition. Do not introduce a ban on all top-level unions or a mandatory state-machine DSL to teach this rule.

## 9. Test plan

Lane "observation" is the lane of Q2 (three OS, Node 26 and 24). M1, M2 and R are required before PR 1, PR 2 and the
release pull request merge, respectively. Package test paths are under `packages/observation/tests/`. Archived probe IDs: P1 to P26 and PB
(`runtime/probes.test.ts.txt`), R1 to R15 (`runtime-b/probes.test.ts.txt`), plus R16/R17 from
`runtime-b/review-regressions.test.ts.txt` in the section 2.2 predecessor. Each ported test title carries its archived
ID in brackets after its T-IDs.

### 9.0 Exact archived type-probe paths

Paths in this table are relative to `research/module-communication-2026-10/raw/api-design/`. Labels such as p3 and
p5 in the test inventory refer to these files; they are not executable paths.

| Label | Exact source | Destination / selection |
| --- | --- | --- |
| p3 | `probes/p3-variance-controls.ts.txt` | `types-structural.ts` and variance controls |
| p5 B | `probes/p5-gm-contracts.b.ts.txt` | `tests/observation/assembly-contracts-types.ts` |
| p5 A | `probes/p5-gm-contracts.a.ts.txt` | Do not port: the unselected variant A |
| p6 | `probes/p6-runtime-only.b.ts.txt` | `types-runtime-only.ts` |
| p7 | `probes/p7-set-without-exact-optional.ts.txt` | `types-loose-optional.ts` and loose compiler control |
| p8 | `probes/p8-structural.b.ts.txt` | `types-structural.ts` |
| p9 | `probes/p9-traps.b.ts.txt` | `types-traps.ts`, including the #183 mixed-open-key regressions |
| p10 | `probes/p10-gm-main-implement.b.ts.txt` | `tests/observation/assembly-implement-types.ts` |

### Required test inventory

| Archived check | Test | Lane | Level |
| --- | --- | --- | --- |
| `type-tests.ts`, p3, p6, p7, p8, p9 | the six `types*.ts` files via `observation:typecheck` (7.0.2 floor/current, NodeNext and Bundler; section 2.3 deduplicates equal versions) | observation | M1 |
| p5 GM contracts, p10 `implement` and `scoped` | `tests/observation/assembly-*-types.ts`, same typecheck | observation | M1 |
| p7 without `exactOptionalPropertyTypes`; controls `b-no-variance-annotation` (passes) and `b-v-in-param` (TS2636) | `type-controls.test.mjs` | observation | M1 |
| `readme-examples` | `tests/observation/readme-examples.test.mjs` | observation | M1 |
| P1, P15, P16, P21, P25, P26, PB; R11, R15; sketch v4 value defects | `store.test.mjs` | observation | M1 |
| P2, P5, P7, P8, P9, P10, P20; R1, R3, R4, R5, R8; 1000 watches on one signal with an explicitly raised stress-fixture scope limit, without a process warning | `subscriptions.test.mjs` | observation | M1 |
| P6, P11, P12, P13, P14, P17, P24; R6, R7 | `load.test.mjs` | observation | M1 |
| P18, P19, P22, P23; R9; R13 heartbeat, server, depth and C4; event-loop order probe | `guards.test.mjs` | observation | M1 |
| R10, R12, R14 (W1, W2, `asyncDetection`) | `testing-entry.test.mjs` | observation | M1 |
| R16/R17 (all 19 cases), strengthened P2/P11/P17 and R1/R6/R7, fake-clock and synchronous-loader environment controls | `guards.test.mjs`, `load.test.mjs`, `testing-entry.test.mjs`, `processes.test.mjs` | observation | M1 |
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
`127.0.0.1` port 0; heartbeats wait for a count of beats with a deadline. Carry the applicable sketch v4 regressions
under the accepted plain-data contract: reject accessors without invoking their getters, keep `__proto__` data keys,
stop a flush after `close()` inside a handler, and record every publication so
a stale result in A, B, A never appears. The order probe asserts that an immediate's `nextTick`, promise and
`queueMicrotask` callbacks all run before the next immediate
(`raw/api-design/reviews/critic-adv/bunprobe/order.mjs.txt`). Extend that probe with two stores, an external immediate
between their pairs, and a third store scheduled by a microtask: preserve separate task checkpoints and context
closure. Extend the existing `store-closed` GC mode to drain queued deliveries before dropping its store references;
the retained control and closed-store collection then reject a FIFO that retains completed callbacks. No public
queue accessor or separate queue-counter API is needed. A timing-only comparison of the old prototype is insufficient.

Port all 19 R16/R17 cases from section 2.2. Preserve the distinction between a settled loader, queued publication,
the callback's microtask checkpoint and a later independent timer. For the stale-result witness, prove publication
is queued before the invalidating commit, then assert that its callback never appears. For close/cancellation,
await `delivered()` after closing before asserting no result was published; an assertion made before the queued
callback could run is insufficient. Include filtered and global waits and no false drain debt after loader settlement.

T40 uses one table over `onChange`, `onLoading`, `onResult` and `onError`, with a thrown sentinel and an invalid
returned value for each. Assert the report's subscription/revision/cause, another subscription's delivery, and a later
valid delivery to the offending subscription. These are behavioral oracles, not a test of the shared `invoke` helper.

For T43's detach-during-delivery case, put two handlers in the same child scope and let either handler close it on
entry. Assert one total call without fixing which handler runs first. For T21/T54, an echo/cascade-rejected patch
contains a new plain object: it remains unfrozen and the store's values/revision stay unchanged. These checks
exercise the accepted ordering of validation, guards and ownership transfer.

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
- The `fake-clock-before` mode freezes both global clocks before import while leaving the builtin clock intact.
  A never-settling loader still causes `settled()` to reject with `observation.testing.timeout`; a separate parent
  watchdog prevents a broken implementation hanging the suite. Assert the error code and frozen globals, not an
  elapsed-time threshold. In both `no-builtin-module` and `no-node`, also call a synchronous loader that writes a
  followed key: exactly one loader call and one echo report prove context entry after the startup await.
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
   120 s timeout. Caught means a failing semantic probe that exercised the intended defect, or its explicitly
   designated bounded hang when `mayHang` is set. Syntax/import errors, fixture setup failure and harness failure
   never count as detection; report them as a broken mutation run.
4. Runs defects with concurrency `Math.max(1, Math.min(2, availableParallelism() - 1))`, prints the failing semantic
   test identities per defect, and fails if any defect is not caught. Avoid multiplying child-test concurrency merely
   because a machine advertises many CPUs; batch compiler work before considering more parallelism.

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
compiles on the supported compiler set of section 2.3, NodeNext and Bundler, `skipLibCheck: false`. Source rules on
`dist/**/*.js`: no `process.env`, no `node:` import, `getBuiltinModule` only with `"node:timers"`,
`"node:async_hooks"` and `"node:perf_hooks"`, and the import graph of `dist/testing.js` is relative files only.

`type-controls.test.mjs` copies `package.json` and `dist/**/*.d.ts` into `<tmp>/node_modules/@get-modular/observation`,
links resources, writes the test type files with `"../dist/index.js"` and `"../dist/testing.js"` replaced by the package
specifiers, edits one anchor exactly once per control and compiles on the supported compiler set: without `out` in
`ReadonlyStore<out V>`, `types-structural.ts` stays clean; with `watch` in the parameter form
`<K extends Key<V>>(snapshot: Snapshot<V, K>, spec: WatchSpec<Snapshot<V, K>>) => undefined`, `types.ts` fails with
TS2636 errors only, all in the edited declaration; and `types-loose-optional.ts` stays clean with
`exactOptionalPropertyTypes: false`.

### 9.6 Root integration tests and the lint fixture

`tests/observation/assembly-contracts-types.ts` and `assembly-implement-types.ts` port p5 and p10 against the workspace
Assembly, Core and resources. `readme-examples.test.mjs` extracts the `ts` blocks of the package README into a temporary
directory with junctions `node_modules/@get-modular/{core,assembly,resources,observation}` to the workspace packages (as
`tests/assembly/consumer-standard-examples.test.mjs` does), prepends the prelude of
`raw/api-design/tools/readme-check.mjs.txt` and compiles them with the section 2.3 migrated `testAssemblyTypes` from
`architecture/tooling/test-assembly-types.mjs`; it must report only supported compiler versions. `assembly-integration.test.mjs`: an owner built with
`implement(..., scoped)` returns `store.readonly()` as a capability; a consumer with a `required` slot watches it;
`prepare`, `run` with an attempt scope, `set`, `delivered`, close: complete report and `liveSubscriptions(facet) === 0`;
`isolate` from conformance accepts the owner (own-property port check). For cancellation while the consumer factory
awaits, resume it after abort and prove `watch`/`load` throws the identical Host reason without registering anything.
Assembly `run()` returns its existing failed outcome, with `assembly.run.factory-rejected` carrying that cause and
`cancellation.reason` identical to the Host reason; do not expect `run()` itself to reject. Follow the A4 case in
`tests/resources/assembly-scope.test.mjs`. PR 2's `consumer-standard-lint.test.mjs` writes the CMS JSON snippet as `.oxlintrc.json` in
a temporary directory with `src/features/a/composition/a.module.ts`, `src/features/a/adapters/outbound/x.ts` and
`src/features/a/composition/a.test.ts`, each importing `@get-modular/observation/testing`, runs
`node node_modules/oxlint/bin/oxlint -c .oxlintrc.json .` and asserts exit code 1 with two `no-restricted-imports`
errors (module and adapter) and none for the test file.

### 9.7 Corrective cases from the research and plan reviews

Add these cases to the existing test files; there is no new mandatory suite, benchmark service or full cross-product
of every bad input with every callback. The earlier research ran on the corrected #183 prototype and real resources.
It establishes defects/candidate repairs only; the package implementation must run the same independent oracles.
The schedules below are sufficient to recreate the relevant counterexamples without a contributor's scratch files.

| Case / matrix | Smallest failing schedule and required result | Existing test destination |
| --- | --- | --- |
| R18 / T114, callback returns | An offending callback and a healthy sibling observe a commit. Return `null`, an object whose `then` getter throws a sentinel, and an ordinary rejected promise in separate cases. No uncaught failure; invalid return reported once, distinct getter/rejection cause preserved; sibling and later offender delivery succeed. An invalid async promise whose microtask attempts an echo produces one invalid-return plus exactly one guard report. A returned `then` getter/call that writes a followed key must also reject at the first write: unchanged value/revision, one member read/call, the same two reports and one healthy sibling delivery. Isolation without the originating context must fail this oracle. Keep ordinary throw/scalar controls and the T40 table; exotic cases exercise the shared path without a cross-product. | `subscriptions.test.mjs`, `load.test.mjs`, one `process-probe.mjs` isolation mode through `processes.test.mjs` |
| R19 / T115, ALS retention | A callback captures a payload and starts a timer with a module-level no-op callback under a separate still-live owner. Close subscriber/source scopes, release their handles and drain delivery tasks, retaining only the timer handle outside the callback. Payload is collectible before that timer is cleared; an explicitly retained control stays live. Keep R13 heartbeat/no-false-echo and active-loader guard cases. A narrowed annotation around an actual Registration must fail this oracle. | Extend `gc-probe.mjs` and its existing process driver; `guards.test.mjs` |
| R20 / T116, arrays | An Array subclass has a private mutable offset and inherited getter; `move()` changes a read value while revision stays zero in the prototype. Reject it and a custom-prototype array before ownership transfer, including nested initial/patch positions; no getter call and no freezing on rejection. Ordinary arrays, holes, nested records and a repeated frozen child remain positive controls. | `store.test.mjs` |
| R21 / T117, read/future types and writer widening | Narrow an origin-valid snapshot to `status: "ready"`, then watch/load while the owner commits `"loading"`. Every future callback uses the full declared value union. Both `read` members reject required-value dereferences for dynamic union keys, tuple alternatives and broad `Keys<V>`; fixed tuples/duplicates and a required prefix keep their guarantees. Broad `SnapshotOf` preserves optionality; a union of valid snapshots supports ordinary `in` narrowing. Reject widened writer aliases/spread/member extraction; same writer and wider facet-to-area assignment stay valid. | `types-structural.ts`, `types-traps.ts`, `store.test.mjs`, `load.test.mjs`; packed declarations reuse the same fixtures |
| R22 / T118, late watch/load depth | In 71 stores, set the next store and attach its watch with a saved snapshot. The prototype makes 71 calls; the pre-attached control makes 65 then rejects depth 65. Both forms must reject the same first forbidden commit, leave its target unchanged and report once. Repeat the distinguishing load chain from `onResult`, ignoring initial zero results, for saved/fresh argument snapshots and pre-attached/late registration; include the focused `onLoading` form. The precise provenance controls below distinguish catch-up from a new load's keys-only initial run. | `guards.test.mjs`, using existing store/scope helpers and barriers |
| R23 / T119, startup and callback-close boundaries | Hold run 0; offer revision 1 as pending, then commit revision 2 and settle run 0 in one turn before flush 2. Required loader calls are 0 and 2, with only result 2 published; obsolete 1 never starts. Separately invalidate the first run before its startup await resumes. Also have `onLoading(1)` synchronously close its subscriber while run 0 is held: live/pending must immediately be zero, active remains one only until the real run settles; no later loader/publication. An untouched current run still starts, and a skipped job adds no active/pending count or fictitious debt. | `load.test.mjs`; reuse R17 publication/drain controls |

R19 uses the existing bounded collection-round protocol with retained controls, not a wall-time memory promise.
A timer callback that itself closes over the payload would test intentional user retention and is not this oracle.
R22 uses the bounded representation in sections 7.2/7.3. Its additional small schedules are:

| Schedule | Required causal result |
| --- | --- |
| One key: revision 1 at depth 64, revision 2 at depth 1; watch from revision 0 | Delivery depth 64. A latest-depth-only scalar is insufficient. |
| The same changes, but the starting snapshot includes revision 1 | Delivery depth 1. A maximum-depth-only scalar is insufficient. |
| Add another selected key changed after that starting snapshot at depth 9 | Delivery depth 9; an unrelated unselected key never contributes. |
| Keep a revision-0 snapshot, make revision 1 at depth 64, finish all its delivery/context-close tasks, then watch the old snapshot | Catch-up retains depth 64; the callback's next non-echo commit rejects at 65. No flush-window expiry is invented. |
| Instead read a fresh baseline after the deep commit; an independent action later changes a selected key outside any live context | No initial watch callback; the new commit/catch-up has depth zero and a callback's next non-echo commit succeeds at 1. R13 still excludes old timer contexts. |
| Register an initial load outside a live context after old deep state exists, using either a saved or fresh snapshot | Initial depth zero and newest values; the input revision is ignored. |
| Register an initial load inside a live context without any new commit | It inherits that depth without incrementing it: at depth 63 its next commit at 64 succeeds; at depth 64 its next commit at 65 rejects. |

The 65-slot bound follows the finite depth range, not a timing or scale assumption. Clear store-owned causal
metadata on close; no callback/resource/engine reference may hide in a retained live token. The isolated candidate
checks support these choices but are not package qualification. Do not add a global epoch or an event journal.

The author examples additionally demonstrate existing T19/T28/T32/T41/T77 semantics: one atomic aggregate patch,
coalesced A-B-A state, closing before delivery, latest result versus external effect completion, and ordinary versus
guard diagnostic revisions. Do not repeat a full application smoke test for every primitive case. One consumer
scenario in section 14 proves the connected ownership recipe; optional scale questions use #184's existing track.

Add a new mutation only when it distinguishes a material invariant not already rejected by the existing defects.
The six positive/negative counterexamples are required; a second mutation framework or one mutant per prose rule is
not. Historical passing probes are not rerun as a substitute for these missing cases.

## 10. Traceability matrix

Every normative sentence of ADR-0034 has a row; T114 onward names the reviewed corrective cases under those
statements, not new public API. T103 records the explicit compiler-policy successor instruction. "Doc only" rows give the reason no test applies. Test titles (or a
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
| T15 | Optional properties or any open index signature do not compile, including beside a fixed property. | `types.ts` | `t/types.ts`; `t/types-traps.ts`: all #183 mixed numeric/template negatives and finite-key positive controls | 1 |
| T16 | Plain data only: accessors, class instances, functions, `Date`, `Map` and `Set` rejected. | `values.ts` | `t/store.test.mjs` (each kind, nested, in `initial` and in `set`) | 1 |
| T17 | The store closes when the owner's scope releases its entry. | `store.ts` | `t/store.test.mjs` (owner scope closed: facet `read` throws `observation.store.closed`) | 1 |
| T18 | The owner's `Store` has `read`, `set`, `readonly` and `close`. | `store.ts` | `t/types.ts`; `t/semantic-suite.mjs` | 1 |
| T19 | `set(patch)` commits the patch keys, keeps the others and returns the revision. | `engine.ts` | `t/store.test.mjs` | 1 |
| T20 | A patch that changes nothing by `Object.is` commits nothing. | `engine.ts` | `t/store.test.mjs` (`NaN`, `-0` and `+0`, same object; `commits` unchanged) | 1 |
| T21 | `set` validates every value first, then takes ownership and freezes in place. | `values.ts` | `t/store.test.mjs` [P21, P26]; `t/guards.test.mjs`: echo/cascade rejection leaves new patch objects unfrozen | 1 |
| T22 | `readonly()` returns the facet other modules receive. | `store.ts` | `t/store.test.mjs` (same frozen object, own properties); `tests/observation/assembly-integration.test.mjs` | 1 |
| T23 | The facet has `read`, `watch` and `load` and no way to write or close. | `store.ts`, `types.ts` | `t/types.ts`; `t/store.test.mjs` (no `set` or `close` at run time) | 1 |
| T24 | The marker rejects another record through aliases, `Readonly`, intersections, containers, `Pick` and hand-written ports with `read`; a wider record serves a narrower slice. | `types.ts` | `t/types-structural.ts`; `tests/observation/assembly-implement-types.ts`; `t/type-controls.test.mjs` | 1 |
| T25 | Dependencies use full `ReadonlyStore<Slice>`; the ADR's affirmative watch-only residual is a historical observation corrected as recorded in section 8.1. | `types.ts`; implementation port note | `t/types-structural.ts`: the two wrong-record p8 expectations deliberately reject under T117; same-record positives and README rule remain | 1 |
| T26 | `read(keys)` returns the revision and the frozen values of exactly those keys. | `engine.ts` | `t/store.test.mjs` (keys, frozen, `observation.keys.empty`) | 1 |
| T27 | Snapshots are branded: a hand-built one does not compile; a copied or foreign one fails at run time. | `types.ts`, `registry.ts` | `t/types.ts`; `t/types-runtime-only.ts`; `t/store.test.mjs` [PB] | 1 |
| T28 | A revision is a commit number, not proof of a change; handlers apply idempotently. | `engine.ts` | `t/store.test.mjs` (one revision per effective commit); idempotence is doc only (a handler property) | 1 |
| T29 | `watch` follows every key of the snapshot from its revision; a commit between `read` and `watch`, also across `await`, is delivered. | `watch.ts` | `t/subscriptions.test.mjs` [P1]; writer gate `e-async-factory` | 1 |
| T30 | No separate starting revision and no key list. | `types.ts` | `t/types.ts` (unknown option) | 1 |
| T31 | `load` uses the snapshot for its keys only; the first run uses the newest values. | `load.ts` | `t/load.test.mjs` (commit between `read` and `load`) | 1 |
| T32 | One active run, at most one pending; a change aborts the run; `onLoading` when a newer run is queued; results only if no commit touched the keys since the run started. | `load.ts` | `t/load.test.mjs` [P6, P17, R3, R7, R17], including a commit after publication is queued; four mutations | 1 |
| T33 | `resources` is required. | `types.ts`, `admission.ts` | `t/types.ts`; `t/store.test.mjs` (missing or invalid: `observation.argument.invalid`) | 1 |
| T34 | A watch binds to `resources.signal` and detaches when it aborts: scope or ancestor closing, or the constructing run cancelled. | `watch.ts` | `t/subscriptions.test.mjs` [P2, R1]; `tests/observation/assembly-integration.test.mjs` | 1 |
| T35 | Nothing is registered in the scope for a watch. | `watch.ts` | `t/subscriptions.test.mjs`: a counting Resources wrapper proves zero `use`/`setup`/`child` calls for watch; real-scope GC [P4, R2] independently proves release | 1 |
| T36 | A load opens `load:<name>` that drains its run; a run still going after escalation is a failed debt. | `load.ts` | `t/load.test.mjs` [P11, P12, P13, P14, R6] | 1 |
| T37 | `name` is required and unique per store within one scope; a duplicate throws. | `admission.ts` | `t/subscriptions.test.mjs` [P8, R5]; `t/types.ts` | 1 |
| T38 | Default limits: 64 subscriptions per scope per store and 8192 per store; at the store limit every new subscription fails until released; the message gives scopes and the largest count. | `admission.ts` | `t/subscriptions.test.mjs`: exact default 64/65 and 8192/8193 boundaries, capacity recovered after detach, independent scopes/stores, configurable limits [P8, P10, P26, R5] | 1 |
| T39 | Handlers are synchronous and typed to return `undefined`. | `types.ts` | `t/types.ts`; `t/types-traps.ts` | 1 |
| T40 | Each callback is isolated: a throw or returned value is reported with name and revision, stops no other delivery, keeps the subscription. | `engine.ts` (`invoke`) | `t/subscriptions.test.mjs` and `t/load.test.mjs`: the four-callback table in section 9.1, with sibling and subsequent delivery controls [P15] | 1 |
| T41 | `ListenerError` is branded; only the store creates reports. | `types.ts` | `t/types.ts` | 1 |
| T42 | `reportError` must not throw; a throw is rethrown as an uncaught exception. | `engine.ts` (`report`) | `t/processes.test.mjs` (`throwing-reporter`) | 1 |
| T43 | A detached subscription is never called again, also mid-delivery; one added during a delivery waits for the next. | `engine.ts` (`flush`) | `t/subscriptions.test.mjs` [P20]: either first handler closes their shared scope, one total call without pinning order; added-during-delivery case | 1 |
| T44 | Call order within one delivery is deterministic but not part of the contract. | `engine.ts` | doc only: no test may pin the order | 1 |
| T45 | `close()` detaches every live subscription, sends each one `observation.source.closed` and aborts running loads. | `engine.ts` | `t/store.test.mjs` [P4]; `t/load.test.mjs` [P14, R17], asserting no publication after `delivered()`; `t/gc-probe.mjs` | 1 |
| T46 | After `close()`, `set`, `watch`, `load` and the facet's `read` throw `observation.store.closed`; the owner's `read` returns the last values. | `engine.ts`, `store.ts` | `t/store.test.mjs` [P25, R11, R15] | 1 |
| T47 | Every package error is an `ObservationError` with an `observation.<area>.<reason>` code; a report keeps the handler's throw as `cause`. | `errors.ts` | `t/store.test.mjs` (a table of every thrown code; `cause` identity) | 1 |
| T48 | An already aborted `resources.signal`: nothing registered, its reason rethrown as it is. | `admission.ts` | `t/subscriptions.test.mjs` [R8] | 1 |
| T49 | `Store` invariant, `ReadonlyStore` covariant; the marker carries the slice check. | `types.ts` | `t/types-structural.ts`; `t/type-controls.test.mjs` | 1 |
| T50 | Deliveries and load runs carry a delivery context. | `context.ts` | `t/guards.test.mjs` (with T51 to T60) | 1 |
| T51 | A live-context commit to a key the delivering subscription follows on the same store fails at once with `observation.delivery.echo`. | `engine.ts` (`set`) | `t/guards.test.mjs` [P18, P22, R9, C4]; mutation `no-echo-guard` | 1 |
| T52 | Other live-context commits are one step deeper; outside any context depth 0; a delivery takes the largest coalesced depth. | `engine.ts`, `context.ts` | `t/guards.test.mjs` [P19] | 1 |
| T53 | A commit deeper than 64 steps fails with `observation.delivery.cascade`. | `engine.ts` | `t/guards.test.mjs` [P19, P23, R9, R16]: depth 64 succeeds, 65 fails, first rejected commit changes nothing; mutation `no-cascade-guard` | 1 |
| T54 | A failing commit changes nothing, is reported to the committing store's `reportError`, then throws. | `engine.ts` | `t/guards.test.mjs` (value unchanged; one report; error thrown) | 1 |
| T55 | In a fire-and-forget continuation it is an unhandled rejection that ends a Node process. | platform | `t/processes.test.mjs` (`echo-exit`) | 1 |
| T56 | A Host may choose its own unhandled-rejection policy. | README | doc only: Host policy | 1 |
| T57 | The context is carried synchronously everywhere and through `await` where `AsyncLocalStorage` exists. | `context.ts` | `t/guards.test.mjs` [P22, R16]; `t/processes.test.mjs`: both no-ALS modes exercise synchronous watch and loader echoes | 1 |
| T58 | It counts only while live: a handler until its delivery task ends, a loader while its run is active. | `context.ts`, `engine.ts`, `load.ts` | `t/guards.test.mjs` [R13, R16/R17]: callback microtasks included, later timers excluded, settled loader creates no false debt; order probe; mutation `unbounded-context` | 1 |
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
| T71 | `./testing` gives `liveSubscriptions(facet, resources?)`, `delivered`, `settled` with `stores`, `signal` and deadline, and `asyncDetection`. | `waits.ts` | `t/testing-entry.test.mjs` [R10, R12, R17]: filtered/global waits include queued publication; `t/types-testing.ts` | 1 |
| T72 | The deadline is on by default (5000 ms); only an explicit `Infinity` removes it; a signal ends earlier without removing it. | `waits.ts` | `t/testing-entry.test.mjs` [R14 W1] (default deadline, `Infinity`, `NaN`, 0) | 1 |
| T73 | Builtin `setImmediate` and clock are captured at load, so fake globals before or after import stall neither deliveries nor waits; mocks of builtin methods come after import. | `platform.ts` | `t/testing-entry.test.mjs` [R14 W2]; `t/processes.test.mjs` (`fake-before`, `fake-clock-before`) | 1 |
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
| T90 | The Standard and examples change in the delivery; its current reviewed bytes are pinned again; the entire frozen SDK-growth observation stays unchanged; pinning consumers migrate or record outstanding work. | CMS; current ownership pin; PR 2 delta | `pnpm ownership:checkpoint:test`; unchanged frozen evidence diff; `pnpm sdk-growth:check`; PR 2 description (V9) | 2 |
| T91 | Reading a durable authority each time stays valid; a store is not a cache. | CMS rule 6 | doc only: guidance | 2 |
| T92 | The packed archive names exactly one 0.x minor of resources. | `workspace:^` | `t/packed-root.test.mjs` | 1 |
| T93 | A resources minor needs its own observation minor changeset. | process | Phase 3a stop condition | 3 |
| T94 | The row declares resources as its only peer and lists after resources. | leaf row | `tests/leaf-package-admission.test.mjs` | 1 |
| T95 | The row lists its subpaths; export checks admit exactly two for this row and one root for the others. | leaf checks | `tests/leaf-package-admission.test.mjs`; `tests/governance.test.mjs` | 1 |
| T96 | The leaf build requires `dist/testing.js` and `dist/testing.d.ts`. | `build-leaf-package.mjs` | `tests/leaf-package-admission.test.mjs` (`leafBuildOutputs`); `pnpm observation:build` | 1 |
| T97 | Packed root: `import` and `require(esm)` for both; deep-import, manifest and unknown-subpath negatives. | — | `t/packed-root.test.mjs` | 1 |
| T98 | The admission entry arrives with the root and implementation; nothing precedes them. | PR 1 | commit 1a adds no row; "a root outside the table stays rejected" stays green | 1 |
| T99 | Public from 0.1.0 through Changesets in the first release pull request; TEST consumer on its archives; 1.0.0 needs a separate decision. | Phase 3; leaf version rule | Phase 3a and 3b done criteria; leaf admission rejects 1.0.0 under the current row | 1, 3 |
| T100 | Uploads follow ADR-0030's release rules; no unattended publisher. | Phase 3c | doc only: the owner publishes | 3 |
| T101 | Pre-1.0 breaks ship as minors with a changelog entry and a migration note. | `AGENTS.md` | doc only: future releases | later |
| T102 | Not enrolled in `package.public-api-compatibility` or G1. | do-not-touch list | `pnpm sdk-growth:check`; `public-api-compatibility.yaml` unchanged | 1 |
| T103 | Minimum/current type probes, with the owner-authorized minimum 7.0.2 and NodeNext/Bundler. The ADR's 5.8.3 planning snapshot needs the section 2.3 authority alignment. | tests; compiler policy predecessor | `pnpm observation:typecheck`; section 8.1 controls | 1 |
| T104 | Buffers and dispatch probed through an internal counter hook that is not exported. | `registry.ts` | `t/subscriptions.test.mjs` [P5, P7, R3, R4]; `t/packed-root.test.mjs` (no `storeStats` export) | 1 |
| T105 | Every runtime probe runs on each Node line in the Linux, macOS and Windows lanes. | CI | `tests/ci-check-lanes.test.mjs` | 1 |
| T106 | Probes assert counts and order, not wall-clock thresholds. | tests | review: a search for `performance.now` and `Date.now` in the tests finds no elapsed-time assertion | 1 |
| T107 | Mutation check per archived defect, a patched copy each, never a switch. | tests | `t/mutations.test.mjs` | 1 |
| T108 | Writer references pass and every negative fails, against the package build. | tests | `t/writer-gate.test.mjs` | 1 |
| T109 | Subprocess tests for the echo exit, the abort listener and `reportError`. | tests | `t/processes.test.mjs` (T55, T66, T42) | 1 |
| T110 | The packed-root test installs the archive with the resources archive on the supported Node lines. | tests | `t/packed-root.test.mjs` in both Node lanes; `tests/node-runtime-compatibility.test.mjs` | 1 |
| T111 | A bounded TEST consumer passes on the release archives before the release pull request merges. | TEST project | Phase 3b | 3 |
| T112 | Every known item has an owner and a trigger. | README | doc only: listed with links to ADR-0034 | 1 |
| T113 | One internal deferral queue per package copy, not configurable or exposed to production modules. | `src/features/delivery/context.ts` private FIFO | Source review of its single owner; multi-store ordering in `t/guards.test.mjs`; drained `store-closed` GC control; T13/T97 verify one installed copy across entries and no exported queue | 1 |
| T114 | T40 isolation includes invalid returned values; user-controlled inspection/assimilation keeps the originating context and T54's already-reported guard identity. | `engine.ts` invocation path | R18, return-context/guard-identity and healthy/subsequent-delivery controls | 1 |
| T115 | Closed delivery context retains no Registration, engine, resources or subscriber payload. | `context.ts`, detached origin construction | R19 plus T58/T59 window controls | 1 |
| T116 | T16/T21 plain-data validation also rejects mutable behavior hidden behind array prototypes. | `values.ts` | R20 and ordinary-array positive controls | 1 |
| T117 | T26 read types guarantee only selected keys; future snapshots preserve key alternatives and use the declared value domain; T49 writer invariance survives member extraction. | `types.ts` | R21, both resolver modes and packed declaration fixtures | 1 |
| T118 | T29 watch catch-up retains bounded committed provenance; a first load preserves its live registration causality while its input remains keys-only. | `engine.ts`, watch/load admission | R22: deep, mixed-key, saved/fresh snapshot and independent-registration controls | 1 |
| T119 | T31/T32 currentness is checked after startup await and before publication; T43/T45 close is rechecked after `onLoading` before work is acquired. | `load.ts` | R23; untouched current run, counter and close controls | 1 |

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

Validate `subpaths` only when explicitly present; omission retains the root-only default for existing public and
private rows. `identityProblem` returns `"subpaths"` if an explicit value is not an array of unique strings with `"."`
first and all other elements matching `/^\.\/[a-z][a-z0-9-]*$/u`, or if that explicit field belongs to a non-`PUBLIC`
row. Reject `"./index"`, which would alias the root's source and output. `leaf-package-admission.mjs` compares
`manifest.exports` with `expectedLeafExports(leaf)` and requires every `leafEntrySources(leaf)` file; drop `ROOT_EXPORT`.
For root-only rows, preserve all existing diagnostic text and validation order, including outer export-map errors,
`requires one root-only ESM export and no deep import` and `requires src/index.ts`. Only rows admitting additional
subpaths use new messages such as "requires exactly its row's ESM export subpaths and no deep import".
`production-artifacts.mjs`: `exportMapViolations(exportsField, publicationBlocked, subpaths)` checks that the keys equal
`subpaths` and validates each subpath with the existing carrier rules (labels `exports["<subpath>"]`, the `.` messages
unchanged); `manifestCarrierViolations` passes `leafSubpaths` for existing leaf checks and `["."]` for Core.
Keep `ESM_CARRIER_NAMES` and the existing separate Assembly validation route unchanged.
`build-leaf-package.mjs`: `access` every `leafBuildOutputs(leaf)` path under the package root. Tests in
`tests/leaf-package-admission.test.mjs`: keep the independent `rootExport()` literal and define a separate literal
for the synthetic `./testing` row. Compare the helpers to those literals; never generate both fixture and expected
answer with the helper under test. Admit the synthetic row only with both exports and both `src` entries; reject
invalid `subpaths` values. Preserve condition-key ordering tests and add the corresponding `./testing` negatives.

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
        + " && node node_modules/typescript/bin/tsc -p packages/observation/tsconfig.types.bundler.json --noEmit",
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
  - id: observation-store           # roots: explicit file list below; entrypoints: types.ts, registry.ts, store.ts
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
lists); the comments above only give the content. The nine `observation-store` roots are
`S/features/store/types.ts`, `S/features/store/values.ts`, `S/features/store/registry.ts`,
`S/features/store/arguments.ts`, `S/features/store/engine.ts`, `S/features/store/admission.ts`,
`S/features/store/watch.ts`, `S/features/store/load.ts` and `S/features/store/store.ts`.
Expand `S` to `packages/observation/src` in every actual YAML path. Add `"@get-modular/observation"` to the packages of
`repository.development`. Add the observation entries next to conformance in
`architecture/foundation/quality-source-coverage.yaml` (`packages/observation/tsconfig.json`),
`suppression-governance.yaml` (`packages/observation/src`) and the `fullScanPaths` of `repository-agent-workflow.yaml`
(`packages/observation/tsconfig.json`, `package.json`, `tsconfig.types.json`, `tsconfig.types.bundler.json`).

### 11.5 Do not touch

`architecture/public-api/**`, `architecture/foundation/public-api-compatibility.yaml` (no G1 enrolment),
`architecture/sdk-growth/status.json`, `architecture/sdk-growth/evidence/consumer-module-standard.json`,
`architecture/contracts/**`, `architecture/checks/release-owned-files.mjs`
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
  21.8 testing, 21.9 anti-patterns from sections A to F of `raw/practices/practices-catalog-v2.md`. Include the
  concrete state/command/event decision test, atomic aggregate example, fresh-snapshot narrowing, completion
  ownership, diagnostic field meanings and bounded cost model of sections 7.6/8.1. These refine the guide's examples;
  they add no required reducer, event package, global registry, readiness protocol or new CMS checker.
- `tests/assembly/consumer-standard-examples.test.mjs`: `"communication"` in `guideExamples` and `observation` in the
  junction list of `compileExample`.

## 13. Changesets

`Authoring surface changed: yes/no` is an established release-note convention, not a Changesets schema field or a
new machine gate. Sources: `git show 3c28a0257817868ec4453e5e297fc4fc3baadb96:.changeset/add-resources-package.md`
and `git show a01a129d39fe6574dba39e6187bb03ef6bcf9945:.changeset/add-conformance-package.md`; both changesets were
consumed by releases and their text remains in the package changelogs. CMS "Module packages and contracts" uses
the release-note declaration when a consumer reviews whether widening a peer range is safe.

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

**Location and inputs.** V10 remains the external TEST repository and `observation-0.1.0/` directory required by
ADR-0034. Use the release head's exact observation, resources, Core, Assembly and conformance archives, verified by
SHA-256 and installed offline with engine checks. Record their actual versions; the planning snapshot is observation
0.1.0, resources per Q4, Core/Assembly 0.5.0 and conformance 0.3.0. Run on Node 24.21.0 and 26.11.1, using only the
pinned compiler set in section 2.3. The writer files come from
`packages/observation/tests/writer-tasks/**` and `packages/observation/tests/support/static-rules.mjs` at that same
release head, whose commit is recorded.

**One connected experiment.** Run the writer gate of section 9.4 against the installed archives. For the connected
composition, retain one settings owner and area contracts, the `a-logger`/`b-catalog` references and one small
independently written projection consumer. Its purpose is to prove the complete ownership recipe, not to repeat
another blind-writer campaign or claim hundreds-of-modules runtime qualification. The projection consumes a narrow
settings facet and an explicit controlled query port; it owns a result aggregate and keeps its store private.
Use ordinary `implement(..., scoped)` entries under one root, with the actual Assembly attempt scope.

The independent consumer scenario has these fixed checkpoints:

1. Construct two instances with different ordinary input identities and separate scopes; start with an origin-valid
   snapshot, hold the factory's own acquisition with a test-controlled promise, commit a settings change, then let
   construction finish. Read/watch or load catches up without a second key list or a global barrier.
2. Hold the first query, change its followed state, observe abort, and settle the obsolete query before settling
   the current one. Only the current result becomes the consumer's owned aggregate; assert the actual result and
   identity through its public port, not only callback counts. The typed fake query's promise includes cleanup.
3. Close one instance during pending delivery/work, use the public test wait after close, and assert no late result,
   complete scope close and zero subscriptions for that instance. Its sibling still changes successfully. Finish
   and close the sibling and assert store-wide zero subscriptions. Keep references needed for the assertion until
   after close; GC of intentionally retained owner data is not claimed by this check.
4. Produce one controlled callback failure and assert its attributed report while another subscription remains
   usable. The Host test sink retains reports through cleanup. Ordinary callback isolation and guard process policy
   have their primitive checks already; do not multiply this whole composition for every bad return type.

Keep the existing CMS/ADR-0037 **test-owned independent provider/input/root oracle** for this selected root; write
only the non-completed rows explicitly. Before the connected scenario, call
`checkWiring(composition, oracles, { declarations })` with exactly the selected module declarations from
`entriesOf(modules)` and the root's selected input declarations. Handwritten expected pins express the intended
composition; never derive them from the completed plan, profile, `describeWiring` or implementation. Record this
result separately: a compatible unintended provider can preserve all behavioral outputs and still be wired wrong.
Use the same consumer test and existing conformance archive, with no new oracle builder, alternative root or
wrong-provider campaign. This is existing CMS binding evidence, not the deferred source-fact work of #184.

Run one `smoke` over the unchanged selected root and the consumer typecheck in NodeNext/Bundler with
`skipLibCheck: false`; do not run the same runtime smoke in every compiler/resolver cell. Assert
`asyncDetection === true`, the CMS lint rejection of a non-test `/testing` import, and the existing child-process
fire-and-forget echo exit after one report. Keep process policy in that process fixture, outside the projection.

**Coordination with merged #184.** Read
[the module fixture plan](../../docs/qualification/module-fixture-plan.md),
[scenario catalog](../../docs/qualification/module-fixture-scenarios.md) and
[handoff](../../docs/qualification/module-fixture-handoff.md) from `132317e` or the reviewed successor. Their P1/C
patterns for a useful independent result oracle, distinct identities, retained close ownership and ready archives
inform this TEST. If their implemented boring helpers are available and reusable within allowed boundaries, use
them; do not copy package engines or create a second fixture hierarchy in Get Modular. Observation does not make
their currently passive P1 depend on watch/load. Their P3 restart, P4 source-fact admission, P5 growth and P6 load
remain separate work that this delivery has not selected. The recorded 500-feature compiler timeout in #184 is a scoped research result,
not an observation limit or a reason to raise budgets. No cartesian scale/platform/consumer matrix is added here.

**Output and failure.** Retain archive hashes, compiler/runtime/OS identities, exact scenario results and the source
of the independently written consumer in the release record. Report runtime, packed, source-architecture and
measurement claims separately; source conformance and scale are not implied by a passing runtime example.
A failed release-archive scenario stops those archives. Fix on main, regenerate the release candidate, then repeat
only the evidence affected by the changed subject while satisfying the release's exact-archive gates.

## 15. Questions a fresh agent will ask

1. **Where does the scheduler live?** `src/features/delivery/platform.ts` resolves "a later task" once at load;
   `src/features/delivery/context.ts` owns the one private FIFO. `StoreEngine.schedule()` enqueues a flush/close pair,
   and result/error publication enqueues its own pair; one queue item always gets one native task;
   `src/features/delivery/pending.ts` counts scheduled flushes and loads for the waits.
2. **How does `./testing` reach internal state without exporting it?** `src/testing.ts` re-exports
   `src/composition/testing.ts`, which re-exports `src/features/testing/waits.ts`; `waits.ts` imports
   `src/features/store/registry.ts` and `src/features/delivery/pending.ts`, the same files the root reaches through
   `store.ts`. ESM loads each file once per installed copy; `packed-root.test.mjs` proves it.
3. **Which compilers do I run?** Section 2.3: TypeScript 7.0.2 minimum and the pinned current version, once if
   they are the same. Use `node node_modules/typescript/bin/tsc`; never choose a compiler from an ambient command
   or an unpinned registry tag. NodeNext and Bundler remain distinct cases. Resolve manifests with `createRequire`
   and record actual versions. The existing Assembly helper needs the compiler-floor migration before it may
   compile the new `communication` example; its old hard-coded 5.8.3 route is not an observation shortcut.
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
12. **Which Node do I use locally?** 26.11.1 by default and 24.21.0 for the Node 24 line. Section 2.1 names the
    executable variables, original machine paths and direct pnpm invocation. Restore a missing pinned runtime only
    in a disposable tool directory; do not install Node versions globally.
13. **How do environment probes set up the runtime before the package loads?** With a preload:
    `node --import ./tests/env-setup-<mode>.mjs tests/env-probe.mjs <mode>`; no dynamic import is needed.
14. **What do I do when a writer negative fails at a different gate?** STOP and report the gate table; never edit the
    manifest to match (V7).
15. **What if Windows CI is slower than 13 minutes allow?** Batch compiler runs and inspect subprocess contention;
    keep mutation concurrency bounded. If needed, split the `observation` lane in two and update
    `tests/ci-check-lanes.test.mjs` while preserving the full obligation union; never raise `timeout-minutes`.
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
2. Every M1 and M2 row of section 9, including R18 through R23, passes on Ubuntu, macOS and Windows with Node 24 and 26.
3. The owner-authorized compiler floor is aligned through section 2.3; every new observation check uses 7.0.2 or
   newer. Every row of section 10 is ticked: its test exists and passes, or it is doc only with the reason given.
4. Exactly `.` and `./testing` with the ADR-0012 carrier shape, one instance across both, no dependency but the
   resources peer, no Node built-in import and no `process.env` in `dist/`.
5. Every defect of section 9.3 is caught; every writer reference passes and every negative fails at its gate.
6. Section 12 and Q3 are done, and every pinning consumer has its outstanding work recorded.
7. The release pull request ships observation 0.1.0 (and resources 0.1.1 per Q4) only after the TEST consumer passed on
   its exact archives; the archives and record are retained; publication stays with the owner.
8. The README lists the ADR-0034 known items with owner and trigger; nothing out of scope (section 1.1) was added.

## 18. Hand-off

Before another executor starts, record the exact branch/head and predecessor, current phase, changed files,
executed commands with outcomes, unexecuted platform/release checks, and the next bounded action. Link the current
PRs and their observed heads; a previous green result applies only to unchanged inputs. Include section 2's merged
ADR file/registry digests, the #183 correction predecessor, choices Q1/Q2/Q4 and the resolved Q3 rule, and any consumer
pin work still outstanding. Do not mark future tests in section 10 as passed merely because their cases are planned.

Start with [HANDOFF.md](HANDOFF.md), the current disposition in [plan-review.md](plan-review.md), then Phase 0.
At this planning checkpoint the package is unimplemented and Phase 0 is blocked while ADR-0034 is absent from main.
Record the section 2.3 compiler-policy alignment separately: owner authorization exists; repository migration is
still an implementation predecessor. V13 governs future implementation/release merges, not permission to complete
this already requested plan update. Publication remains the owner's action.

## 19. Library research: what transfers and what stays outside this package

These are source-specific observations checked on 2026-10-17 during the five API and five watch reviews, followed
by root reproduction of the six defect groups. They explain choices in this plan; they do not certify a library,
claim one is universally good/bad, or import frontend semantics into module contracts. Versions identify the
inspected source rather than a promise to track every later release. Primary code takes precedence over broad
marketing descriptions or an older release page.

| Library / inspected source | Useful practice adopted here | Practice not transferred, and why |
| --- | --- | --- |
| [Jotai 3.0.1](https://github.com/pmndrs/jotai/blob/v3.0.1/src/vanilla/internals.ts) | Separate read state, writes and subscriptions; inspect signal/currentness at async boundaries. Its flush isolates callbacks and aggregates failures, a useful isolation precedent for T40/R18. | Default stores and automatic derived dependencies do not supply explicit module edges, single-writer ownership or recursive plain-data freezing. We keep capabilities and the existing owner error sink instead of adopting its graph. |
| [MobX 7.0.6 reactions](https://github.com/mobxjs/mobx/blob/mobx@7.0.6/packages/mobx/src/core/reaction.ts), [actions](https://mobx.js.org/actions.html), [reaction guidance](https://mobx.js.org/reactions.html) | Name effects, own their disposal, isolate failures and keep pure derivation apart from effects. Do not depend on reaction order. Its action boundary illustrates why multiple writes need an explicit owner boundary. | Automatic mutable tracking across modules hides dependency edges. Action batching is not rollback, and an `await` leaves the synchronous action boundary. No automatic cross-store transaction or scheduling priority is added. |
| [XState Store 4.3.0](https://github.com/statelyai/xstate/blob/%40xstate/store%404.3.0/packages/xstate-store/src/store.ts), [Store documentation](https://stately.ai/docs/xstate-store) | Explicit input commands, pure state transition and effects/output as distinct concepts inform the optional owner-local `decide` recipe and typed command outcomes. | Store is not the complete XState actor runtime. Its emitted-event iteration does not supply this package's per-callback isolation, latest-result/drain contract or durable operations. No actor system or event runtime follows from borrowing a pure function. |
| [Solid 1.9.17 source](https://github.com/solidjs/solid/blob/25138e1c2a32712ddff683374e1a257b8bf8b5a8/packages/solid/src/reactive/signal.ts), [effect](https://docs.solidjs.com/reference/basic-reactivity/create-effect), [owner](https://docs.solidjs.com/reference/reactive-utilities/run-with-owner) | Distinguish dependency tracking from lifetime ownership and clean up at the owning boundary. Prefer pure derivation to chains of state-writing effects. | Ambient owner/tracking context is not an explicit resource capability and does not automatically persist across `await`. Effect order is not a module contract. No cross-module reactive graph or owner restoration API is introduced. |
| [Svelte 5.57.2 stores](https://github.com/sveltejs/svelte/blob/svelte@5.57.2/packages/svelte/src/store/shared/index.js), [store contract](https://svelte.dev/docs/svelte/stores), [$effect](https://svelte.dev/docs/svelte/$effect) | A small explicit subscribe/dispose contract and a real read-only facet are useful. Documentation must state exactly when the initial value and later updates are delivered. | Svelte store subscription is synchronous, including its initial call; `$effect` is a different compiler/browser mechanism with batching. Neither supplies the selected deferred read-then-watch catch-up contract. Do not conflate these two Svelte APIs. |
| [Valtio 2.3.2](https://github.com/pmndrs/valtio/blob/v2.3.2/src/vanilla.ts) | Cached snapshots and structural reuse motivate preserving the existing frozen-node reuse and separating mutable ownership from consumer reads. | Proxy mutation, `ref` escape values and preserved classes/prototypes are incompatible with this plain-data boundary. Its current snapshot descriptors are configurable, so they are not equivalent to `Object.freeze`. Default batching does not imply isolated synchronous fan-out. No proxy or operation-log adapter is added. |
| [Nano Stores 1.5.5](https://github.com/nanostores/nanostores/blob/1.5.5/atom/index.js), [lifecycle](https://github.com/nanostores/nanostores/blob/1.5.5/lifecycle/index.js) | Small contracts, key-aware delivery and removing unsubscribed queued work are useful precedents. The inspected queue catches each listener failure, continues draining, then surfaces a retained error. | `readonlyType` is a type-only view; lazy unmount grace is not immediate resource-scope close. Its shared global epoch is not module authority. Keep real read-only facets, explicit scopes and the package-local queue. |

The records deliberately correct three tempting but inaccurate conclusions: Jotai and the inspected Nano Stores
queue do isolate individual callback failures; current Valtio snapshots are not deeply `Object.freeze`-equivalent;
and its default configuration does not buffer an unbounded operation log. Those are not reasons to reject those
libraries. The decision to own this small leaf instead rests on the combined snapshot-origin/catch-up, explicit
capability, resource drain, plain-value, currentness and error-attribution contract that an adapter would still need
to implement and qualify. Do not add seven dependencies or benchmark seven interchangeable runtime adapters.

### Deferred ideas and explicit triggers

| Idea | What is retained | Trigger for separate work |
| --- | --- | --- |
| Reliable events between modules/agents | Keep state, command outcomes and individual occurrences distinct. Later events need explicit delivery/loss, ordering, failure, unsubscribe and lifetime meanings. | A real owner requires every occurrence; agree its typed event contract and delivery evidence before implementing `createEvent`/`emit`/`subscribe`. Observation 0.1.0 implements none of them. |
| Selectors, computed dependencies, transactions | Atomic owner aggregates and explicit area slices are sufficient for the admitted API. | A concrete consumer shows unacceptable fan-out or a cross-owner consistency need that cannot be corrected by ownership. Any contract extension remains separately reviewed. |
| Durable commands and AI-agent transport | Ordinary command ports name acceptance and completion; an ID/revision is not delivery acknowledgement. | An admitted process/network boundary and real recovery requirement select transport, serialization, idempotency and physical custody at the product owner. No speculative broker/outbox/task framework is added here. |
| Diagnostics with paths or extra causal metadata | Existing names, store-local revisions and the Host's instance identity; precise field JSDoc. | Resources actually provides `path`, or a reproduced operational question cannot be answered with those fields. Follow the ADR's named owner/trigger; do not add an always-on graph inspector. |
| Scale claims beyond the small recipe | Structural operation counts and exact lifetime controls, plus #184's separate measured-growth route. | An admitted larger workload, fixed question and budget. The consumer run and 8192-subscription cap alone cannot establish a byte/time bound or hundred-module production qualification. |

A library lesson enters this implementation only at its assigned owner: runtime fixes in section 7, author guidance
in sections 7.6/8/12, rejecting evidence in section 9, or the bounded consumer in section 14. Everything else stays
in this deferred table. This is the scope control for avoiding overengineering while retaining the useful research.
