# C3 — Independent critique: ergonomics, ecosystem and evidence

Date: 2026-10-25. Critic: `/root/critic_ergonomics`.
Reviewed R1, R2 and R3 independently of the other critics. Read-only review of Get Modular at `081ae02b49123e14121e100eccfe99f2e74c3600` and the cited payments-sdk consumer at `40e61f82c6f645e6b42116c0499925a5457adb2d`. I read the current repository instructions and organization quality standard. I independently retrieved the primary library sources listed below. This report does not claim new runtime, consumer E2E or bundle measurements.

## Verdict

**Accept the narrow implementation direction with conditions.** Correct the subscription acquisition example through existing Resources, qualify its behavior, and improve communication guidance. Do not introduce a mandatory stream library, event bus, task scheduler, persistence layer or parallel Assembly in this PR.

This is not an argument that events are outside modularity forever. A reusable subscription mechanism can be a legitimate optional leaf, as Resources and Observation already demonstrate. The inspected customer has not established its missing contract: its latest-state projection and durable payment protocol already have different suitable owners. A new general event package now would require choosing delivery semantics the customer does not ask it to supply.

The research must still answer the user's stream ergonomics question. A result consisting only of a lifecycle bug fix, without a practical explanation of how to consume live occurrences and which existing libraries fit, would under-deliver. The present guidance jumps from observed state to every-occurrence Host/domain delivery with acknowledgements and durability. **An in-process live occurrence stream does not intrinsically require either acknowledgements or persistence.** Add that middle case explicitly.

## Conditions and corrections to the research

1. **Do not equate non-coalescing with durable.** Two identical live events can be delivered twice to active subscribers without retaining history, surviving a crash or proving business completion. Write those guarantees separately. Reserve durable delivery for an obligation that must survive the chosen failure boundary.
2. **Do not call a structural callback port a qualified adapter for every stream library.** It demonstrates the Resources boundary. It does not by itself qualify RxJS/Wonka error behavior, cold-source duplication, scheduling, retained buffers or cancellation. One concrete library integration should be labelled as selected/tested only if its exact artifact is actually exercised.
3. **State the acquisition precondition.** `resources.setup` retains cleanup for a handle that the source returns. If `subscribe` attaches a listener and then throws before returning that handle, the provider must undo its partial acquisition itself. No generic cleanup wrapper can recover a handle it never received. The narrow example should make synchronous callback and subscribe failure behavior clear.
4. **Make the sync-only callback contract honest.** TypeScript's `() => void` allows a function that returns a Promise; the return is ignored. If the recipe promises synchronous listeners, `() => undefined` plus an ordinary wrapper returning `undefined` is a useful static guard. Otherwise explain the restriction and enforce it with the owning checks. Do not claim a signal guard drains async work.
5. **A stop signal and physical teardown are different.** A signal guard can suppress later callback side effects while unsubscription is pending or has failed. It cannot prove physical detachment or stop previously launched IO. Report failed cleanup as debt and preserve the source's error/retry contract. Do not hide those facts behind a green `close` report in the example.
6. **No measured size claim is available.** Wonka's and Effect's inspected manifests have no runtime dependency entries, but each ships code and imposes integration choices. Tree shaking depends on actual imports and bundler behavior. Do not report minified, compressed, memory or startup scores without an experiment that would change the choice.
7. **Do not turn library-first into either extreme.** The organization standard supports designing a proven recurring concern once, with at least one real consumer validating it. It does not require two already migrated production consumers before any 0.x improvement; nor does it justify inventing an event runtime because multiple projects might someday need messages. A concrete repeated integration contract is the trigger.
8. **Keep normative guidance consistent.** The CMS distinguishes acquisition from handing over an already-held disposable. Its rule 5's disposer example needs that same distinction if it is clarified. Preserve accepted ADR bytes and follow the current CMS pin review procedure for any actual CMS edit. A guidance correction is not permission to silently repin unrelated consumer contracts.

## P1 — Live occurrence events and stream ergonomics

**Assessment:** No current-core defect is demonstrated by the absence of an event engine. The concrete defect is in the subscription acquisition example. However, the user's operator-composition preference is legitimate: typed ports can carry streams without GM implementing their operators.

**Owner:** The capability owner defines what an occurrence means; the source implementation owns delivery behavior; the subscriber owns its subscription; the composition graph binds the source explicitly. A global mutable topic registry would hide this dependency.

### Top three alternatives, re-ranked

