---
id: ARCH-CURRENT-CONTRACT
type: architecture
status: active
owner: architecture
summary: Explains the one current pre-1.0 contract and separates public naming from immutable qualification evidence.
related:
  - ADR-0005
  - ADR-0006
  - ADR-0007
  - ADR-0009
  - ADR-0010
  - ADR-0012
  - ADR-0013
  - ADR-0014
  - ADR-0015
  - ADR-0016
  - ADR-0017
  - ADR-0018
  - ADR-0020
  - ARCH-SELF-COMPOSITION-GUIDE
  - OD-004
  - OD-005
  - OD-006
  - GM-REQ-V1
---

# Current contract

This document is the navigation and implementation guide for the current
pre-1.0 contract. It does not replace an accepted ADR or mutate immutable
qualification artifacts.

The [compiler engineer handbook](../qualification/compiler-engineer-handbook.md)
maps the seventeen diagnostic prerequisites to input evidence, partial-failure
rules and independent examples. ADR-0018 resolves its cyclic-depth gap. Other
fact-derivation gaps follow existing accepted behavior; only a behavior change
requires successor authority. The checker is not the specification.

## Accepted contract and public naming

Get Modular has one accepted contract. Private features in `packages/core`
currently implement owned canonicalization, inert authoring contracts,
bounded diagnostic ordering and immutable plan output with its digest.
Admission now has a private synchronous object-admission stage for the accepted
cooperative invocation record and dense ordinary declaration list. It proves
batch resource bounds before allocating document snapshots, admits complete
documents independently, and streams unique schema and admission-resource
diagnostics into the caller's per-invocation collector. Failed declarations
provide no partial semantic records; an incomplete admission census cannot
prove absent identities. Accepted documents are copied and deeply frozen.
Unknown versions suppress supported-schema checks; integer-format failures
remain distinct from type failures. One iterative identity grammar precedes
identifier-byte accounting. Admission also enforces ADR-0007's additional
`many.min <= many.max` constraint: inverted definitions produce
`schema.invalid-value` with an invalid-format reason at the cardinality object,
and that declaration supplies no partial semantic records. This refinement is
stronger than JSON Schema alone and precedes binding-count validation.
Oversized provider lists retain bounded,
owned resource-only counts separately from an admitted semantic profile.
Semantic resource checks consume these counts after establishing the relevant
selection/consumer/slot evidence; they cannot create graph edges or plan bindings.
Malformed wrapper/carrier classifications remain outside this stage's claimed
domain. Admission now exposes its owner-local typed port and pure, zero-slot
module factory; the snapshot and resource algorithms stay private.
Composition semantics now has private iterative graph algorithms for an
already bounded, resolved selected graph of wholly valid binding edges. They
compute stable SCC membership, ASCII-minimal dependency order, original
consumer-to-provider closure and the ADR-0018 residual DAG depth. Graph failures
stream into the same caller-owned collector; cycles preserve their diagnostics
and depth overflow saturates at 2049. Operation counters cover distinct
adjacency traversal and bounded ready/traversal state. These algorithms do not
establish declaration/binding prerequisites or authorize an unreachable
diagnostic from an incomplete frontier. The graph implementation has no
cross-feature entry and does not consume admission.
Private declaration and profile censuses now inspect owned, whole-schema-valid
documents, preserving identity occurrences and explicit ambiguous lookups.
Legal alternative implementations of one module remain distinct. Duplicate
capability/slot paths use positions in their identity-sorted declaration lists;
normalized candidates are deduplicated before collection. Incomplete
declaration admission withholds census-dependent absence claims, while positive
duplicates and independent profile failures continue. Selected IDs, resolved
node/root observations and selection uniqueness remain separate values; none
alone proves graph eligibility or compiler success. Private binding validation
now resolves selected consumers, their unique slots and provider occurrences.
It checks explicit binding presence, cardinality, duplicate providers,
selection, capabilities and exact compatibility independently where eligible.
Missing optional records remain failures; explicit empty rows remain bindings.
Unknown or ambiguous records never supply a chosen value. Known unselected
consumers remain inert. Only wholly valid rows contribute provider references;
one invalid reference excludes the entire row. Per-consumer frontier observations
retain unrelated valid frontiers and do not themselves authorize unreachable
diagnostics. The stage consumes owned, fully admitted inputs with unique binding
records; it does not select M2 repeated-record behavior. It retains borrowed
rows and continues independent checks after a graph-edge budget failure.

