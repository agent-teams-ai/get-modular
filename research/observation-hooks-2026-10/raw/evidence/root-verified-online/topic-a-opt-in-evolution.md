# Topic A - Opt-in evolution and extension path for lifecycle hooks

Retrieval date for every source below: 2026-10-01. Pinned revisions are listed per item.
Quotes are copied from the source text (<=40 words each). Lines marked "Inference:" are my own reasoning, not findings from a source.

---

## 1. .NET (Options, change tokens, hosted lifecycle, DI disposal)

### 1.1 IOptions vs IOptionsSnapshot vs IOptionsMonitor
- Claim: IOptions is a singleton and does not see config changes. IOptionsSnapshot is scoped and recomputed per scope. IOptionsMonitor is a singleton and is the only one of the three with change notifications.
- Quotes:
  - IOptions: "Does ***not*** support: Reading of configuration data after the app has started." / "Is registered as a Singleton and can be injected into any service lifetime."
  - IOptionsSnapshot: "Is registered as Scoped and therefore can't be injected into a Singleton service."
  - IOptionsMonitor: "Supports: Change notifications, Named options, Reloadable configuration, Selective options invalidation"
- URL: https://learn.microsoft.com/en-us/dotnet/core/extensions/options (dotnet/docs git_commit_id 650a0d17b380b98646c90770fc14291ed6bdf39c)
- Inference: .NET added change notification as a separate opt-in *accessor type*. It did not add a method to every options class. Consumers that do not need reload keep using IOptions and never change.

### 1.2 OnChange returns IDisposable
- Quote (API reference, IOptionsMonitor<TOptions>.OnChange): `public IDisposable? OnChange(Action<out TOptions,string?> listener);` Returns: "An IDisposable that should be disposed to stop listening for changes."
- URL: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.options.ioptionsmonitor-1.onchange (dotnet-api-docs-temp 16cd75d9c914a6fe1d29f7ae891c6166f4b5fefe)
- Inference: you subscribe by registering a callback and get back a handle that undoes the registration. Unsubscribing is the subscriber's job.

