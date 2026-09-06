import assert from 'node:assert/strict';
import test from 'node:test';
import { documentPath } from '../../../dist-test/features/input-admission/document-path.js';
import { validateDeclarationView, validateProfileView } from '../../../dist-test/features/input-admission/document-shape.js';
import { rawDocumentView, scanRawDocument } from '../../../dist-test/features/input-admission/raw-document.js';
import { numericFailureMask, visitRawNumericFailures } from '../../../dist-test/features/input-admission/raw-numeric-admission.js';
import { openOwnedRawTokenCursor } from '../../../dist-test/features/raw-scanner/owned-iterative/scanner.js';

const encoder = new TextEncoder();
const scanner = Object.freeze({ open: openOwnedRawTokenCursor });

function admittedView(source, selectedScanner = scanner) {
  const bytes = encoder.encode(source);
  assert.ok(bytes.length <= 8_388_608);
  const scan = scanRawDocument(bytes, selectedScanner, {
    valuesRemaining: 2_097_152,
    stringBytesRemaining: 8_388_608,
  }, () => assert.fail('Numeric fixtures must have unique decoded keys'));
  assert.equal(scan.decoded, true);
  assert.equal(scan.stoppedBy, null);
  return rawDocumentView(bytes, selectedScanner);
}

function observe(view, kind = 'profile') {
  const failures = [];
  const failed = visitRawNumericFailures(view, kind, (path, reason) => {
    assert.ok(Object.isFrozen(path));
    failures.push({ path: [...path], reason });
  });
  return { failed, failures };
}

function countedReader(view) {
  const reader = view.reader;
  const counts = { kinds: 0, keys: 0, own: 0, lengths: 0, items: 0, integers: 0, text: 0 };
  return {
    counts,
    view: {
      root: view.root,
      reader: {
        kind(value) { counts.kinds += 1; return reader.kind(value); },
        keys(value) {
          counts.keys += 1;
          assert.equal(reader.kind(value), 'record');
          return reader.keys(value);
        },
        own(value, key) {
          counts.own += 1;
          assert.equal(reader.kind(value), 'record');
          return reader.own(value, key);
        },
        length(value) {
          counts.lengths += 1;
          assert.equal(reader.kind(value), 'array');
          return reader.length(value);
        },
        item(value, index) {
          counts.items += 1;
          assert.equal(reader.kind(value), 'array');
          return reader.item(value, index);
        },
        integer(value) {
          counts.integers += 1;
          assert.equal(reader.kind(value), 'number');
          return reader.integer(value);
        },
        text(value) { counts.text += 1; return reader.text(value); },
      },
    },
  };
}

function meteredScanner() {
  const counts = { opens: 0, tokens: 0, tokenBytes: 0, stringDecodes: 0 };
  return {
    counts,
    scanner: {
      open(bytes) {
        counts.opens += 1;
        const cursor = openOwnedRawTokenCursor(bytes);
        return {
          next() {
            counts.tokens += 1;
            const token = cursor.next();
            counts.tokenBytes += token.end - token.start;
            return token;
          },
          decodeString(token) {
            counts.stringDecodes += 1;
            counts.tokenBytes += token.end - token.start;
            return cursor.decodeString(token);
          },
        };
      },
    },
  };
}

test('unknown private values fold at their containing owner alongside separate known owners', () => {
  const view = admittedView('{"privateA":{"selections":[{"moduleId":1e-400}]},"privateB":[-0,{"schemaVersion":9007199254740992}],"profileId":1e-400}');
  assert.deepEqual(observe(view), {
    failed: true,
    failures: [
      { path: ['profileId'], reason: 'invalid-type' },
      { path: [], reason: 'invalid-type' },
      { path: [], reason: 'invalid-format' },
    ],
  });
  assert.equal(numericFailureMask(view, 'profile', []), 3);
  assert.equal(numericFailureMask(view, 'profile', ['profileId']), 1);
  assert.equal(numericFailureMask(view, 'profile', ['privateA']), 0);
});

