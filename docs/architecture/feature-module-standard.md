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
- Internal self-composition follows accepted ADR-0008; the
  [self-composition implementation guide](self-composition-implementation-guide.md)
  owns its implementation mapping. Every edge of the own graph uses the
  standard's second mechanism, a consumer-owned port whose provider is selected
  by module composition through the own profile; the plan-then-apply emitter
  is the form that composition takes, not a separate mechanism. Fixed library
  imports inside a feature, such as diagnostics and graph helpers, use the first
  mechanism. The third mechanism, a runtime activation plan, is not used inside
  the Core. The build-only directory `packages/*/self-composition` holds the
  own profile, the allowlist, the emitter and the qualification entries beside
  the build configuration, outside the mapped `source_root`; the direct stage0
  root lives at `packages/*/src/composition/stage0.ts` until generated stage1
  replaces it in M3. This extension covers both and no third package exists.
- No deviation from organization `v1` is declared.

## Enforcement

`pnpm architecture:feature-module-profile` verifies the pinned standard,
repository mapping, local authorities, navigation, gate wiring, and explicit
qualification states. `pnpm governance:check` uses the same repository-wide
production-artifact inventory. It always rejects production artifacts outside
`packages`. Accepted ADR-0015 admits source only inside a package identity
accepted by ADR-0003 and, on its own, only while that manifest is
`private: true` and declares no publication field. Accepted ADR-0017 supersedes
those two conditions and blocks publication surfaces only while an open
decision listed under `publicationBlockers` in the traceability catalog remains
active, which is currently none. The accepted identities, the location below
`packages/`, the accepted carrier prohibitions of ADR-0012 and the rejection of
a manifest nested below a package root all hold regardless. `runtime-conformant` claims remain blocked
while any open decision is active. `source-admitted` and
`structural-conformant` describe source custody and may proceed without claiming
unresolved runtime semantics. Both commands run through the complete repository
gate, and profile binding also runs in the fast gate.

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

The private canonicalization slice in `packages/core` is `source-admitted`.
Structural conformance and runtime conformance remain independently
`not-claimed`. The Foundation policy enumerates materialized files and their
allowed entrypoints; its executable fixtures in
`tests/source-dependencies.test.mjs` cover source ownership, dependency edges,
cycles and rejected undeclared layers. They do not establish complete Core
structural conformance. Structural evidence cannot stand in for packed runtime
execution, and packed runtime execution cannot bypass source admission or
structural qualification.
