import assert from 'node:assert/strict';
import test from 'node:test';
import { createOwnedRawScanner } from '../../../dist-test/features/raw-scanner/owned-iterative/factory.js';
import { ownedRawScannerDeclaration, ownedRawScannerImplementation } from '../../../dist-test/features/raw-scanner/owned-iterative/declaration.js';
import { rawScannerCapabilityId, rawScannerModuleId, rawScannerToken } from '../../../dist-test/features/raw-scanner/identity.js';

const encoder = new TextEncoder();
const encode = source => encoder.encode(source);
const token = (kind, start, end) => ({ kind, start, end });
const stringToken = (start, end, decodedUtf8Bytes, wellFormedUtf16 = true) => ({
  kind: 'string', start, end, decodedUtf8Bytes, wellFormedUtf16,
});

function readAll(input) {
  const ownedBytes = typeof input === 'string' ? encode(input) : input;
  const cursor = createOwnedRawScanner({}).open(ownedBytes);
  const tokens = [];
  for (let step = 0; step <= ownedBytes.length + 1; step += 1) {
    const current = cursor.next();
    tokens.push(current);
    if (current.kind === 'end') return { cursor, tokens, ownedBytes };
  }
  assert.fail('Cursor did not terminate within the byte-based token bound');
}

function expectString(input, decoded, decodedUtf8Bytes, wellFormedUtf16 = true) {
  const ownedBytes = typeof input === 'string' ? encode(input) : input;
  const cursor = createOwnedRawScanner({}).open(ownedBytes);
  const current = cursor.next();
  assert.deepEqual(current, stringToken(0, ownedBytes.length, decodedUtf8Bytes, wellFormedUtf16));
  assert.equal(cursor.decodeString(current), decoded);
  assert.deepEqual(cursor.next(), token('end', ownedBytes.length, ownedBytes.length));
  assert.equal(cursor.decodeString(current), decoded, 'retained tokens decode after end');
}

function expectInvalid(input) {
  const { cursor, tokens, ownedBytes } = readAll(input);
  const invalid = tokens.find(current => current.kind === 'invalid');
  assert.ok(invalid, 'expected lexical rejection');
  assert.equal(tokens.at(-2), invalid, 'invalid is followed immediately by end');
  assert.deepEqual(Object.keys(invalid).sort(), ['end', 'kind', 'start']);
  assert.ok(invalid.start >= 0 && invalid.end > invalid.start && invalid.end <= ownedBytes.length);
  for (let repeat = 0; repeat < 3; repeat += 1) {
    assert.deepEqual(cursor.next(), token('end', ownedBytes.length, ownedBytes.length));
  }
}

test('owned declaration follows the zero-slot feature contract', () => {
  assert.equal(rawScannerModuleId, 'get-modular/raw-scanner');
  assert.equal(rawScannerCapabilityId, 'get-modular/raw-scanner');
  assert.equal(rawScannerToken, 'get-modular/raw-scanner/v1');
  assert.equal(ownedRawScannerImplementation, 'get-modular/raw-scanner/owned-iterative');
  assert.deepEqual(ownedRawScannerDeclaration, {
    kind: 'get-modular.module-declaration', schemaVersion: 1,
    moduleId: rawScannerModuleId, implementationId: ownedRawScannerImplementation,
    owner: { authority: 'get-modular', path: ['raw-scanner'] },
    provides: [{ capabilityId: rawScannerCapabilityId,
      compatibility: { family: 'exact', familyVersion: 1, token: rawScannerToken } }],
    slots: [],
  });
  for (const value of [ownedRawScannerDeclaration, ownedRawScannerDeclaration.owner,
    ownedRawScannerDeclaration.owner.path, ownedRawScannerDeclaration.provides,
    ownedRawScannerDeclaration.provides[0], ownedRawScannerDeclaration.provides[0].compatibility,
    ownedRawScannerDeclaration.slots]) assert.equal(Object.isFrozen(value), true);
  const scanner = createOwnedRawScanner({});
  assert.equal(Object.isFrozen(scanner), true);
  assert.deepEqual(Object.keys(scanner), ['open']);
  assert.deepEqual(Object.keys(scanner.open(new Uint8Array())), ['next', 'decodeString']);
});

