import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { createContext, runInContext } from 'node:vm';
import * as core from '../../dist/index.js';
import {
  produceInvocationRuntimeFixtures,
} from '../../../../tests/qualification/support/m3-invocation-runtime-fixtures.mjs';
import {
  materializeInvocationRuntimeInput,
} from '../../../../tests/qualification/support/m3-invocation-runtime-materializers.mjs';
import {
  executeInvocationRuntimeFixture, executeInvocationRuntimeFixtures,
} from '../../../../tests/qualification/support/m3-invocation-runtime-executor.mjs';
import {
  rawInvocationCaseIds, materializeRawInvocationCase,
} from '../../../../tests/qualification/support/m2-raw-invocation-fixtures.mjs';
import {
  rawInvocationExpectedResult,
} from '../../../../tests/qualification/support/m2-raw-invocation-expectations.mjs';

const foreignSources = Object.freeze({
  'foreign-null-frozen-wrapper': `Object.freeze(Object.assign(Object.create(null), {
    declarations: Object.freeze([new Uint8Array([1])]), profile: new Uint8Array([2])
  }))`,
  'realm-array-cleared': `globalThis.input = {
    declarations: [new Uint8Array([1, 2])], profile: new Uint8Array([3])
  }; input`,
  'realm-shared-both': `({
    declarations: [new Uint8Array(new SharedArrayBuffer(4))],
    profile: new Uint8Array(new SharedArrayBuffer(4, {maxByteLength:8}))
  })`,
});
const capabilities = {
  nodeBuffer: Buffer,
  foreignRealmFactory(id) {
    assert.ok(Object.hasOwn(foreignSources, id));
    let context = createContext({});
    return {
      input: runInContext(foreignSources[id], context),
      after() {
        assert.equal(id, 'realm-array-cleared');
        runInContext('input.declarations[0].fill(77); input.profile.fill(78); delete globalThis.input;', context);
        context = null;
      },
    };
  },
};
const fixture = id => [...produceInvocationRuntimeFixtures()].find(row => row.id === id);
const TA = Object.getPrototypeOf(Uint8Array.prototype);
const bufferOf = Object.getOwnPropertyDescriptor(TA, 'buffer').get;
const lengthOf = Object.getOwnPropertyDescriptor(TA, 'length').get;
const offsetOf = Object.getOwnPropertyDescriptor(TA, 'byteOffset').get;
const tagOf = Object.getOwnPropertyDescriptor(TA, Symbol.toStringTag).get;

// Descriptor-only graph evidence. Never walks list length or reads an accessor.
// Typed bytes are compared through intrinsics, including poisoned subclasses.
function projection(root) {
  const seen = new Map();
  function visit(value) {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
      return value;
    }
    if (seen.has(value)) return { alias: seen.get(value) };
    const identity = seen.size;
    seen.set(value, identity);
    if (ArrayBuffer.isView(value)) {
      const buffer = bufferOf.call(value);
      const length = lengthOf.call(value);
      let usable = true;
      try { TA.values.call(value).next(); } catch { usable = false; }
      let shared = false;
      try {
        Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype, 'byteLength').get.call(buffer);
        shared = true;
      } catch {}
      const bytes = usable ? new Uint8Array(buffer, offsetOf.call(value),
        length * (tagOf.call(value) === 'Uint16Array' ? 2 : 1)) : null;
      // A bounded deterministic digest is sufficient here only because complete
      // actual compiler results are compared independently in the replay below.
      let hash = 2166136261;
      if (bytes) for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
      return { identity, tag: tagOf.call(value), nodeBuffer: Buffer.isBuffer(value),
        foreign: !(value instanceof Uint8Array) && tagOf.call(value) === 'Uint8Array',
        length, offset: Buffer.isBuffer(value) ? 'pooled' : offsetOf.call(value),
        usable, shared, hash, extensible: Object.isExtensible(value),
        resizable: !shared && buffer.resizable,
        growable: shared && buffer.growable };
    }
    const own = Reflect.ownKeys(value).map(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return [typeof key === 'symbol' ? String(key) : key, {
        enumerable: descriptor.enumerable, configurable: descriptor.configurable,
        ...(Object.hasOwn(descriptor, 'value')
          ? { writable: descriptor.writable, value: visit(descriptor.value) }
          : { getter: typeof descriptor.get === 'function', setter: typeof descriptor.set === 'function' }),
      }];
    });
    const prototype = Object.getPrototypeOf(value);
    // Only custom inherited invocation/index properties matter; do not enumerate
    // either realm's intrinsics or invoke their accessors.
    const inherited = [];
    if (prototype !== null) {
      for (const key of ['declarations', 'profile', '0']) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
        if (descriptor) inherited.push([key, Object.hasOwn(descriptor, 'value')
          ? { value: visit(descriptor.value) } : { getter: typeof descriptor.get === 'function' }]);
      }
    }
    return { identity, array: Array.isArray(value), nullPrototype: prototype === null,
      frozen: Object.isFrozen(value), own, inherited };
  }
  return visit(root);
}

