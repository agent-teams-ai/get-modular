import type { DocumentReader, DocumentView } from "./document-reader.js";
import { schemaSafeLocalPath } from "./document-shape.js";

type Path = readonly (string | number)[];
type DocumentKind = "declaration" | "profile";
type FailureMask = 0 | 1 | 2 | 3;
type VisitChild<Value> = (value: Value, path: Path) => void;
type Frame<Value> = {
  readonly kind: "record";
  readonly value: Value;
  readonly keys: readonly string[];
  next: number;
} | {
  readonly kind: "array";
  readonly value: Value;
  readonly length: number;
  next: number;
};

// The admitted invocation prefix occupies two declaration segments or one
// profile segment of the complete 32-segment diagnostic address.
function localPathCapacity(kind: DocumentKind): number {
  return kind === "declaration" ? 30 : 31;
}

function union(left: FailureMask, right: FailureMask): FailureMask {
  return (left | right) as FailureMask;
}

// Both callers establish number kind before requesting the exact verdict.
function integerMask<Value>(reader: DocumentReader<Value>, value: Value): FailureMask {
  const verdict = reader.integer(value);
  return verdict.admitted ? 0 : verdict.reason === "invalid-type" ? 1 : 2;
}

/** Projection has stopped permanently; every descendant belongs to this owner. */
function stoppedMask<Value>(reader: DocumentReader<Value>, root: Value): FailureMask {
  const frames: Frame<Value>[] = [];
  let current = root;
  let mask: FailureMask = 0;
  for (;;) {
    const valueKind = reader.kind(current);
    if (valueKind === "number") {
      mask = union(mask, integerMask(reader, current));
    } else if (valueKind === "record") {
      frames.push({ kind: "record", value: current, keys: reader.keys(current), next: 0 });
    } else if (valueKind === "array") {
      frames.push({ kind: "array", value: current, length: reader.length(current), next: 0 });
    }

    // Retain only open container frames, bounded by admitted JSON depth (32).
    // Even mask 3 does not stop exact classification of subsequent numbers.
    let foundChild = false;
    while (frames.length !== 0) {
      const frame = frames[frames.length - 1]!;
      if (frame.kind === "record") {
        if (frame.next === frame.keys.length) { frames.pop(); continue; }
        const key = frame.keys[frame.next]!;
        frame.next += 1;
        const member = reader.own(frame.value, key);
        if (!member.present) continue;
        current = member.value;
      } else {
        if (frame.next === frame.length) { frames.pop(); continue; }
        current = reader.item(frame.value, frame.next);
        frame.next += 1;
      }
      foundChild = true;
      break;
    }
    if (!foundChild) return mask;
  }
}

/** Fold one final emitted owner, optionally visiting its separate child owners. */
function ownerMask<Value>(
  view: DocumentView<Value>,
  kind: DocumentKind,
  value: Value,
  path: Path,
  visitChild?: VisitChild<Value>,
): FailureMask {
  const reader = view.reader;
  // Clipping is a permanent ownership boundary, just like an unknown field
  // or an unrepresentable index. Probes and visits fold the same whole group.
  if (path.length === localPathCapacity(kind)) return stoppedMask(reader, value);
  const valueKind = reader.kind(value);
  if (valueKind === "number") return integerMask(reader, value);
  let mask: FailureMask = 0;

  function child(childValue: Value, childPath: Path): void {
    if (childPath.length === path.length) {
      mask = union(mask, stoppedMask(reader, childValue));
    } else {
      visitChild?.(childValue, childPath);
    }
  }

  if (valueKind === "record") {
    for (const key of reader.keys(value)) {
      const next = schemaSafeLocalPath(kind, [...path, key]);
      // A probe must not inspect a separate owner's value or descendants.
      if (visitChild === undefined && next.length !== path.length) continue;
      const member = reader.own(value, key);
      if (member.present) child(member.value, next);
    }
  } else if (valueKind === "array") {
    const length = reader.length(value);
    // Below the cap, every index 0..65535 belongs to a separate child owner,
    // including arrays supplied in record or scalar positions. A probe skips
    // that entire region without requesting item zero or rewinding its reader.
    const first = visitChild === undefined ? 65536 : 0;
    for (let index = first; index < length; index += 1) {
      const next = schemaSafeLocalPath(kind, [...path, index]);
      child(reader.item(value, index), next);
    }
  }
  return mask;
}

