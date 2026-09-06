---
id: ARCH-MVP-IMPLEMENTATION-ROADMAP
type: architecture
status: active
owner: architecture
summary: Phased implementation roadmap for the reusable Get Modular Core, conformance package, and first product dogfooding.
related:
  - ADR-0001
  - ADR-0003
  - ADR-0004
  - ADR-0005
  - ADR-0006
  - ADR-0007
  - ADR-0008
  - ADR-0009
  - ADR-0010
  - ADR-0011
  - ADR-0012
  - ADR-0013
  - ADR-0014
  - ADR-0015
  - ADR-0016
  - ADR-0017
  - ADR-0018
  - ADR-0020
  - ARCH-FEATURE-MODULE-STANDARD
  - ARCH-SELF-COMPOSITION-GUIDE
  - ARCH-SYSTEM-BOUNDARY
  - GM-REQ-V1
  - OD-004
  - OD-005
  - OD-006
---

# MVP implementation roadmap

This document is the implementation roadmap, not a replacement for an
accepted ADR. It deliberately describes the order and evidence required to
build the first reusable Core. It does not accept new public API, change an
accepted decision, or claim that a qualification fixture is production code.
ADR-0010, ADR-0011, ADR-0013 and ADR-0014 are proposed decisions on the
selected base unless their accepted successors are present; ADR-0009,
ADR-0012, ADR-0015, ADR-0016, ADR-0017 and ADR-0018 are accepted. The proposed decisions
do not enter accepted authority, the
open-decision blocker catalog or executable governance until accepted through
the repository decision flow.

The MVP goal is:

```mermaid
flowchart LR
    Contract["One current contract"] --> Declarations["Inert declarations"]
    Declarations --> Compiler["Pure deterministic compiler"]
    Compiler --> Plan["Immutable plan + digest"]
    Plan --> Conformance["Independent conformance"]
    Conformance --> Core["Qualified Core 0.x"]
    Conformance -. later adoption .-> Consumer["One real product adapter"]
    Consumer --> Second["Second consumer verdict"]
```

Get Modular owns composition semantics. Product Hosts still own authorization,
executable loading, readiness, generations, routing, drain, recovery and
reconciliation. Extension Foundation owns artifact trust, signatures,
distribution, isolation and plugin state. No phase may create a second owner
for those concerns.

## Agent execution route

Give each implementation task this roadmap and one explicit milestone/phase
slice. The complete roadmap is context; it is not permission to implement
all phases, accept proposed decisions, publish, or change another task's
files. Use the following route before choosing an implementation.

### Required reading and authority

1. Read [repository instructions](../../AGENTS.md), the
   [system boundary](system-boundary.md),
   [current contract](current-contract.md),
   [requirements](../requirements/module-system-v1.md) and
   [Feature Module Standard mapping](feature-module-standard.md).
   These define ownership, public semantics and dependency direction.
2. Read the [decision index](../decisions/README.md) and
   [open-decision index](../open-decisions/README.md), then the accepted ADRs
   linked for the assigned phase below. Read the decisions themselves, not
   only their titles. Apply only explicit successor precedence:
   [ADR-0018](../decisions/0018-close-implementation-readiness-rules.md)
   and [ADR-0020](../decisions/0020-define-diagnostic-coverage-outside-object-resource-admission.md)
   are narrow refinements, not acceptance of the remaining proposals.
