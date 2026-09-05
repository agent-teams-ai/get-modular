---
id: ADR-0011
type: adr
status: proposed
owner: architecture
summary: Defines private executable evidence, hermetic build inputs, and content-addressed release custody for ADR-0008.
related:
  - ADR-0007
  - ADR-0008
  - ADR-0009
  - ADR-0010
  - ADR-0016
  - ADR-0017
  - ADR-0018
  - GM-REQ-V1
  - ARCH-FEATURE-MODULE-STANDARD
---

# ADR-0011: Define private self-composition evidence and release custody

## Context

ADR-0008 accepts build-time static self-composition for the first Core and fixes
the required evidence categories. ADR-0007 deliberately does not define a
public subject API, runner, report schema, or attestation before a packed
production subject exists. That separation is correct, but it leaves several
private release protocols too implicit for implementation.

Three independent read-only reviewers examined exact revision
`4fb74bdb566ba3154aeeb6673d6c2321f7b337b2` after ADR-0008 was accepted. The
architecture and reliability reviews returned conditional go decisions. The
delivery review rejected only treating the complete proof and release program
as one small MVP increment. Their concrete counterexamples agreed on four
areas:

- candidate-owned witnesses can report a graph that the facade does not use;
- a mutable archive path can be replaced after qualification;
- a source manifest can omit an undeclared read or lose a hash-to-build race;
- version labels do not identify the exact toolchain that produced an archive.

They also exposed ambiguity around object identity across isolated roots,
hostile slot names, source-path portability, concurrent builds, known-good
recovery assets, performance baselines, and the change surface for an ordinary
internal module.

This decision is a proposed private implementation and release protocol. It
does not reopen the selected Option C, publish a conformance API, add production
artifact-trust authority to Get Modular, or block the direct Core vertical
slice and checkpoint A. Accepted ADR-0017 permits the bounded pre-1.0
`not-claimed` publication checkpoint without this proposal. Release eligibility
and runtime-conformance claims still require their applicable accepted evidence.
Revising this proposal does not accept its custody protocol.

## Options

| Option | Tradeoff |
| --- | --- |
| Narrative evidence only | Smallest implementation, but the current counterexamples can pass custody checks with arbitrary files or self-reported witnesses |
| Private closed evidence protocol | Adds schemas and independent verification only to build and qualification tooling; keeps the runtime and public API unchanged |
| Public conformance and provenance framework now | Maximizes reuse before a real subject exists, but contradicts ADR-0007 and creates premature compatibility surface |

## Decision

Recommend a private closed evidence protocol. This section becomes normative
only after this ADR is accepted.

### Scoped relation to accepted authority

Accepted ADR-0016 already owns the dependency-record seam and construction
witness. This proposal consumes that decision: own factories receive typed
object literals with its restricted owner-authored slot keys; caller identities
remain opaque `Map`/`Set` keys. It introduces no null-prototype record, runtime
identity instrumentation, wrapper or second construction authority. ADR-0017
owns bounded pre-1.0 publication and ADR-0018 owns the readiness refinements.
All unaffected ADR-0008 rules, including portable ASCII source paths, remain.

This private protocol is necessary release evidence, not a Feature Module
Standard conformance claim. Source admission, same-subject qualification,
accepted reciprocal promotion, and the exact qualification-document byte anchor
remain governed by the Feature Module Standard profile.

### Delivery sequence and authority

Implementation proceeds in three bounded phases:

1. Build a substantive direct Core slice with owner-local ports, factories,
   inert declarations, and the minimal stage0 root.
2. At checkpoint A, compile the real own graph and prove one controlled binding
   replacement through the public compiler boundary plus the ADR-0016 static
   witness. Do not add an artificial second edge to satisfy this proposal.
3. Add the finite emitter and generated stage1 within the accepted M3 scope.
   Add promotion evidence and release custody only after their decision is
   accepted; neither this proposal nor a passing witness expands the scope.

Checkpoint A is not distributable success and cannot weaken ADR-0008. It is a
time-boxed stop point before expensive release machinery. Before the emitter, a
normal module addition measures its owner-local declaration/factory, the closed
own profile binding, stage0 assembly, and the private literal allowlist needed
by the M1 witness. The emitter reuses that allowlist from M3.
These are edit loci, not competing identity authorities: the feature owns its
identity and factory, the profile owns intended selection, the allowlist owns
literal source binding, and stage0 owns only direct qualification assembly.
Generated wiring and manifests require no manual edit. The independent atomic
obligation ledger changes only when a normative obligation changes, not for
every implementation addition.

