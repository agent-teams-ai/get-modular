# Communication decisions: coverage audit (2026-11-01)

<!-- cspell:words Wonka RxJS PubSub EventTarget AsyncIterable NodeNext -->

## Purpose and authority

This is a **non-normative coverage audit** of the October communication study, the
October 25 responsibility review, and the subsequent owner direction to make
third-party and custom event/stream sources **convenient and optional**. It records
the distinction between accepted contracts, demonstrated behavior, conditional
ideas and work owned by another product. It does not amend accepted ADRs, adopt
a new API, select a stream implementation, or authorize a merge or release.

The source snapshot is Get Modular PR #213 at
[`02c021854a0abc7f26457401cde955be5e1a3cd2`](https://github.com/agent-teams-ai/get-modular/commit/02c021854a0abc7f26457401cde955be5e1a3cd2),
against a `main` that had advanced by five commits. The consumer comparison
uses [Payments at `7052c0e`](https://github.com/agent-teams-ai/payments-sdk/tree/7052c0e25ef4e145d555192806ba9c695d8a5ace).
The October 25 independent research remains pinned to the earlier
[Payments snapshot `40e61f8`](https://github.com/agent-teams-ai/payments-sdk/tree/40e61f82c6f645e6b42116c0499925a5457adb2d);
later changes do **not** automatically requalify that research.

## Decision and evidence register

| Concern | Actual status | Authority and useful evidence | Owner and revisit condition |
| --- | --- | --- | --- |
| Explicit, typed module dependencies; no global topic bus | **Accepted and implemented**: source and subscriber communicate through capabilities and slots; Host chooses providers | [System boundary](../../docs/architecture/system-boundary.md), [Consumer Module Standard](../../docs/architecture/common-assembly.md#module-communication) | Core/Assembly retain visible composition; product owns source meaning |
| Custom or third-party event sources are optional | **Architecturally supported**: a narrow source port can be backed by either the user's implementation or an adapter | [Structural adapter E2E](../../tests/assembly/optional-event-adapters.test.ts) selects a `subscribe/unsubscribe`-shaped source or native `EventTarget`; neither becomes a runtime dependency | Adapter belongs to the consuming composition; qualify a real library only when selected by a real consumer |
| No installation, import or execution of an unused stream library | **Partially shown, not end-to-end qualified**: selected composition omits the other provider; its factory is not constructed. Both source implementations still exist in the test file | The structural E2E does **not** install RxJS, Wonka or Effect, measure bundle size, test tree-shaking or prove that a consumer excludes an unused package from its install | First consumer choosing a concrete optional library must prove a clean package/lock and cold import with that library absent |
| Convenient `map`, `filter` and other sequence operators | **Deferred consumer choice**, not Get Modular API. Operator compatibility is not equivalent to delivery guarantees | [Authoring guide](../../docs/guides/module-authoring.md#in-process-events-and-stream-composition); [library comparison](delivery-review-2026-10-25.md#existing-libraries-and-the-stream-question) | First operator-heavy consumer chooses and qualifies its adapter; do not clone RxJS/Wonka operators in Core |
| Replacing state versus delivering distinct occurrences | **Accepted distinction**: Observation `watch/load` may coalesce state; ordinary source ports can deliver separate live notifications | [Observation](../../packages/observation/README.md#choosing-state-commands-and-asynchronous-work), [consumer guide](../../docs/guides/module-authoring.md#21-module-communication) | Consumer must not represent non-coalescable work as a store update |
| Shared `createEvent/emit/subscribe` API | **Explicitly deferred, NOT shipped or approved as public API**. Earlier research names these as candidates, conditional on a first real consumer; it does not mandate an event runtime now | [ADR-0034 non-goals](../../docs/decisions/0034-admit-the-module-change-observation-package.md#non-goals), [research](findings.md) | Revisit for a named repeated live-occurrence contract; decide publisher/reader facets, fanout, error handling, order, and close before writing it |
| Listener error isolation and completion | **Not a universal external-source guarantee**. An adapter must preserve its chosen library's `next/error/complete` semantics; a simple `subscribe(next)` test proves only its declared live notification contract | [Resources adapter guidance](../../packages/resources/README.md#optional-event-source-adapters); [independent ergonomics critique](raw/delivery-review-2026-10-25/c3-ergonomics.md) | An error-sensitive consumer qualifies throwing listeners, reentrant delivery, source failure and completion; do not claim all providers isolate callbacks |
| Subscriber ownership and safe acquisition | **Implemented and behaviorally qualified** for the documented synchronous source: use `resources.setup` before entering external `subscribe`; subscriber owns unsubscribe, never the source | [Extracted example E2E](../../tests/assembly/consumer-standard-examples.test.ts) tests reentrant close, duplicate occurrences, failed cleanup debt, cancellation and failed acquisition | Reuse existing Resources for each borrowed source; production user code must still own async work launched by callbacks |
| Abort, unsubscribe and physical operation drain | **Intentionally different guarantees**. Unsubscription does not end previously started async IO; abort is a request, not confirmation | [Resources](../../packages/resources/README.md), [ADR-0039](../../docs/decisions/0039-retain-observation-load-drain-until-its-run-settles.md) | Owner of the operation must retain its outstanding work until physical settlement; Host owns shutdown |
| Message buffering, admission, backpressure and retry | **Not a missing Core responsibility**. Queue length, active physical work, waiting publishers and payload sizes are different bounds; notification and work admission may have different owners | [Responsibility review](delivery-review-2026-10-25.md), [communication guide](../../docs/guides/module-authoring.md#in-process-events-and-stream-composition) | Introduce a bounded mechanism only after an actual consumer defines accepted/processed, overflow, cancellation and overload policy |
| Durable event processing and recovery | **Consumer/Host-owned**, not supplied by a local stream. Process restart matters even in one process | [Payments transport](https://github.com/agent-teams-ai/payments-sdk/blob/7052c0e25ef4e145d555192806ba9c695d8a5ace/docs/queue-transport.md) holds payment obligations and receipts separately from optional `pg-boss` wakeups | Payments or another durable owner defines storage, ACK, idempotency, repair, unknown outcome and physical cleanup |
| Static versus dynamic instances | **Scoped static composition exists**, but no live graph rebinding, process control or plugin runtime | [CMS dynamic instances](../../docs/architecture/common-assembly.md#dynamic-instances) | Product Host/Extension Foundation own generations, publication, routing, authorization, isolation and retirement |
| Thousands of modules or concurrent agents | **Not established by this event E2E**. Tests cover typed 500-handle fragments, a 1000-handle type-cost probe, and selected packed compositions, not 1000 simultaneous event workers | [Type-scale tests](../../tests/assembly/type-scale.test.mjs); [type-scale source](../../tests/assembly/type-scale.mjs) | Consumer/Host provides workload, memory and latency measurements before changing Assembly parallelism or adding admission limits |
| Node/browser behavioral parity | **Not qualified** for Observation's async echo/cascade tracking: Node has AsyncLocalStorage; other environments may provide only synchronous checks | [Observation known items](../../packages/observation/README.md#known-items-and-revisit-triggers) | First non-Node UI/desktop/mobile consumer must qualify the same public contract and document environmental limits before a parity claim |
| Read-only capability versus security isolation | **Types and narrow facades, not a sandbox**. A module must not receive publisher/Host closure rights unless authorized | [Observation mechanism and trust](../../packages/observation/README.md#mechanism-and-trust), [system boundary](../../docs/architecture/system-boundary.md) | Trusted module owner provides actual read-only facade; untrusted extensions require Host-enforced isolation |
| Parallel Assembly | **Deliberately deferred**, not an unhandled bug | [CMS](../../docs/architecture/common-assembly.md), [October review](delivery-review-2026-10-25.md) | Only measured startup critical-path costs justify an explicitly bounded parallel-construction successor |

## Consumer-local findings that are not Get Modular tasks

- The latest Payments source still has a startup `catch` where a rejected
  `transport.stop(30_000)` may replace the original startup error.
  See [Payment jobs `jobs.ts`](https://github.com/agent-teams-ai/payments-sdk/blob/7052c0e25ef4e145d555192806ba9c695d8a5ace/packages/payments-postgres/src/features/payment-custody/adapters/jobs.ts).
  This is source reasoning, **not an executed production defect**. A focused
  Payments-owned regression should establish expected aggregate-error handling
  before its owner changes the implementation.
- Payments retains physical in-flight operation tracking but does not claim an
  unlimited number of accepted requests is safe. New capacity policy belongs
  at that operation's admission boundary when measurements demand it.
- Payments' own Get Modular adoption profile intentionally pins the earlier
  CMS and authoring guide. A newly published guide or this feature PR must
  **not** silently migrate that consumer's verified standard pin.

## Shipping evidence and unresolved GitHub integration

- PR #213's [complete CI run #41331228840](https://github.com/agent-teams-ai/get-modular/actions/runs/41331228840)
  passed **64/64 jobs** on exact source `02c02185` before this audit note.
  This result is bound to that SHA, **not** to a later commit containing this
  note. The optional adapters are structural test fixtures, not qualification
  of a third-party package, web runtime, performance envelope or payments E2E.
- PR #221's [CI run #41329845487](https://github.com/agent-teams-ai/get-modular/actions/runs/41329845487)
  also passed **64/64 jobs**. Its separate required
  `commit-author-identity` status still failed. The base
  `pull_request_target` caller pins an earlier canonical-name-only workflow,
  while central policy now accepts the exact alias `Илия`.
  Neither PR is merge-ready on the required identity status; do not bypass it
  or mistake green functional CI for an identity attestation.
- At this audit snapshot PR #213 was **five commits behind `main`**. Before
  considering merge, review the base delta, preserve the retained CMS source
  evidence and rerun required checks on the final integrated SHA. Do not
  force-push solely to make the branch appear current.

## Revisit checklist for the first real optional stream integration

The consumer should first document: (1) cold vs hot source and per-subscription
side effects; (2) one recipient versus multicast; (3) duplicate occurrences and
ordering; (4) source errors, listener errors and completion; (5) source and
subscriber ownership, synchronous emissions during subscription and late
unsubscription; (6) actual cancellation of physical async operations; and
(7) bounded overflow behavior only if this consumer has an admitted workload.

Then verify the selected **real** library in a disposable consumer with
package installation absent/present, runtime import, actual operators and
scope-close behavior. Only extract a separate optional adapter package after
such a consumer proves an independently reusable contract. Core and Assembly
must keep no required event dependency.

The audit distinguishes a **request worth remembering** from a **public
guarantee proved and shipped**. Neither the earlier proposed queue/runtime nor
an unselected stream library becomes part of Get Modular merely because it was
discussed.
