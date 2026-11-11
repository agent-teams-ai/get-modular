import type { CompositionProfile, ModuleDeclaration } from "@get-modular/core";
import type {
  AssemblyPreparationResult, CapabilityBrand, FactoryCapabilities, FactoryDependencies, FactoryProduct,
  FamilyEntriesOf, FamilyEntry, FamilyGroup, InputEntries, RunInputs, SuccessfulComposition,
  TupleOnly, UsedCapability, UsedKeysOf, UsedMap,
} from "@get-modular/assembly";
import type { Context, Effect, Layer, Scope } from "effect";
import type { InvalidInputs } from "./inputs.js";

declare const uses: unique symbol;
declare const detail: unique symbol;

/** Erased callable view; native factories receive their exact slots at `implement`. */
export type EffectEntryFactory = (dependencies: never) => Effect.Effect<unknown, unknown, unknown>;
export type EffectModuleFactory<C, D extends ModuleDeclaration, I, E = never, R = never> =
  (dependencies: FactoryDependencies<C, D>) => Effect.Effect<FactoryProduct<I, FactoryCapabilities<C, D>>, E, R>;

/** An authenticated native entry, invariant in exactly the capability contracts it uses. */
export type EffectModuleEntry<C, D extends ModuleDeclaration = ModuleDeclaration, I = unknown, E = never, R = never> =
  FamilyEntry<D, EffectEntryFactory> & {
    readonly [uses]: CapabilityBrand<C, UsedCapability<D> & keyof C>;
    readonly [detail]: {
      readonly instance: I;
      readonly error: E;
      readonly requirements: R;
      readonly used: UsedMap<C, UsedCapability<D> & keyof C>;
    };
  };

export type AnyEffectModuleEntry<C> = FamilyEntry<ModuleDeclaration, EffectEntryFactory> & {
  readonly [uses]: { readonly [K in keyof C]?: (capability: C[K]) => C[K] };
  readonly [detail]: { readonly instance: unknown; readonly error: unknown; readonly requirements: unknown; readonly used: unknown };
};
export type EffectModuleGroup<E = AnyEffectModuleEntry<unknown>> = FamilyGroup<E>;
export type EffectModuleItem<C> = AnyEffectModuleEntry<C> | EffectModuleGroup<AnyEffectModuleEntry<C>>;
export type EffectRootEntries<C> = Readonly<Record<string, AnyEffectModuleEntry<C>>>;
export type EffectRootInstances<R> = {
  readonly [K in keyof R]: R[K] extends { readonly [detail]: { readonly instance: infer I } } ? I : never;
};
export type EffectErrorsOf<E> = E extends { readonly [detail]: { readonly error: infer Error } } ? Error : never;
export type EffectRequirementsOf<E> = E extends { readonly [detail]: { readonly requirements: infer R } } ? R : never;
type UsedKeys<E> = E extends { readonly [detail]: { readonly used: infer U } } ? keyof U : never;
type KnownCapabilities<C, M extends readonly unknown[], N> = [Exclude<
  UsedKeys<FamilyEntriesOf<M[number]>> | UsedKeysOf<N[keyof N]>, keyof C
>] extends [never] ? unknown : never;

/** Select the typed inventory before preparation; optional and many bindings remain explicit. */
export type EffectAssemblyPrepareInput<C, R extends EffectRootEntries<C>, N extends InputEntries<C> = {},
  M extends readonly EffectModuleItem<C>[] = readonly EffectModuleItem<C>[]> = {
    readonly modules: M & KnownCapabilities<C, M, N>;
    readonly roots: R;
    readonly inputs?: N | undefined;
  } & (
    | { readonly composition: SuccessfulComposition; readonly profileId?: never; readonly bindings?: never }
    | { readonly profileId: string; readonly bindings?: CompositionProfile["bindings"]; readonly composition?: never;
        readonly modules: TupleOnly<M> }
  );

export type EffectLayerOptions<N = {}> = { readonly inputs?: RunInputs<N> | undefined };
/** Native construction only: the caller owns using the roots within their resource lifetime. */
export type PreparedEffectAssembly<Roots, E, R, N = {}> = {
  // Context.Key is covariant: the produced roots must satisfy its inferred shape.
  readonly layer: <Id, S>(roots: Context.Key<Id, S> & ([Roots] extends [NoInfer<S>] ? unknown : never), ...options: {} extends N
    ? [options?: EffectLayerOptions<N>]
    : [options: EffectLayerOptions<N> & { readonly inputs: RunInputs<N> }]
  ) => Layer.Layer<Id, E | InvalidInputs, Exclude<R, Scope.Scope>>;
};
export type EffectAssemblyPreparationResult<Roots, E, R, N = {}> =
  | { readonly status: "prepared"; readonly prepared: PreparedEffectAssembly<Roots, E, R, N>; readonly composition: SuccessfulComposition }
  | Extract<AssemblyPreparationResult<never>, { readonly status: "failed" }>;

export type EffectAssembly<C> = {
  readonly prepare: <const R extends EffectRootEntries<C>, const N extends InputEntries<C> = {},
    const M extends readonly EffectModuleItem<C>[] = readonly EffectModuleItem<C>[]>(
    input: EffectAssemblyPrepareInput<C, R, N, M>,
  ) => Promise<EffectAssemblyPreparationResult<EffectRootInstances<R>,
    EffectErrorsOf<FamilyEntriesOf<M[number]>>, EffectRequirementsOf<FamilyEntriesOf<M[number]>>, N>>;
};
