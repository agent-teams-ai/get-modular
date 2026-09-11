import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
const resourceProfile = JSON.parse(await readFile(new URL('../../../../architecture/qualification/v1/resource-profile-v2.json', import.meta.url)));
import * as production from '../../dist/index.js';
import * as direct from '../../dist-stage0/self-composition/stage0-entry.js';
import { duplicateRecordBaseCases, duplicateRecordRowFailureCases,
  duplicateRecordOverlapCases, duplicateRecordPermutationCases } from '../qualification-support/m2-candidate/duplicate-record-cases.mjs';
import { duplicateRecordOrderingCases, duplicateRecordShuffledOrderingCases,
  duplicateRecordCollectorCases } from '../qualification-support/m2-candidate/duplicate-record-ordering.mjs';
import { duplicateRecordExtendedOverlapCases } from '../qualification-support/m2-candidate/duplicate-record-extended-overlaps.mjs';
import { m2ResourceOutcomeCases } from '../qualification-support/support/m2-resource-outcomes.mjs';
import { m2RawCaseDefinitions, executeM2RawCase } from '../qualification-support/support/m2-packed-raw-cases.mjs';

// These are ordinary production/direct entry calls, with independent complete
// successor results. Carrier recipes remain constructing fixtures, never RPC.
const objectCategories = [duplicateRecordBaseCases, duplicateRecordRowFailureCases,
  duplicateRecordOverlapCases, duplicateRecordPermutationCases,
  duplicateRecordOrderingCases, duplicateRecordShuffledOrderingCases,
  duplicateRecordCollectorCases, duplicateRecordExtendedOverlapCases,
  m2ResourceOutcomeCases];
function rawInput(input) {
  const limits = resourceProfile.limits;
  let totalBytes = 0;
  const encode = (value, limit) => {
    const text = JSON.stringify(value);
    // Reuse object expectations only for lossless JSON and admitted raw bytes.
    assert.deepEqual(JSON.parse(text), value);
    const bytes = new TextEncoder().encode(text);
    assert.ok(bytes.length <= limit);
    totalBytes += bytes.length;
    return bytes;
  };
  const declarations = input.declarations.map(value => encode(value, limits.declarationRawDocumentBytes));
  const profile = encode(input.profile, limits.profileRawDocumentBytes);
  assert.ok(totalBytes <= limits.aggregateRawBytes);
  return { declarations, profile };
}

for (const [name, subject] of [['production', production], ['direct', direct]]) {
  for (const mode of ['object', 'raw']) test(`${name}/${mode}: all 818 complete semantic successor outcomes`, async () => {
    const ids = new Set();
    for (const generate of objectCategories) for (const row of generate()) {
      if (row.expected === undefined) {
        // The relational pair is a separate obligation, not a complete result.
        assert.equal(row.caseId, 'od006.extended-overlap.v1/ordered-many-reversal');
        continue;
      }
      assert.equal(ids.has(row.caseId), false);
      ids.add(row.caseId);
      const pending = mode === 'object' ? subject.compileComposition(row.input)
        : subject.compileCompositionJson(rawInput(row.input));
      assert.ok(pending instanceof Promise);
      assert.deepEqual(await pending, row.expected, row.caseId);
    }
    assert.equal(ids.size, 818);
  });
  test(`${name}: all 123 raw documents and 62 invocation outcomes`, async t => {
    assert.equal(m2RawCaseDefinitions.length, 185);
    for (const row of m2RawCaseDefinitions) {
      await t.test(row.id, () => executeM2RawCase(row.id, subject.compileCompositionJson));
    }
  });
}
