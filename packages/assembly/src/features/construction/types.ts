import type { CompileCompositionResult, CompositionPlan, CompositionProfile, Diagnostic, ModuleDeclaration, PlanDigest } from "@get-modular/core";

export type CapabilityContract<Value, Token extends string> = {
  readonly value: Value;
  readonly compatibility: { readonly family: "exact"; readonly familyVersion: 1; readonly token: Token; };
};
export type CapabilitySchema<C> = { readonly [K in keyof C]: CapabilityContract<unknown, string> };

declare const uses: unique symbol;
declare const detail: unique symbol;
declare const input: unique symbol;
declare const contractEntry: unique symbol;
declare const contractValue: unique symbol;

// Authoring builder (ADR-0032). Only `contract.ts` spells the wire generation; these types keep
// their arity when the next generation adds revision windows.
export type Cardinality = ModuleDeclaration["slots"][number]["cardinality"];
/** A provided capability entry; only a contract descriptor produces it. */
export type ProvidedEntry<Id extends string, Rev extends number> = {
  readonly capabilityId: Id;
  readonly compatibility: { readonly family: "exact"; readonly familyVersion: 1; readonly token: `${Id}/r${Rev}` };
  /** Type-only: the entry comes from a contract descriptor, never from a hand-written record. */
  readonly [contractEntry]: true;
};
/** A dependency slot entry; only a contract descriptor produces it. */
export type SlotEntry<Id extends string, Rev extends number, S extends string, K extends Cardinality> = {
  readonly slotId: S;
  readonly capabilityId: Id;
  readonly compatibility: { readonly family: "exact"; readonly familyVersion: 1; readonly token: `${Id}/r${Rev}` };
  readonly cardinality: K;
  /** Type-only: the entry comes from a contract descriptor, never from a hand-written record. */
  readonly [contractEntry]: true;
};
/** One descriptor per capability, owned by the contract owner and created by `defineContract`. */
export type Contract<Id extends string, V, Rev extends number> = {
  readonly id: Id;
  readonly revision: Rev;
  readonly provide: () => ProvidedEntry<Id, Rev>;
  readonly slot: <const S extends string, const K extends Cardinality>(slotId: S, cardinality: K) => SlotEntry<Id, Rev, S, K>;
  /** Type-only: the capability value at this revision. */
  readonly [contractValue]?: V;
};
export type AnyContract = Contract<string, unknown, number>;
/**
 * The capability map of a module, a team fragment or a Host, derived from contract descriptors.
 * Name a map over many descriptors as an interface: `interface Host extends CapabilitiesOf<typeof A | typeof B> {}`.
 */
export type CapabilitiesOf<T extends AnyContract> = {
  readonly [X in T as X["id"]]: X extends { readonly id: infer Id extends string; readonly revision: infer Rev extends number; readonly [contractValue]?: infer V }
    ? CapabilityContract<V, `${Id}/r${Rev}`> : never;
};
/** What a module author writes: identities, owner and descriptor entries, never wire discriminators. */
export type DeclarationSpec = {
  readonly moduleId: string;
  readonly implementationId: string;
  readonly owner: ModuleDeclaration["owner"];
  readonly provides: readonly ProvidedEntry<string, number>[];
  readonly slots: readonly SlotEntry<string, number, string, Cardinality>[];
};
/** A module declaration in the current wire generation, produced by `declareModule`. */
export type Declared<T extends DeclarationSpec> = T & {
  readonly kind: "get-modular.module-declaration";
  readonly schemaVersion: 1;
};

// Entries (ADR-0036 prototype): invariant only in the capabilities a declaration uses.
/** The capability map keys a declaration provides or consumes; an entry brand is keyed by them. */
export type UsedCapability<D extends ModuleDeclaration> =
  D["provides"][number]["capabilityId"] | D["slots"][number]["capabilityId"];
