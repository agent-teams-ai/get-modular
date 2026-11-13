import type { CreatedEntry, FactoryContext } from "./types.js";
import type { Wiring, WiringMetadata } from "./wiring-types.js";

export type ExecutableFactory = (dependencies: Readonly<Record<string, unknown>>, context: FactoryContext) => unknown;
export type Metadata<F = ExecutableFactory> = WiringMetadata<F>;
export type Program<F = ExecutableFactory> = Wiring<F>;
export type CommitCreated = (created: CreatedEntry[], entry: CreatedEntry) => void;
export type ConstructionPorts = {
  readonly compileComposition: typeof import("@get-modular/core").compileComposition;
  readonly commitCreated?: CommitCreated;
};
export function appendCreated(created: CreatedEntry[], entry: CreatedEntry): void {
  created.push(entry);
}
