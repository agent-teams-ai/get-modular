# Reactive lifecycle research: React, Vue and Svelte

**Recommendation:** use optional, instance-owned setup/cleanup plus explicit subscriptions to narrow, typed sources. Keep registration lifetime separate from individual asynchronous updates. Hundreds of modules justify selective notification and clear ownership; module count alone does not justify a shared hooks engine.

This is experimental research and a bounded TEST proposal. It does not admit an API, qualify production adoption, or merge reactive lifecycle machinery into the resource implementation plan.

## Evidence and authority

I read `scope.md`, `input-hashes.json`, `plan-improve.md`, `plan.md`, all seven documents in `primary-reactive.json`, the retained Engineering Quality Standard, Consumer Module Standard, ADR-0028/0029, and relevant Host construction sources. All **38 retained files matched their manifest SHA-256 hashes**. Hash agreement establishes retained byte identity, not framework behavior or remote freshness.

Primary framework documentation arrived through the root’s source relay, with retrieval timestamps on **2026-10-01, 13:28:06–08 UTC**. This was indirect internet access; no worker-native browsing occurred. Source text was treated as evidence.

Requested execution profile: `gpt-6.1-sol`, `max`, `serviceTier: default`, fast disabled. Effective backend settings were not independently attested.

The supplied [Consumer Module Standard at `9c722cef`](https://github.com/agent-teams-ai/get-modular/blob/9c722ceff4ede307d06d7a4b63fdebe615f54c53/docs/architecture/common-assembly.md#consumer-module-standard) has complete-document SHA-256:

`33b41d5babf0a431c97e8e596a56e6ec1557ba1a0b26d39bf23e13d9a19e1fbd`

The active AR profile retains `ac49bb3374946330ec820591f8195a22d2c90900`, SHA-256:

`d5bb71e5a700014f9f0a09b17d1f33d24b30b66c49b273c9fb65584672c51e4f`

The inspected delta adds the ADR-0029 reference and dynamic Host lifecycle candidate guidance. No pin was migrated. Any later affected adoption must retain this comparison and update its guidance, profile and rejecting checks together.

[ADR-0028](https://github.com/agent-teams-ai/get-modular/blob/9c722ceff4ede307d06d7a4b63fdebe615f54c53/docs/decisions/0028-authorize-the-optional-ownership-contract-checkpoint.md) excludes callback execution from ownership bookkeeping. [ADR-0029](https://github.com/agent-teams-ai/get-modular/blob/9c722ceff4ede307d06d7a4b63fdebe615f54c53/docs/decisions/0029-admit-an-optional-lifecycle-kernel-candidate.md) admits a synchronous candidate kernel, without resource execution or disposal. Neither authorizes the proposed paired helper. **G1 remains hold; K1 remains pending.**

## Verified framework facts

### React: synchronization lifetime differs from component lifetime

[React’s lifecycle guide](https://react.dev/learn/lifecycle-of-reactive-effects) distinguishes component mount/update/unmount from an Effect’s repeated start/stop synchronization cycles. One component can remain mounted while an Effect disconnects an old subscription and establishes another.

[The `useEffect` reference](https://react.dev/reference/react/useEffect) specifies:

- Setup runs after a component commit. Changed dependencies cause old cleanup followed by new setup; removal causes final cleanup.
- Dependencies include reactive values used by setup. The list has constant length, and entries are compared with `Object.is`.
- Omitted dependencies cause execution after every commit. An empty list does not react to ordinary prop/state changes.
- Fresh object/function identities can cause unnecessary reconnection.
- Missing dependencies can retain obsolete captured values. Mutating an arbitrary external object does not itself schedule React synchronization.

React explicitly declares dependency values; `useEffect` does not discover subscriptions by tracking arbitrary reads. Its surrounding rendering system supplies the comparison opportunities.

Scheduling also belongs to that system. Ordinary non-interaction Effects generally follow paint; interaction-related timing has documented qualifications. Effects run on the client, not during server rendering. This is not a general-purpose module scheduling contract.

[StrictMode](https://react.dev/reference/react/StrictMode) adds a development setup → cleanup → setup check. Its current reference qualifies initial Effect repetition when StrictMode covers only a subtree rather than the application root. This check exposes missing cleanup; it does not establish safe replay of irreversible operations.

The fetching example suppresses obsolete responses with an `ignore` flag set during cleanup. **Inference:** preventing stale publication does not prove cancellation, external rollback, physical release, or retention of partially acquired resources.

### Vue: lifecycle hooks and watchers have different responsibilities

[Vue lifecycle hooks](https://vuejs.org/guide/essentials/lifecycle.html) attach callbacks to the current component instance. Composition hooks must register synchronously during setup, including through functions called synchronously from setup.

[Vue watchers](https://vuejs.org/guide/essentials/watchers.html) provide a separate change mechanism:

- `watch` tracks its declared source, including dependencies evaluated by a source getter. Reactive reads inside its callback do not become additional sources.
- `watchEffect` runs immediately and implicitly tracks synchronous reactive reads. Reads after the first `await` are outside that tracking interval.
- Directly watching a reactive object creates a deep watcher. Deep traversal can be expensive; nested mutation can leave old/new values referring to the same object.
- Default callbacks are batched, run after parent updates, and precede the owner’s DOM update. `flush: 'post'` follows that update. `flush: 'sync'` removes batching and can amplify mutation bursts.

Invalidation cleanup belongs to each watcher execution. Vue 3.5+ `onWatcherCleanup` must register synchronously before an `await`; the callback-provided `onCleanup` is bound to the watcher and lacks that synchronous restriction.

Synchronous setup-created watchers stop automatically with their component. Asynchronously created watchers require explicit stopping.

**Inference:** automatic ownership depends on registration context, not on code merely residing inside a module. An abort request during invalidation is not proof that all earlier effects ceased.

### Svelte 5: effects provide selective updates

[Svelte’s lifecycle documentation](https://svelte.dev/docs/svelte/lifecycle-hooks) describes component creation and destruction, with intervening changes handled by individual render effects. Legacy `beforeUpdate`/`afterUpdate` hooks are deprecated, shimmed for compatibility, and unavailable in runes components.

[`$effect`](https://svelte.dev/docs/svelte/$effect) tracks synchronous reads of reactive values, including reads through called functions. Its subscriptions reflect the last execution: conditional branches change which values are tracked. Asynchronous reads are excluded. Reading an object reference does not subscribe to every nested property.

Effects run after mounting and, on changes, in batched microtasks after DOM updates. `$effect.pre` runs before DOM updates scheduled after it; it is not a barrier before every DOM mutation.

Returned teardown runs before re-execution and when the effect is destroyed. Nested effects are destroyed with their parent or when that parent reruns. `$effect.root` offers manually controlled ownership and requires explicit destruction.

`onMount` accepts registration during initialization. Its returned cleanup works when the callback is synchronous; an async callback returns a Promise instead.

**Inference:** Svelte demonstrates useful fine-grained invalidation, but also introduces tracking contexts, dynamic subscription sets and scheduling. Copying its callback syntax would not reproduce those guarantees.

## Consequences for non-UI modules

A static capability graph does not become reactive because injected objects change internally. Registration, invalidation and cleanup need separate contracts.

| Concern | Required distinction |
| --- | --- |
| Dependency identity | An existing injected reference remains unchanged until an explicit replacement protocol establishes another identity. |
| Dependency health | Availability is an adapter observation; local policy decides degradation, cancellation or stopping. |
| Configuration/value change | A typed source publishes a committed snapshot or explicit command. |
| Module-owned state | The module owns mutation and pure derivation; neither requires a lifecycle callback. |
| Readiness | Construction success does not establish readiness or publication authority. |
| Resource cleanup | The acquisition owner retains obligations; borrowers receive use authority only. |

The inspected [setup Host](/srv/workers/jobs/agent-runtime/architecture-research-20260928/workspaces/ar-research-hooks-reactive-std-20261001-ro-u/packages/apps/embedded-runtime/src/composition/default-agent-runtime-host.ts:79) clears `ownedHost` before awaiting failure cleanup. The [ordinary Host](/srv/workers/jobs/agent-runtime/architecture-research-20260928/workspaces/ar-research-hooks-reactive-std-20261001-ro-u/packages/apps/embedded-runtime/src/features/ordinary-session-runtime/composition/ordinary-agent-runtime-host.ts:50) retains cleanup entries and removes successful entries, but its failed-construction path does not demonstrate a surviving recovery entrypoint. These are worktree observations, not runtime qualification. Reactive callbacks would not resolve those custody gaps.

**Design inference:** explicit subscriptions preserve selective invalidation without introducing hidden read tracking. Notification cost can follow actual subscribers to a source rather than every module in a hierarchy. Broadly shared sources can still produce broad fanout; this requires measurement.

## Three viable options

Scores are design judgments out of 10. Higher complexity means greater implementation and maintenance burden. LOC ranges are incremental to an admitted resource helper, exclude its underlying ledger/admission work, and are not additive across alternatives.

| Option | Confidence | Reliability | Complexity | Production LOC | Test LOC | Docs LOC |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A. Module-owned typed subscriptions | 9 | 8 | 3 | 120–240 | 240–420 | 80–140 |
| B. Selective explicit update commands | 8 | 8 | 4 | 180–320 | 280–480 | 100–180 |
| C. Adapter-local restart driver for one synchronization process | 6 | 7 | 7 | 320–550 | 500–900 | 140–240 |

**A — recommended.** Register an owned subscription once per interested instance using the proposed `module.resources.setup({ setup, cleanup })`. The source supplies explicit snapshots; the module handles updates through its existing narrow ports. Pure and borrow-only modules require no hook or dummy disposer. This offers the smallest useful seam and keeps behavior near its owner.

**B.** A product-owned adapter sends `applySettings(snapshot)` commands to explicitly selected capabilities. This fits applications where configuration application already has an acknowledged command protocol. It avoids implicit subscriptions but adds routing and update-result ownership. The composition root must remain thin rather than absorb application policy.

**C.** A concrete adapter serializes stop/start for one resource whose connection parameters genuinely change. It consumes explicit versioned snapshots, retains the original cleanup action, and starts a successor only after proven release where exclusivity is required. This fits actual reconnecting subscriptions. It introduces substantial asynchronous ordering obligations, so keep it local; repeated demand from materially different consumers would precede shared extraction.

None requires rendering, inferred dependencies, a global event bus, mandatory lifecycle methods, or a universal scheduler. The framework evidence does not demonstrate that these proposals outperform mature systems.

## Smallest bounded TEST specification

**Use case:** one TEST cache module follows one versioned settings source. Unrelated settings must not trigger refresh. A slow older refresh must not publish after a newer revision arrives.

**Ownership and surface.** The composition adapter supplies a concrete `SettingsSource` port with `subscribe(callback)` returning an owned subscription and initial immutable snapshot. Installation of the listener and capture of the initial snapshot must be atomic within the source’s execution agent. Revisions increase within that source instance.

The optional resource helper belongs to the existing resource proposal. This experiment adds no `module.hooks`, `onUpdate`, dependency-array API or shared reactive package.

**Registration lifetime.** Establish the strong attempt owner and pending obligation before invoking subscription setup. The source may notify synchronously during setup; that callback only records the latest desired snapshot. Start refresh work after successful registration. Setup failure preserves partial subscription custody through the selected adapter’s qualified recovery protocol.

**Scheduling.** Deliver explicit committed snapshots. One module-local asynchronous refresh runs at a time. A newer snapshot makes the running result stale and replaces one pending desired snapshot. Coalescing is permitted because this particular source represents current settings; lossless commands require another contract.

**Stale work.** Capture immutable input and revision at refresh start. After each await, check closing, relevant dependency availability and revision before another managed effect or publication. Keep the raw action reachable until settlement. Cancellation is an optional adapter capability; obsolete publication suppression is mandatory.

**Closing.** Close update admission before unsubscribing. Ignore callbacks already queued for the closed registration. Retain in-flight work, partial allocations and unresolved cleanup. Dependent child work and required child cleanup settle before parent resources are released. Private cleanup retains necessary dependency access.

Host phases are constructing, active, closing and closed; closing remains incomplete while debt exists. Revision fields describe configuration freshness, not a second resource ledger. Cleanup observers join one physical action; deadlines report incomplete observation.

**Failure policy.** Subscription/setup exceptions prevent readiness and preserve causes and custody. Refresh exceptions produce an explicit failed update observation without destroying unrelated capabilities. Dependency loss becomes a health observation; no automatic tree destruction or replay against replacements occurs. Feedback cycles are excluded from this slice, and updates must not synchronously republish into their own source.

An exclusive replacement stays blocked while prior release is unknown. Process termination ends these in-memory guarantees; durable recovery is outside scope.

## Future rejecting evidence and acceptance

These are proposed checks; none ran.

| Observable regression | Evidence that rejects it |
| --- | --- |
| Lost change during registration, or reentrant notification starts unowned work | A real in-process publisher changes during subscription installation; the module eventually applies the latest snapshot while every started action has custody. |
| Broad notification or repeated setup | Hundreds of lightweight instances use distinct sources; changing one source invokes only its subscribers and does not recreate their registrations. |
| Stale asynchronous publication | Controlled deferred refreshes settle out of order; only the current revision becomes visible. |
| Unbounded pending updates | A burst during one pending refresh retains at most one desired settings snapshot and eventually applies the latest revision. |
| Callback/setup failure loses partial resources | A TEST adapter allocates before throwing; its allocation remains reachable through recovery and is physically released once. |
| Parent shutdown races child cleanup | Two children need the parent during cleanup; parent release remains blocked through child failure and observer timeout. |
| Dependency loss permits another managed effect | Availability changes during an await; the subsequent effect is refused and prior submitted work remains observed. |
| Unknown release allows overlapping replacements | Physical-owner counters never exceed one; unknown cleanup prevents successor acquisition. |

Use independent observable publication, allocation and physical-owner traces. Avoid source-text assertions and expectations generated from implementation mappings.

The retained TEST consumer defines `pnpm typecheck`, `pnpm test` and `pnpm evidence`. Future implementation must map these scenarios into substantive checks before citing those commands as coverage. Changed shared behavior additionally requires Get Modular’s `pnpm check:changed`, `pnpm check:fast` and authoritative `pnpm check`, plus governed documentation checks. Existing green evidence cannot prove this proposed seam.

Acceptance requires the selective-update contract, stale-result rejection, reachable partial-failure custody and nested cleanup ordering. It excludes G1/K1 completion, production adoption, dynamic loading, durable recovery and general hook execution.

Rollback removes the bounded TEST subscription integration and returns to explicit fixed settings. Outstanding actions and cleanup obligations remain owned through settlement; rollback must not erase them or introduce a second cleanup ledger.

No repository/input/scratch writes, Git actions, builds, installs, tests, or agent/provider flows were performed.

## Missing primary sources and exact questions

The relayed guides do not establish awaitable physical cleanup, partial-construction recovery or exception ordering across every framework. These gaps do not prevent the explicit-port recommendation. Root should resolve the following URLs to exact commits and retain the returned bytes before making implementation-level framework claims:

- https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberCommitEffects.js — Does passive cleanup await returned Promises, and how do cleanup exceptions affect subsequent cleanup/setup execution?
- https://github.com/vuejs/core/blob/main/packages/reactivity/src/watch.ts — What happens when callback-provided `onCleanup` registers after invalidation or stopping? Are asynchronous cleanup results awaited, and how are errors propagated?
- https://github.com/sveltejs/svelte/blob/main/packages/svelte/src/internal/client/reactivity/effects.js — What ordering and failure handling apply to teardown, nested-effect destruction and `$effect.root`, particularly when cleanup returns a Promise?
