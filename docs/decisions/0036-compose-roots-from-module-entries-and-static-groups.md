---
id: ADR-0036
type: adr
status: accepted
owner: architecture
approved_by: product-owner-delegated-orchestrator
accepted_at: 2026-10-16
summary: Admits the Core and Assembly 0.5.0 pair in which a root prepares static groups of module entries, each entry created beside its module, instead of handles bound in the root.
related:
  - ADR-0004
  - ADR-0006
  - ADR-0023
  - ADR-0026
  - ADR-0027
  - ADR-0029
  - ADR-0030
  - ADR-0031
  - ADR-0032
  - ADR-0033
  - ADR-0035
---

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
  `@get-modular/resources` satisfies, and `scoped` is the only admitted adapter: any other adapter could read `scope`
  or add anything but `resources` to the context the module receives, which recreates the opaque context ADR-0031
  rejects. Assembly does not import that package. Assembly cannot tell `scoped` from another function of that type,
  so the Consumer Module Standard states this rule, as ADR-0031 did for `scope`. `input<C>()(declaration)` creates an
  input entry `{ declaration }`.
- `implement` and `input` validate and snapshot synchronously and throw `AssemblyBindingError` with the existing codes
  `assembly.bind.invalid-declaration`, `assembly.bind.limit` and `assembly.bind.invalid-factory` (an adapter that is not
  a function, or that returns no function, is `invalid-factory`).
- `group(name, members)` creates a frozen null-prototype `{ name, members }` with a frozen copy of `members`, a static
  list of entries and groups. `name` is a non-empty navigation label of at most 128 UTF-8 bytes: it never enters the
  profile, the plan or the digest. `members` is a dense array of at most 4096 authenticated entries and groups, never
  an input entry; groups nest at most 16 levels with `modules` as level 0. `group` reads own data properties only, so
  no getter runs. Every rule it checks, the width and name limits included, fails at creation with the new code
  `assembly.bind.invalid-group`, whose `cause` is an `Error` describing the broken rule: the fix is always in the
  group, so one code is one row in an exhaustive map, and `assembly.bind.limit` keeps its single meaning, the envelope
  of one declaration. A group's type carries the capability keys its entries use, computed once when `group` is
  called, so `prepare` checks the map against those keys instead of re-deriving them from every entry.
- `entriesOf(modules)` returns every entry occurrence of a module list depth first, keeping their types, so tests can
  pass the declarations of a root's modules, with those of its input entries, to `checkNamespaces` and other checks;
  it fails with `assembly.bind.invalid-group` like `group`.
- At type level `members` and the `profileId` form's `modules` must be tuples, so an annotated array fails to compile
  instead of losing the per-entry map check; the `composition` form accepts `readonly ModuleItem<C>[]`, where
  `ModuleItem<C>` is `AnyModuleEntry<C> | ModuleGroup<AnyModuleEntry<C>, keyof C>`, because a Host that compiles its own
  profile builds its list at run time and Core checks the plan.
- `prepare({ profileId | composition, bindings?, modules, roots, inputs? })` replaces `factories`. Assembly flattens
  `modules` depth first, counts group nodes and entries against the existing 4096 ceiling (`assembly.prepare.limit`) and
  proceeds as in ADR-0035. Order and nesting never change the profile, the plan or the digest. An entry reached twice,
  two entries with one implementation id, an input entry under two aliases, or an input entry and a module entry with
  one implementation id fail with the new `assembly.prepare.duplicate-module`, before any factory runs. Its `cause`
  lists every duplicated implementation id, sorted by id, as `{ implementationId, paths, inputs }`: `paths` holds the
  group path of each occurrence under `modules` in walk order, `inputs` each alias under which it appears in `inputs`;
  nothing is deduplicated. A root is an entry reached through `modules`; an input entry appears only in `inputs`. A
  forged group or entry, an input entry in `modules` and a root outside `modules` keep `assembly.prepare.handles`,
  `input-handles` and `roots`. `UnresolvedBinding` gains `groupPath` (the group names from `modules` down to the
  consumer, `[]` at top level).
- A private WeakSet authenticates each kind; copying fields forges nothing. The fields are public inert data so that
  `smoke` can rebuild a tree with `implement` and `group` alone and tests can read declarations; Assembly gets no hook.
