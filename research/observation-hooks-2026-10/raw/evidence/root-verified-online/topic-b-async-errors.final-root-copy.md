# Topic B: Async and error semantics of lifecycle hooks, primary-source check

Retrieval date for all items: 2026-10-01. Code fetched with `gh api .../contents/PATH?ref=SHA`. Docs fetched with WebFetch. I quote only text confirmed verbatim in code or markdown, or text the fetch tool returned in quotation marks.

Pinned SHAs:

| Repo | SHA | Version at SHA |
|---|---|---|
| facebook/react | `7c6ac13e19fef500b7f669a16bbd01ecc95965ca` (main, 2026-09-29) | react 19.3.0 |
| vuejs/core | `4ab865a848a1da3d10fb674f857e5fff13094644` (main, 2026-09-18) | 3.5.43 |
| sveltejs/svelte | `020242d6bef059df9ae8c13dc8dbff4c9b31e0ff` (main, 2026-09-28) | svelte 5.57.1 |
| flutter/flutter | `16bf22f3923acb85b1a780496c1f834b29ce6142` (HEAD) | n/a |
| rrousselGit/riverpod | `90c5a0bb144c3d782475c0d525cb2f6e45eef1c8` (HEAD) | riverpod 3.4.3 |
| nestjs/nest | `7fb52e7f4f7314fbc117e369a09297bc2ecadf6b` (HEAD, 2026-10-01) | @nestjs/core 12.1.2 (unreleased; latest release v12.1.1) |
| spring-projects/spring-framework | tag `v7.0.9` = `82a6b40b9366ec181ededdad282b307ee5381a52` | 7.0.9 |
| dotnet/runtime | `release/10.0` = `8c770a5281fa604706537f489c7f3e65faa7c636` | .NET 10 |
| JetBrains/intellij-community | `526a8fc801151362f482b2b40958b7d7ac80d63c` (HEAD) | n/a |
| openclaw/openclaw | old `c3425e1d7b9550c7ff36deda1c1b0fc0f97332a1`, HEAD `01e328528a48eb8c18abeed66d12992500feacef` | 2026.9.7 |

---

## 1. React `useEffect`

