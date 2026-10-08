# T2-4 brief: Assembly 0.4.0 revision-window builder and maps, conformance 0.2.0 (stacked on T2-3)

PR title: `feat(assembly): revision-window builder and maps`. Base: the T2-3 branch (`feat/core-revision-windows`),
not `main`. When this PR is clean it is merged into the T2-3 branch; T2-3 then goes to `main` as one squash
(decided on 2026-10-04 during planning).

Authority: ADR-NNNN, sections "Assembly builder and types", "Conformance", "Schema 1 declarations" (Assembly
refuses schema 1), "Release". The verified type sketch is archived in
`research/contract-evolution-2026-10/raw/sketch/` (`RESULTS.md` first).

## Re-verify before start

1. `git fetch origin`. The T2-3 branch has at least its commit 1 (Core wire types at schema 2). Branch from its head:
   `feat/assembly-revision-windows`.
2. `git diff 81063ad origin/main -- packages/assembly/src packages/conformance/src` is empty or understood. If
   `types.ts` changed (new types, renamed brand), re-run the sketch fixtures against the new file before porting and
   stop on any difference you cannot explain.
3. Q1 is an owner decision (2026-10-08): Core and Assembly accept only schema 2. Landing is decided (stacked).
   Main drift since `81063ad` (on 2026-10-08 `8fe924d`): every check lane also runs on Node 26.10.0 (30 lanes, six
   aggregates), `pnpm check` starts with `lockfile:peers:check`, `runtime:policy:typecheck`, `runtime:policy:test`,
   and the FMS profile test moved (see A6). Re-read anything else that changed.
4. Train 1 is released (REL-1 merged, 0.3.0 published): `packages/core/package.json` and
   `packages/assembly/package.json` are at 0.3.0, resources and conformance at 0.1.0, `.changeset/` holds no train 1
   changeset, `approvedBreakingChanges` of Core and Assembly in `architecture/foundation/public-api-compatibility.yaml`
   are empty, and `npm view @get-modular/assembly version` prints `0.3.0`. Otherwise stop: train 2 must not land on
   unreleased train 1 changesets.
5. `git grep -n "0\.4\.0\|0\.3\.0" -- architecture/checks tests/*.mjs` and compare with section "Pair admission".
6. Node per `.node-version`; `pnpm install --frozen-lockfile`; record `pnpm assembly:test` and
   `node --test tests/assembly/type-scale.test.mjs` times on the T2-3 base (type-scale will fail to compile there;
   then record it on `main` instead).

## Owner decisions (facts) and open questions

One monotonic line per contract id, no `/v2` ids; a provider declares `revision` and `compatibleFrom`; binding iff
`compatibleFrom <= consumer revision <= provider revision`; the consumer's revision is fixed by the version of its
contract package (an ordinary dependency); any change of `revision` or `compatibleFrom` releases a version a caret
range does not accept; raising a revision keeps every `implementationId`; Core, Assembly and conformance accept only
declaration schema 2, schema 1 is refused (`schema.unsupported-version` in Core, `assembly.bind.invalid-declaration`
in Assembly) and the historical corpus replays through a test-side lift (owner decision 2026-10-08); T2-3 and T2-4 are
stacked PRs with separate reviews that land in `main` as one squash, and train 2 lands only after train 1 is released
(decided on 2026-10-04 during planning); all `@get-modular/*` stay 0.x and a break ships as a minor with migration
notes; plugins and observation are out of scope. Open questions: none. Anything this brief does not cover: stop and
ask.

## Scope and non-goals

Assembly source, tests, README and changeset; conformance source, tests, README and changeset;
`tests/resources/assembly-scope.test.mjs`; `tests/node-runtime-compatibility.test.mjs`; pair admission and the
public API approvals. Non-goals: Core (T2-3), CMS and contract docs (T2-5), resources package source, new exports,
CI or lane changes.

## A1. Builder runtime and types

`packages/assembly/src/features/construction/contract.ts`:

