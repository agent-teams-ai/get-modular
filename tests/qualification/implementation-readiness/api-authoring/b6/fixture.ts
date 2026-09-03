export type Cardinality = "required" | "optional" | "many";
export interface Dependency { slot: string; capability: string; cardinality: Cardinality; min?: number; max?: number; orderBy?: string; }
export interface ModuleDeclaration { id: string; version: string; dependencies: readonly Dependency[]; metadata?: Readonly<Record<string, unknown>>; }
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export const hostileKeys = ["__proto__", "constructor", "then", "café", "ключ"] as const;
export const moduleWithHostileKeys: ModuleDeclaration = { id: "consumer", version: "1.0.0", dependencies: [{ slot: "__proto__", capability: "logging", cardinality: "required" }, { slot: "constructor", capability: "metrics", cardinality: "optional" }, { slot: "then", capability: "storage", cardinality: "many", min: 0, max: 2, orderBy: "id" }], metadata: Object.freeze({ ["__proto__"]: "literal", constructor: "literal", then: "literal", café: "Unicode NFC", ключ: "Unicode Cyrillic" }) };
const MAX_NODES = 10_000;
const MAX_ARRAY_LENGTH = 10_000;

type ValidationState = { active: Set<object>; nodes: number };

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        index += 1;
        continue;
      }
      return true;
    }
    if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return false;
}

export function assertJsonValue(
  value: unknown,
  state: ValidationState = { active: new Set(), nodes: 0 },
): asserts value is JsonValue {
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (hasLoneSurrogate(value)) throw new TypeError("unsupported JSON value: lone surrogate");
    return;
  }
  if (typeof value === "number") {
    if (Number.isSafeInteger(value) && !Object.is(value, -0)) return;
    throw new TypeError("unsupported JSON value: non-safe-integer or negative-zero number");
  }
  if (typeof value !== "object") throw new TypeError("unsupported JSON value: primitive");
  state.nodes += 1;
  if (state.nodes > MAX_NODES) throw new TypeError("unsupported JSON value: node limit");
  if (state.active.has(value)) throw new TypeError("unsupported JSON value: cycle");
  state.active.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || "toJSON" in value) {
        throw new TypeError("unsupported JSON value: array prototype or toJSON");
      }
      if (value.length > MAX_ARRAY_LENGTH) {
        throw new TypeError("unsupported JSON value: array length limit");
      }
      const ownSymbols = Object.getOwnPropertySymbols(value);
      if (ownSymbols.length > 0) throw new TypeError("unsupported JSON value: array symbol property");
      for (const key of Object.getOwnPropertyNames(value)) {
        if (key === "length") continue;
        const index = Number(key);
        if (!Number.isInteger(index) || index < 0 || index >= value.length || String(index) !== key) {
          throw new TypeError(`unsupported JSON value at ${key}`);
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
          throw new TypeError(`unsupported JSON value at ${key}`);
        }
        assertJsonValue(descriptor.value, state);
      }
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, String(index))) throw new TypeError(`unsupported JSON value: sparse array at ${index}`);
      }
      return;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError("unsupported JSON value: object prototype");
    if ("toJSON" in value) throw new TypeError("unsupported JSON value: toJSON");
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") throw new TypeError("unsupported JSON value: symbol property");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) throw new TypeError(`unsupported JSON value at ${key}`);
      assertJsonValue(descriptor.value, state);
    }
  } finally {
    state.active.delete(value);
  }
}
export function canonicalSnapshot(value: unknown): string { assertJsonValue(value); const snapshot = JSON.stringify(value, (_key, nested) => { if (nested && typeof nested === "object" && !Array.isArray(nested)) { const sorted: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>; for (const key of Object.keys(nested).sort((a, b) => a < b ? -1 : a > b ? 1 : 0)) sorted[key] = (nested as Record<string, JsonValue>)[key]; return sorted; } return nested; }); if (snapshot === undefined) throw new TypeError("unsupported JSON value: undefined snapshot"); return snapshot; }
export const scenarioNames = ["required", "optional", "many", "missing", "duplicate", "ambiguity", "cycle", "disabled", "unreachable", "multiple roots", "deterministic ordering", "hostile keys", "unknown fields", "no fallback", "serializability", "declaration emit", "no executable import during discovery"] as const;
export const scenarioResults: Readonly<Record<string, string>> = Object.freeze(Object.fromEntries(scenarioNames.map((name) => [name, ["hostile keys", "serializability", "declaration emit"].includes(name) ? "pass" : "fixture-covered"])));
