import assert from "node:assert/strict";
import test from "node:test";
import { CASES, materializeCase } from "../qualification-support/m2-candidate/object-descriptor-cases.mjs";
import { compileComposition } from "../../dist/index.js";

// The immutable recipes supply real descriptors and independently frozen whole
// results. Execute the current ordinary Core entry, never the historical oracle.
for (const row of CASES) {
  test(row.caseId, async () => {
    const fixture = materializeCase(row.caseId);
    const result = await compileComposition(fixture.input);
    assert.deepEqual(result, row.expected.result);
    assert.equal(fixture.getterCalls(), 0);
  });
}