test('complete token records retain exact source byte spans', () => {
  const source = ' \t' + String.raw`{"a":[true,false,null,-12.50e+2],"b":"\u0061\/"}` + '\r\n';
  const { cursor, tokens } = readAll(source);
  assert.deepEqual(tokens, [
    token('object-start', 2, 3), stringToken(3, 6, 1), token('colon', 6, 7),
    token('array-start', 7, 8), token('true', 8, 12), token('comma', 12, 13),
    token('false', 13, 18), token('comma', 18, 19), token('null', 19, 23),
    token('comma', 23, 24), token('number', 24, 33), token('array-end', 33, 34),
    token('comma', 34, 35), stringToken(35, 38, 1), token('colon', 38, 39),
    stringToken(39, 49, 2), token('object-end', 49, 50), token('end', 52, 52),
  ]);
  assert.deepEqual(tokens.filter(current => current.kind === 'string')
    .map(current => cursor.decodeString(current)), ['a', 'b', 'a/']);
});

test('multibyte spans count bytes rather than UTF-16 positions', () => {
  const input = new Uint8Array([0x5b, 0x22, 0xc3, 0xa9, 0x22, 0x2c,
    0x22, 0xf0, 0x9f, 0x98, 0x80, 0x22, 0x5d]);
  const { cursor, tokens } = readAll(input);
  assert.deepEqual(tokens, [token('array-start', 0, 1), stringToken(1, 5, 2),
    token('comma', 5, 6), stringToken(6, 12, 4), token('array-end', 12, 13), token('end', 13, 13)]);
  assert.equal(cursor.decodeString(tokens[3]), '\u{1f600}');
  assert.equal(cursor.decodeString(tokens[1]), '\u00e9');
});

test('decoded key collisions remain available to the consumer without a scanner census', () => {
  const source = String.raw`{"a":0,"\u0061":1,"/":2,"\/":3,"😀":4,"\uD83D\uDE00":5}`;
  const { cursor, tokens } = readAll(source);
  assert.equal(tokens.some(current => current.kind === 'invalid'), false);
  const keys = tokens.filter(current => current.kind === 'string');
  assert.deepEqual(keys.map(current => cursor.decodeString(current)), ['a', 'a', '/', '/', '😀', '😀']);
  assert.deepEqual(keys.map(current => current.decodedUtf8Bytes), [1, 1, 1, 1, 4, 4]);
  assert.notEqual(keys[0].end - keys[0].start, keys[1].end - keys[1].start);
  const distinct = readAll(String.raw`"é" "e\u0301"`);
  const values = distinct.tokens.filter(current => current.kind === 'string')
    .map(current => distinct.cursor.decodeString(current));
  assert.deepEqual(values, ['\u00e9', 'e\u0301']);
  assert.notEqual(values[0], values[1], 'decoding performs no Unicode normalization');
});

test('all JSON escapes and surrogate combinations have independent decoded counts', () => {
  const cases = [
    [String.raw`""`, '', 0, true],
    [String.raw`"\"\\\/\b\f\n\r\t"`, '"\\/\b\f\n\r\t', 8, true],
    [String.raw`"\u0000\u001f\u007f\u0080\u07ff\u0800"`, '\u0000\u001f\u007f\u0080\u07ff\u0800', 10, true],
    [String.raw`"\u006a\u006B"`, 'jk', 2, true],
    [String.raw`"\uD83D\uDE00"`, '\u{1f600}', 4, true],
    [String.raw`"\ud800\udc00"`, '\u{10000}', 4, true],
    [String.raw`"\uDBFF\uDFFF"`, '\u{10ffff}', 4, true],
    [String.raw`"\uD800"`, '\ud800', 3, false],
    [String.raw`"\uDC00"`, '\udc00', 3, false],
    [String.raw`"\uD800a"`, '\ud800a', 4, false],
    [String.raw`"a\uD800"`, 'a\ud800', 4, false],
    [String.raw`"\uD800\uD800\uDC00"`, '\ud800\ud800\udc00', 7, false],
    [String.raw`"\uDC00\uD800"`, '\udc00\ud800', 6, false],
    [String.raw`"\uD800\uDC00\uDC00"`, '\ud800\udc00\udc00', 7, false],
    [String.raw`"\uD800\n\uDC00"`, '\ud800\n\udc00', 7, false],
    [String.raw`"\uD800😀\uDC00"`, '\ud800\u{1f600}\udc00', 10, false],
    [String.raw`"\uD800\uDC00\uD800\uDC00"`, '\u{10000}\u{10000}', 8, true],
    [String.raw`"\uFFFF\uFFFE"`, '\uffff\ufffe', 6, true],
  ];
  for (const [source, decoded, count, wellFormed] of cases) expectString(source, decoded, count, wellFormed);
});

