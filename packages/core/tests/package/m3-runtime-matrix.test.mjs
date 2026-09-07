import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectRows, parseArguments, ROWS,
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
