# C1 — architecture, necessity and scope critique

Date: 2026-10-25. Independent critic: /root/critic_scope.

Reviewed all three independent reports, R1 architecture, R2 consumer and R3 ecosystem, and the current Get Modular source/authority at 081ae02b49123e14121e100eccfe99f2e74c3600. Consumer evidence is pinned to payments-sdk 40e61f82c6f645e6b42116c0499925a5457adb2d. I did not read another critic's report, change either repository, run a new product E2E, or publish anything.

## Verdict

Approve a narrow correction of the existing subscription-acquisition recipe, an executable regression and clearer communication selection guidance. Reject a new general event/queue/worker runtime in this delivery. Defer parallel Assembly and persistence. The previous feature-parity framing was too broad: absence of an execution primitive is not a defect in a library whose responsibility is explicit deterministic composition.

This is not an argument that Get Modular can never own an optional event mechanism. Resources and Observation already demonstrate that a reusable mechanism can belong in an optional leaf while the Host retains decisions. The required evidence is an actual shared communication contract, not a general desire for streams or the competitor's API inventory. A monorepo directory and zero transitive dependencies do not establish a good responsibility boundary by themselves.

## Findings that change the proposed plan

1. **Concrete current correction:** the documented EventsPort subscription is acquired before resources.use receives its disposer. A source may synchronously run user code, including code which requests close. The use contract then refuses registration and leaves the acquired handle with the caller. The current example does not recover that ownership. R1's exact-source reproducer and the root's replay support the failure; the implementation independently shows why: setup records pending acquisition before invoking user code, while use checks the close state after its caller has already acquired the value. This is a recipe defect, not a Resources runtime bug or an observed payments leak.
2. **Existing good behavior is counterevidence:** payments already distinguishes direct capabilities, latest-state Observation and durable owner-to-owner delivery. A single stream API would not make those guarantees equivalent. Keep this successful separation visible in the final comparison.
3. **The minimal patch must not claim a universal safe subscription wrapper.** Setup can retain a returned handle during close, but cannot recover an undisclosed handle when an external subscribe implementation creates a resource and throws before returning it. Acquisition rollback belongs to that source. Unsubscribe also does not establish physical completion of previously started async work.
4. **Canonical guidance has an active content pin.** Editing common-assembly.md requires the existing pin/review/evidence maintenance. This is a concrete dependency of changing that document, not a reason to weaken or exclude the gate.
5. **Do not extract superficially similar Sets into a generic GM task group.** The payments wrapper calls, physical provider operations and queue handlers track different completion facts. Similar syntax is not sufficient DRY evidence.

## Six issues: independently ranked top three options

### P1 — Occurrence events and stream composition

**Diagnosis:** a convenience gap is plausible; no unmet reusable occurrence-delivery contract was demonstrated in the inspected consumer. The current typed source port already permits external event and stream implementations. A missing public event factory is therefore not a present modularity defect.

**Owner:** consumer owns event meaning and required delivery facts; composition binds explicit ports; source implementation owns notification semantics; receiving module owns its subscription.

| Rank | Option | Critique and disposition |
| --- | --- | --- |
| 1 | Keep explicit ports and existing Observation; repair and qualify the source integration recipe | Select now. It fixes an actual leak pattern without adding a public abstraction. Show that ordinary local notification is a callback, not a distributed protocol. |
| 2 | Use an existing stream library within a selected consumer adapter | Prefer this over a new GM leaf when rich filtering, merging or timing operators are the requirement. Let the actual consumer choose the operator model and dependency cost. No single library wins without that requirement. |
| 3 | Admit a small optional event leaf after a named real recurring need | Keep as a future option, not this PR. Establish sync/deferred delivery, error policy, occurrence preservation, close behavior and producer/consumer authority first. Do not add an operator clone or worker pool merely to make the package appear complete. |

