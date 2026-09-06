import assert from 'node:assert/strict';
import test from 'node:test';
import { rawDocumentCases } from './m2-candidate/raw-document-cases.mjs';
import {
  rawInvocationExpectedIds, rawInvocationExpectedResult,
} from './support/m2-raw-invocation-expectations.mjs';

const CLOSED_IDS = [
  'dense-offset-buffer',
  'empty-batch',
  'frozen-null-wrapper',
  'foreign-null-frozen-wrapper',
  'realm-array-cleared',
  'own-shadows-inherited',
  'inherited-declarations',
  'inherited-profile',
  'accessor-declarations',
  'missing-declarations',
  'nonarray-declarations',
  'missing-profile',
  'accessor-profile',
  'both-fields-missing',
  'null-wrapper',
  'own-undefined-profile',
  'own-undefined-index',
  'sparse-list',
  'inherited-index',
  'accessor-index',
  'late-missing-index',
  'late-accessor-index',
  'nonenumerable-index-extra-keys',
  'proto-literal-inherited',
  'proto-own-and-symbol-extras',
  'poisoned-carrier-properties',
  'independent-invalid-carriers',
  'rab-fixed-inbounds',
  'rab-tracking-profile-inbounds',
  'rab-fixed-outofbounds',
  'rab-tracking-profile-outofbounds',
  'rab-empty-end-views',
  'detached-declaration',
  'detached-profile',
  'transferred-destination',
  'shared-declaration',
  'growable-shared-profile',
  'realm-shared-both',
  'repeated-carrier-owned-separately',
  'replace-wrapper-list-profile',
  'postcall-detach-both',
  'declaration-at',
  'declaration-plus-one',
  'profile-at',
  'profile-plus-one',
  'aggregate-at',
  'aggregate-plus-one',
  'aggregate-invalid-zero',
  'oversized-still-counts-below-batch',
  'oversized-contributes-overflow',
  'oversized-profile-contributes-overflow',
  'far-overflow-saturates',
  'declarations-at',
  'declarations-plus-one',
  'declarations-overflow-mixed',
  'declarations-overflow-hole',
  'declarations-overflow-undefined-profile',
  'declarations-overflow-missing-profile',
  'declarations-overflow-accessor-profile',
  'malformed-overflow-list',
  'huge-length-poison-tail',
  'maximum-array-length-poison-tail',
];

test('exact original ordered membership and immutable ID inventory', () => {
  assert.equal(CLOSED_IDS.length, 62);
  assert.deepEqual(rawInvocationExpectedIds(), CLOSED_IDS);
  assert.equal(new Set(rawInvocationExpectedIds()).size, 62);
  assert.equal(Object.isFrozen(rawInvocationExpectedIds()), true);
  assert.throws(() => rawInvocationExpectedIds().push('extra'), TypeError);
  assert.throws(() => { rawInvocationExpectedIds()[0] = 'extra'; }, TypeError);
  assert.equal(rawInvocationExpectedIds.length, 0);
  assert.equal(rawInvocationExpectedResult.length, 1);
});

test('strict arity, string identity and closed lookup', () => {
  for (const args of [[], [undefined], [null], [0], [{}], [[]], [new String(CLOSED_IDS[0])], [''], ['unknown'], ['toString'], ['constructor'], ['__proto__'], [` ${CLOSED_IDS[0]}`], [CLOSED_IDS[0], undefined]]) {
    assert.throws(() => rawInvocationExpectedResult(...args), TypeError);
  }
  for (const argument of [undefined, null, 0, '', CLOSED_IDS[0]]) {
    assert.throws(() => rawInvocationExpectedIds(argument), TypeError);
  }
});

function objects(value, result = new Set()) {
  if (value === null || typeof value !== 'object' || result.has(value)) return result;
  result.add(value);
  for (const child of Object.values(value)) objects(child, result);
  return result;
}

test('every complete failure is fresh across same-ID and different-ID calls', () => {
  const earlier = new Set();
  for (const id of CLOSED_IDS) {
    const first = rawInvocationExpectedResult(id);
    const second = rawInvocationExpectedResult(id);
    assert.deepEqual(first, second, id);
    assert.deepEqual(Object.keys(first).sort(), ['diagnostics', 'ok'], id);
    const secondReferences = objects(second);
    for (const value of objects(first)) {
      assert.equal(secondReferences.has(value), false, id);
      assert.equal(earlier.has(value), false, id);
      earlier.add(value);
    }
  }
});

