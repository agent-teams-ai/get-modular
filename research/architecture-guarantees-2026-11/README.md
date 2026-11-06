# Architecture guarantees: bounded improvement plans

Status: four critic rounds and focused follow-ups; OpenCode/scale study 2026-11-07.
This directory is research,
not accepted architecture, implemented behavior, release evidence, or permission
to start every candidate. The owner requested separate bounded plans in one
draft pull request, followed by multiple rounds of independent criticism.

## Baseline and purpose

Reviewed Get Modular source: `5fb83478dd7b95216be92c4d3077eddf2774eef8`.
Effect comparison source: `9428e17499ee3a144f2ac73c67213fb1336d2bdf`.
The [OpenCode case study](opencode-effect-case-study.md) additionally pins current
OpenCode and its Effect 4.1.0 dependency; it distinguishes those from the earlier
Effect 4.1.2 probes.

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
| [01](01-subscription-recipe.md) | Finish the safe subscription recipe already prepared in PR #213 | Reuse and verify the existing change; no duplicate implementation |
| [02](02-resource-preflight.md) | Preserve resource requirements through entries and preparation; validate before factories | First proposed production API change, including the existing smoke instrumentation |
| [03](03-authoring-checks.md) | Check actual static group membership, then contract-map source parity | Deliver A through Foundation/FMS/Conformance and a consumer first; add B facts/rules with B, without advance scaffolding |
| [04](04-contract-revisions.md) | Support exact contract revisions through explicit adapter modules | Candidate after an actual staged-migration need; preserve Core wire and exact bindings |
| [05](05-parallel-startup.md) | Bound parallel construction of independent factories | Measure a real startup limitation before production admission |
| [06](06-borrowed-lifetimes.md) | Reuse existing borrowed-lifetime proofs in the selected consumer migration | Default new production/tests: zero; no speculative lease system |

Each plan names its owner, proposed contract, excluded work, affected files,
independent positive/negative proofs, migration and stopping conditions. Read the
[Effect assessment](effect-assessment.md) for the corrected comparison and the
[review record](reviews.md) for findings and dispositions.

Implement 02 before later edits to its shared construction types. Work on the
upstream source producer for 03 can proceed independently; its consumer check
awaits a released public API and reviewed exact pins. If 04 is later admitted,
advance 03's affected identity policy and rejecting fixtures in the same delivery.
05 is a measured candidate, not an automatic dependency of 02/03. Reuse the one
ordinary-owner consumer delivery for 02 and 06.

The acceptance matrices list required observations, not a new test suite for
every row. Extend existing owning fixtures and add only missing or invalidated
proofs; retain independent outcomes and required repository/runtime gates.
Do not multiply every case across every fixture merely to increase test volume.

Optional Effect interoperability is assessed in [the comparison](effect-assessment.md).
It adds no seventh workstream, mandatory dependency, graph converter or integration
package. A mixed consumer may use Effect inside a cohesive module; an Effect-native
consumer can retain native operation ports across GM module boundaries. The
[large-application case study](opencode-effect-case-study.md) explains the tradeoff
and why current OpenCode's LayerNode graph is a substantive comparison point.
These choices do not change the six plans' admission or plugin ownership.

## Size and uncertainty

These are engineering estimates of the named future changes, not completed
implementation, measured reliability or a total project budget. Scores are
confidence / achievable reliability within the stated scope / complexity.

| Plan | New implementation LOC | Tests/fixtures LOC | Scores /10 |
| --- | ---: | ---: | --- |
| 01 | 0; finish existing #213 | Already prepared there | 10 / 9 / 3 |
| 02 | 350–700, including smoke integration | 550–1,000 | 8 / 9 / 7 |
| 03 | Foundation 450–800 + GM 550–900 | 1,200–2,200 across both | 7 / 8 / 7 |
| 04 | 200–500 type changes + 100–250 migration/integration | 600–1,200 | 8 / 8 / 6 |
| 05 | 600–1,200 only after admission | 1,200–2,400 | 6 / 8 / 8 |
| 06 | 0 by default | 0 by default | 9 / 9 / 3 |

Documentation, lockfiles, release coordination and external consumer migration
are separate. Plan 03 provisionally budgets 80–200 lines for its selected consumer;
05 separates the preliminary bounded measurement work. Plan 06 adds a consumer
case only for a demonstrated gap. Do not sum these figures as a delivery promise.

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

Three author agents prepared the resource, authoring and evolution plans with
the full conversation and fixed source baseline. Three different critic agents
completed rounds 1 and 2; their one P1 and four P2 findings were closed at planning
level. At the owner's request, three fresh critics performed a deeper round 3
against the same source baseline. They identified one P1 and five distinct P2
findings, corrected in this candidate: complete identity pairs, independent
contract-source obligations, bounded list-use evidence, actual membership owners,
exact export-row correlation and parallel-drain liveness. All three completed
round 4, confirmed those findings closed and found no remaining or new P1/P2
within their reviewed scope. Implementation proof obligations remain pending.

A further focused review checked subtraction and Effect interoperability. It
clarifies the independently useful A delivery in 03, distinct capability IDs in
04, reuse of acceptance fixtures, and the actual consumer measurement for 05.
The Effect assessment records a bounded optional arrangement and the runtime
custody/disposal obligations found in source. These are not a new implementation
workstream or a change to the preceding review counts; details are in the review
record. All three completed targeted correction review of these changed sections
and reported no blocking/new P1/P2 within their respective scopes.

The subsequent large-application review found one P2 in the expanded advice:
the mixed-code Promise/enclave recommendation must not become the default for
every Effect-native internal boundary. The assessment now distinguishes native
operation ports from Promise construction and retains current CMS ownership
limits. The OpenCode study records actual graph/lifetime patterns and a narrow
AI SDK cancellation-forwarding gap; it does not authorize an upstream fix.
All three completed cross-review of the integrated claims. One evidence-wording
P2 (requested versus resolved dependency versions) was corrected and rechecked;
the final reviewed scope has no remaining blocking P1/P2. The six plan files
remain unchanged by this follow-up.

The local documentation route and the prescribed installation command were
attempted on Node 24.22.1. Both stopped at `runtime.bun.expected:1.4.3` because
the required Bun executable is unavailable. No older compiler, alternative
package manager in this checkout, changed lockfile or weakened check is used.
The source/docs read-through and local relative-link checks ran. Hosted CI remains
separate from those checks. ReviewRouter reported incomplete provider coverage
on the earlier checkpoints; that is not external approval. The actual published
head and hosted check status are available in [draft PR #231](https://github.com/agent-teams-ai/get-modular/pull/231).
No runtime, strict-type, packed-package or real-consumer qualification of the
proposed changes is claimed by this planning PR. The Effect assessment separately
retains three one-off source-execution probes on Node 24.22.1. They observe current
runtime semantics and an adapter debt mismatch; they are not qualification of
the proposed APIs or of a complete installed integration.
The case study adds two separately labeled experiments: caller Reference loss
across a new runtime on Effect 4.1.2, and an exact extracted OpenCode bridge on
Effect 4.1.0 with a controlled SDK Promise. OpenCode's existing suites were read,
not run; no real provider, installed integration or performance benchmark is claimed.
