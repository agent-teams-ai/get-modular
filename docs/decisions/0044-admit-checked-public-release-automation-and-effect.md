---
id: ADR-0044
type: adr
status: accepted
owner: architecture
approved_by: product-owner-delegated-orchestrator
accepted_at: 2026-11-14
related:
  - ADR-0042
  - ADR-0043
summary: Admit the coordinated Effect release and checked stable release automation.
---

# ADR-0044: Admit checked public release automation and Effect

## Context

ADR-0043 admitted the Effect source candidate but left publication and baseline
promotion to their release gates. ADR-0042 admits only an earlier metadata
cohort. Hard-coding each future stable version in the release tooling makes
automatic publication dependent on another tooling change.

## Decision

Admit the coordinated release selected by the authenticated Changesets plan:
Core and Assembly 0.8.0, Effect 0.1.0, Resources 0.2.2, Observation 0.2.1
and Conformance 0.5.2. The exact paired Core and Assembly versions and Effect's
qualified 4.1.4 peer remain mandatory. The source-only Effect 0.0.0 candidate
must never be published. This authorization is a routine delegated technical
decision; historical decisions, baselines and their evidence retain their bytes.

For subsequent stable public 0.x MVP releases, Changesets remains the sole version and
dependent propagation engine. The checked Host authenticates the complete source,
intent inventory and engine, checks the complete known public package inventory,
the paired Core and Assembly versions and the actual generated changes. Reject
unknown public packages, 1.x, prereleases, unauthorized inputs and unexpected output.
An independent current-base replay checks the complete generated version PR.
Core and Assembly baseline changes come exclusively from the installed public
Foundation promoter in a private trusted workspace; authenticate its execution,
retain its evidence and compare the entire result with the independent replay.
Never hand-edit baseline contents or allow arbitrary generated files.

Publication requires exact-source full CI, qualified archives, registry byte
reconciliation, installed public consumer verification and only then promotion.
For an already published coordinate, verify its canonical registry integrity and
compare the full fresh and registry payloads, including modes. Use its original
registry bytes only on a complete match; reject drift. Preserve the narrower
historical archive authorities. The shared organization publisher remains the
owner of OIDC, upload reconciliation and promotion. The repository owns release
selection, qualification and its installed consumer. The first Effect package
registration may require the provider's interactive bootstrap; do not retain a
long-lived publication token. Registry publication remains separate evidence.

## Consequences

- Future stable 0.x version plans need no handwritten version allowlist; release PR
  review, the existing branch protections and qualified CI still apply.
- Effect is an optional package, not a production application adoption claim.
- A registry or payload mismatch stops publication rather than replacing bytes.

## Rejected alternatives

- Publishing Effect beside Assembly 0.7.1: that Assembly lacks the native bridge.
- Disabling baseline or archive checks: it loses release custody and replay proof.
- A permanent npm write token: the shared publisher already supports short-lived
  workflow-bound credentials.
