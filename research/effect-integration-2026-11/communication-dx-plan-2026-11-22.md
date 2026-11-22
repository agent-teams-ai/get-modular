# Communication DX and bounded workload: delivery plan

Date: 2026-11-22. Starting main: `43fff28a82f664cd126913f45a51fdeb75589083`.
Status: reviewed implementation plan; no execution result is implied.
Predecessor: [communication recipes, PR #242](https://github.com/agent-teams-ai/get-modular/pull/242).

## Goal and completion boundary

Make the existing in-process module communication recipes easy to start using,
explicit about ownership and overload, and qualified under one finite workload.
The user authorized planning, independent review, implementation, important E2E,
an early Draft PR, pushed fixes, external review and protected merge.

Deliver exactly three related improvements:

1. Complete producer-to-consumer-to-session-close examples without Effect and
   with native Effect, with a short discoverable starting path.
2. One bounded workload combining fan-out, a slow subscriber, publication
   backpressure and repeated subscription retirement, with actual measurements.
3. Recoverable Observation subscription-budget refusal at the consumer adapter,
   including explicit successful recovery after capacity is released.

Production usability means these recipes keep their declared in-process delivery,
failure and ownership contracts through the tested workload and shutdown paths.
It does not mean stable 1.0, an unidentified application's production admission,
browser/network qualification or a package deployment. No application or release
target was supplied. The exact tested revision, envelope and remaining
product-owned decisions will be reported with the result.

## Existing authority and semantic owners

Read [ADR-0043](../../docs/decisions/0043-plan-optional-native-effect-composition.md),
the [Consumer Module Standard](../../docs/architecture/common-assembly.md#consumer-module-standard),
the [Observation contract](../../packages/observation/README.md) and the packaged
[Effect practices](../../packages/effect/docs/practices.md). These remain the
authorities; this plan is not a second usage standard or an accepted ADR.

| Owner | Responsibility retained by this change |
| --- | --- |
| Core and Assembly | Inert declarations, exact bindings and verified construction |
| Consumer-owned port | Meaning of progress occurrences and promised delivery semantics |
| Source owner | Publication and source lifetime; readers receive no shutdown authority |
| Session/consumer | Its subscription, work and cleanup; borrowed sources outlive it |
| Native Effect | Native Scope, failures, interruption and bounded PubSub behavior |
| Observation and Resources | Latest-state authority, watch admission, scoped cleanup reports |
| Existing repository qualification | Executable examples, bounded load observations and archive checks |

Plain event data and neutral ports stay independent of Effect. Native technical
ports remain honestly native. A latest-state projection is not an occurrence log.
No generic abstraction will make those different contracts appear identical.

## Slice 1: complete session examples

### Ordinary modules

- Use a concrete `EventTarget` source behind the existing plain `ProgressSource`.
  Keep the event record stable after publication and the source adapter small.
- Show the full ordinary Assembly preparation, a declared source dependency,
  subscription readiness, publication, session retirement and a fresh session.
- Own module registration with `Resources.setup`, including synchronous emissions
  during registration. Do not use an unprotected acquire-then-register handoff.
- Check complete and settled close reports. Closing a consumer removes its actual
  listener and leaves the borrowed source and any sibling consumer alive.
- EventTarget reports throwing listeners to its Host. The example does not claim
  to catch those exceptions; failure-path checks use owned session/construction
  failures, while callback handler errors retain their existing tested contract.
- Keep the complete example portable TypeScript under
  `tests/qualification/effect-communication`; execute it from installed public
  archives before Effect is present in the consumer's installation.

### Native modules

- Reuse the existing `nativeProgress` contract and native GM graph. Acquire the
  subscription before publishing, run consumption in its consumer Scope, join
  owned work before source retirement and observe the publication result.
- Extract existing graph/example code only when it makes the executable starting
  example shorter or avoids duplicating the graph for the load test.
- Keep native GM composition examples in the Effect development owner; shared
  neutral/Observation adapters stay in the root qualification owner. Do not create
  a root-to-Effect-package dependency cycle to share a tutorial helper.
- Retain the existing real EventTarget-to-callback-to-Observation E2E as evidence
  for crossing the neutral/native boundary. A callback Stream remains cold; a
  lazy value alone must never be documented as ready.

Add a short route in the ordinary module-authoring guide and a concise entry
section in the existing packaged Effect guide. Link complete maintained files;
do not introduce a second long manual or snippets with undefined critical owners.
The examples are consumer code, not new `@get-modular/*` exports.

## Slice 2: one fixed workload

Use the existing native GM source, Node test runner and archive route. Initial
profile: capacity 32, four sequential publishing workers, eight continuing
consumers, one deliberately held consumer, at most one transient consumer, 32
transient acquisitions and 4,096 normal occurrences. Final constants must be
recorded with the result; changing them requires a stated measurement or
correctness reason, not a new configuration matrix.

The population ceiling is ten live subscribers and four publishing workers;
32 is the lifetime total of transient acquisitions, not simultaneous consumers.
Count the deliberate pressure phase separately: 32 prefills and four initially
blocked publications. Normal traffic is 32 epochs of 128 occurrences, four
publishers with 1,024 occurrences each. Normal latency excludes the deliberate
pressure phase. Each transient reader takes one occurrence and closes; more than
32 later occurrences must flow before the next transient acquisition, proving
that a retired subscription cannot keep the source blocked.

Payloads are small stable plain records carrying publisher identity and sequence.
Each publisher waits for its own admission before its next call. Subscriber and
publisher populations are finite; no fiber is created for each occurrence.

Use barriers, not sleeps, to establish that the held consumer fills the source
and publication actually waits. Retire it and prove progress resumes. Place
transient subscriptions deterministically within bounded traffic epochs, and
close each before acquiring the next. Continuing consumers use an independent
per-publisher sequence/count oracle; they need not retain all payloads or assert
an ordering between different publishers. Existing small regressions continue
to own cancelled-publication/no-ghost behavior and detailed error combinations.

Acceptance: exact promised delivery, bounded application-owned work population,
no work after consumer retirement, matching acquisition/release counts, joined
publishers and consumers, and refusal by the retained publisher after source close.
Do not add public debug fields or inspect Effect internals to claim a global heap
or subscription bound. The native queue contract is exercised by real pressure.

Record the exact profile, runtime/platform, counts, elapsed time, publication and
delivery latency samples, and memory snapshots at start, pressure, after traffic
and after cleanup. Define the start of each latency measurement. Bounded numeric
samples and ordinary test diagnostics suffice; no new benchmark framework.
Timings, sampled RSS/heap and their deltas are observations, not CI SLOs or proof
of absence of every leak. No forced GC or invented p95/memory threshold. The test
timeout guards a hang, not a production shutdown deadline.

## Slice 3: recoverable watch admission

The Observation public API keeps its existing contract. At the concrete progress
adapter, classify only `code === "observation.subscriptions.limit"` thrown by
`watch` as a named expected admission failure; retain the original cause.
Do not catch unrelated failures from reading the source or closing its scope.

Both ordinary and native consumers demonstrate the same refusal and explicit
recovery. If sharing is useful, use one small Effect-free, progress-specific
watch admission helper in the consumer composition adapter. Do not generalize it
to a universal Result, watch, Scope or admission controller. The Effect projection
exposes the refusal in its real error channel. All other watch errors remain
defects/rethrows. Failed cleanup retains its report and is never silently retried.

Register successfully before offering the initial snapshot. Refusal must not
allow `take(1)` to turn failed admission into apparent success.

The decisive real-store scenario uses `maxSubscriptions: 1`: first consumer
starts; second is refused with the exact cause and no emitted initial value;
first still receives an update; first closes; a newly requested third consumer
is admitted and sees current state; final live watches are zero. Preserve the
closed-source defect and failed-cleanup regressions. There is no automatic retry
or change to the configured safety budget.

## Files and verification

Expected edits are limited to the existing communication recipes/tests, portable
example file(s), the archive harness, the two existing usage guides and this
research record/navigation. Add a precise qualification entrypoint to the
existing source policy only if a new cross-owner test import needs one; do not
relax package dependencies or drop governed roots. No production runtime API,
dependency version, lockfile, CI matrix or release baseline change is planned.

1. Install with the repository's frozen route: Bun 1.4.3, TypeScript 7.0.2,
   Effect 4.1.4. Do not run an older compiler or mix managers.
2. Keep every new TypeScript file in the owning strict check. Extend the archive's
   explicit NodeNext/Bundler portable file list; a copied file is not evidence
   that it executed or typechecked. Keep Node-only measurement in test tooling.
   Preserve exact public-carrier import counts per copied file: extracting a
   native helper moves its one carrier import, rather than weakening the check.
3. Reuse `assembly:build`, `resources:build`, `conformance:build`,
   `observation:build`, then `effect:check` for changed behavior and real archives.
   Update exact archive test/pass counts together with the new maintained cases.
4. Use `check:changed` during editing and `check:fast` before final handoff;
   complete the full required gate and actual final-head platform/runtime CI.
   Reuse evidence for unchanged inputs; no repeated unchanged full matrix.
5. Execute the neutral session and admission example while Effect resolution
   fails in the isolated installed consumer. Execute the native workload and
   failure tests again through the matched installed public packages.
6. Run documentation protocol/context checks through the installed tool and the
   repository's full docs/governance gates. Preserve existing metadata and
   accepted decision bytes.

## Review and delivery checkpoints

1. Review this plan independently for architecture/DX and qualification. Refine
   it in a second pass before implementation; record concrete decisions below.
2. Commit the reviewed plan, push it and open Draft PR immediately. Keep every
   coherent implementation/fix pushed to that PR with honest validation status.
3. Implement the three slices, inspect the integrated diff, run meaningful
   regressions and independent code review, then fix confirmed findings.
4. Obtain actual external review through the repository's available integration.
   A skipped draft/merge-commit check or incomplete provider run is not review.
   Re-review affected changes until confirmed findings are resolved; do not add
   arbitrary changes merely to manufacture another review round.
5. Mark ready, wait for successful required/full checks and resolve reviewed
   threads after their fixes. Preserve protections, source identity and attribution.
6. Re-read the live owner/head/base/commit list, squash the exact reviewed head,
   independently verify the resulting commit and wait for successful main CI.
   Record actual workload observations and delivery evidence in the PR.

## Scope exclusions and reversal

No new event SDK, global bus, string-topic registry, runtime/lifecycle manager,
generic Task/Fiber/Scope abstraction, scheduler, retry policy, durable delivery,
replay, acknowledgements, cross-process transport, automatic two-way state sync,
product migration, dependency renovation or npm publication. Source/API breaks
are allowed by the owner when justified, but none is needed for this slice.

Expected incremental size is about 150-250 lines of concrete example/adapter
code and 200-350 lines of tests/measurements, plus focused guide changes. These
are estimates, not quotas. Prefer removing duplicated test wiring over increasing
the framework surface. Reverting this PR removes the new recipes/evidence and
restores the previous consumer bridge; no persisted data or public API migrates.

## Plan review record

- Round 1, architecture/DX: keep native and neutral ownership honest; use the
  existing guides; protect synchronous subscription handoff with Resources.setup;
  isolate the watch call's budget classification and retain non-limit defects.
- Round 1, qualification: use one finite load profile and existing archive/gates;
  include a real neutral source before Effect installation; portable compiler
  inputs and exact test counts require explicit updates; measurements are not SLOs.
- Round 2, architecture/DX: use honest distinct neutral/native ports with shared
  plain data instead of inventing a callback readiness API. The linked native
  file must include complete scoped execution, not just graph construction.
  Keep Node-only assertions out of portable examples and preserve real
  EventTarget exception semantics. Capture a real watch refusal in a test-only
  forwarding facet to verify the exact original cause without a new debug API.
- Round 2, qualification: distinguish pressure and normal counts/latencies,
  record the simultaneous population ceiling, and require more than one queue
  capacity of traffic after each transient consumer closes. Preserve explicit
  per-file archive carrier assertions after graph extraction. Both independent
  reviews found no additional required subsystem or public API break.
- Integration refinement: run the neutral portable type checks before installing
  Effect as well as executing that consumer, so a type-only dependency cannot
  hide behind native qualification. Forward the installed workload's one bounded
  diagnostic record rather than discarding its measurements in the archive Host.
- Code review corrections: preserve arbitrary cancellation reasons before reading
  their discriminator, and preserve the original watch failure if classification
  itself encounters an invalid spec or throwing getter. Regressions exercise the
  real cancelled/invalid-spec path and an unknown throwing cause. These are local
  adapter corrections, not new Observation semantics or an error framework.
