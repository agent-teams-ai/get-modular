import assert from "node:assert/strict";
import test from "node:test";
import { createOwnedRawScanner } from "../../dist-test/features/raw-scanner/owned-iterative/factory.js";

test("owned scanner independently preserves generated UTF-16 values and UTF-8 counts", () => {
  const scanner = createOwnedRawScanner({});
  const encoder = new TextEncoder();
  let state = 0x9e3779b9;
  function random() {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  }
  for (let ordinal = 0; ordinal < 4000; ordinal += 1) {
    let value = "";
    const length = 1 + random() % 80;
    for (let index = 0; index < length; index += 1) {
      const draw = random();
      const unit = draw % 4 === 0 ? 0xd800 + draw % 2048 : draw % 65536;
      value += String.fromCharCode(unit);
    }
    const bytes = encoder.encode(JSON.stringify(value));
    const cursor = scanner.open(bytes);
    const lexical = cursor.next();
    assert.deepEqual(lexical, { kind: "string", start: 0, end: bytes.length,
      decodedUtf8Bytes: encoder.encode(value).length, wellFormedUtf16: value.isWellFormed() }, `case ${ordinal}`);
    assert.equal(cursor.decodeString(lexical), value, `case ${ordinal}`);
    assert.deepEqual(cursor.next(), { kind: "end", start: bytes.length, end: bytes.length });
  }
});