**Challenge to researchers:** R1 and R3 rank an optional new leaf ahead of consumer-selected stream reuse. That ranking is not established by the present evidence. Existing-library reuse should be the next experiment if the user's principal need is stream operators. Conversely, a tiny subscription helper should not be called a reusable event framework.

**Acceptance evidence:** ordinary events reach the listener; identical occurrences are distinct if the selected port promises that; closing one subscriber neither closes the source nor another subscriber; cancellation and callback errors obey the declared contract. Do not require durable replay for a deliberately ephemeral notification.

### P2 — Backpressure and capacity

**Diagnosis:** overload is an execution concern even within one process, but no queue in GM Core has been shown to grow without bound. A Set tracking outstanding calls proves retained custody, not a promise to schedule or cap those calls. Missing admission in an owner may deserve a separate workload-driven change.

**Owner:** ingress and product policy choose admit/reject/wait/coalesce; adapter owns retained messages; operation owner owns physical concurrency. State coalescing already belongs to Observation.

| Rank | Option | Critique and disposition |
| --- | --- | --- |
| 1 | Avoid an intermediate queue for direct calls, synchronous notifications and latest-state projections | Select for current examples. Awaiting a single call is enough when the caller owns that sequencing, but do not claim this bounds arbitrarily many independent callers. |
| 2 | Use a pull sequence or native pipeline when the producer can actually honor demand | Good conditional alternative for one-consumer pipelines. An AsyncIterable interface alone does not transform an unpausable hot source into a bounded producer. |
| 3 | Select an existing bounded queue/stream at the owner edge for a measured async occurrence workload | Conditional only. State separately the buffer, pending publishers, in-flight tasks and payload-size limits. Do not add these controls to every module by default. |

**Challenge to researchers:** identifying an unbounded active Set is not enough to prescribe a cap without checking higher-level ingress and required business outcomes. A downstream database pool limits executing connections, but may still retain waiting callers; an end-to-end capacity claim needs the full owner chain. This audit does not establish a production overload incident.

**Acceptance evidence:** only for a newly introduced async workload, hold the physical operation open and assert admission and retained work separately. Reject a test which observes queue length alone. The current recipe fix should not grow a new benchmark or scheduling project.

### P3 — Resource ownership, errors and shutdown

**Diagnosis:** this contains the one reproduced correction. The public scope API already supports its fix. Resources mechanics and Host lifecycle authority should remain separate.

**Owner:** Resources registers and executes owned cleanup; source owns acquisition rollback and delivery behavior; module owns its subscribed work; Host decides when to close, wait, retry or abandon.

| Rank | Option | Critique and disposition |
| --- | --- | --- |
| 1 | Acquire subscriptions through existing setup and protect callback delivery after abort | Select now for the demonstrated reentrant source. Cleanup retains only that returned subscription, never a borrowed provider. Preserve use as valid transfer of a value already held with ownership handled if transfer is refused. |
| 2 | Add a specific optional bridge for a repeatedly used stream implementation | Conditional on repeated integration. Keep async cleanup awaitable and distinguish detachment from active task settlement. Avoid a structural adapter claiming to understand every library's errors and completion. |
| 3 | Use an already selected structured-concurrency runtime inside one capability | Valid for an application needing that execution model. The outer Resources entry owns that runtime's real shutdown. Do not make every GM module use it, and do not claim interruption can stop arbitrary foreign promises. |

**Required corrections to a candidate recipe:** guard synchronous callbacks using the receiving scope's signal if the legacy source has no signal integration; acquire only after dependencies are ready; preserve cleanup failure debt; explicitly state that subscribe throwing before returning a handle must roll back within the source. Keep async listener/drain concerns in explanatory guidance unless the PR actually implements that contract.

**Acceptance evidence:** preclosed scope starts no subscription; close during subscribe releases the returned handle; ordinary close detaches; cleanup failure remains a named debt and can be retried; no callback side effects occur after abort even while detachment failed; borrowed provider remains open for siblings. Run the documented code through the normal package build and strict TypeScript configuration. Do not ship the temporary research loader.

### P4 — Diagnostics and executable evidence