1. **Accept now: qualify a live typed-source recipe and improve the mechanism table.** Distinguish direct command/query, replaceable state, live occurrence notification and durable obligation. Use subscriber-owned Resources with the provider's narrow read facet. State no replay and no crash-survival guarantee for the simple live source. This is small, useful and has no production dependency cost. Validation must show two equal occurrences, one subscriber closing while a sibling continues, no producer authority exposed to consumers, and the actual documented acquisition race rejected.
2. **Accept as an optional application choice: reuse a selected stream library behind the appropriate contract.** Wonka is a credible lightweight candidate when push/pull composition and map/filter are enough. RxJS is appropriate when rich operator and error-channel composition is used. Native AsyncIterable fits an actual pull sequence. Keep Resources integration at composition. Do not force every caller through a new GM wrapper merely to hide a familiar library type if that adds no semantic boundary; conversely, do not leak a mutable Subject into a read-only consumer port. Validate the chosen version's teardown, sync emissions, errors and hot/cold behavior before claiming an integration.
3. **Defer: a minimal optional events leaf designed once for a demonstrated shared need.** This can be in the monorepo without being imported by Core/Assembly. A concrete consumer must determine whether it needs multicast, work distribution, replay or optional notifications. Its useful contribution would be common subscription/error/lifetime semantics, not a clone of Rx operators. Reject creating it solely for Effect feature parity; reconsider when repeated source adapters or a named multi-reactor occurrence workload establish its contract.

**Critique of R1/R3:** A future event leaf is not automatically a stronger second choice than reusing a stream implementation already selected by the application. The user's main ergonomic request can often be met by that existing implementation immediately.

## P2 — Buffering, backpressure and concurrency

**Assessment:** The problem is conditional on asynchronous work and producer behavior. Synchronous notification naturally keeps the publisher on the call stack until callbacks return; it needs no pending-message queue. Async handlers may continue after callback return. This distinction should lead the explanation before discussing elaborate admission machinery.

**Owner:** Admission belongs to the operation/Host that can choose reject, wait, persist or replace. A selected source/queue owns its buffer. GM compilation owns neither.

### Top three alternatives, re-ranked

1. **Accept now: do not insert a queue into the demonstrated interaction.** Await commands when a caller needs completion, retain Observation's latest-only behavior for replaceable reads, and keep plain notification handlers bounded and synchronous. The known payment active Sets establish retention for drain, not a total-capacity promise; no measured overload incident was shown. A future physical-call cap belongs with payment admission, not a generic GM channel. Validate the actual promised behavior rather than inventing arbitrary throughput targets.
2. **Accept conditionally: reuse an existing demand/buffer mechanism with explicit owner limits.** Native pull works when the upstream really honors demand; an existing queue or Effect Queue/PubSub is appropriate for a concrete buffered workload. State queued items, active work and waiting producers separately; a payload size limit may also be needed. RxJS merge concurrency alone is insufficient because excess source values enter an array. Validate a held consumer with a finite input burst, cancellation before and after acceptance, overflow outcomes and physical work completion.
3. **Defer: a custom finite admission primitive for an uncovered shared guarantee.** If all existing options fail a named requirement, a small `tryOffer`/refusal mechanism may be clearer than suspended publishers with unbounded retained payloads. This is a separately admitted async-delivery concern, not a required part of module composition. Reject an own queue solely because an external adapter needs configuration.

**Critique of R2:** An AsyncIterable alternative must not be advertised as bounded merely because it is consumed with `for await`. A push-to-iterator bridge can keep buffering while the consumer awaits. The producer contract matters.

## P3 — Cancellation, shutdown and delivery semantics

**Assessment:** The reproduced `use(subscribe())` issue is a valid reason to change the example now. It is not a Resources implementation bug: that API intentionally leaves an already-held value with its caller when registration is refused. Existing `setup` provides the necessary acquisition custody.

**Owner:** Resources owns cooperative registered cleanup; the selected adapter owns subscription teardown; the operation owns its physical completion; the Host owns when and how long to wait. Accepted, callback-invoked, processed and durably acknowledged remain separate facts.

### Top three alternatives, re-ranked

1. **Accept now: correct acquisition through `resources.setup`, guard sync callbacks with the scope signal, and qualify the actual recipe.** Include ordinary delivery, close before acquisition, close during subscribe, failed unsubscribe/debt/retry, and borrowed-source survival. Clarify that provider-side partial-acquisition rollback is required if subscribe throws. This changes no public runtime API and directly repairs the demonstrated documentation defect.
2. **Accept only for a selected repeated integration: a narrow adapter for one stream protocol.** For a subscription returning a synchronous disposer, register that precise teardown. If teardown returns a promise, await it in `cleanup`; do not hide it under `Symbol.dispose`, whose result Resources does not await. A richer adapter may expose an owned completion promise where the consumer needs physical drain. Avoid a universal adapter over incompatible Observable/AsyncIterable/Web Stream meanings.
3. **Defer to the application: structured-concurrency runtime for genuinely complex internal workflows.** A Host that already uses Effect can own an Effect runtime/scope behind a module capability and close it through its existing outer custody. This is an option, not a concession that GM is missing a fiber runtime. Foreign promises can still require explicit physical completion. No automatic retry or cancellation guarantee follows from a runtime name.