/** An entry brand over the used keys `K` of a map `C`, named so entries using the same keys share one instantiation. */
export type CapabilityBrand<C, K extends keyof C> = { readonly [P in K]: (capability: C[P]) => C[P] };
/** The used part of a map, covariant; `isolate` reads dependency and capability types from it. */
export type UsedMap<C, K extends keyof C> = { readonly [P in K]: C[P] };
/** The factory an entry holds, after its adapter; dependencies are typed at `implement`. */
export type EntryFactory = (dependencies: never, context: FactoryContext) => Promise<unknown>;
/** A module entry: frozen `{ declaration, factory }`, invariant only in the contracts its declaration uses. */
export type ModuleEntry<C, D extends ModuleDeclaration = ModuleDeclaration, I = unknown> = {
  readonly [uses]: CapabilityBrand<C, UsedCapability<D> & keyof C>;
  readonly [detail]: { readonly declaration: D; readonly instance: I; readonly used: UsedMap<C, UsedCapability<D> & keyof C> };
  readonly declaration: D;
  readonly factory: EntryFactory;
};
/** An entry that a map `C` accepts as a module or a root: every used capability that `C` contains has the identical contract. */
export type AnyModuleEntry<C> = {
  readonly [uses]: { readonly [K in keyof C]?: (capability: C[K]) => C[K] };
  readonly [detail]: { readonly declaration: ModuleDeclaration; readonly instance: unknown };
  readonly declaration: ModuleDeclaration;
  readonly factory: EntryFactory;
  readonly [input]?: never;
};
/** Map-free view of any module entry, for `group`. */
export type AnyEntry = {
  readonly declaration: ModuleDeclaration;
  readonly factory: EntryFactory;
};
declare const groupEntries: unique symbol;
declare const groupUses: unique symbol;
/**
 * A static list of entries and groups; `name` is a navigation label. `E` is the union of the entries below it,
 * `K` the union of the capability keys they use.
 */
export type ModuleGroup<E = AnyEntry, K = unknown> = {
  readonly name: string;
  readonly members: readonly (AnyEntry | ModuleGroup)[];
  readonly [groupEntries]?: E;
  readonly [groupUses]?: K;
};
export type UsedKeysOf<M> = M extends { readonly [uses]: infer U } ? keyof U
  : M extends { readonly [groupUses]?: infer K } ? K : never;
export type EntriesOf<M> = M extends ModuleGroup<infer E> ? E : M;
export type RootEntries<C> = Readonly<Record<string, AnyModuleEntry<C>>>;
export type RootInstances<R> = {
  readonly [K in keyof R]: R[K] extends { readonly [detail]: { readonly instance: infer I } } ? I : never;
};
/** The instance, dependencies and capabilities of an entry, for `isolate`. */
export type InstanceOf<E> = E extends { readonly [detail]: { readonly instance: infer I } } ? I : never;
export type DependenciesOf<E> = E extends { readonly [detail]: { readonly declaration: infer D extends ModuleDeclaration; readonly used: infer U } }
  ? FactoryDependencies<U, D> : never;
export type CapabilitiesProvidedBy<E> = E extends { readonly [detail]: { readonly declaration: infer D extends ModuleDeclaration; readonly used: infer U } }
  ? FactoryCapabilities<U, D> : never;

export type IsUnion<T, Whole = T> = T extends Whole ? [Whole] extends [T] ? false : true : never;
export type ValidDeclaration<C, D extends ModuleDeclaration> =
  true extends IsUnion<D> | IsUnion<D["slots"]> | IsUnion<D["provides"]>
    | (D["slots"] extends infer Slots extends readonly unknown[]
      ? { [K in keyof Slots]: IsUnion<Slots[K]> }[number]
      : never)
    | (D["provides"] extends infer Provides extends readonly unknown[]
      ? { [K in keyof Provides]: IsUnion<Provides[K]> }[number]
      : never) ? never :
  number extends D["provides"]["length"] | D["slots"]["length"] ? never
    : [(
      D["provides"][number] | D["slots"][number] extends infer P
        ? P extends { readonly capabilityId: infer K extends string; readonly compatibility: infer T }
          ? string extends K ? P
            : true extends IsUnion<K> ? P
            : K extends keyof C
              ? [T, (K extends keyof C ? C[K] extends { readonly compatibility: infer Compat } ? Compat : never : never)] extends
                [(K extends keyof C ? C[K] extends { readonly compatibility: infer Compat } ? Compat : never : never), T]
                ? never : P
              : P
          : P
        : never
    ) | (
      D["slots"][number] extends infer S
        ? S extends { readonly slotId: infer K extends string; readonly cardinality: { readonly kind: infer Q } }
          ? string extends K ? S : true extends IsUnion<K> | IsUnion<Q> ? S : never
          : S
        : never
    )] extends [never] ? unknown : never;
