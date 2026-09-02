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
qualification states. `pnpm governance:check` uses the same repository-wide
production-artifact inventory. It always rejects production artifacts outside
`packages`. Under the current accepted authority, an active implementation
blocker also rejects production package source and qualification promotion.
Proposed ADR-0015 would admit only private, non-publishable source in an accepted
package identity; that behavior must not enter the gate before the decision is
accepted. Both commands run through the complete repository gate, and profile
binding also runs in the fast gate.

## Source admission

With an empty production-artifact inventory, the profile must remain
`pre-production`; governance and qualification tooling do not count as
production. The first production package must atomically:

- keep every production artifact below `packages`;
- change the admission state to `source-admitted`;
- enable Engineering Foundation's `architecture.source-dependencies`
  capability at `architecture/foundation/source-dependencies.yaml`; and
- execute the pinned `@agent-teams/engineering-foundation` `0.21.0` command
  `agent-teams-foundation check` through both the complete and fast gates.

The gate resolves the checked-in `foundation:check` script to that actual
Foundation command, so replacing the script with a successful no-op cannot
admit source. Foundation remains the sole source classifier and dependency
policy engine; Get Modular does not parse imports or implement a second source
dependency checker.

`source-admitted` means only that production location and source-dependency
policy are enforced. It is not structural or runtime conformance.

## Qualification states

Adoption fixes the rules but does not prove a production module follows them.
Qualification records therefore use distinct, ordered states:

- `source-admitted` binds evidence to an existing subject below `packages`;
- `structural-conformant` additionally requires a related source-admission
  claim, positive and negative structural evidence, and an accepted reciprocal
  promotion decision; and
- `runtime-conformant` additionally requires a related structural claim for
  the same subject, packed-artifact runtime evidence, and an accepted reciprocal
  promotion decision.

Every claim names its production subject and carries closed evidence identities
with exactly `path` and `digest`. Each digest is lowercase
`sha256:<64hex>` over the file's exact bytes. Evidence must be a regular
checked-in repository file; symlinks, missing files, paths outside the
repository, and digest drift fail closed.

Structural and runtime claims name the same-subject prerequisite claim in
`related`. Their accepted reciprocal promotion ADR must name the qualification
record and contain the exact sentence
``The exact qualification document bytes for `QUAL-...` at
`docs/qualification/...md` are anchored as `sha256:<64hex>`.`` using the
claim document's actual path and byte digest. This is deliberately one-way: the
claim names its promotion ADR but does not hash it, avoiding circular custody.
Anchoring the claim bytes also binds its subject, prerequisite relationship,
and evidence digests. A `reviewed` record is evidence or analysis only and
makes no admission or conformance claim.

The repository is currently `pre-production`. Structural conformance and
runtime conformance are independently `not-claimed`. A future production
package may be source-admitted without either conformance claim; structural
evidence cannot stand in for packed runtime execution, and packed runtime
execution cannot bypass source admission or structural qualification.
