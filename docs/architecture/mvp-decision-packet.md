---
id: ARCH-MVP-DECISION-PACKET
type: architecture
status: active
owner: architecture
summary: Non-authoritative choices that must be accepted or explicitly deferred before their Get Modular implementation checkpoint.
related:
  - ADR-0003
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
  - OD-004
  - OD-005
  - OD-006
  - ARCH-MVP-IMPLEMENTATION-ROADMAP
---

# MVP decision packet

This is a decision aid, not architecture authority. A recommendation below
does not modify an accepted ADR, resolve an open decision, authorize production
source or create a public API. Implementation stops at the named checkpoint
until the owning decision is accepted.

Scores are directional: confidence and reliability are higher when better;
complexity is higher when harder. LOC estimates include focused evidence, not
the semantic compiler itself.

## Resolved prerequisite for the first Core checkpoint

### D1: production-source admission while implementation blockers are open

Accepted ADR-0015 admits source under the package identities accepted by
ADR-0003, and accepted ADR-0017 authorizes a pre-M3 direct M1 `not-claimed`
publication after its packed gates. Accepted ADR-0018 preserves that path and
extends publication to generated post-M3 archives only after their closed
packed and self-composition gates. `runtime-conformant`
claims remain blocked while an open decision is active; `source-admitted` and
`structural-conformant` custody may proceed without claiming unresolved runtime
semantics. The first production source still requires the explicit
product-owner start record defined by ADR-0015. This item is no longer a choice
in this packet.

## Decisions required before the first Core public checkpoint

### D2: pre-1.0 public symbol names

| Option | Confidence | Reliability | Complexity | Approximate change | Consequence |
| --- | ---: | ---: | ---: | ---: | --- |
| Accept ADR-0009's one unversioned current surface | 9/10 | 9/10 | 3/10 | 80-180 LOC | Recommended. First-party consumers migrate with pre-1.0 breaking changes; no parallel `V1`/`V2` exports. |
| Publish accepted versioned evidence names | 5/10 | 8/10 | 5/10 | 100-220 LOC | Preserves literal evidence names but creates compatibility baggage before a consumer exists. |
| Keep all compiler entrypoints private | 7/10 | 9/10 | 2/10 | 20-60 LOC | Useful only as a short evidence checkpoint; it delays packed public-consumer proof. |

**Resolved:** ADR-0009 is accepted; the public barrel follows its exhaustive
export map and no generation suffix appears in package source.

### D3: package carrier and resolution

| Option | Confidence | Reliability | Complexity | Approximate change | Consequence |
| --- | ---: | ---: | ---: | ---: | --- |
| Accept ADR-0012's one ESM-only root export and no install scripts | 9/10 | 9/10 | 5/10 | 300-650 LOC | Recommended after real packed Node, TypeScript, browser, worker and Electron evidence. |
| Add CommonJS compatibility from the first archive | 5/10 | 7/10 | 8/10 | 700-1,400 LOC | Broadens consumers but creates dual-resolution and declaration risks without demonstrated demand. |
| Keep a private non-publishable package carrier | 7/10 | 9/10 | 3/10 | 150-350 LOC | Allows qualification evidence but cannot resolve OD-004 or authorize publication. |

**Resolved:** ADR-0012 is accepted and OD-004 is resolved. ADR-0018 requires
the first post-M3 generated archive to pass the packed Node and four
TypeScript/type-scale cases plus the complete M3 proof. The full six-runtime
matrix still gates the first conformance claim and `release-eligible`.

### D4: trusted-object and raw-byte carriers

| Option | Confidence | Reliability | Complexity | Approximate change | Consequence |
| --- | ---: | ---: | ---: | ---: | --- |
| Accept ADR-0013's synchronous owned snapshots for both carriers | 8/10 | 9/10 | 8/10 | 700-1,400 LOC | Recommended after the independent Node acceptance oracle and mutation evidence required by ADR-0013 pass. Production and runtime qualification remain separate gates. |
| Publish raw bytes first and keep object input private | 8/10 | 9/10 | 6/10 | 450-900 LOC | Smaller hostile-input boundary, but temporarily less ergonomic for trusted TypeScript callers. |
| Keep both carriers private behind the normalized-value seam | 9/10 | 10/10 | 3/10 | 100-250 LOC | Safest implementation start; insufficient for the final public boundary. |

**Stop point:** before exposing the raw-byte carrier. Accepted ADR-0017 admits
the trusted-object carrier behind `compileComposition` from M1 under the
plain-value rules of ADR-0006 and ADR-0007; the raw carrier waits for OD-005
and its diagnostic and evidence obligations.

Accepted ADR-0018 additionally fixes synchronous no-alias snapshotting for the
cooperative Host-owned object graph and the outer wrappers and lists of both
entry points; raw payload bytes become untrusted after admission. Resource
ceilings stay scoped to Core's bounded work and retained model. This
narrow rule neither admits arbitrary `Proxy` execution nor accepts the rest of
proposed ADR-0013.

### D5: repeated binding-record diagnostics

| Option | Confidence | Reliability | Complexity | Approximate change | Consequence |
| --- | ---: | ---: | ---: | ---: | --- |
| Accept ADR-0014's dedicated `binding.duplicate-record` diagnostic | 9/10 | 9/10 | 6/10 | 350-750 LOC | Recommended. Preserves the existing duplicate-provider diagnostic and fails closed at the exact coordinate. |
| Start a new diagnostic generation and rename both cases | 3/10 | 7/10 | 9/10 | 900-1,800 LOC | Clean taxonomy at excessive pre-1.0 migration and evidence cost. |
| Exclude repeated records from admitted compiler input | 8/10 | 9/10 | 2/10 | 80-180 LOC | Valid temporary stop, not a complete public semantic contract. |

