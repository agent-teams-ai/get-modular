Flutter provides useful distinctions for module lifetimes, but its frame-owned lifecycle does not establish safe asynchronous service ownership. Retain the proposed optional setup/cleanup contract and explicit dependency ports. Defer a shared lifecycle hooks runtime; the supplied evidence does not demonstrate a consumer need for one.

This is experimental research, not implementation or admission. I read `scope.md`, `plan.md`, `plan-improve.md`, the primary relay, relevant authority, and source files. All 38 retained inputs matched `input-hashes.json`. Flutter and Riverpod snapshots report retrieval on **2026-10-01 at approximately 13:28 UTC through the root source relay**. I performed no native browsing, file writes, Git actions, builds, tests, installs, or runtime experiments. The Flutter API snapshots identify no usable SDK commit, so the findings establish documented contracts, not a version-bound implementation audit.

Flutter’s documented lifecycle separates several responsibilities:

| Callback | Verified Flutter contract | Consequence for service modules |
| --- | --- | --- |
| [`initState`](https://api.flutter.dev/flutter/widgets/State/initState.html) | Runs exactly once per `State` object. Widget/context are available; inherited dependency lookup belongs elsewhere. | Initialize instance-owned state once. Async construction still needs an attempt owner, partial-failure handling, and a separate readiness decision. |
| [`didChangeDependencies`](https://api.flutter.dev/flutter/widgets/State/didChangeDependencies.html) | Runs immediately after initialization and again when registered inherited dependencies change. A build follows. | Dependency-sensitive initialization can repeat. Compare the relevant identity/value before repeating effects; this callback is not a universal dependency-health signal. |
| [`didUpdateWidget`](https://api.flutter.dev/flutter/widgets/State/didUpdateWidget.html) | Same-location configuration updates with matching runtime type/key preserve `State`. The new widget is installed before the callback receives the old widget. A build follows. | Configuration update can preserve module state. It does not imply recreation, resource replacement, or an actual semantic value change. |
| `deactivate` / `activate`, described in the [`State` lifecycle](https://api.flutter.dev/flutter/widgets/State-class.html) | Removal can be temporary. Reinsertion occurs before the current frame ends; activation reuses the existing state. Tree links can require repair while most resources remain retained. | A temporary attachment change needs explicit semantics. It must not accidentally become terminal resource cleanup or repeat one-time initialization. |
| [`dispose`](https://api.flutter.dev/flutter/widgets/State/dispose.html) | Permanent, terminal removal. The disposed state cannot remount; subsequent `setState` is erroneous. The callback returns `void`. Application termination need not invoke it. | Closing admission, waiting for work, and observing physical cleanup need separate asynchronous contracts. Callback invocation alone cannot prove release. |

The framework controls synchronous lifecycle entry points, tree updates, rebuilding, and frame finalization. That ownership makes “reinsert before this frame ends” meaningful. An async service can await indefinitely, encounter partial construction, retain idle subscriptions, or lose a dependency while work continues. It has no equivalent render-frame boundary.

Flutter’s guarantees also have limits within Flutter. A still-mounted state can receive an obsolete completion after configuration changes. `mounted` distinguishes terminal disposal; it does not identify the current request, subscription, or configuration revision. Neither Flutter lifecycle callbacks nor a service generation check undo already submitted external effects.

[`dependOnInheritedWidgetOfExactType`](https://api.flutter.dev/flutter/widgets/BuildContext/dependOnInheritedWidgetOfExactType.html) finds the nearest matching ancestor and registers a dependency. This is an explicit framework relationship, not observation of every injected object or mutable field. Its documented O(1) lookup does not establish O(1) notification cost. The page also advises saving an ancestor reference before disposal because ancestor lookup is unstable during disposal. For async services, saving a reference is insufficient: its required lifetime must also remain retained.

[`InheritedModel`](https://api.flutter.dev/flutter/widgets/InheritedModel-class.html) adds selective invalidation. `updateShouldNotify` first determines whether notification is warranted; `updateShouldNotifyDependent` then compares each dependent’s registered aspect set with model changes. An unspecified aspect receives broad notification. This offers a useful pattern—explicit selection with explicit comparison—but still entails dependent checks. Incorrect equality can suppress necessary updates; broad aspects can create excessive work. Arbitrary mutation without the corresponding notification contract is not automatically observed.

[`Riverpod automatic disposal`](https://riverpod.dev/docs/concepts2/auto_dispose) supplies a different ownership model based on provider listeners and recomputation:

- With automatic disposal enabled, losing the last listener triggers `onCancel`. The documentation describes a one-frame grace period, “cf. `await null`,” before destruction if unused.
- `onResume` reports renewed listening after cancellation. Cancellation is therefore distinct from terminal disposal.
- Recomputation destroys previous provider state regardless of whether automatic disposal is disabled.
- `keepAlive` controls disposal caused by disuse; it does not preserve previous state across recomputation.
- `invalidate` destroys current state and recreates it when listened to.
- Registering disposal once per owned resource helps expose missing cleanup. The warning concerns side effects such as modifying other providers during disposal; the documented controller-close example performs resource cleanup.

Riverpod’s listener accounting is conceptually transferable. Its documented grace period is a cache/liveness policy, not evidence that service calls have drained. The supplied page does not establish awaited asynchronous cleanup, borrowed-resource retention, or exclusive replacement. Likewise, the number of listeners need not include every outstanding service operation. Parameterized providers also demonstrate a scaling risk: retained instances can grow with parameter combinations, beyond the number of module definitions.

A service contract should preserve these distinctions:

| Event | Meaning and owner |
| --- | --- |
| Configuration update | A new configuration snapshot/revision for an existing instance. The module decides which operations change. |
| Dependency identity change | A different provider instance or generation. Rebinding is explicit; existing references and operations retain their original identity. |
| Dependency value change | New selected data from the same dependency. It can require recomputation without replacing subscriptions or resources. |
| Dependency health change | Availability/degradation of a dependency, potentially with unchanged identity. Product policy selects rejection, degradation, stopping, or explicit recovery. |
| Module-owned state change | Internal state evolves without necessarily changing configuration or dependencies. |
| Initialization/readiness | Initialization establishes local state; the Host separately decides when the instance may serve work. |
| Terminal cleanup | Owned obligations are released with observable evidence. Borrowing creates no authority to dispose the provider. |

The inspected `ordinary-runtime-assembly.ts::bindOrdinaryRuntime` passes selected capabilities into factories during construction. That seam contains no dependency watcher or automatic rebinding contract. This supports the narrower conclusion that its static composition is not automatically reactive. It does not establish repository-wide absence of lifecycle machinery.

Subscription replacement illustrates the difficult async boundary. Flutter explicitly recommends subscribing during initialization, replacing the subscription when configuration requires it, and unsubscribing during disposal. Transferring that pattern requires additional service rules:

1. **Invalidate old publication authority synchronously.** Record the new desired identity/revision before invoking fallible callbacks. Queued old-source notifications must fail the current-revision check.
2. **Retain the original action and handle.** Unsubscribe/cancel requests may remain pending. An observer deadline reports incomplete work while the owner retains its cleanup record and prerequisites.
3. **Establish custody before new setup.** Record the attempt before any callback, suspension, or possible allocation. Partial resources remain reachable if setup rejects.
4. **Choose replacement exclusivity explicitly.** An exclusive adapter permits new acquisition only after observed old release. An adapter permitting overlap needs separate owners and publication fencing.
5. **Handle late completion as an ownership result.** A superseded successful acquisition goes to cleanup custody. Discarding its returned handle would lose the resource. A failed candidate preserves the original cause and unresolved cleanup obligations.

Before publication and subsequent managed effects, continuations must recheck instance authority, dependency identity, selected revision, and health as appropriate. Cancellation is useful when the adapter supports it, but is not proof of completion. Raw escaped handles and already submitted IO remain outside a simple callback fence.

The workspace’s `runtime-access-lifecycle.ts::raceWithAbort` ends an observer’s wait while leaving the original Promise running. That behavior reinforces the need to distinguish observation from action settlement; it is not itself evidence of resource cancellation.

A child should receive a narrow borrowed use port and own its subscription or other locally acquired resource. It should receive no parent cleanup capability. Normal parent shutdown closes ordinary work and child setup, then waits for dependent work and required child cleanup before releasing prerequisites. Child cleanup may need a private shutdown path while ordinary admission is closed.

An ownership tree alone cannot describe a sibling, external borrower, or diamond dependency. Unsupported cleanup cycles should be rejected explicitly. Unexpected parent-resource loss is a health event; it does not justify automatic destruction of every descendant or silent replay against a replacement.

This agrees with the fresh relay of [Microsoft’s DI guidelines](https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/guidelines): receiving a disposable dependency does not require implementing disposal, and consumers should not dispose that dependency. The guidelines also state that scopes are not inherently hierarchical.

The inspected [OpenClaw source at `c3425e1d`](https://github.com/openclaw/openclaw/blob/c3425e1d7b9550c7ff36deda1c1b0fc0f97332a1/src/plugins/plugin-instance.ts) provides relevant counterevidence to simplistic timeout cleanup: it tracks timed-out calls and waits for their actual settlement in `finishDisposal` before final module cleanup. Those protections depend on explicit retained work and ownership records.

Flutter’s documented same-frame reinsertion preserves an existing `State`/context association. A GlobalKey-style move therefore must be distinguished from module generation replacement, which creates a new owner and invalidates old authority. Rebinding inherited dependencies after a move is also different from transferring outstanding async work. Dedicated GlobalKey mechanics were not supplied and remain a source gap.

Hundreds of modules strengthen the case for selective, optional behavior. Maintain subscriptions for actual declared interests; avoid broadcasting lifecycle events to every instance. Measure affected publications, selector checks, active subscriptions, retained attempts, and unfinished cleanup separately. Pure value snapshots may allow explicitly defined conflation. Health transitions and effect commands must retain their meaningful ordering.

Repeated callbacks can duplicate effects. Reentrancy can expose unrecorded attempts. Notification feedback cycles can prevent settlement. Callback exceptions must reach the existing owner while preserving cleanup custody. A bounded local protocol can refuse concurrent/reentrant updates with the current attempt identity. None of these concerns requires a universal scheduler, registration-order semantics, or dummy hooks on pure modules.

Three viable approaches follow. Scores are **design judgment out of 10**, not measured qualification; higher complexity means greater difficulty. LOC estimates are incremental for one future consumer slice atop the resource plan. Rows are alternatives.

| Option | Confidence | Reliability | Complexity | Approximate LOC: production / tests / docs |
| --- | ---: | ---: | ---: | --- |
| Explicit instance construction and typed update commands | 9 | 8 | 3 | 70–160 / 180–300 / 60–110 |
| Optional local subscription with selected-value invalidation | 8 | 8 | 5 | 220–420 / 400–650 / 100–180 |
| Explicit Host replacement of a statically selected instance | 7 | 8 | 7 | 450–850 / 650–1,100 / 150–240 |

**Option 1** keeps state initialization in the existing factory, resource obligations in the proposed paired helper, and updates in explicit consumer-owned operations. It suits static dependencies and infrequent configuration changes. The module decides whether a command changes values, replaces its subscription, or requires a fresh instance.

**Option 2** suits a demonstrated need for frequent selected-value updates. One feature privately consumes a typed subscription port, a pure selector, and an explicit comparator. Its existing owner retains revision, raw action, handle, and cleanup custody. Identity replacement and health use distinct paths. This adds no shared hook registry, ambient dependency tracking, or extra composition node.

**Option 3** suits resources that cannot safely rebind in place. The Host uses an already selected factory to construct a fresh instance, applies the explicit stop/readiness/publication protocol, and preserves old references as retired. It needs no dynamic discovery or loader. Availability during replacement and recovery from uncertain cleanup remain Host/product policy.

Recommend **Option 1 now**, preserving the resource proposal’s admission boundary. Consider Option 2 only after identifying a concrete consumer operation that requires selected invalidation. Keep Option 3 available for an independently scoped exclusive-replacement requirement. No shared hooks API or helper implementation follows from this report.

A later TEST experiment should use independent observations of the selected disposable adapter:

- Delay source A’s completion until after B becomes current. Fail on any obsolete publication/effect, lost late handle, or duplicate cleanup.
- Allocate a partial resource, then reject setup. Fail if the retained owner cannot recover it or the original failure disappears.
- Leave unsubscribe unresolved beyond an observer deadline. Fail if custody disappears or an exclusive replacement acquires early.
- Shut down a parent with two children and another borrower. Fail on premature parent release, borrower disposal of the parent, or loss of required cleanup access.
- Trigger reentrant update and callback failure. Fail on recursive duplicate setup, inaccessible obligations, or an unobserved failure.
- Construct 400 instances with 20 interested in one aspect. Fail if changing that aspect publishes to the other 380, or an unchanged selection repeats its effect.
- Lose dependency health during an await. Fail if a subsequent managed effect proceeds against the unavailable dependency.

These are future checks. The supplied TEST consumer exposes `pnpm typecheck`, `pnpm test`, and `pnpm evidence`; this task executed none. Repository changes would additionally require the owning documentation workflow and applicable changed, fast, and complete gates.

The supplied [Consumer Module Standard at `9c722cef`](https://github.com/agent-teams-ai/get-modular/blob/9c722ceff4ede307d06d7a4b63fdebe615f54c53/docs/architecture/common-assembly.md#consumer-module-standard) differs from the workspace’s retained `ac49bb33` pin by the ADR-0029 relationship and optional dynamic Host candidate guidance. That delta was inspected without migrating a pin. ADR-0028 excludes callback execution; ADR-0029 admits synchronous generation/lease bookkeeping. Shared callback execution requires a bounded successor admission decision. Core/Assembly remain pure, G1 remains `hold`, and K1 remains pending.

Missing primary sources/questions for the root relay are:

- https://api.flutter.dev/flutter/widgets/State/deactivate.html and https://api.flutter.dev/flutter/widgets/State/activate.html — direct callback constraints and implementation excerpts.
- https://api.flutter.dev/flutter/widgets/GlobalKey-class.html — exact same-frame reparenting requirements and dependency invalidation consequences.
- https://api.flutter.dev/flutter/widgets/InheritedWidget-class.html and https://api.flutter.dev/flutter/widgets/InheritedWidget/updateShouldNotify.html — direct base notification contract.
- https://github.com/flutter/flutter/blob/master/packages/flutter/lib/src/widgets/framework.dart — resolve an immutable commit matching the documentation; inspect lifecycle ordering, dirty-state coalescing, GlobalKey moves, and callback exception handling.
- https://pub.dev/documentation/riverpod/latest/riverpod/Ref/onDispose.html — identify the exact package version, callback signature, and whether asynchronous cleanup completion is awaited.
- https://riverpod.dev/docs/how_to/select — verify selection equality and mutation limitations before attributing further selective-invalidation guarantees to Riverpod.