/**
 * Private precondition: the whole document is decoded, duplicate-free and
 * resource-admitted, and its reader preserves exact raw integer verdicts.
 *
 * Return only failures owned by the supplied final local address. Missing
 * paths, non-owner paths (including paths beyond the prefix-inclusive cap)
 * and incompatible containers return zero. Bits are 1 = invalid-type and
 * 2 = invalid-format. No schema validity is established.
 *
 * Normal schema probes follow forward array traversal order. Separate child
 * regions are skipped without rewinding. These probes plus one full visit cost
 * O((H + 1)(B + J)), including projection: H bounds traversed structural depth
 * and visible capacity, B is admitted byte work, and J is charged occurrences.
 * H is at most 32. Arbitrary repeated or backward queries are neither cached
 * nor covered by this bound.
 */
export function numericFailureMask<Value>(
  view: DocumentView<Value>,
  kind: "declaration" | "profile",
  safeLocalPath: readonly (string | number)[],
): 0 | 1 | 2 | 3 {
  if (safeLocalPath.length > localPathCapacity(kind)) return 0;
  const path = schemaSafeLocalPath(kind, safeLocalPath);
  if (path.length !== safeLocalPath.length) return 0;
  const reader = view.reader;
  let value = view.root;
  for (const segment of path) {
    if (typeof segment === "string") {
      if (reader.kind(value) !== "record") return 0;
      const member = reader.own(value, segment);
      if (!member.present) return 0;
      value = member.value;
    } else {
      if (reader.kind(value) !== "array" || !Number.isInteger(segment)
        || segment < 0 || segment >= reader.length(value)) return 0;
      value = reader.item(value, segment);
    }
  }
  return ownerMask(view, kind, value, path);
}

/**
 * The same private decoded/resource precondition as numericFailureMask applies.
 * Visit every raw number, including unsupported documents and regions ordinary
 * schema checks skip. Return true when any numeric admission failure exists.
 *
 * Projection retains a prefix of each duplicate-free occurrence path, giving
 * each final emitted owner one physical group. Unknown fields, overflow indexes
 * and the visible cap fold permanently into that group's two-bit mask.
 * Each group emits each reason at most once, after every number is classified.
 *
 * Every recursive visitOwner call adds exactly one retained segment, and capped
 * children are folded without another visitOwner call. Active visitOwner calls
 * therefore cover lengths 0..capacity-1: at most 30 for declarations or 31 for
 * profiles, including the root. Capped and stopped subtrees use iterative frames.
 * No diagnostic history is kept. Invocation prefixing, decode gating and ordinary
 * schema checks belong to callers.
 */
export function visitRawNumericFailures<Value>(
  view: DocumentView<Value>,
  kind: "declaration" | "profile",
  emit: (safeLocalPath: readonly (string | number)[], reason: "invalid-type" | "invalid-format") => void,
): boolean {
  const capacity = localPathCapacity(kind);
  let failed = false;
  function emitMask(path: Path, mask: FailureMask): void {
    if (mask === 0) return;
    failed = true;
    if ((mask & 1) !== 0) emit(path, "invalid-type");
    if ((mask & 2) !== 0) emit(path, "invalid-format");
  }
  function visitChild(value: Value, path: Path): void {
    if (path.length === capacity) {
      emitMask(path, ownerMask(view, kind, value, path));
    } else {
      visitOwner(value, path);
    }
  }
  function visitOwner(value: Value, path: Path): void {
    emitMask(path, ownerMask(view, kind, value, path, visitChild));
  }
  visitOwner(view.root, schemaSafeLocalPath(kind, []));
  return failed;
}
