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
function captureDeclaration(declaration: unknown): ModuleDeclaration {
  try {
    return snapshotDeclaration(declaration);
  } catch (cause) {
    throw new AssemblyBindingError(cause instanceof SnapshotFault && cause.kind === "limit" ? "assembly.bind.limit" : "assembly.bind.invalid-declaration", cause);
  }
}
function sealedHandle(): object {
  const handle: object = {};
  Object.setPrototypeOf(handle, null);
  return Object.freeze(handle);
}
// A run supplies every input before its first factory, so this is never reached.
const inputFactory: ExecutableFactory = () => { throw new Error("assembly.internal.input-invoked"); };
export function bindInputFor<C>(): Assembly<C>["bindInput"] {
  // The public signature is Assembly<C>["bindInput"]; the handle type is a type-level brand only.
  return function bindInput(declaration: ModuleDeclaration): never {
    const captured = captureDeclaration(declaration);
    if (captured.slots.length > 0) {
      throw new AssemblyBindingError("assembly.bind.invalid-declaration", new TypeError("An input declares no slots"));
    }
    const handle = sealedHandle();
    metadata.set(handle, Object.freeze({ declaration: captured, factory: inputFactory, input: true as const }));
    return handle as never;
  };
}
export function bindFactoryFor<C>(): Assembly<C>["bindFactory"] {
  return function bindFactory<const D extends ModuleDeclaration, I>(
    declaration: D,
    factory: (dependencies: FactoryDependencies<C, NoInfer<D>>, context: FactoryContext) => Promise<FactoryProduct<I, FactoryCapabilities<C, NoInfer<D>>>>,
  ): FactoryHandle<C, D, I> {
    if (typeof factory !== "function") {throw new AssemblyBindingError("assembly.bind.invalid-factory", new TypeError("Expected a factory function"));}
    const captured = captureDeclaration(declaration);
    const handle = sealedHandle();
    const executable: ExecutableFactory = function forwardFactory(this: unknown, dependencies, context) {
      return Reflect.apply(factory, this, [dependencies, context]);
    };
    metadata.set(handle, Object.freeze({ declaration: captured, factory: executable }));
    return handle as FactoryHandle<C, D, I>;
  };
}
