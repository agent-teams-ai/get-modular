# R1 — Independent architecture research

Date: 2026-10-25. This report was produced independently without reading R2/R3 findings.
All six issues P1–P6 are covered, with exactly three ranked options per issue.
Research is read-only. No implementation or publication is claimed.

## Evidence and scope

- Get Modular: `081ae02b49123e14121e100eccfe99f2e74c3600`.
- payments-sdk: `40e61f82c6f645e6b42116c0499925a5457adb2d`.
- Organization standard: `.github` main observed at `3951acd4206761ca0c1575ef4a99dc70cd997246`.
- Current Get Modular AGENTS requires Bun 1.4.3/default `dev.ts` workflow; the older local checkout has stale pnpm-first guidance.
- I read current AGENTS, System Boundary, Current Contract, the relevant Consumer Module Standard sections, Observation and Resources contracts, previous module-communication research, and current payments architecture and implementation.
- A direct executable probe used the exact Resources `.ts` source from the current checkout. It did not rebuild or modify the repository. Node type stripping is execution evidence, not typechecking.

Primary sources:

1. [GM authority](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/docs/architecture/system-boundary.md#L13-L15), [owned surface and Host authority](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/docs/architecture/system-boundary.md#L33-L70), [no durable/global/compiler IO](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/docs/architecture/system-boundary.md#L92-L93).
2. [CMS resource rules](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/docs/architecture/common-assembly.md#L170-L218), [sequential assembly and opaque capability values](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/docs/architecture/common-assembly.md#L1232-L1247), [ownership transfer](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/docs/architecture/common-assembly.md#L1271-L1288).
3. [Prior communication principles](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/research/module-communication-2026-10/findings.md#L35-L108), [events deferred until real consumer](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/research/module-communication-2026-10/findings.md#L223-L236).
4. [Observation state/events distinction](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/packages/observation/README.md#L282-L284), [state vs commands and actual physical completion](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/packages/observation/README.md#L329-L379).
5. [Resources registration and closing](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/packages/resources/README.md#L55-L106), [actual setup/use implementation](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/packages/resources/src/features/scope/scope.ts#L93-L144).
6. [Current event subscription example](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/docs/guides/module-authoring.md#L897-L972).
7. [payments authority, T1/T2/T3 and separate transport](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/docs/architecture.md), [queue contract](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/docs/queue-transport.md#L1-L63).
8. [payments latest-only projection](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/packages/payments-get-modular/src/features/purchase-observation/composition/purchase-projection.ts), [runtime facets](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/packages/payments-get-modular/src/features/payment-runtime/application/use-cases/create-runtime-facets.ts), [module resource registration](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/packages/payments-get-modular/src/features/payment-runtime/composition/payments.module.ts#L8-L18).
9. [payments operation dispatch, physical task and deadline](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/packages/payments-core/src/features/payment-evidence/application/operations.ts#L39-L76), [runtime context](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/packages/payments-core/src/features/payment-evidence/application/runtime-context.ts#L5-L10), [physical drain](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/packages/payments-core/src/features/payment-evidence/application/lifecycle.ts#L3-L16).
10. [Organization quality standard](https://github.com/agent-teams-ai/.github/blob/3951acd4206761ca0c1575ef4a99dc70cd997246/docs/engineering-quality-standard.md).
11. [WHATWG Streams Standard](https://streams.spec.whatwg.org/) — retrieved current standard last updated 2026-10-19; backpressure, tee, desiredSize, pipeTo sections. [RxJS Subscription](https://rxjs.dev/guide/subscription), [Subscription API](https://rxjs.dev/api/index/class/Subscription) — retrieved official documentation; no dependency version selection is made by this report.

## Main conclusion

The earlier priority “add a generic bounded event runtime to catch up with Effect” is not established by this consumer. Get Modular already composes arbitrary narrow typed capabilities. A module may communicate by direct method call, observe replaceable state, or consume a product-owned event source. Core does not need to know whether that capability uses callbacks, an AsyncIterable, a native stream, RxJS, Effect or a database.

payments-sdk is strong evidence for preserving this split: its read projections use Observation; its financial delivery uses a durable payment-owned protocol; its transport is an explicitly selected infrastructure adapter with an optional pg-boss peer. These are different meanings and should not be unified under a Get Modular bus.

There is one concrete, small, independently reproduced Get Modular issue: its authoring example acquires a subscription outside `resources.setup` and registers the disposer afterward. A reentrant source can close the scope during subscribe; registration then refuses the disposer. This is a documentation/example acquisition defect, not a defect in Resources' documented refusal contract and not an observed payments leak. Fixing the recipe and qualifying it is immediately justified. A new public messaging API is not.

## P1 — Is an occurrence-event/stream facility needed?

### Diagnosis and owner

There is no generic occurrence-event API in Observation, intentionally. This is a capability gap relative to an all-purpose runtime, but not a demonstrated defect in deterministic modularity. Existing accepted guidance already separates commands, state and facts with independent reactors. A subscriber's dependency remains a typed source port in the composition graph. A global bus would weaken exactly this visibility.

The payments projection uses `select` and `refresh` to request replaceable reads. It explicitly treats a fresh aggregate as a refresh request, not a durable revision or lossless event. Its financial evidence cannot be correctly migrated to an ephemeral stream. No inspected consumer path demonstrates an unmet need for several independent ephemeral occurrence reactors.

### Top three options

1. **Preserve typed ports; improve the decision guide and safe interop recipe.** Make command/current-state/replaceable-state/occurrence/critical-delivery choices explicit. Demonstrate safe third-party subscription acquisition and disposal through existing Resources. Zero new production dependency or API. This directly fixes observed authoring risk and preserves the user's option to use rich stream libraries inside an owner. Downside: does not supply a new convenience event package.
2. **Provide a separate optional Get Modular event leaf after a named real consumer qualifies it.** It could have owner-local read-only `EventSource<T>`, explicit emitter authority and Resources-owned subscription, with a single stated loss/error/scheduling policy. Core and Assembly must not import it. A monorepo is acceptable; dependency direction and publication surface, not folder placement, determine responsibility. Risk: even a tiny API commits to buffering, reentrancy and cancellation semantics; don't include a worker pool, scheduler, persistence, Rx operator clone or global registry.
3. **Select an existing stream implementation in a product adapter and publish an optional interop recipe/adapter only for demonstrated repeated use.** RxJS is a useful candidate for rich operator composition; native AsyncIterable/Web Streams fit pull/pipeline cases. GM contracts should expose the smallest semantics the consumer actually needs, not every operator or provider handle. Optional peer/subpath isolation can prevent default dependency cost. Risk: an adapter cannot promise stronger completion, buffer or multicast guarantees than its source; dependency and type costs must be measured before an actual adoption.

**Recommendation:** option 1 now. Option 2 is a future admission candidate, not automatically justified by desire for feature parity. Option 3 is viable when a consumer already wants those operators. A generic adapter for “all streams” is speculative.

**Evidence needed for promotion:** at least one real non-coalescable in-process consumer with multiple independent reactors, its ordering/loss/overflow contract, and executable integration including detach, failure and closure. Library-first means design a proven reusable concern once; it does not mean invent an unproven concern.

## P2 — Buffer bounds, pending publishers and physical in-flight work

### Diagnosis and owner

Backpressure is real even in one process: a producer can outpace an asynchronous handler, each queued closure can retain data, and caller cancellation can leave real IO active. None of this requires microservices. It also does not mean every local event needs a queue.

Observation already implements a bounded latest-only lane, appropriate for replaceable queries. Its README states that an uncooperative run may block later runs indefinitely, rather than claiming a deadline. In payments, `executeOperation` retains physical provider work in `active`, while a deadline can return `outcome_unknown`. The context has no physical admission bound; the active Set preserves debt but does not itself limit it. The wrapper's active-call Set also tracks calls without imposing an admission cap. This is a concrete code-level capacity concern, not evidence of a live overload incident. Its owner is payments/Host ingress, because only that owner knows whether to reject, persist, wait, supersede or retry a financial operation.

### Top three options

1. **Use the existing mechanism's natural demand and explicit owner admission.** Direct awaited commands need no intermediate event queue. Replaceable queries retain Observation's one-active/latest-pending design. Where physical IO can accumulate, the payment owner should bound admission until actual settlement and preserve outcome uncertainty. GM documentation can explain the distinct bounds without implementing payment policy. Lowest additional general mechanism.
2. **Use a native pull stream or AsyncIterable inside a narrow adapter when a finite pipeline is the real need.** Demand can propagate upstream; consume sequentially or with explicitly bounded concurrency. Enforce a real producer policy when `desiredSize` reaches zero; high-water marks are signals, not universal refusal barriers. Multicast and non-pausable event sources still need an explicit policy. This can be dependency-free but is not an automatic generic pub/sub replacement.
3. **Use an existing queue/PubSub/worker facility behind the owner's port for measured buffered workloads.** Effect is a candidate for applications already using its runtime; a focused task/queue library may fit other owners. Bound buffer, waiting producers, active handlers and payload sizes separately where relevant. Default GM installation should not acquire this runtime. A “bounded queue” does not itself bound arbitrary parallel calls to offer/publish or downstream detached promises.

**Recommendation:** option 1; treat any payments physical admission change as its own owner-specific delivery. Do not claim that a GM event queue repairs the mutation admission issue. Option 2 is the strongest low-dependency alternative for one-consumer pipelines; option 3 requires an actual workload and an adapter contract.

**Necessary evidence:** controlled producer faster than consumer; finite retained messages and bytes; concurrent blocked publishers; cancellation before/after acceptance; timeout while physical IO remains pending; shutdown preserving borrowed dependencies. Benchmark counts alone cannot establish these semantics.

## P3 — Cancellation, shutdown, error and acceptance semantics

### Diagnosis and owner

The hard part is ownership and promises: unsubscribing prevents future notifications, but does not necessarily stop work already started; abort is cooperative; a timeout stops waiting; stream completion can mean source exhaustion rather than business completion. A synchronous callback exception policy is also a semantic choice. Notification observers can usually fail independently, while an approval/decision workflow should use an explicit command/result contract instead of pretending every handler is a notification.

Existing Resources and CMS already solve registration, ordered cleanup, retryable failed cleanup and bounded caller waiting without transferring Host authority. Observation already retains its loader drain until actual settlement. payments follows that separation: runtime facets stop admission and wait wrapper calls, then runtime.drain; the projection waits the reader's physical promise even after supersession.

### Top three options

1. **Correct the existing subscription recipe using `resources.setup`, and gate delivery on its signal.** This preserves acquisition custody when the source closes the scope reentrantly or acquisition finishes late. Cleanup calls only the returned unsubscribe/disposer. A synchronous guarded listener can ignore new notifications after abort even if legacy detachment later fails. For asynchronous handlers, keep separately owned drain tracking before dependency release; do not silently promote the synchronous recipe into a managed worker pool.
2. **Use a narrow source adapter to connect an existing library's lifecycle to Resources.** Map subscribe/unsubscribe or reader.cancel/return plus an explicit completion promise when required. A source with async cleanup must use `cleanup` or `Symbol.asyncDispose`; `Symbol.dispose` return values are not awaited. Validate RxJS teardown and native stream cancellation individually. This can be shared only if repeated needs establish one contract.
3. **Use an already selected structured-concurrency runtime behind a module boundary for complex task lifetimes.** An Effect scope/managed runtime can own tasks inside that capability; the module's outer Resources entry owns disposal/drain of that runtime. This avoids cloning an execution engine but adds a real runtime dependency and translation seam. It cannot make an arbitrary non-abortable Promise physically stop. Do not add this to every module.

**Recommendation:** option 1 now, with optional adapter guidance for option 2. Option 3 is an application choice, not a mandatory GM foundation.

### Independently reproduced authoring failure

Current guide line 968:

```ts
resources.use({ [Symbol.dispose]: deps.events.subscribe(pg.forget) }, "events");
```

Current `EventsPort.subscribe` has no non-reentrancy promise. A fake source increments a live subscription counter, starts `scope.control.close()` synchronously, then returns its unsubscribe function. The close is deliberately not awaited inside subscribe. Results executing exact current Resources source:

```text
use:   resources.scope.closed; close.complete = true; liveSubscriptions = 1
setup: resources.scope.closed; close.complete = true; liveSubscriptions = 0
```

This matches the documented `use()` contract: refusal leaves the value with its caller. The authoring recipe fails to take that remaining ownership. `setup()` registers the pending acquisition before calling user code and cleans the returned handle even when the author receives the closed-scope refusal.

A second probe used ordinary delivery, a guarded listener and an unsubscribe that fails once. The first close returned a failed `subscriber/events` debt, notifications after abort were ignored, a second close retried and detached, and the borrowed provider's `close` was never called. This proves relevant existing primitives, not payment behavior.

Reproducer: `/tmp/gm-r1-reentrant-subscription.ts`. Command: `node /tmp/gm-r1-reentrant-subscription.ts`. Exit 0. Its custom resolution hook only maps relative `.js` imports to current `.ts` source under the leaf source directory. No files were changed in Get Modular. The final repository test must use normal strict projects and package build/public entrypoints, not adopt this probe loader.

**Necessary final regression:** run the actual documented factory/source rather than a copied production helper; trigger scope close during subscribe; verify no live subscription and no borrowed provider disposal. Also exercise already-closed scope, ordinary delivery/detachment, failed cleanup debt and no post-abort side effects. Any async-handler test must assert physical settlement before dependencies close.

## P4 — Diagnostics and executable evidence

### Diagnosis and owner

The previous suggestion was too broad if read as “Get Modular lacks observability.” Core already owns bounded structured diagnostics; Observation has named sources/subscriptions/errors and test waits; Resources exposes named debt paths. The missing evidence found here is behavioral qualification of an interoperating subscription recipe. No measured incident justifies a global event tracing platform.

### Top three options

1. **Add a small rejecting behavioral regression for the corrected authoring example.** Bind tests to the extracted/compiled documented example or a shared single authority for it. Keep expected counts/order independently stated. Include the exact old-pattern negative control or show the old source fails. No new production API/dependency. This closes a known blind spot with proportionate cost.
2. **Add owner-provided names/diagnostic callbacks only when an optional event adapter is admitted.** Track source/subscription names, overflow/refusal and active work using bounded records. Emit through the existing Host-owned error/telemetry port. Keep payloads, secrets and giant per-event history out of GM. This is conditional on P1/P2, not a separate manager.
3. **Consider a narrow synchronous assembly factory-start/settle observer after an actual startup diagnostic need.** The prior research already names it as undecided. It could let Hosts time/name hung factories without owning clocks or policy. But errors in observer callbacks, reentrancy and API compatibility need a stated contract and tests; it should not be bundled into this event recipe fix.

**Recommendation:** option 1. Existing mechanisms are useful evidence; don't reset them to “absent” when comparing to Effect. Option 3 requires its own demonstrated problem.

**Evidence needed:** docs extraction/typechecking plus runtime failure-mode test; full applicable repository gates; no inferred correctness from compiled snippets alone. Runtime throughput/load traces only where a real workload changes a choice.

## P5 — Parallel assembly

### Diagnosis and owner

Sequential dependency-order assembly is an explicit current contract, not an accidental performance bug. Many modules can be cheap; module count alone does not establish slow startup. Sequential execution also gives straightforward construction journals and cleanup dependency order. No inspected payments path establishes startup as a bottleneck.

### Top three options

1. **Retain sequential assembly and measure realistic startup before changing it.** Lowest complexity, preserves deterministic side-effect order and accepted ownership. No new mechanism in this delivery.
2. **Parallelize independent setup inside the semantic owner or pre-acquire Host inputs, where that owner can prove independence.** Use existing scopes and explicit completion/cleanup. This is suitable when one cohesive feature has several independent resources. Avoid moving domain workflow into the root or smuggling readiness into construction.
3. **Design an opt-in bounded dependency-ready scheduler as a separate Assembly successor.** Define deterministic admission/order/reporting, sibling failure, cancellation, physical pending factories and cleanup ordering. Qualify diamonds, many-provider order and retained partial construction. Higher implementation/evidence burden and not justified by feature parity alone.

**Recommendation:** option 1 now. Option 2 is the first optimization if measurement identifies local independent IO; option 3 only if a representative consumer materially benefits and local parallelism cannot solve it.

**Necessary evidence:** baseline and candidate cold startup on a consumer; latency contribution by factory; deterministic output and journal properties across failures; actual pending acquisition retention; no adverse dependency cleanup reordering. Do not assume that concurrency implies faster or safer execution.

## P6 — Durable delivery, replay and cross-process transport

### Diagnosis and owner

One process does not remove crash/restart concerns for financial obligations. However, durability is a domain/infrastructure responsibility, not composition. payments already has T1/T2/T3, immutable evidence, durable obligations and ACK only after consumer acceptance. A stream's emission, queue enqueue or broker ACK cannot substitute for that contract. This is correct separation, not a missing GM feature.

### Top three options

1. **Retain existing durable payment protocol and selected infrastructure adapter; clarify it in GM communication guidance as a boundary example.** Zero GM runtime cost. The evidence does not justify rewriting payment delivery as local events or injecting a broker universally.
2. **Select another durable infrastructure implementation behind the payment-owned ports where deployment constraints require it.** payments already has a second SQL transport fixture demonstrating substitution scope. Production replacement must preserve transaction, uncertainty, replay and cleanup guarantees; a port alone is not proof. This changes the infrastructure adapter, not GM.
3. **For a future genuinely cross-process consumer, add an owner-specific relay/outbox/receipt adapter with an existing broker/workflow system.** Keep saved domain obligations authoritative, tolerate duplicates/out-of-order arrival, preserve T3 and no blind retry of unknown external mutation. This has real operational cost and must be triggered by requirements; it is not a general-purpose package to add now.

**Recommendation:** option 1. Reject moving persistence, broker supervision or financial ACKs into a new GM event leaf. A same-process notification API and a durable delivery protocol may coexist precisely because their promises differ.

**Necessary evidence for options 2/3:** lost responses, crashes around commit/send/receipt, redrive, duplicate/out-of-order observations, unknown provider mutations, pool ownership and shutdown; fixture and production qualification must be distinguished. No new evidence is required merely to preserve the already selected design.

## How to explain streams to the user accurately

The user's intuition is mostly right: in one process, delivery can be an ordinary function call and stream composition can be a convenient interface. There is no need to insert serialization, a network protocol, acknowledgements or a broker just to let modules talk. GM wires the source capability to consumers and owns none of those optional transports.

The extra complexity begins only when the contract asks for it: preserve every occurrence, allow slow asynchronous listeners, deliver to several consumers, bound memory, survive cancellation/closure, or survive process death. These are different requirements. A rich operator library helps transform/select/combine streams; it does not automatically establish all of them.

Native WHATWG streams provide useful pipeline backpressure when the source cooperates. `desiredSize` can go negative, and tee's pressure follows both branches such that a fast reader can cause a slow branch to accumulate. Thus simply wrapping a push emitter in ReadableStream does not create a strict memory bound. RxJS Subscription provides teardown composition; its `unsubscribe(): void` is not by itself an awaited business/physical completion protocol. These are fit constraints, not reasons to reject stream libraries outright.

The architecture should let a product choose streams while retaining narrow contracts. If an application already wants RxJS or Effect operators, it can expose an owner-local stream facade or use an outer adapter. Requiring every Get Modular consumer to install that runtime is a separate decision with no evidence here.

## Proposed bounded delivery for root consideration

1. Fix the third-party subscription acquisition recipe, including post-abort callback guarding where the source lacks cancellation.
2. Update the current CMS guidance and module-authoring discussion consistently; preserve accepted ADR bytes.
3. Add normal compiled behavioral qualification linked to the actual recipe and the demonstrated reentrant case; retain failure debt and borrowed ownership assertions.
4. Add concise communication selection/interop guidance using payments as evidence and mark new event/worker APIs as deferred.
5. Do not add a production dependency, new published API, global bus, scheduler, durable queue or parallel assembly in this slice.

This is a meaningful improvement grounded in a reproduced gap. It also answers the user's responsibility concern more faithfully than treating every feature of Effect as a Get Modular requirement.

Confidence: high on responsibility separation, current payment projection/durable split and reproduced subscription acquisition defect; moderate on which future stream library best fits because no occurrence consumer/operational envelope was supplied; no production overload or payment leak is asserted.
