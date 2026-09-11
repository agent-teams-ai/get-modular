// Fixture preparation only. No historical runner or compiler is imported.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { repoFileUrl } from './support/load-repo-json.mjs';

const provenance = Object.freeze({
  sourceCommit: 'e38a2a909118130b6e1a74f4a0ea4697530046e5',
  runner: './m2-candidate/raw-invocation-oracle.test.mjs',
  runnerSha256: 'f378165b09d9a5f4875a4c41e34b10e7b286fc09f076ad9423f999faa771f0d0',
  classifier: './m2-candidate/raw-carrier-oracle.mjs',
  classifierSha256: '66ceef427f7b99446e78081b910e2f77a117c0b8f3679350bd2cff4c9237e84c',
  derived: './support/m2-raw-invocation-fixtures.mjs',
  compilerExecuted: false,
});
const spans = Object.freeze([
  Object.freeze({
    first: 'const D = 1048576;\n',
    last: "const bufferOf = Object.getOwnPropertyDescriptor(TA, 'buffer').get;\n",
  }),
  Object.freeze({ first: 'const fill = TA.fill;\n', last: 'const fill = TA.fill;\n' }),
  Object.freeze({
    first: 'function small(values) { return { length: values.length, values }; }\n',
    last: "  'huge-length-poison-tail', 'maximum-array-length-poison-tail',\n]);\n",
  }),
]);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => readFileSync(repoFileUrl(`tests/qualification/${path.replace(/^\.\//, '')}`));
const descriptor = Object.getOwnPropertyDescriptor;
const typedArray = Object.getPrototypeOf(Uint8Array.prototype);
const bufferOf = descriptor(typedArray, 'buffer').get;
const lengthOf = descriptor(typedArray, 'length').get;
const offsetOf = descriptor(typedArray, 'byteOffset').get;
const bytesOf = view => Array.from(new Uint8Array(view));

// Three fixed byte spans, with unique inclusive anchors; no source evaluation.
function span(bytes, { first, last }) {
  const start = bytes.indexOf(first);
  const finish = bytes.indexOf(last);
  assert.ok(start >= 0 && finish >= start, 'missing or reversed fixed anchors');
  assert.equal(bytes.indexOf(first, start + 1), -1, 'ambiguous first anchor');
  assert.equal(bytes.indexOf(last, finish + 1), -1, 'ambiguous last anchor');
  return bytes.subarray(start, finish + Buffer.byteLength(last));
}

