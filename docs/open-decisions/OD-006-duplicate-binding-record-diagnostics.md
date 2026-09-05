---
id: OD-006
type: open-decision
status: open
owner: architecture
summary: Defines the diagnostic and fail-closed semantics needed for repeated binding records.
related:
  - ADR-0004
  - ADR-0005
  - ADR-0006
  - ADR-0007
  - ADR-0018
  - ADR-0014
  - GM-REQ-V1
---

# OD-006: Duplicate binding-record diagnostics

## Decision required

Close the behavior for more than one binding record at the same
`(consumerImplementationId, slotId)` coordinate. The decision must define one
exact diagnostic, ordering and bounded-collection behavior, suppression rules,
cardinality interaction, graph-edge eligibility, and executable acceptance
evidence.

ADR-0006 requires exactly one record per coordinate. The accepted
`binding.duplicate` code cannot report a repeated record: ADR-0007 fixes that
code to the three-field duplicate-provider coordinate
`(implementationId, slotId, providerImplementationId)`.

## Constraints

- Repeated records MUST fail closed. No first or last record wins, and records
  MUST NOT be merged, concatenated, intersected, repaired, or used as fallback.
- The invalid group MUST contribute no plan binding and no graph edge.
- Equivalent binding-record and provider-list permutations MUST produce the
  same ordered diagnostics.
- Diagnostic candidates MUST remain normalized, bounded by the accepted cap,
  ordered by the accepted total comparator, and independent of discovery
  order.
- `required`, `optional`, and `many` MUST receive the same repeated-record
  failure. Any independently provable row-local failure MUST retain its
  accepted meaning.
- Independently valid coordinates MUST continue to provide facts that do not
  depend on the invalid group.
- The decision MUST NOT add compiler implementation, public API, runtime
  lifecycle, plugin, or Product Host semantics.

## Options

1. Add `binding.duplicate-record` in the binding phase with exactly the
   two-field diagnostic coordinate `(implementationId, slotId)`. Retain
   `binding.duplicate` for a repeated provider within one record. This is the
   preferred option.
2. Start a breaking diagnostic generation that renames the current code to
   `binding.duplicate-provider` and also adds `binding.duplicate-record`. This
   requires migration of every exhaustive diagnostic consumer.
3. Add `profile.duplicate-binding` in the profile phase and suppress every
   row-local derivative. This changes phase ordering and discards independently
   provable binding failures.

Overloading `binding.duplicate` with a second coordinate shape is excluded.
ADR-0007 requires one exact coordinate shape for each emitted code.

## Acceptance criteria

- The chosen code has one exact phase, coordinate, path, detail shape, code
  rank, prerequisite group, ordered prerequisite list of at most four facts,
  and suppression scope. The proposal must identify every new closed fact and
  its scope, and must explain how the new facts refine rather than replace the
  accepted ADR-0007 fact model.
- One normalized diagnostic is emitted per repeated coordinate, regardless of
  occurrence count, without using binding-array indexes.
- The decision fixes overlap with duplicate providers, provider failures,
  per-record cardinality, reachability, cycles, the 256-record cap, top-K
  truncation, and occurrence-based resource accounting.
- A proposed successor case manifest and closed recipe manifest assign stable
  case IDs or bounded generator IDs to all three cardinalities, two and three
  repeated records, identical and conflicting rows, row-local failures,
  independent valid coordinates, graph suppression, ordering, collector,
  resource, mutation, and record/provider permutation categories. Every case
  materializes an exact complete input and exact complete outcome; every
  sampled ordering recipe pins its algorithm and seed.
- Mutation cases require rejection of an overloaded diagnostic, a changed code
  rank, occurrence-specific output, winner/merge/concatenation behavior,
  leaked graph edges, over-suppression, early collector termination, and
  deduplication before resource accounting. Every mutation row binds a stable
  ID, exact source identity, deterministic transformation or complete mutant,
  mutant SHA-256, checker entry point, and exact rejection outcome; the checker
  rejects missing, duplicate, substituted, or unexecuted mutations.
- Before acceptance, a versioned successor diagnostic contract, diagnostic
  snapshots, case manifest, recipe manifest, mutation manifest, closed checker,
  and their results are bound by a new immutable qualification ledger, and the
  accepted ADR is registered in `architecture/decisions/accepted-decisions.json`
  through the governed acceptance transaction. New successor contract and
  qualification ledgers bind the new artifacts; existing ledgers, including
  `architecture/authority/accepted-authorities.json`, remain byte-identical.
  These are required future artifact categories, not artifacts or
  evidence created by this open decision. No accepted artifact is edited in
  place.

The combined generation 2 transaction must carry forward ADR-0018's
residual-depth, exact raw-number and emittable-type rules in its successor
contract, cases, checker and ledger. OD-006 remains open; this carry-forward
requirement adds no duplicate-record behavior.

## Resolution

Open. ADR-0014 is a proposed resolution and MUST NOT authorize compiler
behavior unless it is accepted with the required executable evidence.
