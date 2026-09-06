// Exact base: bff32ad228721812c61d54bb8f888d7ad782b5e0.
// Node-only private fixture consistency, not execution of compileComposition/M2Core.
// Full failure expectations are static normative predictions, never observed results.
// The bounded copier below checks representation only; it solves no composition.
// No resource thresholds, arbitrary recipes, hostile Proxies, GC, or realm teardown claim.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { release, version } from 'node:os';
import test from 'node:test';
import { BASE_SOURCE, BASELINE, WORLD, CASES, CROSSWALK, SCOPED_GAPS, REALM_PROTOTYPES, materializeCase } from './object-descriptor-cases.mjs';

const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const sourceBytes = readFileSync(new URL('./object-descriptor-cases.mjs', import.meta.url));
const runnerBytes = readFileSync(new URL('./object-descriptor-cases.test.mjs', import.meta.url));
const GP = Object.getPrototypeOf, GD = Object.getOwnPropertyDescriptor;
const DS = Object.getOwnPropertyDescriptors, SY = Object.getOwnPropertySymbols;
const own = Object.hasOwn, isArray = Array.isArray;
const object = value => value !== null && typeof value === 'object';
const suffix = row => row.caseId.slice('m2.object-descriptor.'.length, -3);
const stream = rows => rows.map(row => `${JSON.stringify(row)}\n`).join('');
const EXPECTED_IDS = [
  'record-local-object', 'record-local-null', 'record-foreign-null', 'record-foreign-object', 'record-custom',
  'array-local', 'array-foreign', 'array-custom',
  'record-frozen', 'record-sealed', 'record-nonextensible',
  'record-data-tt', 'record-data-tf', 'record-data-ft', 'record-data-ff', 'record-accessor', 'record-hidden', 'record-symbol',
  'array-frozen', 'array-sealed', 'array-nonextensible',
  'array-data-tt', 'array-data-tf', 'array-data-ft', 'array-data-ff', 'array-missing', 'array-hidden', 'array-accessor', 'array-symbol', 'array-extended',
  'value-undefined', 'value-symbol', 'value-bigint', 'value-function', 'value-nan', 'value-infinity', 'value-negative-infinity',
  'value-null', 'value-false', 'value-true', 'value-string', 'value-integer',
  'value-noninteger', 'value-negative-zero', 'value-lone-high', 'value-lone-low',
  'value-date', 'value-map', 'value-set', 'value-regexp', 'value-typed-array', 'value-array-buffer', 'value-promise', 'value-error',
  'value-wrapper-boolean', 'value-wrapper-number', 'value-wrapper-string', 'value-wrapper-bigint', 'value-wrapper-symbol', 'value-class', 'value-arguments',
  'proto-data', 'unknown-absent', 'unknown-undefined', 'reprototype-empty', 'reprototype-populated',
  'length-accessor-impossible', 'length-enumerable-impossible',
];
const BASIS = [
  ['docs/decisions/0013-close-trusted-object-and-raw-carrier-semantics.md', '0ad41cbfb49f6fe5e04cf0b7cab1deecfc047c95c457446b97969333be108ff3'],
  ['docs/decisions/0018-close-implementation-readiness-rules.md', 'c7e8980d319b1db53812c3c70408a058ea8be025937ad824aaf722f76bf37637'],
  ['docs/decisions/0020-define-diagnostic-coverage-outside-object-resource-admission.md', 'c63b2b8782329459a1f84c8b34927e48fed7d501de6adbc9e93b8aa942ccfece'],
  ['architecture/contracts/v1/composition.schema.json', '2b4ad547782fa36748fa937f8fe9896da3c022c3e78e68c8edc06c47ffe36562'],
  ['architecture/qualification/v1/diagnostic-contract.json', '3f7d8a7a4a5a9d7b54f72d5e0915df3e437ab056107ab50294fa65a8e69b6c94'],
];
function prototypeName(value) {
  const prototype = GP(value);
  if (prototype === null) return 'null';
  for (const [key, label] of [['localObject', 'local-object'], ['localArray', 'local-array'], ['foreignObject', 'foreign-object'], ['foreignArray', 'foreign-array']])
    if (prototype === REALM_PROTOTYPES[key]) return label;
  return 'other';
}
function classify(value, fault) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return String.prototype.isWellFormed.call(value) ? 'string' : 'lone-surrogate';
  if (typeof value === 'number') return !Number.isFinite(value) ? 'non-plain-value'
    : Object.is(value, -0) ? 'negative-zero' : Number.isInteger(value) ? 'integer' : 'noninteger';
  if (!object(value)) return 'non-plain-value';
  const array = isArray(value), prototype = GP(value);
  const allowed = array ? prototype === REALM_PROTOTYPES.localArray
    : prototype === null || prototype === REALM_PROTOTYPES.localObject;
  const foreignAllowed = fault === 'foreign-prototype' && (array || prototype === REALM_PROTOTYPES.foreignObject);
  if ((!allowed && !foreignAllowed) || (fault === 'reject-frozen' && Object.isFrozen(value))) return 'non-plain-value';
  const descriptors = DS(value), keys = Object.keys(descriptors);
  if (SY(value).length) return 'non-plain-value';
  if (keys.length > 32) throw new Error('outside-fixed-fixture-size');
  if (fault === 'read-getter') for (const key of keys) if (typeof descriptors[key].get === 'function') void value[key];
  if (array) {
    const length = descriptors.length;
    if (!length || !own(length, 'value') || length.enumerable) return 'non-plain-value';
    if (length.value > 16) throw new Error('outside-fixed-array-size');
    const indexes = new Set(Array.from({ length: length.value }, (_, index) => String(index)));
    if (keys.some(key => key !== 'length' && !indexes.has(key))) return 'non-plain-value';
    for (const key of indexes) {
      const descriptor = descriptors[key];
      if (!descriptor || !own(descriptor, 'value') || (!descriptor.enumerable && fault !== 'ignore-enumerability')) return 'non-plain-value';
    }
    return 'array';
  }
  return keys.every(key => own(descriptors[key], 'value') && (descriptors[key].enumerable || fault === 'ignore-enumerability')) ? 'record' : 'non-plain-value';
}

