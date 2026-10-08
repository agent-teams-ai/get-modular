# Module lifecycle hooks: research and recommended design

Date: 2026-10-01. **Revision 3**: code-validated after owner decisions.
Earlier revisions are preserved byte for byte:
[revision 1](evidence/lifecycle-hooks-critique-20261001/research-revision-1.md)
(`3709c3a7…`) and [revision 2](evidence/lifecycle-hooks-critique-20261001/research-revision-2.md)
(`eee3f342…`). This is a design recommendation, **not an admitted package or an
implementation task**; implementation is a separate delivery.

Labels: **Proven** = primary source quoted in the linked evidence; **Measured** =
observed by running the code sketches; **Inference**; **Hypothesis**.

## Owner decisions (2026-10-01)

1. **Owner of the mechanism: a Get Modular package** (working name
   `@get-modular/observation`), designed library-first.
2. **Default: one hub per event family with data-only participants** (sync apply
   or async derive); a module-owned subscription stays as an escape hatch.
3. **First consumer: TEST first.** Agent Runtime was checked and has no fitting
   consumer today (below). This is an **explicit owner exception** to the written
   rules that require "at least one real consumer in the same delivery" and "a
   concrete need" (workspace `AGENTS.md:49,53`; resources design §1, §14.7); the
   owner considers that rule debatable for this case. The written rules are not
   amended by this document.
4. Resources follow the owner-accepted
   [`@get-modular/resources` scope design](module-resource-scopes-design-2026-10-01.md)
   (SHA-256 `0ce53086…`), which supersedes the earlier resource contract plan.
5. **Public from the first release** (owner decision, later on 2026-10-01): the
   package ships publicly as `0.x` in the normal GM release flow, like the
   resources package (its Q6). Consumers are expected; current non-use is not
   evidence of no need. Pre-1.0 breaks follow the 0.x minor + migration-guide rule.
6. **Before implementation, a deeper research round** on competitors' mistakes
   and the minimal powerful shape (no overengineering); results feed revision 4.

## Answer to the main question

What to lay down so that future hooks reach only the modules that need them,
without a mandatory migration of hundreds of others.

**One module standard for configuration** (to be written into the Consumer
Module Standard, so every module does it the same way). It covers modules that
consume an **in-process keyed source**; reading durable authority per operation
(as Agent Runtime does for provider access and egress policy) stays valid and is
not replaced by this standard:

1. **Get values:** at construction, `read(keys)` returns an immutable snapshot
   with a revision (the `IOptions<T>` shape). Modules that never need changes
   stop here and keep their construction values.
2. **Learn about changes:** opt in with **one `provides` entry** of a
   participant capability, built by `followSettings(initial, apply)` (sync) or
   `deriveFromSettings({ keys, derive, commit, fail })` (async). Nothing else.
3. **Non-participants:** keep construction values and instance state. A change
   that must reach them is a Host decision to reconstruct (new instance identity,
   no implicit state migration). *Proven precedents:* OSGi DS without `modified`
   deactivates and creates a new instance; .NET `IOptions<T>` never sees reloads;
   Spring Cloud refresh reaches only refresh-scoped or rebound beans.

**Mechanism rules (the package):**

4. **Participants are data, the hub subscribes.** A participant hands over a
   snapshot or keys plus callbacks; the hub's visitor returns effect-free plans
   and the hub subscribes exactly once per participant. **The Host** derives the
   hub's participant binding from the declarations that provide the capability
   (or keeps it explicit with a rejecting completeness check), so a participant
   cannot be forgotten; the package itself only checks that IDs and participants
   match in count.
5. **Callback contract fixed per contract version:** callbacks are synchronous
   and typed `=> undefined` (root-verified: TS 5.8.3 and 7.0.2 reject an async
   callback for `=> undefined`, accept it silently for `=> void`), only record
   desired input, are never awaited, and are isolated (throws, illegal returns
   and Promises smuggled through casts are reported, never crash the loop).
