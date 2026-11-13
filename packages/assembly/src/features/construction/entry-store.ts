import type { ModuleDeclaration } from "@get-modular/core";
import type { BindingErrorCode } from "./types.js";
import type { FamilyEntry, WiringInputMetadata, WiringMetadata } from "./wiring-types.js";
import { SnapshotFault, snapshotDeclaration } from "./snapshot.js";

const inputMetadata: WeakMap<object, WiringInputMetadata> = new WeakMap();

export class AssemblyBindingError extends Error {
  readonly code: BindingErrorCode;
  constructor(code: BindingErrorCode, cause: unknown) {
    super(code, { cause });
    this.name = "AssemblyBindingError";
    this.code = code;
  }
}
export function captureDeclaration(declaration: unknown): ModuleDeclaration {
  try { return snapshotDeclaration(declaration); }
  catch (cause) {
    throw new AssemblyBindingError(cause instanceof SnapshotFault && cause.kind === "limit"
      ? "assembly.bind.limit" : "assembly.bind.invalid-declaration", cause);
  }
}
export function sealed<T extends object>(fields: T): Readonly<T> {
  const value: object = { ...fields };
  Object.setPrototypeOf(value, null);
  return Object.freeze(value) as Readonly<T>;
}
export function isInputEntry(value: unknown): value is object {
  return value !== null && typeof value === "object" && inputMetadata.has(value);
}
export function captureInput(declaration: unknown): object {
  const captured = captureDeclaration(declaration);
  if (captured.slots.length > 0) {
    throw new AssemblyBindingError("assembly.bind.invalid-declaration", new TypeError("An input declares no slots"));
  }
  const entry = sealed({ declaration: captured });
  inputMetadata.set(entry, Object.freeze({ declaration: captured, input: true }));
  return entry;
}
export type EntryStore<F> = {
  readonly capture: <const D extends ModuleDeclaration, P extends F>(declaration: D, factory: P) => FamilyEntry<D, P>;
  readonly captureSnapshot: (declaration: ModuleDeclaration, factory: F) => object;
  readonly metadataFor: (value: unknown) => WiringMetadata<F> | undefined;
  readonly isModuleEntry: (value: unknown) => value is object;
};
/** Each executor keeps this object private; the input constructor is shared. */
export function createEntryStore<F>(): EntryStore<F> {
  const modules = new WeakMap<object, WiringMetadata<F>>();
  const captureSnapshot = (declaration: ModuleDeclaration, factory: F): object => {
    if (typeof factory !== "function") {
      throw new AssemblyBindingError("assembly.bind.invalid-factory", new TypeError("Expected a factory function"));
    }
    const entry = sealed({ declaration, factory });
    modules.set(entry, Object.freeze({ declaration, factory }));
    return entry;
  };
  return Object.freeze({
    capture: <const D extends ModuleDeclaration, P extends F>(declaration: D, factory: P): FamilyEntry<D, P> =>
      captureSnapshot(captureDeclaration(declaration), factory) as FamilyEntry<D, P>,
    captureSnapshot,
    metadataFor: (value: unknown): WiringMetadata<F> | undefined => value !== null && typeof value === "object"
      ? modules.get(value) ?? inputMetadata.get(value) : undefined,
    isModuleEntry: (value: unknown): value is object => value !== null && typeof value === "object" && modules.has(value),
  });
}