- `bindFactory`, `bindInput` and the handle types `FactoryHandle`, `AnyFactoryHandle`, `InputHandle`,
  `AnyInputHandle`, `RootHandles` and `InputHandles` leave the public API. New public types: `ModuleEntry`,
  `AnyModuleEntry`, `InputEntry`, `AnyInputEntry`, `RootEntries`, `InputEntries`, `ModuleGroup`, `ModuleItem`,
  `ContextAdapter`, `DuplicateModule`, and the entry readers `AnyEntry`, `EntriesOf`, `DependenciesOf`,
  `CapabilitiesProvidedBy` and `InstanceOf`, which the conformance harness and Hosts that read module ids from a group
  type need. `KnownCapabilities` keeps its name and its named error and checks the capabilities that `modules` and
  `inputs` use instead of `factories`. Public declarations also reference the helper types `EntryFactory`, `UsedMap`,
  `UsedKeysOf` and `TupleOnly`, so they are exported because the public API check rejects a reference to an
  unexported type; they type those declarations and are not authoring API. Brand symbols and the runtime checks stay
  internal.
- In `@get-modular/conformance`, the `prepare` of the api that `smoke` passes to `compose` calls the real `prepare`
  first and returns any failure unchanged; otherwise it rebuilds every entry with a wrapped factory and every group
  with `group`, remaps `roots` by identity and prepares the rebuilt tree. A root prepares through that api: `smoke`
  fails with `conformance.smoke.failed` when `compose` resolves with a preparation the api did not produce.
  `isolate(entry, ...)` builds one module from its entry, whose adapter is already applied.
- Consumer authoring defaults, on the owner's decisions of 2026-10-11, are rules of the Consumer Module Standard that
  consumers enforce by lint and layout checks; Assembly knows no files and enforces none of them. An entry is created
  once, at the top level of its module's file; a factory that closes over Host-level values gets its entry from a
  composition-adapter function; the list a root passes to `prepare` never depends on run-time values. A module's
  declaration lives in its own file that imports only `declareModule`, cardinality helpers and contract descriptors
  and has no side effects; the entry's file imports it. This is the default because the Consumer Module Standard keeps
  inert selected declarations separate from executable loaders in an explicitly adopted dynamic scope (its section on
  the ADR-0029 lifecycle candidate), so a later plugin manifest can be generated from these files without importing
  implementations.
- Groups nest to mirror a consumer's feature tree; a group's name is a label and Assembly knows nothing of features, so
  nesting needs no API change and no new code beyond the group code above.
- Admit the public pair Core 0.5.0 and Assembly 0.5.0 under the exact-pair rule of ADR-0027. Core changes only its
  version.

### Precedence

Entries replace handles. In ADR-0031, `input` replaces `bindInput` and `prepare` takes `modules` instead of
`factories`; the `profileId` form of ADR-0035 takes `modules` the same way. Every other ADR-0031 rule holds for input
entries, except that an input entry under a second alias, or an entry that shares its implementation id with another
occurrence, now fails with `assembly.prepare.duplicate-module` instead of `assembly.prepare.input-handles` or
`assembly.prepare.handles`. The capability-scoped invariance and the map check of ADR-0032 hold for entries and groups
unchanged, and `ValidDeclaration` (ADR-0027) validates at `implement` and `input` instead of `bindFactory`.

Supersedes, in ADR-0035, the rejected alternatives "A separate `compose` method" and "A `bindAll` helper over a tuple of
handles": `smoke` rebuilds groups through the public `implement` and `group`, groups list each module once beside its
feature instead of in the root, which a `bindAll` helper would not have done, and the type cost of groups is measured
below. For generated group files that list entries by file name, drops the ADR-0006 ground of the ADR-0035 rejection "A
generated root with a check mode": such a generator imports no module, and ADR-0006 allows generated inventories that
load no executable code. Its cost ground (a generator, a build step and drift) and the ADR-0023 rejection of a published
general generator stand, and a generated root that completes a profile stays rejected as ADR-0035 states. If a later
record adopts generated group files, it supersedes this point.

Amends the reason of the ADR-0031 rejected alternative "`implementationId` in the context to name scopes automatically":
names need not be written in `scoped(name, factory)`, because Assembly passes the implementation id when it applies the
adapter; the context stays closed, so that rejection stands. Keeps the ADR-0031 rejection of "An opaque `context: X` for
every factory": an adapter other than `scoped` would recreate it, so `scoped` is the only admitted adapter.

For Assembly 0.5.0 this decision also takes precedence over `docs/architecture/common-assembly.md`, the Consumer Module
Standard included, wherever the two differ, including binding factories and inputs through an `api`, testing a module
with `isolate(api, ...)` (testing rules 1, 4 and 5), the Host, instance and module guidance, the API section, the
preparation envelope and the duplicate codes. The revision of that document for this release replaces those passages.

