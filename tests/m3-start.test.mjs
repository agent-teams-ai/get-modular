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
const m3 = { ...m2, approvedOn: '2026-09-07',
  scope: [...m2.scope, 'generated-self-composition'],
  excluded: m2.excluded.filter(value => value !== 'generated-self-composition-claims') };
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

// M2 acceptance evidence is frozen; M3 additions live in this separate suite.
test('M3 accepts only with verified M2 authority and preserves historical admission', async () => {
  for (const [decisionMarkdown, admitted] of [[proposed, false], [accepted, true]]) {
    let reads = 0;
    const result = check(m3, authority, {
      readM2Authority: async () => {
        reads += 1;
        return { ...authority, decisionMarkdown };
      },
    });
    if (admitted) await result;
    else await assert.rejects(result, /M2 authority verification failed/u);
    assert.equal(reads, 1);
  }
  await check(m1, null, { readM2Authority: undefined });
  await check(m2);
  await check(m3);
  await check(m2);
  await check(m1, null, { readM2Authority: undefined });
  const withoutAuthority = { ...m3 }; delete withoutAuthority.m2Authority;
  await assert.rejects(check(withoutAuthority), /bounded private checkpoint/u);
  await assert.rejects(check(m3, authority, { readM2Authority: undefined }), /M2 accepted authority is missing/u);
  for (const m2Authority of [null, [], {}, { ...m3.m2Authority, bypass: true },
    { ...m3.m2Authority, decisionId: 'ADR-0013' },
    { ...m3.m2Authority, ledgerDigest: 'invalid' }]) {
    await assert.rejects(check({ ...m3, m2Authority }), /M2 accepted authority is missing/u);
  }
  await assert.rejects(check({ ...m3,
    m2Authority: { ...m3.m2Authority, ledgerDigest: 'sha256:' + '0'.repeat(64) },
  }), /M2 authority verification failed/u);
  for (const input of [null, { ...authority, ledgerBytes: Buffer.from('{}') },
    { ...authority, readBytes: path => path === 'architecture/qualification/generation-two/schema.json'
      ? Buffer.from('{}') : read(path) },
    { ...authority, decisionMarkdown: accepted.replace('approved_by: product-owner', 'approved_by: reviewer') }]) {
    await assert.rejects(check(m3, input), /M2 authority verification failed/u);
  }
});

test('M3 rejects mixed scopes, malformed lists and loss of any remaining exclusion', async () => {
  const mutations = [
    { scope: m2.scope }, { excluded: m2.excluded },
    { scope: [...m1.scope, 'generated-self-composition'] },
    { scope: [...m3.scope, 'generated-self-composition'] },
    { scope: m3.scope.map(value => value === 'raw-carriers' ? 'raw-entry-export' : value) },
    { scope: [...m3.scope, 'runtime-lifecycle'] },
    { scope: [...m3.scope, 'self-composed-qualified'] },
    { scope: [...m3.scope, 'release-eligible'] },
    { scope: null }, { scope: 'generated-self-composition' },
    { excluded: null }, { excluded: {} },
    { excluded: [...m3.excluded, 'publication'] },
    { excluded: m3.excluded.map(() => 'runtime-lifecycle') },
    ...m3.excluded.map(exclusion => ({
      excluded: m3.excluded.filter(value => value !== exclusion),
    })),
  ];
  for (const mutation of mutations) {
    await assert.rejects(check({ ...m3, ...mutation }), /bounded private checkpoint/u);
  }
  await assert.rejects(check({ ...m3, authorityDigest: 'sha256:' + '0'.repeat(64) }), /accepted authority has changed/u);
  await assert.rejects(check({ ...m3, status: 'pending-owner-approval' }), /authorization is missing/u);
});
