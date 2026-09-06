// Private preacceptance fixtures. Complete compiler expectations, no Core execution.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const rawDocumentSource = 'bff32ad228721812c61d54bb8f888d7ad782b5e0';
const root = new URL('../../../', import.meta.url);
const prefix = 'od005.raw-document.v1/';
const pins = {
  'architecture/qualification/v1/normalization-vectors.json': '64f97efa285f05924305f3b32d6b55f9fc5924950db55c2ed3938bbd11c81b99',
  'architecture/qualification/v1/decoder-vectors.json': '94d981c9193bd14cd61f5fbe3d7539dd7631f350cf7c3e36b57f731c674f3b1c',
};
function readPinned(path) {
  const bytes = readFileSync(new URL(path, root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), pins[path], path);
  return JSON.parse(bytes.toString('utf8'));
}
const normalization = readPinned('architecture/qualification/v1/normalization-vectors.json').cases[0];
const decoder = readPinned('architecture/qualification/v1/decoder-vectors.json').cases;
const field = value => ({ kind: 'field', value });
const index = value => ({ kind: 'index', value });
const declarationPath = ordinal => [field('declarations'), index(ordinal)];
const profilePath = () => [field('profile')];
const diagnostic = (code, phase, path, details, coordinate = {}) => ({ code, phase, path, coordinate, details });
const failure = (...diagnostics) => ({ ok: false, diagnostics });
const success = () => ({ ok: true, plan: structuredClone(normalization.expectedPlan), digest: normalization.digest });
const utf8 = source => ({ kind: 'utf8', source });
const world = () => structuredClone({ declarations: normalization.declarations, profile: normalization.equivalentProfiles[0] });
const encode = input => ({ declarations: input.declarations.map(value => utf8(JSON.stringify(value))), profile: utf8(JSON.stringify(input.profile)) });
const baseline = () => encode(world());
const invalidJson = path => diagnostic('decode.invalid-json', 'decode', path, { reason: 'invalid-json' });
const carrier = (path, reason) => diagnostic('input.invalid-byte-carrier', 'decode', path, { reason });
const invalidValue = (path, reason) => diagnostic('schema.invalid-value', 'schema', path, { reason });
const unsupported = path => diagnostic('schema.unsupported-version', 'schema', path, { reason: 'unsupported-version' });
function row(suffix, inputRecipe, expected, schemaValidCompanion = world()) {
  return { caseId: prefix + suffix, entryPoint: 'compileCompositionJsonV1', proposedOnly: true,
    inputRecipe, schemaValidCompanion, expected };
}
function replaceOne(source, before, after) {
  assert.equal(source.split(before).length, 2, 'one fixed numeric field occurrence');
  return source.replace(before, () => after);
}

// Independently transcribed ADR-0018 projections. These are not schema verdicts.
// The first component remains text until it has become UTF-8 document bytes.
const numbers = [
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
];
const lanes = ['declaration-version', 'profile-version', 'many-min'];
const numericSuffix = (ordinal, lane) => `number/${String(ordinal).padStart(2, '0')}/${lane}`;
export const rawNumberCoverage = numbers.map(([lexeme], ordinal) => ({
  lexeme,
  reference: `architecture/qualification/implementation-clarifications/cases.json#/rawNumberCases/${ordinal}`,
  caseIds: lanes.map(lane => prefix + numericSuffix(ordinal, lane)),
}));

// Reuse the settled count/wrapper inventory rather than duplicate its recipes.
export const retainedRawCoverage = {
  invocationCases: ['declarations-at', 'declarations-plus-one', 'declarations-overflow-mixed', 'accessor-profile', 'late-missing-index', 'late-accessor-index', 'own-undefined-profile', 'own-undefined-index'],
  generationTwoSnapshots: ['g2-early-declarations-limit', 'g2-wrapper-declarations', 'g2-wrapper-profile'],
  acceptedCases: ['diag.raw.multi-document-independent.v1', 'diag.raw.hostile-profile-key.v1', 'diag.raw.prefix-inclusive-clipping.v1'],
};
const decoderRecipes = [
  ['utf8-bom', 'decode.invalid-json', 'invalid-json', []],
  ['invalid-utf8-unexpected-continuation', 'decode.invalid-json', 'invalid-json', []],
  ['incomplete-document', 'decode.invalid-json', 'invalid-json', []],
  ['leading-zero-number', 'decode.invalid-json', 'invalid-json', []],
  ['trailing-decimal-point', 'decode.invalid-json', 'invalid-json', []],
  ['duplicate-object-key', 'decode.duplicate-key', 'duplicate-key', [field('moduleId')]],
  ['lone-surrogate-escape', 'schema.invalid-value', 'invalid-format', [field('owner'), field('path'), index(0)]],
  ['negative-zero', 'schema.invalid-value', 'invalid-format', [field('slots'), index(0), field('cardinality'), field('min')]],
  ['prototype-property-is-data-before-schema-validation', 'schema.unknown-field', 'unknown-field', []],
];
function filler(ordinal) {
  return { kind: 'get-modular.module-declaration', schemaVersion: 1,
    moduleId: `example/filler-${ordinal}`, implementationId: `example/filler-${ordinal}/default`,
    owner: { authority: 'example', path: ['filler'] }, provides: [], slots: [] };
}

