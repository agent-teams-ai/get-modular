import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import test from 'node:test';
import { M2_EVIDENCE_LEDGER, M2_RETAINED_LEDGER_DIGEST, unpackRetainedCandidate,
  replayRetainedCandidate, verifyM2Evidence as verifyFrozenM2Evidence } from '../architecture/checks/m2-evidence.mjs';
import { createHistoricalM2EvidenceReader } from '../architecture/checks/assembly-admission.mjs';

// The ledger pins retained-acceptance.test.mjs itself. Preserve that historical
// suite and carry every assertion forward here with an explicit evidence reader.
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const prefix = 'architecture/qualification/generation-two/';
const archive = read(prefix + 'retained-candidate.json.gz');
const retainedLedger = read(prefix + 'retained-ledger.json');
const ledger = read(M2_EVIDENCE_LEDGER);
const decision = read('docs/decisions/0021-freeze-combined-diagnostic-generation-two-for-m2.md').toString('utf8');
const anchor = /Generation 2 ledger digest: `(sha256:[a-f0-9]{64})`/u.exec(decision);
assert(anchor, 'proposed umbrella must bind one concrete ledger');
const files = unpackRetainedCandidate(archive, retainedLedger);
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const verifyM2Evidence = async input => verifyFrozenM2Evidence({
  ...input, readBytes: await createHistoricalM2EvidenceReader(input),
});

test('proposed umbrella binds exact successor artifacts and complete retained observations', async () => {
  assert.equal(sha(retainedLedger), M2_RETAINED_LEDGER_DIGEST);
  assert.deepEqual(await verifyM2Evidence({ ledgerBytes: ledger, expectedLedgerDigest: anchor[1], readBytes: read }), {
    source: '0b20ee7227644d098ae59c5b6f27cba8f0a4a5fb', tree: '1abcc0b870d90bdb3156980afaa72040c2b593ca',
    recipes: 941, observations: 174, mutations: 116, coreExecuted: false, scope: 'retained-private-node-oracle',
  });
});

test('the frozen verifier still rejects current lock bytes against the historical hash', async () => {
  await assert.rejects(verifyFrozenM2Evidence({
    ledgerBytes: ledger, expectedLedgerDigest: anchor[1], readBytes: read,
  }), error => error.message.includes('pnpm-lock.yaml'));
});

test('ledger substitution and changed current artifact bytes fail before qualification', async () => {
  await assert.rejects(verifyM2Evidence({ ledgerBytes: Buffer.concat([ledger, Buffer.from(' ')]),
    expectedLedgerDigest: anchor[1], readBytes: read }));
  await assert.rejects(verifyM2Evidence({ ledgerBytes: ledger, expectedLedgerDigest: anchor[1],
    readBytes: path => path === prefix + 'schema.json' ? Buffer.from('{}') : read(path) }));
  assert.throws(() => unpackRetainedCandidate(archive, Buffer.from('{}')));
});

test('archive rejects missing, duplicate, substituted and unsafe members even with a new compression', () => {
  const original = JSON.parse(gunzipSync(archive).toString('utf8'));
  for (const kind of ['missing', 'duplicate', 'substituted', 'unsafe']) {
    const container = { ...original, files: [...original.files] };
    if (kind === 'missing') container.files.pop();
    if (kind === 'duplicate') container.files[1] = container.files[0];
    if (kind === 'substituted') container.files[0] = { ...container.files[0], bytesBase64: 'e30=' };
    if (kind === 'unsafe') container.files[0] = { ...container.files[0], path: '../capture-script.mjs' };
    const altered = gzipSync(JSON.stringify(container));
    assert.throws(() => unpackRetainedCandidate(altered, retainedLedger), undefined, kind);
  }
});

test('replay cannot relabel retained evidence as Core, omit observations or replace mutation results', () => {
  for (const [path, alter] of [
    ['result.json', value => ({ ...value, coreExecuted: true })],
    ['result.json', value => ({ ...value, source: '0'.repeat(40) })],
    ['mutations/rows-25.json', value => ({ ...value, rows: value.rows.slice(1) })],
    ['mutations/boundary-seven.json', value => ({ ...value, sha256: 'sha256:' + '0'.repeat(64) })],
  ]) {
    const altered = new Map(files);
    altered.set(path, Buffer.from(JSON.stringify(alter(JSON.parse(files.get(path).toString('utf8'))))));
    assert.throws(() => replayRetainedCandidate(altered), undefined, path);
  }
  const altered = new Map(files);
  altered.set('observations/object-descriptor.jsonl', Buffer.from('{}\n'));
  assert.throws(() => replayRetainedCandidate(altered));
});