```ts
const KIND = "get-modular.module-declaration" as const;
const SCHEMA_VERSION = 2 as const;
const MAXIMUM_REVISION = 2147483647;
const isRevision = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAXIMUM_REVISION;
// `ContractSpec` comes from types.ts (exported there, see below).

/** Contract owner: `defineContract<DbR5, { 3: DbR3; 4: DbR4 }>()({ id: "acme/db", revision: 5, compatibleFrom: 3 })`. */
export function defineContract<V, Earlier extends { readonly [revision: number]: unknown } = {}>():
  <const Id extends string, const Rev extends number, const From extends number = Rev>(
    spec: ContractSpec<Id, Rev, From, Earlier>,
  ) => Contract<Id, V, Rev, From, Earlier> {
  return <const Id extends string, const Rev extends number, const From extends number = Rev>(
    spec: ContractSpec<Id, Rev, From, Earlier>,
  ): Contract<Id, V, Rev, From, Earlier> => {
    const candidate: unknown = spec;
    if (typeof candidate !== "object" || candidate === null) { refuse("defineContract() requires a contract spec"); }
    const { id, revision } = spec;
    const from = (spec.compatibleFrom === undefined ? revision : spec.compatibleFrom) as From;
    if (typeof id !== "string" || id.length === 0) { refuse("A contract needs a capability id"); }
    if (!isRevision(revision)) { refuse("A contract revision is an integer from 1 to 2147483647"); }
    if (!isRevision(from) || from > revision) { refuse("compatibleFrom is an integer from 1 to the contract revision"); }
    type Window = Rev | (keyof Earlier & number);
    // Every entry is a fresh frozen record, so declarations never share one record.
    return Object.freeze({
      id, revision, compatibleFrom: from,
      provide: (): ProvidedEntry<Id, Rev, From, Window> =>
        Object.freeze({ capabilityId: id, revision, compatibleFrom: from }) as ProvidedEntry<Id, Rev, From, Window>,
      slot: <const S extends string, const K extends Cardinality>(slotId: S, cardinality: K): SlotEntry<Id, Rev, S, K> =>
        Object.freeze({ slotId, capabilityId: id, revision, cardinality }) as SlotEntry<Id, Rev, S, K>,
    });
  };
}
```

This body compiles on TypeScript 7.0.2 and 5.8.3 against the types below (sketch `define-contract-impl.ts.txt`).
`declareModule` keeps its code; it now supplies `schemaVersion: 2`. Update the file comment: "Only this file spells
the wire generation (ADR-0032, ADR-NNNN)."

`packages/assembly/src/features/construction/types.ts`: replace the map, entry, contract, key and factory types with
the verified versions below. Keep every other type byte-identical (`CapabilityBrand`, `FactoryHandle`,
`AnyFactoryHandle`, `RootHandles`, `RootInstances`, `IsUnion`, input handles, `KnownCapabilities`,
`AssemblyPrepareInput`, outcomes, `Assembly<C>`). Export from the Assembly root (`src/index.ts`), as types, exactly
the new helpers that the exported types reference: `ContractSpec`, `ValuesOf`, `RevisionPairs`, `EntryKeys`,
`ValueAt`, `ValuesAll`. Foundation runs API Extractor with `ae-forgotten-export` as an error, and these six are the
set that passes (verified on 2026-10-04 with the real Foundation 1.7.2 check). No other new export. Never use an
identifier ending in `V` plus a digit, also in comments of `.ts` files (`production-artifacts.mjs` scans the whole
text): write `DbR5`, not `DbV5`.

