# Research round 4, topic B: reactive primitives and interop

Independent researcher, xhigh, read-only (2026-10-01). Returned in the agent's final
message; saved by root. Probes: scratchpad `rb/exp/` (Node 26.9, tsc7).

**Verdict:** no interop in v1 of the package. The core decisions are confirmed by
others' practice: deferred delivery, coalescing, isolation, `initial` + `since`
instead of a synchronous first call. Two v3 defects and one documentation gap.

## TC39 Signals (verified)

Stage 1 (`tc39/proposals@849adcde` `stage-1-proposals.md:92`; README
`proposal-signals@9124ed91` ":4 Stage 1", ":16 significant early prototyping ...
before advancing beyond Stage 1"). Effects are deliberately excluded (":383 does
not include any built-in function like `effect` ... effect scheduling is subtle");
`Watcher.notify` runs synchronously inside `.set()` and "no Signal can be read or
written" there. `signal-polyfill` 0.2.2 (2025-01-17): "Do not use this in
production"; FAQ ":810 at least 2-3 years at an absolute minimum". Inference: do
not depend on or shape the API after it; a consumer adapter is ~10 lines
(`Signal.State` + `[Signal.subtle.watched]`/`unwatched` calling `observe`/`unsubscribe`).

## De-facto contracts (verified, pinned versions)

| System | First call | Delivery | Equality | Subscriber error |
| --- | --- | --- | --- | --- |
| Svelte store (`020242d6`) | synchronous, required | synchronous ("must later be synchronously called") | `safe_not_equal` (objects always changed) | not isolated; global queue stalls (#11555 open, #7618 not planned) |
| WICG Observable (CG draft 2025-11-21) | sync subscribe callback | synchronous | - | "report an exception" |
| RxJS 7.8.2 | BehaviorSubject sync | synchronous | `distinctUntilChanged` | caught then `reportUnhandledError` throws in `setTimeout` |
| useSyncExternalStore | none, `getSnapshot` | any time | `Object.is` | - |
| Zustand 5.0.15 | `fireImmediately` optional | sync `forEach` | `Object.is`/`equalityFn` | no try/catch |
| Jotai 3.0.1 | - | sync | - | all listeners run, then `AggregateError` to the writer |
| Valtio 2.3.2 | none | microtask | - | - |
| MobX 7.0.5 | `fireImmediately: false` | - | `equals` | caught, `console.error` |
| Preact signals-core 1.14.4 | effect, sync | end of batch | `!==` | all effects run, first error rethrown |
| Angular | - | "Effects always execute asynchronously" | `equal` | - |
| Effect 4.0.0 | current value first | `PubSub.unbounded({replay:1})`, no coalescing | - | - |

Observable: only Chrome 135 (MDN BCD `852a2f6f`); Node 26.9 `typeof Observable ===
"undefined"` (measured); TC39 Observable Stage 1; the WICG draft is "not a W3C
Standard nor is it on the W3C Standards Track".

## Competitor mistake -> our countermeasure

| Mistake (source) | Ours |
| --- | --- |
| Glitch on paths of different length (Svelte #10376) | by construction: no derived graph, one snapshot from one `values` |
| One subscriber error silences others (Svelte #11555/#7618; Jotai PR #2871; Zustand `vanilla.ts:79`) | per-registration isolation (see F2) |
| Subscriber error thrown to the writer (Jotai, Preact) | `commit` never sees it (delivery in another task) |
| Subscription leak (RxJS `shareReplay` refCount false; MobX "Always dispose of reactions") | scopes + `isAttached` check (F1 bypasses it) |
| Reentrancy (RxJS #7425; Redux 5.0.1 unsubscribe during dispatch "will not have any effect") | stricter than Redux (measured) |
| Lost value between read and subscribe (Zustand #475 -> `fireImmediately`; Angular `requireSync`; React rechecks snapshot after commit `ReactFiberHooks.js:1871-1875`) | atomic `initial` + `since` (same technique as React) |
| Stale async result | `latestDerivation` |
| Extra notifications from a new reference (Zustand v5 selector warning) | partial: A->B->A and an equal-content object both bump the revision (measured); **document it** |
| O(N) selectors per change (react-redux) | key index (measured on v1) |
| Unbounded buffer (Effect) | coalescing |
| `getSnapshot` returns a new object -> loop (react.dev) | `view.current()` stable, `reader.read()` not (measured); **recipe needed** |

## Findings on sketch v3

- **F1 (P2, 8/10, measured):** `keys` arrays are not copied (`keyed-source.ts:46,99,102`);
  mutating the caller's array after `observe` made `snapshot.keys` lie, `isAttached()`
  false while `listenerCount("a") = 1` and commits still visit it, so the hub's
  "still attached" check passes falsely (the v1 defect class). Fix:
  `Object.freeze([...new Set(keys)])` in `read`/`observe`.
- **F2 (P2, 7/10, measured):** a throwing reporter crashes Node (exit 1) via the
  async rethrow; contradicts the research fail condition. RxJS does the same on
  purpose, so it is a policy choice to make explicitly.
- **F3 (P3, 6/10):** `setTimeout(0)` clamps (Node delay < 1 -> 1; HTML nested
  timers >= 4 ms); React's scheduler prefers `setImmediate` in Node. The "later
  task" contract is right; the primitive is an implementation detail.

## Conclusions

(a) Interop worth it in v1: none. Do not claim Svelte-store compatibility
(synchronous delivery required). A `useSyncExternalStore` adapter (~15 lines) only
as a documented recipe with a TEST check when a UI consumer appears;
`getSnapshot` must be `view.current()`, never `reader.read()`.
(b) Confirmed: deferred delivery (Angular "signals never provide a synchronous
notification"), coalescing (Redux "should not expect to see all state changes"),
isolation (MobX), `initial` + `since` (React). Debatable: macrotask vs microtask
(starvation safety vs 1-4 ms latency); revisions vs value equality (cheap and
deterministic, but extra deliveries).
(c) Do not: depend on `signal-polyfill`; build Observable/operators; a generic core
`subscribe(cb)`; a computed graph; per-subscriber `equals`/selectors; pluggable
schedulers; throwing subscriber errors to `commit`; unbounded buffers.

## Top 5

1. Copy and freeze `keys` in `read`/`observe`, regression check F1. 🎯9 🛡️9
2. Choose the reporter-failure policy explicitly (fatal rethrow or Host fallback)
   and align the TEST criterion (F2). 🎯7 🛡️8
3. Document "revision != value change"; the feeder keeps identity of unchanged keys
   or diffs before `commit`; no `equals` in v1. 🎯8 🛡️8
4. No interop in v1; `useSyncExternalStore` recipe with a `view.current()`
   stability test when a UI consumer appears; no Svelte claim. 🎯8 🛡️8
5. Keep the "later task" contract; optionally `setImmediate` when available, else
   `setTimeout` (2 lines). 🎯6 🛡️7
