# Research round 4, topic A: configuration and feature-flag change propagation

Independent researcher, xhigh, read-only (2026-10-01). Returned in the agent's final
message; saved by root. Probes: scratchpad `research-r4/exp/probe.ts`,
`probe2.ts`; downloaded primary sources in `research-r4/src/`.

## Proven industry facts (pinned)

- **OpenFeature spec v0.9.0** (events): 5.2.5 "If a handler function terminates
  abnormally, other handler functions MUST run"; 5.3.3 late handlers run
  immediately only for status events; `PROVIDER_CONFIGURATION_CHANGED` carries
  only "flags changed (string[], optional)", no revision; 5.3.5 status updated
  before handlers; 5.3.4.2 reentrant reconcile -> latest wins. JS SDK `a792d4dd`:
  async-wrapped isolation, duplicate handlers allowed. Bugs: js-sdk#630 (hook
  promises not awaited), #1286 (value-only compare hid metadata changes), #1360
  (unbounded memory after unconditional Ready registration, fixed #1420), #700
  (5.3.3 not honoured); provider status redesigned repeatedly (spec#238
  "frequently neglect to properly set the providers status", spec#365 dual
  ownership races, swift-sdk#114 "fix!: move provider status tracking back to
  provider", js-sdk#1362 open); spec#346 no per-key subscription.
- **LaunchDarkly** js-core#840: after `identify(B)`, `change` events for A rolled
  values back; fixed by #867 "Discard events from closed connections" and #842
  `AsyncTaskQueue` (one active + one replaceable pending, "doesn't cancel tasks
  that it has started", `78e9a5e9`) - the same shape as our `latestDerivation`.
  Node `update` "does not necessarily mean the flag's value has changed"
  (`LDClient.ts:45-47`); js-core#1886 providers cannot report Stale/Error.
- **Unleash** node-sdk#209 (`ready` = backup read; `changed` fires "regardless of
  the state being exactly the same" -> new `synchronized` event), js-sdk#90
  (`ready` after `error`). **ConfigCat** `Hooks.ts:14-20` ready "is not
  guaranteed"; common-js#36 dispose during refresh re-armed a timer.
  **GrowthBook** #1841 readiness flag set before init; dedup by version equality
  without monotonicity (inference). **Flagsmith** #203 out-of-order responses
  overwrite newer data; #390 subscription leak.
- **.NET** change tokens: "can trigger multiple token callbacks for a single
  configuration file change" (AspNetCore.Docs `df9a510c` change-tokens.md:70;
  runtime#36045 open since 2020); #109445 `OnChange` fires for other sections
  (not planned); #119883 torn reads across monitors; #44381 failed validation
  drops `OnChange`; #112127 O(n) unsubscribe.
- **Spring Cloud** commons#1593 event before rebind; #1727 (open) in-place reset
  NPE under concurrency.
- **Kubernetes** (website `7a1c866f`): on `410 Gone` "clearing their local cache,
  performing a new get or list"; client-go v0.37.1: cached states are "a
  subsequence" (coalescing is normal); per-listener buffer grows "until we OOM".
  **etcd** v3.6: "Unique - an event will never appear on a watch twice",
  "Atomic ... will not be split", "Users are expected to verify the revision";
  compaction cancels the watch. **Consul** v1.22: an index can go backwards,
  otherwise a client "may ... miss future updates for an unbounded time".
- **Kotlin StateFlow** 1.11.0: required initial value, "a slow collector skips
  fast updates", `equals` conflation, "can never represent a failure";
  kotlinx.coroutines#3939 testing conflated flows "A very common pain point".

## New v3 defects (measured)

- **F1 P1 (9/10):** silent loss for an optional key: keys fixed from
  `Object.keys(initial)` (`keyed-source.ts:28,112-113`); `commit({ limit: 5 })` for
  `V = { limit?: number }` absent in `initial` returns 0, `read(["limit"])` gives
  `{}`; compiles under strict + exactOptionalPropertyTypes.
- **F2 P1 (8/10):** in-place mutation is invisible: only a shallow freeze
  (`keyed-source.ts:111`); `read(...).values.tags.list.push("b")` then
  `commit({ tags: sameRef })` -> no commit, no delivery, but reads already changed.
- **F3 P2 (7/10):** `since` is unchecked (`since: 999` accepted); a foreign revision
  can suppress updates indefinitely (the Consul failure).
- **F4 P2 (7/10):** `observe` after `seal` is accepted and attached (ConfigCat #36,
  OpenFeature js-sdk#1374 class).
- **P3 (document):** A->B->A in one task delivers the initial value with a new
  revision (`apply` must be idempotent); a throwing `apply` is not retried until
  the next commit (`hub.ts:30-31`).

## Competitor mistake -> our countermeasure

| Mistake | Ours | Status |
| --- | --- | --- |
| OF: no replay of config change, no revision | atomic `initial` + `since` | have |
| OF #630: hook Promise not awaited | `=> undefined` + thenable check | have |
| OF #1286: value-only compare | revision delivery | have |
| OF #1360, Flagsmith #390: listener accumulation | one subscription per participant | have |
| OF spec#238/#365: dual status ownership | one owner (Host `commit`), no status | have |
| LD #840, Flagsmith #203: stale response overwrites newer | monotonic revision, `admits`/`isCurrent` | have |
| Unleash #209, LD `update`, .NET #36045: phantom changes | no-op commit by `Object.is` | have |
| .NET #109445: unrelated section notifies | key index | have |
| .NET #119883, Spring #1593: notify before consistent state | values replaced before deferred delivery | have |
| client-go: unbounded buffer | coalescing dirty set | have |
| k8s 410 / etcd compaction | state, not log: any `since` gets the latest snapshot | have |
| StateFlow / Spring #1727: in-place mutation | shallow freeze only | **need (F2)** |
| Consul: backwards/foreign revision | unchecked `since` | **need (F3)** |
| ConfigCat #36, OF #1374: work after dispose | `observe` after `seal` | **need (F4)** |
| optional key (no competitor analogue found) | keys fixed from `initial` | **need (F1)** |

## Source status in v1?

No (inference from the proven facts): the source is synchronous and complete at
creation, so it has no NOT_READY; STALE/ERROR describe an external adapter's
health (product/Host); every studied system's `ready` semantics proved unstable;
StateFlow deliberately "can never represent a failure". The per-participant
`ParticipantOutcome` suffices; the health contract stays deferred.

## Testing

Assert final state and invariants, not delivery sequences (kotlinx#3939). Use
built-in `node:test` `mock.timers` (stable since v23.1.0) instead of an injected
scheduler. A seeded model-based test over random `commit`/`observe`/`unsubscribe`/
`seal` sequences with quiescent invariants: last delivered snapshot equals
`read(keys)`; revisions strictly increase; deliveries <= commits touching the keys;
none after `seal`/`unsubscribe`; `listenerCount` returns to baseline. Plus
regressions for F1-F4, A->B->A and a throwing `apply`.

## Add / do not / defer

Add (~25 lines): reject keys outside the declared set (explicit `undefined` for
optional keys); deep-freeze plain data on create/commit; validate `since`
(integer 0..current, preferably a `Snapshot` so the source is checked too);
`observe` after `seal` throws; document idempotent `apply`, coalescing, "delivery
is not a value change", no retry. Do not: status enum and READY/STALE events,
read hooks, evaluation context, debounce/rate limits, history log/replay, custom
`equals`, async callbacks, keeping subscriptions across source replacement.
Defer: health/staleness contract, resync or retry after a failed `apply`,
cross-source atomicity.

## Top 5

1. F1: reject unknown keys in `commit`; declare the key set explicitly. 🎯9 🛡️9
2. No status in v1; contract: "the source is ready at creation; adapter health is
   decided by the Host". 🎯8 🛡️8
3. F2: deep-freeze; contract "values are immutable plain data". 🎯8 🛡️8
4. Idempotent `apply` contract + model test with `mock.timers`. 🎯9 🛡️8
5. F3/F4: `since` bound to the source and validated; `observe` after `seal` forbidden. 🎯8 🛡️7
