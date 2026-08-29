---
id: ADR-0002
type: adr
status: accepted
owner: architecture
summary: Adopts the immutable organization Feature Module Standard v1 without claiming conformance before production topology exists.
approved_by: product-owner
accepted_at: 2026-08-29
related:
  - ARCH-FEATURE-MODULE-STANDARD
  - GM-REQ-V1
  - OD-001
---

# ADR-0002: Adopt organization Feature Module Standard v1

## Context

Get Modular will define public TypeScript packages consumed by several products.
Without one feature-ownership standard, package internals could drift into broad
shared directories, framework-owned composition, or empty Clean Architecture
layers. Copying a product-specific standard would create another authority and
silently import that product's topology decisions.

The organization publishes the language-neutral
`agent-teams.feature-module-standard` as immutable `v1`. Get Modular has no
production packages yet, so adoption and conformance must remain separate claims.

## Decision

- Adopt `agent-teams.feature-module-standard` `v1` from
  `agent-teams-ai/.github/docs/architecture/feature-module-standard/v1.md` at Git
  blob `d0bfff2033faf544fe65268c1dcdfd524d093015` and SHA-256
  `851653f96643cf0466b67ab22963661976b00de44840fa3144a48a8c054f95fa`.
- Keep the local scope, abstract-to-concrete path mapping, extensions,
  deviations, gates, and conformance state in
  `architecture/feature-module-standard-profile.json`.
- Apply the standard to future production modules under `packages/*`. Root
  architecture, documentation, and qualification tests are repository tooling,
  not production modules.
- Declare no deviations at adoption.
- Do not claim conformance before the first production module exists and all
  structural positive and negative fixtures run in the required gate.
- Do not enable a source-dependency capability against empty or invented roots.
  The profile check validates the adoption now; structural conformance activates
  with the first production package.
- Keep package identity and exact physical package topology in `OD-001`. This
  decision does not resolve it or create packages.

## Consequences

- Product-neutral feature ownership is fixed before implementation without
  creating ceremonial folders.
- Central `v1` cannot drift silently because both Git blob and content digest are
  pinned and checked offline.
- The repository has an explicit future path mapping while remaining truthful
  that no production module has been materialized.
- A later package must add source-boundary policy and conformance fixtures before
  the repository can claim compliance.
- A successor standard, deviation, or changed local mapping requires a new
  accepted decision rather than an implicit profile edit.

## Rejected alternatives

- Copy the central standard locally. This creates a second normative authority.
- Claim conformance now. There is no production topology to test.
- Delay adoption until after implementation. That allows the first package to
  establish accidental structure.
- Resolve package identity in the adoption decision. That combines independent
  changes and obscures the remaining npm ownership gate.
