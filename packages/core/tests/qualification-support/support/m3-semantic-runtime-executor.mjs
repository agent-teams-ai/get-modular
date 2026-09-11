// Native-realm executor: no Node dependencies or evidence generators.
import { inspectRuntimeResult } from './m3-runtime-executor.mjs';

function demand(condition, message) {
  if (!condition) throw new Error(message);
}

function ordinaryCopy(value) {
  if (value === null || typeof value !== 'object') {
    demand(value === null || typeof value === 'string' || typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)),
    'fixture is outside the accepted JSON domain');
    return value;
  }
  if (Array.isArray(value)) {
    demand(Object.keys(value).length === value.length, 'non-dense JSON array');
    return Array.from(value, ordinaryCopy);
  }
  const copy = {};
  for (const key of Object.keys(value)) {
    Object.defineProperty(copy, key, {
      value: ordinaryCopy(value[key]), enumerable: true, writable: true, configurable: true,
    });
  }
  return copy;
}

function collect(value, callers) {
  if (value === null || typeof value !== 'object' || callers.has(value)) return;
  callers.add(value);
  for (const child of Object.values(value)) collect(child, callers);
}

function encodeInput(input, eligibility) {
  const encoder = new TextEncoder();
  let aggregateBytes = 0;
  const encode = (value, limit, expectedBytes) => {
    const bytes = encoder.encode(JSON.stringify(value));
    demand(bytes.length <= limit && bytes.length === expectedBytes,
      'raw eligibility document mismatch');
    aggregateBytes += bytes.length;
    return bytes;
  };
  demand(eligibility.declarationBytes.length === input.declarations.length,
    'raw eligibility declaration count mismatch');
  const declarations = input.declarations.map((value, index) =>
    encode(value, 1024 * 1024, eligibility.declarationBytes[index]));
  const profile = encode(input.profile, 8 * 1024 * 1024, eligibility.profileBytes);
  demand(aggregateBytes <= 16 * 1024 * 1024 &&
    aggregateBytes === eligibility.aggregateBytes, 'raw eligibility aggregate mismatch');
  return { declarations, profile };
}

export async function executeSemanticRuntimeFixture(namespace, fixture, mode) {
  demand(mode === 'object' || mode === 'raw', 'unknown semantic execution mode');
  demand(typeof fixture.id === 'string' && fixture.id.length > 0, 'missing semantic ID');
  demand(typeof fixture.expected?.ok === 'boolean', 'missing complete expected result');
  const expected = ordinaryCopy(fixture.expected);
  const objectInput = ordinaryCopy(fixture.input);
  // Encode before invoking either entry. This also rechecks declared eligibility.
  const rawInput = encodeInput(objectInput, fixture.rawEligibility);
  const input = mode === 'object' ? objectInput : rawInput;
  const callers = new Set();
  collect(objectInput, callers);
  callers.add(rawInput);
  callers.add(rawInput.declarations);
  const views = [...rawInput.declarations, rawInput.profile];
  for (const view of views) {
    callers.add(view);
    callers.add(view.buffer);
  }
  const observations = {
    containers: 0, mutationRejections: 0, mutatedObjects: 0,
    mutatedBuffers: 0, mutatedBytes: 0, callerWrapperMutated: false,
  };
  const compile = mode === 'object'
    ? namespace.compileComposition : namespace.compileCompositionJson;
  demand(typeof compile === 'function', 'missing public compiler');
  const pending = compile(input);
  // Intentionally no await, yield, or transport until caller storage is changed.
  for (const value of callers) {
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) continue;
    if (Array.isArray(value)) value.length = 0;
    else for (const key of Object.keys(value)) value[key] = null;
    observations.mutatedObjects += 1;
  }
  for (const view of views) {
    observations.mutatedBytes += view.byteLength;
    view.fill(0);
    observations.mutatedBuffers += 1;
  }
  input.declarations = [];
  input.profile = null;
  observations.callerWrapperMutated = true;
  demand(pending instanceof Promise, `${fixture.id}: compiler must return a local Promise`);
  const result = await pending;
  inspectRuntimeResult(result, expected, callers, observations);
  return { id: fixture.id, category: fixture.category, mode, result, observations };
}

export async function executeSemanticRuntimeFixtures(namespace, fixtures) {
  const ids = new Set();
  const records = [];
  for (const fixture of fixtures) {
    demand(!ids.has(fixture.id), `duplicate semantic ID: ${fixture.id}`);
    ids.add(fixture.id);
    for (const mode of ['object', 'raw']) {
      records.push(await executeSemanticRuntimeFixture(namespace, fixture, mode));
    }
  }
  demand(ids.size === 818, 'expected complete 818 semantic subset');
  demand(records.length === 1636, 'expected 1636 semantic calls');
  return records;
}