**Stop point:** before the compiler accepts or reports repeated records. Resolve
OD-006 through an accepted successor with executable vectors.

## Decisions required before self-composition and release

### D6: private low-level adapters

| Option | Confidence | Reliability | Complexity | Approximate change | Consequence |
| --- | ---: | ---: | ---: | ---: | --- |
| Accept ADR-0010's owned semantic Core with qualified private adapters | 9/10 | 9/10 | 6/10 | 800-1,600 LOC | Recommended. Uses platform UTF-8/hash primitives and qualified canonicalization without leaking library types. |
| Implement every primitive internally | 5/10 | 7/10 | 9/10 | 1,800-3,500 LOC | Maximum ownership, but more security and portability code with little product value. |
| Let one framework own graph, errors and lifecycle | 3/10 | 5/10 | 6/10 | 600-1,500 LOC | Less initial code but conflicts with the accepted semantic contract and creates lock-in. |

**Stop point:** an owned private primitive may be used for evidence; selecting
an external production dependency requires ADR-0010 or an accepted successor.

### D7: closed dependency representation for self-composition

ADR-0008 requires closed dependencies but also forbids treating hostile valid
slot identities as ordinary inherited property lookup keys.

| Option | Confidence | Reliability | Complexity | Approximate change | Consequence |
| --- | ---: | ---: | ---: | ---: | --- |
| Null-prototype frozen record with descriptor-only construction | 8/10 | 8/10 | 5/10 | 250-550 LOC | Compact and ergonomic; must prove keys such as `__proto__`, `constructor` and `then` remain inert. |
| Frozen ordered entry tuples with a typed lookup helper | 9/10 | 9/10 | 6/10 | 350-700 LOC | Recommended. Slightly more ceremony, but no property-key ambiguity and deterministic serialization. |
| Read-only `Map` behind a private adapter | 7/10 | 8/10 | 5/10 | 250-550 LOC | Good internal ergonomics, weaker plain-data and cross-process evidence. |

Accepted ADR-0016 selects a fourth form, a typed object literal keyed by
identifier-safe own slot identifiers with `Map` lookups for every identity,
and pairs it with a static generated-wiring witness and canonical wiring
tuples. It resolves this item and supersedes the recommendation above.

**Resolved:** by accepted ADR-0016.

### D8: release custody and reusable conformance evidence

| Option | Confidence | Reliability | Complexity | Approximate change | Consequence |
| --- | ---: | ---: | ---: | ---: | --- |
| Accept a private closed custody protocol derived from ADR-0011 | 8/10 | 9/10 | 8/10 | 1,200-2,500 LOC | Recommended before conformance promotion, evidence reuse or `release-eligible`, after the real packed subject exists. Keeps report/verifier contracts private. |
| Publish runner, report and attestation APIs now | 3/10 | 6/10 | 10/10 | 3,000-6,000 LOC | Premature compatibility surface without a real external subject. |
| Keep hash-bound evidence without promotion/reuse claims | 9/10 | 9/10 | 3/10 | 250-550 LOC | Correct for implementation and applicable `not-claimed` publication checkpoints; does not authorize conformance promotion, reuse or `release-eligible`. |

**Stop point:** before `release-eligible`, evidence reuse or the first
conformance claim. A pre-M3 direct `not-claimed` publication follows ADR-0012
and ADR-0017; a post-M3 generated one also follows ADR-0018. Neither waits for
the custody decision; until that decision is accepted, retain exact evidence
as `not-claimed`.

## Resolved implementation rules

ADR-0018 fixes the residual-DAG depth rule and its independent overflow,
exact raw mathematical safe-integer validation before `Number` rounding,
`DiagnosticCode` as exactly `Diagnostic['code']` over emittable codes, the
bounded trusted-object snapshot contract, and the post-M3 generated publication
gate. It adds no public catalog type, no cycle depth, no reserved
canonicalization diagnostic, and no new public engine. Raw exposure and
repeated binding-record behavior still wait for the combined OD-005/OD-006
diagnostic generation 2 transaction.

## Explicitly product-owned decisions

The first consumer, not Get Modular, decides executable factory lookup,
missing-factory behavior, partial construction, readiness, generations,
fencing, cutover, rollback and recovery. Get Modular may compile inert data and
return a plan; it cannot turn metadata into execution authority.

The product-adoption step proceeds only after the consumer records the rules
applicable to its admitted slice and binds one exact retained Core subject.
A static slice defines factory lookup, failure and partial-construction behavior;
readiness, generations, fencing, cutover, rollback and recovery rules apply only
when the slice actually includes those capabilities. They do not require adding
a dynamic runtime to static composition. A second consumer is required only
for a cross-consumer or stable abstraction claim, not for the first useful
integration.

## Recommended approval order

1. Record the ADR-0015 product-owner start decision before the first
   production source. ADR-0017 permits the direct M1 `not-claimed` publication
   inside its authorized scope; ADR-0018 requires the closed M3 gates before a
   generated post-M3 publication.
2. D4 and D5 atomically, because their new diagnostics require one generation
   2 schema, catalog, snapshot, checker and qualification-ledger transaction.
3. D2 and D3 are resolved; the packed public boundary follows ADR-0009 and
   ADR-0012.
4. D6 before selecting any production dependency.
5. D7 is resolved by ADR-0016.
6. D8 only when a real retained archive exists and a conformance claim or a
   `release-eligible` publication is the next checkpoint.

This order permits implementation through the smallest private semantic slice
without guessing public, runtime or release behavior.