A private semantic analysis now joins these operations using a consumer-owned
input contract, without importing admission. It counts selected provider
occurrences before validation, reports graph/many limits with their fixed
prerequisites and saturated values, and builds a graph only from complete
schema-valid profile data within the edge budget. Complete valid bindings
supply its edges. Unreachable diagnostics require every selection, including
non-root rows, to resolve to its module's unique implementation and every
reached consumer to have a complete valid frontier. Unrelated errors preserve
independent positive cycles. The collector finishes after all eligible checks;
any diagnostic prevents a plan. Success contains a deeply frozen normalized
plan, with original many-provider order and deterministic roots, selections,
bindings and dependency order. Digest emission stays in the output feature.
The semantics module factory receives only its declared canonicalizer slot and
creates a fresh diagnostic collector for each invocation. Admission and analysis
share that collector; neither factory owns mutable invocation state. The driven
canonicalizer and admitted-input shapes belong to the consuming feature and
join their providers structurally. Foundation permits feature consumers to
import these contracts while keeping concrete factories and algorithm files
behind separate implementation boundaries. The compiler facade now connects
admission, analysis and output through three driven ports. The literal direct
root supplies one canonicalizer to semantics and output. Each call owns its
input synchronously before awaiting output; internal primitive failures reject
the Promise and never become diagnostic records.
The build-only own profile aggregates the real five declaration handles and
compiles through both direct and production entries into its independent
five-node, five-binding expected plan. Its allowlist keeps static declaration
and factory references outside the production closure. The private root exports
its provided port, while the public entries annotate only the accepted compiler
signature. A separate seed build now binds the qualification-only canonicalizer
to both consumer slots. The fixed-input digest changes and restores on rebinding;
the actual semantics factory reverses the accepted private detail operands while
preserving SCC order. Two isolated consumer mutants prove that calling a provider
without using its returned bytes is insufficient. Production and packed inventory
checks exclude the variant. The independent finite static witness now checks
both direct roots against their plans, resolves declaration/factory imports and
allowlist text to the same source exports, and checks the provided-port root.
Its mutations reject compatible-factory substitutions even when value and text
are changed together. The M1 checkpoint A tests combine this construction proof
with the behavioral replacement; generated wiring and W0/W1 remain M3 work.
Tests connect the actual admission, semantic and output implementations against
independent object diagnostic, plan and digest expectations. The public barrel
and separate direct qualification entry now execute the accepted complete
object diagnostic partitions, normalization permutations, eight mixed
cycle/depth recipes, complete P500 plan/digest and ADR-0020 coverage vectors.
These source-build checks are not a completed M1. Disposable packed-consumer
regressions also execute the same object expectations through the installed
package root. They verify Node import/require identity, closed deep imports,
conditional resolution and the four TypeScript modes with 1000 literal
declarations. Negative modes assert their exact diagnostic codes. These tests
do not retain publication evidence or establish a minimum TypeScript version.
Diagnostic producers still need to normalize and deduplicate their eligible
candidates before collection. Public resource regressions now cover the object
admission and semantic limits at their boundaries, including complete scaled
plans, large diagnostic streams, saturation and prerequisite suppression.
The same injected-subject cases run through production, direct and installed
package entries. Raw limits remain outside M1; private operation counters and
diagnostic-path truncation are not claimed as public observations. Exhaustive
archive and declaration audits, minimum-version consumers, own-graph witness
and retained archive custody remain pending. Accepted
ADR-0009 names the one pre-1.0 public surface: `compileComposition`,
`compileCompositionJson`, `defineModule`, `required`, `optional`, `many` and
the types `CompileCompositionResult`, `ModuleDeclaration`,
`CompositionProfile`, `CompositionPlan`, `Diagnostic`, `DiagnosticCode` and
`PlanDigest`. The
accepted evidence names `compileCompositionV1` and `compileCompositionJsonV1`
remain only inside the immutable qualification artifacts, the checkers under
`architecture/checks` that validate them and the qualification harnesses under
`tests/qualification` that execute those checkers;
no production source uses a generation-suffixed name.

