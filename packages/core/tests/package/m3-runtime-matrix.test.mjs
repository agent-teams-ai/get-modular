import assert from 'node:assert/strict';
import test from 'node:test';
import { join, resolve } from 'node:path';
import {
  admitElectronSandboxRunner, collectRows, parseArguments, ROWS,
  verifyElectronSandboxHelper,
} from '../../../../tests/qualification/m3-runtime-matrix.mjs';

// Synthetic transport inputs are used only to test rejection. They are neither
// runtime observations nor evidence that any runtime executed successfully.
function inputs() {
  const expected = {
    sourceCommit: 'a'.repeat(40), runnerCommit: 'a'.repeat(40),
    archiveArtifactId: '123',
    archiveIdentity: {
      sha256: 'b'.repeat(64),
      integrity: `sha512-${Buffer.alloc(64, 7).toString('base64')}`,
    },
  };
  const records = ROWS.map((id, index) => ({
    group: `m3-rows-${index < 3 ? id : 'native'}`,
    file: `${id}.json`,
    record: {
      runtimeCaseId: id, ...structuredClone(expected),
      platform: ['linux', 'darwin', 'win32', 'linux', 'linux', 'linux'][index],
      claim: 'not-claimed', scope: 'partial-same-generated-archive-diagnostics',
      outcome: 'verified',
      diagnostic: {
        path: index < 3 ? `${id}-capture/summary.json`
          : index < 5 ? 'chromium/result.json' : 'electron/result.json',
        sha256: 'c'.repeat(64),
      },
    },
  }));
  return { expected, records };
}

test('collector rejects each missing fixed row', () => {
  for (let index = 0; index < ROWS.length; index += 1) {
    const { expected, records } = inputs();
    records.splice(index, 1);
    assert.throws(() => collectRows(records, expected), /six rows/);
  }
});

test('collector rejects duplicates and substituted identities', () => {
  for (const mutate of [
    rows => { rows[5] = structuredClone(rows[0]); },
    rows => { rows[5].record.runtimeCaseId = 'electron-other'; },
    rows => { rows[0].group = 'm3-rows-node-24-macos'; },
    rows => { rows[0].file = 'node-24-macos.json'; },
    rows => { rows[0].record.platform = 'darwin'; },
    rows => { rows[3].record.diagnostic.path = 'electron/result.json'; },
  ]) {
    const { expected, records } = inputs();
    mutate(records);
    assert.throws(() => collectRows(records, expected));
  }
});

test('collector rejects wrong archive, source and runner bindings', () => {
  for (const mutate of [
    row => { row.archiveIdentity.sha256 = 'd'.repeat(64); },
    row => { row.archiveIdentity.integrity = `sha512-${Buffer.alloc(64, 8).toString('base64')}`; },
    row => { row.archiveArtifactId = '124'; },
    row => { row.sourceCommit = 'e'.repeat(40); },
    row => { row.runnerCommit = 'f'.repeat(40); },
    row => { row.outcome = 'failed'; },
    row => { row.claim = 'runtime-conformant'; },
    row => { row.extra = true; },
  ]) {
    const { expected, records } = inputs();
    mutate(records[2].record);
    assert.throws(() => collectRows(records, expected));
  }
});

test('collector rejects an independently supplied wrong runner expectation', () => {
  const { expected, records } = inputs();
  expected.runnerCommit = 'f'.repeat(40);
  assert.throws(() => collectRows(records, expected), /exact dispatch runner/);
});

test('CLI accepts only finite commands and fixed Node row arguments', () => {
  for (const command of ['init', 'pack', 'native', 'collect']) {
    assert.equal(parseArguments([command]).command, command);
  }
  for (const row of ROWS.slice(0, 3)) assert.equal(parseArguments(['node', row]).row, row);
  for (const args of [
    [], ['run'], ['node'], ['node', 'chromium-window'], ['pack', '--url=https://example.test'],
    ['native', '--no-sandbox'], ['collect', '/tmp/result'], ['init', 'other'],
    ['node', 'node-24-linux', '--command=echo'], ['pack', '--repo=other'],
  ]) assert.throws(() => parseArguments(args));
});

test('sandbox admission permits only dispatched hosted Ubuntu Linux runners', () => {
  const env = {
    GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch',
    RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'Linux', ImageOS: 'ubuntu24',
  };
  assert.doesNotThrow(() => admitElectronSandboxRunner(env, 'linux', 'x64', 1001));
  for (const patch of [
    { GITHUB_ACTIONS: undefined }, { GITHUB_ACTIONS: 'false' },
    { GITHUB_EVENT_NAME: 'push' }, { RUNNER_ENVIRONMENT: 'self-hosted' },
    { RUNNER_ENVIRONMENT: undefined }, { RUNNER_OS: 'macOS' },
    { ImageOS: undefined }, { ImageOS: 'debian12' },
  ]) {
    assert.throws(() => admitElectronSandboxRunner({ ...env, ...patch }, 'linux', 'x64', 1001));
  }
  for (const [platform, arch, uid] of [
    ['darwin', 'x64', 1001], ['win32', 'x64', 1001],
    ['linux', 'arm64', 1001], ['linux', 'x64', 0], ['linux', 'x64', undefined],
  ]) assert.throws(() => admitElectronSandboxRunner(env, platform, arch, uid));
});

test('sandbox helper verification binds physical file, bytes and root setuid metadata', () => {
  const dist = resolve('m3-runtime-matrix-test/tooling/node_modules/electron/dist');
  const before = {
    path: join(dist, 'chrome-sandbox'), physicalPath: join(dist, 'chrome-sandbox'),
    dev: 1, ino: 42, nlink: 1, uid: 1001, gid: 1001,
    mode: 0o100755, sha256: 'a'.repeat(64),
  };
  const after = { ...before, uid: 0, gid: 0, mode: 0o104755 };
  assert.doesNotThrow(() => verifyElectronSandboxHelper(before, dist));
  assert.doesNotThrow(() => verifyElectronSandboxHelper(after, dist, before));
  for (const patch of [
    { path: `${dist}/other` },
    { path: `${dist}-other/chrome-sandbox` },
    { physicalPath: '/usr/bin/chrome-sandbox' },
    { mode: 0o120777 }, { mode: 0o040755 }, { mode: 0o010755 },
    { nlink: 2 }, { sha256: 'invalid' },
  ]) {
    assert.throws(() => verifyElectronSandboxHelper({ ...before, ...patch }, dist));
  }
  for (const patch of [
    { uid: 1001 }, { gid: 1001 },
    { mode: 0o100755 }, { mode: 0o104777 }, { mode: 0o106755 },
    { sha256: 'b'.repeat(64) }, { dev: 2 }, { ino: 43 },
  ]) {
    assert.throws(() => verifyElectronSandboxHelper({ ...after, ...patch }, dist, before));
  }
  assert.throws(() => verifyElectronSandboxHelper(after, dist, {
    ...before, mode: 0o120777,
  }));
});