test('valid UTF-8 includes scalar boundaries, noncharacters and an interior BOM', () => {
  const cases = [
    [[0x20], ' ', 1], [[0x7f], '\u007f', 1],
    [[0xc2, 0x80], '\u0080', 2], [[0xdf, 0xbf], '\u07ff', 2],
    [[0xe0, 0xa0, 0x80], '\u0800', 3], [[0xed, 0x9f, 0xbf], '\ud7ff', 3],
    [[0xee, 0x80, 0x80], '\ue000', 3], [[0xef, 0xbf, 0xbf], '\uffff', 3],
    [[0xef, 0xbb, 0xbf], '\ufeff', 3], [[0xe2, 0x80, 0xa8], '\u2028', 3],
    [[0xe2, 0x80, 0xa9], '\u2029', 3],
    [[0xf0, 0x90, 0x80, 0x80], '\u{10000}', 4],
    [[0xf4, 0x8f, 0xbf, 0xbf], '\u{10ffff}', 4],
  ];
  for (const [content, decoded, count] of cases) {
    expectString(new Uint8Array([0x22, ...content, 0x22]), decoded, count);
  }
});

test('malformed UTF-8 is rejected inside strings as well as outside them', () => {
  const cases = [
    [0x80], [0xbf], [0xc0, 0x80], [0xc1, 0xbf], [0xc2], [0xc2, 0x20], [0xdf, 0x7f],
    [0xe0, 0x80, 0x80], [0xe0, 0x9f, 0xbf], [0xe1, 0x80],
    [0xe1, 0x41, 0x80], [0xe1, 0x80, 0x7f], [0xed, 0xa0, 0x80], [0xed, 0xbf, 0xbf],
    [0xf0, 0x80, 0x80, 0x80], [0xf0, 0x8f, 0xbf, 0xbf], [0xf0, 0x90, 0x80],
    [0xf1, 0x80, 0x41, 0x80], [0xf1, 0x80, 0x80, 0x41],
    [0xf4, 0x90, 0x80, 0x80], [0xf4, 0xbf, 0xbf, 0xbf],
    [0xf5, 0x80, 0x80, 0x80], [0xf8, 0x88, 0x80, 0x80, 0x80], [0xfe], [0xff],
  ];
  for (const malformed of cases) {
    expectInvalid(new Uint8Array([0x22, ...malformed, 0x22]));
    expectInvalid(new Uint8Array([0x22, ...malformed]));
    expectInvalid(new Uint8Array(malformed));
  }
  const { cursor, tokens } = readAll(new Uint8Array([0x22, 0x61, 0x22, 0x20, 0xff]));
  assert.deepEqual(tokens, [stringToken(0, 3, 1), token('invalid', 4, 5), token('end', 5, 5)]);
  assert.equal(cursor.decodeString(tokens[0]), 'a', 'earlier string remains usable after failure');
});

test('BOM and non-JSON whitespace never disappear outside strings', () => {
  for (const prefix of [[], [0x20], [0x7b, 0x7d]]) {
    const input = new Uint8Array([...prefix, 0xef, 0xbb, 0xbf, 0x7b, 0x7d]);
    expectInvalid(input);
    const invalid = readAll(input).tokens.find(current => current.kind === 'invalid');
    assert.deepEqual(invalid, token('invalid', prefix.length, prefix.length + 3));
  }
  for (const source of ['\u00a0', '\u2028', '\u2029', '\ufeff', '\u000b', '\u000c']) expectInvalid(source);
  for (const input of [[0xff, 0xfe, 0x7b, 0], [0xfe, 0xff, 0, 0x7b]]) expectInvalid(new Uint8Array(input));
  assert.deepEqual(readAll('').tokens, [token('end', 0, 0)]);
  assert.deepEqual(readAll(' \t\r\n').tokens, [token('end', 4, 4)]);
});

