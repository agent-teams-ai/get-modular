---
id: ARCH-FEATURE-MODULE-STANDARD
type: architecture
status: active
owner: architecture
summary: Maps the immutable organization Feature Module Standard v1 to Get Modular without claiming premature conformance.
related:
  - ADR-0002
  - GM-REQ-V1
  - OD-001
---

# Get Modular Feature Module Standard Profile

## Adoption

Get Modular adopts `agent-teams.feature-module-standard` `v1` from the
[organization authority](https://github.com/agent-teams-ai/.github/blob/eef92e7fd40f538b4e9ba03e01bbd4e2d23f12f2/docs/architecture/feature-module-standard/v1.md).
The immutable content identity is Git blob
`d0bfff2033faf544fe65268c1dcdfd524d093015` and SHA-256
`851653f96643cf0466b67ab22963661976b00de44840fa3144a48a8c054f95fa`.

The central document remains the sole authority for universal feature ownership,
layer responsibilities, composition, dependency mechanisms, tests, and module
extraction. This document owns only the Get Modular mapping and stricter local
rules. The machine-readable authority is
`architecture/feature-module-standard-profile.json`.

## Scope mapping

Future production modules live under `packages/*`. A module maps its production
code to `src`, feature-owned capabilities to `src/features/*`, module assembly to
`src/composition`, its curated public surface to `src/index.ts`, and non-colocated
tests to `tests`.

Get Modular is a library repository, so it has no application roots. Root
`architecture`, `docs`, and `tests` contain repository governance and
qualification tooling and are outside production-module scope. No production
package or empty feature layout is created by this adoption.

Package identities and initial package boundaries are owned by `ADR-0003`, which
resolves `OD-001` while retaining npm namespace verification as a publication
gate.

## Local extensions

- TypeScript declarations, deterministic compilation, immutable plans, and
  closed dependency objects follow `GM-REQ-V1`.
- Package identity and physical topology follow `ADR-0003` and cannot be inferred
  by a generator.
- Repository dependencies follow the exact pnpm and development-only rules in
  `architecture/foundation/dependency-declarations.yaml`.
- Engineering Foundation and Docs Protocol remain development tooling. Their
  runtime or types cannot enter a public package surface.
- No deviation from organization `v1` is declared.

## Enforcement

`pnpm architecture:feature-module-profile` verifies the pinned standard,
repository mapping, local authorities, navigation, gate wiring, and explicit
conformance state. `pnpm governance:check` continues to reject production
artifacts while open decisions block implementation. Both commands run through
the complete repository gate, and profile binding also runs in the fast gate.

## Conformance is not claimed

Adoption fixes the rules; it does not prove that nonexistent production modules
follow them. With the first production package, the repository must add a
deterministic source-dependency policy plus positive and negative fixtures for
every structural rule listed in the profile. Only a later accepted decision may
promote the profile from `not-claimed` to a conformance claim.
