# Final review of research revision 4 and sketch v4 (independent reviewer, xhigh, read-only)

Returned in the agent's final message; saved by root. Reproduced 22/22 on Node
26.9.0 and 24.18.0, TS 7.0.2 and 5.8.3 clean, `isolatedDeclarations` passing.
Probes: scratchpad `final-review-v4/src/probes/`.

Findings (all applied by root; v4 now 30/30 on both Node versions):

- G-1 P1: an already-aborted escalate raced idle drains (`hub.ts:55`), producing
  false `still-running` debts. Fix: lane `busy()`, drain records only for derived
  participants, one task of grace before reporting still-running.
- G-2 P2: escape-hatch lanes still hung (`price-table/index.ts:27`); fix: shared
  `closeAndDrain(escalate)` used by hub and recipe.
- G-3 P2: participant `apply` results were discarded; async apply escaped
  isolation (derived crashed the process). Fix: isolated participant callbacks,
  failed outcome on illegal return.
- G-4 P2: non-plain values (Date, Map, class instances) changed without commit;
  fix: reject with `observation.values.not-plain`; commit takes ownership and
  freezes plain data in place (documented); only the patch is walked.
- G-5 P2: `since` without keys could lose a change; fix: `SnapshotRef.keys` must
  cover the observed keys.
- G-6 P2: diagnostics vs TEST plan; fix: invariants in package tests, counting
  port wrapper in TEST, no public diagnostics.
- G-7 P3: duplicates/forged participants validated after subscribing; fixed
  (validate before any setup).
- G-8 P3: hostile `then` escaped isolation; fixed (guarded).
- G-9 P3: Node 26.9 is outside the GM range (>=26.10); recorded.
- G-10 P3: `mock.timers.runAll()` throws with pending `setImmediate`; test plan
  uses `tick(0)`.
- G-11 P3: "Proven" overclaim for unstable `ready`; relabelled.
- G-12 P3: error-code scheme fixed and deferred at once; marked provisional.
- G-13 P3: module-level WeakMap breaks with two package copies; single-copy
  requirement recorded.

Overengineering removed: `isAttached` and its error code, drain records for sync
participants, `in out` on `View`/`Observation`.

Verified correct: run counts, type-level invariance and negative fixtures, unknown
keys, since checks, seal, key copy, ScopeClosedError passthrough, forged
participant rejection, escalate debt naming the participant, reporter policy,
GM file references, AGENTS.md lines, resources design hash, competitor issue
numbers, owner decisions 1-6, Minimal API matches code signatures.