test('string lexical failures and every unescaped control byte terminate without error text', () => {
  const cases = ['"', '"unterminated', '"abc' + String.fromCharCode(0x5c),
    String.raw`"\q"`, String.raw`"\v"`, String.raw`"\x20"`, String.raw`"\0"`,
    String.raw`"\U0061"`, String.raw`"\u"`, String.raw`"\u0"`, String.raw`"\u00"`,
    String.raw`"\u000"`, String.raw`"\u00x0"`, String.raw`"\u0g00"`,
    String.raw`"\u{0061}"`, String.raw`"\u-001"`];
  for (const source of cases) expectInvalid(source);
  for (let byte = 0; byte < 0x20; byte += 1) {
    expectInvalid(new Uint8Array([0x22, byte, 0x22]));
    if (![0x09, 0x0a, 0x0d].includes(byte)) expectInvalid(new Uint8Array([byte]));
  }
});

test('JSON number syntax preserves lexemes independently of numeric admission', () => {
  const cases = ['0', '-0', '0.0', '-0.0', '1', '1.0', '1e0', '10e-1', '-12.50e+2',
    '1E-2', '1e-400', '1.0000000000000001', '9007199254740992', '-9007199254740992',
    '0e999999999999999999999999', '-0e999999999999999999999999',
    '1e999999999999999999999999', '1e-999999999999999999999999'];
  const boundaries = ['', ' ', '\t', '\r', '\n', '{', '}', '[', ']', ':', ',', '"x"'];
  for (const lexeme of cases) {
    assert.deepEqual(readAll(lexeme).tokens, [token('number', 0, lexeme.length), token('end', lexeme.length, lexeme.length)]);
    for (const suffix of boundaries) {
      const { tokens } = readAll(lexeme + suffix);
      assert.deepEqual(tokens[0], token('number', 0, lexeme.length));
      assert.equal(tokens.some(current => current.kind === 'invalid'), false);
    }
  }
});

test('malformed numbers cannot become admitted numeric prefixes', () => {
  const cases = ['+1', '01', '-01', '00', '-00', '1.', '-.1', '.1', '-', '--1',
    '1e', '1e+', '1e-', '1.e1', '1e+-1', '1e++1', '1e--1', '1..0', '1.0.0',
    '0x10', '0b1', '1_0', '1n', '1a', '1true', '1+2', '1-2'];
  for (const source of cases) {
    expectInvalid(source);
    expectInvalid(source + ',');
    expectInvalid(source + ']');
  }
});

test('keywords require exact spelling and lexical boundaries', () => {
  for (const kind of ['true', 'false', 'null']) {
    for (const suffix of ['', ' ', '\t', '\r', '\n', '{', '}', '[', ']', ':', ',', '"x"']) {
      const { tokens } = readAll(kind + suffix);
      assert.deepEqual(tokens[0], token(kind, 0, kind.length));
      assert.equal(tokens.some(current => current.kind === 'invalid'), false);
    }
    for (let length = 1; length < kind.length; length += 1) expectInvalid(kind.slice(0, length));
  }
  for (const source of ['True', 'FALSE', 'Null', 'undefined', 'NaN', 'Infinity', '-Infinity',
    'truex', 'truefalse', 'null0', 'false_', 'x', '/', '// comment', '/* comment */', "'key'", '@']) {
    expectInvalid(source);
  }
});

test('document structure, duplicate punctuation and multiple values belong to admission', () => {
  const cases = [
    ['{', ['object-start', 'end']], ['}', ['object-end', 'end']],
    ['[', ['array-start', 'end']], [']', ['array-end', 'end']],
    ['{]', ['object-start', 'array-end', 'end']],
    ['{"a" "b"}', ['object-start', 'string', 'string', 'object-end', 'end']],
    ['[1,]', ['array-start', 'number', 'comma', 'array-end', 'end']],
    ['true false', ['true', 'false', 'end']],
    ['{}[]', ['object-start', 'object-end', 'array-start', 'array-end', 'end']],
    ['1:2', ['number', 'colon', 'number', 'end']],
    ['"a""b"', ['string', 'string', 'end']], [',,', ['comma', 'comma', 'end']],
  ];
  for (const [source, expected] of cases) assert.deepEqual(readAll(source).tokens.map(current => current.kind), expected);
});

