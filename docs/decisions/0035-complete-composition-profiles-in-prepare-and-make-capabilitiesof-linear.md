---
id: ADR-0035
type: adr
status: proposed
owner: architecture
summary: Prepare completes a composition profile from bound handles, and CapabilitiesOf uses key remapping so its type cost is linear.
---

# ADR-0035: Complete composition profiles in prepare and make CapabilitiesOf linear

## Context

Two costs show up when a composition root grows to hundreds of modules.

A production root repeats its wiring twice: once as `bindFactory` lines and once as a hand-written binding profile
that names the same handles. The profile is the bulk of the file, and the independent oracle already states the wiring
that matters. Adding a module means editing both lists.

Separately, `CapabilitiesOf` distributes its conditional type over the whole union of contracts for every key, so
reading all keys costs O(N^2). Measured on the type-scale fixture (500 handles bound by 20 team maps, prepared under one
Host interface map), tsc 7.0.2 `--singleThreaded`: 1,383,390 instantiations at 500 handles and 4,393,176 at 1,000.

## Decision

### Complete composition profiles in prepare

`prepare` also accepts `{ profileId, bindings?, factories, roots, inputs? }` instead of a compiled composition. Assembly
completes the profile from the bound handles: selections are all factory and input handles, roots are the `moduleId`s
of the root handles, and an explicit row is kept as written. A `required` slot without a row receives the single other
handle that provides its capability; that is its only legal completion. Any other slot without a row (`optional`,
`many`, or `required` with zero or several candidates) fails preparation with `assembly.prepare.unresolved-binding`,
which lists every such slot with its candidates, before any factory runs. Assembly compiles the completed profile
through Core unchanged and returns the compiled composition with the prepared result. Completion runs once in
`prepare`; nothing is resolved at run time, and factories still receive closed dependency records (ADR-0031).

`prepare({ composition })` remains for a Host that compiles a profile itself, such as from bytes or a desired profile,
and for `isolate`. Production composition roots use `profileId`.

### Precedence

This clarifies GM-REQ-004, GM-REQ-005, ADR-0004 and ADR-0006 and does not change them: the compiled profile stays
complete and closed, every binding names exact implementations or explicit absence, capability identity never chooses
among several eligible providers, and absence of an `optional` slot is an explicit `[]` row. The eligible set is the
bound handles, which already cover every selection exactly once. Core semantics, the wire format and the plan digest do
not change.

### Make CapabilitiesOf linear

`CapabilitiesOf` is a mapped type with key remapping, `[X in T as X["id"]]`, so each contract is visited once and the
type cost grows linearly with the number of contracts. Measured on the same fixture: 500 contracts 1,383,390 to
542,552 instantiations on tsc 7.0.2 and 1,560,108 to 715,445 on TypeScript 5.8.3; 1,000 contracts 4,393,176 to
1,051,988 on tsc 7.0.2. For concrete contract unions the result equals the former one, including one id at two
revisions (a union of the capability contracts); type tests in `tests/assembly/builder-types.ts` check this.

Consumer-visible break: indexing `CapabilitiesOf<T>[T["id"]]` with a generic `T` no longer type-checks (TS2536),
because a remapped key cannot be resolved for an unresolved `T`. Read the value from the descriptor instead:
`T extends Contract<string, infer V, number> ? V : never`, as `ContractValue` in `@get-modular/conformance` now does.
Concrete uses are unaffected. The public declaration text of `CapabilitiesOf` changes, so Assembly ships this as a
minor release with a migration note and an approved breaking-change fingerprint.

## Consequences

- A production root lists each module once; the profile follows the list.
- The independent binding oracle is the only hand-written statement of wiring and compares every row of the prepared plan.
- A second provider of a capability fails preparation loudly; replacing a provider changes the plan and fails the oracle.
- A root's handle list does not depend on run-time values.
- Type-checking a large capability map is about linear (roughly 1,000 instantiations per module) instead of quadratic.
- Code that indexes `CapabilitiesOf<T>` with a generic `T` needs the one-line rewrite above.

## Rejected alternatives

- Completing `optional` slots: presence would become an implicit default, the mirror of the implicit absence ADR-0006 rejects.
- A generated root with a check mode: the same rule at build time plus a generator package, a build step and drift;
  generation would load executable modules to read declarations (ADR-0006), and ADR-0023 rejects a general generator.
- Priority, first-provider or registration-order rules (GM-REQ-003, ADR-0004).
- A separate `compose` method: `smoke` would have to learn it.
- A `bindAll` helper over a tuple of handles: no gain over one `bindFactory` per line, and a risk to type cost.
- Keeping the per-key distributive `CapabilitiesOf`: preserves generic indexing but keeps quadratic type cost.
