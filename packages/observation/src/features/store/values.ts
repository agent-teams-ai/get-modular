import { invalidArgument, ObservationError } from "../errors/errors.js";

export type RawValues = Readonly<Record<string, unknown>>;
export type RawSnapshot = { readonly revision: number; readonly values: RawValues };
export type Entry = readonly [string, unknown];
const frozenNodes = new WeakSet<object>();
const arrayPrototype: object = Array.prototype;
const objectPrototype: object = Object.prototype;
function notPlain(path: string): ObservationError {
  return new ObservationError("observation.values.not-plain", `${path} is not plain data`);
}
export function collectPlain(value: unknown, path: string, nodes: Set<object>): void {
  if (typeof value === "function" || typeof value === "symbol") throw notPlain(path);
  if (value === null || typeof value !== "object" || nodes.has(value) || frozenNodes.has(value)) return;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (Array.isArray(value) ? prototype !== arrayPrototype : prototype !== objectPrototype && prototype !== null) {
    throw notPlain(path);
  }
  nodes.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === "length") continue;
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (typeof key === "symbol" || descriptor === undefined || !("value" in descriptor)) throw notPlain(`${path}.${String(key)}`);
    collectPlain(descriptor.value, `${path}.${key}`, nodes);
  }
}
export function freezeNodes(nodes: Set<object>): void {
  for (const node of nodes) { Object.freeze(node); frozenNodes.add(node); }
}
/** Capture data descriptors once, validate every graph before ownership transfer. */
export function captureRecord(record: unknown, what: string, nodes: Set<object>): Entry[] {
  if (typeof record !== "object" || record === null || Array.isArray(record)) throw invalidArgument(`${what} must be a plain object`);
  const prototype: unknown = Object.getPrototypeOf(record);
  if (prototype !== objectPrototype && prototype !== null) throw notPlain(what);
  const entries: Entry[] = [];
  for (const key of Reflect.ownKeys(record)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(record, key);
    if (typeof key === "symbol" || descriptor === undefined || !("value" in descriptor)) throw notPlain(`${what}.${String(key)}`);
    entries.push([key, descriptor.value]);
  }
  for (const [key, value] of entries) collectPlain(value, key, nodes);
  return entries;
}
export function defineRecord(entries: Iterable<Entry>): RawValues {
  const record: Record<string, unknown> = {};
  for (const [key, value] of entries) Object.defineProperty(record, key, { value, enumerable: true });
  return Object.freeze(record);
}
