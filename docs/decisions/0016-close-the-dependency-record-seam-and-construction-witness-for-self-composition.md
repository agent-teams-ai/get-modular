---
id: ADR-0016
type: adr
status: accepted
owner: architecture
summary: Fixes typed slot-keyed dependency records and a static generated-wiring witness so self-composition needs no runtime instrumentation.
approved_by: product-owner
accepted_at: 2026-09-04
related:
  - ADR-0008
  - ADR-0010
  - ADR-0011
  - ADR-0015
  - ARCH-FEATURE-MODULE-STANDARD
  - ARCH-SELF-COMPOSITION-GUIDE
  - ARCH-MVP-IMPLEMENTATION-ROADMAP
---

<!-- cspell:words thenable -->

# ADR-0016: Close the dependency-record seam and construction witness for self-composition

## Context

Accepted ADR-0008 requires that every internal compiler feature receives its
dependencies as a closed typed record and that "Factory dependency keys must
exactly match declared slots." The same decision also requires that hostile
but valid identities such as `constructor` or `prototype` "never become
code, property lookup keys, paths, or comments." Read together for a record
keyed by slot identifiers, those two sentences leave the representation of the
dependency record undecided. Proposed ADR-0011 resolves it with a
null-prototype own-key refinement as one part of a much wider release-custody
protocol, and the roadmap, before this decision, made every construction
claim wait for that whole protocol.

ADR-0008 also requires a construction witness that records "the identity of
the constructed object supplied to each consumer" and states that
instrumentation "must either already exist behind a private inert hook in the
same packed bytes or prove a zero-byte-delta transformation." That wording
implies runtime instrumentation of every factory call inside the distributed
package, which sits uneasily with the Feature Module Standard expectation of a
narrow typed factory surface and with the tarball audit that excludes
qualification code from the runtime closure.

The self-composition implementation guide needs both seams closed before the
first package lands, and it needs them closed without the hermetic
sandbox, custody store and capsule machinery that ADR-0011 bundles with them.

## Decision

This decision is accepted; implementations follow it and may claim
conformance to it only through the evidence below.

### Dependency record

- A dependency record is a plain TypeScript object literal whose type is the
  feature-owned `<Feature>Deps` interface and whose keys are exactly the
  declared slot identifiers of that feature. Own declarations choose slot
  identifiers from the identifier-safe subset of the accepted `localToken`
  grammar, lowercase ASCII letters and digits starting with a letter,
  excluding every own property name of `Object.prototype` and the names
  `prototype` and `then`, so that every key is a plain property name with no
  prototype or thenable collision. The witness checker rejects an own
  declaration whose slot identifier violates this subset.
- The emitter writes each key from the feature-owned declaration handle in the
  allowlist, never from a string read out of a profile or plan. Both ADR-0008
  sentences then hold by construction: keys match declared slots because the
  handle is the declaration, and identities never become lookup keys because
  no identity string is ever used to index an object.
- Inside the compiler, every lookup by module, implementation, capability or
  slot identity uses `Map` or `Set`, never property access on an ordinary
  object. Hostile identities from caller input remain opaque data.
- No null-prototype record, descriptor inspection, `Object.assign`, spread of
  caller data, inherited lookup or thenable assimilation is required or
  permitted for own dependency records. TypeScript checks the literal against
  the interface at build time.

### Construction witness

- The witness is a static structural proof over the generated stage1 wiring.
  An independent checker parses the generated file and verifies, against the
  accepted plan P0, the exact set of imports, one factory call per selected
  implementation, the dependency-record keys of every call against the plan
  bindings, and the call order against `dependencyOrder`. The direct stage0
  root is checked the same way from its handwritten source.
- The behavioral proof is a controlled binding replacement observed through
  the public compiler boundary: swapping the `canonicalizer` binding to the
  qualification-only witness variant changes the digest of the same input in
  both the direct and the generated subject, and swapping it back restores it.
- No runtime instrumentation, inert hook, wrapper factory or zero-byte-delta
  transformation exists in the distributed package. Object identities are not
  recorded; the structural proof and the behavioral proof together establish
  that the generated plan controls construction.

### Wiring tuples and allowlist handles

- The construction witness compares wiring as canonical tuples, not as source
  bytes. For every selected implementation the tuple is
  `[implementationId, dependencyOrderIndex, [[slotId, providerImplementationId], ...]]`
  with the slot pairs sorted by `slotId` in ASCII order; the list of tuples is
  sorted by `dependencyOrderIndex`, serialized with RFC 8785 and hashed with
  SHA-256. W0 is the wiring that the stage0 build emits from P0 and W1 the
  wiring that the stage1 build emits from P1, exactly as ADR-0008 defines them;
  one AST reader extracts the tuples from W0, from W1 and, separately, from the
  handwritten stage0 root, resolving every imported constant to the
  implementation identity of its declaration handle. W0 equals W1 when their
  tuple digests are equal, and the handwritten root is checked against P0 by
  the static witness on its own. The bytes of a generated file remain
  evidence only for the regeneration check that ADR-0008 requires between the
  file used by a build and its disposable regeneration.
