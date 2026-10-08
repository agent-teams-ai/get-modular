# Shared plugin lifecycle kernel: extraction plan archive

The working plan (in Russian) that led to
[ADR-0029](../../docs/decisions/0029-admit-an-optional-lifecycle-kernel-candidate.md)
and the private `@get-modular/lifecycle-kernel` candidate, moved from the
workspace `plans/` folder on 2026-10-02 (the workspace copy is no longer
maintained) so its reasoning, open L3/L4 questions and acceptance cases live in
the owning repository. It is evidence, not governed authority.

| File | What it is |
| --- | --- |
| [shared-plugin-lifecycle-kernel-2026-09-28.md](shared-plugin-lifecycle-kernel-2026-09-28.md) | The plan, last updated 2026-09-30: L0-L2c1 history, the proposed L3 correction, the L4 conditions, the candidate API and the mandatory acceptance cases |

## Where the current authority lives

- [ADR-0029](../../docs/decisions/0029-admit-an-optional-lifecycle-kernel-candidate.md)
  and the [candidate package contract](../../packages/lifecycle-kernel/README.md).
- The [lifecycle-kernel decision boundary](../../docs/architecture/common-assembly.md#optional-dynamic-host-lifecycle-candidate)
  in the Consumer Module Standard.
- G1 status: [`architecture/sdk-growth/status.json`](../../architecture/sdk-growth/status.json)
  (pending, activation on hold).
- TEST evidence: the `docs/lifecycle-kernel-*.md` checkpoints in
  [modularity-host-test](https://github.com/agent-teams-ai/modularity-host-test/tree/fcc10b2501420aacf9f904e976a4d230d3f02e68/docs).

Where the plan and these sources disagree, these sources win. The proposed L3
correction at the top of the plan is a proposal, not an accepted decision, and
section 11 records the working process of that time (hosted worker models,
review routing), not rules of this repository.

## Edits to the original

The copy differs from the workspace original (SHA-256 `99350d9d…`) only by:

- three leading directive lines and a blank line: one heading-level rule is
  off, Cyrillic text is skipped by the spelling check, and three English terms
  are allowed;
- the link to the previous TEST stand plan now points to the identical
  `docs/implementation-plan.md` in modularity-host-test at `fcc10b25`;
- the link to the G1 authority plan is plain text: that plan now lives in the
  owner's private infrastructure repository;
- one local machine path is replaced with a description;
- the private infrastructure repository's revision and a planned
  infrastructure provider move are described without their identifiers, and
  "user" reads "owner" (as in ADR-0029).
