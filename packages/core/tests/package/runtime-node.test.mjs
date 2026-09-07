import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertM3RuntimeIdentity, verifyM3RuntimeObservations } from
  '../../../../tests/qualification/support/m3-runtime-observations.mjs';
import { digest, jsonBytes, readBytes, rowDigest, verifyM1Observations } from
  '../../../../tests/qualification/support/m1-retained-observations.mjs';
import { prepareM3RuntimeNode } from '../../../../tests/qualification/m3-runtime-node.mjs';

// Truthful transport fixtures: these rows describe archive guards only. They
// neither execute a package nor purport to be the adapter's Node/TS inventory.
function fixture(count = 282) {
  const archive = { path: join(tmpdir(), 'TEST-archive.tgz'), bytes: 12,
    identity: { sha256: 'a'.repeat(64), integrity: `sha512-${'A'.repeat(86)}==` } };
  const anchor = 'b'.repeat(64), contextId = 'TEST-transport';
  const cases = Array.from({ length: count }, (_, index) => ({
    id: `TEST/archive-guard/${index}`, kind: 'archive', inputs: [], command: null,
    expected: { archiveIdentity: archive.identity },
  }));
  const events = [];
  for (const row of cases) {
    for (const [kind, details] of [
      ['case-started', {}],
      ['archive-file', { path: archive.path, regular: true, bytes: archive.bytes }],
      ['archive-identity', { actual: archive.identity }],
      ['case-passed', {}],
    ]) events.push({ sequence: events.length, anchor, contextId,
      archiveIdentity: archive.identity, caseId: row.id, rowSha256: rowDigest(row), kind, details });
  }
  events.push({ sequence: events.length, anchor, contextId, archiveIdentity: archive.identity,
    caseId: null, rowSha256: null, kind: 'session-ended', details: { completed: cases.map(row => row.id) } });
  return { expectedPlan: { cases }, events, anchor, contextId, archive, inventory: [],
    observationsSha256: digest(jsonBytes(events)) };
}

test('bounded transport can interpret 282 rows without changing historical M1 semantics', () => {
  const value = fixture();
  assert.equal(verifyM3RuntimeObservations(value).completed.length, 282);
  assert.throws(() => verifyM1Observations(value), /case-inventory/);
  assert.throws(() => verifyM3RuntimeObservations(fixture(513)), /case-inventory/);
});

for (const [name, mutate] of [
  ['missing event', value => value.events.splice(2, 1)],
  ['duplicate event', value => value.events.splice(2, 0, structuredClone(value.events[2]))],
  ['wrong archive', value => { value.events[2].details.actual = { ...value.archive.identity, sha256: 'c'.repeat(64) }; }],
  ['wrong seal', value => { value.events[1].anchor = 'd'.repeat(64); }],
  ['altered expectation', value => { value.expectedPlan.cases[0].title = 'changed'; }],
  ['missing completion', value => value.events.pop()],
  ['duplicate case ID', value => { value.expectedPlan.cases[1].id = value.expectedPlan.cases[0].id; }],
]) test(`transport rejects ${name} even with an updated observation hash`, () => {
  const value = fixture(2);
  mutate(value);
  value.events.forEach((event, index) => { event.sequence = index; });
  value.observationsSha256 = digest(jsonBytes(value.events));
  assert.throws(() => verifyM3RuntimeObservations(value));
});

test('outside completion hash rejects altered observations independently of row semantics', () => {
  const value = fixture(2);
  value.events[2].details.actual = { ...value.archive.identity, sha256: 'e'.repeat(64) };
  assert.throws(() => verifyM3RuntimeObservations(value), /outside capture/);
  assert.throws(() => verifyM3RuntimeObservations({ ...fixture(2), observationsSha256: undefined }));
});

const localCase = new Map([
  ['linux', 'node-24-linux'], ['darwin', 'node-24-macos'], ['win32', 'node-24-windows'],
]).get(process.platform);
const identity = () => ({
  runtimeCaseId: localCase, sourceCommit: '1'.repeat(40), trustedRunner: { commit: '2'.repeat(40) },
});

test('runtime admission rejects foreign IDs, foreign OS and inexact source identities', () => {
  for (const runtimeCaseId of ['chromium-window', 'node-24', 'node-24-linux-extra']) {
    assert.throws(() => assertM3RuntimeIdentity({ ...identity(), runtimeCaseId }));
  }
  for (const runtimeCaseId of ['node-24-linux', 'node-24-macos', 'node-24-windows']) {
    if (runtimeCaseId !== localCase) assert.throws(() => assertM3RuntimeIdentity({ ...identity(), runtimeCaseId }));
  }
  for (const sourceCommit of ['HEAD', '1234567', 'A'.repeat(40), '1'.repeat(41)]) {
    assert.throws(() => assertM3RuntimeIdentity({ ...identity(), sourceCommit }));
  }
  assert.throws(() => assertM3RuntimeIdentity({ ...identity(), trustedRunner: { commit: 'HEAD' } }));
});

test('invalid admission fails before output creation or execution', async () => {
  await assert.rejects(prepareM3RuntimeNode({ ...identity(), runtimeCaseId: 'invalid' }));
  await assert.rejects(prepareM3RuntimeNode(identity()), /outside-capture-sinks-required/);
});

test('bounded retained-byte checks detect a same-size altered archive', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gm-runtime-node-TEST-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'TEST-archive.tgz');
  await writeFile(path, 'TEST archive bytes', { flag: 'wx' });
  const expected = digest(await readBytes(path));
  const bytes = await readFile(path);
  bytes[0] ^= 1;
  await writeFile(path, bytes);
  assert.notEqual(digest(await readBytes(path)), expected);
});
