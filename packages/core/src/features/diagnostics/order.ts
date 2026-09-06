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

function lexical(left: string | number, right: string | number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Inputs are closed, normalized diagnostics, never untrusted input objects. */
export function compareDiagnostics(left: Diagnostic, right: Diagnostic, canonicalize: CanonicalizeDetails): number {
  const rank = phases[left.phase] - phases[right.phase] || codes[left.code] - codes[right.code];
  if (rank !== 0) return rank;
  const a: Coordinate = left.coordinate;
  const b: Coordinate = right.coordinate;
  for (const field of coordinateFields) {
    const av = Object.hasOwn(a, field) ? a[field] : undefined;
    const bv = Object.hasOwn(b, field) ? b[field] : undefined;
    if (av === undefined && bv !== undefined) return -1;
    if (av !== undefined && bv === undefined) return 1;
    if (av !== undefined && bv !== undefined) {
      const order = lexical(av, bv);
      if (order !== 0) return order;
    }
  }
  for (let index = 0; index < Math.min(left.path.length, right.path.length); index += 1) {
    const av = left.path[index]!;
    const bv = right.path[index]!;
    if (av.kind !== bv.kind) return av.kind === "field" ? -1 : 1;
    const order = lexical(av.value, bv.value);
    if (order !== 0) return order;
  }
  if (left.path.length !== right.path.length) return left.path.length - right.path.length;
  // SCC components have their own accepted shorter-prefix-first array order.
  if (left.code === "graph.cycle" && right.code === "graph.cycle") {
    const ac = left.details.component;
    const bc = right.details.component;
    for (let index = 0; index < Math.min(ac.length, bc.length); index += 1) {
      const order = lexical(ac[index]!, bc[index]!);
      if (order !== 0) return order;
    }
    return ac.length - bc.length;
  }
  // Own the first result before the second call: a provider may reuse scratch
  // storage. Compare view bytes, not UTF-16 strings or the backing buffer.
  const ab = new Uint8Array(canonicalize(left.details));
  const bb = canonicalize(right.details);
  for (let index = 0; index < Math.min(ab.length, bb.length); index += 1) {
    if (ab[index] !== bb[index]) return ab[index]! - bb[index]!;
  }
  return ab.length - bb.length;
}
