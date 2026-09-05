// Development-only feasibility oracle for proposed ADR-0013, not Core or
// accepted M2 evidence. No wrapper, decoder, diagnostic collector or graph.
import { readFileSync } from "node:fs";

const profile = JSON.parse(readFileSync(new URL(
  "../../../architecture/qualification/v1/resource-profile-v2.json", import.meta.url,
), "utf8"));
export const declarationByteLimit = profile.limits.declarationRawDocumentBytes;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const brandOf = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag).get;
const bufferOf = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer").get;
const lengthOf = Object.getOwnPropertyDescriptor(typedArrayPrototype, "length").get;
const sharedProbe = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength").get;
const usableProbe = typedArrayPrototype.at;
const OwnedUint8Array = Uint8Array;

export function classifyByteCarrier(value) {
  if (brandOf.call(value) !== "Uint8Array") return { reason: "not-uint8array" };
  const buffer = bufferOf.call(value);
  try { sharedProbe.call(buffer); } catch { return { reason: "shared-storage" }; }
  try { usableProbe.call(value, 0); } catch { return { reason: "unusable-view" }; }
  return { visibleLength: lengthOf.call(value) };
}

// The byte bound is checked before allocating owned carrier storage. The full
// proposal additionally requires wrapper and aggregate batch preflight, which
// this bounded per-document oracle deliberately does not claim to implement.
export function snapshotDeclarationCarrier(value) {
  const observed = classifyByteCarrier(value);
  if ("reason" in observed) return { ok: false, carrierReason: observed.reason, copiedBytes: 0 };
  if (observed.visibleLength > declarationByteLimit) {
    return { ok: false, limitName: "declarationRawDocumentBytes", limit: declarationByteLimit,
      actual: observed.visibleLength, copiedBytes: 0 };
  }
  const bytes = new OwnedUint8Array(value);
  return { ok: true, bytes, copiedBytes: observed.visibleLength };
}
