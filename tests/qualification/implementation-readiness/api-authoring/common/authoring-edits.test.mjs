import assert from "node:assert/strict";
import test from "node:test";
import { authoringFiles, fileChanges } from "./authoring-edits.mjs";

test("file metrics count actual source edits, additions and removals", () => {
  assert.deepEqual(fileChanges({ "a.ts": "same" }, { "a.ts": "same" }), []);
  const changes = fileChanges({ "a.ts": "before", "b.ts": "removed" }, { "a.ts": "after", "c.ts": "new" });
  assert.deepEqual(changes.map(({ path, kind }) => [path, kind]), [["a.ts", "modified"], ["b.ts", "deleted"], ["c.ts", "added"]]);
  assert.notEqual(changes[0].beforeSha256, changes[0].afterSha256);
  assert.equal(changes[1].afterSha256, null);
  assert.equal(changes[2].beforeSha256, null);
});

test("every syntax keeps metadata and executable association separate", () => {
  const declaration = { moduleId: "edits/a", implementationId: "edits/a/default", owner: { authority: "edits", path: ["a"] }, provides: [], slots: [] };
  const world = { declarations: [declaration], profile: { roots: [], selections: [], bindings: [] }, desiredProfile: { disabledModuleIds: [] } };
  for (const candidate of ["descriptor-object", "define-module", "split-declaration-factory"]) {
    const files = authoringFiles(candidate, world);
    assert(!files["modules/a/declaration.ts"].includes("factory"));
    assert.equal(files["modules/a/declaration.ts"].includes("defineModule("), candidate === "define-module");
    assert.equal(files["modules/a/factory.ts"].includes("associateFactory("), candidate === "split-declaration-factory");
    assert(!files["catalog.ts"].includes("factory"));
  }
});
