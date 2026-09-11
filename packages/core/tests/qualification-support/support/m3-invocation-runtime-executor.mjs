import { inspectRuntimeResult } from './m3-runtime-executor.mjs';
import {
  materializeInvocationRuntimeInput, validateInvocationRuntimeFixture,
} from './m3-invocation-runtime-materializers.mjs';
import {
  rawInvocationExpectedIds, rawInvocationExpectedResult,
} from './m2-raw-invocation-expectations.mjs';

function demand(condition, message) {
  if (!condition) throw new Error(message);
}

export async function executeInvocationRuntimeFixture(namespace, fixture, capabilities = {}) {
  const id = validateInvocationRuntimeFixture(fixture);
  demand(typeof namespace.compileCompositionJson === 'function', 'missing raw compiler');
  const expected = rawInvocationExpectedResult(id);
  // Compare the complete independent expectation, not private admission evidence.
  // Freeze the transported expectation so the same descriptor-based inspector
  // can validate it without invoking any transported accessor.
  const freeze = value => {
    if (value === null || typeof value !== 'object') return;
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      demand(Object.hasOwn(descriptor, 'value'), 'expectation accessor');
      freeze(descriptor.value);
    }
    Object.freeze(value);
  };
  freeze(fixture.expected);
  inspectRuntimeResult(fixture.expected, expected, new Set(),
    { containers: 0, mutationRejections: 0 });
  const materialized = materializeInvocationRuntimeInput(fixture, capabilities);
  demand(materialized.getterCalls() === 0, 'getter called during preparation');
  // Deliberately no await, microtask, or transport between invocation and mutation.
  const pending = namespace.compileCompositionJson(materialized.input);
  const mutations = materialized.after();
  demand(materialized.getterCalls() === 0, 'getter called during synchronous admission or mutation');
  demand(pending instanceof Promise, 'compiler must return a local Promise');
  const result = await pending;
  demand(materialized.getterCalls() === 0, 'getter called during compilation');
  const observations = {
    containers: 0, mutationRejections: 0, ...mutations,
    getterCalls: 0, foreignRealm: materialized.foreignRealm,
    nodeBuffer: materialized.nodeBuffer,
  };
  // Freeze, prototypes, strict mutation rejection, exact keys and caller aliases
  // must be inspected in the executing realm before structured transport.
  inspectRuntimeResult(result, expected, materialized.references, observations);
  demand(materialized.getterCalls() === 0, 'getter called during result inspection');
  return { id, mode: 'raw', result, observations };
}

export async function executeInvocationRuntimeFixtures(namespace, fixtures, capabilities = {}) {
  const rows = [];
  const seen = new Set();
  for (const fixture of fixtures) {
    demand(rows.length < 62, 'too many invocation fixtures');
    const id = validateInvocationRuntimeFixture(fixture);
    demand(!seen.has(id), 'duplicate invocation fixture');
    seen.add(id); rows.push(fixture);
  }
  demand(rows.length === 62 &&
    rawInvocationExpectedIds().every(id => seen.has(id)), 'incomplete original62 inventory');
  // Preflight capabilities before any compiler observations are produced.
  for (const [key, code] of [
    ['foreignRealmFactory', 'foreign-realm-unavailable'],
    ['nodeBuffer', 'node-buffer-unavailable'],
  ]) {
    if (typeof capabilities[key] !== 'function') {
      const error = new Error(`complete invocation inventory requires ${key}`);
      error.code = `invocation.${code}`;
      throw error;
    }
  }
  const records = [];
  for (const row of rows) records.push(await executeInvocationRuntimeFixture(namespace, row, capabilities));
  return records;
}
