import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { duplicateRecordResourceCases } from '../m2-candidate/duplicate-record-resources.mjs';
import { findRepoRoot, repoFileUrl } from './load-repo-json.mjs';
import { pathToFileURL } from 'node:url';

// Independent expected outcomes only. Original accepted files remain immutable.
// No Core import, candidate output or caller-selected replacement is accepted.
const root = pathToFileURL(findRepoRoot() + '/');
const bytes = readFileSync(new URL('architecture/qualification/m2-resource-outcomes/outcomes.json', root));
const sha = value => createHash('sha256').update(value).digest('hex');
assert.equal(sha(bytes), '9e4dc13ff0711c1026e827dfd0f0b4c9e8257478be7de412efea5c16b521d650');
const contract = JSON.parse(bytes);
assert.equal(sha(readFileSync(new URL(contract.source.path, root))), contract.source.sha256);
const corrections = new Map(contract.cases.map(row => [row.caseId, row.expected]));

export function* m2ResourceOutcomeCases() {
  assert.equal(arguments.length, 0, 'closed resource category');
  for (const row of duplicateRecordResourceCases()) {
    yield { caseId: row.caseId, input: row.input,
      expected: structuredClone(corrections.get(row.caseId) ?? row.expected) };
  }
}
