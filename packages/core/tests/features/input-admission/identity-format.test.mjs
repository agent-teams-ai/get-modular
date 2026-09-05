import assert from "node:assert/strict";
import test from "node:test";
import { isLocalTokenFormat, isPortableIdFormat } from "../../../dist-test/features/input-admission/identity-format.js";
import { validateDeclarationShape } from "../../../dist-test/features/input-admission/document-shape.js";

// Independent accepted regex grammars, with exact match length to exclude JS
// end-anchor acceptance of a final line terminator. Length is a separate rule.
const portable = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+$/;
const local = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

test("iterative identity grammar agrees with both independent grammars for exhaustive short strings", () => {
  const alphabet = ["a", "z", "0", "-", "/", "A", "_", "\n"];
  let layer = [""];
  let checked = 0;
  for (let length = 0; length <= 5; length += 1) {
    for (const value of layer) {
      assert.equal(isPortableIdFormat(value), portable.exec(value)?.[0] === value, `portable ${JSON.stringify(value)}`);
      assert.equal(isLocalTokenFormat(value), local.exec(value)?.[0] === value, `local ${JSON.stringify(value)}`);
      checked += 1;
    }
    if (length < 5) layer = layer.flatMap(prefix => alphabet.map(character => prefix + character));
  }
  assert.equal(checked, 37_449);
});

test("all UTF-16 code units outside lowercase ASCII, digits and allowed separators fail", () => {
  for (let code = 0; code <= 0xffff; code += 1) {
    const value = String.fromCharCode(code);
    const alphanumeric = (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
    assert.equal(isLocalTokenFormat(`a${value}b`), alphanumeric || code === 45, code);
    assert.equal(isPortableIdFormat(`a/b${value}c`), alphanumeric || code === 45 || code === 47, code);
  }
});

test("format scanning accepts oversized valid grammar without claiming schema admission", () => {
  const value = `${"a".repeat(126)}/b`;
  const oversized = `${"a".repeat(127)}/b`;
  assert.equal(value.length, 128);
  assert.equal(oversized.length, 129);
  for (const moduleId of [value, oversized]) {
    assert.equal(isPortableIdFormat(moduleId), true);
    const declaration = { kind: "get-modular.module-declaration", schemaVersion: 1,
      moduleId, implementationId: "example/app/default", owner: { authority: "example", path: ["app"] }, provides: [], slots: [] };
    assert.equal(validateDeclarationShape(declaration, () => {}), moduleId === value);
  }
  const longToken = "a".repeat(1_048_576);
  assert.equal(isLocalTokenFormat(longToken), true);
  assert.equal(isPortableIdFormat(`${longToken}/b`), true);
  assert.equal(isPortableIdFormat(`${longToken}/b\n`), false);
  assert.equal(isPortableIdFormat(`${longToken}/-b`), false);
  assert.equal(isPortableIdFormat("a/".repeat(12_000) + "b"), true);
  assert.equal(isPortableIdFormat("a/".repeat(12_000)), false);
});
