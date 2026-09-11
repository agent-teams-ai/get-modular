// Development-only derived fixtures; compilerExecuted: false.
// expected is the original PRIVATE admission observation, not a compiler result.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createContext, runInContext } from 'node:vm';
import { classifyByteCarrier } from '../m2-candidate/raw-carrier-oracle.mjs';

const D = 1048576;
const P = 8388608;
const A = 16777216;
const C = 4096;
const U8 = Uint8Array;
const TA = Object.getPrototypeOf(U8.prototype);
const bufferOf = Object.getOwnPropertyDescriptor(TA, 'buffer').get;
const fill = TA.fill;

function small(values) { return { length: values.length, values }; }
function flat(length, value = 0) { return { length, fill: value, marks: [] }; }
function marked(length) {
  return { length, fill: 0, marks: [[0, 17], [Math.floor(length / 2), 89], [length - 1, 203]] };
}
function byteAt(shape, index) {
  if (shape.values !== undefined) return shape.values[index];
  for (const [position, value] of shape.marks) if (position === index) return value;
  return shape.fill;
}
function materialize(shape) {
  const value = new U8(shape.length);
  if (shape.values !== undefined) value.set(shape.values);
  else {
    value.fill(shape.fill);
    for (const [index, byte] of shape.marks) value[index] = byte;
  }
  return value;
}
const shapeHashes = new WeakMap();
function expectedBytes(shape) {
  if (shapeHashes.has(shape)) return shapeHashes.get(shape);
  // Independently hash the declared byte pattern in constant-size chunks.
  const hash = createHash('sha256');
  const chunk = new U8(4096);
  for (let start = 0; start < shape.length; start += chunk.length) {
    const size = Math.min(chunk.length, shape.length - start);
    for (let index = 0; index < size; index += 1) chunk[index] = byteAt(shape, start + index);
    hash.update(new U8(chunk.buffer, 0, size));
  }
  const result = { length: shape.length, sha256: `sha256:${hash.digest('hex')}` };
  shapeHashes.set(shape, result);
  return result;
}
function valid(shape) {
  return { classification: { visibleLength: shape.length }, state: 'valid', actual: shape.length, shape };
}
function carrier(value, shape) { return { value, spec: valid(shape) }; }
function ordinary(shape) { return carrier(materialize(shape), shape); }
function invalid(value, reason = 'not-uint8array') {
  return { value, spec: { classification: { reason }, state: 'unavailable', actual: null, shape: null } };
}
function oversized(size, actual) {
  return { value: new U8(size), spec: {
    classification: { visibleLength: size }, state: 'invalid', actual, shape: null,
  } };
}
function path(root, index) {
  const result = [{ kind: 'field', value: root }];
  if (index !== undefined) result.push({ kind: 'index', value: index });
  return result;
}
function problem(root, observation, proposedReason = 'not-document-list', index) {
  return { path: path(root, index), observation, proposedReason };
}
function expectedDocument(spec, profile, index, batchValid) {
  const admitted = Object.hasOwn(spec.classification, 'visibleLength');
  return {
    path: profile ? path('profile') : path('declarations', index),
    classification: spec.classification,
    facts: {
      'document.byte-carrier-admitted': admitted ? 'valid' : 'invalid',
      'document.raw-bytes-admitted': spec.state,
    },
    raw: {
      limitName: profile ? 'profileRawDocumentBytes' : 'declarationRawDocumentBytes',
      limit: profile ? P : D,
      actual: spec.actual,
    },
    bytes: batchValid && spec.shape !== null ? expectedBytes(spec.shape) : null,
  };
}
function expectedNormal(declarations, profile, actual, batchState = 'valid') {
  const documents = declarations.map((spec, index) => expectedDocument(spec, false, index, batchState === 'valid'));
  const profileDocument = expectedDocument(profile, true, undefined, batchState === 'valid');
  const copied = [...documents, profileDocument].filter(document => document.bytes !== null);
  return {
    scope: 'proposed-only/raw-invocation',
    wrapper: { state: 'valid', issues: [] },
    count: { state: 'valid', limit: C, actual: declarations.length },
    batch: { state: batchState, limit: A, actual },
    documents: { state: 'classified', unavailableFacts: null, declarations: documents, profile: profileDocument },
    work: {
      classifiedCarriers: declarations.length + 1,
      ownedCopies: copied.length,
      ownedBytes: copied.reduce((total, document) => total + document.bytes.length, 0),
    },
  };
}
function expectedStop(wrapperState, issues, countState = 'unavailable', countActual = null) {
  return {
    scope: 'proposed-only/raw-invocation',
    wrapper: { state: wrapperState, issues },
    count: { state: countState, limit: C, actual: countActual },
    batch: { state: 'unavailable', limit: A, actual: null },
    documents: {
      state: 'unavailable',
      unavailableFacts: {
        'document.byte-carrier-admitted': 'unavailable',
        'document.raw-bytes-admitted': 'unavailable',
      },
      declarations: [],
      profile: null,
    },
    work: { classifiedCarriers: 0, ownedCopies: 0, ownedBytes: 0 },
  };
}
function fixture(input, expected, values, shapes, options = {}) {
  const references = new Set();
  const views = [];
  const keep = value => {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return;
    references.add(value);
    if (ArrayBuffer.isView(value)) {
      views.push(value);
      references.add(bufferOf.call(value));
    }
  };
  keep(input);
  const listDescriptor = input == null ? undefined : Object.getOwnPropertyDescriptor(input, 'declarations');
  const profileDescriptor = input == null ? undefined : Object.getOwnPropertyDescriptor(input, 'profile');
  const list = listDescriptor && Object.hasOwn(listDescriptor, 'value') ? listDescriptor.value : null;
  keep(list);
  if (profileDescriptor && Object.hasOwn(profileDescriptor, 'value')) keep(profileDescriptor.value);
  for (const value of values) keep(value);
  const replace = (object, key, value) => {
    if (object !== null && (typeof object === 'object' || typeof object === 'function')) {
      Reflect.defineProperty(object, key, { value, enumerable: true, writable: true, configurable: true });
    }
  };
  return {
    input, expected, references, shapes,
    indexReads: options.indexReads ?? expected.count.actual ?? 0,
    reads: options.reads ?? (() => 0),
    after() {
      if (options.after) options.after();
      for (const view of views) {
        try { fill.call(view, 99); } catch (error) { assert.equal(error instanceof TypeError, true); }
      }
      replace(list, '0', new U8([250]));
      replace(input, 'declarations', [new U8([251])]);
      replace(input, 'profile', new U8([252]));
    },
  };
}
function normal(entries, profileEntry, actual, options = {}) {
  let input = { declarations: entries.map(entry => entry.value), profile: profileEntry.value };
  if (options.input !== undefined) input = options.input;
  if (options.wrap) input = options.wrap(input);
  const specs = entries.map(entry => entry.spec);
  const batchState = options.batchState ?? 'valid';
  const expected = expectedNormal(specs, profileEntry.spec, actual, batchState);
  const shapes = [...specs, profileEntry.spec].map(spec => batchState === 'valid' ? spec.shape : null);
  return fixture(input, expected, [...entries.map(entry => entry.value), profileEntry.value], shapes,
    { ...options, indexReads: options.indexReads ?? entries.length });
}
function failure(input, state, issues, options = {}) {
  return fixture(input, expectedStop(state, issues, options.countState, options.countActual),
    options.values ?? [], [], { ...options, indexReads: options.indexReads ?? 0 });
}
function countFixture(input, options = {}) {
  const expected = expectedStop('valid', [], 'invalid', 4097);
  // Complete independent candidate: accepted phase/path/details, proposed eligibility.
  expected.countDiagnostic = {
    code: 'input.limit-exceeded',
    phase: 'declaration',
    path: [],
    coordinate: {},
    details: { limitName: 'declarations', limit: 4096, actual: 4097 },
  };
  return fixture(input, expected, options.values ?? [], [], { ...options, indexReads: 0 });
}
function countFailure(length, poisonTail = false) {
  let reads = 0;
  const empty = new U8();
  const list = length === C + 1 ? new Array(length).fill(empty) : [];
  list.length = length;
  if (poisonTail) {
    Object.defineProperty(list, `${length - 1}`, { get() { reads += 1; return empty; } });
    Object.defineProperty(list, '4096', { get() { reads += 1; return empty; } });
  }
  return countFixture({ declarations: list, profile: new U8([1]) }, {
    values: [empty], reads: () => reads,
  });
}
function lateIndexFailure(accessor) {
  let reads = 0;
  const values = [new U8([1]), new U8(1048577), new Uint16Array([3])];
  const list = [...values];
  list.length = 4;
  if (accessor) Object.defineProperty(list, '3', {
    get() { reads += 1; return new U8([9]); },
  });
  return failure({ declarations: list, profile: new U8([2]) }, 'invalid', [
    problem('declarations', accessor ? 'accessor-index' : 'missing-own-index'),
  ], { countState: 'valid', countActual: 4, indexReads: 4, values, reads: () => reads });
}
function rab(fixed, profileRole, outOfBounds) {
  const buffer = new ArrayBuffer(6, { maxByteLength: 12 });
  const view = fixed ? new U8(buffer, 2, 3) : new U8(buffer, 2);
  view.set([1, 2, 3]);
  const shape = small(fixed ? [1, 2, 3] : [1, 2, 3, 0]);
  if (outOfBounds) buffer.resize(1);
  const entry = outOfBounds ? invalid(view, 'unusable-view') : carrier(view, shape);
  const other = ordinary(small([4]));
  return normal(profileRole ? [other] : [entry], profileRole ? entry : other,
    outOfBounds ? 1 : shape.length + 1, {
      after() {
        if (outOfBounds) {
          buffer.resize(8);
          assert.deepEqual(classifyByteCarrier(view), { visibleLength: fixed ? 3 : 6 });
        } else {
          buffer.resize(1);
          assert.deepEqual(classifyByteCarrier(view), { reason: 'unusable-view' });
          buffer.resize(8);
        }
        const moved = buffer.transfer();
        new U8(moved).fill(77);
        assert.deepEqual(classifyByteCarrier(view), { reason: 'unusable-view' });
      },
    });
}
function aggregate(extraByte = false, invalidExtras = false) {
  const shape = flat(D, 13);
  const repeated = ordinary(shape);
  const entries = new Array(8).fill(repeated);
  if (extraByte) entries.push(ordinary(small([254])));
  if (invalidExtras) {
    entries.push(invalid(new Uint16Array(D / 2)));
    entries.push(invalid({ length: A, [Symbol.toStringTag]: 'Uint8Array' }));
  }
  return normal(entries, ordinary(marked(P)), extraByte ? 16777217 : 16777216,
    { batchState: extraByte ? 'invalid' : 'valid' });
}

