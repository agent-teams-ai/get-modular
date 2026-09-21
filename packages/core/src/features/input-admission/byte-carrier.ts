export type ByteCarrierClassification =
  | { readonly kind: "admitted"; readonly visibleLength: number }
  | {
      readonly kind: "rejected";
      readonly reason: "not-uint8array" | "shared-storage" | "unusable-view";
    };

// ADR-0021 adopts ADR-0013's intrinsic classification and copy procedure.
// Capture in this realm once; candidate properties never participate.
const capturedApply = Reflect.apply;
const CapturedUint8Array = Uint8Array;
const typedArrayPrototype = requiredPrototype(CapturedUint8Array.prototype);
const brandOf = captureGetter(typedArrayPrototype, Symbol.toStringTag);
const bufferOf = captureGetter(typedArrayPrototype, "buffer");
const lengthOf = captureGetter(typedArrayPrototype, "length");
const sharedProbe = captureGetter(ArrayBuffer.prototype, "byteLength");
const usableProbe = captureMethod(typedArrayPrototype, "at");

function requiredPrototype(value: object): object {
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype === null || typeof prototype !== "object") {
    throw new TypeError("Required byte carrier intrinsic is unavailable");
  }
  return prototype;
}

function captureGetter(prototype: object, key: PropertyKey): (this: unknown) => unknown {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
  const getter: unknown = descriptor === undefined ? undefined : Reflect.get(descriptor, "get");
  if (typeof getter !== "function") {
    throw new TypeError("Required byte carrier intrinsic is unavailable");
  }
  return function capturedGetter(this: unknown): unknown {
    const result: unknown = capturedApply(getter, this, []);
    return result;
  };
}

function captureMethod(prototype: object, key: PropertyKey): (receiver: unknown, ...args: readonly unknown[]) => unknown {
  const method: unknown = Object.getOwnPropertyDescriptor(prototype, key)?.value;
  if (typeof method !== "function") {
    throw new TypeError("Required byte carrier intrinsic is unavailable");
  }
  return (receiver, ...args) => {
    const result: unknown = capturedApply(method, receiver, args);
    return result;
  };
}

/** Classifies without copying or retaining the candidate or its backing storage. */
export function classifyByteCarrier(value: unknown): ByteCarrierClassification {
  if (capturedApply(brandOf, value, []) !== "Uint8Array") {
    return { kind: "rejected", reason: "not-uint8array" };
  }

  const buffer: unknown = capturedApply(bufferOf, value, []);
  try {
    capturedApply(sharedProbe, buffer, []);
  } catch {
    return { kind: "rejected", reason: "shared-storage" };
  }

  // Unlike length, at validates detached and out-of-bounds views, even when
  // their apparent length is zero. A usable empty view returns normally.
  try {
    usableProbe(value, 0);
  } catch {
    return { kind: "rejected", reason: "unusable-view" };
  }

  const visibleLength: unknown = capturedApply(lengthOf, value, []);
  if (typeof visibleLength !== "number") {
    throw new TypeError("Required byte carrier intrinsic returned an invalid length");
  }
  return { kind: "admitted", visibleLength };
}

/**
 * The caller must first classify all carriers and complete document and batch
 * byte preflight, keeping classification and eligible copies synchronous with
 * no intervening caller code. Intrinsic copy failures propagate to the caller.
 */
export function copyByteCarrier(value: Uint8Array): Uint8Array {
  return new CapturedUint8Array(value);
}
