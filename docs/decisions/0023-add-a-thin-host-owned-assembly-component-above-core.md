---
id: ADR-0023
type: adr
status: accepted
owner: architecture
approved_by: product-owner-delegated-orchestrator
accepted_at: 2026-09-07
summary: Admits an independent assembly package with complete preflight validation and attempt-local construction while Host retains lifecycle authority.
---

# ADR-0023: Add a thin host-owned assembly component above Core

## Context

Multiple Host projects need the same plan-to-factory wiring, while Core remains
an inert compiler. The owner approved a thin common assembly and implementation
following independent architecture review.

## Decision

Admit `@get-modular/assembly` at `packages/assembly` as a substantive optional
runtime package. This extends ADR-0003's initial package list only. It may depend
on the public Core root; Core must never depend on assembly. Root API is unversioned
under ADR-0009. Existing Core exports, semantics and qualification stay unchanged.

Assembly owns complete preparation, sequential construction and attempt-local
handoff. Host owns factory authorization, capabilities, lifecycle and cleanup.
The single detailed contract and A0-A3 acceptance route are in
[Common assembly](../architecture/common-assembly.md). No general container,
registry, scheduler, discovery, automatic rollback or product migration is admitted.

## Consequences

- Consumers share executable wiring checks without moving authority into Core.
- The extra package needs its own type, packed-consumer and runtime evidence.
- Construction success never grants readiness, trust or conformance.

## Rejected alternatives

- Duplicate full construction semantics in every Host: repeats error-prone wiring.
- Publish a general generator or lifecycle platform: beyond the confirmed need.
- Move construction into Core: violates the inert compiler boundary.
