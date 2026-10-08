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

Initial package boundaries are owned by `ADR-0003`, which resolves `OD-001`.
`ADR-0029` adds the optional candidate-only lifecycle kernel module and retains
G1 public qualification and npm namespace verification as release gates.
`ADR-0030` adds the optional public resource scope module and `ADR-0033` the
optional public conformance module.

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
  the build configuration, outside the mapped `sourceRoot`; the direct stage0
  root lives at `packages/*/src/composition/stage0.ts` until generated stage1
  replaces it in M3. This extension concerns Core alone; it creates no edge to
  the separate lifecycle kernel package.
- The lifecycle kernel has one feature for local generation/lease policy, a
  thin `src/composition/root.ts` package factory, and a curated root export.
  Its local bookkeeping identities are not product generation IDs or Host
  cleanup resources. Runtime dependencies and Core/Assembly imports are absent.
- The resource scope package has one feature for ordered cooperative cleanup, a
  thin `src/composition/root.ts` seam and a curated root export. It has no
  runtime dependency, imports neither Core, Assembly nor a builtin, and Core
  and Assembly do not import it. Its Assembly integration tests live in root
  `tests/resources` because a leaf package declares no workspace dependency except
  declared peers (ADR-0033).
- The conformance package has four features (errors, harness, suites and
  handles), a thin `src/composition/root.ts` seam and a curated root export. It
  is development tooling for module authors and contract owners. Its only
  packages are the Core, Assembly and resources peers, imported by root name,
  and it imports no builtin. Its tests live in the package. Get Modular's own
  qualification stays in `tests/qualification`.
- No deviation from organization `v1` is declared.

## Enforcement

`pnpm architecture:feature-module-profile` verifies the pinned standard,
repository mapping, local authorities, navigation, gate wiring, and explicit
qualification states. `pnpm governance:check` uses the same repository-wide
production-artifact inventory. It always rejects production artifacts outside
`packages`. Accepted ADR-0015 admits source only inside a package identity
accepted by ADR-0003, ADR-0023, the bounded ADR-0029 successor, ADR-0030 or ADR-0033 and, on its
own, only while that manifest is
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
- execute the pinned `@agent-teams/engineering-foundation` `1.7.2` command
  `agent-teams-foundation check` through both the complete and fast gates.

The tooling activation pins Foundation `1.7.2`. SDK growth admission remains
explicitly pending: the active public-API capability retains schema v1 until a
trusted external authority binds the PR base and candidate to authenticated
released Core and Assembly artifacts. Local qualification records cannot
activate that route. The published
`quality.source-coverage` route uses the existing production profile and source
policy: `quality:coverage:scope` runs in the fast gate and `lint:typed` runs in
the complete gate. Suppression governance covers Core, Assembly, lifecycle kernel, resources and conformance source with
no waivers. Activation does not claim that existing source passes typed lint
or establish structural or runtime conformance. Docs retains its portable
workflow without a managed adapter or cohort binding.

The Foundation 1.7.2 migration keeps the immutable Feature Module Standard and
Consumer Module Standard pins. The retained current Consumer Module Standard
adds the optional ADR-0029 dynamic Host guidance; it does not expand passive
composition or confer SDK authority. The current SDK tooling binding advances
while the earlier Foundation archive and P0 records remain historical evidence.
SDK status stays pending, activation stays on hold and release eligibility stays
false.

The local changed workflow remains on the published Foundation 1.7.2 schema.
JS and TS edits select the existing project-wide `check:fast` script with
`passPaths: false`; changed file names never become compiler arguments.
Compiler projects and root check configuration select the same fast gate through
explicit configuration triggers. Root Markdown-only edits retain `docs:changed`;
the existing `docs` and `architecture` full-scan triggers remain.
A mixed docs and code change still runs the code gate. Version 1 changed reports
are editing feedback: their `coverage: changed` label does not claim that typed
lint or the full gate ran. `pnpm check` remains the complete required gate.
This corrects routing inside the existing development-tooling boundary; it adds
no production composition node, consumer adoption scope or public contract.

Node 24.21.0 remains the repository default and production tooling choice, with
pnpm 11.20.0. The root/tooling policy is `>=24.21.0 <25 || >=26.10.0 <27`;
the public library policy retains the separate Node 24.18.0 floor. Node 25,
Node 26 below 26.10.0, Node 27 and malformed versions remain rejected. The
existing runtime helper owns this narrow version mechanism; executable selection
and deployment policy remain with the Host.

