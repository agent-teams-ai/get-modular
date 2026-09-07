import type { CompositionPlan, ModuleDeclaration } from "@get-modular/core";

export const limits: Readonly<{
  handles: number; roots: number; bindings: number; providers: number;
  providerOccurrences: number; provides: number; slots: number;
  aggregateProvides: number; aggregateSlots: number; ownerPath: number; identifierBytes: number;
}> = Object.freeze({
  handles: 4096, roots: 1024, bindings: 65536, providers: 1024,
  providerOccurrences: 262144, provides: 64, slots: 128,
  aggregateProvides: 65536, aggregateSlots: 65536, ownerPath: 8, identifierBytes: 128,
});
export class SnapshotFault extends Error {
  readonly kind: "shape" | "limit";
  constructor(kind: "shape" | "limit") { super(`assembly.snapshot.${kind}`); this.kind = kind; }
}
const shape = (): never => { throw new SnapshotFault("shape"); };
const limit = (): never => { throw new SnapshotFault("limit"); };
export function data(value: object, key: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !("value" in descriptor)) return shape();
  return descriptor.value;
}
export function dataObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object") return shape();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return shape();
  return value as Record<string, unknown>;
}
export function record(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  const object = dataObject(value);
  const keys = Reflect.ownKeys(object);
  if (keys.length > required.length + optional.length) return shape();
  for (const key of keys) {
    if (typeof key !== "string" || (!required.includes(key) && !optional.includes(key))) return shape();
    data(object, key);
  }
  for (const key of required) data(object, key);
  return object;
}
export function denseArray(value: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return shape();
  const length = data(value, "length");
  if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0) return shape();
  if (length > maximum) return limit();
  if (Reflect.ownKeys(value).length !== length + 1) return shape();
  for (let index = 0; index < length; index++) data(value, String(index));
  return value;
}
export function identifier(value: unknown): string {
  if (typeof value !== "string") return shape();
  if (value.length > limits.identifierBytes) return limit();
  let bytes = 0;
  for (const point of value) {
    const code = point.codePointAt(0)!;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  if (bytes > limits.identifierBytes) return limit();
  return value;
}
function compatibility(value: unknown) {
  const input = record(value, ["family", "familyVersion", "token"]);
  if (data(input, "family") !== "exact" || data(input, "familyVersion") !== 1) return shape();
  return Object.freeze({ family: "exact" as const, familyVersion: 1 as const, token: identifier(data(input, "token")) });
}
function provided(value: unknown) {
  const input = record(value, ["capabilityId", "compatibility"]);
  return Object.freeze({ capabilityId: identifier(data(input, "capabilityId")), compatibility: compatibility(data(input, "compatibility")) });
}
function cardinality(value: unknown): ModuleDeclaration["slots"][number]["cardinality"] {
  const input = dataObject(value);
  const kind = data(input, "kind");
  if (kind === "required" || kind === "optional") {
    record(input, ["kind"]);
    return Object.freeze({ kind });
  }
  if (kind !== "many") return shape();
  record(input, ["kind", "min", "max", "order"]);
  const min = data(input, "min"), max = data(input, "max");
  if (typeof min !== "number" || typeof max !== "number" || !Number.isFinite(min) || !Number.isFinite(max)) return shape();
  if (data(input, "order") !== "profile") return shape();
  return Object.freeze({ kind, min, max, order: "profile" });
}
export function snapshotDeclaration(value: unknown): ModuleDeclaration {
  const input = record(value, ["kind", "schemaVersion", "moduleId", "implementationId", "owner", "provides", "slots"]);
  if (data(input, "kind") !== "get-modular.module-declaration" || data(input, "schemaVersion") !== 1) return shape();
  const owner = record(data(input, "owner"), ["authority", "path"]);
  const path = denseArray(data(owner, "path"), limits.ownerPath);
  const provides = denseArray(data(input, "provides"), limits.provides);
  const slots = denseArray(data(input, "slots"), limits.slots);
  return Object.freeze({
    kind: "get-modular.module-declaration", schemaVersion: 1,
    moduleId: identifier(data(input, "moduleId")), implementationId: identifier(data(input, "implementationId")),
    owner: Object.freeze({ authority: identifier(data(owner, "authority")), path: Object.freeze(path.map(identifier)) }),
    provides: Object.freeze(provides.map(provided)),
    slots: Object.freeze(slots.map((value) => {
      const slot = record(value, ["slotId", "capabilityId", "compatibility", "cardinality"]);
      return Object.freeze({
        slotId: identifier(data(slot, "slotId")), capabilityId: identifier(data(slot, "capabilityId")),
        compatibility: compatibility(data(slot, "compatibility")), cardinality: cardinality(data(slot, "cardinality")),
      });
    })),
  });
}
export type PlanCensus = {
  readonly input: Record<string, unknown>;
  readonly roots: readonly unknown[]; readonly selections: readonly unknown[]; readonly bindings: readonly unknown[]; readonly order: readonly unknown[];
};
export function inspectPlan(value: unknown): PlanCensus {
  const input = record(value, [
    "kind", "schemaVersion", "profileId", "roots", "selections", "bindings", "dependencyOrder",
  ]);
  if (data(input, "kind") !== "get-modular.composition-plan" || data(input, "schemaVersion") !== 1) return shape();
  const roots = denseArray(data(input, "roots"), limits.roots);
  const selections = denseArray(data(input, "selections"), limits.handles);
  const bindings = denseArray(data(input, "bindings"), limits.bindings);
  const order = denseArray(data(input, "dependencyOrder"), limits.handles);
  let occurrences = 0;
  for (const value of bindings) {
    const binding = record(value, ["consumerImplementationId", "slotId", "providerImplementationIds", "capabilityId", "compatibility"]);
    const providers = denseArray(data(binding, "providerImplementationIds"), limits.providers);
    occurrences += providers.length;
    if (occurrences > limits.providerOccurrences) return limit();
  }
  return { input, roots, selections, bindings, order };
}
export function copyPlan(census: PlanCensus): CompositionPlan {
  const { input, roots, selections, bindings, order } = census;
  return Object.freeze({
    kind: "get-modular.composition-plan", schemaVersion: 1,
    profileId: identifier(data(input, "profileId")),
    roots: Object.freeze(roots.map(identifier)),
    selections: Object.freeze(selections.map((value) => {
      const selection = record(value, ["moduleId", "implementationId"]);
      return Object.freeze({ moduleId: identifier(data(selection, "moduleId")), implementationId: identifier(data(selection, "implementationId")) });
    })),
    bindings: Object.freeze(bindings.map((value) => {
      const binding = record(value, ["consumerImplementationId", "slotId", "providerImplementationIds", "capabilityId", "compatibility"]);
      const providers = denseArray(data(binding, "providerImplementationIds"), limits.providers);
      return Object.freeze({
        consumerImplementationId: identifier(data(binding, "consumerImplementationId")),
        slotId: identifier(data(binding, "slotId")),
        providerImplementationIds: Object.freeze(providers.map(identifier)),
        capabilityId: identifier(data(binding, "capabilityId")),
        compatibility: compatibility(data(binding, "compatibility")),
      });
    })),
    dependencyOrder: Object.freeze(order.map(identifier)),
  });
}
export function snapshotPlan(value: unknown): CompositionPlan {
  return copyPlan(inspectPlan(value));
}
export function rootKeys(value: unknown): { readonly object: Record<string, unknown>; readonly keys: readonly string[] } {
  const object = dataObject(value);
  const keys = Reflect.ownKeys(object);
  if (keys.length > limits.roots) return limit();
  for (const key of keys) {
    if (typeof key !== "string") return shape();
    identifier(key);
    data(object, key);
  }
  return { object, keys: keys as string[] };
}
export function envelope(value: unknown): Readonly<Record<string, unknown>> {
  const input = record(value, ["plan", "digest"], ["ok", "status", "success", "kind", "diagnostics"]);
  const header: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(input)) {
    if (key === "plan") continue;
    const field = data(input, key);
    if (key === "diagnostics") {
      denseArray(field, 0);
      header[key] = Object.freeze([]);
    } else {
      if (key === "digest") identifier(field);
      else if (typeof field !== "string" && typeof field !== "boolean") return shape();
      if (typeof field === "string") identifier(field);
      header[key] = field;
    }
  }
  return Object.freeze(header);
}
