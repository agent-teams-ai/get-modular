# ADR-0036 and ADR-0037: drafts after the spike

Drafts only. The base drafts are the ones restated in "Phase 2" of the train plan; the deltas of that phase are applied
here, and the points where the spike measured something or chose between two readings are marked "S0". P1a and P1b
finalize these texts, send them to an independent review and file them as accepted records. Numbers are free: 0036 and
0037 (0034 is the open observation ADR).

## ADR-0036: Compose roots from module entries and static groups

```markdown
# ADR-0036: Compose roots from module entries and static groups

## Context

After ADR-0035 each module is still bound in the root and listed again in `factories`; owning modules repeat their id in
`scoped(declaration.implementationId, factory)`, and a factory typed with `ModuleContext` bound without `scoped` fails
with TS2345 in the root, far from the module. ADR-0032 lets teams bind fragments under their own maps, but the Consumer
Module Standard requires binding through the `api` that `smoke` passes, so fragments cannot reach a production root, and
every module lands in one flat root.

## Decision

- `implement<C>()(declaration, factory, adapter?)` creates a module entry: a frozen null-prototype
  `{ declaration, factory }` typed by the map it was implemented under and invariant only in the capabilities its
  declaration uses, as handles were. `declaration` is Assembly's frozen snapshot, `factory` the function after the
  adapter. `adapter` turns a factory written for another context into one for `FactoryContext`: Assembly calls
  `adapter(declaration.implementationId, factory)` once. `ContextAdapter<X>` is the type `scoped` from
  `@get-modular/resources` satisfies, and `scoped` is the only admitted adapter (an adapter that reads `scope` or adds
  anything but `resources` recreates the opaque context ADR-0031 rejects). Assembly does not import that package.
  `input<C>()(declaration)` creates an input entry `{ declaration }`.
- `implement` and `group` validate and snapshot synchronously. `implement` throws `AssemblyBindingError` with the codes
  `assembly.bind.invalid-declaration`, `assembly.bind.limit` and `assembly.bind.invalid-factory` (an adapter that is not
  a function, or that returns no function, is `invalid-factory`). `group` throws the new `assembly.bind.invalid-group`.
- `group(name, members)` creates a frozen static list of entries and groups. `name` is a navigation label of at most 128
  UTF-8 bytes: it never enters the profile, the plan or the digest. `members` is a dense array of at most 4096 authenticated
  entries and groups, never an input entry, and groups nest at most 16 levels with `modules` as level 0; the 17th level
  throws at creation. `group` reads own data properties only, so no getter runs. At type level `members` and the
  `profileId` form's `modules` must be tuples, so an annotated array fails to compile instead of losing the per-entry map
  check; the `composition` form accepts `readonly AnyModuleEntry<C>[]` because a Host that compiles its own profile builds
  its list at run time and Core checks the plan.
- `prepare({ profileId | composition, bindings?, modules, roots, inputs? })` replaces `factories`. Assembly flattens
  `modules` depth first, counts group nodes and entries against the existing 4096 ceiling (`assembly.prepare.limit`) and
  proceeds as in ADR-0035. Order and nesting never change the profile, the plan or the digest. An entry reached twice, or
  two entries with one implementation id (input entries included), fail with the new
  `assembly.prepare.duplicate-module`, whose `cause` lists every occurrence as `{ implementationId, paths }`; nothing is
  deduplicated. A root is an entry reached through `modules`; an input entry appears only in `inputs`. A forged group or
  entry, an input entry in `modules` and a root outside `modules` keep `assembly.prepare.handles`, `input-handles` and
  `roots`. `UnresolvedBinding` gains `groupPath` (the group names from `modules` down to the consumer).
- A private WeakSet authenticates each kind; copying fields forges nothing. The fields are public inert data so that
  `smoke` can rebuild a tree with `implement` and `group` alone; Assembly gets no hook.
- `bindFactory`, `bindInput` and the handle types leave the public API. `smoke` runs the real `prepare` first, then
  rebuilds every entry with a wrapped factory and every group with `group`, and prepares the rebuilt tree.
- Entries are created at the top level of `<module>.module.ts` by default. A factory that closes over Host-level values
  gets its entry from a composition-adapter function; the list a root passes to `prepare` never depends on run-time values.
- Declaration files (owner decision 2): a module's declaration lives in its own file that imports only `declareModule`,
  cardinality helpers and contract descriptors and has no side effects; the entry's file imports it. This is the default
  because ADR-0029 requires inert selected declarations separate from executable loaders for a dynamic scope: a later
  plugin manifest is generated from these files without importing implementations. Assembly does not enforce file
  placement; consumers enforce it by lint (Consumer Module Standard).
- Groups nest to mirror a consumer's feature tree; a group's name is a label and Assembly knows nothing of features, so
  nesting needs no API change and no new code beyond the group code above.

### Precedence

Supersedes the binding API of ADR-0032 and, in ADR-0035, the rejected alternatives "A separate compose method" and "A
bindAll helper". Narrows the ADR-0035 rejection of "A generated root with a check mode" to its cost ground (a generator, a
build step and drift): a generator that reads file names loads no module, so the ADR-0006 ground does not apply (ADR-0006
allows generated inventories); ADR-0023 still rejects publishing a general generator. If a later record adopts generated
group files, it supersedes this point. Amends the reason of the ADR-0031 rejected alternative "`implementationId` in the
context to name scopes automatically": names are no longer written in `scoped(name, factory)` because Assembly passes the
implementation id when it applies the adapter; the context stays closed, so that rejection stands. Keeps the ADR-0031
rejection of "An opaque `context: X` for every factory": an adapter other than `scoped` would recreate it, so `scoped` is the
only admitted adapter. Also supersedes the
Consumer Module Standard testing rule 5 and the API section until its revision, and admits the exact pair Core 0.5.0 and
Assembly 0.5.0 (ADR-0027 rule). GM-REQ-002, -011 and -012 are unchanged: `implement` adds the entry to a private WeakSet
at import, which is authentication, not a registry (nothing is looked up by key, nothing is discovered); groups are inert
static imports; no factory receives a resolver, a container or a registry. ADR-0026: the layout rules of the Consumer
Module Standard are expressed in Feature Module Standard roles, sub-features included, and adopted by consumers as a
strengthening of their profile; where a profile constrains placement (a v1 profile admits no sub-features), the profile
wins and the consumer records the mapping. Core semantics, the wire format and the plan digest do not change.

S0 measurement that replaces the lost prototype's numbers (same fixture shape, 20 groups, declarations in separate files,
`--singleThreaded` on tsc 7.0.2): at 500 modules entries and groups cost 533,687 instantiations against the gated row
542,562 (-1.6%), and 682,144 against the TS 5.8.3 baseline 715,455 (-4.7%); at 1,000 modules 1,034,123 against 1,051,998
and 1,352,992 against 1,420,303; growth is linear.

## Consequences

- A module appears once in its feature's group; a root lists features.
- A factory that reads `resources` without the adapter fails in the module file (TS2339).
- Feature maps compose by interface extension; TypeScript rejects two features that disagree on a contract (TS2320).
- Breaking for roots, `isolate` calls and code naming handle types; a codemod rewrites the call shape. Module packages
  peer `^0.5.0`; exhaustive maps add `assembly.bind.invalid-group` and `assembly.prepare.duplicate-module`.
- A dynamic Host loses the per-entry map check in the `composition` form.

## Rejected alternatives

Runtime discovery or glob imports (GM-REQ-011); decorators (GM-REQ-012); generated group files with a check mode (one
line per module saved for a generator, a build step and generated files). G2 alone does not reduce conflicts; G3 (group plus
aggregated per-module pins) cut conflicted merges from 0.47 to 0.10 at K=6 and from 0.55 to 0.16 at K=10; the decision on
cost (b) is recorded by the owner (pending). M2 is excluded from "best hand-written" because of its invalid merges
(interpretation); deduplicating a twice-reached entry (features would pull other features in silently);
keeping `bindFactory` beside entries (two ways to bind); feature functions taking a narrowed `api` (double listing
stays); lazy validation in `prepare` (new codes, weaker snapshot rule); a `smoke` hook in Assembly (public inert fields
suffice); a JSON manifest as the source of truth now (TypeScript keeps type linkage, single ids and refactors; a manifest
is generated later).
```