Checkpoint A records its evidence, remaining defects and the next authorized
scope. No additional owner `GO` ritual is introduced for already authorized
M1 work. M2/M3 scope expansion and accepted release-custody authority retain
their actual decision prerequisites. The checkpoint measures representative
changes before and after an emitter exists against the applicable edit loci.

ADR-0009 must be accepted before the first production public exports are fixed,
and ADR-0010 must be accepted before production primitive adapters are selected.
The first production package is admitted atomically: it changes the Feature
Module Standard profile to `source-admitted`, enables the pinned Foundation
source-dependency policy, adds positive and negative structural fixtures, and
wires the real checks into fast and complete gates. File placement alone is not
source admission.

The implementation is delivered as a dependency-safe PR train whose every
checkpoint ends in observable behavior:

| Order | Bounded delivery | Exit evidence |
| --- | --- | --- |
| 1 | Source-admitted direct vertical slice | One substantive object-entry behavior, minimal stage0, atomic source admission, source boundaries, and no ceremonial layers |
| 2 | Complete object-entry semantic compiler | The object entry point and independent direct vectors pass with structured bounded failures |
| 3 | Checkpoint A own graph | One real binding replacement changes public behavior and the independent static witness |
| 4 | Raw-byte and resource slice | Object/raw parity, exact resource boundaries, fuzz regressions, and browser-worker smoke pass |
| 5 | Packed direct qualification | One temporary direct subject passes the independent packed runner without a public runner API |
| 6 | Finite emitter and generated stage1 | P0/P1, W0/W1, construction witnesses, source checks, and independent vectors agree |
| 7 | No-publish promotion rehearsal | Hermetic cold builds, runtime matrix, offline replay, attestation, and empty-host recovery pass without registry credentials |

No PR introduces a generic framework, empty package, or horizontal proof layer
without the behavior that consumes it. The line estimates in ADR-0008 are
planning forecasts, not acceptance criteria; actual handwritten production,
qualification, generated, and release-tooling lines are reported separately at
checkpoint A and before emitter approval.

Get Modular owns compilation semantics. The Core build owner owns stage0,
profile, emitter, and source/build manifests. The conformance owner owns the
atomic obligation ledger, wrappers, expected vectors, evidence verification,
and promotion decisions. The release publisher owns the final digest-bound
upload, registry read-back, and distribution-tag promotion in the protected Get
Modular npm workflow. It does not own product publication, artifact admission,
signing, discovery, or general provenance. Role separation reduces correlated
defects; it is not a security boundary or a claim that different humans execute
each role. The verifier and obligation ledger are pinned outside
candidate-controlled source. Build and verification run without publication
credentials; only the publisher receives an already qualified digest. One
automated CI system may execute the roles when those code, input, credential,
and custody boundaries remain independent and auditable.

### Closed evidence envelope

Before the first custody-qualified release, private schemas use explicit `kind` and
`schemaVersion` fields, reject unknown fields, and have one canonical JSON
encoding. The envelope is closed over these records:

| Record | Minimum binding |
| --- | --- |
| `SourceManifest` | Immutable source-snapshot digest plus every admitted source, configuration, script, template, lockfile, package, and obligation input |
| `BuildContext` | Cryptographic identities of Node, pnpm, TypeScript, builder target, read-only dependency store, and the explicit environment |
| `ConstructionWitness` | ADR-0016 independent static wiring tuples and controlled public-boundary replacement evidence; no reference-identity observation |
| `QualificationReport` | Exact subject archive, contract and qualification ledgers, closed case inventory, exact results, exact runtime matrix identities, and one closed `supportEnvelope` containing supported cells and explicit exclusions |
| `ReleaseAttestation` | Digests of every record above, including `QualificationReport.supportEnvelope`, P0/P1, W0/W1, selected plans, archive bytes, verifier version, and one terminal pass/fail state; this same record is the Phase 8 promotion manifest |

No separate support manifest or promotion wrapper may repeat these fields. The
mandatory `docs/generated/core-support-envelope.md` operator view is generated
from `QualificationReport.supportEnvelope` and verified byte-for-byte against
that section. It is navigation, not release or support authority.

Every record carries one common `SubjectEvidenceKey` derived from canonical
pre-key projections of the exact archive, source snapshot, build context,
selected plan, wiring, and assembly root. Excluding the common-key field from
those projections avoids a circular digest definition. The verifier recomputes
the key and rejects a record from another otherwise successful build. A
cross-splice mutation exchanges records between two successful builds and must
fail.

