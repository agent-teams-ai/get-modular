---
id: ADR-0040
type: adr
status: accepted
owner: architecture
approved_by: product-owner
accepted_at: 2026-10-21
related:
  - ADR-0038
  - ADR-0039
summary: Qualify the exact Core and Assembly 0.7 pair with the coordinated resource, observation and conformance profile.
---

# ADR-0040: Admit the Core and Assembly 0.7 diagnostic release pair

## Context

The integration delivery adds Assembly's bounded `formatFailure` API and
ADR-0039's report-and-await Observation drain. Resources already has an accepted
synchronous close reentry repair which must reach installed consumers. The
public Core/Assembly pair and Conformance peer-minor policy require a coordinated
release rather than an Assembly-only version advance.

## Decision

Admit Core and Assembly 0.7.0 as one exact pair. Core's composition semantics and
wire generation are unchanged. Assembly adds one presentation function; original
structured diagnostics and opaque Host causes remain available. Authoring context
is opt-in and escaped, and never becomes a public HTTP error contract.

The coordinated qualified profile is Resources 0.2.1, Conformance 0.5.0 and
Observation 0.2.0. Resources ships the existing reentry fix; Observation implements
ADR-0039 without rewriting ADR-0034. All peers share one physical Resources
identity. Conformance advances its minor for the new Core/Assembly peer profile.

Retain every earlier accepted decision and released API baseline until the normal
release promotion. New archives come from this release's exact qualified source;
historical retained archives and hashes remain immutable. Publication requires
required exact-source CI, independent review, registry byte verification and the
installed consumer. The payments SDK adopts exact published pins and reviewed
CMS bytes with its Linux/PostgreSQL and packed qualification in the same delivery.

## Consequences

- Earlier version pairs remain authenticated by their original decisions.
- Mixed Core/Assembly pairs and future versions without admission remain rejected.
- Hosts migrate Observation shutdown from terminal failed debt to the named
  report, bounded abandonment and a retained patient close promise.
- A coordinated version does not claim a new wire generation, broader compiler
  support, general plugin runtime or cross-consumer adoption.

## Rejected alternatives

- Assembly-only minor: violates the established exact-pair admission contract.
- Reuse published version numbers or rewrite retained archives: hides changed bytes.
- Change earlier accepted ADRs or weaken rejecting gates: loses historical authority.
