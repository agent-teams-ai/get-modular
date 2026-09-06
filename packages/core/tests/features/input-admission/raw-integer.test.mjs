import assert from "node:assert/strict";
import test from "node:test";
import { admitRawInteger } from "../../../dist-test/features/input-admission/raw-integer.js";

const encoder = new TextEncoder();

function assertCases(cases) {
  for (const [lexeme, expected] of cases) {
    const bytes = encoder.encode(lexeme);
    assert.deepEqual(admitRawInteger(bytes, 0, bytes.length), expected, lexeme);
  }
}

// Literal ADR-0018 scalar projections, including both rejection reasons.
// These are numeric admission expectations, not field-specific schema verdicts.
const acceptedProjections = [
  ["0", { admitted: true, value: 0 }],
  ["0.0", { admitted: true, value: 0 }],
  ["0e999999999999999999999999", { admitted: true, value: 0 }],
  ["1", { admitted: true, value: 1 }],
  ["1.0", { admitted: true, value: 1 }],
  ["1e0", { admitted: true, value: 1 }],
  ["10e-1", { admitted: true, value: 1 }],
  ["1.0000000000000000", { admitted: true, value: 1 }],
  ["-1.0", { admitted: true, value: -1 }],
  ["9007199254740991", { admitted: true, value: 9007199254740991 }],
  ["-9007199254740991", { admitted: true, value: -9007199254740991 }],
  ["90071992547409910e-1", { admitted: true, value: 9007199254740991 }],
  ["1.0000000000000001", { admitted: false, reason: "invalid-type" }],
  ["-1.0000000000000001", { admitted: false, reason: "invalid-type" }],
  ["1e-400", { admitted: false, reason: "invalid-type" }],
  ["-1e-400", { admitted: false, reason: "invalid-type" }],
  ["1e-999999999999999999999999", { admitted: false, reason: "invalid-type" }],
  ["1e999999999999999999999999", { admitted: false, reason: "invalid-format" }],
  ["9007199254740992", { admitted: false, reason: "invalid-format" }],
  ["-9007199254740992", { admitted: false, reason: "invalid-format" }],
  ["-0", { admitted: false, reason: "invalid-format" }],
  ["-0.0", { admitted: false, reason: "invalid-format" }],
  ["-0e999999999999999999999999", { admitted: false, reason: "invalid-format" }],
  ["-0.000e-999999999999999999999999", { admitted: false, reason: "invalid-format" }],
  ["9007199254740991.0", { admitted: true, value: 9007199254740991 }],
  ["9.007199254740991e15", { admitted: true, value: 9007199254740991 }],
];

test("matches all 26 accepted raw numeric projections", () => {
  assert.equal(acceptedProjections.length, 26);
  assertCases(acceptedProjections);
});

test("admits exact integer spellings without applying field-specific bounds", () => {
  assertCases([
    ["1E+000000", { admitted: true, value: 1 }],
    ["-1e0", { admitted: true, value: -1 }],
    ["-10e-1", { admitted: true, value: -1 }],
    ["123.4500e+2", { admitted: true, value: 12345 }],
    ["1200e-2", { admitted: true, value: 12 }],
    ["1200.000e-2", { admitted: true, value: 12 }],
    ["1000.00", { admitted: true, value: 1000 }],
    ["0.00100E+3", { admitted: true, value: 1 }],
    ["0.000001e6", { admitted: true, value: 1 }],
    ["1.23e3", { admitted: true, value: 1230 }],
    ["-12.345e3", { admitted: true, value: -12345 }],
    ["1e15", { admitted: true, value: 1000000000000000 }],
    ["9e15", { admitted: true, value: 9000000000000000 }],
    ["90071992547409900e-1", { admitted: true, value: 9007199254740990 }],
    ["9007199254740991.000", { admitted: true, value: 9007199254740991 }],
    ["-9.007199254740991E+15", { admitted: true, value: -9007199254740991 }],
  ]);
});

