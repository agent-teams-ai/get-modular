# Effect ecosystem review for Get Modular — 2026-11-12

This source study supports the [architecture audit](architecture-audit-2026-11-12.md). This is **source review**, not upstream test execution, a production reliability ranking, or evidence that these projects adopted GM. No upstream compiler or test runner was executed. The local LiveStore and T3 Code snapshots were read without modification; the Alchemy files were fetched at the exact commit below. Upstream default-branch commit APIs confirmed these revisions during this session. Moving main branches can advance afterward.

## Selection and source manifest

The three projects cover different responsibilities: a local-first data engine with workers and store retention, an agent application with streamed RPC and durable execution, and an infrastructure reconciler with provider variants and persisted state. Popularity is not the selection criterion.

| Project | Source revision inspected | Effect selection in that source | Why it matters here |
| --- | --- | --- | --- |
| LiveStore | `54e5a23a29e2c48a8abeff2253fb314767c4243a` | `4.0.3` in [workspace catalog][ls-version] | Shared store ownership, cached resources, worker shutdown, synchronization producer flow control |
| T3 Code | `fc2b5de20cb572d2333e03284466e3c804d25c84` | `4.1.2` in [workspace lock][t3-version] | Service boundaries, stable shared Layers, item/byte budgets, RPC acknowledgement, background execution |
| Alchemy | `21c601276a5c34eeb25bd7dc81dcca03be9e72eb` | Catalog `^4.1.4`, override `4.1.4` in [workspace policy][al-version] | Lazy local/live provider construction, memoization scopes, durable remote-resource reconciliation |

All are Effect 4 sources, but their minor versions, patches and application integrations differ. This does not extend GM's qualified peer beyond 4.1.4. Manifest/lock selections do not establish what an arbitrary production deployment has installed.

GM comparison point: `0ff54371967e4b56a9978f784f568a48731a324d`, including [ADR-0043][gm-adr] and the [packaged practices guide][gm-guide]. Those already establish exact local bindings, native construction E/R, borrowed inputs, explicit scope ownership and no new GM scheduler/registry.

## 1. LiveStore: cache ownership and shutdown completion are separate contracts

### Observed design

The [StoreRegistry][ls-registry] accepts a caller-provided Context or constructs a ManagedRuntime itself. Its stored disposal callback exists only for the owned runtime. `dispose()` deliberately does nothing to a borrowed Context; its owner must close the scope. The reference-counted store cache uses the caller's scope for retention and an application-configured idle TTL. This is a useful concrete ownership boundary: being able to use a service does not transfer authority to release it.

Cache equality is deliberately **only `storeId`**, and the first options supplied for the currently retained entry determine its configuration (source lines 128–138). After eviction, a new lookup can create an entry with different options. This is not an inferred bug. It is a documented product contract. It is also a direct counterexample to treating memoization as universally safe: reuse of a semantic ID with changed configuration does not imply a newly configured service.

The [store construction and teardown path][ls-shutdown] makes the difference between lifetime and waiting explicit. Shutdown can start from the public shutdown operation or caller-scope finalization, but both share one teardown fiber. A caller-side wait stops after one second; the detached drain is separately given a thirty-second bound before attempting closure of the lifetime scope. The code records timeouts and drain failures. That thirty-second setting bounds the drain phase; it does **not** prove that arbitrary uninterruptible cleanup or foreign I/O finishes in thirty seconds. Source lines 560–570 explain the shorter wait and lines 381–409 contain the independently owned teardown.

The [provider pull loop][ls-pull] limits pages that have been handed toward the mailbox but are not yet durable. A bounded queue and per-page completion signals feed producer flow control into stream consumption. Progress updates wait for that completion, and successful stream end waits for outstanding pages. The important unit is pending durable pages, not merely the number of fibers or whether the mailbox happens to use a bounded primitive.

