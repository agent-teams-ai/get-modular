import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { arch, release, type, version } from 'node:os';
import test from 'node:test';
import { createDiagnosticComparator, createSchemaValidators } from '../../../architecture/checks/v1-qualification.mjs';
import { projectRawNumber } from '../../../architecture/checks/implementation-clarifications.mjs';
import { buildGenerationTwo } from './generation-two-artifacts.mjs';
import { materializeRawDocumentInput, rawDocumentCases, rawDocumentSource, rawNumberCoverage, retainedRawCoverage } from './raw-document-cases.mjs';

const root = new URL('../../../', import.meta.url);
const prefix = 'od005.raw-document.v1/';
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const dependencies = {};
function pinned(path, expected) {
  const bytes = readFileSync(new URL(path, root));
  assert.equal(hash(bytes), `sha256:${expected}`, path);
  dependencies[path] = hash(bytes);
  return JSON.parse(bytes.toString('utf8'));
}
const normalization = pinned('architecture/qualification/v1/normalization-vectors.json', '64f97efa285f05924305f3b32d6b55f9fc5924950db55c2ed3938bbd11c81b99').cases[0];
const clarification = pinned('architecture/qualification/implementation-clarifications/cases.json', 'dde24d56296754825a3afa084261518177e296516d04cb59e06f996417cd2fe7');
const decoder = pinned('architecture/qualification/v1/decoder-vectors.json', '94d981c9193bd14cd61f5fbe3d7539dd7631f350cf7c3e36b57f731c674f3b1c').cases;
const manifest = pinned('architecture/qualification/v1/qualification-case-manifest.json', '25896f00963d6e206aa754b094ef4fa7946ef7acfd108eded6de6b9480ec423b');
const scope = 'independent-fixture-consistency-no-production-subject';
const clone = value => structuredClone(value);
const base = () => clone({ declarations: normalization.declarations, profile: normalization.equivalentProfiles[0] });
const pack = input => ({ declarations: input.declarations.map(value => ({ kind: 'utf8', source: JSON.stringify(value) })),
  profile: { kind: 'utf8', source: JSON.stringify(input.profile) } });
const good = () => ({ ok: true, plan: clone(normalization.expectedPlan), digest: normalization.digest });
const bad = diagnostics => ({ ok: false, diagnostics });
const path = values => values.map(value => ({ kind: typeof value === 'number' ? 'index' : 'field', value }));
function record(code, phase, tokens, details, coordinate = {}) {
  return { code, phase, path: path(tokens), coordinate, details };
}
const jsonError = tokens => record('decode.invalid-json', 'decode', tokens, { reason: 'invalid-json' });
const byteError = (tokens, reason) => record('input.invalid-byte-carrier', 'decode', tokens, { reason });
const versionError = tokens => record('schema.unsupported-version', 'schema', tokens, { reason: 'unsupported-version' });
const valueError = (tokens, reason) => record('schema.invalid-value', 'schema', tokens, { reason });
function expectedRow(suffix, inputRecipe, expected, schemaValidCompanion = base()) {
  return { caseId: prefix + suffix, entryPoint: 'compileCompositionJsonV1', proposedOnly: true,
    inputRecipe, schemaValidCompanion, expected };
}
function numericRecipe(lexeme, lane) {
  const input = base();
  if (lane === 'profile-version') input.profile.schemaVersion = '$raw-number$';
  else if (lane === 'declaration-version') input.declarations[0].schemaVersion = '$raw-number$';
  else input.declarations[0].slots[1].cardinality.min = '$raw-number$';
  const recipe = pack(input);
  const document = lane === 'profile-version' ? recipe.profile : recipe.declarations[0];
  document.source = document.source.replace('"$raw-number$"', () => lexeme);
  return recipe;
}

