import { schemaSafeLocalPath } from "./document-shape.js";
import type { RawScannerPort, RawToken, RawTokenCursor } from "./ports.js";

type Path = readonly (string | number)[];
type Span = { readonly start: number; readonly end: number };
type Group = { readonly spans: Span[]; duplicate: boolean };
type ReplayCursor = { readonly source: RawTokenCursor; readonly base: number; readonly end: number };
type ArrayCursor = { readonly cursor: ReplayCursor; current: RawToken };
type FoldFrame = { readonly keys: Set<string> | null; keyExpected: boolean };

function defined<T>(value: T | undefined): T {
  if (value === undefined) {throw new Error("Missing internal duplicate-replay value");}
  return value;
}
type RawDuplicateReplayStatistics = {
  readonly tokenVisits: number;
  readonly arrayCursorSteps: number;
  readonly peakGroupDepth: number;
  readonly peakLiveSpans: number;
  readonly peakLiveCursors: number;
};
type ReplayState = {
  readonly ownedBytes: Uint8Array;
  readonly scanner: RawScannerPort;
  readonly kind: "declaration" | "profile";
  readonly emit: (safeLocalPath: readonly (string | number)[]) => void;
  readonly localCapacity: number;
  tokenVisits: number;
  arrayCursorSteps: number;
  liveSpans: number;
  liveCursors: number;
  peakGroupDepth: number;
  peakLiveSpans: number;
  peakLiveCursors: number;
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

function admits(state: ReplayState, path: Path, segment: string | number): boolean {
  return schemaSafeLocalPath(state.kind, [...path, segment]).length === path.length + 1;
}

function retainSpan(state: ReplayState, group: Group, span: Span): void {
  group.spans.push(span);
  state.liveSpans += 1;
  state.peakLiveSpans = Math.max(state.peakLiveSpans, state.liveSpans);
}

function open(state: ReplayState, span: Span): ReplayCursor {
  const source = state.scanner.open(state.ownedBytes.subarray(span.start, span.end));
  state.liveCursors += 1;
  state.peakLiveCursors = Math.max(state.peakLiveCursors, state.liveCursors);
  return { source, base: span.start, end: span.end };
}

function releaseCursor(state: ReplayState): void {
  state.liveCursors -= 1;
}

function read(state: ReplayState, cursor: ReplayCursor): RawToken {
  state.tokenVisits += 1;
  const current = cursor.source.next();
  if (current.kind === "invalid") {invalidReplay();}
  return current;
}

function capture(state: ReplayState, cursor: ReplayCursor, first: RawToken): Span {
  if (!isValue(first)) {invalidReplay();}
  let end = cursor.base + first.end;
  if (isContainer(first)) {
    let depth = 1;
    while (depth !== 0) {
      const current = read(state, cursor);
      if (current.kind === "end") { end = cursor.end; break; }
      if (isContainer(current)) {depth += 1;}
      else if (current.kind === "object-end" || current.kind === "array-end") {depth -= 1;}
      end = cursor.base + current.end;
    }
  }
  return { start: cursor.base + first.start, end };
}

function fold(state: ReplayState, cursor: ReplayCursor, first: RawToken): boolean {
  if (!isValue(first)) {invalidReplay();}
  if (!isContainer(first)) {return false;}
  const frames: FoldFrame[] = [{
    keys: first.kind === "object-start" ? new Set<string>() : null,
    keyExpected: true,
  }];
  let duplicate = false;
  while (frames.length !== 0) {
    const current = read(state, cursor);
    if (current.kind === "end") {break;}
    if (isContainer(current)) {
      frames.push({ keys: current.kind === "object-start" ? new Set<string>() : null, keyExpected: true });
    } else if (current.kind === "object-end" || current.kind === "array-end") {frames.pop();}
    else {
      const frame = defined(frames[frames.length - 1]);
      if (current.kind === "comma") {frame.keyExpected = true;}
      else if (current.kind === "string" && frame.keys !== null && frame.keyExpected) {
        const key = cursor.source.decodeString(current);
        if (frame.keys.has(key)) {duplicate = true;}
        else {frame.keys.add(key);}
        frame.keyExpected = false;
      }
    }
  }
  return duplicate;
}

function collectRecord(state: ReplayState, cursor: ReplayCursor, path: Path,
  owner: Group, fields: Map<string, Group>): void {
  const keys = new Set<string>();
  let current = read(state, cursor);
  while (current.kind !== "end" && current.kind !== "object-end") {
    if (current.kind !== "string") {invalidReplay();}
    const key = cursor.source.decodeString(current);
    const repeated = keys.has(key);
    if (!repeated) {keys.add(key);}
    let child: Group | undefined;
    if (admits(state, path, key)) {
      child = fields.get(key);
      if (child === undefined) {child = newGroup(); fields.set(key, child);}
      if (repeated) {child.duplicate = true;}
    } else if (repeated) {owner.duplicate = true;}

    current = read(state, cursor);
    if (current.kind === "end") {return;}
    if (current.kind !== "colon") {invalidReplay();}
    current = read(state, cursor);
    if (current.kind === "end") {return;}
    if (child !== undefined) {retainSpan(state, child, capture(state, cursor, current));}
    else if (fold(state, cursor, current)) {owner.duplicate = true;}

    current = read(state, cursor);
    if (current.kind === "comma") {current = read(state, cursor);}
    else if (current.kind !== "object-end" && current.kind !== "end") {invalidReplay();}
  }
}

function foldTerminalGroup(state: ReplayState, path: Path, group: Group): void {
  while (group.spans.length !== 0) {
    const span = group.spans.pop()!;
    state.liveSpans -= 1;
    const cursor = open(state, span);
    if (fold(state, cursor, read(state, cursor))) {group.duplicate = true;}
    releaseCursor(state);
  }
  if (group.duplicate) {state.emit(Object.freeze([...path]));}
}

function collectGroupSpans(state: ReplayState, path: Path, group: Group,
  fields: Map<string, Group>, arrays: ArrayCursor[]): void {
  while (group.spans.length !== 0) {
    const span = group.spans.pop()!;
    state.liveSpans -= 1;
    const cursor = open(state, span);
    const first = read(state, cursor);
    if (first.kind === "object-start") {collectRecord(state, cursor, path, group, fields);}
    else if (first.kind === "array-start" && admits(state, path, 0)) {
      const current = read(state, cursor);
      if (current.kind !== "array-end" && current.kind !== "end") {arrays.push({ cursor, current }); continue;}
    } else if (first.kind === "array-start") {
      if (fold(state, cursor, first)) {group.duplicate = true;}
    } else if (!isValue(first)) {invalidReplay();}
    releaseCursor(state);
  }
}

function advanceArrayCursor(state: ReplayState, active: ArrayCursor): RawToken {
  let current = read(state, active.cursor);
  if (current.kind === "comma") {current = read(state, active.cursor);}
  else if (current.kind !== "array-end" && current.kind !== "end") {invalidReplay();}
  return current;
}

function visitArrays(state: ReplayState, path: Path, group: Group, arrays: ArrayCursor[]): void {
  let index = 0;
  let projectItems = true;
  while (arrays.length !== 0) {
    if (projectItems && !admits(state, path, index)) {projectItems = false;}
    const child = projectItems ? newGroup() : null;
    for (let position = 0; position < arrays.length;) {
      const active = defined(arrays[position]);
      state.arrayCursorSteps += 1;
      if (child !== null) {retainSpan(state, child, capture(state, active.cursor, active.current));}
      else if (fold(state, active.cursor, active.current)) {group.duplicate = true;}
      const current = advanceArrayCursor(state, active);
      if (current.kind === "array-end" || current.kind === "end") {
        releaseCursor(state);
        const last = arrays.pop()!;
        if (position < arrays.length) {arrays[position] = last;}
      } else {active.current = current; position += 1;}
    }
    if (child !== null) {visit(state, [...path, index], child);}
    index += 1;
  }
}

function visit(state: ReplayState, path: Path, group: Group): void {
  state.peakGroupDepth = Math.max(state.peakGroupDepth, path.length + 1);
  if (path.length === state.localCapacity) {foldTerminalGroup(state, path, group); return;}
  const fields = new Map<string, Group>();
  const arrays: ArrayCursor[] = [];
  collectGroupSpans(state, path, group, fields, arrays);
  for (const [key, child] of fields) {
    fields.delete(key);
    visit(state, [...path, key], child);
  }
  visitArrays(state, path, group, arrays);
  if (group.duplicate) {state.emit(Object.freeze([...path]));}
}

/**
 * Replay only the committed prefix reported by scanRawDocument over these same
 * unchanged, owned fixed bytes and this scanner. An unfinished rightmost value
 * is a span ending at that prefix; no closing event is manufactured.
 *
 * For committed byte work B, charged occurrences J and traversed local height H,
 * replay costs O((H + 1)(B + J)), including path projection. H is at most 31.
 */
export function visitRawDuplicatePaths(ownedBytes: Uint8Array, scanner: RawScannerPort,
  observedEnd: number, kind: "declaration" | "profile",
  emit: (safeLocalPath: readonly (string | number)[]) => void): RawDuplicateReplayStatistics {
  if (!Number.isInteger(observedEnd) || observedEnd < 0 || observedEnd > ownedBytes.length) {invalidReplay();}
  const state: ReplayState = {
    ownedBytes, scanner, kind, emit, localCapacity: kind === "declaration" ? 30 : 31,
    tokenVisits: 0, arrayCursorSteps: 0, liveSpans: 0, liveCursors: 0,
    peakGroupDepth: 0, peakLiveSpans: 0, peakLiveCursors: 0,
  };
  if (observedEnd !== 0) {
    const root = newGroup();
    retainSpan(state, root, { start: 0, end: observedEnd });
    visit(state, [], root);
  }
  if (state.liveSpans !== 0 || state.liveCursors !== 0) {invalidReplay();}
  return Object.freeze({ tokenVisits: state.tokenVisits, arrayCursorSteps: state.arrayCursorSteps,
    peakGroupDepth: state.peakGroupDepth, peakLiveSpans: state.peakLiveSpans,
    peakLiveCursors: state.peakLiveCursors });
}
