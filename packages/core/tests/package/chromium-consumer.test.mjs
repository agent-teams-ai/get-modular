import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer, request } from 'node:http';
import {
  publicArchiveRoot, routeHandler, validateInput, verifyRecords,
  verifySemanticRecords, verifyDescriptorRecords,
  prepareInvocationEvidence, verifyInvocationRecords,
  prepareP500Evidence, verifyP500Records,
} from '../../../../tests/qualification/m3-chromium-consumer.mjs';
import { produceInvocationRuntimeFixtures } from '../../../../tests/qualification/support/m3-invocation-runtime-fixtures.mjs';
import { readPackageArchive } from '../../../../tests/qualification/support/package-archive.mjs';
import { produceDescriptorRuntimeFixtures } from '../../../../tests/qualification/support/m3-descriptor-runtime-fixtures.mjs';
import {
  executeDescriptorRuntimeFixture,
} from '../../../../tests/qualification/support/m3-descriptor-runtime-executor.mjs';

test('P500 requires all ten complete results and exact local observations', async () => {
  const evidence = await prepareP500Evidence();
  verifyP500Records(evidence.expected, evidence);
  for (const missing of [undefined, null, [], {}])
    assert.throws(() => verifyP500Records(missing, evidence));
  assert.throws(() => verifyP500Records(evidence.expected, undefined));
  assert.throws(() => verifyP500Records(evidence.expected, structuredClone(evidence)));
  for (const mutate of [
    rows => { rows.pop(); },
    rows => { rows[2].id = rows[0].id; },
    rows => { rows.reverse(); },
    rows => { rows[1].mode = 'object'; },
    rows => { rows[0].category = 'substituted'; },
    rows => { rows[0].result.digest = 'forged'; },
    rows => { rows[0].result.plan.bindings.pop(); },
    rows => { rows[6].result.diagnostics = []; },
    rows => { rows[8].result = structuredClone(rows[0].result); },
    rows => { delete rows[0].observations; },
    ...['containers', 'mutationRejections', 'mutatedObjects', 'mutatedBuffers',
      'mutatedBytes'].map(name => rows => { rows[0].observations[name] += 1; }),
    rows => { rows[0].observations.callerWrapperMutated = false; },
    rows => { rows[0].observations.unmet = []; },
  ]) {
    const changed = structuredClone(evidence.expected);
    mutate(changed);
    assert.throws(() => verifyP500Records(changed, evidence));
  }
});

test('invocation parent rejects missing IDs, false coverage and incomplete capability rows', async () => {
  const fixtures = [...produceInvocationRuntimeFixtures()];
  const expected = await prepareInvocationEvidence(fixtures);
  for (const realm of ['window', 'worker']) {
    verifyInvocationRecords(expected[realm], fixtures, expected, realm);
    for (const mutate of [
      value => { value.records.pop(); },
      value => { value.records[1].id = value.records[0].id; },
      value => { value.records[0].mode = 'object'; },
      value => { value.records[0].result.ok = true; },
      value => { value.records[0].observations.foreignRealm = !value.records[0].observations.foreignRealm; },
      value => { value.records[0].observations.nodeBuffer = true; },
      value => { value.records[0].observations.mutatedBytes += 1; },
      value => { value.records[0].observations.mutationRejections = 0; },
      value => { value.unmet.pop(); },
      value => { value.unmet[0].code = 'passed'; },
      value => { value.unmet[0].id = value.records[0].id; },
      value => { value.records.push(structuredClone(expected.main.records.find(row =>
        row.id === 'dense-offset-buffer'))); },
    ]) {
      const changed = structuredClone(expected[realm]);
      mutate(changed);
      assert.throws(() => verifyInvocationRecords(changed, fixtures, expected, realm));
    }
  }
  const changed = structuredClone(fixtures);
  changed.find(row => row.id === 'realm-array-cleared').applicability.foreignRealm = 'nonapplicable';
  assert.throws(() => verifyInvocationRecords(expected.worker, changed, expected, 'worker'));
  assert.throws(() => verifyInvocationRecords(expected.worker, fixtures.slice(1), expected, 'worker'));
});

