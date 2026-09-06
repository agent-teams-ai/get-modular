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
  if (value <= 0x7f) return 1;
  if (value <= 0x7ff) return 2;
  if (value <= 0xffff) return 3;
  return 4;
}

function isContinuation(byte: number): boolean {
  return byte >= 0x80 && byte <= 0xbf;
}

/** Return a Unicode scalar, or -1 for malformed or truncated UTF-8. */
function readScalar(bytes: Uint8Array, position: number, limit: number): number {
  const first = bytes[position] ?? -1;
  if (position >= limit || first < 0) return -1;
  if (first <= 0x7f) return first;

  const second = position + 1 < limit ? bytes[position + 1] ?? -1 : -1;
  if (!isContinuation(second)) return -1;
  if (first >= 0xc2 && first <= 0xdf) {
    return ((first & 0x1f) << 6) | (second & 0x3f);
  }

  const third = position + 2 < limit ? bytes[position + 2] ?? -1 : -1;
  if (!isContinuation(third)) return -1;
  if (first >= 0xe0 && first <= 0xef) {
    if ((first === 0xe0 && second < 0xa0) || (first === 0xed && second >= 0xa0)) return -1;
    return ((first & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f);
  }

  const fourth = position + 3 < limit ? bytes[position + 3] ?? -1 : -1;
  if (!isContinuation(fourth) || first < 0xf0 || first > 0xf4
    || (first === 0xf0 && second < 0x90) || (first === 0xf4 && second > 0x8f)) return -1;
  return ((first & 0x07) << 18) | ((second & 0x3f) << 12)
    | ((third & 0x3f) << 6) | (fourth & 0x3f);
}

function hexDigit(byte: number): number {
  if (byte >= 0x30 && byte <= 0x39) return byte - 0x30;
  if (byte >= 0x41 && byte <= 0x46) return byte - 0x41 + 10;
  if (byte >= 0x61 && byte <= 0x66) return byte - 0x61 + 10;
  return -1;
}

function readHexUnit(bytes: Uint8Array, start: number, limit: number): number {
  if (start + 4 > limit) return -1;
  let value = 0;
  for (let index = 0; index < 4; index += 1) {
    const digit = hexDigit(bytes[start + index] ?? -1);
    if (digit < 0) return -1;
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

function scanString(bytes: Uint8Array, start: number, limit: number, chunks: string[] | null): RawToken {
  if (start >= limit || bytes[start] !== 0x22) return invalidToken(start, start, limit);
  let position = start + 1;
  let decodedUtf8Bytes = 0;
  let wellFormedUtf16 = true;
  let pendingHighSurrogate = false;
  let chunk = "";

  while (position < limit) {
    const byte = bytes[position];
    if (byte === 0x22) {
      if (pendingHighSurrogate) {
        decodedUtf8Bytes += 3;
        wellFormedUtf16 = false;
      }
      if (chunks !== null && chunk.length > 0) chunks[chunks.length] = chunk;
      return { kind: "string", start, end: position + 1, decodedUtf8Bytes, wellFormedUtf16 };
    }

    let unit: number;
    if (byte === 0x5c) {
      if (position + 1 >= limit) return invalidToken(start, limit, limit);
      const escape = bytes[position + 1];
      if (escape === 0x75) {
        unit = readHexUnit(bytes, position + 2, limit);
        if (unit < 0) return invalidToken(start, position + 5, limit);
        position += 6;
      } else {
        unit = escapedUnit(escape ?? -1);
        if (unit < 0) return invalidToken(start, position + 1, limit);
        position += 2;
      }
    } else {
      if (byte === undefined || byte < 0x20) return invalidToken(start, position, limit);
      unit = readScalar(bytes, position, limit);
      if (unit < 0) return invalidToken(start, position, limit);
      position += scalarBytes(unit);
    }

    if (chunks !== null) {
      if (unit <= 0xffff) {
        chunk += fromCharCode(unit);
      } else {
        const supplementary = unit - 0x10000;
        chunk += fromCharCode(0xd800 + (supplementary >>> 10), 0xdc00 + (supplementary & 0x3ff));
      }
      // This is an output chunk size, not a resource limit. Surrogate code
      // units remain unchanged even when a chunk boundary separates a pair.
      if (chunk.length >= 4096) {
        chunks[chunks.length] = chunk;
        chunk = "";
      }
    }

    if (pendingHighSurrogate) {
      pendingHighSurrogate = false;
      if (unit >= 0xdc00 && unit <= 0xdfff) {
        decodedUtf8Bytes += 4;
        continue;
      }
      decodedUtf8Bytes += 3;
      wellFormedUtf16 = false;
    }
    if (unit >= 0xd800 && unit <= 0xdbff) {
      pendingHighSurrogate = true;
    } else {
      decodedUtf8Bytes += scalarBytes(unit);
      if (unit >= 0xdc00 && unit <= 0xdfff) wellFormedUtf16 = false;
    }
  }
  return invalidToken(start, limit, limit);
}

function scanNumber(bytes: Uint8Array, start: number): RawToken {
  const limit = bytes.length;
  let position = start;
  if (bytes[position] === 0x2d) position += 1;

  const leading = bytes[position];
  if (leading === 0x30) {
    position += 1;
    if (isDigit(bytes[position])) return invalidToken(start, position, limit);
  } else {
    if (leading === undefined || leading < 0x31 || leading > 0x39) {
      return invalidToken(start, position, limit);
    }
    do { position += 1; } while (isDigit(bytes[position]));
  }

  if (bytes[position] === 0x2e) {
    position += 1;
    if (!isDigit(bytes[position])) return invalidToken(start, position, limit);
    do { position += 1; } while (isDigit(bytes[position]));
  }
  if (bytes[position] === 0x65 || bytes[position] === 0x45) {
    position += 1;
    if (bytes[position] === 0x2b || bytes[position] === 0x2d) position += 1;
    if (!isDigit(bytes[position])) return invalidToken(start, position, limit);
    do { position += 1; } while (isDigit(bytes[position]));
  }
  if (!isBoundary(bytes[position])) return invalidToken(start, position, limit);
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
  if (!matches) return invalidToken(start, end - 1, bytes.length);
  if (!isBoundary(bytes[end])) return invalidToken(start, end, bytes.length);
  return { kind, start, end };
}

/** Iterative lexer with constant retained state; no document grammar or census. */
export function openOwnedRawTokenCursor(ownedBytes: Uint8Array): RawTokenCursor {
  const length = ownedBytes.length;
  let position = 0;
  let finished = false;

  function next(): RawToken {
    if (finished) return { kind: "end", start: length, end: length };
    while (position < length && isWhitespace(ownedBytes[position])) position += 1;
    if (position === length) {
      finished = true;
      return { kind: "end", start: length, end: length };
    }

    const start = position;
    const byte = ownedBytes[start];
    let token: RawToken;
    switch (byte) {
      case 0x7b: token = { kind: "object-start", start, end: start + 1 }; break;
      case 0x7d: token = { kind: "object-end", start, end: start + 1 }; break;
      case 0x5b: token = { kind: "array-start", start, end: start + 1 }; break;
      case 0x5d: token = { kind: "array-end", start, end: start + 1 }; break;
      case 0x3a: token = { kind: "colon", start, end: start + 1 }; break;
      case 0x2c: token = { kind: "comma", start, end: start + 1 }; break;
      case 0x22: token = scanString(ownedBytes, start, length, null); break;
      case 0x74: token = scanKeyword(ownedBytes, start, "true"); break;
      case 0x66: token = scanKeyword(ownedBytes, start, "false"); break;
      case 0x6e: token = scanKeyword(ownedBytes, start, "null"); break;
      default: {
        if (byte === 0x2d || isDigit(byte)) {
          token = scanNumber(ownedBytes, start);
        } else {
          // Non-ASCII outside strings is never JSON whitespace or syntax.
          // Include the complete UTF-8 BOM in its invalid span.
          const bom = byte === 0xef && ownedBytes[start + 1] === 0xbb && ownedBytes[start + 2] === 0xbf;
          token = invalidToken(start, start + (bom ? 2 : 0), length);
        }
      }
    }
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
      || token.start < 0 || token.end > length || token.end - token.start < 2) throw new TypeError();
    const chunks: string[] = [];
    const checked = scanString(ownedBytes, token.start, token.end, chunks);
    if (checked.kind !== "string" || checked.end !== token.end) throw new TypeError();
    return chunks.join("");
  }

  return Object.freeze({ next, decodeString });
}
