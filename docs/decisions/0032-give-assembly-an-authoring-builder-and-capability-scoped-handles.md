---
id: ADR-0032
type: adr
status: accepted
owner: architecture
approved_by: product-owner
accepted_at: 2026-10-02
summary: Gives Assembly 0.3.0 an authoring builder that emits the current wire generation and makes each handle depend only on the capabilities its declaration uses.
related:
  - ADR-0009
  - ADR-0023
  - ADR-0026
  - ADR-0027
  - ADR-0030
  - ADR-0031
---

# ADR-0032: Give Assembly an authoring builder and capability-scoped handles

## Context

Module authors write the wire format by hand. Every declaration spells `kind`,
`schemaVersion` and a `compatibility` record in each provided capability and
slot, and every Host writes its capability map by hand. Agent Runtime has 16
such records and 8 map rows for 7 modules, with one token for eight contracts.
The next wire generation would rewrite every declaration and every map in
every repository.

A handle is invariant over the whole capability map of the Assembly instance
that bound it. A team cannot bind its modules with its own contracts and hand
the handles to a Host whose map is larger, so features import the Host's map
and composition cannot be split between teams or repositories. Modules that
export a factory for their own tests copy the expanded factory type.

## Decision

- Assembly owns the authoring builder. Core keeps its exhaustive export set and
  stays an inert compiler. Assembly already reads the current wire generation
  and owns the capability map types. Neither package gains a runtime
  dependency.
- `defineContract<Value>()({ id, revision })` creates one descriptor per
  capability, owned by the contract owner. `provide()` and
  `slot(slotId, cardinality)` produce declaration entries. In the current wire
  generation a revision is encoded as the exact token `<id>/r<revision>`, so
  any revision mismatch fails in Core as an incompatible binding.
- `declareModule(spec)` supplies `kind` and `schemaVersion`. It refuses a spec
  that carries either field, and its type accepts only entries produced by a
  descriptor. The next wire generation changes the bodies of these functions,
  not the declarations that call them.
- `CapabilitiesOf<typeof A | typeof B>` derives a capability map from
  descriptors. It serves a module, a team fragment or a Host.
- A handle is invariant only in the capabilities its declaration uses.
  `prepare` accepts a handle bound under any map when each capability it uses
  has the identical value and compatibility type in the preparing map, and it
  requires every capability used by any factory or input handle to be part of
  that map.
- `ModuleFactory<C, D, Instance, Context>` names the factory type of a module
  package, where `C` is the module's own contract map.

### Precedence

This decision supersedes ADR-0009 only in its sentence that declaration and
profile authors, or product-owned generation tooling, supply the current
`schemaVersion` literal, and only for module declarations: `declareModule`
supplies it for module authors. Profile authors keep supplying it. Core's
four authoring helpers keep their pass-through semantics and Core's export set
is unchanged. Compatibility tokens stay product-owned identities: the contract
owner chooses the id and the revision, and the builder only spells them.

For Assembly 0.3.0 this decision also takes precedence over the Assembly
contract in `docs/architecture/common-assembly.md` wherever the two differ,
including the sentence that makes `C` invariant across handles. The revision
of that document for this release replaces those passages.

## Consequences

- Declarations and maps do not change when the wire generation changes; the
  next generation ships a new builder body and a Core decoder for the previous
  schema.
- Teams and repositories bind fragments independently; the Host prepares them
  with a map derived from the contracts they use.
- Two ways to write a declaration exist: Core's `defineModule` for wire-level
  tooling and tests, and `declareModule` for module packages. The Consumer
  Module Standard requires the second.
- A capability map over hundreds of contracts is named as an interface; a type
  alias over them multiplies type-check time.
- Compatibility windows between revisions arrive with the next wire
  generation; until then a revision mismatch is always rejected.
- The revision a consumer was built against is fixed by the version of the
  contract package it depends on. The decision for the next wire generation
  records how Core checks it.
- The change ships with ADR-0031 in the 0.3.0 minor release and its migration
  note. Declarations written with Core's helpers remain accepted.

## Rejected alternatives

- The builder in Core: every helper change would need a successor to the
  exhaustive export set of ADR-0009 and new packed declaration evidence, and
  Core would stop being version-only in this release.
- A separate authoring package: one more member of the exact version pair and
  one more admission for a few functions.
- Fragments generic over the Host map: TypeScript defers the declaration check
  and the dependency record collapses (reproduced).
- Relying on structural checks for unknown capabilities: a handle that uses one
  known and one unknown capability passes them (reproduced).
- A `compatibleFrom` field before Core can enforce it: a field without effect
  misleads contract owners.