```ts
export type CapabilityContract<Value> = { readonly value: Value };
export type CapabilitySchema<C> = { readonly [K in keyof C]: CapabilityContract<unknown> };

declare const contractEntry: unique symbol;
declare const contractValues: unique symbol;   // replaces contractValue

/** A provided capability entry; only a contract descriptor produces it. `Window` lists the revisions it serves. */
export type ProvidedEntry<Id extends string, Rev extends number, From extends number = Rev, Window extends number = Rev> = {
  readonly capabilityId: Id;
  readonly revision: Rev;
  readonly compatibleFrom: From;
  /** Type-only: the entry comes from a contract descriptor, never from a hand-written record. */
  readonly [contractEntry]: { readonly window: Window };
};
/** A dependency slot entry; only a contract descriptor produces it. */
export type SlotEntry<Id extends string, Rev extends number, S extends string, K extends Cardinality> = {
  readonly slotId: S;
  readonly capabilityId: Id;
  readonly revision: Rev;
  readonly cardinality: K;
  readonly [contractEntry]: { readonly window: Rev };
};
/** One descriptor per capability revision line, owned by the contract owner and created by `defineContract`. */
export type Contract<Id extends string, V, Rev extends number, From extends number = Rev,
  Earlier extends { readonly [revision: number]: unknown } = {}> = {
  readonly id: Id;
  readonly revision: Rev;
  readonly compatibleFrom: From;
  readonly provide: () => ProvidedEntry<Id, Rev, From, Rev | (keyof Earlier & number)>;
  readonly slot: <const S extends string, const K extends Cardinality>(slotId: S, cardinality: K) => SlotEntry<Id, Rev, S, K>;
  /** Type-only: the value type of every revision this descriptor serves. */
  readonly [contractValues]?: Earlier & { readonly [R in Rev]: V };
};
export type AnyContract = Contract<string, unknown, number, number, { readonly [revision: number]: unknown }>;

/** The `defineContract` spec; `compatibleFrom` must be `revision` or a key of `Earlier`. */
export type ContractSpec<Id extends string, Rev extends number, From extends number, Earlier> = {
  readonly id: Id;
  readonly revision: Rev;
  readonly compatibleFrom?: From & ([From] extends [Rev | keyof Earlier] ? unknown
    : { readonly "compatibleFrom needs a value type in Earlier": From });
};
/** The value types a descriptor serves, keyed by revision. */
export type ValuesOf<T> = T extends { readonly [contractValues]?: infer M } ? M : never;
/** One `{ key, value }` pair per served revision; one key-remapped mapped type builds the map from them. */
export type RevisionPairs<T> = T extends AnyContract
  ? { readonly [R in keyof ValuesOf<T> & number]: { readonly key: `${T["id"]}@${R}`; readonly value: ValuesOf<T>[R] } }[keyof ValuesOf<T> & number]
  : never;
/**
 * The capability map of a module, a team fragment or a Host: one key `${id}@${revision}` per served revision.
 * Name a map over many descriptors as an interface: `interface Host extends CapabilitiesOf<typeof A | typeof B> {}`.
 */
export type CapabilitiesOf<T extends AnyContract> = {
  readonly [E in RevisionPairs<T> as E["key"]]: CapabilityContract<E["value"]>;
};
export type DeclarationSpec = {
  readonly moduleId: string;
  readonly implementationId: string;
  readonly owner: ModuleDeclaration["owner"];
  readonly provides: readonly ProvidedEntry<string, number, number, number>[];
  readonly slots: readonly SlotEntry<string, number, string, Cardinality>[];
};
export type Declared<T extends DeclarationSpec> = T & {
  readonly kind: "get-modular.module-declaration";
  readonly schemaVersion: 2;
};

/** The map keys of one declaration entry. */
export type EntryKeys<P> = P extends { readonly capabilityId: infer Id extends string; readonly [contractEntry]: { readonly window: infer W extends number } }
  ? `${Id}@${W}` : never;
/** The value type at key K of map C. */
export type ValueAt<C, K> = K extends keyof C ? C[K] extends { readonly value: infer V } ? V : never : never;
/** The intersection of the values at keys K; distributes over keys only, so a union value stays a union. */
export type ValuesAll<C, K> = (K extends unknown ? (value: ValueAt<C, K>) => void : never) extends (value: infer I) => void ? I : never;

/** The map keys a declaration provides or consumes; a handle brand is keyed by them. */
export type UsedCapability<D extends ModuleDeclaration> = EntryKeys<D["provides"][number]> | EntryKeys<D["slots"][number]>;

export type ValidDeclaration<C, D extends ModuleDeclaration> =
  true extends IsUnion<D> | IsUnion<D["slots"]> | IsUnion<D["provides"]>
    | (D["slots"] extends infer Slots extends readonly unknown[] ? { [K in keyof Slots]: IsUnion<Slots[K]> }[number] : never)
    | (D["provides"] extends infer Provides extends readonly unknown[] ? { [K in keyof Provides]: IsUnion<Provides[K]> }[number] : never)
    ? never :
  number extends D["provides"]["length"] | D["slots"]["length"] ? never
    : [(
      D["provides"][number] | D["slots"][number] extends infer P
        ? P extends { readonly capabilityId: infer K extends string; readonly [contractEntry]: { readonly window: infer W extends number } }
          ? string extends K ? P
            : true extends IsUnion<K> ? P
            : number extends W ? P
            : [EntryKeys<P>] extends [keyof C] ? never : P
          : P
        : never
    ) | (
      D["slots"][number] extends infer S
        ? S extends { readonly slotId: infer K extends string; readonly revision: infer R; readonly cardinality: { readonly kind: infer Q } }
          ? string extends K ? S : true extends IsUnion<K> | IsUnion<Q> | IsUnion<R> ? S : never
          : S
        : never
    )] extends [never] ? unknown : never;
export type FactoryCapabilities<C, D extends ModuleDeclaration> = {
  readonly [P in D["provides"][number] as P["capabilityId"]]: ValuesAll<C, EntryKeys<P>>;
};
export type FactoryDependencies<C, D extends ModuleDeclaration> = {
  readonly [S in D["slots"][number] as S["slotId"]]: S["cardinality"]["kind"] extends "many"
    ? readonly ValueAt<C, EntryKeys<S>>[]
    : S["cardinality"]["kind"] extends "optional" ? ValueAt<C, EntryKeys<S>> | undefined
    : ValueAt<C, EntryKeys<S>>;
};
```