Points S0 settled or leaves open for P1a:

- Settled by the prototype: `scoped` satisfies `ContextAdapter<X>` on both compilers; `isolate(entry)` infers its
  dependencies from the entry on TS 5.8.3 (the entry carries the used part of its map in its brand detail, which costs
  nothing measurable); `smoke` rebuilds in about 30 lines on public API.
- Settled by measurement, and a refinement of the API text: the map check of `prepare` must read the used capability keys
  from the group types, not re-derive them from the union of all entries. The first formulation (`EntriesOf` over the group
  union in `prepare`) cost 569,475 instantiations on tsc 7.0.2 (+4.96%) and 755,455 on TS 5.8.3 (+5.59%, over budget);
  giving `ModuleGroup` a second, phantom type parameter `K` (the union of the keys its entries use, computed once at
  `group`) brought it to the numbers above. P1a keeps this shape: `ModuleGroup<E, K>`.
- Open, decide in P1a: whether `group` reports a width above 4096 with `assembly.bind.invalid-group` (the prototype does)
  or with `assembly.bind.limit`; the plan names only the depth case. `entriesOf` is generic in the prototype so that the
  result keeps entry types (the plan lists a non-generic signature).
- Open, decide in P1a: the path reported for an input entry in `duplicate-module` (the prototype reports
  `["(inputs)", alias]`, which collides with a valid group named `(inputs)`; the plan does not say).
