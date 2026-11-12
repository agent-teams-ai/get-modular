# GM + Effect architecture audit — 2026-11-12

Status: in progress. Base: `0ff54371967e4b56a9978f784f568a48731a324d`.
Owner: the existing optional Effect construction boundary and its packaged guide.

## Goal and authority

Review the implemented integration against its actual source, tests and accepted
[ADR-0043](../../docs/decisions/0043-plan-optional-native-effect-composition.md).
Assess Clean Architecture, SOLID, DRY, resource ownership and scalability.
Deepen the primary-source OpenCode study and compare other substantial Effect
applications. Keep reusable usage rules in the existing
[packaged guide](../../packages/effect/docs/practices.md); dated research owns
observations and evidence, not a second normative contract.

The current [Consumer Module Standard](../../docs/architecture/common-assembly.md#consumer-module-standard),
[system boundary](../../docs/architecture/system-boundary.md) and repository
instructions remain authoritative. The current main matches this checkout.
The earlier implementation and library tests exist; their success is not an
answer to every scale or application-lifecycle question.

## Bounded work

1. Inspect native lowering, typed inventory, shared preparation, dependency
   records, input capture, carrier rejection and dependency direction.
2. Audit resource/error/context ownership: memoization, independent builds,
   borrowed services, acquisition failure, interruption, finalizer defects,
   escaped values and private Layers.
3. Separate graph size, TypeScript authoring cost and concurrent application work.
   Add focused experiments only where they settle a real remaining question.
   Retain commands, exact versions, graph shapes and limits. Timing is an
   observation, not a new latency guarantee.
4. Pin OpenCode and at least three architecturally different Effect projects
   to immutable source revisions. Record observed behavior, counterevidence,
   version differences and an adopt/adapt/reject decision for each relevant
   pattern. Do not treat an unexecuted source read as a product E2E.
5. Correct confirmed in-scope defects with rejecting regression cases, if found.
   Do not change production code merely to improve an architectural score.
6. Update research navigation and the one packaged guide; run the applicable
   documentation, type, public-package and repository checks.
7. Publish each coherent commit immediately through the authenticated GitHub
   plugin, starting with this plan in a draft PR. Review the final source,
   resolve findings, check the actual CI outcome, then merge and verify main.

## Invariants and exclusions

- GM owns exact module/slot selection; Effect owns native construction/lifetimes;
  the application owns work, ingress, overload and shutdown policy.
- One preparation owner serves both executors. Promise and Effect execution
  retain their different error, cleanup and cancellation contracts.
- Neutral Core/Assembly stay independent of Effect. The optional adapter can
  use native Effect types without pretending they are neutral.
- No scheduler, event bus, generic runtime, hidden service locator, provider
  registry, speculative cache, startup DSL or automatic graph pruning.
- Preserve accepted ADRs, release baselines, pinned toolchain and existing gates.
- No npm release, product migration, unrelated open PR completion or new public
  support-envelope/promotion claim. Those remain separate decisions.

## Review and acceptance

Round 1: independent source review of our mapper and preparation, plus parallel
primary-source research of OpenCode and other Effect projects.

Round 2: challenge the proposed conclusions and experiments. Distinguish a
reproduced bug, a documented tradeoff and an unmeasured risk; remove unsupported
claims and unnecessary abstraction work.

Round 3: independent review of the actual diff, evidence and public documentation.
Additional rounds are only for concrete unresolved findings.

Acceptance requires a linked report with exact source observations, a clear
architectural verdict, measured evidence where available and explicit limits.
New maintained code uses `.ts` and the repository's strict TypeScript 7.0.2
project and normal verification route. Tests must exercise public behavior,
with acquired/released resources and independent expected results where relevant.
Use existing installed-archive qualification for changes to native behavior.
Skipped or queued jobs are not successes. Remote checks are evaluated on the
reviewed source, and final merge identity and main checks are inspected.

## Estimate and decision confidence

These are planning judgments, not availability measurements.

| Work | Expected incremental lines |
| --- | ---: |
| Production | 0; up to 120 only for a reproduced in-scope defect |
| Tests and bounded measurement tooling | 100–300 |
| Research and guide updates | 350–700 |

Complexity: **4/10**. Confidence in this bounded audit plan: **8/10**.
Target reliability of the reviewed native-construction contract after checks:
**8/10**, with no implied production workload/SLO certification.
No new dependency is expected.
