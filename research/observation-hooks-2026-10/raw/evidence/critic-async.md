## 1. Verdict

**Inference:** Retain the explicit, consumer-owned port recommendation; the research does not justify a shared async hook driver. Its stale-result fence, bounded pending input and separation of six events are sound, but cancellation, non-settlement and callback failure need sharper contracts. These are specification gaps, not demonstrated runtime defects or substantiated P1 findings. Internet evidence was indirect through root-supplied packets; all 49 non-metadata inputs matched `input-hashes.json`, and no independent browsing, writes, Git actions, builds, tests or runtime flows occurred.

## 2. Confirmed defects of the research

### ASY-1 — P2 — Conditional TEST experiment: convergence lacks a settlement condition

**Proven (packet quote):** `research-under-review.md` specifies “one computation … with one latest pending configuration” and evidence that it “converges to the latest snapshot.” Conversely, `consumer-module-standard__common-assembly.md`, **Outcomes and ownership transfer**, states: “An uncooperative pending factory can keep run pending.”

**Inference:** Bounded pending input does not establish progress. If the active computation never settles, the latest input never runs. Racing a deadline and starting another computation would violate the stated single-computation guarantee unless the old work actually ended.

**Exact correction:**

> The lane bounds pending inputs, not computation duration. Convergence assumes the active computation settles and notifications receive execution time. An observation deadline reports pending work; it neither settles the computation nor permits a second concurrent run. Cooperative cancellation may request termination, but actual settlement remains separately observed.

For synchronous derivation, omit this machinery entirely.

### ASY-2 — P2 — Conditional TEST experiment: `stop()` lacks a precise postcondition

**Proven (packet quote):** `research-under-review.md` offers a handle containing “`snapshot()` and `stop()`,” requires publication to compare “instance admission,” and says subscription cleanup owns stopping. It does not specify queued notification behavior or stopping a registration while its instance remains active.

**Inference:** Instance admission alone cannot distinguish a stopped observation from an active one. Unsubscription also need not retract an already queued notification or cancel a computation started earlier.

**Exact correction:**

> `stop()` is idempotent and synchronously closes this registration’s update admission before detachment. Queued notifications cannot start computation afterward. Clear pending input and invalidate the active run’s publication authority. Observe its eventual fulfillment or rejection without publishing. Stopping observation does not assert cancellation, raw-work settlement or physical cleanup completion.

The deferred-delivery requirement already addresses callbacks arriving before the module stores its handle: store the returned handle synchronously before yielding. Do not add an early-callback buffer to accommodate a source that violates the selected contract.

### ASY-3 — P2 — Conditional TEST experiment: failure handling covers computation but underspecifies notification delivery and replay

**Proven (packet quote):** `research-under-review.md` says “Failed computation retains its cause” and “independent consumers may continue.” It does not define source dispatch when a subscriber throws, duplicate-revision handling, or whether notification callbacks may return Promises.

`root-verified-online/topic-b-async-errors.md`, **§2c**, distinguishes Vue runtime-core’s per-callback error handling from standalone reactivity’s direct cleanup loop. **§6a** similarly distinguishes Nest’s initialization `Promise.all` from teardown `Promise.allSettled`.

**Inference:** Serial execution does not itself isolate exceptions. Duplicate invalidations can accidentally retry a failed revision, and a TypeScript `void` callback can accept an async function without specifying whether its Promise is awaited.

**Exact correction:**

> Notification callbacks synchronously record desired input; they do not perform asynchronous derivation. Isolate subscriber exceptions and report them to the existing owner without preventing independent delivery. Define duplicate revision handling explicitly; duplicates must not silently retry failed work. Associate computation failures with their source, revision and attempt. Preserve the previous applied value and applied revision on failure. Retained historical failures must not downgrade a subsequently successful current result.

If asynchronous notification callbacks become necessary, introduce a separately named/versioned contract with explicit awaiting, cancellation and error semantics.

## 3. Claims checked and found correct

**Proven (packet quote), with the stated limits:**

