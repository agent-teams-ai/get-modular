import assert from 'node:assert/strict';
import test from 'node:test';
import normalizationVectors from '../../../../../architecture/qualification/v1/normalization-vectors.json' with { type: 'json' };
import decoderVectors from '../../../../../architecture/qualification/v1/decoder-vectors.json' with { type: 'json' };
import { createOwnedRawScanner } from '../../../dist-test/features/raw-scanner/owned-iterative/factory.js';
import { rawDocumentView, scanRawDocument } from '../../../dist-test/features/input-admission/raw-document.js';
import { validateDeclarationView, validateProfileView } from '../../../dist-test/features/input-admission/document-shape.js';

// Fixture imports are data only. Every lexical observation uses the real port.
const scanner = createOwnedRawScanner({});
const encoder = new TextEncoder();
const defaultBudget = Object.freeze({ valuesRemaining: 2_097_152, stringBytesRemaining: 8_388_608 });
const normalization = normalizationVectors.cases[0];
const bytesOf = source => typeof source === 'string' ? encoder.encode(source) : source;

function scan(source, budget = defaultBudget, port = scanner, onDuplicate = () => {}) {
  return scanRawDocument(bytesOf(source), port, budget, onDuplicate);
}

function expectedScan(valueOccurrences, stringBytes, maximumDepth, overrides = {}) {
  return {
    decoded: true, invalidJson: false, duplicateKey: false, stoppedBy: null,
    valueOccurrences, stringBytes, maximumDepth, ...overrides,
  };
}

function viewOf(source, port = scanner) {
  const bytes = bytesOf(source);
  assert.equal(scanRawDocument(bytes, port, defaultBudget, () => {}).decoded, true);
  return rawDocumentView(bytes, port);
}

function member(view, value, key) {
  const own = view.reader.own(value, key);
  assert.equal(own.present, true);
  return own.value;
}

function observedScanner(onDecode = () => {}) {
  const real = createOwnedRawScanner({});
  const stats = { opens: 0, nextCalls: 0, decodes: 0 };
  return {
    stats,
    scanner: {
      open(bytes) {
        stats.opens += 1;
        const cursor = real.open(bytes);
        return {
          next() {
            stats.nextCalls += 1;
            return cursor.next();
          },
          decodeString(current) {
            stats.decodes += 1;
            const value = cursor.decodeString(current);
            onDecode(value);
            return value;
          },
        };
      },
    },
  };
}

function fixtureBytes(vector) {
  return vector.sourceEncoding === 'hex-bytes'
    ? Uint8Array.from(vector.source.match(/../g) ?? [], pair => Number.parseInt(pair, 16))
    : encoder.encode(vector.source);
}

test('all JSON root kinds, whitespace and nested grammar are admitted', () => {
  for (const [source, kind] of [
    ['null', 'null'], ['true', 'boolean'], ['false', 'boolean'],
    ['0', 'number'], ['-0', 'number'], ['1.0', 'number'], ['1e-400', 'number'],
    ['""', 'string'], [String.raw`"\ud800"`, 'string'],
    ['{}', 'record'], ['[]', 'array'],
    [' \t\r\n {"a":[true,false,null,{},[],"text",1.5]} \r\n', 'record'],
    [String.raw`["},]:{", "\"", "\\", "\/", "\b\f\n\r\t"]`, 'array'],
  ]) {
    assert.equal(scan(source).decoded, true, source);
    const view = viewOf(source);
    assert.equal(view.reader.kind(view.root), kind, source);
  }
});

test('complete JSON grammar rejects missing separators, trailing commas and extra roots', () => {
  const invalid = [
    '', ' ', '{', '[', '}', ']', ':', ',', '{}[]', '0 1', 'null true', '"a" "b"',
    '{"a"}', '{"a",1}', '{"a" 1}', '{"a":}', '{"a":1,}', '{,"a":1}',
    '{"a":1 "b":2}', '{"a":1:2}', '{"a":1,,"b":2}', '{"a":1]}',
    '{true:0}', '{1:0}', '{"a":1,"b"}', '{"a":1,2:3}',
    '[1,]', '[,1]', '[1 2]', '[1,,2]', '[1:2]', '[1}', '[{"a":1}] trailing',
    '// comment\n0', '/* comment */0', '[0/* comment */]', '#', '\u00a00',
    '+1', '01', '-01', '.1', '1.', '1e', '1e+', '--1', 'NaN', 'Infinity',
    'TRUE', 'undefined', 'nul', 'truex', 'false0', 'null0', '"unfinished',
    String.raw`"\q"`, String.raw`"\u000g"`, String.raw`"\u12"`,
    '"' + String.fromCharCode(10) + '"',
  ];
  for (const source of invalid) {
    const result = scan(source);
    assert.equal(result.decoded, false, source);
    assert.equal(result.invalidJson, true, source);
    assert.equal(result.duplicateKey, false, source);
    assert.equal(result.stoppedBy, null, source);
  }
});