`runtime:preflight` is exactly `node architecture/checks/node-version.mjs` and
requires no installed repository dependencies. `precheck:changed` invokes only
`pnpm runtime:preflight`. Both full and fast gates explicitly execute
`lockfile:peers:check`, `runtime:policy:typecheck` and `runtime:policy:test`
after preflight and before preparation. The peer gate validates the committed
graph with `pnpm peers check --lockfile-only`; strict frozen installation alone
does not replace it. The policy compiler gate uses the pinned TypeScript 7.0.2
compiler and the existing strict NodeNext configuration, including
`erasableSyntaxOnly`, `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`. Native Node type stripping does not replace that
gate.

The Node 24 and candidate Node 26.10.0 CI routes each retain five independent
lanes on Ubuntu, macOS and Windows, including strict frozen installation,
committed peer validation, the complete gate union and tracked workspace
integrity. The governance lane explicitly executes policy typechecking and
tests. The existing installed public archive compatibility lane remains
separate. Docs Protocol is pinned exactly to `0.6.2`, the published stable
successor declaring Node `^24.18.0 || ^26.0.0`; `0.6.0` excludes Node 26.
The `portable-v1` profile and schema remain unchanged. These Node 26 root
routes remain a source-only draft: qualification of the exact Docs `0.6.2`
closure and installed mandatory runner remains pending, including fresh
strict frozen Node 24/26 installations under pnpm 11.20.0, Foundation and Docs
checks, and the complete mandatory gates. This mapping declares no managed
cohort binding, production qualification or release eligibility.

`pnpm quality:critical:test` runs the existing source dependency and quality
activation entries through `agent-teams-node-test`. Its consumer checker binds
the complete selected file command and the SHA-256 of the reviewed required
identity contract. Fast and full gates execute this route; other tests retain
their existing Node runners. The consumer inventory has no OS exceptions.
Disposable regressions reject missing identities, skip, todo, late failure,
removed selected files and changed contracts, and exercise an exact Windows-only
fixture exception on POSIX.

| Installed mechanism | Applicability and enforcement | Command |
| --- | --- | --- |
| Root runtime and committed peers | Dependency-free preflight; explicit strict policy typecheck and tests in full/fast gates; committed peer validation after frozen installation | `pnpm runtime:preflight`, `pnpm lockfile:peers:check`, `pnpm runtime:policy:typecheck`, `pnpm runtime:policy:test` |
| Source dependencies v3 | Root development tooling, Core, Assembly, lifecycle kernel, resources and conformance; preserve declared roots, generated output and dependency budgets | `pnpm foundation:check` |
| Source coverage and typed quality | All declared compiler projects; missing inputs fail; the default unknown assertion bridge gate remains active with no admissions | `pnpm quality:coverage:scope`, `pnpm lint:typed` |
| Suppression governance | All five production source roots, no waivers | `pnpm foundation:check` |
| Required Node execution | Nine critical identities in two existing files; complete selected file list is bound | `pnpm quality:critical:test` |
| Documentation, decisions, workflow and dependency declarations | Existing installed profiles and repository routes remain active | `pnpm foundation:check`, `pnpm docs:protocol:check` |
| Public API compatibility | Existing v1 profiles and released baselines; baseline mutation guard retained | `pnpm foundation:check`, `pnpm release-owned-files:check` |
| SDK growth authority | Current installed verifier and disposable qualification; activation remains pending without external authority | `pnpm sdk-growth:check` |
| JSON schema release evolution and executable specifications | No installed release profile/catalog adopted; current immutable contracts use their existing owner gates | `pnpm contracts:check`, `pnpm governance:check` |
| Protobuf, property testing and repository security capabilities | No adopted capability profiles; no protobuf production root or property-testing toolchain is declared | Review `foundation.config.yaml` and `package.json` |
| Scaffolding, local mode and native managed processes | No requested scaffold owner, native boundary or managed adapter; registry mode remains required | `pnpm foundation:assert-registry` |

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

The materialized private features in `packages/core` are `source-admitted`.
Structural conformance and runtime conformance remain independently
`not-claimed`. The Foundation policy enumerates materialized files and their
allowed entrypoints; its executable fixtures in
`tests/source-dependencies.test.mjs` cover source ownership, dependency edges,
cycles and rejected undeclared layers. They do not establish complete Core
structural conformance. Structural evidence cannot stand in for packed runtime
execution, and packed runtime execution cannot bypass source admission or
structural qualification.

## Optional common assembly delivery

The [Consumer module standard](common-assembly.md#consumer-module-standard) defines
scoped consumer wiring adoption; this repository profile does not certify consumers.

[Common assembly](common-assembly.md) defines the separate A0-A3 route and
acceptance checks admitted by [ADR-0023](../decisions/0023-add-a-thin-host-owned-assembly-component-above-core.md).
Core callable surfaces and historical qualification remain unchanged. Assembly
is a separate construction feature; Host retains permissions and lifecycle.
