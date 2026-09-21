import type { Diagnostic, DiagnosticCode } from "../authoring/internal.js";
import type { CanonicalizeDetails } from "./types.js";

const phases = {
  decode: 0, schema: 1, declaration: 2, profile: 3, binding: 4, graph: 5, output: 6,
} as const satisfies Record<Diagnostic["phase"], number>;
// ADR-0021 adds two ranks; reserved canonicalization failure stays non-emittable.
const codes = {
  "input.invalid-byte-carrier": 0,
  "decode.invalid-json": 1,
  "decode.duplicate-key": 2,
  "input.limit-exceeded": 3,
  "schema.unsupported-version": 4,
  "schema.unknown-field": 5,
  "schema.invalid-value": 6,
  "schema.non-plain-value": 7,
  "identity.invalid": 8,
  "declaration.duplicate-implementation": 9,
  "declaration.duplicate-capability": 10,
  "declaration.duplicate-slot": 11,
  "profile.duplicate-root": 12,
  "profile.unknown-root": 13,
  "profile.duplicate-selection": 14,
  "profile.unknown-module": 15,
  "profile.unknown-implementation": 16,
  "profile.implementation-mismatch": 17,
  "profile.missing-selection": 18,
  "profile.unreachable-selection": 19,
  "binding.duplicate-record": 20,
  "binding.duplicate": 21,
  "binding.missing": 22,
  "binding.unknown-consumer": 23,
  "binding.unknown-slot": 24,
  "binding.unknown-provider": 25,
  "binding.provider-not-selected": 26,
  "binding.cardinality": 27,
  "binding.capability-missing": 28,
  "binding.compatibility-mismatch": 29,
  "graph.cycle": 30,
  "diagnostics.truncated": 32,
} as const satisfies Record<DiagnosticCode, number>;
const coordinateFields = ["moduleId", "implementationId", "slotId", "providerImplementationId"] as const;
type Coordinate = Readonly<Partial<Record<typeof coordinateFields[number], string>>>;

function defined<T>(value: T | undefined): T {
  if (value === undefined) {throw new Error("Missing internal diagnostic ordering value");}
  return value;
}

function lexical(left: string | number, right: string | number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareCoordinates(left: Coordinate, right: Coordinate): number {
  for (const field of coordinateFields) {
    const leftValue = Object.hasOwn(left, field) ? left[field] : undefined;
    const rightValue = Object.hasOwn(right, field) ? right[field] : undefined;
    if (leftValue === undefined && rightValue !== undefined) {return -1;}
    if (leftValue !== undefined && rightValue === undefined) {return 1;}
    if (leftValue !== undefined && rightValue !== undefined) {
      const order = lexical(leftValue, rightValue);
      if (order !== 0) {return order;}
    }
  }
  return 0;
}

function comparePaths(left: Diagnostic["path"], right: Diagnostic["path"]): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const leftSegment = defined(left[index]);
    const rightSegment = defined(right[index]);
    if (leftSegment.kind !== rightSegment.kind) {return leftSegment.kind === "field" ? -1 : 1;}
    const order = lexical(leftSegment.value, rightSegment.value);
    if (order !== 0) {return order;}
  }
  return left.length - right.length;
}

function compareCycles(left: readonly string[], right: readonly string[]): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const order = lexical(defined(left[index]), defined(right[index]));
    if (order !== 0) {return order;}
  }
  return left.length - right.length;
}

function compareBytes(left: Uint8Array, right: Uint8Array): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const leftByte = defined(left[index]);
    const rightByte = defined(right[index]);
    if (leftByte !== rightByte) {return leftByte - rightByte;}
  }
  return left.length - right.length;
}

/** Inputs are closed, normalized diagnostics, never untrusted input objects. */
export function compareDiagnostics(left: Diagnostic, right: Diagnostic, canonicalize: CanonicalizeDetails): number {
  const rank = phases[left.phase] - phases[right.phase] || codes[left.code] - codes[right.code];
  if (rank !== 0) {return rank;}
  const coordinateOrder = compareCoordinates(left.coordinate, right.coordinate);
  if (coordinateOrder !== 0) {return coordinateOrder;}
  const pathOrder = comparePaths(left.path, right.path);
  if (pathOrder !== 0) {return pathOrder;}
  // SCC components have their own accepted shorter-prefix-first array order.
  if (left.code === "graph.cycle" && right.code === "graph.cycle") {
    return compareCycles(left.details.component, right.details.component);
  }
  // Own the first result before the second call: a provider may reuse scratch
  // storage. Compare view bytes, not UTF-16 strings or the backing buffer.
  const ab = new Uint8Array(canonicalize(left.details));
  const bb = canonicalize(right.details);
  return compareBytes(ab, bb);
}