The independent verifier consumes bytes, not trusted in-memory objects. It
rejects missing, duplicate, unexpected, mismatched, or failed records. Mutation
tests must change each archive, ledger, subject, stage, witness, case, runtime,
and result binding independently and prove rejection. The trusted verifier,
rather than candidate code, checks the accepted static witness and behavioral
replacement results. A tracked
file with a matching digest identifies bytes only; it proves neither validity,
authority, nor trust.

These schemas and the first verifier stay root-private until a packed subject
exists. ADR-0007's later compatibility decision still owns whether any subject,
runner, report, or attestation shape becomes a public conformance API.

### Graph authority and construction witnesses

Every atomic normative compiler behavior has a distinct immutable ledger ID and
one closed mapping to its owning feature, provided capability, consumer port,
requirement identity, positive vector, and killed negative mutation. One broad
requirement with multiple obligations therefore has multiple ledger rows.
Removing, bypassing, or replacing a provider must change or fail every owned
normative outcome through the public compiler API. The facade cannot duplicate
a normative implementation, retain a hidden concrete import, or fall back after
an injected provider fails.

The witness uses ADR-0016's canonical wiring tuples and independent AST checks
of the handwritten stage0 and generated stage1 roots. It verifies the imported
factories, exact dependency keys and selected providers, and call order. The
controlled canonicalizer replacement changes the digest observed through the
public boundary in both subjects and restores it when reversed. Custody binds
these existing proof results to their exact subject; it adds no heap-identity
claim, conformance-owned runtime wrapper or instrumentation in distributed bytes.

### Hostile slot names and closed dependencies

ADR-0016 separates caller identities from own dependency keys. Caller identity
lookups use `Map`/`Set`, including valid hostile tokens. Own declarations use
only the accepted identifier-safe subset; the witness rejects `constructor`,
`prototype`, `then` and all other excluded names. Own dependency records are
plain typed object literals checked by TypeScript. No null-prototype record,
descriptor inspection, spreading caller values or Promise assimilation is
introduced. The portable identity grammar still rejects `__proto__` wherever
that spelling is outside its accepted domain.

### Hermetic source and toolchain identity

Qualification builds from an immutable content-addressed source snapshot. The
builder can read only that snapshot, a verified read-only toolchain and package
store, and its own fresh output roots. Undeclared reads fail during the build;
post-hoc manifest comparison alone is insufficient. The external manifest
producer reconciles its inventory with compiler/module-resolution inputs,
package contents, scripts, generated inputs, and the final tar allowlist.

Manifest generation and compilation consume the same immutable snapshot, so a
file cannot change between hashing and use. Source-owned paths use the portable
ASCII subset of normalized POSIX-relative paths and are sorted by ASCII bytes,
as required by ADR-0008. Non-ASCII paths, case-fold collisions, Windows reserved
names, trailing dot or space segments, symlinks, and platform-dependent aliases
fail admission. Physical package-store and absolute paths never enter portable
identity; dependencies use lockfile and content digests.

The canonical Linux build sandbox mounts or admits exactly the manifest paths
plus the verified read-only toolchain closure. The restriction covers child
processes and metadata reads, not only direct file opens by the compiler.
Negative fixtures attempt to read an undeclared file inside the snapshot and an
operating-system file. macOS and Windows execute the already-built archive and
do not claim to prove canonical build isolation.

`BuildContext` treats an exact identity as cryptographic content identity, not
only a reported version. The canonical form binds an immutable builder image
configuration and root-filesystem digest, the complete Node, pnpm, TypeScript,
package-store and system-library closure, configuration bytes, target
architecture, explicit non-secret environment, and verifier and publisher
client bytes. `NODE_AUTH_TOKEN` and all other credentials are forbidden from
the builder context and recovery capsule. This does not claim diverse-compiler
or trusting-trust protection.

Two builders may run simultaneously only with distinct temporary, generated,
incremental, pack, and cache roots. A focused test proves equal normalized
outputs and no writes outside either root.

### Content-addressed release custody and recovery

The canonical builder writes the qualified tarball to immutable storage under
its SHA-256 using create-if-absent or conditional-put semantics. If the object
already exists, custody verifies its bytes before reuse. Concurrent-writer and
writer-crash barrier tests prove that no partial or replaced blob can become the
retained subject. Every later operation addresses the blob by digest, not by a
mutable workspace path or package version. A pause-and-replace mutation between
qualification and upload must fail before publication.