- **React:** `topic-b-async-errors.md` **§1** confirms cleanup before replacement setup, the `ignore` flag example, and “one extra development-only setup+cleanup cycle.” The research correctly avoids treating rehearsal as safe replay of irreversible effects. React invokes cleanup without awaiting its return; suppression of publication does not establish cancellation.
- **Vue:** **§2** confirms synchronous `onWatcherCleanup` registration before `await`, while callback-provided `onCleanup` is “not subject to the synchronous constraint.” Async-created watchers require manual stopping. This does not prove that registration after the watcher has stopped will execute cleanup.
- **Svelte:** **§3** confirms synchronous dependency tracking and that async `onMount` cannot return the recognized cleanup function. Teardown is not awaited.
- **Flutter:** **§4** confirms terminal, void `dispose`, and synchronous `setState` callbacks. The research correctly says `mounted` cannot prove request freshness.
- **Riverpod:** **§5** confirms `ref.mounted` includes current-ref identity, `onDispose` uses synchronous callbacks, and obsolete future results are ignored. Current source-backed retry defaults are bounded; the packet flags contradictory “retry until success” prose. The synthesis makes no incorrect Riverpod retry claim.
- **Nest:** **§6** confirms fail-fast initialization within a hierarchy level and collected/logged teardown rejections. Failed-init teardown fixes on current main must not be represented as released behavior.
- **Spring:** **§7** and the retained `DefaultLifecycleProcessor.java` confirm the research’s correction to **10 seconds since 6.2**. A phase timeout logs remaining beans and proceeds; it does not prove release.
- **.NET:** **§8** supports cooperative `ShutdownTimeout`. Distinguish awaiting service `StopAsync` tasks from awaiting every underlying operation: `topic-a-opt-in-evolution.md` **§1.7** records that `BackgroundService.StopAsync` can return while execution remains pending.
- **OpenClaw:** Retained `openclaw_openclaw__src__plugins__plugin-instance.ts` says, “Logical expiry revokes results; it cannot delete code still used by the original calls.” The synthesis correctly distinguishes earlier plugin cleanup from final module disposal waiting for timed-out calls.

**Inference:** The experiment’s atomic registration plus initial view, deferred delivery, settings-only coalescing, one active computation, one pending input, distinct desired/applied revisions and comparison against the current source snapshot form a coherent local contract. Monotonic relevant revisions prevent an old A result from passing an A→B→A freshness check. Excluding source-writing callbacks and self-notification awaits is appropriate for this bounded slice.

## 4. Lane answer to the main question

**Inference — lay down now:**

- Keep existing factories and nonparticipating modules unchanged. No subscription, callback discovery, extra scheduling or dummy lifecycle method occurs without explicit participation.
- Add a consumer-owned settings port only when a concrete module needs changing settings. Keep derivation synchronous when sufficient.
- Document the small async contract where needed: registration lifetime, revision identity, publication fencing, duplicate handling, failure retention and non-settlement limits.
- Keep **settings change, dependency replacement, dependency unavailability, module-owned state change, readiness and cleanup** separate. Settings freshness cannot substitute for binding or health epochs.
- For a future resourceful continuation, recheck relevant binding/health authority after awaits and immediately before mediated effects. Loss followed by recovery must not restore an old run merely because current availability is true.
- Preserve owner-local custody before resourceful callbacks, including partial setup and late success. Children borrow parent ports; release responsibility remains with the owner.

**Inference — compatibility rule:** Introduce each future hook as a separately selected capability or registration API. Adding required members to shared module/factory interfaces can break hundreds of implementations and fixtures. Extending an exhaustively handled event union can also break consumers. Changing existing callback awaiting, ordering, retry or coalescing semantics requires explicit versioning; adding an optional member alone does not make those behavioral changes compatible.

**Do not add now:** a universal lifecycle context, global scheduler, service bag, generic change callback, reactive engine or resourceful async driver. The actual Assembly factory surface remains its closed dependency record and frozen `{ signal }` context.

## 5. Minimal API elements recommended from this lane

**Proposal, not existing exports — one consumer-local settings contract:**

```ts
type SettingsViewV1 = Readonly<{
  source: object;
  relevantRevision: number;
  value: Readonly<LookupSettings>;
}>;

interface SettingsPortV1 {
  watchSettings(
    keys: readonly LookupSettingKey[],
    recordDesired: (view: SettingsViewV1) => undefined,
  ): {
    readonly initial: SettingsViewV1;
    snapshot(): SettingsViewV1;
    stop(): void;
  };
}
```

