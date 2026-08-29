---
id: QUAL-BOOTSTRAP-FIVE-CRITICS
type: qualification
status: qualified
owner: architecture
summary: Records independent boundary, API, lifecycle, governance, and delivery criticism of the Get Modular bootstrap.
related:
  - ADR-0001
  - OD-001
  - OD-002
---

# Bootstrap five-critic review

On 2026-08-29 five isolated hosted workers reviewed the proposed split with
`gpt-5.6-sol`, `xhigh`, and fast mode. Their scopes were deliberately distinct:

1. ownership and Clean Architecture boundaries;
2. TypeScript API and graph semantics;
3. lifecycle and security authority;
4. Docs Protocol, governance, and provenance;
5. practical delivery, packages, and adoption.

## Consensus

- A separate Get Modular repository is justified for neutral deterministic
  composition.
- Extension Foundation retains plugin artifact, distribution, trust,
  isolation, and retirement concerns.
- Product hosts retain capability contracts, executable loading,
  authorization, lifecycle, readiness, generations, routing, and recovery.
- The two neutral cores must remain independent; a product-owned adapter may
  consume both.
- Public stability requires two independent production adapters and
  cross-consumer conformance.
- Literal executable loader tables remain product-owned. Get Modular may define
  only an inert handoff shape.
- Package identity/topology and canonical plan encoding require explicit
  decisions before publication.

## Corrections applied

- Extension Foundation ADR-0015 was prepared to supersede the earlier
  extraction timing gate without weakening its retained safeguards.
- `instantiate` was narrowed to optional host-commanded construction and cannot
  imply activation.
- Distinct module, capability, implementation, and slot identities became
  normative.
- Resource bounds, deterministic diagnostics, compatibility rules, and exact
  provenance became V1 requirements rather than implementation notes.

## Remaining blockers

- OD-001 must resolve npm ownership and the initial package graph.
- OD-002 must freeze canonical bytes and digest vectors.
- Extension Foundation PR #30 must merge before its extraction authorization is
  treated as accepted upstream authority.

No production module implementation was reviewed in this bootstrap because no
production package existed yet.
