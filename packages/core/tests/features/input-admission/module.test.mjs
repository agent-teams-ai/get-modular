import assert from "node:assert/strict";
import test from "node:test";
import { createInputAdmission } from "../../../dist-test/features/input-admission/factory.js";

test("factory instances keep snapshots and invocation sinks independent", () => {
  const admission = createInputAdmission({});
  const other = createInputAdmission({});
  assert.notEqual(admission, other);
  assert.equal(Object.isFrozen(admission), true);

  const input = {
    declarations: [{
      kind: "get-modular.module-declaration", schemaVersion: 1,
      moduleId: "example/root", implementationId: "example/root/default",
      owner: { authority: "example", path: ["root"] }, provides: [], slots: [],
    }],
    profile: {
      kind: "get-modular.composition-profile", schemaVersion: 1,
      profileId: "example/profile", roots: ["example/root"],
      selections: [{ moduleId: "example/root", implementationId: "example/root/default" }],
      bindings: [],
    },
  };
  function snapshot(value) {
    if (Array.isArray(value)) return value.map(snapshot);
    if (value === null || typeof value !== "object") return value;
    const result = Object.create(null);
    for (const [key, child] of Object.entries(value)) result[key] = snapshot(child);
    return result;
  }
  const expected = snapshot(input);
  const expectedSelections = structuredClone(input.profile.selections);
  const firstDiagnostics = [];
  const first = admission.admitObjectInput(input, {
    addUnique: diagnostic => firstDiagnostics.push(diagnostic),
  });
  assert.deepEqual(first, {
    declarations: expected.declarations, allDeclarationsAdmitted: true,
    profile: expected.profile,
    profileResources: {
      selections: expectedSelections, selectionCensusComplete: true, bindings: [],
    },
    hasErrors: false,
  });

  input.declarations[0].owner.path[0] = "changed";
  input.declarations.length = 0;
  input.profile.selections[0].implementationId = "example/changed";
  input.profile = null;
  assert.deepEqual(first.declarations, expected.declarations);
  assert.deepEqual(first.profile, expected.profile);

  const secondDiagnostics = [];
  const second = admission.admitObjectInput({ declarations: [], profile: { schemaVersion: 2 } }, {
    addUnique: diagnostic => secondDiagnostics.push(diagnostic),
  });
  assert.equal(second.hasErrors, true);
  assert.equal(second.profile, null);
  assert.ok(secondDiagnostics.length > 0);
  const failureCount = secondDiagnostics.length;
  for (const subject of [admission, other]) {
    const next = subject.admitObjectInput(expected, { addUnique: diagnostic => firstDiagnostics.push(diagnostic) });
    assert.deepEqual(next, first);
    assert.notEqual(next.declarations[0], first.declarations[0]);
    assert.notEqual(next.profile, first.profile);
  }
  assert.deepEqual(firstDiagnostics, []);
  assert.equal(secondDiagnostics.length, failureCount);
});
