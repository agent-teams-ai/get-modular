import assert from 'node:assert/strict';
import test from 'node:test';
import * as production from '../../dist/index.js';
import {
  produceP500RuntimeFixtures, p500RuntimeCounts, p500RuntimeFixtureCount,
  p500RuntimeParameters,
} from '../qualification-support/support/m3-p500-runtime-fixtures.mjs';
import {
  executeSemanticRuntimeFixture,
} from '../qualification-support/support/m3-semantic-runtime-executor.mjs';
import {
  expectedP500Plan, expectedDigest, p500Digest,
} from '../qualification-support/support/scale-output.mjs';

async function fixtureFor(category) {
  for await (const fixture of produceP500RuntimeFixtures()) {
    if (fixture.category === category) return fixture;
  }
  assert.fail(`missing P500 category: ${category}`);
}

function freeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

test('generated public Core: five portable P500 fixtures in object and raw modes', async () => {
  assert.equal(p500RuntimeFixtureCount, 5);
  assert.deepEqual(p500RuntimeParameters, {
    moduleCount: 500, manyWindow: 48, implementationIdPadding: 48,
    rootModuleIndex: 499,
  });
  const plan = expectedP500Plan();
  assert.equal(expectedDigest(plan), p500Digest);
  const counts = {};
  const ids = new Set();
  let calls = 0;
  for await (const original of produceP500RuntimeFixtures()) {
    const fixture = JSON.parse(JSON.stringify(original));
    assert.deepEqual(fixture, original);
    assert.ok(!ids.has(fixture.id));
    ids.add(fixture.id);
    counts[fixture.category] = (counts[fixture.category] ?? 0) + 1;
    if (fixture.category === 'baseline') {
      assert.deepEqual(fixture.expected, { ok: true, plan, digest: p500Digest });
    }
    for (const mode of ['object', 'raw']) {
      const record = await executeSemanticRuntimeFixture(production, fixture, mode);
      assert.deepEqual(record.result, fixture.expected);
      assert.deepEqual(fixture, original, 'executor retains no fixture mutations');
      const observations = record.observations;
      assert.equal(observations.callerWrapperMutated, true);
      assert.ok(observations.mutatedObjects > 0);
      assert.equal(observations.mutatedBuffers, 501);
      assert.equal(observations.mutatedBytes, fixture.rawEligibility.aggregateBytes);
      assert.ok(observations.containers > 0);
      assert.ok(observations.mutationRejections > 0);
      assert.ok(Object.isFrozen(record.result));
      calls += 1;
    }
  }
  assert.equal(ids.size, 5);
  assert.equal(calls, 10);
  assert.deepEqual(counts, p500RuntimeCounts);
});

test('P500 yields independently owned inputs and expectations', async () => {
  const iterator = produceP500RuntimeFixtures();
  const first = (await iterator.next()).value;
  first.input.declarations.length = 0;
  first.input.profile.bindings[0].providerImplementationIds.length = 0;
  first.expected.plan.bindings[0].providerImplementationIds.length = 0;
  const second = (await iterator.next()).value;
  assert.equal(second.input.declarations.length, 500);
  assert.ok(second.input.profile.bindings.every(row =>
    row.providerImplementationIds.length > 0));
  assert.deepEqual(second.expected.plan, expectedP500Plan());
  assert.equal(second.expected.digest, p500Digest);
  await iterator.return();
});

for (const mode of ['object', 'raw']) {
  const entry = mode === 'object' ? 'compileComposition' : 'compileCompositionJson';
  test(`${mode}: wrong many order cannot qualify with a self-consistent digest`, async () => {
    const fixture = await fixtureFor('changedOrderedMany48');
    const wrong = freeze({ ok: true, plan: expectedP500Plan(), digest: p500Digest });
    assert.notEqual(fixture.expected.digest, wrong.digest);
    await assert.rejects(executeSemanticRuntimeFixture({
      [entry]: () => Promise.resolve(wrong),
    }, fixture, mode), /result value mismatch/);
  });

  test(`${mode}: missing binding cannot qualify as a successful P500 plan`, async () => {
    const fixture = await fixtureFor('missingLastBinding');
    const wrong = freeze({ ok: true, plan: expectedP500Plan(), digest: p500Digest });
    await assert.rejects(executeSemanticRuntimeFixture({
      [entry]: () => Promise.resolve(wrong),
    }, fixture, mode), /result (value|keys) mismatch/);
  });

  test(`${mode}: P500 rejects deferred snapshots and unfrozen results`, async () => {
    const fixture = await fixtureFor('baseline');
    await assert.rejects(executeSemanticRuntimeFixture({
      [entry]: input => Promise.resolve().then(() => production[entry](input)),
    }, fixture, mode),
    /result (value|keys) mismatch|missing container|container kind mismatch/);
    await assert.rejects(executeSemanticRuntimeFixture({
      [entry]: () => Promise.resolve(structuredClone(fixture.expected)),
    }, fixture, mode), /result container is not frozen/);
  });

  test(`${mode}: incorrect actual raw sizes cannot qualify`, async () => {
    const fixture = await fixtureFor('baseline');
    fixture.rawEligibility.profileBytes -= 1;
    await assert.rejects(executeSemanticRuntimeFixture(production, fixture, mode),
      /raw eligibility document mismatch/);
  });
}