test('malformed UTF-8, true EOF truncations and a BOM fail lexical admission', () => {
  for (const malformed of [
    [0x80], [0xc0, 0xaf], [0xc1, 0xbf], [0xc2], [0xe0, 0x80, 0x80],
    [0xed, 0xa0, 0x80], [0xf0, 0x80, 0x80, 0x80], [0xf4, 0x90, 0x80, 0x80],
    [0xf5, 0x80, 0x80, 0x80], [0xff], [0xe2, 0x28, 0xa1], [0xf0, 0x9f, 0x92],
  ]) {
    const result = scan(new Uint8Array([0x22, ...malformed, 0x22]));
    assert.equal(result.invalidJson, true);
    assert.equal(result.decoded, false);
  }
  for (const truncated of [[0xc2], [0xe2, 0x82], [0xf0, 0x9f, 0x92]]) {
    assert.equal(scan(new Uint8Array([0x22, ...truncated])).invalidJson, true);
  }
  const bom = [0xef, 0xbb, 0xbf];
  assert.equal(scan(new Uint8Array([...bom, 0x7b, 0x7d])).invalidJson, true);
  assert.equal(scan(new Uint8Array([0x7b, 0x7d, ...bom])).invalidJson, true);
  assert.deepEqual(scan('"é€😀"'), expectedScan(1, 9, 0));
  assert.deepEqual(scan('"\ufeff"'), expectedScan(1, 3, 0));
});

test('existing decoder fixture data exercises this document admission', () => {
  for (const [name, invalidJson, duplicateKey] of [
    ['utf8-bom', true, false],
    ['invalid-utf8-unexpected-continuation', true, false],
    ['incomplete-document', true, false],
    ['leading-zero-number', true, false],
    ['trailing-decimal-point', true, false],
    ['duplicate-object-key', false, true],
    ['lone-surrogate-escape', false, false],
    ['negative-zero', false, false],
    ['prototype-property-is-data-before-schema-validation', false, false],
  ]) {
    const vector = decoderVectors.cases.find(row => row.name === name);
    assert.ok(vector, name);
    const result = scan(fixtureBytes(vector));
    assert.equal(result.invalidJson, invalidJson, name);
    assert.equal(result.duplicateKey, duplicateKey, name);
    assert.equal(result.decoded, !invalidJson && !duplicateKey, name);
    assert.equal(result.stoppedBy, null, name);
  }
});

test('decoded duplicate spellings stream complete local paths through known and unknown nesting', () => {
  const paths = [];
  const source = String.raw`{"moduleId":0,"\u006doduleId":1,"owner":{"path":[{"x":1,"x":2}]},"unknown/secret":{"slots":[{"cardinality":{"min":0,"\u006din":1}}]},"__proto__":null,"__proto__":true}`;
  const result = scan(source, defaultBudget, scanner, path => paths.push(path));
  assert.equal(result.decoded, false);
  assert.equal(result.invalidJson, false);
  assert.equal(result.duplicateKey, true);
  assert.equal(result.stoppedBy, null);
  assert.equal(result.valueOccurrences, 16);
  assert.equal(result.maximumDepth, 5);
  assert.deepEqual(paths, [
    ['moduleId'], ['owner', 'path', 0, 'x'],
    ['unknown/secret', 'slots', 0, 'cardinality', 'min'], ['__proto__'],
  ]);
  assert.equal(scan('[{"a":1},{"a":2},{"nested":{"a":3}}]').decoded, true);
  const emptyPaths = [];
  assert.deepEqual(scan('{"":0,"":1,"":2}', defaultBudget, scanner, path => emptyPaths.push(path)),
    expectedScan(4, 0, 1, { decoded: false, duplicateKey: true }));
  assert.deepEqual(emptyPaths, [[''], ['']]);
  assert.notEqual(emptyPaths[0], emptyPaths[1]);
});

