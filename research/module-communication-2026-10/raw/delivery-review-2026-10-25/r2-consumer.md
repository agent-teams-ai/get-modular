# R2 — independent consumer-led review of module communication

Research date: 2026-10-25. Researcher: `/root/research_consumer`.
This report was written independently, without reading the other researchers' reports.
No user repository was modified; no runtime test was executed in this audit.

## Sources and scope

- Payments SDK exact main: `40e61f82c6f645e6b42116c0499925a5457adb2d`.
- Get Modular exact main: `081ae02b49123e14121e100eccfe99f2e74c3600`.
- Read contributor instructions, the organization Engineering Quality Standard and tools catalog, payments developer-stack guide, source contracts, composition, worker delivery and lifecycle implementations, and their existing integration tests. GM system boundary, current contract, Consumer Module Standard, Observation README, module-author guide and communication research were examined.
- Evidence below describes source behavior and existing test assertions. The existence of test source is not a fresh passing result. This audit does not qualify arbitrary scale or deployments.

## Executive conclusion

Payments is strong counterevidence to the earlier suggestion that Get Modular must acquire its own message runtime to be technically competitive. The consumer already separates (a) ordinary typed capability calls, (b) optional latest-state projection, and (c) durable owner-to-owner delivery. Get Modular supplies static wiring and resource custody. Payment evidence and acknowledgement belong to payments, and PostgreSQL wake-ups are behind an infrastructure-owned replaceable port. Adding a general GM queue would duplicate that owner rather than repair it.

The smallest justified GM improvement is a maintained communication decision guide and an executable recipe for integrating an existing in-process source with subscriber-owned resource lifetime. It should show synchronous notification, explicit async work ownership, and optional stream composition without prescribing a queue library or claiming durable delivery. If reviewers find this recipe already sufficiently covered, a focused clarification and consumer evidence links are enough. No runtime package is justified solely by the current payments consumer.

## What the consumer actually does

