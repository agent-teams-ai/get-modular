// Native-realm checks finish before callers transport any returned record.
import { inspectRuntimeResult } from './m3-runtime-executor.mjs';
import { materializeDescriptorRuntimeInput } from './m3-descriptor-runtime-materializers.mjs';

function demand(condition, message) {
  if (!condition) throw new Error(message);
}

function collect(value, callers) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function') ||
      callers.has(value)) return;
  callers.add(value);
  // Do not enumerate values: descriptor fixtures deliberately contain accessors.
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (Object.hasOwn(descriptor, 'value')) collect(descriptor.value, callers);
  }
}

// Only baseline JSON documents/profile are probed; the descriptor-specific
// sixth declaration retains its shape so accessor checks remain meaningful.
function mutateBaseline(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return 0;
  seen.add(value);
  let mutations = 0;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!Object.hasOwn(descriptor, 'value') || key === 'length') continue;
    mutations += mutateBaseline(descriptor.value, seen);
    if (!descriptor.writable || descriptor.value !== null && typeof descriptor.value === 'object') continue;
    Object.defineProperty(value, key, { ...descriptor, value: null });
    mutations += 1;
  }
  return mutations;
}

export async function executeDescriptorRuntimeFixture(namespace, fixture, capabilities = {}) {
  demand(typeof namespace.compileComposition === 'function', 'missing object compiler');
  demand(typeof fixture.id === 'string' && fixture.id.length > 0, 'missing descriptor ID');
  demand(fixture.category === fixture.recipe.factoryId, 'descriptor category mismatch');
  demand(typeof fixture.expected?.ok === 'boolean', 'missing complete expected result');
  demand(fixture.applicability.object === 'applicable', 'object applicability mismatch');
  const materialized = materializeDescriptorRuntimeInput(fixture, capabilities);
  const { input } = materialized;
  const callers = new Set();
  collect(input, callers);
  demand(materialized.getterCalls() === 0, 'getter called during preparation');
  demand(materialized.lengthAttempt === fixture.fixtureExpected.lengthAttempt,
    'length descriptor attempt mismatch');
  const observations = {
    containers: 0, mutationRejections: 0, getterCalls: 0,
    lengthAttempt: materialized.lengthAttempt,
    foreignRealm: materialized.foreignRealm,
    callerWrapperMutated: false, nestedMutations: 0,
  };
  const pending = namespace.compileComposition(input);
  demand(materialized.getterCalls() === 0, 'getter called during synchronous admission');
  // All recipes have this mutable cooperative wrapper, even frozen documents.
  // No await or transport precedes this synchronous ownership probe.
  const seen = new Set();
  for (const document of input.declarations.slice(0, 5)) {
    observations.nestedMutations += mutateBaseline(document, seen);
  }
  observations.nestedMutations += mutateBaseline(input.profile, seen);
  demand(observations.nestedMutations > 0, 'baseline mutation probe did not execute');
  input.declarations.length = 0;
  input.profile = null;
  observations.callerWrapperMutated = true;
  demand(pending instanceof Promise, 'compiler must return a local Promise');
  const result = await pending;
  demand(materialized.getterCalls() === 0, 'getter called during compilation');
  inspectRuntimeResult(result, fixture.expected, callers, observations);
  observations.getterCalls = materialized.getterCalls();
  demand(observations.getterCalls === 0, 'getter called during result inspection');
  return {
    id: fixture.id, category: fixture.category, mode: 'object',
    applicability: { ...fixture.applicability }, result, observations,
  };
}

export async function executeDescriptorRuntimeFixtures(namespace, fixtures, capabilities = {}) {
  const prepared = [];
  const ids = new Set();
  let foreignCount = 0;
  for (const fixture of fixtures) {
    demand(prepared.length < 68, 'too many descriptor fixtures');
    demand(!ids.has(fixture.id), 'duplicate descriptor ID');
    ids.add(fixture.id);
    prepared.push(fixture);
    if (fixture.applicability.foreignRealm === 'required') foreignCount += 1;
  }
  demand(prepared.length === 68 && foreignCount === 3, 'incomplete descriptor inventory');
  if (typeof capabilities.foreignRealmFactory !== 'function') {
    const error = new Error('foreign realm factory unavailable for complete descriptor inventory');
    error.code = 'descriptor.foreign-realm-unavailable';
    throw error;
  }
  const records = [];
  for (const fixture of prepared) {
    // Capability failure rejects the run; it is never represented as a passed skip.
    records.push(await executeDescriptorRuntimeFixture(namespace, fixture, capabilities));
  }
  return records;
}
