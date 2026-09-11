import { Buffer } from 'node:buffer';

// Private transport encoding, not Core canonicalization or a public schema.
// Values come from a cooperative, separately admitted execution realm. This
// descriptor check is not a sandbox for executable Proxies.
export const ordinaryValueLimits = Object.freeze({ bytes: 256 * 1024 * 1024, nodes: 2_097_152, depth: 64 });

export function ordinaryNeed(condition, reason) {
  if (condition) return;
  const error = new Error(`Private ordinary-result storage: ${reason}`);
  error.code = 'ordinary.result.invalid';
  error.reason = reason;
  throw error;
}

export function checkOrdinaryBudget({ maxBytes, maxNodes }) {
  ordinaryNeed(Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= ordinaryValueLimits.bytes, 'byte-budget');
  ordinaryNeed(Number.isSafeInteger(maxNodes) && maxNodes > 0 && maxNodes <= ordinaryValueLimits.nodes, 'node-budget');
}

export function encodeOrdinaryValue(value, budget) {
  checkOrdinaryBudget(budget);
  const parts = [], active = new WeakSet();
  let bytes = 0, nodes = 0;
  function put(text) {
    bytes += Buffer.byteLength(text);
    ordinaryNeed(bytes <= budget.maxBytes, 'encoded-byte-limit');
    parts.push(text);
  }
  function string(value) {
    put('"');
    // Bound the transient scalar allocation before checking the byte budget.
    // Keep surrogate pairs together so concatenation equals native JSON escaping.
    for (let start = 0; start < value.length;) {
      let end = Math.min(start + 4096, value.length);
      const last = value.charCodeAt(end - 1), next = value.charCodeAt(end);
      if (last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end += 1;
      put(JSON.stringify(value.slice(start, end)).slice(1, -1));
      start = end;
    }
    put('"');
  }
  function own(object, key) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    ordinaryNeed(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable, 'own-enumerable-data');
    return descriptor.value;
  }
  function visit(current, depth) {
    ordinaryNeed(++nodes <= budget.maxNodes, 'encoded-node-limit');
    ordinaryNeed(depth <= ordinaryValueLimits.depth, 'encoded-depth-limit');
    if (typeof current === 'string') { string(current); return; }
    if (current === null || typeof current === 'boolean') {
      put(JSON.stringify(current));
      return;
    }
    if (typeof current === 'number') {
      ordinaryNeed(Number.isFinite(current) && !Object.is(current, -0), 'lossy-number');
      put(JSON.stringify(current));
      return;
    }
    ordinaryNeed(typeof current === 'object', 'non-json-value');
    ordinaryNeed(!active.has(current), 'cyclic-value');
    active.add(current);
    if (Array.isArray(current)) {
      const length = Object.getOwnPropertyDescriptor(current, 'length')?.value;
      ordinaryNeed(Number.isSafeInteger(length) && length >= 0 && length <= budget.maxNodes - nodes, 'array-length-budget');
      ordinaryNeed(Reflect.ownKeys(current).length === length + 1, 'array-own-keys');
      put('[');
      for (let index = 0; index < length; index += 1) {
        if (index) put(',');
        visit(own(current, String(index)), depth + 1);
      }
      put(']');
    } else {
      const prototype = Object.getPrototypeOf(current);
      ordinaryNeed(prototype === null || prototype === Object.prototype, 'non-plain-value');
      const keys = Reflect.ownKeys(current);
      ordinaryNeed(keys.length <= budget.maxNodes - nodes && keys.every(key => typeof key === 'string'), 'object-key-budget');
      put('{');
      for (const [index, key] of keys.sort().entries()) {
        if (index) put(',');
        string(key); put(':');
        visit(own(current, key), depth + 1);
      }
      put('}');
    }
    active.delete(current);
  }
  visit(value, 0);
  put('\n');
  return Buffer.from(parts.join(''));
}
