import type { DocumentView } from "./document-reader.js";
import type { RawScannerPort, RawToken, RawTokenCursor } from "./ports.js";
import { admitRawInteger } from "./raw-integer.js";
import { admissionLimits } from "./resource-limits.js";

export type RawDocumentBudget = {
  readonly valuesRemaining: number;
  readonly stringBytesRemaining: number;
};

export type RawDocumentScan = {
  readonly decoded: boolean;
  readonly invalidJson: boolean;
  readonly duplicateKey: boolean;
  readonly stoppedBy: "jsonValueOccurrences" | "aggregateStringBytes" | "jsonDepth" | null;
  readonly valueOccurrences: number;
  readonly stringBytes: number;
  readonly maximumDepth: number;
};

type Segment = string | number;
type SpanKind = "record" | "array" | "string" | "number" | "boolean" | "null";
type Span = { readonly start: number; readonly end: number; readonly kind: SpanKind };
type StringLexical = Extract<RawToken, { readonly kind: "string" }>;
type ScanFrame = {
  readonly kind: "object";
  readonly segment: Segment | null;
  readonly keys: Set<string>;
  state: "first-key" | "key" | "colon" | "value" | "after-value";
  key: string;
} | {
  readonly kind: "array";
  readonly segment: Segment | null;
  state: "first-value" | "value" | "after-value";
  nextIndex: number;
};

// Handles expose no offsets or contents. Each reader owns its span table, so a
// handle from another view cannot be used to address this document's bytes.
declare const rawValueBrand: unique symbol;
export type RawValue = { readonly [rawValueBrand]: true };

type RecordIndex = {
  readonly members: ReadonlyMap<string, RawValue>;
  readonly keys: readonly string[];
};
type ArrayIndex = {
  readonly length: number;
  cursor: RawTokenCursor | null;
  nextIndex: number;
  last: RawValue | null;
};
type RawReader = DocumentView<RawValue>["reader"];

function lexicalKind(current: RawToken): SpanKind | null {
  switch (current.kind) {
    case "object-start": return "record";
    case "array-start": return "array";
    case "string": return "string";
    case "number": return "number";
    case "true":
    case "false": return "boolean";
    case "null": return "null";
    default: return null;
  }
}

function duplicatePath(frames: readonly ScanFrame[], key: Segment): readonly Segment[] {
  const path: Segment[] = [];
  for (const frame of frames) {
    if (frame.segment !== null) path.push(frame.segment);
  }
  path.push(key);
  return Object.freeze(path);
}

/**
 * Counter-only preflight over already owned bytes. Only object keys are decoded.
 * The caller must redact each local duplicate path before diagnostic emission.
 * A duplicate remains observable when a later lexical or grammar failure occurs.
 */