test('duplicates remain eligible before later grammar, lexical or resource failure', () => {
  for (const source of ['{"a":0,"a":1,}', '{"a":0,"a"', '{"a":0,"a":1} !']) {
    const paths = [];
    const result = scan(source, defaultBudget, scanner, path => paths.push(path));
    assert.equal(result.decoded, false);
    assert.equal(result.invalidJson, true);
    assert.equal(result.duplicateKey, true);
    assert.equal(result.stoppedBy, null);
    assert.deepEqual(paths, [['a']]);
  }
  const paths = [];
  assert.deepEqual(scan('{"a":0,"a":1}', { valuesRemaining: 2, stringBytesRemaining: 2 }, scanner,
    path => paths.push(path)), expectedScan(3, 2, 1, {
      decoded: false, duplicateKey: true, stoppedBy: 'jsonValueOccurrences',
    }));
  assert.deepEqual(paths, [['a']]);
});

test('local duplicate paths leave depth and index redaction to the caller', () => {
  const deepPaths = [];
  const deep = '{"a":'.repeat(31) + '{"x":0,"x":1}' + '}'.repeat(31);
  const deepResult = scan(deep, defaultBudget, scanner, path => deepPaths.push(path));
  assert.equal(deepResult.maximumDepth, 32);
  assert.deepEqual(deepPaths, [[...Array(31).fill('a'), 'x']]);
  const widePaths = [];
  const wide = '[' + 'null,'.repeat(65_536) + '{"x":0,"x":1}]';
  assert.equal(scan(wide, defaultBudget, scanner, path => widePaths.push(path)).duplicateKey, true);
  assert.deepEqual(widePaths, [[65_536, 'x']]);
});

test('counts include every container, scalar, decoded key and string occurrence', () => {
  for (const [source, values, strings, depth] of [
    ['null', 1, 0, 0], ['{}', 1, 0, 1], ['[]', 1, 0, 1],
    ['{"":""}', 2, 0, 1], ['["",null,{},[]]', 5, 0, 2],
    [String.raw`{"é":"😀","\u0061":["\ud800","\udc00","x"],"":{}}`, 7, 14, 2],
    [String.raw`{"\ud800":"\udc00","pair":"\ud83d\ude00"}`, 3, 14, 1],
    [String.raw`"\ud800"`, 1, 3, 0], [String.raw`"\ud83d\ude00"`, 1, 4, 0],
    ['{"unknown":[false,true,null,{"nested":"é"}]}', 7, 15, 3],
  ]) {
    assert.deepEqual(scan(source), expectedScan(values, strings, depth), source);
    assert.deepEqual(scan(source, { valuesRemaining: values, stringBytesRemaining: strings }),
      expectedScan(values, strings, depth), source);
  }
  assert.deepEqual(scan(String.raw`{"é":0,"\u00e9":"😀"}`),
    expectedScan(3, 8, 1, { decoded: false, duplicateKey: true }));
});

test('remaining budgets admit exact counts and saturate overflow at remaining plus one', () => {
  for (const [source, budget, expected] of [
    ['null', { valuesRemaining: 0, stringBytesRemaining: 0 },
      expectedScan(1, 0, 0, { decoded: false, stoppedBy: 'jsonValueOccurrences' })],
    ['null', { valuesRemaining: 1, stringBytesRemaining: 0 }, expectedScan(1, 0, 0)],
    ['[""]', { valuesRemaining: 1, stringBytesRemaining: 0 },
      expectedScan(2, 0, 1, { decoded: false, stoppedBy: 'jsonValueOccurrences' })],
    ['[""]', { valuesRemaining: 2, stringBytesRemaining: 0 }, expectedScan(2, 0, 1)],
    ['{"":""}', { valuesRemaining: 2, stringBytesRemaining: 0 }, expectedScan(2, 0, 1)],
    ['["abcdef"]', { valuesRemaining: 2, stringBytesRemaining: 1 },
      expectedScan(2, 2, 1, { decoded: false, stoppedBy: 'aggregateStringBytes' })],
    ['{"a":"b"}', { valuesRemaining: 2, stringBytesRemaining: 1 },
      expectedScan(2, 2, 1, { decoded: false, stoppedBy: 'aggregateStringBytes' })],
    ['{"a":"b"}', { valuesRemaining: 2, stringBytesRemaining: 2 }, expectedScan(2, 2, 1)],
    ['{"a":"b"}', { valuesRemaining: 3, stringBytesRemaining: 3 }, expectedScan(2, 2, 1)],
  ]) assert.deepEqual(scan(source, budget), expected);

  const observed = observedScanner(() => assert.fail('over-budget key was decoded'));
  assert.deepEqual(scan('{"' + 'x'.repeat(32_768) + '":"ignored"}',
    { valuesRemaining: 10, stringBytesRemaining: 3 }, observed.scanner),
  expectedScan(1, 4, 1, { decoded: false, stoppedBy: 'aggregateStringBytes' }));
  assert.deepEqual(observed.stats, { opens: 1, nextCalls: 2, decodes: 0 });
  const zero = observedScanner(() => assert.fail('zero value budget decoded a key'));
  assert.deepEqual(scan('{"ignored":0}', { valuesRemaining: 0, stringBytesRemaining: 0 }, zero.scanner),
    expectedScan(1, 0, 0, { decoded: false, stoppedBy: 'jsonValueOccurrences' }));
  assert.deepEqual(zero.stats, { opens: 1, nextCalls: 1, decodes: 0 });
});

