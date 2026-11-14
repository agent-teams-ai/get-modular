# Effect integration practices

The native package and its
public API are implemented under [ADR-0043](https://github.com/agent-teams-ai/get-modular/blob/main/docs/decisions/0043-plan-optional-native-effect-composition.md).
The initial release uses **Effect 4.1.4** and matched Core/Assembly 0.8.0;
the package README explains the source candidate and version requirements.
The current [Consumer Module Standard](https://github.com/agent-teams-ai/get-modular/blob/main/docs/architecture/common-assembly.md#consumer-module-standard)
owns GM authoring policy. Native and Promise construction retain different
execution contracts.

The [implementation evidence](https://github.com/agent-teams-ai/get-modular/blob/main/research/effect-integration-2026-11/README.md#implementation-candidate)
separates current public-package tests, the frozen [spike evidence][gm-spikes] and
future named-product adoption. Fragments below use pre-existing named values;
the README and maintained public type/runtime fixtures supply complete examples.
The [architecture and scale audit][gm-audit] adds current source studies of
OpenCode, LiveStore, T3 Code and Alchemy, measured graph/type fixtures and their
limits. It does not qualify an application's concurrent workload.
The [production failure study][gm-production] connects actual upstream fixes to
deterministic library checks and the application responsibilities they cannot prove.
The [subsequent production review][gm-production-review] adds mixed-inventory
bounds, ownership in graphs with repeated diamonds, factory-product rejection and further
upstream lessons about identity, cache isolation and installed dependencies.

## Mistakes to catch first

| Mistake | Correct approach |
| --- | --- |
| Merge a fake Layer into a closed live graph and assume live resources are gone | Select a typed composition variant before preparation; [rule 2](#2-give-inter-module-selection-one-authority) |
| Treat shared Layer identity or a cache reference count as a complete lifetime guarantee | State configuration, cache domain and resource/work owners separately; [rules 3](#3-preserve-native-construction-and-exact-provider-sharing) and [4](#4-state-who-owns-resources-and-who-owns-work) |
| Restore a captured Context together with an old Scope | Keep the active operation owner; [rule 4](#4-state-who-owns-resources-and-who-owns-work) |
| Close a private resource Layer when its factory returns a capability | Build it in the factory's construction Scope; [private Layer recipe](#keep-private-resource-layers-in-the-factory-scope) |
| Return a Stream from a scope that already released its resource | Own acquisition through consumption/finalization; [rule 7](#7-own-streams-through-consumption-and-finalization) |
| Discard the Effect signal at a Promise/SDK boundary | Forward cancellation and preserve caller signals; [rule 8](#8-forward-cancellation-to-foreign-io-and-document-its-actual-guarantee) |
| Make resource acquisition interruptible to shorten shutdown without handling late results | Protect the acquisition-to-release handoff and state the cancellation contract; [acquisition recipe](#cancellation-during-resource-acquisition) |
| Discard cleanup failures or treat interrupted waiting as physical cleanup | Preserve causes and the promised close outcome; [rules 9](#9-keep-expected-failures-defects-and-interruption-distinguishable) and [10](#10-preserve-cleanup-evidence-without-inventing-retry-guarantees) |
| Use listing order or one runtime per module as hidden coordination | Keep native calls connected and sequence application startup explicitly; [rules 5](#5-preserve-the-native-operation-chain-and-caller-context) and [11](#11-bound-fan-out-and-make-detached-work-deliberate) |
| Treat an outer operation limit as a limit on every resource opened inside its graph | Bound expensive acquisition at its owner; [rule 11](#11-bound-fan-out-and-make-detached-work-deliberate) |
| Treat a valid dependency DAG as proof that shutdown cannot deadlock | Check resource retention and finalizer wait relationships; [rule 4](#4-state-who-owns-resources-and-who-owns-work) |

## 1. Abstract subject-specific capabilities at replaceable boundaries

Define a consumer-owned `SearchPort`, `StoragePort` or other narrow capability
where consumers must remain independent of its implementation. Keep the complete
neutral contract free of Effect types, including options and callback types.
Pure domain rules and data do not need a runtime dependency.

Explicitly Effect-native technical ports may return real `Effect` or `Stream`.
Do not force every internal module through a Promise facade. A `Task` type alias
does not remove Effect coupling. Do not introduce universal Task/Fiber/Scope APIs.
Follow the existing [composition-boundary rule](https://github.com/agent-teams-ai/get-modular/blob/5fb83478dd7b95216be92c4d3077eddf2774eef8/docs/architecture/common-assembly.md#new-composition-boundaries):
bounded contexts, GM entries, private Effect services and Scopes are not one-to-one.
Declarations belong in the outer adapter. A GM root is a Host entrypoint, not a
service locator for neighboring modules; inject their narrow capabilities instead.
These boundaries support Clean Architecture and DDD; a library cannot establish
correct domain boundaries or SOLID compliance by itself.

## 2. Give inter-module selection one authority

GM bindings select other application modules through declared local slots.
Factories receive the closed dependency record selected by that composition.
Private implementation Layers and explicit request, transaction and tracing
context can remain native Effect mechanisms.

Do not additionally select undeclared neighboring business services from a global
Context bag. `R = never` proves neither context independence nor resource lifetime;
optional lookups and References can still observe context. The architectural rule
is about ownership and declared dependencies, not banning every nonempty `R`.

Use the same authority when replacing dependencies in tests:

| Replacement | Where to make it |
| --- | --- |
| Provider of a GM slot | Choose the fake entry and a matching inventory/profile before `prepare()` |
| Explicit ambient native R | Provide the fake with ordinary `Layer.provide` |
| Entire root for a test of its consumer | Provide a fake root without including the live GM graph |
| Private native service inside one implementation | Replace it in that implementation's own assembly/test |

`Layer.provide` cannot replace an already closed GM-selected provider; merging a
fake root with a live Layer can still acquire the live resources. A fake with a
different dependency tree needs a valid new inventory/profile: Core rejects
[unreachable selections](https://github.com/agent-teams-ai/get-modular/blob/c81fb21766e27cf3535132ec2fc2cfd396497a96/packages/core/src/features/composition-semantics/semantic-analysis.ts#L21-L36).
This is not OpenCode-style automatic pruning. A new typed GM catalog may change
construction E/R if its prepared type reports that honestly; preserve the consumed
capability/operation contracts, without adding another override-contract API.

### Typed live and fake variants

Reuse the application's declarations and feature entries. Select the complete
live or test inventory before calling the native preparation API:

```ts
const liveModules = [appEntry, liveRepositoryEntry, databaseEntry] as const;
const testModules = [appEntry, fakeRepositoryEntry] as const;

const testPreparation = await effectFor<AppMap>().prepare({
  profileId: "example/test",
  modules: testModules,
  roots: { app: appEntry },
});
```

The sketch assumes uniquely inferable required bindings; explicit optional/many
or alternative bindings still follow the normal composition contract. The fake
preserves the capability consumed by `appEntry`. Its inventory omits the private
database and declares only the inputs it actually needs. The native API must infer
construction E/R and required input N from that selected typed variant. If runtime
choice produces a union, narrow the variant before preparing/executing it, or
honestly accept a common environment. Do not hide missing requirements with casts.

Automatic pruning of a broad catalog is not enough: conservative types may still
require the removed database's Config in R and its borrowed inputs in N. A wider
E is a different cost from an unusable R/N contract. The first package uses these
ordinary typed composition functions, with no replacement chains or new registry.
A reusable projection helper remains a candidate for shared neutral preparation;
it must prove useful public typing and actual omitted acquisition before admission.

## 3. Preserve native construction and exact provider sharing

The mapper validates the complete composition before acquisition and
translates the selected graph into native Layers. Preserve factory `E` and `R`
where their types actually establish them. A serialized plan alone cannot recover
TypeScript errors or value types; use its matching declarations and factories.

Two local slots of the same capability may choose different providers. Preserve
that distinction; one global Context key cannot represent both bindings. Share one
selected implementation within its intended build.
Keep stable Layer identities within each intended memoization domain. Do not
rebuild a diamond dependency once per incoming edge.
Qualify graph shapes as well as node counts. Repeated diamonds can traverse many
paths while acquiring each leaf only once. Effect's [composed-Layer correction][effect-composed-memo]
memoizes the composed parent; it is present in the qualified peer. The maintained
repeated-diamond graph test checks identity and resource ownership, not a complexity
or latency bound. To intentionally refresh a whole native subtree, place
`Layer.fresh` around that composed Layer; an interior fresh dependency can still
belong to a shared parent.
Every `.layer()` call creates fresh mapper-owned Layer
identities; reuse its returned Layer when sharing those nodes is intentional.
This prevents mapper-owned memoization from aliasing different inputs or ambient R
even inside one shared memoization domain. Caching one implementation Layer can capture the first input
for both branches; see the [paired experiment][gm-input-probe].
This does not refresh private Layers captured inside a factory or clone borrowed
or caller-owned services. Their author controls native identity, configuration and
sharing. Distinct configuration may require distinct native Layers or deliberate
native `Layer.fresh`; the mapper must not recursively impose its own cache policy.

A new Scope alone does not establish request isolation when it shares a longer
lived MemoMap. Effect's [Atom registry correction][effect-registry-memo] isolates
the default map by registry while retaining explicitly shared maps. Name which
state may be shared and who owns that map; do not recreate application resources
per request merely to avoid reasoning about their ownership.

Keep implementation identity, graph-local service identity and serialized cache
identity distinct. At an application cache or hydration boundary, include its
owning service and encode composite keys unambiguously. The [mutation-key fix][effect-mutation-keys]
checks destination, payload and result across services with identical endpoint
names. A random key is unsuitable when server and client need the same stable
identity. This does not imply a collision in GM's closed private Layer contexts.

Fresh mapper identity does not allocate fresh arbitrary factory state.
`Effect.succeed(existingValue)` returns that same value on each execution;
allocate per-instance mutable state during its owned acquisition when isolation
is required. Cold/hot subscription behavior similarly belongs to the stream
author, not to the number of calls to `.layer()`.

After a failed or interrupted build, a new native provision with its own Scope
and memoization domain can rebuild the same returned Layer. This is different
from reusing a failed build inside one shared MemoMap, or restarting a disposed
runtime. Keep the retry boundary explicit; reacquisition is not rollback of an
external write and does not make that write safe to repeat. The
[lifecycle regressions][gm-lifecycle-tests] exercise fresh builds after both
failure and interruption, with distinct real FileHandles and no stale root use.

Current Promise Assembly wrapped in `tryPromise` remains Promise construction.
It does not become native Layer acquisition or gain typed construction errors.
[OpenCode LayerNode][oc-node] demonstrates policy compiled into native Layers,
without making its object-identity replacement policy the GM binding protocol.

## 4. State who owns resources and who owns work

Acquire a resource and register its release together. Its native Layer/Scope owns
that resource; the Host owns ingress, shutdown policy and execution admission.
These responsibilities can be nested without independently disposing the same
resource from GM Resources and Effect.
Install ownership before a later validation step can fail, and before handing
the resource to background work. A finalizer placed only inside the worker body
cannot protect a resource if that worker never starts. Upstream HTTP-upgrade and
stream-worker fixes in the [industry study][gm-industry-failures] demonstrate both
handoff gaps; they are already fixed in the qualified Effect peer.
Host is an ownership role at the application's existing execution boundary;
`Effect.provide`, `Effect.scoped` or a chosen `ManagedRuntime` can serve it. No new
GM Host runtime is required. When carrying service context across a boundary,
retain the active operation Scope rather than accidentally restoring a stale
construction Scope; see [OpenCode's instance context][oc-instances].
Borrowed inputs keep their external owner; merely injecting them does not register
automatic release. That owner must outlive the Layer and the work using them.

Keep resource-using operations and their finalizers inside a lifetime that retains
the resource. A captured service run by an unrelated root runner is not
automatically tracked by the service owner's ManagedRuntime. TypeScript does not
revoke escaped objects. A scoped callback alone cannot prevent every escape.

A construction DAG does not rule out reference-count or finalizer wait cycles.
For example, a cached child must not retain an owner Layer whose shutdown waits
for that child. Borrow already-owned narrow services where that is the intended
relationship. The [OpenCode audit][gm-opencode-audit] examines a failed cache build
after its borrower is cancelled; that consumer-owned cache scenario is distinct
from ordinary module dependency validation.

### Keep private resource Layers in the factory Scope

An implementation can reuse a resourceful native Layer without turning each
private service into a GM entry. Build it in the existing construction Scope:

```ts
const entry = implement<AppMap>()(declaration, () => Effect.gen(function* () {
  const context = yield* Layer.build(PrivateLive);
  const service = Context.get(context, PrivateService);
  return { instance: service, capabilities: { [Port.id]: service } };
}));
```

`Layer.build` uses the active Scope supplied by the mapper's native Layer. Its
construction errors and remaining requirements stay in E/R. Do not wrap only
the creation of a returned resource-using capability in
`Effect.provide(makeProduct, PrivateLive)` or a new `Effect.scoped`: that inner
lifetime can end before the capability's first operation. Providing the complete
resource-using program at the Host boundary, as in the README, remains correct.

Return the narrow capability, not the construction Context. Building a Layer
does not automatically provide that Context to future operations: capture their
needed private services or retain honest operation requirements. Do not restore
the captured construction Scope. Neighboring GM services still arrive through
declared slots; pass those injected values explicitly to the private Layer.
The identity/configuration rules in rule 3 still apply to reused private Layers.

The maintained consumer fixture reads a real FileHandle during an operation and
again in a dependent asynchronous finalizer, then observes the private Layer's
single release. The installed-archive suite runs that same scenario.

### One application owner, two local sessions

Use one application Layer and give each session its own composition Scope. Pass
only the declared shared capability as a borrowed input, not a Context or runtime.
In this sketch, `appLayer` owns the shared resource; `AppRoots` and `SessionRoots`
are native keys. The application function `sessionLayer(shared, config)` creates
a fresh `prepared.layer(SessionRoots, { inputs })` for each captured
configuration. It borrows `shared` and never registers its release.

```ts
const program = Effect.scoped(
  Effect.gen(function* () {
    const app = Context.get(yield* Layer.build(appLayer), AppRoots);
    yield* Effect.forEach(
      [configA, configB],
      (config) => Effect.scoped(
        Effect.gen(function* () {
          const session = Context.get(
            yield* Layer.build(sessionLayer(app.shared, config)),
            SessionRoots,
          );
          yield* Stream.runDrain(session.events);
        }),
      ),
      { concurrency: 2, discard: true },
    );
  }),
);
```

Consumption stays inside each local Scope. The bounded parallel operation joins
its branches before leaving the application Scope. This recipe is fail-fast:
one branch failure interrupts the other. If the product should retain the other
session, handle the expected failure inside the failing branch; do not turn all
defects/interruption into success. Resource-using background work also needs a
scoped owner and an explicit failure-observation policy; see rule 6.

A closed parent inventory cannot select a missing child provider through a slot.
The child profile verifies its declared input boundary; it does not infer the full
cross-composition ownership graph. Host supplies that parent-to-child connection.
For dynamic ingress, Host stops admission, joins its owned operations, then closes
local resources and shared resources in that order. This is not a drain guarantee
for foreign runners or I/O that ignores cancellation. Returning `session.events`
instead of consuming it here would require a different, consumption-owned lifetime.

### Cache only when the application needs it

Repeated lookup by tenant/session key can use a consumer-owned native LayerMap;
the integration does not add a cache, reference counter or eviction policy. Key
identity must include relevant configuration/version, or the consumer must define
invalidation before reusing a key with changed configuration. Capacity, idle TTL
and concurrent-open policy stay with that consumer.

The inspected [LayerMap source][effect-layer-map] marks the module unstable. Keep
its version qualification in the consumer; do not expose it as a required GM type.
Its underlying [RcMap owner finalizer][effect-map-close] closes entries when the
owning Scope closes. Reference counts during normal use are not a promise to join
arbitrary clients during owner shutdown. Native Layer memoization and application
work ownership are separate mechanisms.

## 5. Preserve the native operation chain and caller context

```ts
// Native technical port: the caller controls execution and its context.
const search = (query: Query) => ports.search(query).pipe(Effect.map(toView));

// Avoid this extra execution boundary between cooperating native modules.
const bridged = (query: Query) =>
  Effect.tryPromise(() => runtime.runPromise(ports.search(query)));
```

A deliberate foreign boundary may need the second shape, with explicit error,
cancellation, context and lifetime mapping. An AbortSignal does not carry the
parent Effect context. Keep runners at real execution boundaries rather than
creating one ManagedRuntime per source module. OpenCode's
[transaction implementation][oc-transaction] illustrates why caller context matters.

## 6. Relate background fibers to the resource scope they use

Choose a failure policy as well as a lifetime owner. A native
[`forkScoped`][effect-scoped-fork] returns a Fiber handle; it does not automatically
propagate the worker's failure to the foreground. For work whose lifetime must
end when either participant completes, observe the worker explicitly:

```ts
const program = Effect.scoped(
  Effect.gen(function* () {
    const resource = yield* Effect.acquireRelease(acquire, release);
    const worker = yield* Effect.forkScoped(background(resource));
    yield* Effect.raceFirst(Fiber.join(worker), foreground(resource));
  }),
);
```

This example deliberately uses the [first observed completion][effect-first-exit],
including failure or interruption. Successful worker completion also ends the
foreground; if that is an error for the application, represent it in the worker's
contract. If the foreground finishes first, leaving the outer Scope interrupts
and joins the scoped worker before releasing the resource.

In a sequential scope, registering scoped work after acquiring its resource lets
the scope interrupt and join that work before releasing the resource. An explicit
join before leaving the scope is another valid arrangement. `forkChild` follows
the parent fiber, whose lifetime need not match a nested resource Scope.

The first outcome is not an aggregate of every losing operation's cleanup failure.
Preserve any required worker cleanup evidence separately under
[rule 10](#10-preserve-cleanup-evidence-without-inventing-retry-guarantees).
A nonessential worker may instead report failure while foreground work continues;
make that policy explicit and observe its Cause/Exit. Runtime logging alone does
not decide whether the application should keep serving requests. No new supervisor
or automatic retry API is needed for either policy.

The FileHandle spike observed `EBADF` in a child finalizer after early resource
release, and successful reading with the tested scoped-fork ordering. It qualifies
that resource/fork registration order; the outcome-race sketch above was not part
of that experiment. Neither establishes arbitrary Layer-tree ordering. Parallel
finalizers do not promise dependency order. Do not advertise automatic physical
drain of foreign I/O from fiber completion, even when the native fiber was
correctly interrupted and joined.

## 7. Own streams through consumption and finalization

Returning a lazy Effect, Stream or response body does not finish its work. Avoid
returning a resourceful stream from an acquisition scope that has already closed.
Native `Stream.unwrap(scopedAcquisition)` can tie acquisition to consumption;
test early consumer termination, failure and asynchronous finalization.

Give subscriptions an owner and define delivery semantics. Latest-state
observation, ephemeral multicast and durable delivery are different contracts.
Do not equate GM Observation with Effect PubSub or add a second generic event bus.

### Choose the contract before choosing the primitive

GM abstracts declared dependencies and provider selection, not the semantics of
all communication. A typed slot can carry a neutral callback port or a deliberate
Effect-native technical port. Calling the latter an interface does not make it
independent of Effect. Share plain subject data; do not invent a common
Task/Stream/Scope facade or make every native module cross a Promise boundary.

| Need | Suitable boundary | Guarantee not implied |
| --- | --- | --- |
| Read the authoritative current answer | A subject-specific query port | A state projection is not necessarily the authority |
| Follow replaceable state | Observation or a chosen native state projection | Every intermediate revision, or a processing acknowledgement |
| Receive live occurrences | A typed notification port; native PubSub/Stream in an Effect implementation | Replay to future subscribers or durable delivery |
| Distribute work among handlers | An admitted-work port with a selected queue | Broadcast to every subscriber |
| Ask an owner to perform work | A command port with an explicit result | Successful event publication is not command completion |
| Retain obligations across restart | A domain/Host-owned durable protocol | An in-memory PubSub or Stream is not that protocol |

State the applicable guarantees in the port's documentation: hot versus cold
source, subscription readiness, duplicate handling, ordering, completion/errors,
ownership, buffering and overflow. This is a review checklist, not a new options
object with a switch for every possible behavior. An ordered source does not make
concurrently processed results globally ordered. A readonly type is not a sandbox.

The complete maintained recipes below are consumer examples, not new exports from
`@get-modular/effect`. Their source is strictly checked with the selected peer and
the same cases execute from matched installed public archives. These shared
consumer fixtures belong to the repository qualification owner, not to the
Effect package's runtime dependency set. See the
[recipe tests](https://github.com/agent-teams-ai/get-modular/blob/main/tests/effect-communication.test.ts).
The [plain progress contract and test source](https://github.com/agent-teams-ai/get-modular/blob/main/tests/qualification/effect-communication/progress.ts)
have no Effect imports. The test source illustrates the stated contract; do not
copy it as a new product-wide event bus.

### Native notifications: explicit readiness, separate reader and publisher

Use the [complete native recipe](https://github.com/agent-teams-ai/get-modular/blob/main/tests/qualification/effect-communication/native.ts)
inside an Effect-native provider. The provider owns one bounded PubSub and gives
consumers only its `ProgressEvents` facet. Publication stays with its owning
module or authorized Host; subscribers cannot publish or shut down the source.
The [native composition test](https://github.com/agent-teams-ai/get-modular/blob/main/packages/effect/tests/communication.test.ts)
wires that reader through an ordinary required slot into two modules.

```ts
// Inside the operation retained by the graph's owning Effect Scope:
const events = yield* roots.left.subscribe;
// The subscription is registered now, before the first publication.
yield* roots.source.publisher.publish({ jobId: "example", completed: 1 });
const first = yield* Stream.runCollect(Stream.take(events, 1));
```

The sketch uses names from its Host; the linked fixture supplies full declarations,
composition and root keys. `subscribe` has an honest native Scope requirement.
Each consumer acquires its own subscription and consumes the returned stream
inside that same lifetime. Do not cache that acquired stream and run it from
multiple consumers: that would share one subscription rather than create a new
multicast subscriber. Merely obtaining a lazy Stream does not prove readiness.

There is no replay in this recipe. Two identical payloads are two occurrences.
A bounded source can wait for a slow subscriber; publication confirms admission,
not that every handler finished. Subscriber cancellation releases only its own
subscription. Source shutdown interrupts this recipe's pending reads and subsequent publication
returns `false`; neither is a graceful business-completion event. The Host separately
chooses whether one consumer failure ends the application or is handled locally.
The tests exercise both early successful exit and locally handled failure while
a sibling remains active, and verify that the source stops with its graph.

### Neutral callback source: one owned adapter, explicit overflow

Use the [complete callback adapter](https://github.com/agent-teams-ai/get-modular/blob/main/tests/qualification/effect-communication/callback.ts)
when the source's complete public contract must remain independent of Effect.
Keep the plain `ProgressSource` at that replaceable boundary; the selected adapter
returns a native Stream for native consumers. No mandatory Effect peer is added
to Core, Assembly, Resources or Observation.

```ts
const stream = callbackProgress(borrowedSource, 16);
const program = Stream.runForEach(stream, handleProgress);
// Run program inside its owning application/session Scope, not per callback.
```

Every consumption acquires its own foreign subscription through
`Effect.acquireRelease`. Synchronous emissions during `subscribe` enter an already
created queue. If subscribe throws before returning a disposer, the source must
roll back its own partial acquisition; no adapter can recover an undisclosed
handle. A returned disposer remains owned through early completion, processing
failure and interruption. A throwing disposer remains a native defect. In the
qualified peer, a simultaneous processing failure and disposer failure preserve
both original error objects as defects; without failed cleanup, the processing
error retains its typed failure channel. Inspect the complete Cause rather than
assuming every original error remains a `Fail` after finalization fails. The
recipe preserves native behavior instead of reconstructing an artificial Exit.
No second GM Resources disposer is installed for that same subscription.

This source cannot wait for backpressure. The recipe uses a bounded queue and
turns a refused offer into `ProgressOverflow`, closes admission, and discards its
queued prefix rather than continuing after a known gap. Work already processed
is not rolled back. It neither silently drops occurrences nor starts a detached
fiber for each callback. A consumer needing recovery must query/reconcile through
its actual owner; retrying the subscription does not replay lost facts. For a
pausable source use its real pause/resume contract instead. For replaceable state,
a deliberately latest-only projection is a different valid contract.

The capacity bounds this adapter's pending items, not arbitrary payload bytes,
waiting producers elsewhere or all application work. The source is borrowed and
must outlive consumption. This callback contract has no terminal notification;
the adapter invents neither source completion nor a source-close authority.
Tests cover duplicate synchronous emissions, two subscribers, late callbacks,
acquisition rollback, overflow, handler/teardown failures and interruption.

### Existing Observation: one-way latest-state projection

Use the [complete state bridge](https://github.com/agent-teams-ai/get-modular/blob/main/tests/qualification/effect-communication/state.ts)
only when an existing module already owns the required Observation contract.
For a new entirely native subsystem, choose its native state mechanism directly
when that meets its contract; adding Observation is not a requirement of GM.

The bridge reads a real snapshot, registers `watch` from that revision, and
publishes snapshots into a capacity-one sliding Stream queue. Both Observation
and this projection may combine intermediate states. It follows only the selected
keys and preserves the source's snapshot/revision instead of creating a second
state authority. It is not an event log or an adapter for `load`'s physical drain.

```ts
const snapshots = observedProgress(borrowedReadonlyStore);
const program = Stream.runForEach(snapshots, snapshot =>
  renderProgress(snapshot.values.completed));
```

One native acquisition owns one small GM Resources scope for the watch. Native
finalization closes only that scope and inspects its complete/settled report;
failed cleanup is preserved as a defect with the report, not changed to success
or silently retried. The source store belongs to its original owner. Independent
stream consumers receive distinct watch scopes, and stopping one leaves the other
and the source alive. This is one explicit ownership bridge, not two independent
owners of the same resource or an interchangeable Scope abstraction.

**Precondition:** the source owner outlives the stream consumers.
`ReadonlyStore.watch` has no terminal callback. Unexpected source closure detaches
the watch and reports to the source owner's error port; it does not complete this
Stream. The Host must stop the consumers when retiring that source. A port needing
terminal signaling must specify it explicitly rather than infer it from silence.
Using an already-closed source remains a lifecycle defect.

Do not synchronize writable Observation and SubscriptionRef instances in both
directions. Keep one authority and a one-way projection. Neither the bridge nor a
valid composition DAG proves that all feedback loops are impossible; native
scheduling is not a promise to preserve every Observation async echo guard.
Do not write the watched state back from this projection. Test any deliberate
command/reconciliation feedback in the product that owns it.

The maintained tests check initial/latest values, irrelevant-key updates,
independent watch closure, latest-only buffering for a held consumer, source
lifetime, unexpected source close and failed bridge cleanup. These are Node
qualification cases, not browser parity or a thousand-agent workload claim. SubscriptionRef and Observation are not drop-in
replacements: choose intentionally rather than renaming methods during migration.

For a bounded delivery contract, count all retained stages, including data already
dequeued but awaiting acknowledgement. Bound item count and bytes where payload
size varies; a bounded queue alone is not an end-to-end memory proof. T3 Code's
examined stream path retains its item/byte charge through RPC acknowledgement.
Conversely, an internal unbounded queue can have a real enclosing budget; inspect
its admission and release path before calling it unbounded. See the
[project study][gm-project-audit] for the source and limits.

## 8. Forward cancellation to foreign I/O and document its actual guarantee

```ts
// Bad for a port promising cooperative cancellation: signal is discarded.
const uncoupled = Effect.tryPromise(() => sdk.doStream(options));

// Signal forwarding only; this is not a complete resource-acquisition adapter.
const request = Effect.tryPromise({
  try: (signal) => sdk.doStream({
    ...options,
    abortSignal: options.abortSignal
      ? AbortSignal.any([signal, options.abortSignal])
      : signal,
  }),
  catch: toRequestError,
});
```

Preserve an existing caller signal instead of silently replacing it. Test abort
before response acquisition separately from cancellation during stream reading.
Forwarding a signal does not prove rollback or physical termination. A Promise
that ignores it can outlive its interrupted Effect wrapper. A late resource result
needs the foreign API's cancellation/join/cleanup contract; this sketch does not
reclaim it automatically. [OpenCode's SDK bridge][oc-aisdk] motivates this rule.

### Cancellation during resource acquisition

In the qualified [Effect implementation][effect-acquire-release],
`acquireRelease` makes acquisition and finalizer registration uninterruptible by
default. A pending interruption can wait for a non-cooperative `open()` to finish;
its returned resource is then owned and its finalizer runs before the native
operation finishes. The [late-acquisition test][gm-lifecycle-tests] holds both the foreign
open and asynchronous close behind separate barriers and checks that behavior.

```ts
// A finite foreign acquisition with no cancellation contract: retain its result.
const owned = Effect.acquireRelease(
  Effect.tryPromise({ try: () => foreign.open(), catch: toOpenError }),
  resource => Effect.promise(() => resource.close()),
);
```

This is a resource-safety pattern, not a hard shutdown deadline. If the foreign
acquisition never settles, this owner can keep waiting. Use the adapter's actual
abort/deadline/settlement contract where available. `{ interruptible: true }` is
appropriate only when that contract safely handles interrupted acquisition and
late results; merely setting the option or forwarding a signal cannot establish
it. For locks and pools, prefer a native primitive that waits interruptibly and
atomically registers release when ownership is obtained. Avoid a manual
`take(); addFinalizer(release)` gap; the semaphore regression in the
[industry study][gm-industry-failures] explains why.

## 9. Keep expected failures, defects and interruption distinguishable

Preserve expected `E` in native contracts. At a neutral boundary, map expected
failures into the consuming domain's result type. Keep diagnostic causes at the
technical owner when useful; do not expose provider DTOs as the domain language.
Do not turn all causes, interruption and finalizer defects into ordinary success
or an empty result. Retrying needs a safe or idempotent operation contract; a
timeout does not establish that the external effect never occurred.
Keep a product's deliberate fatal-setup `orDie` policy at that product boundary;
the generic adapter must not erase a factory's known error channel.

Choose retry policy by operation and failure class. Bound attempts, elapsed time
and concurrent work; require idempotency or reconciliation for writes with an
uncertain outcome. Parse untrusted values at the owning adapter boundary and
translate failures into the consumed contract. Redaction of schema values is a
useful control, not a guarantee that every log, span or custom error is safe.
[Hazel's request/retry boundaries][gm-industry-failures] are a concrete example;
their application policy does not belong in the GM constructor.

## 10. Preserve cleanup evidence without inventing retry guarantees

Attempting all releases and reporting their failures are separate obligations.
Do not discard every `Exit` from cleanup when the owner requires failure or debt
reporting. If a foreign facade promises one idempotent close outcome, retain its
first disposal Promise/result. The spike observed different outcomes for repeated
raw ManagedRuntime disposal callers after the initiating finalizer failed.

In the qualified [ManagedRuntime implementation][effect-runtime-disposal], ordinary
overlapping disposal callers wait for the in-progress close, but that completion
signal does not replay the first caller's cleanup failure. Reentrant calls from
work involved in disposal have a deadlock-avoidance exception. These are separate
properties: completion waiting, failure reporting and reentrancy. The historical
spike remains a dated observation; a facade promising one close result still
needs to retain that result at its existing owner.

Preserving that first failure is not physical release or retry. Native Scope close
does not recreate GM Resources debt/retry semantics. Do not build a universal
adapter that silently claims those different contracts are interchangeable.

Name what a timeout completes: stopping the wait, requesting cancellation,
joining native work, or confirming physical release. A soft shutdown wait can
return while an independently owned drain still runs. Work that remains alive
after a timeout still consumes capacity; preserve its owner and observed result.

Exercise every supported ownership exit: normal completion, explicit disposal,
parent Scope closure, failed startup and interruption. One passing `shutdown()`
test does not establish the Scope-close path. LiveStore's
[shutdown fix and earlier reverted complexity][gm-ownership-history] illustrate
why the existing owner should drive all supported paths. Do not add a second
shutdown state machine to compensate for a missing connection to that owner.
Dependency finalizers still require their providers to stay alive; unrelated
owners with mutual waits may need parallel closing. Blindly serializing all
cleanup can introduce a deadlock, as the OpenCode history demonstrates.

## 11. Bound fan-out and make detached work deliberate

Choose concurrency from actual workload and resource capacity. `unbounded` is a
policy requiring a controlled work population or measured justification; module
count alone says little about active instances or operations. Infinite idle cache
retention similarly needs an application-owned policy.
An outer `Effect.forEach`/`Effect.all` concurrency limit controls its own branches,
not acquisition inside each graph. The mapper uses native `Layer.mergeAll`, which
can begin all independent providers concurrently before application ingress opens.
Use acquisition-only limits, an appropriate pool or staged graphs at the real
resource owner where expensive startup needs a bound. Holding a scarce permit
for a provider's entire lifetime can deadlock a dependent that needs the same
permit to acquire. No GM scheduler or generic limiter is implied.

Distinguish graph size, TypeScript cost, active instances, claim-loop count,
outstanding operations, waiting publishers and retained payload bytes. The
[dated scale measurements][gm-audit] cover explicit graph and type shapes;
they do not promise thousands of live agents or a process-wide memory bound.
GM groups organize declarations. Native construction follows dependencies and
may start independent providers concurrently; listing order is not a startup
sequence. Host owns any additional application sequencing. Do not introduce
fake dependency slots, a scheduler or an ordering DSL to emulate another executor.
For example, the Host can acquire the graph, invoke an application migration/setup
action, and only then admit requests, provided acquisition does not start work
that depends on that setup. An ingress gate alone does not stop a worker already
forked while building its Layer. For eager workers, acquire only prerequisite
resources, run the setup use case, and then construct the worker/application graph
with those prerequisites as borrowed inputs. Keep their owning outer Scope alive
through application work. Setup failure must neither construct those workers nor
publish readiness; the action's domain policy stays in its own use case.
OpenCode's ordered root builds also allow a later root to be acquired early as another root's
dependency; they do not establish an arbitrary global factory ordering.

Use scope-owned work when it uses that scope's resources. A detached operation
needs a named lifetime/observation owner and a shutdown contract. Do not label all
background jobs unowned: OpenCode's [coordinator][oc-coordinator] distinguishes
interrupt acknowledgement from complete settlement and owns shared execution.

## 12. Verify optionality and upgrade behavior at public entrypoints

Keep Effect out of neutral GM Core dependencies and public types. Test built or
packed imports of the optional integration and its declarations. Type independence,
runtime bundle isolation and installed dependency trees are distinct claims.
[OpenCode's Client boundary tests][oc-bundles] inspect the actual bundle inputs.

Pin the tested Effect version and classify ecosystem APIs individually; not every
API in the package has the same stability. Upgrade tests should exercise sharing,
cancellation and finalization semantics, not just rename imports. Reuse native
Effect mechanisms; no GM scheduler, retries, universal lease system or runtime.

Verify the archive's actual runtime imports and declared dependencies in a clean
consumer. A workspace lock can hide a missing direct runtime dependency, as
[OpenCode's packed-server correction][oc-packed-runtime] demonstrates. Declare
what the package itself uses; this is not a reason to pin every transitive package
or add platform dependencies to portable Core/Assembly.

## 13. Verify failure boundaries deterministically

Use barriers to establish the exact race: acquisition entered, finalizer
registered, sibling failed, cancellation requested, cleanup held, cleanup done.
Assert the original error identity, no successful root publication, resource
liveness during dependent cleanup and exact release counts. Wall-clock delays
do not prove these transitions. A test timeout is a hung-test guard, not a
performance or shutdown guarantee. Keep expected answers independent of the
mapper's implementation.

| Boundary | Maintained public-behavior evidence |
| --- | --- |
| Partial parallel startup and shared dependency cleanup | [Lifecycle tests][gm-lifecycle-tests]: a failed branch interrupts its sibling; held cleanup keeps the real file alive and the caller pending |
| Interruption while foreign acquisition is in progress | Lifecycle tests: the late file is owned, closed once and never published as a successful root |
| Build again after failure or interruption | Lifecycle tests: reuse the same Layer in a new native build; acquire distinct handles and release both |
| Combined module/input inventory ceiling | Construction tests: public native and Promise preparation reject overflow with no factory calls; the same case runs from installed archives |
| Invalid inputs/products and expected failure versus defects | [Construction tests][gm-construction-tests]: reject before factories where required, preserve native causes and release acquired dependencies |
| Product validation after that same factory acquired a resource | Lifecycle tests: an accessor-bearing product fails without invoking its getter; held cleanup delays completion and closes the real file once |
| Diamond sharing, independent configuration and graph growth | Construction tests: exact providers, input/context isolation and 1,000-node chain/wide resource invariants |
| Repeated diamonds | Construction tests: shared instances and real resources remain live through dependent cleanup; no traversal-complexity claim |
| Worker, stream and dependent-finalizer lifetime | [Consumer tests][gm-consumer-tests]: real files remain usable through owned operations and asynchronous cleanup; multiple finalizer defects remain visible |
| Distribution and optionality | [Archive test][gm-archive-test]: repeat native cases from matched installed packages, check portable public types and ordinary Assembly without Effect |

On a clean checkout, first build the public prerequisites with `bun run assembly:build`,
`bun run resources:build`, `bun run conformance:build` and `bun run observation:build`.
Then, from the repository
root, `bun run effect:check` runs the focused build, strict
source/type/test-tooling checks, native cases and archive qualification under the
pinned repository toolchain. Follow the repository instructions for the full gate.
Consumers should copy the relevant test obligations into their actual adapter and
Host acceptance tests, not duplicate GM's generic test implementation.

Before admitting a concrete application, verify its own readiness publication,
work admission, cancellation/settlement, resource budgets, stream delivery and
shutdown failure policy where applicable. Library tests cannot decide those
product contracts. A public release and a product's production admission are
separate recorded outcomes; neither follows solely from a green graph test.

## OpenCode evidence: observations and their limits

The original targeted review used `c4bf172532b64a02142d2da9a72d57621c48423d`.
The [2026-11-12 source audit][gm-opencode-audit] pins
`becb9c7c9f3907257d12e95993a47ccc6e3b9625` and directly rechecks seven relevant
files at both revisions, confirming identical bytes. It also examines
additional failure, cache-retention and body-lifetime tests. These are source
observations, not executed OpenCode E2E. The evidence below keeps its original
source identities and execution boundaries.
Compared with [the earlier checkpoint][oc-followup], LayerNode, SDK instance/Host/
fetch/Promise adapters and Location service files retain their inspected blobs.
AISDK changed elsewhere; the signal-forwarding gap below remains in the current
call options and callback. Catalog/override/lock still select Effect **4.1.0**;
no installed-tree audit is claimed. Other positive references retain their explicit
older source pins. A repository-wide compare listing alone is not a complete
changed-file audit.
The [follow-up to `63b42f6f`][oc-latest-delta] changes two provider implementations
and their tests; the inspected LayerNode, SDK, lifetime and AISDK files are
unchanged. The [Effect follow-up][effect-latest-delta] to `2b23262d` changes
OpenRouter workload identity, not the inspected Scope, Layer, LayerMap, RcMap or
Effect execution code. Its native fork/race contracts also support rule 6; these
are source observations, not new executions of the frozen spike environment.
Our five paired lifetime spikes use published **Effect 4.1.2** and strict
TypeScript **7.0.2**. The first three use disposable FileHandles; the other two
use controlled finalizer failure and caller References. They are integration
counterexamples, not reported OpenCode defects or proof of a complete GM mapper.
See [receipts][gm-spikes]. The production mapper now has separate maintained
Effect **4.1.4** tests for typed variants, two local compositions borrowing one
real FileHandle, fail-fast interruption, early stream completion, observed worker
failure and dependent asynchronous finalizers using a still-open provider. Its
archive qualification repeats those cases through installed public package roots.
These are library test-Host results, not additions to the old spike count or proof
that a named product has adopted the integration.

### Where LayerNode offers more convenience

| OpenCode capability | Decision for the first GM integration |
| --- | --- |
| [Checked replacements][oc-node-current] propagate through the graph and prune old dependencies | Adopt typed live/fake composition recipes now; a shared preparation helper needs a demonstrated benefit and honest E/R/N, not a second override authority |
| [Shared tags and cache domains][oc-node-current] share a dependency closure while keeping local builds separate | Adopt the nested application/session recipe with borrowed inputs; this is more explicit and does not duplicate automatic tag-based sharing |
| [Typed tag rules][oc-tags] restrict declared dependency directions | No new lifetime DSL. These checks cover explicitly tagged direct dependencies, permit untagged nodes, and do not prove arbitrary escaped-value lifetime safety |
| Ordered roots with parallel node dependencies | Promise only native dependency order; Host owns further sequencing |
| Contract-preserving `mapLayer` decoration | Use native Effect functions around owned factories/Layers; no separate GM decoration API yet |

For an Effect-only application requiring those specialized policies, LayerNode can
be more convenient. The GM integration earns its additional layer from portable
module declarations, exact local slots and shared authoring policy across the
two executors. Module count alone does not prove a hybrid is better. The historical
review and finite spike did not qualify thousand-module performance or type costs;
the [later bounded measurements][gm-audit] report those separate shapes without
claiming application workload capacity.

### Observed behavior and positive practices

| Observed source | What to learn; limits |
| --- | --- |
| [AISDK call options][oc-options] omit `abortSignal`; [tryPromise callback][oc-aisdk] does not forward its signal | Confirmed forwarding gap. Separate network timeout controllers and stream cancellation exist. No actual provider/network/cost impact was measured. |
| [Location shutdown][oc-cleanup] turns Scope.close into Exit and discards the results | Confirmed loss of those returned causes on that path. Individual finalizers may log; no production incident or documented OpenCode promise violation is claimed. |
| [Promise SDK][oc-promise] accepts Host embedding options containing [LayerNode replacements][oc-host] | Confirmed public coupling, which may be intentional for an embedding SDK. Do not call such a complete API runtime-neutral. |

Three further observations are scenario risks, not established bugs:

- [Reload][oc-reload] uses unbounded concurrency across current Location keys.
- [Web bootstrap][oc-fetch] detaches the initial recovery sweep; resumed jobs also
  have their own scope owners. No shutdown failure was reproduced.
- [Location services][oc-cleanup] retain healthy entries with infinite idle TTL;
  this alone is not a leak.

Positive reference patterns include [LayerNode][oc-node] keeping resource execution
native, [Host][oc-host] disposing failed warmup, and [OwnedFetch][oc-owned-fetch]
retaining normally delivered response bodies and its first close Promise. OwnedFetch
alone is not a universal guarantee for arbitrary late responses after abort; the
actual Effect HTTP handler has additional protections. These source and test reads
do not establish whole-OpenCode E2E or comparative performance.
The [instance adapter][oc-instances] also lets the active Scope win when combining
contexts and borrows selector/map services instead of retaining their owner
Layers; its source explains the shutdown self-retention cycle being avoided.
Borrow the ownership discipline, not its product-specific Location/eviction model.

For ordinary GM compatibility and intentional native adoption, use the one
[migration plan](https://github.com/agent-teams-ai/get-modular/blob/main/research/effect-integration-2026-11/README.md#breaking-changes-and-migration); do not invent a
second migration checklist in consumer instructions.

[gm-spikes]: https://github.com/agent-teams-ai/get-modular/blob/5131d8789d88816ad458f1bd381727365b962a88/research/effect-integration-2026-11/spikes.md
[gm-audit]: https://github.com/agent-teams-ai/get-modular/blob/main/research/effect-integration-2026-11/architecture-audit-2026-11-12.md
[gm-opencode-audit]: https://github.com/agent-teams-ai/get-modular/blob/main/research/effect-integration-2026-11/opencode-audit-2026-11-12.md
[gm-project-audit]: https://github.com/agent-teams-ai/get-modular/blob/main/research/effect-integration-2026-11/effect-projects-2026-11-12.md
[gm-production]: https://github.com/agent-teams-ai/get-modular/blob/main/research/effect-integration-2026-11/production-hardening-2026-11-12.md
[gm-industry-failures]: https://github.com/agent-teams-ai/get-modular/blob/main/research/effect-integration-2026-11/industry-failure-patterns-2026-11-12.md
[gm-ownership-history]: https://github.com/agent-teams-ai/get-modular/blob/main/research/effect-integration-2026-11/ownership-failure-history-2026-11-12.md
[gm-production-review]: https://github.com/agent-teams-ai/get-modular/blob/main/research/effect-integration-2026-11/production-review-2026-11-13.md
[gm-lifecycle-tests]: https://github.com/agent-teams-ai/get-modular/blob/main/packages/effect/tests/lifecycle.test.ts
[gm-construction-tests]: https://github.com/agent-teams-ai/get-modular/blob/main/packages/effect/tests/construction.test.ts
[gm-consumer-tests]: https://github.com/agent-teams-ai/get-modular/blob/main/packages/effect/tests/consumer.test.ts
[gm-archive-test]: https://github.com/agent-teams-ai/get-modular/blob/main/packages/effect/tests/packed-root.test.ts
[effect-acquire-release]: https://github.com/Effect-TS/effect/blob/289a53f7b1fc40049219c6e69022db2fb859c356/packages/effect/src/internal/effect.ts#L4240-L4256
[effect-composed-memo]: https://github.com/Effect-TS/effect/commit/c7072e46356a19615625ae0fa569b1c3a79d50be
[effect-registry-memo]: https://github.com/Effect-TS/effect/commit/9591f00993f882de494033ddc4a1324f054f075a
[effect-mutation-keys]: https://github.com/Effect-TS/effect/commit/8fbb39eb92577915831f19a83b51be376e844613
[effect-runtime-disposal]: https://github.com/Effect-TS/effect/blob/289a53f7b1fc40049219c6e69022db2fb859c356/packages/effect/src/ManagedRuntime.ts#L403-L427
[gm-input-probe]: https://github.com/agent-teams-ai/get-modular/blob/5131d8789d88816ad458f1bd381727365b962a88/research/effect-integration-2026-11/spikes.md#input-identity-counterexample
[effect-layer-map]: https://github.com/Effect-TS/effect/blob/9d6b21fd80f99c7578832e9ee90562e5c5c92123/packages/effect/src/LayerMap.ts#L1-L12
[effect-map-close]: https://github.com/Effect-TS/effect/blob/9d6b21fd80f99c7578832e9ee90562e5c5c92123/packages/effect/src/RcMap.ts#L265-L299
[effect-scoped-fork]: https://github.com/Effect-TS/effect/blob/2b23262d50e5d6bec7708cab9ae738bdf7a04bdd/packages/effect/src/Effect.ts#L9000-L9038
[effect-first-exit]: https://github.com/Effect-TS/effect/blob/2b23262d50e5d6bec7708cab9ae738bdf7a04bdd/packages/effect/src/Effect.ts#L5094-L5150
[effect-latest-delta]: https://github.com/Effect-TS/effect/compare/9d6b21fd80f99c7578832e9ee90562e5c5c92123...2b23262d50e5d6bec7708cab9ae738bdf7a04bdd
[oc-node]: https://github.com/anomalyco/opencode/blob/c4bf172532b64a02142d2da9a72d57621c48423d/packages/util/docs/layer-node.md
[oc-node-current]: https://github.com/anomalyco/opencode/blob/c4bf172532b64a02142d2da9a72d57621c48423d/packages/util/docs/layer-node.md
[oc-tags]: https://github.com/anomalyco/opencode/blob/c4bf172532b64a02142d2da9a72d57621c48423d/packages/util/src/effect/layer-node.ts#L154-L189
[oc-instances]: https://github.com/anomalyco/opencode/blob/c4bf172532b64a02142d2da9a72d57621c48423d/packages/sdk/src/internal/instances.ts#L16-L103
[oc-followup]: https://github.com/anomalyco/opencode/compare/7d5b72250890e0e89573b4cab42a003a48c20567...c4bf172532b64a02142d2da9a72d57621c48423d
[oc-latest-delta]: https://github.com/anomalyco/opencode/compare/c4bf172532b64a02142d2da9a72d57621c48423d...63b42f6f02e4b74fae343eddbe567db2c53fcf21
[oc-transaction]: https://github.com/anomalyco/opencode/blob/dc71d5f94b1800370a6de88d107f117823d85628/packages/core/src/database/drizzle/effect-sqlite/session.ts#L132-L174
[oc-options]: https://github.com/anomalyco/opencode/blob/c4bf172532b64a02142d2da9a72d57621c48423d/packages/core/src/aisdk.ts#L478-L500
[oc-aisdk]: https://github.com/anomalyco/opencode/blob/c4bf172532b64a02142d2da9a72d57621c48423d/packages/core/src/aisdk.ts#L707-L733
[oc-coordinator]: https://github.com/anomalyco/opencode/blob/dc71d5f94b1800370a6de88d107f117823d85628/packages/core/src/session/run-coordinator.ts#L6-L67
[oc-bundles]: https://github.com/anomalyco/opencode/blob/dc71d5f94b1800370a6de88d107f117823d85628/packages/client/test/import-boundaries.test.ts#L13-L49
[oc-cleanup]: https://github.com/anomalyco/opencode/blob/c4bf172532b64a02142d2da9a72d57621c48423d/packages/core/src/location-services.ts#L56-L110
[oc-promise]: https://github.com/anomalyco/opencode/blob/c4bf172532b64a02142d2da9a72d57621c48423d/packages/sdk/src/promise.ts#L20-L67
[oc-host]: https://github.com/anomalyco/opencode/blob/c4bf172532b64a02142d2da9a72d57621c48423d/packages/sdk/src/internal/host.ts#L18-L70
[oc-reload]: https://github.com/anomalyco/opencode/blob/c4bf172532b64a02142d2da9a72d57621c48423d/packages/core/src/location-service-map.ts#L20-L35
[oc-fetch]: https://github.com/anomalyco/opencode/blob/dc71d5f94b1800370a6de88d107f117823d85628/packages/server/src/fetch.ts#L43-L56
[oc-owned-fetch]: https://github.com/anomalyco/opencode/blob/c4bf172532b64a02142d2da9a72d57621c48423d/packages/sdk/src/internal/fetch.ts#L8-L116
[oc-packed-runtime]: https://github.com/anomalyco/opencode/commit/578f8d637a8008f7d86d9b3003088b4fbd26888f
