# Observation implementation and qualification record

Initial checkpoint recorded on 2026-10-18. This is the implementation record for the
[reviewed plan](implementation-plan.md), following the separate
[plan review](plan-review.md). The implementation and its scoped local gates
were complete for that checkpoint. Exact release-archive consumer qualification passed and was
independently verified for its recorded subjects. The
[current implementation review](#current-implementation-review-2026-10-19) records the subsequent corrections
and preserves earlier evidence separately. Earlier successful checks do not qualify a changed release subject.

## Subjects and authority

| Subject | Identity |
| --- | --- |
| Current main integrated into the implementation | `47a02a90a06f121c78086c7c5f72b085c42ee7ea`, including merged PR #183 and fresh author qualification |
| Reviewed plan predecessor | PR #185, `a0c08187845019680d9a2bc764f4010c8cc52b1a` |
| Exact ADR-0034 predecessor merged into this branch | PR #154, `945e9a151a516ce4ce6e73b6e18893d4e5b27cfe` |
| Implementation before ordinary `.ts` follow-up | `f0deed0af09915717f93bda11c570a82f456907e`, branch `feat/observation-0-1-e2e`; runtime from `737d842`, TypeScript test/manifest correction `4b3fa55` |
| Earlier unpublished prepared release | `106e3b0adca10e83d7a87ba57cb73baa9ee7ca6d`, branch `release/observation-0-1-candidate` |
| External consumer | `agent-teams-ai/modularity-host-test`, `observation-0.1.0/`, branch `test/observation-0.1.0` |
| Compiler policy successor | [ADR-0038](../../docs/decisions/0038-require-typescript-7-for-current-package-qualification.md) |

The latest owner request explicitly authorized implementation, testing and
independent review. Work proceeded in isolated branches with the exact reviewed
predecessors. ADR-0034 is present in the implementation branch but is still
absent from the recorded main. This does not satisfy Phase 0's main-admission
condition or authorize a merge. Old accepted decisions and their existing
registry entries were preserved; ADR-0038 was created through Docs Protocol and
appended through the supported decision-baseline promotion command.

Repository-owned compiler and parser paths use TypeScript 7.0.2. The minimum
and current aliases both resolve to 7.0.2, so each distinct compiler runs once
per NodeNext and Bundler observation with `skipLibCheck: false`. The follow-up
review corrected the earlier claim that this entire delivery executed only TS7:
prior Foundation CLI runs eagerly initialized its transitive 5.9.3 compiler and
scanners, even for non-extractor commands. Their result logs remain historical
observations, not compiler-floor qualification. All identified current launch
boundaries now block before that initialization; see
[the source investigation and upstream owner route](typescript-toolchain-blocker.md).

## Implemented behavior

- One optional public leaf, `@get-modular/observation`, with exactly the root
  entry and `./testing`. The root and testing entry share one installed copy.
- A store has one owner writer, immutable plain-data values, fixed keys,
  monotonic revisions and genuine read-only facets. Other modules receive the
  complete `ReadonlyStore<Slice>` contract and explicit command ports.
- `read` followed by `watch` catches up across acquisition and `await` boundaries.
  Delivery is deferred, coalesced and isolated per callback. Subscriber scopes
  own registration lifetime; close detaches subscriptions before cleanup.
- `load` serializes physical work, aborts superseded work, suppresses stale
  results and drains the actual returned operation before starting its successor.
  Logical cancellation never substitutes for physical completion.
- Echo and cascade guards retain their origin through asynchronous callbacks
  and returned-value assimilation. Old, between, mixed and fresh snapshots
  retain the selected revision provenance. Detached contexts do not retain
  store payloads; the pending queue removes completed work.
- Testing helpers expose delivery, settlement and live-subscription evidence.
  Diagnostics retain source/target, subscription, revision and cause semantics.
- Type declarations preserve guaranteed versus possible keys, distributed union
  snapshots, future declared values and structural writer invariance, including
  aliases, spreads and extracted members.

The release contains state observation and explicit module commands. It does
not add a separate event bus, durable event log, actor system, reactive selector
graph or transport. Those were explicitly outside the selected 0.1.0 plan.

## Port and corrections

The P/R runtime probes, six declaration fixture groups, 33 writer tasks and
18 mutation controls were carried into the production package test tree.
Original writer tasks, manifests and reference implementations retain their
source bytes. No negative expectation was changed to match an accidental
failure. The two unsafe archived p8 watch-only assignments are the explicit
T117 correction: current TS2322 negatives with same-record positive controls;
the research archive still contains its historical result.

R18 through R23 cover returned callback values, detached context retention,
plain-array validation, exact future snapshot typing, late subscription depth
and initial-load startup boundaries. A final independent review inspected the
assertions across T01 through T119, including recovered capacity, filtered
waits, queue interleaving, installed copy identity and real Assembly cancellation.
It found no missing live obligation in those families. Those local reviews did
not establish the operating-system matrix; the subsequent CI result is recorded below.

The compiler migration preserves native AST, semantic type, symbol, alias and
declaration identity checks through a closed virtual filesystem. A physical
file stays invisible until its exact bytes are supplied to the virtual project.
Current M1/M2 schedules contain 87/272 commands after removing ten duplicate
compiler invocations; the 77 non-compiler M1 cases and 185 raw M2 cases remain.
Frozen 97/282 records and their historical runner remain unchanged. Codemods use
the native scanner/checker and preserve existing exact fixtures, trivia,
manual-review findings and idempotence.

Package tests use small local compiler selectors to avoid a package-to-root-to-
package runtime cycle. The same exact manifest identity, floor and deduplication
policy is retained. Root Assembly fixtures use the public observation entry.
No governed root was removed and no production dependency allowance was added.

## Independent implementation reviews

The initial three reviewers used **Astra xhigh**, read the owner vision, organization
standard, full plan and all prior plan-review dispositions, and authored none
of the implementation they reviewed. Authors fixed the findings; the reviewers
then checked the original counterexamples against the fixes.

| Reviewer / area | Finding and correction | Independent closure evidence |
| --- | --- | --- |
| `review_observation_runtime` / async semantics | Loader-return Promise subclass assimilation could escape the originating guard context. `Promise.resolve(loader(...))` now begins inside the existing context. An earlier async wrapper was rejected because it changed the established P17/R7 checkpoint. | Typed original echo and 71-store cascade counterexamples pass on Node 24/26; unchanged P17/R7 continue to pass. |
| Same / scope admission | Callback accessors were read twice and could close the subscriber between validation and attachment. Callbacks are captured once before admission. | All five callback members preserve identical abort reason, zero subscriptions and no post-close delivery. |
| Same / source admission | `name` or `resources` accessors could close the source after its initial open check. A final open check occurs before allocation. | Twelve focused controls on each Node line, including watch/load crossed with both accessors; no scheduling change. |
| Same / retention evidence | The original closed-store GC probe did not detect completed FIFO nodes retaining store values. It now weakly observes payloads actually held in those values. | Normal Node 24/26: zero retained payloads with 200 retained controls. The isolated completed-node retention mutation fails on both with 200 retained payloads. |
| `review_observation_types` / compiler migration | Import insertion could emit invalid TypeScript when a comment preceded a trailing comma or the closing brace shared the final specifier line. Native token inspection now handles both. Save rejects transformed parse errors before writing. | Original A/B/close-comment cases under LF/CRLF on both Nodes: 12 clean, idempotent executions. Eight new targeted regressions pass per Node; old expected fixtures unchanged. |
| `review_observation_integration` / release and documentation | Two release notes were overwritten with CMS text; explicit migration transitions were missing; FMS still named five lanes; guide wording described an already-corrected watch type hole. | Exact intended changesets restored, three explicit transitions cover four packages, six lanes/roots documented, and complete-facet guidance corrected. Independent 50-test CI/profile/CMS-lint selection passes. |

The coordinator also fixed real failures from admission and typed-quality gates:
the exact 0.6 carrier allowlist, complete carrier-test metadata, package-root
ordering, package test dependency cycles, and an unnecessary double assertion
through `unknown`. The last change preserves emitted public declarations and
executable JavaScript; no assertion bridge admission or suppression was added.

## Additional GPT-6.1 xhigh review

The owner requested a further review while authenticating GitHub. Three new
independent reviewers used **GPT-6.1 xhigh** with the same complete vision,
contracts, plan, earlier findings and current evidence. Two material findings
were corrected and independently checked again:

| Area | Finding and correction | Closure |
| --- | --- | --- |
| Loader return inspection | An ordinary Promise with a `constructor` getter was inspected inside `Promise.resolve`, then again by `await` outside the run context. A write on the second read bypassed echo detection. `737d842` enters the direct await, error handling, token closure and publication inside the same context. | Original counterexample and first-read/no-write controls pass on Node 24/26 with and without ALS. The getter runs once. All 45 guard tests and 31 load tests pass per Node; P17/R7 publication timing and R17/R23 drain/currentness stay intact. Both fallback environment modes and all three GC modes pass per Node, with zero retained payloads and 200 retained controls. |
| Foundation launch boundaries | Foundation eagerly loads the old compiler before dispatch. `3c4a3d9` extends the JSON-only preflight to all current CLI/Node runner and affected SDK import boundaries, including direct fixtures and separately installed registry subjects. | All ten changed scripts retain their exact old suffix. The author passed 70 guard/CI/profile tests per Node; the independent reviewer passed 21 inert controls per Node and checked every changed boundary. Actual root changed/full/critical/registry commands exit 1 with the explicit compiler-floor block. |
| Declarations and native tooling | No additional material defect found in future snapshot distribution, dynamic keys, writer variance, native closed filesystem readers or codemods. | Fresh Node 26 / TS7 controls retain 92 independently attributed negatives per resolver. Isolated native visibility and Unicode/BOM/comment codemod controls pass. |

After the runtime correction, the complete `pnpm observation:check` passed on
Node 26.11.1: native build, both declaration resolutions, **157 actual tests**,
all **18 attributed mutation controls**, all **33 writer outcomes**, and installed
packed qualification. No observation test was skipped. The run began on the
three-file correction before it was committed as `737d842`; the package bytes
are identical in `3c4a3d9`. The main/tooling integration through that commit
changed no package input. The independent Node 24 follow-up is the affected runtime/process scope
listed above, plus the new exact-archive E2E below; it is not a claim that the
whole root aggregate ran on Node 24.

All five archives were regenerated from prepared candidate `d345e149`. Four
archive hashes stayed identical; observation changed to
`c48ac24d89c259bcf13088f5aa220bf3a1f8572e62a47c0928377759d4bb683a`.
The corrected candidate replaces the earlier `b281531` candidate for delivery.
Its new consumer source is `dbb708e97a9cb20afe959d06dd85460fa0bf1349`.
The old `accepted-972dc2b` record remains historical and unchanged.

## CI corrections and TypeScript authoring

The first [CI run](https://github.com/agent-teams-ai/get-modular/actions/runs/39119798726)
checked PR head `30ccdf4` through merge checkout `54d1aec`. All 43 jobs were
classified from their actual logs: observation passed on Linux and macOS on
both Node lines, and Node 24 package compatibility passed. Eighteen Foundation
lanes failed at the expected compiler preflight. Twelve Core/Assembly lanes
and two Windows observation lanes exposed three distinct test defects; six
aggregates correctly propagated the failures. No failure remained unexplained.

| Correction | Preserved obligation | Verification |
| --- | --- | --- |
| `4b3fa55`: canonicalize the temporary directory before declaration attribution; migrate its owning test to `.mts` and add it to the strict compiler project and normal discovery | Exact TS2636-only attribution, all 92 negative cases per resolver and both TS2322 controls stay intact | Strict test-tooling check and declaration controls pass on Node 24/26; the integrated typecheck and all 157 observation tests pass on Node 26 |
| `c4db2cb`: construct the current sealed fixture with 272 rows | Historical 282-row transport control and actual seal-anchor rejection remain unchanged | All 16 Core seal/transport controls pass on each Node line |
| Same commit: derive packed runtime receipt count from the independently selected compiler count and two resolvers | Exact receipt content, independent observation count and all four removal/no-op controls remain | Combined Core/Assembly selection passes 24 actual tests per Node, with zero skips |

The two single-line legacy JavaScript fixture corrections remain local because
migrating their complete harnesses would expand the scope beyond these count
errors. Their surrounding JavaScript is still untyped; no new helper or
responsibility was added. The materially changed declaration test is actual
strictly checked TypeScript, including in its package and root command routes.

The owner additionally requested TypeScript for all new maintained JavaScript
runtime code. Local agent instructions now state that requirement and link to
[organization policy PR #368](https://github.com/agent-teams-ai/.github/pull/368).
The common rule covers source, tests, CLI tools and helpers, uses a 7.0.2 minimum,
requires real strict checking, and keeps concrete generated/fixture/host uses.
It does not make historical JavaScript typed or automatically load central
instructions into every repository. The external consumer has explicit
AGENTS, Claude and Copilot routes too.

The organization policy's actual CI has two failed required contexts:
[`check`](https://github.com/agent-teams-ai/.github/actions/runs/39121773828/job/117658653359)
stops the embedded 5.9.3 compiler, while
[`docs-source-successor-v1`](https://github.com/agent-teams-ai/.github/actions/runs/39121790997/job/117658705196)
rejects the protected source-checker change. The latter requires the existing
separate admission route for that checker. The other four effective required
contexts pass. Historical transition failures are not currently required by main;
their retained controllers were not changed to make this unrelated PR green.

Candidate `106e3b0` incorporates these corrections without another versioning
step. Its production JavaScript and public declarations match the preceding
qualified archives; only observation's package manifest scripts changed.
A fresh offline consumer installation and frozen reproduction then passed the
complete unchanged E2E at `4d10a1f`, retained in `accepted-4d10a1f`. The exact
current identities and archive hashes are below. Earlier accepted records remain
byte-identical. Fresh CI after these corrections is a separate required
observation; this local record does not declare it green in advance.

## Initial executed checks

These retained rows describe the initial qualification subjects. The current
package and additional review results are recorded immediately above. Historical
Foundation CLI successes include the eager-initialization limitation below.

Command logs and their SHA-256 identities are retained in
[implementation-evidence/manifest.json](implementation-evidence/manifest.json).

The retained local environment is Linux x64, Node 26.11.1 and Node 24.21.0,
pnpm 11.20.0, TypeScript 7.0.2. The following results are scoped observations,
not substitutes for the blocked complete repository aggregate.

| Check | Observed result |
| --- | --- |
| Complete `pnpm observation:check`, committed `0cfa39e`, Node 26.11.1 | Passed build, both type resolutions, 154 runtime/type/Assembly/README tests, 18 attributed mutations, all 33 writer outcomes and installed packed qualification. No skipped observation test. |
| Final runtime/process matrix including source-close accessor fix | 149 passed on each Node line, no failures/skips/cancellations. |
| Declaration controls | 92 independently attributed negative diagnostics in each resolution mode, plus clean baseline, variance and loose-optional controls. |
| Writer gate | Eleven positive/reference tasks pass; all 22 negatives fail at their required gates. The retained sessions negative keeps its original unrestricted failing-gate expectation and actually fails rules and behavior. |
| Mutations | All 18 caught by actual assertion failures in designated P/R probes; timeouts and hung processes are not counted as detection. |
| Packed observation | Exactly two entries, shared root/testing instance, foreign-copy rejection, blocked deep imports, installed semantic suite and six declaration groups in both resolvers. |
| Node 24 owned declaration/writer/mutation/packed gates | Four gates pass at the recorded predecessor with identical runtime through callback capture; the later source-close delta separately passes its runtime matrix and independent recheck. |
| Native declaration/JavaScript closure readers | Independent combined run: 432 tests passed, no skips. |
| Native codemods after independent fix | 65 pass on each Node line; one existing Darwin-only skip on Linux. |
| CMS/guide examples | Nine example suites pass; actual pinned CMS lint snippet rejects forbidden production/testing-entry imports and accepts test-file controls. Thirteen package README blocks compile in both resolutions. |
| Admission/governance/ownership test selection | 106 passed; one pre-existing C0 operator-plan-input skip in this source clone. Frozen authority controls remain active. |
| Source admission and FMS profile | `governance:check` and `architecture:feature-module-profile` pass. |
| Seven individual Foundation capabilities | Historical selected passes for source dependencies, local references, architecture decisions, agent workflow, dependency declarations, source coverage and suppression governance. Each CLI also initialized TS5.9.3; these are not current compiler-floor qualification. |
| Complete typed quality | Historical zero-diagnostic pass with no bridge admission; that CLI also initialized TS5.9.3. The guarded current command is blocked. |
| Required quality execution | Historical completion of all 11 identities with no contract exceptions; that runner also initialized TS5.9.3. The current command is blocked. |
| Toolchain and lock | Runtime preflight, strict peer lock check, TS7 runtime-policy typecheck and runtime-policy test pass. |
| Documentation | Docs Protocol, complete Markdown lint and spelling checks pass; final handoff update is checked again before push. |

## Compiler guard and publication access

The initial tooling-only correction, `ea9ac84`, blocked the known extraction
commands. The additional `3c4a3d9` correction also blocks eager initialization
through every identified current Foundation launch boundary. The guard reads JSON manifests
through each dependency owner's real resolution path, including Foundation's
API Extractor and that extractor's compiler. It loads no compiler implementation.
The three aggregate/admission commands retain their original obligations after
this preflight. Direct SDK admission and typed compatibility fixtures also guard
before their implementation imports or child processes. Ordinary CLI errors and
this blocked preflight cannot masquerade as passing negative tests.

The independent type critic verified the execution order and ran all 20 inert
metadata controls on each Node line. The integrated root guard/SDK/CI/profile
selection passed all 135 tests with zero skips; the final selected source
dependency capability also passed. The real `pnpm foundation:check` now exits 1
with `TYPESCRIPT_COMPILER_FLOOR_BLOCKED`, role
`foundation.api-extractor.compiler`, and observed version `5.9.3`, before
extraction. Both read-only public API policy tests pass; its two typed CLI tests
remain explicitly blocked. This is the required red outcome until upstream
compatibility exists, not a skipped or successful gate. No packed input changed.

The earlier Git pushes failed because HTTPS credentials were unavailable;
automatic approval also rejected an empty replacement branch. The owner has now
completed the official GitHub CLI device flow. Read-only API checks confirm push
access to both repositories. The implementation and consumer are open as [PR #195](https://github.com/agent-teams-ai/get-modular/pull/195)
and [PR #20](https://github.com/agent-teams-ai/modularity-host-test/pull/20).
This resolves the access blocker; it does not resolve the compiler, predecessor
admission or release gates.

## Maintained CMS and consumer adoption

| Identity | Previous | Current |
| --- | --- | --- |
| SHA-256 | `e5cb510c5ea83e54a6833cc40b6ad31fc5cf8c70d9838e4e0c6923edc6f70919` | `c2fe582a14ff6e79620b232ca7ffc914afb0474ec21fd43f208251dd7252f4a3` |
| Git blob | `250f312d3cae733935d0ac48ddde8502665417df` | `ae6792543bd19acc948e177e8d55632c9d51134e` |

Changed rules cover subscriber scope ownership, signal-first detachment,
physical completion, state/command/event distinctions, one writer and area
facets, aggregate invariants, and restricting `observation/testing` to test
files. Only the current successor assertion in the ownership checkpoint was
advanced. The entire frozen SDK-growth CMS evidence file, including its
`pinned`, `acceptedCurrent` and `delta` fields, is byte-identical.

The external TEST pins the new exact CMS bytes. Other pinning consumers,
including AgentRuntime, still need to review this delta and migrate their own
pin in their owning repository. This implementation does not claim their
adoption and did not edit another consumer's pin automatically.

## Prepared archives

All five retained archives were packed from the single prepared release listed
above. A fresh comparison pack reproduced four exactly; conformance had only
the established peer-key-order variation allowed in plan Phase 3c. Its original
pinned tested bytes remain the subject. The exact comparison is retained with
the external evidence. Versions and hashes are in `third_party/pins.json`;
installed file bytes and physical peer identity are checked before execution.

| Package | Prepared version | SHA-256 |
| --- | --- | --- |
| Core | 0.6.0 | `bac6f9e899b235124faf9d8eea9842eaaba5bb1ba543adb626fe21d6e3a5870f` |
| Assembly | 0.6.0 | `ac96072e21d7a6a4264685c25e8c5ee487cbe0302ede58ec384d34ad4ddf8f63` |
| Resources | 0.2.0 | `d9f6363d9c848be90c15e5d20acf07226e3b29ed55ae8af3d6ee0274e5a123d5` |
| Conformance | 0.4.0 | `9b0b7c3bd1f64ebed48ddf6ac51782aab0cf70d72a1fb9fac99b591b3ade888b` |
| Observation | 0.1.0 | `2a72ad3080ecf72277ab707581633391b6af28cbed36a98f8eff2306563f5c91` |

Assembly depends on exact Core 0.6.0. Conformance peers are Core/Assembly
`^0.6.0` and resources `^0.2.0`; observation has only resources `^0.2.0`.
Package Node engines retain `>=24.18.0 <25 || >=26.10.0 <27`; repository tooling
has the separately enforced 24.21.0 minimum. No package was published.

## Exact-archive external E2E result

The executed consumer commit is `4d10a1fb7041e44c61766400d6f1262e84c397e7`.
Evidence-only commit `4b33245c2b454e44aac4ea6f3bb241c02f7b9c59` retains the complete record under
`observation-0.1.0/evidence/accepted-4d10a1f/` in the external repository.
The five archives did not change during qualification.

- Offline engine/peer-checked installation and offline frozen-lockfile
  reproduction both passed. Only the four exact test-tool dependencies needed
  a prior metadata cache fill in a disposable project; all Get Modular packages
  came from the pinned archives.
- TypeScript 7.0.2 compiled NodeNext and Bundler with `skipLibCheck: false`.
- Both Node rows passed the five connected/runtime predicates and all 33
  original writer gate outcomes. Eleven positives and 22 intended negatives
  retained their required outcomes in each row.
- One smoke used the same root and all eleven baseline/injection rows, with
  exact five failure and five abort targets and complete close reports.
- The independent critic compared all 25 executed-source hashes with the tested
  commit, all 176 installed archive file bytes, all 78 copied writer inputs,
  the committed lock/pins and the actual writer outcomes. The materialized
  harness has only the three reviewed substitutions for public statistics.

Two consumer fixture defects were corrected before acceptance. The CMS probe
initially lived under an ignored temporary directory; moving it to a scanned
fixture restored actual lint execution without changing the policy. The smoke
initially assumed every abort result was `cancelled`; the existing conformance
contract also admits `failed` carrying cancellation metadata during async setup.
The corrected oracle pins every injection target, preserves strict fail rows
and complete-close checks, and accepts exactly the supported abort carriers.
Those first-run fixture corrections required no package change. The later
Promise finding did require a new observation archive; the complete external
E2E was rerun for that correction. The later TypeScript test-command migration
changed the observation archive manifest and required the current fresh-install
rerun. Consumer executable source and semantic oracles remain unchanged.

## Remaining gates

1. Merge the still-open ADR-0034 and planning predecessors through their owning
   review route. This branch has their exact bytes but does not make them main.
2. Resolve Foundation/API Extractor's TS5.9 dependency with an upstream native
   compiler migration and explicit extractor-provenance upgrade. No compatible
   release or permission to execute the old compiler is assumed.
3. Run the unchanged complete/fast/changed and SDK-growth aggregates after that
   dependency is resolved, and observe every updated Node/OS CI lane. The later
   exact-head run `39122863587` on `e5999805` passed all six observation lanes;
   Windows took 7:54 / 8:20. The ordinary `.ts` successor needs its own current
   CI result. The 13-minute target and 15-minute workflow timeout remain unchanged.
4. Obtain the existing owner decisions for merge and publication. Prepared
   versions and passing package/consumer checks do not grant release eligibility.

Codex Review is ignored as the owner requested. No other gate, failure or
unexecuted row is reclassified as passing.

## Ordinary `.ts` follow-up and independent review

The owner subsequently selected ordinary `.ts` for maintained source, tests,
CLI and helpers. This follow-up supersedes the earlier `.mts` authoring choice;
historical records above keep the extension and exact archive bytes they tested.
Node ESM uses the owning package's `"type": "module"`. Runtime type stripping
does not replace the existing strict compiler projects.

### Reviewed source and policy

| Subject | Final reviewed commit | Result |
| --- | --- | --- |
| Get Modular active tooling migration | `5102438e70a618a342c93fe003bcfc3f057a1041`, after `ae5036e` | Five active files use `.ts`; four fixture drivers have effective strict coverage |
| Organization rule and compiler guard | `3d0b2be14b1eda315dc71a1bcdfbf1885445cf86`, after `40198f2` | Guard/test imports, discovery, strict inputs and source census agree |
| Platform infrastructure instructions | `5589ef8cb20ba620b7e0b071c629d22c5b03fca9` | Root AGENTS, Claude, Copilot and README routes; [PR #484](https://github.com/777genius/platform-infra/pull/484) |
| External consumer instructions | `6c6c16301eced4865e7f6fbf0bddad6102dd7705` | Ordinary `.ts` rule; archived and `.d.mts` semantic subjects preserved |

Three independent GPT-6.1 xhigh critics received the full owner vision: explicit
typed ports, one state writer, read-only facets, deferred/coalesced observation,
serial physical load/drain, host-owned effects and the bounded 0.1.0 package.
They reviewed integration, organization compiler/admission behavior and policy
consistency across repositories. The first wave found two concrete P2 gaps:

1. Four handwritten temporary drivers existed only as source strings. A wrong
   type annotation passed the outer strict project and executed under type
   stripping. The correction makes them real `.ts` files in the two existing
   owning projects, copies their bytes unchanged and passes variable inputs as
   data. Deliberately invalid workflow source remains a separate compiler subject.
2. The organization's expanded `.ts` census accepted a new helper or test outside
   its exact compiler inputs. The existing checker now requires each classified
   ordinary `.ts` file in the already-bound strict inventory. Two counterexamples
   join its existing mutation table; no additional checker or framework was added.

Each original critic independently repeated the counterexample after correction
and reported zero actionable findings. The policy critic found none in its first
wave. The exact findings, commits, validation and preserved scope are in
[`ordinary-ts-review.json`](implementation-evidence/ordinary-ts-review.json).

### Actual focused verification

The four existing Get Modular strict projects pass on Node 24.21.0 and 26.11.1
with TypeScript 7.0.2. The final fixture correction was independently checked
with both owning projects on both Nodes. Injecting `const coverageControl:
string = 42;` into the four actual fixture sources makes each owning project
reject exactly its two files with TS2322. Unmodified sources pass. Copied workflow
drivers accept valid source/docs and reject the independent invalid source and
heading; both retention driver scenarios pass on each Node with no skips.
The complete affected harness selection has 21 passes and the two known
Foundation blocks per Node, not a passing full suite.

The organization uses exact pnpm 11.18.0: both Nodes pass strict TS7, 16 inert
guard controls, 44 focused scope controls and the existing 32-file lint selection.
Its complete scope suite has 44 passes and two Foundation blocks. The full gate
stops before the below-floor compiler initializes. Required-quality identities
in Get Modular remain eleven, with no exception added; their path-adjusted hash
is `4370f4911f6a08fd8e031caef978112d1a28392ccb4a6ab0fafbdebb1c61db5d`.

Four old lifecycle qualification `.mts` files remain outside this bounded change:
`packages/lifecycle-kernel/tests/run-node20-qualification.mts`,
`tests/qualification/lifecycle-qualification-contracts.mts`,
`tests/qualification/lifecycle-tool-prepare.mts` and its `.test.mts` file.
They refer to absent projects and old compiler/Node subjects; no current normal
command calls that pipeline and it was not revived. They are not newly declared
frozen. The organization also discloses its six earlier authority/qualification
`.mts` sources and remaining legacy JavaScript gap. Localized legacy JavaScript
edits only update imports, paths or the existing census; no new untyped helper
responsibility is added and no fleet-wide migration is claimed.

Platform policy is complete locally while the central proposal is pending.
The four instruction files passed link/fact review and `git diff --check`;
there is no root documentation gate for those paths. No infrastructure, host
configuration or unrelated Python/Shell responsibility was changed.

### Required organization CI after publication

Live rules on main require six contexts for exact head `3d0b2be`. Four pass.
The remaining two have the same independently inspected causes:

- [`check`, run 39130429156](https://github.com/agent-teams-ai/.github/actions/runs/39130429156/job/117684294288)
  stops at `scripts/compiler-floor.ts`: Foundation 1.7.2 owns API Extractor
  7.58.12 and embedded TypeScript 5.9.3.
- [`docs-source-successor-v1`, run 39130573514](https://github.com/agent-teams-ai/.github/actions/runs/39130573514/job/117684716139)
  rejects `scripts/check-quality-scope.mjs` as a protected changed input. The
  established separately staged checker-admission route remains required.

No new required-context failure was observed. Informational historical
transition jobs are not promoted into new required gates, and are not called
successful. The shared policy remains in [PR #368](https://github.com/agent-teams-ai/.github/pull/368).

### Fresh exact-archive consumer after ordinary `.ts` adoption

| Subject | Exact identity |
| --- | --- |
| Reviewed implementation | `5102438e70a618a342c93fe003bcfc3f057a1041` |
| Already-versioned release merge | `34bb4fae3d6a613f13cdbab9ca50b0bfdf4054e7` |
| Committed consumer input, before execution | `a145931ec4522d3a4a5cd1e06a342814a876801e` |
| Evidence-only successor | `5de8e039cbde6c4277e6220073ab7b57d3718078` |
| Observation archive SHA-256 | `a0685247e9e00ec02c2abaeab1d4aceb2041468e5317d8bf5e786edf99ec02e5` |
| Consumer lockfile SHA-256 | `850964806ea7a6dee6e0174261eeddb483c4e3aa9de901a04be33c125aec9b76` |
| Result SHA-256 | `fe38ccbfb3dcf10e07a9cad8a4cc4971714ab3e2d5daea217fe7e47c8f950473` |

The release merge has exactly the previous candidate `106e3b0` and reviewed
implementation `5102438` as parents. No second `release:version` was run.
All five packages were rebuilt and freshly packed with actual TS7.0.2 after
an offline frozen strict install. The observation archive changes only the
manifest test glob, `tests/*.test.mts` to `tests/*.test.ts`; its other 39 files
are identical. Core, Assembly and resources reproduce exactly. Fresh conformance
packing differs only in the established peer-key-order case; the original
`9b0b7c3b...` pinned archive remains installed and tested. The other four pinned
archive hashes are therefore the same as the earlier table.

The consumer input commit changes four files: observation's archive and lock
integrity, and the two candidate source-commit pins. It precedes the fresh
removal of generated install/output trees, offline frozen strict installation,
peer check and unchanged E2E. All ten runner stages finish with status zero.
TS7 checks NodeNext and Bundler separately with `skipLibCheck: false`; Node
24.21.0 and 26.11.1 each pass five actual runtime tests and all 33 original writer
outcomes, eleven positive and 22 intended negative. One smoke executes all
eleven exact baseline/failure/abort rows; each close is complete, settled and
debt-free. No semantic oracle, expected gate or consumer executable changed.

A separate GPT-6.1 xhigh critic independently checked the Git parent chain,
five tarballs, 176 installed file hashes and five physical dependency/peer
edges, 78 copied writer inputs, 25 executed source/config hashes, actual writer
identities/gates, runtime predicates and smoke targets/close reports. It verified
the final evidence-only successor and reported zero actionable findings without
repeating the entire E2E. The three-substitution harness patch and all three old
accepted evidence directories remain byte-identical.

The [accepted record](https://github.com/agent-teams-ai/modularity-host-test/blob/5de8e039cbde6c4277e6220073ab7b57d3718078/observation-0.1.0/evidence/accepted-a145931/RECORD.md)
and [result](https://github.com/agent-teams-ai/modularity-host-test/blob/5de8e039cbde6c4277e6220073ab7b57d3718078/observation-0.1.0/evidence/accepted-a145931/result.json)
retain exact inputs, command logs and the unchanged expectations. This is bounded
synthetic Linux package evidence, not complete source-architecture qualification,
cross-platform CI, scale evidence, production adoption or publication.
The current ordinary-`.ts` CI run is assessed on the published PR #195 head;
this pre-push documentation record makes no advance success claim.

### Native Windows readiness follow-up

The first ordinary-`.ts` CI, [run 39131898704, attempt 1](https://github.com/agent-teams-ai/get-modular/actions/runs/39131898704),
tested head `bba50796e7d2e41f129dd6f3b3ed0615b43226d2` against base
`47a02a90a06f121c78086c7c5f72b085c42ee7ea`, with actual synthetic checkout
`3cbdcee08e842456c1eef841745438ec25a9ef62`. All 43 jobs were classified:
18 successes (Observation 6/6, Assembly 6/6, Core 5/6 and compatibility), 18
exact Foundation compiler-floor blocks, one Core failure and six aggregates.
Observation retained all 157 runtime tests without skips, 18 attributed
mutations, 33 writer outcomes and packed checks per lane. Its Windows lanes
took 7:40 and 8:20, below the unchanged 13-minute target. CodeQL and identity
passed. No additional submitted or inline reviewer findings were present.

The [Windows Node 24 Core job](https://github.com/agent-teams-ai/get-modular/actions/runs/39131898704/job/117688599632)
failed the real missing-file acquisition control. The process spawned at 8 ms,
but no acknowledgment, output, exit or close was observed by the 10,017 ms
readiness timeout. By the 15,026 ms teardown timeout only `LOCK_OPENING` had
arrived. The helper was unchanged from the base, and the same control passed on
Windows Node 26. The log cannot separate PowerShell startup from first exception
formatting; it establishes an exceeded first-acknowledgment allowance.

Correction `0edaea195399998f8f22d12b86e2c28e523589a4` changes only the existing
`packages/core/tests/qualification/production-generation.test.mjs`: first
acknowledgment 10 to 30 seconds and native process lifetime 30 to 65 seconds,
plus explanatory comments. The overall bound leaves the enlarged acknowledgment
allowance, existing 25-second held-lock watchdog and two five-second close phases.
No protocol, action authorization, failure-shape/exit-code assertion, cleanup
rule or timeout-as-failure behavior changes. This bounded maintenance exception
introduces no new helper or claimed strict coverage for the legacy file.

A separate GPT-6.1 xhigh critic reviewed the exact file and independently
repeated the five existing protocol controls on both pinned Nodes: all pass,
without skips. The author also ran the complete owning file on both Nodes:
11 pass and three existing conditional skips (two native Windows controls and
the POSIX permission case under root). These Linux results do not establish
native Windows success; the corrected head requires its fresh CI result.
The [review record](implementation-evidence/windows-lock-readiness-review.json)
retains the exact patch, observed failure, deadlines and local validation.

Production source, build/package inputs and writer inputs are unchanged, and
Core's explicit published-file inventory excludes this test. The exact candidate
`34bb4fa`, executed consumer `a145931` and evidence successor `5de8e0` remain the
same qualification subjects; no additional pack, release versioning or consumer
execution is needed for this test-only correction. Earlier evidence stays intact.

## Current implementation review, 2026-10-19

The complete review backlog of [PR #195](https://github.com/agent-teams-ai/get-modular/pull/195) was inspected
against `3f5f3b303e99e4b8f919486d91d954f7f78e204d`: 36 discussions, including one outdated discussion.
The scope remains the accepted store, read facet, scoped watch/load, resource lifecycle and explicit typed
command ports. A durable or lossless event bus is outside this release. All executed current compilers and
parsers must meet the TypeScript 7.0.2 floor, including embedded tooling.

The inspected source equals the production source of the retained prepared release
`3b42d2641055c36c13ff0e2b7fae6cc02a945514` and release-evidence successor
`be27b56d4688d976fcb7ce6af11e036571d8950c`. Their corresponding external input is
`a32f628a11a8cd9e871d985ab09bcfbcaa708b1b`, with evidence successor
`6aa173b99facb7f7c473a0d891b0176a55ab2996`. Corrections below require a new source/archive/consumer
qualification; those earlier records cannot be relabelled as the corrected implementation.

### Bounded corrections selected by review

This table records the required correction, not a new whole-CI or publication claim. Final qualification must
bind the corrected source, effective build settings and actual release archives.

| Discussion | Boundary | Required correction |
| --- | --- | --- |
| [4307609026](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609026) | Current compiler admission | Require the complete canonical stable version string before numeric comparison, including rejection of leading zeroes and final line terminators. Preserve exact minimum 7.0.2 and distinct-version/resolver obligations. |
| [4307609047](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609047) | Command guidance | Owner acceptance may be an idempotent no-op. It does not imply a new commit or notification. |
| [4307609053](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609053) | `Frozen<unknown>` | Preserve `unknown`, including nullish values, instead of mapping it to the non-null `{}` type. Keep existing brands, tuples and writer invariance. |
| [4307609063](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609063) | Current documentation index | Link OD-007's resolution through ADR-0034. Preserve the fixture handoff's explicitly historical baseline statement. |
| [4307609066](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609066) | Testing waits | Check abort and elapsed deadline before successful quiet-state return, preserving one captured task and the abort cause. |
| [4307609070](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609070) | Wait arguments | Only omitted/undefined timeout selects the default; explicit null must fail validation. |
| [4307609097](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609097) | Subscription admission control | Execute a focused empty-name refusal control; a declared-only type fixture is not runtime evidence. |
| [4307609105](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609105) | Subscription limits | Only omitted/undefined limits select defaults; explicit null must fail positive-safe-integer validation. |
| [4307609106](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609106) | Factory context guidance | The resources `scoped` adapter converts Assembly's `{ signal, scope }` to `{ signal, resources }`. |
| [4307609121](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609121) | Current builds | Set the actual inherited `skipLibCheck` to false as ADR-0038 requires; do not edit the accepted decision to conceal a different configuration. |
| [4307609123](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609123) | Store-wide limit diagnostic | Compute the maximum scope count iteratively so a valid configured limit cannot trigger the VM argument-spread ceiling. |
| [4307609126](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609126) | Writer runner watchdog | Keep the 240-second aggregate and cap each child by the remaining real deadline. A timeout or launch failure cannot count as an intended negative outcome. Preserve all 33 rows and the existing CI bounds. |
| [4307609130](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609130) | Plain-data ownership | Apply the [three-critic decision in plan section 7.1](implementation-plan.md#71-platform-and-values-deliveryplatformts-storevaluests-corets-132139-185207-224275): native Node proxy refusal before traps/freezing, explicit ordinary-data precondition on fallback, stable reflection-failure diagnostics, unchanged in-place ownership. |

The close-reporting [discussion 4307609132](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609132)
was already fixed by `3f5f3b303e99e4b8f919486d91d954f7f78e204d`: snapshot registrations before the first
external synchronous reporter. Its existing strict controls cover shared-scope closure, repeat close, prior
detachment and active-load drain. The new review does not require another implementation of that fix.

### Dispositions that preserve the accepted scope

| Discussions | Source-backed disposition |
| --- | --- |
| [4307609016](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609016), [4307609128](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609128) | The frozen `negative-b-behaviour-1/e-sessions` expectation is `null`, not `[]`: it explicitly accepts any nonempty failing gate set. It is not proof of an isolated leak detector. Keep that exception and the original manifest. |
| [4307609046](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609046) | The lifecycle test helper is inside its owning development boundary. Same-boundary imports need no additional cross-boundary entrypoint. |
| [4307609055](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609055) | Shared-project reuse is an optional optimization without a demonstrated required-budget failure. No cache or parser-session framework is added. |
| [4307609060](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609060) | The actual native SDK constructs `Symbol.declarations` as an array, defaulting absent protocol data to `[]`. Existing missing-symbol/node guards remain sufficient. |
| [4307609103](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609103) | Resources links escalation before cleanup, and its `follow()` handles an already-aborted signal immediately. No delayed-abort workaround is needed. |
| [4307609117](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609117) | OD-007's resolution already names ADR-0034's release-archive experiment and stop/rerun rule. Preserve the historical criterion and explicit resolution. |
| [4307609138](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609138) | The CMS prose contains no invalid `resources.use` argument list, and its preceding rule already requires a name. No new CMS change or pin is needed for this optional illustration. |

### Limits of the frozen writer campaign

The following are real limits of archived fakes and oracles, not evidence that the production Observation
mechanism implements those example business services incorrectly. Original task/scenario/fake/reference bytes,
the 33 expected outcomes and their historical results remain unchanged. Additional maintained regressions must
have their own subjects; their results cannot be credited retroactively to the frozen campaign.

| Discussions | Limit |
| --- | --- |
| [4307609019](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609019), [4307609024](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609024), [4307609110](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609110) | The greeter, sessions and catalog behavior blocks can skip assertions when the expected capability or `current` facet is absent. The recorded campaign is not a complete runtime product-shape validator. |
| [4307609039](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609039), [4307609079](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609079) | The logger fake ignores the threshold, and its scenario checks write count rather than the complete level/message tuple. The tested warn/debug call is above threshold. No broader logger policy coverage is claimed. |
| [4307609084](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609084) | The pricing fake's lookup can return an inherited property for an untested key. The frozen scenario does not prove arbitrary-key validation. |
| [4307609089](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609089) | A setup exception in the archived sessions reference can leave an empty child attached until module close. The archived successful scenario does not qualify that exceptional path. |
| [4307609100](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609100) | The asynchronous-factory fake does not handle a direct pre-aborted call; the archived setup scenario exercises later cancellation. |

### Historical evidence errata and navigation

The original [CI receipt](implementation-evidence/ci-first-run.json) and its committed
[details](implementation-evidence/ci-first-run-details.json) remain byte-identical. For
[4307609044](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609044), read their scope
label as **all 43 completed jobs: five successes and 38 failures**, not only failed jobs. Their explicit counts
and job inventories already record that distinction.

For [4307609092](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609092), the relative
details link above replaces the need for the old machine's `/tmp/observation-ci-classification-details.json`.
For [4307609140](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609140), the original
logs belong to [run 39119798726](https://github.com/agent-teams-ai/get-modular/actions/runs/39119798726);
each recorded job ID selects its job under that run. For example, the original
[Windows Observation job](https://github.com/agent-teams-ai/get-modular/actions/runs/39119798726/job/117652894770)
is distinct from any successor run. Raw `/tmp` paths are unavailable in a fresh checkout. Hosted logs remain
subject to GitHub retention; committed excerpts and hashes do not reconstruct unavailable raw bytes.

For [4307609142](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609142), the original
manifest's `finalToolingCommit: ea9ac84` resolves to the full historical commit
`ea9ac849f349376326bffe35086ccc0171508e0b`. It is not the current tooling head. The research README and
plan-review completion paragraphs are explicitly labelled planning checkpoints for
[4307609074](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609074) and
[4307609115](https://github.com/agent-teams-ai/get-modular/pull/195#discussion_r4307609115).

## Completed local qualification checkpoint, 2026-10-19

The [portable checkpoint](implementation-evidence/review-20261019.json) binds the corrected uncommitted successor
of `3f5f3b303e99e4b8f919486d91d954f7f78e204d`: all 18 production sources, 17 selected correction files,
the writer runner, prior documentation review pins, exact commands and six unchanged raw logs.
Independent runtime/type, writer, documentation and completeness reviews found no remaining P1/P2 in their
source scopes after the separately reviewed canonical compiler-metadata correction. These verdicts apply to their recorded source scopes.

| Subject | Completed local evidence |
| --- | --- |
| Node 24.21.0, before the two-file metadata correction | Five exact declared stages passed: [170 runtime tests](implementation-evidence/review-20261019-node24-runtime.log), [18 mutants and 33 writer rows plus two deadline/refusal controls](implementation-evidence/review-20261019-node24-evidence.log), and [packed qualification](implementation-evidence/review-20261019-node24-pack.log). |
| Node 24.21.0, final metadata successor | [Five affected tests](implementation-evidence/review-20261019-node24-canonical.log) passed: inert metadata refusal, public type controls and the unchanged writer outcomes. Required normal typecheck and configured typed lint passed. This is not a single 171-test Node 24 run. |
| Node 26.11.1, final source | The [literal normal `pnpm observation:check`](implementation-evidence/review-20261019-node26-complete.log) passed: build, strict types, 171 runtime tests, 18 mutants, 33 writer rows plus two deadline/refusal controls, and packed qualification. |

Both lines retained 93 attributed public type negatives per resolver, 13 README blocks and all six packed type
fixture groups under NodeNext and Bundler. Executed compilers were native 7.0.2, equal aliases ran once,
and strict projects used `skipLibCheck: false`; maintained successors use ordinary `.ts` on required routes.
Foundation 1.7.4 supplied preset JSON only: no old Foundation runtime or compiler was executed.
The 212 built files were byte-identical at all four before/after fences; 75 writer fixtures and 18 mutation definitions stayed unchanged.

The [initial Node 24 launcher failure](implementation-evidence/review-20261019-node24-launcher-failure.log)
was a permission refusal before any Observation stage. An executable pinned launcher and authorized offline frozen,
scripts-disabled reconciliation repaired that environment; all 834 compiler, lock and module metadata pins stayed identical.
The separate main-tooling canonical correction is `6d151378d4cd9cb562194f48a57091ab74e208fb`.

This qualifies the local Observation route only. Actual native Foundation publication and the real 13-path tooling
adoption precede tooling-main admission, then separate #154, #185 and #195 acceptance. Current full repository
and six Node/OS CI cells, a fresh versioned release head with five exact archives, and the refreshed external TEST
consumer remain pending. The earlier `3b42d2641055c36c13ff0e2b7fae6cc02a945514` archives and
`a32f628a11a8cd9e871d985ab09bcfbcaa708b1b` consumer input remain historical; their results are not relabelled.
Publication remains the owner's step; accepted ADR/CMS, frozen evidence, API baselines and G1 HOLD stay unchanged.

## Current execution resolution, 2026-10-19

This addendum updates the execution state of the historical planning and local
qualification checkpoints above. It preserves their original subjects, results
and remaining-work statements as dated observations.

### Native compiler prerequisite

Foundation’s protected [release run 39272926879, attempt 2](https://github.com/agent-teams-ai/engineering-foundation/actions/runs/39272926879/attempts/2)
completed on source `aed890a6ac09762d9f487ed2624e64a873935868` after its source
correction [#413](https://github.com/agent-teams-ai/engineering-foundation/pull/413)
and generated release [#411](https://github.com/agent-teams-ai/engineering-foundation/pull/411).
All eight package reconciliations, signatures/provenance checks and final
Docs/MCP npm/pnpm consumer profiles completed. The actual public Foundation
1.10.0 archive and generated lock closure replace the active legacy compiler
path; a version number alone was not used as evidence.

Get Modular’s [native-tooling predecessor #197](https://github.com/agent-teams-ai/get-modular/pull/197)
was normally merged into `main` as `4609c2a323a360a584e773b57b30ada1bf1c0f3c`.
Its tree `33af20350e6b4ce1447ed058ff8ff451f19d73cc` is identical to reviewed
source `42778e67cef3a6a82818cf5d8373d8d8a731591b`. The actual changed-selected
whole fast route, one complete clean-clone `pnpm check`, and all 37 jobs of
[CI run 39284534396](https://github.com/agent-teams-ai/get-modular/actions/runs/39284534396)
passed. Two independent GPT-6.1 xhigh source reviews covered all 154 physical
changed paths without actionable findings. The quota-limited automated review
remains a separate incomplete observation.

All four active compiler roles use TypeScript 7.0.2. Maintained native helpers
use ordinary `.ts` and their required strict projects. Earlier shared-workspace
exclusive-write failures remain recorded as failures; the clean same-source
full pass does not identify their unobserved creator. No generator overwrite
fallback or containment exception was introduced.

The named native API transition remains read-only at this implementation step:
original released Core/Assembly baselines stay unchanged, ordinary mismatch
results remain separately retained, and qualification records
`migrationApplied: false`. Only the existing real release promoter on the
trusted release branch can later apply the reviewed transition. SDK activation,
frozen historical evidence and G1 HOLD are unchanged.

### Decision and plan admission

ADR-0034 [#154](https://github.com/agent-teams-ai/get-modular/pull/154) was normally
merged as `adc705cddeb806d676ca8dede0040ccf663f1d68`, with the exact reviewed
tree `5f38dba2e8700cac20b3b66fdf72b7611f024ed0`. The seven-path refresh passed
its actual changed-selected whole fast route, owning checks and all 37 jobs of
[CI run 39291389842](https://github.com/agent-teams-ai/get-modular/actions/runs/39291389842).
Independent source review covered all seven paths without actionable findings;
ReviewRouter separately completed its two-file policy scope without findings.
The original ADR file SHA-256 remains
`6a28f0e1fa0dbc0379541c5ebd7fc64c0b6cb3d3b4efb6a559b9ad4c9fd74a34`;
its separately defined canonical registry fingerprint remains
`sha256:62653b314316c336067c18d6a4562b50042d5b548c0da93bdae18eea6ecadf95`.

The reviewed planning checkpoint [#185](https://github.com/agent-teams-ai/get-modular/pull/185)
was normally merged as `16ad9ca5503d81a0527e8f0a3f5934db6950ceb9`, with the
exact reviewed tree `510c84fb7e163fc50a750fb8bdf78534813c778c`. Its actual
documentation-only changed route, ownership controls and all 37 jobs of
[CI run 39297872394](https://github.com/agent-teams-ai/get-modular/actions/runs/39297872394)
passed. The complete independent three-file source review found no actionable
findings. ReviewRouter's incomplete zero-of-three coverage is recorded
separately and is not represented as approval.

ADR-0034 remains the controlling observation decision. Its original compiler
planning sentence is superseded only through the separately owner-approved
ADR-0038 included in this implementation delivery. No accepted ADR is rewritten
retroactively. The plan remains
[implementation-plan.md](implementation-plan.md), read in its stated authority
order; its historical input/version tables do not override this accepted
support-floor correction.

### Final release tuple and remaining qualification

ADR-0038 section 5 and the owned minor Changesets select the actual first
observation release tuple:

| Package | Selected release version |
| --- | --- |
| `@get-modular/core` | `0.6.0` |
| `@get-modular/assembly` | `0.6.0` |
| `@get-modular/resources` | `0.2.0` |
| `@get-modular/conformance` | `0.4.0` |
| `@get-modular/observation` | `0.1.0` |

The earlier plan’s Core/Assembly 0.5, resources 0.1.1 and conformance 0.3 tuple
is a historical planning input. Raising the consumer compiler floor is a
support break and therefore uses the accepted minor versions above. Core and
Assembly remain an exact pair; observation’s first minor names the actual
resources 0.2 peer and supplies the required resources-minor coordination.
The private lifecycle candidate remains at its admitted 0.1.0.

This implementation still requires its own final integrated repository and
six OS/Node Observation cells. After normal implementation admission, the real
release branch must run Changesets and the public release promoter, pass its
current review and required CI, retain five exact archives, and run the bounded
external TEST consumer on those bytes before release merge. Post-merge archive
comparison and the archive-intent record follow the existing release plan.
The old candidate archives and consumer results above remain historical.
Publication stays with the owner under Phase 3c; this addendum authorizes no
npm upload, dist-tag change, release tag or unattended publisher.
