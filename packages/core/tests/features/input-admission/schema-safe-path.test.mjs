import assert from 'node:assert/strict';
import test from 'node:test';
import examples from '../../../../../tests/qualification/compiler-engineer/examples.json' with { type: 'json' };
import { schemaSafeLocalPath, validateDeclarationShape, validateProfileShape, validateDeclarationView, validateProfileView } from '../../../dist-test/features/input-admission/document-shape.js';
import { objectDocument } from '../../../dist-test/features/input-admission/document-reader.js';
import { documentPath } from '../../../dist-test/features/input-admission/document-path.js';
import { rawDocumentView, scanRawDocument } from '../../../dist-test/features/input-admission/raw-document.js';
import { createOwnedRawScanner } from '../../../dist-test/features/raw-scanner/owned-iterative/factory.js';

const sample = examples.cases.find(entry => entry.id === 'many-maximum')?.input;
assert.ok(sample);
const worlds = [
  ['declaration', sample.declarations[0]],
  ['declaration', sample.declarations[1]],
  ['profile', sample.profile],
];
const scanner = createOwnedRawScanner({});
const encoder = new TextEncoder();
const budget = Object.freeze({ valuesRemaining: 2_097_152, stringBytesRemaining: 8_388_608 });
const shapeFor = kind => kind === 'declaration' ? validateDeclarationShape : validateProfileShape;
const viewFor = kind => kind === 'declaration' ? validateDeclarationView : validateProfileView;
const tagged = path => path.map(value => ({ kind: typeof value === 'string' ? 'field' : 'index', value }));

function* nodes(value, path = []) {
  yield { value, path };
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      yield* nodes(child, [...path, Array.isArray(value) ? Number(key) : key]);
    }
  }
}

function assertProjection(kind, local, expected = local) {
  const before = [...local];
  const actual = schemaSafeLocalPath(kind, local);
  assert.deepEqual(actual, expected, JSON.stringify({ kind, local }));
  assert.deepEqual(local, before);
  assert.notEqual(actual, local);
  assert.equal(Object.isFrozen(actual), true);
  assert.deepEqual(schemaSafeLocalPath(kind, actual), actual);
  return actual;
}

function scanDuplicates(kind, source) {
  const raw = [];
  const safe = [];
  const emitted = [];
  const locator = kind === 'declaration' ? { kind, ordinal: 7 } : { kind };
  const result = scanRawDocument(encoder.encode(source), scanner, budget, local => {
    raw.push(local);
    const projected = schemaSafeLocalPath(kind, local);
    safe.push(projected);
    emitted.push(documentPath(locator, projected));
  });
  assert.equal(result.decoded, false);
  assert.equal(result.invalidJson, false);
  assert.equal(result.duplicateKey, true);
  assert.equal(result.stoppedBy, null);
  for (const path of safe) assert.equal(Object.isFrozen(path), true);
  return { raw, safe, emitted };
}

function assertEmitted(kind, observed, expected) {
  const prefix = kind === 'declaration' ? ['declarations', 7] : ['profile'];
  assert.deepEqual(observed.safe, expected);
  assert.deepEqual(observed.emitted, expected.map(path => tagged([...prefix, ...path])));
  for (const path of observed.emitted) {
    assert.equal(Object.isFrozen(path), true);
    for (const segment of path) assert.equal(Object.isFrozen(segment), true);
  }
}

test('every path in admitted handbook fixtures is known to the same declaration or profile schema', () => {
  const admitted = { declaration: 0, profile: 0 };
  let pathsChecked = 0;
  for (const entry of examples.cases) {
    for (const [kind, documents] of [
      ['declaration', entry.input.declarations], ['profile', [entry.input.profile]],
    ]) {
      for (const document of documents) {
        if (!shapeFor(kind)(document, () => {})) continue;
        admitted[kind] += 1;
        for (const { path } of nodes(document)) {
          assertProjection(kind, Object.freeze(path));
          pathsChecked += 1;
        }
      }
    }
  }
  assert.ok(admitted.declaration > 0);
  assert.ok(admitted.profile > 0);
  assert.ok(pathsChecked > 100);
});

