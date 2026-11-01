# C2 — Independent runtime correctness critique

Date: 2026-10-25. Critic: `/root/critic_correctness`.

I reviewed R1, R2 and R3, independently executed the retained R1 probe and wrote an additional probe against the built public Resources entrypoint. I did not read another critic's report. No repository source was changed. The conclusions below separate reproduced failures, source-level reasoning and conditional future requirements.

Sources: Get Modular `081ae02b49123e14121e100eccfe99f2e74c3600`; payments-sdk `40e61f82c6f645e6b42116c0499925a5457adb2d`. Current repository instructions, the supplied organization Engineering Quality Standard, Resources implementation/README, CMS resource rules, module-authoring examples and the three independent research reports were reviewed. Ecosystem version comparisons below rely on the primary-source observations retained by R3, not on a new bundle benchmark.

## Verdict

**Approve a narrow authoring correction and executable regression. Do not approve a new general event, queue, worker or durability runtime from the current evidence.** The documented acquisition race is real; Resources itself behaves according to its existing ownership contract. A small fix can preserve the useful guarantees without adding another public API or production dependency.

I do not approve describing the resulting recipe as a universal safe stream adapter. Its guarantee must remain: custody of a returned subscription handle, suppression of new synchronous callback effects after cancellation, and cleanup through the owning scope. It cannot repair a source that loses its own handle, force a foreign Promise to stop, or supply business acknowledgement, error isolation or bounded asynchronous execution.

## Reproduced evidence

### A. The current guide leaks a returned handle on reentrant close

The guide invokes `subscribe(...)` before `resources.use(...)` can register its return value. A legal synchronous source can initiate scope close during subscribe. The later `use` throws and explicitly leaves ownership with its caller; the example does not take that remaining ownership. The resources implementation registers a pending setup before calling user acquisition code, which closes this gap when acquisition happens inside `setup`.

I reran `node /tmp/gm-r1-reentrant-subscription.ts`, exit 0:

- Current `use` recipe: `resources.scope.closed`, close `complete:true`, one live subscription.
- `setup` recipe: same refusal to the author, close `complete:true`, zero live subscriptions.
- A failing unsubscribe remains a named failed debt and can be explicitly retried; a guarded listener ignores later events; the borrowed provider is never closed by the subscriber.

