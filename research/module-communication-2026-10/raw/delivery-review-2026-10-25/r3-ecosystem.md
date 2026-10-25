# R3: streams, delivery and Get Modular's responsibility

Independent ecosystem researcher; 2026-10-25. Read-only research. No other researchers' reports were consulted. This is a source audit and design recommendation, not a passing consumer qualification or bundle benchmark.

## Executive judgment

The earlier implication that the absence of a queue/stream engine is a major defect in modularity was too broad. A typed function call, a state facet and an occurrence notification are different contracts. Get Modular can compose all three without implementing their execution engine. The design question is which recurring contract the library can improve while retaining one owner for resources and application policy.

I recommend preserving Core/Assembly, using existing Resources for the integration edge, and shipping a clear executable stream-integration recipe before adding another runtime. A new optional event leaf can become justified by a real repeated need for noncoalesced multi-subscriber notifications. A queue, worker pool, broker, workflow engine and durable payment protocol do not follow automatically from that need.

The strongest counterevidence is the actual customer: payments-sdk deliberately separates replaceable purchase state from durable evidence delivery. Its projection awaits physical settlement of its uncancellable read; its payment runner already owns the durable delivery protocol behind an optional selected transport. Replacing either with a generic GM stream would not fix an observed defect.

## Source pins and scope

- Get Modular: `081ae02b49123e14121e100eccfe99f2e74c3600`.
- payments-sdk: `40e61f82c6f645e6b42116c0499925a5457adb2d`.
- Effect source: `16fe80030612e3d549ab5aa63a36e2125fdfea6e`; package manifest says `4.0.6`.
- Wonka: `9c28bb0ff8ac51bfceb774d5adde01c16c35ebd6`; published tag `v6.3.6`.
- mitt: `6b41670516ed8e8b738612f60491995470aa63b3`; manifest `3.0.1`.
- RxJS historical released reference: tag `7.8.2`, commit `e5351d02e225e275ac0e497c7b66eaa5f0c88791`. Separately checked current master `54796b38a57e6309f9861e174737479bb3f63f61`, whose manifest is `9.0.0-beta.0`. Do not silently mix the two API generations or call the old example a latest-version recommendation.
- WHATWG Streams reference: `312b67e396a8511a2a984eb90ce4b2e00283c366`.
- VS Code: `60f133500f1eb475d9f6368b383ff24d828f9ca2`.
- Nest event-emitter source: `2eb15a748914f039b3e532be5ae6b53a686e03b6`.

## What is and is not difficult inside one process

For ordinary synchronous notification, the mechanism can indeed be small: subscribe, call listeners, unsubscribe. No networking, serialization, broker, distributed clock or durable acknowledgement is necessary merely because two modules communicate.

The complexity begins when a listener awaits. The producer can keep sending while earlier work is unfinished. If arrival exceeds completion over a sustained interval, retained work grows. Bounded memory, lossless delivery and a producer that never waits cannot all be guaranteed for an unbounded producer and slower consumer; choose which contract changes. Multiple consumers additionally require a decision about slow subscribers, partial acceptance and failures. Cancellation requests also do not prove that a database/SDK promise has stopped using its borrowed resources.

None of this proves that every application needs a queue. A synchronous listener may be sufficient. A command may simply return a promise which its caller awaits. A display may only need the newest state. The needed guarantee should determine the mechanism.

Get Modular already states that factories do not emit or await another module's future, and prefers calls over one-reactor events. Events do not remove dependency edges; a global bus can merely hide them. See [communication findings](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/research/module-communication-2026-10/findings.md#2-the-module-communication-rules).

## Six issue decisions: exactly three ranked options each

### P1 — Do we need an occurrence-event or stream feature?

