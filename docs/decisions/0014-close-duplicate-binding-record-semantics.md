---
id: ADR-0014
type: adr
status: proposed
owner: architecture
summary: Defines deterministic fail-closed diagnostics and graph semantics for repeated binding records.
related:
  - ADR-0004
  - ADR-0005
  - ADR-0006
  - ADR-0007
  - ADR-0018
  - GM-REQ-V1
  - OD-006
---

<!-- cspell:words coprime Durstenfeld unshuffled xorshift -->

# ADR-0014: Close duplicate binding-record semantics

## Context

ADR-0006 requires exactly one binding record for every selected
`(consumerImplementationId, slotId)` coordinate. It also defines
`binding.duplicate` as a repeated provider ID inside one binding record.
ADR-0007 fixes that code's diagnostic coordinate to exactly
`(implementationId, slotId, providerImplementationId)`. Reusing it for two
records would require an invented provider ID or a second coordinate shape.

The Phase 0 roadmap therefore excludes repeated binding records from compiler
semantics until OD-006 is resolved by an accepted successor with executable
evidence. Prior disposable exploration did not leave a governed,
content-addressed case inventory and is not a durable claim about coverage.
This proposal instead defines the closed manifest and recipe contract that
future successor evidence must satisfy.

Generation 2 must carry forward ADR-0018's residual-depth, exact raw-number
and emittable-type rules in its successor contract, cases, checker and ledger.
This preserves the accepted supplement without expanding duplicate-record scope.

## Decision

This section is proposed and becomes normative only if this ADR is accepted
with the acceptance evidence below.

### Narrow successor precedence

If accepted, this ADR narrowly supersedes ADR-0005 and ADR-0007 only for the
previously excluded future case in which a schema-admitted profile contains
repeated binding records at one `(consumerImplementationId, slotId)`
coordinate. Its precedence is limited to adding the
`binding.duplicate-record` union member, inserting that member at one exact
code-rank position, and adding the fact/prerequisite refinement needed to
classify and suppress derivatives of that repeated-record group.

It does not supersede any accepted behavior for inputs without a repeated
binding-record coordinate. It does not rename, broaden, reorder, reactivate,
or change the detail, coordinate, path, phase, disposition, prerequisite, or
suppression semantics of any accepted diagnostic code. ADR-0006's requirement
for exactly one record remains unchanged; this decision only defines the
failure semantics when that requirement is violated. Every accepted contract,
qualification, and ledger artifact remains byte-identical. File presence,
chronology, or proposed status grants no precedence.

Acceptance requires a governed transaction containing all of these exact
future artifact categories:

1. a versioned successor diagnostic contract containing the additive code
   union, discriminant, `emittable` disposition, path policy, rank, fact model,
   prerequisite row, and suppression refinements;
2. versioned successor diagnostic snapshots containing the new complete record
   and both new rank adjacencies;
3. a successor static qualification case manifest and closed bounded-generator
   recipe manifest satisfying the contract below;
4. a successor mutation manifest and closed checker that reject every named
   semantic, ordering, prerequisite, resource, and evidence mutation;
5. checker results for the exact proposed artifacts, without substituting
   subject-derived expectations;
6. a new immutable successor qualification ledger binding the exact bytes of
   items 1 through 5; and
7. registration of the accepted ADR in
   `architecture/decisions/accepted-decisions.json`, with the new successor
   contract and qualification ledgers anchored by a separate umbrella decision
   that freezes diagnostic generation 2 for ADR-0013 and this decision together; the accepted-authority ledger
   `architecture/authority/accepted-authorities.json` and every existing ledger
   remain byte-identical.

None of those successor artifacts or ledger entries exists merely because this
proposal names them. Until they exist, are reviewed, and are accepted together,
ADR-0005, ADR-0007, ADR-0018, and their existing artifact bytes remain the
accepted authority; the new duplicate-record behavior remains proposed.