Do not use the distributive form `{ [Key in KeysOf<T>]: ... ValueForKey<T, Key> }`: it reaches TS2589 on
TypeScript 7.0.2 at 500 windowed handles (sketch `RESULTS.md`).

`snapshot.ts`: replace `compatibility()` by a revision reader (`typeof value === "number" && Number.isSafeInteger(value)`,
otherwise the existing shape failure); provided records have exactly `capabilityId`, `revision`, `compatibleFrom`;
slots `slotId`, `capabilityId`, `revision`, `cardinality`; declarations require `schemaVersion === 2`; plans require
`schemaVersion === 2` and bindings with `capabilityId` and `revision`. Ranges and the window are Core's: Assembly
checks shape only. `prepare.ts:29`: compare `value.revision === other.revision`.

Gate A1: `pnpm assembly:build`, `pnpm assembly:typecheck`, `pnpm governance:check`, and `pnpm foundation:check`,
which at this point must fail only with unapproved-break fingerprints (approved in A6), never with
`PUBLIC_API_EXTRACTION_FAILED`.

## A2. Tests and fixtures

- Move every Assembly fixture whose subject is not the wire itself to descriptors and `declareModule`:
  `tests/assembly/{types.ts,types-positive.ts,mixed-graph.ts,fixture.mjs,preparation.test.mjs}`,
  `packages/assembly/tests/fixture.mjs`, `packages/assembly/tests/bounds.test.mjs` (plan literals with
  `compatibility`, lines 11 and 17), `tests/resources/assembly-scope.test.mjs`,
  `tests/node-runtime-compatibility.test.mjs`, `tests/assembly/type-scale.mjs` `largeLiteralSource()` (1000
  declarations through one descriptor and `declareModule`; hand-written `CapabilityContract<number, "synthetic/v1">` maps
  do not compile any more). Where a test's subject is the wire (snapshot shape, malformed records), keep literals in
  schema 2 and add the schema 1 refusal (`assembly.bind.invalid-declaration`).
- `tests/assembly/builder.test.mjs`: runtime refusals of revision `0`, `1.5`, `2 ** 31`, `compatibleFrom` `0`, `"1"`,
  greater than `revision`; default `compatibleFrom`; the emitted provide and slot records; frozen fresh records.
- `tests/assembly/builder-types.ts`: port all nine negatives and the positives of the sketch `use.ts` (consumer r3
  cannot use an r4 member, r5 consumer cannot use a removed member, window provider must implement the r3-only member,
  Host map without `@3`, mutated r3, `compatibleFrom` not in `Earlier`, hand-written entry, widened `number` revision,
  map without the capability, union-valued contract stays a union) and one check that the error text of the missing
  key names `"acme/db@3"`.
- Runtime: a prepared graph with a provider window 3..5, consumers built with r3 and r5 descriptors and a too-old
  consumer refused by Core with `consumer-too-old` details, all through `assemblyFor`, plus plan bindings carrying
  `revision`.

