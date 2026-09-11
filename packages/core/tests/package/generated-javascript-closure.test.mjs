import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { version } from 'typescript';
import { compileComposition } from '../../dist-stage0/self-composition/stage0-entry.js';
import { ownDeclarations, ownProfile } from '../../dist-stage0/self-composition/own-profile.js';
import { allowlist } from '../../dist-stage0/self-composition/allowlist.js';
import { auditM1JavaScriptClosure } from '../qualification-support/support/m1-javascript-closure.mjs';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const tsc = join(dirname(require.resolve('typescript/package.json')), 'bin/tsc');
const ENTRY = 'dist/index.js';
const DIRECT = 'dist/composition/stage0.js';
const GENERATED = 'dist/composition/generated/stage1.js';
const FACADE = 'dist/features/compiler-facade/factory.js';
const CANONICAL = 'dist/features/canonicalization/owned-jcs/factory.js';
const ADMISSION = 'dist/features/input-admission/object-admission.js';
const publicNames = [
  'compileComposition', 'compileCompositionJson', 'defineModule', 'many', 'optional', 'required',
];

async function write(root, path, bytes) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), bytes);
}

async function compile(root, name, files) {
  assert.equal(version, '7.0.2');
  const config = `tsconfig.${name}.json`;
  await write(root, config, JSON.stringify({
    extends: join(packageRoot, 'tsconfig.json'),
    compilerOptions: { rootDir: '.', outDir: `built-${name}`, skipLibCheck: false },
    files, include: [],
  }));
  const result = spawnSync(process.execPath, [tsc, '-p', join(root, config)],
    { encoding: 'utf8', timeout: 60_000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stdout + result.stderr);
}

// Match the existing javascript-closure fixture mutation pattern: a complete
// positive companion, an asserted edit, then a bounded private rejection.
function edit(files, path, before, after) {
  const source = files.get(path).toString('utf8');
  assert.ok(source.includes(before), `mutation anchor missing in ${path}`);
  files.set(path, Buffer.from(source.replace(before, after)));
}

function reject(files, profile, reason) {
  assert.throws(() => auditM1JavaScriptClosure(files, profile), error => {
    assert.equal(error.code, 'm1.javascript-closure.invalid');
    assert.equal(error.message, 'Invalid M1 JavaScript closure.');
    assert.equal(error.reason, reason);
    assert.deepEqual(Object.keys(error).sort(), ['code', 'reason']);
    return true;
  });
}

// Disposable profile fixtures alongside the actual generated production closure.
// Build the actual emitter and its actual generated root in a temporary tree;
// audit those emitted JS bytes at their physical path with the real dist
// closure. Declaration semantics remain the independent declaration owner's.
test('explicit generated archive profile preserves the full M2 closure', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'gm-generated-js-closure-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  for (const path of ['src', 'self-composition']) {
    await cp(join(packageRoot, path), join(temporary, path), { recursive: true });
  }
  await write(temporary, 'package.json', '{"type":"module"}\n');
  await compile(temporary, 'emitter', ['self-composition/emit.ts']);
  const { emitComposition } = await import(pathToFileURL(join(temporary,
    'built-emitter/self-composition/emit.js')).href);
  const result = await compileComposition({ declarations: ownDeclarations, profile: ownProfile });
  assert.equal(result.ok, true);
  assert.equal(result.plan.selections.length, 6);
  assert.equal(result.plan.bindings.length, 6);
  const rootPath = 'src/composition/generated/stage1.ts';
  await write(temporary, rootPath, emitComposition(result, allowlist));
  await compile(temporary, 'generated', [rootPath]);

  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  assert.ok(manifest.files.includes(GENERATED));
  assert.ok(!manifest.files.includes(DIRECT));
  const generated = new Map();
  for (const path of [...manifest.files, 'LICENSE', 'README.md', 'package.json']) {
    generated.set(path, await readFile(join(packageRoot, path)));
  }
  assert.deepEqual(generated.get(GENERATED), await readFile(join(temporary,
    'built-generated/src/composition/generated/stage1.js')),
  'production wiring matches independently regenerated physical JavaScript');
  // The direct companion uses the real separately built handwritten root.
  // Only its disposable public entry is redirected; no feature bytes change.
  const direct = new Map(generated);
  direct.delete(GENERATED);
  direct.set(DIRECT, await readFile(join(packageRoot,
    'dist-stage0/src/composition/stage0.js')));
  edit(direct, ENTRY, './composition/generated/stage1.js', './composition/stage0.js');
  const expectedPhysical = [...direct.keys()].filter(path => path !== DIRECT)
    .concat(GENERATED).sort();
  assert.deepEqual([...generated.keys()].sort(), expectedPhysical);
  const expected = files => ({
    modules: [...files.keys()].filter(path => path.endsWith('.js')).sort(),
    exports: publicNames,
  });
  const good = (files, profile) =>
    assert.deepEqual(auditM1JavaScriptClosure(files, profile), expected(files));
  const mutant = (change, reason) => {
    const files = new Map(generated);
    good(files, 'm2-generated');
    change(files);
    reject(files, 'm2-generated', reason);
  };

  await t.test('matching profiles and direct/generated/direct have no shared state', () => {
    const saved = new Map([...generated].map(([path, bytes]) => [path, Buffer.from(bytes)]));
    good(direct, 'm2');
    good(generated, 'm2-generated');
    good(direct, 'm2');
    good(new Map([...generated].reverse()), 'm2-generated');
    assert.deepEqual(generated, saved);
    reject(generated, 'm2', 'file-purpose');
    reject(direct, 'm2-generated', 'file-purpose');
    for (const profile of [undefined, 'm1', 'm1-shared']) {
      reject(generated, profile, 'file-purpose');
    }
    good(direct, 'm2');
  });

  await t.test('both physical roots and fallback forwarding are rejected', () => {
    mutant(files => files.set(DIRECT, direct.get(DIRECT)), 'file-purpose');
    mutant(files => {
      files.set(DIRECT, direct.get(DIRECT));
      files.set(GENERATED, Buffer.from("export { root } from '../stage0.js';\n"));
    }, 'file-purpose');
    mutant(files => {
      files.set(GENERATED, Buffer.from("export { root } from '../stage0.js';\n"));
    }, 'module-missing');
    mutant(files => edit(files, ENTRY, './composition/generated/stage1.js',
      './composition/stage0.js'), 'module-missing');
  });

  await t.test('all six constructions and provider origins remain mandatory', () => {
    mutant(files => edit(files, GENERATED, 'canonicalizer: canonicalizer',
      'canonicalizer: scanner'), 'construction');
    mutant(files => edit(files, GENERATED, 'scanner: scanner',
      'scanner: canonicalizer'), 'construction');
    mutant(files => edit(files, GENERATED, '{ scanner: scanner }', '{}'), 'construction');
    mutant(files => edit(files, GENERATED, 'export const root = compiler;',
      'const extra = createOwnedJcs({});\nexport const root = compiler;'), 'construction');
    mutant(files => edit(files, GENERATED, 'export const root = compiler;',
      'export const root = canonicalizer;'), 'construction');
    mutant(files => edit(files, CANONICAL, 'return Object.freeze({',
      'const extra = createOwnedJcs({});\nreturn Object.freeze({'), 'construction');
  });

  await t.test('unselected factories, development imports and feature purpose stay closed', () => {
    mutant(files => files.set(
      'dist/features/canonicalization/witness-variant/factory.js',
      Buffer.from('export function createWitnessVariant(deps) { return deps; }\n')),
    'file-purpose');
    mutant(files => edit(files, GENERATED,
      '../../features/canonicalization/owned-jcs/factory.js', 'canonicalize'), 'specifier');
    mutant(files => edit(files, GENERATED,
      '../../features/canonicalization/owned-jcs/factory.js',
      '../../../self-composition/allowlist.js'), 'specifier');
    mutant(files => edit(files, ADMISSION, 'export function admitObjectInput(',
      'function activate() {}\nexport function admitObjectInput('), 'purpose');
  });

  await t.test('both public compiler members retain their selected facade origin', () => {
    mutant(files => edit(files, ENTRY, 'root.compileCompositionJson',
      'root.compileComposition'), 'public-origin');
    mutant(files => edit(files, ENTRY, 'root.compileCompositionJson', 'root'), 'public-origin');
    mutant(files => edit(files, FACADE, 'admission.admitRawInput(input, collector)',
      'admission.admitObjectInput(input, collector)'), 'construction');
  });

  await t.test('candidate metadata cannot select an assembly or callable profile', () => {
    for (const claimed of ['m1', 'm1-shared', 'm2', 'm2-generated']) {
      const files = new Map(generated);
      files.set('package.json', Buffer.from(JSON.stringify({
        ...manifest, profile: claimed, auditProfile: claimed,
        files: [DIRECT], exports: { '.': './dist/composition/stage0.js' },
      })));
      good(files, 'm2-generated');
      reject(files, 'm2', 'file-purpose');
      reject(files, undefined, 'file-purpose');
    }
    const files = new Map(direct);
    files.set('package.json', Buffer.from('{"profile":"m2-generated"}'));
    good(files, 'm2');
    reject(files, 'm2-generated', 'file-purpose');
  });
});
