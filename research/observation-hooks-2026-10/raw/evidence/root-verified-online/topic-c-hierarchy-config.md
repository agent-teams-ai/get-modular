# Topic C - Hierarchy, scale, config-change semantics (primary-source verification)

Retrieved 2026-10-01. Raw downloads and pinned sources are in `../raw/`. HTML was fetched with curl and grepped; GitHub files were read with `gh api` at the listed SHAs. Quotes are verbatim; "..." marks an elision.
**V** = verified quote. **Inf** = my inference.

---

## 1. OSGi Declarative Services 1.5 (Compendium R8.1, ch. 112)
URL: https://docs.osgi.org/specification/osgi.cmpn/8.1.0/service.component.html (page title "...OSGi Compendium 8", chapter "Version 1.5").

**(a) Config change, with and without `modified`**
- V 112.5.14: "If the modified attribute is not specified, then the component configuration will become unsatisfied if its component properties use a Configuration object and that Configuration object is modified in any way."
- V 112.7.1.4: "If a component configuration becomes unsatisfied: SCR must deactivate the component configuration. If the component configuration was not created from a factory component, SCR must attempt to satisfy the component configuration with the current configuration state."
- V 112.7.1.4: "If a component configuration remains satisfied: If the component configuration has been activated, the modified method is called to provide the updated component properties."
- V 112.5.6: "Component instances must never be reused. Each time a component configuration is activated, SCR must create a new component instance".
- V 112.5.14 steps: "Update the component context ... Call the modified method ... Modify the bound services for the dynamic references if the set of target services changed due to changes in the target properties ... modify the service properties." Also: "A component instance must complete activation, or a previous modification, before it can be modified."
- V 112.7.1.2/.3 (still unsatisfied even with `modified`): "A target property change results in a bound service of a static reference ceasing to be a target service." / "...minimum cardinality property change results in a reference falling below the minimum cardinality."
- V 112.12.3.8: `DEACTIVATION_REASON_CONFIGURATION_MODIFIED = 3` - "A configuration was changed."
- V 112.7.1.5: "SCR must delay taking action on the configuration changes until the coordination terminates".
- Inf: without `modified`, a config change means deactivate plus a new instance. With `modified` it's an in-place update, unless the change alters dependency selection, in which case it becomes a replacement or deactivation. The two event kinds overlap.

**(b) Static vs dynamic, reluctant vs greedy**
- V 112.3.7.1: "A component instance never sees any of the dynamics of the static reference." / "Component configurations are deactivated before any bound service for the static reference becomes unavailable." / "The static policy can be very expensive if it depends on services that frequently unregister and re-register or if the cost of activating and deactivating a component configuration is high."
- V 112.3.7.2: "With a dynamic reference, SCR can change the set of bound services without deactivating a component configuration." The component "must properly handle changes in the set of bound services that can occur on any thread at any time".
- V 112.3.8: "reluctant - Minimize rebinding and reactivating. This is the default reference policy option." / "greedy - Maximize the use of the best service by deactivating static references or rebinding dynamic references." (Table 112.1: 1..1 static greedy = "Reactivate to bind the better target service."; 1..1 dynamic reluctant = "Ignore".)

**(c) Reference `updated`**
- V 112.3.2: "The updated method, if specified, is called when the service properties of a bound services are modified and the resulting properties do not cause the service to become unbound because it is no longer selected by the target property."
- V 112.3.7.1: "If a static reference specifies an updated method and the bound service's properties change, SCR must call the updated method."

**(d) Make-before-break**
- V 112.5.12: "SCR must first bind the new bound service and then unbind the outgoing service. This reversed order allows the component to not have to handle the inevitable gap between the unbind and bind methods." Also: "in the unbind method care must be taken to not overwrite the newly bound service" (the sample uses `compareAndSet(log, null)`).

**(e) Mandatory reference lost**
- V 112.3/112.5.2: "An activated component configuration that becomes unsatisfied must be deactivated."
- V 112.5.12: dynamic below minimum cardinality "must be deactivated". For static: "SCR must deactivate the component configuration. Afterwards, SCR must attempt to activate the component configuration again if another target service can be used as a replacement".

**(f) Cycles**
- V 112.3.11: "SCR must ensure that a component instance is never accessible to another component instance or as a service until it has been fully activated". SCR "must fail to satisfy the references involved in the cycle ... However, if one of the references in the cycle has optional cardinality SCR must break the cycle."