GM-REQ-002, -011 and -012 are unchanged: `implement` adds the entry to a private WeakSet at import, which is
authentication, not a registry (nothing is looked up by id or name, nothing is enumerated or discovered); groups are
inert static imports; no factory receives a resolver, a container or a registry. ADR-0026: the layout rules of the
Consumer Module Standard are expressed in Feature Module Standard roles, sub-features included, and adopted by consumers
as a strengthening of their profile; where a profile constrains placement (a v1 profile admits no sub-features), the
profile wins and the consumer records the mapping. Core semantics, the wire format and the plan digest do not change.

## Consequences

- A module appears once in its feature's group; a root lists features.
- A factory that reads `resources` without the adapter fails in the module file (TS2339).
- Feature maps compose by interface extension; TypeScript rejects two features that disagree on a contract (TS2320).
- Breaking for roots, `isolate` calls and code naming handle types or `KnownCapabilities`; a codemod (`0.4-0.5`)
  rewrites the call shape and prints what it cannot change. Module packages peer `^0.5.0`; exhaustive maps add
  `assembly.bind.invalid-group` and `assembly.prepare.duplicate-module`, and a duplicate that 0.4 reported as
  `assembly.prepare.handles` or `assembly.prepare.input-handles` now reports `assembly.prepare.duplicate-module`.
- Through the adapter a module scope is named by its implementation id. A module that passed another name to `scoped`
  gets new debt paths when it moves to the adapter, and Hosts alert on those paths (ADR-0030); the codemod leaves such
  calls for a hand edit.
- An entry or group is authentic only to the copy of Assembly that created it. Module files, groups, the root and the
  conformance kit must resolve one copy, as the Consumer Module Standard already requires; an entry or group from a
  second copy fails `assembly.prepare.handles` (an input entry `assembly.prepare.input-handles`), and `group` refuses
  such an entry with `assembly.bind.invalid-group`.
- Group nodes count against the 4096 ceiling, so a grouped root holds fewer modules than a flat one.
- A dynamic Host loses the per-entry map check in the `composition` form.
- Type cost, measured on the type-scale fixture (500 modules in 20 groups, `--singleThreaded` on tsc 7.0.2): 523,684
  instantiations and 103,064 types at 500 modules against the gated row 542,562 and 104,500. The module-entries spike
  measured 533,687 instantiations and 106,654 types against 542,562 and 104,500 on tsc 7.0.2, and 682,144
  instantiations against the TS 5.8.3 baseline 715,455 (TS 5.8.3 is measured, not gated), with declarations in
  separate files, and linear growth to 1,000 modules (1,013,120 instantiations and 174,570 types in this release).

## Rejected alternatives

- Runtime discovery or glob imports: GM-REQ-011.
- Decorators: GM-REQ-012.
- Generated group files with a check mode: in the module-entries spike's merge experiment, generating the group alone
  barely reduces conflicts (0.42 against 0.47 with six parallel branches, 0.51 against 0.55 with ten); generating the
  group and aggregating per-module oracle pins cut conflicted merges from 0.47 to 0.10 with six and from 0.55 to 0.16
  with ten, at the cost of a generator step before every typecheck, test and editor session in every consumer and a
  new tooling package. The owner rejected it on that cost on 2026-10-15. Groups keep one import and one member per
  line, so a later generator can adopt them.
- Deduplicating a twice-reached entry: features would pull other features in silently.
- Keeping `bindFactory` beside entries: two ways to bind.
- Feature functions taking a narrowed `api`: double listing stays.
- Lazy validation in `prepare`: new codes and a weaker snapshot rule.
- A `smoke` hook in Assembly: public inert fields suffice.
- A JSON manifest as the source of truth now: TypeScript keeps type linkage, single ids and refactors; a manifest can
  be generated later.
- Re-deriving the used capability keys from all entries in `prepare`: an interim prototype run, not reproducible from
  the retained spike scripts, measured +4.96% instantiations on tsc 7.0.2 and +5.59% on TS 5.8.3 at 500 modules; the
  TS 5.8.3 figure exceeds the +5% allowance of this release.
- Reporting a group's width or name length with `assembly.bind.limit`: that code would name two different envelopes.
- Reporting duplicates with `assembly.prepare.handles`: that code means an unauthenticated or uncovered entry and
  carries no list of occurrences.
- A pseudo group path for input aliases in the duplicate cause: any string is a valid group name, so it can collide.