### 1.3 Change tokens are one-shot, ChangeToken.OnChange re-registers, and callbacks can fire more than once
- Quotes:
  - "The producer is a `Func<IChangeToken?>`. After a change, it should return a new token for the next registration... Dispose the `IDisposable` returned by `OnChange` to unregister the consumer." (docs/core/extensions/primitives.md, dotnet/docs 1443883303ca8a9e515a13c1c39c7224bb2cfa33)
  - "A configuration file's `FileSystemWatcher` can trigger multiple token callbacks for a single configuration file change." The sample prevents duplicates with file hashes. (https://learn.microsoft.com/en-us/aspnet/core/fundamentals/change-tokens, AspNetCore.Docs 37e342529c9eea68ff39853155f59e25b197d589)
  - Maintainer comment in dotnet/aspnetcore#2542 ("ChangeToken.OnChange fires twice when listening for configuration changes", closed): "Yeah this is just how change tokens work" and "this is actually caused by the underlying file watcher triggering multiple times for the same change." https://github.com/dotnet/aspnetcore/issues/2542
  - Built-in mitigation in source, `FileConfigurationSource.ReloadDelay`: "The number of milliseconds that reload waits before calling Load. The default is 250." (dotnet/runtime tag v10.0.0, src/libraries/Microsoft.Extensions.Configuration.FileExtensions/src/FileConfigurationSource.cs)
- Inference: Get Modular should treat change notifications as "at least once, maybe coalesced". Handlers must be idempotent. They must not assume exactly one call per logical change.

### 1.4 .NET 11: adding async overloads to ChangeToken.OnChange changed behavior with no source edit
- Quotes (breaking-change doc, ms.date 08/03/2026, "Version introduced: .NET 11 Preview 7"):
  - "After you recompile against .NET 11, existing calls that pass an `async` lambda or a `Task`-returning callback can silently bind to a different overload and behave differently at runtime."
  - "If multiple changes occur while the callback task runs, `ChangeToken.OnChange` coalesces those changes into one later callback invocation."
  - "This overload rebinding is silent. The same source code still compiles, and the compiler reports no ambiguity."
- URL: https://github.com/dotnet/docs/blob/1443883303ca8a9e515a13c1c39c7224bb2cfa33/docs/core/compatibility/extensions/11/changetoken-onchange-async-overloads-rebind-callbacks.md
- Inference: this is a direct warning for TypeScript too. If an existing hook signature `(cb: () => void)` is later widened to `(cb: () => void | Promise<void>)` and the host starts awaiting, existing `async` callbacks silently change timing. The async contract (awaited or fire-and-forget) has to be fixed in v1.

### 1.5 IHostedLifecycleService (.NET 8): an opt-in sub-interface found by runtime type check
- Quotes:
  - API reference: `public interface IHostedLifecycleService : Microsoft.Extensions.Hosting.IHostedService`. The type is described as "Defines methods that are run before or after StartAsync(CancellationToken) and StopAsync(CancellationToken)." (https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.hosting.ihostedlifecycleservice)
  - What's new in .NET 8: "IHostedService provided StartAsync and StopAsync, and now IHostedLifecycleService provides these additional methods: StartingAsync... StartedAsync... StoppingAsync... StoppedAsync" and "These methods run before and after the existing points respectively." (https://learn.microsoft.com/en-us/dotnet/core/whats-new/dotnet-8/runtime)
  - API proposal dotnet/runtime#86511 (milestone 8.0.0, closed 2023-06-30): "It derives from IHostedService and is not injected separately from IHostedService." It also says: "The timeout is off by default, unlike ShutdownTimeout which is 30 seconds. This avoids a breaking change since existing implementations of IHostedService.StartAsync() are included in the timeout." https://github.com/dotnet/runtime/issues/86511
  - Source, Host.cs (dotnet/runtime tag v10.0.0, commit 60629d14374c56f1cb51819049ad1fa529307f8d): `if (hostedService is IHostedLifecycleService service)` inside `GetHostLifecycles`. On stop: `// Ensure hosted services are stopped in LIFO order` followed by `_hostedServices.Reverse()`.
  - HostOptions.cs v10.0.0: `public TimeSpan StartupTimeout { get; set; } = Timeout.InfiniteTimeSpan;`. `ServicesStartConcurrently` and `ServicesStopConcurrently` are documented with "The default is false".
- Verified answer: yes, it extends IHostedService. Existing IHostedService implementations keep working unchanged, because the host selects the extended hooks with an `is` check, and the related new timeout is off by default so existing start code is not newly bounded.
- Inference: this is the cleanest model for adding hooks without migration. The new hooks live in a separate optional capability, the host detects it per instance, and every new knob defaults to the old behavior.

### 1.6 DI disposal: who, which order, and what is excluded
- Quotes (https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/guidelines, dotnet/docs 156931bb4ec1e81b028c76ea983553f2e9778bdd):
  - "The container is responsible for cleanup of types it creates, and calls Dispose on IDisposable (or DisposeAsync on IAsyncDisposable) instances. Services resolved from the container should never be disposed by the developer."
  - "Services not created by the service container": for `AddSingleton(new ExampleService())`, "The framework does **not** dispose of the services automatically." and "The developer is responsible for disposing the services."
- Reverse order, from source (ServiceProviderEngineScope.cs, v10.0.0): `for (int i = toDispose.Count - 1; i >= 0; i--)`. Disposal runs in reverse order of capture.
- Hazard, from the same source: synchronous `Dispose()` throws `InvalidOperationException(SR.AsyncDisposableServiceDispose...)` when a captured service implements only IAsyncDisposable.
- Inference: ownership follows "who created it". Factory-created resources belong to the container; injected instances do not. If a module later becomes async-dispose-only, any synchronous dispose path breaks. Get Modular should be async-first for disposal from the start.

### 1.7 HostOptions.ShutdownTimeout: default value, and a timeout does not prove completion
- Default value: `TimeSpan.FromSeconds(5)` at tag v6.0.0 and `TimeSpan.FromSeconds(30)` at tag v7.0.0 (src/libraries/Microsoft.Extensions.Hosting/src/HostOptions.cs). PR dotnet/runtime#63712 "Increase default HostOptions.ShutdownTimeout value to 30 seconds" was merged 2022-02-07 (issue #63709, milestone 7.0.0). Note: a web search summary said ".NET 6". Source shows the change landed in .NET 7.
- API remark: "This timeout also encompasses all host services implementing StoppingAsync(CancellationToken) and StoppedAsync(CancellationToken)." (https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.hosting.hostoptions.shutdowntimeout)
- Timeout does not prove completion. Source (v10.0.0):
  - IHostedService.cs documents the stop token as: "Indicates that the shutdown process should no longer be graceful."
  - Host.cs only does `cts.CancelAfter(_options.ShutdownTimeout)` and passes the token on.
  - BackgroundService.StopAsync: `await _executeTask.WaitAsync(cancellationToken).ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing);`. It returns when the token fires even if ExecuteAsync is still running.
- Inference: "stop returned" is not the same as "resources released". Get Modular should report the outcome per module (completed, timed out, or failed) and not treat a timeout as success.

---

## 2. Angular

### 2.1 DestroyRef
- Version: Angular CHANGELOG `# 16.0.0 (2023-05-03)` lists "introduce concept of DestroyRef (#49158)", "allow removal of previously registered DestroyRef callbacks (#49493)" and "implement `takeUntilDestroyed` in rxjs-interop (#49154)". `# 19.0.0 (2024-11-19)` lists "Promote `takeUntilDestroyed` to stable". `# 20.1.0 (2025-07-09)` lists "Add `destroyed` property on `DestroyRef`". (angular/angular CHANGELOG.md @ 73858905a277fe2938efff030a686a61c3a38fab)
- Source JSDoc (packages/core/src/linker/destroy_ref.ts, same SHA):
  - "If `DestroyRef` is injected in a component or directive, the callbacks run when that component or directive is destroyed. Otherwise the callbacks run when a corresponding injector is destroyed."
  - "Registers a destroy callback in a given lifecycle scope. Returns a cleanup function that can be invoked to unregister the callback." Signature: `abstract onDestroy(callback: () => void): () => void;`
- takeUntilDestroyed JSDoc: "Operator which completes the Observable when the calling context (component, directive, service, etc) is destroyed." It is marked `@publicApi 19.0`.
- Inference: Angular grew a registration-based cleanup API next to the method-name hook `ngOnDestroy`. Existing components did not have to change. The same token works for components and for injector-scoped services.

### 2.2 Lifecycle interfaces are optional, and the runtime detects hooks by method presence on the prototype
- Guide (adev/src/content/guide/components/lifecycle.md @ 73858905): "Angular provides a TypeScript interface for each lifecycle method. You can optionally import and `implement` these interfaces to ensure that your implementation does not have any typos or misspellings."
- Source (packages/core/src/render3/hooks.ts @ 73858905): `const {ngOnChanges, ngOnInit, ngDoCheck} = directiveDef.type.prototype` then `if (ngOnInit) { (tView.preOrderHooks ??= []).push(...) }`. The doc comment says: "Must be run *only* on the first template pass."
- Inference: detection happens once per type, from the prototype. Modules without a hook pay nothing. The cost is that typos fail silently, so the interface is only a typing aid.

### 2.3 Inheritance of lifecycle methods (https://angular.dev/guide/components/inheritance)
- Source md @ 73858905:
  - A subclass "inherits some of the metadata defined in the base class's decorator and the base class's decorated members. This includes host bindings, inputs, outputs, lifecycle methods."
  - "If a base class defines a lifecycle method, such as `ngOnInit`, a child class that also implements `ngOnInit` _overrides_ the base class's implementation. If you want to preserve the base class's lifecycle method, explicitly call the method with `super`"
- Inference: method-name hooks combine badly. A subclass silently drops the parent's cleanup unless it calls super. Registration-style hooks (`onDestroy(cb)`) add up instead of overriding.

### 2.4 effect() onCleanup, afterRenderEffect, afterNextRender: opt-in functions
- effect guide (adev/.../signals/effect.md @ 73858905):
  - "your function can optionally accept an `onCleanup` function as its first parameter. This `onCleanup` function lets you register a callback that is invoked before the next run of the effect begins, or when the effect is destroyed."
  - "By default, you can only create an `effect()` within an injection context"
  - "A 'View effect' is destroyed when the component is destroyed. A 'Root effect' is destroyed when the application is destroyed."
- Render callbacks (lifecycle.md): "Rather than a class method, they are standalone functions that accept a callback." and "Render callbacks do not run during server-side rendering or during build-time pre-rendering."
- Version history (CHANGELOG): `16.2.0 (2023-08-09)` "add afterRender and afterNextRender (#50607)". `18.1.0 (2024-07-10)` "Redesign the `afterRender` & `afterNextRender` phases API" plus "Add a schematic to migrate afterRender phase flag". `19.0.0` "introduce `afterRenderEffect`". `20.0.0 (2025-05-28)` "rename afterRender to afterEveryRender and stabilize".
- Inference: new hooks were added as free functions that need an injection context, so no class had to change. Even so, an opt-in API went through a redesign (18.1, with a migration schematic) and a rename (20.0) before it was declared stable. A preview stage for new hooks is worth having.

---

## 3. React

### 3.1 Changing the scheduler made existing method-name lifecycles unsafe
- Source: legacy.reactjs.org content/blog/2018-03-27-update-on-async-rendering.md @ 075d4170f2af03115d16507f1a61e5d3a5d78702. Rendered at https://legacy.reactjs.org/blog/2018/03/27/update-on-async-rendering.html
  - "These lifecycle methods have often been misunderstood and subtly misused; furthermore, we anticipate that their potential misuse may be more problematic with async rendering."
  - "(Here, 'unsafe' refers not to security but instead conveys that code using these lifecycles will be more likely to have bugs in future versions of React...)"
  - "async rendering (where rendering might be interrupted before it completes, causing `componentWillUnmount` not to be called)."
  - "Only once `componentDidMount` has been called does React guarantee that `componentWillUnmount` will later be called for clean up."
  - "it is unsafe to use `componentWillUpdate` for this purpose in async mode, because the external callback might get called multiple times for a single update."
  - Plan: "16.3: Introduce aliases..." then "A future 16.x release: Enable deprecation warning" then "17.0: Remove `componentWillMount`, `componentWillReceiveProps`, and `componentWillUpdate`."
  - Cost: "We maintain over 50,000 React components at Facebook, and we don't plan to rewrite them all immediately." Mitigation: `npx react-codemod rename-unsafe-lifecycles`.
- What actually happened, from source (facebook/react tag v19.2.0, packages/react-reconciler/src/ReactFiberClassComponent.js):
  - `if (typeof instance.componentWillMount === 'function') { instance.componentWillMount(); }`. The unprefixed name is still called in 19.2, with a DEV warning "componentWillMount has been renamed, and is not recommended for use."
  - Comment: "Unsafe lifecycles should not be invoked for components using the new APIs." Legacy calls are skipped when `getDerivedStateFromProps` or `getSnapshotBeforeUpdate` is present.
- React 16.9 post: "The new names like `UNSAFE_componentWillMount` **will keep working in both React 16.9 and in React 17.x**."
- Inference: the hook *names* survived, but their *guarantees* (called once, paired with cleanup) did not survive the scheduler change. Two lessons for Get Modular:
  1. Define the guarantees now: how many times setup can run, whether cleanup is guaranteed only after a successful setup or commit, and whether setup can be interrupted.
  2. React's escape hatch was per-component opt-in: the presence of a new hook switches that component to the new semantics.

### 3.2 useSyncExternalStore contract
- Source: react.dev src/content/reference/react/useSyncExternalStore.md @ 75ef18a9172e4c100b5d5650ae14c395c5c8ef42
  - "The `subscribe` function should subscribe to the store and return a function that unsubscribes."
  - "While the store has not changed, repeated calls to `getSnapshot` must return the same value. If the store changes and the returned value is different (as compared by Object.is), React re-renders the component."
  - "The store snapshot returned by `getSnapshot` must be immutable. If the underlying store has mutable data, return a new immutable snapshot if the data has changed. Otherwise, return a cached last snapshot."
- Tearing (React 18 Working Group discussion #69, https://github.com/reactwg/react-18/discussions/69): "by 'tearing' we mean that a UI has shown multiple values for the same state." Also: "in React 18, concurrent rendering makes this issue possible because React yields during rendering."
- Inference: a change subscription should be a pair: `subscribe(cb) => unsubscribe` plus a stable, cached `getSnapshot`. Consumers then read a consistent snapshot and do not depend on payloads arriving in order.

### 3.3 useEffectEvent status
- React 19.2 blog (react.dev src/content/blog/2025/10/01/react-19-2.md @ 75ef18a9): front matter `date: 2025/10/01`, "React 19.2 adds new features like Activity, React Performance Tracks, useEffectEvent, and more." and "React 19.2 is now available on npm!" It is listed under "New React Features".
- Inference: the feature shipped in a stable minor release (19.2) as a separate opt-in hook. Nothing existing changed.

---

## 4. Vue

### 4.1 effectScope / onScopeDispose / getCurrentScope
- Version: vuejs/core changelogs/CHANGELOG-3.2.md, section `# [3.2.0] (2021-08-09)`: "new `effectScope` API (#2195)". The RFC is 0041.
- RFC (vuejs/rfcs active-rfcs/0041-reactivity-effect-scope.md @ 2c62d12d0b8dc53018ed6ab6fbc5aea336d8eea6):
  - "An `EffectScope` instance can automatically collect effects run within a synchronous function so that these effects can be disposed together at a later time."
  - "Nested scopes should also be collected by their parent scope."
  - "A detached scope will not be collected by its parent scope."
  - onScopeDispose "will be equivalent to `onUnmounted()` when there is no explicit effect scope created."
- API doc (vuejs/docs src/api/reactivity-advanced.md @ 40aa88af0094f7bab4aaf786e55c748a6a251d88):
  - effectScope "can capture the reactive effects (i.e. computed and watchers) created within it so that these effects can be disposed together."
  - onScopeDispose: "This method can be used as a non-component-coupled replacement of `onUnmounted` in reusable composition functions"
  - "In 3.5+, this warning can be suppressed by passing `true` as the second argument."
  - getCurrentScope: "Returns the current active effect scope if there is one."
- Inference: Vue added a scope primitive *below* the component. Existing components became implicit scopes with no change. This is a clean pattern to copy: a module's factory call runs inside a scope that collects any registrations.

### 4.2 Registration must be synchronous
- Lifecycle guide (src/guide/essentials/lifecycle.md @ 40aa88af): "This requires these hooks to be registered **synchronously** during component setup." and "`onMounted()` can be called in an external function as long as the call stack is synchronous and originates from within `setup()`."
- Watchers guide (src/guide/essentials/watchers.md):
  - "if the watcher is created in an async callback, it won't be bound to the owner component and must be stopped manually to avoid memory leaks."
  - "`onWatcherCleanup` is only supported in Vue 3.5+ and must be called during the synchronous execution of a `watchEffect` effect function or `watch` callback function: you cannot call it after an `await` statement".
  - "`onCleanup` passed via function argument is bound to the watcher instance so it is not subject to the synchronous constraint".
- Version: vuejs/core CHANGELOG at tag v3.5.0 lists "base `watch`, `getCurrentWatcher`, and `onWatcherCleanup` (#9927)".
- Inference: implicit "current scope" capture only works synchronously. A handle passed explicitly (`onCleanup` as an argument, or Angular's explicit `destroyRef`) survives `await`. For async factories, Get Modular should pass an explicit context object and not depend on ambient capture.

---

## 5. Android Jetpack Lifecycle

- DefaultLifecycleObserver (androidx/androidx @ d19971ef97bb5627abfc970fcae385c25b7a2a8d, lifecycle-common/.../DefaultLifecycleObserver.kt): `public interface DefaultLifecycleObserver : LifecycleObserver` with default no-op bodies such as `public fun onCreate(owner: LifecycleOwner) {}`. The KDoc says: "If a class implements this interface and also uses the deprecated `androidx.lifecycle.OnLifecycleEvent` annotations, those annotations are ignored."
- @OnLifecycleEvent deprecation reason (OnLifecycleEvent.java, same SHA): "This annotation required the usage of code generation or reflection, which should be avoided. Use DefaultLifecycleObserver or LifecycleEventObserver instead."
- Release notes (https://developer.android.com/jetpack/androidx/releases/lifecycle):
  - Version 2.4.0 (October 27, 2021): "@OnLifecycleEvent was deprecated. LifecycleEventObserver or DefaultLifecycleObserver should be used instead."
  - Also in 2.4.0: "Lifecycle.repeatOnLifecycle, API that executes a block of code in a coroutine when the Lifecycle is at least in a certain state."
  - Also in 2.4.0: "DefaultLifecycleObserver was moved from lifecycle.lifecycle-common-java8 to lifecycle.lifecycle-common."
  - Version 2.6.0 (March 8, 2023): "Lifecycle.launchWhenX methods and Lifecycle.whenX methods have been deprecated as the use of a pausing dispatcher can lead to wasted resources in some cases."
  - Version 2.12.0-alpha01 (August 12, 2026): "Deprecate lifecycle-compiler annotation processor artifact."
- addObserver KDoc (Lifecycle.kt): "Brings the given [observer] up to the current [State] of the [LifecycleOwner]. For example, if the [LifecycleOwner] is in [State.STARTED], the [observer] receives [Event.ON_CREATE] and [Event.ON_START]".
- repeatOnLifecycle KDoc: "The [block] will cancel and re-launch as the lifecycle moves in and out of the target state." and "Repeated invocations of `block` will run serially".
- Inference: a typed interface with no-op defaults let observers override only what they need, with no reflection. The reflection or annotation path took about 5 years to wind down (deprecated 2021, annotation processor deprecated 2026). A late subscriber is replayed up to the current state, which removes ordering races. TypeScript has no default interface methods. The equivalent is optional members on the module definition, which keeps the opt-in behavior.

---

## 6. NestJS

- Detection by method presence (packages/core/hooks/on-module-init.hook.ts, nestjs/nest v12.1.1 = 9feedffde8ef8c86f0cd521153740575dc579d88):
  - `function hasOnModuleInitHook(instance: unknown): instance is OnModuleInit { return isFunction((instance as OnModuleInit).onModuleInit); }`
- Concurrency inside one module (v12.1.1):
  - Instances are grouped by `hierarchyLevel` and the levels are sorted ascending: `for (const level of levels) { await Promise.all(callOperator(groupedInstances.get(level)!)); }`. Hooks on the same level run concurrently. Levels run one after another. The module class's own hook runs last.
  - The destroy hook sorts levels `'DESC'` and uses `Promise.allSettled`, so rejections are only logged with `Logger.error`. The init path uses `Promise.all`, so the first rejection propagates.
  - At v10.0.0 and v11.0.0 the init path was `await Promise.all(callOperator(nonTransientInstances));` followed by the same for transient instances. All non-transient providers of a module ran concurrently, with no hierarchy ordering.
  - Hierarchy ordering came from PR nestjs/nest#14900 "feat(core): call hooks by components hierarchy level (order)". It was merged 2026-02-16 into the `v12.0.0` base, and its checklist has "Does this PR introduce a breaking change? [x] Yes".
- Non-static providers excluded: `if (!wrapper.isDependencyTreeStatic()) { continue; }` (utils/get-instances-grouped-by-hierarchy-level.ts). Transient wrappers *are* included through `getStaticTransientInstances()`. So the statement "request/transient providers are excluded" is only half right: request-scoped (non-static) providers are excluded, while transient providers with a static tree are included.
- Docs (docs.nestjs.com content/fundamentals/lifecycle-events.md @ cc4542f80d03a9f78cb255a1c11812becb2a50f7):
  - "The lifecycle hooks listed above are not triggered for **request-scoped** classes."
  - "Interfaces are technically optional because they do not exist after TypeScript compilation."
  - "Nest calls `onModuleInit()` and `onApplicationBootstrap()` module by module, ordered by each module's distance from the root module... The shutdown hooks run in the reverse order."
- Inference: TypeScript duck-typing gives zero migration for modules without hooks. The main lesson is that changing the *ordering or concurrency* of existing hooks was itself a breaking change that waited for a major release. Get Modular should fix the ordering and concurrency semantics at v1 (dependency order, reverse order on teardown, error policy per phase) even if only a few modules use hooks at first.

---

## 7. Riverpod 3.0

- Release: packages/riverpod/CHANGELOG.md has `## 3.0.0 - 2025-09-10` (rrousselGit/riverpod @ 90c5a0bb144c3d782475c0d525cb2f6e45eef1c8).
- The "What's new" page (website/docs/whats_new.mdx, https://riverpod.dev/docs/whats_new) warns: "This version contains a few life-cycle changes. Those could break your app in subtle ways. Upgrade carefully."
- Automatic retry (new in 3.0, on by default):
  - "Starting 3.0, providers that fail during initialization will automatically retry."
  - "The default behavior retries any error, and starts with a 200ms delay that doubles after each retry up to 6.4 seconds."
  - To disable it (3.0_migration.mdx): "To disable automatic retry globally, you can do so on `ProviderContainer`/`ProviderScope`" with `retry: (retryCount, error) => null`. It can also be disabled per provider through the provider's `retry` parameter.
- Ref.mounted (new in 3.0): "The long-awaited `Ref.mounted` is finally here! It is similar to `BuildContext.mounted`, but for `Ref`." Also: "In 3.0, Riverpod will throw an error if you try to interact with a disposed Ref/Notifier."
- Pausing:
  - "In practice what this means is: Providers that are not used by the visible widget tree are paused."
  - "Riverpod relies on [TickerMode] to determine if a widget is visible or not."
  - "With 3.0, all `ref.listen` listeners can be manually paused/resumed on demand".
- onDispose and listen (website/docs/concepts2/refs.mdx):
  - "Life-cycles listeners are registered using an 'addListener' style API. Listeners are methods with a name that starts with `on`, such as [onDispose] or [onCancel]."
  - "You do not need to 'unregister' these listeners. Riverpod automatically cleans them up when the provider is reset."
  - Also: "All Ref listeners now return a way to remove the listener" (whats_new.mdx).
- Inference: Riverpod is the counterexample. Retry and pausing were turned on by default for *all* providers, which needed a migration page and an opt-out. The registration-style `ref.onX` hooks, on the other hand, were extended (they now return a remover) without breaking callers. New lifecycle behaviors that change semantics should be opt-in per module. New registration methods are cheap to add.

---

## Cross-cutting inference for Get Modular (my synthesis, not a source finding)

1. **Detection model.** Two patterns let mature frameworks add hooks without migration:
   - (a) Optional capability, detected per instance: .NET `is IHostedLifecycleService`, Nest `isFunction(x.onModuleInit)`, Angular reading hooks from the prototype, React `typeof instance.X === 'function'`.
   - (b) Registration on a context object passed in: Angular `DestroyRef.onDestroy`, Vue `onScopeDispose`, Riverpod `ref.onDispose`, Android `addObserver`, .NET `OnChange`.
   - Pattern (b) scales better. New `onX` methods can be added to the context later. They add up across inheritance or composition instead of overriding. They return an unregister handle. They work in factories, which have no class.
2. **What to lay down now** (low-cost seams):
   - A per-module lifecycle context (scope) that every factory receives, even if it starts with only `onDispose`. Its interface should be extensible in later minors.
   - Defined semantics: async-awaited or not, reverse-order teardown, per-phase error policy (fail-fast on init, collect-and-continue on dispose), and cleanup guaranteed only after setup succeeded.
   - Ownership: only what the container created is disposed.
   - Notifications are at-least-once and may be coalesced.
   - A timeout is reported as an outcome, never as completion.
3. **Failure modes to avoid**, from the evidence:
   - Changing the meaning of existing hook names: React UNSAFE_, 50k components, codemod.
   - Silent signature widening: .NET 11 OnChange rebinding.
   - Changing ordering or concurrency of existing hooks: Nest v12, marked breaking.
   - Default-on new behaviors: Riverpod retry and pause.
   - Reflection or annotation hooks that take years to retire: Android.
   - Implicit capture of the current scope across `await`: Vue, Angular injection context.

---

## Could NOT verify / caveats
- I found no dotnet/runtime issue specifically about `IOptionsMonitor.OnChange` firing twice. Evidence comes from the ASP.NET Core change-tokens doc, aspnetcore#2542 (about `ChangeToken.OnChange` and the config reload token), and the `ReloadDelay` source. I did not test whether IOptionsMonitor in .NET 10 still double-fires in practice.
- The classic developer.android.com page "Handling lifecycles with lifecycle-aware components" now redirects to or serves Compose-focused content. I could not get its older DefaultLifecycleObserver prose. I used the androidx source KDoc and the release notes instead.
- DestroyRef "introduced in v16" is based on the CHANGELOG `16.0.0` section. The angular.dev API page shows no "since" marker.
- React: I did not find an official post stating that the 17.0 removal plan was dropped. That the old names still work is verified only from v19.2.0 source plus the 16.9 post.
- The useEffectEvent reference page has no version marker. Its availability in 19.2 comes from the 19.2 release blog.
- The .NET 11 ChangeToken breaking change is documented for ".NET 11 Preview 7". I did not check it against a GA release.
- NestJS v12.1.1 was the latest release per `gh release view` on 2026-10-01. I did not check the published npm package contents.
- Riverpod `select` semantics beyond the docs snippet, and how pause interacts with `onDispose` timing, were not checked in source.
- Tearing is defined in the React 18 Working Group discussion. The react.dev reference page does not use the word.
