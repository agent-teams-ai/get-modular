import type { ModuleDeclaration } from "@get-modular/core";
import type { CreatedEntry, FactoryContext } from "./types.js";

export type ExecutableFactory = (dependencies: Readonly<Record<string, unknown>>, context: FactoryContext) => unknown;
export type Metadata = { readonly declaration: ModuleDeclaration; readonly factory: ExecutableFactory };
export type Injection = {
  readonly slotId: string;
  readonly capabilityId: string;
  readonly kind: "required" | "optional" | "many";
  readonly providers: readonly string[];
};
export type Step = { readonly metadata: Metadata; readonly injections: readonly Injection[] };
export type Program = {
  readonly steps: readonly Step[];
  readonly roots: readonly { readonly alias: string; readonly implementationId: string }[];
};
export type CommitCreated = (created: CreatedEntry[], entry: CreatedEntry) => void;
export type ConstructionPorts = {
  readonly compileComposition: typeof import("@get-modular/core").compileComposition;
  readonly commitCreated?: CommitCreated;
};
export function appendCreated(created: CreatedEntry[], entry: CreatedEntry): void {
  created.push(entry);
}