// Entire finite invocation is copied locally. Only closed boolean observations
// escape; no compiler snapshot, including a failed document's partial snapshot,
// is exposed. Definition counts distinguish even assignment into a null record.
function copyObservation(input, fault) {
  const make = value => isArray(value) ? [] : fault === 'assignment-proto' ? {} : Object.create(null);
  const copy = make(input), pairs = [[input, copy]];
  let defined = 0, required = 0;
  for (let index = 0; index < pairs.length; index += 1) {
    if (pairs.length > 512) throw new Error('outside-fixed-copy-corpus');
    const [source, target] = pairs[index];
    const descriptors = DS(source);
    for (const key of Object.keys(descriptors)) {
      const descriptor = descriptors[key];
      if (!own(descriptor, 'value')) throw new Error('copy-observation-requires-data');
      let value = descriptor.value;
      if (object(value)) { const child = make(value); pairs.push([value, child]); value = child; }
      required += 1;
      if (fault === 'assignment-proto' || fault === 'assignment-null') target[key] = value;
      else {
        Object.defineProperty(target, key, { value, enumerable: descriptor.enumerable,
          writable: true, configurable: !(isArray(target) && key === 'length') });
        defined += 1;
      }
    }
  }
  const callers = new Set(pairs.map(([source]) => source));
  const dataEqual = pairs.every(([source, target]) => {
    const a = DS(source), b = DS(target), keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => own(b, key) && own(b[key], 'value') &&
      (object(a[key].value) ? pairs.some(([s, d]) => s === a[key].value && d === b[key].value) : Object.is(a[key].value, b[key].value)));
  });
  const noCallerAliases = pairs.every(([, target]) => !callers.has(target));
  const recordsNull = pairs.every(([, target]) => isArray(target) || GP(target) === null);
  const arraysLocal = pairs.every(([, target]) => !isArray(target) || GP(target) === REALM_PROTOTYPES.localArray);
  const protoDataPreserved = pairs.every(([source, target]) => !own(source, '__proto__') || (own(target, '__proto__') && GP(target) === null));
  for (let index = pairs.length - 1; index >= 0; index -= 1) Object.freeze(pairs[index][1]);
  const allFrozen = pairs.every(([, target]) => Object.isFrozen(target));
  const before = JSON.stringify(copy); // Owned descriptor data, never an exotic input encoding.
  let mutationOccurred = false;
  for (const source of callers) mutationOccurred = Reflect.defineProperty(source, 'fixtureMutation', {
    value: true, enumerable: true, writable: true, configurable: true,
  }) || mutationOccurred;
  return { dataEqual, noCallerAliases, allFrozen, recordsNull, arraysLocal, protoDataPreserved,
    definedEveryProperty: defined === required, mutationOccurred, stableAfterMutation: JSON.stringify(copy) === before };
}
function observe(fixture, copyRequested, fault = 'none') {
  const descriptor = GD(fixture.parent, fixture.key);
  let presence = descriptor === undefined ? 'absent' : 'own-data';
  const value = descriptor?.value;
  if (fault === 'skip-undefined' && value === undefined) presence = 'absent';
  const classification = presence === 'absent' ? 'absent' : classify(value, fault);
  const prototype = object(value) ? prototypeName(value) : 'none';
  const integrity = object(value) ? [Object.isFrozen(value), Object.isSealed(value), Object.isExtensible(value)] : null;
  const copy = copyRequested ? copyObservation(fixture.input, fault) : null;
  return { presence, classification, prototype,
    originClaim: fault === 'infer-null-origin' && prototype === 'null' ? 'same-realm' : 'not-inferred',
    integrity, lengthAttempt: fixture.lengthAttempt, getterCalls: fixture.getterCalls(), copy };
}
function checkExpected(row, contract) {
  const expected = row.expected;
  if (expected.scope === 'fixture-observation-only') {
    assert.ok(own(SCOPED_GAPS, expected.gapId));
    assert.deepEqual(expected.observation, row.fixtureExpected);
    return;
  }
  assert.equal(expected.scope, 'complete-compiler-result');
  if (expected.result.ok === true) {
    assert.deepEqual(expected.result, { ok: true, plan: BASELINE.plan, digest: BASELINE.digest });
    return;
  }
  assert.deepEqual(Object.keys(expected.result).sort(), ['diagnostics', 'ok']);
  assert.equal(expected.result.ok, false);
  if (suffix(row) === 'reprototype-empty') {
    assert.deepEqual(expected.result, { ok: false, diagnostics: ['authority', 'path'].map(name => ({
      code: 'schema.invalid-value', phase: 'schema', coordinate: {},
      path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 5 }, { kind: 'field', value: 'owner' }, { kind: 'field', value: name }],
      details: { reason: 'invalid-type' },
    })) });
    return;
  }
  assert.equal(expected.result.diagnostics.length, 1);
  const diagnostic = expected.result.diagnostics[0];
  assert.deepEqual(Object.keys(diagnostic).sort(), ['code', 'coordinate', 'details', 'path', 'phase']);
  const variant = contract.variants.find(item => item.code === diagnostic.code);
  assert.ok(variant && ['schema.non-plain-value', 'schema.invalid-value', 'schema.unknown-field'].includes(diagnostic.code));
  assert.equal(diagnostic.phase, 'schema');
  assert.deepEqual(diagnostic.coordinate, {});
  assert.deepEqual(Object.keys(diagnostic.details), ['reason']);
  assert.ok(variant.details.reasonValues.includes(diagnostic.details.reason));
  const safeFields = new Set(['declarations', 'owner', 'path', 'slots', 'cardinality', 'min']);
  for (const segment of diagnostic.path) {
    assert.deepEqual(Object.keys(segment).sort(), ['kind', 'value']);
    assert.ok(segment.kind === 'field' ? safeFields.has(segment.value)
      : segment.kind === 'index' && Number.isInteger(segment.value) && segment.value >= 0 && segment.value <= 65535);
  }
  assert.deepEqual(diagnostic.path.slice(0, 2), [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 5 }]);
  assert.ok(diagnostic.path.length <= 32);
}
const CONTROLS = [
  ['null-origin-inference', 'record-foreign-null', 'infer-null-origin'],
  ['foreign-record-acceptance', 'record-foreign-object', 'foreign-prototype'],
  ['foreign-array-acceptance', 'array-foreign', 'foreign-prototype'],
  ['getter-invocation', 'record-accessor', 'read-getter'],
  ['hidden-record-ignored', 'record-hidden', 'ignore-enumerability'],
  ['hidden-index-ignored', 'array-hidden', 'ignore-enumerability'],
  ['undefined-skipped', 'value-undefined', 'skip-undefined'],
  ['frozen-rejected', 'record-frozen', 'reject-frozen'],
  ['proto-assignment', 'proto-data', 'assignment-proto'],
  ['null-record-assignment', 'proto-data', 'assignment-null'],
  ['foreign-fixture-substitution', 'record-foreign-object', 'none', f => Object.setPrototypeOf(f.parent[f.key], Object.prototype)],
  ['hidden-fixture-substitution', 'record-hidden', 'none', f => Object.defineProperty(f.parent[f.key], 'moduleId', { enumerable: true })],
  ['undefined-fixture-deletion', 'value-undefined', 'none', f => { delete f.parent[f.key]; }],
  ['frozen-fixture-substitution', 'record-frozen', 'none', f => { f.parent[f.key] = { ...f.parent[f.key] }; }],
];

