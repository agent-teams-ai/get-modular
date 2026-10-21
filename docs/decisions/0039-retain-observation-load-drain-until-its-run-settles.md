---
id: ADR-0039
type: adr
status: accepted
owner: architecture
approved_by: product-owner
accepted_at: 2026-10-21
related:
  - ADR-0034
summary: Keep load cleanup pending after escalation and report unresolved work without releasing dependencies.
---

# ADR-0039: Retain Observation load drain until its run settles

## Context

ADR-0034 makes an escalated unfinished load a failed cleanup debt. Resources
continues releasing earlier entries after a failed cleanup, so a loader that
ignored cancellation can outlive the provider it still uses. Cancellation and
the end of a caller's wait must not be mistaken for load completion.

## Decision

Supersede only ADR-0034's escalation-to-failed-debt behavior for load drains.
Observation detaches the subscription, cancels its queued work and requests
cancellation of its active loader. Its cleanup continues awaiting the active
loader promise, including its finally work, after escalation.

Escalation schedules one named `observation.load.still-running` report through
the existing owner error sink if that same run is still active. The report uses
the active run's revision. A cooperative loader that has already settled does
not produce this report. Resources abandonment ends only the caller's wait and
returns an unsettled snapshot; it does not advance reverse-order cleanup.

The Host retains deadlines, physical termination, infrastructure ownership and
recovery. Resources keeps its existing behavior for genuinely failed cleanup.
No new lifecycle authority, retention registry or public load handle is added.

## Consequences

- Dependent resources remain held while an Observation loader is pending.
- Late results never publish after detachment; the original close completes
  after the loader settles without a cleanup retry.
- An uncooperative loader can retain resources indefinitely. Hosts needing a
  bounded response must use abandonment and retain the patient close promise.
- This is a breaking Observation minor. Consumers observing the old terminal
  failed debt migrate to the error sink and pending close snapshots.
- Successful cleanup callbacks still do not independently prove physical I/O
  completion outside the loader's returned promise.

## Rejected alternatives

- Keep a failed debt and retry later: earlier dependencies may already have
  been released, and retry may repeat unrelated cleanup effects.
- Add generic dependency retention to Resources: the existing pending cleanup
  promise already expresses the required ordering without another authority.
