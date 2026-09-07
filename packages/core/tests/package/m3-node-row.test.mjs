import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runM3NodeRow } from '../../../../tests/qualification/m3-node-row.mjs';

// Admission-only fixtures use nonexistent tools and archive. No candidate,
// installation or complete Node282 inventory is executed by these tests.
async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gm-node-row-TEST-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const program = name => ({
    path: join(root, name), version: 'TEST', sha256: 'a'.repeat(64),
  });
  return { root, input: {
    runtimeCaseId: { linux: 'node-24-linux', darwin: 'node-24-macos',
      win32: 'node-24-windows' }[process.platform],
    sourceCommit: '1'.repeat(40),
    trustedRunner: { commit: '2'.repeat(40),
      files: [{ path: join(root, 'runner.mjs'), sha256: 'b'.repeat(64) }] },
    archive: { path: join(root, 'archive.tgz'),
      identity: { sha256: 'c'.repeat(64), integrity: `sha512-${'A'.repeat(86)}==` } },
    toolchain: { node: program('node'), npm: program('npm'),
      compilers: ['typescript', 'typescript-minimum'].map(name => ({ name, ...program(name) })),
      closures: [{ root: join(root, 'tools'), entries: [] }] },
    outputDirectory: join(root, 'output'), captureDirectory: join(root, 'capture'),
  } };
}

for (const [name, mutate, reason] of [
  ['missing input', input => { delete input.archive; }, /row-keys/],
  ['unknown input', input => { input.command = 'anything'; }, /row-keys/],
  ['unknown nested key', input => { input.toolchain.node.command = 'anything'; }, /row-keys/],
  ['profile override', input => { input.javascriptProfile = 'm2'; }, /row-keys/],
  ['inexact source', input => { input.sourceCommit = 'HEAD'; }, /exact-source-sha/],
  ['invalid runtime', input => { input.runtimeCaseId = 'browser'; }, /accepted-node-case/],
  ['relative destination', input => { input.captureDirectory = 'capture'; }, /absolute-path/],
  ['sparse inventory', input => { input.trustedRunner.files = Array(1); }, /row-dense-array/],
  ['symbol key', input => { input[Symbol('extra')] = true; }, /row-symbol-key/],
  ['custom prototype', input => { Object.setPrototypeOf(input.archive, { extra: true }); }, /row-prototype/],
]) test(`row rejects ${name} before filesystem preparation`, async t => {
  const { root, input } = await fixture(t);
  mutate(input);
  await assert.rejects(runM3NodeRow(input), reason);
  assert.deepEqual(await readdir(root), []);
});

test('row rejects accessors without invoking them', async t => {
  const { root, input } = await fixture(t);
  let invoked = false;
  Object.defineProperty(input.toolchain.node, 'path', {
    enumerable: true, get() { invoked = true; throw new Error('getter executed'); },
  });
  await assert.rejects(runM3NodeRow(input), /row-accessor/);
  assert.equal(invoked, false);
  assert.deepEqual(await readdir(root), []);
});

for (const variant of ['equal', 'capture-parent', 'output-parent', 'archive', 'tools']) {
  test(`row rejects ${variant} overlap before preparation`, async t => {
    const { root, input } = await fixture(t);
    if (variant === 'equal') input.captureDirectory = input.outputDirectory;
    if (variant === 'capture-parent') input.outputDirectory = join(input.captureDirectory, 'child');
    if (variant === 'output-parent') input.captureDirectory = join(input.outputDirectory, 'child');
    if (variant === 'archive') input.archive.path = join(input.captureDirectory, 'archive.tgz');
    if (variant === 'tools') input.toolchain.closures[0].root = input.outputDirectory;
    await assert.rejects(runM3NodeRow(input), /row-overlap/);
    assert.deepEqual(await readdir(root), []);
  });
}

for (const destination of ['captureDirectory', 'outputDirectory']) {
  test(`row rejects preexisting ${destination} without modifying it`, async t => {
    const { root, input } = await fixture(t);
    await mkdir(input[destination]);
    await assert.rejects(runM3NodeRow(input), /row-directory-exists/);
    assert.deepEqual(await readdir(input[destination]), []);
    assert.equal((await readdir(root)).length, 1);
  });
}

test('row rejects a destination parent alias', async t => {
  const { root, input } = await fixture(t);
  const actual = join(root, 'actual'), alias = join(root, 'alias');
  await mkdir(actual);
  try {
    await symlink(actual, alias, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (error.code !== 'EPERM' && error.code !== 'EACCES') throw error;
    t.skip('directory links unavailable');
    return;
  }
  input.captureDirectory = join(alias, 'capture');
  await assert.rejects(runM3NodeRow(input), /row-parent-alias/);
  assert.deepEqual(await readdir(actual), []);
  assert.deepEqual((await readdir(root)).sort(), ['actual', 'alias']);
});


test('row refuses arbitrary inherited environment overrides', async t => {
  const input = await fixture(t);
  input.osEnvironment = { NODE_OPTIONS: '--require=unexpected' };
  await assert.rejects(runM3NodeRow(input), /row-keys/);
});
