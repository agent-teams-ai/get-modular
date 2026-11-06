# 05. Bounded parallel construction, only after startup evidence

Status: conditional experiment and design; not selected for immediate runtime
implementation. This plan changes no accepted execution semantics.
Priority: after resource preflight and one measured consumer need.

## Baseline and goal

Reviewed revision: `5fb83478dd7b95216be92c4d3077eddf2774eef8`.

The current Assembly runner is deliberately sequential in `dependencyOrder`.
It retains one current implementation and one untransferred raw product, waits
for a running supported Promise after abort, and reports a failure separately
from observed cancellation. This is an explicit contract, not a discovered bug.
See [runner][run], [public outcome types][types] and [execution contract][cms].

Goal, if measurements justify it: overlap independent asynchronous construction
while preserving dependency correctness and complete ownership handoff. This
does not improve CPU parallelism, request throughput or scheduling of module work
after construction.

Included: Assembly's private execution program/scheduler, a bounded run option,
complete concurrent outcomes, Conformance support and qualification.
Excluded: Core changes, worker pools, fibers, request scheduler, retries, timeouts,
automatic scope disposal, resource reference counting, plugin activation, feature
flags and a second sequential/parallel runner implementation.

## Admission experiment before implementation

1. Select one pinned consumer in the existing static adoption scope, preferably
   Agent Runtime passive setup/ordinary-session construction. Record graph,
   source/package pins, supported Node/compiler and the concrete startup target.
   Do not expand into its dynamic plugin or contained-turn lifecycle.
2. Measure the current useful startup in a disposable test environment: overall
   startup, factory construction durations and dependency critical path. Use
   approximately ten bounded samples and disclose cold/warm conditions.
   Synthetic delays can prove overlap, but cannot establish a consumer speedup.
3. Record the consumer's meaningful absolute and relative improvement target
   before trying a scheduler prototype. Choose the target from actual startup
   cost; do not invent a framework-wide latency SLO or rely on stars/feature count.
4. If independent I/O is insignificant, the serial critical path dominates, or
   the consumer already constructs once outside its latency-sensitive path,
   stop with the measured deferral. No new runtime option ships.
5. Check the consumer's completion path before admitting a prototype. Each
   acquisition must settle independently, or the consumer must already have a
   Host stop/deadline path that can abort while `run()` is pending. Cancellation
   initiated only after `await run()` is insufficient. If immediate sibling
   cancellation on failure is required, defer this candidate; do not add a new
   timer, interim-notification API or internal cancellation authority to admit it.
6. Only for an admitted bottleneck and completion path, run a bounded experiment at
   concurrency 1, 2 and 4 over the same useful workload. Compare total startup,
   active count, failures/cancellation, final owned-resource count and memory.
   Retain every outcome, including regressions. Do not publish the experiment as
   a supported implementation or carry over source-only results as package proof.

The experiment is complete when it supports either a concrete small change or a
documented no-go. It is not a reason to add an ongoing benchmarking subsystem.

## Candidate contract if the experiment passes

Before implementation, record a scoped successor to the sequential execution,
single-failure and creation-order presentation clauses of the Assembly contract.
Preserve accepted ADR bytes; show the exact old/new guarantees in that successor.

- One execution implementation serves all runs. Add `concurrency` to run options;
  omission means 1. Validate a finite integer from 1 through the existing
  Assembly `limits.handles` maximum (4096 at this baseline), before any factory.
  A bound greater than available work leaves idle capacity; it is not an error.
  Reuse that owning limit, without a second registry or graph-specific setting.
  No automatic concurrency inference or environment
  switch. A proposed stable `assembly.run.invalid-options`/phase `options`
  reports an invalid bound without overloading resource or input errors.
- Preserve admission precedence: initially aborted signal, declared inputs,
  resource-context preflight, then the new execution option. The preflight plan's
  `context` phase and `assembly.run.invalid-context` stay intact. Recheck abort
  before every launch.
- Use the caller's signal unchanged. On observed failure, stop launching new
  factories and await already admitted in-flight carriers. Do not abort a
  borrowed scope or create a second internal cancellation authority. Caller
  cancellation remains cooperative; no `Promise.race` can certify completion.
- An uncooperative supported Promise can keep the run pending, as today.
  Unsupported carriers are rejected without invoking then/getters. Their
  unobservable external work is not claimed to have stopped.

