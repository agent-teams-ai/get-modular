export type ExactInteger =
  | { readonly admitted: true; readonly value: number }
  | { readonly admitted: false; readonly reason: "invalid-type" | "invalid-format" };

const maximumSafeIntegerDigits = "9007199254740991";

type Coefficient = {
  readonly exponentStart: number;
  readonly fractionalDigits: number;
  readonly significantStart: number;
  readonly significantDigits: number;
  readonly trailingZeros: number;
};

function defined<T>(value: T | undefined): T {
  if (value === undefined) {throw new Error("Missing internal raw-integer byte");}
  return value;
}

function scanCoefficient(bytes: Uint8Array, start: number, end: number): Coefficient {
  let cursor = start;
  let fractional = false;
  let fractionalDigits = 0;
  let significantStart = end;
  let significantDigits = 0;
  let trailingZeros = 0;
  while (cursor < end) {
    const byte = defined(bytes[cursor]);
    if (byte === 0x65 || byte === 0x45) {break;}
    if (byte === 0x2e) {fractional = true;}
    else {
      if (fractional) {fractionalDigits += 1;}
      if (significantStart === end && byte !== 0x30) {significantStart = cursor;}
      if (significantStart !== end) {
        significantDigits += 1;
        trailingZeros = byte === 0x30 ? trailingZeros + 1 : 0;
      }
    }
    cursor += 1;
  }
  return { exponentStart: cursor, fractionalDigits, significantStart, significantDigits, trailingZeros };
}

function readExponent(bytes: Uint8Array, start: number, end: number, limit: number): number {
  if (start === end) {return 0;}
  let cursor = start + 1;
  const negative = bytes[cursor] === 0x2d;
  if (negative || bytes[cursor] === 0x2b) {cursor += 1;}
  let exponent = 0;
  while (cursor < end) {
    exponent = Math.min(limit, exponent * 10 + (defined(bytes[cursor]) - 0x30));
    cursor += 1;
  }
  return negative ? -exponent : exponent;
}

function normalizedDigit(bytes: Uint8Array, cursor: number, index: number,
  significantDigits: number): readonly [digit: number, cursor: number] {
  if (index >= significantDigits) {return [0, cursor];}
  const position = defined(bytes[cursor]) === 0x2e ? cursor + 1 : cursor;
  return [defined(bytes[position]) - 0x30, position + 1];
}

function exceedsSafeInteger(bytes: Uint8Array, start: number, significantDigits: number): boolean {
  let cursor = start;
  for (let index = 0; index < 16; index += 1) {
    const [digit, next] = normalizedDigit(bytes, cursor, index, significantDigits);
    cursor = next;
    const limitDigit = maximumSafeIntegerDigits.charCodeAt(index) - 0x30;
    if (digit > limitDigit) {return true;}
    if (digit < limitDigit) {return false;}
  }
  return false;
}

function materializeInteger(bytes: Uint8Array, start: number,
  significantDigits: number, integerDigits: number): number {
  let cursor = start;
  let value = 0;
  for (let index = 0; index < integerDigits; index += 1) {
    const [digit, next] = normalizedDigit(bytes, cursor, index, significantDigits);
    cursor = next;
    value = value * 10 + digit;
  }
  return value;
}

/**
 * Private admission of an owned, scanner-proven JSON number span.
 * The scanner guarantees 0 <= start < end <= bytes.length and valid syntax.
 * Field-specific schema bounds are checked separately.
 */
export function admitRawInteger(bytes: Uint8Array, start: number, end: number): ExactInteger {
  const negative = bytes[start] === 0x2d;
  const coefficient = scanCoefficient(bytes, start + (negative ? 1 : 0), end);

  // Zero's sign decides admission independently of every exponent spelling.
  if (coefficient.significantStart === end) {
    return negative
      ? { admitted: false, reason: "invalid-format" }
      : { admitted: true, value: 0 };
  }

  // Remove trailing zeros logically; the owned bytes remain unchanged.
  const significantDigits = coefficient.significantDigits - coefficient.trailingZeros;
  // The coefficient can offset an exponent by at most the token length.
  // Beyond this cap, cancellation still leaves either a fractional value
  // or more than 16 integer digits. Clamping preserves both decisions.
  const exponent = readExponent(bytes, coefficient.exponentStart, end, end - start + 17);

  const shift = exponent - coefficient.fractionalDigits + coefficient.trailingZeros;
  // The remaining coefficient ends in a nonzero digit, so a negative shift
  // proves non-integrality regardless of magnitude or floating-point rounding.
  if (shift < 0) {return { admitted: false, reason: "invalid-type" };}

  const integerDigits = significantDigits + shift;
  if (integerDigits > 16) {return { admitted: false, reason: "invalid-format" };}

  if (integerDigits === 16 && exceedsSafeInteger(bytes, coefficient.significantStart, significantDigits)) {
    return { admitted: false, reason: "invalid-format" };
  }

  // Integrality and the complete safe range are now proved. Convert at most
  // 16 digits; every intermediate integer is also exactly representable.
  const value = materializeInteger(bytes, coefficient.significantStart, significantDigits, integerDigits);
  return { admitted: true, value: negative ? -value : value };
}
