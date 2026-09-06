import { schemaSafeLocalPath } from "./document-shape.js";
import type { RawScannerPort, RawToken, RawTokenCursor } from "./ports.js";

type Path = readonly (string | number)[];
type Span = { readonly start: number; readonly end: number };
type Group = { readonly spans: Span[]; duplicate: boolean };
type ReplayCursor = {
  readonly source: RawTokenCursor;
  readonly base: number;
  readonly end: number;
};
type ArrayCursor = { readonly cursor: ReplayCursor; current: RawToken };
type FoldFrame = { readonly keys: Set<string> | null; keyExpected: boolean };
type RawDuplicateReplayStatistics = {
  readonly tokenVisits: number;
  readonly arrayCursorSteps: number;
  readonly peakGroupDepth: number;
  readonly peakLiveSpans: number;
  readonly peakLiveCursors: number;
};

function invalidReplay(): never {
  throw new TypeError("Invalid raw duplicate replay access");
}

function isContainer(current: RawToken): boolean {
  return current.kind === "object-start" || current.kind === "array-start";
}

function isValue(current: RawToken): boolean {
  return isContainer(current) || current.kind === "string" || current.kind === "number"
    || current.kind === "true" || current.kind === "false" || current.kind === "null";
}

function newGroup(): Group {
  return { spans: [], duplicate: false };
}

/**
 * Replay only the committed prefix reported by scanRawDocument over these same
 * unchanged, owned fixed bytes and this scanner. An unfinished rightmost value
 * is a span ending at that prefix; no closing event is manufactured.
 *
 * Pending spans describe admitted value occurrences, including non-failing ones.
 * Active cursors describe physical array occurrences. Both populations are
 * bounded by the successfully charged input prefix, never a schema dimension or
 * a diagnostic count. Decoded key sets belong to separate physical objects.
 *
 * Numeric fallback can preserve paths through malformed nesting. Each recursive
 * child adds exactly one visible segment; the terminal branch at local capacity
 * limits active group calls to 31 for declarations and 32 for profiles, including
 * the root. Preflight admits at most 32 raw containers. Unknown, index-overflow
 * and clipped subtrees use iterative folds.
 *
 * For committed byte work B, charged occurrences J and traversed local height H,
 * replay costs O((H + 1)(B + J)), including path projection. H is at most 31;
 * shallow valid schema depth is not a bound on malformed diagnostic paths.
 */
