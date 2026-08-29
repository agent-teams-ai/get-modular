---
id: ADR-0003
type: adr
status: accepted
owner: architecture
summary: Selects the @get-modular namespace and separates runtime core from development-only conformance tooling.
approved_by: product-owner
accepted_at: 2026-08-29
related:
  - ADR-0001
  - ARCH-FEATURE-MODULE-STANDARD
  - OD-001
---

# ADR-0003: Select public package identity and initial topology

## Context

Get Modular needs a public npm identity before production packages can be
materialized. Runtime consumers must not install qualification fixtures or test
tooling, while conformance needs the exact public model it validates. Splitting
every possible responsibility now would create forwarding-only packages before
their dependency and lifecycle boundaries exist.

The public brand is Get Modular and is intentionally product-neutral. Package
names therefore must not imply ownership by one Agent Teams product.

## Decision

- Use the npm namespace `@get-modular`.
- Start with exactly two public package identities:
  - `@get-modular/core` is the production runtime package for portable
    identities, inert declarations, deterministic graph compilation, immutable
    plans, digests, and diagnostics;
  - `@get-modular/conformance` is development-only tooling for fixtures,
    executable vectors, packed-consumer checks, and adapter qualification. It may
    depend on `@get-modular/core`; core must not depend on it.
- Keep the repository root package private. It owns workspace governance and
  commands, not a third public API.
- Do not create `instantiate`, adapter, plugin bridge, or other packages until a
  real independently evolving dependency or lifecycle boundary proves the split.
  A new package requires an accepted decision and must own substantive behavior,
  not forwarding exports.
- Verify control of the `@get-modular` npm namespace before publishing either
  package. Until then, package creation and local packed-consumer evidence may
  proceed only after the remaining implementation blockers are resolved, but
  registry publication remains prohibited.
- Before the first publication, prove an acyclic package graph, no conformance
  tooling in the core tarball or declaration surface, and a documented migration
  from the initial `0.x` topology.

## Consequences

- Runtime users install one small production package; maintainers and adapter
  authors opt into conformance separately.
- The dependency direction is mechanically simple: conformance to core only.
- The namespace preserves a coherent public brand while allowing future packages
  after evidence, without reserving empty package shells now.
- npm namespace control is an external publication gate and remains unresolved
  until authenticated ownership is verified.
- A future package extraction costs a deliberate compatibility migration, but
  avoids paying permanent complexity for hypothetical boundaries.

## Rejected alternatives

- One package with conformance subpath exports. Production consumers could pull
  test dependencies or accidentally rely on qualification internals.
- Separate model, compiler, instantiate, and conformance packages immediately.
  Current boundaries do not justify the extra versioning and navigation cost.
- Agent Teams product-scoped package names. They conflict with the intended
  product-neutral library identity.
- Publish before namespace ownership is verified. That creates dependency
  confusion and recovery risk.