The [registry tests][ls-registry-tests] explicitly exercise TTL eviction, retain/release, infinite retention, reuse and loading after eviction. They are inspected test definitions, not executed results in this audit. The narrow `create-store.test.ts` examined here checks invalid configuration before adapter invocation; it does not by itself qualify all shutdown branches.

### Decision for GM

- **Adopt the ownership distinction.** Keep borrowed inputs release-free and retain the one native owner. An external facade may own its runtime; an injected service should not receive a second disposer just because it crossed a module boundary.
- **Adapt cache identity at the consumer.** A tenant/session cache must define which configuration contributes to its key, or an explicit first-configuration-wins/invalidation contract. GM already creates fresh mapper-owned Layer identities on each `.layer()` invocation; replacing that with a global module-ID cache would regress input/environment isolation.
- **Adopt the measurement vocabulary.** Report stop admission, stop waiting, drain completion, scope closure and physical foreign-resource release separately. A successful return after a soft timeout cannot be presented as proof that all cleanup completed.
- **Keep outside GM.** Cache policy, TTL, workers, leader drain, durable acknowledgement and forced-shutdown decisions belong to the application/data engine. Copying LiveStore's registry or detached teardown into GM would create a new runtime owner.

### Limit and caution

The source contains unbounded queues as well as a bounded durable-page window. This review does not establish a bound for every LiveStore buffer. Nor does source inspection prove a live leak. Evaluate each actual producer, retained payload, consumer and cancellation path before making a defect claim.

## 2. T3 Code: architectural seams plus retention budgets across delivery

### Observed design

The [service guide][t3-guide] puts application capabilities in services and keeps transports responsible for decoding, calling and mapping errors. The same service is reachable from RPC, HTTP, MCP, scheduled work and CLI. It also keeps ManagedRuntime and Promise execution at application/framework edges, rather than inside cooperating services. Dependencies on private native services remain visible in Effect environment types. This is useful evidence for dependency inversion and avoiding duplicate workflows in each adapter; it is not proof that every T3 Code file conforms to its guide.

The [runtime composition][t3-layer] explicitly reuses `ProviderContinuationRequests.layer` so the orchestrator and worker share the same request queue. That is a tangible consequence of Layer object identity, beyond merely deduplicating construction counts. The same graph also centralizes persistence and service wiring. It supports GM's rule of one selected provider per graph build and a stable Layer reference when sharing is intended.

The [LiveStreamBudget implementation][t3-budget] tracks both retained item count and serialized byte size. Defaults in this source are 1,000 items and 8 MiB serialized data. It charges an item while queued **and while it is delivered but awaiting the next RPC pull/ACK**. Overflow closes the source and preserves an explicit failure; it does not silently drop event history. For latest-state streams, replacement releases the superseded charge while already delivered state remains charged. The comments connect this to RPC acknowledgement, so dequeue is not treated as business completion.

Notably, one internal queue is `Queue.unbounded`, but admission passes through the shared item/byte budget before enqueue, and source failure closes its queue. Calling that path unbounded solely from its primitive name would be wrong. Conversely, serialized bytes are not an exact JavaScript heap-size cap, and the bound is per budget/subscriber, not a fleet-wide memory cap. Concurrent subscribers and source allocations still need their own owner limits.

The [budget tests][t3-budget-tests] cover item and byte overflow, teardown before an outstanding ACK, interrupted replay and a fast reader consuming a database page larger than either buffer limit. They assert the actual retention/cleanup contract rather than just checking that a bounded-queue constructor was called. This is a useful model for consumer integration tests.

The [effect worker][t3-worker] has a configured worker population and a separate wait policy. A worker stops waiting on a long attempt after thirty seconds while the attempt remains in its enclosing scope and keeps its persisted running row. The slot may then claim other work. The [outbox claim rules][t3-outbox] still protect same-thread ordering through that running row, and title-generation claims have an additional limit; this is not unrestricted overlap for all jobs. Consequently, the worker-count setting bounds polling/claim loops; it is not by itself a bound on all concurrently outstanding external operations. The source comments make this a deliberate availability policy, not an established defect. A GM or application review must count work that remains alive after waits time out.