test('repeated redacted values emit both reasons once and every number receives a verdict', () => {
  const counted = countedReader(admittedView('{"privateA":[1e-400,-0,1e-400,-0],"privateB":{"roots":[1e-400,9007199254740992,-0,1e-400]}}'));
  assert.deepEqual(observe(counted.view), {
    failed: true,
    failures: [
      { path: [], reason: 'invalid-type' },
      { path: [], reason: 'invalid-format' },
    ],
  });
  assert.equal(counted.counts.integers, 8);
  assert.equal(counted.counts.text, 0);
  assert.equal(numericFailureMask(counted.view, 'profile', []), 3);
  assert.equal(counted.counts.integers, 16);
});

test('unknown field transitions stop permanently while known child owners stay separate', () => {
  const view = admittedView('{"profileId":{"selections":[{"moduleId":-0}]},"roots":{"roots":[1e-400]},"selections":[{"private":{"moduleId":1e-400},"moduleId":{"schemaVersion":-0}}]}');
  assert.deepEqual(observe(view), {
    failed: true,
    failures: [
      { path: ['profileId'], reason: 'invalid-format' },
      { path: ['roots'], reason: 'invalid-type' },
      { path: ['selections', 0, 'moduleId'], reason: 'invalid-format' },
      { path: ['selections', 0], reason: 'invalid-type' },
    ],
  });
  assert.equal(numericFailureMask(view, 'profile', []), 0);
  assert.equal(numericFailureMask(view, 'profile', ['selections']), 0);
  assert.equal(numericFailureMask(view, 'profile', ['selections', 0]), 1);
  assert.equal(numericFailureMask(view, 'profile', ['selections', 0, 'moduleId']), 2);
});

test('root schema failures stay at the prefix while numeric array items own independent paths', () => {
  const cases = [
    ['[1e-400]', [
      { path: [], reason: 'invalid-type' },
      { path: [0], reason: 'invalid-type' },
    ]],
    ['[-0]', [
      { path: [], reason: 'invalid-type' },
      { path: [0], reason: 'invalid-format' },
    ]],
    ['[1e-400,-0]', [
      { path: [], reason: 'invalid-type' },
      { path: [0], reason: 'invalid-type' },
      { path: [1], reason: 'invalid-format' },
    ]],
  ];
  for (const [kind, validate] of [['declaration', validateDeclarationView], ['profile', validateProfileView]]) {
    for (const [source, expected] of cases) {
      const view = admittedView(source);
      assert.equal(numericFailureMask(view, kind, []), 0);
      const failures = [];
      const schemaValid = validate(view, ({ rule, path }) => {
        assert.equal(rule, 'type');
        if ((numericFailureMask(view, kind, path) & 1) === 0) {
          failures.push({ path: [...path], reason: 'invalid-type' });
        }
      });
      const numericFailed = visitRawNumericFailures(view, kind, (path, reason) => {
        failures.push({ path: [...path], reason });
      });
      assert.deepEqual({ schemaValid, numericFailed, failures }, {
        schemaValid: false, numericFailed: true, failures: expected,
      }, `${kind}: ${source}`);
    }
  }
});

test('numeric fallback preserves current candidates without recovering scalar or root fields', () => {
  const cases = [
    ['declaration', '[{"moduleId":1e-400}]', [0, 'moduleId'], 'invalid-type'],
    ['profile', '[{"profileId":-0}]', [0, 'profileId'], 'invalid-format'],
    ['declaration', '{"owner":[{"authority":-0}]}', ['owner', 0, 'authority'], 'invalid-format'],
    ['declaration', '{"slots":[[{"cardinality":[{"min":1e-400}]}]]}', ['slots', 0, 0, 'cardinality', 0, 'min'], 'invalid-type'],
    ['declaration', '{"moduleId":[[null,{"owner":1e-400}]]}', ['moduleId', 0, 1], 'invalid-type'],
    ['declaration', '{"owner":{"path":[[null,{"authority":-0}]]}}', ['owner', 'path', 0, 1], 'invalid-format'],
    ['profile', '{"bindings":{"0":{"slotId":1e-400}}}', ['bindings'], 'invalid-type'],
    ['declaration', '[{"secret":[{"moduleId":-0}]}]', [0], 'invalid-format'],
    ['profile', '{"bindings":[[{"profileId":1e-400}]]}', ['bindings', 0, 0], 'invalid-type'],
  ];
  for (const [kind, source, path, reason] of cases) {
    const counted = countedReader(admittedView(source));
    assert.deepEqual(observe(counted.view, kind), {
      failed: true, failures: [{ path, reason }],
    }, source);
    assert.equal(counted.counts.integers, 1);
    assert.equal(numericFailureMask(counted.view, kind, Object.freeze(path)), reason === 'invalid-type' ? 1 : 2);
    assert.equal(numericFailureMask(counted.view, kind, path.slice(0, -1)), 0);
  }
});