test('closed raw invocation fixtures; compilerExecuted: false', async t => {
  const runner = read(provenance.runner);
  const derived = read(provenance.derived);
  assert.equal(digest(runner), provenance.runnerSha256);
  assert.equal(digest(read(provenance.classifier)), provenance.classifierSha256);
  for (const anchors of spans) {
    assert.deepEqual(span(derived, anchors), span(runner, anchors));
  }
  const copiedLines = spans.reduce((count, anchors) =>
    count + span(derived, anchors).toString('utf8').split('\n').length - 1, 0);
  assert.equal(copiedLines, 591);
  const imports = derived.toString('utf8').split('\n').filter(line => line.startsWith('import '));
  assert.deepEqual(imports, [
    "import assert from 'node:assert/strict';",
    "import { createHash } from 'node:crypto';",
    "import { createContext, runInContext } from 'node:vm';",
    "import { classifyByteCarrier } from '../m2-candidate/raw-carrier-oracle.mjs';",
  ]);
  // Authenticate the classifier before evaluating the derived module.
  const api = await import('./support/m2-raw-invocation-fixtures.mjs');
  const { rawInvocationCaseIds: ids, materializeRawInvocationCase: make } = api;
  assert.deepEqual(Object.keys(api).sort(), ['materializeRawInvocationCase', 'rawInvocationCaseIds']);
  const originalIds = span(runner, {
    first: 'const CLOSED_IDS = Object.freeze([\n',
    last: "  'huge-length-poison-tail', 'maximum-array-length-poison-tail',\n]);\n",
  }).toString('utf8');
  const orderedIds = Array.from(originalIds.matchAll(/'([^']+)'/g), match => match[1]);

  await t.test('exact ordered immutable membership and closed arguments', () => {
    assert.equal(ids.length, 0);
    assert.equal(make.length, 1);
    assert.equal(orderedIds.length, 62);
    assert.equal(new Set(orderedIds).size, 62);
    assert.deepEqual(ids(), orderedIds);
    assert.equal(Object.isFrozen(ids()), true);
    assert.throws(() => ids().push('extra'), TypeError);
    assert.throws(() => { ids()[0] = 'extra'; }, TypeError);
    for (const args of [[undefined], ['dense-offset-buffer'], [null, null]]) {
      assert.throws(() => ids(...args), TypeError);
    }
    for (const args of [[], [undefined], [null], [1], [Symbol('id')],
      [new String('empty-batch')], ['empty-batch', undefined], ['empty-batch', {}]]) {
      assert.throws(() => make(...args), TypeError);
    }
    for (const id of ['', 'unknown', '__proto__', 'constructor', 'toString', ' empty-batch']) {
      assert.throws(() => make(id), RangeError);
    }
    assert.throws(() => make({ toString() { assert.fail('must not coerce IDs'); } }), TypeError);
    assert.deepEqual(ids(), orderedIds);
  });

  await t.test('fresh fixtures preserve repeated aliases within each invocation', () => {
    const a = make('repeated-carrier-owned-separately');
    const b = make('repeated-carrier-owned-separately');
    for (const key of ['input', 'expected', 'references', 'shapes', 'after', 'reads']) {
      assert.notEqual(a[key], b[key], key);
    }
    const first = a.input.declarations[0];
    assert.equal(first, a.input.declarations[1]);
    assert.equal(first, a.input.profile);
    assert.notEqual(bufferOf.call(first), bufferOf.call(b.input.profile));
    assert.equal(a.shapes[0], a.shapes[1]);
    assert.equal(a.shapes[0], a.shapes[2]);
    assert.notEqual(a.shapes[0], b.shapes[0]);
    assert.equal(a.references.has(first), true);
    assert.equal(a.references.has(bufferOf.call(first)), true);
    first[0] = 55;
    assert.deepEqual(bytesOf(b.input.profile), [1, 2]);
    a.expected.batch.actual = -1;
    a.shapes[0].values[0] = 44;
    assert.equal(b.expected.batch.actual, 6);
    assert.deepEqual(b.shapes[0].values, [1, 2]);
    a.after();
    assert.deepEqual(bytesOf(first), [99, 99]);
    assert.deepEqual(bytesOf(b.input.profile), [1, 2]);
  });

  await t.test('offsets, Buffer view, and mutation outside visible bytes', () => {
    const f = make('dense-offset-buffer');
    const list = f.input.declarations;
    const bufferView = list[1];
    const profile = f.input.profile;
    const backing = new Uint8Array(bufferOf.call(profile));
    assert.equal(Buffer.isBuffer(bufferView), true);
    assert.deepEqual(bytesOf(bufferView), [4, 5]);
    assert.equal(lengthOf.call(bufferView), 2);
    const bufferBacking = new Uint8Array(bufferOf.call(bufferView));
    const start = offsetOf.call(bufferView);
    assert.equal(bufferBacking[start - 1], 88);
    assert.equal(bufferBacking[start + 2], 89);
    assert.equal(offsetOf.call(profile), 1);
    assert.deepEqual(Array.from(backing), [90, 6, 7, 91]);
    f.after();
    assert.deepEqual(Array.from(backing), [90, 99, 99, 91]);
    assert.deepEqual(bytesOf(bufferView), [99, 99]);
    assert.equal(bufferBacking[start - 1], 88);
    assert.equal(bufferBacking[start + 2], 89);
    assert.deepEqual(bytesOf(list[0]), [250]);
    assert.deepEqual(bytesOf(f.input.declarations[0]), [251]);
    assert.deepEqual(bytesOf(f.input.profile), [252]);
  });

  await t.test('frozen, foreign, inherited, accessor and poisoned shapes', () => {
    for (const id of ['frozen-null-wrapper', 'foreign-null-frozen-wrapper']) {
      const f = make(id);
      const input = f.input;
      const list = input.declarations;
      assert.equal(Object.getPrototypeOf(input), null);
      assert.equal(Object.isFrozen(input), true);
      assert.equal(Object.isFrozen(list), true);
      const property = descriptor(input, 'declarations');
      assert.equal(property.writable, false);
      assert.equal(property.configurable, false);
      assert.equal(property.enumerable, id === 'foreign-null-frozen-wrapper');
      assert.equal(list instanceof Array, id === 'frozen-null-wrapper');
      const view = list[0];
      f.after();
      assert.equal(input.declarations, list);
      assert.equal(list[0], view);
      assert.equal(bytesOf(view).every(byte => byte === 99), true);
    }
    const inherited = make('own-shadows-inherited');
    assert.equal(typeof descriptor(Object.getPrototypeOf(inherited.input), 'profile').get, 'function');
    assert.equal(descriptor(inherited.input, 'profile').enumerable, false);
    inherited.after();
    assert.equal(inherited.reads(), 0);
    const accessor = make('accessor-index');
    assert.equal(typeof descriptor(accessor.input.declarations, '0').get, 'function');
    assert.equal(Object.hasOwn(descriptor(accessor.input.declarations, '0'), 'value'), false);
    accessor.after();
    assert.equal(accessor.reads(), 0);
    const extra = make('nonenumerable-index-extra-keys');
    assert.equal(descriptor(extra.input.declarations, '0').enumerable, false);
    assert.equal(typeof descriptor(extra.input.declarations, Symbol.iterator).get, 'function');
    extra.after();
    assert.equal(extra.reads(), 0);
    const poison = make('poisoned-carrier-properties');
    const views = poison.input.declarations;
    assert.equal(typeof descriptor(views[0], 'buffer').get, 'function');
    assert.notEqual(Object.getPrototypeOf(views[1]), Uint8Array.prototype);
    assert.equal(typeof descriptor(Object.getPrototypeOf(views[2]), 'length').get, 'function');
    assert.equal(Object.isExtensible(poison.input.profile), false);
    const saved = views.slice();
    poison.after();
    assert.deepEqual(saved.map(bytesOf), [[99, 99], [99], [99]]);
    assert.equal(poison.reads(), 0);
  });

  await t.test('custom mutation precedes fill and wrapper/list replacement', () => {
    const f = make('replace-wrapper-list-profile');
    const list = f.input.declarations;
    const first = list[0];
    const second = list[1];
    const profile = f.input.profile;
    f.after();
    assert.deepEqual(bytesOf(first), [99, 99]);
    assert.deepEqual(bytesOf(second), [99]);
    assert.deepEqual(bytesOf(profile), [99, 99]);
    assert.deepEqual(bytesOf(list[0]), [250]);
    assert.deepEqual(bytesOf(list[1]), [71]);
    assert.deepEqual(bytesOf(f.input.declarations[0]), [251]);
    assert.deepEqual(bytesOf(f.input.profile), [252]);
    const realm = make('realm-array-cleared');
    const foreign = realm.input.declarations[0];
    assert.equal(foreign instanceof Uint8Array, false);
    realm.after();
    assert.deepEqual(bytesOf(foreign), [99, 99]);
  });

  await t.test('exact detachment, resizable and growable transitions', () => {
    for (const id of ['rab-fixed-inbounds', 'rab-tracking-profile-inbounds',
      'rab-fixed-outofbounds', 'rab-tracking-profile-outofbounds',
      'transferred-destination', 'postcall-detach-both']) {
      const f = make(id);
      const view = id.includes('profile') ? f.input.profile : f.input.declarations[0];
      const other = f.input.profile;
      const buffer = bufferOf.call(view);
      assert.equal(buffer.byteLength, id.includes('outofbounds') ? 1 :
        id.startsWith('rab-') ? 6 : id === 'transferred-destination' ? 3 : 2);
      f.after();
      assert.equal(buffer.byteLength, 0);
      assert.throws(() => new Uint8Array(view), TypeError);
      if (id === 'postcall-detach-both') {
        assert.throws(() => new Uint8Array(other), TypeError);
      }
    }
    for (const id of ['detached-declaration', 'detached-profile']) {
      const f = make(id);
      const view = id === 'detached-profile' ? f.input.profile : f.input.declarations[0];
      assert.throws(() => new Uint8Array(view), TypeError);
      f.after();
      assert.throws(() => new Uint8Array(view), TypeError);
    }
    const empty = make('rab-empty-end-views');
    const fixed = empty.input.declarations[0];
    const tracking = empty.input.profile;
    assert.equal(bufferOf.call(fixed), bufferOf.call(tracking));
    assert.equal(offsetOf.call(fixed), 4);
    empty.after();
    assert.deepEqual(bytesOf(fixed), []);
    assert.deepEqual(bytesOf(tracking), [99, 99, 99, 99]);
    assert.deepEqual(Array.from(new Uint8Array(bufferOf.call(fixed))), [0, 0, 0, 0, 99, 99, 99, 99]);
    const shared = make('growable-shared-profile');
    const view = shared.input.profile;
    shared.after();
    assert.deepEqual(bytesOf(view), new Array(8).fill(99));
  });

  await t.test('all original recipes materialize and mutate serially', () => {
    // One fixture per iteration; never retain a corpus of large payloads.
    for (const id of orderedIds) {
      const f = make(id);
      assert.deepEqual(Object.keys(f).sort(),
        ['after', 'expected', 'indexReads', 'input', 'reads', 'references', 'shapes']);
      assert.equal(f.expected.scope, 'proposed-only/raw-invocation', id);
      assert.equal(Object.hasOwn(f.expected, 'ok'), false, id);
      assert.equal(f.reads(), 0, id);
      assert.equal(Number.isInteger(f.indexReads), true, id);
      const before = JSON.stringify(f.expected);
      f.after();
      assert.equal(f.reads(), 0, id);
      assert.equal(JSON.stringify(f.expected), before, id);
    }
  });

  await t.test('selected byte and count boundaries allocate serially', () => {
    for (const [id, role, size, offset, outside] of [
      ['declaration-at', 'declaration', 1048576, 1, 231],
      ['profile-at', 'profile', 8388608, 3, 232],
    ]) {
      const f = make(id);
      const view = role === 'profile' ? f.input.profile : f.input.declarations[0];
      const document = role === 'profile' ? f.expected.documents.profile : f.expected.documents.declarations[0];
      assert.equal(lengthOf.call(view), size);
      assert.equal(offsetOf.call(view), offset);
      assert.equal(view[0], 17);
      assert.equal(view[Math.floor(size / 2)], 89);
      assert.equal(view[size - 1], 203);
      assert.equal(document.bytes.sha256, `sha256:${digest(view)}`);
      f.after();
      const backing = new Uint8Array(bufferOf.call(view));
      assert.equal(backing[offset - 1], outside);
      assert.equal(backing[offset + size], outside);
      assert.equal(view[0], 99);
      assert.equal(view[size - 1], 99);
    }
    for (const [id, actual, state] of [
      ['aggregate-at', 16777216, 'valid'],
      ['aggregate-plus-one', 16777217, 'invalid'],
      ['aggregate-invalid-zero', 16777216, 'valid'],
      ['far-overflow-saturates', 16777217, 'invalid'],
    ]) {
      const f = make(id);
      assert.equal(f.expected.batch.actual, actual);
      assert.equal(f.expected.batch.state, state);
      if (id.startsWith('aggregate-')) assert.equal(f.input.declarations[0], f.input.declarations[7]);
      if (state === 'invalid') assert.equal(f.shapes.every(shape => shape === null), true);
      f.after();
    }
  });
  t.diagnostic(JSON.stringify({ ...provenance, copiedLines, invocationCases: orderedIds.length }));
});
