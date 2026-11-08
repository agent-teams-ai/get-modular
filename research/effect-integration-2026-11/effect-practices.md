# Effect integration practices

Status: draft usage guidance, 2026-11-09. The [integration proposal](README.md)
describes the selected direction; a production GM native executor and its public
API are not yet admitted or implemented. The current
[Consumer Module Standard](../../docs/architecture/common-assembly.md#consumer-module-standard)
and existing package contracts remain authoritative until their explicit successor.

Rules about native Effect use apply to an explicitly chosen Effect scope today.
Rules about the proposed mapper are acceptance requirements, not shipped features.
The [spike evidence](spikes.md) separates tested behavior from remaining work.
Fragments below are pattern sketches with pre-existing named values, not complete
compiled examples or proposed GM API names.

## 1. Abstract subject-specific capabilities at replaceable boundaries

Define a consumer-owned `SearchPort`, `StoragePort` or other narrow capability
where consumers must remain independent of its implementation. Keep the complete
neutral contract free of Effect types, including options and callback types.
Pure domain rules and data do not need a runtime dependency.

Explicitly Effect-native technical ports may return real `Effect` or `Stream`.
Do not force every internal module through a Promise facade. A `Task` type alias
does not remove Effect coupling. Do not introduce universal Task/Fiber/Scope APIs.

## 2. Give inter-module selection one authority

GM bindings select other application modules through declared local slots.
Factories receive the closed dependency record selected by that composition.
Private implementation Layers and explicit request, transaction and tracing
context can remain native Effect mechanisms.

Do not additionally select undeclared neighboring business services from a global
Context bag. `R = never` proves neither context independence nor resource lifetime;
optional lookups and References can still observe context. The architectural rule
is about ownership and declared dependencies, not banning every nonempty `R`.

## 3. Preserve native construction and exact provider sharing

For the proposed mapper, validate the complete composition before acquisition and
translate the selected graph into native Layers. Preserve factory `E` and `R`
where their types actually establish them. A serialized plan alone cannot recover
TypeScript errors or value types; use its matching declarations and factories.

Two local slots of the same capability may choose different providers. Preserve
that distinction; one global Context key cannot represent both bindings. Share one
selected implementation within its intended build, and isolate independent builds.
Keep stable Layer identities within each intended memoization domain. Do not
rebuild a diamond dependency once per incoming edge.
In the proposed API, every `.layer()` call creates fresh implementation Layer
identities; reuse its returned Layer when sharing is intentional. This separates
different captured inputs and ambient factory requirements even inside one shared
memoization domain. Caching one implementation Layer can capture the first input
for both branches; see the [paired experiment](spikes.md#input-identity-counterexample).

Current Promise Assembly wrapped in `tryPromise` remains Promise construction.
It does not become native Layer acquisition or gain typed construction errors.
[OpenCode LayerNode][oc-node] demonstrates policy compiled into native Layers,
without making its object-identity replacement policy the GM binding protocol.

## 4. State who owns resources and who owns work

Acquire a resource and register its release together. Its native Layer/Scope owns
that resource; the Host owns ingress, shutdown policy and execution admission.
These responsibilities can be nested without independently disposing the same
resource from GM Resources and Effect.
Borrowed inputs keep their external owner; merely injecting them does not register
automatic release. That owner must outlive the Layer and the work using them.

Keep resource-using operations and their finalizers inside a lifetime that retains
the resource. A captured service run by an unrelated root runner is not
automatically tracked by the service owner's ManagedRuntime. TypeScript does not
revoke escaped objects. A scoped callback alone cannot prevent every escape.

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

```ts
const program = Effect.scoped(
  Effect.gen(function* () {
    const resource = yield* Effect.acquireRelease(acquire, release);
    yield* Effect.forkScoped(background(resource));
    yield* foreground(resource);
  }),
);
```

In a sequential scope, registering scoped work after acquiring its resource lets
the scope interrupt and join that work before releasing the resource. An explicit
join before leaving the scope is another valid arrangement. `forkChild` follows
the parent fiber, whose lifetime need not match a nested resource Scope.

The FileHandle spike observed `EBADF` in a child finalizer after early resource
release, and successful reading with the tested scoped-fork ordering. This proves
that recipe, not arbitrary Layer-tree ordering. Parallel finalizers do not promise
dependency order. Do not advertise automatic physical drain of foreign I/O from
fiber completion, even when the native fiber was correctly interrupted and joined.

## 7. Own streams through consumption and finalization

Returning a lazy Effect, Stream or response body does not finish its work. Avoid
returning a resourceful stream from an acquisition scope that has already closed.
Native `Stream.unwrap(scopedAcquisition)` can tie acquisition to consumption;
test early consumer termination, failure and asynchronous finalization.

Give subscriptions an owner and define delivery semantics. Latest-state
observation, ephemeral multicast and durable delivery are different contracts.
Do not equate GM Observation with Effect PubSub or add a second generic event bus.

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

## 10. Preserve cleanup evidence without inventing retry guarantees

Attempting all releases and reporting their failures are separate obligations.
Do not discard every `Exit` from cleanup when the owner requires failure or debt
reporting. If a foreign facade promises one idempotent close outcome, retain its
first disposal Promise/result. The spike observed different outcomes for repeated
raw ManagedRuntime disposal callers after the initiating finalizer failed.

Preserving that first failure is not physical release or retry. Native Scope close
does not recreate GM Resources debt/retry semantics. Do not build a universal
adapter that silently claims those different contracts are interchangeable.

## 11. Bound fan-out and make detached work deliberate

Choose concurrency from actual workload and resource capacity. `unbounded` is a
policy requiring a controlled work population or measured justification; module
count alone says little about active instances or operations. Infinite idle cache
retention similarly needs an application-owned policy.

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

The inspected source is `dc71d5f94b1800370a6de88d107f117823d85628`. Its catalog,
override and lock select Effect **4.1.0**; no installed-tree audit is claimed.
Our five paired lifetime spikes use published **Effect 4.1.2** and strict
TypeScript **7.0.2**. The first three use disposable FileHandles; the other two
use controlled finalizer failure and caller References. They are integration
counterexamples, not reported OpenCode defects or proof of a complete GM mapper.
See [receipts](spikes.md).

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

[oc-node]: https://github.com/anomalyco/opencode/blob/dc71d5f94b1800370a6de88d107f117823d85628/packages/util/docs/layer-node.md
[oc-transaction]: https://github.com/anomalyco/opencode/blob/dc71d5f94b1800370a6de88d107f117823d85628/packages/core/src/database/drizzle/effect-sqlite/session.ts#L132-L174
[oc-options]: https://github.com/anomalyco/opencode/blob/dc71d5f94b1800370a6de88d107f117823d85628/packages/core/src/aisdk.ts#L479-L500
[oc-aisdk]: https://github.com/anomalyco/opencode/blob/dc71d5f94b1800370a6de88d107f117823d85628/packages/core/src/aisdk.ts#L707-L723
[oc-coordinator]: https://github.com/anomalyco/opencode/blob/dc71d5f94b1800370a6de88d107f117823d85628/packages/core/src/session/run-coordinator.ts#L6-L67
[oc-bundles]: https://github.com/anomalyco/opencode/blob/dc71d5f94b1800370a6de88d107f117823d85628/packages/client/test/import-boundaries.test.ts#L13-L49
[oc-cleanup]: https://github.com/anomalyco/opencode/blob/dc71d5f94b1800370a6de88d107f117823d85628/packages/core/src/location-services.ts#L56-L110
[oc-promise]: https://github.com/anomalyco/opencode/blob/dc71d5f94b1800370a6de88d107f117823d85628/packages/sdk/src/promise.ts#L20-L67
[oc-host]: https://github.com/anomalyco/opencode/blob/dc71d5f94b1800370a6de88d107f117823d85628/packages/sdk/src/internal/host.ts#L18-L70
[oc-reload]: https://github.com/anomalyco/opencode/blob/dc71d5f94b1800370a6de88d107f117823d85628/packages/core/src/location-service-map.ts#L20-L35
[oc-fetch]: https://github.com/anomalyco/opencode/blob/dc71d5f94b1800370a6de88d107f117823d85628/packages/server/src/fetch.ts#L43-L56
[oc-owned-fetch]: https://github.com/anomalyco/opencode/blob/dc71d5f94b1800370a6de88d107f117823d85628/packages/sdk/src/internal/fetch.ts#L8-L116
