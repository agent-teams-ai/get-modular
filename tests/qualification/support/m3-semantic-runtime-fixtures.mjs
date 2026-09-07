// Node-only independent evidence preparation; never import a Core subject.
// This is the 818 complete-result semantic subset, not the original raw 185,
// descriptor coverage, P500, or full runtime conformance.
import assert from 'node:assert/strict';
import {
  duplicateRecordBaseCases, duplicateRecordRowFailureCases,
  duplicateRecordOverlapCases, duplicateRecordPermutationCases,
} from '../m2-candidate/duplicate-record-cases.mjs';
import {
  duplicateRecordOrderingCases, duplicateRecordShuffledOrderingCases,
  duplicateRecordCollectorCases,
} from '../m2-candidate/duplicate-record-ordering.mjs';
import { duplicateRecordExtendedOverlapCases } from '../m2-candidate/duplicate-record-extended-overlaps.mjs';
import { m2ResourceOutcomeCases } from './m2-resource-outcomes.mjs';

export const semanticRuntimeCounts = Object.freeze({
  cardinality: 18, rowFailures: 35, overlap: 5, permutations: 727,
  ordering: 3, orderingShuffle: 3, collector: 9, extendedOverlaps: 12,
  resources: 6,
});

const categories = [
  ['cardinality', duplicateRecordBaseCases],
  ['rowFailures', duplicateRecordRowFailureCases],
  ['overlap', duplicateRecordOverlapCases],
  ['permutations', duplicateRecordPermutationCases],
  ['ordering', duplicateRecordOrderingCases],
  ['orderingShuffle', duplicateRecordShuffledOrderingCases],
  ['collector', duplicateRecordCollectorCases],
  ['extendedOverlaps', duplicateRecordExtendedOverlapCases],
  ['resources', m2ResourceOutcomeCases],
];
const relationId = 'od006.extended-overlap.v1/ordered-many-reversal';
const MiB = 1024 * 1024;

function portable(value, label) {
  const copy = JSON.parse(JSON.stringify(value));
  // Includes finite numbers, negative zero, undefined, holes and prototypes.
  assert.deepStrictEqual(copy, value, `${label}: lossless ordinary JSON`);
  return copy;
}

function rawEligibility(input) {
  let aggregateBytes = 0;
  const size = (value, limit) => {
    const bytes = Buffer.byteLength(JSON.stringify(value), 'utf8');
    assert.ok(bytes <= limit, 'semantic fixture exceeds raw document limit');
    aggregateBytes += bytes;
    return bytes;
  };
  const declarationBytes = input.declarations.map(value => size(value, MiB));
  const profileBytes = size(input.profile, 8 * MiB);
  assert.ok(aggregateBytes <= 16 * MiB, 'semantic fixture exceeds aggregate raw limit');
  return { declarationBytes, profileBytes, aggregateBytes };
}

export function* produceSemanticRuntimeFixtures() {
  const ids = new Set();
  let skippedRelations = 0;
  for (const [category, generate] of categories) {
    let count = 0;
    for (const row of generate()) {
      if (row.expected === undefined) {
        assert.equal(category, 'extendedOverlaps');
        assert.equal(row.caseId, relationId);
        skippedRelations += 1;
        continue;
      }
      assert.equal(typeof row.caseId, 'string');
      assert.ok(row.caseId.length > 0);
      assert.ok(!ids.has(row.caseId), `duplicate semantic ID: ${row.caseId}`);
      ids.add(row.caseId);
      const fixture = portable({
        id: row.caseId, category, input: row.input, expected: row.expected,
      }, row.caseId);
      assert.equal(typeof fixture.expected.ok, 'boolean');
      assert.deepEqual(Object.keys(fixture.expected).sort(), fixture.expected.ok
        ? ['digest', 'ok', 'plan'] : ['diagnostics', 'ok']);
      fixture.rawEligibility = rawEligibility(fixture.input);
      count += 1;
      yield fixture;
    }
    assert.equal(count, semanticRuntimeCounts[category], `${category}: complete inventory`);
  }
  assert.equal(skippedRelations, 1, 'exactly one excluded relational pair');
  assert.equal(ids.size, 818, 'complete semantic subset');
}