export function scanRawDocument(
  ownedBytes: Uint8Array,
  scanner: RawScannerPort,
  budget: RawDocumentBudget,
  onDuplicate: (localPath: readonly (string | number)[]) => void,
  onReplayBoundary?: (observedEnd: number) => void,
  onDepthLimit?: (localPath: readonly Segment[]) => void,
): RawDocumentScan {
  const cursor = scanner.open(ownedBytes);
  const frames: ScanFrame[] = [];
  let rootSeen = false;
  let invalidJson = false;
  let duplicateKey = false;
  let stoppedBy: RawDocumentScan["stoppedBy"] = null;
  let valueOccurrences = 0;
  let stringBytes = 0;
  let maximumDepth = 0;

  function chargeString(current: StringLexical): boolean {
    stringBytes = Math.min(budget.stringBytesRemaining + 1, stringBytes + current.decodedUtf8Bytes);
    if (stringBytes > budget.stringBytesRemaining) {
      stoppedBy = "aggregateStringBytes";
      return false;
    }
    return true;
  }

  // Commit an event only when the loop advances past all of its checks.
  // A break excludes the current event, including a rejected key or value.
  let observedEnd = 0;
  for (let processedEnd = 0; ; observedEnd = processedEnd) {
    const current = cursor.next();
    processedEnd = current.end;
    // A lexical failure is terminal even though the cursor subsequently emits end.
    if (current.kind === "invalid") { invalidJson = true; break; }
    if (current.kind === "end") {
      invalidJson = !rootSeen || frames.length !== 0;
      break;
    }

    const frame = frames[frames.length - 1];
    if (frame?.kind === "object") {
      if (frame.state === "first-key" || frame.state === "key") {
        if (frame.state === "first-key" && current.kind === "object-end") {
          frames.pop();
          continue;
        }
        if (current.kind !== "string") { invalidJson = true; break; }
        // Charge metadata before allocating a decoded key or extending its set.
        if (!chargeString(current)) break;
        const key = cursor.decodeString(current);
        if (frame.keys.has(key)) {
          duplicateKey = true;
          onDuplicate(duplicatePath(frames, key));
        } else {
          frame.keys.add(key);
        }
        frame.key = key;
        frame.state = "colon";
        continue;
      }
      if (frame.state === "colon") {
        if (current.kind !== "colon") { invalidJson = true; break; }
        frame.state = "value";
        continue;
      }
      if (frame.state === "after-value") {
        if (current.kind === "object-end") frames.pop();
        else if (current.kind === "comma") frame.state = "key";
        else { invalidJson = true; break; }
        continue;
      }
    } else if (frame?.kind === "array") {
      if (frame.state === "first-value" && current.kind === "array-end") {
        frames.pop();
        continue;
      }
      if (frame.state === "after-value") {
        if (current.kind === "array-end") frames.pop();
        else if (current.kind === "comma") frame.state = "value";
        else { invalidJson = true; break; }
        continue;
      }
    } else if (rootSeen) {
      invalidJson = true;
      break;
    }

    // Only a grammatically expected value reaches this point. Keys never do.
    const kind = lexicalKind(current);
    if (kind === null) { invalidJson = true; break; }
    valueOccurrences = Math.min(budget.valuesRemaining + 1, valueOccurrences + 1);
    if (valueOccurrences > budget.valuesRemaining) {
      stoppedBy = "jsonValueOccurrences";
      break;
    }
    if (current.kind === "string" && !chargeString(current)) break;
    if (kind === "record" || kind === "array") {
      const depth = frames.length + 1;
      maximumDepth = Math.max(maximumDepth, depth);
      if (depth > admissionLimits.jsonDepth) {
        stoppedBy = "jsonDepth";
        // Report the attempted container before advancing the parent or
        // allocating its frame. The caller owns schema projection and clipping.
        if (frame !== undefined) onDepthLimit?.(duplicatePath(frames,
          frame.kind === "object" ? frame.key : frame.nextIndex));
        break;
      }
    }

    let segment: Segment | null = null;
    if (frame?.kind === "object") {
      segment = frame.key;
      frame.key = "";
      frame.state = "after-value";
    } else if (frame?.kind === "array") {
      segment = frame.nextIndex;
      frame.nextIndex += 1;
      frame.state = "after-value";
    } else {
      rootSeen = true;
    }
    // The depth and both aggregate charges precede every new frame or key set.
    if (kind === "record") {
      frames.push({ kind: "object", segment, keys: new Set<string>(), state: "first-key", key: "" });
    } else if (kind === "array") {
      frames.push({ kind: "array", segment, state: "first-value", nextIndex: 0 });
    }
  }

  onReplayBoundary?.(observedEnd);
  return {
    decoded: !invalidJson && !duplicateKey && stoppedBy === null,
    invalidJson,
    duplicateKey,
    stoppedBy,
    valueOccurrences,
    stringBytes,
    maximumDepth,
  };
}

function invalidAccess(): never {
  throw new TypeError("Invalid raw document access");
}

/** Consume one already validated value without decoding or retaining children. */
function valueEnd(cursor: RawTokenCursor, first: RawToken): number {
  const kind = lexicalKind(first);
  if (kind === null) invalidAccess();
  if (kind !== "record" && kind !== "array") return first.end;
  let depth = 1;
  let end = first.end;
  while (depth !== 0) {
    const current = cursor.next();
    if (current.kind === "invalid" || current.kind === "end") invalidAccess();
    if (current.kind === "object-start" || current.kind === "array-start") {
      depth += 1;
      if (depth > admissionLimits.jsonDepth) invalidAccess();
    } else if (current.kind === "object-end" || current.kind === "array-end") {
      depth -= 1;
    }
    end = current.end;
  }
  return end;
}

/**
 * Private second pass. The caller must first finish lexical, grammar, duplicate
 * and resource admission for this document AND resource admission for the batch.
 * Bytes remain owned, fixed and unchanged for the view's lifetime.
 */