- The emitter allowlist is a build-time `Map` that `allowlist.ts` builds from
  static imports of each feature's `declaration.ts` and `factory.ts`, as
  ADR-0008 requires of feature-owned handles. Its key is the imported
  `implementationId` constant, never a string typed in the allowlist, and its
  value is a typed handle `{ declaration, factory, importPath, factoryExport,
  declarationExport, localName }`: `declaration` and `factory` are the imported
  values, `importPath` is a relative path inside `src/features/**` that ends
  in `.js`, `factoryExport` and `declarationExport` name the exports that the
  generated wiring imports, and `localName` is an author-chosen ECMAScript
  identifier that is unique across the allowlist. The emitter reads slot
  identifiers from `declaration.slots` of the imported declaration and never
  from a plan string, and it never loads a module dynamically. The emitter fails the build without writing
  output on `allowlist.unknown-implementation`,
  `allowlist.missing-for-selected`, `allowlist.duplicate-local-name`,
  `allowlist.out-of-bound-import` and `allowlist.invalid-identifier`. An entry
  that the plan does not select is not an error. A qualification allowlist may
  extend the base allowlist with entries that point outside `src`, and only
  the qualification build may load it.

### Precedence

This decision supersedes ADR-0008 only for four clauses: the
requirement that a construction witness records the identity of each
constructed object supplied to a consumer; the instrumentation clause that
permits an inert hook in the packed bytes or a zero-byte-delta transformation;
the acceptance sentence that requires a controlled binding change to
demonstrate a changed injected object identity, which under this decision
must instead alter the digest observed through the public boundary and the
static witness; and the sentence that requires exact W0/W1 equality, which
under this decision means equality of the canonical wiring tuples defined
above rather than of emitted source bytes, while the byte comparison of a
regenerated file against the file a build used remains as ADR-0008 states.
It also narrows one sentence: ADR-0008's rule that identities
"never become code, property lookup keys, paths, or comments" applies to
caller-supplied identities; an own slot identifier from the identifier-safe
subset may appear as an object-literal key in generated wiring and in the
handwritten stage0 root, and no other identity may. The descriptive phrase
"object-identity witness" in ADR-0008's research basis is not normative. Every
other requirement of ADR-0008 remains unchanged, including stage0/stage1 plan
and wiring equality, the finite emitter, the allowlist, the isolated build
roots and the reversal rule.

This decision does not accept ADR-0011. ADR-0011's null-prototype refinement
becomes unnecessary for own dependency records; its release-custody protocol
remains a separate proposed decision.

#### Relation to ADR-0011

Three parts of proposed ADR-0011 are incompatible with this decision and must
be removed or rewritten before ADR-0011 can be accepted alongside it: the
`ConstructionWitness` record that proves reference identity through
conformance-owned wrappers, the null-prototype closed dependency record for
hostile slot names, and the checkpoint A requirement of at least two natural
dependency edges. After that revision ADR-0011 keeps only the source manifest,
build context, qualification report, release attestation, hermetic build and
custody protocol.

### Relation to the MVP decision packet

The MVP decision packet lists this seam as its item D7 and scores three
representations: a null-prototype frozen record, frozen ordered entry tuples
with a typed lookup helper, and a read-only `Map` behind a private adapter.
This decision selects a fourth form, the typed object literal, because the
threat those three options defend against, hostile slot identities reaching
an ordinary object, cannot occur for owner-authored declarations whose slot
identifiers are restricted at build time and checked by the witness. The
tuple and `Map` forms keep the same guarantee at the cost of per-slot typing
and extra ceremony in every factory; the null-prototype form forces every
factory to accept an exotic object. This decision resolves D7, and the
packet's recommendation is superseded by it.

## Acceptance evidence

Acceptance is recorded on this text, as ADR-0007 was accepted on its static
artifacts; the evidence below gates every claim of self-composition.

- an independent witness checker under `tests/qualification` with mutation
  fixtures that reject a missing import, an extra factory call, a swapped or
  missing dependency key, a reordered call and a call keyed by a string that is
  not a declared slot;
- the behavioral replacement test executed against both the direct and the
  generated subject through the public boundary;
- a test proving that valid hostile portable implementation identities such as
  `x/constructor`, `x/prototype` and `x/then` are handled only through `Map`
  lookups and never reach an object key; local slot tokens equal to
  `constructor`, `prototype` or `then` are rejected by the identifier subset;
- `tsc` rejecting a generated file whose record does not satisfy the
  feature-owned interface.

## Consequences

- The first package can implement self-composition without waiting
  for the release-custody protocol.
- Feature factories stay plain typed constructors with no instrumentation
  seam, which keeps them within the Feature Module Standard.
- The witness lives entirely in qualification code and can be strengthened
  without touching production bytes.
- Object identity is no longer part of the evidence; consumers that need an
  identity guarantee rely on the structural proof plus the behavioral
  replacement instead.

## Rejected alternatives

- Null-prototype records with descriptor inspection for every factory call.
  They defend against hostile keys that cannot occur in owner-authored
  declarations checked by TypeScript, and they force every factory to accept
  an exotic object.
- Runtime wrappers that capture factory arguments and returned instances. They
  either ship in the package or require a second build whose bytes differ from
  the qualified archive.
- Committing the generated wiring so that review replaces the witness.
  Review cannot prove that the committed file matches the current plan.