### Decision for GM

- **Adopt service reuse across transports.** Keep native operations native between services. Execute at a real outer boundary and let transport adapters map their own errors.
- **Adopt stable resource identity where intended.** Sharing should be proved by the behavior of one queue/session/pool and its release, not only by the existence of a Map.
- **Adapt the overload criteria in the guide.** Account for payload bytes, queued items, outstanding publishers, executing jobs and in-flight unacknowledged delivery. A queue capacity or a worker-count number proves only the corresponding stage.
- **Keep product policy outside GM.** Event sequence/resume semantics, coalescing, RPC ACK behavior, persisted outboxes and worker fairness are application-owned. No new generic event bus, scheduler or budget runtime is justified in `@get-modular/effect` by this evidence.
- **Do not copy the dependency convention literally.** T3 Code's rule that service dependencies come from native R is coherent for its Effect application. In GM, neighboring application providers arrive through declared slots; using ambient Context for those same providers would create an undeclared second graph. Native R remains appropriate for private technical services and explicit request/transaction/tracing context.
- **Do not import style or platform policy.** Namespace imports, `Buffer.byteLength`, a particular tagged-error schema and tracing at every chosen operation are application conventions, not universal GM contracts. GM's runtime stays platform-neutral.

### Limit and caution

This review reads relevant service/Layer/budget/worker implementations and tests. It does not establish that all provider sessions, queues or shutdown paths in T3 Code share those guarantees. In particular, fixed claim-loop count does not prove a hard bound on jobs that outlive the slot wait. A consumer promising such a bound must test it at admission and completion.

## 3. Alchemy: valuable lifecycle mechanics, different authority

### Observed design

Alchemy is a useful different case because its resource graph controls remote infrastructure and development processes. Its [ProviderLayer dual registration][al-dual] constructs local/live variants lazily. It obtains the native memo map and scope from Layer construction, builds selected variants into that same ownership context, and caches variant construction. Shared dependencies are shared only when provider thunks reuse the corresponding Layer reference. [Mode tests][al-mode-tests] check that unused variants do not build and that resolving the same concrete mode reuses it.

The [apply path][al-apply] explicitly avoids inserting a short `Effect.scoped` around the whole apply operation: local provider processes must outlive the operation's return in the ambient application scope. This independently supports the GM private-Layer rule: retaining a capability after a shorter construction scope ends does not retain its resource.

Alchemy also persists creation/replacement/deletion progress and generation identities. During cleanup it can finish independent deletions, aggregate failures, preserve failed rows for another attempt and keep an upstream resource when a dependent could not be deleted. The [destroy robustness tests][al-destroy-tests] assert those distinctions. Native finalization alone is not that protocol: it needs resource-specific persistence, ownership and retry semantics.

Its [provider abstraction][al-provider] makes different deliberate tradeoffs. Provider errors have an open string `_tag`, rather than a finite inferred union; this remains a typed structural error contract. Provider resolution can inspect ambient Context entries and fallback aliases because persisted resource identities must be resolved dynamically. Lazy provider-construction failures become defects through `orDie` in the dual registration; the code comments describe this as fatal engine setup. These observations matter precisely because they should not be transplanted into a library that promises typed factory E/R and complete explicit inter-module bindings.

### Decision for GM

