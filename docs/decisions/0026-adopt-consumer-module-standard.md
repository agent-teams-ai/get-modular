---
id: ADR-0026
type: adr
status: accepted
owner: architecture
approved_by: product-owner-delegated-orchestrator
accepted_at: 2026-09-08
related:
  - ADR-0023
  - ARCH-COMMON-ASSEMBLY
summary: Defines scoped consumer composition adoption without changing organization ownership or Host lifecycle authority.
---

# ADR-0026: Adopt consumer module standard

## Context

Consumers need a shared rule for meaningful composition seams without turning
private helpers into graph nodes or duplicating organization ownership policy.
The owner delegated acceptance of this bounded documentation checkpoint.

## Decision

Accept the [Consumer module standard](../architecture/common-assembly.md#consumer-module-standard)
as the single central consumer authoring contract. Organization Feature Module
Standard v1 retains ownership, layer and dependency-mechanism authority. Core
retains compilation semantics; Assembly retains construction and handoff; Host
retains authorization, resources, cleanup and readiness.

Within explicitly accepted consumer Host scope, new independently composed
capabilities, alternative implementations and configurable inter-module
relationships use consumer-owned ports and one Core/Assembly root. Fixed private
helpers remain ordinary dependencies. Domain and application remain independent
of the composition libraries and selected implementation types.

Each consumer activates exact scope through its own accepted decision, pinned
profile and executable positive/negative evidence. Legacy relationships and
exceptions are explicit, finite and reviewed; no automatic expansion or blanket
conformance claim is permitted. Existing FMS activation scope and enforcement
remain unchanged. The central standard specifies future consumer acceptance
requirements; this checkpoint implements no consumer checker or migration.

This is additive to ADR-0023. No accepted decision is superseded, and no Core API,
Host lifecycle, package admission or publication policy changes. Agent Runtime
remains planned until its own scoped evidence is accepted.

## Consequences

- Consumers share authoring rules while retaining exact local scope and evidence.
- Document pins are separate from package and compatibility identities.
- Static inventory and type tests cover specific failures; semantic ownership
  still requires review.
- No consumer adoption registry entry is created before actual acceptance.

## Rejected alternatives

- A node per helper or class: destroys cohesive feature ownership.
- A mandatory full legacy conversion: expands the accepted vertical slice.
- A new universal source parser or registry: duplicates existing tooling before
  a second real consumer requires a shared implementation.
