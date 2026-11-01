# Adversarial recheck of communication scope and optional integrations

<!-- cspell:words RxJS Wonka PubSub EventTarget EventEmitter AsyncIterable Modulith Kibana -->
<!-- cspell:ignore backpressure fanout -->

**Review date:** 2026-11-01. **Status:** research challenge only.
This review rechecks the owner's priority of modularity, Clean Architecture,
SOLID, DRY, bounded scope, small optional dependencies, trusted in-process
modules and Host-owned product lifecycle. It relies on first-party evidence
recorded in [the industry update](industry-evidence-and-negative-patterns-2026-11-01.md),
the [October survey](raw/practices/practices-catalog-v2.md), the
[accepted contract](../../docs/architecture/common-assembly.md) and the
[November coverage audit in PR #213](https://github.com/agent-teams-ai/get-modular/blob/24cf56ad4363168aaff3ab0bbfb648b2514c5f03/research/module-communication-2026-10/decision-coverage-2026-11-01.md).

**Integrity of review process:** The ten perspectives below are adversarial
analytical passes with separate acceptance criteria, **not** ten independently
executed agents. This environment did not expose a subagent execution API or
a way to select external critic models and thinking effort. A GitHub bot review
may provide a separate reviewer after a PR is published, but must be reported
as such rather than as ten independent results.

## A. Boundary challenge: should Core own event delivery?

**Thesis attacked:** Adding events would improve framework completeness.
The user's actual product requirement is dependable modular composition.

Three alternatives, in order:

1. **Keep current typed event capabilities and explicit Host-selected ports.**
   Best for a plain notification in one process; no new runtime dependency.
2. **Add a dedicated optional adapter in the first consumer that repeatedly
   needs the same operations.** Share only the real contract, not hypothetical
   future delivery policies.
3. **Build a Get Modular-wide events runtime.** Reject today: this would add
   scheduling, exception semantics and teardown guarantees without a named
   recurring consumer, in conflict with the accepted system boundary.

**Strongest challenge to choice 1:** Different modules might reimplement a
broken emitter or lose the returned disposer. **Response:** Keep executable
`resources.setup` examples and one negative regression that proves safe
acquisition. If at least one consumer encounters repeated identical *source*
logic not solved by a mature existing library, revisit a leaf package using
a recorded use case. No two-consumer minimum is imposed in advance.

**Decisive proof:** A module using a typed port can be built with a custom
source and with a selected adapter, and still import no event runtime through
Core or Assembly. PR #213 proves structural assembly only; no real RxJS
installation or bundle-size evidence follows from it.

## B. Semantic challenge: what exactly does an event promise?

**Thesis attacked:** Every object supporting `subscribe` is interchangeable.

1. **Define a domain-specific, narrow source port** describing only required
   live occurrences and explicit order/error/close behavior.
2. **Use a richer consumer-owned source or stream abstraction** only when
   errors, completion or producer demand are actually used.
3. **Make every source implement a large common event and queue interface.**
   Reject: optional methods and incompatible defaults hide broken semantics.

**Adversarial examples:** A cold RxJS Observable starts two network reads for
two listeners; a hot EventTarget starts none; a finite stream completes but a
live source never does; a source calls a listener before returning its
disposer; a listener throws under EventTarget and the caller never receives
a thrown exception. All have similarly named subscription operations.

**Proposed acceptance test if a real adapter is selected:** Demonstrate two
subscribers, an immediate synchronous first emission, a throwing callback,
a provider error, completion, close during acquisition and late unsubscribe.
Record which cases the selected contract actually supports; reject a
mismatch rather than silently adapting away guarantees.

## C. Lifetime challenge: is cleanup actually complete?

**Thesis attacked:** Returning an unsubscribe and listening to AbortSignal
are enough for correct shutdown.

1. **Use existing Resources custody for subscriptions and separately retain
   admitted async work** until its physical settlement.
2. **Add a narrowly scoped adapter owned by the consumer** to translate
   concrete library teardown and error rules.
3. **Add a universal task scheduler or new scope hierarchy to GM.** Reject
   unless a demonstrated common failure cannot be modeled through the
   existing scopes; parallel scope authorities risk mismatched shutdown.

**Attack cases:** Source acquisition begins shutdown and then returns a
disposer; unsubscribe throws; callback starts an HTTP call that ignores
`AbortSignal`; a provider closes before a dependent callback settles; a
nested consumer tries to close its ancestor during cleanup; error reporting
itself throws.

**Current evidence:** The documented sync source regression validates the
first two forms in Resources/Assembly. Observation `load` retains physical
drain under ADR-0039. This does **not** imply that arbitrary detached
promises are automatically tracked, nor that `CloseReport.complete` proves
the operating system released an external handle.

**Promotion trigger:** A real consumer repeats the *same* retained-work
problem across independent modules and an existing execution library is
insufficient. Then decide between a small consumer helper and a separate
optional package, with actual teardown tests before a public API.

## D. Capacity challenge: how do queues make things worse?

**Thesis attacked:** Bounded queue capacity plus a sequential handler means
safe bounded work.

1. **No queue for direct commands or simple live notifications.** Preserve
   synchronous typed calls and latest-state Observation where valid.
2. **Admit work with an existing bounded library behind the work owner's
   port.** Define accepted, active, waiting and retry semantics per consumer.
3. **Add a global event/work scheduler in GM.** Reject: cannot specify
   domain-specific loss and replay rules, creates a second Host authority.

**Attack cases:** Producer sends 10,000 values while consumer handles 10;
`concatMap` buffers the rest; `for await` pulls from an unstoppable push
source; one slow PubSub subscriber holds up all publishers; each waiting
publisher retains a large payload and its own Promise; a queue is drained
when a job is taken but the physical job continues after shutdown.

**Required measurement if admitted:** queued items, active physical jobs,
waiting publishers, per-message retained payload, overload response,
ordering under concurrency and shutdown cost. No throughput or memory
comparison with Effect can be claimed without the same test workload and
the same delivery guarantees.

**Promotion trigger:** A named workload exhibits measurable overload and
one existing selected library cannot meet its specified policy. An
operational cap is not a compile-time module property.

## E. Recovery challenge: should events be durable inside one process?

**Thesis attacked:** One address space means no need for durable messaging.

1. **Keep durable obligations and acknowledgements with the domain or Host
   store**; use the already chosen infrastructure adapter for wake-ups.
2. **Replace one transport behind an existing durable port** after passing
   its separate atomicity, restart and receipt qualification.
3. **Put persistence, retry and business completion in an optional Get Modular
   event package.** Reject: crosses the authority boundary and duplicates
   domain ownership even when technically possible.

**Attack cases:** Process terminates between a payment commit and event
publication; queue row is lost; consumer executes but ACK is lost; retry
repeats an external side effect; `stop()` itself fails after startup failed.
A transient stream has no answer to these incidents.

**Evidence and limit:** The [Payments transactional transport contract](https://github.com/agent-teams-ai/payments-sdk/blob/7052c0e25ef4e145d555192806ba9c695d8a5ace/docs/queue-transport.md)
already separates payment obligations and receipts from a selected
`pg-boss` transport. Its worker startup catch may mask the original error
if the stop operation rejects; that is a **Payments-owned source risk**, not
a confirmed incident or a reason to create a GM scheduler.

## F. Graph challenge: does a dependency DAG ensure safe communication?

**Thesis attacked:** Explicit graph validation prevents all event loops and
all access that should not occur.

1. **Keep dependency graph checks and explicit declared port connections.**
   Also design the causal direction of commands and notifications in each
   domain.
2. **Use a dedicated Host coordination module** for a real multi-owner
   operation; avoid a global mediator or a hidden cycle.
3. **Let runtime event topics or mutable registries connect anything.**
   Reject: erases the architecture's best diagnostic feature.

**Counterexample:** Consumer B depends on A's event source. A receives B's
command via an explicit parent wiring or bridge. The graph can remain a DAG
while a callback from A leads to B, which calls A, which publishes again.
Observation's local echo and depth limits do not guarantee that a different
event library will detect or prevent this cycle.

**Second counterexample:** A string URL, storage key or event identifier
owned by module A is used by B without a declared reference. This is still
a dependency in the architecture even if no TypeScript import is visible.
An explicit port is often simpler than ever more intelligent source scanning.

## G. Scale challenge: will this work for thousands of live modules?

**Thesis attacked:** A 1000-module type fixture and successful basic CI prove
1000 simultaneously running modules or agents.

1. **Keep existing deterministic graph/type-cost tests** and measure a
   named high-concurrency Host workload only when it exists.
2. **Optimize a measured bottleneck** by reducing unnecessary subscriptions,
   introducing meaningful state aggregates or owner-level admission limits.
3. **Rewrite Assembly as a parallel executor, or add global fanout and trace
   engines before measurement.** Reject until savings outweigh deterministic
   construction, failure and resource-custody complexity.

**Proof not currently present:** One repeatable test with hundreds or
thousands of live instance scopes, overlapping external events, per-instance
resource ownership, controlled shutdown, error sinks and independent
real memory measurements. Repository type tests exercise 500 handles
in fragments and probe 1000 declarations; they are not that workload.

**Candidate workload once required:** Report module graph size separately
from concurrent run count, subscription count, in-flight async jobs and
payload size. Compare wall-clock startup, memory, event delay, drain time
and leak/debt count. Use defined test machines and datasets; never publish
unmeasured superiority claims over Effect.

## H. Platform challenge: is a Node-only guarantee portable?

**Thesis attacked:** The same TypeScript interface proves the same runtime
semantics on Node, browser, Electron and mobile.

1. **State environment-specific limits explicitly** and reuse the existing
   Node-qualified mechanisms in supported Node Hosts.
2. **Qualify a narrow browser or UI adapter** when the first browser consumer
   needs it, especially for snapshot consistency and cleanup.
3. **Add mandatory React hooks, browser polyfills, AsyncLocalStorage-like
   code or a new cross-platform scheduler to GM.** Reject without a
   measured correctness requirement.

**Attack cases:** Observation tracks asynchronous echo context using Node
facilities; timer or I/O crossings may escape it; a React store adapter
returns a newly allocated snapshot every read, causing repeated rendering;
a browser event listener throws, but `dispatchEvent` does not propagate
it to the caller.

**Owner:** The selected Host and frontend adapter qualify their environment;
Observation is revisited only for a demonstrated library-level guarantee,
not to make generic web behavior look like Node.

## I. Package challenge: is 'optional' really optional?

**Thesis attacked:** Two providers in the same test prove users never pay
for the unused library.

1. **Keep Core/Assembly independent and put selected implementations in
   separate consumer entrypoints.** Make package installation and imports
   explicit.
2. **Publish a separate optional adapter package** after a real adapter is
   independently qualified and reused.
3. **Expose every adapter from an always-imported shared barrel or require a
   broad peer dependency.** Reject: makes optionality a documentation claim,
   not a tested property.

**Three different proofs:**
- *Composition:* unselected factory is not constructed. Already tested in
  [PR #213](../../tests/assembly/optional-event-adapters.test.ts).
- *Package:* installed and cold-imported ordinary consumer succeeds with
  the optional third-party package entirely absent. **Not yet tested for
  RxJS/Wonka.**
- *Bundle:* compiled frontend output and loaded code do not pull in the
  unused library. **Not yet measured.**

None of these tests implies or replaces the others.

## J. Quality challenge: does a green test actually prove the contract?

**Thesis attacked:** A passing run guarantees code and design correctness.

1. **Use a real negative control and ordinary CI,** with named test
   assertions, strict TypeScript and a complete exit summary. Report the
   actual HEAD and separately check required identity and review statuses.
2. **Request an external code review for the finished diff** and fix
   confirmed findings without conflating source review with live E2E.
3. **Replace evidence with assertions about what a tool should have done.**
   Reject: prior nested Node tests could exit zero without running
   meaningful child cases.

The existing documented-subscription test is unusual in a useful way:
the old code fails three of five scenarios, the corrected code passes
all five. The original added optional-source test also failed when it
included an unreachable provider, and was corrected without relaxing
Core graph rules. Preserve these rejecting controls when evolving the
documentation.

A clean `npm install`, a typecheck, or a single fake source is not proof
of a real production event adapter. Likewise, the separate owner identity
check remains failing despite a green functional CI in PR #213/#221.
Do not bypass it or call either PR merge-ready.

## Counter-critique: where these choices could be wrong

| Challenge against our preferred direction | Evidence that would change the decision | What not to do in advance |
| --- | --- | --- |
| Every consumer needs the same scoped event notifier | One live consumer with identical code repeated or a rejected lifecycle case across modules, plus design/behavior proof that current mature options do not fit | Invent a framework-wide bus based only on an imagined 1000-module deployment |
| Using a separate library will increase total dependency burden | Installed consumer artifact analysis and comparative bundle measurements with equivalent contracts | Claim no cost from a package manifest alone |
| Sequential construction may block startup | A measured independent acquisition critical path with failure and cleanup trials | Turn construction into a new parallel scheduler by analogy to Effect Layers |
| Deferring all events may fragment the architecture | Repeated, verified source contracts where one narrow optional leaf removes real mistakes | Merge notification, work distribution, durable receipts and state into one API |
| Source + consumer ports may form too many edges | A concrete maintenance pain point with measured graph size and diagnostic clarity | Hide edges in a global registry to make source files shorter |
| Browser support needs stronger event correctness | A real browser failure with a minimal repro and an independently specified browser contract | State cross-platform parity based on successful Node CI |

## Final disposition and delivery boundary

**Approved now (research only):** retain typed declarations, consumer-owned
subscription acquisition, Source/Host lifetime separation, state versus
occurrence distinctions, optional adapter boundaries, executable negative
tests and honest claims of current evidence. Add this short delta to the
existing practice catalog; no accepted architecture contract changes.

**Deferred with owner and trigger:** a shared `createEvent/emit/subscribe`
runtime, a common queue or async work admission helper, parallel Assembly,
browser-specific Observation changes and packaged third-party adapters.
These are valid future *questions*, not missing work to implement now.

**Outside GM:** payment receipts and retry authority, transport, tenant
authorization, route fencing, generation publication, untrusted plugin
execution, UI framework specifics, scaling limits for domain workloads.

**Stop condition:** Do not implement a runtime mechanism from this document.
First identify its owner, a real failing/duplicated consumer need, the
smallest compatible library, and an independent regression. A new proposal
must be rejected if it duplicates an existing Get Modular contract or
crosses the [system boundary](../../docs/architecture/system-boundary.md).