- **Adopt native scope and memo-map alignment.** Private native resource Layers should be built into their actual owning construction scope. Memoization policy must include configuration and intentional sharing; merely caching a thunk is insufficient.
- **Adopt negative acquisition evidence.** A selected fake or unused provider variant should be proved not to acquire its old dependencies. GM already expresses this via a typed selected inventory before preparation, rather than Alchemy's dynamic provider modes.
- **Adapt cleanup tests at the owner.** Include one failed cleanup plus an independent slow cleanup, and verify both attempted work and reported cause. If a consumer owns durable remote resources, qualify its own retained failure/retry state; do not infer it from native Scope completion.
- **Reject ambient registry transfer.** Alchemy's dynamic resource-type lookup is its infrastructure engine's responsibility. GM already has one explicit provider-selection authority; duplicating this Context scan would undermine exact local slots and admission diagnostics.
- **Reject blanket error-channel erasure.** The generic GM adapter must preserve known factory E rather than copying a product's `orDie` setup policy or open provider-error type. A product may intentionally classify its own fatal setup failure at its execution boundary.
- **Keep outside GM.** Remote state reconciliation, aliases, generation migration, destroy retries, local/live cloud modes, discovery and provider-specific scheduling belong to Alchemy or the consuming Host. A process lifetime finalizer and a remote resource deletion command are different operations.

### Limit and caution

Alchemy's selected sources use unbounded parallel traversals and dynamic assertions in parts of its engine. This review does not establish a production overload or type-safety defect from those tokens. Some traversals have a finite already-built plan; external API concurrency may be governed by providers. What transfers is the requirement to identify the real owner and bound, not a prohibition based on syntax.

## Implications for the existing GM design

The reviewed projects support the current split: inert common preparation and exact application bindings remain in GM; native resource construction stays in Effect; workload, caches, durable state and shutdown decisions remain in the consuming application. None provides evidence that GM needs a universal Task/Scope abstraction, one runtime per module, a new event bus or a second provider registry.

The strongest additional guidance is about **what a limit or completion actually measures**. The existing guide already covers configuration identity, ownership, signal propagation, streams, worker failure and cleanup causes. Expand its existing rules rather than create a parallel handbook:

1. Under fan-out: distinguish module inventory, graph-build breadth, active instances, claim loops, outstanding external work, waiters and retained bytes. A timeout on waiting does not remove the work from the capacity accounting.
2. Under streams: count queued and in-flight unacknowledged data; separate replaceable state from events that require replay. A declared queue bound is not an end-to-end buffer proof.
3. Under cleanup: a soft wait limit, an attempted hard cancellation and completed physical release are separate observations. Preserve the actual promised result.
4. Under typed contracts: a product's choice to widen provider errors or treat acquisition failure as a defect is not a generic integration policy.
5. Keep these as criteria and narrow recipes. Do not add runtime mechanisms without a named consumer needing them.

## Candidate verification questions for the GM audit

These are proposals to compare with current coverage, not a mandate to duplicate existing tests.

| Boundary | Useful observation | What it would not establish |
| --- | --- | --- |
| Fresh mapper Layer per call | Same prepared graph plus different borrowed inputs/native R does not cross-contaminate even under a shared native memo map | Correctness of private Layers deliberately cached by a factory |
| Shared provider within one build | Diamond consumers share one resource, and both finalizers can still use it before its single release | Application-level tenancy or workload admission |
| Independent graph breadth | Construction counts/timing/peak resource acquisition across specified breadth and depth; record OS/runtime and graph shape | Thousands of live sessions or bounded network/database concurrency |
| Typed fake inventory | Fake omits real private dependencies and narrows construction requirements honestly | A global override facility or arbitrary hot replacement |
| Failure while closing | Independent releases attempted and native Cause preserved according to the supported Effect contract | Durable cleanup debt, retry, or physical foreign-I/O termination |
| Consumer overload | All retained stages and actual in-flight work stay within the product's declared budgets | A guarantee supplied automatically by GM compilation |

No code change in GM is justified **solely** by resemblance to a successful external project. The internal architecture audit and reproductions should decide whether a mechanism needs changing. The source comparisons mainly strengthen the existing guide and define honest scaling evidence.

