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
const typedArrayPrototype = Object.getPrototypeOf(CapturedUint8Array.prototype) as {
  readonly at: (this: unknown, index: number) => unknown;
};
const brandOf = captureGetter(typedArrayPrototype, Symbol.toStringTag);
const bufferOf = captureGetter(typedArrayPrototype, "buffer");
const lengthOf = captureGetter(typedArrayPrototype, "length");
const sharedProbe = captureGetter(ArrayBuffer.prototype, "byteLength");
const usableProbe = typedArrayPrototype.at;

function captureGetter(prototype: object, key: PropertyKey): (this: unknown) => unknown {
  const getter = Object.getOwnPropertyDescriptor(prototype, key)?.get;
  if (getter === undefined) {
    throw new TypeError("Required byte carrier intrinsic is unavailable");
  }
  return getter;
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
    capturedApply(usableProbe, value, [0]);
  } catch {
    return { kind: "rejected", reason: "unusable-view" };
  }

  return {
    kind: "admitted",
    visibleLength: capturedApply(lengthOf, value, []) as number,
  };
}

/**
 * The caller must first classify all carriers and complete document and batch
 * byte preflight, keeping classification and eligible copies synchronous with
 * no intervening caller code. Intrinsic copy failures propagate to the caller.
 */
export function copyByteCarrier(value: Uint8Array): Uint8Array {
  return new CapturedUint8Array(value);
}