// Independent closed reference expansion: accepted inputs/projections and literal
// document expectations. Neither the candidate builder nor Core supplies results.
function referenceRows() {
  const rows = [expectedRow('baseline', pack(base()), good())];
  for (const [ordinal, number] of clarification.rawNumberCases.entries()) {
    for (const lane of ['declaration-version', 'profile-version', 'many-min']) {
      const projection = number.expected;
      const tokens = lane === 'profile-version' ? ['profile', 'schemaVersion'] : lane === 'declaration-version'
        ? ['declarations', 0, 'schemaVersion'] : ['declarations', 0, 'slots', 1, 'cardinality', 'min'];
      const fieldValid = projection.admitted && (lane === 'many-min' ? [0, 1].includes(projection.value) : projection.value === 1);
      const expected = fieldValid ? good() : bad([!projection.admitted ? valueError(tokens, projection.reason)
        : lane === 'many-min' ? valueError(tokens, 'invalid-format') : versionError(tokens)]);
      rows.push(expectedRow(`number/${String(ordinal).padStart(2, '0')}/${lane}`, numericRecipe(number.lexeme, lane), expected));
    }
  }
  for (const name of ['min-inverted', 'max-zero', 'min-exact-two']) {
    const input = base();
    const cardinality = input.declarations[0].slots[1].cardinality;
    if (name === 'max-zero') cardinality.max = 0;
    else cardinality.min = name === 'min-inverted' ? 3 : '$two$';
    const recipe = pack(input);
    recipe.declarations[0].source = recipe.declarations[0].source.replace('"$two$"', '2.0');
    const tokens = ['declarations', 0, 'slots', 1, 'cardinality'];
    if (name === 'max-zero') tokens.push('max');
    rows.push(expectedRow(`cardinality/${name}`, recipe,
      name === 'min-exact-two' ? good() : bad([valueError(tokens, 'invalid-format')])));
  }
  for (const side of ['declaration', 'profile']) {
    const tokens = side === 'profile' ? ['profile'] : ['declarations', 0];
    for (const [name, lexeme] of [['leading-zero-number', '01'], ['trailing-decimal-point', '1.']]) {
      rows.push(expectedRow(`syntax/${side}/${name}`, numericRecipe(lexeme, `${side}-version`), bad([jsonError(tokens)])));
    }
    const unknown = base();
    const unknownDocument = side === 'profile' ? unknown.profile : unknown.declarations[0];
    unknownDocument['password=DO-NOT-EMIT'] = '$one$';
    const recipe = pack(unknown);
    const raw = side === 'profile' ? recipe.profile : recipe.declarations[0];
    raw.source = raw.source.replace('"$one$"', '1.0');
    rows.push(expectedRow(`unknown-key/${side}`, recipe,
      bad([record('schema.unknown-field', 'schema', tokens, { reason: 'unknown-field' })])));
    const unsupported = base();
    const unsupportedDocument = side === 'profile' ? unsupported.profile : unsupported.declarations[0];
    unsupportedDocument.schemaVersion = 2; unsupportedDocument.kind = false;
    unsupportedDocument['password=DO-NOT-EMIT'] = true;
    rows.push(expectedRow(`unsupported-version/${side}`, pack(unsupported), bad([versionError([...tokens, 'schemaVersion'])])));
  }
  const decoderNames = ['utf8-bom', 'invalid-utf8-unexpected-continuation', 'incomplete-document',
    'leading-zero-number', 'trailing-decimal-point', 'duplicate-object-key', 'lone-surrogate-escape',
    'negative-zero', 'prototype-property-is-data-before-schema-validation'];
  for (const name of decoderNames) {
    const vector = decoder.find(value => value.name === name);
    const recipe = pack(base());
    recipe.declarations.unshift({ kind: vector.sourceEncoding === 'hex-bytes' ? 'hex' : 'utf8', source: vector.source });
    let expected = jsonError(['declarations', 0]);
    if (name === 'duplicate-object-key') expected = record('decode.duplicate-key', 'decode', ['declarations', 0, 'moduleId'], { reason: 'duplicate-key' });
    if (name === 'lone-surrogate-escape') expected = valueError(['declarations', 0, 'owner', 'path', 0], 'invalid-format');
    if (name === 'negative-zero') expected = valueError(['declarations', 0, 'slots', 0, 'cardinality', 'min'], 'invalid-format');
    if (name === 'prototype-property-is-data-before-schema-validation') expected = record('schema.unknown-field', 'schema', ['declarations', 0], { reason: 'unknown-field' });
    const companion = base();
    if (vector.repairedSource) companion.declarations.unshift(JSON.parse(vector.repairedSource));
    rows.push(expectedRow(`decoder/${name}`, recipe, bad([expected]), companion));
  }
  for (const reason of ['not-uint8array', 'unusable-view', 'shared-storage']) {
    const kind = { 'not-uint8array': 'not-uint8array', 'unusable-view': 'detached', 'shared-storage': 'shared' }[reason];
    const modes = ['declaration-carrier-profile-json', 'declaration-json-profile-carrier',
      'declaration-carrier-valid-profile', 'valid-declarations-profile-carrier'];
    for (const mode of modes) {
      const recipe = pack(base());
      const declarationRejected = mode.startsWith('declaration-carrier');
      if (declarationRejected) recipe.declarations = [{ kind }, ...recipe.declarations];
      else recipe.profile = { kind };
      const diagnostics = [byteError(declarationRejected ? ['declarations', 0] : ['profile'], reason)];
      if (mode === modes[0]) { recipe.profile = { kind: 'utf8', source: '{' }; diagnostics.push(jsonError(['profile'])); }
      if (mode === modes[1]) { recipe.declarations.unshift({ kind: 'utf8', source: '{' }); diagnostics.push(jsonError(['declarations', 0])); }
      rows.push(expectedRow(`mixed/${reason}/${mode}`, recipe, bad(diagnostics)));
    }
  }
  const mixed = pack(base());
  const faults = [];
  for (let i = 0; i < 11; i += 1) {
    const declaration = { kind: 'get-modular.module-declaration', schemaVersion: 1,
      moduleId: `example/filler-${i}`, implementationId: `example/filler-${i}/default`,
      owner: { authority: 'example', path: ['filler'] }, provides: [], slots: [] };
    if (i === 3) declaration.schemaVersion = '$rounded$';
    faults.push({ kind: 'utf8', source: JSON.stringify(declaration).replace('"$rounded$"', '1.0000000000000001') });
  }
  faults[0] = { kind: 'utf8', source: '{"schemaVersion":2}' };
  faults[1] = { kind: 'utf8', source: '{"kind":1,"kind":2}' };
  faults[2] = { kind: 'utf8', source: '{' }; faults[10] = { kind: 'utf8', source: '{' };
  faults[4] = { kind: 'not-uint8array' }; mixed.declarations = [...faults, ...mixed.declarations];
  const duplicateRoot = base(); duplicateRoot.profile.roots.push('example/app'); mixed.profile = pack(duplicateRoot).profile;
  rows.push(expectedRow('mixed/ordering-and-independent-profile', mixed, bad([
    byteError(['declarations', 4], 'not-uint8array'), jsonError(['declarations', 2]), jsonError(['declarations', 10]),
    record('decode.duplicate-key', 'decode', ['declarations', 1, 'kind'], { reason: 'duplicate-key' }),
    versionError(['declarations', 0, 'schemaVersion']), valueError(['declarations', 3, 'schemaVersion'], 'invalid-type'),
    record('profile.duplicate-root', 'profile', [], { reason: 'duplicate' }, { moduleId: 'example/app' }),
  ])));
  for (const depth of [33, 64]) {
    const recipe = pack(base());
    recipe.declarations.unshift({ kind: 'utf8', source: Array(depth).fill('[').join('') + '0' + Array(depth).fill(']').join('') });
    rows.push(expectedRow(`depth/${depth}`, recipe, bad([record('input.limit-exceeded', 'decode',
      ['declarations', ...Array(31).fill(0)], { limitName: 'jsonDepth', limit: 32, actual: 33 })])));
  }
  for (const count of [256, 257, 258]) for (const order of ['ascending', 'reverse', 'stride-31']) {
    const ids = Array.from({ length: count - 1 }, (_, i) => i);
    const ordered = order === 'ascending' ? ids : order === 'reverse' ? [...ids].reverse()
      : ids.map(i => (count - 2 + 31 * i) % (count - 1));
    assert.equal(new Set(ordered).size, count - 1);
    const recipe = pack(base());
    recipe.declarations = [...ordered.map(i => ({ kind: 'utf8', source: i ? '{' : '{"schemaVersion":2}' })), ...recipe.declarations];
    recipe.profile = { kind: 'not-uint8array' };
    const decoderPositions = ids.filter(position => ordered[position] !== 0);
    const ordinary = [byteError(['profile'], 'not-uint8array'),
      ...decoderPositions.map(position => jsonError(['declarations', position])),
      versionError(['declarations', ordered.indexOf(0), 'schemaVersion'])];
    const diagnostics = count === 256 ? ordinary : ordinary.filter((_, i) => i < 255);
    if (count !== 256) diagnostics.push(record('diagnostics.truncated', 'output', [], { omitted: count === 257 ? 2 : 3 }));
    rows.push(expectedRow(`collector/${count}/${order}`, recipe, bad(diagnostics)));
  }
  return rows;
}