test("compares the exact safe boundary including implicit trailing zeros", () => {
  assertCases([
    ["999999999999999", { admitted: true, value: 999999999999999 }],
    ["1000000000000000", { admitted: true, value: 1000000000000000 }],
    ["8999999999999999", { admitted: true, value: 8999999999999999 }],
    ["9007199254740989", { admitted: true, value: 9007199254740989 }],
    ["9007199254740990", { admitted: true, value: 9007199254740990 }],
    ["-9007199254740990", { admitted: true, value: -9007199254740990 }],
    ["9007199254741000", { admitted: false, reason: "invalid-format" }],
    ["-9007199254741000", { admitted: false, reason: "invalid-format" }],
    ["9100000000000000", { admitted: false, reason: "invalid-format" }],
    ["9999999999999999", { admitted: false, reason: "invalid-format" }],
    ["10000000000000000", { admitted: false, reason: "invalid-format" }],
    ["1e16", { admitted: false, reason: "invalid-format" }],
    ["9007199254740991000e-3", { admitted: true, value: 9007199254740991 }],
    ["9007199254740992000e-3", { admitted: false, reason: "invalid-format" }],
    ["9.007199254740992e15", { admitted: false, reason: "invalid-format" }],
  ]);
});

// Repeated strings construct input data only. Expected results remain literal.
test("classifies a zero coefficient before considering its exponent", () => {
  const zeros = "0".repeat(512);
  const hugeExponent = "9".repeat(4096);
  assertCases([
    ["0.000E-000001", { admitted: true, value: 0 }],
    ["-0E-0", { admitted: false, reason: "invalid-format" }],
    ["-0.000E+000000", { admitted: false, reason: "invalid-format" }],
    [`0.${zeros}e+${hugeExponent}`, { admitted: true, value: 0 }],
    [`0.${zeros}e-${hugeExponent}`, { admitted: true, value: 0 }],
    [`-0.${zeros}e+${hugeExponent}`, { admitted: false, reason: "invalid-format" }],
    [`-0.${zeros}e-${hugeExponent}`, { admitted: false, reason: "invalid-format" }],
  ]);
});

test("rejects fractional values before checking their magnitude", () => {
  const zeros = "0".repeat(1024);
  assertCases([
    ["9007199254740990.9", { admitted: false, reason: "invalid-type" }],
    ["-9007199254740990.9", { admitted: false, reason: "invalid-type" }],
    ["9007199254740991.1", { admitted: false, reason: "invalid-type" }],
    ["9007199254740992.1", { admitted: false, reason: "invalid-type" }],
    ["-9007199254740992.1", { admitted: false, reason: "invalid-type" }],
    ["999999999999999.99", { admitted: false, reason: "invalid-type" }],
    ["99999999999999999999999999999999999999.5", { admitted: false, reason: "invalid-type" }],
    ["90071992547409921e-1", { admitted: false, reason: "invalid-type" }],
    ["90071992547409920e-1", { admitted: false, reason: "invalid-format" }],
    ["9007199254740992.0", { admitted: false, reason: "invalid-format" }],
    ["9007199254740991001e-3", { admitted: false, reason: "invalid-type" }],
    ["10000000000000001e-16", { admitted: false, reason: "invalid-type" }],
    ["1.0000000000000001e16", { admitted: false, reason: "invalid-format" }],
    ["1e-324", { admitted: false, reason: "invalid-type" }],
    ["-1e-324", { admitted: false, reason: "invalid-type" }],
    ["5e-324", { admitted: false, reason: "invalid-type" }],
    ["-5e-324", { admitted: false, reason: "invalid-type" }],
    [`1${zeros}.1`, { admitted: false, reason: "invalid-type" }],
    [`-1${zeros}.1`, { admitted: false, reason: "invalid-type" }],
    [`1${zeros}.0`, { admitted: false, reason: "invalid-format" }],
  ]);
});