Gate A2: `pnpm assembly:test` exit 0.

## A3. Windowed type scale

`tests/assembly/type-scale.mjs`: add `fragmentWindowSource(count = 500, teams = 20)`: every contract `i` has
`revision = 3 + (i % 3)`, `compatibleFrom = revision - 2` and `Earlier` with the two earlier revisions; each revision
has its own value type, `R_k = R_(k-1) & { readonly m<k>: () => number }`, so the provider intersection is real; even
teams slot an older descriptor copy (`revision - 1`, `Earlier` with one revision); the Host map is an interface over
the newest descriptors (the generator in the sketch `gen.mjs.txt`, `windowed()`, extended with distinct types). `tests/assembly/type-scale.test.mjs`:
a second test that compiles it on both compilers and resolutions with `testAssemblyTypes`, time as `t.diagnostic`,
never asserted. Gate: `node --test tests/assembly/type-scale.test.mjs` exit 0; record both times. Stop if any run
reports TS2589 or the windowed time exceeds 3x the plain fragment time of the same run.

## A4. Assembly docs and changeset

`packages/assembly/README.md`: replace the builder paragraph (from "A contract owner publishes" to "remain valid.")
with:

> A contract owner publishes one descriptor per capability with
> `defineContract<Value, Earlier>()({ id, revision, compatibleFrom })`. `revision` and `compatibleFrom` are integers
> from 1 to 2147483647; `compatibleFrom` defaults to `revision`. A provider serves every consumer revision from
> `compatibleFrom` to `revision`, and `Earlier` maps each earlier revision in that window to its value type, for
> example `defineContract<DbR5, { 3: DbR3; 4: DbR4 }>()({ id: "acme/db", revision: 5, compatibleFrom: 3 })`.
> `Earlier` is a type literal, not an interface (an interface has no numeric index signature and is rejected), and it
> lists exactly the revisions from `compatibleFrom` to `revision - 1`: drop a key when `compatibleFrom` passes it. Module
> authors write declarations with `declareModule`, for example
> `declareModule({ moduleId, implementationId, owner, provides: [Orders.provide()], slots: [Db.slot("db", required())] })`;
> `declareModule` supplies `kind` and `schemaVersion`. `CapabilitiesOf<typeof Db | typeof Orders>` derives the
> capability map `C`, with one key per served revision such as `acme/db@3`. A provider's factory returns a value that
> satisfies every revision in its window; a slot receives the value type of its revision. Name a map over many
> descriptors as an interface, `interface HostCapabilities extends CapabilitiesOf<typeof Db | typeof Orders> {}`.
> Import port types from the contract package; never write a map or `CapabilityContract` by hand or index a map by
> capability ID.

In the handle paragraph replace "has the identical contract in the preparing map" with "has the identical value type
for each revision it uses in the preparing map". In the identity paragraph drop "and exact compatibility tokens" and
the example `synthetic/v1`. Add a section:

> ## Upgrading from 0.3
>
> Declarations, factories and composition roots written with `defineContract`, `declareModule` and `CapabilitiesOf`
> need no change. Replace hand-written `CapabilityContract<Value, Token>` maps by `CapabilitiesOf`, replace
> `Map["id"]["value"]` by the port type the contract package exports, move literal Core declarations bound through
> Assembly to `declareModule`, and raise Get Modular peer ranges to `^0.4.0`. Assembly refuses declarations with
> `schemaVersion: 1` with `assembly.bind.invalid-declaration`, and Core refuses them with
> `schema.unsupported-version`: rebuild declarations with the 0.4.0 builder.

`.changeset/assembly-revision-windows.md` (minor), body: what changed (descriptors with windows, schema 2 entries,
per-revision map keys, provider intersection, typed binding accepts descriptor entries only, plans schema 2,
schema 1 refused, and the new exported types `ContractSpec`, `ValuesOf`, `RevisionPairs`, `EntryKeys`, `ValueAt`,
`ValuesAll`), then the same migration text as the README section, then `Authoring surface changed: yes`.

Gate A4: `pnpm docs:protocol:check`.

## A5. Conformance

