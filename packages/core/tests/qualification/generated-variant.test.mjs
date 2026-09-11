import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import canonicalize from 'canonicalize';
import { version } from 'typescript';
import { verifyConstruction } from '../qualification-support/support/construction-witness.mjs';
import { expectedDigest } from '../qualification-support/support/scale-output.mjs';
import { m2RawCaseDefinitions } from '../qualification-support/support/m2-packed-raw-cases.mjs';
import { materializeRawDocumentInput } from '../qualification-support/m2-candidate/raw-document-cases.mjs';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const tsc = join(dirname(require.resolve('typescript/package.json')), 'bin/tsc');
const canon = 'get-modular/canonicalization/owned-jcs';
const variant = 'get-modular/canonicalization/witness-variant';
const semantics = 'get-modular/composition-semantics/default';
const output = 'get-modular/plan-output/default';
const scanner = 'get-modular/raw-scanner/owned-iterative';
const admission = 'get-modular/input-admission/default';
const facade = 'get-modular/compiler-facade/default';
const variantPath = '../../../tests/features/canonicalization/witness-variant/factory.js';
const qualification = { qualification: true };

// Independent six-module construction obligations, including the M2 scanner.
const baseTuples = [
  [canon, 0, []],
  [semantics, 1, [['canonicalizer', canon]]],
  [output, 2, [['canonicalizer', canon]]],
  [scanner, 3, []],
  [admission, 4, [['scanner', scanner]]],
  [facade, 5, [['admission', admission], ['output', output], ['semantics', semantics]]],
];
const variantTuples = [
  [variant, 0, []],
  [semantics, 1, [['canonicalizer', variant]]],
  [output, 2, [['canonicalizer', variant]]],
  [scanner, 3, []],
  [admission, 4, [['scanner', scanner]]],
  [facade, 5, [['admission', admission], ['output', output], ['semantics', semantics]]],
];

function expectedPlan(provider) {
  const binding = (consumerImplementationId, slotId, providerId, capabilityId) => ({
    consumerImplementationId, slotId, providerImplementationIds: [providerId], capabilityId,
    compatibility: { family: 'exact', familyVersion: 1, token: `${capabilityId}/v1` },
  });
  return {
    kind: 'get-modular.composition-plan', schemaVersion: 1,
    profileId: 'get-modular/own-profile', roots: ['get-modular/compiler-facade'],
    selections: [
      { moduleId: 'get-modular/canonicalization', implementationId: provider },
      { moduleId: 'get-modular/compiler-facade', implementationId: facade },
      { moduleId: 'get-modular/composition-semantics', implementationId: semantics },
      { moduleId: 'get-modular/input-admission', implementationId: admission },
      { moduleId: 'get-modular/plan-output', implementationId: output },
      { moduleId: 'get-modular/raw-scanner', implementationId: scanner },
    ],
    bindings: [
      binding(facade, 'admission', admission, 'get-modular/admitted-input'),
      binding(facade, 'output', output, 'get-modular/plan-emission'),
      binding(facade, 'semantics', semantics, 'get-modular/semantic-analysis'),
      binding(semantics, 'canonicalizer', provider, 'get-modular/canonical-bytes'),
      binding(admission, 'scanner', scanner, 'get-modular/raw-scanner'),
      binding(output, 'canonicalizer', provider, 'get-modular/canonical-bytes'),
    ],
    dependencyOrder: [provider, semantics, output, scanner, admission, facade],
  };
}

function variantDigest(plan) {
  return `gm-plan:v1:sha-256:${createHash('sha256')
    .update('get-modular/witness-variant/v1\0', 'utf8')
    .update(canonicalize({ canonicalization: 'RFC8785', hashAlgorithm: 'SHA-256',
      kind: 'get-modular.plan-content', plan, protocolVersion: 1 }), 'utf8').digest('hex')}`;
}

function witness(tuples) {
  return {
    tuples,
    digest: `sha256:${createHash('sha256').update(canonicalize(tuples), 'utf8').digest('hex')}`,
  };
}

async function write(root, path, text) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, text);
}

