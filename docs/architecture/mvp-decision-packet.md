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

## Decisions required before the first Core checkpoint

### D1: production-source admission while implementation blockers are open

Accepted ADR-0003 currently blocks production package creation until its
implementation blockers are resolved. The roadmap cannot silently reinterpret
that rule.

| Option | Confidence | Reliability | Complexity | Approximate change | Consequence |
| --- | ---: | ---: | ---: | ---: | --- |
| Keep the current fail-closed rule | 8/10 | 10/10 | 3/10 | 20-60 LOC | No production source until every blocker closes; strongest authority continuity, slowest first slice. |
| Accept ADR-0015 or a narrow successor allowing private, non-publishable, manifest-bound source | 9/10 | 9/10 | 5/10 | 120-250 LOC | Recommended. Enables implementation evidence while publication, public exports and conformance claims remain blocked. |
| Build a duplicate qualification-only implementation | 4/10 | 7/10 | 8/10 | 500-1,200 LOC | Avoids production source but creates throwaway authority and drift risk. |

**Stop point:** before creating `packages/core` or any equivalent production
source. The selected rule requires an accepted successor decision.

### D2: pre-1.0 public symbol names

| Option | Confidence | Reliability | Complexity | Approximate change | Consequence |
| --- | ---: | ---: | ---: | ---: | --- |
| Accept ADR-0009's one unversioned current surface | 9/10 | 9/10 | 3/10 | 80-180 LOC | Recommended. First-party consumers migrate with pre-1.0 breaking changes; no parallel `V1`/`V2` exports. |
| Publish accepted versioned evidence names | 5/10 | 8/10 | 5/10 | 100-220 LOC | Preserves literal evidence names but creates compatibility baggage before a consumer exists. |
| Keep all compiler entrypoints private | 7/10 | 9/10 | 2/10 | 20-60 LOC | Useful only as a short evidence checkpoint; it delays packed public-consumer proof. |

**Stop point:** before freezing the public barrel, declarations or export map.
ADR-0009 remains proposed until explicitly accepted.

### D3: package carrier and resolution

| Option | Confidence | Reliability | Complexity | Approximate change | Consequence |
| --- | ---: | ---: | ---: | ---: | --- |
| Accept ADR-0012's one ESM-only root export and no install scripts | 9/10 | 9/10 | 5/10 | 300-650 LOC | Recommended after real packed Node, TypeScript, browser, worker and Electron evidence. |
| Add CommonJS compatibility from the first archive | 5/10 | 7/10 | 8/10 | 700-1,400 LOC | Broadens consumers but creates dual-resolution and declaration risks without demonstrated demand. |
| Keep a private non-publishable package carrier | 7/10 | 9/10 | 3/10 | 150-350 LOC | Allows qualification evidence but cannot resolve OD-004 or authorize publication. |

**Stop point:** before package-type, export-condition, archive-content or
install-script freeze. Resolve OD-004 through an accepted ADR.

### D4: trusted-object and raw-byte carriers

| Option | Confidence | Reliability | Complexity | Approximate change | Consequence |
| --- | ---: | ---: | ---: | ---: | --- |
| Accept ADR-0013's synchronous owned snapshots for both carriers | 8/10 | 9/10 | 8/10 | 700-1,400 LOC | Recommended only after multi-runtime carrier and mutation evidence passes. |
| Publish raw bytes first and keep object input private | 8/10 | 9/10 | 6/10 | 450-900 LOC | Smaller hostile-input boundary, but temporarily less ergonomic for trusted TypeScript callers. |
| Keep both carriers private behind the normalized-value seam | 9/10 | 10/10 | 3/10 | 100-250 LOC | Safest implementation start; insufficient for the final public boundary. |

**Stop point:** before exposing either JavaScript carrier. Resolve OD-005 and
its diagnostic/evidence obligations first.

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

**Stop point:** before stage0 emits or stage1 consumes a dependency record. An
accepted narrow successor must select one representation and its hostile-key
vectors.

### D8: release custody and reusable conformance evidence

| Option | Confidence | Reliability | Complexity | Approximate change | Consequence |
| --- | ---: | ---: | ---: | ---: | --- |
| Accept a private closed custody protocol derived from ADR-0011 | 8/10 | 9/10 | 8/10 | 1,200-2,500 LOC | Recommended before publication, after the real packed subject exists. Keeps report/verifier contracts private. |
| Publish runner, report and attestation APIs now | 3/10 | 6/10 | 10/10 | 3,000-6,000 LOC | Premature compatibility surface without a real external subject. |
| Keep hash-bound evidence without promotion/reuse claims | 9/10 | 9/10 | 3/10 | 250-550 LOC | Correct for implementation checkpoints; cannot authorize publication. |

**Stop point:** before `release-eligible`, evidence reuse or publication. Until
the custody decision is accepted, retain exact evidence as `not-claimed`.

## Explicitly product-owned decisions

The first consumer, not Get Modular, decides executable factory lookup,
missing-factory behavior, partial construction, readiness, generations,
fencing, cutover, rollback and recovery. Get Modular may compile inert data and
return a plan; it cannot turn metadata into execution authority.

The product-adoption step proceeds only after the consumer records those rules
and binds one exact retained Core subject. A second consumer is required only
for a cross-consumer or stable abstraction claim, not for the first useful
integration.

## Recommended approval order

1. D1, so a private substantive implementation can exist without weakening
   publication gates.
2. D5, because compiler diagnostics cannot be complete without it.
3. D2-D4 before freezing or exposing the packed public boundary.
4. D6 before selecting any production dependency.
5. D7 before generated stage1 construction.
6. D8 only when a real retained archive exists and publication is the next
   checkpoint.

This order permits implementation through the smallest private semantic slice
without guessing public, runtime or release behavior.
