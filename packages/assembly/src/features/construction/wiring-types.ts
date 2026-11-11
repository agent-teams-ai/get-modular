import type { CompositionProfile, ModuleDeclaration } from "@get-modular/core";
import type { AnyInputEntry, AssemblyPreparationResult, SuccessfulComposition } from "./types.js";

declare const familyEntry: unique symbol;
declare const familyEntries: unique symbol;

/** An immutable captured executable, authenticated by its creating family. */
export type FamilyEntry<D extends ModuleDeclaration = ModuleDeclaration, F = unknown> = {
  readonly declaration: D;
  readonly factory: F;
  readonly [familyEntry]: true;
};
/** Static grouping preserves the concrete entry union; it never selects providers. */
export type FamilyGroup<E = FamilyEntry> = {
  readonly name: string;
  readonly members: readonly (E | FamilyGroup<E>)[];
  readonly [familyEntries]?: E;
};
export type FamilyEntriesOf<M> = M extends FamilyGroup<infer E> ? E : M;
export type FamilyItem<F> = FamilyEntry<ModuleDeclaration, F> | FamilyGroup<FamilyEntry<ModuleDeclaration, F>>;
export type WiringInputMetadata = { readonly declaration: ModuleDeclaration; readonly input: true; readonly factory?: never };
export type WiringMetadata<F> =
  | { readonly declaration: ModuleDeclaration; readonly factory: F; readonly input?: never }
  | WiringInputMetadata;
export type WiringInjection = {
  readonly slotId: string;
  readonly capabilityId: string;
  readonly kind: "required" | "optional" | "many";
  readonly providers: readonly string[];
};
/** Verified inert instructions. Resource and execution ownership belong to the consuming executor. */
export type Wiring<F> = {
  readonly steps: readonly { readonly metadata: WiringMetadata<F>; readonly injections: readonly WiringInjection[] }[];
  readonly roots: readonly { readonly alias: string; readonly implementationId: string }[];
  readonly inputs: readonly { readonly alias: string; readonly metadata: WiringInputMetadata }[];
};
export type WiringPrepareInput<F> = {
  readonly modules: readonly FamilyItem<F>[];
  readonly roots: Readonly<Record<string, FamilyEntry<ModuleDeclaration, F>>>;
  readonly inputs?: Readonly<Record<string, AnyInputEntry<unknown>>> | undefined;
} & (
  | { readonly composition: SuccessfulComposition; readonly profileId?: never; readonly bindings?: never }
  | { readonly profileId: string; readonly bindings?: CompositionProfile["bindings"]; readonly composition?: never }
);
export type WiringPreparationResult<F> =
  | { readonly status: "prepared"; readonly wiring: Wiring<F>; readonly composition: SuccessfulComposition }
  | Extract<AssemblyPreparationResult<never>, { readonly status: "failed" }>;
/** A capture/preparation boundary, without execution hooks or a backend registry. */
export type EntryFamily<F extends (...args: never[]) => unknown> = {
  readonly capture: <const D extends ModuleDeclaration, P extends F>(declaration: D, factory: P) => FamilyEntry<D, P>;
  readonly group: <const M extends readonly FamilyItem<F>[]>(name: string,
    members: M) => FamilyGroup<FamilyEntriesOf<M[number]>>;
  readonly entriesOf: <const M extends readonly FamilyItem<F>[]>(modules: M) => readonly FamilyEntriesOf<M[number]>[];
  readonly prepare: (input: WiringPrepareInput<F>) => Promise<WiringPreparationResult<F>>;
};