// Every invocation recipe is fixed here. Helpers above are private construction
// conveniences; no input can select a new recipe, size, mutation, or expected row.
const CASES = Object.freeze([
  ['dense-offset-buffer', () => {
    const backing = new U8([90, 6, 7, 91]);
    return normal([
      ordinary(small([1, 2, 3])),
      carrier(Buffer.from([88, 4, 5, 89]).subarray(1, 3), small([4, 5])),
    ], carrier(new U8(backing.buffer, 1, 2), small([6, 7])), 7);
  }],
  ['empty-batch', () => normal([], ordinary(small([])), 0)],
  ['frozen-null-wrapper', () => normal([ordinary(small([1, 2]))], ordinary(small([3])), 3, {
    wrap(input) {
      Object.freeze(input.declarations);
      const wrapper = Object.create(null);
      Object.defineProperties(wrapper, {
        declarations: { value: input.declarations }, profile: { value: input.profile },
      });
      return Object.freeze(wrapper);
    },
  })],
  ['foreign-null-frozen-wrapper', () => {
    const input = runInContext(`Object.freeze(Object.assign(Object.create(null), {
      declarations: Object.freeze([new Uint8Array([1])]), profile: new Uint8Array([2])
    }))`, createContext({}));
    return normal([carrier(input.declarations[0], small([1]))], carrier(input.profile, small([2])), 2, { input });
  }],
  ['realm-array-cleared', () => {
    let realm = createContext({});
    let input = runInContext(`globalThis.input = {
      declarations: [new Uint8Array([1, 2])], profile: new Uint8Array([3])
    }; input`, realm);
    assert.equal(input.declarations instanceof Array, false);
    assert.equal(input.declarations[0] instanceof U8, false);
    return normal([carrier(input.declarations[0], small([1, 2]))], carrier(input.profile, small([3])), 3, {
      input,
      after() {
        runInContext('input.declarations[0].fill(77); input.profile.fill(78); delete globalThis.input;', realm);
        input = null;
        realm = null;
      },
    });
  }],
  ['own-shadows-inherited', () => {
    let reads = 0;
    return normal([ordinary(small([1]))], ordinary(small([2])), 2, {
      reads: () => reads,
      wrap(input) {
        const prototype = {};
        for (const key of ['declarations', 'profile']) Object.defineProperty(prototype, key, {
          get() { reads += 1; return undefined; },
        });
        return Object.create(prototype, {
          declarations: { value: input.declarations }, profile: { value: input.profile },
        });
      },
    });
  }],
  ['inherited-declarations', () => {
    let reads = 0;
    const prototype = { get declarations() { reads += 1; return []; } };
    const input = Object.create(prototype, { profile: { value: new U8([1]) } });
    return failure(input, 'invalid', [problem('declarations', 'missing-own-declarations')], { reads: () => reads });
  }],
  ['inherited-profile', () => {
    let reads = 0;
    const input = Object.create({ get profile() { reads += 1; return new U8(); } }, {
      declarations: { value: [] },
    });
    return failure(input, 'invalid', [problem('profile', 'missing-own-profile')], { reads: () => reads });
  }],
  ['accessor-declarations', () => {
    let reads = 0;
    const input = { get declarations() { reads += 1; return []; }, profile: new U8() };
    return failure(input, 'invalid', [problem('declarations', 'accessor-declarations')], { reads: () => reads });
  }],
  ['missing-declarations', () => failure({ profile: new U8() }, 'invalid', [problem('declarations', 'missing-own-declarations')])],
  ['nonarray-declarations', () => {
    let reads = 0;
    return failure({ declarations: { get length() { reads += 1; return C; } }, profile: new U8() },
      'invalid', [problem('declarations', 'non-array-declarations')], { reads: () => reads });
  }],
  ['missing-profile', () => failure({ declarations: [new U8([1])] }, 'invalid', [problem('profile', 'missing-own-profile')])],
  ['accessor-profile', () => {
    let reads = 0;
    return failure({ declarations: [new U8([1])], get profile() { reads += 1; return new U8(); } },
      'invalid', [problem('profile', 'accessor-profile')], { reads: () => reads });
  }],
  ['both-fields-missing', () => failure({}, 'invalid', [
    problem('declarations', 'missing-own-declarations'), problem('profile', 'missing-own-profile'),
  ])],
  ['null-wrapper', () => failure(null, 'invalid', [
    problem('declarations', 'missing-own-declarations'), problem('profile', 'missing-own-profile'),
  ])],
  ['own-undefined-profile', () => normal([ordinary(small([1]))], invalid(undefined), 1)],
  ['own-undefined-index', () => normal([invalid(undefined), ordinary(small([2]))], ordinary(small([3])), 2)],
  ['sparse-list', () => {
    const list = [new U8([1])]; list.length = 2;
    return failure({ declarations: list, profile: new U8([2]) }, 'invalid', [
      problem('declarations', 'missing-own-index'),
    ], { countState: 'valid', countActual: 2, indexReads: 2 });
  }],
  ['inherited-index', () => {
    let reads = 0;
    const list = new Array(1);
    const prototype = Object.create(Array.prototype, { 0: { get() { reads += 1; return new U8([1]); } } });
    Object.setPrototypeOf(list, prototype);
    return failure({ declarations: list, profile: new U8() }, 'invalid', [
      problem('declarations', 'missing-own-index'),
    ], { countState: 'valid', countActual: 1, indexReads: 1, reads: () => reads });
  }],
  ['accessor-index', () => {
    let reads = 0;
    const list = new Array(1);
    Object.defineProperty(list, '0', { get() { reads += 1; return new U8([1]); } });
    return failure({ declarations: list, profile: new U8() }, 'invalid', [
      problem('declarations', 'accessor-index'),
    ], { countState: 'valid', countActual: 1, indexReads: 1, reads: () => reads });
  }],
  ['late-missing-index', () => lateIndexFailure(false)],
  ['late-accessor-index', () => lateIndexFailure(true)],
  ['nonenumerable-index-extra-keys', () => {
    let reads = 0;
    return normal([ordinary(small([1]))], ordinary(small([2])), 2, {
      reads: () => reads,
      wrap(input) {
        Object.defineProperty(input.declarations, '0', { enumerable: false });
        Object.defineProperty(input.declarations, 'extra', { get() { reads += 1; return 0; } });
        Object.defineProperty(input.declarations, Symbol.iterator, { get() { reads += 1; return null; } });
        Object.freeze(input.declarations);
        return Object.freeze(input);
      },
    });
  }],
  ['proto-literal-inherited', () => {
    const input = { __proto__: { declarations: [], profile: new U8() } };
    assert.equal(Object.hasOwn(input, '__proto__'), false);
    return failure(input, 'invalid', [
      problem('declarations', 'missing-own-declarations'), problem('profile', 'missing-own-profile'),
    ]);
  }],
  ['proto-own-and-symbol-extras', () => {
    let reads = 0;
    return normal([ordinary(small([1]))], ordinary(small([2])), 2, {
      reads: () => reads,
      wrap(input) {
        const wrapper = { ['__proto__']: { ignored: true }, ["token"]: 'inert',
          declarations: input.declarations, profile: input.profile };
        assert.equal(Object.getPrototypeOf(wrapper), Object.prototype);
        for (const target of [wrapper, input.declarations]) {
          Object.defineProperty(target, Symbol('ignored'), { get() { reads += 1; return 0; } });
          Object.defineProperty(target, 'ignored', { get() { reads += 1; return 0; } });
        }
        return wrapper;
      },
    });
  }],
  ['poisoned-carrier-properties', () => {
    let reads = 0;
    const poison = () => { reads += 1; throw new Error('carrier property was read'); };
    class Species extends U8 { static get [Symbol.species]() { return poison(); } }
    class Inherited extends U8 {}
    for (const key of ['buffer', 'length', 'byteOffset', 'byteLength', 'slice', 'subarray', Symbol.iterator]) {
      Object.defineProperty(Inherited.prototype, key, { get: poison });
    }
    const own = new U8([1, 2]);
    for (const key of ['buffer', 'length', 'byteOffset', 'byteLength', 'constructor', 'slice', 'subarray', Symbol.iterator, Symbol.toStringTag]) {
      Object.defineProperty(own, key, { get: poison });
    }
    return normal([
      carrier(own, small([1, 2])), carrier(new Species([3]), small([3])),
      carrier(new Inherited([4]), small([4])),
    ], carrier(Object.preventExtensions(new U8([5])), small([5])), 5, { reads: () => reads });
  }],
  ['independent-invalid-carriers', () => normal([
    invalid([1, 2]), ordinary(small([3])), invalid(new Uint16Array([4])),
  ], ordinary(small([5, 6])), 3)],
  ['rab-fixed-inbounds', () => rab(true, false, false)],
  ['rab-tracking-profile-inbounds', () => rab(false, true, false)],
  ['rab-fixed-outofbounds', () => rab(true, false, true)],
  ['rab-tracking-profile-outofbounds', () => rab(false, true, true)],
  ['rab-empty-end-views', () => {
    const buffer = new ArrayBuffer(4, { maxByteLength: 8 });
    const fixed = new U8(buffer, 4, 0);
    const tracking = new U8(buffer, 4);
    return normal([carrier(fixed, small([]))], carrier(tracking, small([])), 0, {
      after() {
        buffer.resize(3);
        assert.deepEqual(classifyByteCarrier(fixed), { reason: 'unusable-view' });
        assert.deepEqual(classifyByteCarrier(tracking), { reason: 'unusable-view' });
        buffer.resize(8);
        assert.deepEqual(classifyByteCarrier(fixed), { visibleLength: 0 });
        assert.deepEqual(classifyByteCarrier(tracking), { visibleLength: 4 });
      },
    });
  }],
  ['detached-declaration', () => {
    const view = new U8([1]); view.buffer.transfer();
    return normal([invalid(view, 'unusable-view')], ordinary(small([2])), 1);
  }],
  ['detached-profile', () => {
    const view = new U8([1]); structuredClone(view.buffer, { transfer: [view.buffer] });
    return normal([ordinary(small([2]))], invalid(view, 'unusable-view'), 1);
  }],
  ['transferred-destination', () => {
    const source = new U8([1, 2, 3]);
    const moved = new U8(source.buffer.transfer());
    return normal([carrier(moved, small([1, 2, 3]))], ordinary(small([4])), 4, {
      after() { moved.buffer.transfer(); },
    });
  }],
  ['shared-declaration', () => normal([
    invalid(new U8(new SharedArrayBuffer(4)), 'shared-storage'), ordinary(small([1])),
  ], ordinary(small([2])), 2)],
  ['growable-shared-profile', () => {
    const shared = new SharedArrayBuffer(4, { maxByteLength: 8 });
    return normal([ordinary(small([1]))], invalid(new U8(shared), 'shared-storage'), 1, {
      after() { shared.grow(8); new U8(shared).fill(77); },
    });
  }],
  ['realm-shared-both', () => {
    const values = runInContext('[new Uint8Array(new SharedArrayBuffer(4)), new Uint8Array(new SharedArrayBuffer(4, {maxByteLength:8}))]', createContext({}));
    return normal([invalid(values[0], 'shared-storage')], invalid(values[1], 'shared-storage'), 0);
  }],
  ['repeated-carrier-owned-separately', () => {
    const entry = ordinary(small([1, 2]));
    return normal([entry, entry], entry, 6);
  }],
  ['replace-wrapper-list-profile', () => {
    const first = ordinary(small([1, 2]));
    const second = ordinary(small([3]));
    const profile = ordinary(small([4, 5]));
    const input = { declarations: [first.value, second.value], profile: profile.value };
    const originalList = input.declarations;
    return normal([first, second], profile, 5, {
      input,
      after() {
        originalList[1] = new U8([71]);
        input.profile = new U8([72]);
        input.declarations = [new U8([73])];
      },
    });
  }],
  ['postcall-detach-both', () => {
    const declaration = ordinary(small([1, 2]));
    const profile = ordinary(small([3]));
    return normal([declaration], profile, 3, {
      after() {
        for (const entry of [declaration, profile]) {
          const buffer = entry.value.buffer;
          const moved = structuredClone(buffer, { transfer: [buffer] });
          new U8(moved).fill(77);
          assert.deepEqual(classifyByteCarrier(entry.value), { reason: 'unusable-view' });
        }
      },
    });
  }],
  ['declaration-at', () => {
    const shape = marked(D);
    const backing = new U8(D + 2).fill(231);
    const view = new U8(backing.buffer, 1, D); view.set(materialize(shape));
    return normal([carrier(view, shape)], ordinary(small([])), 1048576);
  }],
  ['declaration-plus-one', () => normal([oversized(1048577, 1048577)], ordinary(small([9])), 1048578)],
  ['profile-at', () => {
    const shape = marked(P);
    const backing = new U8(P + 6).fill(232);
    const view = new U8(backing.buffer, 3, P); view.set(materialize(shape));
    return normal([ordinary(small([]))], carrier(view, shape), 8388608);
  }],
  ['profile-plus-one', () => normal([ordinary(small([9]))], oversized(8388609, 8388609), 8388610)],
  ['aggregate-at', () => aggregate(false, false)],
  ['aggregate-plus-one', () => aggregate(true, false)],
  ['aggregate-invalid-zero', () => aggregate(false, true)],
  ['oversized-still-counts-below-batch', () => normal([
    oversized(1048578, 1048577), invalid(new Uint16Array(8)),
  ], ordinary(small([7, 8])), 1048580)],
  ['oversized-contributes-overflow', () => {
    const large = oversized(1048577, 1048577);
    return normal(new Array(16).fill(large), ordinary(small([9])), 16777217, { batchState: 'invalid' });
  }],
  ['oversized-profile-contributes-overflow', () => {
    const entry = ordinary(flat(D, 17));
    return normal(new Array(8).fill(entry), oversized(8388609, 8388609), 16777217, { batchState: 'invalid' });
  }],
  ['far-overflow-saturates', () => normal([
    oversized(16781312, 1048577), invalid(undefined),
  ], ordinary(small([])), 16777217, { batchState: 'invalid' })],
  ['declarations-at', () => {
    const entry = ordinary(small([]));
    return normal(new Array(4096).fill(entry), ordinary(small([])), 0);
  }],
  ['declarations-plus-one', () => countFailure(4097)],
  ['declarations-overflow-mixed', () => {
    // Ordinary getter descriptors and oversized carriers; no hostile Proxy claim.
    let reads = 0;
    const empty = new U8();
    const tail = new U8(1048577);
    const list = new Array(4097).fill(empty);
    list[4096] = tail;
    for (const index of [0, 2048]) Object.defineProperty(list, `${index}`, {
      get() { reads += 1; return empty; },
    });
    return countFixture({ declarations: list, profile: new U8(8388609) }, {
      values: [empty, tail], reads: () => reads,
    });
  }],
  ['declarations-overflow-hole', () => countFixture({
    declarations: new Array(4097), profile: new U8([1]),
  })],
  ['declarations-overflow-undefined-profile', () => countFixture({
    declarations: new Array(4097), profile: undefined,
  })],
  ['declarations-overflow-missing-profile', () => failure({ declarations: new Array(4097) },
    'invalid', [problem('profile', 'missing-own-profile')])],
  ['declarations-overflow-accessor-profile', () => {
    let reads = 0;
    return failure({ declarations: new Array(4097), get profile() { reads += 1; return new U8(); } },
      'invalid', [problem('profile', 'accessor-profile')], { reads: () => reads });
  }],
  ['malformed-overflow-list', () => failure({
    declarations: { length: 4294967295 }, profile: new U8(),
  }, 'invalid', [problem('declarations', 'non-array-declarations')])],
  ['huge-length-poison-tail', () => countFailure(65536, true)],
  ['maximum-array-length-poison-tail', () => countFailure(4294967295, true)],
]);

