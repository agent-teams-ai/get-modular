# Architecture guarantees: bounded improvement plans

Status: planning and review in progress, 2026-11-06. This directory is research,
not accepted architecture, implemented behavior, release evidence, or permission
to start every candidate. The owner requested separate bounded plans in one
draft pull request, followed by multiple rounds of independent criticism.

## Baseline and purpose

Reviewed Get Modular source: `5fb83478dd7b95216be92c4d3077eddf2774eef8`.
Effect comparison source: `9428e17499ee3a144f2ac73c67213fb1336d2bdf`.

Strengthen concrete composition guarantees while preserving the existing
semantic owners. A high score for a focused composition architecture does not
establish parity with Effect's asynchronous execution runtime. Scope, evidence,
and unresolved claims must be stated separately.

The applicable authority remains [AGENTS.md](../../AGENTS.md), the
[system boundary](../../docs/architecture/system-boundary.md), the
[current contract](../../docs/architecture/current-contract.md), the
[Consumer Module Standard](../../docs/architecture/common-assembly.md), and the
[organization Engineering Quality Standard](https://github.com/agent-teams-ai/.github/blob/main/docs/engineering-quality-standard.md).
Accepted decisions are not edited by these plans. A future change that conflicts
with an accepted contract needs its scoped successor through the existing
decision workflow before the changed behavior is exposed.

## Workstreams

| ID | Bounded work | Admission |
| --- | --- | --- |
| 01 | Finish the safe subscription recipe already prepared in PR #213 | Reuse and verify the existing change; no duplicate implementation |
| 02 | Preserve resource requirements through entries and preparation; validate before factories | First proposed production API change |
| 03 | Check actual static group membership and contract-map source parity | Reuse Foundation/FMS/Conformance; qualify the required public tooling seam |
| 04 | Support exact contract revisions through explicit adapter modules | Strategic typed-Assembly candidate; preserve Core wire and exact bindings |
| 05 | Bound parallel construction of independent factories | Measure a real startup limitation before production admission |
| 06 | Qualify borrowed-input lifetime behavior in real consumers | Evidence first; no speculative lease system |

Separate plan documents, proof matrices, migration notes and review dispositions
are being prepared. This initial checkpoint publishes the scope before those
plans are complete; it does not report reviews or implementation as finished.

## Hard scope boundaries

- No dynamic plugin runtime, artifact trust, executable discovery, hot reload,
  generations, publication, routing, readiness, drain or recovery subsystem.
- No replacement of the Core compiler, compatibility wire protocol or digest.
- No generic dependency container, ambient service registry, universal runner,
  stream runtime, scheduler platform or duplicate source analyzer.
- No automatic disposal of a borrowed scope or capability.
- No feature flags, parallel legacy API, unrelated cleanup or dependency upgrades.
- Production changes, release and merge are outside this planning delivery.

Breaking changes may be selected when they improve the contract. Their eventual
implementation must include the repository's migration block and a codemod for
mechanical call, import or type-argument changes, with explicit manual cases.
New maintained JavaScript-runtime code uses strict TypeScript 7.0.2 or newer and
ordinary `.ts` files. Node type stripping is not typecheck evidence.

## Existing work and dependencies

- [PR #213](https://github.com/agent-teams-ai/get-modular/pull/213), observed at
  `24cf56ad4363168aaff3ab0bbfb648b2514c5f03`, already corrects the documented
  subscription acquisition recipe. This PR does not copy or merge that branch.
- [PR #210](https://github.com/agent-teams-ai/get-modular/pull/210) owns the
  current installation-guide updates; [PR #222](https://github.com/agent-teams-ai/get-modular/pull/222)
  owns additional event-communication research.
- Plugin lifecycle work has a different owner and remains excluded.
- Source-authoring checks must use an adequate public Foundation API. Current
  file/import/export records alone do not prove actual group members or type-map
  parity. Any upstream release and consumer pin change must be explicit.

## Review and validation status

Three author agents are preparing the resource, authoring and evolution plans
with the full conversation and fixed source baseline. Two rounds of cross-review
by multiple critics are planned; findings and changes will be recorded here.

The local documentation route and the prescribed installation command were
attempted on Node 24.22.1. Both stopped at `runtime.bun.expected:1.4.3` because
the required Bun executable is unavailable. No older compiler, alternative
package manager in this checkout, changed lockfile or weakened check is used.
Hosted checks and document review are pending at this initial checkpoint.
