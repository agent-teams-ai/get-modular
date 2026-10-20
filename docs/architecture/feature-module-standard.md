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
optional public conformance module, and `ADR-0034` the optional public observation module.

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
- The observation package has the features errors, delivery, store and testing,
  thin `src/composition/root.ts` and `src/composition/testing.ts` seams, the curated
  root export `src/index.ts` and a second curated surface `src/testing.ts` for
  `./testing`, the `testing` public module surface of FMS v1. Its only package is
  the resources peer, imported by root name, and it imports no builtin. Its
  Assembly integration tests live in root `tests/observation`.
- No deviation from organization `v1` is declared.

## Enforcement

`bun run architecture:feature-module-profile` verifies the pinned standard,
repository mapping, local authorities, navigation, gate wiring, and explicit
qualification states. `bun run governance:check` uses the same repository-wide
production-artifact inventory. It always rejects production artifacts outside
`packages`. Accepted ADR-0015 admits source only inside a package identity
accepted by ADR-0003, ADR-0023, the bounded ADR-0029 successor, ADR-0030, ADR-0033 or ADR-0034 and, on its
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
- execute the pinned `@agent-teams/engineering-foundation` `1.10.0` command
  `agent-teams-foundation check` through both the complete and fast gates.

The tooling activation pins native Foundation `1.10.0`. SDK growth admission remains
explicitly pending: the active public-API capability retains schema v1 until a
trusted external authority binds the PR base and candidate to authenticated
released Core and Assembly artifacts. Local qualification records cannot
activate that route. The published
`quality.source-coverage` route uses the existing production profile and source
policy: `quality:coverage:scope` runs in the fast gate and `lint:typed` runs in
the complete gate. Suppression governance covers Core, Assembly, lifecycle kernel, resources, conformance and observation source with
no waivers. Activation does not claim that existing source passes typed lint
or establish structural or runtime conformance. Docs retains its portable
workflow without a managed adapter or cohort binding.

The native Foundation 1.10.0 binding follows the retained 1.7.4 and 1.7.2
records and keeps the immutable Feature Module Standard and
Consumer Module Standard pins. The retained current Consumer Module Standard
adds the optional ADR-0029 dynamic Host guidance; it does not expand passive
composition or confer SDK authority. The current SDK tooling binding advances
while the earlier Foundation archive and P0 records remain historical evidence.
SDK status stays pending, activation stays on hold and release eligibility stays
false.

The local changed workflow keeps the schema published with Foundation 1.7.2;
the native 1.10.0 binding does not change it.
JS and TS edits select the existing project-wide `check:fast` script with
`passPaths: false`; changed file names never become compiler arguments.
Compiler projects and root check configuration select the same fast gate through
explicit configuration triggers. Root Markdown-only edits retain `docs:changed`;
the existing `docs` and `architecture` full-scan triggers remain.
A mixed docs and code change still runs the code gate. Version 1 changed reports
are editing feedback: their `coverage: changed` label does not claim that typed
lint or the full gate ran. `bun run check` remains the complete required gate.
This corrects routing inside the existing development-tooling boundary; it adds
no production composition node, consumer adoption scope or public contract.

### Repository runtime profiles

Bun 1.4.3 is the default package manager and runtime for the explicitly listed
repository checks, Foundation and Docs CLIs. Nested package-script dispatch uses
`architecture/tooling/runtime/command.ts`; it selects Bun throughout the default
chain. Literal Node commands keep `node:test`, native TypeScript controls,
Core generation/build qualification, packed consumers and release tooling on
Node. No production package depends on these development tools.

The root `workspaces` packages/catalog are a checked projection of
`pnpm-workspace.yaml`. The latter and `pnpm-lock.yaml` remain the Node rollback
authority. Before installing, the pinned Bun parses YAML natively and rejects a
mismatched root projection. Both managers use genuine frozen lockfiles and disable
dependency lifecycle scripts. Bun uses its explicit isolated linker; existing
unknown or opposite-manager trees are rejected. `trustedDependencies: []` removes Bun's implicit
allowlist. User-script hooks remain enabled and are checked separately from
installation hooks by the compiler-floor regression.

