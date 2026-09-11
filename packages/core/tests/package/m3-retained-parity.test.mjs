import assert from 'node:assert/strict';
import test from 'node:test';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import {
  validateInput, admitManifest, validateEvents,
  physicalOutputDestination, npmIdentity, runRetainedParity,
} from '../qualification-support/m3-retained-parity.mjs';

const commit = '7b8e38461b81fdb505eb013cfc1ea08e1bce14d9';
const input = () => ({
  trustedRunner: { path: resolve('/trusted'), sourceCommit: commit, sha256: 'a'.repeat(64) },
  archives: ['direct', 'generated'].map((assembly, index) => ({
    assembly, path: resolve(`/${assembly}.tgz`), sourceCommit: commit,
    sha256: String(index + 1).repeat(64), integrity: `sha512-${Buffer.alloc(64, index).toString('base64')}`,
  })),
  outputDir: resolve('/fresh-output'), nodePath: resolve('/tools/node'), npmPath: resolve('/tools/npm-cli.js'),
  orderedManyPath: resolve('/evidence/ordered-many.json'),
});

test('closed retained replay admission owns its input', () => {
  const original = input(), admitted = validateInput(original);
  original.archives[0].path = '/changed';
  assert.equal(admitted.archives[0].path, resolve('/direct.tgz'));
  for (const mutate of [
    value => { value.command = 'true'; },
    value => { value.entrypoint = '/fake.mjs'; },
    value => { value.archives.reverse(); },
    value => { value.archives.pop(); },
    value => { value.archives[0].sourceCommit = 'b'.repeat(40); },
    value => { value.trustedRunner.sha256 = 'unknown'; },
    value => { value.outputDir = '/trusted/output'; },
    value => { value.nodePath = 'node'; },
    value => { value.archives[1].sha256 = value.archives[0].sha256; },
  ]) {
    const value = input(); mutate(value);
    assert.throws(() => validateInput(value));
  }
});

