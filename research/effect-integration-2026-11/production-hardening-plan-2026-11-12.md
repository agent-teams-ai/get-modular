# GM + Effect production hardening — 2026-11-12

Status: implementation, research and focused acceptance complete; repository
gates and exact-source delivery are tracked in [PR #239](https://github.com/agent-teams-ai/get-modular/pull/239).
Base: `6169d018935444bde08d43c30bb9a6a9fa9efbd3` (merged audit PR #238).
Owner: the existing optional native construction boundary, its public-package
tests, and the one [packaged practices guide](../../packages/effect/docs/practices.md).

## Goal and authority

Close credible production failure-path gaps with deterministic public-boundary
checks and source-backed guidance. Fix every reproduced in-scope defect; do not
change a correct implementation merely to make the diff contain production code.
Deepen the industry study with actual regressions and their rejecting tests,
including substantial consumers beyond the previous four projects.

[ADR-0043](../../docs/decisions/0043-plan-optional-native-effect-composition.md),
the [Consumer Module Standard](../../docs/architecture/common-assembly.md#consumer-module-standard)
and the [system boundary](../../docs/architecture/system-boundary.md) retain
authority. The previous audit is completed and its measurements stay historical.
This work assesses the library's construction contract; registry publication and
adoption by a named production application retain their separate decisions.

## Selected work and independent oracles

1. Re-read the current source, unresolved review comments and public tests.
   Establish which reported issues are actual defects, missing evidence,
   deliberate native semantics or application-owned responsibilities.
2. Exercise partial parallel startup: acquire a shared resource, start independent
   branches, fail one deliberately, and hold sibling cleanup behind a barrier.
   Assert the original failure, no successful root publication, cleanup completion
   before the caller returns and dependency liveness until the last user releases.
3. Exercise interruption during acquisition, including a late successful foreign
   resource acquisition. Assert exactly-once release and joined native cleanup;
   distinguish interruptible waiting from acquisition's ownership handoff and
   physical I/O cancellation. No sleeps or elapsed-time assertions.
4. Exercise repeated builds after failure/interruption in fresh native scopes.
   Reuse the prepared graph deliberately, assert fresh acquisition and independent
   state, and distinguish this from native memoization within one shared build.
5. Read primary source and fix history for relevant OpenCode, LiveStore and other
   substantial Effect consumers and Effect itself. Pin sources, record versions,
   counterevidence and what each regression test actually checks. Verify whether
   an upstream finding applies to the qualified Effect 4.1.4 peer before proposing
   a dependency change. An unexecuted upstream test is source evidence only.
6. Update the existing guide with practical good/bad patterns and a compact map
   from failure modes to executable checks. Keep dated research as observations,
   not a second usage standard. Reuse the installed-archive suite so new native
   cases also execute through installed public package roots.
7. Run focused strict type/runtime/package checks, the repository's changed/fast
   and complete gates, independent diff review, normal CI, merge and post-merge
   verification. Commit and push each coherent change immediately, starting with
   this plan in a draft PR. Report actual outcomes and the remaining product
   admission boundary, including the user's two requested engineering scores.

The cases above are the initial evidence gaps, not assumed production bugs.
Refine their shape after adversarial review. Use Deferred barriers and independent
resource counts/order/identity assertions; a finite test timeout is only a hung
test guard. Reject test oracles that derive their answer from the implementation.
New maintained code is TypeScript 7.0.2 or newer and belongs to the existing strict
test project and normal package verification route.

## Boundaries and compatibility

GM selects exact providers; Assembly owns inert preparation; Effect owns native
resource construction/finalization; the application owns work and overload.
Preserve ordinary Core/Assembly optionality and the native error/context types.
No new public API, dependency, scheduler, retry engine, cache, lifecycle DSL,
provider registry or production policy is planned. Preserve accepted ADR bytes,
release baselines, pinned tooling and existing check coverage.

A source fix, if necessary, stays at the owner of the reproduced invariant and
gets a failing-before/passing-after regression. If a real issue instead needs an
accepted-contract successor, name that issue and continue independent hardening;
do not silently rewrite the contract or claim a generic production certification.

## Review and acceptance

Round 1: independent production-boundary review and two primary-source research
reviews, including counterexamples to the proposed fixes and scope.

Round 2: challenge the concrete plan, test synchronization and claims. Remove
duplicate tests and abstractions that do not protect a credible failure mode.

Round 3: review the final diff, strict checks, installed-package execution and
research-to-practice mapping. Additional rounds address concrete findings only.

Acceptance requires no unresolved in-scope defects or misleading claims,
deterministic regression cases exercised from installed archives, one discoverable
practices guide, complete applicable gates and verified merged source. Queued and
skipped jobs are not passes. Source studies do not count as upstream executions;
graph qualification does not establish an application's capacity or SLO.

## Incremental estimate

| Work | Expected lines |
| --- | ---: |
| Production | 0; up to 120 for a reproduced defect |
| Tests and fixture integration | 200–400 |
| Guide, research and evidence | 300–600 |

Complexity: **4/10**. Confidence in this bounded plan: **9/10**. Achievable
reliability of the qualified native-construction contract: **9/10**, an engineering
judgment rather than an uptime measurement. No new runtime maintenance burden
or dependency is expected.
