// Private first-pass resource accounting. This does not validate the wire
// schema, snapshot values, emit diagnostics or establish semantic facts.
// The graph is cooperative trusted-realm data (ADR-0018), not a Proxy sandbox.
// Native reflection allocations are outside the portable heap claim.
import { admissionLimits } from "./resource-limits.js";
const valueLimit = admissionLimits.jsonValueOccurrences;
const stringLimit = admissionLimits.aggregateStringBytes;
const depthLimit = admissionLimits.jsonDepth;

type BatchLimit = "jsonValueOccurrences" | "aggregateStringBytes";
export type ObjectResourceScan = {
  readonly jsonDepth: number;
  readonly nonPlainValue: boolean;
  readonly stoppedBy: BatchLimit | "jsonDepth" | null;
};
export type ObjectResourceStatistics = {
  readonly jsonValueOccurrences: number;
  readonly aggregateStringBytes: number;
  readonly peakOpenContainers: number;
};
export interface ObjectResourceMeter {
  readonly scanDocument: (value: unknown) => ObjectResourceScan;
  readonly statistics: () => ObjectResourceStatistics;
}

type Frame = {
  readonly value: object;
  readonly descriptors: PropertyDescriptorMap;
  readonly keys: readonly PropertyKey[];
  readonly depth: number;
  readonly arrayLength: number | null;
  next: number;
  indexes: number;
};

/** One meter per invocation; the wrapper/list are not JSON document values. */
export function createObjectResourceMeter(): ObjectResourceMeter {
  let occurrences = 0;
  let stringBytes = 0;
  let peakOpenContainers = 0;
  let exhausted: BatchLimit | null = null;

  function countValues(count: number): boolean {
    occurrences = Math.min(valueLimit + 1, occurrences + count);
    if (occurrences > valueLimit) exhausted = "jsonValueOccurrences";
    return exhausted === null;
  }

  function countString(value: string): boolean {
    // Count UTF-8 without an encoded buffer. Unpaired surrogates occupy three
    // replacement bytes; the schema pass separately rejects malformed Unicode.
    for (let index = 0; index < value.length; index += 1) {
      const unit = value.charCodeAt(index);
      let bytes = unit <= 0x7f ? 1 : unit <= 0x7ff ? 2 : 3;
      if (unit >= 0xd800 && unit <= 0xdbff && index + 1 < value.length) {
        const next = value.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) { bytes = 4; index += 1; }
      }
      stringBytes = Math.min(stringLimit + 1, stringBytes + bytes);
      if (stringBytes > stringLimit) {
        exhausted = "aggregateStringBytes";
        return false;
      }
    }
    return true;
  }

  function scanDocument(value: unknown): ObjectResourceScan {
    let jsonDepth = 0;
    let nonPlainValue = false;
    let stoppedBy: ObjectResourceScan["stoppedBy"] = exhausted;
    const active = new WeakSet<object>();
    const stack: Frame[] = [];

    function enter(item: unknown, depth: number, prepaid: boolean): void {
      if (!prepaid && !countValues(1)) { stoppedBy = exhausted; return; }
      if (typeof item === "string") {
        if (!countString(item)) stoppedBy = exhausted;
        return;
      }
      // Numeric domain and field-specific types belong to the schema pass.
      if (item === null || typeof item === "boolean" || typeof item === "number") return;
      if (typeof item !== "object") { nonPlainValue = true; return; }
      if (active.has(item)) { nonPlainValue = true; return; }
      jsonDepth = Math.max(jsonDepth, depth);
      if (depth > depthLimit) { stoppedBy = "jsonDepth"; return; }

      const isArray = Array.isArray(item);
      const prototype = Object.getPrototypeOf(item);
      if (isArray ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
        nonPlainValue = true;
      }
      const arrayLength = isArray ? Object.getOwnPropertyDescriptor(item, "length")!.value as number : null;
      // Reserve attempted positions before density inspection or work
      // proportional to a rejected array dimension, including sparse length.
      if (arrayLength !== null && !countValues(arrayLength)) { stoppedBy = exhausted; return; }
      const descriptors = Object.getOwnPropertyDescriptors(item);
      stack.push({ value: item, descriptors, keys: Reflect.ownKeys(descriptors), depth,
        arrayLength, next: 0, indexes: 0 });
      active.add(item);
      peakOpenContainers = Math.max(peakOpenContainers, stack.length);
    }

    if (stoppedBy === null) enter(value, 1, false);
    while (stoppedBy === null && stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      if (frame.next === frame.keys.length) {
        if (frame.arrayLength !== null && frame.indexes !== frame.arrayLength) nonPlainValue = true;
        active.delete(frame.value);
        stack.pop();
        continue;
      }
      const key = frame.keys[frame.next++]!;
      if (typeof key !== "string") { nonPlainValue = true; continue; }
      if (frame.arrayLength !== null) {
        if (key === "length") continue;
        const index = Number(key);
        if (!Number.isInteger(index) || index < 0 || String(index) !== key || index >= frame.arrayLength) {
          nonPlainValue = true;
          continue;
        }
        frame.indexes += 1;
      } else if (!countString(key)) { stoppedBy = exhausted; break; }
      const descriptor = frame.descriptors[key]!;
      if (!descriptor.enumerable) nonPlainValue = true;
      if (!Object.hasOwn(descriptor, "value")) { nonPlainValue = true; continue; }
      enter(descriptor.value, frame.depth + 1, frame.arrayLength !== null);
    }
    // No caller reference survives this synchronous call, including early stops.
    return Object.freeze({ jsonDepth, nonPlainValue, stoppedBy });
  }

  return Object.freeze({
    scanDocument,
    statistics: () => Object.freeze({ jsonValueOccurrences: occurrences,
      aggregateStringBytes: stringBytes, peakOpenContainers }),
  });
}