ADR-0013 adds `input.invalid-byte-carrier` under the same constraints. Because
ADR-0007 requires the immutable base schema enum, diagnostic catalog, and code
rank to remain byte-identical, both codes enter one diagnostic generation 2
together: a successor `composition.schema.json` enum, a successor catalog with
the complete rank of 33 codes, the successor contract, snapshots, and checker.
In that rank `input.invalid-byte-carrier` is first and
`binding.duplicate-record` immediately precedes `binding.duplicate`.

### Repeated coordinate and diagnostic

A repeated binding-record group exists when a schema-admitted profile contains
more than one binding record with the same
`(consumerImplementationId, slotId)`. The binding-coordinate census is
independent of declaration lookup and of selection: every schema-admitted
record is counted, so two records for a declared but unselected consumer are
still a repeated group and fail closed. This is a deliberate asymmetry with the
accepted rule that a single record for an unselected consumer is graph-inert.
Uniqueness is a structural property of the profile, like
`profile.duplicate-root`, not a row-local lookup. If the profile or either
coordinate field is not structurally admitted, the semantic uniqueness fact is
unavailable and no duplicate-record diagnostic is emitted.

Emit exactly one normalized diagnostic for each repeated coordinate:

```json
{
  "code": "binding.duplicate-record",
  "phase": "binding",
  "path": [],
  "coordinate": {
    "implementationId": "example/consumer/default",
    "slotId": "dependency"
  },
  "details": {"reason": "duplicate"}
}
```

The diagnostic name and code are `binding.duplicate-record`. The diagnostic
uses `implementationId`, the accepted field name for the consumer identity.
Its required and allowed coordinate fields are exactly `implementationId` and
`slotId`; its path is exactly empty; and its details contain exactly
`reason: "duplicate"`. Binding-array indexes and occurrence counts are not
diagnostic coordinates or details.

Insert `binding.duplicate-record` immediately before `binding.duplicate` in the
normative code rank. Every existing code retains its relative rank. The
remaining comparator axes stay unchanged: phase; code; coordinate fields in
accepted order with absent before present; path; then RFC 8785 detail bytes.

Two through 65,536 occurrences at one coordinate produce one candidate after
normalization. Candidate generation and ordering MUST NOT depend on binding or
provider enumeration.

### Fail-closed group semantics

A repeated group is invalid as a unit. No first or last record wins. Provider
lists MUST NOT be merged, concatenated, intersected, deduplicated across
records, sorted, or used as fallback. No record in the group contributes a plan
binding or valid graph edge.

This rule is identical for `required`, `optional`, and bounded ordered `many`,
including when every individual record satisfies its slot cardinality.
Cardinality is still evaluated independently for each row from its raw provider
array length:

- `required` accepts exactly one provider per row;
- `optional` accepts zero or one provider per row;
- `many` applies its inclusive `min` and `max` to each row and preserves row
  order only as evidence for that row.

Rows are never combined for cardinality. A duplicate provider inside one row
continues to emit accepted `binding.duplicate` with its three-field coordinate.
Distinct invalid row counts may emit distinct `binding.cardinality` details;
identical normalized candidates are emitted once.

### Prerequisites and cascades

The successor diagnostic contract must extend ADR-0007's closed fact vocabulary
with exactly these two facts:

| Fact ID | Scope | Exact state meaning |
| --- | --- | --- |
| `binding.record-coordinate-census-complete` | `profile` | `valid` after every schema-admitted binding occurrence has been counted by normalized `(consumerImplementationId, slotId)`; `unavailable` when the profile document or either coordinate field is not admitted. A repeated coordinate does not make the census incomplete. |
| `binding.record-uniqueness` | `binding` | For one normalized coordinate, `valid` for exactly one occurrence, `invalid` for more than one occurrence, and `unavailable` when the coordinate census is unavailable or there is no occurrence at that coordinate. |

The exact additive diagnostic prerequisite-catalog row is:

```json
{
  "code": "binding.duplicate-record",
  "prerequisiteGroup": "binding.record-census",
  "prerequisites": [
    "document.schema-valid",
    "binding.record-coordinate-census-complete"
  ],
  "suppressionScope": "binding"
}
```

The prerequisite order is normative and contains two entries, below the
accepted maximum of four. The group name `binding.record-census` is
deliberately distinct from the fact ID `binding.record-uniqueness`, so group
and fact namespaces do not overlap. The `binding.record-uniqueness` fact is not a
prerequisite to its own diagnostic: consistent with ADR-0007, its `invalid`
state creates the closed failure candidate, while the ordered prerequisites
establish that the census from which that positive duplicate claim is made is
available. An `invalid` or `unavailable` listed prerequisite suppresses only
that candidate. The fact group is closed data, not an executable predicate,
extension point, or configurable rule.

The occurrence rules for the new scoped fact are:

- zero occurrences at a declared slot of a selected consumer is handled by
  accepted `binding.missing`, including `optional` slots and `many` slots with
  `min: 0`, because ADR-0006 encodes legal absence as an empty provider list
  and never as an omitted record;
- one occurrence makes record uniqueness valid;
- more than one occurrence makes it invalid and emits
  `binding.duplicate-record`;
- a profile or coordinate that is not admitted makes it unavailable and emits no
  semantic duplicate-record candidate.

Invalid record uniqueness suppresses only derivatives that require one
resolved binding record: plan-binding construction, valid edges from that
coordinate, and graph conclusions that require those edges. It does not
suppress independent positive facts.

Accordingly:

- a positively known unknown consumer or unknown slot emits its one normalized
  accepted diagnostic in addition to `binding.duplicate-record`;
- row-local duplicate-provider, unknown-provider, provider-not-selected,
  capability-missing, compatibility-mismatch, and cardinality diagnostics
  remain eligible when their accepted prerequisites are valid;
- identical row-local candidates from repeated rows are emitted once;
- valid records at other coordinates continue to contribute valid edges and
  independently provable graph facts;
- a strongly connected component proved entirely from other valid edges
  remains eligible, while a component needing an edge from the invalid group
  is not proved;
- when traversal reaches a consumer with a repeated-coordinate group, its
  outgoing frontier is incomplete and unproved
  `profile.unreachable-selection` diagnostics are suppressed; an unreachable
  consumer whose invalid frontier is never traversed remains reportable when
  the accepted complete-frontier prerequisites otherwise prove it.

No graph edge is repaired or inferred from the invalid group.

No other successor fact is added. Existing
`binding.consumer-census-complete`, `binding.slot-census-complete`, and
`binding.provider-census-complete` continue to govern row-local lookups.
Derivation of existing `binding.reached-frontier-complete` is refined only so a
reached consumer with invalid `binding.record-uniqueness` has an incomplete
frontier. Existing `graph.positive-edge-subgraph-complete` continues to describe
the positively proved subgraph and therefore permits an independent SCC that
uses no edge from the repeated group. Existing diagnostic prerequisite rows do
not change.

### Bounded collection and resource accounting

Normalized diagnostic candidates enter the accepted bounded top-K collector.
Repeated occurrences at one coordinate do not increase diagnostic cardinality.
Suppressed derivatives do not affect `diagnostics.truncated.details.omitted`.

At 256 distinct repeated coordinates, all 256 ordinary diagnostics are
returned. At 257, the first 255 under the normative comparator are followed by
`diagnostics.truncated` with `{"omitted": 2}`. Reverse and stride discovery
orders MUST retain the same records. The collector MUST continue considering
candidates after `K + 1` so later, earlier-sorting candidates can replace a
retained candidate.

Resource admission remains occurrence-based and precedes repeated-record
rejection:

- `bindings` counts every supplied binding-record occurrence;
- `graphEdges` counts every provider-reference occurrence in every record for a
  selected consumer before provider validation or repeated-record rejection;
