# Module-owned resources: setup/cleanup contract proposal

Date: 2026-10-01. Status: four hosted critiques synthesized; **design proposal,
not an admitted runtime API, an accepted ADR or a release qualification**.
The owner selected `setup/cleanup` wording and a convenient module-local
contract. Implementation has not started under this proposal.

## Recommendation

Give each **module instance** an optional resource helper at its existing
factory/composition boundary. Pair setup with cleanup where the resource is
created. The instance is the normal owner; its internal scope is neither a
separate module nor a composition graph node. One module definition can create
several instances, each with independent obligations.

Illustrative syntax, **not an existing package export**:

```ts
async function createFeature(deps: FeatureDependencies, module: ModuleContext) {
  await module.resources.setup({
    setup: () => deps.events.subscribe(onEvent),
    cleanup: subscription => subscription.unsubscribe(),
  });

  return { read: (key: string) => deps.store.read(key) };
}
```

The instance owns the subscription. It borrows `events` and `store`; it does
not clean up either dependency. `ModuleContext` means a small instance creation
context, prepared before the factory runs. It is not a Core module declaration,
a service locator, or a partially initialized operational Host. Domain policy
uses consumer-owned ports; framework wiring remains in the composition adapter.

The helper is optional. An adopted managed setup must have a cleanup contract;
pure and borrow-only modules need no empty `dispose()`. No exhaustive static
resource manifest is required. Existing capability dependency declarations
remain authoritative for composition; actual resource obligations are registered
as setup starts. A module that uses native resources outside these ports remains
responsible for them, without gaining a claim of managed lifecycle conformance.

## Parent, child and dependency lifetimes

| Situation | Required behavior |
| --- | --- |
| Child borrows a parent resource | Supply a narrow use port, without the parent's cleanup authority. |
| Parent closes normally | Stop new ordinary work and child setup; settle dependent work and child cleanup before cleaning up the parent resource. |
| Child cleanup needs the parent | Preserve that dependency for the private shutdown protocol. Closing ordinary admission must not accidentally disable necessary cleanup. |
| Siblings or external modules share the resource | The owner waits for every dependent use, not only its descendants. Several capability views do not multiply cleanup obligations. |
| A request checks out a DB client | The request owns returning the client. It borrows the pool; the pool owner remains unchanged. |
| Parent resource fails unexpectedly | Report dependency unavailability through its adapter. Error, degradation, cancellation, module stop or explicit rebind is product/resource policy. |
| Returned stream outlives its call | Keep its cleanup owner and dependencies alive through idle periods as well as active reads. |
| Stream must outlive its module | Explicitly transfer cleanup custody and all required dependency retention to a ready receiving owner. Passing the handle alone is insufficient. |

An ownership tree is useful, but it is **not the complete dependency lifetime
graph**. If cleanup A needs resource B, B must survive A's cleanup regardless
of the module tree. Initially support known nested lifetimes and explicit local
protocols. Reject unsupported overlapping/cyclic cleanup relationships rather
than introduce a universal graph scheduler. A failed child cleanup can retain
its prerequisites; unrelated safe cleanup may still continue.

Normal closing is cooperative: a producer may need to be stopped before drain
can finish. Stop/drain order belongs to the resource adapter or concrete module
protocol. An observer deadline reports unfinished work; it cannot justify
premature parent cleanup.

The nested TEST slice must use a managed parent port that records an active use
synchronously before starting IO and ends that use only on actual settlement.
It closes ordinary admission atomically with that registration. Child cleanup
uses a separate private shutdown path where needed; it cannot reopen ordinary
work. Known child lifetimes may provide retention without a per-call record,
but that nesting must be proved, not assumed. The setup helper does not
automatically intercept arbitrary methods on a borrowed object.

