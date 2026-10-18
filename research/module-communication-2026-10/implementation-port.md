# Observation implementation and qualification record

Recorded on 2026-10-18. This is the implementation record for the
[reviewed plan](implementation-plan.md), following the separate
[plan review](plan-review.md). The implementation and its scoped local gates
are complete. Exact release-archive consumer qualification has passed and was
independently verified. Merge and release eligibility remain blocked as described below.

## Subjects and authority

| Subject | Identity |
| --- | --- |
| Current main integrated into the implementation | `47a02a90a06f121c78086c7c5f72b085c42ee7ea`, including merged PR #183 and fresh author qualification |
| Reviewed plan predecessor | PR #185, `a0c08187845019680d9a2bc764f4010c8cc52b1a` |
| Exact ADR-0034 predecessor merged into this branch | PR #154, `945e9a151a516ce4ce6e73b6e18893d4e5b27cfe` |
| Current implementation | `f0deed0af09915717f93bda11c570a82f456907e`, branch `feat/observation-0-1-e2e`; runtime from `737d842`, TypeScript test/manifest correction `4b3fa55` |
| Unpublished prepared release | `106e3b0adca10e83d7a87ba57cb73baa9ee7ca6d`, branch `release/observation-0-1-candidate` |
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
   dependency is resolved, and observe every updated Node/OS CI lane. The first
   run passed observation on Linux/macOS for both Nodes; the corrected Windows
   lane and its 13-minute target require fresh CI. The 15-minute workflow
   timeout remains unchanged.
4. Obtain the existing owner decisions for merge and publication. Prepared
   versions and passing package/consumer checks do not grant release eligibility.

Codex Review is ignored as the owner requested. No other gate, failure or
unexecuted row is reclassified as passing.
