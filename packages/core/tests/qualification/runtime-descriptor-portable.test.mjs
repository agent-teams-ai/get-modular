import assert from 'node:assert/strict';
import test from 'node:test';
import { createContext, runInContext } from 'node:vm';
import * as production from '../../dist/index.js';
import {
  CASES, materializeCase, REALM_PROTOTYPES,
} from '../qualification-support/m2-candidate/object-descriptor-cases.mjs';
import {
  produceDescriptorRuntimeFixtures, descriptorRuntimeCounts,
} from '../qualification-support/support/m3-descriptor-runtime-fixtures.mjs';
import {
  materializeDescriptorRuntimeInput,
} from '../qualification-support/support/m3-descriptor-runtime-materializers.mjs';
import {
  executeDescriptorRuntimeFixture, executeDescriptorRuntimeFixtures,
} from '../qualification-support/support/m3-descriptor-runtime-executor.mjs';

const foreign = runInContext(`({
  objectPrototype: Object.prototype, arrayPrototype: Array.prototype,
  record: () => ({}), nullRecord: () => Object.create(null), array: () => []
})`, createContext({}));
const capabilities = { foreignRealmFactory: () => foreign };
const fixtures = () => JSON.parse(JSON.stringify([...produceDescriptorRuntimeFixtures()]));

// Compare recipe structure without reading accessors or flattening exotic values.
// Error stacks are allocation-site evidence, not part of the descriptor recipe.
function signature(value, foreignObject, foreignArray, seen = new Map()) {
  if (typeof value === 'symbol') return ['symbol', value.description];
  if (typeof value === 'function') return ['function', value.name];
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return ['reference', seen.get(value)];
  seen.set(value, seen.size);
  const prototype = Object.getPrototypeOf(value);
  const prototypeKind = prototype === null ? 'null'
    : prototype === Object.prototype ? 'local-object'
      : prototype === Array.prototype ? 'local-array'
        : prototype === foreignObject ? 'foreign-object'
          : prototype === foreignArray ? 'foreign-array' : 'other';
  const entries = [];
  for (const key of Reflect.ownKeys(value)) {
    if (value instanceof Error && key === 'stack') continue;
    // Node's test runner adds per-allocation async-hook IDs to native promises.
    if (value instanceof Promise && typeof key === 'symbol'
        && ['async_id_symbol', 'trigger_async_id_symbol'].includes(key.description)) continue;
    const d = Object.getOwnPropertyDescriptor(value, key);
    entries.push([
      typeof key === 'symbol' ? ['symbol', key.description] : key,
      d.enumerable, d.configurable,
      Object.hasOwn(d, 'value')
        ? ['data', d.writable, signature(d.value, foreignObject, foreignArray, seen)]
        : ['accessor', typeof d.get, typeof d.set],
    ]);
  }
  return {
    array: Array.isArray(value), prototypeKind,
    tag: Object.prototype.toString.call(value),
    integrity: [Object.isFrozen(value), Object.isSealed(value), Object.isExtensible(value)],
    entries,
  };
}

test('portable inventory preserves every independent recipe and full expectation', () => {
  const rows = fixtures();
  assert.equal(rows.length, descriptorRuntimeCounts.cases);
  assert.deepEqual(rows.map(row => row.id), CASES.map(row => row.caseId));
  for (const [index, fixture] of rows.entries()) {
    const original = CASES[index];
    assert.deepEqual(fixture.recipe, original.recipe);
    assert.deepEqual(fixture.expected, original.expected.result);
    assert.deepEqual(fixture.fixtureExpected, original.fixtureExpected);
    const source = materializeCase(original.caseId);
    const portable = materializeDescriptorRuntimeInput(fixture, capabilities);
    assert.deepEqual(
      signature(portable.input, foreign.objectPrototype, foreign.arrayPrototype),
      signature(source.input, REALM_PROTOTYPES.foreignObject, REALM_PROTOTYPES.foreignArray),
      fixture.id,
    );
    assert.equal(portable.lengthAttempt, source.lengthAttempt);
    assert.equal(portable.getterCalls(), 0);
    assert.equal(source.getterCalls(), 0);
  }
});

