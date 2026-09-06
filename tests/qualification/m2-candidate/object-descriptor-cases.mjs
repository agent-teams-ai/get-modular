// Exact base: bff32ad228721812c61d54bb8f888d7ad782b5e0.
// Private proposed-only ADR-0013 fixtures; ADR-0018/0020 remain accepted.
// No Core imports, composition implementation, resource suite, or acceptance claim.
// Recipes preserve actual value categories; exotic inputs are never JSON-serialized.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

export const BASE_SOURCE = 'bff32ad228721812c61d54bb8f888d7ad782b5e0';
const VECTOR_PATH = 'architecture/qualification/v1/normalization-vectors.json';
const VECTOR_HASH = '64f97efa285f05924305f3b32d6b55f9fc5924950db55c2ed3938bbd11c81b99';
const bytes = readFileSync(new URL(`../../../${VECTOR_PATH}`, import.meta.url));
if (createHash('sha256').update(bytes).digest('hex') !== VECTOR_HASH) throw new Error('normalization-source-drift');
const vector = JSON.parse(bytes.toString('utf8')).cases.find(row =>
  row.name === 'branching-multi-root-many-order-and-input-permutations');
if (!vector) throw new Error('missing-independent-baseline');
const cloneJson = value => JSON.parse(JSON.stringify(value)); // Authenticated inert templates only.
function freezeJson(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}
export const BASELINE = freezeJson({
  path: VECTOR_PATH, sha256: `sha256:${VECTOR_HASH}`, caseName: vector.name,
  declarations: vector.declarations, profile: vector.equivalentProfiles[0],
  plan: vector.expectedPlan, digest: vector.digest, canonicalUtf8: vector.canonicalUtf8,
});
// This additional declaration is unselected; it changes no baseline binding or graph.
export const WORLD = freezeJson({
  worldId: 'normalization-plus-unselected-descriptor/v1', baselineCase: BASELINE.caseName,
  appendedDeclaration: {
    kind: 'get-modular.module-declaration', schemaVersion: 1,
    moduleId: 'example/descriptor', implementationId: 'example/descriptor/default',
    owner: { authority: 'example', path: ['descriptor'] }, provides: [],
    slots: [{ slotId: 'probe', capabilityId: 'example/probe',
      compatibility: { family: 'exact', familyVersion: 1, token: 'example/probe' },
      cardinality: { kind: 'many', min: 0, max: 1, order: 'profile' } }],
  },
});

// These references identify supplied base witnesses, not executions of those tests.
const admissionTests = 'packages/core/tests/features/input-admission/';
export const CROSSWALK = freezeJson([
  { file: `${admissionTests}object-resource-meter.test.mjs`,
    baseSha256: 'sha256:c33544d243730d13057ef6c707c62eeca7c146314b0b59bab673744703712f55',
    witnesses: [
      ['counts roots, containers, scalars, keys and shared occurrences like the independent oracle', ['cycles', 'shared-DAG-occurrences']],
      ['shared dense arrays reach the value boundary without deduplicating their identities', ['DAG-resource-accounting']],
      ['sparse attempted positions are reserved before rejected-dimension reflection', ['sparse-length-precedence']],
      ['rejectable descriptor forms are observed without invoking any accessor', ['record-accessor', 'record-hidden', 'symbols', 'array-accessor']],
      ['forbidden symbol and array-property tails have constant own work without losing parent siblings', ['extended-arrays', 'symbol-tails', 'independent-siblings']],
    ] },
  { file: `${admissionTests}document-shape.test.mjs`,
    baseSha256: 'sha256:c05fd07ec2ad2097b3d8ae79a6dd942ad873f67bd33c953c79130db07f7890cf',
    witnesses: [
      ['independent schema rejects and accepts mutations at every nested field and array position', ['admitted-primitive-schema-validation']],
      ['numeric bounds reject invalid scalars and the accepted min/max relational refinement', ['numeric-bounds']],
      ['malformed UTF-16 precedes identity grammar and byte accounting', ['unicode-precedence']],
      ['shape inspection invokes no getters and has isolated per-document state', ['getter-abstention']],
    ] },
  { file: `${admissionTests}document-snapshot.test.mjs`,
    baseSha256: 'sha256:83a59b5c6f4c23b11db9f299bf423ed715a316e9ae65127b48f2c5cdcea9c6d9',
    witnesses: [
      ['all declaration containers are owned and frozen for every accepted cardinality', ['owned-declarations']],
      ['profiles preserve all row and provider ordering while owning every container', ['owned-profiles']],
      ['shared compatibility and cardinality containers are copied at every occurrence', ['DAG-per-occurrence-copies']],
    ], limitation: 'Ownership witnesses do not establish the proposed null-prototype snapshot representation.' },
  { file: `${admissionTests}object-admission.test.mjs`,
    baseSha256: 'sha256:fad551be2f54c8afd5543902619c8beea888cc8091ad19ea79a1c9ddbb5c2d87',
    witnesses: [
      ['admission owns all containers synchronously, preserving every caller order and occurrence', ['synchronous-ownership']],
      ['schema-invalid declarations supply no partial records and independent declarations/profile remain admitted', ['whole-document-failure']],
      ['non-plain and depth failures are document-local, invoke no getters and cannot enter semantic data', ['document-local-failure']],
      ['batch JSON/string exhaustion never promotes earlier valid documents or a partial resource profile', ['ADR-0020-batch-propagation']],
    ] },
]);
export const SCOPED_GAPS = freezeJson({});