Unexpected resource loss is a health event, not successful disposal. A managed
port rejects new use of an unavailable dependency. Continuations check that
port before subsequent managed effects, including after `await`. Already
submitted IO may finish or remain uncertain; loss does not undo it. Independent
capabilities may remain usable. Recovery/rebind must follow the adapter's
explicit identity and availability contract; old operations are never silently
replayed against a replacement. Raw escaped handles cannot be revoked by this
helper, and arbitrary dependency loss cannot be detected without a signal or
mediation.

## Small API, substantive adapter contract

The common path accepts the paired `setup` and `cleanup` callbacks. A fulfilled
cleanup is evidence only when the adapter contract makes it an observed cleanup
result. Default treatment of a thrown or unknown cleanup result is unresolved;
safe retry needs separate evidence from the effect owner.

**Critical qualification:** registering cleanup only after `await setup()`
succeeds leaks partial work when setup opens a resource and then rejects. The
Host must retain an attempt owner before invoking the factory, and a pending
setup record before invoking its callback, including synchronous throw and
reentrancy. For the simple pair, an admitted adapter must either prove complete
unwind on failure or expose a reachable owner for partial/unknown effects.

Advanced adapters record independently cleanable partial resources before the
next suspension or fallible step. Their final handle must not register the same
obligation again. This is initially an adapter-internal construction protocol;
do not publish a second generic `attempt` API before selecting a concrete
adapter and its evidence. An arbitrary callback returning a rejected Promise
cannot be certified as effect-free by the shared helper.

### Required state behavior

| Event | Observable result / retained responsibility |
| --- | --- |
| Setup requested after closing | Reject before calling the setup adapter. |
| Setup already in flight when closing begins | Keep its original action and owner reachable. |
| That setup succeeds late | Keep the handle for cleanup; never publish it as usable. |
| Factory/setup fails | Preserve the original cause and any cleanup failures. A cleanup-only recovery entrypoint survives failed construction. |
| Two callers request cleanup | Join one physical action. Observers do not each invoke cleanup. |
| Cleanup succeeds observably | Remove that obligation; subsequent observations do not replay it. |
| Cleanup reports proven retry safety | Retain the obligation; only an explicit owner retry starts another physical attempt. |
| Cleanup outcome is unknown | Retain the original action/evidence and reject unsupported retry. An uncertain fd close must not target a reused descriptor. |
| Observer times out or aborts | Keep the raw action, owner and dependent retention; report incomplete. |
| All owned obligations settle | Report complete only after actual dependent work and cleanup settlement. |

The outer owner has a cleanup/recovery surface; borrowers do not. Before coding,
the admission decision must fix its result/error shape and the selected adapter's
partial-failure protocol. Diagnostics alone, a forgotten rejected Promise or a
`disposed` boolean do not provide a recovery owner. The facade does not add
automatic retries, global cancellation, a background driver or persistence.

## Shared-first boundary and existing decisions

Get Modular architecture should own the narrow authoring contract, state
semantics and conformance fixtures. A separately admitted optional runtime
facade may implement the paired helper outside Core/Assembly. Product adapters
own physical cleanup, cancellation, health, retry/readback, prerequisites and
recovery policy. The enclosing Host retains construction and shutdown custody;
that does not make it a second cleanup owner for every module resource.

[ADR-0028](../get-modular/docs/decisions/0028-authorize-the-optional-ownership-contract-checkpoint.md)
freezes declaration evidence for synchronous bookkeeping and explicitly
excludes callbacks and execution. Its `@get-modular/ownership` implementation
is pending. [ADR-0029](../get-modular/docs/decisions/0029-admit-an-optional-lifecycle-kernel-candidate.md)
admits a pure generation/call/custody candidate, not physical cleanup. Neither
package currently implements the proposed helper. A static instance resource
scope need not use the dynamic kernel.

A **new admission/successor decision** must fix package identity/root, dependency
direction, source checks, the execution boundary and its relation to the
S3/G1/K1 order before materializing a shared runtime package. Choose one
authoritative obligation ledger; do not create a facade ledger that will later
compete with admitted ownership bookkeeping. Preserve accepted ADR bytes and
historical evidence. Current **G1 remains `hold`; K1 remains pending**. This
proposal does not bypass their qualification requirements.

