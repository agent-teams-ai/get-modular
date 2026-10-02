---
id: ADR-0029
type: adr
status: accepted
owner: architecture
approved_by: product-owner
accepted_at: 2026-09-28
summary: Admits a bounded synchronous generation and lease kernel as a candidate while public SDK qualification remains on hold.
related:
  - ADR-0003
  - ADR-0023
  - ADR-0026
  - ADR-0028
---

# ADR-0029: Admit an optional lifecycle kernel candidate

## Context

The owner requested an immediately shared lifecycle library for dynamic module
Hosts after reviewing repeated OpenClaw command, hook, provider, service and
cache lifetimes. A synthetic Host can prove a reusable generation/admission/lease
invariant, but it cannot qualify a production consumer or arbitrary executable
code. Core and Assembly deliberately do not own lifecycle; a product Host must
retain imports, permissions, effects, physical resources, cleanup and recovery.

ADR-0003 admits the initial Core package topology. ADR-0028 conditionally names
`@get-modular/ownership`, reserves cleanup-obligation bookkeeping for K1, and
keeps the order S3 -> G1 -> K1. The current G1 status is pending/hold. Neither
decision silently admits another package. The owner explicitly accepted the
candidate-only exception on 2026-09-28, with public qualification and release
still subject to their real gates.

## Decision

Admit **one optional candidate package identity**:
`@get-modular/lifecycle-kernel` at `packages/lifecycle-kernel`. This is a narrow
additive exception to ADR-0003's initial topology. It is a synchronous policy
kernel for exact local generation membership, call admission, retained custody
and revocation. The architecture owner owns its contract and source admission.
It does not implement ADR-0028 ownership tickets and does not change that
decision's bytes, frozen C0 evidence, K1 eligibility or S3 -> G1 -> K1 order.

The package may become a **source-admitted candidate** before G1 activation,
provided its exact manifest, root, source/declaration edges, archive and
consumer evidence pass the rejecting checks below. An installed TEST tarball is
candidate evidence only. G1 remains `hold` until its existing trusted authority,
exact candidate/released binding and observation blockers are actually resolved.
No public qualification, npm publication, production adoption or release claim
follows from this decision or from candidate test success. Release needs an
exact version/archive identity, release gates and separate owner authorization.

### Package boundary

- Core and Assembly must not import the kernel. The kernel imports neither
  Core, Assembly, ownership, Foundation, Extension Foundation, Node builtins,
  product types nor another runtime package. Runtime dependencies are zero.
- One kernel instance is local to one Host. It has no ambient registry, IO,
  executable loader, timer, clock, callback, Promise, background driver or
  resource handle. It never invokes product code.
- The kernel mints only opaque **bookkeeping** generation and lease identities.
  A product Host allocates and interprets its own CandidateGenerationId and
  RuntimeGenerationId, binds the local kernel identity to an admitted artifact,
  and solely controls routing and effect authority. Neither a Core module ID
  nor a kernel token is an artifact trust credential or a grant.
- A call lease retains admitted execution and can be checked before a supported
  Host-mediated effect. A custody lease retains pending acquisition, stream or
  borrower lifetime but grants no invocation. The two identities are distinct
  private nominal types with runtime membership validation; copied, forged and
  foreign tokens are rejected.
- Allowed phases are staged, active, quiescing, retiring and retired. New calls
  need active phase. New custody needs staged or active phase and is obtained
  **before** acquisition. Quiesce closes new admission without deleting held
  work. Retire synchronously revokes ordinary invocation authority, while held
  leases remain until their real owner releases them. Resume is possible only
  from quiescing, never after retirement. No timeout, abort, exception or GC
  silently releases a lease.
- Retired is a bookkeeping fact. The Host may report physical release only
  after separately proving cleanup obligations and zero held leases. The Host
  owns private cleanup authority after revoke; plugin callers cannot use it.
  No general cleanup order is inferred from a composition graph.

The exact candidate API and transition/refusal table are developed in the
package's single owning declaration and tests under this decision. Their
initial implementation must retain the narrower behavior above. A broader
scope, such as retained consumers starting new executable calls during owner
retirement, requires a successor decision and separate evidence; OpenClaw
supports such a case, while this first candidate deliberately does not.

### Source admission and evidence

The candidate is admitted only as an **implemented** root, never by a private
flag, empty stub, pending-root exclusion or weaker checker. L0 records this
decision and prepares exact rejection; L1 atomically adds the substantive
package, actual root/source/quality coverage, lock importer, commands and
archive checks. A source gate must reject an unknown or differently named root,
nested manifest, install script, forbidden import including type-only edges,
deep import, ungoverned development output and missing/no-op command chain.
Existing Core/Assembly guards and historical lock edges remain active.

Use a single root-only ESM export with supported TypeScript and resolver
fixtures. Packed tests install exact candidate bytes in a disposable TEST
consumer, record source SHA, archive SHA-256/SRI, manifest/export conditions,
Node/compiler versions and the full current Consumer Module Standard byte hash.
Pure tests cover identity and phase transitions; Host tests independently
observe post-await effects, late acquisition, idle stream close, raw retirement
flight, cleanup debt and exclusive replacement. TEST evidence never counts as
one of ADR-0028's required production ownership scopes.

Update the **current** Consumer Module Standard and affected TEST adoption
profile, guidance and rejecting checks with each actual shared behavior change.
Review exact upstream standard bytes against each consumer pin before changing
that pin. Keep old accepted ADR and C0 bytes unchanged; do not assert Agent
Runtime dynamic adoption from its already accepted passive composition scope.

### Delivery order

1. L0: authenticate this decision, exact candidate admission policy and
   rejecting tests. No runtime stub or public claim.
2. L1: implement and independently review the pure package on an exact source
   SHA, with packed public-root and negative fixtures.
3. L2a-c: consume the exact candidate tarball in the explicitly TEST Host,
   first preserving one-shot behavior, then proving command/stream retention,
   then replacement/readback. Each slice has its own reviewable gates.
4. L3: complete real S3/G1 authority and qualify the public surface before any
   release. L4: adopt one real dynamic product Host with its own accepted scope,
   owner, cleanup/recovery entrypoint and exact consumer evidence.

## Consequences

- Hosts can reuse one narrow identity/admission/retention contract without
  copying its state machine into each product.
- Product-specific imports, grants, async actions, cleanup, retry and recovery
  remain outside the library. It does not intercept arbitrary native effects.
- A new package root increases API, source-policy and release-gate maintenance;
  candidate and released evidence must stay visibly distinct.
- `@get-modular/ownership` remains a separate conditional cleanup-obligation
  contract. A Host must not maintain independently editable copies of either
  package's facts or treat a lease release as physical resource disposal.

## Rejected alternatives

- Extend ownership K1 now: conflates cleanup obligations with invocation
  authority and bypasses its two-production-scope and G1 prerequisites.
- Put lifecycle in Core/Assembly: turns neutral composition into a plugin Host.
- Export a general async manager, registry or callback driver: claims product
  cleanup semantics that a shared library cannot prove.
- Hide a private/deep-import package until G1: avoids the governing checks while
  producing no supported consumer contract.
