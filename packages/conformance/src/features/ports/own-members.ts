import { ConformanceError } from "../errors/errors.js";

/** One capability whose callable members live on its prototype chain. */
export type PortViolation = {
  readonly implementationId: string;
  readonly capabilityId: string;
  readonly members: readonly string[];
};

type ContainerGlobals = { readonly Buffer?: unknown; readonly Float16Array?: unknown };

function containerPrototype(value: unknown): object | undefined {
  if (typeof value !== "function" || !("prototype" in value)) {
    return undefined;
  }
  const prototype: unknown = value.prototype;
  return typeof prototype === "object" && prototype !== null ? prototype : undefined;
}

// Captured once: these containers are data, not ports. The typed-array base stops every concrete typed array.
const intrinsicPrototypes = new Set<object>([
  Array.prototype, Map.prototype, Set.prototype, WeakMap.prototype, WeakSet.prototype, Date.prototype,
  RegExp.prototype, Promise.prototype, Error.prototype, ArrayBuffer.prototype, DataView.prototype,
  Int8Array.prototype, Uint8Array.prototype, Uint8ClampedArray.prototype, Int16Array.prototype,
  Uint16Array.prototype, Int32Array.prototype, Uint32Array.prototype, Float32Array.prototype,
  Float64Array.prototype, BigInt64Array.prototype, BigUint64Array.prototype,
  Object.getPrototypeOf(Uint8Array.prototype),
]);
for (const value of [
  (globalThis as ContainerGlobals).Buffer,
  (globalThis as ContainerGlobals).Float16Array,
  typeof SharedArrayBuffer === "function" ? SharedArrayBuffer.prototype : undefined,
]) {
  const prototype = containerPrototype(value);
  if (prototype !== undefined) {
    intrinsicPrototypes.add(prototype);
  }
}

const isForeignObjectPrototype = (prototype: object): boolean =>
  Object.getPrototypeOf(prototype) === null && Object.hasOwn(prototype, "hasOwnProperty");

/** The distinct prototype member names that make an object-valued capability a non-port, nearest first. */
export function prototypeMembers(value: unknown): readonly string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  const members = new Set<string>();
  for (
    let prototype = Object.getPrototypeOf(value);
    prototype !== null && prototype !== Object.prototype;
    prototype = Object.getPrototypeOf(prototype)
  ) {
    if (intrinsicPrototypes.has(prototype) || isForeignObjectPrototype(prototype)) {
      break;
    }
    for (const key of Reflect.ownKeys(prototype)) {
      const descriptor = key === "constructor" ? undefined : Object.getOwnPropertyDescriptor(prototype, key);
      if (descriptor !== undefined
        && (typeof descriptor.value === "function" || descriptor.get !== undefined || descriptor.set !== undefined)) {
        members.add(String(key));
      }
    }
  }
  return [...members];
}

/** Collects one violation per capability in created and capability order. */
export function ownMemberViolations(
  created: readonly { readonly implementationId: string; readonly capabilities: Readonly<Record<string, unknown>> }[],
): readonly PortViolation[] {
  const violations: PortViolation[] = [];
  for (const entry of created) {
    for (const key of Reflect.ownKeys(entry.capabilities)) {
      const descriptor = Object.getOwnPropertyDescriptor(entry.capabilities, key);
      if (typeof key === "string" && descriptor !== undefined && "value" in descriptor) {
        const members = prototypeMembers(descriptor.value);
        if (members.length > 0) {
          violations.push({ implementationId: entry.implementationId, capabilityId: key, members });
        }
      }
    }
  }
  return violations;
}

/** Builds the one error that lists every non-port capability. */
export function portViolationError(
  violations: readonly PortViolation[],
  details: Readonly<Record<string, unknown>>,
): ConformanceError {
  const entries = violations.map(violation =>
    `${violation.implementationId} provides ${violation.capabilityId} with prototype members ${violation.members.join(", ")}`);
  return new ConformanceError("conformance.ports.prototype-member",
    `${String(violations.length)} port violation${violations.length === 1 ? "" : "s"} in constructed modules: ${
      entries.join("; ")}. Provide a port object whose functions are own properties.`,
    { details: { ...details, violations } });
}
