// Native ESM: no Node imports, evaluation of transported code, or size parameters.
import { rawInvocationExpectedIds } from './m2-raw-invocation-expectations.mjs';

const ids = new Set(rawInvocationExpectedIds());
const U8 = Uint8Array;
const TA = Object.getPrototypeOf(U8.prototype);
const bufferOf = Object.getOwnPropertyDescriptor(TA, 'buffer').get;
const lengthOf = Object.getOwnPropertyDescriptor(TA, 'length').get;
const fill = TA.fill;
const D = 1048576;
const P = 8388608;

function fail(code, message) {
  const error = new Error(message);
  error.code = `invocation.${code}`;
  throw error;
}

function demand(condition, message) {
  if (!condition) fail('invalid-recipe', message);
}

export function validateInvocationRuntimeFixture(fixture) {
  demand(fixture !== null && typeof fixture === 'object', 'missing fixture');
  demand(ids.has(fixture.id), 'unknown original62 identity');
  const recipe = fixture.recipe;
  demand(recipe !== null && typeof recipe === 'object', 'missing recipe');
  demand(Reflect.ownKeys(recipe).length === 2 &&
    Object.hasOwn(recipe, 'inventory') && Object.hasOwn(recipe, 'factoryId'),
  'recipe must contain exactly inventory and factoryId');
  demand(recipe.inventory === 'original62' && recipe.factoryId === fixture.id,
    'recipe identity mismatch');
  return fixture.id;
}