test('unsupported versions do not suppress independent numeric failures', () => {
  const view = admittedView('{"schemaVersion":2,"private":{"n":1e-400},"profileId":-0}');
  const ordinary = [];
  assert.equal(validateProfileView(view, violation => ordinary.push(violation)), false);
  assert.deepEqual(ordinary, [{ rule: 'unsupported-version', path: ['schemaVersion'] }]);
  assert.deepEqual(observe(view), {
    failed: true,
    failures: [
      { path: ['profileId'], reason: 'invalid-format' },
      { path: [], reason: 'invalid-type' },
    ],
  });
  assert.equal(numericFailureMask(view, 'profile', ['schemaVersion']), 0);
  assert.equal(numericFailureMask(view, 'profile', []), 1);
});

test('schema suppression agrees with numeric ownership and keeps distinct reasons', () => {
  for (const [kind, field, validate] of [
    ['declaration', 'moduleId', validateDeclarationView],
    ['profile', 'profileId', validateProfileView],
  ]) {
    const cases = [
      ['1e-400', [{ path: [field], reason: 'invalid-type' }]],
      ['-0', [{ path: [field], reason: 'invalid-format' }]],
      ['{"private":[1e-400,-0]}', [
        { path: [field], reason: 'invalid-type' },
        { path: [field], reason: 'invalid-format' },
      ]],
      ['[1e-400,-0]', [
        { path: [field], reason: 'invalid-type' },
        { path: [field, 0], reason: 'invalid-type' },
        { path: [field, 1], reason: 'invalid-format' },
      ]],
    ];
    for (const [value, expected] of cases) {
      const view = admittedView(`{"${field}":${value}}`);
      const failures = [];
      assert.equal(validate(view, ({ rule, path }) => {
        // This regression isolates invalid-value overlap; absent fields are independent.
        if (rule === 'required') return;
        assert.ok(rule === 'type' || rule === 'integer' || rule === 'range');
        const bit = rule === 'range' ? 2 : 1;
        if ((numericFailureMask(view, kind, path) & bit) === 0) {
          failures.push({ path: [...path], reason: bit === 1 ? 'invalid-type' : 'invalid-format' });
        }
      }), false);
      assert.equal(visitRawNumericFailures(view, kind, (path, reason) => {
        failures.push({ path: [...path], reason });
      }), true);
      assert.deepEqual(failures, expected, `${kind}: ${value}`);
      assert.equal(new Set(failures.map(failure => JSON.stringify(failure))).size, failures.length);
    }
  }
});

test('exact safe integers, decimal and exponent spellings use only integer verdicts', () => {
  const cases = [
    ['0', 0], ['0.0', 0], ['0e-400', 0], ['0e999999999999999999999', 0],
    ['1', 0], ['1.0', 0], ['1e0', 0], ['10e-1', 0], ['-1.0', 0],
    ['9007199254740991', 0], ['-9007199254740991', 0],
    ['90071992547409910e-1', 0], ['-90071992547409910e-1', 0],
    ['1.0000000000000001', 1], ['-1.0000000000000001', 1],
    ['1e-400', 1], ['-1e-400', 1], ['9007199254740992.1', 1],
    ['1e-999999999999999999999', 1],
    ['-0', 2], ['-0.0', 2], ['-0e0', 2], ['-0e-400', 2],
    ['9007199254740992', 2], ['-9007199254740992', 2],
    ['9007199254740992.0', 2], ['1e400', 2], ['-1e400', 2],
    ['1e999999999999999999999', 2],
  ];
  for (const [source, mask] of cases) {
    const counted = countedReader(admittedView(source));
    assert.equal(numericFailureMask(counted.view, 'profile', []), mask, source);
    assert.deepEqual(observe(counted.view), {
      failed: mask !== 0,
      failures: mask === 0 ? [] : [{
        path: [], reason: mask === 1 ? 'invalid-type' : 'invalid-format',
      }],
    }, source);
    assert.equal(counted.counts.integers, 2, source);
    assert.equal(counted.counts.text, 0, source);
  }
});