Run `node architecture/tooling/runtime/dev.ts install` for the default profile.
Create Node rollback only from a clean committed checkout with
`node architecture/tooling/runtime/dev.ts prepare-node /absolute/new/path`.
This clones the exact source into a new external directory and projects only
`package.json` and the two manager policies. In that directory, use
`dev.ts install`, `dev.ts run check` and `dev.ts verify` through their full path
`architecture/tooling/runtime/dev.ts`. The marker is routing metadata, not
qualification evidence. Verification independently recomputes the three
projections from Git and checks all other tracked bytes against the same head.
A shared `node_modules`, an unknown profile or projection drift fails closed.

`lockfile:peers:check` always executes the real pinned pnpm manager. The Bun
profile creates an isolated manifest-only root for this lock-only graph check;
it never interprets a Bun installation as pnpm evidence. pnpm itself is a declared
catalog development dependency, so installed dispatch runs its exact CLI with
Node and preserves argv on Windows. Initial Node installation uses only the
provisioned pinned manager and a finite argument list.

The native OS matrix keeps its required aggregate names and complete obligation
inventory. Default lanes install Bun; Node 24 compatibility and Node 26 rollback
lanes each have a separate projected checkout and installation. The public
installed-archive lane stays Node. M3 also stays Node: its trusted runner
requires a clean exact-SHA source tree and scans the actual `.pnpm` compiler/parser
closure, so it uses the explicit `dev.ts install-node-qualification` command in
a fresh checkout. Only that frozen installation passes the command-local
pnpm `--pm-on-fail=ignore` manager-selection option; it preserves the original Bun source metadata
and the existing custody checks. M3's three `node-24-*` rows run the exact
`.node-compat-version` pin (24.21.0), while pack, native and collect controllers
run `.node-version` (26.11.1). Each controller compares its working pin bytes
with the exact dispatched Git source and requires that actual runtime; the
Node 24 packed-consumer guards remain unchanged. This is a Node execution/retained-pnpm graph
qualification route, separate from the projected rollback profile.
CI must prove all routes on the candidate
head; configuration alone records no successful run.

This is a fixed development-tooling relationship inside `repository.development`,
not an independently assembled capability. It creates no Core/Assembly graph
node and has no generation/resource lifetime needing the lifecycle kernel.
Shared-first review retains generic command/quality/workflow semantics in
Engineering Foundation's public CLIs, with process mechanism owned by the existing
runtime/toolchain providers. The consumer owns only its finite script roles,
version pins, install projection and CI selection (about 350 handwritten lines).
A possible shared runtime-role facade would belong to Foundation's process-execution
owner (roughly 30-50 lines), with consumer script tables and pins depending on that
port. It would add another dependency without a new invariant: generic workflow
and quality behavior already use Foundation's public CLIs, and the process
primitive is supplied by the runtime. Host install projections and version
policy remain local. Copying Foundation's complete Host runtime would duplicate
policy and lifecycle ownership. No broad reusable runtime SPI is claimed.

The current Consumer Module Standard was reviewed at upstream `300e7e1`
(full document SHA-256
`c2fe582a14ff6e79620b232ca7ffc914afb0474ec21fd43f208251dd7252f4a3`).
Compared with the SDK-growth retained `24d6557a` pin, its changes add resource
scopes, inputs, contracts, groups, observation and conformance guidance. They do
not turn this fixed tooling seam into a composition node. The separate SDK-growth
adoption remains pending under its existing profile; this change does not
silently migrate or certify that unrelated pin.

Cutover qualification is pending: the prepared Foundation 2.0.0 dependency has
not yet been published or bound to actual registry integrity; both real locks
must be regenerated together after publication, including the declared pnpm
coordinate. `bun.lock` is deliberately absent until that actual resolution is
available, and the install wrapper reports `runtime.install.bun-lock-pending`.
Required next checks are clean frozen Bun and isolated Node installations,
manager/compiler-hook regressions, native OS lanes, packed qualification and the
complete gates. The earlier Foundation 1.10.0 records above remain historical
observations and do not prove this cutover.

Retained Node tooling qualification used Node 26.11.1 by default, with Node
24.21.0 compatibility. Its root/tooling policy remains
`>=24.21.0 <25 || >=26.10.0 <27`; the public library policy keeps its Node 24.18.0
floor. Node 25, Node 26 below 26.10.0, Node 27 and malformed versions remain
rejected by the existing dependency-free version mechanism.

