import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import {
  validateInput, admitManifest, validateEvents,
} from '../../../../tests/qualification/m3-retained-parity.mjs';

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