test('numeric admission alone emits no ordinary schema checks or numeric-looking string errors', () => {
  for (const source of ['{}', 'null', 'true', '"1e-400"', '{"schemaVersion":2,"roots":[]}']) {
    const counted = countedReader(admittedView(source));
    assert.deepEqual(observe(counted.view), { failed: false, failures: [] }, source);
    assert.equal(counted.counts.text, 0);
  }
});

test('numeric failures at known fields and discriminators retain their exact paths', () => {
  const profile = admittedView('{"kind":-0,"schemaVersion":1e-400,"profileId":9007199254740992,"selections":[{"moduleId":-0,"implementationId":1e-400}]}');
  assert.deepEqual(observe(profile), {
    failed: true,
    failures: [
      { path: ['kind'], reason: 'invalid-format' },
      { path: ['schemaVersion'], reason: 'invalid-type' },
      { path: ['profileId'], reason: 'invalid-format' },
      { path: ['selections', 0, 'moduleId'], reason: 'invalid-format' },
      { path: ['selections', 0, 'implementationId'], reason: 'invalid-type' },
    ],
  });
  const declaration = admittedView('{"slots":[{"cardinality":{"kind":-0,"min":1e-400,"max":9007199254740992,"order":1e-400}}],"schemaVersion":1}');
  assert.deepEqual(observe(declaration, 'declaration'), {
    failed: true,
    failures: [
      { path: ['slots', 0, 'cardinality', 'kind'], reason: 'invalid-format' },
      { path: ['slots', 0, 'cardinality', 'min'], reason: 'invalid-type' },
      { path: ['slots', 0, 'cardinality', 'max'], reason: 'invalid-format' },
      { path: ['slots', 0, 'cardinality', 'order'], reason: 'invalid-type' },
    ],
  });
  assert.equal(numericFailureMask(declaration, 'declaration', ['slots', 0, 'cardinality']), 0);
  assert.equal(numericFailureMask(declaration, 'declaration', ['slots', 0, 'cardinality', 'min']), 1);
});

test('both prefix caps fold complete numeric groups and preserve a difference at segment 32', () => {
  for (const [kind, capacity, payload] of [
    ['declaration', 30, '[1e-400,[-0,1e-400,1.0],{"min":-0}]'],
    ['profile', 31, '[1e-400,-0,1.0,9007199254740992,1e-400]'],
  ]) {
    // Declaration failures differ at local lengths 31 and 32. Both documents
    // reach container depth 32, including the profile's final owner array.
    const prefix = Array(capacity - 1).fill(0);
    const source = `${'['.repeat(capacity - 1)}[${payload},${payload}]${']'.repeat(capacity - 1)}`;
    const counted = countedReader(admittedView(source));
    const locator = kind === 'declaration' ? { kind, ordinal: 7 } : { kind };
    const invocation = kind === 'declaration' ? ['declarations', 7] : ['profile'];
    const owners = [Object.freeze([...prefix, 0]), Object.freeze([...prefix, 1])];
    const actual = [];
    const classifiedAtEmission = [];
    assert.equal(visitRawNumericFailures(counted.view, kind, (path, reason) => {
      assert.ok(Object.isFrozen(path));
      classifiedAtEmission.push(counted.counts.integers);
      actual.push({
        code: 'schema.invalid-value', phase: 'schema', path: documentPath(locator, path),
        coordinate: {}, details: { reason },
      });
    }), true);
    const expected = owners.flatMap(owner => ['invalid-type', 'invalid-format'].map(reason => ({
      code: 'schema.invalid-value', phase: 'schema',
      path: [...invocation, ...owner].map(value => ({ kind: typeof value === 'string' ? 'field' : 'index', value })),
      coordinate: {}, details: { reason },
    })));
    assert.deepEqual(actual, expected, kind);
    assert.deepEqual(classifiedAtEmission, [5, 5, 10, 10]);
    assert.equal(counted.counts.integers, 10);
    assert.equal(new Set(actual.map(diagnostic => JSON.stringify(diagnostic))).size, 4);
    assert.equal(actual[0].path.length, 32);
    assert.deepEqual(actual[0].path.slice(0, 31), actual[2].path.slice(0, 31));
    assert.deepEqual(actual[0].path[31], { kind: 'index', value: 0 });
    assert.deepEqual(actual[2].path[31], { kind: 'index', value: 1 });
    assert.equal(numericFailureMask(counted.view, kind, prefix), 0);
    for (const owner of owners) {
      assert.equal(numericFailureMask(counted.view, kind, owner), 3);
      const before = { ...counted.counts };
      assert.equal(numericFailureMask(counted.view, kind, [...owner, 0]), 0);
      assert.deepEqual(counted.counts, before);
    }
    assert.equal(counted.counts.integers, 20);
  }
});

