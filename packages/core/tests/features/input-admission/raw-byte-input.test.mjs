import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { captureRawInput } from "../../../dist-test/features/input-admission/raw-byte-input.js";
import { createDiagnosticCollector } from "../../../dist-test/features/diagnostics/internal.js";
import { createOwnedJcs } from "../../../dist-test/features/canonicalization/owned-jcs/factory.js";

const field = value => ({ kind: "field", value });
const index = value => ({ kind: "index", value });
const carrier = (path, reason) => ({ code: "input.invalid-byte-carrier", phase: "decode", coordinate: {}, path, details: { reason } });
const limit = (limitName, value, path = [], phase = "decode") => ({ code: "input.limit-exceeded", phase, coordinate: {}, path,
  details: { limitName, limit: value, actual: value + 1 } });
function capture(input) {
  const sink = createDiagnosticCollector(createOwnedJcs({}).canonicalize);
  const result = captureRawInput(input, sink);
  return { result, diagnostics: sink.finish() };
}

test("raw wrapper precedes all byte diagnostics and admits own undefined only to carrier classification", () => {
  const list = [new Uint8Array(1_048_577), undefined, new Uint8Array()];
  Object.defineProperty(list, 2, { get() { assert.fail("getter invoked"); } });
  assert.deepEqual(capture({ declarations: list, profile: undefined }).diagnostics,
    [carrier([field("declarations")], "not-document-list")]);
  const over = { declarations: new Array(4097), profile: undefined };
  assert.deepEqual(capture(over).diagnostics, [limit("declarations", 4096, [], "declaration")]);
  Object.defineProperty(over, "profile", { get() { assert.fail("profile getter invoked"); } });
  assert.deepEqual(capture(over).diagnostics, [carrier([field("profile")], "not-document-list")]);
  assert.deepEqual(capture({ declarations: [undefined], profile: undefined }).diagnostics, [
    carrier([field("declarations"), index(0)], "not-uint8array"), carrier([field("profile")], "not-uint8array"),
  ]);
});

test("raw capture owns exactly visible bytes and preserves rejected declaration ordinals", () => {
  const backing = new Uint8Array([9, 1, 2, 9]);
  const view = backing.subarray(1, 3);
  const foreign = runInNewContext("new Uint8Array([3, 4])");
  const profile = new Uint8Array([5]);
  const { result, diagnostics } = capture({ declarations: [view, null, foreign], profile });
  assert.equal(result.blocked, false);
  assert.equal(result.allDeclarationsCaptured, false);
  assert.deepEqual(diagnostics, [carrier([field("declarations"), index(1)], "not-uint8array")]);
  assert.equal(Object.isFrozen(result.declarations), true);
  backing.fill(7); foreign.fill(8); profile.fill(9);
  assert.deepEqual(result.declarations.map(value => value === null ? null : [...value]), [[1, 2], null, [3, 4]]);
  assert.deepEqual([...result.profile], [5]);
  assert.notEqual(result.declarations[0].buffer, backing.buffer);
});

test("byte boundaries are inclusive and oversized documents suppress only their own copies", () => {
  for (const [name, bytes] of [["declaration", 1_048_576], ["profile", 8_388_608]]) {
    for (const extra of [0, 1]) {
      const declarations = [new Uint8Array(name === "declaration" ? bytes + extra : 1)];
      const profile = new Uint8Array(name === "profile" ? bytes + extra : 1);
      const { result, diagnostics } = capture({ declarations, profile });
      assert.equal(result.blocked, false);
      const path = name === "declaration" ? [field("declarations"), index(0)] : [field("profile")];
      assert.deepEqual(diagnostics, extra ? [limit(`${name}RawDocumentBytes`, bytes, path)] : []);
      assert.equal((name === "declaration" ? result.declarations[0] : result.profile) === null, extra === 1);
      assert.notEqual(name === "declaration" ? result.profile : result.declarations[0], null);
    }
  }
});

test("aggregate bytes include individually oversized views and block all copies", () => {
  const shared = new Uint8Array(new SharedArrayBuffer(1));
  const declarations = Array.from({ length: 16 }, () => new Uint8Array(1_048_577));
  declarations.push(shared);
  const { result, diagnostics } = capture({ declarations, profile: new Uint8Array() });
  assert.equal(result.blocked, true);
  assert.deepEqual(result.declarations, []);
  assert.equal(result.profile, null);
  assert.deepEqual(diagnostics, [carrier([field("declarations"), index(16)], "shared-storage"),
    limit("aggregateRawBytes", 16_777_216),
    ...Array.from({ length: 16 }, (_, ordinal) => limit("declarationRawDocumentBytes", 1_048_576, [field("declarations"), index(ordinal)])),
  ]);
});

test("aggregate byte admission is inclusive and rejects one extra profile byte", () => {
  const declarations = Array.from({ length: 16 }, () => new Uint8Array(1_048_576));
  assert.equal(capture({ declarations, profile: new Uint8Array() }).result.blocked, false);
  assert.deepEqual(capture({ declarations, profile: new Uint8Array(1) }).diagnostics, [limit("aggregateRawBytes", 16_777_216)]);
});