**(g) Exceptions**
- V 112.5.11: activate throws: "the component configuration is not activated."
- V 112.5.10: bind throws: "SCR must log an error message ... but the activation of the component configuration does not fail."
- V 112.5.15: modified throws: "log an error message ... and continue processing the modification."
- V 112.5.17/112.5.18: deactivate or unbind throws: "the deactivation of the component configuration will continue." Unbinding processes "references ... in the reverse order in which they are specified".
- Inf: failures during activation are fatal for that instance; failures during notification or teardown are logged and processing continues.

---

## 2. Spring Cloud Context: `@RefreshScope` vs `ConfigurationPropertiesRebinder`
Doc: https://docs.spring.io/spring-cloud-commons/reference/spring-cloud-commons/application-context-services.html (current stable 5.0.3). Source: tag `v5.0.3` = commit `9e19c8233fd4d1f23e0e2953fedfdd474acedf33`.
- V doc: on `EnvironmentChangeEvent` it will "Re-bind any @ConfigurationProperties beans in the context." / "Re-binding mutates the @ConfigurationProperties bean's fields in place, destroying and re-initializing the same instance rather than swapping it out for a new one."
- V doc: "a concurrent reader can observe transient, partially-updated state (for example, a property briefly reset to its class-level default before the new value is applied)." / "If your application needs a consistent view ... use @RefreshScope instead".
- V doc: "Objects using constructor binding including Java Records annotated with @ConfigurationProperties cannot be refreshed."
- V doc: "Refresh scope beans are lazy proxies that initialize when they are used (that is, when a method is called), and the scope acts as a cache of initialized values." `refreshAll()` works "by clearing the target cache."
- V doc: "@RefreshScope works (technically) on a @Configuration class, but it might lead to surprising behavior. For example, it does not mean that all the @Beans defined in that class are themselves in @RefreshScope." / "anything that depends on those beans cannot rely on them being updated ... unless it is itself in @RefreshScope."
- V doc: "Removing a configuration value and then performing a refresh will not update the presence of the configuration value." / "HikariDataSource, it can not be refreshed." / "Context Refresh is not supported for Spring AOT transformations and native images."
- V source `RefreshScope.java`: "If a bean is refreshed then the next time the bean is accessed (i.e. a method is executed) a new instance is created. All lifecycle methods are applied ... destruction callbacks ... are called when it is refreshed".
- V source `ConfigurationPropertiesRebinder.java`: `destroyBean(bean)`, `resetBeanToDefaults(bean)`, `autowireBean(bean)`, `initializeBean(bean, name)`. Javadoc: "the bean is mutated in place, field by field, so a concurrent reader can observe transient intermediate state."
- Inf: rebinding in place is cheap and keeps identity but allows torn reads. Recreating behind a proxy keeps reads consistent but changes identity. Refresh doesn't reach dependents that aren't themselves refresh-scoped, which is a hierarchy trap.

---