## Industry evidence and synthesis

| Primary source | Adopt | Limit we must cover explicitly |
| --- | --- | --- |
| [React useEffect](https://react.dev/reference/react/useEffect) | Put setup and cleanup together. | It does not establish our async construction/recovery contract. |
| [Effect v3 Scope](https://effect.website/docs/v3/resource-management/scope#acquirerelease) | Register lifetime responsibilities in a scope; protect the acquisition/registration boundary. | Its documented acquisition is uninterruptible. Closing a scope does not by itself interrupt all pending tasks; copying the names does not copy its guarantees. |
| [IntelliJ Disposer](https://plugins.jetbrains.com/docs/intellij/disposers.html) | Shortest suitable parent; children clean up first. | A tree alone does not represent cross-scope borrowing. |
| [.NET DI guidelines](https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/guidelines) | The creator/container owns its instances; a consumer does not dispose received dependencies. | External instances retain external ownership; nested scopes are not automatically hierarchical. |
| [OSGi Declarative Services](https://docs.osgi.org/specification/osgi.cmpn/8.1.0/service.component.html) | Explicit bind/unbind and dependency availability. | Rebinding is separate from drain, physical cleanup and exclusivity. |
| [TC39 AsyncDisposableStack](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-asyncdisposablestack.prototype.disposeasync) | Structured lexical cleanup is useful for appropriate lifetimes. | The algorithm marks the stack disposed before cleanup; that state is not proof that each resource was physically released. |
| [OpenClaw at fixed `92108db8`](https://github.com/openclaw/openclaw/blob/92108db80c1fab3685ec0d0c3ed76fc1dcb9be0d/src/plugins/plugin-instance.ts) | Separate instance cleanup, active calls and retained work/custody. Its final disposal waits for timed-out calls to settle. | Retained work does not prove absence of native effects. Supporting new calls after retirement differs from our first kernel contract. |

The proposed improvement is an explicit, testable combination: familiar paired
callbacks, default instance ownership, borrowed ports, partial-construction
recovery and truthful incomplete cleanup. It is a design target, not evidence
that an implementation is already more reliable than these systems.

## Bounded delivery plan

1. **Admission and exact surface.** Draft the successor ADR and agree the
   ledger/dependency choice, cleanup observation/error shape, one partial-setup
   adapter protocol and strong Host recovery entrypoint. Reconcile existing
   gates explicitly. No code package before that decision.
2. **First TEST slice.** In a disposable test consumer, implement the admitted
   paired facade with one instance, one qualified subscription adapter and one
   construction-attempt owner. Cover setup failure, late success and single
   cleanup action. Keep imports out of domain/Core/Assembly. This checkpoint
   proves only these managed paths.
3. **Nested TEST slice.** Add two children borrowing a parent dependency and a
   second materially different adapter with partial async setup. Prove dependent
   cleanup ordering, failure custody, deadline behavior and dependency loss
   across `await`. No real agent/runtime/provider execution.
4. **Current guidance and adoption.** Update the canonical Consumer Module
   Standard's current examples and affected TEST profile/rejecting checks in the
   same delivery. Review the exact pinned revision delta and retain complete
   standard bytes/hash. A stale pin or missing/no-op command is not adoption.
5. **Later, only with concrete need.** Stream handoff/overlapping lifetimes and
   one production consumer receive separate bounded scope. TEST adapters do not
   satisfy two eligible production ownership scopes. Public release and G1/K1
   closure remain separate work, not implicit results of this plan.

Target dependency-safe checkpoints, normally below 2,000 changed lines each.
Do not split a shutdown invariant in half solely to meet that target.

### Focused acceptance evidence

Each future test has an independent failure it must catch; do not duplicate the
same scenario at every layer or infer expected results from the implementation.

| Regression that makes the test fail | Boundary |
| --- | --- |
| Failed factory loses its cleanup/recovery owner | TEST Host construction. |
| Closed scope invokes setup, or reentrant setup is not yet tracked | Facade admission. |
| Partial setup rejects and its existing resource becomes unreachable | Selected real adapter contract in sandbox. |
| Unknown rejected setup is incorrectly declared empty | Attempt settlement. |
| Late success publishes instead of retaining for cleanup | Facade async boundary. |
| Concurrent cleanup starts two physical actions | Owner cleanup boundary. |
| Observer deadline deletes the original action/dependency retention | Owner observation boundary. |
| Explicit safe retry repeats a successful independent cleanup | Retry/readback boundary. |
| Unknown close reports success or permits blind retry | Qualified cleanup adapter. |
| Either child disposes the parent or parent closes before dependent child cleanup | Nested TEST Host. |
| Dependency loss during await permits a subsequent managed effect | Dependency port. |

Future stream slice adds one separate assertion: an unread returned stream keeps
its dependencies until observed finish or a complete ownership handoff. That is
not required for the first nested slice and must not be claimed from it.

Use exact pinned project typecheck and focused conformance/adapter tests. Compile
negative fixtures for borrowed ports and rejected dependency edges. Run final
required CI once on the reviewed head; repeat only unproven phases. Exact
commands must be selected from the admitted package and TEST consumer's actual
scripts before implementation, rather than inventing placeholder passing gates.

### Limits, rollback and estimate

No dynamic loader, process supervisor, global container, exhaustive resource
manifest, arbitrary native-effect detector, Review Router integration or
organization-wide consumer migration. Existing passive consumers are unchanged.
Rollback is a revert of the bounded TEST integration/admission checkpoint;
retain original cleanup owners until the migrated path is proved. Do not run
parallel cleanup ledgers for the same obligation as a fallback.

Planning range for steps 1-4 after resolving admission: **400-800 production
lines + 600-1,200 meaningful test lines + 200-400 documentation/adoption lines**,
roughly **1,200-2,400 changed LOC**, with about x2 uncertainty. This is one
combined estimate, not the sum of four critics' overlapping estimates. It
excludes G1/K1 closure, new physical drivers, production adoption and stream
handoff. Design confidence: 8/10; implementation size confidence: 6/10.

## Review evidence and remaining decisions

Four independent read-only hosted jobs completed with `changedFiles: []`:
hierarchy, ergonomics, async failure/cleanup, and industry comparison. Every job
requested **`gpt-6.1-sol`, `max`, fast (`priority`)** on the authorized pool and
took roughly 3-6 minutes. Manifests/CLI settings confirm the requested profile;
they are not independent attestation of the provider's effective backend tier.
No tests, builds, production runtime or agent actions ran.

Workers verified eight retained input hashes at Get Modular
`9c722ceff4ede307d06d7a4b63fdebe615f54c53`. Their external browsing was blocked
by the hosted network allowlist; industrial comparison used retained primary
materials. The primary agent supplemented current primary React, Effect,
OSGi and TC39 documents, and read the exact OpenClaw blob at
`92108db80c1fab3685ec0d0c3ed76fc1dcb9be0d`. That OpenClaw revision is fixed
research evidence, not a claim about its latest HEAD. AR cleanup PR #185 is a
separate bounded correction, not universal framework qualification.

Synthesis corrected two suggestions: automatic cancellation on any dependency
loss became explicit resource/product policy; generic `resources.use` wording
became the owner-selected `resources.setup({ setup, cleanup })`. The proposed
public `attempt` helper was narrowed to the selected adapter's internal
protocol. No critic's line estimate is added to another's.

[Retained input identities and four results](evidence/module-resource-contract-20261001/README.md)
allow the next implementation/review to inspect the original critiques. The
remaining admission, result/error shape and adapter protocol decisions above
are real prerequisites. This is a reviewed design direction and staged plan;
it is not yet a frozen implementation specification.
