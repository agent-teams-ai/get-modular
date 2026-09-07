import assert from 'node:assert/strict';
import { jsonBytes, need, retainedLimits, verifyCaseObservations,
  verifyObservationAnchor } from './m1-retained-observations.mjs';

// Private transport interpretation, independent of the producer. expectedPlan
// comes from trusted preparation, never from the journal being interpreted.
// Small inventories are useful for truthful transport unit tests; the adapter
// separately requires the complete current 282-case harness inventory.
export function verifyM3RuntimeObservations({
  expectedPlan, events, anchor, observationsSha256, contextId, archive, inventory,
}) {
  need(typeof anchor === 'string' && /^[a-f0-9]{64}$/u.test(anchor), 'outside-seal-anchor-required');
  const cases = expectedPlan.cases;
  need(Array.isArray(cases) && cases.length > 0 && cases.length <= 512, 'case-inventory');
  const ids = cases.map(row => row.id);
  need(ids.every(id => typeof id === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,159}$/u.test(id)), 'case-id');
  need(new Set(ids).size === ids.length, 'duplicate-case-inventory');
  need(Array.isArray(events) && events.length <= retainedLimits.records, 'event-inventory');
  let total = 0;
  for (const [sequence, event] of events.entries()) {
    const bytes = jsonBytes(event).length;
    total += bytes;
    need(bytes <= retainedLimits.recordBytes && total <= retainedLimits.journalBytes,
      'event-byte-budget');
    assert.deepEqual(Object.keys(event).sort(), ['anchor', 'archiveIdentity', 'caseId',
      'contextId', 'details', 'kind', 'rowSha256', 'sequence'].sort());
    assert.equal(event.sequence, sequence);
    assert.equal(event.anchor, anchor);
  }
  verifyObservationAnchor(events, observationsSha256);
  let position = 0;
  for (const row of cases) {
    const start = position;
    while (position < events.length && events[position].caseId === row.id) position += 1;
    need(position > start, `missing-case:${row.id}`);
    verifyCaseObservations(row, events.slice(start, position), { contextId, archive, inventory });
  }
  assert.equal(events.length, position + 1, 'exactly one terminal event follows the complete inventory');
  assert.deepEqual(events[position], {
    sequence: position, anchor, contextId, archiveIdentity: archive.identity,
    caseId: null, rowSha256: null, kind: 'session-ended', details: { completed: ids },
  });
  return Object.freeze({ completed: Object.freeze([...ids]), scope: 'transport-and-case-expectations' });
}

export function assertM3RuntimeIdentity({ runtimeCaseId, sourceCommit, trustedRunner }) {
  const platforms = new Map([
    ['node-24-linux', 'linux'], ['node-24-macos', 'darwin'], ['node-24-windows', 'win32'],
  ]);
  need(platforms.has(runtimeCaseId), 'accepted-node-case-required');
  assert.equal(process.platform, platforms.get(runtimeCaseId), 'accepted runtime case requires its actual OS');
  for (const value of [sourceCommit, trustedRunner?.commit]) {
    need(typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value), 'exact-source-sha-required');
  }
}

export function freezeRuntimeData(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeRuntimeData(child);
    Object.freeze(value);
  }
  return value;
}