**Critique of the candidate:** A signal check addresses post-abort callback effects, but it must not be described as immediate unsubscription. Failure to detach can still retain the callback closure and its captured objects; the debt is meaningful even when further domain effects are suppressed.

## P4 — Diagnostics and executable evidence

**Assessment:** The research correctly reclassifies this from a broad missing subsystem to an evidence gap in a concrete authoring recipe. The existing guide compilation check cannot detect the acquisition leak, because both forms typecheck.

**Owner:** The guide owns the example; the package owns its documented cleanup contract; the Host owns telemetry and health policy.

### Top three alternatives, re-ranked

1. **Accept now: behavioral qualification bound to the documented example.** Extract/compile the actual example using the existing test approach, then execute its public module boundary or a directly shared single source for the recipe. Independent expected counts/order should fail for the old `use(subscribe())` pattern. Keep new maintained tests in strict TypeScript and the normal required route. A passing mock scenario is recipe evidence, not actual payments E2E or every-library compatibility.
2. **Defer until an event contract is selected: an adapter conformance suite.** An explicit port can have a reusable set of checks for subscription ownership, occurrences, cancellation, errors and the chosen overflow behavior. This is valuable only if several implementations promise that same behavior. Do not create a single universal event-conformance definition that calls unlike loss/error policies interchangeable.
3. **Defer until a concrete operational question exists: additional mechanism diagnostics.** Optional per-source names, counts and refusal reports may help once a real source/queue is admitted. A global trace collector, event history or mandatory telemetry SDK would add cost without evidence in this task. Existing Resources debt/error channels are sufficient for the selected repair.

**Critique of R1/R3:** Factory timing/start/settle callbacks are not part of the event qualification gap. Keep that proposal out of this PR. Name it only as a separately triggered idea, not an implicit accepted improvement.

## P5 — Parallel Assembly

**Assessment:** All three researchers correctly reject the unsupported inference that many modules require concurrent construction. The current sequential contract provides deliberate ordering and failure behavior; no customer measurement identifies it as a bottleneck.

**Owner:** Assembly owns graph construction; a cohesive adapter or Host owns its independent prerequisite work.

### Top three alternatives, re-ranked

1. **Accept now: keep sequential Assembly.** If startup becomes an issue, first measure each actual factory and the critical path. This PR needs no additional scheduler or benchmark suite because it changes no startup behavior.
2. **Accept for an observed local bottleneck: parallelize independent acquisitions at their existing owner.** Keep every started setup under Resources and await their actual settlement on failure. Do not move business workflow into the root or treat `Promise.all` early rejection as sibling cancellation.
3. **Defer: a separately designed bounded DAG scheduler.** Only measured benefit that local acquisition cannot deliver should justify changing Assembly's public construction contract. It requires explicit journal, failure, cancellation and custody semantics and a successor decision. It should not ride into a stream PR.

## P6 — Durability and cross-process messaging

**Assessment:** One process removes the need for a network protocol between ordinary modules, not the possibility of a crash. The inspected payments consumer already separates durable obligations from infrastructure wake-ups. That is a positive example, not an unmet generic-stream requirement.

**Owner:** Domain/application delivery semantics and storage/transport adapters. GM composes the selected ports.

### Top three alternatives, re-ranked

1. **Accept now: preserve payment-owned durable delivery and its optional existing transport.** Explain that live UI/domain notifications can coexist with it, and that stream delivery is not a consumer financial receipt. Do not put persistence or payment ACKs into GM.
2. **Accept only for a deployment requirement: another implementation of the existing transport contract.** Use an established database queue/transport that preserves the needed transaction and recovery semantics. The alternate fixture shows a substitution seam, not an independently production-qualified replacement. Run real storage qualification for any actual replacement.
3. **Defer: a separate reusable durable-delivery library or relay.** A common contract across real owners can justify extraction, with one owner and optional dependency graph. Similar method names or a monorepo directory do not establish shared acknowledgement semantics. A broker relay must preserve domain obligations; it cannot claim database/broker atomicity by simply issuing two writes.

## Library facts independently verified

These are source observations, not dependency selections or footprint benchmarks.