test('interleaved cursors, retained tokens and failed cursors have independent state', () => {
  const scanner = createOwnedRawScanner({});
  const firstBytes = encode(String.raw`["\u0061","é"]`);
  const first = scanner.open(firstBytes);
  const second = scanner.open(encode('{"x":-0e2}'));
  const failed = scanner.open(encode(String.raw`"bad\q"`));
  const restart = scanner.open(firstBytes);
  assert.deepEqual(first.next(), token('array-start', 0, 1));
  assert.deepEqual(second.next(), token('object-start', 0, 1));
  const firstKey = first.next();
  const secondKey = second.next();
  assert.deepEqual(firstKey, stringToken(1, 9, 1));
  assert.deepEqual(secondKey, stringToken(1, 4, 1));
  assert.equal(failed.next().kind, 'invalid');
  assert.deepEqual(restart.next(), token('array-start', 0, 1));
  assert.deepEqual(first.next(), token('comma', 9, 10));
  assert.deepEqual(second.next(), token('colon', 4, 5));
  const secondString = first.next();
  assert.deepEqual(secondString, stringToken(10, 14, 2));
  assert.deepEqual(second.next(), token('number', 5, 9));
  assert.equal(first.decodeString(firstKey), 'a');
  assert.equal(second.decodeString(secondKey), 'x');
  assert.deepEqual(failed.next(), token('end', 7, 7));
  assert.deepEqual(first.next(), token('array-end', 14, 15));
  assert.deepEqual(second.next(), token('object-end', 9, 10));
  assert.deepEqual(first.next(), token('end', 15, 15));
  assert.deepEqual(second.next(), token('end', 10, 10));
  assert.equal(first.decodeString(secondString), 'é');
  assert.deepEqual(restart.next(), firstKey);
});

test('concurrent consumers can yield between synchronous cursor operations', async () => {
  const scanner = createOwnedRawScanner({});
  const cursors = Array.from({ length: 16 }, (_, index) => ({
    index, cursor: scanner.open(encode(`["key-${index}",${index}]`)),
  }));
  await Promise.all(cursors.map(async ({ index, cursor }) => {
    assert.equal(cursor.next().kind, 'array-start');
    const key = cursor.next();
    await Promise.resolve();
    assert.equal(cursor.next().kind, 'comma');
    assert.equal(cursor.next().kind, 'number');
    await Promise.resolve();
    assert.equal(cursor.decodeString(key), `key-${index}`);
    assert.equal(cursor.next().kind, 'array-end');
    assert.equal(cursor.next().kind, 'end');
  }));
});

test('lazy manual decoding does not consult replaced JSON or decoder entry points', () => {
  const source = encode(String.raw`"a\uD83D\uDE00\/é"`);
  const scanner = createOwnedRawScanner({});
  const originalFromCharCode = String.fromCharCode;
  const originalFromCodePoint = String.fromCodePoint;
  const originalParse = JSON.parse;
  const originalDecoder = globalThis.TextDecoder;
  const poison = () => { throw new Error('unexpected ambient decoder call'); };
  let current;
  let decoded;
  try {
    String.fromCharCode = poison;
    String.fromCodePoint = poison;
    JSON.parse = poison;
    globalThis.TextDecoder = poison;
    const cursor = scanner.open(source);
    current = cursor.next();
    cursor.next();
    decoded = cursor.decodeString(current);
  } finally {
    String.fromCharCode = originalFromCharCode;
    String.fromCodePoint = originalFromCodePoint;
    JSON.parse = originalParse;
    globalThis.TextDecoder = originalDecoder;
  }
  assert.deepEqual(current, stringToken(0, 19, 8));
  assert.equal(decoded, 'a\u{1f600}/é');
});

test('large strings, exponents and nesting remain iterative without scanner resource decisions', () => {
  const count = 70_000;
  expectString('"' + 'a'.repeat(count) + String.raw`\uD83D\uDE00\uD800"`,
    'a'.repeat(count) + '\u{1f600}\ud800', count + 7, false);
  expectString('"' + 'a'.repeat(4095) + String.raw`\uD83D\uDE00z"`,
    'a'.repeat(4095) + '\u{1f600}z', 4100);
  const number = '1e' + '9'.repeat(count);
  assert.deepEqual(readAll(number).tokens, [token('number', 0, count + 2), token('end', count + 2, count + 2)]);
  const depth = 12_000;
  const cursor = createOwnedRawScanner({}).open(encode('['.repeat(depth) + ']'.repeat(depth)));
  for (let index = 0; index < depth; index += 1) assert.deepEqual(cursor.next(), token('array-start', index, index + 1));
  for (let index = depth; index < depth * 2; index += 1) assert.deepEqual(cursor.next(), token('array-end', index, index + 1));
  assert.deepEqual(cursor.next(), token('end', depth * 2, depth * 2));
});