## 3. Flutter
Docs: api.flutter.dev (no version shown). Cross-checked against the `flutter/flutter` stable commit `6a19cca56475dbfba1478ee68d7bd0c2ef891da1` ("Update changelog for 3.47.5"), `packages/flutter/lib/src/widgets/framework.dart`.
- V InheritedWidget.updateShouldNotify (https://api.flutter.dev/flutter/widgets/InheritedWidget/updateShouldNotify.html): "if the data held by this widget is the same as the data held by oldWidget, then we do not need to rebuild the widgets that inherited the data". Source: `if ((widget as InheritedWidget).updateShouldNotify(oldWidget)) { super.updated(oldWidget); }`.
- V InheritedModel (…/InheritedModel-class.html): "An inherited widget's dependents are unconditionally rebuilt when the inherited widget changes per InheritedWidget.updateShouldNotify. This widget is similar except that dependents aren't rebuilt unconditionally." / "If updateShouldNotify returns true, then the inherited model's updateShouldNotifyDependent method is tested for each dependent and the set of aspect objects it depends on."
- V updateShouldNotifyDependent: "Return true if the changes between this model and oldWidget match any of the dependencies."
- V dependOnInheritedWidgetOfExactType (…/BuildContext/dependOnInheritedWidgetOfExactType.html): "Calling this method is O(1) with a small constant factor, but will lead to the widget being rebuilt more often." By contrast, findAncestorWidgetOfExactType (source): "relatively expensive (O(N) in the depth of the tree). Only call this method if the distance ... is known to be small and bounded."
- V GlobalKey (…/GlobalKey-class.html): "a widget must arrive at its new location in the tree in the same animation frame in which it was removed from its old location". Also: "Reparenting an Element using a global key is relatively expensive, as this operation will trigger a call to State.deactivate on the associated State and all of its descendants; then force all widgets that depends on an InheritedWidget to rebuild."
- V State.deactivate / State.activate: "If the framework does reinsert this subtree, it will do so before the end of the animation frame in which the subtree was removed from the tree. For this reason, State objects can defer releasing most resources until the framework calls their dispose method." activate is a "chance to reacquire any resources that it released in deactivate"; it is not called on first insertion.
- Inf: there are two filters, a provider-level change check and then a per-dependent aspect check. Lookup is O(1). A move is "deactivate, then reactivate within the frame, otherwise dispose", which gives a bounded grace window before final cleanup.

---

## 4. Riverpod (3.x docs; source tag `riverpod-v3.4.3` = `128a8cacce6ddb73e04675e5204af452c9aec369`)
- V https://riverpod.dev/docs/how_to/select: by default `ref.watch` causes rebuilds "whenever any of the properties of an object changes". With select, "your consumers/providers will now rebuild only if those selected properties change." Also: "Returning a List and then mutating that list will not trigger a rebuild." / "Using select slightly slows down individual read operations".
- V source `core/modifiers/select.dart`: notify only if `lastSelectedValue.value != newSelectedValue.value`. https://riverpod.dev/docs/3.0_migration: "In Riverpod 3.0, all providers now use == to filter updates." / "override Notifier.updateShouldNotify to customize".
- V https://riverpod.dev/docs/concepts2/family: "it is highly advised to enable Automatic disposal when using families. This avoids memory leaks in case the parameter changes". Also: "Parameters passed need to have a consistent ==/hashCode."
- V https://riverpod.dev/docs/concepts2/auto_dispose: "one state per parameter combination will be created, which can lead to memory leaks." / "When that counter reaches zero ... Ref.onCancel is triggered. At that point, Riverpod waits for one frame ... then the provider is destroyed and Ref.onDispose will be triggered." / "The state will always be destroyed when the provider is recomputed."
- V https://riverpod.dev/docs/concepts2/refs: "Ref.watch ... should be your go to choice." / "Ref.listen - This is a 'manual' way ... Powerful, but more complex." / "Do not use Ref.read as a mean to 'optimize' your code by avoiding Ref.watch. This will make your code more brittle".
- V https://riverpod.dev/docs/concepts2/scoping: "The scoping feature is highly complex and will likely be reworked in the future ... Thread carefully."
- Inf: the scale pattern here is select plus `==` and listener ref-counting with a one-frame grace. Recompute means dispose and recreate. Riverpod's own docs flag hierarchical overrides as the hard part.

---

## 5. IntelliJ Disposer
Doc: https://plugins.jetbrains.com/docs/intellij/disposers.html. Source: `JetBrains/intellij-community` @ `526a8fc801151362f482b2b40958b7d7ac80d63c`, `platform/util/src/com/intellij/openapi/util/{Disposer,ObjectTree}.java`.
- V doc: "enforce the rule that a child Disposable never outlives its parent." / "the Disposer releases children of a parent first. Parent objects always live longer than their children."
- V doc: "Even though Application and Project implement Disposable, they must never be used as parent disposables in plugin code. Disposables registered using those objects as parents will not be disposed when the plugin is unloaded, leading to memory leaks."
- V doc: "create a disposable using Disposer.newDisposable() ... it's always best to specify a parent for such a disposable ... so that there is no memory leak if the Disposable.dispose() call is not reached". (The page also says "Never call Disposable.dispose() directly ... Always call Disposer.dispose(Disposable) instead", which is an internal inconsistency.)
- V doc: a wrong (too-long-lived) parent "won't be reported by the regular leak checker utilities, because technically, it's not a memory leak from the test suite perspective."
- V doc: "When the application exits, it performs a final sanity check to verify everything was disposed." / "In test, internal, and debug mode ... registering a Disposable ... also registers a stack trace for the object's allocation path." The reported error is "Memory leak detected: ...".
- V source `Disposer.register` javadoc (multiple parents): "This method overrides parent disposable for the {@code child}, i.e., if {@code child} is already registered with {@code oldParent}, then it's unregistered from {@code oldParent} before registering with {@code parent}." It throws `IncorrectOperationException` "If {@code child} has been registered with {@code parent} before; if {@code parent} is being disposed or already disposed".
- V source `ObjectTree`: "Cannot register to itself"; "Sorry but parent: ... has already been disposed"; a cycle guard `checkWasNotAddedAlreadyAsChild` ("was already added as a child of").
- Inf: each child has exactly one owner. Registering it under a second parent moves it, so there is no multi-owner model. Registering under a disposed parent fails fast.

---

## 6. .NET DI
- V https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/guidelines (ms.date 2026-01-14): "Use scopes to control the lifetimes of services. Scopes aren't hierarchical, and there's no special connection among scopes." / "The container is responsible for cleanup of types it creates ... Services resolved from the container should never be disposed by the developer." / "The receiver of the IDisposable dependency shouldn't call Dispose on that dependency."
- V same page: captive dependency = "a longer-lived service holds a shorter-lived service captive". Validation error: "Cannot consume scoped service 'Bar' from singleton 'Foo'."
- V https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/overview: "If a scoped service is created in the root container, the service's lifetime is effectively promoted to singleton". Validation checks "Scoped services aren't resolved from the root service provider." and "Scoped services aren't injected into singletons." / "The IServiceScopeFactory is always registered as a singleton". For BackgroundService: "inject IServiceScopeFactory, create a scope, then resolve dependencies from the scope".
- V source (not docs) `dotnet/runtime` @ `76236f067ce0cfe5b38a304d89d1b434529c9bde`, `ServiceLookup/ServiceProviderEngineScope.cs`: `_disposables.Add(service)` on capture, then `for (var i = toDispose.Count - 1; i >= 0; i--)`. Exceptions go through `AddExceptionToCache` and are rethrown, as an `AggregateException` when there are several. Commit `800f26a366` (2026-02-02): "ServiceProviderEngineScope should aggregate exceptions in Dispose rather than throwing on the first".
- V https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/hosted-services?view=aspnetcore-10.0: "Hosted service instances stop in the reverse order that they're registered ... unless the app opts into concurrent shutdown behavior".
- Inf: the creator disposes and the borrower never does. Disposal is LIFO, continues past failures and reports them together. Scopes are flat, not a tree.

---

## 7. NestJS
Source: `nestjs/docs.nestjs.com` @ `cc4542f80d03a9f78cb255a1c11812becb2a50f7` (lifecycle file changed `9507239be1`, 2026-09-22). The live page shows the same wording (checked via WebFetch).
- V https://docs.nestjs.com/fundamentals/lifecycle-events: "Nest calls `onModuleInit()` and `onApplicationBootstrap()` module by module, ordered by each module's distance from the root module in the import graph: the most deeply imported modules (and global modules) go first, and the root module goes last. Each module's hooks are awaited ... The shutdown hooks run in the reverse order."
- V same page: "The lifecycle hooks listed above are not triggered for **request-scoped** classes."
- V https://docs.nestjs.com/fundamentals/injection-scopes: "The `REQUEST` scope bubbles up the injection chain. A controller that depends on a request-scoped provider is itself request-scoped." / "Transient-scoped dependencies don't follow that pattern."
- V same page (Performance): "Unless a provider must be request-scoped, we strongly recommend using the default singleton scope." / "should not see latency increase by more than ~5%." / "For, say, 30k requests in parallel, there are 30k ephemeral instances of the controller".
- Inf: init runs from the deepest dependency upward and shutdown runs in reverse. Shorter lifetimes spread up to dependents and cost performance.

---

## 8. Angular (`angular/angular` @ `73858905a277fe2938efff030a686a61c3a38fab`, adev sources)
- V `guide/components/lifecycle.md`: "Angular walks your application tree from top to bottom, checking template bindings for changes ... This traversal visits each component exactly once". Also: "The `ngOnChanges` method runs after any component inputs have changed." `SimpleChanges` maps each input to a `SimpleChange` with previous/current values and a first-change flag.
- V `core/src/change_detection/lifecycle_hooks.ts`: ngOnChanges is "invoked immediately after the default change detector has checked data-bound properties if at least one has changed".
- V `core/src/linker/component_factory.ts` (`ComponentRef.setInput`): "Using this method will properly mark for check component using the `OnPush` change detection strategy. It will also assure that the `OnChanges` lifecycle hook runs when a dynamically created component is change-detected."
- V `best-practices/runtime-performance/skipping-subtrees.md`: "OnPush is the default change detection strategy in Angular (since v22). It instructs Angular to run change detection for a component subtree **only** when: The root component of the subtree receives new inputs as the result of a template binding. Angular compares ... with `==`."
- V `guide/signals/overview.md`: Signals "granularly tracks how and where your state is used". Also: "Only the signals actually read during the derivation are tracked." / "The reactive context is only active for synchronous code."
- V `guide/di/hierarchical-dependency-injection.md`: "The requests keep forwarding up until Angular finds an injector that can handle the request or runs out of ancestor `ElementInjector` hierarchies." / "When the component instance is destroyed, so is that service instance."
- Inf: change notifications come from binding-driven inputs; DI-injected dependencies produce no `SimpleChanges`. Signals are the fine-grained option. A provider's lifetime is tied to the node that provides it.

---

## 9. React (`reactjs/react.dev` @ `75ef18a9172e4c100b5d5650ae14c395c5c8ef42`)
- V https://react.dev/reference/react/useContext (Caveats): "React **automatically re-renders** all the children that use a particular context starting from the provider that receives a different `value`. The previous and the next values are compared with the `Object.is` comparison. Skipping re-renders with `memo` does not prevent the children receiving fresh context values."
- V same page: a new object each render means React "will also have to re-render all components deep in the tree that call `useContext(AuthContext)`". The fix: "wrap the `login` function with `useCallback` and wrap the object creation into `useMemo`."
- V https://react.dev/reference/react/memo: "To make your component re-render only when a _part_ of some context changes, split your component in two. Read what you need from the context in the outer component, and pass it down to a memoized child as a prop."
- V https://react.dev/reference/react/useSyncExternalStore: "If the store changes and the returned value is different (as compared by `Object.is`), React re-renders the component." / "The store snapshot returned by `getSnapshot` must be immutable."
- Inf: plain context has no selector and broadcasts to every consumer. Selective delivery needs narrow contexts or an external store with per-subscriber snapshot comparison.

---

## 10. Svelte 5 / Vue 3
- V Svelte (`sveltejs/svelte` @ `020242d6bef059df9ae8c13dc8dbff4c9b31e0ff`, `documentation/docs/02-runes/04-$effect.md`; https://svelte.dev/docs/svelte/$effect; latest `svelte@5.57.1`): "Values that are read _asynchronously_ — after an `await` or inside a `setTimeout`, for example — will not be tracked." / "An effect only reruns when the object it reads changes, not when a property inside it changes." / "Teardown functions also run when the effect is destroyed, which happens when its parent is destroyed (for example, a component is unmounted) or the parent effect re-runs."
- V Vue (`vuejs/docs` @ `40aa88af0094f7bab4aaf786e55c748a6a251d88`, `src/guide/essentials/watchers.md`; https://vuejs.org/guide/essentials/watchers.html; vuejs/core latest `v3.5.43`): "Deep watch requires traversing all nested properties in the watched object, and can be expensive when used on large data structures. Use it only when necessary and beware of the performance implications." / "`watchEffect` only tracks dependencies during its **synchronous** execution."
- V Vue: "Watchers declared synchronously inside `setup()` ... are bound to the owner component instance, and will be automatically stopped when the owner component is unmounted." / "if the watcher is created in an async callback, it won't be bound to the owner component and must be stopped manually to avoid memory leaks."
- Inf: both automatic tracking and automatic owner binding depend on synchronous registration. Anything set up after an `await` escapes unless the owner is passed explicitly.

---

## Cross-cutting (Inf)
1. OSGi DS separates the events most cleanly: `modified` (own config), `updated` (dependency metadata), bind-new-then-unbind-old (replacement), unsatisfied (deactivate, then possibly a new instance). Config changes that alter dependency selection turn into replacements.
2. Ownership: .NET, IntelliJ, Vue, Svelte and Angular all agree that the owner disposes and borrowers never do. IntelliJ enforces a single owner.
3. Ordering: dependencies initialize first and tear down last (NestJS, .NET LIFO, OSGi reverse unbind, IntelliJ children first).
4. Scale: selective notification through projection plus equality (Flutter aspects, Riverpod select, useSyncExternalStore). Unfiltered broadcast is called out as a cost (React context, static/greedy reactivation, NestJS scope bubbling).
5. Failures: an activation failure aborts that instance, while teardown and notification continue past errors (OSGi; .NET since 2026-02).

## NOT verified / caveats
- Angular: there is **no explicit doc sentence** saying that a programmatic property assignment (without a template binding or `setInput`) skips `ngOnChanges`. This is implied only by the `setInput` javadoc.
- .NET reverse disposal for scoped/transient services is verified **only in source**. learn.microsoft.com's reverse-order prose covers hosted services only. Capture order = creation order is my assumption.
- Flutter docs show no version; the "3.47.5" label comes from a commit message only.
- Riverpod docs are unversioned (assumed 3.x). The `==` behavior of select is verified in source, not on the select doc page.
- "OnPush default since v22" comes from main-branch adev; I didn't check the deployed angular.dev.
- The NestJS ordering hint was rewritten on 2026-09-22. I did not verify it against `@nestjs/core` runtime code or older docs.
- IntelliJ: I did not verify a test-specific leak-checker API (e.g. `getTestRootDisposable`).
- I did not compare OSGi R8.1 vs R8.0 text for ch. 112.