test('provider arrays over 1024 retain numeric failures without scanning child owners during a probe', () => {
  const entries = Array(1025).fill('"provider"');
  entries[0] = '1e-400';
  entries[1024] = '-0';
  const counted = countedReader(admittedView(`{"bindings":[{"providerImplementationIds":[${entries.join(',')}]}]}`));
  const owner = ['bindings', 0, 'providerImplementationIds'];
  assert.equal(numericFailureMask(counted.view, 'profile', owner), 0);
  assert.equal(counted.counts.items, 1);
  assert.equal(counted.counts.integers, 0);
  assert.deepEqual(observe(counted.view), {
    failed: true,
    failures: [
      { path: [...owner, 0], reason: 'invalid-type' },
      { path: [...owner, 1024], reason: 'invalid-format' },
    ],
  });
  assert.equal(counted.counts.integers, 2);
  assert.equal(counted.counts.text, 0);
});

test('256, 257 and 258 unique numeric candidates survive many clipping collisions', () => {
  for (const [kind, capacity] of [['declaration', 30], ['profile', 31]]) {
    for (const candidateCount of [256, 257, 258]) {
      const prefix = Array(capacity - 1).fill(0);
      const mixed = `[${Array(64).fill('1e-400,-0').join(',')}]`;
      const payloads = [mixed, ...Array(candidateCount - 2).fill('[1e-400,1e-400,1e-400,1.0]')];
      const source = `${'['.repeat(capacity - 1)}[${payloads.join(',')}]${']'.repeat(capacity - 1)}`;
      const counted = countedReader(admittedView(source));
      const expected = [
        { path: [...prefix, 0], reason: 'invalid-type' },
        { path: [...prefix, 0], reason: 'invalid-format' },
      ];
      for (let index = 1; index < payloads.length; index += 1) {
        expected.push({ path: [...prefix, index], reason: 'invalid-type' });
      }
      const result = observe(counted.view, kind);
      assert.deepEqual(result, { failed: true, failures: expected });
      assert.equal(result.failures.length, candidateCount);
      assert.equal(new Set(result.failures.map(failure => JSON.stringify(failure))).size, candidateCount);
      assert.equal(counted.counts.integers, 128 + 4 * (candidateCount - 2));
    }
  }
});

test('missing paths, non-owner paths and wrong container kinds return zero safely', () => {
  const counted = countedReader(admittedView('{"selections":"wrong","bindings":[null],"schemaVersion":1}'));
  const paths = [
    ['roots'], ['profileId'], ['notKnown'], ['selections', 0],
    ['bindings', 0, 'slotId'], ['bindings', 1], ['bindings', '0'],
    ['bindings', -1], ['bindings', 0.5], ['bindings', NaN],
    ['bindings', Infinity], ['bindings', 65536], ['schemaVersion', 'min'],
  ];
  for (const path of paths) assert.equal(numericFailureMask(counted.view, 'profile', path), 0);
  assert.equal(counted.counts.integers, 0);
  assert.equal(counted.counts.text, 0);
});

