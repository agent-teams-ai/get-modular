# Module communication responsibility review, 2026-10-25

<!-- cspell:words Wonka PubSub RxJS EventEmitter concatMap pg-boss -->

## Outcome and scope

Keep Get Modular focused on explicit composition and its already admitted leaf
mechanisms. The inspected consumer does not justify a new mandatory message
runtime, queue, scheduler or persistent transport. The selected PR corrects a
reproduced subscription-acquisition defect in the authoring example and improves
communication guidance and its executable evidence. It changes no production
API or runtime dependency. This research does not admit a new package or amend
an accepted ADR.

The earlier comparison with Effect overstated the priority of adding queues.
Effect's larger execution toolkit is useful, but absence of that toolkit is not
by itself a defect in a module-composition library. An optional event mechanism
remains a valid future choice when a named real consumer demonstrates its
contract. A separate package can control dependency cost; it does not by itself
establish the right semantic owner.

## Evidence and independent review

The review observes Get Modular at
[`081ae02b49123e14121e100eccfe99f2e74c3600`](https://github.com/agent-teams-ai/get-modular/tree/081ae02b49123e14121e100eccfe99f2e74c3600)
and payments-sdk at
[`40e61f82c6f645e6b42116c0499925a5457adb2d`](https://github.com/agent-teams-ai/payments-sdk/tree/40e61f82c6f645e6b42116c0499925a5457adb2d).
These replace the older snapshots in the preceding comparison. Popularity,
stars and release maturity were excluded from the technical assessment.

Three researchers independently assessed **every** P1-P6 issue, each proposing
three alternatives per issue. Three subsequent critics independently reviewed
all six issues and ranked three alternatives for each. The reports are retained
as research evidence, not as competing standards:

| Role | Perspective | Full report |
| --- | --- | --- |
| R1 | Architecture, accepted responsibility and resource custody | [Architecture research](raw/delivery-review-2026-10-25/r1-architecture.md) |
| R2 | Real payments consumer and failure boundaries | [Consumer research](raw/delivery-review-2026-10-25/r2-consumer.md) |
| R3 | Existing stream libraries and framework experience | [Ecosystem research](raw/delivery-review-2026-10-25/r3-ecosystem.md) |
| C1 | Necessity, scope and canonical guidance | [Scope critique](raw/delivery-review-2026-10-25/c1-scope.md) |
| C2 | Reentrancy, cancellation and physical cleanup | [Correctness critique](raw/delivery-review-2026-10-25/c2-correctness.md) |
| C3 | Stream ergonomics, dependency claims and evidence | [Ergonomics critique](raw/delivery-review-2026-10-25/c3-ergonomics.md) |

All three critics support the narrow example correction and oppose introducing
a general event runtime from the available evidence. Their conditions are part
of the selected delivery: pre-acquisition cancellation checks, explicit
synchronous listeners, provider rollback on failed acquisition, honest cleanup
debt, a separate live-occurrence choice and tests of the actual documentation.
The implementation receives a separate review after these design critiques.

## Three alternatives for each issue

This is the integrated ranking. The individual reports preserve each
researcher's and critic's reasoning, different rankings and qualifications.

| Issue | First choice now | Second alternative | Third alternative |
| --- | --- | --- | --- |
| P1: occurrence events and streams | Keep typed ports; fix the external-source recipe and distinguish live events from state | Select an existing stream library inside a consumer when operators are needed | Admit an optional event leaf after a real repeated occurrence contract is demonstrated |
| P2: buffering and overload | Avoid unnecessary buffering; keep admission with the actual work owner | Use a genuinely pull-aware source or an existing bounded queue behind that owner's port | Extract a shared admission mechanism only for a demonstrated uncovered contract |
| P3: cancellation and shutdown | Use existing Resources custody correctly; keep physical work completion explicit | Qualify a narrow adapter for one selected stream implementation | Reuse an already selected structured-concurrency runtime within an owned boundary |
| P4: diagnostics and evidence | Execute the actual corrected example with rejecting lifetime cases | Add optional local diagnostics for an identified problem in an admitted mechanism | Keep existing runtime diagnostics and record unresolved needs without a telemetry framework |
| P5: parallel Assembly | Preserve sequential construction until real startup measurements justify change | Parallelize independent acquisition inside its existing owner | Propose a bounded Assembly successor with explicit failure and journal semantics |
| P6: durable delivery | Preserve the payment-owned protocol and selected infrastructure adapter | Select another qualified persistence or workflow adapter behind its own contract | Extract separate delivery infrastructure only when several consumers share the same semantics |

The shared rules remain the [Consumer Module Standard](../../docs/architecture/common-assembly.md#consumer-module-standard)
and [module authoring guide](../../docs/guides/module-authoring.md#21-module-communication).
This table is a task decision, not a new public API promise.

## What the customer demonstrates

Payments already has three different mechanisms with different meanings:

1. [Typed capability facets](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/packages/payments-get-modular/src/features/payment-runtime/application/use-cases/create-runtime-facets.ts)
   expose ordinary commands and queries. The module closes its own runtime and
   awaits admitted work; borrowed capabilities do not transfer disposal authority.
2. [Purchase observation](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/packages/payments-get-modular/src/features/purchase-observation/composition/purchase-projection.ts)
   converges to the newest selected view. It deliberately coalesces replaceable
   refresh requests and waits for a read's actual settlement even when it cannot be cancelled.
3. [Durable delivery and its optional queue adapter](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/docs/queue-transport.md)
   keep payment obligations and consumer receipts authoritative. The queue
   supplies wake-ups. Core does not import the queue, and pg-boss is selected
   explicitly through an optional adapter.

These are counterexamples to replacing all communication with one GM stream.
A process can crash even when all modules run together, so some business work
still needs durable storage. Ordinary live notifications need neither that
storage nor a network protocol.

The audit also found two consumer-local follow-ups: physical provider work is
tracked without a universal admission cap, and a failed transport stop during
startup cleanup can mask the original startup error. Neither is claimed as an
observed production incident or repaired by this PR. The latter needs a focused
payments regression before an owner-local fix. Both remain outside the
subscription-example correction; the [consumer report](raw/delivery-review-2026-10-25/r2-consumer.md)
records exact sources and validation suggestions.

## The concrete defect selected for correction

The former example evaluated `subscribe(...)` before handing its disposer to
`resources.use`. A source could synchronously start scope closure before
returning. `use` then correctly refused registration and left the resource with
the caller, but the example did not release it.

The root and independent critics reproduced the case against the observed
Resources source/public build:

| Recipe | Registration outcome | Close report | Remaining subscriptions |
| --- | --- | --- | --- |
| Acquire inline, then call `use` | `resources.scope.closed` | `complete: true` | 1 |
| Acquire inside `setup` | `resources.scope.closed` | `complete: true` | 0 |

This is a defect in the example, not in the documented refusal semantics of
Resources. `complete: true` describes registered cleanups; it cannot attest to
unknown resources. The corrected recipe reserves acquisition custody before
calling the source and preserves its returned disposer even after reentrant
closure. It checks cancellation before acquisition and before a new synchronous
listener effect.

The source must undo any attachment if acquisition throws before returning a
disposer. A guard is not physical unsubscribe; failed cleanup remains debt.
Unsubscribe is not completion of already started asynchronous work. The
example owns only its subscription, never the shared provider. Its listener
returns `undefined` so an ordinary `async` callback is a type error; this does
not prevent deliberately detached work.

## Existing libraries and the stream question

No dependency was selected or added. These exact source observations support
the guide's consumer choices; they are not bundle measurements or qualification
of a Get Modular adapter:

| Source examined | Useful capability | Limit relevant to this decision |
| --- | --- | --- |
| [Wonka 6.3.6](https://github.com/0no-co/wonka/blob/9c28bb0ff8ac51bfceb774d5adde01c16c35ebd6/package.json) | Push/pull composition with map/filter and no declared runtime dependencies | Hot subjects push synchronously; the protocol has no independent error channel |
| [RxJS 7.8.2](https://github.com/ReactiveX/rxjs/blob/e5351d02e225e275ac0e497c7b66eaa5f0c88791/src/internal/operators/concatMap.ts#L24-L40) | Rich sequence transformations and subscription teardown | Sequential inner subscriptions can retain an unbounded waiting buffer |
| [Effect 4.0.6](https://github.com/Effect-TS/effect/blob/16fe80030612e3d549ab5aa63a36e2125fdfea6e/packages/effect/package.json) | Queue, PubSub, Stream and scoped execution | Queue capacity does not separately bound pending producers or foreign physical work |
| [Native Web Streams](https://streams.spec.whatwg.org/) | Demand-aware pipelines | A producer must respect demand; `tee` does not provide a hard bound for a slow branch |
| [Node events](https://nodejs.org/api/events.html#eventsonemitter-eventname-options) | Familiar listeners and async iteration | Listener return values are ignored; watermarks need a source with pause/resume |

RxJS master at the reviewed snapshot describes 9.0.0-beta.0 and a different API;
the 7.8.2 example is deliberately pinned instead of described as an unversioned
latest recommendation. The [ecosystem report](raw/delivery-review-2026-10-25/r3-ecosystem.md)
contains the manifests and implementation links, including mitt, VS Code's
typed disposable events and Nest's optional event module. Those frameworks
provide useful experience, but their discovery/global registration patterns do
not justify hidden dependencies in GM.

An awaited call bounds one sequential caller, not every concurrent caller in a
Host. Likewise, a queue's item count is not a total memory bound: active work,
waiting producers and retained payload sizes can matter independently. These
are requirements for a selected asynchronous delivery mechanism, not reasons
to install one in every modular application.

## Delivery and remaining triggers

The PR updates the current guide, Resources README and the narrow CMS resource
rule without editing accepted ADR bytes. The CMS source identity and current
consumer pins must follow the repository's retained-delta process; historical
evidence and pending adoption/qualification do not become new passing results.
The regression executes the extracted documentation example through actual
public packages, with strict TypeScript checking and normal verification routes.
The PR description records the exact delivered head, executed checks, review
fixes and any outstanding gate limitations.

The [example harness](../../tests/assembly/consumer-standard-examples.test.ts)
keeps all eight existing example projects and adds five runtime scenarios to the
extracted resources project. The exact old guide fails three of those scenarios;
the corrected guide passes all five. The [rejecting control](raw/delivery-review-2026-10-25/regression-before.json)
and [corrected run](raw/delivery-review-2026-10-25/regression-after.json) retain the
observations. An initial nested Node test invocation inherited the parent's test
context and skipped its child file with exit zero. The harness now removes that
context and requires every named scenario and a complete result with no skipped
tests. The initial exit-only observation is not passing behavioral evidence.
This qualifies the documented synchronous source boundary, not an RxJS/Wonka
adapter, the payments deployment or a cross-platform performance envelope.

A reusable optional event or adapter package should be reconsidered when a real
consumer needs distinct live events for independent subscribers and the same
delivery/lifetime contract recurs. That delivery should include the consumer,
its error/ordering/overload behavior and independent tests. Parallel Assembly
needs measured startup evidence; durable messaging needs its own domain and
infrastructure requirements. None is a prerequisite for correcting this leak.
