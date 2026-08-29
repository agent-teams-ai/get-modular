---
id: OD-001
type: open-decision
status: resolved
owner: architecture
summary: Selects the npm identity and initial package boundaries without premature fragmentation.
resolved_by: ADR-0003
related:
  - ADR-0001
  - ADR-0003
---

# OD-001: Public package identity and topology

## Decision required

Choose the npm scope and smallest package topology that preserves dependency
direction without creating forwarding-only packages.

## Constraints

- The public brand is Get Modular and the GitHub repository is `get-modular`.
- Package identity must not imply ownership by Agent Teams if the library is
  intended for general TypeScript use.
- The name must be protectable and publishable without dependency-confusion
  ambiguity.
- Conformance may depend on the core API, but the core cannot depend on test
  tooling.
- Construction helpers must remain a leaf and cannot become lifecycle
  authority.

## Options

1. `@get-modular/core` and `@get-modular/conformance`, adding another package
   only after a real dependency boundary appears.
2. One `@get-modular/core` package with curated subpath exports for core and
   conformance fixtures during `0.x`.
3. Separate model, compiler, instantiate, and conformance packages from day
   one.

## Acceptance criteria

- npm organization ownership is verified before publication;
- no package is forwarding-only;
- production consumers do not install conformance tooling by default;
- package graph is acyclic and default-deny;
- packed-consumer and type-surface checks prove no tooling leakage;
- migration from the chosen `0.x` topology to the likely 1.0 topology is
  documented.

## Resolution

Resolved by `ADR-0003`. Use `@get-modular/core` and development-only
`@get-modular/conformance`. Add another package only after an accepted decision
proves an independent dependency or lifecycle boundary. Registry publication is
still prohibited until authenticated ownership of `@get-modular` is verified.
