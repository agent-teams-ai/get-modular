# Effect integration practices

Status: implementation-candidate guidance, updated 2026-11-12. The native package and its
public API are implemented under [ADR-0043](https://github.com/agent-teams-ai/get-modular/blob/main/docs/decisions/0043-plan-optional-native-effect-composition.md).
The current candidate uses **Effect 4.1.4** and matched candidate Core/Assembly;
the package README distinguishes source availability from registry publication.
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

## Mistakes to catch first

| Mistake | Correct approach |
| --- | --- |
| Merge a fake Layer into a closed live graph and assume live resources are gone | Select a typed composition variant before preparation; [rule 2](#2-give-inter-module-selection-one-authority) |
| Treat shared Layer identity or a cache reference count as a complete lifetime guarantee | State configuration, cache domain and resource/work owners separately; [rules 3](#3-preserve-native-construction-and-exact-provider-sharing) and [4](#4-state-who-owns-resources-and-who-owns-work) |
| Restore a captured Context together with an old Scope | Keep the active operation owner; [rule 4](#4-state-who-owns-resources-and-who-owns-work) |
| Close a private resource Layer when its factory returns a capability | Build it in the factory's construction Scope; [private Layer recipe](#keep-private-resource-layers-in-the-factory-scope) |
| Return a Stream from a scope that already released its resource | Own acquisition through consumption/finalization; [rule 7](#7-own-streams-through-consumption-and-finalization) |
| Discard the Effect signal at a Promise/SDK boundary | Forward cancellation and preserve caller signals; [rule 8](#8-forward-cancellation-to-foreign-io-and-document-its-actual-guarantee) |
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
Every `.layer()` call creates fresh mapper-owned Layer
identities; reuse its returned Layer when sharing those nodes is intentional.
This prevents mapper-owned memoization from aliasing different inputs or ambient R
even inside one shared memoization domain. Caching one implementation Layer can capture the first input
for both branches; see the [paired experiment][gm-input-probe].
This does not refresh private Layers captured inside a factory or clone borrowed
or caller-owned services. Their author controls native identity, configuration and
sharing. Distinct configuration may require distinct native Layers or deliberate
native `Layer.fresh`; the mapper must not recursively impose its own cache policy.

Fresh mapper identity does not allocate fresh arbitrary factory state.
`Effect.succeed(existingValue)` returns that same value on each execution;
allocate per-instance mutable state during its owned acquisition when isolation
is required. Cold/hot subscription behavior similarly belongs to the stream
author, not to the number of calls to `.layer()`.

Current Promise Assembly wrapped in `tryPromise` remains Promise construction.
It does not become native Layer acquisition or gain typed construction errors.
[OpenCode LayerNode][oc-node] demonstrates policy compiled into native Layers,
without making its object-identity replacement policy the GM binding protocol.

## 4. State who owns resources and who owns work

Acquire a resource and register its release together. Its native Layer/Scope owns
that resource; the Host owns ingress, shutdown policy and execution admission.
These responsibilities can be nested without independently disposing the same
resource from GM Resources and Effect.
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

## 9. Keep expected failures, defects and interruption distinguishable

Preserve expected `E` in native contracts. At a neutral boundary, map expected
failures into the consuming domain's result type. Keep diagnostic causes at the
technical owner when useful; do not expose provider DTOs as the domain language.
Do not turn all causes, interruption and finalizer defects into ordinary success
or an empty result. Retrying needs a safe or idempotent operation contract; a
timeout does not establish that the external effect never occurred.
Keep a product's deliberate fatal-setup `orDie` policy at that product boundary;
the generic adapter must not erase a factory's known error channel.

## 10. Preserve cleanup evidence without inventing retry guarantees

Attempting all releases and reporting their failures are separate obligations.
Do not discard every `Exit` from cleanup when the owner requires failure or debt
reporting. If a foreign facade promises one idempotent close outcome, retain its
first disposal Promise/result. The spike observed different outcomes for repeated
raw ManagedRuntime disposal callers after the initiating finalizer failed.

Preserving that first failure is not physical release or retry. Native Scope close
does not recreate GM Resources debt/retry semantics. Do not build a universal
adapter that silently claims those different contracts are interchangeable.

Name what a timeout completes: stopping the wait, requesting cancellation,
joining native work, or confirming physical release. A soft shutdown wait can
return while an independently owned drain still runs. Work that remains alive
after a timeout still consumes capacity; preserve its owner and observed result.

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
