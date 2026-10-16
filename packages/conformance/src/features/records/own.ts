import { invalid } from "../errors/errors.js";

/** Reads an own data property; an accessor is never called. */
export function ownData(record: unknown, key: string): unknown {
  if (typeof record !== "object" || record === null) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
}

/** Reads a non-empty own string property or throws a `conformance.argument.invalid` naming `caller`. */
export function ownTextField(record: unknown, path: string, key: string, caller: string): string {
  const value = ownData(record, key);
  if (typeof value !== "string" || value.length === 0) {
    throw invalid(`${caller}() requires ${path} to have a non-empty string ${key}`);
  }
  return value;
}
