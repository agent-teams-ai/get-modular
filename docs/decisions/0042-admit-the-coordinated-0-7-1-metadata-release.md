---
id: ADR-0042
type: adr
status: accepted
owner: architecture
approved_by: product-owner-delegated-orchestrator
accepted_at: 2026-10-26
related:
  - ADR-0027
  - ADR-0040
summary: Admits only the coordinated metadata patch cohort and checked public baseline promotion while preserving historical release authority.
---

# ADR-0042: Admit the coordinated 0.7.1 metadata release

## Context

The packaged Assembly README changed after 0.7.0. An Assembly-only patch violates
our exact Core/Assembly pair, and Conformance's workspace peers change their
packed minimums when that pair advances. Foundation 3 requires baseline version
promotion even when the extracted public API is unchanged.

## Decision

Admit exactly Core 0.7.1 with Assembly 0.7.1, Conformance 0.5.1, Resources 0.2.1
and Observation 0.2.0. This is a metadata-only patch cohort: the Assembly README,
Core's coordinated pair metadata and Conformance's packed peer minimums. Runtime,
wire format, API signatures, capability contracts and CMS adoption do not change.
Keep all earlier accepted decisions, public baselines and retained evidence
unchanged in the preparation feature change. Reject mixed and unadmitted future
pairs, missing or changed acceptance and a different coordinated leaf profile.

Acceptance is the orchestrator's routine technical decision under the owner's
continuing autonomous delivery delegation, not a fresh personal owner approval.
Registry observation on 2026-10-26 found the proposed three versions absent;
refresh that inventory before publication and reconcile uncertain effects.

Keep the truthful Assembly Changeset and add Core coordination and Conformance
packed-peer patch intents. Installed Changesets 3.0.2 chooses all versions and
dependents. Never edit generated versions/changelogs or public baselines by hand.

For this exact release the checked Host builds declarations in an owned disposable
Git workspace on its actual `changeset-release/main` branch and invokes the
installed public Foundation 3 `public-api-promote-release` command. Bind its bin,
complete installed runtime closure and authenticated config/source before and
after execution. Only the two configured Core/Assembly baseline files may cross
back, after unchanged-API/version checks, whole-output observation and caller
preimage/custody checks. Independent current-base PR replay runs the same producer
and requires byte-identical complete output. No source ignored-output exemption,
private Foundation import, native-tool migration or general output allowlist is
admitted. The shared release-checks 0.1.0 comparison contract stays unchanged.

Publication still requires reviewed exact-source CI, packed and installed public
consumers, authenticated archive read-back and normal ADR-0019 reconciliation.
Resources and Observation keep their versions only if actual payload comparison
confirms their previously released identity. A mismatch requires truthful new
intent and a separately reviewed exact cohort, never overwrite of an old version.

## Consequences

- Admission, version generation, baseline promotion and publication remain distinct.
- Future releases require their own bounded authority; no same-minor escape hatch.
- The feature preparation preserves baseline bytes; only trusted checked version
  generation later produces their legitimate release metadata through the public CLI.

## Rejected alternatives

- Assembly-only patch or unchanged Conformance version: hides real package metadata changes.
- Hand-edit baselines or reuse the historical native transition request: loses producer authority.
- Rewrite ADR-0040 or admit arbitrary future versions: destroys exact release admission.
