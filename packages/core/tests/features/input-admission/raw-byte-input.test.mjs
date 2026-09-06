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

test("raw capture excludes patched helpers and inherited setters from classification through copying", () => {
  // The actual compiled module has already evaluated through the static import.
  const defineProperty = Object.defineProperty;
  const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
  const apply = Reflect.apply;
  const patches = [
    [Math, "min"],
    [Array.prototype, "push"],
    [Object, "defineProperty"],
    [Object, "freeze"],
    [Array.prototype, Symbol.iterator],
    [Array.prototype, "slice"],
    [Array.prototype, "map"],
    [Array.prototype, "0"],
  ];
  for (const [target, key] of patches) {
    for (const tail of ["valid", "invalid", "oversized"]) {
      const label = `${String(key)} / ${tail}`;
      const backing = new ArrayBuffer(1_048_576, { maxByteLength: 2_097_152 });
      const view = new Uint8Array(backing);
      view[0] = 17;
      view[1_048_575] = 19;
      const profileBacking = new ArrayBuffer(1, { maxByteLength: 2 });
      const profile = new Uint8Array(profileBacking);
      profile[0] = 23;
      const input = { declarations: [view, tail === "invalid" ? undefined
        : tail === "oversized" ? new Uint8Array(1_048_577) : new Uint8Array([29])], profile };
      const diagnostics = [];
      let hookCalls = 0;
      const mutate = () => {
        backing.resize(2_097_152);
        view[0] = 99;
        profileBacking.resize(2);
        profile[0] = 101;
      };
      const sink = { addUnique(diagnostic) {
        defineProperty(diagnostics, diagnostics.length, {
          value: diagnostic, enumerable: true, configurable: true, writable: true,
        });
        // Sink emission must also follow the complete set of eligible copies.
        mutate();
      } };
      const original = getOwnPropertyDescriptor(target, key);
      const arrayLength = key === "0" ? getOwnPropertyDescriptor(target, "length") : undefined;
      const replacement = key === "0" ? {
        configurable: true,
        set(value) {
          hookCalls += 1;
          mutate();
          defineProperty(this, key, { value, enumerable: true, configurable: true, writable: true });
        },
      } : {
        ...original,
        value: function (...args) {
          hookCalls += 1;
          mutate();
          return apply(original.value, this, args);
        },
      };
      let result;
      try {
        defineProperty(target, key, replacement);
        result = captureRawInput(input, sink);
      } finally {
        if (original === undefined) delete target[key];
        else defineProperty(target, key, original);
        // Defining a numeric property also changes Array.prototype.length.
        if (arrayLength !== undefined) defineProperty(target, "length", arrayLength);
      }

      // Every assertion and test-harness interaction follows global restoration.
      assert.equal(result.blocked, false, label);
      assert.equal(result.hasErrors, tail !== "valid", label);
      assert.equal(result.allDeclarationsCaptured, tail === "valid", label);
      assert.equal(Object.isFrozen(result), true, label);
      assert.equal(Object.isFrozen(result.declarations), true, label);
      assert.equal(result.declarations.length, 2, label);
      assert.equal(result.declarations[0]?.byteLength, 1_048_576, label);
      assert.equal(result.declarations[0][0], 17, label);
      assert.equal(result.declarations[0][1_048_575], 19, label);
      assert.equal(result.declarations[0].buffer.resizable, false, label);
      assert.notEqual(result.declarations[0].buffer, backing, label);
      assert.deepEqual(result.declarations[1], tail === "valid" ? new Uint8Array([29]) : null, label);
      assert.deepEqual([...result.profile], [23], label);
      assert.equal(result.profile.buffer.resizable, false, label);
      assert.notEqual(result.profile.buffer, profileBacking, label);
      assert.deepEqual(diagnostics, tail === "valid" ? [] : [tail === "invalid"
        ? carrier([field("declarations"), index(1)], "not-uint8array")
        : limit("declarationRawDocumentBytes", 1_048_576, [field("declarations"), index(1)])], label);
      if (tail !== "valid" && (key === "freeze" || key === Symbol.iterator || key === "slice" || key === "map")) {
        assert.ok(hookCalls > 0, label);
      }
      // Calls after copying may mutate caller storage without changing snapshots.
      if (hookCalls > 0 || diagnostics.length > 0) {
        assert.equal(view.byteLength, 2_097_152, label);
        assert.equal(view[0], 99, label);
        assert.equal(profile.byteLength, 2, label);
        assert.equal(profile[0], 101, label);
      }
    }
  }
});