ADR-0010 remains proposed until it passes the repository's governed acceptance
flow. Until then, no production package may silently choose a dependency
policy. Production source uses the ADR-0009 names from its first commit; before
1.0 a breaking change replaces the current export set, raises the `0.x` minor
version and is recorded in the package changelog with the consumer migration,
as ADR-0009 requires. Production package source still requires the authority
closure described below.

## What the version labels mean

The repository contains immutable qualification material created before the
public package exists. Its paths and IDs retain historical labels such as
`requirements/module-system-v1`, `contracts/v1`, `compileCompositionV1`, and
`resource-profile-v2`. These labels identify evidence lineage and must not be
interpreted as supported application API generations.

The following are deliberately different concepts:

| Label | Meaning | Public API generation? |
| --- | --- | --- |
| `schemaVersion: 1` | Inert persisted data-format discriminator | No |
| `familyVersion: 1` | Version of the closed capability-compatibility family | No |
| `profileVersion: 2` | Revision of the measured qualification artifact | No |
| `V1` in a path or evidence ID | Immutable historical contract evidence | No |
| `V1` in a TypeScript identifier | Prohibited by accepted ADR-0009 outside immutable qualification artifacts, their checkers and the qualification harnesses | No |

Applications do not select a resource profile by filename or version. The
current qualification contract uses one effective resource policy. An older
profile remains only as immutable historical evidence and is not a second
runtime option.

## Effective resource policy

The effective profile is the flat profile recorded in
`architecture/qualification/v1/resource-profile-v2.json`, with profile ID
`get-modular/resource-profile/v1-standard`. Its filename and
`profileVersion: 2` are retained because ADR-0007 and its qualification ledger
are immutable. They do not create a negotiable profile version.

The older
`architecture/contracts/v1/resource-profile.json` is historical base evidence.
Implementations must not merge both files, choose one based on chronology, or
expose both as configuration. The effective limits are read as one closed set,
including separate declaration and profile raw-byte limits and
`jsonValueOccurrences`.

The complete repository gate runs the effective resource qualification through
`contracts:test`, which invokes the same executable proof as the separately
available unversioned command `pnpm qualification:resource-profile`. The test
and evidence filenames retain their historical names for custody and
traceability.

Accepted [ADR-0020](../decisions/0020-define-diagnostic-coverage-outside-object-resource-admission.md)
narrows diagnostic coverage only outside object resource admission. Within the
JSON occurrence/string/depth envelope, complete eligible diagnostics remain
deterministic under the existing equivalence. Outside it, reject with a
truthful named saturated resource failure and no plan/digest; the selected
limit and diagnostic subset may change with enumeration. Batch value/string
failure prevents all document snapshots and resource-only profile promotion;
depth is document-local. Preserve established shallow aggregates and earlier
depth failures. The [coverage supplement and permitted-result vectors](../../architecture/qualification/object-resource-coverage/contract.json)
apply alongside the immutable profile, not as a configurable resource policy.
Public M1 API documentation and direct/generated qualification must carry this
boundary forward; component tests do not themselves finish those gates.

## Implementation boundary

```mermaid
flowchart LR
    Evidence["Immutable qualification evidence"] --> Contract["One current contract"]
    Contract --> Core["One accepted Core contract"]
    Core --> Host["Product-owned host"]
    History["V1/v2 labels"] -. historical identity only .-> Evidence
```

The semantic core owns inert declarations, complete profiles, graph semantics,
bounded diagnostics, immutable plans, and digests. Product hosts own
authorization, executable loading, readiness, generations, routing, drain,
recovery, and reconciliation. Extension Foundation owns artifact trust,
admission, signatures, isolation, updates, and plugin state.

No historical evidence label grants a second authority, runtime discovery,
container, lifecycle, plugin, or authorization behavior.