// Capture a real foreign realm once. A null prototype never establishes origin.
const foreign = runInContext(`({
  objectPrototype: Object.prototype, arrayPrototype: Array.prototype,
  record: () => ({}), nullRecord: () => Object.create(null), array: () => []
})`, createContext({}));
export const REALM_PROTOTYPES = Object.freeze({
  localObject: Object.prototype, localArray: Array.prototype,
  foreignObject: foreign.objectPrototype, foreignArray: foreign.arrayPrototype,
});
const copyExpected = { dataEqual: true, noCallerAliases: true, allFrozen: true,
  recordsNull: true, arraysLocal: true, protoDataPreserved: true,
  definedEveryProperty: true, mutationOccurred: true, stableAfterMutation: true };
const observation = (classification, prototype = 'none', copy = false, integrity = null, presence = 'own-data') => ({
  presence, classification, prototype, originClaim: 'not-inferred', integrity,
  lengthAttempt: null, getterCalls: 0, copy: copy ? copyExpected : null,
});
const container = (classification, prototype, copy = false, integrity = [false, false, true]) =>
  observation(classification, prototype, copy, integrity);
const rows = [];
const paths = { owner: ['owner'], min: ['slots', 0, 'cardinality', 'min'], item: ['owner', 'path', 0] };
function add(id, factory, parameters, fixtureExpected, outcome = 'success', localPath = []) {
  const failures = { np: ['schema.non-plain-value', 'non-plain-value'],
    type: ['schema.invalid-value', 'invalid-type'], format: ['schema.invalid-value', 'invalid-format'],
    unknown: ['schema.unknown-field', 'unknown-field'] };
  const expected = failures[outcome] ? {
    scope: 'complete-compiler-result', result: { ok: false, diagnostics: [{
      code: failures[outcome][0], phase: 'schema',
      path: ['declarations', 5, ...localPath].map(value => ({ kind: typeof value === 'number' ? 'index' : 'field', value })),
      coordinate: {}, details: { reason: failures[outcome][1] },
    }] },
  } : outcome === 'empty' ? { scope: 'complete-compiler-result', result: { ok: false, diagnostics: ['authority', 'path'].map(name => ({
    code: 'schema.invalid-value', phase: 'schema', coordinate: {},
    path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 5 }, { kind: 'field', value: 'owner' }, { kind: 'field', value: name }],
    details: { reason: 'invalid-type' },
  })) } } : { scope: 'complete-compiler-result', result: { ok: true, plan: cloneJson(BASELINE.plan), digest: BASELINE.digest } };
  rows.push({ caseId: `m2.object-descriptor.${id}.v1`, entryPoint: 'compileComposition',
    recipe: { factoryId: `m2/object-descriptor/${factory}/v1`, worldId: WORLD.worldId,
      baselineSha256: BASELINE.sha256, parameters, copyObservation: fixtureExpected.copy !== null },
    fixtureExpected, expected });
}
for (const [mode, prototype, accepted] of [
  ['local-object', 'local-object', true], ['local-null', 'null', true],
  ['foreign-null', 'null', true], ['foreign-object', 'foreign-object', false], ['custom', 'other', false],
]) add(`record-${mode}`, 'record', { mode }, container(accepted ? 'record' : 'non-plain-value', prototype, accepted), accepted ? 'success' : 'np');
for (const [mode, prototype, accepted] of [
  ['local', 'local-array', true], ['foreign', 'foreign-array', false], ['custom', 'other', false],
]) add(`array-${mode}`, 'array', { mode }, container(accepted ? 'array' : 'non-plain-value', prototype, accepted), accepted ? 'success' : 'np', ['owner', 'path']);
for (const target of ['record', 'array']) {
  const prototype = target === 'record' ? 'local-object' : 'local-array';
  for (const [state, flags] of [['frozen', [true, true, false]], ['sealed', [false, true, false]], ['nonextensible', [false, false, false]]])
    add(`${target}-${state}`, 'integrity', { target, state }, container(target, prototype, true, flags));
  for (const flags of ['tt', 'tf', 'ft', 'ff'])
    add(`${target}-data-${flags}`, 'attributes', { target, writable: flags[0] === 't', configurable: flags[1] === 't' }, container(target, prototype, true));
  for (const kind of target === 'record' ? ['accessor', 'hidden', 'symbol'] : ['missing', 'hidden', 'accessor', 'symbol', 'extended'])
    add(`${target}-${kind}`, 'descriptor', { target, kind }, container('non-plain-value', prototype), 'np', target === 'record' ? [] : ['owner', 'path']);
}
const valueRows = [
  ['undefined', 'non-plain-value', 'np'], ['symbol', 'non-plain-value', 'np'],
  ['bigint', 'non-plain-value', 'np'], ['function', 'non-plain-value', 'np'],
  ['nan', 'non-plain-value', 'np'], ['infinity', 'non-plain-value', 'np'], ['negative-infinity', 'non-plain-value', 'np'],
  ['null', 'null', 'type'], ['false', 'boolean', 'type'], ['true', 'boolean', 'type'],
  ['string', 'string', 'type'], ['integer', 'integer', 'type'],
  ['noninteger', 'noninteger', 'type', 'min'], ['negative-zero', 'negative-zero', 'format', 'min'],
  ['lone-high', 'lone-surrogate', 'format', 'item'], ['lone-low', 'lone-surrogate', 'format', 'item'],
  ...['date', 'map', 'set', 'regexp', 'typed-array', 'array-buffer', 'promise', 'error',
    'wrapper-boolean', 'wrapper-number', 'wrapper-string', 'wrapper-bigint', 'wrapper-symbol', 'class', 'arguments']
    .map(id => [id, 'non-plain-value', 'np', 'owner', id === 'arguments' ? 'local-object' : 'other']),
];
for (const [id, classification, outcome, position = 'owner', prototype = 'none'] of valueRows)
  add(`value-${id}`, 'value', { id, position }, observation(classification, prototype, false,
    prototype === 'none' ? null : [false, false, true]), outcome, paths[position]);