export function rawDocumentView(ownedBytes: Uint8Array, scanner: RawScannerPort): DocumentView<RawValue> {
  const spans = new WeakMap<RawValue, Span>();
  const records = new WeakMap<RawValue, RecordIndex>();
  const arrays = new WeakMap<RawValue, ArrayIndex>();

  function spanOf(value: RawValue, expected?: SpanKind): Span {
    const span = spans.get(value);
    if (span === undefined || (expected !== undefined && span.kind !== expected)) invalidAccess();
    return span;
  }

  function open(span: Span): RawTokenCursor {
    return scanner.open(ownedBytes.subarray(span.start, span.end));
  }

  function capture(cursor: RawTokenCursor, current: RawToken, base: number): RawValue {
    const kind = lexicalKind(current);
    if (kind === null) invalidAccess();
    const end = valueEnd(cursor, current);
    const value = Object.freeze({}) as RawValue;
    spans.set(value, { kind, start: base + current.start, end: base + end });
    return value;
  }

  function recordOf(value: RawValue): RecordIndex {
    const span = spanOf(value, "record");
    const cached = records.get(value);
    if (cached !== undefined) return cached;
    const cursor = open(span);
    if (cursor.next().kind !== "object-start") invalidAccess();
    const members = new Map<string, RawValue>();
    const keys: string[] = [];
    let current = cursor.next();
    if (current.kind !== "object-end") {
      for (;;) {
        if (current.kind !== "string") invalidAccess();
        const key = cursor.decodeString(current);
        if (members.has(key) || cursor.next().kind !== "colon") invalidAccess();
        const child = capture(cursor, cursor.next(), span.start);
        members.set(key, child);
        keys.push(key);
        const separator = cursor.next();
        if (separator.kind === "object-end") break;
        if (separator.kind !== "comma") invalidAccess();
        current = cursor.next();
      }
    }
    const indexed: RecordIndex = { members, keys: Object.freeze(keys) };
    records.set(value, indexed);
    return indexed;
  }

  function arrayOf(value: RawValue): ArrayIndex {
    const span = spanOf(value, "array");
    const cached = arrays.get(value);
    if (cached !== undefined) return cached;
    const cursor = open(span);
    if (cursor.next().kind !== "array-start") invalidAccess();
    let current = cursor.next();
    let length = 0;
    if (current.kind !== "array-end") {
      for (;;) {
        // Counting an array never allocates a handle for any element.
        valueEnd(cursor, current);
        length += 1;
        const separator = cursor.next();
        if (separator.kind === "array-end") break;
        if (separator.kind !== "comma") invalidAccess();
        current = cursor.next();
      }
    }
    const indexed: ArrayIndex = { length, cursor: null, nextIndex: 0, last: null };
    arrays.set(value, indexed);
    return indexed;
  }

  function item(value: RawValue, index: number): RawValue {
    const span = spanOf(value, "array");
    const indexed = arrayOf(value);
    if (!Number.isInteger(index) || index < 0 || index >= indexed.length) invalidAccess();
    if (indexed.last !== null && index === indexed.nextIndex - 1) return indexed.last;
    if (indexed.cursor === null || index < indexed.nextIndex) {
      indexed.cursor = open(span);
      if (indexed.cursor.next().kind !== "array-start") invalidAccess();
      indexed.nextIndex = 0;
      indexed.last = null;
    }
    const cursor = indexed.cursor;
    if (cursor === null) invalidAccess();
    while (indexed.nextIndex <= index) {
      if (indexed.nextIndex !== 0 && cursor.next().kind !== "comma") invalidAccess();
      const current = cursor.next();
      if (indexed.nextIndex === index) indexed.last = capture(cursor, current, span.start);
      else valueEnd(cursor, current);
      indexed.nextIndex += 1;
    }
    if (indexed.last === null) invalidAccess();
    return indexed.last;
  }

  function text(value: RawValue): string {
    const cursor = open(spanOf(value, "string"));
    const current = cursor.next();
    if (current.kind !== "string") invalidAccess();
    return cursor.decodeString(current);
  }

  const rootCursor = scanner.open(ownedBytes.subarray(0, ownedBytes.length));
  const root = capture(rootCursor, rootCursor.next(), 0);
  if (rootCursor.next().kind !== "end") invalidAccess();

  // Record indexes retain immediate child spans. Array indexes retain only the
  // most recent element; weak caches let earlier visited rows be collected.
  const reader: RawReader = Object.freeze({
    kind: (value: RawValue): SpanKind => spanOf(value).kind,
    keys: (value: RawValue): readonly string[] => recordOf(value).keys,
    own: (value: RawValue, key: string): ReturnType<RawReader["own"]> => {
      const child = recordOf(value).members.get(key);
      return child === undefined ? { present: false } : { present: true, value: child };
    },
    length: (value: RawValue): number => arrayOf(value).length,
    item,
    text,
    integer: (value: RawValue): ReturnType<typeof admitRawInteger> => {
      const span = spanOf(value, "number");
      return admitRawInteger(ownedBytes, span.start, span.end);
    },
  });
  return Object.freeze({ root, reader });
}
