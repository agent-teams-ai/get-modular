import { materializeRuntimeInput } from './m3-runtime-materializers.mjs';

const publicNames = [
  'compileComposition', 'compileCompositionJson', 'defineModule',
  'many', 'optional', 'required',
].sort();

function demand(condition, message) {
  if (!condition) throw new Error(message);
}

function namespaceCheck(namespace) {
  const names = Object.getOwnPropertyNames(namespace).sort();
  demand(names.length === publicNames.length &&
    names.every((name, index) => name === publicNames[index]),
  'public runtime exports differ from accepted API');
  for (const name of publicNames) {
    demand(typeof namespace[name] === 'function', `public export is not callable: ${name}`);
  }
}

function rejectsMutation(operation, path) {
  let rejected = false;
  try {
    operation();
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    rejected = true;
  }
  demand(rejected, `${path}: strict mutation was not rejected`);
}

function inspect(actual, expected, callers, observations, path = '$') {
  if (expected === null || typeof expected !== 'object') {
    demand(Object.is(actual, expected), `${path}: result value mismatch`);
    return;
  }
  demand(actual !== null && typeof actual === 'object', `${path}: missing container`);
  const array = Array.isArray(expected);
  demand(Array.isArray(actual) === array, `${path}: container kind mismatch`);
  demand(Object.getPrototypeOf(actual) === (array ? Array.prototype : Object.prototype),
    `${path}: result must have a local ordinary prototype`);
  demand(!callers.has(actual), `${path}: caller alias`);
  demand(Object.isFrozen(actual), `${path}: result container is not frozen`);
  observations.containers += 1;
  const keys = Reflect.ownKeys(expected);
  const actualKeys = Reflect.ownKeys(actual);
  demand(actualKeys.length === keys.length &&
    keys.every(key => Object.hasOwn(actual, key)), `${path}: result keys mismatch`);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(actual, key);
    demand(Object.hasOwn(descriptor, 'value'), `${path}: result accessor`);
    demand(descriptor.enumerable ===
      Object.getOwnPropertyDescriptor(expected, key).enumerable,
    `${path}: result enumerability mismatch`);
    inspect(descriptor.value, expected[key], callers, observations, `${path}.${String(key)}`);
    rejectsMutation(() => { actual[key] = descriptor.value; }, path);
    rejectsMutation(() => { delete actual[key]; }, path);
    observations.mutationRejections += 2;
  }
  const extra = Symbol('qualification mutation');
  rejectsMutation(() => { actual[extra] = true; }, path);
  rejectsMutation(() => { Object.defineProperty(actual, extra, { value: true }); }, path);
  rejectsMutation(() => { Object.setPrototypeOf(actual, null); }, path);
  observations.mutationRejections += 3;
}

export async function executeRuntimeFixture(namespace, fixture) {
  namespaceCheck(namespace);
  demand(typeof fixture.id === 'string' && fixture.id.length > 0, 'missing fixture ID');
  demand(fixture.expected !== null && typeof fixture.expected === 'object' &&
    typeof fixture.expected.ok === 'boolean', 'missing complete expected result');
  const input = materializeRuntimeInput(fixture.inputRecipe);
  const callers = new Set([input, input.declarations]);
  const views = [];
  for (const value of [...input.declarations, input.profile]) {
    if (value !== null && typeof value === 'object') callers.add(value);
    if (value instanceof Uint8Array) {
      callers.add(value.buffer);
      views.push(value);
    }
  }
  const observations = {
    containers: 0,
    mutationRejections: 0,
    mutatedBuffers: 0,
    mutatedBytes: 0,
    callerWrapperMutated: false,
  };
  const pending = namespace.compileCompositionJson(input);
  // No await or transport before mutation: a deferred byte read must fail.
  for (const view of views) {
    if (view.byteLength === 0) continue; // Detached or genuinely empty carrier.
    observations.mutatedBytes += view.byteLength;
    view.fill(0);
    observations.mutatedBuffers += 1;
  }
  input.declarations.length = 0;
  input.profile = null;
  observations.callerWrapperMutated = true;
  demand(pending instanceof Promise, `${fixture.id}: compiler must return a local Promise`);
  const result = await pending;
  // These observations must happen here; transport destroys freeze/prototype evidence.
  inspect(result, fixture.expected, callers, observations);
  return { id: fixture.id, result, observations };
}

export async function executeRuntimeFixtures(namespace, fixtures) {
  namespaceCheck(namespace);
  demand(Array.isArray(fixtures) && fixtures.length === 123, 'expected 123 fixtures');
  const ids = new Set();
  for (const fixture of fixtures) {
    demand(typeof fixture.id === 'string' && fixture.id.length > 0, 'missing fixture ID');
    demand(!ids.has(fixture.id), `duplicate fixture ID: ${fixture.id}`);
    ids.add(fixture.id);
  }
  const records = [];
  for (const fixture of fixtures) {
    records.push(await executeRuntimeFixture(namespace, fixture));
  }
  return records;
}
