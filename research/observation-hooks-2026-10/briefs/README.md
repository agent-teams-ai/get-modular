# Observation track: execution briefs (plan index)

Status: planned, not started. Written 2026-10-08 against get-modular `main`
`9e09e90`. Every brief starts with "Re-verify before start"; `main` moves within
days. Any ambiguity in a brief: stop and ask.

The research behind the track is this directory's [README](../README.md),
[design.md](../design.md), [errata.md](../errata.md) and
[sketch-v4-known-defects.md](../sketch-v4-known-defects.md). Where they differ
from these briefs, the briefs and the owner decisions below win.

| File | What |
| --- | --- |
| [OBS-1-adr.md](OBS-1-adr.md) | the admitting ADR (full text) and the resolution of OD-007 |
| [OBS-2-package.md](OBS-2-package.md) | the package, its tests, leaf admission, gates, CI, README, changeset and the REL-2 amendment |
| [OBS-3-standard.md](OBS-3-standard.md) | the configuration rule and a compiled example in the Consumer Module Standard |
| OBS-T (modularity-host-test) | the bounded TEST experiment on the release archives, written there before REL-2 (section 6) |

## 1. Verified state of `main` (9e09e90)

- OD-007 is open and not a publication blocker
  (`docs/traceability/module-system-v1.yaml`: `implementationBlockers: [OD-007]`,
  `publicationBlockers: []`).
- `@get-modular/resources` (ADR-0030) and `@get-modular/conformance`
  (ADR-0033) are on `main` at `0.0.0`; the 0.3.0 train release plan
  (`research/releases/0.3.0-train/release-plan.md`) releases them as 0.1.0.
  Neither is published yet.