test('all accepted cardinality variants contribute their fields to path projection', () => {
  const base = ['slots', 0, 'cardinality'];
  for (const cardinality of [
    { kind: 'required' },
    { kind: 'optional' },
    { kind: 'many', min: 0, max: 1024, order: 'profile' },
  ]) {
    const document = structuredClone(sample.declarations[0]);
    document.slots[0].cardinality = cardinality;
    const violations = [];
    assert.equal(validateDeclarationShape(document, value => violations.push(value)), true);
    assert.deepEqual(violations, []);
    for (const { path } of nodes(cardinality, base)) assertProjection('declaration', path);
    for (const field of ['kind', 'min', 'max', 'order']) {
      assertProjection('declaration', [...base, field]);
      assertProjection('declaration', [...base, field, 'moduleId'], [...base, field]);
    }
  }
});

test('known field names are rejected in the wrong schema location', () => {
  for (const [kind, local, expected] of [
    ['declaration', ['moduleId'], ['moduleId']],
    ['declaration', ['owner', 'moduleId', 'authority'], ['owner']],
    ['declaration', ['owner', 'implementationId'], ['owner']],
    ['declaration', ['owner', 'profileId'], ['owner']],
    ['declaration', ['provides', 0, 'slotId'], ['provides', 0]],
    ['declaration', ['slots', 0, 'moduleId'], ['slots', 0]],
    ['declaration', ['slots', 0, 'compatibility', 'min'], ['slots', 0, 'compatibility']],
    ['declaration', ['slots', 0, 'cardinality', 'familyVersion'], ['slots', 0, 'cardinality']],
    ['declaration', ['bindings', 0, 'slotId'], []],
    ['declaration', ['owner', 'path', 'example/private'], ['owner', 'path']],
    ['profile', ['moduleId'], []],
    ['profile', ['implementationId'], []],
    ['profile', ['owner', 'path', 0], []],
    ['profile', ['selections', 0, 'moduleId'], ['selections', 0, 'moduleId']],
    ['profile', ['selections', 0, 'profileId'], ['selections', 0]],
    ['profile', ['selections', 0, 'owner', 'path', 0], ['selections', 0]],
    ['profile', ['bindings', 0, 'moduleId'], ['bindings', 0]],
    ['profile', ['roots', 0, 'moduleId'], ['roots', 0]],
    ['profile', ['selections', 'example/private', 'moduleId'], ['selections']],
  ]) assertProjection(kind, local, expected);
});

test('unknown ancestors permanently stop projection at every admitted fixture position', () => {
  const secrets = ['credential-secret', 'example/private', '__proto__', 'constructor', 'toString', 'unknown\ud800', ''];
  const tail = ['slots', 0, 'cardinality', 'min', 'selections', 0, 'moduleId'];
  for (const [kind, document] of worlds) {
    assert.equal(shapeFor(kind)(document, () => {}), true);
    for (const { path } of nodes(document)) {
      for (const secret of secrets) {
        const projected = assertProjection(kind, [...path, secret, ...tail], path);
        assert.equal(projected.includes(secret), false);
      }
    }
  }
});

test('scalar descendants and numeric segments in record positions stop at their containing schema node', () => {
  for (const [kind, document] of worlds) {
    for (const { value, path } of nodes(document)) {
      if (Array.isArray(value)) continue;
      if (value !== null && typeof value === 'object') {
        for (const index of [0, 1, 65535]) {
          assertProjection(kind, [...path, index, 'moduleId'], path);
        }
      } else {
        for (const tail of [[0], ['0'], ['moduleId'], ['kind', 'owner', 'path', 0], ['min'], ['max'], ['order']]) {
          assertProjection(kind, [...path, ...tail], path);
        }
      }
    }
  }
});