test('portable original62 recipes preserve descriptor and carrier evidence and complete public results', async t => {
  const rows = JSON.parse(JSON.stringify([...produceInvocationRuntimeFixtures()]));
  assert.deepEqual(rows.map(row => row.id), rawInvocationCaseIds());
  for (const row of rows) await t.test(row.id, async () => {
    const original = materializeRawInvocationCase(row.id);
    const portable = materializeInvocationRuntimeInput(row, capabilities);
    assert.deepEqual(projection(portable.input), projection(original.input), row.id);
    assert.equal(original.reads(), 0, row.id);
    assert.equal(portable.getterCalls(), 0, row.id);
    const pending = core.compileCompositionJson(original.input);
    original.after();
    assert.deepEqual(await pending, rawInvocationExpectedResult(row.id), row.id);
    assert.equal(original.reads(), 0, row.id);
    const record = await executeInvocationRuntimeFixture(core, row, capabilities);
    assert.deepEqual(record.result, rawInvocationExpectedResult(row.id), row.id);
    assert.equal(record.observations.getterCalls, 0, row.id);
    assert.ok(record.observations.containers > 0, row.id);
    assert.ok(record.observations.mutationRejections > 0, row.id);
  });
});

test('complete runtime inventory executes the real generated public compiler', async () => {
  const records = await executeInvocationRuntimeFixtures(core, produceInvocationRuntimeFixtures(), capabilities);
  assert.equal(records.length, 62);
  assert.equal(records.filter(row => row.observations.foreignRealm).length, 3);
  assert.equal(records.filter(row => row.observations.nodeBuffer).length, 1);
});

test('capability absence rejects explicitly without successful skips', async () => {
  for (const [id, code] of [
    ['dense-offset-buffer', 'invocation.node-buffer-unavailable'],
    ['foreign-null-frozen-wrapper', 'invocation.foreign-realm-unavailable'],
    ['realm-array-cleared', 'invocation.foreign-realm-unavailable'],
    ['realm-shared-both', 'invocation.foreign-realm-unavailable'],
  ]) {
    await assert.rejects(executeInvocationRuntimeFixture(core, fixture(id)), { code });
  }
  await assert.rejects(executeInvocationRuntimeFixtures(core, produceInvocationRuntimeFixtures()),
    { code: 'invocation.foreign-realm-unavailable' });
  await assert.rejects(executeInvocationRuntimeFixture(core, fixture('dense-offset-buffer'), {
    nodeBuffer: Uint8Array,
  }), { code: 'invocation.node-buffer-unavailable' });
  await assert.rejects(executeInvocationRuntimeFixture(core, fixture('realm-array-cleared'), {
    foreignRealmFactory: () => ({ input: { declarations: [new Uint8Array([1, 2])],
      profile: new Uint8Array([3]) }, after() {} }),
  }), /foreign array required/);
});

test('unknown, extended, duplicate and incomplete recipes reject', async () => {
  const row = fixture('empty-batch');
  assert.throws(() => materializeInvocationRuntimeInput({
    ...row, recipe: { ...row.recipe, length: 999999999 },
  }), /exactly inventory and factoryId/);
  assert.throws(() => materializeInvocationRuntimeInput({ ...row, id: 'unknown' }),
    /unknown original62/);
  await assert.rejects(executeInvocationRuntimeFixtures(core, [row], capabilities), /incomplete/);
  await assert.rejects(executeInvocationRuntimeFixtures(core, [row, row], capabilities), /duplicate/);
});

test('compiler rejection and synchronous throws remain failures', async () => {
  const failure = new Error('primitive failure');
  await assert.rejects(executeInvocationRuntimeFixture({
    compileCompositionJson() { throw failure; },
  }, fixture('empty-batch')), error => error === failure);
  await assert.rejects(executeInvocationRuntimeFixture({
    compileCompositionJson() { return Promise.reject(failure); },
  }, fixture('empty-batch')), error => error === failure);
});

test('deferred admission observes caller mutation and cannot qualify', async () => {
  await assert.rejects(executeInvocationRuntimeFixture({
    compileCompositionJson(input) {
      return Promise.resolve().then(() => core.compileCompositionJson(input));
    },
  }, fixture('replace-wrapper-list-profile')), /result (keys|value) mismatch/);
});

test('complete comparison rejects wrong, mutable and accessor results before transport', async () => {
  const row = fixture('empty-batch');
  await assert.rejects(executeInvocationRuntimeFixture({
    compileCompositionJson: async () => ({ ok: false, diagnostics: row.expected.diagnostics }),
  }, row), /not frozen/);
  await assert.rejects(executeInvocationRuntimeFixture({
    compileCompositionJson: async () => Object.freeze({ ok: true }),
  }, fixture('empty-batch')), /result keys mismatch/);
  let reads = 0;
  await assert.rejects(executeInvocationRuntimeFixture({
    compileCompositionJson: async () => Object.freeze({
      get ok() { reads += 1; return false; }, diagnostics: Object.freeze([]),
    }),
  }, fixture('empty-batch')), /result accessor/);
  assert.equal(reads, 0);
});