- Leaf admission is table-driven (`architecture/checks/leaf-packages.mjs`). A
  public row may declare peers, and only on Core, Assembly or an earlier public
  row (`peerProblem`). Conformance is the precedent for a peer on resources
  (PR #141).
- The resources API differs from sketch v4: `CleanupContext` is `{ escalate }`,
  the closed code is `resources.scope.closed`, `scoped(name, factory)` takes the
  run scope from Assembly's `run({ signal, scope })`
  ([drift table](../sketch-v4-known-defects.md#drift-against-the-resources-package-on-main)).
- Train 2 (`research/contract-evolution-2026-10/`, Core and Assembly 0.4.0)
  lists observation as out of scope, takes "the next free" ADR number, starts
  after train 1 is released, and its REL-2 brief stops on any changeset it does
  not list.
- CI: 30 lane jobs (five lanes, three systems, Node 24 and 26) with a 15-minute
  limit; train 2 stops above 810 s per lane.

## 2. Owner decisions (facts)

1. 2026-10-01: a Get Modular package (`@get-modular/observation`),
   library-first; one hub per event family with opaque, data-only participants
   and a module-owned subscription as an escape hatch; modules stay factories,
   not classes; TEST first, no production consumer in the same delivery (an
   explicit exception); public `0.x` from the first release.
2. 2026-10-08: OD-007 is not a publication blocker (ADR-0017).
3. 2026-10-08: the track runs in parallel with train 2, after train 1 is
   released. ADR, package and tests come first; the Consumer Module Standard rule
   and the TEST consumer come after train 2's T2-5; 0.1.0 is released with
   REL-2.
4. 2026-10-08: `@get-modular/resources` is a declared peer, not a structural
   port.
5. 2026-10-08: 0.1.0 contains `sync`, `derived` and the escape hatch.
6. 2026-10-09: train 2 does not wait for observation. If OBS-2 is not on
   `main` when REL-2 opens, or OBS-T fails on the REL-2 archives, REL-2 ships
   without observation, and observation 0.1.0 follows in its own release pull
   request as soon as it is ready.
7. 2026-10-09: the owner delegates the track to the planning side. It
   prepares OBS-1 and approves the ADR text after an independent review; OBS-2
   and OBS-3 are implemented by a separate implementer and reviewed
   independently; the planning side merges each PR after that review and green
   CI and signs off OBS-T. Only points that the planning side cannot settle
   with confidence go to the owner.

## 3. Decisions taken by this plan (reliability / confidence out of 10)

| # | Decision | Why | R / C |
| --- | --- | --- | --- |
| P1 | A throwing listener on the derivation's `AbortSignal` is not isolated; the README and ADR say so | the platform reports listener exceptions as uncaught; isolating them would need a non-native signal that `fetch` and other APIs do not accept | 8 / 8 |
| P2 | The package keeps two schedulers by contract (later-task delivery, one task of grace after escalation) and the ADR states why | deferred, non-reentrant delivery is the contract; resources keeps its "no timers" rule | 8 / 8 |
| P3 | New code `observation.derivation.invalid-revision` for non-integer revisions | a silent ignore would hide a caller bug; `NaN` disabled the stale check in sketch v4 | 8 / 8 |
| P4 | Optional keys are rejected at the type level with `V extends Values & { [K in keyof V]-?: V[K] }`, verified on both compilers before landing | the runtime already rejects them; the type should not accept what the runtime refuses | 7 / 7 |
| P5 | Tests live in the package (`packages/observation/tests`), as for conformance | the package declares its peer, so resources is importable from its tests | 8 / 9 |
| P6 | The leaf row comes after conformance and peers only on resources | the peer rule needs resources earlier; Core and Assembly are not imported | 9 / 9 |
| P7 | OBS-2 amends the REL-2 brief in the same PR | the PR that adds the changeset explains it; REL-2 stops otherwise | 8 / 8 |
| P8 | The standard's rule waits for T2-5 | consumers then review one revised standard instead of two | 8 / 8 |
| P9 | One brief per PR, as in train 2 | same review and stop discipline | 9 / 9 |
| P10 | OBS-1 resolves OD-007; its remaining acceptance criteria move to OBS-3 (before REL-2 opens) and OBS-T (before REL-2 merges); a failed OBS-T stops the release of those archives, the fix lands on `main` and OBS-T runs again; a successor ADR only if the decision changes | follows owner decision 3; an accepted ADR cannot be edited afterwards, so it must not promise more than the plan | 8 / 8 |
| P11 | The hub reports participant failures as `observation.participant.callback-failed` with the participant id and the original cause | the ADR promises coded errors; sketch v4 reported a plain `Error` | 8 / 8 |
| P12 | OBS-1 merges only while no release PR is open | `accepted-decisions.json` is a release input; merging during REL-1 would force its regeneration | 9 / 8 |
| P13 | Malformed arguments throw `observation.argument.invalid` (C15), as resources does with `resources.argument.invalid` | the ADR promises a code for every error the package throws; sketch v4 threw plain `TypeError`s for null inputs | 8 / 8 |

## 4. PR set, dependencies and size

| PR | Needs | Size (approx.) | Days |
| --- | --- | --- | --- |
| OBS-0 `docs(research): add the observation execution briefs` (this directory) | nothing | ~900 lines Markdown | 0.5 |
| OBS-1 `docs(architecture): accept ADR-NNNN for module change observation` | owner approval of the ADR text | ADR ~230 lines, registry, index, checkpoint pin, OD-007 resolution | 0.5 + owner |
| OBS-2 `feat(observation): add @get-modular/observation` | OBS-1 merged, train 1 released, REL-2 not open | src ~650-800, tests ~900-1,300, config ~250-400, README ~200 | 3-4 |
| OBS-3 `docs(architecture): add the settings and change observation rule to the consumer standard` | OBS-2 and T2-5 merged | docs ~80, test ~15 | 0.5-1 |
| OBS-T (modularity-host-test) | REL-2 final head and archives | 300-450 / 550-850 / 100-150 | 1.5-2 |

If observation is not ready in time, train 2 does not wait (owner decision 6).

Order: OBS-0 -> OBS-1 (any time) -> train 1 released -> OBS-2 (parallel to
T2-2..T2-4) -> T2-5 -> OBS-3 -> REL-2 opens with observation -> OBS-T and
train 2's TEST-2/AR-3 on the REL-2 archives -> the owner merges REL-2 -> the
owner publishes, observation last.

## 5. Coordination with train 2

- **ADR number.** Both tracks take the next free number; the PR created first
  owns it.
- **Shared gate files.** OBS-2 and T2-4 both touch `package.json` scripts,
  `.github/workflows/ci.yml`, `tests/ci-check-lanes.test.mjs` and
  `tests/node-runtime-compatibility.test.mjs`. The PR that lands second rebases
  and re-runs every gate; nobody drops the other's edits.
- **REL-2.** OBS-2 amends `briefs/REL-2-release.md` (titles, owner decisions,
  re-verify 1, 3 and 4, build, paths, pack and manifest checks, PR body,
  merge condition with OBS-T, the no-observation fallback) and the train 2
  README (section 3.1, item 9). If a train 2 PR has those files open,
  coordinate with its author instead.
- **Consumer pins.** Train 2's AR-3 and TEST-2 move consumer pins to the T2-5
  commit. If OBS-3 lands before they start, point them at OBS-3's merge commit
  so consumers review the standard once.
- **Conformance.** Conformance does not gain observation suites in 0.2.0. A
  later conformance minor may add them; not in this track.

## 6. OBS-T scope (TEST consumer, written in modularity-host-test)

The planning side writes OBS-T in `agent-teams-ai/modularity-host-test` before
REL-2 starts, from [design.md](../design.md) section "One bounded TEST
experiment", with these changes:

- run against the REL-2 archives of Core, Assembly, resources, conformance and
  observation, never against the sketch stand-in;
- use the TEST fixtures with the fixes of [errata.md](../errata.md): the rate
  adapter queues every waiter and checks own keys; participants copy or freeze
  port results they keep; the greeter picks the honorific by locale;
- Host wiring follows the Consumer Module Standard after OBS-3;
- a failure takes observation out of REL-2 (owner decision 6): the
  observation changeset leaves `main` by a separate PR, REL-2 is regenerated
  and released without it, and observation follows in its own release pull
  request after the fix and a new OBS-T run on its own archives.

## 7. Risks and global stop rules

| Risk | Mitigation / stop |
| --- | --- |
| The package lands on unreleased train 1 | hard stop in OBS-2 |
| REL-2 opens before OBS-2 lands | OBS-2 waits until REL-2 is merged, then lands without the REL-2 amendment; observation gets its own release pull request (owner decision 6) |
| The type rule for optional keys fails on one compiler | stop with measurements; no partial rule |
| A shared gate file conflicts with train 2 | rebase and re-run gates; never drop edits |
| A lane exceeds 810 s | stop and report |
| The TEST experiment fails | the observation release stops; the design returns to review |
| A gate is in the way | never weaken it; stop |

## 8. Independent review of these briefs (2026-10-08) and its disposition

| Finding | Disposition |
| --- | --- |
| P1 the edge list of OBS-2 missed `hub -> isolation` (`Report` type) | applied: edges for `hub`, `composition` and `index` listed; the test development boundary named |
| P1 OD-007 resolved against its own acceptance criteria | applied: P10; the resolution text and the ADR state where the criteria moved and what a failed OBS-T means |
| P2 the system boundary words drain, fencing and readiness | applied: ADR "Mechanism and authority" reads each of them |
| P2 no Trust section | applied |
| P2 the public types were not listed | applied: the ADR lists every exported type |
| P2 test boundary allowed resources only for `hub` | applied: the development boundary allows resources and the test built-ins |
| P2 REL-2 amendment incomplete | applied: owner decisions line, OBS-3 precondition, PR body, merge condition, fallback |
| P2 OBS-1 during an open release PR | applied: P12 |
| P2 the standard's example skipped `declareModule`/`ModuleFactory` and the Host wiring | applied in two rounds: the module and the hub are typed `ModuleFactory`s (the hub returns `{ instance, capabilities: {} }`), the hub is a profile root bound with `scoped(implementationId, ...)`, participant ids come from the plan binding's `providerImplementationIds`; the example type-checks on TypeScript 7.0.2 and 5.8.3 against Core, Assembly and resources on `main` with stub observation types |
| P3 precedents, callback wording, coded reports, C3 test target, model-test invariant after `seal`, C6 `defineProperty`, the exact sketch checks to port, #141 test files, Node 26 pack destination, builds before the example test, `shasum`, the review `rg`, registry order | all applied (C13, C14, OBS-1 re-verify 7) |
| Re-review: the ADR promised "no release and a successor ADR" on any OBS-T failure | applied: a failure stops those archives; fix on `main` and run again; successor only if the decision changes |
| Re-review: the no-observation fallback broke REL-2's own path checks | applied: the fallback switches the observation items off and records the owner decision |
| Re-review P3: REL-2 pin line and "Done", ADR-0023/0029 in OBS-1, exact test built-ins, G-7, attempt-scope shutdown wording | all applied |
| ADR review (2026-10-09, before acceptance): "the only exception" next to a second exception, and `TypeError`s without a code for malformed arguments | applied: both exceptions named; C15 and P13 add `observation.argument.invalid` |
| ADR review P2: the demonstrated-need sentence, `derive` under "each callback runs isolated", invariance of every record type, the release sentence without owner decision 6, "library call by the holder" excluding the escape hatch | all applied in the ADR text of OBS-1 and PR #154 |
| ADR review P3: "rejected as foreign", a running derivation after `seal`, "subscribes on its behalf", where the split is recorded, the Changesets version, the `recordDesired` name | all applied |

Verified by the review: the C9 type rule rejects optional keys and accepts
`T | undefined` keys and interfaces on TypeScript 7.0.2 and 5.8.3 (with and
without `exactOptionalPropertyTypes`); `mock.timers` with `tick(0)` runs nested
`setImmediate` and `runAll()` throws; a throwing abort listener gives exactly
one uncaught exception on Node 24 and 26; deep test imports of `dist` files
work and the export map blocks them from the archive; the C3 fix matches the
resources implementation; the governance steps for resolving OD-007 match
`validateDecisionResolutions`.
