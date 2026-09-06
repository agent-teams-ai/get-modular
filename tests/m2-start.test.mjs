import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validatePrivateCoreStart } from '../architecture/checks/private-core-start.mjs';
import { M2_EVIDENCE_LEDGER } from '../architecture/checks/m2-evidence.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const roadmap = read('docs/architecture/mvp-implementation-roadmap.md').toString('utf8');
const marker = /<!-- get-modular:private-core-start -->\s*```json\s*\n([\s\S]*?)\n```/u;
const m1 = JSON.parse(marker.exec(roadmap)[1]);
const proposed = read('docs/decisions/0021-freeze-combined-diagnostic-generation-two-for-m2.md').toString('utf8');
const ledgerDigest = /Generation 2 ledger digest: `(sha256:[a-f0-9]{64})`/u.exec(proposed)[1];
const accepted = proposed.replace('status: proposed\n', 'status: accepted\napproved_by: product-owner\naccepted_at: 2026-09-06\n');
const m2 = { ...m1, scope: [...m1.scope, 'raw-carriers', 'raw-entry-export', 'duplicate-binding-records'],
  excluded: m1.excluded.filter(value => !['raw-carriers', 'raw-entry-export'].includes(value)),
  m2Authority: { decisionId: 'ADR-0021', ledgerDigest } };
const markdown = value => '<!-- get-modular:private-core-start -->\n```json\n'
  + JSON.stringify(value) + '\n```\n<!-- /get-modular:private-core-start -->';
const authority = { decisionMarkdown: accepted, ledgerBytes: read(M2_EVIDENCE_LEDGER), readBytes: read };
const check = (record, input = authority) => validatePrivateCoreStart({
  markdown: markdown(record), productionArtifacts: ['packages/core/package.json'],
  authorityDigest: m1.authorityDigest, isStartingBase: async base => base === m1.baseCommit,
  readPackageManifest: async () => ({ name: m1.package }),
  ...(input === undefined ? {} : { readM2Authority: async () => input }),
});

test('accepted evidence admits exactly the M2 record; the actual proposed document cannot', async () => {
  await check(m1, null); // M1 does not consult the successor at all.
  await check(m2);
  await assert.rejects(check(m2, { ...authority, decisionMarkdown: proposed }), /M2 authority verification failed/u);
  await assert.rejects(check({ ...m2, status: 'pending-owner-approval' }), /authorization is missing/u);
});

test('M2 scope cannot bypass evidence, identity, old authority or remaining exclusions', async () => {
  for (const altered of [
    { ...m2, m2Authority: { ...m2.m2Authority, ledgerDigest: 'sha256:' + '0'.repeat(64) } },
    { ...m2, m2Authority: { ...m2.m2Authority, decisionId: 'ADR-0013' } },
    { ...m2, m2Authority: { ...m2.m2Authority, bypass: true } },
    { ...m2, scope: [...m2.scope, 'runtime-lifecycle'] },
    { ...m2, excluded: m2.excluded.filter(value => value !== 'conformance-claims') },
    { ...m2, authorityDigest: 'sha256:' + '0'.repeat(64) },
  ]) await assert.rejects(check(altered), /GOVERNANCE_CHECK_FAILED/u);
  const withoutIdentity = { ...m2 }; delete withoutIdentity.m2Authority;
  await assert.rejects(check(withoutIdentity), /bounded private checkpoint/u);
  await assert.rejects(check(m2, null), /M2 authority verification failed/u);
  await assert.rejects(check(m2, { ...authority, ledgerBytes: Buffer.from('{}') }), /M2 authority verification failed/u);
  await assert.rejects(check(m2, { ...authority,
    decisionMarkdown: accepted.replace('approved_by: product-owner', 'approved_by: reviewer') }), /M2 authority verification failed/u);
});