const lines = rows => Buffer.from(rows.map(value => JSON.stringify(value)).join('\n') + '\n', 'utf8');
function recipeObservation(recipe) {
  if (recipe.kind === 'utf8' || recipe.kind === 'hex') return { kind: 'bytes', hex: Buffer.from(recipe.source, recipe.kind === 'hex' ? 'hex' : 'utf8').toString('hex') };
  if (recipe.kind === 'shared') return { kind: 'shared', hex: '7b' };
  if (recipe.kind === 'detached') return { kind: 'detached' };
  assert.equal(recipe.kind, 'not-uint8array'); return { kind: 'not-uint8array', value: '{' };
}
function materializedObservation(value) {
  if (typeof value === 'string') { assert.equal(value, '{'); return { kind: 'not-uint8array', value }; }
  assert.equal(Object.getPrototypeOf(value), Uint8Array.prototype);
  if (value.buffer instanceof SharedArrayBuffer) return { kind: 'shared', hex: Buffer.from(value).toString('hex') };
  if (value.buffer.detached) {
    assert.throws(() => Uint8Array.prototype.at.call(value, 0), TypeError);
    return { kind: 'detached' };
  }
  return { kind: 'bytes', hex: Buffer.from(value).toString('hex') };
}
function inputObservation(input, describe) {
  return { declarations: input.declarations.map(describe), profile: describe(input.profile) };
}
function projections(project) {
  for (const row of clarification.rawNumberCases) assert.deepEqual(project(row.lexeme), row.expected, row.lexeme);
}