test('generated public root executes all descriptor recipes before result transport', async () => {
  const rows = fixtures();
  const records = await executeDescriptorRuntimeFixtures(production, rows, capabilities);
  assert.equal(records.length, 68);
  assert.equal(records.filter(row => row.observations.foreignRealm === 'supplied').length, 3);
  for (const [index, record] of records.entries()) {
    assert.deepEqual(record.result, CASES[index].expected.result);
    assert.equal(record.id, CASES[index].caseId);
    assert.equal(record.observations.getterCalls, 0);
    assert.equal(record.observations.callerWrapperMutated, true);
    assert.ok(record.observations.containers > 0);
    assert.ok(record.observations.mutationRejections > 0);
    assert.ok(Object.isFrozen(record.result));
  }
});

test('foreign capability is mandatory, distinctly unavailable, and cannot use local prototypes', async () => {
  for (const fixture of fixtures().filter(row => row.applicability.foreignRealm === 'required')) {
    await assert.rejects(executeDescriptorRuntimeFixture(production, fixture), {
      code: 'descriptor.foreign-realm-unavailable',
    });
    await assert.rejects(executeDescriptorRuntimeFixture(production, fixture, {
      foreignRealmFactory: () => ({
        objectPrototype: Object.prototype, arrayPrototype: Array.prototype,
        record: () => ({}), nullRecord: () => Object.create(null), array: () => [],
      }),
    }), /invalid foreign realm capability/);
  }
  await assert.rejects(executeDescriptorRuntimeFixtures(production, fixtures()), {
    code: 'descriptor.foreign-realm-unavailable',
  });
});

test('complete inventory rejects omissions and duplicate IDs', async () => {
  await assert.rejects(executeDescriptorRuntimeFixtures(production, fixtures().slice(1), capabilities),
    /incomplete descriptor inventory/);
  const duplicate = fixtures();
  duplicate[1] = duplicate[0];
  await assert.rejects(executeDescriptorRuntimeFixtures(production, duplicate, capabilities),
    /duplicate descriptor ID/);
});

function freeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

test('rejects wrong complete results and unfrozen results locally', async () => {
  const fixture = fixtures()[0];
  const wrong = structuredClone(fixture.expected);
  wrong.digest = 'wrong-independent-digest';
  await assert.rejects(executeDescriptorRuntimeFixture({
    compileComposition: () => Promise.resolve(freeze(wrong)),
  }, fixture), /result value mismatch/);
  await assert.rejects(executeDescriptorRuntimeFixture({
    compileComposition: () => Promise.resolve(structuredClone(fixture.expected)),
  }, fixture), /result container is not frozen/);
});

test('rejects deferred snapshots and getter invocation even with the expected result', async () => {
  await assert.rejects(executeDescriptorRuntimeFixture({
    compileComposition: input => Promise.resolve().then(() => production.compileComposition(input)),
  }, fixtures()[0]), /result .*mismatch|missing container|container kind mismatch/);
  const fixture = fixtures().find(row =>
    row.recipe.parameters.target === 'record' && row.recipe.parameters.kind === 'accessor');
  await assert.rejects(executeDescriptorRuntimeFixture({
    compileComposition: input => {
      void input.declarations[5].moduleId;
      return Promise.resolve(freeze(structuredClone(fixture.expected)));
    },
  }, fixture), /getter called during synchronous admission/);
  await assert.rejects(executeDescriptorRuntimeFixture({
    compileComposition: input => {
      const document = input.declarations[5];
      return Promise.resolve().then(() => {
        void document.moduleId;
        return freeze(structuredClone(fixture.expected));
      });
    },
  }, fixture), /getter called during compilation/);
});


test('rejects shallow snapshots that retain nested caller documents', async () => {
  await assert.rejects(executeDescriptorRuntimeFixture({
    compileComposition: input => {
      const shallow = { declarations: input.declarations.slice(), profile: input.profile };
      return Promise.resolve().then(() => production.compileComposition(shallow));
    },
  }, fixtures()[0]), /result .*mismatch|missing container|container kind mismatch/);
});
