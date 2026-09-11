// Node-only fixture preparation. Expectations come from frozen evidence,
// never from Core. This inventory is only the 123 raw-document cases.
import assert from 'node:assert/strict';
import { rawDocumentCases } from '../m2-candidate/raw-document-cases.mjs';

export function produceRuntimeFixtures(rows = rawDocumentCases()) {
  const ids = new Set();
  const fixtures = [];
  for (const row of rows) {
    assert.equal(typeof row.caseId, 'string');
    assert.ok(row.caseId.length > 0, 'empty fixture ID');
    assert.ok(!ids.has(row.caseId), `duplicate fixture ID: ${row.caseId}`);
    ids.add(row.caseId);
    const fixture = {
      id: row.caseId,
      inputRecipe: row.inputRecipe,
      expected: row.expected,
    };
    const portable = JSON.parse(JSON.stringify(fixture));
    // Unlike stringify alone, this detects lost undefined values, holes,
    // non-JSON numbers, and nonordinary source containers.
    assert.deepStrictEqual(portable, fixture, `${row.caseId}: JSON-safe fixture`);
    fixtures.push(portable);
  }
  assert.equal(fixtures.length, 123, 'complete raw-document inventory');
  return fixtures;
}

export const runtimeFixtures = produceRuntimeFixtures();
