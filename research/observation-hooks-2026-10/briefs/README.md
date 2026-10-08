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

## 4. PR set, dependencies and size

| PR | Needs | Size (approx.) | Days |
| --- | --- | --- | --- |
| OBS-0 `docs(research): add the observation execution briefs` (this directory) | nothing | ~900 lines Markdown | 0.5 |
| OBS-1 `docs(architecture): accept ADR-NNNN for module change observation` | owner approval of the ADR text | ADR ~230 lines, registry, index, checkpoint pin, OD-007 resolution | 0.5 + owner |
| OBS-2 `feat(observation): add @get-modular/observation` | OBS-1 merged, train 1 released, REL-2 not open | src ~650-800, tests ~900-1,300, config ~250-400, README ~200 | 3-4 |
| OBS-3 `docs(architecture): add the settings and change observation rule to the consumer standard` | OBS-2 and T2-5 merged | docs ~80, test ~15 | 0.5-1 |
| OBS-T (modularity-host-test) | REL-2 final head and archives | 300-450 / 550-850 / 100-150 | 1.5-2 |

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
- **REL-2.** OBS-2 amends `briefs/REL-2-release.md` and the train 2 README
  (section 3.1, item 9). If a train 2 PR has those files open, coordinate with
  its author instead.
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
- any failure stops REL-2's observation part and returns the design to review;
  Core, Assembly, resources and conformance may still be released without it if
  the owner decides so.

## 7. Risks and global stop rules

| Risk | Mitigation / stop |
| --- | --- |
| The package lands on unreleased train 1 | hard stop in OBS-2 |
| REL-2 opens before OBS-2 lands | OBS-2 stops; the owner decides between a separate release PR and waiting |
| The type rule for optional keys fails on one compiler | stop with measurements; no partial rule |
| A shared gate file conflicts with train 2 | rebase and re-run gates; never drop edits |
| A lane exceeds 810 s | stop and report |
| The TEST experiment fails | the observation release stops; the design returns to review |
| A gate is in the way | never weaken it; stop |

## 8. Independent review of these briefs

To be recorded here before OBS-1 starts: findings and their disposition.