test('document-local counters compose using the remaining batch budgets', () => {
  const first = scan('{"a":"é"}', { valuesRemaining: 5, stringBytesRemaining: 7 });
  assert.deepEqual(first, expectedScan(2, 3, 1));
  const remaining = { valuesRemaining: 5 - first.valueOccurrences, stringBytesRemaining: 7 - first.stringBytes };
  assert.deepEqual(scan('["😀",null]', remaining), expectedScan(3, 4, 1));
  assert.deepEqual(scan('["😀",null]', { ...remaining, valuesRemaining: 2 }),
    expectedScan(3, 4, 1, { decoded: false, stoppedBy: 'jsonValueOccurrences' }));
  assert.deepEqual(scan('["😀",null]', { ...remaining, stringBytesRemaining: 3 }),
    expectedScan(2, 4, 1, { decoded: false, stoppedBy: 'aggregateStringBytes' }));
});

test('container depth admits 32 and stops before opening a thirty-third frame', () => {
  assert.deepEqual(scan('['.repeat(32) + '0' + ']'.repeat(32)), expectedScan(33, 0, 32));
  assert.deepEqual(scan('{"a":'.repeat(32) + '0' + '}'.repeat(32)), expectedScan(33, 32, 32));
  for (const depth of [33, 64, 4096]) {
    const observed = observedScanner();
    assert.deepEqual(scan('['.repeat(depth) + '0' + ']'.repeat(depth), defaultBudget, observed.scanner),
      expectedScan(33, 0, 33, { decoded: false, stoppedBy: 'jsonDepth' }));
    assert.deepEqual(observed.stats, { opens: 1, nextCalls: 33, decodes: 0 });
  }
  assert.deepEqual(scan('{"a":'.repeat(33) + '0' + '}'.repeat(33)),
    expectedScan(33, 32, 33, { decoded: false, stoppedBy: 'jsonDepth' }));
});

test('preflight returns only counters and flags; lazy access skips unknown descendants', () => {
  const allowedKeys = new Set(['unknown', 'items', 'label', 'number']);
  const observed = observedScanner(value => assert.ok(allowedKeys.has(value), 'string value was decoded'));
  const bytes = encoder.encode('{"unknown":"' + 'x'.repeat(32_768)
    + '","items":[{"label":"DO-NOT-DECODE","number":' + '9'.repeat(32_768) + '},null]}');
  const result = scanRawDocument(bytes, observed.scanner, defaultBudget, () => {});
  assert.deepEqual(result, expectedScan(7, 32_804, 3));
  assert.ok(Object.values(result).every(value => value === null || typeof value !== 'object'));
  assert.equal(observed.stats.decodes, 4);
  observed.stats.decodes = 0;
  const view = rawDocumentView(bytes, observed.scanner);
  assert.equal(observed.stats.decodes, 0);
  assert.deepEqual(view.reader.keys(view.root), ['unknown', 'items']);
  assert.equal(view.reader.length(member(view, view.root, 'items')), 2);
  assert.equal(observed.stats.decodes, 2);
});

