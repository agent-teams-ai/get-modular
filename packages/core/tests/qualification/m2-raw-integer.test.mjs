import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { admitRawInteger } from "../../dist-test/features/input-admission/raw-integer.js";

const { rawNumberCases } = JSON.parse(readFileSync(new URL(
  "../../../../architecture/qualification/implementation-clarifications/cases.json", import.meta.url), "utf8"));
const encode = new TextEncoder();

test("actual integer admission executes every accepted exact-number projection", () => {
  assert.equal(rawNumberCases.length, 26);
  for (const { lexeme, expected } of rawNumberCases) {
    const bytes = encode.encode(`xx${lexeme}yy`);
    // This private component owns the scalar verdict. Diagnostic construction
    // and its complete expected result belong to the later admission replay.
    if (!expected.admitted) assert.equal(expected.code, "schema.invalid-value");
    const projection = expected.admitted ? expected
      : { admitted: false, reason: expected.reason };
    assert.deepEqual(admitRawInteger(bytes, 2, bytes.length - 2), projection, lexeme);
  }
});

test("actual integer admission agrees with bounded independent rational arithmetic", () => {
  // Test-only BigInt arithmetic provides an independent oracle. Production is
  // required to decide the same result without BigInt or exponent expansion.
  const maximum = 9007199254740991n;
  const coefficients = [0n, 1n, 9n, 10n, 101n, 102400n,
    maximum - 1n, maximum, maximum + 1n, maximum * 10n, maximum * 10n + 1n];
  let count = 0;
  for (const coefficient of coefficients) for (const fraction of [0, 1, 2, 8, 17]) {
    const digits = coefficient.toString().padStart(fraction + 1, "0");
    const decimal = fraction === 0 ? digits : `${digits.slice(0, -fraction)}.${digits.slice(-fraction)}`;
    for (const exponent of [-35, -17, -2, -1, 0, 1, 2, 17, 35]) for (const negative of [false, true]) {
      const lexeme = `${negative ? "-" : ""}${decimal}e${exponent}`;
      const shift = exponent - fraction;
      const numerator = coefficient * (shift > 0 ? 10n ** BigInt(shift) : 1n);
      const denominator = shift < 0 ? 10n ** BigInt(-shift) : 1n;
      let expected;
      if (coefficient === 0n && negative) expected = { admitted: false, reason: "invalid-format" };
      else if (numerator % denominator !== 0n) expected = { admitted: false, reason: "invalid-type" };
      else if (numerator / denominator > maximum) expected = { admitted: false, reason: "invalid-format" };
      else expected = { admitted: true, value: Number(numerator / denominator) * (negative ? -1 : 1) };
      const bytes = encode.encode(lexeme);
      assert.deepEqual(admitRawInteger(bytes, 0, bytes.length), expected, lexeme);
      count += 1;
    }
  }
  assert.equal(count, 990);
});
