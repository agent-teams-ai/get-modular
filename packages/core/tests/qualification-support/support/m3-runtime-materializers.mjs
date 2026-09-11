// Native ESM: every carrier is constructed in the executing realm.
function record(value, keys) {
  if (value === null || typeof value !== 'object' ||
      Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError('recipe must be an ordinary record');
  }
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || keys.some(key =>
    !Object.hasOwn(value, key) ||
    !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) {
    throw new TypeError('malformed recipe fields');
  }
}

export function materializeDocument(recipe) {
  if (recipe === null || typeof recipe !== 'object') {
    throw new TypeError('missing document recipe');
  }
  const kindDescriptor = Object.getOwnPropertyDescriptor(recipe, 'kind');
  const kind = kindDescriptor?.value;
  record(recipe, kind === 'utf8' || kind === 'hex'
    ? ['kind', 'source'] : ['kind']);
  switch (kind) {
    case 'utf8':
      if (typeof recipe.source !== 'string') throw new TypeError('utf8 source');
      if (typeof globalThis.TextEncoder !== 'function') {
        throw new Error('required API unavailable: TextEncoder');
      }
      return new TextEncoder().encode(recipe.source);
    case 'hex': {
      if (typeof recipe.source !== 'string' ||
          !/^(?:[0-9a-fA-F]{2})*$/.test(recipe.source)) {
        throw new TypeError('hex source must contain complete byte pairs');
      }
      const bytes = new Uint8Array(recipe.source.length / 2);
      for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = Number.parseInt(recipe.source.slice(i * 2, i * 2 + 2), 16);
      }
      return bytes;
    }
    case 'not-uint8array':
      return '{';
    case 'detached': {
      if (typeof globalThis.structuredClone !== 'function') {
        throw new Error('required API unavailable: structuredClone transfer');
      }
      const bytes = new Uint8Array([123]);
      structuredClone(bytes.buffer, { transfer: [bytes.buffer] });
      if (bytes.buffer.byteLength !== 0) throw new Error('transfer did not detach');
      return bytes;
    }
    case 'shared': {
      if (typeof globalThis.SharedArrayBuffer !== 'function') {
        throw new Error('required API unavailable: SharedArrayBuffer');
      }
      const bytes = new Uint8Array(new SharedArrayBuffer(1));
      bytes[0] = 123;
      return bytes;
    }
    default:
      throw new TypeError('unknown document recipe');
  }
}

export function materializeRuntimeInput(recipe) {
  record(recipe, ['declarations', 'profile']);
  if (!Array.isArray(recipe.declarations)) throw new TypeError('declarations recipe');
  const declarations = Array.from(recipe.declarations, materializeDocument);
  return {
    declarations,
    profile: materializeDocument(recipe.profile),
  };
}
