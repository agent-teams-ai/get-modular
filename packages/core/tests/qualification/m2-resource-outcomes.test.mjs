import assert from 'node:assert/strict';
import test from 'node:test';
import { compileComposition } from '../../dist/index.js';
import { duplicateRecordResourceCases } from '../qualification-support/m2-candidate/duplicate-record-resources.mjs';
import { m2ResourceOutcomeCases } from '../qualification-support/support/m2-resource-outcomes.mjs';

const changed = new Set(['od006.resources.v1/bindings/over', 'od006.resources.v1/providersPerManySlot/over']);
test('ADR-0022 retains all six resource recipes and exact complete Core outcomes', async t => {
  const original = duplicateRecordResourceCases();
  let count = 0, corrected = 0;
  for (const row of m2ResourceOutcomeCases()) {
    const old = original.next();
    assert.equal(old.done, false); assert.equal(old.value.caseId, row.caseId);
    assert.deepEqual(row.input, old.value.input, 'accepted input is unchanged');
    await t.test(row.caseId, async () => {
      if (changed.has(row.caseId)) {
        corrected += 1;
        assert.equal(row.expected.ok, false);
        assert.deepEqual(row.expected.diagnostics.slice(1), old.value.expected.diagnostics);
        assert.deepEqual(row.expected.diagnostics[0], {
          code: 'schema.invalid-value', phase: 'schema', coordinate: {},
          path: old.value.expected.diagnostics[0].path, details: { reason: 'invalid-format' },
        });
        assert.notDeepEqual(row.expected, old.value.expected, 'historical result cannot qualify successor');
      } else assert.deepEqual(row.expected, old.value.expected);
      const actual = await compileComposition(row.input);
      assert.deepEqual(actual, row.expected, 'whole result, including diagnostic order and no plan/digest');
    });
    count += 1;
  }
  assert.equal(original.next().done, true);
  assert.equal(count, 6); assert.equal(corrected, 2);
});

test('successor expectations are fresh and cannot rewrite later invocations', () => {
  const first = m2ResourceOutcomeCases(); first.next();
  const row = first.next().value;
  assert.equal(row.caseId, 'od006.resources.v1/bindings/over');
  row.expected.diagnostics.length = 0;
  const second = m2ResourceOutcomeCases(); second.next();
  assert.equal(second.next().value.expected.diagnostics.length, 2);
});
