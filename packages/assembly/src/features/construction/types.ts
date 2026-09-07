import type { CompileCompositionResult, CompositionPlan, Diagnostic, ModuleDeclaration, PlanDigest } from "@get-modular/core";

export type CapabilityContract<Value, Token extends string> = {
  readonly value: Value;
  readonly compatibility: { readonly family: "exact"; readonly familyVersion: 1; readonly token: Token; };
};
export type CapabilitySchema<C> = { readonly [K in keyof C]: CapabilityContract<unknown, string> };
type ValueOf<C, K> = K extends keyof C ? C[K] extends { readonly value: infer V } ? V : never : never;
type CompatibilityOf<C, K> = K extends keyof C ? C[K] extends { readonly compatibility: infer T } ? T : never : never;

declare const scope: unique symbol;
declare const detail: unique symbol;
export type FactoryHandle<C, D extends ModuleDeclaration = ModuleDeclaration, I = unknown> = {
  readonly [scope]: (capabilities: C) => C;
  readonly [detail]: { readonly declaration: D; readonly instance: I };
};
export type AnyFactoryHandle<C> = FactoryHandle<C, ModuleDeclaration, unknown>;
export type RootHandles<C> = Readonly<Record<string, AnyFactoryHandle<C>>>;
export type RootInstances<R> = {
  readonly [K in keyof R]: R[K] extends FactoryHandle<infer _C, infer _D, infer I> ? I : never;
};

type IsUnion<T, Whole = T> = T extends Whole ? [Whole] extends [T] ? false : true : never;
type InvalidMember<C, P> = P extends { readonly capabilityId: infer K extends string; readonly compatibility: infer T }
  ? string extends K ? P
    : K extends keyof C ? [T, CompatibilityOf<C, K>] extends [CompatibilityOf<C, K>, T] ? never : P : P
  : P;
type InvalidSlot<S> = S extends { readonly slotId: infer K extends string; readonly cardinality: { readonly kind: infer Q } }
  ? string extends K ? S : true extends IsUnion<Q> ? S : never : S;
export type ValidDeclaration<C, D extends ModuleDeclaration> =
  number extends D["provides"]["length"] | D["slots"]["length"] ? never
    : [InvalidMember<C, D["provides"][number] | D["slots"][number]> | InvalidSlot<D["slots"][number]>] extends [never] ? unknown : never;
export type FactoryCapabilities<C, D extends ModuleDeclaration> = {
  readonly [P in D["provides"][number] as P["capabilityId"]]: ValueOf<C, P["capabilityId"]>;
};
export type FactoryDependencies<C, D extends ModuleDeclaration> = {
  readonly [S in D["slots"][number] as S["slotId"]]: S["cardinality"]["kind"] extends "many"
    ? readonly ValueOf<C, S["capabilityId"]>[]
    : S["cardinality"]["kind"] extends "optional" ? ValueOf<C, S["capabilityId"]> | undefined : ValueOf<C, S["capabilityId"]>;
};
export type FactoryContext = { readonly signal: AbortSignal };
export type FactoryProduct<I, P> = { readonly instance: I; readonly capabilities: P };

export type SuccessfulComposition = Extract<CompileCompositionResult, { readonly plan: CompositionPlan; readonly digest: PlanDigest }>;
export type AssemblyPrepareInput<C, R extends RootHandles<C>> = {
  readonly composition: SuccessfulComposition;
  readonly factories: readonly AnyFactoryHandle<C>[];
  readonly roots: R;
};
export type RunOptions = { readonly signal?: AbortSignal };
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
  | "assembly.run.factory-rejected" | "assembly.run.invalid-product" | "assembly.run.internal";
export type AssemblyOutcome<R> =
  | { readonly status: "succeeded"; readonly roots: RootInstances<R>; readonly created: readonly CreatedEntry[] }
  | { readonly status: "cancelled"; readonly reason: unknown; readonly created: readonly CreatedEntry[] }
  | {
    readonly status: "failed";
    readonly phase: "factory" | "completion" | "internal";
    readonly code: RunErrorCode;
    readonly implementationId: string | undefined;
    readonly cause: unknown;
    readonly created: readonly CreatedEntry[];
    readonly returned: ReturnedProduct | undefined;
    readonly cancellation: ObservedCancellation | undefined;
  };
export type PreparedAssembly<R> = {
  readonly run: (options?: RunOptions) => Promise<AssemblyOutcome<R>>;
};
export type PreparationErrorCode =
  | "assembly.prepare.invalid-input" | "assembly.prepare.limit"
  | "assembly.prepare.handles" | "assembly.prepare.roots"
  | "assembly.prepare.core-rejected" | "assembly.prepare.plan-mismatch";
export type AssemblyPreparationResult<R> =
  | { readonly status: "prepared"; readonly prepared: PreparedAssembly<R> }
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
  readonly prepare: <const R extends RootHandles<C>>(input: AssemblyPrepareInput<C, R>) =>
    Promise<AssemblyPreparationResult<R>>;
};
