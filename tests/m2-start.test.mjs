import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validatePrivateCoreStart } from '../architecture/checks/private-core-start.mjs';
import { M2_EVIDENCE_LEDGER } from '../architecture/checks/m2-evidence.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
// Finite owner-record fixtures remain independent of the activated roadmap.
const m1 = {
  repository: 'agent-teams-ai/get-modular',
  baseCommit: '0f7d2fc64ae7258781e6c2676ca1e0ccc377f418',
  authorityDigest: 'sha256:9ba074210704a20f6a3ef7486f3cf2ec7435fb0fc5552cca210b6d3d5d73f077',
  approvedBy: 'product-owner', approvedOn: '2026-09-04', status: 'authorized',
  package: '@get-modular/core',
  scope: ['semantics', 'object-entry', 'publication-not-claimed'],
  excluded: ['raw-carriers', 'raw-entry-export', 'runtime-lifecycle',
    'conformance-claims', 'proposed-contract-claims', 'generated-self-composition-claims'],
};
const decision = read('docs/decisions/0021-freeze-combined-diagnostic-generation-two-for-m2.md').toString('utf8');
const frontmatter = /^---\n([\s\S]*?)\n---/u;
const proposedMetadata = 'status: proposed';
const acceptedMetadata = 'status: accepted\napproved_by: product-owner\naccepted_at: 2026-09-06';
// Normalize only test-local approval metadata; retain the real body and anchor.
const decisionFixture = (source, metadata) => {
  assert.match(source, frontmatter);
  return source.replace(frontmatter, (_match, fields) => '---\n'
    + fields.split('\n').filter(line => !/^(?:status|approved_by|accepted_at):/u.test(line)).join('\n')
    + '\n' + metadata + '\n---');
};
const proposed = decisionFixture(decision, proposedMetadata);
const accepted = decisionFixture(decision, acceptedMetadata);
const anchors = [...decision.matchAll(/Generation 2 ledger digest: `(sha256:[a-f0-9]{64})`/gu)];
assert.equal(anchors.length, 1);
const ledgerDigest = anchors[0][1];
const m2 = { ...m1, approvedOn: '2026-09-06',
  scope: ['semantics', 'object-entry', 'publication-not-claimed',
    'raw-carriers', 'raw-entry-export', 'duplicate-binding-records'],
  excluded: ['runtime-lifecycle', 'conformance-claims',
    'proposed-contract-claims', 'generated-self-composition-claims'],
  m2Authority: { decisionId: 'ADR-0021', ledgerDigest } };
const markdown = value => '<!-- get-modular:private-core-start -->\n```json\n'
  + JSON.stringify(value) + '\n```\n<!-- /get-modular:private-core-start -->';
const authority = { decisionMarkdown: accepted, ledgerBytes: read(M2_EVIDENCE_LEDGER), readBytes: read };
const check = (record, input = authority, extra = {}) => validatePrivateCoreStart({
  markdown: markdown(record), productionArtifacts: ['packages/core/package.json'],
  authorityDigest: m1.authorityDigest, isStartingBase: async base => base === m1.baseCommit,
  readPackageManifest: async () => ({ name: m1.package }),
  readM2Authority: async () => input,
  ...extra,
});

test('decision fixtures normalize both sides of the acceptance transition', () => {
  for (const source of [proposed, accepted]) {
    assert.equal(decisionFixture(source, proposedMetadata), proposed);
    assert.equal(decisionFixture(source, acceptedMetadata), accepted);
  }
});

test('M1 and M2 records retain their admission rules before and after acceptance', async () => {
  for (const [record, decisionMarkdown, admitted, expectedReads] of [
    [m1, proposed, true, 0],
    [m1, accepted, true, 0],
    [m2, proposed, false, 1],
    [m2, accepted, true, 1],
  ]) {
    let reads = 0;
    const input = { ...authority, decisionMarkdown };
    const result = check(record, input, {
      readM2Authority: async () => { reads += 1; return input; },
    });
    if (admitted) await result;
    else await assert.rejects(result, /M2 authority verification failed/u);
    assert.equal(reads, expectedReads);
  }
  await check(m1, null, { readM2Authority: undefined });
  await assert.rejects(check({ ...m2, status: 'pending-owner-approval' }), /authorization is missing/u);
});

test('M2 scope cannot bypass evidence, identity, old authority or remaining exclusions', async () => {
  for (const [altered, expected] of [
    [{ ...m2, m2Authority: { ...m2.m2Authority, ledgerDigest: 'sha256:' + '0'.repeat(64) } }, /M2 authority verification failed/u],
    [{ ...m2, m2Authority: { ...m2.m2Authority, decisionId: 'ADR-0013' } }, /M2 accepted authority is missing/u],
    [{ ...m2, m2Authority: { ...m2.m2Authority, bypass: true } }, /M2 accepted authority is missing/u],
    [{ ...m2, scope: [...m2.scope, 'runtime-lifecycle'] }, /bounded private checkpoint/u],
    [{ ...m2, excluded: m2.excluded.filter(value => value !== 'conformance-claims') }, /bounded private checkpoint/u],
    [{ ...m2, authorityDigest: 'sha256:' + '0'.repeat(64) }, /accepted authority has changed/u],
  ]) await assert.rejects(check(altered), expected);
  const withoutIdentity = { ...m2 }; delete withoutIdentity.m2Authority;
  await assert.rejects(check(withoutIdentity), /bounded private checkpoint/u);
  await assert.rejects(check(m2, authority, { readM2Authority: undefined }), /M2 accepted authority is missing/u);
  await assert.rejects(check(m2, null), /M2 authority verification failed/u);
  await assert.rejects(check(m2, { ...authority, ledgerBytes: Buffer.from('{}') }), /M2 authority verification failed/u);
  await assert.rejects(check(m2, { ...authority,
    readBytes: path => path === 'architecture/qualification/generation-two/schema.json'
      ? Buffer.from('{}') : read(path) }), /M2 authority verification failed/u);
  await assert.rejects(check(m2, { ...authority,
    decisionMarkdown: accepted.replace('approved_by: product-owner', 'approved_by: reviewer') }), /M2 authority verification failed/u);
});
