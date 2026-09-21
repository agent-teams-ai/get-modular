import type { RawToken, RawTokenCursor } from "../ports.js";

// Manual decoding uses this captured intrinsic, never JSON.parse or a platform
// decoder. Scanning with no output chunks constructs no decoded string.
const fromCharCode = String.fromCharCode;

function invalidToken(start: number, at: number, limit: number): RawToken {
  return { kind: "invalid", start, end: at < limit ? at + 1 : limit };
}

function isWhitespace(byte: number | undefined): boolean {
  return byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d;
}

function isDigit(byte: number | undefined): boolean {
  return byte !== undefined && byte >= 0x30 && byte <= 0x39;
}

function isBoundary(byte: number | undefined): boolean {
  // Delimit tokens without deciding whether their adjacency is legal in a
  // document. All punctuation and quotation marks are lexical boundaries.
  return byte === undefined || isWhitespace(byte)
    || byte === 0x7b || byte === 0x7d || byte === 0x5b || byte === 0x5d
    || byte === 0x3a || byte === 0x2c || byte === 0x22;
}

function scalarBytes(value: number): number {
  if (value <= 0x7f) {return 1;}
  if (value <= 0x7ff) {return 2;}
  if (value <= 0xffff) {return 3;}
  return 4;
}

function isContinuation(byte: number): boolean {
  return byte >= 0x80 && byte <= 0xbf;
}

function readTwoByteScalar(first: number, second: number): number {
  if (first < 0xc2 || first > 0xdf) {return -1;}
  return ((first & 0x1f) << 6) | (second & 0x3f);
}