add('proto-data', 'proto-data', {}, container('record', 'local-object', true), 'unknown');
add('unknown-absent', 'absent', {}, observation('absent', 'none', true, null, 'absent'));
add('unknown-undefined', 'unknown-undefined', {}, observation('non-plain-value'), 'np');
for (const populated of [false, true]) add(`reprototype-${populated ? 'populated' : 'empty'}`, 'reprototype', { populated },
  container('record', 'local-object', true), populated ? 'success' : 'empty');
// Genuine ordinary arrays cannot have accessor or enumerable length descriptors.
// These recipes attempt the changes, retain the intact array, and observe false.
for (const kind of ['accessor', 'enumerable']) add(`length-${kind}-impossible`, 'length', { kind },
  { ...container('array', 'local-array', true), lengthAttempt: false });
export const CASES = freezeJson(rows);

const valueFactories = Object.freeze({
  undefined: () => undefined, symbol: () => Symbol('fixture'), bigint: () => 1n,
  function: () => function fixtureValue() {}, nan: () => NaN,
  infinity: () => Infinity, 'negative-infinity': () => -Infinity,
  null: () => null, false: () => false, true: () => true, string: () => 'fixture', integer: () => 7,
  noninteger: () => 0.5, 'negative-zero': () => -0, 'lone-high': () => '\ud800', 'lone-low': () => '\udc00',
  date: () => new Date(0), map: () => new Map(), set: () => new Set(), regexp: () => /fixture/g,
  'typed-array': () => new Uint8Array([1]), 'array-buffer': () => new ArrayBuffer(1),
  promise: () => Promise.resolve(0), error: () => new Error('fixture'),
  'wrapper-boolean': () => Object(false), 'wrapper-number': () => Object(1), 'wrapper-string': () => Object('x'),
  'wrapper-bigint': () => Object(1n), 'wrapper-symbol': () => Object(Symbol('fixture')),
  class: () => new (class FixtureClass {})(), arguments: () => (function () { return arguments; })(1),
});
const define = (object, key, value) => Object.defineProperty(object, key, { value, enumerable: true, writable: true, configurable: true });
export function materializeCase(caseId) {
  const row = CASES.find(candidate => candidate.caseId === caseId);
  if (!row) throw new Error('unknown-object-descriptor-case');
  const input = { declarations: cloneJson(BASELINE.declarations), profile: cloneJson(BASELINE.profile) };
  const document = cloneJson(WORLD.appendedDeclaration);
  input.declarations.push(document);
  const p = row.recipe.parameters;
  let parent = input.declarations, key = '5', getterCalls = 0, lengthAttempt = null;
  const getter = () => { getterCalls += 1; return 'fixture'; };
  const arrayFocus = () => { parent = document.owner; key = 'path'; };
  switch (row.recipe.factoryId) {
    case 'm2/object-descriptor/record/v1': {
      const record = p.mode === 'foreign-null' ? foreign.nullRecord() : p.mode === 'foreign-object' ? foreign.record()
        : p.mode === 'local-null' ? Object.create(null) : p.mode === 'custom' ? Object.create({ fixturePrototype: true }) : {};
      Object.defineProperties(record, Object.getOwnPropertyDescriptors(document));
      define(parent, key, record); break;
    }
    case 'm2/object-descriptor/array/v1': {
      arrayFocus(); const array = p.mode === 'foreign' ? foreign.array() : [];
      define(array, '0', 'descriptor');
      if (p.mode === 'custom') Object.setPrototypeOf(array, Object.create(Array.prototype));
      define(parent, key, array); break;
    }
    case 'm2/object-descriptor/integrity/v1':
    case 'm2/object-descriptor/attributes/v1':
    case 'm2/object-descriptor/descriptor/v1': {
      if (p.target === 'array') arrayFocus();
      const focus = parent[key], property = p.target === 'array' ? '0' : 'moduleId';
      if (p.state) ({ frozen: Object.freeze, sealed: Object.seal, nonextensible: Object.preventExtensions })[p.state](focus);
      else if (Object.hasOwn(p, 'writable')) Object.defineProperty(focus, property, { writable: p.writable, configurable: p.configurable });
      else if (p.kind === 'accessor') Object.defineProperty(focus, property, { get: getter, enumerable: true, configurable: true });
      else if (p.kind === 'hidden') Object.defineProperty(focus, property, { enumerable: false });
      else if (p.kind === 'missing') delete focus[property];
      else define(focus, p.kind === 'symbol' ? Symbol('fixture') : '01', 0);
      break;
    }
    case 'm2/object-descriptor/value/v1':
      if (p.position === 'min') { parent = document.slots[0].cardinality; key = 'min'; }
      else if (p.position === 'item') { parent = document.owner.path; key = '0'; }
      else { parent = document; key = 'owner'; }
      define(parent, key, valueFactories[p.id]()); break;
    case 'm2/object-descriptor/proto-data/v1': define(document, '__proto__', { marker: 'owned' }); break;
    case 'm2/object-descriptor/absent/v1': parent = document; key = 'privateDescriptor'; break;
    case 'm2/object-descriptor/unknown-undefined/v1':
      parent = document; key = 'privateDescriptor'; define(parent, key, undefined); break;
    case 'm2/object-descriptor/reprototype/v1': {
      const value = Object.setPrototypeOf(new Date(0), Object.prototype);
      if (p.populated) Object.defineProperties(value, Object.getOwnPropertyDescriptors(document.owner));
      parent = document; key = 'owner'; define(parent, key, value); break;
    }
    case 'm2/object-descriptor/length/v1':
      arrayFocus(); lengthAttempt = Reflect.defineProperty(parent[key], 'length', p.kind === 'accessor' ? { get: getter } : { enumerable: true }); break;
    default: throw new Error('unimplemented-closed-factory');
  }
  return { input, parent, key, lengthAttempt, getterCalls: () => getterCalls };
}
