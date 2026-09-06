import assert from "node:assert/strict";
import test from "node:test";
import { objectDocument } from "../../../dist-test/features/input-admission/document-reader.js";
import { validateProfileShape, validateProfileView, validateDeclarationView } from "../../../dist-test/features/input-admission/document-shape.js";
import { admitRawInteger } from "../../../dist-test/features/input-admission/raw-integer.js";

const encode = new TextEncoder();
const profile = () => ({ kind: "get-modular.composition-profile", schemaVersion: 1,
  profileId: "x/p", roots: ["x/m"], selections: [{ moduleId: "x/m", implementationId: "x/i" }], bindings: [] });

// A second representation deliberately carries no Number for raw numeric
// values. The shared schema must consult its reader's exact integer verdict.
function representation(root, markers) {
  const reader = objectDocument(root).reader;
  return { root, reader: { ...reader,
    kind: value => markers.has(value) ? "number" : reader.kind(value),
    integer: value => {
      const lexeme = markers.get(value);
      if (lexeme === undefined) return reader.integer(value);
      const bytes = encode.encode(lexeme);
      return admitRawInteger(bytes, 0, bytes.length);
    },
  } };
}

test("schema reader preserves exact raw numbers and unsupported-version suppression", () => {
  for (const [lexeme, expected] of [
    ["1.0", []], ["1.0000000000000001", [{ rule: "integer", path: ["schemaVersion"] }]],
    ["1e-400", [{ rule: "integer", path: ["schemaVersion"] }]],
    ["-0.0", [{ rule: "range", path: ["schemaVersion"] }]],
    ["9007199254740992", [{ rule: "range", path: ["schemaVersion"] }]],
    ["2e0", [{ rule: "unsupported-version", path: ["schemaVersion"] }]],
  ]) {
    const root = profile();
    const marker = {};
    root.schemaVersion = marker;
    if (lexeme === "2e0") { root.kind = false; root.secretUnknownField = null; }
    const errors = [];
    assert.equal(validateProfileView(representation(root, new Map([[marker, lexeme]])), error => errors.push(error)), expected.length === 0);
    assert.deepEqual(errors, expected, lexeme);
  }
});

test("schema reader preserves kind discrimination, relational bounds and own-member presence", () => {
  const min = {}, max = {};
  const root = { kind: "get-modular.module-declaration", schemaVersion: 1, moduleId: "x/m", implementationId: "x/i",
    owner: { authority: "x", path: ["m"] }, provides: [], slots: [{ slotId: "s", capabilityId: "x/c",
      compatibility: { family: "exact", familyVersion: 1, token: "x/c" },
      cardinality: { kind: "many", min, max, order: "profile" } }] };
  const errors = [];
  assert.equal(validateDeclarationView(representation(root, new Map([[min, "3.0"], [max, "20e-1"]])), error => errors.push(error)), false);
  assert.deepEqual(errors, [{ rule: "range", path: ["slots", 0, "cardinality"] }]);
  for (const present of [false, true]) {
    const value = profile();
    delete value.profileId;
    if (present) value.profileId = undefined;
    const observed = [];
    validateProfileShape(value, error => observed.push(error));
    assert.deepEqual(observed, [{ rule: present ? "type" : "required", path: ["profileId"] }]);
  }
});
