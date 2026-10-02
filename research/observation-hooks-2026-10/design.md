# Module lifecycle hooks: research and recommended design

> Governed decision: [OD-007](../../docs/open-decisions/OD-007-module-change-observation-package.md).
> Moved from the workspace `plans/` folder on 2026-10-02; content is revision 4.

Date: 2026-10-01. **Revision 4**: research round 4 (competitors' mistakes, reactive
primitives, public API) applied and code-validated. Earlier revisions are kept in
[1](raw/revisions/revision-1.md), [2](raw/revisions/revision-2.md) and
[3](raw/revisions/revision-3.md) (originals `3709c3a7…`, `eee3f342…`,
`9754799b…`; copies 2 and 3 carry the redacted details listed in the
[archive README](README.md#redacted-details)). This is a design recommendation for a **public package**, not an
admitted package or an implementation task; implementation is a separate delivery.

Labels: **Proven** = primary source quoted in the linked evidence; **Measured** =
observed by running the code sketches; **Inference**; **Hypothesis**.

## Owner decisions (2026-10-01)

1. **Owner of the mechanism: a Get Modular package**, working name
   `@get-modular/observation`, designed library-first.
2. **Default: one hub per event family with data-only participants** (sync apply
   or async derive); a module-owned subscription stays as an escape hatch.
3. **First consumer: TEST first.** Agent Runtime has no fitting consumer today
   ([scan](raw/evidence/code-sketch/critic-reports/agent-runtime-consumer-scan.md)).
   This is an **explicit owner exception** to the written rules requiring "at least
   one real consumer in the same delivery" and "a concrete need" (workspace
   `AGENTS.md`, which is not part of this repository; resources design §1,
   §14.7); the rules are not amended here.
4. Resources follow the owner-accepted
   `@get-modular/resources` scope design (workspace `plans/module-resource-scopes-design-2026-10-01.md`, owned by the resources stream; moving to get-modular)
   (SHA-256 `0ce53086…`), which supersedes the earlier resource contract plan.
5. **Public from the first release:** `0.x` on npm in the normal GM release flow,
   like the resources package (its Q6). Consumers are expected; current non-use is
   not evidence of no need. Pre-1.0 breaks: 0.x minor + changelog + migration guide.
6. **A deeper research round before implementation** to avoid competitors'
   mistakes and overengineering: done (below).

## Answer to the main question

What to lay down so that future hooks reach only the modules that need them,
without a mandatory migration of hundreds of others.

**One module standard for configuration** (into the Consumer Module Standard).
It covers modules that consume an **in-process keyed source**; reading durable
authority per operation (as Agent Runtime does) stays valid and is not replaced:

1. **Get values:** at construction, `read(keys)` returns an immutable snapshot with
   a revision (the `IOptions<T>` shape). Modules that never need changes stop here.
2. **Learn about changes:** opt in with **one `provides` entry** of a participant
   built by `settings.sync({ initial, apply })` or
   `settings.derived({ keys, derive, apply, fail })`, where
   `settings = participantsFor<AppSettings>()` is created once per product.
3. **Non-participants:** keep construction values and instance state; a change
   that must reach them is a Host decision to reconstruct (new identity). *Proven
   precedents:* OSGi DS without `modified` creates a new instance; .NET
   `IOptions<T>` never sees reloads; Spring Cloud refresh reaches only
   refresh-scoped or rebound beans.

**Package rules** (each backed by the evidence below; numbering continues the
module standard above because other notes cite rules by number):

<!-- markdownlint-disable MD029 -->
4. **Values are immutable plain data with a declared key set.** Every key exists
   in the initial record (`T | undefined`, never `?:`); unknown keys in `commit`,
   `read` or `observe` throw `observation.keys.unknown`; values must be plain data
   (primitives, plain objects, arrays) or `observation.values.not-plain` is thrown
   (Date, Map, Set, class instances and functions could change without a commit);
   `commit` takes ownership and freezes plain objects and arrays in place (only
   the patch is walked); key arrays are copied. (Measured: v3 silently dropped an
   optional key and missed in-place mutation.)
5. **Participants are opaque data; only the hub subscribes.** Created only by
   `participantsFor<V>()`; their subscribe plan is package-private, so user code
   can neither forge a participant nor subscribe through it, and a new participant
   kind is not a breaking change. The Host derives the hub's participant binding
   from the declarations that provide the capability (fail-closed); before any
   subscription the hub rejects mismatched counts, duplicate IDs, the same
   participant twice and forged participants. One package copy per process is
   required (participants from another copy are reported as foreign).
6. **Callbacks:** synchronous, typed `=> undefined` (TS 5.8.3 and 7.0.2 reject an
   async callback for `=> undefined`), only record desired input, never awaited,
   isolated per registration. `reportError` must be synchronous and must not
   throw; a throwing reporter is a Host bug surfaced as an uncaught error (like
   RxJS), never swallowed and never blocking other deliveries.
7. **Delivery:** a registration and its snapshot are atomic; a caller that already
   holds a snapshot passes it as `since` (source, covered keys and range are
   verified; a `Snapshot` fits) and gets
   one catch-up through the same isolated, seal-aware path. Delivery runs in a
   later task (`setImmediate` in Node, else a 0 ms timer), at most once per commit
   per registration, may coalesce revisions; a non-newer revision is a no-op.
   **A revision is a commit number, not proof of a value change**: A->B->A
   delivers again, so `apply` must be idempotent. No delivery and no new
   observation after the Host seals the source. Order between registrations is
   deterministic but not contractual.
8. **Async derivation:** one active run and one latest pending input; the package
   publishes only if the registration is attached and the revision is current,
   calls `fail` instead of `apply` on failure, and aborts cooperatively on close
   or supersession. Keeping the previous value and clearing an older failure are
   the participant's duties.
9. **Ownership through resource scopes, zero package dependencies:** the hub needs
   only a structural `HubResources` (`setup`), which `@get-modular/resources`
   satisfies. It registers drain records first (only for derived participants,
   which can have work), then one subscription per participant, so LIFO
   unsubscribes everyone before draining. A drain still running when the Host
   escalates fails with `observation.derivation.still-running` (a debt naming the
   participant) after one task of grace for cooperative aborts, so LIFO continues;
   escape-hatch lanes use the same `closeAndDrain(signal)`. Deadlines, escalation,
   `abandon`, sealing and readiness decisions stay Host policy.
10. **Errors:** `ObservationError` with a stable `code` (`observation.<area>.<reason>`).
    The scheme `<pkg>.<area>.<reason>` was agreed with the resources stream on
    2026-10-02 (resources moves to codes such as `resources.scope.closed`); the
    scope-closed error from resources passes through unwrapped, and a GM dev test
    against the real resources package pins the exact code.
11. **Types:** record type parameters are invariant (`in out V`); negative type
    fixtures run on the minimum (5.8.3) and pinned (7.0.2) compilers. (Measured: TS
    7.0.2 accepted `ObservationPort<A>` as `ObservationPort<B>` without it.)
12. **Evolution:** pre-1.0, change the contract deliberately (minor release,
    changelog, migration note, migrate own consumers) instead of parallel variants.
    *Proven counterexamples* of silent semantic change: React kept
    `componentWillMount` names while their guarantees changed; NestJS marked a
    hook-ordering change breaking in v12; Riverpod 3 enabled retry and pausing by
    default; .NET 11 async `ChangeToken.OnChange` overloads silently rebind async
    lambdas (documented for .NET 11 Preview 7, not checked against GA).
<!-- markdownlint-enable MD029 -->

**Do not lay down now:** lifecycle methods or a base interface on module types; a
hook or notification context in every factory (factories get only the resources
design's `resources` and the Host's attributed `reportError`); generic
`didChangeDependencies`; reflective hook discovery; a **source status
(ready/stale/error)** or health contract; a readiness protocol beyond
per-participant outcomes; in-place dependency replacement; cross-source
transactions; per-subscriber `equals`/selectors; interop adapters (signals,
Observable, Svelte stores); a computed graph; pluggable schedulers; history or
replay logs; a `/testing` subpath; a peer dependency on resources; dual CJS+ESM
builds; stability tiers; compatibility shims during 0.x.

## Research round 4: competitors' mistakes and the minimal shape

Three independent xhigh researchers, online primary sources pinned to tags or
commits, plus probes on sketch v3
([reports](raw/evidence/research-r4/)):

- **Configuration and feature flags** ([topic A](raw/evidence/research-r4/topic-a-config-flags.md)):
  OpenFeature, LaunchDarkly, Unleash, ConfigCat, GrowthBook, Flagsmith, .NET
  options/change tokens, Spring Cloud, Kubernetes informers, etcd, Consul, Kotlin
  StateFlow. *Proven* for OpenFeature (provider status redesigned repeatedly,
  spec#238/#365, swift-sdk#114), Unleash (`ready` meant "backup read", #209),
  ConfigCat ("not guaranteed") and GrowthBook (#1841); generalizing to every
  studied system is *Inference*.
  LaunchDarkly fixed stale overwrites with one active plus one replaceable pending
  task (js-core#840/#842), the same shape as our lane; .NET change tokens "can
  trigger multiple token callbacks for a single configuration file change";
  StateFlow "can never represent a failure". **Conclusion:** no source status in
  v1; our source is complete at creation; adapter health is Host policy.
- **Reactive primitives and interop** ([topic B](raw/evidence/research-r4/topic-b-reactive.md)):
  TC39 Signals is Stage 1 with effects deliberately excluded and a polyfill marked
  "Do not use this in production"; Observable ships only in Chrome; Svelte stores
  require synchronous delivery. Competitors' mistakes our design already avoids:
  one subscriber error silencing others (Svelte #11555, Jotai PR #2871), errors
  thrown to the writer (Jotai, Preact), lost value between read and subscribe
  (Zustand #475; React rechecks the snapshot after commit, as our `since` does),
  unbounded buffers (Effect `PubSub.unbounded`). **Conclusion:** no interop in v1;
  a `useSyncExternalStore` recipe (with `view.current()`, never `reader.read()`,
  as `getSnapshot`) only when a UI consumer appears.
- **Public API and package consistency** ([topic C](raw/evidence/research-r4/topic-c-api-consistency.md)):
  measured TS 7 variance hole, silent key loss, duplicate IDs producing a false
  `complete: true`, a public visitor protocol and a type dependency on resources;
  lessons from TanStack Store, nanostores, zustand v5, @preact/signals-core and
  OpenFeature peer ranges (js-sdk#1227). **Conclusion:** opaque participants via
  `participantsFor<V>()`, structural `HubResources`, `ObservationError` codes,
  invariant types, and **sequential integration** with the resources package
  (below).

All fixes are in sketch v4, then hardened by a final independent xhigh review
(G-1…G-13, [report](raw/evidence/code-sketch/critic-reports/final-review-rev4.md)).
Measured: 30/30 checks on Node 24.18.0 (inside the GM range) and 26.9 (outside
it: GM supports `>=26.10`, which was not available locally); typecheck and
negative type fixtures clean on TS 5.8.3 and 7.0.2.

| Competitor mistake | Countermeasure in v4 |
| --- | --- |
| Stale async response overwrites newer data (LaunchDarkly #840, Flagsmith #203) | monotonic revision; publish only if `admits` and current |
| Listener accumulation / leaks (OpenFeature #1360, Flagsmith #390, RxJS `shareReplay`) | one owned subscription per participant; scope cleanup verifies detachment |
| One subscriber error stops others (Svelte #11555, Jotai #2871, Zustand) | per-registration isolation |
| Phantom "changes" (Unleash #209, LaunchDarkly `update`, .NET #36045) | `Object.is` no-op commits; documented "revision is not a value change" |
| Unrelated section notifies (.NET #109445) | per-key index |
| Notify before consistent state (.NET #119883, Spring #1593) | values replaced before deferred delivery |
| In-place mutation invisible (StateFlow, Spring #1727) | deep freeze |
| Backwards or foreign revision (Consul) | `since` checked against source and range |
| Work after dispose (ConfigCat #36, OpenFeature #1374) | `observe`/`commit` after `seal` throw |
| Unbounded buffers (client-go, Effect) | coalescing dirty set |
| Value lost between read and subscribe (Zustand #475) | atomic `initial` + `since` catch-up |
| Readiness semantics unstable (OpenFeature, Unleash, ConfigCat, GrowthBook) | no source status; per-participant outcomes only |
| Type-unsafe generic store (zustand #1723) | `in out V`, declared keys, negative fixtures |

## Evidence from executable sketches

Built against the real `@get-modular/core` and `@get-modular/assembly` (get-modular
`9c722ce`) with a stand-in of the accepted resources design
([sketches and reports](raw/evidence/code-sketch/README.md)):

| Sketch | What it is | Result |
| --- | --- | --- |
| v1 | Three options side by side | 17/17 own checks, but three independent xhigh critics found 10 P1 defects (some overlapping) |
| v2 | Fixes; hub for sync and derived participants | 30/30; re-review found 1 new P1 and 4 P2, fixed |
| v3 | Generic library + resources-design scopes | 25/25 after the revision-3 review fix |
| v4 | Research round 4 fixes + final review G-1…G-13 (this design) | 30/30 on Node 24.18.0 and 26.9; TS 5.8.3 and 7.0.2 clean incl. negative fixtures |

**Scale (Measured on v1 variants; v4 not re-measured):** registration visits per
commit equal the subscribers of the changed key (12 at 96 and 576 modules, and
after 10,000 unrelated registrations); compile + prepare linear (576 modules:
62 + 72 ms; 2,304: 218 + 241 ms); TS 5.8.3 checks 576 modules in 2.7 s (tsc7
0.8–1.1 s). **Cost (Measured in v4):** passive module 0 lines; sync participant one
call plus one `provides` entry; derived about six lines; escape hatch about 20;
package core about 570 lines without comments (including internal test diagnostics).

## What the industry evidence supports

All cells are **Proven** with exact quotes in the
[root online verification](raw/evidence/root-verified-online/README.md)
and the original relay (workspace `plans/evidence/module-resource-planning-20261001/`, pending migration with the resource planning archive),
except phrases marked *(inference)*.

| System | How a module opts in | Default for non-participants | Documented failure or limit |
| --- | --- | --- | --- |
| [Flutter State](https://api.flutter.dev/flutter/widgets/State-class.html), [InheritedModel](https://api.flutter.dev/flutter/widgets/InheritedModel-class.html) | Override `didUpdateWidget`/`didChangeDependencies`; register an inherited dependency, optionally with aspects. | No dependency registered, no notification. | Frame-owned synchronous traversal *(inference)*; `dispose` is void and not invoked at application shutdown; `mounted` does not prove a request is current *(inference)*. |
| [Riverpod 3](https://riverpod.dev/docs/whats_new) | `ref.watch`/`ref.listen`/`select`, `ref.onDispose` (returns a remover). | Unwatched providers are not notified. | Recompute always destroys provider state; 3.0 default-on retry/pause "could break your app in subtle ways"; docs and source disagree on retry limits. |
| [React](https://react.dev/reference/react/useEffect), [UNSAFE_ lifecycles](https://legacy.reactjs.org/blog/2018/03/27/update-on-async-rendering.html) | Call a hook; `useSyncExternalStore` subscribes with a cached immutable snapshot. | Components without the hook are untouched. | Cleanup is never awaited; stale results are dropped by an `ignore` flag, not cancelled; method names survived while guarantees changed (50,000+ components, codemod). |
| [Vue](https://vuejs.org/guide/essentials/watchers.html), [Svelte](https://svelte.dev/docs/svelte/$effect) | `watch`/`onWatcherCleanup`/`effectScope`; `$effect` teardown. | No watcher, no work. | Ambient registration works only synchronously; an async-created Vue watcher is not bound to its owner; an async `onMount` cannot return cleanup. |
| [Angular](https://angular.dev/guide/components/lifecycle) | Method presence on the prototype; `inject(DestroyRef).onDestroy` (v16, returns unregister). | No method, no call. | Optional interfaces only catch typos; subclass hooks override unless `super` is called; `afterRender` was redesigned (18.1) and renamed (20.0) before stable. |
| [NestJS](https://docs.nestjs.com/fundamentals/lifecycle-events), [Spring](https://docs.spring.io/spring-framework/reference/core/beans/factory-nature.html) | Nest: method presence; Spring: `SmartLifecycle`, annotations. | No hook, no call. | Nest init is fail-fast; teardown `allSettled` comes from 2026-05-28 fixes contained in v12.1.1; teardown after failed init exists only on unreleased main (PR #17966); v12 hierarchy-level ordering was marked breaking; no hook timeout found in the inspected files. Spring's phase timeout (10 s since 6.2) logs and continues, while async destroy methods are awaited without a bound. |
| [.NET Options and Host](https://learn.microsoft.com/en-us/dotnet/core/extensions/options) | Inject `IOptionsMonitor<T>` (`OnChange` returns `IDisposable`); implement `IHostedLifecycleService`. | `IOptions<T>` stays fixed; plain `IHostedService` unchanged. | One file change "can trigger multiple token callbacks"; `ShutdownTimeout` (30 s since .NET 7) is cooperative and does not abandon awaited work. |
| [.NET DI](https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/guidelines), [IntelliJ Disposer](https://plugins.jetbrains.com/docs/intellij/disposers.html) | Register a disposable with the creator/parent. | Receivers never dispose injected dependencies. | .NET scopes "aren't hierarchical"; IntelliJ registration under a second parent moves the child, so there is no multi-owner model *(inference)*. |
| [OSGi DS 1.5](https://docs.osgi.org/specification/osgi.cmpn/8.1.0/service.component.html) | Declare `modified`, reference `updated`, dynamic `bind`/`unbind`. | No `modified`: deactivate and create a new instance. | Dynamic replacement binds the new service before unbinding the old, so it is not exclusive *(inference)*; a target-property change can unbind a static reference, turning a config change into a replacement *(inference)*; `activate` failure is fatal, while `bind`/`modified`/`deactivate`/`unbind` failures are logged and processing continues. |
| [OpenClaw `c3425e1d`](https://github.com/openclaw/openclaw/blob/c3425e1d7b9550c7ff36deda1c1b0fc0f97332a1/src/plugins/plugin-instance.ts) | Optional `signal`/`onDispose`, explicit consumers and retained work. | No registration, no cleanup entry. | Byte-identical at HEAD `01e32852`; reverse cleanup under one 5 s deadline; logical retirement is not physical cleanup. |

Cross-cutting (**Inference**): registration returning an unregister handle
composes better than method-name hooks; explicit owner handles survive `await`,
ambient "current scope" capture does not; no inspected UI framework awaits
cleanup callbacks; Host-level systems either wait under deadlines that report
rather than prove completion or wait without a bound.

## Six distinct contracts and their status

| Event | Today | Owner | Non-participant default | Path |
| --- | --- | --- | --- | --- |
| Settings change | No notification in GM. | Source state and delivery: the package; feeding values and commit policy: the product. | Keeps construction values; restart-required settings use Host reconstruction. | Participant capability (this design). |
| Dependency replacement | Assembly is static; TEST L2c1 replaces a whole generation after the old physical stop. | Host. | Reconstruction with a new identity. | In-place rebinding only for a concrete consumer that must keep state across a provider swap. |
| Dependency unavailability | Signalled loss fences mediated effects; product policy decides. | Adapter and product Host. | Managed port refuses use; no notification. | Separate lossless health contract with epochs, deferred; no source status in v1 (topic A). |
| Module state change | Module-private; observers get inert views. | Module instance. | Not a lifecycle event. | Ordinary module port. |
| Readiness | Construction success is not readiness (the Host decides). The hub reports each participant's first outcome as an input. | Host. | Unchanged. | Explicit readiness protocol only with a concrete consumer. |
| Cleanup | `@get-modular/resources` scopes (accepted design). | Creator of the resource. | Pure and borrow-only modules write nothing. | Covered by resources; the hub uses it. |

Do not coalesce unavailable-then-available into a harmless notification. Do not
treat a change as teardown or recursively destroy dependents. Ownership
parentage, dependency bindings, notification interests and cleanup prerequisites
are four separate relations. Children borrow ports; the creator closes.

## Options

Scores are design judgments out of 10; higher 🧠 is more complex. LOC is
incremental and roughly ×2 uncertain.

| Rank | Approach | 🎯 | 🛡️ | 🧠 | LOC (production / tests / docs) |
| --- | --- | ---: | ---: | ---: | --- |
| 1 (decided) | **Public GM package: keyed source + hub per event family + opaque data-only participants + escape hatch** | 8 | 8 | 5 | 500–650 / 700–1,000 / 150–250; GM integration (ADR, CMS, Foundation roots, packed root) +400–700; TEST adoption 200–350; per module 1–6 lines |
| 2 | Same mechanism inside one product Host, no package | 6 | 7 | 4 | ~500 / 400–600 / 100 |
| 3 | Module-owned subscriptions everywhere (no hub) | 5 | 7 | 4 | ~250 + 20–28 per module; settlement only self-reported |

Why the hub (**Measured/Inference**): only the owner of a derivation lane can
observe its settlement independently; the derived participant binding makes
opting in fail-closed; module authors write data, not lifecycle code; shutdown is
one place. Costs: one hub couples the subscriptions of one event family, and all
participants share one coalescing policy (by design).

## Minimal public API v0.1 (from sketch v4)

```ts
// @get-modular/observation 0.x. Zero runtime dependencies. ESM. Node >=24.18 <25 || >=26.10 <27.
export type Values = object;                                    // declare every key; T | undefined, not ?:
export type Snapshot<V, K> = Readonly<{ source: SourceId; keys: readonly [K, ...K[]]; revision: number; values: Readonly<Pick<V, K>> }>;
export type SnapshotRef = Readonly<{ source: SourceId; keys: readonly string[]; revision: number }>; // a Snapshot fits
export interface Reader<in out V> { read<const S extends Keys<V>>(keys: S): Snapshot<V, S[number]> }
export interface ObservationPort<in out V> {
  observe<const S extends Keys<V>>(keys: S, recordDesired: (next: Snapshot<V, S[number]>) => undefined,
    options: { reportError: (cause: unknown) => undefined; since?: SnapshotRef | undefined }): Observation<V, S[number]>;
}                                                               // Observation: { view: { initial, current(), admits(rev) }, unsubscribe, [Symbol.dispose] }
export function createKeyedSource<V extends Values>(initial: V): KeyedSource<V>;   // { reader, port, commit, seal }; Host keeps commit/seal
export function participantsFor<V extends Values>(): ParticipantFactory<V>;        // { sync({ initial, apply }), derived({ keys, derive, apply, fail }) }
export function startHub<V extends Values>(deps: { port; participants }, ctx: { resources: HubResources; participantIds; reportError }): Promise<Hub>;
export function createLatestDerivation<I, T>(spec): LatestDerivation<I>;            // escape-hatch kit: offer, close, busy, closeAndDrain(escalate?)
export class ObservationError extends Error { readonly code: ObservationErrorCode }  // "observation.<area>.<reason>"
```

Module usage:

```ts
// product, once:   export const settings = participantsFor<AppSettings>();
const initial = deps.settings.read(["locale", "greetingStyle"]);
const greeter = new Greeter({ locale: initial.values.locale, style: initial.values.greetingStyle });
return { instance: greeter, capabilities: {
  "greeting/greeter": { greet: (n: string) => greeter.greet(n) },
  "settings/participant": settings.sync({ initial,
    apply: ({ values }) => greeter.configure({ locale: values.locale, style: values.greetingStyle }) }),
} };
```

Host composition: `participantIds` = implementation IDs of declarations providing
`settings/participant`, bound to the hub's `many` slot; each module gets its
`resources` through the resources package's Assembly wrapper; shutdown =
`source.seal()`, then one owner-scope `close({ escalate, abandon })` with **ref'd**
timers (escalate at part of the budget, abandon at the end). The observation
package does not depend on the wrapper's form: its hub takes a structural
`HubResources`. (The sketches used the design's `scoped(parent, name, factory)`;
the resources implementation plan replaces it, see below.)

## Integration plan and conflict avoidance

Owner requirement: no conflicts between packages and between parallel agents.

- **Follow the resources implementation plan**
  (workspace `plans/module-resource-scopes-implementation-plan-2026-10-01.md`, owned by
  the resources stream): its PR-GM-1 turns `ownership-checkpoint` importers and
  `packageRoots` into a table of leaf packages, so "the next leaf package becomes
  one record"; observation should be exactly that next record, landing after the
  resources PRs (GM-1, GM-2 ADR/boundary, GM-3a Assembly owner, GM-3 package).
- **Sequential integration (topic C, Proven in the GM repo):** shared GM files are
  pinned by hashes and exact lists (CMS hash in
  `architecture/checks/sdk-growth.mjs:23` and `tests/ownership-checkpoint.test.mjs:131`;
  exact `packageRoots` in `ownership-checkpoint.test.mjs:148-151` and
  `source-dependencies.yaml:5-8`; fixed `PACKAGES`/`RELEASES` in
  `sdk-growth.mjs:42-60`). Two simultaneous package deliveries collide there.
  Order: `@get-modular/resources` first, then `@get-modular/observation`; one
  integrator owns those pinned files, or both packages land in one joint ADR/CMS
  change.
- **Decide once for both new packages** (with the resources owner, not inside this
  document): the error-code scheme `<pkg>.<area>.<reason>` (resources currently
  uses `scope-closed`, Assembly `assembly.bind.*`); a CMS **channel matrix**
  (`reportError` for runtime callback errors, `CloseReport` debts for teardown,
  `outcomes()` as readiness input); and the **four signals** (Assembly
  `ctx.signal`, `resources.signal`, cleanup escalate signal, `derive(…, signal)`;
  never pass `resources.signal` into `derive`).
- **No dependency between the packages:** `HubResources` is structural; a GM dev
  test asserts that `Resources` satisfies it.
- **This workspace:** this document and its evidence directory are owned by the
  hooks research; the resources documents are read-only here. No git branch or
  repository was changed by this research.

## One bounded TEST experiment

In the TEST consumer only (`modularity-host-test`), on Node 24.18+ and 26.10+.
Against the resources stand-in first; rerun against the real
`@get-modular/resources` as a separate step. 600 instances through Assembly from an
unchanged passive fixture with inert depth-64 ownership metadata: 1 source, 1 hub,
12 participants of key `K` (at least one sync and one derived), 1 broad participant
as a fan-out control, 1 escape-hatch module and 584 passive modules; one live and
one restart-required setting; a second record type declared as an `interface`.

**Tests (topic A, C):** built-in `node:test` `mock.timers`, advancing with
`tick(0)` (not `runAll()`, which throws `ERR_INVALID_ARG_VALUE` with a pending
`setImmediate` on Node 24.18 and 26.9); no injected scheduler; a seeded
model-based test over random `commit`/`observe`/`unsubscribe`/`seal`
sequences asserting quiescent invariants (last delivered snapshot equals
`read(keys)`; revisions strictly increase; deliveries ≤ commits touching the keys;
none after `seal`/`unsubscribe`; listener count returns to baseline) runs in the
package's own GM tests, where internal diagnostics are reachable; the TEST
consumer observes dispatch through a counting wrapper of the public port (the
package exposes no diagnostics or `/testing` subpath). Negative type fixtures on
TS 5.8.3 and 7.0.2; regressions for every v1–v4 defect.

**Fail if:** registration misses the latest committed view; any passive instance
changes, gains a registration or must be edited; dispatch for `K` reads the
topology or its visit count changes when 10,000 registrations are added on an
unrelated key; one commit delivers twice to one registration; an obsolete result
publishes (including A->B->A or after unsubscribe); computations overlap or pending
work exceeds one snapshot; a throwing callback or `apply` stops another participant;
a catch-up escapes isolation or arrives after seal; unknown keys, in-place
mutation, foreign `since`, duplicate or forged participants are accepted; a hung
factory leaves subscriptions behind; shutdown reports complete with unsettled work
or a debt path does not name the participant; escalation does not let LIFO
continue past a stuck drain; a live setting resets instance state, or a
restart-required one does not produce a new identity.

Any failure stops adoption and returns the design to review. Estimated 300–450 /
550–850 / 100–150 LOC. It demonstrates mechanics on a synthetic topology, not
production throughput.

## Corrections to revision 3

| ID | Revision 3 | Revision 4 | Source |
| --- | --- | --- | --- |
| R4-1 | Keys taken from `Object.keys(initial)`; shallow freeze | Declared key set, unknown keys throw, deep freeze, copied key arrays | Topics A, B, C (measured) |
| R4-2 | `since?: number` unchecked; `observe` after `seal` allowed | `since` is a `SnapshotRef` verified against source and range; `observe`/`commit` after `seal` throw | Topic A |
| R4-3 | Public visitor and spec types; `syncParticipant`/`derivedParticipant` | Opaque participants via `participantsFor<V>()`; plans package-private | Topic C, earlier N1 |
| R4-4 | `import type { Resources }` | Structural `HubResources`; zero package dependencies | Topic C |
| R4-5 | Plain `Error` strings, wrapped `scope-closed` | `ObservationError` codes; `ScopeClosedError` passes through | Topic C |
| R4-6 | Duplicate IDs overwrote drain cells (false `complete`) | Duplicates and forged participants rejected | Topic C (measured) |
| R4-7 | TS 7 variance hole | `in out V` + negative fixtures on both compilers | Topic C (measured) |
| R4-8 | Hung derive left earlier modules `not-run` | Escalated drain fails as a named debt; LIFO continues (Measured in v4) | Final review F-5, topic C |
| R4-9 | Reporter failure policy implicit; fail condition said "reporter crashes" | `reportError` is synchronous no-throw; a throwing reporter is surfaced as an uncaught error by design | Topics B, C |
| R4-10 | `setTimeout(0)` delivery | `setImmediate` in Node, else a 0 ms timer; contract unchanged ("later task") | Topic B |
| R4-11 | Private until a real consumer | Public 0.x from the first release (owner decision 5) | Owner |
| R4-12 | Source status open question | No source status or health contract in v1 | Topic A |
| R4-13 | (v4 draft) escalation raced idle drains; escape-hatch lanes still hung; async `apply` escaped isolation; non-plain values slipped through; `since` without keys; duplicates checked after subscribing; hostile `then` escaped | Fixed: lane `busy()`/`closeAndDrain(signal)`, drain records only for derived participants, isolated participant callbacks, `values.not-plain`, `SnapshotRef.keys`, validation before subscribing, guarded `then` | Final review G-1…G-8 |
| R4-14 | `isAttached`, drain records for sync participants, `in out` on `View`/`Observation` | Removed as overengineering (tautological after key copy; no work to drain; no effect) | Final review |

Earlier corrections (R3-x, H2-x, R2-x) remain recorded in the preserved revisions.

## Relation to the resources design

Checked against `module-resource-scopes-design-2026-10-01.md` (SHA-256 `0ce53086…`).
**No mechanism conflict; one deliberate deviation:** no real consumer in this
delivery (owner decision 3, versus its §1 and §14.7). The resources design excludes
lifecycle hooks from its package; this package uses `Resources` per its rules 4, 5,
9 and 10 through a structural port. Notes:

- **Package table (§14):** add a row for `@get-modular/observation` with **no**
  package dependencies (structural port); Core and Assembly import neither.
- **Assembly wrapper form changed in the resources implementation plan:** the
  design's `scoped(parent, name, factory)` captures the parent at bind time, so
  two `run()`s of one prepared assembly mix sessions; the plan selects
  `scoped(name, factory)` with the parent from `run({ owner })` (Assembly 0.3.0,
  pending owner confirmation, its question "Г"). The observation package is
  unaffected (structural `HubResources`); the TEST experiment uses whichever form
  the owner accepts.
- **Hung derivation:** with escalation, the hub's drain records a failed debt and
  LIFO continues (Measured in v4). Residual risk (Inference): a `derive` that ignores
  its abort signal may keep running after earlier modules, including its
  providers, have closed; participants must honour `AbortSignal`.
- **Host deadlines must use timers that keep the process alive** (Measured):
  with `AbortSignal.timeout()`, whose timer does not keep Node alive, the sketch
  exited before `abandon` fired.
- **Module-level state:** the participant registry is a module-level `WeakMap`;
  two package copies in one process would not recognize each other's
  participants. The ADR and CMS must require a single package copy.
- **Timers in the package:** the resources design keeps timers out of its package
  (invariant 14); this package schedules delivery in a later task by contract. The
  admitting ADR must state why (deferred, non-reentrant delivery) and that no
  deadlines or retries live in the package.

## Remaining limitations

- **No real consumer yet, public anyway (owner decision 5):** the first public 0.x
  API is shaped by TEST evidence; expect deliberate 0.x breaks once real consumers
  arrive. Keep v1 minimal (sync and derived only).
- **Stand-ins:** `@get-modular/resources` is not implemented; the sketches use a
  subset stand-in (escalate and abandon included; no `use()`, debt retry or
  dev-mode stacks).
- **Scale limits (Measured on v1):** TS2590 at about 1,156 declarations in one array
  literal; 1,024 providers per `many` row and 1,024 roots; one global capability
  schema invites merge conflicts; large composition roots need per-feature
  fragments. v4 was not re-measured at scale.
- **Escape hatch:** settlement of a module-owned derivation is self-reported.
- **Revisions are not value equality:** extra deliveries are possible by design;
  feeders should keep the identity of unchanged values or diff before `commit`.
- **Hosted research capability is missing** in the hosted runtime (`dd1f6f2b`);
  online sources were fetched by root's own subagents
  ([runtime check](raw/evidence/runtime-capability-check.md)).
- **Unverified items** remain as listed in the topic reports (for example NestJS
  PR #17966 unreleased; unversioned Flutter and Riverpod docs; .NET 11 Preview 7).
- **Governance:** a new accepted ADR admits the package before source and
  reconciles the system boundary (`system-boundary.md:15,67,69`: GM "does not …
  execute product lifecycle", no "second lifecycle authority"; GM `AGENTS.md:64-66`;
  CMS `common-assembly.md:73-75`: independently managed lifecycle needs "an explicit
  demonstrated need"); Foundation package roots, public-API baseline rule for new
  packages, packed-root test and CMS section land in the same delivery; consumer
  pins migrate in the same delivery (workspace rule). Scores and LOC are design judgments; TEST evidence
  does not qualify production.

## Provenance

- [Critique evidence](raw/evidence/README.md): four
  hosted `gpt-6.1-sol` xhigh/fast critiques of revision 1, root online sources, the
  review of revision 2, runtime capability check.
- [Code sketches and independent xhigh reports](raw/evidence/code-sketch/README.md):
  v1–v4 sources, critiques, re-review, final review of revision 3, AR scan.
- [Research round 4](raw/evidence/research-r4/):
  topics A, B, C.
- [Original five research reports](raw/original-reports/), byte-identical to their
  hashes in `raw/original-reports/research-document-hashes.json`.