test('indices beyond 65535 fold at the array owner and never resume projection', () => {
  const entries = Array(65539).fill('null');
  entries[65535] = '-0';
  entries[65536] = '1e-400';
  entries[65537] = '-0';
  entries[65538] = '{"kind":1e-400}';
  const source = `{"bindings":[{"providerImplementationIds":[${entries.join(',')}]}]}`;
  const meter = meteredScanner();
  const counted = countedReader(admittedView(source, meter.scanner));
  const owner = ['bindings', 0, 'providerImplementationIds'];
  assert.equal(numericFailureMask(counted.view, 'profile', owner), 3);
  // One lookup of bindings[0], then only the three folded provider positions.
  assert.equal(counted.counts.items, 4);
  assert.equal(counted.counts.integers, 3);
  assert.equal(numericFailureMask(counted.view, 'profile', [...owner, 65536]), 0);
  assert.equal(counted.counts.items, 4);
  assert.equal(numericFailureMask(counted.view, 'profile', [...owner, 65535]), 2);
  const beforeVisit = counted.counts.integers;
  assert.deepEqual(observe(counted.view), {
    failed: true,
    failures: [
      { path: [...owner, 65535], reason: 'invalid-format' },
      { path: owner, reason: 'invalid-type' },
      { path: owner, reason: 'invalid-format' },
    ],
  });
  assert.equal(counted.counts.integers - beforeVisit, 4);
  assert.equal(counted.counts.text, 0);
  assert.ok(meter.counts.tokenBytes <= 64 * source.length);
});

test('root fallback arrays retain index 65535 and permanently fold later known fields', () => {
  for (const [kind, field] of [['declaration', 'moduleId'], ['profile', 'profileId']]) {
    const entries = Array(65539).fill('null');
    entries[65535] = `{"${field}":-0}`;
    entries[65536] = `{"${field}":[1e-400,-0]}`;
    entries[65537] = `[{"${field}":1e-400}]`;
    entries[65538] = '1.0';
    const counted = countedReader(admittedView(`[${entries.join(',')}]`));
    assert.deepEqual(observe(counted.view, kind), {
      failed: true,
      failures: [
        { path: [65535, field], reason: 'invalid-format' },
        { path: [], reason: 'invalid-type' },
        { path: [], reason: 'invalid-format' },
      ],
    });
    assert.equal(counted.counts.integers, 5);
    assert.equal(numericFailureMask(counted.view, kind, []), 3);
    assert.equal(numericFailureMask(counted.view, kind, [65535, field]), 2);
    const before = { ...counted.counts };
    assert.equal(numericFailureMask(counted.view, kind, [65536]), 0);
    assert.equal(numericFailureMask(counted.view, kind, [65536, field, 0]), 0);
    assert.equal(numericFailureMask(counted.view, kind, ['0', field]), 0);
    assert.deepEqual(counted.counts, before);
  }
});

test('stopped subtrees reach the admitted depth of 32 iteratively', () => {
  const source = `{"private":${'['.repeat(31)}1e-400${']'.repeat(31)}}`;
  const counted = countedReader(admittedView(source));
  assert.deepEqual(observe(counted.view), {
    failed: true,
    failures: [{ path: [], reason: 'invalid-type' }],
  });
  assert.equal(counted.counts.integers, 1);
  assert.equal(numericFailureMask(counted.view, 'profile', []), 1);
});