**Evidence:** There is an intentional distinction, not an inability to communicate. The authoring guide already shows a typed `EventsPort` and ownership of its disposer. The current mechanism table distinguishes state, commands and every-occurrence delivery. The research schedules a public event primitive for a real consumer; it does not qualify a current implementation. See [EventsPort recipe](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/docs/guides/module-authoring.md#L903-L968) and [decision table](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/docs/guides/module-authoring.md#L1753-L1770).

**Owner:** A domain owns the meaning and public contract; composition connects ports; an optional mechanism may own subscription bookkeeping. Core does not own business routing.

1. **Keep the runtime unchanged; qualify an existing-library integration recipe.** Use a read-only typed source through a declared slot and register its teardown with the subscriber's Resources. Show optional stream operators at the composition boundary. This demonstrates the user's desired ergonomics without imposing a dependency on every GM consumer. Select only one concrete library for an executable recipe once an actual consumer use case chooses between synchronous notification and async pipelines.
2. **Add a minimal optional event leaf after concrete repeated occurrence demand.** A narrow producer/read-only-consumer split, explicit subscription lifetime, named failures and clear synchronous/deferred semantics. The leaf must not expose a global topic registry, durable delivery or a scheduler by default. Package versus separate entrypoint should follow dependency ownership and required peer identity, not a desire to increase package count. A new package needs the normal admission/contract process and a real consumer in the same delivery.
3. **Use an existing full stream runtime at the application edge.** RxJS for an application already needing its operator model, or Effect when the Host already uses Effect. Put their types behind the consumer's narrow port where appropriate. This offers the richest functionality immediately, but makes the app own the adapter and shutdown semantics. Do not move the runtime into Core.

**Winner now:** 1. No inspected payments-sdk path demonstrates a missing common noncoalescing multi-reactor notification API. Option 2 is plausible, not yet an evidenced priority. Reject a new generic bus introduced solely to match Effect's feature list.

**Validation:** Two equal occurrences remain distinct in the selected occurrence recipe; close detaches; two module instances are isolated; consumers only receive read authority; thrown listener errors follow the stated policy. Do not write a public mechanism before stating whether emit means attempted, accepted, delivered or processed.

### P2 — Queues, backpressure, in-flight work and waiting publishers

**Evidence:** A library name or `concurrency: N` is not a total memory bound. RxJS 7 `mergeInternals` buffers excess source values, and `concatMap` explicitly warns about an unbounded waiting buffer. Current RxJS 9 master retains the same relevant distinction in its `mergeMap` array. Effect bounded Queue separates its messages from a pending-offers set. See [RxJS 7 implementation](https://github.com/ReactiveX/rxjs/blob/e5351d02e225e275ac0e497c7b66eaa5f0c88791/src/internal/operators/mergeInternals.ts#L31-L53), [concatMap caveat](https://github.com/ReactiveX/rxjs/blob/e5351d02e225e275ac0e497c7b66eaa5f0c88791/src/internal/operators/concatMap.ts#L24-L40), [RxJS 9 implementation](https://github.com/ReactiveX/rxjs/blob/54796b38a57e6309f9861e174737479bb3f63f61/packages/rxjs/src/merge-map.ts#L17-L49), [Effect pending offers](https://github.com/Effect-TS/effect/blob/16fe80030612e3d549ab5aa63a36e2125fdfea6e/packages/effect/src/Queue.ts#L2065-L2080).

**Owner:** Producer/consumer admission and the concrete async worker. A state projection's bounds remain Observation's responsibility. No evidence establishes an unbounded queue in GM Core because Core does not supply one.

1. **Do not add buffering when the interaction does not need it.** Await a direct command, use a synchronous notification for bounded synchronous work, or use existing latest-only Observation for state convergence. This is the smallest implementation and makes completion explicit.
2. **Select an existing queue/stream at the Host edge with an explicit load contract.** Bound producer concurrency and active handlers as well as buffer capacity; choose reject, wait, drop or coalesce intentionally. Effect is a good candidate if already used. Native pull iteration works if the source actually honors pull. No new GM runtime dependency is required.
3. **Implement a finite admission primitive only for an uncovered common contract.** Prefer a simple `tryOffer` result over an unbounded list of suspended publishers; layer producer waiting only if necessary and separately bounded. Qualify total retained work and fan-out semantics, not just queue length. This is a new async-delivery concern, so keep it outside Core and justify its maintenance cost against existing libraries.

**Winner now:** 1 for the demonstrated payment projection; 2 when an actual async noncoalescing consumer appears. Option 3 does not earn admission merely because every external option requires a few lines of configuration.

**Validation:** Block physical handlers and flood a finite test source; inspect queued, active and waiting work independently; verify the declared overflow result, ordering and error path. A bound on items is not a byte bound unless payload size is separately constrained. Test only the introduced contract, not an invented universal overload subsystem.

### P3 — Cancellation, shutdown, acceptance and errors

**Evidence:** Existing GM guidance already requires unsubscribe before drain before dependency close and allows wrapping external disposers. payments-sdk explicitly retains an uncancellable read until physical settlement rather than racing it against AbortSignal. That is successful counterevidence, not a missing GM task runtime. See [CMS resource rules](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/docs/architecture/common-assembly.md#L170-L220) and [payment projection](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/packages/payments-get-modular/src/features/purchase-observation/composition/purchase-projection.ts#L20-L43).

**Owner:** Resources owns registered cleanup mechanics. The consumer owns physical work and borrowed-dependency lifetime. A stream adapter owns its teardown; application policy owns retry and acknowledgement.

1. **Reuse Resources at the existing composition edge.** Register subscription teardown and retain the actual task-settlement promise when work is asynchronous. Make the stop-admission, unsubscribe, drain, release sequence explicit in the recipe. No second scope controller, implicit worker manager or generic retry engine.
2. **Offer one narrow adapter integration for a selected runtime.** For RxJS/Wonka, scope-close unsubscribes; additionally retain physical operations that unsubscribe cannot cancel. For Effect, one Host-owned runtime and a scoped child program can be bridged to Resources; a failed/interrupted fiber must not be mistaken for proof that a foreign SDK operation stopped. Keep this an optional integration with a named owner.
3. **Add an owned async-consumer helper only if repetition is demonstrated.** It can centralize admission, named errors and drain for a proven contract. It must not turn `Resources` into a scheduler, hide pending physical work, or authorize retrying effects. A helper that merely wraps a four-line disposer registration is not enough benefit.

**Winner now:** 1. Strengthen documentation and an actual integration boundary; do not redesign resource scope semantics that already cover the needed custody.

**Validation:** Close during handler execution; cancellation ignored by a dependency; thrown handler; shutdown reentry; no new work after detachment; close remains pending until physical settlement. Publish acceptance, callback return and business completion must have distinct wording wherever they differ.

### P4 — Diagnostics and executable evidence

**Evidence:** GM already names subscriptions, reports errors and has scope debt; payment composition preserves diagnostic causes and validates physical drain. New event diagnostics would be valuable only for an actual event mechanism. Existing research identifies factory-start/settle instrumentation as a proposal, not an accepted general task system.

**Owner:** Each mechanism owns truthful local diagnostics; the Host owns health policy and external telemetry.

1. **Add focused executable evidence for the selected integration recipe.** Prove detachment, independent instances, error policy, exact occurrence versus coalesced state and physical drain. Include a non-success assertion so a no-op adapter cannot pass. Reuse existing scope/error channels; explain what a passing test does and does not establish.
2. **Add optional local instrumentation where an identified diagnosis is currently impossible.** Examples: the selected channel's buffer/active count or a start/settle callback naming a hung factory. Instrumentation must be non-authoritative, bounded and must not let reporting errors change business execution.
3. **Leave runtime diagnostics unchanged and publish a contract-focused research decision.** Appropriate if no runtime change is selected and current tests already cover the scenario. Keep deferred work named with triggers rather than creating a generalized observability framework.

**Winner now:** 1 if there is a selected executable adapter/recipe; otherwise 3. Instrumentation requires a demonstrated question it answers.

**Validation:** Run the normal owning gates for any new test/source; use controllable promises or deterministic pumps rather than timing sleeps. Qualify one real consumer before claiming consumer E2E. No need for a new broad benchmark suite or telemetry dependency.

### P5 — Parallel Assembly construction

**Evidence:** Current Assembly deliberately runs sequentially in dependency order and has defined journals/failure behavior. No inspected source or customer measurement establishes startup throughput as the blocking issue. [Current execution contract](https://github.com/agent-teams-ai/get-modular/blob/081ae02b49123e14121e100eccfe99f2e74c3600/docs/architecture/common-assembly.md#L1232-L1246).

**Owner:** Assembly owns the construction contract; Host owns independent startup tasks and resource retention. An event discussion does not authorize changing the graph execution guarantee.

1. **Keep sequential construction; profile a real startup first.** Preserve deterministic failure and cleanup integration. Many module declarations alone are not evidence of slow independent asynchronous initialization.
2. **Parallelize genuinely independent Host-owned acquisitions inside their established ownership boundary.** Use the existing resource setup/cleanup contract and await every started acquisition's settlement on failure. Do not disguise a second assembly engine as a convenience helper or use early Promise rejection as proof that sibling work stopped.
3. **Introduce explicitly bounded DAG construction through a successor contract if profiling proves it useful.** Define deterministic diagnostics, failure admission cutoff, all-started-task settlement, journal order and resource ownership before implementing. This is a separate feature/PR from streams.

**Winner now:** 1. There is no evidence-backed need to implement 3 in this delivery.

### P6 — Durable delivery, replay and out-of-process messaging

**Evidence:** payments-sdk already has transactional wake-up transport contracts, optional pg-boss selection, consumer receipt validation and producer acknowledgement. The transport is not the authority for payment completion; removing transport rows does not erase payment obligations. This is the correct responsibility boundary, not a reason to reproduce it in GM. [Customer transport contract](https://github.com/agent-teams-ai/payments-sdk/blob/40e61f82c6f645e6b42116c0499925a5457adb2d/docs/queue-transport.md#L1-L63).

**Owner:** Application/domain delivery contract and its storage/infrastructure adapter. GM assembles the selected implementation.

1. **Reuse the existing customer durable protocol; make no GM persistence change.** Keep ordinary in-process streams for nonauthoritative notifications and read projections. Rebuild a projection by querying its owner when that is the promised behavior.
2. **Select an existing persistence/workflow implementation behind a dedicated app port when a new consumer requires crash survival.** Effect has a separate PersistedQueue facility; a database queue is another possible adapter. Its receipt, transaction, idempotency and recovery semantics must be matched to the use case. Do not substitute a plain PubSub for that protocol.
3. **Extract a separate delivery library only for a demonstrated shared semantic contract.** It may share an organization or monorepo, but has a separate owner and optional dependency graph. Keep domain-specific authority in the application. Different acknowledgement meanings should not be compressed into one universal generic event bus for DRY.

**Winner now:** 1. Network serialization and a broker are unnecessary for the user's ordinary one-process modules. Option 3 is justified by shared semantics, not similar method names.

## Existing tools: what they really provide

| Tool/profile | Useful capability | Relevant limit | Sensible GM relationship |
| --- | --- | --- | --- |
| Typed callback/port + Resources | Minimal notification and explicit lifetime | Async callbacks require their own work/error contract | Current default; no dependency |
| Native AsyncIterable | Sequential async pull interface, early-exit cleanup protocol | Interface alone gives no multicast, queue capacity, physical cancellation or durable ACK | Domain-specific read source or adapter; zero package dependency |
| Native Web Streams | Portable stream pipelines and cooperative backpressure | `tee` can continue pulling for the fast branch and enqueue for a slow one; HWM is not a universal hard cap | Good for existing IO pipelines, not a ready arbitrary-module event bus |
| Node EventEmitter/events.on | Familiar listeners and async iteration | Listener return values are ignored; events.on watermarks require an emitter with pause/resume | Node-specific integration only, not cross-platform GM core |
| mitt 3.0.1 | Small typed event map and synchronous fan-out, no runtime deps in inspected manifest | No async ownership/bounds/error isolation; a thrown callback stops normal synchronous dispatch | Optional app emitter when those semantics suffice |
| Wonka 6.3.6 | Push/pull sources, map/filter and composition, no runtime deps, sideEffects:false | A hot subject is synchronous push; sources can ignore pull; no first-class error channel | Strong lightweight stream-composition candidate behind a typed port |
| RxJS 7.8.2 reference | Rich operators, Observable composition, subscription teardown | Bounded merge concurrency can still retain unbounded pending values; unsubscribe cannot magically stop an arbitrary promise | Optional app integration when rich operators are actually used |
| RxJS 9 master snapshot | New platform-observable-oriented API; same checked merge queue distinction | Beta snapshot has changed imports/API, polyfill dependency and side effects | Not a versionless compatibility assumption or immediate new dependency |
| Effect 4.0.6 | Queue, PubSub, Stream, scope/fiber composition; zero external runtime deps in manifest | A full execution model; queue capacity does not independently bound all pending producers or foreign physical work | Good optional Host adapter if Effect already selected; no mandatory GM runtime |

No installed-size, minified-size, load-time or performance measurement was run. A manifest with no runtime dependencies does not mean zero shipped code or zero integration cost. Native Observable availability is not assumed for Node or every browser.

Primary implementation evidence:

- [Wonka manifest](https://github.com/0no-co/wonka/blob/9c28bb0ff8ac51bfceb774d5adde01c16c35ebd6/package.json), [subject implementation](https://github.com/0no-co/wonka/blob/9c28bb0ff8ac51bfceb774d5adde01c16c35ebd6/src/sources.ts#L258-L292), [observable error bridge](https://github.com/0no-co/wonka/blob/9c28bb0ff8ac51bfceb774d5adde01c16c35ebd6/src/observable.ts#L117-L159).
- [mitt dispatch](https://github.com/developit/mitt/blob/6b41670516ed8e8b738612f60491995470aa63b3/src/index.ts#L93-L121).
- [RxJS 7 manifest](https://github.com/ReactiveX/rxjs/blob/e5351d02e225e275ac0e497c7b66eaa5f0c88791/package.json), [RxJS 9 manifest](https://github.com/ReactiveX/rxjs/blob/54796b38a57e6309f9861e174737479bb3f63f61/packages/rxjs/package.json).
- [WHATWG reference tee algorithm](https://github.com/whatwg/streams/blob/312b67e396a8511a2a984eb90ce4b2e00283c366/reference-implementation/lib/abstract-ops/readable-streams.js#L347-L427).
- [Node events API](https://nodejs.org/api/events.html#eventsonemitter-eventname-options); inspected documentation v26.12.1.
- [Effect manifest](https://github.com/Effect-TS/effect/blob/16fe80030612e3d549ab5aa63a36e2125fdfea6e/packages/effect/package.json), [PubSub publisher waiting list](https://github.com/Effect-TS/effect/blob/16fe80030612e3d549ab5aa63a36e2125fdfea6e/packages/effect/src/PubSub.ts#L2568-L2604), [PersistedQueue official v4 API](https://effect.website/docs/v4/api/effect/persistence/PersistedQueue).

## Lessons from modular frameworks

VS Code's `Event<T>` is a typed source returning a disposable; its event utilities include map/filter. This supports separating producer authority from consumer subscription and making lifecycle explicit. It is an architectural precedent, not a recommendation to vendor the VS Code internal event implementation or copy every helper. [Typed event and operators](https://github.com/microsoft/vscode/blob/60f133500f1eb475d9f6368b383ff24d828f9ca2/src/vs/base/common/event.ts#L46-L176).

Nest exposes events through an optional module backed by EventEmitter2. Its docs explicitly warn that startup events can be missed before listeners register; the loader removes listeners at shutdown. Learn that lifecycle readiness and subscription ownership need a contract. Its default global registration and declarative discovery do not fit GM's explicit dependency graph and should not be copied. [Nest official events guide](https://docs.nestjs.com/application/events), [loader lifecycle](https://github.com/nestjs/event-emitter/blob/2eb15a748914f039b3e532be5ae6b53a686e03b6/lib/event-subscribers.loader.ts#L47-L61).

Effect demonstrates that queue/stream interpretation and subscription scope can be composed coherently; it does not imply that every module-composition library should own that execution model. Borrow the semantic distinctions and independent tests. Keep the runtime choice at the Host edge.

## Counterarguments to my recommendation

- **A recipe can leave every consumer to invent subtly different lifetime glue.** True. If the same source/lifetime contract appears in several real modules, the measured repetition can justify one optional reusable adapter or event leaf now rather than several app-local clones. First identify identical semantics; matching `subscribe` names alone is not enough.
- **Current ports may be too low-level for agents writing many modules.** True. A type-first public source that requires the subscriber scope could be useful. It should be proven against an actual consumer and misuse tests, not inferred from Effect's larger API.
- **An external stream library still needs wrappers, so a custom implementation could be smaller.** Sometimes. Count the lifecycle/error/reentrancy/overload contract and long-term tests, not just emit's loop. If only synchronous notifications are needed, avoid bundling a queue and worker pool into that custom implementation.
- **Making a separate package solves all ownership issues.** False. Packaging controls dependency installation; it does not establish semantic responsibility. A separate package can still become a second lifecycle authority or hide dependencies.

## Proposed useful delivery to the implementation owner

Choose a narrow executable recipe/fixture showing a declared occurrence source and optional stream composition with subscriber-owned lifetime, alongside an explicit state/command/occurrence/durable decision table. Reuse the authoritative existing guide rather than creating a competing communication standard. Ground any generic helper in a real repeated need found by the consumer audit. If no such need is found, the honest result is a documentation/qualification PR and deferred event runtime, with the earlier comparison corrected.

Do not implement parallel Assembly, durable messaging, generic retries, global buses or a universal scheduler in the event PR. Those are distinct contracts with no demonstrated need in this audit.