test('records distinguish absent members, null values and ordinary prototype spellings', () => {
  const view = viewOf(String.raw`{"__proto__":null,"constructor":{"nested":"ok"},"toString":false,"":0,"a\u002fb":["é",10e-1],"10":10,"2":2}`);
  const { reader, root } = view;
  assert.deepEqual([...reader.keys(root)].sort(), ['', '10', '2', '__proto__', 'a/b', 'constructor', 'toString'].sort());
  assert.deepEqual(reader.own(root, 'absent'), { present: false });
  assert.equal(reader.kind(member(view, root, '__proto__')), 'null');
  assert.equal(reader.kind(member(view, root, 'toString')), 'boolean');
  assert.deepEqual(reader.integer(member(view, root, '')), { admitted: true, value: 0 });
  const constructor = member(view, root, 'constructor');
  assert.equal(reader.text(member(view, constructor, 'nested')), 'ok');
  assert.equal(member(view, root, 'constructor'), constructor);
  const array = member(view, root, 'a/b');
  assert.equal(reader.length(array), 2);
  assert.equal(reader.text(reader.item(array, 0)), 'é');
  assert.deepEqual(reader.integer(reader.item(array, 1)), { admitted: true, value: 1 });
  assert.equal(reader.text(reader.item(array, 0)), 'é');
  assert.deepEqual(reader.keys(constructor), ['nested']);
});

test('nested spans adjust offsets relative to the supplied visible byte view', () => {
  const source = ' \n' + String.raw`{"unused":[{"noise":"é"}],"nested":{"items":[0,{"value":10e-1,"text":"\u00e9😀"}]}}` + ' \t';
  const encoded = encoder.encode(source);
  const backing = new Uint8Array(encoded.length + 11).fill(0xff);
  backing.set(encoded, 5);
  const owned = backing.subarray(5, 5 + encoded.length);
  const view = viewOf(owned);
  const nested = member(view, view.root, 'nested');
  const items = member(view, nested, 'items');
  const row = view.reader.item(items, 1);
  assert.equal(view.reader.length(items), 2);
  assert.deepEqual(view.reader.integer(member(view, row, 'value')), { admitted: true, value: 1 });
  assert.equal(view.reader.text(member(view, row, 'text')), 'é😀');
});

test('exact integer extraction uses original number spans', () => {
  for (const [lexeme, projection] of [
    ['0', 0], ['0.0', 0], ['0e999999999999999999999999', 0],
    ['1', 1], ['1.0', 1], ['1e0', 1], ['10e-1', 1], ['1.0000000000000000', 1],
    ['-1.0', -1], ['9007199254740991', 9007199254740991],
    ['-9007199254740991', -9007199254740991], ['90071992547409910e-1', 9007199254740991],
    ['1.0000000000000001', 'invalid-type'], ['-1.0000000000000001', 'invalid-type'],
    ['1e-400', 'invalid-type'], ['-1e-400', 'invalid-type'],
    ['1e-999999999999999999999999', 'invalid-type'],
    ['1e999999999999999999999999', 'invalid-format'],
    ['9007199254740992', 'invalid-format'], ['-9007199254740992', 'invalid-format'],
    ['-0', 'invalid-format'], ['-0.0', 'invalid-format'],
    ['-0e999999999999999999999999', 'invalid-format'],
    ['-0.000e-999999999999999999999999', 'invalid-format'],
    ['9007199254740991.0', 9007199254740991], ['9.007199254740991e15', 9007199254740991],
  ]) {
    const view = viewOf(' {"values": [ ' + lexeme + ' ]} ');
    const values = member(view, view.root, 'values');
    const value = view.reader.item(values, 0);
    assert.equal(view.reader.kind(value), 'number');
    assert.deepEqual(view.reader.integer(value), typeof projection === 'number'
      ? { admitted: true, value: projection } : { admitted: false, reason: projection }, lexeme);
  }
});

test('huge coefficients and exponents stay lexical until exact integer access', () => {
  for (const [source, expected] of [
    ['9'.repeat(32_768), { admitted: false, reason: 'invalid-format' }],
    ['1e' + '9'.repeat(32_768), { admitted: false, reason: 'invalid-format' }],
    ['1e-' + '9'.repeat(32_768), { admitted: false, reason: 'invalid-type' }],
    ['0e' + '9'.repeat(32_768), { admitted: true, value: 0 }],
    ['1' + '0'.repeat(32_768) + 'e-32768', { admitted: true, value: 1 }],
  ]) {
    const observed = observedScanner(() => assert.fail('numeric span decoded a string'));
    const bytes = encoder.encode(' \t' + source + '\n');
    assert.deepEqual(scan(bytes, defaultBudget, observed.scanner), expectedScan(1, 0, 0));
    const view = rawDocumentView(bytes, observed.scanner);
    assert.equal(view.reader.kind(view.root), 'number');
    assert.deepEqual(view.reader.integer(view.root), expected);
    assert.equal(observed.stats.decodes, 0);
  }
});

