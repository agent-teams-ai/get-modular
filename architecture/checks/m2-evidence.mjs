// Development-only custody and replay of the proposed M2 acceptance evidence.
// This verifies retained Node oracle results, never Core execution or approval.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { parse as parseYaml } from 'yaml';
import { createCombinedInventoryVerifier } from '../../tests/qualification/m2-candidate/combined-case-inventory.mjs';
import { buildGenerationTwo } from '../../tests/qualification/m2-candidate/generation-two-artifacts.mjs';

export const M2_EVIDENCE_LEDGER = 'architecture/authority/diagnostic-generation-two-ledger.json';
export const M2_RETAINED_LEDGER_DIGEST = 'sha256:a75f5e079611211f7be525d9e864490d3a0dcabc1ab8ee306bf19ecba1d8c8cf';
const DIRECTORY = 'architecture/qualification/generation-two/';
const SOURCE = '0b20ee7227644d098ae59c5b6f27cba8f0a4a5fb';
const TREE = '1abcc0b870d90bdb3156980afaa72040c2b593ca';
const CATEGORIES = ['cardinality', 'rowFailures', 'overlap', 'permutations', 'ordering',
  'orderingShuffle', 'collector', 'extendedOverlaps', 'resources', 'rawDocuments'];
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const keys = (value, expected) => assert.deepEqual(Object.keys(value).sort(), [...expected].sort());
const safePath = path => typeof path === 'string' && /^[A-Za-z0-9._/-]+$/.test(path)
  && path.split('/').every(part => part !== '' && part !== '.' && part !== '..');

function parseLedger(bytes) {
  const ledger = JSON.parse(bytes.toString('utf8'));
  keys(ledger, ['schemaVersion', 'algorithm', 'artifacts']);
  assert.equal(ledger.schemaVersion, 1);
  assert.equal(ledger.algorithm, 'sha256-bytes');
  assert(Array.isArray(ledger.artifacts) && ledger.artifacts.length > 0);
  const paths = new Set(), ids = new Set();
  for (const entry of ledger.artifacts) {
    keys(entry, ['id', 'path', 'immutableDigest']);
    assert(safePath(entry.path) && typeof entry.id === 'string' && entry.id.length > 0);
    assert(/^sha256:[a-f0-9]{64}$/.test(entry.immutableDigest));
    assert(!paths.has(entry.path) && !ids.has(entry.id));
    paths.add(entry.path); ids.add(entry.id);
  }
  return ledger;
}

export function unpackRetainedCandidate(archiveBytes, ledgerBytes) {
  assert.equal(digest(ledgerBytes), M2_RETAINED_LEDGER_DIGEST);
  const ledger = parseLedger(ledgerBytes);
  assert.equal(ledger.artifacts.length, 30);
  const container = JSON.parse(gunzipSync(archiveBytes, { maxOutputLength: 80 * 1024 * 1024 }).toString('utf8'));
  keys(container, ['schemaVersion', 'files']);
  assert.equal(container.schemaVersion, 1);
  assert(Array.isArray(container.files));
  const expectedPaths = [...ledger.artifacts.map(row => row.path), 'qualification-ledger.json'];
  assert.deepEqual(container.files.map(row => row.path), expectedPaths);
  const files = new Map();
  for (const row of container.files) {
    keys(row, ['path', 'bytesBase64']);
    assert(safePath(row.path) && typeof row.bytesBase64 === 'string');
    const bytes = Buffer.from(row.bytesBase64, 'base64');
    assert.equal(bytes.toString('base64'), row.bytesBase64);
    files.set(row.path, bytes);
  }
  assert.deepEqual(files.get('qualification-ledger.json'), ledgerBytes);
  for (const entry of ledger.artifacts) assert.equal(digest(files.get(entry.path)), entry.immutableDigest, entry.path);
  return files;
}