- Open, decide in P1a (found in review, not re-run by me): `ModuleItem<C>` must be `AnyModuleEntry<C> |
  ModuleGroup<AnyModuleEntry<C>, keyof C>`; with `unknown` a `readonly ModuleItem<HostMap>[]` list fails with TS2322.
  P1a also decides the public type set (`AnyEntry`, `EntriesOf`, `DependenciesOf`, `CapabilitiesProvidedBy`, `InstanceOf`,
  `ModuleItem`, `KnownModules`, `TupleOnly`) and records it in this ADR and `public-api-compatibility.yaml`.

## ADR-0037: Pin providers, not completed rows, in the binding oracle

```markdown
# ADR-0037: Pin providers, not completed rows, in the binding oracle

## Context

Under ADR-0035 a completed row is fixed by its slot's capability and the single bound provider, so writing it restates
the declaration. At hundreds of modules the row table grows by about two rows per module, changes with every slot and is
maintained by copying output, the main risk ADR-0035 names.

## Decision

- The independent oracle states wiring decisions: for each capability a selected module provides, the implementation or
  implementations providing it; the root implementations; inputs pinned like providers; and every row completion does not
  produce (`optional`, `many`, explicit rows) exactly as written. Equal duplicates across oracle parts are allowed.
- `checkWiring(composition, oracles)` in `@get-modular/conformance` compares the plan with the union of the oracles:
  selections equal the providers and roots; every completed row binds the pinned provider of its capability; every
  listed row equals its plan row; a conflict between oracle parts fails. It reports every difference.
- A feature may keep its own oracle part. The oracle is never derived from the profile, the plan or the implementation.
  Oracle parts are test code. `describeWiring` exists for debugging only.
- Error style: a mismatch throws a `ConformanceError` with code `conformance.wiring.mismatch` whose `details.differences`
  lists every difference.

### Precedence

Supersedes the ADR-0035 consequence "The independent binding oracle is the only hand-written statement of wiring and
compares every row of the prepared plan", and the row sentence of the Consumer Module Standard testing rule 6.

## Consequences

- Provider replacement, an added or removed module, a changed root and every explicit, optional or many row fail the
  oracle.
- Accepted weakening: a new `required` slot, or a slot moved to another capability, binds to the pinned provider without
  an oracle change; review it as a declaration change.
- The agent-runtime and TEST oracles are rewritten.

## Rejected alternatives

Full rows per feature (same size, changes with every slot); a golden file refreshed from output; cross-feature rows only
(misses replacement inside a feature).
```

S0 did not prototype `checkWiring`; its text is unchanged from the plan.