This is an authoring-example defect, not evidence of a production payments leak or a defect in the documented `use` refusal semantics. See [guide](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/docs/guides/module-authoring.md#L947-L972), [setup/use implementation](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/packages/resources/src/features/scope/scope.ts#L93-L144) and [contract](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/packages/resources/README.md#L67-L85).

### B. Checking cancellation before acquiring is a separate requirement

My `/tmp/gm-c2-subscription-probe.ts` imports the built public `packages/resources/dist/index.js`; it does not use a custom source loader. `node /tmp/gm-c2-subscription-probe.ts` passed, exit 0. These exploratory probes are execution evidence, not strict TypeScript or maintained-test qualification.

For a pre-aborted construction run whose scope is still open, `resources.setup` invokes its callback. This is intentional: run cancellation aborts the acquisition signal without itself closing the scope. Without a callback check, the subscription was acquired once; with `signal.throwIfAborted()` before subscribe, it was acquired zero times. Both eventually cleaned what they had acquired when the Host closed the scope.

The final recipe therefore needs both a pre-acquisition signal check and a per-callback signal guard. Merely replacing `use` with `setup` does not by itself stop acquisition after run cancellation. See [run cancellation and facets](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/packages/resources/README.md#L55-L85).

### C. A synchronous source can emit again before subscribe returns

The additional probe attaches, emits `first`, lets that listener initiate close, emits `second`, then returns a disposer. Guarded setup delivered only `first`, disposed the returned handle, and finished with zero live subscriptions. No sleeps or timing thresholds were used. This is a relevant regression because many push sources can emit synchronously during subscription.

### D. Setup cannot clean a handle it never receives

The additional probe deliberately attaches and then throws before returning any handle. Its setup rejects and scope close reports complete, but the source still retains one attachment. The scope has no release callback/value for that unreturned resource.

This is not another Resources bug. A provider must roll back a failed `subscribe` acquisition before throwing, or expose a contract that returns custody even on partial failure. The guide should state that precondition. Otherwise “safe third-party subscription” overstates what the fix establishes.

## Corrections required in the proposed slice

1. **Use setup for acquisition, including synchronous acquisition capable of reentry.** Keep `use` for a value already held, with its existing refusal/remaining-ownership rule. No change to production Resources semantics is needed.
2. **Check `signal.throwIfAborted()` before subscribing and guard callback entry.** A guard prevents future callback effects after abort; it does not interrupt the remainder of a callback already running or physically detach the provider.
3. **State a synchronous callback contract.** TypeScript's `() => void` accepts an async function, so this signature alone does not prohibit detached async work. For a deliberately synchronous example, a callback returning `undefined` can reject accidental async callbacks at typecheck, or prose must explicitly prohibit them. Do not quietly claim a worker pool from this recipe.
4. **State failed-acquisition ownership.** If subscribe throws, the provider must leave no attached subscription. If the provider's unsubscribe throws while still attached, Resources retains debt; the guard continues to suppress callbacks until an explicit successful cleanup retry.
5. **Preserve error semantics instead of inventing them.** A source that stops synchronous dispatch when a listener throws is not equivalent to a source that isolates each listener's error. The current `pg.forget` example is nonthrowing synchronous work. Do not generalize it into an isolated event channel without an actual implementation and tests.
6. **Do not equate cleanup return with physical release.** `complete:true` records callback completion under the declared contract. A dishonest cleanup that detaches nothing can still return; an independent live-listener assertion is essential.
7. **Do not swallow cleanup errors or add disposal in multiple owners.** The returned unsubscribe belongs to the receiving module. Closing its source, calling `removeAllListeners`, or hiding the failed unsubscribe in an abort listener can break sibling subscriptions or lose retryable debt. Ordinary abort listeners must not throw.

For async IO, the existing stop-admission → unsubscribe → physical drain → dependency release rule remains appropriate. An unresolved physical operation should keep its drain promise pending; throwing “still running” and allowing dependency release would weaken the retained-work contract. A generic four-line callback bridge should not absorb that concern.

## P1 — Occurrence events and streams

**Assessment:** absence of a mandatory bus is not a modularity defect. The audited consumer has direct capabilities, replaceable state and a separate durable protocol. The reproduced issue is at the acquisition edge. Requiring rich operators in every consumer would add a new obligation without evidence of shared semantics.

**Top three options, ranked:**

1. **Correct and qualify the existing typed source recipe; retain current production API.** Recommended now. Show a read-only source capability and receiver-owned cleanup. Explicitly distinguish notifications from commands and state. Zero new production dependency.
2. **Use a selected existing stream implementation behind a narrow consumer port.** Appropriate when a real module needs map/filter/merge/debounce. A suitable library may make that module simpler. Source scheduling, error, unsubscribe and buffer semantics remain part of its adapter contract. No universal wrapper is required simply to allow a library.
3. **Admit a separate optional occurrence leaf after a concrete shared need.** A leaf in this monorepo can be a valid responsibility boundary, but packaging alone is insufficient. Specify writer/read-only authority, initial subscription behavior, callback failures, reentry, order and cancellation first. Defer queues and async workers unless those requirements are also demonstrated.

**Acceptance:** the recipe should preserve distinct equal notifications while subscribed if it claims that behavior, and should stop later application effects on cancellation. It does not promise every occurrence across disconnected intervals, process termination or intentional shutdown. “Every occurrence” without this lifetime scope is too strong.

## P2 — Queues, backpressure and bounds

**Assessment:** the researchers are right that queue capacity is not a total bound. However, an awaited direct command is also not a global admission limit when many independent callers invoke it concurrently. Avoid replacing one misleading shortcut with another.

**Top three options, ranked:**

1. **Keep no queue where no async buffering is required; retain current latest-only Observation.** Recommended for the demonstrated projection and synchronous notification. An actual command owner can enforce an operation cap where its business semantics require one. This is not a universal GM task scheduler.
2. **Use a demand-aware existing iterator/stream/queue inside an explicit owner.** Appropriate for a demonstrated pipeline. Test whether the producer obeys demand; a push-to-iterator wrapper may buffer independently. Bound buffer, concurrent physical work and awaiting producers separately when each can grow.
3. **Add a bounded reusable admission mechanism only after existing implementations fail a named contract.** A nonblocking accepted/rejected result can avoid unbounded suspended publishers, but is not automatically a suitable business policy. A public helper needs a consumer and non-success test cases before it earns maintenance cost.

**Acceptance:** with a deliberately held physical operation, inspect queued items, active operations and pending admissions independently. Payload count is not a byte bound. Timeouts must not release a capacity permit while uncooperative physical work still uses the resource. No new overload suite is required for a synchronous recipe that introduces no queue or async handlers.

## P3 — Cancellation, shutdown, errors and acceptance

**Assessment:** this contains the real immediate fix. Existing Resources has the relevant custody mechanism. Future delivery contracts must distinguish source acceptance, callback return, physical operation completion and business acknowledgement; the current task does not require implementing all four.

**Top three options, ranked:**

1. **Use guarded setup in the existing authoring example with precise source preconditions.** Recommended now, with the reproduced close and run-cancellation cases. Preserve `use`'s documented semantics and original error/debt objects.
2. **Introduce an optional adapter for one selected source with demonstrated repeated lifecycle integration.** Map its actual sync or async teardown correctly. Await real async cleanup through setup cleanup; do not put an async disposer under `Symbol.dispose` and assume its promise is awaited. Preserve source error behavior and physical work ownership.
3. **Integrate an already selected structured-concurrency runtime inside a capability.** Effect can own internal fibers and stream interpretation when the Host needs them. One outer resource entry can own that runtime. This cannot force an arbitrary SDK promise to terminate and should not be mandatory for every GM module.

**Acceptance:** pre-closed scope makes no subscribe call; pre-aborted run makes no subscribe call; reentrant close during subscribe recovers the returned handle; subsequent synchronous emissions after abort cause no effect; failed cleanup retains a named debt and allows explicit retry; sibling subscriptions survive.

**Rejection:** a new generic task group is not justified merely because several consumers contain Sets of promises. Those Sets may represent different physical, business and caller lifetimes. Similar code shape is insufficient DRY evidence.

## P4 — Diagnostics and executable evidence

**Assessment:** neither “already tested” nor “new diagnostics needed” follows from existing test names. The current guide compilation tests prove API compatibility but did not execute the failing acquisition pattern. The relevant gap is behavioral evidence for a public recipe.

**Top three options, ranked:**

1. **Run the actual documented recipe in focused regressions and make the old behavior fail.** Recommended now. Extract/compile documented TypeScript or use one maintained source authority; do not test a copied correct helper while leaving the guide free to regress. Independent expected live counts and order are the oracle.
2. **Add a contract suite when a reusable event adapter is actually admitted.** Its chosen semantics determine negative cases. Generic “event success” counters cannot qualify incompatible fan-out, work-distribution and durable-delivery contracts.
3. **Add Host-facing diagnostics only for an actual unanswered operational question.** Buffer depth, admission rejection or named task state can be useful after such a mechanism exists. No global trace manager or telemetry dependency is warranted by this recipe correction.

**Acceptance:** normal strict typecheck and verification route include the new test. Positive delivery plus negative post-close/sibling/failed-cleanup assertions reject a no-op or overbroad cleanup. Do not claim payments E2E from GM synthetic fixtures, or physical release from `CloseReport.complete` alone.

## P5 — Parallel Assembly

**Assessment:** no measured startup bottleneck was found. A concurrent construction engine would change failure admission, journal ordering and cancellation semantics; this is not part of fixing event integration.

**Top three options, ranked:**

1. **Retain sequential Assembly and measure a real startup before changing it.** Recommended no-change outcome. Module count alone is not a startup critical-path measurement.
2. **Parallelize independent acquisitions inside their current responsible owner.** If measurement identifies IO latency, start only proven-independent work and retain every started acquisition through physical settlement on failure. `Promise.all` rejecting early does not mean sibling acquisition ended.
3. **Propose an explicitly bounded concurrent Assembly successor after measurable value.** Specify deterministic result/journal behavior, admission cutoff, multiple failures and cleanup custody. This belongs in a separate qualified change.

**Acceptance for future work:** controlled dependency gates, not only wall-clock speed; abort and multiple failure cases; every started task and resource accounted for. No such change should be bundled into this PR.

## P6 — Durability, replay and process boundaries

**Assessment:** being in one process removes network mechanics, not process-crash risk. Critical business delivery can need storage even in a monolith. The payments owner already implements a durable obligation/receipt protocol; it should not be replaced by a stream.

**Top three options, ranked:**

1. **Keep the existing payments-owned durable protocol and optional transport.** Recommended now; no GM persistence change. Ordinary notifications and read projections can remain ephemeral when their contracts permit reconstruction or loss.
2. **Select another existing durable implementation behind a consumer-owned delivery port when required.** Match transactional admission, acknowledgement, idempotence and physical shutdown. Neither a generic Queue nor an in-memory PubSub proves those properties.
3. **Extract a separately owned delivery library only for a genuinely shared semantic contract.** Storage/transport mechanism can be shared; product-specific authority remains with its owner. An optional package can share a monorepo without becoming a Core dependency, but similar send/subscribe names are insufficient justification.

**Acceptance for any future replacement:** real storage and restart scenarios, lost/mismatched receipts, uncertain commit and admitted-work drain. Existing tests in payments are relevant source evidence; I did not execute financial qualification and do not claim a current passing deployment result.

## Minimum final test set and scope

The narrow correction does not need a new production helper. The smallest meaningful maintained evidence is:

- One ordinary delivery/cleanup case with two subscribers sharing one borrowed source: close one, keep the other working, close both, assert zero owned subscriptions and no source disposal.
- One reentrant acquisition case whose source closes the scope before returning its disposer and emits again after abort: assert rejection, zero listener effects after abort, zero live subscriptions and correct cleanup order.
- One cancelled-construction case: scope still open, signal already aborted, zero acquisition calls.
- One unsubscribe-failure case: first close has a named failed debt, callbacks after abort do no work, explicit retry detaches. Keep the failed cleanup cause visible.
- The existing guide compiler checks plus strict inclusion of any new TypeScript tooling. A controlled old-pattern negative experiment must fail the new behavior test.

The invalid attach-then-throw source is a useful documented limitation and exploratory control; it need not become a maintained test asserting that an invalid source leaks. The sync-only recipe does not need a speculative async worker implementation just to test a held promise. Existing Resources/Observation tests already own physical-drain behavior; a future async adapter must add its own actual-boundary tests.

CMS wording should distinguish acquisition from handing over an already-held value, preserving ADR-0030 and the accepted `use` semantics. If its full bytes are changed, use the existing pin-review procedure; no accepted ADR should be rewritten to make the example pass. The consumer-local startup-error masking candidate identified by R2 should be reproduced in its own owner before any fix; it is not a reason to broaden GM's responsibility.

**Confidence:** high for the reproduced acquisition defect, pre-aborted-run distinction and recommended narrow scope; conditional for any future stream-library choice because no common noncoalescing workload or measured operational envelope was established.