[ls-version]: https://github.com/livestorejs/livestore/blob/54e5a23a29e2c48a8abeff2253fb314767c4243a/pnpm-workspace.yaml#L30-L42
[ls-registry]: https://github.com/livestorejs/livestore/blob/54e5a23a29e2c48a8abeff2253fb314767c4243a/packages/@livestore/livestore/src/store/StoreRegistry.ts
[ls-shutdown]: https://github.com/livestorejs/livestore/blob/54e5a23a29e2c48a8abeff2253fb314767c4243a/packages/@livestore/livestore/src/store/create-store.ts
[ls-pull]: https://github.com/livestorejs/livestore/blob/54e5a23a29e2c48a8abeff2253fb314767c4243a/packages/@livestore/common/src/leader-thread/LeaderSyncProcessor.ts#L970-L1055
[ls-registry-tests]: https://github.com/livestorejs/livestore/blob/54e5a23a29e2c48a8abeff2253fb314767c4243a/packages/@livestore/livestore/src/store/StoreRegistry.test.ts
[t3-version]: https://github.com/pingdotgg/t3code/blob/fc2b5de20cb572d2333e03284466e3c804d25c84/pnpm-lock.yaml#L332-L342
[t3-guide]: https://github.com/pingdotgg/t3code/blob/fc2b5de20cb572d2333e03284466e3c804d25c84/docs/internals/effect-services.md
[t3-layer]: https://github.com/pingdotgg/t3code/blob/fc2b5de20cb572d2333e03284466e3c804d25c84/apps/server/src/orchestration-v2/runtimeLayer.ts#L219-L242
[t3-budget]: https://github.com/pingdotgg/t3code/blob/fc2b5de20cb572d2333e03284466e3c804d25c84/apps/server/src/orchestration-v2/LiveStreamBudget.ts#L18-L240
[t3-budget-tests]: https://github.com/pingdotgg/t3code/blob/fc2b5de20cb572d2333e03284466e3c804d25c84/apps/server/src/orchestration-v2/LiveStreamBudget.test.ts
[t3-worker]: https://github.com/pingdotgg/t3code/blob/fc2b5de20cb572d2333e03284466e3c804d25c84/apps/server/src/orchestration-v2/EffectWorker.ts#L945-L1028
[t3-outbox]: https://github.com/pingdotgg/t3code/blob/fc2b5de20cb572d2333e03284466e3c804d25c84/apps/server/src/orchestration-v2/EffectOutbox.ts#L328-L379
[al-version]: https://github.com/alchemy-run/alchemy/blob/21c601276a5c34eeb25bd7dc81dcca03be9e72eb/pnpm-workspace.yaml
[al-dual]: https://github.com/alchemy-run/alchemy/blob/21c601276a5c34eeb25bd7dc81dcca03be9e72eb/packages/alchemy/src/Local/ProviderLayer.ts
[al-mode-tests]: https://github.com/alchemy-run/alchemy/blob/21c601276a5c34eeb25bd7dc81dcca03be9e72eb/packages/alchemy/test/provider-mode.test.ts#L67-L126
[al-apply]: https://github.com/alchemy-run/alchemy/blob/21c601276a5c34eeb25bd7dc81dcca03be9e72eb/packages/alchemy/src/Apply.ts
[al-provider]: https://github.com/alchemy-run/alchemy/blob/21c601276a5c34eeb25bd7dc81dcca03be9e72eb/packages/alchemy/src/Provider.ts
[al-destroy-tests]: https://github.com/alchemy-run/alchemy/blob/21c601276a5c34eeb25bd7dc81dcca03be9e72eb/packages/alchemy/test/destroy-robustness.test.ts
[gm-adr]: https://github.com/agent-teams-ai/get-modular/blob/0ff54371967e4b56a9978f784f568a48731a324d/docs/decisions/0043-plan-optional-native-effect-composition.md
[gm-guide]: https://github.com/agent-teams-ai/get-modular/blob/0ff54371967e4b56a9978f784f568a48731a324d/packages/effect/docs/practices.md