test('closed proposed object descriptor recipes and private checker controls', t => {
  assert.equal(BASE_SOURCE, 'bff32ad228721812c61d54bb8f888d7ad782b5e0');
  assert.deepEqual(CASES.map(suffix), EXPECTED_IDS);
  assert.equal(new Set(CASES.map(row => row.caseId)).size, 68);
  assert.equal(new Set(CONTROLS.map(([id]) => id)).size, 14);
  assert.notEqual(REALM_PROTOTYPES.localObject, REALM_PROTOTYPES.foreignObject);
  assert.notEqual(REALM_PROTOTYPES.localArray, REALM_PROTOTYPES.foreignArray);
  const sources = BASIS.map(([path, hash]) => {
    const bytes = readFileSync(new URL(`../../../${path}`, import.meta.url));
    assert.equal(sha(bytes), `sha256:${hash}`, path);
    return { path, sha256: sha(bytes), bytes };
  });
  const contract = JSON.parse(sources.find(row => row.path.endsWith('/diagnostic-contract.json')).bytes.toString('utf8'));
  assert.deepEqual(JSON.parse(BASELINE.canonicalUtf8), { canonicalization: 'RFC8785', hashAlgorithm: 'SHA-256',
    kind: 'get-modular.plan-content', plan: BASELINE.plan, protocolVersion: 1 });
  assert.equal(`gm-plan:v1:sha-256:${sha(BASELINE.canonicalUtf8).slice(7)}`, BASELINE.digest);
  assert.equal(CROSSWALK.length, 4);
  for (const group of CROSSWALK) {
    const bytes = readFileSync(new URL(`../../../${group.file}`, import.meta.url));
    assert.equal(sha(bytes), group.baseSha256, group.file);
    for (const [name] of group.witnesses) assert.ok(bytes.toString('utf8').includes(JSON.stringify(name)), name);
  }
  const observations = [];
  for (const row of CASES) {
    assert.equal(row.entryPoint, 'compileComposition');
    assert.equal(row.recipe.worldId, WORLD.worldId);
    checkExpected(row, contract);
    const fixture = materializeCase(row.caseId);
    assert.equal(fixture.input.declarations.length, 6);
    if (row.recipe.factoryId === 'm2/object-descriptor/attributes/v1') {
      const p = row.recipe.parameters;
      const descriptor = GD(fixture.parent[fixture.key], p.target === 'record' ? 'moduleId' : '0');
      assert.equal(descriptor.enumerable, true);
      assert.equal(descriptor.writable, p.writable);
      assert.equal(descriptor.configurable, p.configurable);
    }
    const observed = observe(fixture, row.recipe.copyObservation);
    assert.deepEqual(observed, row.fixtureExpected, row.caseId);
    observations.push({ caseId: row.caseId, fixtureObservation: observed });
  }
  for (const [id, witness, fault, change] of CONTROLS) {
    const row = CASES.find(candidate => suffix(candidate) === witness);
    assert.ok(row, id);
    const fixture = materializeCase(row.caseId);
    if (change) change(fixture);
    const observed = observe(fixture, row.recipe.copyObservation, fault);
    // Only failure of the intended equality assertion counts; runtime crashes
    // or missing platform features cannot masquerade as negative witnesses.
    assert.throws(() => assert.deepEqual(observed, row.fixtureExpected), { code: 'ERR_ASSERTION' }, id);
    observations.push({ controlId: id, witness: row.caseId, controlKind: change ? 'fixture' : 'checker',
      observed, rejectedBy: 'complete-fixture-observation' });
  }
  const sample = CASES.find(row => suffix(row) === 'value-undefined');
  for (const corrupt of [
    row => { row.expected.result.plan = {}; },
    row => { row.expected.result.diagnostics[0].details.reason = 'invalid-type'; },
    row => { row.expected.result.diagnostics[0].path.push({ kind: 'field', value: 'privateDescriptor' }); },
  ]) {
    const row = structuredClone(sample); corrupt(row);
    assert.throws(() => checkExpected(row, contract), { code: 'ERR_ASSERTION' });
  }
  assert.throws(() => materializeCase('not-a-closed-case'), /unknown-object-descriptor-case/);
  // Evidence is emitted only after every positive and negative check above.
  // baseSource is a supplied base reference, not an inferred current Git tree.
  const header = {
    scope: 'proposed-only/object-descriptor-fixture-consistency', baseSource: BASE_SOURCE,
    compilerExecuted: false, sourceIdentityScope: 'base-reference-and-listed-file-bytes',
    subjectSha256: sha(sourceBytes), runnerSha256: sha(runnerBytes), checkerSha256: sha(runnerBytes),
    basis: [...sources.map(({ path, sha256 }) => ({ path, sha256 })), { path: BASELINE.path, sha256: BASELINE.sha256 }],
    runtime: process.version, runtimeVersions: process.versions, platform: process.platform,
    operatingSystemRelease: release(), operatingSystemVersion: version(), architecture: process.arch,
    realms: ['node-module', 'captured-node-vm'],
    runnerInvocation: { executable: process.execPath, execArgv: process.execArgv, argv: process.argv },
    prescribedCommand: 'node --test tests/qualification/m2-candidate/object-descriptor-cases.test.mjs',
    recipeStreamSha256: sha(stream([{ world: WORLD }, ...CASES.map(({ caseId, entryPoint, recipe }) => ({ caseId, entryPoint, recipe }))])),
    expectedStreamSha256: sha(stream([{ baselinePlan: BASELINE.plan, baselineDigest: BASELINE.digest },
      ...CASES.map(({ caseId, expected, fixtureExpected }) => ({ caseId, expected, fixtureExpected }))])),
    fixtureCases: CASES.length, negativeControls: CONTROLS.length, malformedExpectationControls: 3,
  };
  const observedCaseStreamSha256 = sha(stream([header, ...observations]));
  const retain = value => {
    const utf8 = stream([value]), parsed = JSON.parse(utf8);
    assert.equal(Buffer.from(utf8, 'utf8').toString('utf8'), utf8);
    assert.deepEqual(parsed, value, 'lossless private fixture observation');
    assert.equal(stream([parsed]), utf8, 'exact private observation framing');
    return utf8;
  };
  const headerUtf8 = retain(header);
  const retainedRecords = Object.freeze(observations.map(retain));
  const executionIds = Object.freeze([...CASES.map(({ caseId }) => caseId),
    ...CONTROLS.map(([id]) => id)]);
  assert.equal(new Set(executionIds).size, 82);
  const verifyRetention = (candidateHeader, candidateRecords, candidateHash) => {
    assert.equal(sha(candidateHeader + candidateRecords.join('')), candidateHash);
    assert.equal(candidateHeader, headerUtf8);
    assert.equal(candidateRecords.length, 82);
    assert.deepEqual(candidateRecords.map((utf8, index) => JSON.parse(utf8)[index < 68 ? 'caseId' : 'controlId']), executionIds);
    assert.deepEqual(candidateRecords, retainedRecords, 'privately sealed executed fixture observations');
    assert.equal(candidateHash, observedCaseStreamSha256);
  };
  const retained = { scope: 'proposed-only/object-descriptor-observation-retention', compilerExecuted: false,
    headerUtf8, recordUtf8: [...retainedRecords], observedCaseStreamSha256 };
  const diagnostic = JSON.stringify(retained);
  const decoded = JSON.parse(diagnostic);
  verifyRetention(decoded.headerUtf8, decoded.recordUtf8, decoded.observedCaseStreamSha256);
  const substituted = JSON.parse(retainedRecords[0]); substituted.caseId = 'unexecuted-private-row';
  const changed = JSON.parse(retainedRecords[0]); changed.fixtureObservation.getterCalls += 1;
  for (const [id, rows] of [
    ['dropped', retainedRecords.slice(1)],
    ['duplicate', [retainedRecords[0], ...retainedRecords.slice(0, -1)]],
    ['reordered', [retainedRecords[1], retainedRecords[0], ...retainedRecords.slice(2)]],
    ['substituted', [retain(substituted), ...retainedRecords.slice(1)]],
    ['changed-observation', [retain(changed), ...retainedRecords.slice(1)]],
  ]) {
    const rehashed = sha(headerUtf8 + rows.join(''));
    assert.notEqual(rehashed, observedCaseStreamSha256, id);
    assert.throws(() => verifyRetention(headerUtf8, rows, rehashed), { code: 'ERR_ASSERTION' }, id);
  }
  t.diagnostic(JSON.stringify({ ...header, observedCaseStreamSha256 }));
  t.diagnostic(diagnostic);
});