The source layout of `packages/core` MUST follow the adopted organization Feature
Module Standard v1 through the local
[profile](feature-module-standard.md): feature-owned slices under
`packages/core/src/features/*`, a private composition root, and one curated
public entry point at `src/index.ts` that exports the names fixed by accepted
ADR-0009; until M3 the direct root `src/composition/stage0.ts` is that
composition root, as the guide describes. The
[self-composition implementation guide](self-composition-implementation-guide.md)
names the own feature inventory, the feature skeleton, the build topology and
the emitter contract that implementation follows.

This layout applies Clean Architecture through consumer-owned ports, SOLID
through feature ownership and narrow dependency direction, DDD through one
semantic authority for the compiler domain, and DRY through one implementation
of each accepted rule. These principles do not authorize ceremonial layers,
an extra rule engine, or a second composition authority.

## Accepted implementation clarifications

Accepted ADR-0018 closes five implementation-readiness rules without accepting
ADR-0013 as a whole or resolving OD-005 or OD-006:

1. Calculate `graphDepth` on the residual DAG formed by removing every node in
   a cyclic SCC, every self-loop node, and all incident edges from the
   positive-valid-binding graph. Do not calculate a depth for a cycle. An
   independent residual overflow still emits beside cycle diagnostics. The
   limit is 2048 nodes. On overflow, `actual` saturates at 2049.
2. For raw JSON only, validate an integer lexeme against the exact mathematical
   safe-integer domain before `Number` rounding. Thus `1`, `1.0`, and `1e0` are
   admitted, while `1.0000000000000001`, `1e-400`, and every spelling of
   negative zero produce `schema.invalid-value`. Use a bounded lexeme algorithm,
   not unbounded `BigInt`. Raw exposure still waits for the combined diagnostic
   generation 2 transaction owned by OD-005 and OD-006.
3. Define public `DiagnosticCode` exactly as `Diagnostic['code']` over emittable
   diagnostic codes. Do not publish a catalog type. Reserved canonicalization
   failure remains a rejected `Promise`, not a compiler diagnostic.
4. The trusted object graph and the outer invocation wrapper and lists of both
   entry points are cooperative Host-owned data; the raw payload becomes
   untrusted bytes after carrier admission. Within the admitted domain Core
   snapshots synchronously and retains no caller aliases.
   Resource ceilings cover Core's bounded work and retained model, excluding
   unavoidable intrinsic reflection key/descriptor allocations and arbitrary
   `Proxy` execution. They do not claim impossible heap or wall-time safety.
5. A generated `0.x` archive may publish as `not-claimed` only after M3:
   the ADR-0012 packed Node and four TypeScript/type-scale cases pass, and the
   complete M3 P0/P1, W0/W1, direct/generated independent-vector,
   static/behavioral-witness, no-fallback, cold-bootstrap and generated-only
   closure proof passes. All six runtime cases remain required for
   `runtime-conformant` or `release-eligible`; release custody remains separate.

The closed [implementation-clarification supplement](../../architecture/qualification/implementation-clarifications/contract.json)
and its sibling `cases.json` pin complete mixed-graph failure results and raw
scalar numeric-admission projections. They are fixture-only evidence, not Core
source or conformance by themselves.

## Required closure before corresponding implementation

These are small contract gates, not a reason to redesign the architecture:

1. ADR-0009 is accepted: the public barrel follows its exhaustive export map,
   and the TypeScript authoring fixtures required by ADR-0007 arrive with the
   first package.
2. Accept ADR-0010 before admitting any selected production dependency adapter.
   Until then, keep external canonicalization and scanner packages behind
   development-only qualification and use the same private ports.
3. OD-004 is resolved by accepted ADR-0012: an ESM-only root export with a
   sibling `default` condition, one exact TypeScript and JavaScript resolution
   path, and the packed Node and TypeScript cases as the publication gate of
   every archive.
4. Resolve OD-006 and accept ADR-0014 or a successor before implementing
   duplicate binding-record behavior. The existing `binding.duplicate`
   coordinate describes a duplicate provider but not two records for one
   `(implementationId, slotId)`.
5. Resolve OD-005 and accept ADR-0013 or a successor before exposing raw input.
   The proposal closes the accepted byte-carrier domain and synchronous snapshot
   behavior, including detached, shared, resizable, offset, and subclass cases.
