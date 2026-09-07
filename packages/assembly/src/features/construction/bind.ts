import type { ModuleDeclaration } from "@get-modular/core";
import type { Assembly, BindingErrorCode, FactoryCapabilities, FactoryContext, FactoryDependencies, FactoryHandle, FactoryProduct } from "./types.js";
import type { ExecutableFactory, Metadata } from "./ports.js";
import { SnapshotFault, snapshotDeclaration } from "./snapshot.js";

const metadata = new WeakMap<object, Metadata>();
export class AssemblyBindingError extends Error {
  readonly code: BindingErrorCode;
  constructor(code: BindingErrorCode, cause: unknown) {
    super(code, { cause });
    this.name = "AssemblyBindingError";
    this.code = code;
  }
}
export function metadataFor(value: unknown): Metadata | undefined {
  return value !== null && typeof value === "object" ? metadata.get(value) : undefined;
}
export function bindFactoryFor<C>(): Assembly<C>["bindFactory"] {
  return function bindFactory<const D extends ModuleDeclaration, I>(
    declaration: D,
    factory: (dependencies: FactoryDependencies<C, NoInfer<D>>, context: FactoryContext) => Promise<FactoryProduct<I, FactoryCapabilities<C, NoInfer<D>>>>,
  ): FactoryHandle<C, D, I> {
    if (typeof factory !== "function") throw new AssemblyBindingError("assembly.bind.invalid-factory", new TypeError("Expected a factory function"));
    let captured: ModuleDeclaration;
    try {
      captured = snapshotDeclaration(declaration);
    } catch (cause) {
      throw new AssemblyBindingError(cause instanceof SnapshotFault && cause.kind === "limit" ? "assembly.bind.limit" : "assembly.bind.invalid-declaration", cause);
    }
    const handle: object = Object.freeze(Object.create(null) as object);
    metadata.set(handle, Object.freeze({ declaration: captured, factory: factory as unknown as ExecutableFactory }));
    return handle as FactoryHandle<C, D, I>;
  };
}