test('physical output admission rejects a runner alias before any replay writes', async t => {
  const scratch = await mkdtemp(join(tmpdir(), 'm3-output-admission-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const runner = await realpath(fileURLToPath(new URL('../../../../', import.meta.url)));
  const alias = join(scratch, 'replay-parent');
  await symlink(runner, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const name = `rejected-${basename(scratch)}`;
  const destination = join(runner, name);
  await assert.rejects(lstat(destination), { code: 'ENOENT' });
  const before = await readdir(runner);
  const value = input();
  value.trustedRunner.path = runner;
  value.outputDir = join(alias, name);
  assert.equal(validateInput(value).outputDir, value.outputDir);
  await assert.rejects(physicalOutputDestination(runner, value.outputDir),
    /physical output must be outside runner source/u);
  if (process.platform !== 'win32') {
    await assert.rejects(runRetainedParity(value), /physical output must be outside runner source/u);
  }
  await assert.rejects(lstat(destination), { code: 'ENOENT' });
  assert.deepEqual(await readdir(runner), before);
  assert.deepEqual(await readdir(scratch), ['replay-parent']);
});

test('physical output admission requires an existing parent and returns its physical destination', async t => {
  const scratch = await mkdtemp(join(tmpdir(), 'm3-output-parent-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const runner = join(scratch, 'runner'), outside = join(scratch, 'outside');
  await mkdir(runner);
  await mkdir(outside);
  const alias = join(scratch, 'alias');
  await symlink(outside, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(await physicalOutputDestination(runner, join(alias, 'evidence')),
    join(await realpath(outside), 'evidence'));
  await assert.rejects(physicalOutputDestination(runner, join(scratch, 'missing/evidence')),
    { code: 'ENOENT' });
  assert.deepEqual(await readdir(outside), []);
  assert.deepEqual((await readdir(scratch)).sort(), ['alias', 'outside', 'runner']);
});

async function disposableNpm(t) {
  const scratch = await mkdtemp(join(tmpdir(), 'm3-npm-identity-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const root = join(scratch, 'npm');
  await mkdir(join(root, 'bin'), { recursive: true });
  await mkdir(join(root, 'lib'));
  await mkdir(join(root, 'node_modules/dependency'), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"name":"npm","version":"1.0.0"}\n');
  const launcher = join(root, 'bin/npm-cli.js');
  await writeFile(launcher, "require('../lib/cli.js');\n");
  await writeFile(join(root, 'lib/cli.js'), "require('dependency');\n");
  await writeFile(join(root, 'node_modules/dependency/index.js'), 'module.exports = 1;\n');
  return { scratch, root, launcher };
}

test('npm identity rechecks implementation and dependencies with an unchanged launcher', async t => {
  const { root, launcher } = await disposableNpm(t);
  const before = await npmIdentity(launcher);
  const launcherBytes = await readFile(launcher);
  assert.deepEqual(await npmIdentity(launcher), before);
  await writeFile(join(root, 'lib/cli.js'), "require('dependency'); // upgraded\n");
  const changedLib = await npmIdentity(launcher);
  assert.deepEqual(await readFile(launcher), launcherBytes);
  assert.equal(changedLib.sha256, before.sha256);
  assert.notEqual(changedLib.implementation.sha256, before.implementation.sha256);
  assert.throws(() => assert.deepEqual(changedLib, before));
  await writeFile(join(root, 'node_modules/dependency/index.js'), 'module.exports = 2;\n');
  const changedDependency = await npmIdentity(launcher);
  assert.equal(changedDependency.sha256, before.sha256);
  assert.notEqual(changedDependency.implementation.sha256, changedLib.implementation.sha256);
});

test('npm inventory rejects escaping implementation links', async t => {
  const { scratch, root, launcher } = await disposableNpm(t);
  await mkdir(join(scratch, 'external'));
  await writeFile(join(scratch, 'external/index.js'), 'module.exports = 1;\n');
  await symlink(join(scratch, 'external'), join(root, 'lib/external'),
    process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(npmIdentity(launcher), /npm link escapes implementation tree/u);
});

function archive(assembly) {
  const stem = assembly === 'direct' ? './dist-stage0/self-composition/stage0-entry' : './dist/index';
  const manifest = { name: '@get-modular/core', version: '0.2.0', type: 'module',
    exports: { '.': { import: { types: `${stem}.d.ts`, default: `${stem}.js` }, default: `${stem}.js` } } };
  return { stem, manifest };
}
test('direct and generated manifests retain their actual public targets', () => {
  for (const assembly of ['direct', 'generated']) {
    const { stem, manifest } = archive(assembly);
    const files = new Map([
      ['package.json', Buffer.from(JSON.stringify(manifest))],
      [`${stem.slice(2)}.js`, Buffer.from('throw new Error("never a successful Core");')],
      [`${stem.slice(2)}.d.ts`, Buffer.from('export {};')],
    ]);
    assert.deepEqual(admitManifest(files, assembly), manifest);
    assert.throws(() => admitManifest(files, assembly === 'direct' ? 'generated' : 'direct'));
    for (const key of ['scripts', 'dependencies', 'peerDependencies', 'optionalDependencies', 'main']) {
      files.set('package.json', Buffer.from(JSON.stringify({ ...manifest, [key]: {} })));
      assert.throws(() => admitManifest(files, assembly));
    }
    const reordered = structuredClone(manifest);
    reordered.exports['.'] = { default: `${stem}.js`, import: manifest.exports['.'].import };
    files.set('package.json', Buffer.from(JSON.stringify(reordered)));
    assert.throws(() => admitManifest(files, assembly));
  }
});

test('completion requires every expected case exactly once in order', () => {
  const cases = [{ id: 'semantic/a/object' }, { id: 'semantic/a/raw' }];
  const events = [
    { event: 'start', count: 2 },
    ...cases.map((row, index) => ({
      event: 'case', index, id: row.id, file: `${String(index).padStart(5, '0')}.json`,
      sha256: 'a'.repeat(64), bytes: 10,
    })),
    { event: 'complete', count: 2, m2Calls: 1903, concurrentCalls: 8, bytes: 20 },
  ];
  validateEvents(events, cases);
  for (const mutate of [
    rows => { rows.pop(); },
    rows => { rows.splice(1, 1); },
    rows => { rows[2].id = rows[1].id; },
    rows => { rows[1].file = '../result.json'; },
    rows => { rows.at(-1).m2Calls = 1899; },
  ]) {
    const rows = structuredClone(events); mutate(rows);
    assert.throws(() => validateEvents(rows, cases));
  }
});