// This test intentionally does not import or call compileCompositionJson.
// Its observations concern fixture construction and checker sensitivity only.
test('closed raw-document recipes, independent results, bytes and fixture mutants', t => {
  assert.equal(rawDocumentSource, 'bff32ad228721812c61d54bb8f888d7ad782b5e0');
  assert.equal(clarification.rawNumberCases.length, 26);
  assert.equal(clarification.rawNumberScope, 'numeric-admission-projection-before-field-schema-validation');
  projections(projectRawNumber);
  const expected = referenceRows();
  const actual = [...rawDocumentCases()];
  assert.equal(expected.length, 123);
  assert.equal(new Set(expected.map(row => row.caseId)).size, 123);
  const verify = rows => {
    assert.deepEqual(rows, expected, 'closed inventory, order, complete recipes, companions and results');
    assert.deepEqual(lines(rows), lines(expected), 'independently specified deterministic recipe stream');
  };
  verify(actual);
  assert.deepEqual(rawNumberCoverage, clarification.rawNumberCases.map((row, ordinal) => ({
    lexeme: row.lexeme,
    reference: `architecture/qualification/implementation-clarifications/cases.json#/rawNumberCases/${ordinal}`,
    caseIds: ['declaration-version', 'profile-version', 'many-min'].map(lane => `${prefix}number/${String(ordinal).padStart(2, '0')}/${lane}`),
  })));
  const candidate = buildGenerationTwo();
  const validators = createSchemaValidators(candidate.schema);
  const compare = createDiagnosticComparator({ contract: candidate.contract, catalog: candidate.catalog });
  assert.equal(candidate.contract.prerequisiteCatalog.factModel.facts.length, 20);
  assert.equal(candidate.catalog.ordering.codes.length, 33);
  assert.deepEqual(retainedRawCoverage, {
    invocationCases: ['declarations-at', 'declarations-plus-one', 'declarations-overflow-mixed', 'accessor-profile', 'late-missing-index', 'late-accessor-index', 'own-undefined-profile', 'own-undefined-index'],
    generationTwoSnapshots: ['g2-early-declarations-limit', 'g2-wrapper-declarations', 'g2-wrapper-profile'],
    acceptedCases: ['diag.raw.multi-document-independent.v1', 'diag.raw.hostile-profile-key.v1', 'diag.raw.prefix-inclusive-clipping.v1'],
  });
  const invocationPath = 'tests/qualification/m2-candidate/raw-invocation-oracle.test.mjs';
  const invocationBytes = readFileSync(new URL(invocationPath, root));
  const closedIds = /const CLOSED_IDS = Object.freeze\(\[([\s\S]*?)\]\);/.exec(invocationBytes.toString('utf8'));
  assert.ok(closedIds, 'closed invocation inventory');
  const invocationIds = [...closedIds[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  for (const id of retainedRawCoverage.invocationCases) assert.ok(invocationIds.includes(id), id);
  dependencies[invocationPath] = hash(invocationBytes);
  for (const name of retainedRawCoverage.generationTwoSnapshots) assert.ok(candidate.snapshots.snapshots.some(row => row.name === name));
  for (const caseId of retainedRawCoverage.acceptedCases) assert.ok(manifest.staticConformanceProtocol.cases.some(row => row.caseId === caseId));
  assert.deepEqual(JSON.parse(normalization.canonicalUtf8).plan, normalization.expectedPlan);
  assert.equal(`gm-plan:v1:sha-256:${hash(normalization.canonicalUtf8).slice(7)}`, normalization.digest);
  const materialized = [];
  const independentlyMaterialized = [];
  for (const [i, row] of actual.entries()) {
    for (const declaration of row.schemaValidCompanion.declarations) assert.equal(validators.validateModuleDeclaration(declaration), true, row.caseId);
    assert.equal(validators.validateCompositionProfile(row.schemaValidCompanion.profile), true, row.caseId);
    if (row.expected.ok) assert.deepEqual(row.expected, good());
    else {
      assert.deepEqual(Object.keys(row.expected), ['ok', 'diagnostics']);
      assert.deepEqual([...row.expected.diagnostics].sort(compare), row.expected.diagnostics, row.caseId);
      for (const diagnostic of row.expected.diagnostics) {
        assert.equal(validators.validateDiagnostic(diagnostic), true, row.caseId);
        const variant = candidate.contract.variants.find(value => value.code === diagnostic.code);
        assert.ok(variant?.phases.includes(diagnostic.phase));
        assert.deepEqual(Object.keys(diagnostic.coordinate).sort(), [...variant.coordinate.required].sort());
        assert.deepEqual(Object.keys(diagnostic.details).sort(), [...variant.details.required].sort());
        if (variant.details.reasonValues) assert.ok(variant.details.reasonValues.includes(diagnostic.details.reason));
      }
    }
    const input = materializeRawDocumentInput(row.caseId);
    const observation = inputObservation(input, materializedObservation);
    const reference = inputObservation(expected[i].inputRecipe, recipeObservation);
    assert.deepEqual(observation, reference, row.caseId);
    materialized.push([row.caseId, observation, row.expected]);
    independentlyMaterialized.push([expected[i].caseId, reference, expected[i].expected]);
    if (row.caseId.includes('/number/')) {
      const [, ordinal, lane] = row.caseId.slice(prefix.length).split('/');
      const projection = clarification.rawNumberCases[Number(ordinal)].expected;
      // JSON.parse is permitted here only after exact lexical admission has passed.
      if (projection.admitted) {
        const document = lane === 'profile-version' ? row.inputRecipe.profile : row.inputRecipe.declarations[0];
        const parsed = JSON.parse(document.source);
        const valid = lane === 'profile-version' ? validators.validateCompositionProfile(parsed) : validators.validateModuleDeclaration(parsed);
        assert.equal(valid, row.expected.ok, row.caseId);
      }
    }
    if (row.caseId.includes('/syntax/')) {
      const document = row.caseId.includes('/profile/') ? row.inputRecipe.profile : row.inputRecipe.declarations[0];
      assert.throws(() => JSON.parse(document.source), SyntaxError);
    }
    if (row.caseId.includes('/decoder/')) {
      const name = row.caseId.slice(row.caseId.indexOf('/decoder/') + 9);
      const retained = manifest.decoder.cases.find(value => value.name === name);
      assert.equal(hash(Buffer.from(reference.declarations[0].hex, 'hex')), retained.sourceBytesSha256);
    }
  }
  assert.deepEqual(lines(materialized), lines(independentlyMaterialized));
  assert.throws(() => materializeRawDocumentInput(prefix + 'unlisted'), { code: 'ERR_ASSERTION' });
  // The malformed companion is real bytes, not a boolean describing a failure.
  const mixedId = prefix + 'mixed/not-uint8array/declaration-carrier-profile-json';
  const mixed = actual.find(row => row.caseId === mixedId);
  assert.throws(() => JSON.parse(mixed.inputRecipe.profile.source), SyntaxError);
  const mutations = [];
  function reject(mutationId, implementation, check, payload) {
    assert.throws(check, { code: 'ERR_ASSERTION' }, mutationId);
    mutations.push({ mutationId, implementationSha256: hash(implementation.toString()),
      inputSha256: hash(payload), rejection: 'ERR_ASSERTION', scope });
  }
  const rounded = lexeme => {
    const value = Number(lexeme);
    if (!Number.isFinite(value) || Object.is(value, -0) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
      return { admitted: false, code: 'schema.invalid-value', reason: 'invalid-format' };
    return Number.isInteger(value) ? { admitted: true, value } : { admitted: false, code: 'schema.invalid-value', reason: 'invalid-type' };
  };
  reject('raw-document.number-rounding-before-admission', rounded, () => projections(rounded), lines(clarification.rawNumberCases));
  const fixtureMutants = [
    ['document-ordinal-loss', rows => {
      const target = rows.find(row => row.caseId.endsWith('/mixed/ordering-and-independent-profile'));
      for (const diagnostic of target.expected.diagnostics) if (diagnostic.path[0]?.value === 'declarations') diagnostic.path.splice(1, 1);
    }],
    ['carrier-to-decoder-derivative', rows => {
      const target = rows.find(row => row.caseId === prefix + 'mixed/not-uint8array/declaration-carrier-profile-json');
      target.expected.diagnostics.splice(1, 0, { code: 'decode.invalid-json', phase: 'decode',
        path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 0 }], coordinate: {}, details: { reason: 'invalid-json' } });
    }],
    ['independently-eligible-diagnostic-suppression', rows => {
      const target = rows.find(row => row.caseId.endsWith('/mixed/ordering-and-independent-profile'));
      target.expected.diagnostics = target.expected.diagnostics.filter(value => value.code !== 'profile.duplicate-root');
    }],
    ['wrong-top-k-omitted', rows => {
      const target = rows.find(row => row.caseId.endsWith('/collector/257/reverse'));
      target.expected.diagnostics.at(-1).details.omitted = 1;
    }],
  ];
  for (const [name, mutate] of fixtureMutants) {
    const changed = clone(actual); mutate(changed);
    reject(`raw-document.${name}`, mutate, () => verify(changed), lines(changed));
  }
  assert.equal(mutations.length, 5);
  assert.equal(hash(lines(actual)), 'sha256:b901496ffb1ad302a127abe2f8eceeae03eb7c9566871edc94d2720a6f6be410');
  assert.equal(hash(lines(materialized)), 'sha256:c0885c5615c3e81741094e88653426971c84c0445a308eb3869383ee71230e20');
  assert.equal(hash(lines(expected.map(row => [row.caseId, row.expected]))), 'sha256:db51eb9119a5936ca891b20f58d0bfbd746287b52c59fefb27ba28ffb173a580');

  for (const path of ['tests/qualification/m2-candidate/generation-two-artifacts.mjs',
    'architecture/checks/implementation-clarifications.mjs', 'architecture/checks/v1-qualification.mjs', 'pnpm-lock.yaml']) {
    dependencies[path] = hash(readFileSync(new URL(path, root)));
  }
  const sourcePath = 'tests/qualification/m2-candidate/raw-document-cases.mjs';
  const runnerPath = 'tests/qualification/m2-candidate/raw-document-cases.test.mjs';
  // Emitted only after every assertion and mutant rejection above succeeds.
  // Ordinary node:test output; it is not a retained ledger or production result.
  t.diagnostic(JSON.stringify({ scope, basisSource: rawDocumentSource,
    checkoutCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    source: { path: sourcePath, sha256: hash(readFileSync(new URL(sourcePath, root))) },
    runner: { path: runnerPath, sha256: hash(readFileSync(new URL(import.meta.url))) },
    dependencies, rowCount: actual.length, recipeStreamSha256: hash(lines(actual)),
    materializedStreamSha256: hash(lines(materialized)),
    inputStreamSha256: hash(lines(materialized.map(([caseId, input]) => [caseId, input]))),
    expectedStreamSha256: hash(lines(expected.map(row => [row.caseId, row.expected]))), mutations,
    runtime: { node: process.version, versions: process.versions, operatingSystem: type(), release: release(),
      build: version(), architecture: arch(), realm: 'node-main' },
    runnerArgv: [process.execPath, ...process.execArgv, ...process.argv.slice(1)] }));
});