test('shared declaration and profile schema checks receive exact raw version values', () => {
  for (const [document, validate] of [
    [normalization.declarations[0], validateDeclarationView],
    [normalization.equivalentProfiles[0], validateProfileView],
  ]) {
    const baseline = JSON.stringify(document);
    assert.ok(baseline.includes('"schemaVersion":1'));
    for (const [lexeme, rule] of [
      ['1', null], ['1.0', null], ['1e0', null], ['10e-1', null],
      ['1.0000000000000001', 'integer'], ['1e-400', 'integer'],
      ['-0.0', 'range'], ['9007199254740992', 'range'],
      ['2', 'unsupported-version'], ['9007199254740991', 'unsupported-version'],
    ]) {
      const source = baseline.replace('"schemaVersion":1', '"schemaVersion":' + lexeme);
      const violations = [];
      const valid = validate(viewOf(source), violation => violations.push(violation));
      assert.equal(valid, rule === null, lexeme);
      assert.deepEqual(violations, rule === null ? [] : [{ rule, path: ['schemaVersion'] }], lexeme);
    }
  }
  for (const [name, rule, path] of [
    ['lone-surrogate-escape', 'unicode', ['owner', 'path', 0]],
    ['negative-zero', 'range', ['slots', 0, 'cardinality', 'min']],
    ['prototype-property-is-data-before-schema-validation', 'closed', []],
  ]) {
    const vector = decoderVectors.cases.find(row => row.name === name);
    assert.ok(vector, name);
    const violations = [];
    assert.equal(validateDeclarationView(viewOf(fixtureBytes(vector)), value => violations.push(value)), false);
    assert.deepEqual(violations, [{ rule, path }], name);
  }
});

test('oversized provider arrays expose length without decoding or reading their elements', () => {
  const count = 65_537;
  const profile = {
    kind: 'get-modular.composition-profile', schemaVersion: 1, profileId: 'example/profile',
    roots: ['example/root'],
    selections: [{ moduleId: 'example/root', implementationId: 'example/root/default' }],
    bindings: [{ consumerImplementationId: 'example/root/default', slotId: 'items', providerImplementationIds: [] }],
  };
  const source = JSON.stringify(profile).replace('"providerImplementationIds":[]',
    '"providerImplementationIds":[' + '"example/provider",'.repeat(count - 1) + '"example/provider"]');
  const observed = observedScanner(value => assert.notEqual(value, 'example/provider', 'provider value was decoded'));
  const view = viewOf(source, observed.scanner);
  const bindings = member(view, view.root, 'bindings');
  const row = view.reader.item(bindings, 0);
  const providers = member(view, row, 'providerImplementationIds');
  assert.equal(view.reader.length(providers), count);
  const before = observed.stats.nextCalls;
  assert.equal(view.reader.length(providers), count);
  assert.equal(observed.stats.nextCalls, before);
  const guarded = {
    root: view.root,
    reader: {
      ...view.reader,
      item(value, index) {
        assert.notEqual(value, providers, 'schema read an oversized provider element');
        return view.reader.item(value, index);
      },
    },
  };
  const violations = [];
  const limits = [];
  assert.equal(validateProfileView(guarded, value => violations.push(value), (...args) => limits.push(args)), false);
  assert.deepEqual(violations, [{ rule: 'size', path: ['bindings', 0, 'providerImplementationIds'] }]);
  assert.deepEqual(limits, []);
  assert.ok(observed.stats.nextCalls < 20 * count + 1000);
});