1. **Capabilities are explicit direct calls.** The payment module creates one runtime, acquires it with `resources.setup`, and publishes separate checkout/read/management/processing/delivery facets. Its domain/application-facing types do not expose Resources or a bus. [Module source](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/packages/payments-get-modular/src/features/payment-runtime/composition/payments.module.ts#L1-L16); [facets](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/packages/payments-get-modular/src/features/payment-runtime/application/use-cases/create-runtime-facets.ts#L16-L60).
2. **Optional UI observation is already bounded.** The projection owns request/output state stores. Its loader awaits the physical borrowed read and cleanup; selection immediately invalidates the previous visible state. One active read plus the latest pending selection is the intended contract. It intentionally does not preserve every refresh occurrence. [Projection](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/packages/payments-get-modular/src/features/purchase-observation/composition/purchase-projection.ts#L9-L80); [documented semantics](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/packages/payments-get-modular/README.md#L105-L140).
3. **Financial delivery is durable and separately owned.** A transport wake-up contains work identity; durable payment records authorize processing. The runner awaits the consumer receipt, verifies identity/digest, then acknowledges the producer. It does not use Observation for this purpose. [Delivery implementation](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/packages/payments-postgres/src/features/payment-custody/adapters/jobs.ts#L160-L203); [transport contract](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/packages/payments-postgres/src/features/payment-custody/adapters/work-transport.ts#L1-L43).
4. **Transport substitution is already deliberate.** pg-boss is an optional adapter subpath. The root does not require it. An alternate SQL wake-up fixture tests atomic admission, restart repair, lost/mismatched receipts and admitted work drain. [Transport guide](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/docs/queue-transport.md#L1-L63); [alternate transport tests](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/tests/e2e/queue-transport.test.ts#L60-L186).
5. **No hook is required for delivery.** A qualification scenario explicitly runs T1/T2/T3 with observation absent, broken and closed, including a lost producer ACK and consumer restart. This is particularly relevant counterevidence to promoting every event to a GM stream. [Financial test](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/qualification/observation/financial.test.ts#L24-L220).

## P1 — Does GM need an occurrence-event or stream mechanism?

**Finding:** no demonstrated unmet occurrence-event requirement in the inspected payments composition. Direct calls implement one-owner operations, Observation implements replaceable state, and durable delivery serves independent business owners. This does not prove no other consumer needs ephemeral multicast. GM's own communication research explicitly defers events until a first real consumer; that is an admission trigger, not a defect report. [Research](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/research/module-communication-2026-10/findings.md#L52-L74), [trigger](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/research/module-communication-2026-10/findings.md#L225-L236).

**Owner:** consumer defines the meaning and required guarantee of messages; composition binds a narrow source port; subscriber owns its subscription; chosen adapter implements delivery. Core compilation must remain independent.

### Top three options, ranked

1. **Retain typed ports and current Observation; add a clear worked communication recipe.** No production dependency or new API. Include a read-only source facet and consumer-owned subscription disposal for ordinary occurrences, with explicit synchronous callback contract. Best present fit and lowest complexity. Limitation: no common occurrence channel implementation; this is appropriate until a repeated need exists.
2. **Host-selected stream library behind a consumer port.** For real filtering/merging/debouncing, select RxJS (or an already installed stream implementation) in the outer adapter and compose operators there. The consuming application gets its narrow contract, never a writable Subject or a global bus. Use separate package/subpath only if reusable integration warrants it. No dependency enters GM Core/Assembly. Limitation: RxJS unsubscription and operators do not automatically satisfy physical completion or overflow contracts.
3. **Optional reusable events leaf, admitted by a real recurring use case.** This can live in the monorepo, with its own public contract, Resources integration and conformance evidence; it must not become implicit global routing. First decide whether it is multicast, work distribution, replay, or optional notification. Reuse a suitable existing implementation behind it instead of cloning operators. Limitation: designing a thin wrapper before the source semantics exist can add another API without simplifying ownership. Defer this option now.

**Validation:** direct calls remain usable without observation/events installed; two module runs have isolated sources; subscriber close detaches only its subscription; source remains usable by a sibling; repeated identical occurrences stay distinct if the occurrence contract requires that; sync callback error policy is explicit. A test fixture demonstrates integration, not broad production demand.

## P2 — Queues, overload and bounds

**Finding:** prior blanket priority was too broad. The projection already has one physical read plus one latest pending query. Durable workers have explicit batch/concurrency settings. Payment facet call tracking is a Set without an admission cap, but it is a drain tracker, not a claim of bounded runtime scheduling. A busy Host may need command admission limits; those limits are operation/deployment policy, not a missing module-compiler capability. No measured overload failure was established here.

**Owner:** producer/Host controls admission; delivery adapter owns buffers; consumer operation controls work concurrency. A queue length does not bound message byte size, pending producers or already running external work.

### Top three options, ranked

1. **Use no queue for synchronous notifications; bound actual async ingress at its existing owner.** Keep projection coalescing, worker concurrency and HTTP admission separate. If a new command port needs a cap, define reject/wait behavior there. This preserves business-specific semantics and adds no dependency.
2. **Use a pull-oriented source when sequential demand fits.** AsyncIterable or a supported native stream can express one item at a time and cooperate with producer demand. Specify source buffering and cancellation, rather than assuming `for await` bounds a push emitter. Useful for an actual finite/asynchronous sequence; no event multicast implied.
3. **Select an existing bounded queue/stream adapter for a demonstrated async occurrence workload.** The adapter must specify buffer limit, maximum active work, waiting-publisher policy, and overflow outcome. Effect Queue/Stream is viable when the Host already uses Effect; it does not need to become a GM dependency. RxJS is viable for transformations, but concurrency options alone are not buffer caps. Defer a universal GM worker pool.

**Validation:** hold one physical operation unresolved, burst input, and assert separately admitted items, queued items, pending publishers and active work. Check the selected overflow result; test abort during admission and shutdown; no test based on sleeps or only queue length. Byte retention needs its own bound if payloads are unbounded.

## P3 — Cancellation, shutdown and acceptance semantics

**Finding:** physical-lifetime concern is real, but much is already handled. `createRuntimeFacets` rejects new calls after its scope signal aborts, tracks admitted promises, stops the runtime and drains it. Projection tests hold a real PostgreSQL read and its cleanup after logical supersession and abandonment. They assert the borrowed pool stays open. [Facet tracker](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/packages/payments-get-modular/src/features/payment-runtime/application/use-cases/create-runtime-facets.ts#L4-L60); [projection lifecycle assertions](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/qualification/observation/projection-lifecycle.test.ts#L46-L113).

**Owner:** Resources holds cleanup custody; each operation promise must represent its promised completion; Host owns ordering between dependent scopes and infrastructure. Received, admitted, processed and durably acknowledged are different owner-specific facts.

### Top three options, ranked

1. **Preserve existing Resources rules and give one complete source/stream adapter example.** Stop accepting, detach subscription, await actually owned work, then release dependencies. Capture errors according to the port's explicit policy. No new runtime ownership layer.
2. **A reusable scoped adapter for a particular existing stream library.** An optional package may convert its subscription/unsubscribe into Resource custody, while keeping active work drain explicit. It must handle synchronous emissions during subscribe and scope-close reentry. Do not call unsubscribe proof of completion. Admit this only when integration is repeated.
3. **A general scoped task group only after a repeated contract is proven.** The consumer currently has several Sets tracking distinct authorities (calls, physical provider work, job handlers); superficially similar code is not sufficient DRY evidence. A shared helper must preserve sync throws, reentry, admission close, physical finalization, and failed cleanup reporting. Defer extracting it into GM now.

**Validation:** pre-aborted scope, close during subscribe, close invoked from callback, held promise after abort, failing diagnostic sink, successful sibling activity during dependent drain. Crucially, awaiting only a logical wrapper or unsubscribing an Observable cannot qualify an uncooperative physical operation as stopped.

**Concrete consumer-local candidate:** `jobs.ts` startup catch awaits `transport.stop()` before rethrowing the original error. A rejected stop replaces that startup cause. [Lines 358–368](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/packages/payments-postgres/src/features/payment-custody/adapters/jobs.ts#L358-L368). The Host helper already aggregates both failures, but cannot reconstruct an inner cause that the runner lost. [Host helper](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/examples/host-lifecycle.ts#L17-L49). This deserves a focused regression and owner-local fix if implementation scope includes payments. It is source-based reasoning, not an executed failure, and does not justify a new GM runtime.

## P4 — Diagnostics and executable evidence

**Finding:** not an empty area. GM has structured preparation diagnostics, Resources debts and Observation source/subscription reports. Payments retains preparation causes and has tests for failed construction, absent hooks and physical drainage. The useful remaining gap is discoverable evidence showing integration with arbitrary external occurrence/stream sources, not a mandatory telemetry subsystem.

### Top three options, ranked

1. **Focused communication recipe plus executable boundary scenario.** Test ordinary direct capability calls, source subscription lifetime, a sibling subscriber and one held async effect if that is part of the recipe. Link real payments patterns to distinguish projections from delivery. Highest present value.
2. **Optional conformance suite for an admitted event port.** After its contract exists, test sync delivery/reentry, errors, cancellation and overflow using a consumer-selected implementation. Keep the oracle independent from implementation. Do not invent one universal delivery guarantee for all sources.
3. **Optional diagnostic adapter at the Host.** Map subscription IDs, queue depth and pending work into the Host's existing observability if a selected mechanism exposes them. No global tracer, dependency on a telemetry SDK or promise of operation-level trace correlation in GM Core.

**Validation:** error reports identify the appropriate source/subscription without serializing payment/provider payloads; tests distinguish detached subscriptions from drained physical work; preserve existing rejecting and packed-consumer checks. Do not repeat full financial qualification for prose-only changes; run required repository gates for the changed surface.

## P5 — Parallel Assembly

**Finding:** no consumer evidence that sequential construction is a material bottleneck. Payment definitions are inert, configuration is a per-run input, and expensive processing starts through explicit runtime calls. Parallel graph construction would alter a deliberate current Assembly contract and failure/journal ordering. [Sequential contract](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/docs/architecture/common-assembly.md#L1234-L1245).

### Top three options, ranked

1. **Keep sequential Assembly.** Measure startup at the Host before changing it. This is the recommended no-change outcome for payments.
2. **Parallelize independent prerequisite acquisition at the owning Host or within one responsible adapter.** Retain explicit cleanup custody and bounded concurrency; feed already prepared dependencies into Assembly. This fits a demonstrated slow IO boundary without changing global graph semantics.
3. **An opt-in Assembly concurrency successor only with measured value and independent qualification.** Specify deterministic result/journal behavior, physical cancellation, failed partial construction and cleanup registration before adding it. No consumer evidence warrants doing this in the current PR.

**Validation:** elapsed critical-path evidence with controlled gates, independently derived graph expectations, multiple simultaneous failures, abort while factories are pending, and retained custody. A synthetic speedup alone does not prove the API change useful to payments.

## P6 — Durable replay and out-of-process delivery

**Finding:** durability can be needed inside one process because the process can terminate. Payments already has this responsibility and does not need microservices to justify it. Its durable obligations survive queue deletion; the queue is a wake-up implementation, not business truth. A generic in-memory stream cannot replace this guarantee. [Guide](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/docs/queue-transport.md#L50-L63), [remote boundary](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/docs/queue-transport.md#L127-L132).

### Top three options, ranked

1. **Keep payments-owned durable evidence and the existing optional pg-boss adapter.** GM simply composes these ports. No GM change, no mandatory transport dependency. Best current fit.
2. **Reuse another implementation of the existing infrastructure transport contract when deployment needs it.** The alternate fixture is evidence of the substitution seam, not a production replacement. A new adapter must independently preserve atomicity, repair and physical shutdown.
3. **Separate relay/outbox infrastructure for a real remote boundary.** Keep payment records and receipts authoritative; place a broker behind an explicit durable relay. Only package this reusable mechanism separately when another consumer demonstrates the same contract. It belongs outside GM Core and should not be pulled into every modular application.

**Validation:** existing durable end-to-end scenarios already identify relevant failures: enqueue rollback, lost/mismatched ACK, repeated wake-up, restart repair, terminal/deleted queue rows and uncertain COMMIT. Any new implementation must pass these with real storage. The current task does not justify building one.

## External stream reuse: precise cautions

- RxJS is a strong candidate when operator composition is the requirement, but not a replacement for the consumer's transaction/receipt protocol. Observable execution can be synchronous and each cold subscription may start its own work: [official Observable guide](https://rxjs.dev/guide/observable).
- `concatMap` serializes inner subscriptions, while its documentation explicitly warns of an unbounded pending buffer if the producer outruns inner completion: [official API](https://rxjs.dev/api/operators/concatMap). Therefore `concurrency: 1` is not sufficient overload evidence.
- Node `EventEmitter` calls listeners synchronously and ignores return values. `events.on` exposes async iteration, but its default high watermark is huge and pausing requires an emitter that implements pause/resume: [official events API](https://nodejs.org/api/events.html). Wrapping a push source in `for await` does not itself create bounded producer backpressure.
- No npm dependency was selected or measured in this audit. If implementation adds a runtime or dev dependency, verify its exact current artifact, license and declared dependency graph first. Existing payments policy already demonstrates optional subpaths/peers rather than mandatory transitives.

## Recommended implementation boundary

The user explicitly prefers responsibility over parity. Preserve GM's current production API. Improve the current communication guide with an explicit decision table: direct command/query; replaceable state; optional occurrence notification; asynchronous work admission; durable delivery. Add one normal verification-route example for an external occurrence source and its resource custody if existing examples do not already prove those edges. Keep production dependencies unchanged. Do not implement six features because six possible risks were named.

A separate payments PR fixing the startup-plus-cleanup diagnostic loss could be justified after reproducing it, but that is a consumer fix with its own tests, not evidence for adding a messaging runtime to Get Modular.