export function visitRawDuplicatePaths(
  ownedBytes: Uint8Array,
  scanner: RawScannerPort,
  observedEnd: number,
  kind: "declaration" | "profile",
  emit: (safeLocalPath: readonly (string | number)[]) => void,
): RawDuplicateReplayStatistics {
  if (!Number.isInteger(observedEnd) || observedEnd < 0 || observedEnd > ownedBytes.length) invalidReplay();
  // Admitted invocation prefixes consume two declaration segments or one profile segment.
  const localCapacity = kind === "declaration" ? 30 : 31;
  let tokenVisits = 0;
  let arrayCursorSteps = 0;
  let liveSpans = 0;
  let liveCursors = 0;
  let peakGroupDepth = 0;
  let peakLiveSpans = 0;
  let peakLiveCursors = 0;

  function admits(path: Path, segment: string | number): boolean {
    return schemaSafeLocalPath(kind, [...path, segment]).length === path.length + 1;
  }

  function retainSpan(group: Group, span: Span): void {
    group.spans.push(span);
    liveSpans += 1;
    peakLiveSpans = Math.max(peakLiveSpans, liveSpans);
  }

  function open(span: Span): ReplayCursor {
    const source = scanner.open(ownedBytes.subarray(span.start, span.end));
    liveCursors += 1;
    peakLiveCursors = Math.max(peakLiveCursors, liveCursors);
    return { source, base: span.start, end: span.end };
  }

  function releaseCursor(): void {
    liveCursors -= 1;
  }

  function read(cursor: ReplayCursor): RawToken {
    tokenVisits += 1;
    const current = cursor.source.next();
    if (current.kind === "invalid") invalidReplay();
    return current;
  }

  // Consume a value without indexing its descendants. Only an unfinished value
  // can reach end before its closing event, and it occupies the remaining prefix.
  function capture(cursor: ReplayCursor, first: RawToken): Span {
    if (!isValue(first)) invalidReplay();
    let end = cursor.base + first.end;
    if (isContainer(first)) {
      let depth = 1;
      while (depth !== 0) {
        const current = read(cursor);
        if (current.kind === "end") { end = cursor.end; break; }
        if (isContainer(current)) depth += 1;
        else if (current.kind === "object-end" || current.kind === "array-end") depth -= 1;
        end = cursor.base + current.end;
      }
    }
    return { start: cursor.base + first.start, end };
  }

  // Projection has stopped permanently. All duplicates anywhere in this value
  // belong to the current owner, even if a descendant uses a known field name.
  function fold(cursor: ReplayCursor, first: RawToken): boolean {
    if (!isValue(first)) invalidReplay();
    if (!isContainer(first)) return false;
    const frames: FoldFrame[] = [{
      keys: first.kind === "object-start" ? new Set<string>() : null,
      keyExpected: true,
    }];
    let duplicate = false;
    while (frames.length !== 0) {
      const current = read(cursor);
      if (current.kind === "end") break;
      if (isContainer(current)) {
        frames.push({
          keys: current.kind === "object-start" ? new Set<string>() : null,
          keyExpected: true,
        });
      } else if (current.kind === "object-end" || current.kind === "array-end") {
        frames.pop();
      } else {
        const frame = frames[frames.length - 1]!;
        if (current.kind === "comma") frame.keyExpected = true;
        else if (current.kind === "string" && frame.keys !== null && frame.keyExpected) {
          const key = cursor.source.decodeString(current);
          if (frame.keys.has(key)) duplicate = true;
          else frame.keys.add(key);
          frame.keyExpected = false;
        }
      }
    }
    return duplicate;
  }

  function collectRecord(
    cursor: ReplayCursor,
    path: Path,
    owner: Group,
    fields: Map<string, Group>,
  ): void {
    // Never share this set with another physical record in the same group.
    const keys = new Set<string>();
    let current = read(cursor);
    while (current.kind !== "end" && current.kind !== "object-end") {
      if (current.kind !== "string") invalidReplay();
      const key = cursor.source.decodeString(current);
      const repeated = keys.has(key);
      if (!repeated) keys.add(key);
      let child: Group | undefined;
      if (admits(path, key)) {
        child = fields.get(key);
        if (child === undefined) {
          child = newGroup();
          fields.set(key, child);
        }
        if (repeated) child.duplicate = true;
      } else if (repeated) owner.duplicate = true;

      // The key observation is complete before either of these reads. Keep its
      // flag even when the committed prefix contains no colon or no value.
      current = read(cursor);
      if (current.kind === "end") return;
      if (current.kind !== "colon") invalidReplay();
      current = read(cursor);
      if (current.kind === "end") return;
      if (child !== undefined) retainSpan(child, capture(cursor, current));
      else if (fold(cursor, current)) owner.duplicate = true;

      current = read(cursor);
      if (current.kind === "comma") current = read(cursor);
      else if (current.kind !== "object-end" && current.kind !== "end") invalidReplay();
    }
  }

  function visit(path: Path, group: Group): void {
    peakGroupDepth = Math.max(peakGroupDepth, path.length + 1);
    if (path.length === localCapacity) {
      // All descendants now have this final emitted address. Fold every physical
      // span independently, preserving a duplicate already committed at its key
      // even when its colon or value contributed no span.
      while (group.spans.length !== 0) {
        const span = group.spans.pop()!;
        liveSpans -= 1;
        const cursor = open(span);
        if (fold(cursor, read(cursor))) group.duplicate = true;
        releaseCursor();
      }
      if (group.duplicate) emit(Object.freeze([...path]));
      return;
    }

    // This map can contain only the finite fields admitted at this schema path.
    const fields = new Map<string, Group>();
    const arrays: ArrayCursor[] = [];
    while (group.spans.length !== 0) {
      const span = group.spans.pop()!;
      liveSpans -= 1;
      const cursor = open(span);
      const first = read(cursor);
      if (first.kind === "object-start") {
        collectRecord(cursor, path, group, fields);
      } else if (first.kind === "array-start" && admits(path, 0)) {
        const current = read(cursor);
        if (current.kind !== "array-end" && current.kind !== "end") {
          arrays.push({ cursor, current });
          continue;
        }
      } else if (first.kind === "array-start") {
        if (fold(cursor, first)) group.duplicate = true;
      } else if (!isValue(first)) invalidReplay();
      releaseCursor();
    }

    for (const [key, child] of fields) {
      fields.delete(key);
      visit([...path, key], child);
    }

    let index = 0;
    let projectItems = true;
    while (arrays.length !== 0) {
      if (projectItems && !admits(path, index)) projectItems = false;
      const child = projectItems ? newGroup() : null;
      for (let position = 0; position < arrays.length;) {
        const active = arrays[position]!;
        // Every inspected active cursor consumes one actual element. Exhausted
        // cursors are removed here, so unequal lengths cannot multiply work.
        arrayCursorSteps += 1;
        if (child !== null) retainSpan(child, capture(active.cursor, active.current));
        else if (fold(active.cursor, active.current)) group.duplicate = true;

        let current = read(active.cursor);
        if (current.kind === "comma") current = read(active.cursor);
        else if (current.kind !== "array-end" && current.kind !== "end") invalidReplay();
        if (current.kind === "array-end" || current.kind === "end") {
          releaseCursor();
          const last = arrays.pop()!;
          if (position < arrays.length) arrays[position] = last;
        } else {
          active.current = current;
          position += 1;
        }
      }
      if (child !== null) visit([...path, index], child);
      index += 1;
    }

    // Every physical observation at this projected address is now accounted
    // for. No emitted path or diagnostic history survives this group.
    if (group.duplicate) emit(Object.freeze([...path]));
  }

  if (observedEnd !== 0) {
    const root = newGroup();
    retainSpan(root, { start: 0, end: observedEnd });
    visit([], root);
  }
  if (liveSpans !== 0 || liveCursors !== 0) invalidReplay();
  return Object.freeze({ tokenVisits, arrayCursorSteps, peakGroupDepth, peakLiveSpans, peakLiveCursors });
}