- `providersPerManySlot` applies independently to each input record before
  duplicate-provider and duplicate-record rejection;
- raw bytes, JSON value occurrences, strings, containers, and per-row
  cardinality count every occurrence under the accepted definitions.

This decision changes no numeric resource limit.

### Evidence required before acceptance

Acceptance requires the additive versioned artifacts and authorities named in
the precedence section. Accepted artifacts MUST remain byte-identical.

The successor case manifest must use one stable unique `caseId`, one accepted
compiler entry point, and either one exact complete inline input or one closed
bounded `generatorId` plus parameters. Each materialized row must contain the
exact complete expected result, including every diagnostic in order and the
absence of plan and digest; code-only, partial, pattern, alternate, and
subject-derived expectations are forbidden. Each bounded generator records one
SHA-256 digest over its materialized case stream plus the row count, in the
same way the accepted decoder and canonicalization case tuples are pinned;
per-row digests are not required. The recipe manifest must close each
generator's parameter domain, enumeration order, identity-token table, resource
source, and outcome oracle. The checker must
reject missing, duplicate, extra, or reordered generated case IDs.

The closed proposed case and generator inventory is:

| Category | Stable ID or bounded generator ID | Exact domain and required outcome |
| --- | --- | --- |
| Cardinality and occurrence count | `od006.cardinality.v1` | Cartesian product of `required`, `optional`, and `many(min=1,max=2)`; two and three records; and `valid-identical`, `valid-conflicting`, and `one-row-cardinality-invalid`. The identity-token table fixes one consumer, one slot, and three selected compatible providers. Every expansion returns exactly one `binding.duplicate-record`, plus only the exact row-local cardinality candidate implied by the selected row recipe, and no plan or digest. |
| Row-local failures | `od006.row-failures.v1` | One repeated group with the fault in each record position for `binding.duplicate`, `binding.unknown-provider`, `binding.provider-not-selected`, `binding.cardinality` under and over bounds, `binding.capability-missing`, and `binding.compatibility-mismatch`. The complete expected result contains the duplicate-record candidate plus the accepted normalized row-local candidates; equal candidates deduplicate only after occurrence accounting. |
| Independent lookup and graph suppression | stable cases `od006.overlap.unknown-consumer.v1`, `od006.overlap.unknown-slot.v1`, `od006.overlap.unselected-consumer.v1`, `od006.graph.reached-incomplete-independent-scc.v1`, and `od006.graph.unreached-invalid-frontier.v1` | Each case has an exact inline declaration/profile world. Expected results respectively retain the independently provable accepted lookup failure, retain the unknown-slot failure, return exactly one `binding.duplicate-record` and no plan for two records of a declared but unselected consumer, retain an SCC proved without the invalid group while suppressing unproved reachability, and retain reachability conclusions whose proof never traverses the invalid frontier. No invalid-group edge appears. |
| Record/provider permutations | `od006.permutations.exhaustive.v1` | For every cardinality and row-failure source case, enumerate every unique outer record permutation and every unique within-row provider permutation. Derived case IDs append zero-based fixed-width permutation ranks. Each exact complete result equals its source case; no sampling or seed is used. |
| Diagnostic ordering | `od006.ordering.axes.v1` and `od006.ordering.seeded-shuffle.v1` | The axes generator materializes exact inline worlds for phase dominance, the two new code-rank adjacencies, and cross-coordinate ASCII ordering while accepted snapshots continue to own unchanged path/detail axes. The shuffle generator applies unsigned 32-bit xorshift `(13,17,5)` Fisher-Yates with seed `0x4f440006` to the closed axes inputs; its expected ordered results are identical to the unshuffled cases. |
| Bounded collector | `od006.collector.v1` | Distinct repeated coordinates at `N=256`, `257`, and `258`, presented in ascending, reverse, and coprime-stride order. Exact outcomes are all 256 ordinary records for 256; first 255 plus `diagnostics.truncated {"omitted":2}` for 257; and first 255 plus `{"omitted":3}` for 258. All presentations retain the same comparator-selected records for their `N`. |
| Resource accounting | `od006.resources.v1` | For each of `bindings`, `graphEdges`, and `providersPerManySlot`, materialize the exact accepted profile-v2 limit and limit-plus-one input with repeated records. Expected complete outcomes use the accepted limit diagnostic and suppression rules, count all occurrences before normalization, and identify the exact profile-v2 row from which the numeric boundary was read. |
| Mutations | `od006.mutations.v1` | Stable mutation IDs cover overloaded `binding.duplicate`, changed new-code rank, changed prerequisite order/group/scope, missing or remapped successor facts, per-occurrence output, array-index path, winner selection, row merge/concatenation/intersection/sort/fallback, invalid-edge leakage, independent-fact suppression, collector stop at `K + 1`, and resource deduplication before counting. Every row binds its unique `mutationId`, target kind, source artifact or case ID and SHA-256, exact JSON-pointer or byte transformation or complete mutant bytes and SHA-256, checker entry point, and exact rejection outcome. |