**Diagnosis:** claims that GM lacks diagnostics are contradicted by Core diagnostics, named Resource debts and Observation reports. What is missing in this slice is a runtime test of the actual authoring recipe under reentry.

**Owner:** the mechanism reports truthful local facts; Host owns telemetry storage and operational response.

| Rank | Option | Critique and disposition |
| --- | --- | --- |
| 1 | Test the actual corrected documented recipe and retain the independently expected failure conditions | Select now. Compile-only documentation checks cannot prove cleanup. The old pattern should fail the behavioral regression. |
| 2 | Publish the research and decision table without adding runtime instrumentation | Suitable alongside the correction. Clearly distinguish source audit, synthetic recipe execution and production E2E. Existing payments tests may be cited as assertions; do not claim this task ran them. |
| 3 | Add an optional local diagnostic hook for a concrete diagnosis that current outputs cannot answer | Defer. A factory-start observer, event counters or a telemetry SDK is not justified by this reentrant acquisition defect. Each would need separate error/reentry semantics. |

**Challenge to researchers:** a new counter or named observer is not automatically harmless. Reporting can throw, reenter or retain payloads. The diagnostic addition must answer an actual unanswered question rather than complete a feature checklist.

**Acceptance evidence:** test ordinary success as well as rejection so a no-op subscription cannot pass; retain zero-live-subscription and sibling assertions; wire the regression into strict typechecking and an existing normal gate. Do not rewrite historical qualification evidence.

### P5 — Parallel Assembly

**Diagnosis:** sequential execution is the accepted construction contract. The consumer audit contains no measurement demonstrating that this is its bottleneck. Having many modules is not by itself a reason to change scheduling.

**Owner:** Assembly owns construction semantics; Host or one cohesive adapter owns independent external preparation.

| Rank | Option | Critique and disposition |
| --- | --- | --- |
| 1 | Preserve sequential Assembly and measure a representative startup before proposing a successor | Select now. No code change in this PR. |
| 2 | Parallelize genuinely independent resource acquisition inside its existing owner | Conditional first optimization. Await all started work on failure and retain cleanup custody. Do not move domain logic into a giant root. |
| 3 | Add a bounded dependency-ready Assembly scheduler through its own reviewed successor | Defer. Specify failure cutoff, journals, all-started-task settlement and cleanup before implementation. This is not a stream integration detail. |

**Challenge to researchers:** a Promise.all around independent work is not sufficient evidence of safe failure handling; early rejection can leave sibling acquisition running. Any optimization must preserve the same ownership facts.

### P6 — Durability and remote delivery

**Diagnosis:** same-process applications may need crash survival. Payments already owns such delivery through records, independent receipts and selected transport. Ordinary event streams remain useful for other purposes.

**Owner:** domain/application defines the obligation and acknowledgement; infrastructure persists/transports it; GM composes these capabilities.

| Rank | Option | Critique and disposition |
| --- | --- | --- |
| 1 | Keep current payment-owned delivery and optional infrastructure transport | Select now. No new GM persistence subsystem. |
| 2 | Substitute another implementation behind the existing transport/domain port when deployment requirements justify it | Conditional. The alternate test fixture demonstrates a seam, not a qualified production replacement. Preserve transactional and uncertain-outcome guarantees. |
| 3 | Build or extract a separate durable relay/delivery library for an independently demonstrated shared contract | Defer. It must not become a second authority for payment facts or be installed with every modular application. Similar message DTOs do not establish shared acknowledgement semantics. |

**Challenge to researchers:** do not imply that a broker ACK, queue insertion or successful callback can replace the domain's consumer receipt. Do not conflate a local lossy notification with financial obligation delivery in one generic score.

## Canonical guidance and pin decision

The accepted ADR-0030 already states that setup registers before acquisition, close waits for started setups, and refused use leaves the value with its caller. ADR-0034's disposer/use recipe can remain valid for transferring an already-held disposer. The correction should therefore be worded as safe application of existing acquisition custody, not as a changed Resources contract or an edit to the accepted ADR.