**1a. Cleanup runs before the next setup and sees the old values.** Verified.
- "After every commit with changed dependencies, React will first run the cleanup function (if you provided it) with the old values, and then run your setup function with the new values." (https://react.dev/reference/react/useEffect)
- ReactFiberCommitEffects.js @7c6ac13 comment: "all destroy functions for all fibers are called before any create functions." In ReactFiberWorkLoop.js, `commitPassiveUnmountEffects` (line 4788) runs before `commitPassiveMountEffects` (line 4789).

**1b. Async setup and Promise cleanup.** Verified in code.
- In DEV, a setup function that returns anything other than a function or undefined triggers `console.error('%s must not return anything besides a function, which is used for clean-up.%s')`. When the returned value has `.then`, the message adds: "It looks like you wrote useEffect(async () => ...) or returned a Promise. Instead, write the async function inside your effect and call it immediately". (ReactFiberCommitEffects.js lines 187-232)
- The cleanup is called as `destroy_();` and its return value is thrown away (`safelyCallDestroy`, lines 907-931). React never awaits a cleanup.
- My inference (not run): in production there is no warning, and `inst.destroy = destroy` stores the Promise. On unmount, `destroy !== undefined`, so React calls the Promise as if it were a function. That throws a TypeError, which `captureCommitPhaseError` routes.

**1c. Race-condition guidance.** Verified. The `let ignore = false; ... if (!ignore) { setBio(result); } ... return () => { ignore = true; };` example comes with this note: "This ensures your code doesn't suffer from "race conditions": network responses may arrive in a different order than you sent them." (react.dev/reference/react/useEffect)

**1d. StrictMode.** Verified: "When Strict Mode is on, React will **run one extra development-only setup+cleanup cycle** before the first real setup." (same page)

**1e. A throwing cleanup.** Verified in code:
```js
function safelyCallDestroy(current, nearestMountedAncestor, destroy, resource) {
  ...
    try {
      destroy_();
    } catch (error) {
      captureCommitPhaseError(current, nearestMountedAncestor, error);
    }
```
The DEV path (`callDestroy` in ReactFiberCallUserSpace.js lines 195-206) does the same thing. The catch is per cleanup, so the `do { ... } while (effect !== firstEffect)` loop in `commitHookEffectListUnmount` keeps running the fiber's other cleanups. Before the call, React sets `inst.destroy = undefined` (line 266), so one cleanup runs at most once.

Mount works differently: `commitHookEffectListMount` puts one try/catch around the whole loop (lines 144-245). A throwing setup therefore skips the remaining setups on that fiber, and the error goes to `captureCommitPhaseError(finishedWork, finishedWork.return, error)`.

**Inference for our design:** Make teardown synchronous, run each teardown once with its own catch, clear the handle before calling it, keep going after errors, and route errors to an owner. Setup failure can be treated more coarsely.

---

## 2. Vue 3.5 watchers

**2a. `onWatcherCleanup` must be called synchronously.** Verified: "`onWatcherCleanup` is only supported in Vue 3.5+ and must be called during the synchronous execution of a `watchEffect` effect function or `watch` callback function: you cannot call it after an `await` statement in an async function." The alternative: "`onCleanup` passed via function argument is bound to the watcher instance so it is not subject to the synchronous constraint of `onWatcherCleanup`." (https://vuejs.org/guide/essentials/watchers.html)

In code (packages/reactivity/src/watch.ts @4ab865a, lines 103-118), `onWatcherCleanup(cleanupFn, failSilently = false, owner = activeWatcher)` records the cleanup only when `owner` is set. Otherwise DEV warns "onWatcherCleanup() was called when there was no active watcher to associate with." `activeWatcher` is restored in a `finally` right after the callback returns synchronously (lines 191-198, 256-275), so after an `await` there is no owner. `onCleanup` is `boundCleanup = fn => onWatcherCleanup(fn, false, effect)` (line 294), which captures the owner explicitly.

**2b. Watchers created after await are not bound.** Verified: "if the watcher is created in an async callback, it won't be bound to the owner component and must be stopped manually to avoid memory leaks." Same page.

**2c. Cleanups are not awaited, and errors are handled per callback.** Verified in code. watch.ts lines 296-306:
```ts
cleanup = effect.onStop = () => {
  const cleanups = cleanupMap.get(effect)
  if (cleanups) {
    if (call) { call(cleanups, WatchErrorCodes.WATCH_CLEANUP) }
    else { for (const cleanup of cleanups) cleanup() }
    cleanupMap.delete(effect)
```
In runtime-core, `call` is `callWithAsyncErrorHandling(fn, instance, type, args)` (apiWatch.ts lines 195-196). For an array, it calls each function inside its own `try/catch -> handleError`. If a function returns a Promise, it attaches `res.catch(err => handleError(...))` and returns the Promise without awaiting it (errorHandling.ts lines 70-110). The same `cleanup()` runs before each re-run (lines 252-255) and on stop.

My inference: when `@vue/reactivity` `watch` is used on its own without `call`, a throwing cleanup stops the `for` loop, so the later cleanups and `cleanupMap.delete` are skipped.

**Inference for our design:** Bind the cleanup registrar to the owning instance as an explicit parameter rather than ambient context, so it still works after `await`. Isolate errors per callback. A returned Promise only gets its rejection observed.

---

## 3. Svelte 5 `$effect` and `onMount`

**3a. When teardown runs.** Verified. From documentation/docs/02-runes/04-$effect.md @020242d: "An effect can return a _teardown function_ which will run immediately before the effect re-runs". Also: "Teardown functions also run when the effect is destroyed, which happens when its parent is destroyed (for example, a component is unmounted) or the parent effect re-runs." And: "Values that are read _asynchronously_ — after an `await` or inside a `setTimeout`, for example — will not be tracked."

**3b. An async `onMount` cannot return a cleanup.** Verified. From 06-runtime/03-lifecycle-hooks.md: "This behaviour will only work when the function passed to `onMount` is _synchronous_. `async` functions always return a `Promise`." In code (index-client.js lines 91-103):
```js
user_effect(() => {
  const cleanup = untrack(fn);
  if (typeof cleanup === 'function') return /** @type {() => void} */ (cleanup);
});
```

**3c. Teardown is not awaited.** Verified. runtime.js `update_effect`: `execute_effect_teardown(effect); var teardown = update_reaction(effect); effect.teardown = typeof teardown === 'function' ? teardown : null;`. A Promise return is dropped. effects.js lines 445-463 call `teardown.call(null)` and ignore the result.

**3d. Errors in teardown.** Verified:
```js
try { teardown.call(null); }
catch (error) {
  // Route teardown errors through the boundary system so that a live
  // ancestor <svelte:boundary> can handle them. Boundaries that are
  // themselves mid-teardown are skipped by invoke_error_boundary.
  invoke_error_boundary(error, effect.parent);
}
```
`invoke_error_boundary` (error-handling.js lines 54-87) swallows the error if the parent is already `DESTROYED`. Otherwise it walks up to a live boundary, and with no boundary it ends in `throw error`.

My inference: with no live boundary, the rethrow escapes `destroy_effect` before `effect.f |= DESTROYED` and before the remaining siblings in `destroy_effect_children`, so cleanup can be incomplete.

**3e. Order and cancellation.** Verified. `destroy_effect` destroys children first (`destroy_effect_children`, forward sibling order), then runs its own teardown. Before destroying each child, it calls `controller.abort(STALE_REACTION)` on the child's AbortController. The doc for `getAbortSignal()` says it "aborts when the current derived or effect re-runs or is destroyed".

**Inference for our design:** An AbortSignal per run that aborts on re-run or destroy is the established cancellation channel for async work. Do not rely on a teardown being returned asynchronously.

---

## 4. Flutter `State`

**4a. `dispose` is void and not awaited.** Verified. Signature `void dispose()` (https://api.flutter.dev/flutter/widgets/State/dispose.html). framework.dart @16bf22f doc: "After the framework calls [dispose], the [State] object is considered unmounted and the [mounted] property is false. It is an error to call [setState] at this point. This stage of the lifecycle is terminal: there is no way to remount a [State] object that has been disposed." Caveat in the same doc: "This method is _not_ invoked at times where a developer might otherwise expect it, such as application shutdown".

**4b. `mounted`.** Verified. `bool get mounted => _element != null;`. Doc: "The [State] object remains mounted until the framework calls [dispose] ... It is an error to call [setState] unless [mounted] is true." (framework.dart lines 966-975)

**4c. The `setState` callback cannot be async.** Verified: "The provided callback is immediately called synchronously. It must not return a future (the callback cannot be `async`)" (https://api.flutter.dev/flutter/widgets/State/setState.html). In code, a debug assert throws `'setState() callback argument returned a Future.'` with the hint "Instead of performing asynchronous work inside a call to setState(), first execute the work (without updating the widget state), and then synchronously update the state". Similar debug asserts reject a Future returned from `initState()` ("State.initState() must be a void method without an `async` keyword.") and from `didUpdateWidget()`.

**4d. `didChangeDependencies`.** Verified: "This method is also called immediately after [initState]." (framework.dart line 1467ff)

**4e. `deactivate` and `activate` within a frame.** Verified: "If the framework does reinsert this subtree, it will do so before the end of the animation frame in which the subtree was removed from the tree. For this reason, [State] objects can defer releasing most resources until the framework calls their [dispose] method." And for `activate`: "Called when this object is reinserted into the tree after having been removed via deactivate." / "The framework does not call this method the first time a State object is inserted into the tree."

**Inference for our design:** The mature pattern is synchronous teardown plus a `mounted` or `disposed` guard checked after every await. Hosts reject async hooks at runtime instead of silently awaiting them.

---

## 5. Riverpod 3

**5a. Ref after dispose throws.** Verified: "In 3.0, Riverpod will throw an error if you try to interact with a disposed Ref/Notifier." and "You can use `Ref.mounted` to check if a Ref/Notifier is still usable." (https://riverpod.dev/docs/whats_new). In ref.dart @90c5a0b, `bool get mounted => !_element._disposed && identical(_element.ref, this);`, and `_throwIfInvalidUsage` throws `UnmountedRefException`, whose message reads: "A provider rebuilt, but the previous "build" was still pending and is still performing operations. You should therefore either use `ref.onDispose` to cancel pending work, or check `ref.mounted` after async gaps". The `identical(...)` check makes an old-build Ref count as unmounted after a rebuild.

**5b. `onDispose` is sync, runs in forward order, and isolates errors.** Verified. Signature `RemoveListener onDispose(void Function() listener)`. `_runCallbacks` loops over `for (final cb in callbacks)` and calls `container.runGuarded(cb)`. `runGuarded` uses `try { cb(); } catch (err, stack) { defaultOnError(err, stack); }`. The order is registration order, not reversed. Doc: onDispose runs "when the provider will rebuild", "when an `autoDispose` provider is no longer used", and "when the associated [ProviderContainer]/`ProviderScope` is disposed". `onDispose` calls `_throwIfInvalidUsage()` first, so registering after dispose throws.

**5c. In-flight futures on recompute.** Verified in element.dart `handleFuture`. The old Future is not cancelled (Dart cannot cancel it). Its result is ignored through a flag:
```dart
var running = true;
void cancel() { running = false; }
futureOr.then((value) { if (!running) return; data(value); done(); })
```
`runOnDispose()` calls `_cancelSubscription?.cancel()`, then pauses current subscriptions: "When a provider rebuilds, instead of immediately removing all of its listeners, it pauses them." (whats_new)

**5d. Automatic retry.** Verified, and the docs disagree with each other:
- The concepts page says: "By default, a provider can be retried up to 10 times, with an exponential backoff going from 200ms to 6.4 seconds." and "it will not retry Errors and ProviderExceptions." (https://riverpod.dev/docs/concepts2/retry). It also says: "Disabling retry is as simple as always retuning `null` in the retry function."
- Source `ProviderContainer.defaultRetry` matches that page: `maxRetries = 10`, `maxDelay = 6400ms`, `minDelay = 200ms`, `if (error is ProviderException || error is Error) return null;`.
- The whats_new page still says "the provider will be retried until it succeeds or is disposed" and "The default behavior retries any error". This is stale relative to the source.
- `runOnDispose` cancels `_pendingRetryTimer`.

**Inference for our design:** Mark stale generations by identity (old ref is not the current ref), ignore late results, and isolate dispose callbacks. Retry should be bounded and must not retry programmer errors.

---

## 6. NestJS (core 12.1.2 @7fb52e7)

**6a. Within a module: `Promise.all` for init, `Promise.allSettled` plus logging for destroy and shutdown.** Verified. on-module-init.hook.ts:
```ts
const levels = getSortedHierarchyLevels(groupedInstances);
for (const level of levels) {
  await Promise.all(callOperator(groupedInstances.get(level)!));
}
```
Init runs hierarchy levels in sequence, with the providers in one level in parallel and fail-fast. The module class's own `onModuleInit` runs last, and only if `isDependencyTreeStatic()`.

on-module-destroy.hook.ts and on-app-shutdown.hook.ts use `getSortedHierarchyLevels(groupedInstances, 'DESC')`, then `await Promise.allSettled(...)`, and log each rejection with `Logger.error(result.reason, ...)`. The module-class hook gets its own try/catch and `Logger.error`. History: commit `0af8c0fba3` (2026-05-28) "fix(core): replace promise.all with promise.allsettled in shutdown hooks" and `2ea28d0db9` "continue shutdown when module class instance hook rejects". Both are in release v12.1.1 (compare status: behind).

**6b. Across modules.** Verified. nest-application-context.ts `callInitHook` runs `for (const module of modulesSortedByDistance) { await callModuleInitHook(module); }`. A rejection propagates, so later modules' `onModuleInit` and the bootstrap hooks never run.

My inference: `Promise.all` does not cancel sibling init hooks in the same level, so they keep running unobserved. Destroy, beforeShutdown and shutdown iterate `[...getModulesToTriggerHooksOn()].reverse()`. Because each module's hook swallows and logs its own errors, later modules still get their destroy hooks.

**6c. `close()` after a failed init.** Verified, but the fix is unreleased. PR #17966, "fix(core): run the shutdown sequence after a failed init", merged 2026-10-01T09:33:38Z as commit `4b596a5731`, 61 commits ahead of v12.1.1. The PR describes the old behavior: "When `init()` of an application context fails, closing it afterwards tears nothing down. `close()` rejects with the init error, and no `onModuleDestroy`, `beforeApplicationShutdown` or `onApplicationShutdown` hook runs." The new code:
```ts
// A failed initialization must not stop the teardown: its error already
// went to the caller of `init()`, and the hooks below release what the
// partial startup acquired (connection pools, timers, sockets).
await this.initializationPromise?.catch(() => undefined);
await this.prepareClose();
await this.callDestroyHook(); ...
```
`shutdown()` is single-flight: `this.shutdownPromise ??= this.runShutdownSequence(signal).finally(...)`.

My inference: after a partial init, destroy hooks run on every provider that has the method, including providers whose `onModuleInit` never ran or never finished. Nest keeps no per-instance "started" record, so destroy hooks must tolerate partial setup.

**6d. Timeouts.** I found no timeout or deadline in these hook files or in nest-application-context.ts (searched for `timeout`). A hook that never settles blocks init or close indefinitely. Docs: "Nest calls `onModuleInit()` and `onApplicationBootstrap()` module by module, ordered by each module's distance from the root module" (https://docs.nestjs.com/fundamentals/lifecycle-events).

**Inference for our design:** Nest moved to allSettled teardown and to "teardown after failed init" only in 2026, through bug fixes. That is evidence these are the right defaults. A missing deadline remains a gap in Nest.

---

## 7. Spring Framework 7.0.9

**7a. Default `timeoutPerShutdownPhase`.** Verified. DefaultLifecycleProcessor.java: `private volatile long timeoutPerShutdownPhase = 10000;`. Javadoc: "The default value is 10000 milliseconds (10 seconds) as of 6.2." Per-phase overrides exist through `setTimeoutForShutdownPhase(int phase, long timeout)`.

**7b. A stop callback that is never invoked: log and continue.** Verified (lines 654-661):
```java
if (!latch.await(shutdownTimeout, TimeUnit.MILLISECONDS)) {
  // Count is still >0 after timeout
  if (!countDownBeanNames.isEmpty() && logger.isInfoEnabled()) {
    logger.info("Shutdown phase " + this.phase + " ends with " + countDownBeanNames.size() +
        " bean" + ... + " still running after timeout of " + shutdownTimeout + "ms: " + countDownBeanNames);
```
The next phase then proceeds. A stop that throws gives `logger.warn("Failed to stop bean '" + beanName + "'", ex)` and `latch.countDown()`. Dependent beans are stopped first (`doStop` recurses into `getDependentBeans`). Only beans where `isRunning()` returns true are stopped. SmartLifecycle javadoc: "The callback **must** be executed after the `SmartLifecycle` component does indeed stop."

**7c. `start()` throws.** Verified. `doStart` wraps the exception: `throw new ApplicationContextException("Failed to start bean '" + beanName + "'", ex);`. `onRefresh` catches it, runs `stopBeans(false)` with the comment "stop already started beans on context refresh failure", and rethrows. `AbstractApplicationContext.refresh` also catches it: "Stop already started Lifecycle beans to avoid dangling resources." and "Destroy already created singletons to avoid dangling resources."

**7d. `@PreDestroy` and DisposableBean errors are logged and teardown continues.** Verified. In `DisposableBeanAdapter.destroy()`, the `DisposableBean.destroy()` call sits in a try/catch that logs `"Invocation of destroy method failed on bean with name '" + this.beanName + "'"` at warn. `InitDestroyAnnotationBeanPostProcessor.postProcessBeforeDestruction` catches errors and logs "Destroy method on bean with name '...' threw an exception".

My inference: `invokeDestroyMethods` loops over the `@PreDestroy` methods with no try/catch inside the loop, so the first throwing `@PreDestroy` on a bean skips the others on that same bean.

A custom destroy method that returns a `Future` is awaited with no timeout: `// An async task: await its completion. future.get();`. A reactive Publisher is awaited with `latch.await()`.

**Inference for our design:** Spring combines bounded phase waits that log and continue with unbounded awaits of async destroy methods. The bounded and unbounded paths should be explicit choices, not accidents.

---

## 8. .NET Generic Host (release/10.0)

**8a. `ShutdownTimeout` default is 30 s.** Verified. HostOptions.cs: `public TimeSpan ShutdownTimeout { get; set; } = TimeSpan.FromSeconds(30);` and `StartupTimeout ... = Timeout.InfiniteTimeSpan;`. The docs say "The cancellation token has a default 30 second timeout to indicate that the shutdown process should no longer be graceful." The 3.1/5.0 docs say "default five second timeout". (https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/hosted-services)

**8b. A cancelled stop token does not abandon tasks.** Verified: "However, tasks aren't abandoned after cancellation is requested—the caller awaits all tasks to complete." (same page). In code, StopAsync applies `cts.CancelAfter(_options.ShutdownTimeout)` and then `await`s each service. The timeout is cooperative only.

Also verified:
- "If the app shuts down unexpectedly (for example, the app's process fails), `StopAsync` might not be called."
- Stop order: `// Ensure hosted services are stopped in LIFO order` with `_hostedServices.Reverse()`, and `abortOnFirstException: false`.
- Errors are collected. Several errors become an AggregateException ("One or more hosted services failed to stop."). A single error is rethrown as is.

**8c. StartAsync failure.** Verified. Sequential start uses `abortOnFirstException = !concurrent`. The comments say "Exceptions in StartAsync cause startup to be aborted." and `LogAndRethrow()` follows, with an AggregateException "One or more hosted services failed to start." when there are several. Docs: "`StartAsync` should be limited to short running tasks because hosted services are run sequentially, and no further services are started until `StartAsync` runs to completion."

My inference: if `StopAsync` is called after a partial start (`_hostStarting == true`), it calls StopAsync on all registered services in reverse, including those whose StartAsync never ran.

**8d. `BackgroundServiceExceptionBehavior`.** Verified: "By default, the host is stopped when an unhandled exception is encountered." (since .NET 6) (https://learn.microsoft.com/en-us/dotnet/core/compatibility/core-libraries/6.0/hosting-exception-handling). Code default: `BackgroundServiceExceptionBehavior.StopHost`. Opt-out: `Ignore`.

**Inference for our design:** A cancel signal plus a deadline does not make the host abandon awaited work. Anything that must truly be bounded needs a race and explicit "still pending" accounting, which is what OpenClaw does.

---

## 9. IntelliJ Platform Disposer

**9a. Disposal order.** Docs, verified: "The tree of `Disposable` objects ensures the `Disposer` releases children of a parent first." (https://plugins.jetbrains.com/docs/intellij/disposers.html). The docs do not state the order between siblings.

Code, verified: ObjectNode.java `ListNodeChildren.removeChildrenIf` iterates `for (int i = myChildren.size() - 1; i >= 0; i--)`, which is reverse registration order. Once a node has more than `REASONABLY_BIG = 500` children, it switches to `MapNodeChildren`, a `Reference2ObjectLinkedOpenHashMap` whose iterator runs in insertion order.

My inference: sibling LIFO is an implementation detail and is not guaranteed past 500 children. ObjectTree comment: "dispose in post-order (bottom-up)". `beforeTreeDispose` runs pre-order.

**9b. A child's `dispose()` throws.** Verified. In `disposeStrandedList`, each `disposable.dispose()` has its own try/catch that adds to `exceptions`. Then `handleExceptions` calls `getLogger().error(exception)` for each, including control-flow exceptions ("CE must not be thrown from a dispose() implementation"). Nothing is rethrown.

**9c. Register to a disposed parent.** Verified. Disposer.register javadoc: "If {@code parent} is already disposed, {@link IncorrectOperationException} is thrown. Before throwing, any subtree that {@code child}'s constructor may have attached to the disposer tree ... is detached and its {@code dispose()} is invoked". Throws also cover "if {@code parent} is being disposed or already disposed". `tryRegister` returns `boolean` ("@return whether the registration succeeded"). `register` returns `void`. The tree removal runs under a lock first: "first, atomically remove disposables from the tree to avoid "register during dispose" race conditions".

**9d. `isDisposed`.** Verified that `Disposer.isDisposed` is `@Deprecated`: "This method relies on relatively short-living diagnostic information which is cleared ... Thus, it's not wise to rely on this method in your production-grade code." Suggested instead: an own flag or `Disposer.newCheckedDisposable()`.

**Inference for our design:** Detach atomically, then dispose children first with per-item catch and an aggregated log. Registering on a dead parent should fail loudly and also clean up whatever was eagerly attached. Liveness should be an owned flag, not a lookup in a global registry.

---

## 10. OpenClaw `src/plugins/plugin-instance.ts`

**No changes after c3425e1d.** Verified. `diff` of the file at `c3425e1d` and at HEAD `01e328528a48eb8c18abeed66d12992500feacef` is identical. The companion `plugin-instance-disposal.ts` is also identical. The last commit touching the file is `a3e4005ebc5a` (2026-10-01T08:38Z), which predates c3425e1d (13:25Z). After c3425e1d, `src/plugins` was touched only by `43873ce187b1` (bundled-compat.ts, package-compat.ts) and `7308847c1709` (a test-support file).

Verified facts at both SHAs:
- `const SHUTDOWN_TIMEOUT_MS = 5_000;`
- **Reverse order:** `for (const [cleanup, kind] of Array.from(this.cleanups).toReversed())`. Plugin cleanups run sequentially in reverse. `"module"` cleanups are deferred to `finishDisposal`, after the timed-out calls settle.
- **One shared deadline across all plugin cleanups:** `const deadline = Date.now() + SHUTDOWN_TIMEOUT_MS;`. Each cleanup is raced: `Promise.race([runCleanup(cleanup), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(\`Plugin ${this.pluginId} cleanup did not settle\`)), Math.max(0, deadline - Date.now())) })])`. Failures go into `failures.push(error)` and the loop continues.
- **Errors are collected:** `throw new AggregateError(terminalFailures, \`Plugin ${this.pluginId} cleanup failed\`)` on the `settled` promise, plus `log.warn(...)`. `DisposalFailures` separates host-cleanup errors from instance errors.
- **Waiting for in-flight calls:** `waitForCalls` has its own 5 s deadline ("still has active calls after ${SHUTDOWN_TIMEOUT_MS}ms"). After a timeout, `trackTimedOutCalls()` keeps a `remaining` set, and `finishDisposal` waits on `await this.timedOutCalls?.settled.promise;` with the comment "Logical expiry revokes results; it cannot delete code still used by the original calls."
- **Outer forced retirement:** a 5 s timer on the disposal promise resolves with `PluginInstanceDrainTimeoutError("... forced retirement after 5000ms ...; resource cleanup remains pending.")`. The physical cleanup keeps running.
- **Registration after retirement throws:** `addCleanup` throws `Plugin ${id} is retiring`. It returns an unregister function.

My inference: `cleanups` is a `Map` keyed by the function, so registering the same function twice collapses to one entry that keeps its first position.

**Inference for our design:** OpenClaw's model is reverse order, a shared deadline, per-callback race, collected errors and continuing after failures. On timeout it separates "logically retired" from "physically cleaned", which is the strongest version seen here.

---

## Could NOT verify / caveats
- React: I did not run code to confirm the production behavior when `useEffect(async…)` stores a Promise as `destroy`. That claim is inferred from the code.
- Svelte: I inferred from code, without running it, that an unbounded teardown error aborts the rest of `destroy_effect` and its siblings.
- Flutter: the version label on api.flutter.dev pages was not retrievable (the fetch showed "0.0.0"). I pinned to the master source SHA instead. I did not identify a Flutter stable tag.
- Riverpod: whats_new contradicts concepts2/retry and the source on retry limits and error classes. I report the source plus the concepts page as authoritative.
- NestJS: the failed-init teardown is in main only. I did not find a release containing #17966 as of 2026-10-01. No timeout exists, but I based that on a grep of the named files, not on a whole-repo audit.
- Spring: I did not fetch the 7.0.x reference manual page. The values come from source and javadoc at v7.0.9.
- .NET: the `HostOptions.ShutdownTimeout` API page does not state the default. The default comes from source and the ASP.NET Core hosted-services doc. Partial-start StopAsync behavior is inferred from code.
- IntelliJ: the docs page does not specify sibling order or register-to-disposed-parent behavior. Those come from source only.