test('array access supports sequential reads, repeated elements, resets and random indexes', () => {
  const view = viewOf('[0,{"value":"one"},[2,3],null,true,"five",6]');
  const { reader, root } = view;
  assert.equal(reader.length(root), 7);
  function check(index) {
    const value = reader.item(root, index);
    if (index === 0 || index === 6) assert.deepEqual(reader.integer(value), { admitted: true, value: index });
    else if (index === 1) assert.equal(reader.text(member(view, value, 'value')), 'one');
    else if (index === 2) {
      assert.equal(reader.length(value), 2);
      assert.deepEqual(reader.integer(reader.item(value, 1)), { admitted: true, value: 3 });
      assert.deepEqual(reader.integer(reader.item(value, 0)), { admitted: true, value: 2 });
    } else if (index === 3) assert.equal(reader.kind(value), 'null');
    else if (index === 4) assert.equal(reader.kind(value), 'boolean');
    else assert.equal(reader.text(value), 'five');
  }
  for (const index of [6, 0, 1, 1, 5, 2, 6, 3, 0]) check(index);
  for (let pass = 0; pass < 2; pass += 1) for (let index = 0; index < 7; index += 1) check(index);
  const empty = viewOf('[]');
  assert.equal(empty.reader.length(empty.root), 0);
  assert.throws(() => empty.reader.item(empty.root, 0), TypeError);
});

test('three forward traversals have linear cursor work and stable repeated record access', () => {
  const count = 2048;
  const source = '[' + Array.from({ length: count }, (_, index) =>
    '{"index":' + index + ',"label":"row-' + index + '"}').join(',') + ']';
  const observed = observedScanner();
  const bytes = encoder.encode(source);
  assert.equal(scan(bytes, defaultBudget, observed.scanner).decoded, true);
  observed.stats.opens = 0;
  observed.stats.nextCalls = 0;
  observed.stats.decodes = 0;
  const view = rawDocumentView(bytes, observed.scanner);
  const { reader, root } = view;
  assert.equal(reader.length(root), count);
  let retainedFirst;
  for (let pass = 0; pass < 3; pass += 1) {
    for (let index = 0; index < count; index += 1) {
      const row = reader.item(root, index);
      if (pass === 0 && index === 0) retainedFirst = row;
      assert.deepEqual(reader.keys(row), ['index', 'label']);
      assert.deepEqual(reader.integer(member(view, row, 'index')), { admitted: true, value: index });
      assert.equal(reader.text(member(view, row, 'label')), 'row-' + index);
    }
  }
  assert.equal(reader.text(member(view, retainedFirst, 'label')), 'row-0');
  assert.ok(observed.stats.nextCalls < 128 * count + 100, 'forward reads repeatedly rescanned the array prefix');
  assert.ok(observed.stats.opens < 8 * count + 20, 'forward reads repeatedly reopened the array');
});

test('invalid internal reader calls fail with fixed text and foreign handles are rejected', () => {
  const view = viewOf('{"array":[0],"number":1,"string":"x"}');
  const array = member(view, view.root, 'array');
  const number = member(view, view.root, 'number');
  const string = member(view, view.root, 'string');
  const foreign = viewOf('{}');
  const calls = [
    () => view.reader.keys(number),
    () => view.reader.own(number, 'password=DO-NOT-EMIT'),
    () => view.reader.length(view.root),
    () => view.reader.text(number),
    () => view.reader.integer(string),
    () => view.reader.kind(foreign.root),
    () => view.reader.kind({ start: 0, end: 2, kind: 'record' }),
    ...[-1, 0.5, NaN, Infinity, 1].map(index => () => view.reader.item(array, index)),
  ];
  for (const call of calls) assert.throws(call, { name: 'TypeError', message: 'Invalid raw document access' });
});

test('one scanner port supports reentrant scans and independently interleaved views', async () => {
  const port = createOwnedRawScanner({});
  const paths = [];
  const outer = scan('[{"a":0,"a":1},{"a":2,"a":3}]', defaultBudget, port, path => {
    paths.push(path);
    assert.equal(scan('{"independent":true}', defaultBudget, port).decoded, true);
  });
  assert.deepEqual(outer, expectedScan(7, 4, 2, { decoded: false, duplicateKey: true }));
  assert.deepEqual(paths, [[0, 'a'], [1, 'a']]);
  const results = await Promise.all(Array.from({ length: 16 }, async (_, index) => {
    const view = viewOf('[' + index + ',' + (index + 1) + ',' + (index + 2) + ']', port);
    const first = view.reader.integer(view.reader.item(view.root, 0));
    await Promise.resolve();
    const last = view.reader.integer(view.reader.item(view.root, 2));
    await Promise.resolve();
    const middle = view.reader.integer(view.reader.item(view.root, 1));
    return [first, last, middle];
  }));
  assert.deepEqual(results, Array.from({ length: 16 }, (_, index) => [
    { admitted: true, value: index },
    { admitted: true, value: index + 2 },
    { admitted: true, value: index + 1 },
  ]));
});
