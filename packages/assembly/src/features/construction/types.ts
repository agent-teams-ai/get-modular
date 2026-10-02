import type { CompileCompositionResult, CompositionPlan, Diagnostic, ModuleDeclaration, PlanDigest } from "@get-modular/core";

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
  readonly [Id in T["id"]]: T extends { readonly id: Id; readonly revision: infer Rev extends number; readonly [contractValue]?: infer V }
    ? CapabilityContract<V, `${Id}/r${Rev}`> : never;
};
/** What a module author writes: identities, owner and descriptor entries, never wire discriminators. */
export type DeclarationSpec = {
  readonly moduleId: string;
  readonly implementationId: string;
  readonly owner: ModuleDeclaration["owner"];
  readonly provides: readonly ProvidedEntry<string, number>[];
  readonly slots: readonly SlotEntry<string, number, string, Cardinality>[];
  /** `declareModule` supplies the wire discriminators; a spec never carries them. */
  readonly kind?: never;
  readonly schemaVersion?: never;
};
/** A module declaration in the current wire generation, produced by `declareModule`. */
export type Declared<T extends DeclarationSpec> = T & {
  readonly kind: "get-modular.module-declaration";
  readonly schemaVersion: 1;
};

// Handles (ADR-0032): invariant only in the capabilities a declaration uses.
/** The capability map keys a declaration provides or consumes; a handle brand is keyed by them. */
export type UsedCapability<D extends ModuleDeclaration> =
  D["provides"][number]["capabilityId"] | D["slots"][number]["capabilityId"];
/** A handle brand over the used keys `K` of a map `C`, named so handles using the same keys share one instantiation. */
export type CapabilityBrand<C, K extends keyof C> = { readonly [P in K]: (capability: C[P]) => C[P] };
/** A bound module, invariant only in the contracts of the capabilities its declaration uses. */
export type FactoryHandle<C, D extends ModuleDeclaration = ModuleDeclaration, I = unknown> = {
  readonly [uses]: CapabilityBrand<C, UsedCapability<D> & keyof C>;
  readonly [detail]: { readonly declaration: D; readonly instance: I };
};
/**
 * A factory handle that a map `C` accepts as a factory or a root: every used capability that `C` contains has
 * the identical contract in `C`. An input handle never is one.
 */
export type AnyFactoryHandle<C> = {
  readonly [uses]: { readonly [K in keyof C]?: (capability: C[K]) => C[K] };
  readonly [detail]: { readonly declaration: ModuleDeclaration; readonly instance: unknown };
  readonly [input]?: never;
};
export type RootHandles<C> = Readonly<Record<string, AnyFactoryHandle<C>>>;
export type RootInstances<R> = {
  readonly [K in keyof R]: R[K] extends { readonly [detail]: { readonly instance: infer I } } ? I : never;
};

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

/** A slot-free module whose capability record each run supplies instead of a factory. */
export type InputHandle<C, D extends ModuleDeclaration = ModuleDeclaration> =
  FactoryHandle<C, D, FactoryCapabilities<C, D>> & { readonly [input]: true };
/** An input handle that a map `C` accepts, compared like `AnyFactoryHandle`. */
export type AnyInputHandle<C> = {
  readonly [uses]: { readonly [K in keyof C]?: (capability: C[K]) => C[K] };
  readonly [detail]: { readonly declaration: ModuleDeclaration; readonly instance: unknown };
  readonly [input]: true;
};
export type InputHandles<C> = Readonly<Record<string, AnyInputHandle<C>>>;
/** The capability record a run supplies for every declared input alias. */
export type RunInputs<N> = {
  readonly [K in keyof N]: N[K] extends { readonly [detail]: { readonly instance: infer I } } ? I : never;
};

export type SuccessfulComposition = Extract<CompileCompositionResult, { readonly plan: CompositionPlan; readonly digest: PlanDigest }>;
/**
 * Every capability any factory or input handle uses must be part of the preparing map `C`. Handles passed as a
 * literal array keep their used capabilities; an array typed as `AnyFactoryHandle<C>[]` beforehand does not.
 */
export type KnownCapabilities<C, F extends readonly unknown[], N> = [Exclude<
  (F[number] | N[keyof N]) extends infer H ? H extends { readonly [uses]: infer U } ? keyof U : never : never,
  keyof C>] extends [infer Missing]
  ? [Missing] extends [never] ? unknown : { readonly "capabilities missing from the preparing map": Missing }
  : never;
export type AssemblyPrepareInput<C, R extends RootHandles<C>, N extends InputHandles<C> = {},
  F extends readonly AnyFactoryHandle<C>[] = readonly AnyFactoryHandle<C>[]> = {
  readonly composition: SuccessfulComposition;
  readonly factories: F & KnownCapabilities<C, F, N>;
  readonly roots: R;
  readonly inputs?: N | undefined;
};
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
  | "assembly.prepare.core-rejected" | "assembly.prepare.plan-mismatch" | "assembly.prepare.input-handles";
export type AssemblyPreparationResult<R, N = {}> =
  | { readonly status: "prepared"; readonly prepared: PreparedAssembly<R, N> }
  | {
    readonly status: "failed";
    readonly error: { readonly code: PreparationErrorCode; readonly cause: unknown };
    readonly diagnostics: readonly Diagnostic[];
  };
export type BindingErrorCode = "assembly.bind.invalid-declaration" | "assembly.bind.limit" | "assembly.bind.invalid-factory";
export type Assembly<C> = {
  readonly bindFactory: <const D extends ModuleDeclaration, I>(
    declaration: D & ValidDeclaration<C, NoInfer<D>>,
    factory: (dependencies: FactoryDependencies<C, NoInfer<D>>, context: FactoryContext) => Promise<FactoryProduct<I, FactoryCapabilities<C, NoInfer<D>>>>,
  ) => FactoryHandle<C, D, I>;
  readonly bindInput: <const D extends ModuleDeclaration & { readonly slots: readonly [] }>(
    declaration: D & ValidDeclaration<C, NoInfer<D>>,
  ) => InputHandle<C, D>;
  readonly prepare: <const R extends RootHandles<C>, const N extends InputHandles<C> = {},
    const F extends readonly AnyFactoryHandle<C>[] = readonly AnyFactoryHandle<C>[]>(
    input: AssemblyPrepareInput<C, R, N, F>,
  ) => Promise<AssemblyPreparationResult<R, N>>;
};
