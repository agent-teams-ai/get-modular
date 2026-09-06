import assert from "node:assert/strict";
import test from "node:test";
import { documentPath } from "../../../dist/features/input-admission/document-path.js";

test("safe path retains the largest index and permanently clips overflow and its suffix", () => {
  const profile = { kind: "profile" };
  assert.deepEqual(documentPath(profile, ["bindings", 65535, "slotId"]), [
    { kind: "field", value: "profile" }, { kind: "field", value: "bindings" },
    { kind: "index", value: 65535 }, { kind: "field", value: "slotId" },
  ]);
  assert.deepEqual(documentPath(profile, ["bindings", 65536, "slotId", 0]), [
    { kind: "field", value: "profile" }, { kind: "field", value: "bindings" },
  ]);
  assert.deepEqual(documentPath({ kind: "declaration", ordinal: 65536 }, ["owner"]), [
    { kind: "field", value: "declarations" },
  ]);
});

test("invocation prefix participates in the frozen 32-segment path bound", () => {
  const path = documentPath({ kind: "declaration", ordinal: 3 }, Array(40).fill("owner"));
  assert.equal(path.length, 32);
  assert.deepEqual(path.slice(0, 2), [
    { kind: "field", value: "declarations" }, { kind: "index", value: 3 },
  ]);
  assert.ok(Object.isFrozen(path));
  assert.ok(path.every(Object.isFrozen));
});