| Candidate | Verified fact | Fit implication |
| --- | --- | --- |
| Wonka 6.3.6 at `9c28bb0` | Manifest has no runtime dependencies and `sideEffects:false`; subject delegates to a hot shared source; `subscribe` invokes the callback synchronously and returns an unsubscribe object; protocol has Start/Push/End, no dedicated error signal | Credible small compositional library, but not an automatic bounded async worker or an error-isolated event engine |
| RxJS 7.8.2 at `e5351d0` | Manifest identifies 7.8.2 and tree-shaking metadata; `mergeInternals` keeps an excess-value array separate from active subscription count | Rich operators are useful; concurrency limits must not be sold as a complete memory bound; do not mix a v7 recipe with v9 master APIs |
| mitt at `6b41670` | `emit` synchronously iterates a snapshot of handlers without exception isolation around each callback | Convenient emitter semantics, but a throwing callback can interrupt the remaining dispatch; not a universal drop-in replacement for a source promising independent listener failures |
| Effect 4.0.6 at `16fe800` | Manifest has no runtime dependencies; `Queue.waitToOffer` stores pending offer entries in a separate Set | Full runtime with strong compositional facilities; bounded message capacity does not independently cap every waiting publisher |
| Native Node events | `events.on` defaults its high watermark to `Number.MAX_SAFE_INTEGER`; pause/resume requires an emitter implementing those methods | Async iteration over a push source is not by itself a useful admission bound |
| Native Web Streams | The standard defines cooperative queue/backpressure behavior and tee branches | Useful IO/pull pipeline contract, not a ready generic bounded multicast bus |

## Primary source links

- [Get Modular acquisition example](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/docs/guides/module-authoring.md#L897-L972), [mechanism table](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/docs/guides/module-authoring.md#L1753-L1770), [CMS](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/docs/architecture/common-assembly.md#L170-L218), [Resources setup/use](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/packages/resources/src/features/scope/scope.ts#L93-L144).
- [Payment projection](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/packages/payments-get-modular/src/features/purchase-observation/composition/purchase-projection.ts), [payment transport contract](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/docs/queue-transport.md).
- [Wonka manifest](https://github.com/0no-co/wonka/blob/9c28bb0ff8ac51bfceb774d5adde01c16c35ebd6/package.json), [subject](https://github.com/0no-co/wonka/blob/9c28bb0ff8ac51bfceb774d5adde01c16c35ebd6/src/sources.ts#L258-L292), [subscribe](https://github.com/0no-co/wonka/blob/9c28bb0ff8ac51bfceb774d5adde01c16c35ebd6/src/sinks.ts#L24-L48), [signal protocol](https://github.com/0no-co/wonka/blob/9c28bb0ff8ac51bfceb774d5adde01c16c35ebd6/src/types.d.ts#L1-L115).
- [RxJS 7.8.2 manifest](https://github.com/ReactiveX/rxjs/blob/e5351d02e225e275ac0e497c7b66eaa5f0c88791/package.json), [excess-value queue](https://github.com/ReactiveX/rxjs/blob/e5351d02e225e275ac0e497c7b66eaa5f0c88791/src/internal/operators/mergeInternals.ts#L31-L53).
- [mitt dispatch](https://github.com/developit/mitt/blob/6b41670516ed8e8b738612f60491995470aa63b3/src/index.ts#L93-L121).
- [Effect manifest](https://github.com/Effect-TS/effect/blob/16fe80030612e3d549ab5aa63a36e2125fdfea6e/packages/effect/package.json), [pending offers](https://github.com/Effect-TS/effect/blob/16fe80030612e3d549ab5aa63a36e2125fdfea6e/packages/effect/src/Queue.ts#L2065-L2080).
- [TypeScript function return assignability](https://www.typescriptlang.org/docs/handbook/2/functions.html#return-type-void), [Node events.on](https://nodejs.org/api/events.html#eventsonemitter-eventname-options), [WHATWG Streams](https://streams.spec.whatwg.org/).
- [Organization engineering standard](https://github.com/agent-teams-ai/.github/blob/3951acd4206761ca0c1575ef4a99dc70cd997246/docs/engineering-quality-standard.md).

## Acceptance boundary for the proposed PR

The narrow PR is useful when the real documented sample no longer loses subscription custody on reentrant close; new events cause no callback effects after the receiver's scope aborts; cleanup failure is reported honestly; a sibling or borrowed provider survives; guide selection includes live occurrences and practical optional stream reuse; required source, type and repository gates run without weakening scope; and the report explicitly declines to claim universal stream compatibility, financial qualification or measured footprint.

A new public adapter is not required to satisfy this acceptance boundary. If later source review reveals repeated identical integration needs, prefer one optional reusable implementation to several consumer-local copies. That is the point at which library-first should change the decision.