Failure is observable to the caller only after all started carriers settle.
This candidate provides neither fail-fast completion nor failure-triggered
sibling cancellation. Even a cooperative peer B that waits for caller abort
can hold the result after peer A rejects. A Host that waits for that result
before aborting cannot make progress. The admission check above must qualify an
independent completion/Host-cancellation path; the sequential runner did not
start B after A failed, so serial liveness must not be claimed for this case.
A Host deadline initiates cancellation, not proof of completion or permission
to discard pending work. Cleanup still follows actual drain.

### Dependency execution

Derive a private ready queue from the already validated Program. Count unique
provider implementation dependencies, including when several slots name one
provider; declared inputs are admitted first and are already available.
A factory starts only after every provider's valid product has been committed.

Choose the lowest plan index among currently ready entries and never exceed the
bound. Mark an invocation before calling user code so synchronous reentrancy
cannot launch it twice. A synchronously observed throw or unsupported carrier
stops further launches before another capacity slot is filled.
Separate synchronous factory invocation and carrier admission from asynchronous
settlement observation. The current `async invokeFactory` converts a synchronous
throw to a Promise result; enqueueing it unchanged would hide that failure until
a microtask and could fill more slots. Refactor that existing boundary locally,
without introducing another execution implementation.

Preserve the existing required/optional/many dependency projection. In particular,
`providerImplementationIds` order determines many injection, never completion
order. One provider instance is shared across its diamond in each attempt.
Repeated/concurrent/nested attempts keep separate state.

### Settlement and ownership

Maintain one bounded state slot per selected implementation. Every admitted
supported carrier gets an observer immediately. Retain a fulfilled raw product
before inspecting it; use the existing no-assimilation observer and product
snapshot rules. Do not resolve a Promise with an opaque nested product.

For every observed fulfillment, transfer it exactly once to a committed created
entry, or retain the identical raw product in its failure record. If a commit
helper throws after append, that product already belongs to created; it must
not also appear as untransferred. Other in-flight results are still collected.
Never freeze the mutable attempt journal or publish an outcome before draining.

A valid late fulfillment after another error/abort is still recorded. Malformed
late fulfillment, rejection and controlled internal failure are all retained.
Assembly never disposes instances/capabilities/inputs or guesses their ownership.
Resources and the Host continue to own cleanup and any unresolved debt.

### Outcomes and determinism

Use one failure-vector shape for both concurrency 1 and greater values:
the current per-failure fields (phase, code, implementationId, cause, optional
untransferred product) become a nonempty list, with created and observed
cancellation at outcome level. Avoid retaining a duplicate primary-error API.
This is an explicit breaking proposal, not an implementation in the plan PR.

Preserve the current precedence: any observed failure yields failed with
cancellation recorded separately; cancellation without failure yields cancelled;
success requires all selected factories and a final abort check.
Sort failure records and the final created presentation by plan index, with
attempt-wide validation errors explicitly ordered before factory records.

The plan/digest stays deterministic. In parallel mode the timing of external
effects and the subset started before an observed failure can vary. A sorted
journal is not proof of deterministic execution or cancellation races.
At concurrency 1, invocation order and terminal precedence match the serial
baseline, apart from the explicitly migrated failure representation.

## Implementation sequence and owners

1. Close the resource-preflight slice first. Admit the measured use case and
   successor contract; do not enlarge Core's responsibilities.
2. Extend `Program` privately with indexed dependency/ready information, deriving
   it from existing bindings. Keep immutable prepared state and per-run mutable
   state separate. No second graph validator or runtime provider resolver.
3. Adapt `run.ts` to one bounded scheduler; reuse snapshot/carrier code and the
   existing controlled commit-fault seam. Add the run option/outcome types as one
   coherent change, not an unusable public stub.
4. Update Conformance `smoke` with an explicit concurrency setting only; it still
   owns its test scope/signal/inputs. Serial mode retains prefix expectations.
   Parallel mode checks causal dependencies, at-most-once invocation, expected
   injected failure, every observed handoff and cleanup. Unexpected extra
   failures remain failures of the qualification, not silently accepted.
   Its current internal controller does not expose an independent Host stop
   path. Use self-settling or explicitly controlled factory fixtures for parallel
   smoke. Prove the abort-waiting peer through public `run()` and the selected
   consumer's existing independent stop path; do not claim smoke proves that path
   or silently add a cancellation/timeout API to its one new setting.
