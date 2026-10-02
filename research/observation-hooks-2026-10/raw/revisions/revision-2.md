# Module lifecycle hooks: experimental research

Date: 2026-10-01. **Revision 2**, after four independent hosted critiques and
root online verification of primary sources. Revision 1 is preserved byte for
byte as [research-revision-1.md](evidence/lifecycle-hooks-critique-20261001/research-revision-1.md)
(SHA-256 `3709c3a7e46d6696a419716736f014e528a69f07bdc0cfb5ce81128270c1f337`).
**Experimental design advice, not an admitted hook API or implementation task.**
The [module resource proposal](shared-module-resource-contract-2026-10-01.md)
is a separate delivery; this research neither blocks nor extends it.

Labels used below: **Proven** = primary source quoted in the linked evidence;
**Inference** = our reading of proven facts; **Hypothesis** = unverified until
the TEST experiment or a real consumer shows it.

## Answer to the main question

What to lay down now so that future hooks reach only the modules that need
them, without a mandatory migration of hundreds of other modules:

**Lay down now (written rules only; the TEST-local types below are an
unauthorized proposal; no package or consumer code):**

1. **Default for non-participants.** A module that does not opt into an
   observation keeps its construction-time values and its instance state. A
   separately declared Host policy may reconstruct it instead; reconstruction
   creates a new instance identity and never migrates private state implicitly.
   Dependency replacement and dependency health follow their own explicit
   policies. *Proven precedents:* OSGi DS deactivates a component without a
   `modified` method and creates a new instance; .NET `IOptions<T>` never sees
   reloads; Spring Cloud refresh reaches only refresh-scoped or rebound beans.
2. **Opt-in only through a separately named port or capability.** A module
   participates by requesting a narrow consumer-owned port (a dependency slot or
   an argument of its owner-local factory closure) or by providing an explicit
   update capability. Preserve the Assembly `FactoryContext = { signal }`, the
   factory, instance and capability contracts and their exact compatibility
   tokens. No method-name scanning on instances, no base lifecycle interface,
   no lifecycle bag in every factory context, and no public exhaustive
   `HookKind` union. `FactoryHandle<C>` is invariant in `C`, so adding a port
   capability to a shared schema re-typechecks or rebinds outer composition
   handles; passive factory source must stay unchanged. *Proven:* .NET 8 added
   `IHostedLifecycleService`, selected by an `is` check, with its new startup
   timeout off by default "to avoid a breaking change"; Angular 16 added
   `DestroyRef.onDestroy`; Vue 3.2 added `effectScope`; Riverpod 3 made `ref`
   listeners return a remover. *Inference (from those packets):* existing code
   needed no migration.
3. **Freeze each contract's semantics at version 1.** Notification callbacks
   are synchronous and typed `=> undefined`, record desired input only and are
   never awaited implicitly. Ordering, coalescing, duplicate handling and retry
   behavior are fixed per contract. An incompatible change gets a new port name
   and compatibility token; new knobs default to the old behavior. *Proven
   counterexamples:* React kept `componentWillMount` names but lost their
   guarantees under async rendering; NestJS treated changing hook ordering as a
   breaking v12 change; Riverpod 3 turned on retry and pausing for every provider
   and needed a migration guide; .NET 11 async `ChangeToken.OnChange` overloads
   silently rebind existing async lambdas. *Root-verified:* TypeScript 5.8.3 and
   7.0.2 reject an `async` callback for `=> undefined` (TS2322) but silently
   accept it for `=> void`.