function schemaProbesAndVisit(rowCount, providerCount) {
  const providers = Array.from({ length: providerCount }, (_, index) => index % 2 === 0 ? '1e-400' : '-0');
  const row = `{"providerImplementationIds":[${providers.join(',')}]}`;
  // Missing fields deliberately exercise real schema traversal without relying
  // on an unrelated identity grammar. Required-field callbacks need no probe.
  const source = `{"schemaVersion":1,"bindings":[${Array(rowCount).fill(row).join(',')}]}`;
  const meter = meteredScanner();
  const counted = countedReader(admittedView(source, meter.scanner));
  let suppressed = 0;
  assert.equal(validateProfileView(counted.view, ({ rule, path }) => {
    if (rule === 'required') return;
    assert.ok(rule === 'integer' || rule === 'range');
    const bit = rule === 'integer' ? 1 : 2;
    assert.equal(numericFailureMask(counted.view, 'profile', path), bit);
    suppressed += 1;
  }), false);
  const numericCount = rowCount * providerCount;
  assert.equal(suppressed, numericCount);
  const expected = [];
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    for (let index = 0; index < providerCount; index += 1) {
      expected.push({
        path: ['bindings', rowIndex, 'providerImplementationIds', index],
        reason: index % 2 === 0 ? 'invalid-type' : 'invalid-format',
      });
    }
  }
  const beforeVisit = counted.counts.integers;
  assert.deepEqual(observe(counted.view), { failed: true, failures: expected });
  assert.equal(counted.counts.integers - beforeVisit, numericCount + 1);
  assert.equal(counted.counts.text, 0);
  assert.ok(counted.counts.items <= 8 * (rowCount + numericCount) + 64);
  assert.ok(meter.counts.tokens <= 96 * (rowCount + numericCount) + 128);
  assert.ok(meter.counts.tokenBytes <= 64 * source.length);
  return { tokens: meter.counts.tokens, bytes: meter.counts.tokenBytes };
}

test('forward schema probes plus the full visit remain linear across both array axes', () => {
  const small = schemaProbesAndVisit(256, 2);
  const large = schemaProbesAndVisit(1024, 2);
  assert.ok(large.tokens <= small.tokens * 5);
  assert.ok(large.bytes <= small.bytes * 5);
  schemaProbesAndVisit(1, 1024);
  schemaProbesAndVisit(32, 128);
});

function fallbackProbesAndVisit(kind, field, depth, numberCount) {
  const entries = Array.from({ length: numberCount }, (_, index) => ['1e-400', '-0', '1.0'][index % 3]);
  const nested = `${'['.repeat(depth)}[${entries.join(',')}]${']'.repeat(depth)}`;
  const source = field === null ? nested : `{"${field}":${nested}}`;
  const owner = [...(field === null ? [] : [field]), ...Array(depth).fill(0)];
  const structuralDepth = depth + (field === null ? 1 : 2);
  const meter = meteredScanner();
  const counted = countedReader(admittedView(source, meter.scanner));
  const expected = [];
  for (let index = 0; index < numberCount; index += 1) {
    // These ancestor probes must skip representable children, even after the
    // reader has advanced. Requesting item zero here causes repeated rewinds.
    assert.equal(numericFailureMask(counted.view, kind, []), 0);
    assert.equal(numericFailureMask(counted.view, kind, owner), 0);
    const mask = index % 3 === 0 ? 1 : index % 3 === 1 ? 2 : 0;
    const path = [...owner, index];
    assert.equal(numericFailureMask(counted.view, kind, path), mask);
    if (mask !== 0) expected.push({ path, reason: mask === 1 ? 'invalid-type' : 'invalid-format' });
  }
  assert.equal(counted.counts.integers, numberCount);
  assert.deepEqual(observe(counted.view, kind), { failed: true, failures: expected });
  assert.equal(counted.counts.integers, 2 * numberCount);
  assert.equal(counted.counts.text, 0);
  assert.ok(counted.counts.items <= (2 * depth + 4) * (numberCount + 1));
  assert.ok(counted.counts.own <= 2 * numberCount + 1);
  assert.ok(meter.counts.tokens <= 16 * (structuralDepth + 1) * (numberCount + structuralDepth + 1));
  assert.ok(meter.counts.tokenBytes <= 16 * (structuralDepth + 1) * source.length);
  return { tokens: meter.counts.tokens, bytes: meter.counts.tokenBytes };
}

test('deep root, scalar and record fallback arrays keep forward probes within bounded depth work', () => {
  for (const [kind, field] of [
    ['declaration', null], ['declaration', 'moduleId'], ['declaration', 'owner'],
    ['profile', null], ['profile', 'profileId'], ['profile', 'selections'],
  ]) {
    for (const depth of [1, 14, 28]) {
      const small = fallbackProbesAndVisit(kind, field, depth, 128);
      const large = fallbackProbesAndVisit(kind, field, depth, 512);
      assert.ok(large.tokens <= small.tokens * 5, `${kind}/${field}/${depth}: tokens`);
      assert.ok(large.bytes <= small.bytes * 5, `${kind}/${field}/${depth}: bytes`);
    }
  }
});