export function replayRetainedCandidate(files) {
  const bytes = path => { const value = files.get(path); assert(Buffer.isBuffer(value), path); return value; };
  const json = path => JSON.parse(bytes(path).toString('utf8'));
  const result = json('result.json');
  assert.equal(result.source, SOURCE); assert.equal(result.tree, TREE);
  assert.equal(result.status, 'proposed-only/not-claimed');
  assert.equal(result.acceptance, 'pending'); assert.equal(result.coreExecuted, false);
  assert.equal(result.nodeTestExitCode, 0);
  assert.equal(result.toolchain.node, 'v24.18.0');
  assert.equal(result.staticCompleteCaseRecipes, 941);
  assert.equal(result.rawObservationRecords, 92); assert.equal(result.objectObservationRecords, 82);
  assert.equal(result.contentAddressedMutationRows, 116);
  assert.deepEqual(json('invocation.json'), result.invocation);
  assert.equal(digest(bytes('capture-script.mjs')), result.collector.sha256);
  const generation = buildGenerationTwo();
  for (const name of ['schema', 'catalog', 'contract', 'snapshots']) {
    assert.deepEqual(json(`generation-two/${name}.json`), generation[name]);
  }
  assert.deepEqual(json('generation-two/candidate.json'), generation);
  const verifier = createCombinedInventoryVerifier(bytes('cases/manifest.json').toString('utf8'));
  for (const category of CATEGORIES) verifier.accept(category, bytes(`cases/${category}.jsonl`).toString('utf8'));
  const inventory = verifier.finish();
  assert.equal(inventory.totalCount, 941);
  assert.deepEqual(inventory, json('cases/verification.json'));
  const diagnostics = json('diagnostics.json');
  for (const [name, count] of [['raw-invocation', 92], ['object-descriptor', 82]]) {
    const retained = diagnostics.filter(row => row.scope === `proposed-only/${name}-observation-retention`);
    assert.equal(retained.length, 1);
    const row = retained[0]; assert.equal(row.compilerExecuted, false);
    assert.equal(row.recordUtf8.length, count);
    const text = row.headerUtf8 + row.recordUtf8.join('');
    assert.equal(digest(text), row.observedCaseStreamSha256);
    assert.equal(bytes(`observations/${name}.jsonl`).toString('utf8'), text);
  }
  for (const count of [25, 84]) {
    const report = json(`mutations/rows-${count}.json`);
    assert.equal(report.mutationCount, count); assert.equal(report.rows.length, count);
    assert.equal(digest(report.rows.map(row => JSON.stringify(row) + '\n').join('')), report.rowStreamSha256);
    assert.deepEqual(diagnostics.filter(row => row.kind === 'get-modular.private-mutation-evidence'
      && row.mutationCount === count), [report]);
  }
  const boundary = json('mutations/boundary-seven.json');
  assert.equal(boundary.payload.kind, 'get-modular.proposed-boundary-source-mutations/v1');
  assert.equal(boundary.payload.compilerExecuted, false);
  assert.equal(boundary.payload.rows.length, 7); assert.equal(boundary.payload.metadataNegatives.length, 15);
  assert.equal(digest(JSON.stringify(boundary.payload)), boundary.sha256);
  assert.deepEqual(diagnostics.filter(row => row.payload?.kind === boundary.payload.kind), [boundary]);
  const events = bytes('runner.events.jsonl').toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line));
  assert(!events.some(event => event.type === 'test:fail'));
  assert(events.some(event => event.type === 'test:summary' && event.data.success === true));
  assert.deepEqual(events.filter(event => event.type === 'test:diagnostic' && event.data.message.startsWith('{'))
    .map(event => JSON.parse(event.data.message)), diagnostics);
  return { source: SOURCE, tree: TREE, recipes: 941, observations: 174, mutations: 116,
    coreExecuted: false, scope: 'retained-private-node-oracle' };
}

export async function verifyM2Evidence({ ledgerBytes, expectedLedgerDigest, readBytes }) {
  assert(/^sha256:[a-f0-9]{64}$/.test(expectedLedgerDigest));
  assert.equal(digest(ledgerBytes), expectedLedgerDigest);
  const ledger = parseLedger(ledgerBytes), verified = new Map();
  for (const entry of ledger.artifacts) {
    const bytes = await readBytes(entry.path);
    assert(Buffer.isBuffer(bytes));
    assert.equal(digest(bytes), entry.immutableDigest, entry.path);
    verified.set(entry.path, bytes);
  }
  const retained = unpackRetainedCandidate(verified.get(DIRECTORY + 'retained-candidate.json.gz'),
    verified.get(DIRECTORY + 'retained-ledger.json'));
  for (const name of ['schema', 'catalog', 'contract', 'snapshots', 'candidate']) {
    assert.deepEqual(verified.get(`${DIRECTORY}${name}.json`), retained.get(`generation-two/${name}.json`));
  }
  return replayRetainedCandidate(retained);
}

// The caller supplies tracked index bytes, like the other governance readers.
// Human authorization and accepted-decision history stay with the existing
// Docs Protocol registry; this check binds the admitted scope to its evidence.
export async function validateM2StartAuthority({ decisionMarkdown, ledgerBytes, readBytes, expectedLedgerDigest }) {
  const frontmatter = /^---\n([\s\S]*?)\n---/u.exec(decisionMarkdown);
  assert(frontmatter, 'M2 accepted decision metadata is required');
  const metadata = parseYaml(frontmatter[1]);
  assert.equal(metadata.id, 'ADR-0021'); assert.equal(metadata.type, 'adr');
  assert.equal(metadata.status, 'accepted'); assert.equal(metadata.approved_by, 'product-owner');
  assert(/^\d{4}-\d{2}-\d{2}$/u.test(metadata.accepted_at));
  const anchors = [...decisionMarkdown.matchAll(/Generation 2 ledger digest: `(sha256:[a-f0-9]{64})`/gu)];
  assert.equal(anchors.length, 1); assert.equal(anchors[0][1], expectedLedgerDigest);
  return verifyM2Evidence({ ledgerBytes, expectedLedgerDigest, readBytes });
}
