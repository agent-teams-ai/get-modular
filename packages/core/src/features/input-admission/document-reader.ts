import type { ExactInteger } from "./raw-integer.js";

export type ValueKind = "record" | "array" | "string" | "number" | "boolean" | "null" | "other";
export type OwnMember<Value> = { readonly present: false }
  | { readonly present: true; readonly value: Value };

/** Private fixed-schema access; raw numbers need not be converted to Number. */
export interface DocumentReader<Value> {
  readonly kind: (value: Value) => ValueKind;
  readonly keys: (value: Value) => readonly string[];
  readonly own: (value: Value, key: string) => OwnMember<Value>;
  readonly length: (value: Value) => number;
  readonly item: (value: Value, index: number) => Value;
  readonly text: (value: Value) => string;
  readonly integer: (value: Value) => ExactInteger;
}

export type DocumentView<Value> = { readonly root: Value; readonly reader: DocumentReader<Value> };

function objectKind(value: unknown): ValueKind {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  const kind = typeof value;
  return kind === "object" ? "record"
    : kind === "string" || kind === "number" || kind === "boolean" ? kind : "other";
}

function objectOwn(value: unknown, key: string): OwnMember<unknown> {
  if (value === null || typeof value !== "object") return { present: false };
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return { present: false };
  // An accessor is present, but supplies no JSON value. Descriptor preflight
  // owns its non-plain diagnostic; this fallback never invokes the getter.
  return { present: true, value: Object.hasOwn(descriptor, "value") ? descriptor.value : undefined };
}

function objectKeys(value: unknown): readonly string[] { return Object.keys(Object.getOwnPropertyDescriptors(value)); }
function objectLength(value: unknown): number { return Object.getOwnPropertyDescriptor(value, "length")!.value as number; }
function objectItem(value: unknown, index: number): unknown {
  const member = objectOwn(value, String(index));
  return member.present ? member.value : undefined;
}
function objectText(value: unknown): string { return value as string; }
function objectInteger(value: unknown): ExactInteger {
  if (typeof value !== "number" || !Number.isInteger(value)) return { admitted: false, reason: "invalid-type" };
  if (!Number.isSafeInteger(value) || Object.is(value, -0)) return { admitted: false, reason: "invalid-format" };
  return { admitted: true, value };
}
const objectReader: DocumentReader<unknown> = Object.freeze({
  kind: objectKind, keys: objectKeys, own: objectOwn, length: objectLength,
  item: objectItem, text: objectText, integer: objectInteger,
});

export function objectDocument(value: unknown): DocumentView<unknown> {
  return { root: value, reader: objectReader };
}
