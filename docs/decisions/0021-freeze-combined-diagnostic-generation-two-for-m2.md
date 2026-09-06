---
id: ADR-0021
type: adr
status: proposed
owner: architecture
summary: Binds the combined raw and duplicate-record successor artifacts and bounded M2 implementation scope.
---

# ADR-0021: Freeze combined diagnostic generation two for M2

## Context

M1 is delivered. Raw input and repeated binding records still require the
combined diagnostic generation 2 transaction described by ADR-0013 and
ADR-0014. The owner has selected both wrapper rules; this proposal binds their
complete evidence and a bounded implementation handoff.

This document remains proposed. Neither a fixture pass nor its presence in
main authorizes M2 production semantics.

## Decision

### One successor, immutable semantic annexes

On explicit acceptance, adopt the complete Decision sections of these exact
semantic annexes together:

- [ADR-0013](0013-close-trusted-object-and-raw-carrier-semantics.md), raw file
  digest `sha256:0ad41cbfb49f6fe5e04cf0b7cab1deecfc047c95c457446b97969333be108ff3`;
- [ADR-0014](0014-close-duplicate-binding-record-semantics.md), whose exact raw
  file digest is bound by the generation 2 ledger below.

ADR-0021 supplies their successor acceptance authority. Keep those historical
proposals and their fixture pins byte-identical; their old proposed status
continues to describe the annex documents. Resolve OD-005 and OD-006 through
ADR-0021 and register this accepted umbrella, not altered copies of the annexes.
Only the narrow successor precedence described by the annexes applies. Every
accepted authority, base contract, snapshot and existing ledger stays unchanged.
ADR-0018 and ADR-0020 retain their accepted effect.

Both new codes enter the same successor: 33 catalog codes, 32 emittable codes
and 20 facts. `input.invalid-byte-carrier` is first in code rank;
`binding.duplicate-record` immediately precedes `binding.duplicate`. Public
`DiagnosticCode` remains the projection of the emittable diagnostic union.
This adds no public catalog API or second semantic authority.

The two owner selections are carried without reopening them:

1. After wrapper-field admission, own declaration-list length above 4096
   proves the early limit before index descriptors, carrier inspection or copy.
   Emit declaration-phase `input.limit-exceeded`, empty path and coordinate,
   and `actual: 4097`. No byte or document facts are claimed.
2. An accessor profile, or a missing, inherited-only or accessor declaration
   index, invalidates the whole wrapper with `not-document-list`. No getter is
   called and document facts are unavailable. An own data value `undefined`
   remains a distinct document carrier failure. Count overflow precedes index
   inspection, not admission of the outer wrapper fields.

### Frozen evidence

The [generation 2 ledger](../../architecture/authority/diagnostic-generation-two-ledger.json)
binds the successor schema, catalog, diagnostic contract, snapshots, candidate,
closed recipe/checker sources and retained execution bytes.

Generation 2 ledger digest: `sha256:3781993b5714d8f8928ca2a2082353f93bc42b0e69a3373bd9cfaa41963f7f61`

The [retained ledger](../../architecture/qualification/generation-two/retained-ledger.json)
is the unchanged 30-artifact capture ledger, digest
`sha256:a75f5e079611211f7be525d9e864490d3a0dcabc1ab8ee306bf19ecba1d8c8cf`.
The adjacent `retained-candidate.json.gz` stores those 30 files plus that ledger
as a closed JSON container with base64 bytes. Compression changes no inner
identity. It includes the exact source archive, invocation, Node binary and
lockfile digests, OS/architecture metadata, full observations and event stream.
No absolute path in a historical observation is a portable command to execute.

Executed capture source: `0b20ee7227644d098ae59c5b6f27cba8f0a4a5fb`.
Executed source tree: `1abcc0b870d90bdb3156980afaa72040c2b593ca`.
That source tree is also the reviewed tree delivered by PR #59; a later merge
SHA is not relabelled as the original execution.

The capture contains 941 complete static case recipes across ten categories,
92 raw invocation observations, 82 object descriptor observations, 109 existing
content-addressed mutation rows and seven boundary source mutants. Resource
inputs retain occurrence-based limits. Object descriptor coverage includes 68
positive recipes and 14 rejection controls. The ordered-many reversal remains
a relational witness, separate from the complete-result case count.

The private [evidence checker](../../architecture/checks/m2-evidence.mjs)
authenticates every ledger entry, validates the closed archive, reconstructs
the successor and streams, and cross-checks the complete observations and
mutation results against the captured events. Its
[negative tests](../../tests/qualification/m2-candidate/retained-acceptance.test.mjs)
reject source/ledger substitution, incomplete or reordered membership, changed
observations and false Core labels. Run:

```sh
node --test tests/qualification/m2-candidate/retained-acceptance.test.mjs
```

This is retained private Node oracle/static evidence. Historical
`proposed-only`, `pending` and `compilerExecuted: false` labels are preserved
when the decision is accepted. Acceptance gives the contract authority; it
cannot turn these observations into execution of a future compiler.

### Owner scope and implementation handoff