export type FactoryCapabilities<C, D extends ModuleDeclaration> = {
  readonly [P in D["provides"][number] as P["capabilityId"]]: P["capabilityId"] extends keyof C
    ? C[P["capabilityId"]] extends { readonly value: infer V } ? V : never
    : never;
};
export type FactoryDependencies<C, D extends ModuleDeclaration> = {
  readonly [S in D["slots"][number] as S["slotId"]]: S["cardinality"]["kind"] extends "many"
    ? readonly (S["capabilityId"] extends keyof C
      ? C[S["capabilityId"]] extends { readonly value: infer V } ? V : never
      : never)[]
    : S["cardinality"]["kind"] extends "optional"
      ? (S["capabilityId"] extends keyof C
        ? C[S["capabilityId"]] extends { readonly value: infer V } ? V : never
        : never) | undefined
      : S["capabilityId"] extends keyof C
        ? C[S["capabilityId"]] extends { readonly value: infer V } ? V : never
        : never;
};
/** Lifetime only. `scope` is the opaque value passed to `run()`: Assembly never reads, awaits, freezes or disposes it. */
export type FactoryContext = { readonly signal: AbortSignal; readonly scope: unknown };
export type FactoryProduct<I, P> = { readonly instance: I; readonly capabilities: P };
/**
 * The factory type of a module package. `C` is the module's own map, for example
 * `CapabilitiesOf<typeof Db | typeof Orders>`, never the Host's; `X` is the context the factory reads.
 */
export type ModuleFactory<C, D extends ModuleDeclaration, I, X = FactoryContext> =
  (dependencies: FactoryDependencies<C, D>, context: X) => Promise<FactoryProduct<I, FactoryCapabilities<C, D>>>;

/** A slot-free module whose capability record each run supplies instead of a factory: `{ declaration }`. */
export type InputEntry<C, D extends ModuleDeclaration = ModuleDeclaration> = {
  readonly [uses]: CapabilityBrand<C, UsedCapability<D> & keyof C>;
  readonly [detail]: { readonly declaration: D; readonly instance: FactoryCapabilities<C, D> };
  readonly declaration: D;
  readonly [input]: true;
};
/** An input entry that a map `C` accepts. */
export type AnyInputEntry<C> = {
  readonly [uses]: { readonly [K in keyof C]?: (capability: C[K]) => C[K] };
  readonly [detail]: { readonly declaration: ModuleDeclaration; readonly instance: unknown };
  readonly declaration: ModuleDeclaration;
  readonly [input]: true;
};
export type InputEntries<C> = Readonly<Record<string, AnyInputEntry<C>>>;
/** The capability record a run supplies for every declared input alias. */
export type RunInputs<N> = {
  readonly [K in keyof N]: N[K] extends { readonly [detail]: { readonly instance: infer I } } ? I : never;
};

export type SuccessfulComposition = Extract<CompileCompositionResult, { readonly plan: CompositionPlan; readonly digest: PlanDigest }>;
/**
 * Every capability any factory or input entry uses must be part of the preparing map `C`. Entries passed as a
 * literal array keep their used capabilities; an array typed as `AnyModuleEntry<C>[]` beforehand does not.
 */
export type KnownCapabilities<C, F extends readonly unknown[], N> = [Exclude<
  (F[number] | N[keyof N]) extends infer H ? H extends { readonly [uses]: infer U } ? keyof U : never : never,
  keyof C>] extends [infer Missing]
  ? [Missing] extends [never] ? unknown : { readonly "capabilities missing from the preparing map": Missing }
  : never;
/** The members of `modules`: entries and groups of entries. */
export type ModuleItem<C> = AnyModuleEntry<C> | ModuleGroup<AnyModuleEntry<C>, keyof C>;
export type KnownModules<C, M extends readonly unknown[], N> = [Exclude<
  UsedKeysOf<M[number]> | (N[keyof N] extends infer H ? H extends { readonly [uses]: infer U } ? keyof U : never : never),
  keyof C>] extends [infer Missing]
  ? [Missing] extends [never] ? unknown : { readonly "capabilities missing from the preparing map": Missing }
  : never;
/** The `profileId` form accepts a tuple only, so an annotated array cannot lose the per-entry map check. */
export type TupleOnly<M extends readonly unknown[]> = number extends M["length"] ? never : unknown;
/**
 * Either a compiled `composition`, or a `profileId` from which Assembly completes the profile out of the
 * entries in `modules` (ADR-0035) with optional explicit `bindings` rows.
 */