For a custody-qualified release, actual publication is a separate protected
transaction after the no-publish rehearsal. ADR-0017's `not-claimed` checkpoint
does not inherit that rehearsal prerequisite. The publisher independently rehashes the one retained digest,
publishes it under a quarantine tag, downloads the exact version without cache,
and compares archive bytes before moving a distribution tag. A post-publication
mismatch cannot undo the registry write: it blocks distribution-tag,
conformance, and downstream promotion and opens a quarantine incident.

A known-good release capsule retains the actual source tree blob, immutable
builder image, package store, schemas, verifier bytes, archive, evidence
envelope, and attestation independently of the current branch and writable
build cache. Its external anchor is stored outside the capsule's writable
contents. Before the first custody-qualified publication and after its release-pipeline changes, an
offline drill restores those retained inputs onto an empty host, deletes every
generated output, performs cold regeneration and qualification of the exact
archive, and proves that stage0 is absent from the release artifact. A retained
old archive is only
a comparison target; generated wiring is never restored as authority. Two cold
canonical builds must produce the exact same tarball before a cold-reproducible
archive claim is made.

### Privileged kernel, diagnostics, and gates

The privileged build kernel has a machine-readable private manifest containing
its exact source paths, recursive import closure, allowed responsibilities, and
size budget. Source checks reject semantic validation, defaults, branching
policy, dynamic lookup, stage1 imports, or public exports in stage0 and reject a
generic resolver or general-purpose generator in the emitter. The finite
literal emitter required by ADR-0008 is explicitly allowed. Its generated
language is syntactically restricted; AST checks claim only that finite emitted
language plus execution evidence, not arbitrary TypeScript semantics.

One private offline replay command accepts a retained relative-path evidence
bundle and reports exactly one primary phase code. It first reports semantic
plan differences, then wiring, witnesses, source/build context, archive, and
runtime matrix. A closed private diagnostic catalog fixes precedence and byte
caps; multi-fault permutations prove stable primary selection. A fail-closed
path-to-gate manifest maps publisher, verifier, evidence-envelope, workflow,
and recovery paths to their required gates. Replay emits no credentials,
absolute paths, or unbounded subject output.

Gates remain proportional:

- changed and focused jobs provide fast feedback but do not claim complete
  qualification;
- the canonical PR complete gate covers types, source boundaries, direct
  semantics, deterministic generation, stage smoke, and packed Node execution;
- protected promotion alone runs dual subjects, hermetic cold reproduction,
  operating-system and runtime matrices, archive custody, recovery, and
  attestation. Pull-request jobs never receive publication credentials.

Benchmark commands, hardware class, warm-up, sample count, p50/p95 statistics,
CPU, peak memory, and included code directories are frozen before any numeric
budget is interpreted or enforced. Generated output is excluded; handwritten
qualification and release code is included. Checkpoint A stops for owner review
if real components do not form a useful graph, three representative changes
exceed the authoring-touch budget, or a fresh maintainer cannot diagnose an
injected divergence from the retained bundle.

## Consequences

- The accepted self-composition design gains executable custody and witness
  semantics without changing its public compiler contract.
- A direct Core slice, checkpoint A and ADR-0017's bounded `not-claimed`
  publication can proceed before custody; conformance and release eligibility
  remain gated by their applicable authority and evidence.
- Private build and qualification code becomes larger and requires independent
  ownership, mutation tests, and retained release assets.
- Strict snapshot access may require a platform-specific sandbox adapter. The
  adapter remains replaceable and cannot become a Get Modular runtime concern.
- The protocol proves the exact enumerated build and targets. It does not prove
  a malicious but correctly identified toolchain trustworthy or isolate loaded
  implementation code.

## Rejected alternatives

- Treat any digest-matching tracked file as valid evidence. Custody does not
  prove that a vector ran or that its result belongs to the release archive.
- Let candidate code emit its own witness. Decorative composition can then
  report selected factories while the facade uses hidden concrete imports.
- Qualify and publish from the same mutable path. A post-qualification swap can
  publish untested bytes.
- Define a public report, runner, attestation, or provenance framework before a
  packed subject exists. ADR-0007 intentionally defers that compatibility
  surface.
- Run promotion matrices on every pull request. The cost does not reduce risk
  for ordinary source edits and would make the architecture impractical.
