import type { CompileCompositionResult, CompositionPlan, Diagnostic, ModuleDeclaration, PlanDigest } from "@get-modular/core";

export type CapabilityContract<Value, Token extends string> = {
  readonly value: Value;
  readonly compatibility: { readonly family: "exact"; readonly familyVersion: 1; readonly token: Token; };
};
export type CapabilitySchema<C> = { readonly [K in keyof C]: CapabilityContract<unknown, string> };

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