6. Resolve ADR-0013 and ADR-0014 through one diagnostic generation 2
   transaction. ADR-0007 keeps the accepted schema enum, diagnostic catalog, and
   code rank byte-identical, so a new diagnostic code needs a successor schema,
   catalog, diagnostic contract, snapshot set, checker, and qualification
   ledger. Two separate generations would duplicate those artifacts.

The first graph slice must not invent semantics for items 4 and 5. A private
normalized-value semantic compiler checkpoint may proceed after
accepted-authority preflight while excluding repeated binding records. That
checkpoint lives in `packages/core`, admitted by accepted ADR-0015. Its private
tests may execute normalized results without a digest. Only the completed M1
compiler exposes the full object result and becomes publishable under accepted
ADR-0017 with the export map and packed evidence of ADR-0012; a partial semantic
slice is not that publication subject.
Accepted ADR-0018 extends that publication path to a generated post-M3 archive
only after its full M3 gate. The governance gate admits M1 source and keeps
blocking runtime claims and the exposure of semantics owned by OD-005 and
OD-006. Inside that
checkpoint repeated binding-record inputs stay outside the claimed domain, and
the ADR-0014 semantics may be demonstrated only in fixtures until ADR-0014 is
accepted. The completed M1 compiler exposes the
accepted object entry point of ADR-0006 and ADR-0007 and does not claim the
OD-005 carrier refinements of proposed ADR-0013 or any raw-byte admission. The
raw entrypoint, the raw-carrier adapter, raw decoding, and production
dependency adapters remain gated by their corresponding decisions; the
trusted-object adapter behind `compileComposition` is admitted by accepted
ADR-0006, ADR-0007 and ADR-0017; the package carrier and
publication are governed by accepted ADR-0012, ADR-0017 and ADR-0018.

## Historical requirement wording

GM-REQ-008 and GM-REQ-010 still read "Until OD-003 is resolved, no package may
claim ... conformance." OD-003 was resolved by accepted ADR-0005, and the
requirements document is digest-pinned in the accepted authority ledger, so the
sentence is not edited. Treat that condition as satisfied: the remaining
conformance gates are the ones ADR-0007 and this document describe.

## Toolchain

The private Core toolchain is pinned in the repository rather than chosen per
package:

- TypeScript `7.0.2`, the npm `latest` release of 2026-07-08, is pinned exactly
  in the `pnpm-workspace.yaml` catalog and declared development-only.
- `tsconfig.base.json` extends
  `@agent-teams/engineering-foundation/presets/typescript/node.json` and adds
  `isolatedModules`, `isolatedDeclarations`, `erasableSyntaxOnly`,
  `declaration`, `types: []`, and `skipLibCheck`. Production emit starts at
  `src/index.ts`; the separate typecheck configuration checks every source
  feature, including an unselected implementation.
- Relative imports use `.js` specifiers in source. Do not enable
  `rewriteRelativeImportExtensions`: it rewrites emitted JavaScript but leaves
  `.ts` specifiers inside emitted declaration files.
- Tests run with `node --test` and an explicit glob. Private component tests use
  `dist-test`, public tests use production `dist`, and the direct qualification
  entry uses `dist-stage0`. `architecture/tooling/build-core.mjs` cleans those
  three output trees and runs their pinned TypeScript configurations, so stale
  files cannot survive narrowing of the production entrypoint. Qualification
  tooling stays outside the production source closure and package allowlist.
- The `core:typecheck`, `core:build`, and `core:test` scripts run the first
  private package and are included in `check:fast` and `check`. The
  root script list is closed: `architecture:feature-module-profile` fails with
  "must use its exact closed pnpm command chain" until the same pull request
  updates the script definitions in
  `architecture/checks/feature-module-standard-profile.mjs`. That update is
  part of the first package change, not a separate follow-up.

## Historical evidence rule

Never rename or edit accepted evidence solely to remove a historical version
label. A change to current semantics requires a successor decision, a new
ledger, and new executable evidence. Accepted ADR-0009 makes the public API
one unversioned pre-1.0 surface until a concrete requirement proves that
concurrent public generations are necessary.
