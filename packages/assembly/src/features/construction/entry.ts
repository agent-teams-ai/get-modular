import type { ModuleDeclaration } from "@get-modular/core";
import type {
  BindingErrorCode, ContextAdapter, InputEntry, ModuleEntry, ModuleFactory, ValidDeclaration,
} from "./types.js";
import type { ExecutableFactory, Metadata } from "./ports.js";
import { SnapshotFault, snapshotDeclaration } from "./snapshot.js";

const metadata = new WeakMap<object, Metadata>();
const moduleEntries: WeakSet<object> = new WeakSet();
const inputEntries: WeakSet<object> = new WeakSet();
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
export function isModuleEntry(value: unknown): value is object {
  return value !== null && typeof value === "object" && moduleEntries.has(value);
}
export function isInputEntry(value: unknown): value is object {
  return value !== null && typeof value === "object" && inputEntries.has(value);
}
function captureDeclaration(declaration: unknown): ModuleDeclaration {
  try {
    return snapshotDeclaration(declaration);
  } catch (cause) {
    throw new AssemblyBindingError(cause instanceof SnapshotFault && cause.kind === "limit" ? "assembly.bind.limit" : "assembly.bind.invalid-declaration", cause);
  }
}
function sealed<T extends object>(fields: T): Readonly<T> {
  const record: object = { ...fields };
  Object.setPrototypeOf(record, null);
  return Object.freeze(record) as Readonly<T>;
}
// A run supplies every input before its first factory, so this is never reached.
const inputFactory: ExecutableFactory = () => { throw new Error("assembly.internal.input-invoked"); };

/** Creates a slot-free input entry `{ declaration }`. */
export function input<C>() {
  return function inputEntry<const D extends ModuleDeclaration & { readonly slots: readonly [] }>(
    declaration: D & ValidDeclaration<C, NoInfer<D>>,
  ): InputEntry<C, D> {
    const captured = captureDeclaration(declaration);
    if (captured.slots.length > 0) {
      throw new AssemblyBindingError("assembly.bind.invalid-declaration", new TypeError("An input declares no slots"));
    }
    const entry = sealed({ declaration: captured });
    metadata.set(entry, Object.freeze({ declaration: captured, factory: inputFactory, input: true as const }));
    inputEntries.add(entry);
    return entry as unknown as InputEntry<C, D>;
  };
}

/** Creates a module entry; the optional adapter turns a factory for another context into one for `FactoryContext`. */
export function implement<C>(): {
  <const D extends ModuleDeclaration, I>(declaration: D & ValidDeclaration<C, NoInfer<D>>,
    factory: ModuleFactory<C, NoInfer<D>, I>): ModuleEntry<C, D, I>;
  <const D extends ModuleDeclaration, I, X>(declaration: D & ValidDeclaration<C, NoInfer<D>>,
    factory: ModuleFactory<C, NoInfer<D>, I, X>, adapter: ContextAdapter<X>): ModuleEntry<C, D, I>;
} {
  function implementEntry(declaration: unknown, factory: unknown, adapter?: unknown): unknown {
    if (typeof factory !== "function") {throw new AssemblyBindingError("assembly.bind.invalid-factory", new TypeError("Expected a factory function"));}
    if (adapter !== undefined && typeof adapter !== "function") {throw new AssemblyBindingError("assembly.bind.invalid-factory", new TypeError("Expected an adapter function"));}
    const captured = captureDeclaration(declaration);
    const adapted: unknown = adapter === undefined ? factory
      : (adapter as (name: string, factory: unknown) => unknown)(captured.implementationId, factory);
    if (typeof adapted !== "function") {throw new AssemblyBindingError("assembly.bind.invalid-factory", new TypeError("An adapter returns a factory function"));}
    const executable: ExecutableFactory = function forwardFactory(this: unknown, dependencies, context) {
      return Reflect.apply(adapted, this, [dependencies, context]);
    };
    const entry = sealed({ declaration: captured, factory: executable });
    metadata.set(entry, Object.freeze({ declaration: captured, factory: executable }));
    moduleEntries.add(entry);
    return entry;
  }
  return implementEntry as never;
}