test('literal representatives preserve wrapper, carrier, decode and count families', () => {
  const examples = [
    ['empty-batch', { ok: false, diagnostics: [{ code: 'decode.invalid-json', phase: 'decode', path: [{ kind: 'field', value: 'profile' }], coordinate: {}, details: { reason: 'invalid-json' } }] }],
    ['both-fields-missing', { ok: false, diagnostics: [{ code: 'input.invalid-byte-carrier', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }], coordinate: {}, details: { reason: 'not-document-list' } }, { code: 'input.invalid-byte-carrier', phase: 'decode', path: [{ kind: 'field', value: 'profile' }], coordinate: {}, details: { reason: 'not-document-list' } }] }],
    ['own-undefined-profile', { ok: false, diagnostics: [{ code: 'input.invalid-byte-carrier', phase: 'decode', path: [{ kind: 'field', value: 'profile' }], coordinate: {}, details: { reason: 'not-uint8array' } }, { code: 'decode.invalid-json', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 0 }], coordinate: {}, details: { reason: 'invalid-json' } }] }],
    ['rab-fixed-outofbounds', { ok: false, diagnostics: [{ code: 'input.invalid-byte-carrier', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 0 }], coordinate: {}, details: { reason: 'unusable-view' } }, { code: 'decode.invalid-json', phase: 'decode', path: [{ kind: 'field', value: 'profile' }], coordinate: {}, details: { reason: 'invalid-json' } }] }],
    ['realm-shared-both', { ok: false, diagnostics: [{ code: 'input.invalid-byte-carrier', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 0 }], coordinate: {}, details: { reason: 'shared-storage' } }, { code: 'input.invalid-byte-carrier', phase: 'decode', path: [{ kind: 'field', value: 'profile' }], coordinate: {}, details: { reason: 'shared-storage' } }] }],
    ['dense-offset-buffer', { ok: false, diagnostics: [{ code: 'decode.invalid-json', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 0 }], coordinate: {}, details: { reason: 'invalid-json' } }, { code: 'decode.invalid-json', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 1 }], coordinate: {}, details: { reason: 'invalid-json' } }, { code: 'decode.invalid-json', phase: 'decode', path: [{ kind: 'field', value: 'profile' }], coordinate: {}, details: { reason: 'invalid-json' } }] }],
    ['declarations-overflow-mixed', { ok: false, diagnostics: [{ code: 'input.limit-exceeded', phase: 'declaration', path: [], coordinate: {}, details: { limitName: 'declarations', limit: 4096, actual: 4097 } }] }],
  ];
  for (const [id, expected] of examples) assert.deepEqual(rawInvocationExpectedResult(id), expected, id);
});

