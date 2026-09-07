import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { join, resolve } from 'node:path';
import {
  admitElectronSandboxRunner, chromiumSandboxProfile, collectRows, parseArguments, ROWS,
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

function chromiumProfileInput() {
  const root = '/home/runner/work/_temp/m3-runtime-matrix-Ab12Cd';
  return {
    env: {
      GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch',
      RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'Linux', ImageOS: 'ubuntu24',
    },
    platform: 'linux', arch: 'x64', uid: 1001,
    temporary: '/home/runner/work/_temp', root, revision: '1234',
    executable: `${root}/browsers/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`,
  };
}

test('Chromium profile binds one exact executable with a path-derived unique name', () => {
  const input = chromiumProfileInput();
  const profile = chromiumSandboxProfile(input);
  const hash = value => createHash('sha256').update(value).digest('hex');
  assert.equal(profile.name, `m3-chromium-userns-${hash(input.executable)}`);
  assert.equal(profile.path, `${input.root}/diagnostics/chromium-userns.apparmor`);
  assert.equal(profile.executable, input.executable);
  assert.equal(profile.bytes,
    `abi <abi/4.0>,\ninclude <tunables/global>\n\n`
    + `profile ${profile.name} ${input.executable} flags=(unconfined) {\n  userns,\n}\n`);
  assert.equal(profile.sha256, hash(profile.bytes));
  assert.deepEqual(chromiumSandboxProfile(input), profile);
  const other = chromiumProfileInput();
  other.root = other.root.replace('Ab12Cd', 'Ef34Gh');
  other.executable = other.executable.replace('Ab12Cd', 'Ef34Gh');
  assert.notEqual(chromiumSandboxProfile(other).name, profile.name);
});

test('Chromium profile rejects paths outside its closed disposable pinned installation', () => {
  for (const patch of [
    { temporary: '/tmp' }, { temporary: '/home/runner/work/_temp/' },
    { root: '/home/runner/work/_temp/m3-runtime-matrix-Ab12Cd/nested' },
    { root: '/home/runner/work/_temp/m3-runtime-matrix-' },
    { executable: '/usr/bin/chromium' },
    { executable: `${chromiumProfileInput().executable}-other` },
    { revision: '1235' }, { revision: '../1234' }, { revision: '01234' },
    { revision: 1234 }, { revision: '1'.repeat(11) },
  ]) {
    assert.throws(() => chromiumSandboxProfile({ ...chromiumProfileInput(), ...patch }));
  }
  for (const suffix of [
    '*', '?', '[ab]', '{a,b}', '"', "'", '\\', '\n', '\r', '\0',
    '/..', '/../escape', '//nested', ' space', '@{HOME}', ';', '$()', '#',
    'x'.repeat(4096),
  ]) {
    const input = chromiumProfileInput();
    // Mutate all related paths together so path relationships cannot hide
    // acceptance of AppArmor syntax or noncanonical Linux paths.
    input.temporary += suffix;
    input.root = `${input.temporary}/m3-runtime-matrix-Ab12Cd`;
    input.executable = `${input.root}/browsers/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`;
    assert.throws(() => chromiumSandboxProfile(input));
  }
});

test('Chromium profile generation requires hosted Ubuntu dispatch admission', () => {
  for (const patch of [
    { GITHUB_ACTIONS: undefined }, { GITHUB_ACTIONS: 'false' },
    { GITHUB_EVENT_NAME: 'push' }, { RUNNER_ENVIRONMENT: 'self-hosted' },
    { RUNNER_ENVIRONMENT: undefined }, { RUNNER_OS: 'Windows' },
    { ImageOS: 'debian12' }, { ImageOS: undefined },
  ]) {
    const input = chromiumProfileInput();
    Object.assign(input.env, patch);
    assert.throws(() => chromiumSandboxProfile(input));
  }
  for (const patch of [
    { platform: 'darwin' }, { platform: 'win32' }, { arch: 'arm64' },
    { uid: 0 }, { uid: undefined }, { uid: -1 }, { uid: 1.5 },
  ]) {
    assert.throws(() => chromiumSandboxProfile({ ...chromiumProfileInput(), ...patch }));
  }
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