test('fixture-derived array paths admit representable numeric indices independently of schema length limits', () => {
  const arrays = worlds.flatMap(([kind, document]) => [...nodes(document)]
    .filter(({ value }) => Array.isArray(value)).map(node => ({ kind, ...node })));
  assert.ok(arrays.length >= 7);
  for (const { kind, value, path } of arrays) {
    for (const index of [0, 65535]) {
      assertProjection(kind, [...path, index]);
      if (value.length > 0) {
        for (const { path: child } of nodes(value[0])) {
          assertProjection(kind, [...path, index, ...child]);
        }
      }
    }
    for (const index of [-1, -65535, 0.5, 65535.5, 65536, Number.MAX_SAFE_INTEGER, NaN, Infinity, -Infinity]) {
      assertProjection(kind, [...path, index, 'moduleId', 'owner', 'path', 0], path);
    }
    for (const key of ['0', '1', '65535', '65536', 'length', 'moduleId']) {
      assertProjection(kind, [...path, key, 'moduleId'], path);
    }
  }
});

test('real declaration duplicate paths redact unknown ancestors, wrong contexts and nested owner.path scalars', () => {
  const source = String.raw`{"moduleId":0,"\u006doduleId":1,"owner":{"moduleId":0,"moduleId":1,"path":[{"moduleId":0,"moduleId":1}],"unknown/secret":{"path":[{"authority":0,"authority":1}]}},"slots":[{"compatibility":{"token":0,"token":1},"cardinality":{"min":0,"\u006din":1,"max":1,"max":2,"order":0,"order":1}}],"unknown/secret":{"slots":[{"cardinality":{"min":0,"min":1}}]},"__proto__":null,"__proto__":true}`;
  const observed = scanDuplicates('declaration', source);
  assert.deepEqual(observed.raw, [
    ['moduleId'],
    ['owner', 'moduleId'],
    ['owner', 'path', 0, 'moduleId'],
    ['owner', 'unknown/secret', 'path', 0, 'authority'],
    ['slots', 0, 'compatibility', 'token'],
    ['slots', 0, 'cardinality', 'min'],
    ['slots', 0, 'cardinality', 'max'],
    ['slots', 0, 'cardinality', 'order'],
    ['unknown/secret', 'slots', 0, 'cardinality', 'min'],
    ['__proto__'],
  ]);
  assertEmitted('declaration', observed, [
    ['moduleId'], ['owner'], ['owner', 'path', 0], ['owner'],
    ['slots', 0, 'compatibility', 'token'],
    ['slots', 0, 'cardinality', 'min'],
    ['slots', 0, 'cardinality', 'max'],
    ['slots', 0, 'cardinality', 'order'], [], [],
  ]);
  assert.equal(JSON.stringify(observed.emitted).includes('unknown/secret'), false);
  assert.equal(JSON.stringify(observed.emitted).includes('__proto__'), false);
});

test('real profile duplicate paths recognize selection identities without admitting them at other locations', () => {
  const source = String.raw`{"moduleId":0,"moduleId":1,"selections":[{"moduleId":0,"\u006doduleId":1,"owner":{"path":0,"path":1}}],"bindings":[{"consumerImplementationId":0,"consumerImplementationId":1,"providerImplementationIds":[{"moduleId":0,"moduleId":1}],"moduleId":0,"moduleId":1}],"roots":[{"moduleId":0,"moduleId":1}],"unknown/secret":{"selections":[{"moduleId":0,"moduleId":1}]}}`;
  const observed = scanDuplicates('profile', source);
  assert.deepEqual(observed.raw, [
    ['moduleId'],
    ['selections', 0, 'moduleId'],
    ['selections', 0, 'owner', 'path'],
    ['bindings', 0, 'consumerImplementationId'],
    ['bindings', 0, 'providerImplementationIds', 0, 'moduleId'],
    ['bindings', 0, 'moduleId'],
    ['roots', 0, 'moduleId'],
    ['unknown/secret', 'selections', 0, 'moduleId'],
  ]);
  assertEmitted('profile', observed, [
    [], ['selections', 0, 'moduleId'], ['selections', 0],
    ['bindings', 0, 'consumerImplementationId'],
    ['bindings', 0, 'providerImplementationIds', 0],
    ['bindings', 0], ['roots', 0], [],
  ]);
  assert.equal(JSON.stringify(observed.emitted).includes('unknown/secret'), false);
});