- `src/features/suites/suite.ts`: remove `sameData` and its comment. The subject's provided entry for
  `contract.id` must exist with safe-integer `revision` and `compatibleFrom` and satisfy
  `compatibleFrom <= contract.revision <= revision`; otherwise throw `conformance.suite.revision-mismatch` with
  `${subject.name} does not provide ${contract.id}; the suite checks revision ${contract.revision}` or
  `${subject.name} provides ${contract.id} revisions ${compatibleFrom} to ${revision}; the suite checks revision ${contract.revision}`.
- `src/features/suites/types.ts`:

  ```ts
  type Entry<M> = M extends { readonly value: infer V } ? V : never;
  /** The value type of the contract at the descriptor's own revision. */
  export type ContractValue<T extends AnyContract> =
    Entry<CapabilitiesOf<T>[`${T["id"]}@${T["revision"]}` & keyof CapabilitiesOf<T>]>;
  ```

  (indexing with `["value"]` directly fails with TS2536 in generic code; verified).
- `src/features/harness/isolate.ts`: read `revision` from each slot as an own data property (safe integer from 1 to
  2147483647, otherwise `invalid(...)` naming the slot); build each fake with
  `defineContract()({ id: capabilityId, revision })` and
  `declareModule({ moduleId: id, implementationId: id, owner: { authority: SYNTHETIC, path: ["fake"] }, provides: [contract.provide()], slots: [] })`,
  imported from `@get-modular/assembly` (root import of a declared peer). No `kind`, `schemaVersion` or wire record
  remains in conformance source; the composition profile literal stays (profiles are schema 1).
- `README.md`: the suite paragraph becomes: "The declaration of the subject must provide the suite's capability with
  a window that contains the suite's revision: `compatibleFrom <= revision of the suite <= revision`. A provider that
  serves several revisions runs the suite of each. Otherwise `conformance.suite.revision-mismatch` is thrown
  synchronously, before any test registers." Error table row: "the subject's window does not contain the suite
  revision".
- Tests: `conformance.test.mjs` CS1 becomes a table: provider window 3..5 passes suites r3, r4, r5; suites r2 and r6
  throw with both numbers in the message; a subject without the capability throws. `packed-root.test.mjs:86-101`:
  keep one mismatch from the installed archives and add one window pass. `isolate` tests: a module with an r5 slot gets
  a fake that Core binds; a slot without `revision` is `conformance.argument.invalid`.
- `.changeset/conformance-revision-windows.md` (minor): "Support contract revision windows (ADR-NNNN) with Core and
  Assembly 0.4.0." plus the three behavior bullets and "Migration: a provider that serves a window runs the suite of
  each revision in it; calls do not change." and `Authoring surface changed: yes`. Changesets would give conformance
  only a patch for the peer minors; this own minor changeset is required (ADR-0033).

Gate A5: `pnpm conformance:check`, `pnpm resources:check` exit 0.

## A6. Pair admission and API approvals

- `architecture/checks/assembly-admission.mjs`: constants for ADR-NNNN (path, bytes digest = `sha256:` of the accepted
  file bytes, registry entry copied from `accepted-decisions.json`), and `ASSEMBLY_PAIR_DECISIONS["0.4.0"]` after
  `"0.3.0"`, following the 0.3.0 entry exactly.
- `architecture/checks/production-artifacts.mjs:233,255`: `PUBLIC_ASSEMBLY_VERSIONS` gains `"0.4.0"`; message
  "Assembly version requires historical 0.1.0 or public 0.2.0/0.3.0/0.4.0 admission"; comment names ADR-NNNN.
- `tests/assembly-admission.test.mjs`: a new test "0.4.0 pair requires the exact accepted ADR-NNNN and retains
  earlier authority", a copy of the 0.3.0 test with ADR-NNNN; in the rejected version table (`:622`) replace
  `["0.4.0", "0.4.0"]` by `["0.5.0", "0.5.0"]`.
- `tests/feature-module-standard-profile.test.mjs` (locate by text; `:943` and `:951` on `8fe924d`):
  `for (const version of ["0.2.0", "0.3.0"])` adds `"0.4.0"`; the rejected probe `[{ version: "0.4.0" }, ...]` becomes
  `0.5.0` with the new message.