For the narrowest possible patch, changing the concrete module-authoring example and Resources README is defensible if the delivery claim is explicitly only a correction to that example. There is no new runtime behavior or lifecycle owner. However, the canonical CMS rule 5 currently repeats the same unqualified disposer/use recipe. Leaving it untouched means the principal shared guidance can still lead another author back to the unsafe pattern. Given this task's explicit aim of coherent shared architectural guidance, I recommend a small clarification in rule 5, preserving the valid use case and directing reentrant acquisition to setup. This judgment follows semantics; it is not a reason to bypass the content gate.

Current pin machinery is concrete:

- architecture/sdk-growth/evidence/consumer-module-standard.json records the reviewed b2fec1fa15fe3998f51449d7df249f302645973f source, blob df4eff7235ac781ec574903c6b2aec13bcd7bfaa and full-document SHA-256 3c5814ebf1ab1bd17688e49955aa0baa2ee91dd3a369adcea4d38aaccd53ba86.
- architecture/checks/sdk-growth.mjs validates the working CMS bytes, retained current/previous documents, full delta and prior review. Historical drain, Bun, descriptor, P0 and 300e evidence remain authenticated.
- tests/qualification/consumer-fixtures/growth/source.ts records the current reviewed CMS identity. docs/architecture/feature-module-standard.md explains that pin.
- tests/sdk-growth.test.mjs rejects altered current/historical bytes, false adoption activation and missing evidence.

A legitimate update can commit and push the exact corrected CMS bytes first, then bind that immutable branch commit and full-document digest in a followup evidence commit in the same PR. CMS requires an exact source identity, not a fictional future merge SHA. Retain the former reviewed document and review unchanged, retain the complete new delta, preserve unaffected authoring facts and pending/HOLD state, and add rejecting coverage for the new retained inputs. Do not overwrite the previous evidence directory or merely replace a hash without reviewing the delta.

The full pin migration is required only if the canonical document changes. Do not force unrelated production consumers to claim a completed migration: report their actual applicable adoption status and any outstanding exact-pin review. Payments code is not being changed by this Get Modular correction; its current successful scope remains evidence, not a claim that it has adopted the new source pin.

## Scope controls and final review requirements

- No mandatory Effect, RxJS, Wonka, emitter, queue or broker dependency.
- No new public event API, lifecycle controller, worker pool or parallel Assembly.
- No change to use refusal, setup custody, close debt or Observation state semantics.
- One corrected acquisition recipe, its behavioral regression, concise communication guidance and the necessary current-document pin maintenance.
- No claim of a payments production leak, production overload, new stream performance measurement or rerun financial E2E.
- A later optional event leaf remains possible when a named consumer demonstrates a repeated noncoalescing in-process notification need. Library-first then means one reusable contract, rather than copied application buses.

## Evidence references

- [System boundary](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/docs/architecture/system-boundary.md).
- [CMS ownership and resource rules](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/docs/architecture/common-assembly.md#L170-L218).
- [Resources accepted custody contract](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/docs/decisions/0030-admit-the-module-resource-scope-package.md#L63-L94).
- [Actual pending-setup and use implementation](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/packages/resources/src/features/scope/scope.ts#L93-L144).
- [Current unsafe authoring expression](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/docs/guides/module-authoring.md#L950-L973).
- [Current pin review](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/architecture/sdk-growth/evidence/consumer-module-standard.json).
- [Pin verification](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/architecture/checks/sdk-growth.mjs#L364-L423).
- [Payment transport boundaries](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/docs/queue-transport.md#L1-L63).
- [Payment projection](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/packages/payments-get-modular/src/features/purchase-observation/composition/purchase-projection.ts).

Confidence is high on the responsibility split and exact acquisition defect; moderate on which future stream implementation will best fit, because no new operator workload or bundle measurement was established. This is design approval for the bounded slice, not approval of an implementation diff that has not yet been reviewed.
