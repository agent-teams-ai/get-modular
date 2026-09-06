export type ExactInteger =
  | { readonly admitted: true; readonly value: number }
  | { readonly admitted: false; readonly reason: "invalid-type" | "invalid-format" };

const maximumSafeIntegerDigits = "9007199254740991";

/**
 * Private admission of an owned, scanner-proven JSON number span.
 * The scanner guarantees 0 <= start < end <= bytes.length and valid syntax.
 * Field-specific schema bounds are checked separately.
 */
export function admitRawInteger(bytes: Uint8Array, start: number, end: number): ExactInteger {
  const negative = bytes[start] === 0x2d;
  let cursor = start + (negative ? 1 : 0);
  let fractional = false;
  let fractionalDigits = 0;
  let significantStart = end;
  let significantDigits = 0;
  let trailingZeros = 0;

  // Count coefficient digits without copying them or converting their value.
  while (cursor < end) {
    const byte = bytes[cursor]!;
    if (byte === 0x65 || byte === 0x45) break;
    if (byte === 0x2e) {
      fractional = true;
    } else {
      if (fractional) fractionalDigits++;
      if (significantStart === end && byte !== 0x30) significantStart = cursor;
      if (significantStart !== end) {
        significantDigits++;
        trailingZeros = byte === 0x30 ? trailingZeros + 1 : 0;
      }
    }
    cursor++;
  }

  // Zero's sign decides admission independently of every exponent spelling.
  if (significantStart === end) {
    return negative
      ? { admitted: false, reason: "invalid-format" }
      : { admitted: true, value: 0 };
  }

  // Remove trailing zeros logically; the owned bytes remain unchanged.
  significantDigits -= trailingZeros;
  let exponent = 0;
  if (cursor < end) {
    cursor++;
    const exponentNegative = bytes[cursor] === 0x2d;
    if (exponentNegative || bytes[cursor] === 0x2b) cursor++;

    // The coefficient can offset an exponent by at most the token length.
    // Beyond this cap, cancellation still leaves either a fractional value
    // or more than 16 integer digits. Clamping preserves both decisions.
    const exponentLimit = end - start + 17;
    while (cursor < end) {
      exponent = Math.min(exponentLimit, exponent * 10 + (bytes[cursor]! - 0x30));
      cursor++;
    }
    if (exponentNegative) exponent = -exponent;
  }

  const shift = exponent - fractionalDigits + trailingZeros;
  // The remaining coefficient ends in a nonzero digit, so a negative shift
  // proves non-integrality regardless of magnitude or floating-point rounding.
  if (shift < 0) return { admitted: false, reason: "invalid-type" };

  const integerDigits = significantDigits + shift;
  if (integerDigits > 16) return { admitted: false, reason: "invalid-format" };

  if (integerDigits === 16) {
    cursor = significantStart;
    for (let index = 0; index < 16; index++) {
      // Read the normalized integer lazily, supplying shifted zeros without
      // expanding the exponent or allocating a coefficient buffer.
      let digit = 0;
      if (index < significantDigits) {
        if (bytes[cursor] === 0x2e) cursor++;
        digit = bytes[cursor]! - 0x30;
        cursor++;
      }
      const limitDigit = maximumSafeIntegerDigits.charCodeAt(index) - 0x30;
      if (digit > limitDigit) return { admitted: false, reason: "invalid-format" };
      if (digit < limitDigit) break;
    }
  }

  // Integrality and the complete safe range are now proved. Convert at most
  // 16 digits; every intermediate integer is also exactly representable.
  let value = 0;
  cursor = significantStart;
  for (let index = 0; index < integerDigits; index++) {
    let digit = 0;
    if (index < significantDigits) {
      if (bytes[cursor] === 0x2e) cursor++;
      digit = bytes[cursor]! - 0x30;
      cursor++;
    }
    value = value * 10 + digit;
  }
  return { admitted: true, value: negative ? -value : value };
}