export type AssemblyPrepareInput<C, R extends RootEntries<C>, N extends InputEntries<C> = {},
  M extends readonly ModuleItem<C>[] = readonly ModuleItem<C>[]> = {
  readonly modules: M & KnownModules<C, M, N>;
  readonly roots: R;
  readonly inputs?: N | undefined;
} & (
  | { readonly composition: SuccessfulComposition; readonly profileId?: never; readonly bindings?: never }
  | { readonly profileId: string; readonly bindings?: CompositionProfile["bindings"]; readonly composition?: never;
      readonly modules: TupleOnly<M> }
);
export type RunOptions<N = {}> = {
  readonly signal?: AbortSignal | undefined;
  readonly scope?: unknown;
  readonly inputs?: RunInputs<N> | undefined;
};
export type CreatedEntry = {
  readonly moduleId: string;
  readonly implementationId: string;
  readonly instance: unknown;
  readonly capabilities: Readonly<Record<string, unknown>>;
};
export type ReturnedProduct = { readonly implementationId: string; readonly product: unknown };
export type ObservedCancellation = { readonly reason: unknown };
export type RunErrorCode =
  | "assembly.run.factory-threw" | "assembly.run.unsupported-carrier"
  | "assembly.run.factory-rejected" | "assembly.run.invalid-product" | "assembly.run.internal"
  | "assembly.run.invalid-inputs";
export type AssemblyOutcome<R> =
  | { readonly status: "succeeded"; readonly roots: RootInstances<R>; readonly created: readonly CreatedEntry[] }
  | { readonly status: "cancelled"; readonly reason: unknown; readonly created: readonly CreatedEntry[] }
  | {
    readonly status: "failed";
    readonly phase: "inputs" | "factory" | "completion" | "internal";
    readonly code: RunErrorCode;
    readonly implementationId: string | undefined;
    readonly cause: unknown;
    readonly created: readonly CreatedEntry[];
    readonly returned: ReturnedProduct | undefined;
    readonly cancellation: ObservedCancellation | undefined;
  };
/** Options may be omitted unless the assembly declares inputs; then every run supplies them. */
export type PreparedAssembly<R, N = {}> = {
  readonly run: (...options: {} extends N
    ? [options?: RunOptions<N>]
    : [options: RunOptions<N> & { readonly inputs: RunInputs<N> }]) => Promise<AssemblyOutcome<R>>;
};
export type PreparationErrorCode =
  | "assembly.prepare.invalid-input" | "assembly.prepare.limit"
  | "assembly.prepare.handles" | "assembly.prepare.roots"
  | "assembly.prepare.core-rejected" | "assembly.prepare.plan-mismatch" | "assembly.prepare.input-handles"
  | "assembly.prepare.unresolved-binding" | "assembly.prepare.duplicate-module";
/** A slot without a row that completion would not guess; `error.cause` of `assembly.prepare.unresolved-binding` lists all of them. */
export type UnresolvedBinding = {
  readonly consumerImplementationId: string;
  readonly slotId: string;
  readonly capabilityId: string;
  readonly cardinality: "required" | "optional" | "many";
  /** Group names from `modules` down to the consumer; `[]` at top level. */
  readonly groupPath: readonly string[];
  /** Other bound handles that provide the capability id at any revision, by code point. */
  readonly candidates: readonly string[];
};
export type AssemblyPreparationResult<R, N = {}> =
  | { readonly status: "prepared"; readonly prepared: PreparedAssembly<R, N>; readonly composition: SuccessfulComposition }
  | {
    readonly status: "failed";
    readonly error: { readonly code: PreparationErrorCode; readonly cause: unknown };
    readonly diagnostics: readonly Diagnostic[];
  };
export type BindingErrorCode = "assembly.bind.invalid-declaration" | "assembly.bind.limit" | "assembly.bind.invalid-factory" | "assembly.bind.invalid-group";
/** Every occurrence of one implementation id: module group paths and input aliases are separate. */
export type DuplicateModule = {
  readonly implementationId: string;
  readonly paths: readonly (readonly string[])[];
  readonly inputs: readonly string[];
};
/** Adapts a factory written for another context `X` to one for `FactoryContext`; `scoped` of `@get-modular/resources` is the only admitted one. */
export type ContextAdapter<X> = <Deps, R>(name: string, factory: (dependencies: Deps, context: X) => R) =>
  (dependencies: Deps, context: FactoryContext) => R;
export type Assembly<C> = {
  readonly prepare: <const R extends RootEntries<C>, const N extends InputEntries<C> = {},
    const M extends readonly ModuleItem<C>[] = readonly ModuleItem<C>[]>(
    input: AssemblyPrepareInput<C, R, N, M>,
  ) => Promise<AssemblyPreparationResult<R, N>>;
};
