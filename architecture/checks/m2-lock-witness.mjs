// Development-only successor custody. The supplied reader owns one Git snapshot
// and its completion reread; this adapter has no filesystem or mapping options.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { M2_EVIDENCE_LEDGER } from './m2-evidence.mjs';

export const M2_LOCK_DECISION = 'docs/decisions/0024-separate-historical-m2-lock-custody-from-current-dependencies.md';
export const M2_ORIGINAL_DECISION = 'docs/decisions/0021-freeze-combined-diagnostic-generation-two-for-m2.md';
export const M2_LOCK_WITNESS = 'architecture/qualification/generation-two/historical-pnpm-lock.yaml';
export const M2_LEDGER_DIGEST = 'sha256:3781993b5714d8f8928ca2a2082353f93bc42b0e69a3373bd9cfaa41963f7f61';
export const m2Digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const SUCCESSOR_DIGEST = 'sha256:b8ff9171aa665b7baff22b07893e08c0fcf1773e0ec95ffbe3b93ae66b31aab6';
const ORIGINAL_DIGEST = 'sha256:f69aa07ac719e8b317924753cf6375e32adee83b937cb4c450a87b0395da22de';

export async function readCurrentM2Authority(readGovernanceInput) {
  const read = async path => {
    const bytes = await readGovernanceInput(path, 'M2 custody input');
    assert(Buffer.isBuffer(bytes), path);
    return bytes;
  };
  assert.equal(m2Digest(await read(M2_LOCK_DECISION)), SUCCESSOR_DIGEST, 'M2 accepted lock successor');
  const decision = await read(M2_ORIGINAL_DECISION);
  assert.equal(m2Digest(decision), ORIGINAL_DIGEST, 'M2 original authority');
  const ledgerBytes = await read(M2_EVIDENCE_LEDGER);
  assert.equal(m2Digest(ledgerBytes), M2_LEDGER_DIGEST, 'M2 original ledger');
  const ledger = JSON.parse(ledgerBytes);
  const locks = ledger.artifacts.filter(row => row.path === 'pnpm-lock.yaml');
  assert.equal(locks.length, 1);
  const witness = await read(M2_LOCK_WITNESS);
  assert.equal(m2Digest(witness), locks[0].immutableDigest, 'M2 historical lock witness');
  const currentTooling = [];
  for (const path of ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml']) {
    const bytes = await read(path);
    currentTooling.push(Object.freeze({ path, digest: m2Digest(bytes), bytes: bytes.length }));
  }
  // Only the literal ledger lock key changes meaning. All other reads remain
  // current and observed, including immutable checker, recipe and suite bytes.
  const readBytes = path => path === 'pnpm-lock.yaml' ? Buffer.from(witness) : read(path);
  for (const row of ledger.artifacts) {
    assert.equal(m2Digest(await readBytes(row.path)), row.immutableDigest, row.path);
  }
  return Object.freeze({ decisionMarkdown: decision.toString('utf8'), ledgerBytes, readBytes,
    toolingEvidence: Object.freeze({ scope: 'current-tooling-inputs-not-installation-proof',
      inputs: Object.freeze(currentTooling) }),
    historicalLock: Object.freeze({ path: M2_LOCK_WITNESS, digest: locks[0].immutableDigest }) });
}