const CLOSED_IDS = Object.freeze([
  'dense-offset-buffer', 'empty-batch', 'frozen-null-wrapper', 'foreign-null-frozen-wrapper',
  'realm-array-cleared', 'own-shadows-inherited', 'inherited-declarations', 'inherited-profile',
  'accessor-declarations', 'missing-declarations', 'nonarray-declarations', 'missing-profile',
  'accessor-profile', 'both-fields-missing', 'null-wrapper', 'own-undefined-profile',
  'own-undefined-index', 'sparse-list', 'inherited-index', 'accessor-index',
  'late-missing-index', 'late-accessor-index',
  'nonenumerable-index-extra-keys', 'proto-literal-inherited', 'proto-own-and-symbol-extras',
  'poisoned-carrier-properties', 'independent-invalid-carriers', 'rab-fixed-inbounds',
  'rab-tracking-profile-inbounds', 'rab-fixed-outofbounds', 'rab-tracking-profile-outofbounds',
  'rab-empty-end-views', 'detached-declaration', 'detached-profile', 'transferred-destination',
  'shared-declaration', 'growable-shared-profile', 'realm-shared-both', 'repeated-carrier-owned-separately',
  'replace-wrapper-list-profile', 'postcall-detach-both', 'declaration-at', 'declaration-plus-one',
  'profile-at', 'profile-plus-one', 'aggregate-at', 'aggregate-plus-one', 'aggregate-invalid-zero',
  'oversized-still-counts-below-batch', 'oversized-contributes-overflow',
  'oversized-profile-contributes-overflow', 'far-overflow-saturates', 'declarations-at',
  'declarations-plus-one', 'declarations-overflow-mixed', 'declarations-overflow-hole',
  'declarations-overflow-undefined-profile', 'declarations-overflow-missing-profile',
  'declarations-overflow-accessor-profile', 'malformed-overflow-list',
  'huge-length-poison-tail', 'maximum-array-length-poison-tail',
]);

const factories = new Map(CASES);
assert.deepEqual(CASES.map(([id]) => id), CLOSED_IDS);
assert.equal(factories.size, 62);

export function rawInvocationCaseIds() {
  if (arguments.length !== 0) throw new TypeError('Expected zero arguments');
  return CLOSED_IDS;
}

export function materializeRawInvocationCase(id) {
  if (arguments.length !== 1 || typeof id !== 'string') {
    throw new TypeError('Expected exactly one string case ID');
  }
  const make = factories.get(id);
  if (make === undefined) throw new RangeError('Unknown raw invocation case ID');
  return make();
}