3. Read the entire assigned phase, the applicable
   [callable-matrix row](#per-phase-callable-matrix),
   and its direct prerequisites. For code layout and internal dependencies,
   read the [self-composition guide](self-composition-implementation-guide.md)
   even when the task only implements direct M1. Its five-module graph and
   feature-owned libraries are the existing structure, not optional examples.
4. Open the linked machine-readable contracts, cases and expected results for
   every behavior the task changes. The
   [requirement traceability](../traceability/module-system-v1.yaml),
   [source map](../provenance/source-map.yaml),
   [accepted authority ledger](../../architecture/authority/accepted-authorities.json),
   [contract ledger](../../architecture/authority/accepted-contracts.json),
   [qualification ledger](../../architecture/authority/v1-qualification-ledger.json)
   [clarification ledger](../../architecture/authority/implementation-clarifications-ledger.json)
   and [object resource coverage ledger](../../architecture/authority/object-resource-coverage-ledger.json)
   locate their exact authority. Follow relevant normative references through
   to their source. A missing or inaccessible source is an explicit task gap;
   a title, search excerpt or historical report cannot replace its contents.

The current contract, this roadmap and the handbook explain accepted authority;
they do not override it. A checker pass alone cannot establish untested runtime
behavior. Do not copy historical API suffixes into production or select a
resource profile by filename. When two sources appear inconsistent, first
check their status and explicit precedence; report any unresolved conflict with
the smallest concrete input and competing outcomes before coding that rule.

### Phase reading and delivery map

Read the common route above for every task. The table adds the minimum
phase-specific sources, the work boundary and the evidence the next task needs.
Follow the phase's full exit criteria as well as this navigation table.

| Phase | Additional required sources | Bounded output and next dependency |
| --- | --- | --- |
| [0: preflight](#phase-0-contract-and-evidence-preflight) | [ADR-0015 source admission](../decisions/0015-block-publication-surfaces-and-runtime-claims-while-decisions-stay-open.md), [ADR-0017 M1 publication](../decisions/0017-publish-pre-1-0-releases-while-raw-carrier-and-duplicate-record-decisions-stay-open.md), [recorded start](#recorded-core-start), all five ledgers above | Exact base/head, applicable authority and exclusions, existing gate results; no Core source. The no-package exit condition is for initial preflight, not every later task. |
| [1: package boundary](#phase-1-package-topology-and-private-composition-boundary) | [ADR-0003 package identities](../decisions/0003-select-public-package-identity-and-initial-topology.md), [ADR-0009 names](../decisions/0009-keep-pre-1-0-public-api-unversioned.md), [ADR-0012 packed carrier](../decisions/0012-select-esm-only-root-package-carrier.md), [source admission](feature-module-standard.md#source-admission), [build topology](self-composition-implementation-guide.md), [first publication mechanics](#first-not-claimed-publication-mechanics) | Package and Foundation source boundaries land with substantive behavior from phases 2-4; packed publication waits for complete M1. An empty barrel or package is not a finished slice. |
| [2: authoring](#phase-2-declarations-profiles-and-capability-slots) | [ADR-0004 data contract](../decisions/0004-freeze-v1-portable-composition-contract-and-plan-digest.md), [ADR-0006 normalization](../decisions/0006-clarify-v1-compiler-normalization-and-entry-points.md), [ADR-0007 helper contract](../decisions/0007-require-executable-v1-conformance-amendments.md), [composition schema](../../architecture/contracts/v1/composition.schema.json), [own feature inventory](self-composition-implementation-guide.md#own-feature-inventory) | Inert authoring helpers and wire types with positive/negative TypeScript fixtures; compiler remains the sole validator. Pass these types to admission/semantics without exporting private ports. |
| [3: semantic compiler](#phase-3-normalization-and-deterministic-graph-compiler) | [ADR-0005 diagnostic/resource base](../decisions/0005-freeze-v1-compatibility-diagnostics-and-resource-profile.md), ADR-0006/0007 above, ADR-0018/0020, [object coverage contract and cases](../../architecture/qualification/object-resource-coverage/contract.json), [handbook and error-combination worksheet](../qualification/compiler-engineer-handbook.md#m1-error-combination-worksheet), [diagnostic contract](../../architecture/qualification/v1/diagnostic-contract.json), [snapshots](../../architecture/qualification/v1/diagnostic-snapshots.json), [normalization vectors](../../architecture/qualification/v1/normalization-vectors.json), [effective limits](../../architecture/qualification/v1/resource-profile-v2.json), [resource boundaries](../../architecture/qualification/v1/resource-boundary-vectors.json), [clarification cases](../../architecture/qualification/implementation-clarifications/cases.json) | Owned admission, graph and diagnostic behavior with partial-failure expectations; private normalized success may omit digest. Full public success waits for phase 4's output implementation. |
| [4: output and self-composition](#phase-4-immutable-plan-canonical-bytes-and-self-composition) | [ADR-0008 finite self-use](../decisions/0008-bounded-internal-engine-self-composition.md), [ADR-0016 dependency records/witness](../decisions/0016-close-the-dependency-record-seam-and-construction-witness-for-self-composition.md), ADR-0018, [canonical vectors](../../architecture/contracts/v1/canonical-vectors.json), [canonicalization refinements](../../architecture/qualification/v1/canonicalization-vectors.json), [emitter/build/witness guide](self-composition-implementation-guide.md) | First deliver direct plan/digest and full M1 results. Later M3 delivers finite generation, direct/generated parity and construction proof; do not make the first part wait for the second. |
| [5: conformance and scale](#phase-5-conformance-and-scale-proof) | ADR-0007/0008/0012, [case manifest](../../architecture/qualification/v1/qualification-case-manifest.json), [decoder vectors](../../architecture/qualification/v1/decoder-vectors.json), all evidence applicable to the selected subject, [governed qualification format](../metadata.schema.json), [custody proposal and stop point](../decisions/0011-define-private-self-composition-evidence-and-release-custody.md) | Run independent expectations against actual subjects; record exact inputs, outputs and excluded cases. Full runtime promotion and custody need their accepted authority; fixture validation is not subject execution. |
| [6: product dogfooding](#phase-6-first-product-dogfooding) | System boundary and requirements, [capability migration and admission](#capability-evolution-and-namespace-admission), the actual consumer's accepted adoption decision | Optional product-owned adapter and observed integration results. The consumer owns factory failures, lifecycle and rollback; a second consumer gates only the broader extraction/stability claim. |
| [7: reserved](#reserved-phase-7-extensionplugin-boundary) | System boundary | No implementation task, package, runtime or gate. |
| [8: release/conformance](#phase-8-release-and-conformance-checkpoint) | ADR-0008/0012/0017/0018, the accepted successor to ADR-0011 if one exists, [release-custody prerequisites](#phase-4-release-custody-prerequisites) | Exact retained archive, required runtime/custody evidence and recovery proof; publishing remains a separate authorized action. Phase 6 is optional and phase 7 is skipped. |

M2 is a milestone spanning the existing admission, semantic and output phases,
not an omitted numbered phase. Before production raw or repeated-record implementation,
read [OD-005](../open-decisions/OD-005-raw-input-carrier-semantics.md) and
[OD-006](../open-decisions/OD-006-duplicate-binding-record-diagnostics.md),
[ADR-0013](../decisions/0013-close-trusted-object-and-raw-carrier-semantics.md)
and [ADR-0014](../decisions/0014-close-duplicate-binding-record-semantics.md).
Their combined successor transaction must be accepted, preserve ADR-0018 and
update the owner scope before those excluded semantics are implemented.
The existence of proposed text never supplies that acceptance.
Independent successor fixtures and Node oracle tooling may be prepared under
`tests/qualification` before acceptance. Execute the same inventory against the
real Core subject after acceptance and scope expansion, before exposing M2.

An external production primitive additionally requires accepted
[ADR-0010 or its successor](../decisions/0010-select-replaceable-primitives-for-the-first-core-implementation.md).
Until then M1 uses the owned implementations behind the existing ports. The
TypeScript fixture task records the minimum supported compiler separately
from the pinned build compiler, exercises the claimed versions with
`skipLibCheck: false`, and covers literal inference, `satisfies`, excess-field
limits and the non-validating runtime helper contract before publication.

### Assigning a bounded task

The task message must contain concrete values for:

- base commit and predecessor checkpoint; named milestone and exact phase
  subsection, with its required reading links;
- one owner and explicit file/directory ownership, including shared files such
  as the barrel, root scripts, build configuration and composition root;
- input/output contract, accepted behavior, non-goals and applicable open
  decisions; link the canonical contract instead of copying a second version;
- the smallest independently testable behavior, its positive/negative
  expectations, meaningful failure mutations, and the later gate still pending;
- exact existing commands to run, or a requirement to add the first package's
  focused command and wire it into the closed root chain in the same change;
- expected handoff: source/patch identity, executed checks, concrete remaining
  gaps and a narrow revert point.

The integration owner supplies the fixed base and shared-file ownership.
Parallel tasks may read shared contracts; they must not concurrently redefine
ports, fact meanings or public types. Start dependent tasks from a reviewed
predecessor or explicitly supplied accepted interface. Do not generate empty
stubs merely to unblock a dependent task. Split by cohesive behavior, not by
assigning an entire overlapping phase to each writer.

### Verification and completion

Use [package scripts](../../package.json) and the
[Foundation workflow](../../architecture/foundation/repository-agent-workflow.yaml):
`pnpm check:changed` while editing, `pnpm check:fast` before handoff, and
`pnpm check` for the completed change. The
[CI workflow](../../.github/workflows/ci.yml) is the repository gate; its host
matrix is not the Core runtime-conformance matrix. No package build/test command
exists until the first package introduces it. Update the exact script chain
and its guard together as the current contract requires; never mark a future
command or absent subject as passed.

A phase's implementation is complete only when its scoped behavior and focused
checks pass. A milestone is complete only when its actual subject passes the
full applicable exit gate. A merged algorithm slice can therefore be complete
while M1 qualification is still pending. Record an unavailable future subject
as pending, and a deliberately excluded behavior as out of scope with its
controlling decision. Neither counts as successful evidence.

### Example first M1 task

A useful first source task is the owned canonicalization feature, with the
minimum package and source-admission tooling needed to execute it. This is a
private behavior slice of phases 1 and 4, not a completed public compiler.
The integration owner fills in the reviewed base SHA and a single task owner
before dispatch and assigns these files to that owner:

- `packages/core/src/features/canonicalization/` and its focused tests;
- the Core package/build configuration and the root scripts, closed-chain
  checker and Foundation source-dependency configuration required for admission.

Read the common route, the phase 1 and phase 4 sources in the table, and the
guide's [feature skeleton](self-composition-implementation-guide.md#feature-skeleton-in-typescript).
Implement the owned canonical-bytes port against the accepted canonical vectors
and diagnostic-detail ordering inputs. Keep domain separation and hashing with
plan-output; this task does not implement them. Use no external production
adapter while ADR-0010 remains proposed.

The handoff contains an executing feature factory, its owner-local declaration
and port, byte-for-byte vector results and focused rejection/mutation checks,
plus the actual `core:typecheck`, `core:build` and `core:test` commands added to
the existing gate chain. Introduce only types needed by this slice in their
declared owner. The manifest uses the accepted carrier shape, but the public
barrel, full compile result, own-profile execution and packed-consumer evidence
remain pending until their implementations exist. No empty facade, fake digest
or partial public compiler stands in for them, and nothing is packed or
published by this task. The next task starts from this reviewed implementation
and its port, without redefining that port in parallel.

### Dependency-safe parallel delivery

Use one integration owner for the source baseline, shared scripts, public barrel,
build configuration and composition root. A task may delegate a shared file to
one named writer for one checkpoint; two writers never own it concurrently.
The execution manifest records worker settings and resource limits separately
from this product roadmap.

1. Complete Phase 0 and integrate the agreed documentation and fixture fixes
   into the exact implementation base. Start the
   [first M1 task](#example-first-m1-task) from that base. In parallel, an
   independent qualification owner can map accepted vectors and design missing
   black-box cases without importing the implementation or changing accepted
   evidence. Candidate M2 fixture research remains outside production source.
2. After package admission, deliver authoring and the wire types in their
   existing owner. Once those types and the canonicalization port have a
   reviewed implementation, diagnostics and plan-output can proceed under
   separate ownership. A downstream writer may prepare independent tests while
   waiting for its prerequisite, but cannot invent a competing interface.
3. Deliver trusted-object admission and graph semantics as separate behavior
   slices when their actual input, diagnostic and normalized-output seams are
   available from reviewed predecessors. If a seam is still missing, first
   finish its owner's smallest working slice. Parallelize only work whose
   prerequisite contracts already exist; a dependency arrow is not a stub.
4. The integration owner connects the reviewed features through direct stage0
   and the facade, then completes M1's public result, barrel and packed checks.
   Independent reviewers inspect completed exact commits while writers work on
   non-overlapping next slices. Run the integrated public-boundary tests after
   connection; separate unit passes cannot establish integration correctness.
5. Continue with the accepted M2 extension, then M3 construction, following the
   [callable matrix](#per-phase-callable-matrix). Qualification tooling and
   independent cases may develop alongside the corresponding implementation.
   M3 runtime cases can execute in parallel against the same retained archive;
   no platform job rebuilds or repacks it. Optional consumer adoption waits for
   its own admission and cannot become a hidden dependency of Core delivery.

Each writer receives an isolated checkout, exact base commit, bounded ownership,
required reading and executable handoff contract. Writers preserve other work
and return a verifiable patch or commit with focused evidence. Integration is
sequential: verify the parent and patch, apply one checkpoint, run the affected
integration checks, and give dependent writers the resulting commit. Do not
transfer a dirty workspace as authority or silently accept an old-base result.
Testing worker launch, provisioning or assignment uses disposable test projects,
never an unrelated real product. Runtime limitations on Git writes require a
verified patch handoff to the integration owner, not repeated failed commits.

### Phase Definition of Done and evidence map

This table indexes the phase exit criteria; it does not replace their complete
case inventory or accept a proposal. Apply the
[verification commands](#verification-and-completion) at every checkpoint.
Package-specific commands listed there are introduced with the first package,
not assumed to exist during Phase 0.

| Phase or milestone | Required result and focused evidence | Completion boundary |
| --- | --- | --- |
| [0](#phase-0-exit-criteria) | Exact base, accepted authority and scope map; existing complete gate in a disposable checkout; no unresolved accepted-contract blocker. | Preparation only; later changes recheck affected authority instead of repeating the no-source condition. |
| [1](#phase-1-exit-criteria) | Substantive feature plus source admission and positive/negative dependency fixtures; later complete barrel, packed export/deep-import/inert-import and declaration audits. | Source setup can finish first; the full phase waits for M1 and applicable packed consumers. |
| [2](#phase-2-exit-criteria) | Actual inert helpers and owner-local types; positive/negative inference, cardinality and excess-field fixtures; non-validating runtime behavior. | Helpers and compiler validation have one owner each; required packed TypeScript modes and 1000-declaration proof join M1. |
| [3](#phase-3-exit-criteria) | Actual admission, graph and diagnostic seams pass independent complete expectations, invalid-input combinations, permutation and accepted resource boundary cases. | Private normalized success may finish before digest; public success waits for Phase 4. No raw or repeated-record claim enters M1. |
| [4, direct M1](#phase-4-qualification-exit) | Accepted canonical bytes, domain-separated digest, immutable output, immediate caller mutation and failure rejection; the facade executes complete object results. | The actual M1 subject passes the Phase 3/4 public-boundary and ADR-0012 packed/type-scale gates; record `not-claimed` and explicit exclusions. Upload is a separate action. |
| [M2 across phases 2-4](#per-phase-callable-matrix) | Accepted combined OD-005/OD-006 successor and expanded owner scope precede production code; real raw/object boundaries replay the successor fixtures, exact numeric rules and carrier/concurrency cases. | No proposed fixture or passing oracle substitutes for acceptance or an executed Core subject. Only then expose the raw entrypoint. |
| [4, generated M3](#phase-4-qualification-exit) | Finite generation, P0/P1 and W0/W1 equality, independent vectors, static/behavioral witnesses, binding replacement, poisoned/cold bootstrap, no fallback and generated-only closure. | Qualify the separate direct archive and the exact retained generated production archive; the latter also passes packed/type-scale checks. Equality from another archive is insufficient. |
| [5](#phase-5-exit-criteria) | Actual-subject conformance and accepted resource/counter proofs; for runtime claims, all six manifest cases execute, with no skipped case counted as passed. | Without accepted custody, finish with reviewed hash-bound evidence and `not-claimed`; no invented support or promotion records. |
| [6](#phase-6-exit-criteria) | An admitted real consumer uses the retained stage1 archive; test its own failure and partial-construction rules plus any applicable cutover and rollback rules, and measure actual wiring changes. | Optional. No consumer admission means pending adoption, not a fake product test; a second consumer gates only the broader extraction claim. |
| [7](#reserved-phase-7-extensionplugin-boundary) | No implementation or test suite. | Reserved and not applicable; never count it as delivered runtime functionality. |
| [8](#phase-8-exit-criteria) | Accepted custody and exact archive evidence, all applicable release gates, cold recovery, explicit publication approval and post-upload byte-identical registry read-back. | Release eligibility, actual upload and completed publication are distinct. Missing approval or custody blocks this checkpoint, not completed earlier slices. |

For every code checkpoint, the implementation and relevant independent tests
must execute; no placeholder, skipped required case or successful schema-only
check can stand in for the subject. The independent reviewer checks accepted
semantics, dependency direction, error combinations and the adequacy of tests,
not only formatting. Resolve confirmed correctness, boundary, security and
contract findings with a regression case before completion; an unresolved
behavior choice blocks only its dependent work. Record the exact source and
artifact, commands and results, review disposition, exclusions and revert point
in the task's handoff. One final complete gate runs on each mergeable head;
repeat it only when changed inputs or unresolved evidence require it.

## MVP boundary

| Required for qualified Core 0.x | Later checkpoint or reserved capability |
| --- | --- |
| One public `@get-modular/core` package: direct M1 `not-claimed` publication under ADR-0017, and generated post-M3 publication only after ADR-0018's full M3 gate | Dynamic runtime plugin installation |
| Inert module declarations and complete profiles | Hot unload and live replacement |
| `required`, `optional`, bounded ordered `many` | Cordis as a Host resource adapter |
| Normalization, graph validation and immutable plan | Process/WASM plugin hosts |
| Bounded deterministic diagnostics and digest | Frontend Module Federation loader |
| Public development-only `@get-modular/conformance` identity after its own surface gate | Managed catalog and registry service |
| Pack-once Core subject and independent conformance | First product-owned composition adapter; runtime readiness and generation engine |

### Current delivery priorities

The current delivery priority is usable static module composition and the
M1, M2 and M3 roadmap milestones, preserving each milestone's decision
prerequisites. Dynamic plugin installation, hot replacement,
execution isolation and durable recovery are explicitly deferred future work.
They are not prerequisites for this MVP and must not grow its implementation
or acceptance gates. Any later implementation still belongs to the appropriate
Product Host or extension boundary; deferral does not assign lifecycle to Core.

A static construction helper is a separate question from those deferred
capabilities. [ADR-0001](../decisions/0001-product-neutral-deterministic-module-composition.md)
and [GM-REQ-014](../requirements/module-system-v1.md#gm-req-014-construction-is-not-activation)
permit an optional narrow helper receiving already selected, authorized
factories. The consumer still owns its concrete factories, capability contracts
and literal executable table. The accepted current Core export map does not
expose a generic construction helper. Before adding one, evaluate whether a
shared static construction path actually removes repeated consumer wiring,
define its typed inputs and failure handoff, and use the existing public-surface
decision process. This review does not authorize a service locator, lifecycle
engine or expansion of the current callable matrix without review.

The public names are unversioned before 1.0, as accepted ADR-0009 decides:
`compileComposition`, `compileCompositionJson`, `defineModule`, `required`,
`optional` and `many` plus the closed type set, with no generation suffix
anywhere in package source and every pre-1.0 breaking change recorded in the
package changelog. Historical `v1`/`v2` paths, schema discriminators and
evidence IDs are lineage only and stay inside the immutable qualification
artifacts; they are never published as compatibility aliases.

### Critical path of proposed decisions

The milestones below name the proposed decisions each one depends on. A
milestone that lists no proposed decision may proceed on accepted authority
alone.

| Milestone | Proposed decisions required | Blocked without them |
| --- | --- | --- |
| M1 `direct-semantics-qualified` on Node through the object entrypoint, published as `not-claimed` | None; accepted ADR-0015 admits the source, accepted ADR-0012 and ADR-0017 admit the export map and direct publication after the owner-start record, and ADR-0018 applies its accepted object, diagnostic-type and graph rules inside that unchanged scope | Package source, the first executable direct subject and the first `0.x` publication |
| M2 raw entrypoint and carriers | ADR-0013 and ADR-0014 together as one diagnostic generation 2 transaction: successor schema enum, catalog rank, diagnostic contract, snapshots, checker and ledger, because ADR-0007 keeps the base enum and code rank byte-identical | Raw decoding exposure, carrier admission and duplicate binding-record behavior |
| M2 public exposure of the raw entrypoint | The same generation 2 transaction resolving OD-005 | `compileCompositionJson` in the public barrel |
| M3 emitter and generated stage1, then generated `not-claimed` publication | None for construction; accepted ADR-0016 closes the dependency-record seam and the witness; ADR-0018 requires the complete M3 proof and ADR-0012 packed Node plus four TypeScript/type-scale cases before generated publication; ADR-0011 or a narrower successor is required only for release custody | `self-composed-qualified`, generated publication and every release custody claim |

A direct M1 `0.x` archive may publish as `not-claimed` once it passes the Node
and TypeScript packed cases of ADR-0012 and all four ADR-0003 preconditions:
verified control of the `@get-modular` npm namespace, an acyclic package graph,
no conformance tooling in the core tarball or declaration surface, and a
documented migration from the initial `0.x` topology.
After M3, only the generated stage1 archive is distributable. Its publication
also requires the complete M3 proof: P0/P1 plan/digest equality, W0/W1 tuple equality,
independent vectors on direct and generated subjects, static and behavioral
witnesses, no concrete fallback, clean and poisoned cold bootstrap, no
caller-time bootstrap, and generated-only archive closure. The six runtime
cases mandated by ADR-0007 and ADR-0008 gate the first `runtime-conformant`
claim and `release-eligible`, not either `not-claimed` publication;
release custody remains separate.
The bootstrap sequence is therefore: the product-owner start decision required
by ADR-0015 is recorded as a governed record before the first production
artifact; its validating check lands together with the record in its own
change, and the first package pull request references it; materialize
`packages/core` with the export map of
ADR-0012 and the names of ADR-0009; reach M1 on Node, meaning
`direct-semantics-qualified` behavior behind the object entry point; publish
that direct archive as `not-claimed` after its packed gates; prepare the
diagnostic generation 2 transaction in parallel with M1; then proceed to M2
and M3 in that order. Publish a generated post-M3 archive only after both the
complete M3 proof and packed/type-scale gates pass. The export map is frozen
only after substantive compiler behavior exists, and a shell or placeholder
entry point is never packed.

### Per-phase callable matrix

This matrix is an implementation boundary, not a new contract or public-name
decision. It resolves which entry points a qualification subject may expose at
each checkpoint:

| Phase | Qualification subject may expose | Explicitly excluded |
| --- | --- | --- |
| M1 object entry point, published as `not-claimed` | `compileComposition` over the trusted cooperative Host-owned object graph, including its outer invocation wrapper and lists, the authoring helpers `defineModule`, `required`, `optional` and `many`, `DiagnosticCode` as exactly `Diagnostic['code']` over emittable codes, and the remaining object-contract types fixed by ADR-0009 and ADR-0018 | `compileCompositionJson`, any raw carrier behavior, the OD-006 duplicate-record semantics, every `runtime-conformant` claim, `stage0` exports, runtime loading, a public catalog type |
| M2 raw entry point and carriers | The M1 surface plus `compileCompositionJson`, only after the diagnostic generation 2 transaction resolves OD-005 and OD-006 | Unaccepted carrier behavior, product/runtime lifecycle, qualification-only variants |
| M3 emitter and generated stage1 | Exactly the full export map accepted by ADR-0009, ADR-0012 and ADR-0018, served from the generated stage1 root; publication waits for the complete M3 and packed/type-scale gates above | `stage0` exports, qualification-only variants, implicit aliases, and any raw or carrier surface that the OD-005/OD-006 successors have not accepted |

ADR-0018 routes its accepted rules through these phase gates:

| Phase | Required rule and evidence |
| --- | --- |
| M1 | Measure `graphDepth` on the residual DAG after removing cyclic SCC/self-loop nodes and incident edges; preserve independent cycle and capped 2049 overflow diagnostics. Snapshot the cooperative Host-owned outer wrapper, lists and nested admitted object graph synchronously without retained aliases. Define `DiagnosticCode` as exactly `Diagnostic['code']` over emittable codes; add no public catalog type, and keep canonicalization failure as Promise rejection. |
| M2 | Before `Number` rounding, accept only raw lexemes that denote exact mathematical safe integers; accept `1`, `1.0` and `1e0`, reject `1.0000000000000001`, `1e-400` and every negative-zero spelling with `schema.invalid-value`, using a bounded lexeme algorithm without unbounded `BigInt`. Exposure still waits for OD-005/OD-006 and their combined generation 2 transaction. |
| M3 publication | The generated pack-once archive passes the ADR-0012 Node and four TypeScript/type-scale cases and the complete P0/P1, W0/W1, direct/generated independent-vector, static/behavioral-witness, no-fallback, cold-bootstrap and generated-only closure proof. The six-runtime gate remains separate for `runtime-conformant` and `release-eligible`, as does custody. |

The closed [implementation-clarification contract](../../architecture/qualification/implementation-clarifications/contract.json)
and its sibling `cases.json` pin complete mixed-graph failure results and raw
scalar numeric-admission projections. They are fixture-only evidence and do not
count as Core source or conformance without execution against the applicable
subject.

The direct and, once built, generated subjects use the same M1 surface and
independent vectors. `compileComposition` is the accepted object entry point
of ADR-0006 and ADR-0007 and the only compiler function the M1 subject
exports. Its tests accept ordinary trusted JSON-compatible inputs and exercise
actual admission, synchronous snapshotting and the semantic implementation,
not a pass-through mock. Accepted ADR-0006/0007 rules apply; cases that depend
on the OD-005 or OD-006 successors stay outside the claimed domain and are
labelled candidate evidence, not successful contract qualification. A
successful M1 result includes the Phase 4 plan and digest; before Phase 4 the
gates test the implemented admission and semantic parts without a fake
successful compiler result. M1 does not require accepting the successor
diagnostic generation before the first object-input test, and neither M1 nor
the object entry point admits raw exposure or a second public API; M2 closes
the carrier claims. A subject or document must not say only "same accepted
entry points"; it must name the applicable matrix row.

### Owner-start admission record

Before the first production package is added, the product owner must record a
small governed start record in the repository or in the bootstrap decision
record. It must bind the repository and exact source SHA, package identity,
owner, allowed scope (the M1 row of the callable matrix: object semantics
behind `compileComposition`, published as `not-claimed` under ADR-0017), and
the fact that raw carriers, the raw entry export, runtime lifecycle, every
`runtime-conformant` claim, the proposed ADRs and every self-composed claim are
not authorized. Those six exclusions are the exact `excluded` list of the
record below, and the checker rejects any other list. A pull-request approval or the existence of an empty package is
not a substitute. The source SHA is the authorized starting base, not a demand
for renewed permission after every implementation commit. The four ADR-0003
publication preconditions are separate from this record and are not tracked by
it: the pull request that publishes the first archive records verified control
of the `@get-modular` npm namespace, the acyclic package graph, the absence of
conformance tooling in the tarball and declaration surface, and the migration
from the initial `0.x` topology, in its release evidence alongside the packed
archive identity. The record and the
governance check that consumes it as a precondition landed together before
Core: the record is the JSON block under "Recorded Core start" in this
document, and `architecture/checks/private-core-start.mjs` reads it from these
exact bytes on every `governance:check`.

ADR-0018 applies its accepted M1 rules inside this already authorized scope.
It changes neither the start JSON nor its authority digest, opens no new M1
permission gate, and launches no implementation action by itself. M2 scope and
generated self-composition claims still require the owner-record and closed
checker changes already planned for those expansions.

### First `not-claimed` publication mechanics

Implementation may start before registry access exists, but publication may
not. The first publication of completed M1 owns this closed release checklist.
It does not gate the first private source PR; package-local metadata and
documentation still arrive with their applicable source changes:

1. Record authenticated control of the npm `@get-modular` organization and the
   actor or protected workflow permitted to publish `@get-modular/core`. An
   `E404`, unauthenticated organization page or available-looking package name
   is not ownership evidence.
2. Start the package at `0.1.0`. The private repository version `0.0.0` is not
   inherited. Later pre-1.0 breaking changes raise the minor version and follow
   ADR-0009's coordinated consumer migration.
3. Set public-package intent explicitly with
   `publishConfig.access: "public"` and the npm registry. A command or workflow
   also supplies `--access public` for the first publication; scoped-package
   defaults are not trusted.
4. Set the package `engines.node` field to the exact Node support interval
   exercised by its packed-consumer evidence. The first M1 archive may claim
   only its executed Node interval; browser portability and a broader runtime
   envelope are separate evidence.
5. Put `README.md`, `CHANGELOG.md` and `LICENSE` in the package root. The license
   bytes match the repository license. README and changelog list the M1 callable
   surface, `not-claimed` status, unresolved raw-carrier and duplicate-record
   behavior, supported runtime interval, the browser secure-context requirement
   for Web Crypto, and the "direct assembly, not self-composed" limitation
   required by ADR-0017. M1 does not claim browser support.
6. Use an explicit `files` allowlist and inspect the real `npm pack --json`
   inventory. Only the accepted root exports, built declarations and JavaScript,
   package metadata, license and minimal consumer documentation enter the
   archive. Source, tests, maps, qualification material and private adapter APIs
   do not. Selected private adapter implementations remain in the runtime
   closure when the accepted public entry point needs them.
7. Pack once from a clean, pinned checkout. Record the source SHA, package
   version, toolchain identities, archive SHA-256, npm integrity and inventory;
   install those retained bytes in every required packed-consumer case.
8. Keep ordinary CI at `contents: read`. Publishing uses a separate protected
   GitHub-hosted release workflow with `contents: read` and `id-token: write`
   only for the publish job. Prefer npm Trusted Publishing and short-lived OIDC
   over a long-lived write token. If npm requires a one-time namespace/package
   bootstrap before a trusted publisher can be configured, the product owner
   performs that bounded bootstrap with 2FA and records it; the workflow never
   invents ownership from a failed registry lookup.
9. Before upload, rehash the retained archive. After publication, download the
   registry tarball, prove byte identity with the retained archive, and install
   that downloaded artifact in a final consumer check. A metadata match is not
   byte-identity evidence.

Authenticated namespace control was established on 2026-09-04: the npm
organization `get-modular` was created on the free public plan, and its members
settings list `ilyazelenko` as owner with 2FA enabled. This proves interactive
control of the `@get-modular` namespace and admits the owner to perform a
bounded first-package bootstrap. It does not prove that a package exists,
authorize an unattended release, configure a Trusted Publisher, or satisfy the
pack-once and registry-read-back evidence above. The first publication
must record those remaining facts against its exact archive and workflow.

Upload is blocked until items 1-8 and the pre-upload rehash in item 9 pass.
Publication is complete only after item 9's registry read-back and consumer
check pass; that post-upload evidence cannot be a precondition for upload. It
does not need Phase 8 release-custody schemas to publish as `not-claimed`, but it
cannot use that label as a conformance, self-composition or release-eligibility
claim. No release workflow is added before a real package exists because an
untestable workflow would be ceremonial infrastructure.

[Proposed ADR-0019](../decisions/0019-separate-upload-admission-from-publication-completion.md)
records the narrow successor needed to reconcile ADR-0012's eligibility wording
and supplies the unknown-upload/tag-reconciliation runbook. Accept that policy
before the first real upload; its proposed status does not block private M1
fixes or preparation of the retained packed subject.

### Roadmap qualification language

The labels below are phase-report outcomes, not new Feature Module Standard
qualification states, public API, or lifecycle authority. They do not collapse
`source-admitted`, `structural-conformant`, `runtime-conformant`, publication,
or product adoption:

| Outcome | Evidence established | Evidence not established |
| --- | --- | --- |
| `direct-semantics-qualified` | A temporary, hash-identified direct subject passes the independent public-boundary semantics, diagnostic, plan/digest and immutability gates. | Generated construction, release custody, publication, or product adoption. |
| `self-composed-qualified` | In addition to direct qualification, ADR-0008's finite stage0-to-profile-to-emitter-to-stage1 path controls construction, direct/generated parity and witnesses pass, and generated stage1 passes the same public-boundary gates. | Release custody, publication, Feature Module Standard promotion, or product adoption. |
| `release-eligible` | The retained self-composed stage1 archive also satisfies every accepted decision, conformance, support-envelope, custody and promotion gate applicable to the requested release state. | Actual publication, registry read-back, stable 1.0, or a product-adoption claim. |

`direct-semantics-qualified` is useful prerequisite evidence, but accepted
ADR-0008 does not permit it to replace self-composition for
`self-composed-qualified` or `release-eligible`; accepted ADR-0017 lets a
`not-claimed` pre-1.0 archive publish before that. `release-eligible` means that the exact retained archive may enter the
publication checkpoint; it is not a synonym for published or conformant. While
required custody authority remains proposed, release eligibility remains
`CONDITIONAL` even when the two earlier outcomes pass.

## Common phase protocol

Accepted [ADR-0020 option A](../decisions/0020-define-diagnostic-coverage-outside-object-resource-admission.md)
closes object resource coverage: complete eligible diagnostic determinism inside
the resource envelope, precise bounded early rejection outside it, without a
stable winning-limit promise. Before public M1 qualification, execute its
[permitted-result vectors](../../architecture/qualification/object-resource-coverage/cases.json)
against the actual facade and document the boundary at the API. Preserve that
gate for generated M3. Private-stage success does not close the public gate.

The private admission checkpoint carries the accepted decision, immutable
coverage artifacts, custody checker and admission-only structural regressions
together. Execute the complete permitted-result cases when the semantic
integration exists; then repeat them against the public M1 facade and generated
M3 subject. No stage may replace a missing downstream subject with a stub.

Every phase uses evidence and review proportional to the changed risk. A phase
cannot enter implementation only because a plan sounds plausible, but ordinary
bounded work does not require a full research campaign.

```mermaid
flowchart TB
    C["Phase contract"] --> K["Risk classification"]
    K --> I["Bounded implementation"]
    I --> G["Applicable focused gates"]
    G --> X["Risk-proportionate exact-SHA review"]
    X --> CP["Checkpoint or BLOCKED"]
    K -->|authority, security or public surface| D["Independent design and critics"]
    D --> C
    X -->|confirmed finding| F["Owned remediation"]
    F --> G
```

### Evidence proportionality

Each phase contract names its authority, inputs, outputs, owner, non-goals,
invariants, applicable checks and stop conditions. Its checkpoint records the
exact source and subject identities, commands and results, unresolved blockers,
owner, and narrow reversal path. A required subject that does not exist yet is
`pending` and blocks completion of its applicable milestone. A case outside
the assigned milestone is `not-applicable` only with its controlling scope
exclusion recorded. Neither state counts as passed evidence.

Ordinary bounded work uses focused checks and one independent exact-head review.
Public-surface, authority, security and publication changes require the stronger
review and owner approval appropriate to their actual risk. Reviewer count,
provider, model, runtime tier, campaign staffing and LOC accounting belong to an
execution manifest, not to product architecture. A new commit invalidates only
the evidence and review affected by that change.

## Phase 0: contract and evidence preflight

**Purpose:** make the starting point unambiguous before creating Core source.

### Inputs

- exact selected PR/base SHA;
- accepted ADRs and current requirements;
- canonical schema, resource profile, diagnostic catalog and vectors;
- accepted authority and qualification ledgers already present in the selected
  source;
- proposed ADR-0010, ADR-0011, ADR-0013 and ADR-0014 candidates, clearly
  separated from accepted authority and active open-decision blockers;
- the governed open decisions OD-004, OD-005 and OD-006 for package
  carrier/resolution, raw-input carrier semantics and duplicate binding-record
  diagnostics: OD-004 is resolved by accepted ADR-0012, and proposed ADR-0013
  and ADR-0014 are the candidate resolutions of OD-005 and OD-006.

### Phase 0 implementation

1. Verify the selected base and accepted-decision precedence. Do not use a
   stale PR head or treat a proposed ADR as authority. The unversioned public
   naming map is fixed by accepted ADR-0009.
2. Produce the required non-authoritative Phase 0 report as a PR/CI artifact
   after the exact head exists. Reuse the existing Foundation, governance,
   contract and qualification gates; the report records exact base/head SHA,
   accepted-ledger identities, executed commands and active open-decision
   blockers. Do not add a committed checksum snapshot of checkers, tests,
   proposals or package scripts, a second validator for accepted authority, or
   another Phase 0 report command in `check:fast`. General environment and
   repository gates remain applicable. Git identifies the source tree and the
   accepted ledgers identify authority and evidence.
3. Close accepted-contract preflight gaps before public Core work: accepted
   authority pins, the accepted raw-byte boundary, duplicate-key policy, total
   diagnostic ordering and canonicalization evidence. `profileId` identifies a
   complete profile and its roots remain selected `moduleId` values; no separate
   root-selection diagnostic coordinate is introduced. Runtime activation,
   generation, readiness and routing identities remain Product Host concerns.
4. Keep `not-claimed`, `source-admitted`, `structural-conformant` and
   `runtime-conformant` as distinct qualification states. Release eligibility
   is a phase-report result until an accepted custody decision defines a
   machine-readable release state. Qualification folders are not a runtime
   registry.
5. Map every currently accepted normative claim to its accepted ledger entry,
   existing evidence or named implementation gate. Proposed-decision work stays
   conditional roadmap work, not a manufactured obligation row or active
   blocker. Only active open-decision records discovered from the governed
   catalog enter the blocker set. Existing synthetic artifacts are not silently
   promoted.
6. Verify `OD-005-raw-input-carrier-semantics` and maintain a carrier research
   matrix that derives only behavior already fixed
   by accepted ADR-0006/0007. Mark every unresolved view-offset, aliasing,
   transfer/detachment, shared/resizable storage, cross-realm or exact failure
   disposition as undecided. The matrix covers the invocation wrapper and
   declaration collection as well as individual values and byte views. Resolve
   the decision through an accepted successor ADR before the raw-carrier
   adapter is admitted; the trusted-object adapter ships from M1 under the
   plain-value admission rules of accepted ADR-0006 and ADR-0007. Proposed ADR-0013 is the current candidate.
7. Verify `OD-006-duplicate-binding-record-diagnostics`. Do not assign a
   diagnostic code, coordinates or suppression behavior to repeated records for
   one `(implementationId, slotId)`. Resolve it through an accepted successor
   ADR and executable ledger evidence before that case enters the compiler.
   Proposed ADR-0014 is the current candidate.
8. Record the selected SHA and retained content identities, then run the same
   preflight in one fresh disposable checkout. Defer cold regeneration and
   rollback rehearsal until stage0 or a retained release artifact exists in
   Phase 4 or Phase 8. Never use `reset --hard` or `clean` against a contributor
   checkout as evidence.
9. Verify `OD-004-package-carrier-and-resolution-policy` before freezing package
   type, export conditions, supported resolver modes or install-time script
   behavior. Accepted ADR-0012 resolves it. Governance derives
   blockers only from the active open-decision catalog, not from this roadmap's
   identifiers; OD-004, OD-005 and OD-006 already follow that catalog-driven
   path. Keep ADR-0010, ADR-0011, ADR-0013 and ADR-0014 as proposed roadmap
   choices until accepted;
   only their accepted decisions may add mutation fixtures or checkpoint
   requirements.
10. Verify that the executable resource-profile generator/oracle proof remains
    covered by `contracts:test` in the complete repository gate. The separate
    `qualification:resource-profile` command invokes the same proof for focused
    runs; its historical filename does not create a versioned public command.

### Phase 0 exit criteria

- the exact-head Phase 0 PR/CI report identifies the accepted ledgers, executed
  gates and active blockers and contains no unresolved accepted-contract P0/P1;
- exact source custody and ADR precedence are recorded;
- no production package or public barrel exists yet;
- accepted-claim mapping and the evidence-only raw-carrier matrix are checked;
- the complete governance gate derives and validates the current active blocker
  set without requiring unaccepted decision-specific mutation fixtures;
- the existing complete gate succeeds in a fresh disposable checkout at the
  reported exact head; cold artifact recovery remains a later phase gate;
- OD-004 is resolved by accepted ADR-0012, and OD-005 is resolved by an
  accepted ADR or successor decision before unresolved raw-carrier behavior
  enters the public entrypoint;
- OD-006 is resolved by an accepted ADR or successor decision before duplicate
  binding-record behavior enters the compiler;
- the unversioned public surface is fixed by accepted ADR-0009; the historical
  accepted evidence names stay inside the immutable qualification artifacts.

### Non-goals

No compiler, plugin host, lifecycle engine, Cordis adoption or product API
changes are implemented here.

## Phase 1: package topology and private composition boundary

**Purpose:** establish the package boundary at the same substantive checkpoint
as the first Core behavior. A package shell or declaration-only facade is not
an implementation deliverable.

Phases 1-4 form the first-Core checkpoint; their work is delivered in bounded
PRs and qualified by milestone, rather than as four independent releases.
The acyclic construction and qualification order is:

```text
Phase 1 package/source setup with the accepted carrier shape
  -> Phase 2 inert declarations
  -> Phase 3 private semantic compiler
  -> Phase 4 immutable plan/digest implementation on direct stage0
  -> complete M1 public barrel
  -> complete M1 object-result and packed-consumer checks
  -> M2 raw/duplicate-record work only after its accepted decisions
  -> M3 finite emitter and two hash-identified qualification subjects
  -> Phase 4 direct/generated construction and parity qualification
```

This order prevents an empty public shell and prevents packed qualification from
depending on a Phase 4 exit that already assumes the archive exists.
The first `not-claimed` publication is a separate action after the M1
packed gates. Registry upload is not a prerequisite for M2 or M3 implementation;
their accepted decisions and owner scope remain the prerequisites.

| Work ready for review | Evidence at that point | Later qualification dependency |
| --- | --- | --- |
| Phase 3 algorithms | Execute private normalization, graph and diagnostic seams against independent expectations | Full successful public results wait for Phase 4 plan/digest |
| M1 direct compiler | Complete object results, immutable plan/digest and packed consumer checks | No raw carrier, generated subject or self-composition claim is required |
| M2 carrier extension | Accepted raw and duplicate-record rules through their applicable boundary | Does not retroactively block M1 |
| M3 generated compiler | Both subjects, finite emitter, construction witness and parity | Builds on working direct plan/digest behavior; accepted ADR-0016 already closes the seam |

An algorithm slice can finish and merge before the full public-result gate.
Report that slice as implemented with public qualification pending; never add
a placeholder digest or claim a complete M1 result from the private seam.

Atomic applies to release qualification and promotion, not to review size.
Implement Phases 1-4 as dependency-safe, private vertical PRs that normally
change no more than roughly 2,000 LOC each, including the focused tests and
evidence needed for that slice. Each PR must deliver testable behavior and a
narrow revert path, but a pre-1.0 publication from it is `not-claimed` and
cannot claim an independent phase release or partial Core qualification. Keep one invariant together when a
smaller split would make it unverifiable.

### Phase 1 implementation

1. Materialize the Core package/source boundary under the accepted topology
   and export-map shape that accepted ADR-0012 fixes. Add the complete public
   barrel when substantive M1 behavior exists; prior private source slices
   exercise their owned seams without a partial or placeholder compiler export.
   ADR-0012 permits absent build targets during source admission; actual packed
   resolution remains mandatory before publication. The first production
   source waits only for the governed product-owner
   start record that ADR-0015 requires. Structure the package as feature-owned slices under
   `packages/core/src/features/*` exactly as the adopted [Feature Module Standard profile](feature-module-standard.md)
   maps the organization standard ([canonical document](https://github.com/agent-teams-ai/.github/blob/eef92e7fd40f538b4e9ba03e01bbd4e2d23f12f2/docs/architecture/feature-module-standard/v1.md),
   revision `eef92e7`). Keep domain semantics independent from Foundation,
   Docs Protocol, DI containers and plugin runtime types.
2. Preserve ADR-0003's public development-only
   `@get-modular/conformance` identity without creating an empty package. Its
   substantive vectors, fixtures and packed-consumer tooling may be published
   after their surface gate; runner, subject, report and attestation contracts
   remain private until a separate compatibility decision accepts them.
3. Freeze one public export map only after the first substantive compiler behavior is
   present. `ModuleDeclaration`, `CompositionProfile`, `CompositionPlan`,
   `Diagnostic`, `PlanDigest`, `defineModule`, `required`, `optional`, `many`
   and the accepted compiler entrypoints must have their accepted semantics.
   Compiler entrypoints cannot be throwing, pass-through, no-op or
   declaration-only placeholders; authoring helpers retain the deliberately
   pass-through behavior accepted by ADR-0007. The public name map and the
   package carrier are accepted; the raw entrypoint and the raw-carrier
   adapter stay out of the public barrel until OD-005 is resolved, and the
   package changelog and README list that limitation.
4. Promote the first production package atomically to `source-admitted`: add
   the pinned `architecture/foundation/source-dependencies.yaml`, enable the
   Engineering Foundation source-dependency capability, add positive and
   negative structural fixtures, and wire the real Foundation check into
   `check:fast` and `check`. Structural and runtime conformance remain separate
   promotion states.
5. Pack the production archive once per publication under ADR-0012. From M3,
   qualification uses a separate temporary direct stage0 archive and that same
   retained generated stage1 production archive, with the same public compiler
   boundary and separate hashes. Run default-deny export/deep-import tests, tarball
   allowlist, declaration-leakage audits and inert import smoke tests against
   every archive. Only generated stage1 is retained as the pack-once
   distribution candidate from M3; never repack any subject inside a platform
   job.
6. OD-004 is resolved by accepted ADR-0012: ESM-only root export with a
   sibling `default` condition for `require(esm)`, no CommonJS build and no
   install-time scripts. Do not infer any other policy from this roadmap.
7. Before the first publication and again for every later publication, run
   the packed production archive through the four TypeScript consumer modes
   required by ADR-0007 and ADR-0012 and one deterministic 1000-declaration
   typecheck fixture. Before M3 that archive ships the direct root; from M3 the
   retained generated stage1 archive is the production archive, and the direct
   qualification subject passes the audits in item 5 and the independent
   vectors instead of a second consumer matrix. Portable performance
   measurements belong to Phase 5. A generated post-M3 publication additionally
   requires the complete M3 proof in the callable-matrix gate; packed consumer
   success alone is insufficient.

### Phase 1 exit criteria

After Phases 2-4 provide the complete substantive compiler, two disposable
TypeScript consumers compile through the public barrel only, every published
production archive passes the named resolver/type-scale gates, and from M3 the
direct qualification archive passes the same export, deep-import,
declaration-leakage and inert-import audits. No Core API
exposes a container, resolver, registry, Context/Fiber, filesystem path,
executable factory, transport DTO or versioned name. A package shell without
substantive behavior cannot pass this phase.

### Stop criteria

Stop if package topology needs a second public authority, a framework-specific
type, or a package split that cannot be explained by independent dependency or
lifecycle ownership.

## Phase 2: declarations, profiles and capability slots

**Purpose:** make module authoring local and typed without introducing runtime
discovery or a second identity authority.

### Phase 2 implementation

1. A module co-locates its serializable wire-format ID and plain-data
   declaration inside its feature-owned slice, following the adopted
   [Feature Module Standard profile](feature-module-standard.md). Branding
   follows successful compiler validation.
   Product/repository admission allocates and authorizes the namespace; the ID
   is not authentication, an import path or an executable lookup key. There is
   no handwritten or authoritative global ID registry. A deterministic derived
   inventory may support navigation but is never runtime discovery or identity
   authority.
2. Feature-local contracts and adapters stay beside their feature, in the
   role-oriented layout the Feature Module Standard v1 defines. A shared
   contract is extracted only after a second real consumer proves the same
   boundary.
3. `required`, `optional` and `many` express cardinality. `many` has explicit
   `min`, `max` and `order`; registration order is never semantic.
4. A Core declaration is inert plain data only. A feature may co-locate a
   separate product-owned typed factory and port, but Core compilation never
   receives, imports, discovers or invokes that factory.
5. A profile is a complete compilation snapshot produced by a Product Host
   adapter from host-authorized desired state. Core has no disabled flag,
   rollout state or impact authority; removal and replacement are expressed by
   compiling a new complete profile. ADR-0008's closed own profile is instead a
   private build-owned input. Neither case lets the compiler derive, merge or
   authorize profiles, and there is no hidden fallback.
6. Pure DI uses consumer-owned capability ports and explicit factory arguments
   outside Core's declaration/compiler boundary. No generic `resolve()`,
   service locator, global mutable container, dependency bag, inherited-property
   lookup or thenable assimilation.
7. Authoring helpers implement exactly the non-validating construction contract
   accepted by ADR-0007. The compiler alone validates cardinality,
   compatibility and closed profile rules.

### Capability evolution and namespace admission

Exact compatibility deliberately makes migration explicit. It does not require
a flag-day deployment:

1. A new implementation of an unchanged capability keeps the same
   `capabilityId` and exact compatibility token. A profile can select the new
   `implementationId`, qualify the resulting plan, and roll back by compiling
   the previous complete profile.
2. A breaking capability contract receives a new `capabilityId` and a new exact
   token. A provider that faithfully implements both contracts may advertise
   both distinct capability IDs in one declaration. Duplicate entries for one
   capability ID remain invalid.
3. Consumers add a slot for the new capability and migrate through explicit
   complete profiles. Old and new consumer modules may coexist because the
   graph binds slots, not package versions. Removal of the old capability
   happens only after the Product Host inventory proves that no selected
   consumer still requires it.
4. When one implementation cannot safely provide both contracts, the owner
   introduces a separate logical module and implementation for the new
   capability. The Product Host owns staged selection, rollback and retirement;
   Core still sees only one complete profile at a time.

Package SemVer, a compatibility token and a capability identity solve different
problems. Do not use an npm range as capability compatibility, silently change
the meaning of an existing token, or add parallel compiler API generations to
perform a product migration.

Core validates portable identity syntax and collisions inside one compilation;
it does not authenticate an `owner.authority` string. Before declarations from
an extension, catalog or other independently governed source reach Core, the
owning Product Host admission adapter must validate two separate grants:

- the independently verified admission principal may allocate the declaration's
  `moduleId` and `implementationId` namespace;
- the admitted implementation may provide each product-owned `capabilityId`.

Those grants are product or Extension Foundation policy, not inferred from
matching string prefixes. A third-party implementation commonly owns its module
identity while intentionally implementing a capability owned by a product.
Publisher identity, artifact identity, installation identity and the declared
`owner.authority` label remain distinct; the label cannot act as the verified
principal that receives a grant.
Unauthorized namespace allocation or capability provision fails before
compilation. Core diagnostics are not an authorization fallback, and a derived
inventory is not a grant registry.

### Phase 2 exit criteria

Synthetic provider, consumer, optional provider and ordered-contribution
declarations typecheck without executing declarations. Fixtures include explicit
empty binding rows for legal optional absence and `many(min: 0)`, and duplicate
provider IDs within one binding record. Repeated binding records remain excluded
until OD-006 is resolved. Real product navigation and edit-locus measurements
belong only to an admitted Phase 6 consumer.

## Phase 3: normalization and deterministic graph compiler

Use the [compiler engineer handbook](../qualification/compiler-engineer-handbook.md)
for fact derivation, partial-invalid input and cycle/depth boundaries. Its
literal examples supplement, not replace, accepted vectors. Fixture consistency
is not execution evidence for a production subject.

**Purpose:** implement the private semantic compiler seam:
`declarations + complete profile -> normalized plan | bounded diagnostics`.
The public successful compiler result does not exist until Phase 4 attaches the
immutable plan and digest required by the accepted contract. Canonical bytes
remain a private intermediate and evidence input.

### Required semantics

- closed validation of declarations, profiles, IDs, owner syntax, exact
  compatibility, selections, bindings and cardinality;
- resource preflight before allocating or traversing structures proportional to
  a rejected dimension;
- root closure following consumer-to-provider edges, with provider-to-consumer
  dependency order that carries no activation or lifecycle meaning;
- stable SCC cycle members and stable order independent of input enumeration;
- deterministic unknown, missing-selection, duplicate-provider, not-selected,
  incompatible, cardinality, cycle and unreachable diagnostics defined by the
  accepted catalog for the complete input profile;
- no first-row/last-row winner, fallback provider or registration-order
  meaning;
- bounded paths, redacted hostile values, top-K diagnostics and saturating
  omission count.

Repeated binding records for one `(implementationId, slotId)` remain outside
the admitted semantic domain until OD-006 and its accepted successor define the
exact diagnostic and suppression behavior. Fixtures may demonstrate candidate
behavior but cannot make it compiler authority. The M1 compiler keeps
repeated-record inputs outside its claimed domain; any candidate implementation
of the ADR-0014 semantics lives in fixtures under `tests/` until ADR-0014 is
accepted; this placement is stricter than accepted ADR-0015 requires and keeps
OD-006 unexposed and unclaimed.

Phase 3 accepts, stores, returns and invokes no factory, callback, function,
loader, executable handle or product code. Product-owned literal factory tables
remain outside Core and may be used only after a complete successful public
compile result exists. Core-owned enable/disable, scope, priority, generic
ambiguity or impact semantics require a successor contract and are not inferred
from the current schema.

The canonical detail-byte comparator used by diagnostic ordering is qualified
behind its private boundary in this phase. An owned private implementation may
proceed behind the port; selecting an external production adapter or dependency
requires accepted ADR-0010 or a successor. The semantic compiler cannot inherit
ordering or error behavior from a candidate library.

The first substantive compiler slice also introduces the owner-local
declarations, ports and factories plus ADR-0008's minimal direct stage0 root,
exactly as the [self-composition implementation guide](self-composition-implementation-guide.md)
lays them out: the own feature inventory, the feature skeleton and the single
composition root. The finite emitter and generated stage1 remain Phase 4 work.

### Phase 3 exit criteria

During Phase 3, focused tests execute the private semantic implementation;
successful expectations may cover its normalized plan without a digest. After
Phase 4 supplies the immutable public plan and digest, one named subject gate
invokes that same implementation through the
M1 row of the callable matrix, `compileComposition` over trusted object input,
and compares complete results with independent expectations; no raw carrier
and no `runtime-conformant` result is claimed. Static vector/oracle
validation is a prerequisite and cannot satisfy this gate. The gate covers:

- required-one, optional-zero/one and bounded-many at zero/min/interior/max;
- missing, duplicate, unknown, not-selected, incompatible, cardinality,
  no-fallback, cycle, multi-root and unreachable cases;
- every accepted at-limit and plus-one resource case and accepted overlap,
  prerequisite, suppression, maximum-depth, dense-edge, giant-cycle and
  diagnostic-storm fixture;
- the ADR-0018 mixed cycle/residual-DAG cases, including independent overflow
  beside cycle diagnostics, limit 2048 and capped actual 2049. Execute all eight
  complete expected results through admission and semantics, including the
  accepted declaration/selection/binding/root permutations; kernel-only
  coverage does not close this integration gate;
- the accepted closed P500 generator, iterative traversal, stack safety,
  retained-diagnostic bounds and structural operation counters. Compare the
  entire output plan with an independent closed expected-plan recipe and a
  fixed independently derived digest; input counts and source hashes alone
  do not prove compiler output. The recipe must detect a missing binding and
  preserve semantic many order. Current private coverage lives in
  [scale-integration.test.mjs](../../packages/core/tests/features/composition-semantics/scale-integration.test.mjs);
  repeat the same expectations at the public packed boundary before M1 closes;
- exhaustive equivalent permutations for bounded tiny graphs. Ordered-many
   provider arrays are semantic and are never shuffled as an equivalence; a
   changed provider order must change the later plan and digest.

Every diagnostic result excludes a plan and digest. No input or output accepts
executable values. No internal seam is exported as a temporary public API;
the public `compileComposition` boundary is the accepted object
entry point of ADR-0006 and ADR-0007, published as `not-claimed` under
ADR-0017 after the explicit product-owner start record, and it cannot expose or
claim the OD-005 carrier refinements or the OD-006 duplicate-record semantics.
Candidate raw carriers remain non-publishable and may produce evidence for
OD-005 only.

The M1 public type gate proves `DiagnosticCode` is exactly the emittable
`Diagnostic['code']` union, rejects reserved canonicalization failure and a
public catalog type, and retains Promise rejection for canonicalizer/hash
failure. Object-entry mutation evidence covers the outer invocation wrapper,
lists and nested admitted graph with synchronous no-alias snapshotting. Its
resource assertions cover Core-owned bounded work and retained state, excluding
intrinsic reflection allocation, caller-owned heap, arbitrary `Proxy` execution
and fixed wall-time guarantees.

## Phase 4: immutable plan, canonical bytes and self-composition

**Purpose:** make the plan reproducible and prove that Core can construct its
own finite internal components without a runtime bootstrap loop.

Canonical bytes are a private compiler intermediate used to derive the accepted
public digest and private evidence used to compare exact results. The public
compile result remains the accepted immutable plan plus digest; it does not
return canonical bytes, require a consumer to retain them, or create a public
byte-verification API. Qualification and custody tooling may retain and compare
those bytes privately when binding the exact subject and evidence.

### Phase 4 implementation

1. Use the accepted canonicalization boundary and a qualified private adapter.
   Do not call a local helper RFC 8785/JCS without independent vectors proving
   the exact required subset. An owned primitive may implement the port; an
   external production dependency requires accepted ADR-0010 or a successor.
2. Encode only normalized semantic plan data, selected implementations,
   bindings, order, profile and compatibility data. Exclude source ordinals,
   executable closures and host custody state.
3. Hash exact canonical bytes with domain-separated SHA-256 only after encoding
   is qualified. Equivalent permutations retain the same bytes/digest; a valid
   semantic change succeeds with new bytes/digest; invalid input returns only
   diagnostics. A stale or tampered plan/digest pair is rejected only by the
   named private evidence/custody verifier, never by an invented public Core
   authorization API.
4. Prove deep runtime immutability: plain JSON-compatible records/arrays,
   iterative deep freeze, no accessors or class instances, no retained aliases
   to caller input, and strict-mode mutation rejection. Process and
   structured-clone round trips preserve semantic values and recomputed
   canonical bytes/digest; they do not preserve frozen property descriptors.
5. At accepted ADR-0008 checkpoint A, compile the real closed own profile as
   soon as the first useful dependency edge exists and report production,
   qualification and generated LOC separately. Prove one controlled
   behavior-changing binding replacement before release. A stronger
   multi-edge or explicit owner `GO` checkpoint applies only if a later
   accepted decision adds it; until then the single-edge replacement is
   candidate evidence, not an emitter veto.
6. Accepted ADR-0016 reconciles ADR-0008's closed dependency record with its
   prohibition on hostile identities as property-lookup keys: typed slot-keyed
   dependency records, `Map` lookups for every identity, and a static
   generated-wiring witness with canonical wiring tuples, which the
   self-composition implementation guide applies.
7. After item 6 is resolved, implement ADR-0008's bounded self-composition in
   its accepted delivery order: handwritten stage0 uses the real graph
   semantics, emits finite private stage1 wiring, and stage1 wires the same
   implementations. This is build-time composition, not recursive compiler
   self-hosting and not a public generator. An explicit owner `GO` before this
   step is required only if accepted authority adds that condition.
8. Use clean, isolated and poisoned stage/cache/output roots. Prove exact
   P0/P1 plan-and-digest equality, exact W0/W1 equality, construction witnesses
   in the form the accepted item 6 successor defines, a binding replacement that
   changes public behavior,
   no hidden concrete-import fallback, and zero own-profile compilation,
   emitter calls or component assembly on caller requests. From M3 only
   pack-once stage1 is distributable; own profile, emitter and the
   qualification entries stay outside the runtime closure, and a pre-M3 archive
   that ships the direct root says so in its changelog under ADR-0017. Also prove immediate caller mutation before the first await,
   private canonicalizer/hash failure rejection without a reserved diagnostic,
   and a reversed ordered-`many` companion that changes plan order and digest.
9. Treat completion as distinct phase-report outcomes. A direct subject may
   become `direct-semantics-qualified` using accepted plan/digest evidence
   without a construction claim. `self-composed-qualified` additionally
   requires the accepted item 6 refinement and the complete ADR-0008 finite
   construction proof. Release custody is separate again; while ADR-0011
   remains proposed, its broader protocol creates neither a governance blocker
   nor a custody claim.

### Phase 4 qualification exit

One named gate proves semantic/digest invariants and deep immutability against
the direct subject for M1 and against the separate direct qualification archive
and exact retained generated production archive when M3 introduces stage1.
Accepted item 6 defines the witness;
its acceptance alone does not require a generated subject during M1. Both use the same public
   compiler boundary, the accepted object entry point; the raw carrier boundary
   joins it only after OD-005 is resolved. Reordered
   equivalent graphs produce identical canonical bytes/digest; valid semantic
   changes produce different valid bytes/digest;
invalid inputs produce diagnostics only; and nested mutation, alias and
cross-process tests prove a plain immutable plan. This gate does not require or
invent release-custody records.

After the item 6 authority closes the dependency-record seam, the accepted
ADR-0008 finite-construction gate proves clean bootstrap with
stage1 absent, isolated/poisoned roots, P0/P1 and W0/W1 equality, behavioral
replacement, independent construction witnesses, caller-time no-bootstrap and
stage1-only runtime closure. Direct and generated packed subjects pass the same
independent vectors and public-API checks; from M3 only generated stage1 may
be retained as the release archive. Passing the direct gate yields
`direct-semantics-qualified`; passing the construction and parity gate yields
`self-composed-qualified`. Neither implies `release-eligible`; a pre-M3
`not-claimed` publication is governed by ADR-0017, not by these outcomes. A
generated post-M3 `not-claimed` publication additionally requires this complete
construction/parity gate under ADR-0018.

### Phase 4 release-custody prerequisites

Release-custody work starts only after an accepted decision defines its records,
ownership and promotion transaction. ADR-0010 or a successor is additionally
required only when an external production dependency is selected. Until then,
Phase 4 may retain hash-bound reviewed evidence but cannot claim release
eligibility or invent report and attestation schemas.

## Phase 5: conformance and scale proof

**Purpose:** make accepted Core behavior reusable as independent evidence without
inventing a public runner or release protocol.

### Phase 5 entry gates

Qualification records are governed by `docs/metadata.schema.json` and by the
governance gate, which validates every `QUAL-*` record, its evidence digests
and its promotion state regardless of the tool that wrote the file. The two
historical `QUAL-*` records keep their identities as immutable evidence and
new records follow the same identity pattern. Authoring-tool support for that
identity is welcome but is not an entry gate: a hand-written record that
passes the gate is valid evidence, and no external package release blocks
Phase 5.

Make the repository profile checker transition-aware before the first claim.
It must require `not-claimed` until governed qualification and reciprocal
promotion records exist, then accept only their ordered same-subject states. A
runner cannot promote its own output.

Evidence reuse is disabled unless an accepted custody decision owns one closed
reuse key. The key binds the exact subject/archive and source/authority ledgers;
entrypoint, vectors and closed matrix case ID; evidence schema, generator,
runner/verifier and command; toolchain and runtime; OS version and build,
architecture and realm; browser release/build; Electron release plus its embedded
Node and Chromium identities; matrix configuration and accepted freshness
policy. Changing any component invalidates the case. Before such a decision
exists, rerun rather than infer equivalence from a partial key.

For the first actual qualification checkpoint, reuse stays disabled and every
applicable case executes against the retained subject. This is not a permanent
requirement to repeat a proven full pipeline: a later accepted custody decision
may enable case reuse with the complete key above and rerun only invalidated
cases. A source hash alone never substitutes for that key.

### Scale support envelope and operator guidance

Phase 5 publishes an explicit Core `0.x` support envelope with the retained
archive. The correctness envelope is closed over:

- the object and admitted raw-byte entrypoints, accepted carrier cells, and
  accepted resource limits;
- sparse, dense, maximum-depth/cycle, diagnostic-storm and maximum-identity
  worlds at 10/100/500/1000 modules and the accepted declaration limit;
- the six required Node, Chromium and Electron cases, including the recorded
  runtime, operating-system, architecture and realm identities; and
- concurrent/repeated-call isolation, bounded diagnostics, canonical plan and
  digest correctness, and packed-consumer/typecheck cases.

Inputs above accepted resource limits, unresolved raw-carrier cells, skipped
runtime cases, and Product Host lifecycle behavior are outside that envelope.
Within it, accepted resource limits and correctness are supported; recorded
time, memory, archive size and structural counters remain sizing observations,
not portable latency, throughput or memory promises.

Phase 5 records the support envelope in the closed `supportEnvelope` section of
the private `QualificationReport` defined by the accepted release-custody
decision. The private `ReleaseAttestation` binds that report digest to the
retained archive and terminal promotion result. Together they are the sole
authority for the retained archive identity, executed matrix, supported cells
and explicit exclusions; no separate support or promotion record may repeat
that state. Phase 5 generates `docs/generated/core-support-envelope.md`
byte-for-byte from `QualificationReport.supportEnvelope`, verifies the generated
view against the same report, and links it from
`docs/architecture/current-contract.md`. The generated guide and mutable
current-contract navigation are derived views: they do not own archive
identity, support state or release eligibility.

The derived guide explains identity and namespace ownership, complete-profile
construction, ordered-many bindings, entrypoint and carrier selection,
diagnostic and omission handling, supported scale shapes, evidence identities,
and when invalidated cases must be rerun. It shows that a Product Host may
consult its authorized literal factory table only after successful compilation
and must not edit a plan or infer authorization, readiness, activation, retry,
routing or recovery from Core output. It includes support-data capture and
escalation guidance for cases outside the envelope without turning Get Modular
into an operational authority. Before the promotion artifact exists, neither
the guide nor current-contract navigation may claim a distributable support
envelope.

### Phase 5 implementation

1. Keep implementation-independent vectors and fixtures in the development-only
   conformance package. Accepted contracts, ledgers and independently owned
   vectors are authority; packed Core is only the subject under test. Runner,
   report, attestation and promotion surfaces remain private and unclaimed until
   an accepted compatibility and custody decision defines them.
2. Execute the same positive, negative, mutation, permutation, malformed-input,
   resource, graph and redaction evidence against the separately hash-identified
   direct and generated subjects where ADR-0008 requires parity.
3. Execute the retained generated stage1 subject in every accepted mandatory
   runtime case before a runtime-conformance claim. A skipped mandatory case is
   a blocker, never success evidence.
4. Retain the accepted closed P500 and boundary/plus-one resource worlds and the
   required 1000-declaration TypeScript fixture. Prove the accepted asymptotic
   bound with structural operation/allocation counters. Timing, memory and extra
   scale shapes are optional sizing observations, not compatibility thresholds.
   P500 must match the independent full plan and fixed digest through each
   applicable retained subject. Test binding loss and changed many order;
   agreement between two subjects is not an expected-output oracle.
5. Compare object and raw adapters only after their common carrier domain is
   accepted. Include immediate mutation and object/object, raw/raw, object/raw
   and raw/object concurrent start orders. No fallback may hide divergence.
6. Bind each result to exact subject, source, authority, vector and runtime
   identities. Reuse and promotion are disabled until an accepted custody
   decision defines their complete key and ownership. A runner cannot promote
   its own result.

### Phase 5 exit criteria

Every applicable accepted Core obligation maps to executed exact-subject
evidence. Accepted at-limit behavior and bounded plus-one rejection remain inside
the supported correctness contract; elapsed time and memory remain non-SLO.
Before custody authority exists, Phase 5 exits only with hash-bound reviewed
evidence and `not-claimed` promotion status. It creates no support-envelope,
generated operator guide, report schema or release attestation.

## Phase 6: first product dogfooding

**Purpose:** prove that the retained generated stage1 Core reduces real product
wiring without rewriting product domain APIs. This optional checkpoint follows
Core qualification and is not a publication prerequisite.

### Phase 6 implementation

1. The consumer repository owns an adoption decision binding its exact source,
   feature boundary, Product Host owner and retained generated stage1 archive.
   Record known external consumers in the existing
   [traceability ledger](../traceability/module-system-v1.yaml), with the
   consumer source/adoption reference, owner and consumed package version or
   archive identity. ADR-0009's external-consumer deprecation window starts with
   that registration. Apply this rule to known M1 consumers too; do not wait
   for optional Phase 6 or label an M1 consumer self-composed.
2. A product anti-corruption adapter maps authorized desired state into inert
   declarations and one complete profile. Credentials, executable handles and
   product state never enter Core.
3. Before materialization, the consumer decision defines missing-factory,
   factory-exception and partial-construction behavior. Readiness, fencing,
   cutover and rollback rules are required only when those capabilities belong
   to the admitted slice. A static slice does not need a dynamic runtime.
   Get Modular does not define these Product Host semantics.
4. After a successful compile, the Host may use an authorized literal factory
   table. No metadata becomes a grant; no dynamic import, filesystem scan,
   fallback or unselected lookup is allowed.
5. Keep direct Pure DI as a test/reference path for parity, not a live fallback.
   After cutover, one path controls materialization for the admitted slice.
6. Translate diagnostics through a total bounded anti-corruption map. Unknown
   codes fail closed and the safe machine-readable diagnostic remains available.
7. Measure wiring/glue LOC, edit loci, navigation, typecheck, remediation and
   deletion cost. The consumer defines any threshold and its numerator,
   denominator and counting rules; this roadmap supplies no universal percentage.
   Before migration, retain the direct-wiring baseline and define concrete
   tasks: locate a dependency's owner, replace one provider, and remove the
   admitted slice. Repeat the same tasks after migration and record changed
   files/edit loci, verification effort and rollback/removal steps. Separate
   generated lines from handwritten wiring and product-domain changes.
8. Evaluate a second existing product seam independently. If none is admitted,
   record `second-consumer-not-admitted` instead of inventing a feature.

### Phase 6 exit criteria

One real slice works from the retained stage1 subject with one wiring authority
and no product API rewrite. Its adoption evidence includes the baseline, the
same navigation/replacement/removal tasks before and after migration, and the
consumer owner's explicit verdict on whether the measured benefit justifies
the cost. A negative or inconclusive verdict records that result and the
consumer-local remediation or reversal; successful execution alone does not
prove reduced wiring. A second independent consumer permits a
cross-consumer extraction claim; its absence blocks only that claim.

## Reserved Phase 7: extension/plugin boundary

This is not an implementation phase or release gate. Core receives only
already-admitted inert declarations, owns no artifact trust or lifecycle
behavior, and adds no loader, registry, plugin runtime or Extension Foundation
dependency. Concrete translation, identity, lifecycle, retirement and atomicity
rules wait for a real consumer and accepted decisions from their owners.

## Phase 8: release and conformance checkpoint

**Purpose:** prove the retained generated stage1 archive is reproducible and
reversible before a conformance claim or a `release-eligible` publication.
Phase 6 remains optional and Phase 7 has no gate.

A `release-eligible` publication and the first conformance claim are blocked
until an accepted custody decision defines the evidence record, reuse key,
support representation, verifier and promotion transaction. Pre-1.0
`not-claimed` publications follow ADR-0012 and ADR-0017; generated post-M3
archives additionally follow ADR-0018's complete M3 gate. They are not gated
by release custody here.
Once that authority exists:

1. Bind the exact source, retained pack-once stage1 archive, accepted authorities,
   toolchain/runtime identities, executed evidence and every custody category
   required by ADR-0008. Do not replace that list with an abbreviated copy.
2. Reuse only evidence matching the complete accepted key. Rerun invalidated
   cases and never rebuild between qualification, platform jobs and publication.
3. Inject a failing source or build state, restore the exact known-good source
   and toolchain, cold-regenerate stage1 and repeat qualification. Recovery output
   proves equality; it does not replace the retained publication subject.
4. Verify all release blockers, namespace ownership, structural/runtime promotion
   state and known limitations against the same subject.
5. Require explicit owner approval and registry read-back of the exact archive
   digest. Zero or one production adapter permits only a pre-1.0 claim, not a
   stable cross-consumer claim.

### Phase 8 exit criteria

A `release-eligible` publication has one accepted promotion authority, no
unresolved release blocker,
an executed rollback/recovery proof and byte-identical registry read-back. A
failed gate blocks only this checkpoint and cannot silently promote partial
evidence.

## Global stop conditions

Return `BLOCKED` instead of guessing when:

- a P0/P1 or authority conflict remains;
- a second lifecycle authority, service locator, filesystem scan or framework
  type enters Core contracts;
- raw/object semantics diverge without a decision;
- canonical bytes are claimed without independent vectors;
- a worker uses a stale base, edits another lane or loses dirty state;
- a stable or cross-consumer API claim is made without two independent
  production adapters;
- hosted workers repeatedly fail without verifiable output.

The first complete `0.x` Core checkpoint is a bounded compiler, the ADR-0008
self-composition evidence and conformance evidence. The first product-adoption
checkpoint adds one real adapter. Neither
is completion of the plugin ecosystem or evidence for a stable 1.0 claim.

## Recorded Core start

On 2026-09-04 the product owner approved the bounded follow-up: permit an M1
object entry point, record the start scope together with admission enforcement,
and preserve the research evidence. On the same day the owner accepted ADR-0017
and reissued this record so that its scope names the public object entry point
and a `not-claimed` pre-1.0 publication, which the first record excluded. This
record permits a subsequent Core implementation; this change creates no Core
source and starts no runtime. It does not accept proposed ADRs, does not
authorize a `runtime-conformant` claim, and does not authorize merge.

The JSON block below is the single start record, read from this governed
document by `governance:check`. Its base is the shared reviewed main revision,
not a per-commit permission token. Descendant work remains authorized while the
accepted authority digest and bounded scope match. A changed authority,
revocation, different package, or broadened scope needs an updated owner record.
The checker validates the recorded declaration, the authorized package root
and the manifest identity, and it applies any manifest-observable entry of the
excluded list. Every entry of the current list is a property of source rather
than of the manifest, so today that application finds nothing and the entries
are enforced by the tests of the pull request that adds the code: no
`compileCompositionJson` export, no runtime lifecycle, no `runtime-conformant`
or self-composed claim, and no implementation of a proposed ADR outside
fixtures. The checker does not validate the human author's identity or the
semantics of future code, so code review stays part of the gate. Missing or
malformed records fail closed when a package is present. No package is created
to test the gate.

<!-- get-modular:private-core-start -->

```json
{
  "repository": "agent-teams-ai/get-modular",
  "baseCommit": "0f7d2fc64ae7258781e6c2676ca1e0ccc377f418",
  "authorityDigest": "sha256:9ba074210704a20f6a3ef7486f3cf2ec7435fb0fc5552cca210b6d3d5d73f077",
  "approvedBy": "product-owner",
  "approvedOn": "2026-09-04",
  "status": "authorized",
  "package": "@get-modular/core",
  "scope": ["semantics", "object-entry", "publication-not-claimed"],
  "excluded": [
    "raw-carriers", "raw-entry-export", "runtime-lifecycle",
    "conformance-claims", "proposed-contract-claims", "generated-self-composition-claims"
  ]
}
```

<!-- /get-modular:private-core-start -->

The object entry point uses the same semantic implementation as the internal
normalized seam. Under accepted ADR-0017 it is the public API of the first
`not-claimed` archive, and publishing it is not a claim that the carrier rules
OD-005 still owns are settled: those refinements stay outside the admitted
input domain and the package documents that. Accepted object rules of ADR-0006
and ADR-0007 apply; ambiguous cases are labelled candidate evidence until their
decision.
Tests must not require a second diagnostic generation or a generated stage1
before the first direct object-input test. No fake success result substitutes
for the complete plan and digest.
