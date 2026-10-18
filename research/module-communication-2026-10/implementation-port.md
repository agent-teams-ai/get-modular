# Observation implementation and qualification record

Recorded on 2026-10-18. This is the implementation record for the
[reviewed plan](implementation-plan.md), following the separate
[plan review](plan-review.md). The implementation and its scoped local gates
are complete. Exact release-archive consumer qualification has passed and was
independently verified. Merge and release eligibility remain blocked as described below.

## Subjects and authority

| Subject | Identity |
| --- | --- |
| Current main integrated into the implementation | `ccd815eac780b603a4cb6d01d07c995348c7b0f5`, including merged PR #183 |
| Reviewed plan predecessor | PR #185, `a0c08187845019680d9a2bc764f4010c8cc52b1a` |
| Exact ADR-0034 predecessor merged into this branch | PR #154, `945e9a151a516ce4ce6e73b6e18893d4e5b27cfe` |
| Implementation source used for final package qualification | `0cfa39e`, branch `feat/observation-0-1-e2e` |
| Unpublished prepared release | `b2815314182221baac6b08750f86ef2644d2cdb8`, branch `release/observation-0-1-candidate` |
| External consumer | `agent-teams-ai/modularity-host-test`, `observation-0.1.0/`, branch `test/observation-0.1.0` |
| Compiler policy successor | [ADR-0038](../../docs/decisions/0038-require-typescript-7-for-current-package-qualification.md) |

The latest owner request explicitly authorized implementation, testing and
independent review. Work proceeded in isolated branches with the exact reviewed
predecessors. ADR-0034 is present in the implementation branch but is still
absent from the recorded main. This does not satisfy Phase 0's main-admission
condition or authorize a merge. Old accepted decisions and their existing
registry entries were preserved; ADR-0038 was created through Docs Protocol and
appended through the supported decision-baseline promotion command.

Only TypeScript 7.0.2 or newer was executed for this delivery. The supported
minimum and current aliases both resolve to 7.0.2, so each distinct compiler
runs once per NodeNext and Bundler observation with `skipLibCheck: false`.
The installed Foundation extraction dependency still uses 5.9.3; see
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
It found no missing live obligation in those families. This is not a claim that
the unexecuted operating-system matrix passed.

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

All three reviewers used **Astra xhigh**, read the owner vision, organization
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

## Executed checks

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
| Seven individual Foundation capabilities | Source dependencies, local references, architecture decisions, agent workflow, dependency declarations, source coverage and suppression governance each pass with selected coverage. |
| Complete typed quality | `pnpm lint:typed` passes with zero diagnostics and no bridge admission. |
| Required quality execution | All 11 required identities completed; the contract has no exceptions. |
| Toolchain and lock | Runtime preflight, strict peer lock check, TS7 runtime-policy typecheck and runtime-policy test pass. |
| Documentation | Docs Protocol, complete Markdown lint and spelling checks pass; final handoff update is checked again before push. |

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

All five archives were packed once from the single committed prepared release
listed above. Pinned package versions and hashes are retained in the external
consumer's `third_party/pins.json`; installed file bytes and physical peer
identity are checked before the consumer runs.

| Package | Prepared version | SHA-256 |
| --- | --- | --- |
| Core | 0.6.0 | `bac6f9e899b235124faf9d8eea9842eaaba5bb1ba543adb626fe21d6e3a5870f` |
| Assembly | 0.6.0 | `ac96072e21d7a6a4264685c25e8c5ee487cbe0302ede58ec384d34ad4ddf8f63` |
| Resources | 0.2.0 | `d9f6363d9c848be90c15e5d20acf07226e3b29ed55ae8af3d6ee0274e5a123d5` |
| Conformance | 0.4.0 | `9b0b7c3bd1f64ebed48ddf6ac51782aab0cf70d72a1fb9fac99b591b3ade888b` |
| Observation | 0.1.0 | `3a3f235336fdeecf6a54b99c3585afd3440dd0f9cab03d99af043f38bf433597` |

Assembly depends on exact Core 0.6.0. Conformance peers are Core/Assembly
`^0.6.0` and resources `^0.2.0`; observation has only resources `^0.2.0`.
Package Node engines retain `>=24.18.0 <25 || >=26.10.0 <27`; repository tooling
has the separately enforced 24.21.0 minimum. No package was published.

## Exact-archive external E2E result

The executed consumer commit is `972dc2b9dfe9470a5e34ed4f28d75ecfc0fbec73`.
An evidence-only successor retains the complete record under
`observation-0.1.0/evidence/accepted-972dc2b/` in the external repository.
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
Production packages and their archives required no E2E correction.

## Remaining gates

1. Merge the still-open ADR-0034 and planning predecessors through their owning
   review route. This branch has their exact bytes but does not make them main.
2. Resolve Foundation/API Extractor's TS5.9 dependency with an upstream native
   compiler migration and explicit extractor-provenance upgrade. No compatible
   release or permission to execute the old compiler is assumed.
3. Run the unchanged complete/fast/changed and SDK-growth aggregates after that
   dependency is resolved, and observe every Node/OS CI lane. Linux evidence is
   not macOS/Windows evidence; the 13-minute Windows observation target remains
   unmeasured and the 15-minute workflow timeout remains unchanged.
4. Obtain the existing owner decisions for merge and publication. Prepared
   versions and passing package/consumer checks do not grant release eligibility.

Codex Review is ignored as the owner requested. No other gate, failure or
unexecuted row is reclassified as passing.