test('raw cardinality duplicates retain min, max and order regardless of the input discriminator', () => {
  for (const tag of [undefined, 'required', 'optional', 'many', 'private-unsupported-tag', 7, null, {}]) {
    const discriminator = tag === undefined ? '' : '"kind":' + JSON.stringify(tag) + ',';
    const source = '{"slots":[{"cardinality":{' + discriminator
      + '"min":0,"min":1,"max":1,"max":2,"order":"x","order":"y"}}]}';
    const observed = scanDuplicates('declaration', source);
    const expected = ['min', 'max', 'order'].map(field => ['slots', 0, 'cardinality', field]);
    assert.deepEqual(observed.raw, expected);
    assertEmitted('declaration', observed, expected);
    assert.equal(JSON.stringify(observed.emitted).includes('private-unsupported-tag'), false);
  }
});

test('real scanner array indices at 65535 and 65536 are projected before documentPath', () => {
  for (const index of [65535, 65536]) {
    const source = '{"bindings":[' + 'null,'.repeat(index) + '{"slotId":0,"slotId":1}]}';
    const observed = scanDuplicates('profile', source);
    assert.deepEqual(observed.raw, [['bindings', index, 'slotId']]);
    assertEmitted('profile', observed, [index === 65535 ? ['bindings', index, 'slotId'] : ['bindings']]);
  }
});

test('real scanner property string zero stays a field and root arrays cannot borrow record fields', () => {
  for (const [kind, source, raw, safe] of [
    ['profile', '{"bindings":{"0":{"slotId":0,"slotId":1}}}', ['bindings', '0', 'slotId'], ['bindings']],
    ['declaration', '{"owner":{"path":{"0":{"authority":0,"authority":1}}}}', ['owner', 'path', '0', 'authority'], ['owner', 'path']],
    ['declaration', '[{"moduleId":0,"moduleId":1}]', [0, 'moduleId'], []],
    ['profile', '[{"profileId":0,"profileId":1}]', [0, 'profileId'], []],
  ]) {
    const observed = scanDuplicates(kind, source);
    assert.deepEqual(observed.raw, [raw]);
    assertEmitted(kind, observed, [safe]);
  }
});

test('documentPath owns invocation prefixes, ordinal clipping and the global 32-segment cap', () => {
  const local = assertProjection('declaration', ['owner', 'path', 65535, 'secret'], ['owner', 'path', 65535]);
  assert.deepEqual(documentPath({ kind: 'declaration', ordinal: 65535 }, local),
    tagged(['declarations', 65535, 'owner', 'path', 65535]));
  assert.deepEqual(documentPath({ kind: 'declaration', ordinal: 65536 }, local), tagged(['declarations']));
  assert.deepEqual(documentPath({ kind: 'profile' }, schemaSafeLocalPath('profile', ['roots', 0])),
    tagged(['profile', 'roots', 0]));
  // The fixed schema is shallower than the cap; exercise the caller's cap directly.
  const longLocal = Array(40).fill('kind');
  assert.deepEqual(documentPath({ kind: 'declaration', ordinal: 7 }, longLocal),
    tagged(['declarations', 7, ...Array(30).fill('kind')]));
  assert.deepEqual(documentPath({ kind: 'profile' }, longLocal),
    tagged(['profile', ...Array(31).fill('kind')]));
});

