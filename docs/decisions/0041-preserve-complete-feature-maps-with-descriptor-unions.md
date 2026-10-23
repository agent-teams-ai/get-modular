---
id: ADR-0041
type: adr
status: accepted
owner: architecture
approved_by: product-owner-delegated-orchestrator
accepted_at: 2026-10-23
related:
  - ADR-0032
  - ADR-0035
  - ADR-0036
  - QUAL-MODULE-FIXTURE-SCENARIOS
summary: Derive complete capability maps from separate descriptor-union bases while retaining early conflict checks.
---

# ADR-0041: Preserve complete feature maps with descriptor unions

## Context

The current feature-map recipe inherits complete predecessor maps and private
child aggregates. It deliberately rejects inconsistent contracts early, including
unused transitive keys, and lets a parent compose its private children without
Host imports of their contracts. The G growth fixture reproduces that recipe;
its historical supported-compiler N500 cold stage reached its unchanged limit.
Narrowing maps to directly used descriptors completed the workload but removed
part of the advertised surface and early unused-conflict guarantee. Recursively
projecting maps through Pick also reached a mapped-instantiation depth failure.

A bounded descriptor-union experiment on supported TypeScript 7.0.2 completed
N1000's unchanged eight compiler/runtime stages in 39.284 seconds, including
11.231 seconds for cold emit. Complete transitive-key parity and unused value
and revision conflict probes passed. Those measurements select this authoring
representation for integration. The [P5 qualification record](../qualification/module-fixture-plan.md#p5--measure-one-real-growth-step-at-a-time)
separates those selection observations from the final current-source receipt;
they are not final-current-source qualification,
a production performance claim or proof that a compiler defect was repaired.
The owner's 2026-10-23 request explicitly authorizes this GM authoring successor
and its required qualification.

## Decision

For concrete descriptor-derived maps, export a complete descriptor union from
the feature's composition contracts, and derive the feature interface from
separate CapabilitiesOf bases for each imported contract union plus the own
contracts. Both lists name the same sources and preserve every contract,
including transitive, unused and private-child contracts. Generated code derives
both from one dependency list; compiled tests verify exact key, value and token
parity and reject an omitted descriptor. A source feature's own interface checks
remain in the checked program.

Separate bases preserve TS2320 for disagreements at the earliest feature or
team aggregate, even without a selected declaration or module. Never combine
imported sources in one CapabilitiesOf union to suppress a conflict. Parents
include their private child's complete contract union; Hosts still compose
complete public parent interfaces. Declared entry brands, factory dependencies,
inputs, groups, exact revisions, ownership and runtime construction are unchanged.

This partially supersedes the representation prescribed by current CMS/guide
feature-map inheritance and the G scenario's direct inherited-map requirement.
It does not supersede ADR-0032, ADR-0035 or ADR-0036, reduce their guarantees or
rewrite accepted decisions and historical measurements. The new current G recipe
retains the same useful computation, graph, source census, fixed edits, independent
oracles and original bounds. A new source identity requires fresh qualification;
old timings and cold source identities remain attached to their original recipe.

TypeScript unions and Assembly's existing CapabilitiesOf own the reusable type
mechanism; the CMS owns this authoring rule. No public API alias, package or
runtime mechanism is added. General hand-written maps with additional properties,
call/construct/index signatures or map-level polymorphic this are not silently
projected or narrowed. They retain their existing complete interface unless a
separate proof establishes equivalence. Descriptor-owned port value types remain
unchanged. This decision does not require a package release or public baseline
write for the documentation/test-only implementation.

## Consequences

- Complete aggregates remain available to independent teams and private parents.
- Imported contract unions and separate bases must stay consistent; this is an
  explicit authoring invariant, not a global proof about arbitrary user code.
- Current CMS/profile pins advance through exact reviewed bytes. Historical pins,
  adoption states, released archive records and accepted ADR bytes remain frozen.
- Required integration evidence includes supported N8 through N1000 compiler and
  runtime stages, fresh source qualification, private-child/team/unused-conflict
  probes, a real consumer check and exact-source repository gates.
- Compiler Memory used is not RSS. Single synthetic samples establish completion
  under the declared budgets, not an SLO or general speedup.

## Rejected alternatives

- Direct-used-descriptor maps: lose unused ancestor keys and early conflicts.
- A combined union of all imported descriptors as the only base: merges collisions.
- Recursive Pick bases: preserve the tested surface but hit a depth failure at scale.
- A new shared type framework or runtime manager: unnecessary for this contract.
- Compiler patch adoption or edits to historical evidence: separate authority and
  evidence, neither required nor established by this authoring change.
