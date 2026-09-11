import assert from 'node:assert/strict';
import test from 'node:test';
import * as production from '../../dist/index.js';
import {
  produceSemanticRuntimeFixtures, semanticRuntimeCounts,
} from '../qualification-support/support/m3-semantic-runtime-fixtures.mjs';
import {
  executeSemanticRuntimeFixture, executeSemanticRuntimeFixtures,
} from '../qualification-support/support/m3-semantic-runtime-executor.mjs';

test('generated public root: portable 818 semantic subset, object and raw', async () => {
  // Transport one fixture at a time; never retain the large input inventory.
  function* transported() {
    for (const fixture of produceSemanticRuntimeFixtures()) {
      yield JSON.parse(JSON.stringify(fixture));
    }
  }
  const records = await executeSemanticRuntimeFixtures(production, transported());
  assert.equal(records.length, 1636);
  assert.equal(new Set(records.map(row => `${row.id}/${row.mode}`)).size, 1636);
  for (const mode of ['object', 'raw']) {
    const counts = {};
    for (const row of records.filter(record => record.mode === mode)) {
      counts[row.category] = (counts[row.category] ?? 0) + 1;
      assert.equal(row.observations.callerWrapperMutated, true);
      assert.ok(row.observations.mutatedObjects > 0);
      assert.ok(row.observations.mutatedBuffers > 0);
      assert.ok(row.observations.mutatedBytes > 0);
      assert.ok(row.observations.containers > 0);
      assert.ok(row.observations.mutationRejections > 0);
      assert.ok(Object.isFrozen(row.result));
    }
    assert.deepEqual(counts, semanticRuntimeCounts);
  }
});

function firstFixture() {
  return produceSemanticRuntimeFixtures().next().value;
}

function freeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

for (const mode of ['object', 'raw']) {
  const entry = mode === 'object' ? 'compileComposition' : 'compileCompositionJson';
  test(`${mode}: rejects independent wrong complete result`, async () => {
    const fixture = firstFixture();
    const wrong = structuredClone(fixture.expected);
    wrong.diagnostics[0].details.reason = 'wrong-independent-result';
    const subject = { [entry]: () => Promise.resolve(freeze(wrong)) };
    await assert.rejects(executeSemanticRuntimeFixture(subject, fixture, mode),
      /result value mismatch/);
  });

  test(`${mode}: rejects deferred caller snapshot`, async () => {
    const subject = {
      [entry]: input => Promise.resolve().then(() => production[entry](input)),
    };
    await assert.rejects(executeSemanticRuntimeFixture(subject, firstFixture(), mode),
      /result (value|keys) mismatch|missing container|container kind mismatch/);
  });

  test(`${mode}: rejects unfrozen independent result before transport`, async () => {
    const fixture = firstFixture();
    const subject = {
      [entry]: () => Promise.resolve(structuredClone(fixture.expected)),
    };
    await assert.rejects(executeSemanticRuntimeFixture(subject, fixture, mode),
      /result container is not frozen/);
  });
}