**Inference:** Returning `undefined` deliberately excludes ordinary async callbacks more clearly than `void`. Registration and initial capture are atomic; delivery begins after return. Publication validates registration/instance admission and the current relevant revision, then commits inert state synchronously without an intervening user callback.

The consumer’s private async attempt retains its input, cause and raw settlement. It does not create another resource ledger. Future async callback semantics should use another explicit surface and compatibility identity, not silently widen this one.

## 6. Proven practice versus hypothesis

| Classification | Evidence or proposal | Limit |
| --- | --- | --- |
| **Proven (packet quote)** | React: “network responses may arrive in a different order”; cleanup sets `ignore`. `topic-b`, §1c. | Prevents stale publication; does not undo external effects. |
| **Proven (packet quote)** | Vue: callback-bound cleanup is “not subject to the synchronous constraint.” `topic-b`, §2a. | Explicit ownership survives an async gap; late-registration safety is separate. |
| **Proven (packet quote)** | .NET selects `IHostedLifecycleService` with an `is` check. `topic-a`, §1.5. | Existing services retain their original interface. |
| **Proven (packet quote)** | Async overload addition can “silently bind to a different overload.” `topic-a`, §1.4. | Compilation success does not prove semantic compatibility. |
| **Inference** | A local revision fence plus one pending settings input is sufficient for this inert async slice. | Requires settlement for convergence and explicit error/stop rules. |
| **Hypothesis** | Repeated consumers will eventually justify extracting a selected-change driver. | Neither module count nor these packets proves that need. |

## 7. Conflicts with the resource plan snapshot

**Inference:** None in the current scope. The snapshot explicitly says, “Later runtime acquisition/registration is excluded.” The hooks synthesis confines its experiment to inert derivation and defers resourceful updates.

Register the subscription during the existing construction slice and retain its stop action with its owner. Future resourceful hooks would require separate scope; they cannot be implemented by casually calling construction-only setup on every settings notification. The hooks research does not block the resource contract.

## 8. Ranking

**Inference:** No disagreement with the research’s ranking: explicit ports first, optional local driver only after repeated need, and Effect only within an already Effect-based Host. No alternate scoring or LOC estimates are warranted from this lane.

## 9. One bounded TEST experiment refinement

**Future check, not executed:** Extend the existing stale-result experiment with one real in-process settings source, two consumers and externally readable derived state.

Hold consumer A’s derivation. Commit B, then A again at a newer relevant revision before deferred delivery. Release the old computation: its A-valued result must still be rejected as stale. Allow the current computation to settle. Hold another run, call registration `stop()`, and commit newer settings; its eventual result must never publish. Exercise fulfillment and rejection through controlled settlement gates around the actual derivation.

A bounded observation while the run is held must report pending work without declaring settlement. The independent consumer must continue progressing.

Fail on obsolete/stopped publication, new computation after stop, lost original failure, incorrect applied revision or blocked peer progress. This refines observable source/consumer behavior; it requires no provider flow, resourceful extension or duplicated scenarios across layers.

## 10. Remaining limitations and exact missing primary sources

**Inference:** No implementation or behavioral execution was performed. Hashes establish retained-byte identity, not independent authentication or framework qualification. Accepted ADR bytes remain immutable; G1 stays **hold**, K1 stays pending, and TEST never qualifies production.

Remaining evidence questions:

- [Vue watch source](https://github.com/vuejs/core/blob/4ab865a848a1da3d10fb674f857e5fff13094644/packages/reactivity/src/watch.ts): obtain a primary regression test for callback-bound cleanup registered **after stop or invalidation**; registration syntax alone is insufficient.
- [Flutter framework source](https://github.com/flutter/flutter/blob/16bf22f3923acb85b1a780496c1f834b29ce6142/packages/flutter/lib/src/widgets/framework.dart): identify the corresponding stable release before making stable-version exception guarantees.
- [Nest failed-init teardown PR](https://github.com/nestjs/nest/pull/17966): identify a released artifact containing the fix before treating it as released behavior.

No model, effort or tier override was attempted; effective backend settings were not independently attested. Review elapsed approximately **3 minutes 47 seconds**.
