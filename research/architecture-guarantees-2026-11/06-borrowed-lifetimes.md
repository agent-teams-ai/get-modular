# 06. Reuse existing borrowed-lifetime qualification before adding an API

**Status:** evidence/adoption delta; no new lifetime mechanism selected.
**Baseline:** Get Modular `5fb83478dd7b95216be92c4d3077eddf2774eef8`.

## Correction to the initial shortlist

The proposed first scenarios already have maintained executable coverage:

| Existing owner | What the source checks |
| --- | --- |
| [Live instance custody test](../../tests/assembly/live-instance-custody.test.ts), landed in #223 (`20c3ce8c5bb839a16fbe8dc258d6d96fd5206787`) | 1024 live runs from one prepared template, two borrowed event sources, distinct roots, close-half isolation, exact unsubscribe counts, reuse without stale listeners |
| [Semantic lifetime L-07](../../tests/qualification/consumer-fixtures/semantic/tests/module/lifetime.test.ts), landed in #189 (`f97a9e60fedc162404658d23af679c09225d4763`) | Real file journal stays usable through failed cleanup/retry; a counterexample closes it early and observes `EBADF`; release is checked independently |
| [Existing attempt owner](../../tests/qualification/consumer-fixtures/semantic/tests/support/attempt-owner.ts) | The test Host owns the full journal and its close right; modules borrow only `journal.port`. The Host drains work and retains inner cleanup debt, then closes its outer journal only after inner resources close completely |

The [1024-instance plan](../module-communication-2026-10/live-instance-custody-plan-2026-11-01.md)
is historical planning context for the delivered test. Do not create a second
1024-instance suite or repeat its old CI/author blockers as current facts.
These source observations are not a fresh execution receipt for this plan PR.

## Smallest useful follow-up

1. Preserve these tests as regression evidence for the preflight/type changes;
   execute them through existing `assembly:test` and strict typecheck routes.
   Reuse their handwritten outcomes and actual file-handle probes.
2. Use one already adopted product boundary: Agent Runtime ordinary Host owners,
   observed at `f990acc26e1b8071ae22d0b87a2ddd3672be8e2e`. Its ADR-0024 already
   keeps the outer journal until the inner owners' close report is complete.
   The current consumer profile pins CMS `b70ba39304ac71964175c42a77309406a7c30ca2`,
   Core/Assembly 0.6.0 and Resources 0.2.0. Review that pin's delta before a
   future package migration, preserving existing pending adoption scopes.
3. During that one consumer migration, inspect its existing ordinary assembly
   and owner-disposal tests against the same two guarantees: sibling lifetime
   isolation and provider availability through retry. Add a case only if the
   actual consumer does not already test it. No subscriber/lease abstraction.
4. If a failure appears, retain the smallest reproducible case and classify its
   owner: consumer close ordering, undisclosed acquisition, resource mechanism
   or missing declared run requirement. Fix the demonstrated boundary inside
   that workstream; a failure does not authorize a general ownership rewrite.

## Acceptance, stop and truthful claims

Existing evidence plus one exact-head product adoption receipt is sufficient
for this follow-up. Record the source revision, installed archive identities,
CMS delta and actual ordinary-owner test commands/results at delivery time.
Get Modular commands remain `bun run assembly:typecheck`,
`bun run assembly:test`, `bun run resources:check`, then the required fast/full
gates. Agent Runtime retains its own pinned manager, strict compiler and scoped
construction/cleanup/adoption gates; do not substitute Get Modular commands.

No provider API credentials or real agent session are needed for a disposable
ordinary-owner cleanup proof. Do not promote the result to contained-turn,
plugin-runtime or fleet-scale production qualification.

Do not add phantom lifetime parameters, a runtime lease registry, reference
counting, automatic cleanup of borrowed ports or a second Host authority without
a concrete failing requirement. Types cannot prevent escaped JavaScript
references. Preflight cannot prove that a provider stays alive after it succeeds.
There is no new breaking contract in this follow-up; new owner protocol would
need its own narrowly justified plan rather than expanding this one.

**Default new production/test code: 0/0 lines.** A demonstrated missing consumer
case may add roughly 50–150 test lines; any production fix is estimated from its
reproducer, not reserved speculatively. **Confidence in reuse 9/10,
achievable reliability for the named cases 9/10, complexity 3/10.** These scores
do not establish memory safety, revocation or an unbounded lifetime guarantee.

Sources: [accepted input-lifetime rule](../../docs/decisions/0031-pass-a-per-run-scope-and-declared-inputs-to-assembly-runs.md),
[Agent Runtime ordinary scope decision](https://github.com/agent-teams-ai/agent-runtime/blob/f990acc26e1b8071ae22d0b87a2ddd3672be8e2e/docs/decisions/0024-get-modular-resource-scopes-for-ordinary-owners-and-provider-access-grants.md),
[current adopted scope](https://github.com/agent-teams-ai/agent-runtime/blob/f990acc26e1b8071ae22d0b87a2ddd3672be8e2e/docs/architecture/get-modular-adoption.md).