The seeded shuffle recipe is closed by this pseudocode; the recipe manifest
carries the same definition and its materialized stream digest:

```text
state = 0x4f440006 >>> 0
next():
  state ^= (state << 13) >>> 0
  state ^= state >>> 17
  state ^= (state << 5) >>> 0
  return state >>> 0
shuffle(list):                 # Durstenfeld, descending
  for i = length(list) - 1 down to 1:
    j = next() % (i + 1)
    swap list[i], list[j]
```

One generator stream is used per case and is reseeded with the constant before
each case. The lists are shuffled in this fixed order: `declarations`, then
`roots`, then `selections`, then `bindings`. `providerImplementationIds` inside
a record are never shuffled because their order is semantic for `many`. The
modulo reduction is deliberate: the recipe needs determinism, not uniformity.

The identity-token table and the exact inline worlds belong in the future case
and recipe manifests, not as disposable generator code copied into this ADR.
The pinned seed is relevant only to the named shuffle generator; exhaustive and
formulaic generators have no seed. The successor qualification ledger must bind
the exact manifests, recipes, checker, mutation definitions, materialized case
stream, and checker results. Mutation results bind every executed mutant
SHA-256. The checker and successor ledger reject missing, duplicate,
substituted, or unexecuted mutation rows and mutant hashes. This proposal makes
no claim that those cases have been generated, executed, independently
reviewed, or accepted.

Before repeated-record semantics enter a production compiler, the same exact
cases and mutations MUST execute against the compiler subject through its
ordinary entry points. Expected results MUST come from the independent
qualification evidence, not from the subject.

### Scope

This decision defines only composition diagnostics and graph-validation facts.
It adds no compiler implementation, public API, loader, factory, dependency
container, runtime lifecycle, authorization, plugin behavior, or Product Host
semantics.

## Consequences

- Repeated binding records fail with a machine-distinct, permutation-invariant
  diagnostic without changing `binding.duplicate`.
- Invalid groups cannot affect plans or graph edges, while independently
  provable failures remain visible under the existing bounded collector.
- Valid profiles and invalid profiles without repeated binding coordinates
  retain their existing semantics and existing-code relative ordering.
- Exhaustive diagnostic consumers and successor qualification artifacts must
  learn one new code before the behavior can be implemented.

## Rejected alternatives

- Overload `binding.duplicate`. A second coordinate shape violates the accepted
  discriminant and can change top-K retention between implementations.
- Rename the accepted code to `binding.duplicate-provider`. That is a breaking
  diagnostic-generation reset without consumer evidence.
- Use `profile.duplicate-binding`. Moving the failure to the profile phase
  reorders diagnostics and encourages suppression of independent row-local
  facts.
- Select a record or combine provider lists. Any winner, merge, concatenation,
  intersection, sorting, or fallback rule invents semantics for invalid input
  and can create graph edges that the profile did not unambiguously define.