Before production edits, the explicit owner acceptance activates ADR-0021,
resolves OD-005/OD-006, registers its immutable decision digest and expands the
roadmap owner record with the matching ledger identity. The active M1 record
remains unchanged while this document is proposed. The finite checker must
reject an expanded record without the accepted umbrella and matching evidence.
No publication, dependency selection, runtime lifecycle or generated claim is
implicitly admitted by that operation.

Prepared replacement record follows. After explicit acceptance, set the actual
approval date and authorized status and insert it into the existing roadmap
markers in the same transaction. This inactive example is deliberately rejected
by the checker.

```json
{
  "repository": "agent-teams-ai/get-modular",
  "baseCommit": "19ec4e0045c890b13132a61ab50e11bbe963a27d",
  "authorityDigest": "sha256:9ba074210704a20f6a3ef7486f3cf2ec7435fb0fc5552cca210b6d3d5d73f077",
  "approvedBy": "product-owner",
  "approvedOn": null,
  "status": "pending-owner-approval",
  "package": "@get-modular/core",
  "scope": [
    "semantics",
    "object-entry",
    "publication-not-claimed",
    "raw-carriers",
    "raw-entry-export",
    "duplicate-binding-records"
  ],
  "excluded": [
    "runtime-lifecycle",
    "conformance-claims",
    "proposed-contract-claims",
    "generated-self-composition-claims"
  ],
  "m2Authority": {
    "decisionId": "ADR-0021",
    "ledgerDigest": "sha256:3781993b5714d8f8928ca2a2082353f93bc42b0e69a3373bd9cfaa41963f7f61"
  }
}
```

The integration owner follows the existing [MVP roadmap](../architecture/mvp-implementation-roadmap.md)
and [feature guide](../architecture/self-composition-implementation-guide.md).
M2 spans the existing phases; these are bounded delivery packets within them:

| Packet | Ownership and dependency | Definition of done |
| --- | --- | --- |
| M2.1 | Integration owner: successor diagnostic types, ranks and fact vocabulary. Start only after acceptance and expanded scope. | Actual Core types and diagnostics use the additive generation; existing-code relative order and M1 vectors pass; exhaustive public type fixtures pass. |
| M2.2 | Admission owner: synchronous raw wrapper/carrier snapshot and bounded exact-number decoding. Depends on M2.1 contract; no binding/graph edits. | The real input-admission feature port executes the closed carrier/wrapper/numeric cases with complete independently expected admission observations; synchronous ownership, exact numbers and zero forbidden hooks are proved. Public facade wiring and complete compiler-result replay belong to M2.4. |
| M2.3 | Binding/graph owner: occurrence census, invalid-group exclusion and independent facts. Parallel with M2.2 after M2.1; shared types and composition root remain integration-owned. | The real semantic feature and existing object entry replay repeated-record cases, permutations, ordering, top-K and resource boundaries; invalid groups supply no edges and independent failures survive. Raw-entry replay joins M2.4 after M2.2 is available. |
| M2.4 | Integration and qualification owners: wire one public raw entry through existing feature ports and stage0 composition. Depends on M2.2 and M2.3. | Replay the complete successor suite through both ordinary object/raw entries and retain actual Core source/subject digests and complete results; focused mutation tests detect the named implementation failures; all M1 regressions and full check pass. Packed Node and four TypeScript/type-scale gates pass for the resulting archive before any publication claim. |

M2.2 and M2.3 can finish their component checkpoints independently; neither
requires the other lane or the M2.4 facade to declare that bounded checkpoint
ready. Component readiness does not satisfy the M2 milestone: M2.4 still owns
the complete ordinary-entry replay before exposure.

Each writer uses an isolated checkout at the exact agreed commit, bounded
non-overlapping file ownership and a small reversible PR. Shared integration
files have one writer. Independent reviewers inspect risky boundaries at the
resulting exact SHA. Fixture observations are never counted as compiler tests.

M3 then follows the existing self-composition guide: direct and generated
subjects share feature factories, P0/P1 and W0/W1 agree, construction/static
witnesses and cold bootstrap pass, and generated-only publication has no hidden
stage0 fallback. Dynamic plugins, hot replacement, isolation and recovery remain
future Host-oriented extensions, outside this MVP scope.

## Consequences

- Agents receive one additive contract and the same independent expectations
  across object/raw entrypoints, with explicit parallel ownership and exit gates.
- The accepted M1 history stays intact. A caller switching to the M2 archive
  must handle the two additive diagnostic cases.
- Retained data is a compressed generated artifact of about 3.3 MB. Its large
  expanded recipes are excluded from the handwritten PR line budget, but their
  integrity and complete membership remain checked.
- Acceptance and real M2 execution remain different facts. Runtime conformance,
  release custody and M3 construction still require their existing evidence.

## Rejected alternatives

- Separate raw and repeated-record generations would duplicate the successor
  schema, catalog, snapshots and migration work.
- Rewriting historical accepted artifacts or captured outcomes would break
  their identities and conceal which subject actually ran.
- Implementing production semantics from proposed fixtures alone would leave
  the owner scope and accepted public contract inconsistent.