6. **Delivery:** a registration and its snapshot are atomic. A sync
   participant's construction snapshot may be older than its registration, so
   the source schedules one catch-up delivery (`since`) through the same
   isolated, seal-aware path. Delivery runs in a later task (not a microtask), at
   most once per commit per registration, may coalesce revisions; a revision that
   is not newer is a no-op; nothing is delivered after the Host seals the source.
   Order between registrations is deterministic but not contractual.
7. **Async derivation:** one active run and one latest pending input per
   participant; the package publishes only if the registration is attached and
   the revision is current, calls `fail` instead of `commit` on failure, and
   aborts cooperatively on close or supersession. Keeping the previous value and
   clearing an older failure on a newer success are the participant's duties.
8. **Ownership through resource scopes:** the hub registers its drain records
   first and its subscriptions second, so LIFO unsubscribes every participant
   before draining (the resources design's rule 5); debts carry participant
   paths (`attempt/settings/hub/drain:feature/tax-table`). Deadlines,
   escalation, `abandon`, sealing and readiness decisions stay Host policy.
9. **Evolution:** pre-1.0, change the contract deliberately (minor release,
   changelog, migration note, migrate own consumers) instead of keeping parallel
   V1/V2 variants. Exact compatibility tokens identify which contract a
   capability implements. *Proven counterexamples* of silent semantic change:
   React kept `componentWillMount` names while their guarantees changed; NestJS
   marked a hook-ordering change breaking in v12; Riverpod 3 enabled retry and
   pausing by default and needed a migration guide; .NET 11 async
   `ChangeToken.OnChange` overloads silently rebind existing async lambdas
   (documented for .NET 11 Preview 7, not checked against GA).

**Do not lay down now:** lifecycle methods or a base interface on module types;
a hook or notification context in every factory (factories get only the
resources design's `resources` and the Host's attributed `reportError`); generic `didChangeDependencies`; reflective
hook discovery; a dependency-health contract (deferred, like the resources
design's Q9); a readiness protocol beyond per-participant outcomes; in-place
dependency replacement; cross-source transactions; concurrency limits; a global
scheduler, service bag or reactive engine.

## Evidence from executable sketches

Three TEST-only sketches were built against the real `@get-modular/core` and
`@get-modular/assembly` (get-modular `9c722ce`), each typechecked on TypeScript
5.8.3 and 7.0.2 and run on Node 26.9
([sketches and reports](evidence/lifecycle-hooks-critique-20261001/code-sketch/README.md)):

| Sketch | What it is | Result |
| --- | --- | --- |
| v1 | Three options side by side | 17/17 own checks passed, but three independent xhigh critics found **10 P1 defects** (some overlapping) |
| v2 | Fixes; split contract; hub for sync and derived participants | 30/30 checks; an independent re-review found 1 new P1 (visitor as hidden subscribe authority) and 4 P2, fixed and regression-checked |
| v3 | Generic library over the record type + resources-design scopes (stand-in) | 25/25 checks on Node 24.18.0 and 26.9, including a second record type, an `interface` record and the catch-up fix from the final review (its sync catch-up had bypassed isolation and sealing) |

**Defects the critics found in v1 (Measured, each reproduced):** `released`
reported while a listener stayed attached; a throwing `commit` was misreported
as a derivation failure and a throwing `fail` crashed Node via an unhandled
rejection; a participant silently dropped out of a hub when a
central binding list was not edited; participants received the full port
(authority inversion); subscriptions orphaned when construction failed; one hung
cleanup serialized and stalled shutdown; capabilities exposed the whole source
including `commit`. The lesson (**Inference**): the difficulty of hooks is in the
async mechanics, which belong in one tested library, not in hundreds of modules.

**Scale (Measured on v1 variants by the scale critic; v3 not re-measured):** registration visits
per commit equal the subscribers of the changed key (12 at 96 and at 576
modules, and after adding 10,000 unrelated registrations); compile + prepare are
linear (576 modules: 62 + 72 ms; 2,304: 218 + 241 ms); TypeScript 5.8.3 checks
576 modules in 2.7 s and 2,304 in 30.5 s (tsc7: 0.8–1.1 s and 3.8 s). Shutdown
while commits continue took 2.4–6.4 s for 576 modules; a two-phase driver
(option-3 participants only) and a run without commits each took 11 ms, which
is why v2/v3 seal the source and clean up in two phases.

**Code cost per module (Measured in v3):** passive 0 lines; sync participant one
call in the factory plus one `provides` entry; async participant about six lines
plus one `provides` entry; escape hatch about 20 lines. The library core is about
400 lines without comments; the stand-in resources scope about 115.

## Agent Runtime as a consumer

[Scan of agent-runtime `origin/main` `b0bcb265`](evidence/lifecycle-hooks-critique-20261001/code-sketch/critic-reports/agent-runtime-consumer-scan.md):
no long-lived module needs a pushed value today. Its changing values (Provider
Access binding revisions, route endorsement, egress policy) are durable CAS
heads checked fail-closed per operation; launch configuration is immutable by
ADR-0090; ADR-0015 admits no new lifecycle abstraction ("L2-L5 remain no-go").
An in-memory hub revision over those would duplicate durable authority. Adoption
in AR would need a new product decision admitting a runtime-dynamic scope.

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
| Dependency unavailability | Signalled loss fences mediated effects; product policy decides. | Adapter and product Host. | Managed port refuses use; no notification. | Separate lossless health contract with epochs, deferred. |
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
| 1 (decided) | **GM package: keyed source + hub per event family + data-only participants + escape hatch** | 7 | 8 | 5 | 400–550 / 600–900 / 150–250; GM integration (ADR, CMS, Foundation roots, packed root) +400–700; TEST adoption 200–350; per module 1–6 lines |
| 2 | Same mechanism inside one product Host, no package | 6 | 7 | 4 | ~450 / 400–600 / 100 |
| 3 | Module-owned subscriptions everywhere (no hub) | 5 | 7 | 4 | ~250 + 20–28 per module; settlement only self-reported; shutdown grows with module count |

Why the hub won (**Measured/Inference**): only the owner of a derivation lane can
observe its settlement independently (in option 3 the owner sees the module's
self-report only); the derived participant list makes opting in fail-closed;
module authors write data, not lifecycle code; shutdown is one place, not N.
Its costs: one hub module couples the subscriptions of all participants of one
event family, and every participant shares one coalescing policy (by design).

## Minimal API (package candidate, from sketch v3)

```ts
// @get-modular/observation (candidate). Zero runtime deps; `Resources` type from @get-modular/resources.
// V is any object record (`type` or `interface`); Keys<V> is a non-empty key tuple.
export type Snapshot<V, K extends keyof V> = Readonly<{
  source: SourceId; keys: readonly [K, ...K[]]; revision: number; values: Readonly<Pick<V, K>>;
}>;
export interface Reader<V> { read<const S extends Keys<V>>(keys: S): Snapshot<V, S[number]> }
export interface ObservationPort<V> {
  observe<const S extends Keys<V>>(keys: S, recordDesired: (next: Snapshot<V, S[number]>) => undefined,
    options: { reportError: (cause: unknown) => undefined; since?: number }): Observation<V, S[number]>; // { view, unsubscribe, isAttached }
}
export function syncParticipant<V, K extends keyof V>(initial: Snapshot<V, K>,
  apply: (next: Snapshot<V, K>) => undefined): Participant<V>;
export function derivedParticipant<V, const S extends Keys<V>, T>(spec: {
  keys: S; derive: (values: Readonly<Pick<V, S[number]>>, signal: AbortSignal) => Promise<T>;
  commit: (result: T, snapshot: Snapshot<V, S[number]>) => undefined;
  fail: (cause: unknown, snapshot: Snapshot<V, S[number]>) => undefined }): Participant<V>;
export function createKeyedSource<V>(initial: V): { reader; port; commit; seal };   // Host keeps commit/seal (TEST probes are not API)
export function startHub<V>(deps: { port; participants }, ctx: { resources; participantIds; reportError }): Promise<{ outcomes() }>;
export function latestDerivation<I, T>(spec): { offer; close; drain };              // escape-hatch kit
```

Module usage (product typed helpers over the generic package):

```ts
const initial = deps.settings.read(["locale", "greetingStyle"]);
const greeter = new Greeter({ locale: initial.values.locale, style: initial.values.greetingStyle });
return { instance: greeter, capabilities: {
  "greeting/greeter": { greet: (n: string) => greeter.greet(n) },
  "settings/participant": followSettings(initial, ({ values }) =>
    greeter.configure({ locale: values.locale, style: values.greetingStyle })),
} };
```

Host composition: `participantIds` = implementation IDs of declarations that
provide `settings/participant`, bound to the hub's `many` slot; each module gets
`scoped(attempt.resources, id, factory)`; shutdown = `source.seal()` then one
`attempt.control.close({ abandon })` with a **ref'd** Host timer.

## One bounded TEST experiment

In the TEST consumer only (`modularity-host-test`), on Node 24.18+ and 26.10+
(the GM supported range). Run against the resources stand-in first; rerun
against the real `@get-modular/resources` package as a separate step (the
stand-in has no `escalate`, so that path cannot fail before the rerun). 600
instances through Assembly from an unchanged passive fixture with inert depth-64
ownership metadata: 1 source, 1 hub, 12 participants of key `K` (at least one
sync and one derived), 1 broad participant as a fanout control, 1 escape-hatch
module and 584 passive modules; one live and one restart-required setting; a
second record type to prove genericity.

**Fail if:** registration misses the latest committed view; any passive instance
changes, gains a registration or must be edited; dispatch for `K` reads the
topology or its registration-visit count changes when 10,000 registrations are
added on an unrelated key; one commit delivers twice to one registration; an
obsolete result publishes (including A→B→A or after unsubscribe); computations
overlap or pending work exceeds one snapshot; a throwing callback, commit or
reporter crashes the process or stops another participant; a forgotten
participant goes unnoticed; a catch-up delivery escapes isolation or arrives
after seal; a hung factory leaves subscriptions behind; shutdown
reports complete with unsettled work or a debt path does not name the
participant; a live setting resets instance state, or a restart-required one
does not produce a new identity.

Any failure stops adoption and returns the design to review. Estimated
250–400 / 450–700 / 100–150 LOC. It demonstrates mechanics on a synthetic
topology, not production throughput.

## Corrections to revision 2

| ID | Revision 2 said | Revision 3 | Source |
| --- | --- | --- | --- |
| R3-1 | Rank 1 explicit methods; a hub/driver last, only after an extraction trigger | The hub with data-only participants is the default | Sketches, critics, C3 argument, owner decision |
| R3-2 | Extract a shared driver after two independent consumers | Library-first: design the package now; prove it on TEST; real consumer when one exists | Library-first rule (`AGENTS.md`, PR agent-teams-ai/.github#328 open) plus owner decision 3, an explicit exception to its "real consumer in the same delivery" clause |
| R3-3 | Freeze V1; an incompatible change gets a new token and the old stays | Deliberate pre-1.0 breaking change with migration; no parallel variants without owner and removal | Same rule |
| R3-4 | Integration with the superseded resource plan (`CleanupResult`, cells, budgets) | `@get-modular/resources` scopes: atomic setup, `void`/throw cleanup, drain-then-subscribe LIFO, Host `abandon` | Accepted resources design |
| R3-5 | Option-2 helper and participant shapes from the first sketch | Participants never receive the port; visitor plans are effect-free; escape hatch uses `resources.setup` directly | Critics A2/N1, v3 |
| R3-6 | "Readiness protocol: do not lay now" | Still true; the hub only reports per-participant first outcomes, the Host decides | Re-review N3/N4/N6 |
| R3-7 | Real consumer unspecified | Agent Runtime has none today; TEST first | AR scan |

Revision 2's corrections H2-1…H2-12 and the R2-1…R2-12 review remain recorded in
[revision 2](evidence/lifecycle-hooks-critique-20261001/research-revision-2.md).

## Relation to the resources design

Checked against `module-resource-scopes-design-2026-10-01.md` (SHA-256 `0ce53086…`).
**No mechanism conflict; one deliberate deviation:** no real consumer in this
delivery (owner decision 3, versus its §1 and §14.7). The resources design excludes lifecycle hooks from its package
("отдельное исследование, сюда не смешивается"); this design is a separate
package that uses `Resources` exactly per its rules 4, 5, 9 and 10. Notes:

- **Package table:** the design says GM packages import nothing beyond its
  table. The observation package needs a new row
  (`@get-modular/observation` → `@get-modular/resources`, types only) in its own
  ADR; Core and Assembly import neither.
- **Hung derivation (Measured in v3):** with strictly sequential LIFO and owner
  decision Q3 (nothing starts out of order after `abandon`), a derivation that
  ignores its abort signal leaves every module constructed before the hub
  `not-run` after the Host deadline; their own subscriptions stay attached until
  a later `close()`. Rule for participants: `derive` must honour its
  `AbortSignal`. Escalating before abandon only helps if the hub's drain
  cleanup honours the cleanup signal and throws "still running" (a failed debt
  naming the participant, resources invariant 7/Q1) so LIFO continues; the
  trade-off is that providers may then close under a still-running derive. Not
  implemented or measured in v3.
- **Host deadlines must use a ref'd timer (Measured):** with `AbortSignal.timeout()`
  (unref'd in Node) the sketch exited before `abandon` fired (with top-level
  await: exit code 13 and "unsettled top-level await"; without it a process can
  exit with code 0), as the resources design warns.

## Remaining limitations

- **No real consumer yet, public anyway (owner decision 5).** The first public
  `0.x` API is shaped by TEST evidence, not by a production consumer; expect
  deliberate 0.x breaks once real consumers arrive. Keep v1 minimal (sync and
  derived only).
- **Stand-ins.** `@get-modular/resources` is not implemented; the sketches use a
  subset stand-in (no `escalate`, `use()`, debt retry or dev-mode stacks).
- **Scale limits (Measured):** TypeScript TS2590 at about 1,156 declarations in one
  array literal (build in chunks); 1,024 providers per `many` row and 1,024 roots;
  a single global capability schema invites merge conflicts; the composition
  root grows to thousands of lines at hundreds of modules and needs per-feature
  fragments. v3 itself was not re-measured at 576 modules.
- **Escape hatch:** settlement of a module-owned derivation is self-reported.
- **Hosted research capability is missing:** the hosted runtime (`dd1f6f2b`) has
  web search disabled and no admitted research network profile
  ([runtime check](evidence/lifecycle-hooks-critique-20261001/runtime-capability-check.md));
  online sources were fetched by root's own subagents and relayed.
- **Unverified items** from the source packets remain as listed in revision 2
  (for example `IOptionsMonitor.OnChange` double firing, unreleased NestJS PR
  #17966, unversioned Flutter and Riverpod docs).
- **Governance:** a new accepted ADR must admit the package before source and
  reconcile the system boundary (`system-boundary.md:15,69`: GM "does not …
  execute product lifecycle", no "second lifecycle authority"; CMS
  `common-assembly.md:73-75`: independently managed lifecycle needs "an explicit
  demonstrated need"), as the resources ADR does for its package; the Consumer
  Module Standard gets the configuration rule and examples in the same delivery; consumer pins and profiles migrate per AGENTS.md. Scores and LOC are
  design judgments; TEST evidence does not qualify production.

## Provenance

- [Critique evidence](evidence/lifecycle-hooks-critique-20261001/README.md): four
  hosted `gpt-6.1-sol` xhigh/fast critiques of revision 1, root online sources,
  the review of revision 2, runtime capability check.
- [Code sketches and independent xhigh reports](evidence/lifecycle-hooks-critique-20261001/code-sketch/README.md):
  v1–v3 sources, async/architecture/scale critiques, re-review, AR scan.
- [Original five research reports](evidence/module-resource-planning-20261001/README.md),
  preserved unchanged.