export function materializeInvocationRuntimeInput(fixture, capabilities = {}) {
  const id = validateInvocationRuntimeFixture(fixture);
  const references = new Set();
  const views = [];
  let reads = 0;
  let foreignRealm = false;
  let nodeBuffer = false;
  let extraAfter = () => {};
  const poison = () => { reads += 1; throw new Error('carrier property was read'); };
  const getter = value => () => { reads += 1; return value; };
  const keep = value => {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return value;
    if (references.has(value)) return value;
    references.add(value);
    if (ArrayBuffer.isView(value)) {
      views.push(value);
      references.add(bufferOf.call(value));
    }
    return value;
  };
  const bytes = (...values) => keep(new U8(values));
  const flat = (length, value = 0) => keep(new U8(length).fill(value));
  const marked = (length, offset = 0, padding = 0, guard = 0) => {
    const backing = new U8(length + padding).fill(guard);
    const view = keep(new U8(backing.buffer, offset, length));
    view.fill(0);
    view[0] = 17;
    view[Math.floor(length / 2)] = 89;
    view[length - 1] = 203;
    return view;
  };
  const normal = (declarations, profile) => ({ declarations, profile });
  const access = (target, key, value, enumerable = false, configurable) => {
    Object.defineProperty(target, key, { get: getter(value), enumerable, ...(configurable === undefined ? {} : { configurable }) });
  };
  const rab = length => {
    if (typeof ArrayBuffer.prototype.resize !== 'function' ||
        typeof ArrayBuffer.prototype.transfer !== 'function') {
      fail('resizable-buffer-unavailable', 'resizable/transferable ArrayBuffer required');
    }
    const buffer = new ArrayBuffer(length, { maxByteLength: length * 2 });
    if (!buffer.resizable) fail('resizable-buffer-unavailable', 'resizable ArrayBuffer required');
    return buffer;
  };
  const shared = growable => {
    if (typeof SharedArrayBuffer !== 'function') {
      fail('shared-buffer-unavailable', 'SharedArrayBuffer required');
    }
    const buffer = growable
      ? new SharedArrayBuffer(4, { maxByteLength: 8 }) : new SharedArrayBuffer(4);
    if (growable && (!buffer.growable || typeof buffer.grow !== 'function')) {
      fail('growable-shared-buffer-unavailable', 'growable SharedArrayBuffer required');
    }
    return buffer;
  };
  const transfer = buffer => {
    if (typeof ArrayBuffer.prototype.transfer !== 'function') {
      fail('transfer-unavailable', 'ArrayBuffer.transfer required');
    }
    return ArrayBuffer.prototype.transfer.call(buffer);
  };
  const cloneTransfer = buffer => {
    if (typeof structuredClone !== 'function') {
      fail('structured-transfer-unavailable', 'structuredClone transfer required');
    }
    const moved = structuredClone(buffer, { transfer: [buffer] });
    if (buffer.byteLength !== 0) fail('structured-transfer-unavailable', 'transfer did not detach');
    return moved;
  };
  const foreign = () => {
    // The injected factory accepts ONLY the closed identity. It returns genuine
    // foreign objects plus the realm-clearing callback, never source to evaluate.
    if (typeof capabilities.foreignRealmFactory !== 'function') {
      fail('foreign-realm-unavailable', `foreign realm required for ${id}`);
    }
    const value = capabilities.foreignRealmFactory(id);
    const input = value?.input;
    demand(input !== null && typeof input === 'object', 'foreign factory input missing');
    const list = Object.getOwnPropertyDescriptor(input, 'declarations')?.value;
    const profile = Object.getOwnPropertyDescriptor(input, 'profile')?.value;
    demand(Array.isArray(list) && !(list instanceof Array), 'foreign array required');
    for (const view of [list[0], profile]) {
      demand(ArrayBuffer.isView(view) && !(view instanceof U8), 'foreign byte view required');
      demand(Object.getOwnPropertyDescriptor(TA, Symbol.toStringTag).get.call(view) ===
        'Uint8Array', 'foreign Uint8Array required');
      keep(view);
    }
    if (id === 'foreign-null-frozen-wrapper') {
      demand(Object.getPrototypeOf(input) === null && Object.isFrozen(input) &&
        Object.isFrozen(list), 'foreign frozen null wrapper required');
    }
    if (id === 'realm-array-cleared') {
      demand(typeof value.after === 'function', 'foreign realm cleanup required');
      extraAfter = value.after;
    }
    foreignRealm = true;
    return input;
  };

  let input;
  switch (id) {
    case 'dense-offset-buffer': {
      const Buffer = capabilities.nodeBuffer;
      if (typeof Buffer?.from !== 'function' || typeof Buffer?.isBuffer !== 'function') {
        fail('node-buffer-unavailable', 'explicit genuine Node Buffer capability required');
      }
      const view = Buffer.from([88, 4, 5, 89]).subarray(1, 3);
      if (!Buffer.isBuffer(view) || !ArrayBuffer.isView(view) ||
          Object.getPrototypeOf(view) === U8.prototype) {
        fail('node-buffer-unavailable', 'capability did not produce a Node Buffer');
      }
      nodeBuffer = true;
      input = normal([bytes(1, 2, 3), keep(view)],
        keep(new U8(new U8([90, 6, 7, 91]).buffer, 1, 2)));
      break;
    }
    case 'empty-batch': input = normal([], bytes()); break;
    case 'frozen-null-wrapper':
      input = Object.freeze(Object.create(null, {
        declarations: { value: Object.freeze([bytes(1, 2)]) },
        profile: { value: bytes(3) },
      }));
      break;
    case 'foreign-null-frozen-wrapper':
    case 'realm-array-cleared':
    case 'realm-shared-both': input = foreign(); break;
    case 'own-shadows-inherited': {
      const prototype = {};
      access(prototype, 'declarations', undefined);
      access(prototype, 'profile', undefined);
      keep(prototype);
      input = Object.create(prototype, {
        declarations: { value: [bytes(1)] }, profile: { value: bytes(2) },
      });
      break;
    }
    case 'inherited-declarations': {
      const prototype = {};
      access(prototype, 'declarations', []);
      input = Object.create(keep(prototype), { profile: { value: bytes(1) } });
      break;
    }
    case 'inherited-profile': {
      const prototype = {};
      access(prototype, 'profile', bytes());
      input = Object.create(keep(prototype), { declarations: { value: [] } });
      break;
    }
    case 'accessor-declarations':
      input = { declarations: undefined, profile: bytes() }; access(input, 'declarations', [], true, true); break;
    case 'missing-declarations': input = { profile: bytes() }; break;
    case 'nonarray-declarations': {
      const list = {};
      access(list, 'length', 4096, true, true);
      input = normal(list, bytes()); break;
    }
    case 'missing-profile': input = { declarations: [bytes(1)] }; break;
    case 'accessor-profile':
      input = { declarations: [bytes(1)] }; access(input, 'profile', bytes(), true, true); break;
    case 'both-fields-missing': input = {}; break;
    case 'null-wrapper': input = null; break;
    case 'own-undefined-profile': input = normal([bytes(1)], undefined); break;
    case 'own-undefined-index': input = normal([undefined, bytes(2)], bytes(3)); break;
    case 'sparse-list': {
      const list = [bytes(1)]; list.length = 2;
      input = normal(list, bytes(2)); break;
    }
    case 'inherited-index':
    case 'accessor-index': {
      const list = new Array(1);
      const target = id === 'inherited-index' ? Object.create(Array.prototype) : list;
      access(target, '0', bytes(1));
      if (target !== list) Object.setPrototypeOf(list, keep(target));
      input = normal(list, bytes()); break;
    }
    case 'late-missing-index':
    case 'late-accessor-index': {
      const list = [bytes(1), flat(D + 1), keep(new Uint16Array([3]))];
      list.length = 4;
      if (id === 'late-accessor-index') access(list, '3', bytes(9));
      input = normal(list, bytes(2)); break;
    }
    case 'nonenumerable-index-extra-keys':
      input = normal([bytes(1)], bytes(2));
      Object.defineProperty(input.declarations, '0', { enumerable: false });
      access(input.declarations, 'extra', 0);
      access(input.declarations, Symbol.iterator, null);
      Object.freeze(input.declarations); Object.freeze(input); break;
    case 'proto-literal-inherited':
      input = { __proto__: keep({ declarations: [], profile: bytes() }) }; break;
    case 'proto-own-and-symbol-extras':
      input = { ['__proto__']: keep({ ignored: true }), ["token"]: 'inert',
        declarations: [bytes(1)], profile: bytes(2) };
      for (const target of [input, input.declarations]) {
        access(target, Symbol('ignored'), 0); access(target, 'ignored', 0);
      }
      break;
    case 'poisoned-carrier-properties': {
      class Species extends U8 { static get [Symbol.species]() { return poison(); } }
      class Inherited extends U8 {}
      const keys = ['buffer', 'length', 'byteOffset', 'byteLength', 'slice', 'subarray', Symbol.iterator];
      for (const key of keys) Object.defineProperty(Inherited.prototype, key, { get: poison });
      const own = bytes(1, 2);
      for (const key of [...keys, 'constructor', Symbol.toStringTag]) {
        Object.defineProperty(own, key, { get: poison });
      }
      input = normal([own, keep(new Species([3])), keep(new Inherited([4]))],
        Object.preventExtensions(bytes(5)));
      break;
    }
    case 'independent-invalid-carriers':
      input = normal([keep([1, 2]), bytes(3), keep(new Uint16Array([4]))], bytes(5, 6)); break;
    case 'rab-fixed-inbounds':
    case 'rab-tracking-profile-inbounds':
    case 'rab-fixed-outofbounds':
    case 'rab-tracking-profile-outofbounds': {
      const fixed = id.startsWith('rab-fixed');
      const out = id.endsWith('-outofbounds');
      const buffer = rab(6);
      const view = keep(fixed ? new U8(buffer, 2, 3) : new U8(buffer, 2));
      view.set([1, 2, 3]);
      if (out) buffer.resize(1);
      input = fixed ? normal([view], bytes(4)) : normal([bytes(4)], view);
      extraAfter = () => {
        if (out) buffer.resize(8);
        else { buffer.resize(1); buffer.resize(8); }
        new U8(transfer(buffer)).fill(77);
      };
      break;
    }
    case 'rab-empty-end-views': {
      const buffer = rab(4);
      input = normal([keep(new U8(buffer, 4, 0))], keep(new U8(buffer, 4)));
      extraAfter = () => { buffer.resize(3); buffer.resize(8); }; break;
    }
    case 'detached-declaration':
    case 'detached-profile': {
      const view = bytes(1);
      if (id === 'detached-declaration') transfer(bufferOf.call(view));
      else cloneTransfer(bufferOf.call(view));
      input = id === 'detached-declaration' ? normal([view], bytes(2)) : normal([bytes(2)], view);
      break;
    }
    case 'transferred-destination': {
      const source = bytes(1, 2, 3);
      const moved = keep(new U8(transfer(bufferOf.call(source))));
      input = normal([moved], bytes(4));
      extraAfter = () => { transfer(bufferOf.call(moved)); }; break;
    }
    case 'shared-declaration':
      input = normal([keep(new U8(shared(false))), bytes(1)], bytes(2)); break;
    case 'growable-shared-profile': {
      const buffer = shared(true);
      input = normal([bytes(1)], keep(new U8(buffer)));
      extraAfter = () => { buffer.grow(8); new U8(buffer).fill(77); }; break;
    }
    case 'repeated-carrier-owned-separately': {
      const view = bytes(1, 2); input = normal([view, view], view); break;
    }
    case 'replace-wrapper-list-profile':
      input = normal([bytes(1, 2), bytes(3)], bytes(4, 5));
      extraAfter = () => {
        input.declarations[1] = new U8([71]);
        input.profile = new U8([72]); input.declarations = [new U8([73])];
      };
      break;
    case 'postcall-detach-both': {
      const declaration = bytes(1, 2); const profile = bytes(3);
      input = normal([declaration], profile);
      extraAfter = () => {
        for (const view of [declaration, profile]) new U8(cloneTransfer(bufferOf.call(view))).fill(77);
      };
      break;
    }
    case 'declaration-at': input = normal([marked(D, 1, 2, 231)], bytes()); break;
    case 'declaration-plus-one': input = normal([flat(D + 1)], bytes(9)); break;
    case 'profile-at': input = normal([bytes()], marked(P, 3, 6, 232)); break;
    case 'profile-plus-one': input = normal([bytes(9)], flat(P + 1)); break;
    case 'aggregate-at':
    case 'aggregate-plus-one':
    case 'aggregate-invalid-zero': {
      const list = new Array(8).fill(flat(D, 13));
      if (id === 'aggregate-plus-one') list.push(bytes(254));
      if (id === 'aggregate-invalid-zero') {
        list.push(keep(new Uint16Array(D / 2)),
          keep({ length: 16777216, [Symbol.toStringTag]: 'Uint8Array' }));
      }
      input = normal(list, marked(P)); break;
    }
    case 'oversized-still-counts-below-batch':
      input = normal([flat(D + 2), keep(new Uint16Array(8))], bytes(7, 8)); break;
    case 'oversized-contributes-overflow':
      input = normal(new Array(16).fill(flat(D + 1)), bytes(9)); break;
    case 'oversized-profile-contributes-overflow':
      input = normal(new Array(8).fill(flat(D, 17)), flat(P + 1)); break;
    case 'far-overflow-saturates': input = normal([flat(16781312), undefined], bytes()); break;
    case 'declarations-at': input = normal(new Array(4096).fill(bytes()), bytes()); break;
    case 'declarations-plus-one': input = normal(new Array(4097).fill(bytes()), bytes(1)); break;
    case 'declarations-overflow-mixed': {
      const empty = bytes(); const list = new Array(4097).fill(empty);
      list[4096] = flat(D + 1);
      access(list, '0', empty, true); access(list, '2048', empty, true);
      input = normal(list, flat(P + 1)); break;
    }
    case 'declarations-overflow-hole': input = normal(new Array(4097), bytes(1)); break;
    case 'declarations-overflow-undefined-profile': input = normal(new Array(4097), undefined); break;
    case 'declarations-overflow-missing-profile': input = { declarations: new Array(4097) }; break;
    case 'declarations-overflow-accessor-profile':
      input = { declarations: new Array(4097) }; access(input, 'profile', bytes(), true, true); break;
    case 'malformed-overflow-list': input = normal({ length: 4294967295 }, bytes()); break;
    case 'huge-length-poison-tail':
    case 'maximum-array-length-poison-tail': {
      const length = id === 'huge-length-poison-tail' ? 65536 : 4294967295;
      const list = new Array(length); const empty = bytes();
      access(list, `${length - 1}`, empty); access(list, '4096', empty);
      input = normal(list, bytes(1)); break;
    }
    default: fail('unimplemented-recipe', id);
  }
  keep(input);
  const list = input == null ? undefined : Object.getOwnPropertyDescriptor(input, 'declarations')?.value;
  keep(list);
  // Never enumerate carrier bytes or iterate a possibly poisoned declaration list.
  const replace = (target, key, value) => {
    if (target === null || (typeof target !== 'object' && typeof target !== 'function')) return false;
    return Reflect.defineProperty(target, key, {
      value, enumerable: true, writable: true, configurable: true,
    });
  };
  return {
    input, references, getterCalls: () => reads, foreignRealm, nodeBuffer,
    after() {
      extraAfter();
      let mutatedBytes = 0;
      let mutatedBuffers = 0;
      for (const view of views) {
        try {
          const length = lengthOf.call(view);
          fill.call(view, 99);
          mutatedBytes += length; mutatedBuffers += 1;
        } catch (error) {
          if (!(error instanceof TypeError)) throw error;
        }
      }
      const callerListMutated = replace(list, '0', new U8([250]));
      const declarationsReplaced = replace(input, 'declarations', [new U8([251])]);
      const profileReplaced = replace(input, 'profile', new U8([252]));
      return { mutatedBytes, mutatedBuffers, callerListMutated,
        callerWrapperMutated: declarationsReplaced || profileReplaced };
    },
  };
}
