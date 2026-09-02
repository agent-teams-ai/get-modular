---
id: ADR-0016
type: adr
status: proposed
owner: architecture
summary: Fixes typed slot-keyed dependency records and a static generated-wiring witness so self-composition needs no runtime instrumentation.
related:
  - ADR-0008
  - ADR-0010
  - ADR-0011
  - ADR-0015
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
protocol, and the roadmap therefore makes every construction claim wait for
that whole protocol.

ADR-0008 also requires a construction witness that records "the identity of
the constructed object supplied to each consumer" and states that
instrumentation "must either already exist behind a private inert hook in the
same packed bytes or prove a zero-byte-delta transformation." That wording
implies runtime instrumentation of every factory call inside the distributed
package, which conflicts with the Feature Module Standard rule that feature
factories stay plain typed constructors and with the tarball audit that
excludes qualification code from the runtime closure.

The self-composition implementation guide needs both seams closed before the
first private package lands, and it needs them closed without the hermetic
sandbox, custody store and capsule machinery that ADR-0011 bundles with them.

## Decision

This decision is proposed and becomes normative only when accepted. Until
then implementations follow it as the candidate rule and claim nothing.

### Dependency record

- A dependency record is a plain TypeScript object literal whose type is the
  feature-owned `<Feature>Deps` interface and whose keys are exactly the
  declared slot identifiers of that feature. Own declarations choose slot
  identifiers from the identifier-safe subset of the accepted `localToken`
  grammar, lowercase ASCII letters and digits starting with a letter,
  excluding every own or inherited property name of `Object.prototype` and
  the name `then`, so that every key is a plain property name with no
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

### Precedence

When accepted, this decision supersedes ADR-0008 only for two clauses: the
requirement that a construction witness records the identity of each
constructed object supplied to a consumer, and the instrumentation clause that
permits an inert hook in the packed bytes or a zero-byte-delta transformation.
It refines, without contradicting, the two dependency-key sentences quoted in
the context. Every other requirement of ADR-0008 remains unchanged, including
stage0/stage1 plan and wiring equality, the finite emitter, the allowlist, the
isolated build roots and the reversal rule.

This decision does not accept ADR-0011. ADR-0011's null-prototype refinement
becomes unnecessary for own dependency records; its release-custody protocol
remains a separate proposed decision.

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
factory to accept an exotic object. If accepted, this decision resolves D7 and
the packet's recommendation is superseded by it.

## Acceptance evidence

- an independent witness checker under `tests/qualification` with mutation
  fixtures that reject a missing import, an extra factory call, a swapped or
  missing dependency key, a reordered call and a call keyed by a string that is
  not a declared slot;
- the behavioral replacement test executed against both the direct and the
  generated subject through the public boundary;
- a test proving that a slot or implementation identity equal to
  `constructor`, `prototype` or `then` is handled only through `Map`
  lookups and never reaches an object key;
- `tsc` rejecting a generated file whose record does not satisfy the
  feature-owned interface.

## Consequences

- The first private package can implement self-composition without waiting
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