test('shared schema validation streams failures and skips items of every rejected array dimension', () => {
  const dimensions = [
    ['declaration', ['owner', 'path'], 9, 'ownerPathSegments'],
    ['declaration', ['provides'], 65, 'capabilitiesPerDeclaration'],
    ['declaration', ['slots'], 129, 'slotsPerDeclaration'],
    ['profile', ['roots'], 1025, 'roots'],
    ['profile', ['selections'], 4097, 'selections'],
    ['profile', ['bindings'], 65_537, 'bindings'],
    ['profile', ['bindings', 0, 'providerImplementationIds'], 1025, null],
  ];
  for (const [kind, path, length, limit] of dimensions) {
    const document = structuredClone(kind === 'declaration' ? sample.declarations[0] : sample.profile);
    const rejected = Array(length).fill(null);
    const parent = path.slice(0, -1).reduce((value, segment) => value[segment], document);
    parent[path.at(-1)] = rejected;
    document['private-unknown-field'] = true;
    const view = objectDocument(document);
    const guarded = {
      root: view.root,
      reader: {
        ...view.reader,
        item(value, index) {
          assert.notEqual(value, rejected, 'rejected dimension exposed an item');
          return view.reader.item(value, index);
        },
      },
    };
    const events = [];
    assert.equal(viewFor(kind)(guarded, violation => {
      assertProjection(kind, violation.path);
      assert.equal(Object.isFrozen(violation), true);
      assert.equal(Object.isFrozen(violation.path), true);
      events.push(['violation', violation]);
    }, (...args) => events.push(['limit', ...args])), false);
    assert.deepEqual(events, [
      ['violation', { rule: 'closed', path: [] }],
      ...(limit === null ? [] : [['limit', limit, length, path]]),
      ['violation', { rule: 'size', path }],
    ]);
  }
});

test('shared schema retains exact raw integer rules, cardinality ordering and version suppression', () => {
  const document = structuredClone(sample.declarations[0]);
  document.slots[0].cardinality = { kind: 'many', min: 0, max: 1, order: 'profile' };
  const baseline = JSON.stringify(document);
  assert.ok(baseline.includes('"min":0'));
  const base = ['slots', 0, 'cardinality'];
  for (const [lexeme, outcome] of [
    ['0.0', null], ['10e-1', null],
    ['1.0000000000000001', 'integer'], ['1e-400', 'integer'],
    ['-0e0', 'range'], ['9007199254740992', 'range'], ['2', 'relation'],
  ]) {
    const bytes = encoder.encode(baseline.replace('"min":0', '"min":' + lexeme));
    assert.equal(scanRawDocument(bytes, scanner, budget, () => assert.fail('unexpected duplicate')).decoded, true);
    const violations = [];
    const limits = [];
    const valid = validateDeclarationView(rawDocumentView(bytes, scanner), violation => {
      violations.push(violation);
      assertProjection('declaration', violation.path);
    }, (...args) => limits.push(args));
    const expected = outcome === null ? [] : [{
      rule: outcome === 'relation' ? 'range' : outcome,
      path: outcome === 'relation' ? base : [...base, 'min'],
    }];
    assert.equal(valid, expected.length === 0, lexeme);
    assert.deepEqual(violations, expected, lexeme);
    assert.deepEqual(limits, []);
  }
  const future = encoder.encode(baseline.replace('"schemaVersion":1', '"schemaVersion":2')
    .replace('"min":0', '"min":"private-value"'));
  assert.equal(scanRawDocument(future, scanner, budget, () => assert.fail('unexpected duplicate')).decoded, true);
  const violations = [];
  assert.equal(validateDeclarationView(rawDocumentView(future, scanner), value => violations.push(value)), false);
  assert.deepEqual(violations, [{ rule: 'unsupported-version', path: ['schemaVersion'] }]);
});