test("saturates huge signed exponents without confusing leading zeros with magnitude", () => {
  const zeros = "0".repeat(512);
  const hugeExponent = "9".repeat(4096);
  assertCases([
    [`1e${hugeExponent}`, { admitted: false, reason: "invalid-format" }],
    [`-1E+${hugeExponent}`, { admitted: false, reason: "invalid-format" }],
    [`1e-${hugeExponent}`, { admitted: false, reason: "invalid-type" }],
    [`-1E-${hugeExponent}`, { admitted: false, reason: "invalid-type" }],
    [`0.${zeros}1e${hugeExponent}`, { admitted: false, reason: "invalid-format" }],
    [`1${zeros}e-${hugeExponent}`, { admitted: false, reason: "invalid-type" }],
    [`1e+${zeros}15`, { admitted: true, value: 1000000000000000 }],
    [`-1E+${zeros}15`, { admitted: true, value: -1000000000000000 }],
    [`1000e-${zeros}3`, { admitted: true, value: 1 }],
    [`1e-${zeros}`, { admitted: true, value: 1 }],
  ]);
});

test("preserves exponent cancellation across more than 400 coefficient positions", () => {
  const zeros = "0".repeat(512);
  assertCases([
    [`1${zeros}e-512`, { admitted: true, value: 1 }],
    [`-1${zeros}e-512`, { admitted: true, value: -1 }],
    [`1${zeros}e-511`, { admitted: true, value: 10 }],
    [`1${zeros}e-513`, { admitted: false, reason: "invalid-type" }],
    [`9007199254740991${zeros}e-512`, { admitted: true, value: 9007199254740991 }],
    [`9007199254740992${zeros}e-512`, { admitted: false, reason: "invalid-format" }],
    [`9007199254740991${zeros}e-513`, { admitted: false, reason: "invalid-type" }],
    [`9007199254740990${zeros}e-513`, { admitted: true, value: 900719925474099 }],
    [`0.${zeros}1e513`, { admitted: true, value: 1 }],
    [`-0.${zeros}1e513`, { admitted: true, value: -1 }],
    [`0.${zeros}1e514`, { admitted: true, value: 10 }],
    [`0.${zeros}1e512`, { admitted: false, reason: "invalid-type" }],
    [`0.${zeros}9007199254740991e528`, { admitted: true, value: 9007199254740991 }],
    [`0.${zeros}9007199254740992e528`, { admitted: false, reason: "invalid-format" }],
    [`0.${zeros}9007199254740991e527`, { admitted: false, reason: "invalid-type" }],
    [`0.${zeros}123${zeros}e515`, { admitted: true, value: 123 }],
    [`123${zeros}.${zeros}e-512`, { admitted: true, value: 123 }],
    [`1.${zeros}e0`, { admitted: true, value: 1 }],
    [`1.${zeros}1e513`, { admitted: false, reason: "invalid-format" }],
    [`1.${zeros}1e512`, { admitted: false, reason: "invalid-type" }],
  ]);
});

test("reads only the half-open token span and leaves owned bytes unchanged", () => {
  const prefix = "[123,";
  const suffix = ",456]";
  const cases = [
    ["1.0", { admitted: true, value: 1 }],
    ["-1250e-1", { admitted: true, value: -125 }],
    ["9007199254740990", { admitted: true, value: 9007199254740990 }],
    ["0e999999999999999999999999", { admitted: true, value: 0 }],
    ["1.0000000000000001", { admitted: false, reason: "invalid-type" }],
    ["-0.000e-400", { admitted: false, reason: "invalid-format" }],
  ];
  for (const [lexeme, expected] of cases) {
    const bytes = encoder.encode(prefix + lexeme + suffix);
    const before = bytes.slice();
    assert.deepEqual(
      admitRawInteger(bytes, prefix.length, prefix.length + lexeme.length),
      expected,
      lexeme,
    );
    assert.deepEqual(bytes, before);
  }
});

test("interprets span indices relative to a view with a nonzero backing offset", () => {
  // The view is [-1200e-2]; digits outside the view are unrelated storage.
  const storage = new Uint8Array([57, 57, 91, 45, 49, 50, 48, 48, 101, 45, 50, 93, 57, 57]);
  const bytes = new Uint8Array(storage.buffer, 2, 10);
  const before = storage.slice();
  assert.equal(bytes.byteOffset, 2);
  assert.deepEqual(admitRawInteger(bytes, 1, 9), { admitted: true, value: -12 });
  assert.deepEqual(storage, before);
});