test('routes serve copied bytes and reject noncanonical or unlisted targets', async () => {
  const bytes = Buffer.from('export const value = 1;');
  const server = createServer(routeHandler(new Map([
    ['/archive/entry.js', { bytes, type: 'text/javascript' }],
  ])));
  bytes.fill(0);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const get = (path, host = `127.0.0.1:${port}`) => new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, headers: { host } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode, headers: response.headers,
        body: Buffer.concat(chunks).toString(),
      }));
    });
    req.on('error', reject);
    req.end();
  });
  try {
    const good = await get('/archive/entry.js');
    assert.equal(good.status, 200);
    assert.equal(good.body, 'export const value = 1;');
    assert.equal(good.headers['cross-origin-embedder-policy'], 'require-corp');
    for (const path of [
      '/archive/../entry.js', '/archive/%2e%2e/entry.js', '/archive/entry.js?x',
      '/archive//entry.js', '/etc/passwd', 'http://example.com/archive/entry.js',
    ]) assert.equal((await get(path)).status, 404, path);
    assert.equal((await get('/archive/entry.js', 'example.com')).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('public root follows the closed export map and rejects alternate resolution', () => {
  const manifest = { name: '@get-modular/core', type: 'module', exports: {
    '.': { import: { types: './public.d.ts', default: './public.js' }, default: './public.js' },
  } };
  const files = new Map([['public.js', Buffer.from('')], ['public.d.ts', Buffer.from('')]]);
  const update = () => files.set('package.json', Buffer.from(JSON.stringify(manifest)));
  update();
  assert.equal(publicArchiveRoot(files), '/archive/public.js');
  manifest.exports['.'].default = './other.js';
  update();
  assert.throws(() => publicArchiveRoot(files));
});

test('identity and source mismatch fail before archive execution', () => {
  assert.throws(() => validateInput({ exactSourceSHA: '0'.repeat(40) }));
  assert.throws(() => readPackageArchive(Buffer.from('changed archive'), {
    sha256: '0'.repeat(64), integrity: `sha512-${Buffer.alloc(64).toString('base64')}`,
  }), error => error.context.reason === 'identity-sha256-mismatch');
});

test('complete comparison rejects changed expected values and omitted IDs', () => {
  const fixtures = Array.from({ length: 123 }, (_, index) => ({
    id: `case-${index}`, expected: { ok: false, diagnostics: [] },
  }));
  const records = fixtures.map(row => ({ id: row.id, result: { ok: true }, observations: {} }));
  assert.throws(() => verifyRecords(records, fixtures), /full expected result/);
  assert.throws(() => verifyRecords(records.slice(1), fixtures), /no skipped observations/);
  assert.throws(() => verifyRecords(records.map(row => ({ ...row, id: 'same' })), fixtures));
});

test('semantic comparison requires both ordered modes, complete results and local observations', () => {
  const fixtures = Array.from({ length: 818 }, (_, index) => ({
    id: `semantic-${index}`, category: 'synthetic',
    input: { declarations: [], profile: {} },
    expected: { ok: false, diagnostics: [] },
    rawEligibility: { declarationBytes: [], profileBytes: 2, aggregateBytes: 2 },
  }));
  const records = fixtures.flatMap(fixture => ['object', 'raw'].map(mode => ({
    id: fixture.id, category: fixture.category, mode,
    result: structuredClone(fixture.expected),
    observations: {
      containers: 2, mutationRejections: 12, mutatedObjects: 5,
      mutatedBuffers: 1, mutatedBytes: 2, callerWrapperMutated: true,
    },
  })));
  verifySemanticRecords(records, fixtures);
  for (const mutate of [
    rows => { rows.pop(); },
    rows => { rows[1].mode = 'object'; },
    rows => { rows[2].id = rows[0].id; },
    rows => { [rows[0], rows[1]] = [rows[1], rows[0]]; },
    rows => { rows[0].category = 'substituted'; },
    rows => { rows[0].result.diagnostics.push({ code: 'unexpected' }); },
    rows => { rows[0].observations.containers = 1; },
    rows => { rows[0].observations.mutationRejections -= 1; },
    rows => { rows[0].observations.mutatedObjects = 0; },
    rows => { rows[1].observations.mutatedBytes -= 1; },
    rows => { rows[0].observations.callerWrapperMutated = false; },
  ]) {
    const changed = structuredClone(records);
    mutate(changed);
    assert.throws(() => verifySemanticRecords(changed, fixtures));
  }
  const wrongExpected = structuredClone(fixtures);
  wrongExpected[817].expected.ok = true;
  assert.throws(() => verifySemanticRecords(records, wrongExpected), /full expected result/);
});

test('descriptor parent rejects omissions, forged applicability and foreign worker coverage', async () => {
  const fixtures = [...produceDescriptorRuntimeFixtures()];
  const freeze = value => {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  };
  // This is verifier evidence from a synthetic subject, not compiler qualification.
  const records = [];
  const foreign = fixtures.filter(row => row.applicability.foreignRealm === 'required');
  for (const fixture of fixtures) {
    if (foreign.includes(fixture)) continue;
    records.push(await executeDescriptorRuntimeFixture({
      compileComposition: () => Promise.resolve(freeze(structuredClone(fixture.expected))),
    }, fixture));
  }
  const evidence = { records, unmet: foreign.map(row => ({
    id: row.id, capability: 'foreign-realm',
    code: 'descriptor.foreign-realm-unavailable',
  })) };
  verifyDescriptorRecords(evidence, fixtures, true);
  assert.throws(() => verifyDescriptorRecords(evidence, fixtures));
  for (const mutate of [
    value => { value.records.pop(); },
    value => { value.records[1].id = value.records[0].id; },
    value => { value.records.reverse(); },
    value => { value.records[0].result.ok = !value.records[0].result.ok; },
    value => { value.records[0].mode = 'raw'; },
    value => { value.records[0].applicability.foreignRealm = 'required'; },
    value => { value.records[0].observations.foreignRealm = 'supplied'; },
    value => { value.records[0].observations.getterCalls = 1; },
    value => { value.records[0].observations.nestedMutations = 0; },
    value => { value.records[0].observations.nestedMutations += 1; },
    value => { value.records[0].observations.containers += 1; },
    value => { value.records[0].observations.mutationRejections -= 1; },
    value => { value.records[0].observations.callerWrapperMutated = false; },
    value => { value.unmet.pop(); },
    value => { value.unmet[0].id = value.records[0].id; },
    value => { value.unmet[0].code = 'passed'; },
    value => { value.unmet = []; },
    value => { value.claim = 'descriptor68'; },
    value => { value.records.push(...foreign.map(row => ({
      ...structuredClone(value.records[0]), id: row.id,
    }))); },
  ]) {
    const changed = structuredClone(evidence);
    mutate(changed);
    assert.throws(() => verifyDescriptorRecords(changed, fixtures, true));
  }
  const falseApplicability = structuredClone(fixtures);
  falseApplicability.find(row => row.applicability.foreignRealm === 'required')
    .applicability.foreignRealm = 'nonapplicable';
  assert.throws(() => verifyDescriptorRecords(evidence, falseApplicability, true));
  assert.throws(() => verifyDescriptorRecords(evidence, fixtures.slice(1), true));
});