- `architecture/foundation/public-api-compatibility.yaml`: run `pnpm assembly:build && pnpm foundation:check`. It fails
  with the unapproved breaks and prints one fingerprint per package. Add
  `{ fingerprint: "<printed>", decisionId: ADR-NNNN }` to Core (first entry) and Assembly. Never compute a fingerprint
  by hand; if none is printed: stop.

Gate A6: `pnpm governance:check`, `pnpm governance:test`, `pnpm foundation:check`, `pnpm sdk-growth:check`,
`pnpm ownership:checkpoint:test`, each exit 0.

## Landing

After the review of this PR is clean: merge it into the T2-3 branch (owner). On the T2-3 branch, commit nothing new;
run `GIT_CONFIG_GLOBAL=<file with only a [user] section> pnpm check` (create it with
`printf '[user]\n\tname = %s\n\temail = %s\n' "$(git config user.name)" "$(git config user.email)" > <tmp>/gitconfig-nohooks`),
exit 0; push; CI green on all 30 lanes and six aggregates, each lane under 810 s. T2-3 gets a final whole-stack review before its squash merge.

PR body: commits, the sketch results compared with the measured fixture times, the type-scale times (plain and
windowed, both compilers), the two fingerprints, and "merges into T2-3".

## Risks and stop conditions

| Risk | Stop / action |
| --- | --- |
| a sketch fixture behaves differently in the repository | stop; report the fixture and both compilers' output |
| TS2589 anywhere, or windowed type-scale above 3x plain | stop |
| a public name would be added or removed beyond the documented types | stop (public API delta is part of the ADR) |
| conformance needs a Core or Assembly change | stop; that belongs to T2-3 or A1 |
| the CMS examples (`tests/assembly/consumer-standard-examples.test.mjs`) fail | stop: they must compile unchanged, that is the ADR's promise for builder users |
| CI lane above 810 s | stop |

## Must not

- Export names beyond the six helper types, rename the handle brand or change `KnownCapabilities`,
  `AnyFactoryHandle`, `prepare`.
- Weaken a type fixture to make it pass. Add `as never`, double casts or `any` to production code.
- Merge into `main`. Merge, request reviewers or comment outside the own PRs. Override the git identity, add
  co-author trailers or tool attribution.

## Done

All gates green on the merged stack; nine negative fixtures and the windowed scale fixture pass on both compilers;
conformance no longer spells the wire; pair admission and approvals in place; three changesets present (core in T2-3,
assembly and conformance here).

## Review checklist

- `git grep -n "familyVersion\|compatibility" -- packages/assembly/src packages/conformance/src` returns nothing.
- `git grep -n "schemaVersion" -- packages/conformance/src` returns only the profile literal.
- Compare `types.ts` with the brief's block; every unchanged type is byte-identical to `main`.
- `git diff origin/main -- packages/assembly/src/index.ts`: exactly the six helper types added to the type export
  list; the A6 promote delta (or `foundation:check` output) lists no other added name.
- `rg -n "[A-Za-z_$][A-Za-z0-9_$]*V[0-9]+\b" packages/assembly packages/conformance` returns nothing new.
- One-time check (not a committed test): build a module against the 0.3.0 `.d.ts` (sketch `emitted-0.3.0-*.d.ts.txt`)
  and prepare it in a 0.4.0 Host as in `host-prebuilt.ts.txt`; both compilers exit 0.
- Mutation spot-checks (local, then revert), each must fail `pnpm assembly:test` or `pnpm conformance:check`:
  1. `ValuesAll`: distribute over values (`ValueAt<C, K> extends unknown ? ...`) - the union-valued contract fixture fails;
  2. `CapabilitiesOf`: drop the `Earlier` keys (use only the descriptor's revision) - the r3-consumer-in-r5-Host
     positive fails;
  3. `FactoryCapabilities`: use only the provider's current revision - the "must implement the r3-only member"
     directive becomes unused;
  4. `defineContract`: allow `compatibleFrom > revision` - builder test fails;
  5. `suite.ts`: `contract.revision < revision` instead of `<=` - the r5 suite on the 3..5 provider fails;
  6. `snapshot.ts`: accept `schemaVersion: 1` - the refusal test fails;
  7. remove `"0.4.0"` from `ASSEMBLY_PAIR_DECISIONS` - `pnpm governance:test` fails.