`runtime:preflight` is exactly `node architecture/checks/node-version.mjs` and
requires no installed repository dependencies. `precheck:changed` first runs
that guard, then reads the compiler metadata before loading Foundation. The
`quality:coverage:scope` and `lint:typed` commands run the same compiler guard
through their user-script hooks, before the wrapped public CLI commands. The isolated pnpm route explicitly
enables user-script pre/post hooks in `.npmrc`; installation scripts remain
disabled. Normal `bun run` commands and the isolated Node/pnpm route execute those hooks;
the regression also invokes the CI lane runner and a nested package script. This is not a guard for arbitrary direct CLI calls
or commands that deliberately disable hooks.
Both full and fast gates explicitly execute
`lockfile:peers:check`, `runtime:policy:typecheck` and `runtime:policy:test`
after preflight and before preparation. The peer gate validates the committed
graph with the real `pnpm peers check --lockfile-only` in an isolated Node manager root; strict frozen installation alone
does not replace it. The policy compiler gate uses the pinned TypeScript 7.0.2
compiler and the existing strict NodeNext configuration, including
`erasableSyntaxOnly`, `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`. Native Node type stripping does not replace that
gate.

The retained Node 26.11.1 and Node 24.21.0 compatibility CI routes each used six independent
lanes on Ubuntu, macOS and Windows, including strict frozen installation,
committed peer validation, the complete gate union and tracked workspace
integrity. The governance lane explicitly executes policy typechecking and
tests. The existing installed public archive compatibility lane remains
separate. Docs Protocol is pinned exactly to `0.6.2`, the published stable
successor declaring Node `^24.18.0 || ^26.0.0`; `0.6.0` excludes Node 26.
The `portable-v1` profile and schema remain unchanged. The Node 24.21.0 and
Node 26.10.0 root routes, with the exact Docs `0.6.2` closure, strict frozen
installations under pnpm 11.20.0, Foundation and Docs checks and the complete
mandatory gates, were qualified by genuine CI on all three operating systems in
PR #149 (merge `557b713`). The Node 26.11.1 default and the Node 24.21.0
compatibility routes are verified by the exact-head CI of each change, which must
pass on both before merge; this document records no CI result for any head. This does not change the published packages. This mapping
and repository gate declare no managed cohort binding, installer authorization,
production qualification of a product or release eligibility.

`bun run quality:critical:test` runs the existing source dependency and quality
activation entries through `agent-teams-node-test`. Its consumer checker binds
the complete selected file command and the SHA-256 of the reviewed required
identity contract. Fast and full gates execute this route; other tests retain
their existing Node runners. The consumer inventory has no OS exceptions.
Disposable regressions reject missing identities, skip, todo, late failure,
removed selected files and changed contracts, and exercise an exact Windows-only
fixture exception on POSIX.

| Installed mechanism | Applicability and enforcement | Command |
| --- | --- | --- |
| Root runtime and committed peers | Dependency-free preflight; explicit strict policy typecheck and tests in full/fast gates; committed peer validation after frozen installation | `bun run runtime:preflight`, `bun run lockfile:peers:check`, `bun run runtime:policy:typecheck`, `bun run runtime:policy:test` |
| Source dependencies v3 | Root development tooling, Core, Assembly, lifecycle kernel, resources, conformance and observation; preserve declared roots, generated output and dependency budgets | `bun run foundation:check` |
| Source coverage and typed quality | All declared compiler projects; missing inputs fail; the default unknown assertion bridge gate remains active with no admissions | `bun run quality:coverage:scope`, `bun run lint:typed` |
| Suppression governance | All six production source roots, no waivers | `bun run foundation:check` |
| Required Node execution | Eleven critical identities in three existing files; complete selected file list is bound | `bun run quality:critical:test` |
| Documentation, decisions, workflow and dependency declarations | Existing installed profiles and repository routes remain active | `bun run foundation:check`, `bun run docs:protocol:check` |
| Public API compatibility | Existing v1 profiles and released baselines; baseline mutation guard retained | `bun run foundation:check`, `bun run release-owned-files:check` |
| SDK growth authority | Current installed verifier and disposable qualification; activation remains pending without external authority | `bun run sdk-growth:check` |
| JSON schema release evolution and executable specifications | No installed release profile/catalog adopted; current immutable contracts use their existing owner gates | `bun run contracts:check`, `bun run governance:check` |
| Protobuf, property testing and repository security capabilities | No adopted capability profiles; no protobuf production root or property-testing toolchain is declared | Review `foundation.config.yaml` and `package.json` |
| Scaffolding, local mode and native managed processes | No requested scaffold owner, native boundary or managed adapter; registry mode remains required | `bun run foundation:assert-registry` |

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