4. **Per-phase error policy.** Registration failure fails that module's
   construction. A throwing notification callback is isolated, reported to its
   owner and does not stop delivery to others. Cleanup failures never stop
   sibling cleanup (already the resource plan's rule). *Proven:* OSGi logs
   `bind`/`modified`/`deactivate` failures and continues while `activate`
   failure is fatal; React, Vue runtime-core, Riverpod and IntelliJ isolate each
   cleanup callback.
5. **Identities at existing Host boundaries, not on every module.** The Host
   already distinguishes instance incarnations; an observed source carries an
   opaque source identity and a monotonic relevant-input revision. Binding and
   health epochs arrive only with their own protocols.
6. **One cleanup authority per registration.** The registering module's owner
   holds `unsubscribe`; borrowing children receive a read-only view.
7. **A written extraction trigger** for any shared driver (see Options).

**Do not lay down now:** lifecycle methods or a base interface on module types;
a lifecycle context added to every Assembly factory; generic
`didChangeDependencies`/`onUpdate`; reflective hook discovery; a hook registry,
universal manager, service bag, global scheduler or reactive engine; a
readiness protocol, in-place dependency replacement or health observation
without a concrete consumer; default reconstruction or automatic retry;
cross-source transactions; new release gates or repository-wide migrations.

**Hypothesis to test:** separately typed opt-in ports leave hundreds of passive
module factories untouched. Industry precedent supports the pattern, but no
packet demonstrates this exact API at this scale; the TEST experiment below
must show it for the owner-local closure route.

## What the industry evidence supports

All cells are **Proven** with exact quotes in the
[root online verification](evidence/lifecycle-hooks-critique-20261001/root-verified-online/README.md)
and the [original relay](evidence/module-resource-planning-20261001/README.md),
except phrases marked *(inference)*.

| System | How a module opts in | Default for non-participants | Documented failure or limit |
| --- | --- | --- | --- |
| [Flutter State](https://api.flutter.dev/flutter/widgets/State-class.html), [InheritedModel](https://api.flutter.dev/flutter/widgets/InheritedModel-class.html) | Override `didUpdateWidget`/`didChangeDependencies`; register an inherited dependency, optionally with aspects. | No dependency registered, no notification. | Frame-owned synchronous traversal *(inference)*; `dispose` is void and not invoked at application shutdown; `mounted` does not prove a request is current *(inference)*. |
| [Riverpod 3](https://riverpod.dev/docs/whats_new) | `ref.watch`/`ref.listen`/`select`, `ref.onDispose` (returns a remover). | Unwatched providers are not notified. | Recompute always destroys provider state; 3.0 default-on retry/pause "could break your app in subtle ways"; docs and source disagree on retry limits. |
| [React](https://react.dev/reference/react/useEffect), [UNSAFE_ lifecycles](https://legacy.reactjs.org/blog/2018/03/27/update-on-async-rendering.html) | Call a hook; `useSyncExternalStore` subscribes with a cached immutable snapshot. | Components without the hook are untouched. | Cleanup is never awaited; stale results are dropped by an `ignore` flag, not cancelled; method names survived while guarantees changed (50,000+ components, codemod). |
| [Vue](https://vuejs.org/guide/essentials/watchers.html), [Svelte](https://svelte.dev/docs/svelte/$effect) | `watch`/`onWatcherCleanup`/`effectScope`; `$effect` teardown. | No watcher, no work. | Ambient registration works only synchronously; an async-created Vue watcher is not bound to its owner; an async `onMount` cannot return cleanup. |
| [Angular](https://angular.dev/guide/components/lifecycle) | Method presence on the prototype; `inject(DestroyRef).onDestroy` (v16, returns unregister). | No method, no call. | Optional interfaces only catch typos; subclass hooks override unless `super` is called; `afterRender` was redesigned (18.1) and renamed (20.0) before stable. |
| [NestJS](https://docs.nestjs.com/fundamentals/lifecycle-events), [Spring](https://docs.spring.io/spring-framework/reference/core/beans/factory-nature.html) | Nest: method presence; Spring: `SmartLifecycle`, annotations. | No hook, no call. | Nest init is fail-fast; teardown `allSettled` comes from 2026-05-28 fixes contained in v12.1.1 (first release not identified); teardown after failed init exists only on unreleased main (PR #17966); v12 hierarchy-level ordering was marked breaking; no hook timeout found in the inspected files. Spring's phase timeout (10 s since 6.2) logs and continues, while async destroy methods are awaited without a bound. |
| [.NET Options and Host](https://learn.microsoft.com/en-us/dotnet/core/extensions/options) | Inject `IOptionsMonitor<T>` (`OnChange` returns `IDisposable`); implement `IHostedLifecycleService`. | `IOptions<T>` stays fixed; plain `IHostedService` unchanged. | One file change "can trigger multiple token callbacks"; `ShutdownTimeout` (30 s since .NET 7) is cooperative and does not abandon awaited work. |
| [.NET DI](https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/guidelines), [IntelliJ Disposer](https://plugins.jetbrains.com/docs/intellij/disposers.html) | Register a disposable with the creator/parent. | Receivers never dispose injected dependencies. | .NET scopes "aren't hierarchical"; IntelliJ registration under a second parent moves the child, so there is no multi-owner model *(inference)*. |
| [OSGi DS 1.5](https://docs.osgi.org/specification/osgi.cmpn/8.1.0/service.component.html) | Declare `modified`, reference `updated`, dynamic `bind`/`unbind`. | No `modified`: deactivate and create a new instance. | Dynamic replacement binds the new service before unbinding the old, so it is not exclusive *(inference)*; a target-property change can unbind a static reference, turning a config change into a replacement *(inference)*; `activate` failure is fatal, while `bind`/`modified`/`deactivate`/`unbind` failures are logged and processing continues. |
| [OpenClaw `c3425e1d`](https://github.com/openclaw/openclaw/blob/c3425e1d7b9550c7ff36deda1c1b0fc0f97332a1/src/plugins/plugin-instance.ts) | Optional `signal`/`onDispose`, explicit consumers and retained work. | No registration, no cleanup entry. | Byte-identical at HEAD `01e32852`; reverse cleanup under one 5 s deadline; logical retirement is not physical cleanup. |

Cross-cutting lessons (**Inference** from the rows above): registration that
returns an unregister handle composes better than method-name hooks; explicit
owner handles survive `await`, ambient "current scope" capture does not; no
inspected UI framework awaits cleanup callbacks; Host-level systems either wait
under deadlines that report rather than prove completion (Spring phases, .NET,
OpenClaw) or wait without a bound (Nest hooks, Spring async destroy methods).

[Flutter's setState design discussion](https://api.flutter.dev/flutter/widgets/State/setState.html)
still supports a concrete action (`updateSettings`, a selected observation)
over a vague `somethingChanged` notification.

## Six distinct contracts and their current status

| Event | In Get Modular today | Owner | Non-participant default | Future opt-in path |
| --- | --- | --- | --- | --- |
| Settings change | No notification; values fixed at construction. | Settings source in the product adapter. | Keeps construction values; restart-required settings use Host reconstruction. | Settings observation port (the experiment below). |
| Dependency replacement | Assembly is static; the TEST Host's L2c1 replaces a whole generation after the old physical stop. | Host. | Reconstruction with a new identity; no in-place rebinding. | In-place rebinding only for a consumer that must preserve state across a provider swap (OSGi dynamic-reference rules). |
| Dependency unavailability | Resource plan: signalled loss fences mediated effects; product policy decides. | Adapter and product Host. | Managed port refuses use; no notification. | Separate lossless health contract with epochs; never coalesced into settings. |
| Module state change | Module-private; observers get inert views. | Module instance. | Not a lifecycle event. | Ordinary module port. |
| Readiness | Construction success is not readiness (the Host decides). For the current slice factory completion is sufficient initialization, so no module readiness hook exists. | Host. | Unchanged. | Explicit start/ready capability for background services, only with a concrete consumer. |
| Cleanup | Host-owned; resource plan adds an optional per-instance owner. | Owner of the obligation. | Pure and borrow-only modules need nothing. | Already covered by the resource plan; hooks add none. |

Do not coalesce unavailable-then-available into a harmless notification. Do
not treat a change as teardown or recursively destroy dependents. Ownership
parentage, dependency bindings, notification interests and cleanup
prerequisites are **four separate relations**. A parent closes only after
admitted borrower work that retains it settles and every required child
obligation is observed released; cleanup-action settlement alone does not
discharge an obligation. Borrowers never close the parent; independent siblings
have no implicit order. The current resource slice
supports only explicit nesting and rejects overlapping external borrowing and
cyclic prerequisites, so diamonds and cross-branch borrowers remain later scope.

## Options

Scores are design judgments out of 10, not measured reliability; higher 🧠 is
more complex. LOC is incremental, roughly ×2 uncertain, and excludes the
resource proposal, physical adapters and release work.

| Rank | Approach | 🎯 | 🛡️ | 🧠 | Production / tests / docs LOC |
| --- | --- | ---: | ---: | ---: | --- |
| 1 | **Explicit feature methods and consumer-owned ports** (default) | 9 | 8 | 2 | 60–140 / 180–300 / 60–100 |
| 2 | **Selected subscriptions**, with a private owner-local helper when justified | 8 | 8 | 4 | 180–320 / 350–550 / 90–150 |
| 3 | **Supported opt-in driver for one event family**, only after the extraction trigger | 6 | 7 | 6 | 450–750 / 650–1,000 / 140–220 |

1. Fits infrequent, deliberate updates: the Host calls `applySettings(next)` on
   modules that provide that capability. No subscription machinery.
2. Fits continuing push observation that must preserve instance state (counters,
   unchanged event subscriptions). This is what the TEST experiment evaluates.
   **Shared-first review:** the consuming Host feature may own a private
   `runLatestDerivedState` helper (about 100–180 / 180–300 / 40–70 LOC) for one
   active derivation, one pending snapshot and guarded publication. Consumers
   depend on it; it imports no product models, adapters, Core or Assembly and
   performs no acquisition, health supervision, retry, readiness or disposal.
   Reuse removes duplicated concurrency reasoning but couples consumers to one
   coalescing policy.
3. **Extraction trigger (Hypothesis):** at least two independently owned
   consumer features (not instances of one feature) need identical semantics -
   atomic registration, immutable snapshots, latest-state coalescing, one
   active/one pending derivation, current-revision fencing, independent failure
   and closure fencing - and both showed the same observable failure or needed
   the same correction. Share only that intersection. A shared execution surface
   also needs a new accepted successor decision.

Considered and not ranked: an **Effect runtime** is an implementation
technology inside an already Effect-based Host, not an architectural
alternative here (the TEST consumer declares no Effect dependency). A
**per-instance lifecycle scope passed to every factory** (the topic A agent's
inference) would put hook machinery on all modules, risks becoming a service
bag and would change Assembly's factory contract; where a module needs an
owner, the resource plan's optional per-instance owner already supplies it.

No option is proved more reliable than the reference systems. The intended
advantage is fewer hidden contracts and explicit failure evidence.

## Minimal recommended API (TEST-local proposal)

Proposal only; these are not Get Modular exports. They live in the TEST
consumer next to its settings source.

Option 1 needs only a capability `applySettings(next: SettingsSnapshot<K>):
undefined` that the participating module provides and the Host calls
synchronously; it has no concurrency to test. The sketch below is the option-2
port that the experiment evaluates.

```ts
declare const sourceBrand: unique symbol;
type SourceId = { readonly [sourceBrand]: true };

type SettingsSnapshot<K extends keyof Settings> = Readonly<{
  source: SourceId;
  revision: number; // source commit number of the latest commit that changed a selected key (A→B→A advances it)
  values: Readonly<Pick<Settings, K>>; // immutable; same object while unchanged
}>;

type SettingsView<K extends keyof Settings> = Readonly<{
  initial: SettingsSnapshot<K>;
  current(): SettingsSnapshot<K>; // authoritative for publication guards
}>;

type SettingsObservation<K extends keyof Settings> = SettingsView<K> &
  Readonly<{ unsubscribe(): undefined }>; // registration owner only

interface SettingsObservationPortV1 {
  observe<const Keys extends readonly (keyof Settings)[]>(
    keys: Keys,
    recordDesired: (next: SettingsSnapshot<Keys[number]>) => undefined,
  ): SettingsObservation<Keys[number]>;
}
```

Contract (each point is fixed for V1):

- **Registration** installs the listener and captures `initial` atomically;
  delivery starts after `observe` returns, never re-entrantly inside a commit.
  The module stores the handle synchronously before yielding.
  An empty `keys` list is a registration error.
- **Delivery:** after each commit that changes a selected key, the registration
  receives one later delivery carrying that revision or a newer one.
  Intermediate revisions may coalesce; one commit never yields two deliveries to
  one registration. A delivery whose revision is not newer than the last
  recorded one is a no-op and never retries failed work. Health loss and
  commands never use this lossy channel.
- **Callbacks** are synchronous, return `undefined`, only record desired input
  and are never awaited. Exceptions are isolated and reported to the owner.
  Named handlers and methods must declare `: undefined`; a `void`-inferred
  function is rejected at compile time, which is intended.
- **Derivation** belongs to the module. A synchronous derivation needs no extra
  machinery. An asynchronous one runs at most one active computation with one
  latest pending input; before publication it checks registration admission
  and `current().revision`, then commits inert state synchronously. A failure
  keeps the previous applied value and revision and records source, revision
  and cause; an older failure never downgrades a newer success.
- **Non-settlement:** pending input is bounded, computation time is not. A
  never-settling computation blocks convergence; an observation deadline
  reports pending work and never starts a second concurrent run.
- **`unsubscribe()`** is idempotent. It synchronously closes this
  registration's source admission and drops queued deliveries. The module's
  derivation checks that admission before it starts or publishes work, drops
  its own pending snapshot, and still observes the active run's fulfillment or
  rejection without publishing. It does not claim cancellation or physical
  cleanup and never closes the source.
- **Ownership:** register once during construction. If the resource candidate
  exists, its owner holds `unsubscribe` and the composition adapter maps it to
  `CleanupResult`: `released` only after independently observed detachment and
  settlement of any active derivation run; an unsettled run yields
  `unresolved` and keeps the Host admitted-work barrier open. Otherwise the TEST
  Host's existing cleanup owns it under the same rule. Borrowing children
  receive `SettingsView`.
- **Scale:** the source indexes interests by key. A commit visits only touched
  key buckets and deduplicates registrations; work is independent of ownership
  depth. A broad subscription legitimately fans out to every subscriber.

## One bounded TEST experiment (proposal, not authorized)

**Goal:** show opt-in observation without migration, selective dispatch and
safe async derivation in the TEST consumer only. No new Core records,
composition nodes, package or generic hook manager.

**Fixture:** one real in-process settings source; 600 lightweight instances
constructed through Assembly from an unchanged passive fixture, with inert
depth-64 ownership metadata kept separate from Assembly's eight-segment owner
paths: 12 subscribers of key `K` (including one synchronous and one
asynchronous derivation consumer) and 588 passive instances. Two extra
instances: a broad subscriber as a fanout control, and a consumer that later
receives a second, separately typed opt-in port through its owner-local factory
closure. One live setting and one restart-required setting.

**Fail if:**

- registration misses the latest committed view or yields mixed settings;
- any passive instance changes, acquires a registration or callback, is
  reconstructed by a live setting, or its factory/type fixture must be edited
  when the second port is added;
- dispatch for `K` reads the fixture topology (fixture-owned counting proxies),
  or its per-commit registration-visit count changes when 10,000 registrations
  are added on an unrelated key, or one commit delivers twice to one
  registration;
- an obsolete result publishes after a newer revision, including A→B→A, or
  after `unsubscribe`; computations overlap within one consumer; pending work
  exceeds one snapshot; or the result does not converge after release;
- a held computation is reported as settled, or a deadline starts a new run;
- one callback or computation failure stops an independent consumer or loses
  its original cause;
- a live setting resets instance counters or recreates an unchanged event
  subscription; or a restart-required setting does not produce a new identity.

Observe actual commits, public derived values and independently inspected
listener membership. Do not duplicate cleanup scenarios owned by the resource
plan. Estimated 180–320 / 350–550 / 90–150 LOC. It demonstrates mechanics on a
synthetic topology, not production throughput, diamond cleanup or the extraction
threshold.

Resourceful async hooks (acquiring on change, rebinding, health-driven stop)
stay later scope: they need an attempt owner before callbacks, retained partial
and late-resource cleanup, explicit producer stop/drain and dependency
retention, and post-construction registration that the resource slice excludes.

## Corrections to revision 1

All are confirmed by root against the critiques and sources. No P1 defect and
no false framework claim requiring retraction was found.

| ID | Sev. | Defect in revision 1 | Correction above | Source |
| --- | --- | --- | --- | --- |
| H2-1 | P2 | No default for modules that do not opt in. | Main answer item 1; status table. | API-1, root |
| H2-2 | P2 | No extension and compatibility rule for new hook kinds. | Main answer items 2-3. | API-2, ARC-1, HIE-3 |
| H2-3 | P2 | `onChange` execution and return contract undefined (`void` accepts async). | API contract; root TS check. | API-3, ASY-3 |
| H2-4 | P2 | Convergence assumed settlement of the active computation. | Non-settlement rule. | ASY-1 |
| H2-5 | P2 | `stop()` postcondition and single authority unclear. | `unsubscribe()` rule, ownership rule. | ASY-2, root |
| H2-6 | P2 | Subscriber exceptions, duplicate revisions and failure retention unspecified. | Delivery, callback and derivation rules. | ASY-3 |
| H2-7 | P2 | "No full scan" was not a verifiable work bound. | Key index rule; instrumented fail condition. | HIE-1 |
| H2-8 | P2 | Cross-branch retention, sibling order and cycles underspecified. | Four relations paragraph. | HIE-2 |
| H2-9 | P2 | Shared-first skipped the narrow helper and extraction trigger. | Option 2 helper; option 3 trigger. | ARC-2 |
| H2-10 | P3 | Effect runtime occupied a top-3 slot without applicability (critic P2; downgraded because revision 1 already limited Effect to an existing Effect Host). | Re-ranked options. | ARC-3, root |
| H2-11 | P3 | Synchronous derivation was given async lane machinery. | "Synchronous derivation needs no extra machinery". | ASY-1, root |
| H2-12 | P3 | Riverpod missing; table lacked opt-in and default columns; six-event table read as planned features. | Industry and status tables. | root |

An independent review of the first revision-2 draft
([root-review-of-revision-2.md](evidence/lifecycle-hooks-critique-20261001/root-review-of-revision-2.md))
found no P1, five P2 and seven P3 issues (R2-1…R2-12); root verified and applied
all of them. The material ones: cleanup must drain the active derivation before
reporting `released` (R2-1); parent closure needs observed child release, not
action settlement (R2-2); Assembly handle invariance and the untested
dependency-slot route (R2-3); a delivery rule that contradicted a fail
condition (R2-4); and "Proven" labels that covered packet inferences (R2-5).

Claims checked and still correct: React cleanup/`ignore`/StrictMode; Vue
synchronous registration; Svelte async `onMount`; Flutter `dispose`/`mounted`
and the setState design note; Spring 10 s since 6.2; .NET non-hierarchical
scopes and receiver non-disposal; OSGi make-before-break and logged callback
failures; OpenClaw retained timed-out calls; the historical AR scaffold
correction. One wording is strengthened: an asynchronously created Vue watcher
**is not** bound to its owner (revision 1 said "may lack").

## Conflicts with the resource plan

Checked against [the resource plan](shared-module-resource-contract-2026-10-01.md)
at SHA-256 `46e869cefe261dab667f87f6249c63bfb301f3b1581e52f87cf42f270dc0eea7`.
**No conflict remains**, and none requires a resource-plan edit. The four
critics found none; the independent review found one gap on the hooks side
(R2-1: the first draft's cleanup mapping skipped the plan's drain rule), now
fixed in the API contract. Integration notes:

- Its "serial, awaited construction-only setup" admits registering one
  observation during construction; re-subscription or acquisition on change
  would exceed that slice and needs a separate successor.
- Its `CleanupResult` needs an adapter around `unsubscribe()` that observes
  detachment and drains the active derivation run, as its subscription rule
  requires ("removes the exact listener and drains admitted handlers").
- Its parent rule ("every required child resource is observed released") is
  the rule this research now uses for borrowers and children.
- Its rejection of overlapping external borrowing and cyclic prerequisites is
  consistent with treating diamonds as later scope here.
- Its sentence that this synthesis "recommends explicit selected-input ports
  first" and adds no generic `didChangeDependencies` driver stays accurate.

If the plan changes after that hash, recheck these points.

## Remaining limitations

- **No independent online research by hosted workers.** The installed runtime
  (release `dd1f6f2b`) sets `web_search: "disabled"`, its job API exposes no
  override, and `networkAccess: "unrestricted"` requires a danger-full-access
  sandbox, which is not allowed
  ([runtime check](evidence/lifecycle-hooks-critique-20261001/runtime-capability-check.md)).
  The admitted research network profile required by AGENTS is missing. Root's
  own subagents fetched sources directly online; hosted critics analyzed them
  as root-supplied packets.
- Critic inputs also carried 49 metadata-only macOS `._*` files; the topic B
  packet they received differs from root's final copy by three shortened
  sentences.
- The experiment covers only the owner-local closure route for a new port. The
  dependency-slot route changes the shared capability schema `C`, so its
  zero-migration claim remains untested.
- Requested profiles (`gpt-6.1-sol`, xhigh, fast) are manifest requests, not
  attested backend tiers.
- Unverified or partly verified: `IOptionsMonitor.OnChange` double firing (only
  `ChangeToken`/file-watcher evidence); NestJS PR #17966 is unreleased;
  Flutter docs carry no stable version; Riverpod docs contradict each other on
  retry; Nest "no hook timeout" rests on a search of the named hook and
  context files only; .NET scope disposal order is from source only; React's dropped 17.0
  removal plan is inferred from v19.2 source; the .NET 11 rebinding is
  documented for Preview 7; Flutter `inherited_model.dart`, Riverpod listener
  dispatch and Effect `SubscriptionRef` sources were requested but not retained.
- Scores, LOC and the extraction threshold are design judgments. The
  zero-migration claim, the dispatch work bound and the API sketch are
  untested beyond the TypeScript callback fixture.
- No implementation, build, test or runtime flow ran; nothing here qualifies
  production behavior. Accepted ADR-0028/0029 bytes stay immutable, a shared
  callback surface needs a new accepted successor, G1 stays `hold`, K1 stays
  pending, and TEST evidence never qualifies production or release.

## Provenance

- [Revision 2 critique evidence](evidence/lifecycle-hooks-critique-20261001/README.md):
  scope, input manifest, four raw critic results and exported reports, root
  online sources and requested profiles.
- [Original five research reports and relay](evidence/module-resource-planning-20261001/README.md):
  preserved unchanged; they requested `gpt-6.1-sol` max/default, analyzed
  root-relayed sources and changed no files. Revision 1's root corrections (AR
  scaffold history, Spring 10 s) remain valid and are listed under "Claims
  checked".
