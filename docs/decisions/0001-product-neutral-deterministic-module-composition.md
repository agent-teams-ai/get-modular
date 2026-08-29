---
id: ADR-0001
type: adr
status: accepted
owner: architecture
summary: Establishes Get Modular as an independent deterministic composition core with product-owned operational authority.
approved_by: product-owner
accepted_at: 2026-08-29
related:
  - OD-001
  - OD-002
---

# ADR-0001: Product-neutral deterministic module composition

## Context

Agent Runtime, Orchestrator, Frontend, and additional products need one neutral
module composition model. Building independent kernels would duplicate the
most compatibility-sensitive semantics. Placing composition inside Extension
Foundation would mix module graph concerns with plugin trust, installation,
isolation, and retirement.

Extension Foundation ADR-0015 authorizes an independent public Get Modular
repository and explicitly separates neutral composition, extension trust, and
product runtime authority.

## Decision

Get Modular is an independent product-neutral library. Its pre-1.0 scope is:

- validated serializable identities;
- inert module declarations;
- explicit dependency cardinalities and provider bindings;
- deterministic validation and graph compilation;
- immutable plans, canonical encoding, digests, and diagnostics;
- conformance vectors;
- optionally, a narrow attempt-scoped construction leaf that receives only
  already selected and authorized factories from the product host.

Get Modular must not depend on Extension Foundation. Extension Foundation must
not depend on Get Modular. Product-owned adapters may depend on both.

The production API must not expose DI container types, filesystem discovery,
global registries, product types, plugin artifact types, or executable module
imports. A product owns capability payloads, target-local literal loaders,
authorization, lifecycle, readiness, generations, publication, routing,
fencing, drain, cleanup, and durable recovery.

Synthetic modules may qualify an unstable `0.x` implementation. Stable 1.0
requires two independently authored production adapters, cross-consumer
conformance, and an explicit promotion decision.

Engineering Foundation and Docs Protocol are exact development dependencies
only. Their runtime and types cannot enter packed production dependencies or
public declarations.

## Consequences

- Products can start from one intentionally neutral composition language.
- Product domains and operational authority remain isolated from the library.
- Plugin distribution and security evolve independently in Extension
  Foundation.
- Package topology and canonical plan encoding remain explicit blocking
  decisions before the first public package.
- Pre-1.0 API changes remain possible while synthetic and product evidence
  challenge the contract.

## Rejected alternatives

- Put composition inside Extension Foundation. This mixes independent
  responsibilities and creates avoidable dependency pressure.
- Build a complete lifecycle framework. This would duplicate product Host
  Custody and create a second operational authority.
- Let each product invent its own module graph. This creates guaranteed drift
  across consumers already waiting for the same semantics.
- Treat every library or feature as a runtime module. Ordinary static code
  remains an ordinary library; runtime module machinery is used only when
  composition or replacement is intentional.