export function* rawDocumentCases() {
  yield row('baseline', baseline(), success());
  for (const [ordinal, [lexeme, projection]] of numbers.entries()) for (const lane of lanes) {
    const input = baseline();
    const document = lane === 'profile-version' ? input.profile : input.declarations[0];
    const local = lane === 'many-min' ? [field('slots'), index(1), field('cardinality'), field('min')] : [field('schemaVersion')];
    const path = [...(lane === 'profile-version' ? profilePath() : declarationPath(0)), ...local];
    const key = lane === 'many-min' ? 'min' : 'schemaVersion';
    document.source = replaceOne(document.source, `"${key}":${lane === 'many-min' ? 2 : 1}`, `"${key}":${lexeme}`);
    const admitted = typeof projection === 'number';
    const schemaValid = admitted && (lane === 'many-min' ? projection >= 0 && projection <= 2 : projection === 1);
    const expected = schemaValid ? success() : failure(!admitted ? invalidValue(path, projection)
      : lane === 'many-min' ? invalidValue(path, 'invalid-format') : unsupported(path));
    yield row(numericSuffix(ordinal, lane), input, expected);
  }
  for (const [name, before, after, local] of [
    ['min-inverted', '"min":2', '"min":3', ['slots', 1, 'cardinality']],
    ['max-zero', '"max":2', '"max":0', ['slots', 1, 'cardinality', 'max']],
    ['min-exact-two', '"min":2', '"min":2.0', null],
  ]) {
    const input = baseline();
    input.declarations[0].source = replaceOne(input.declarations[0].source, before, after);
    const path = local && [...declarationPath(0), ...local.map(value => typeof value === 'number' ? index(value) : field(value))];
    yield row(`cardinality/${name}`, input, path ? failure(invalidValue(path, 'invalid-format')) : success());
  }
  for (const side of ['declaration', 'profile']) {
    const path = side === 'profile' ? profilePath() : declarationPath(0);
    for (const [name, lexeme] of [['leading-zero-number', '01'], ['trailing-decimal-point', '1.']]) {
      const input = baseline();
      const document = side === 'profile' ? input.profile : input.declarations[0];
      document.source = replaceOne(document.source, '"schemaVersion":1', `"schemaVersion":${lexeme}`);
      yield row(`syntax/${side}/${name}`, input, failure(invalidJson(path)));
    }
    const unknown = baseline();
    const unknownDocument = side === 'profile' ? unknown.profile : unknown.declarations[0];
    unknownDocument.source = unknownDocument.source.slice(0, -1) + ',"password=DO-NOT-EMIT":1.0}';
    yield row(`unknown-key/${side}`, unknown, failure(diagnostic('schema.unknown-field', 'schema', path, { reason: 'unknown-field' })));
    const version = baseline();
    const versionDocument = side === 'profile' ? version.profile : version.declarations[0];
    versionDocument.source = replaceOne(versionDocument.source, '"schemaVersion":1', '"schemaVersion":2');
    const kind = side === 'profile' ? 'get-modular.composition-profile' : 'get-modular.module-declaration';
    versionDocument.source = replaceOne(versionDocument.source, JSON.stringify(kind), 'false');
    versionDocument.source = versionDocument.source.slice(0, -1) + ',"password=DO-NOT-EMIT":true}';
    yield row(`unsupported-version/${side}`, version, failure(unsupported([...path, field('schemaVersion')])));
  }
  for (const [name, code, reason, local] of decoderRecipes) {
    const vector = decoder.find(value => value.name === name);
    assert.ok(vector, name);
    const input = baseline();
    input.declarations.unshift({ kind: vector.sourceEncoding === 'hex-bytes' ? 'hex' : 'utf8', source: vector.source });
    const companion = world();
    if (vector.repairedSource) companion.declarations.unshift(JSON.parse(vector.repairedSource));
    yield row(`decoder/${name}`, input, failure(diagnostic(code, code.startsWith('decode.') ? 'decode' : 'schema',
      [...declarationPath(0), ...local], { reason })), companion);
  }
  for (const [kind, reason] of [['not-uint8array', 'not-uint8array'], ['detached', 'unusable-view'], ['shared', 'shared-storage']]) {
    const first = baseline(); first.declarations.unshift({ kind }); first.profile = utf8('{');
    yield row(`mixed/${reason}/declaration-carrier-profile-json`, first,
      failure(carrier(declarationPath(0), reason), invalidJson(profilePath())));
    const second = baseline(); second.declarations.unshift(utf8('{')); second.profile = { kind };
    yield row(`mixed/${reason}/declaration-json-profile-carrier`, second,
      failure(carrier(profilePath(), reason), invalidJson(declarationPath(0))));
    const third = baseline(); third.declarations.unshift({ kind });
    yield row(`mixed/${reason}/declaration-carrier-valid-profile`, third, failure(carrier(declarationPath(0), reason)));
    const fourth = baseline(); fourth.profile = { kind };
    yield row(`mixed/${reason}/valid-declarations-profile-carrier`, fourth, failure(carrier(profilePath(), reason)));
  }
  const mixed = baseline();
  const documents = Array.from({ length: 11 }, (_, ordinal) => utf8(JSON.stringify(filler(ordinal))));
  documents[0] = utf8('{"schemaVersion":2}');
  documents[1] = utf8('{"kind":1,"kind":2}');
  documents[2] = utf8('{'); documents[10] = utf8('{'); documents[4] = { kind: 'not-uint8array' };
  documents[3].source = replaceOne(documents[3].source, '"schemaVersion":1', '"schemaVersion":1.0000000000000001');
  mixed.declarations.unshift(...documents);
  const duplicateRoot = world().profile; duplicateRoot.roots.push('example/app');
  mixed.profile = utf8(JSON.stringify(duplicateRoot));
  yield row('mixed/ordering-and-independent-profile', mixed, failure(
    carrier(declarationPath(4), 'not-uint8array'), invalidJson(declarationPath(2)), invalidJson(declarationPath(10)),
    diagnostic('decode.duplicate-key', 'decode', [...declarationPath(1), field('kind')], { reason: 'duplicate-key' }),
    unsupported([...declarationPath(0), field('schemaVersion')]),
    invalidValue([...declarationPath(3), field('schemaVersion')], 'invalid-type'),
    diagnostic('profile.duplicate-root', 'profile', [], { reason: 'duplicate' }, { moduleId: 'example/app' })));
  for (const depth of [33, 64]) {
    const input = baseline(); input.declarations.unshift(utf8('['.repeat(depth) + '0' + ']'.repeat(depth)));
    yield row(`depth/${depth}`, input, failure(diagnostic('input.limit-exceeded', 'decode',
      [...declarationPath(0), ...Array.from({ length: 30 }, () => index(0))], { limitName: 'jsonDepth', limit: 32, actual: 33 })));
  }
  for (const count of [256, 257, 258]) for (const order of ['ascending', 'reverse', 'stride-31']) {
    const input = baseline();
    const size = count - 1;
    const ordinals = Array.from({ length: size }, (_, i) => order === 'ascending' ? i
      : order === 'reverse' ? size - 1 - i : (size - 1 + i * 31) % size);
    const faults = ordinals.map(value => utf8(value === 0 ? '{"schemaVersion":2}' : '{'));
    input.declarations.unshift(...faults); input.profile = { kind: 'not-uint8array' };
    const candidates = [carrier(profilePath(), 'not-uint8array'),
      ...ordinals.flatMap((value, ordinal) => value === 0 ? [] : [invalidJson(declarationPath(ordinal))]),
      unsupported([...declarationPath(ordinals.indexOf(0)), field('schemaVersion')])];
    const diagnostics = count === 256 ? candidates : [...candidates.slice(0, 255),
      diagnostic('diagnostics.truncated', 'output', [], { omitted: count - 255 })];
    yield row(`collector/${count}/${order}`, input, failure(...diagnostics));
  }
}

// Closed recipe materialization only. Detached/shared bytes intentionally contain
// malformed JSON; carrier rejection cannot license a decoder derivative.
export function materializeRawDocumentInput(caseId) {
  const fixture = [...rawDocumentCases()].find(value => value.caseId === caseId);
  assert.ok(fixture, 'unknown raw-document case ID');
  function document(recipe) {
    switch (recipe.kind) {
      case 'utf8': return new TextEncoder().encode(recipe.source);
      case 'hex': return new Uint8Array(Buffer.from(recipe.source, 'hex'));
      case 'not-uint8array': return '{';
      case 'detached': {
        const view = new Uint8Array([123]);
        structuredClone(view.buffer, { transfer: [view.buffer] });
        return view;
      }
      case 'shared': {
        const view = new Uint8Array(new SharedArrayBuffer(1)); view[0] = 123; return view;
      }
      default: throw new Error('unknown closed document recipe');
    }
  }
  return { declarations: fixture.inputRecipe.declarations.map(document), profile: document(fixture.inputRecipe.profile) };
}
