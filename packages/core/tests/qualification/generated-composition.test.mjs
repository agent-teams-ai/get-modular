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
import { compileComposition as direct } from '../../dist-stage0/self-composition/stage0-entry.js';
import { ownDeclarations, ownProfile } from '../../dist-stage0/self-composition/own-profile.js';
import { allowlist } from '../../dist-stage0/self-composition/allowlist.js';
import { verifyConstruction } from '../../../../tests/qualification/support/construction-witness.mjs';
import { m2RawCaseDefinitions, executeM2RawCase } from '../../../../tests/qualification/support/m2-packed-raw-cases.mjs';
import { materializeRawDocumentInput } from '../../../../tests/qualification/m2-candidate/raw-document-cases.mjs';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const tsc = join(dirname(require.resolve('typescript/package.json')), 'bin/tsc');
const canon = 'get-modular/canonicalization/owned-jcs';
const semantics = 'get-modular/composition-semantics/default';
const output = 'get-modular/plan-output/default';
const scanner = 'get-modular/raw-scanner/owned-iterative';
const admission = 'get-modular/input-admission/default';
const facade = 'get-modular/compiler-facade/default';
const expectedTuples = [
  [canon, 0, []],
  [semantics, 1, [['canonicalizer', canon]]],
  [output, 2, [['canonicalizer', canon]]],
  [scanner, 3, []],
  [admission, 4, [['scanner', scanner]]],
  [facade, 5, [['admission', admission], ['output', output], ['semantics', semantics]]],
];
const baselineId = 'raw/document/od005.raw-document.v1/baseline';

async function write(root, path, source) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, source);
}

async function compile(root, name, files) {
  assert.equal(version, '7.0.2');
  const config = `tsconfig.${name}.json`;
  await write(root, config, JSON.stringify({
    extends: join(packageRoot, 'tsconfig.json'),
    compilerOptions: { rootDir: '.', outDir: `built-${name}`, skipLibCheck: false },
    files,
    include: [],
  }));
  const built = spawnSync(process.execPath, [tsc, '-p', join(root, config)],
    { encoding: 'utf8', timeout: 60_000 });
  assert.ifError(built.error);
  assert.equal(built.signal, null);
  assert.equal(built.status, 0, built.stdout + built.stderr);
}

// Disposable execution slice only. Production generation has its own build gate;
// replacement/restoration, cold bootstrap and retained generated qualification
// remain separate obligations. This test alone makes no full M3 claim.
test('generated own root executes and regenerates its composition', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'gm-generated-composition-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  for (const path of ['src', 'self-composition']) {
    await cp(join(packageRoot, path), join(temporary, path), { recursive: true });
  }
  await write(temporary, 'package.json', '{"type":"module"}\n');
  await compile(temporary, 'emitter', ['self-composition/emit.ts']);
  const { emitComposition } = await import(pathToFileURL(join(temporary,
    'built-emitter/self-composition/emit.js')).href);
  const ownInput = () => ({ declarations: ownDeclarations, profile: ownProfile });
  const p0 = await direct(ownInput());
  assert.equal(p0.ok, true);
  const w0 = emitComposition(p0, allowlist);
  const compositionPath = 'src/composition/generated/stage1.ts';
  await write(temporary, compositionPath, w0);
  await compile(temporary, 'generated', [compositionPath]);
  const { root } = await import(pathToFileURL(join(temporary,
    'built-generated/src/composition/generated/stage1.js')).href);
  assert.equal(typeof root.compileComposition, 'function');
  assert.equal(typeof root.compileCompositionJson, 'function');
  assert.notEqual(root.compileComposition, direct);

  await t.test('complete P0/P1 and separately retained W0/W1 agree', async () => {
    const pending = root.compileComposition(ownInput());
    assert.ok(pending instanceof Promise);
    const p1 = await pending;
    assert.deepEqual(p1, p0);
    const w1 = emitComposition(p1, allowlist);
    const replayPath = 'src/composition/generated/stage1-replay.ts';
    await write(temporary, replayPath, w1);
    assert.deepEqual(await readFile(join(temporary, replayPath)),
      await readFile(join(temporary, compositionPath)));
    assert.equal(w1, w0);
    const expectedWitness = {
      tuples: expectedTuples,
      digest: `sha256:${createHash('sha256').update(canonicalize(expectedTuples)).digest('hex')}`,
    };
    for (const [path, plan] of [[compositionPath, p0.plan], [replayPath, p1.plan]]) {
      assert.deepEqual(await verifyConstruction({
        packageRoot: temporary,
        buildRoot: join(packageRoot, 'dist-stage0'),
        compositionPath: path,
        allowlistPath: 'self-composition/allowlist.ts',
        plan,
      }), expectedWitness);
    }
  });

  await t.test('generated scanner and canonical output serve the public baseline', async () => {
    const baseline = m2RawCaseDefinitions.find(row => row.id === baselineId);
    assert.ok(baseline);
    assert.equal(baseline.expected.result.ok, true);
    const raw = materializeRawDocumentInput('od005.raw-document.v1/baseline');
    const decode = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const input = { declarations: raw.declarations.map(decode), profile: decode(raw.profile) };
    const pending = root.compileComposition(input);
    assert.ok(pending instanceof Promise);
    assert.deepEqual(await pending, baseline.expected.result);
    await executeM2RawCase(baselineId, root.compileCompositionJson);
    // The complete independent digest above observes canonical output bytes.
    // Malformed raw bytes below observe scanner behavior through its injection.
    assert.deepEqual(await root.compileCompositionJson({
      declarations: [], profile: new TextEncoder().encode('{'),
    }), { ok: false, diagnostics: [{
      code: 'decode.invalid-json', phase: 'decode',
      path: [{ kind: 'field', value: 'profile' }], coordinate: {},
      details: { reason: 'invalid-json' },
    }] });
  });

  await t.test('all 185 original raw outcomes through the generated root', async t => {
    assert.equal(m2RawCaseDefinitions.length, 185);
    // The existing executor invokes fixture.after immediately after the call,
    // before awaiting, and checks forbidden getter reads before and after it.
    for (const row of m2RawCaseDefinitions) {
      await t.test(row.id, () => executeM2RawCase(row.id, root.compileCompositionJson));
    }
  });
});