function readThreeByteScalar(first: number, second: number, third: number): number {
  if (first < 0xe0 || first > 0xef || (first === 0xe0 && second < 0xa0)
    || (first === 0xed && second >= 0xa0)) {return -1;}
  return ((first & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f);
}

function readFourByteScalar(first: number, second: number, third: number, fourth: number): number {
  if (first < 0xf0 || first > 0xf4 || (first === 0xf0 && second < 0x90)
    || (first === 0xf4 && second > 0x8f)) {return -1;}
  return ((first & 0x07) << 18) | ((second & 0x3f) << 12)
    | ((third & 0x3f) << 6) | (fourth & 0x3f);
}

/** Return a Unicode scalar, or -1 for malformed or truncated UTF-8. */
function readScalar(bytes: Uint8Array, position: number, limit: number): number {
  const first = bytes[position] ?? -1;
  if (position >= limit || first < 0) {return -1;}
  if (first <= 0x7f) {return first;}

  const second = position + 1 < limit ? bytes[position + 1] ?? -1 : -1;
  if (!isContinuation(second)) {return -1;}
  const twoByte = readTwoByteScalar(first, second);
  if (twoByte >= 0) {return twoByte;}

  const third = position + 2 < limit ? bytes[position + 2] ?? -1 : -1;
  if (!isContinuation(third)) {return -1;}
  const threeByte = readThreeByteScalar(first, second, third);
  if (threeByte >= 0) {return threeByte;}

  const fourth = position + 3 < limit ? bytes[position + 3] ?? -1 : -1;
  return isContinuation(fourth) ? readFourByteScalar(first, second, third, fourth) : -1;
}

function hexDigit(byte: number): number {
  if (byte >= 0x30 && byte <= 0x39) {return byte - 0x30;}
  if (byte >= 0x41 && byte <= 0x46) {return byte - 0x41 + 10;}
  if (byte >= 0x61 && byte <= 0x66) {return byte - 0x61 + 10;}
  return -1;
}

function readHexUnit(bytes: Uint8Array, start: number, limit: number): number {
  if (start + 4 > limit) {return -1;}
  let value = 0;
  for (let index = 0; index < 4; index += 1) {
    const digit = hexDigit(bytes[start + index] ?? -1);
    if (digit < 0) {return -1;}
    value = value * 16 + digit;
  }
  return value;
}

function escapedUnit(byte: number): number {
  switch (byte) {
    case 0x22: return 0x22;
    case 0x5c: return 0x5c;
    case 0x2f: return 0x2f;
    case 0x62: return 0x08;
    case 0x66: return 0x0c;
    case 0x6e: return 0x0a;
    case 0x72: return 0x0d;
    case 0x74: return 0x09;
    default: return -1;
  }
}

type ScannedUnit = { readonly ok: true; readonly unit: number; readonly next: number }
  | { readonly ok: false; readonly invalidAt: number };

function scanStringUnit(bytes: Uint8Array, position: number, limit: number): ScannedUnit {
  const byte = bytes.at(position);
  if (byte === 0x5c) {
    if (position + 1 >= limit) {return { ok: false, invalidAt: limit };}
    const escape = bytes.at(position + 1);
    if (escape === undefined) {return { ok: false, invalidAt: limit };}
    if (escape === 0x75) {
      const unit = readHexUnit(bytes, position + 2, limit);
      return unit < 0 ? { ok: false, invalidAt: position + 5 } : { ok: true, unit, next: position + 6 };
    }
    const unit = escapedUnit(escape);
    return unit < 0 ? { ok: false, invalidAt: position + 1 } : { ok: true, unit, next: position + 2 };
  }
  if (byte === undefined || byte < 0x20) {return { ok: false, invalidAt: position };}
  const unit = readScalar(bytes, position, limit);
  return unit < 0 ? { ok: false, invalidAt: position } : { ok: true, unit, next: position + scalarBytes(unit) };
}

type StringState = {
  position: number;
  decodedUtf8Bytes: number;
  wellFormedUtf16: boolean;
  pendingHighSurrogate: boolean;
  chunk: string;
};

function appendStringUnit(chunks: string[] | null, state: StringState, unit: number): void {
  if (chunks === null) {return;}
  if (unit <= 0xffff) {state.chunk += fromCharCode(unit);}
  else {
    const supplementary = unit - 0x10000;
    state.chunk += fromCharCode(0xd800 + (supplementary >>> 10), 0xdc00 + (supplementary & 0x3ff));
  }
  if (state.chunk.length >= 4096) {
    chunks[chunks.length] = state.chunk;
    state.chunk = "";
  }
}

function accountStringUnit(state: StringState, unit: number): void {
  if (state.pendingHighSurrogate) {
    state.pendingHighSurrogate = false;
    if (unit >= 0xdc00 && unit <= 0xdfff) {state.decodedUtf8Bytes += 4; return;}
    state.decodedUtf8Bytes += 3;
    state.wellFormedUtf16 = false;
  }
  if (unit >= 0xd800 && unit <= 0xdbff) {state.pendingHighSurrogate = true;}
  else {
    state.decodedUtf8Bytes += scalarBytes(unit);
    if (unit >= 0xdc00 && unit <= 0xdfff) {state.wellFormedUtf16 = false;}
  }
}

function scanString(bytes: Uint8Array, start: number, limit: number, chunks: string[] | null): RawToken {
  if (start >= limit || bytes[start] !== 0x22) {return invalidToken(start, start, limit);}
  const state: StringState = { position: start + 1, decodedUtf8Bytes: 0, wellFormedUtf16: true,
    pendingHighSurrogate: false, chunk: "" };

  while (state.position < limit) {
    const byte = bytes[state.position];
    if (byte === 0x22) {
      if (state.pendingHighSurrogate) {
        state.decodedUtf8Bytes += 3;
        state.wellFormedUtf16 = false;
      }
      if (chunks !== null && state.chunk.length > 0) {chunks[chunks.length] = state.chunk;}
      return { kind: "string", start, end: state.position + 1,
        decodedUtf8Bytes: state.decodedUtf8Bytes, wellFormedUtf16: state.wellFormedUtf16 };
    }
    const scanned = scanStringUnit(bytes, state.position, limit);
    if (!scanned.ok) {return invalidToken(start, scanned.invalidAt, limit);}
    state.position = scanned.next;
    appendStringUnit(chunks, state, scanned.unit);
    accountStringUnit(state, scanned.unit);
  }
  return invalidToken(start, limit, limit);
}

function scanNumber(bytes: Uint8Array, start: number): RawToken {
  const limit = bytes.length;
  let position = start;
  if (bytes[position] === 0x2d) {position += 1;}

  const leading = bytes.at(position);
  if (leading === 0x30) {
    position += 1;
    if (isDigit(bytes[position])) {return invalidToken(start, position, limit);}
  } else {
    if (leading === undefined || leading < 0x31 || leading > 0x39) {
      return invalidToken(start, position, limit);
    }
    do { position += 1; } while (isDigit(bytes[position]));
  }

  if (bytes[position] === 0x2e) {
    position += 1;
    if (!isDigit(bytes[position])) {return invalidToken(start, position, limit);}
    do { position += 1; } while (isDigit(bytes[position]));
  }
  if (bytes[position] === 0x65 || bytes[position] === 0x45) {
    position += 1;
    if (bytes[position] === 0x2b || bytes[position] === 0x2d) {position += 1;}
    if (!isDigit(bytes[position])) {return invalidToken(start, position, limit);}
    do { position += 1; } while (isDigit(bytes[position]));
  }
  if (!isBoundary(bytes[position])) {return invalidToken(start, position, limit);}
  // Preserve only the lexeme's byte span. Exact numeric admission belongs to
  // input-admission; no conversion, rounding or exponent expansion occurs.
  return { kind: "number", start, end: position };
}

function scanKeyword(bytes: Uint8Array, start: number, kind: "true" | "false" | "null"): RawToken {
  const end = start + (kind === "false" ? 5 : 4);
  const matches = kind === "true"
    ? bytes[start + 1] === 0x72 && bytes[start + 2] === 0x75 && bytes[start + 3] === 0x65
    : kind === "false"
      ? bytes[start + 1] === 0x61 && bytes[start + 2] === 0x6c
        && bytes[start + 3] === 0x73 && bytes[start + 4] === 0x65
      : bytes[start + 1] === 0x75 && bytes[start + 2] === 0x6c && bytes[start + 3] === 0x6c;
  if (!matches) {return invalidToken(start, end - 1, bytes.length);}
  if (!isBoundary(bytes[end])) {return invalidToken(start, end, bytes.length);}
  return { kind, start, end };
}

function tokenAt(bytes: Uint8Array, start: number): RawToken {
  const byte = bytes[start];
  switch (byte) {
    case 0x7b: return { kind: "object-start", start, end: start + 1 };
    case 0x7d: return { kind: "object-end", start, end: start + 1 };
    case 0x5b: return { kind: "array-start", start, end: start + 1 };
    case 0x5d: return { kind: "array-end", start, end: start + 1 };
    case 0x3a: return { kind: "colon", start, end: start + 1 };
    case 0x2c: return { kind: "comma", start, end: start + 1 };
    case 0x22: return scanString(bytes, start, bytes.length, null);
    case 0x74: return scanKeyword(bytes, start, "true");
    case 0x66: return scanKeyword(bytes, start, "false");
    case 0x6e: return scanKeyword(bytes, start, "null");
    default: {
      if (byte === 0x2d || isDigit(byte)) {return scanNumber(bytes, start);}
      const bom = byte === 0xef && bytes[start + 1] === 0xbb && bytes[start + 2] === 0xbf;
      return invalidToken(start, start + (bom ? 2 : 0), bytes.length);
    }
  }
}

/** Iterative lexer with constant retained state; no document grammar or census. */
export function openOwnedRawTokenCursor(ownedBytes: Uint8Array): RawTokenCursor {
  const length = ownedBytes.length;
  let position = 0;
  let finished = false;

  function next(): RawToken {
    if (finished) {return { kind: "end", start: length, end: length };}
    while (position < length && isWhitespace(ownedBytes[position])) {position += 1;}
    if (position === length) {
      finished = true;
      return { kind: "end", start: length, end: length };
    }

    const start = position;
    const token = tokenAt(ownedBytes, start);
    if (token.kind === "invalid") {
      finished = true;
      position = length;
    } else {
      position = token.end;
    }
    return token;
  }

  function decodeString(token: Extract<RawToken, { readonly kind: "string" }>): string {
    // Only same-cursor string tokens over unchanged owned bytes are admitted.
    // Violating that internal precondition is not a lexical diagnostic.
    if (!Number.isInteger(token.start) || !Number.isInteger(token.end)
      || token.start < 0 || token.end > length || token.end - token.start < 2) {throw new TypeError("Invalid string token span");}
    const chunks: string[] = [];
    const checked = scanString(ownedBytes, token.start, token.end, chunks);
    if (checked.kind !== "string" || checked.end !== token.end) {throw new TypeError("String token no longer matches owned bytes");}
    return chunks.join("");
  }

  return Object.freeze({ next, decodeString });
}