5. Qualify public packed packages and the same measured consumer. Update CMS,
   affected adoption pins, examples, the consumer's outcome handling and release
   migration together. Do not add parallel behavior to unrelated consumers.

Target areas: Assembly `types.ts`, `ports.ts`, `prepare-program.ts`, `run.ts`;
Conformance `features/harness/{smoke,types}.ts`; existing runtime/carrier/resource
tests and consumer qualification sources. New maintained logic/tests use `.ts`
under strict TypeScript 7.0.2+ projects; no unrelated JavaScript migration.

## Required proof matrix

| Case | Independent expectation |
| --- | --- |
| Serial equivalence | Concurrency 1 preserves invocation order, input borrowing, late-result handling and failure precedence |
| Ready frontier | Two held independent providers overlap; a dependent never starts early; active count stays within bound |
| Cardinality/sharing | Explicit many order, absent optional and diamond identity are unchanged |
| Multiple failures | Two invalid products/rejections preserve both causes and every raw product exactly once |
| Cancellation race | Already-aborted means zero calls; late valid/invalid/rejected settlements are all accounted for |
| Failure with abort-waiting peer | Controlled A rejects while B waits for caller abort; an independent Host stop releases B, all causes/products are retained, and cleanup begins only after drain |
| Synchronous failure | Throw/unsupported carrier during launch prevents subsequent launches once observed |
| Commit fault | Before/after-append faults preserve all in-flight handoffs without duplicate ownership |
| Opaque values | Then methods/accessors are not invoked; instances and capabilities remain unfrozen |
| Cleanup | Borrowed inputs are not disposed; Host closes after drain; provider outlives dependent cleanup |
| Attempt isolation | Repeated/concurrent/nested runs share no queue, state, signal mapping or journal |
| Package/consumer | Public-root packed test and actual consumer preserve useful output, admission and cleanup |
| Performance | Same workload meets the pre-recorded startup target without unacceptable resource regression |

Extend existing tests instead of creating a new runner framework. Use
`bun run assembly:build`, `bun run assembly:typecheck`, `bun run assembly:test`,
`bun run resources:check`, `bun run conformance:check` and the existing packed
consumer hook. Focused runtime checks already include
`node --test tests/assembly/runtime.test.mjs packages/assembly/tests/carriers.test.mjs`.
Run the normal changed, fast and complete repository/required CI gates on the
actual implementation head. New test paths/commands are proposals until present.

## Migration, stopping and estimates

The outcome change requires a breaking minor and coordinated package admission.
Consumer error handlers must handle all failures rather than arbitrarily selecting
the first. Codemod only mechanically proven accesses; report semantic choices for
hand migration. Include the required migration block and rejecting fixtures;
do not write release-owned API baselines on the feature branch.

Stop if no meaningful startup bottleneck is measured, any result can be lost,
the consumer lacks an independent completion/cancellation path, immediate sibling
cancellation is required, the only design requires automatic disposal/force
cancellation, or the measured gain does not meet the recorded target. Do not
weaken failure tests to ship overlap. The abort-waiting-peer proof uses controlled
barriers and an explicit Host abort, not elapsed-time guesses or a new timer.

Experiment: no production API change, approximately 100–250 tooling lines and
150–300 fixture/test lines if existing measurement hooks are insufficient.
Admitted implementation: approximately 600–1,200 production/integration lines and
1,200–2,400 test/fixture lines, excluding consumer migration and generated sources.
Confidence 6/10; achievable reliability in the stated carrier/Host contract 8/10;
complexity 8/10. These are design estimates, not availability guarantees.

[run]: https://github.com/agent-teams-ai/get-modular/blob/5fb83478dd7b95216be92c4d3077eddf2774eef8/packages/assembly/src/features/construction/run.ts
[types]: https://github.com/agent-teams-ai/get-modular/blob/5fb83478dd7b95216be92c4d3077eddf2774eef8/packages/assembly/src/features/construction/types.ts
[cms]: https://github.com/agent-teams-ai/get-modular/blob/5fb83478dd7b95216be92c4d3077eddf2774eef8/docs/architecture/common-assembly.md