test('all seven byte-resource overlaps have exact complete ordered results', () => {
  const expected = {
    'declaration-plus-one': { ok: false, diagnostics: [
      { code: 'decode.invalid-json', phase: 'decode', path: [{ kind: 'field', value: 'profile' }], coordinate: {}, details: { reason: 'invalid-json' } },
      { code: 'input.limit-exceeded', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 0 }], coordinate: {}, details: { limitName: 'declarationRawDocumentBytes', limit: 1048576, actual: 1048577 } },
    ] },
    'profile-plus-one': { ok: false, diagnostics: [
      { code: 'decode.invalid-json', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 0 }], coordinate: {}, details: { reason: 'invalid-json' } },
      { code: 'input.limit-exceeded', phase: 'decode', path: [{ kind: 'field', value: 'profile' }], coordinate: {}, details: { limitName: 'profileRawDocumentBytes', limit: 8388608, actual: 8388609 } },
    ] },
    'aggregate-plus-one': { ok: false, diagnostics: [
      { code: 'input.limit-exceeded', phase: 'decode', path: [], coordinate: {}, details: { limitName: 'aggregateRawBytes', limit: 16777216, actual: 16777217 } },
    ] },
    'oversized-still-counts-below-batch': { ok: false, diagnostics: [
      { code: 'input.invalid-byte-carrier', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 1 }], coordinate: {}, details: { reason: 'not-uint8array' } },
      { code: 'decode.invalid-json', phase: 'decode', path: [{ kind: 'field', value: 'profile' }], coordinate: {}, details: { reason: 'invalid-json' } },
      { code: 'input.limit-exceeded', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 0 }], coordinate: {}, details: { limitName: 'declarationRawDocumentBytes', limit: 1048576, actual: 1048577 } },
    ] },
    'oversized-contributes-overflow': { ok: false, diagnostics: [
      { code: 'input.limit-exceeded', phase: 'decode', path: [], coordinate: {}, details: { limitName: 'aggregateRawBytes', limit: 16777216, actual: 16777217 } },
      { code: 'input.limit-exceeded', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 0 }], coordinate: {}, details: { limitName: 'declarationRawDocumentBytes', limit: 1048576, actual: 1048577 } },
      { code: 'input.limit-exceeded', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 1 }], coordinate: {}, details: { limitName: 'declarationRawDocumentBytes', limit: 1048576, actual: 1048577 } },
      { code: 'input.limit-exceeded', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 2 }], coordinate: {}, details: { limitName: 'declarationRawDocumentBytes', limit: 1048576, actual: 1048577 } },
      { code: 'input.limit-exceeded', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 3 }], coordinate: {}, details: { limitName: 'declarationRawDocumentBytes', limit: 1048576, actual: 1048577 } },
      { code: 'input.limit-exceeded', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 4 }], coordinate: {}, details: { limitName: 'declarationRawDocumentBytes', limit: 1048576, actual: 1048577 } },
      { code: 'input.limit-exceeded', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 5 }], coordinate: {}, details: { limitName: 'declarationRawDocumentBytes', limit: 1048576, actual: 1048577 } },
      { code: 'input.limit-exceeded', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 6 }], coordinate: {}, details: { limitName: 'declarationRawDocumentBytes', limit: 1048576, actual: 1048577 } },
      { code: 'input.limit-exceeded', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 7 }], coordinate: {}, details: { limitName: 'declarationRawDocumentBytes', limit: 1048576, actual: 1048577 } },
      { code: 'input.limit-exceeded', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 8 }], coordinate: {}, details: { limitName: 'declarationRawDocumentBytes', limit: 1048576, actual: 1048577 } },
      { code: 'input.limit-exceeded', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 9 }], coordinate: {}, details: { limitName: 'declarationRawDocumentBytes', limit: 1048576, actual: 1048577 } },
      { code: 'input.limit-exceeded', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 10 }], coordinate: {}, details: { limitName: 'declarationRawDocumentBytes', limit: 1048576, actual: 1048577 } },
      { code: 'input.limit-exceeded', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 11 }], coordinate: {}, details: { limitName: 'declarationRawDocumentBytes', limit: 1048576, actual: 1048577 } },
      { code: 'input.limit-exceeded', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 12 }], coordinate: {}, details: { limitName: 'declarationRawDocumentBytes', limit: 1048576, actual: 1048577 } },
      { code: 'input.limit-exceeded', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 13 }], coordinate: {}, details: { limitName: 'declarationRawDocumentBytes', limit: 1048576, actual: 1048577 } },
      { code: 'input.limit-exceeded', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 14 }], coordinate: {}, details: { limitName: 'declarationRawDocumentBytes', limit: 1048576, actual: 1048577 } },
      { code: 'input.limit-exceeded', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 15 }], coordinate: {}, details: { limitName: 'declarationRawDocumentBytes', limit: 1048576, actual: 1048577 } },
    ] },
    'oversized-profile-contributes-overflow': { ok: false, diagnostics: [
      { code: 'input.limit-exceeded', phase: 'decode', path: [], coordinate: {}, details: { limitName: 'aggregateRawBytes', limit: 16777216, actual: 16777217 } },
      { code: 'input.limit-exceeded', phase: 'decode', path: [{ kind: 'field', value: 'profile' }], coordinate: {}, details: { limitName: 'profileRawDocumentBytes', limit: 8388608, actual: 8388609 } },
    ] },
    'far-overflow-saturates': { ok: false, diagnostics: [
      { code: 'input.invalid-byte-carrier', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 1 }], coordinate: {}, details: { reason: 'not-uint8array' } },
      { code: 'input.limit-exceeded', phase: 'decode', path: [], coordinate: {}, details: { limitName: 'aggregateRawBytes', limit: 16777216, actual: 16777217 } },
      { code: 'input.limit-exceeded', phase: 'decode', path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 0 }], coordinate: {}, details: { limitName: 'declarationRawDocumentBytes', limit: 1048576, actual: 1048577 } },
    ] },
  };
  assert.equal(Object.keys(expected).length, 7);
  for (const [id, result] of Object.entries(expected)) assert.deepEqual(rawInvocationExpectedResult(id), result, id);
});

test('declarations-at retains all 255 required paths and the exact omitted count', () => {
  const diagnostics = [];
  for (let ordinal = 0; ordinal < 255; ordinal += 1) {
    diagnostics.push({
      code: 'decode.invalid-json', phase: 'decode',
      path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: ordinal }], coordinate: {},
      details: { reason: 'invalid-json' },
    });
  }
  diagnostics.push({ code: 'diagnostics.truncated', phase: 'output', path: [], coordinate: {}, details: { omitted: 3842 } });
  assert.deepEqual(rawInvocationExpectedResult('declarations-at'), { ok: false, diagnostics });
  assert.equal(diagnostics.length, 256);
  assert.equal(255 + diagnostics[255].details.omitted, 4097);
});

test('identical accepted static raw-document results retain invocation IDs', () => {
  const rows = new Map([...rawDocumentCases()].map(row => [row.caseId, row.expected]));
  for (const [id, suffix] of [
    ['own-undefined-profile', 'not-uint8array/declaration-json-profile-carrier'],
    ['detached-declaration', 'unusable-view/declaration-carrier-profile-json'],
    ['detached-profile', 'unusable-view/declaration-json-profile-carrier'],
    ['rab-fixed-outofbounds', 'unusable-view/declaration-carrier-profile-json'],
    ['rab-tracking-profile-outofbounds', 'unusable-view/declaration-json-profile-carrier'],
    ['growable-shared-profile', 'shared-storage/declaration-json-profile-carrier'],
  ]) {
    assert.equal(rows.has(`od005.raw-document.v1/mixed/${suffix}`), true);
    assert.deepEqual(rawInvocationExpectedResult(id), rows.get(`od005.raw-document.v1/mixed/${suffix}`), id);
  }
});