async function compile(root, name, files) {
  assert.equal(version, '7.0.2');
  await write(root, `tsconfig.${name}.json`, JSON.stringify({
    extends: join(packageRoot, 'tsconfig.json'),
    compilerOptions: {
      rootDir: '.', outDir: `built-${name}`, skipLibCheck: false,
      incremental: false,
    },
    files, include: [],
  }));
  const result = spawnSync(process.execPath, [tsc, '-p', join(root, `tsconfig.${name}.json`)],
    { encoding: 'utf8', timeout: 60_000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return join(root, `built-${name}`);
}

function load(root, path) {
  return import(pathToFileURL(join(root, path)).href);
}

// Disposable private replacement evidence only. Production activation, full
// generated qualification, cold-bootstrap custody and publication remain separate.
test('generated base -> generated variant -> restored generated base', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'gm-generated-variant-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  for (const path of ['src', 'self-composition', 'tests/features/canonicalization/witness-variant']) {
    await cp(join(packageRoot, path), join(temporary, path), { recursive: true });
  }
  await rm(join(temporary, 'src/composition/generated'), { recursive: true, force: true });
  await write(temporary, 'package.json', '{"type":"module"}\n');
  const seed = await compile(temporary, 'seed', [
    'self-composition/emit.ts',
    'self-composition/stage0-entry.ts',
    'self-composition/stage0-entry.variant.ts',
    'self-composition/own-profile.ts',
    'self-composition/own-profile.variant.ts',
    'self-composition/allowlist.ts',
    'self-composition/allowlist.variant.ts',
  ]);
  const { emitComposition } = await load(seed, 'self-composition/emit.js');
  const direct = await load(seed, 'self-composition/stage0-entry.js');
  const directVariant = await load(seed, 'self-composition/stage0-entry.variant.js');
  const base = await load(seed, 'self-composition/own-profile.js');
  const replacement = await load(seed, 'self-composition/own-profile.variant.js');
  const { allowlist } = await load(seed, 'self-composition/allowlist.js');
  const { allowlist: variantAllowlist } = await load(seed, 'self-composition/allowlist.variant.js');
  const input = data => ({ declarations: data.ownDeclarations, profile: data.ownProfile });
  assert.equal(base.ownDeclarations.length, 6);
  assert.equal(replacement.ownDeclarations.length, 7);
  assert.equal(allowlist.size, 6);
  assert.equal(variantAllowlist.size, 7);
  assert.equal(replacement.ownProfile.selections.length, 6);
  assert.equal(replacement.ownProfile.bindings.length, 6);
  assert.equal(base.ownProfile.selections.filter((row, index) =>
    JSON.stringify(row) !== JSON.stringify(replacement.ownProfile.selections[index])).length, 1);
  assert.equal(base.ownProfile.bindings.filter((row, index) =>
    JSON.stringify(row) !== JSON.stringify(replacement.ownProfile.bindings[index])).length, 2);

  const baseline = m2RawCaseDefinitions.find(row =>
    row.id === 'raw/document/od005.raw-document.v1/baseline');
  assert.ok(baseline);
  assert.equal(baseline.expected.result.ok, true);
  const publicBase = structuredClone(baseline.expected.result);
  assert.equal(publicBase.digest, expectedDigest(publicBase.plan));
  const publicVariant = { ...publicBase, digest: variantDigest(publicBase.plan) };
  assert.notEqual(publicVariant.digest, publicBase.digest);
  const publicResults = [];
  const stages = [];

  for (const [name, data, subject, handles, provider, tuples] of [
    ['base', base, direct, allowlist, canon, baseTuples],
    ['variant', replacement, directVariant, variantAllowlist, variant, variantTuples],
    ['restored', base, direct, allowlist, canon, baseTuples],
  ]) {
    const isVariant = provider === variant;
    const options = isVariant ? qualification : {};
    const plan = expectedPlan(provider);
    const expected = {
      ok: true, plan, digest: isVariant ? variantDigest(plan) : expectedDigest(plan),
    };
    // The variant seed must use the variant provider for its own digest too.
    const p0 = await subject.compileComposition(input(data));
    assert.deepEqual(p0, expected);
    const w0 = emitComposition(p0, handles, options);
    const compositionPath = `src/composition/generated/${name}.ts`;
    await write(temporary, compositionPath, w0);
    const built = await compile(temporary, name, [
      compositionPath,
      isVariant ? 'self-composition/allowlist.variant.ts' : 'self-composition/allowlist.ts',
    ]);
    const { root } = await load(built, `src/composition/generated/${name}.js`);
    assert.notEqual(root.compileComposition, subject.compileComposition);
    const pending = root.compileComposition(input(data));
    assert.ok(pending instanceof Promise);
    const p1 = await pending;
    assert.deepEqual(p1, expected);
    assert.deepEqual(p1, p0);
    const w1 = emitComposition(p1, handles, options);
    const replayPath = `src/composition/generated/${name}-replay.ts`;
    await write(temporary, replayPath, w1);
    assert.deepEqual(await readFile(join(temporary, compositionPath)),
      await readFile(join(temporary, replayPath)));
    assert.equal(w1, w0);
    for (const [path, result] of [[compositionPath, p0], [replayPath, p1]]) {
      assert.deepEqual(await verifyConstruction({
        packageRoot: temporary, buildRoot: built, compositionPath: path,
        allowlistPath: isVariant ? 'self-composition/allowlist.variant.ts' : 'self-composition/allowlist.ts',
        qualification: isVariant, plan: result.plan,
      }), witness(tuples));
    }
    const raw = materializeRawDocumentInput('od005.raw-document.v1/baseline');
    const decode = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const object = { declarations: raw.declarations.map(decode), profile: decode(raw.profile) };
    const expectedPublic = isVariant ? publicVariant : publicBase;
    const objectResult = await root.compileComposition(object);
    const rawResult = await root.compileCompositionJson(raw);
    assert.deepEqual(objectResult, expectedPublic);
    assert.deepEqual(rawResult, expectedPublic);
    publicResults.push({ objectResult, rawResult });
    stages.push({ p0, p1, w0, w1 });
  }
  assert.deepEqual(stages[2], stages[0]);
  assert.deepEqual(publicResults[2], publicResults[0]);
  assert.notDeepEqual(stages[1], stages[0]);
  assert.notDeepEqual(publicResults[1], publicResults[0]);

  await t.test('qualification exception is exact, checks unused entries and never invokes factories', () => {
    const p0 = stages[0].p0;
    const reject = (handles, options) => assert.throws(
      () => emitComposition(p0, handles, options),
      { code: 'allowlist.out-of-bound-import', message: 'allowlist.out-of-bound-import' });
    reject(variantAllowlist);
    reject(variantAllowlist, { qualification: false });
    reject(variantAllowlist, { qualification: 'true' });
    const inert = new Map([...variantAllowlist].map(([id, handle]) => [id, {
      ...handle, factory() { assert.fail('emitter invoked a factory'); },
    }]));
    assert.equal(emitComposition(p0, inert, qualification), stages[0].w0);
    assert.equal(emitComposition(stages[1].p0, inert, qualification), stages[1].w0);
    for (const changes of [
      { importPath: '../../../tests/features/canonicalization/other/factory.js' },
      { importPath: '../../../tests/features/canonicalization/witness-variant/../witness-variant/factory.js' },
      { importPath: '../../../tests/features/canonicalization/witness-variant/./factory.js' },
      { importPath: `${variantPath}?query` },
      { importPath: `${variantPath}#fragment` },
      { importPath: '../../../tests/features/canonicalization/%77itness-variant/factory.js' },
      { importPath: '../../features/canonicalization/owned-jcs/factory.js' },
      { factoryExport: 'createOwnedJcs' },
      { declarationExport: 'ownedJcsDeclaration' },
      { localName: 'otherVariant' },
    ]) {
      const handles = new Map(inert);
      handles.set(variant, { ...handles.get(variant), ...changes });
      reject(handles, qualification);
    }
    const wrongIdentity = new Map(inert);
    const handle = wrongIdentity.get(variant);
    wrongIdentity.delete(variant);
    wrongIdentity.set('x/variant', {
      ...handle, declaration: { ...handle.declaration, implementationId: 'x/variant' },
    });
    reject(wrongIdentity, qualification);
    const wrongModule = new Map(inert);
    wrongModule.set(variant, {
      ...handle, declaration: { ...handle.declaration, moduleId: 'x/canonicalization' },
    });
    reject(wrongModule, qualification);
  });
});
