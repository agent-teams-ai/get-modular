import assert from 'node:assert/strict';
import { isUtf8 } from 'node:buffer';
import { readdir, realpath, statfs } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { absolute, captureOutsideAnchor, createOutputDirectory, digest, readBytes,
  retainedLimits, writeExclusive } from './m1-retained-observations.mjs';
import { checkOrdinaryBudget, encodeOrdinaryValue, ordinaryNeed as need, ordinaryValueLimits } from './ordinary-result-format.mjs';

// One bounded file per complete JSON observation, independent of stdout and
// producer pass flags. The trusted caller supplies the COMPLETE inventory and
// expectations, including construction/subject identity and invocation order.
// This primitive neither discovers that inventory nor authenticates a subject.
// Actual compiler calls and their immediate mutations remain in the caller;
// retain() runs afterwards. Historical M1 sessions are unchanged.
const FORMAT = 'private-ordinary-results/1';
const metadataBudget = { maxBytes: retainedLimits.jsonBytes, maxNodes: ordinaryValueLimits.nodes };
const plans = new WeakMap();
const hash = value => need(typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value), 'outside-hash-required');
const text = value => need(typeof value === 'string' && value.length > 0 && value.length <= 1024, 'identity-text');
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function known(plan) {
  const result = plans.get(plan);
  need(result, 'prepared-plan-required');
  return result;
}
const encoded = value => encodeOrdinaryValue(value, metadataBudget);
function manifestRow(row, bytes, sha256) {
  return { ordinal: row.ordinal, id: row.id, file: row.file, bytes, sha256 };
}

export function prepareOrdinaryResults({ context, assignments }) {
  need(context && typeof context === 'object' && !Array.isArray(context), 'context-record');
  need(Array.isArray(assignments) && assignments.length > 0
    && assignments.length * 2 + 4 <= retainedLimits.entries, 'assignment-count');
  const ids = new Set(), expected = [], rows = [];
  for (const [ordinal, assignment] of assignments.entries()) {
    const { id, vectorId, entrypoint, subject, construction, maxBytes, maxNodes } = assignment;
    text(id); text(vectorId);
    need(!ids.has(id), 'duplicate-assignment'); ids.add(id);
    need(['compileComposition', 'compileCompositionJson'].includes(entrypoint), 'ordinary-entrypoint');
    need(subject && typeof subject === 'object' && !Array.isArray(subject), 'subject-record');
    need(construction && typeof construction === 'object' && !Array.isArray(construction), 'construction-record');
    checkOrdinaryBudget({ maxBytes, maxNodes });
    const expectedBytes = encodeOrdinaryValue(assignment.expected, { maxBytes, maxNodes });
    // Independent semantic comparison uses a snapshot of the original expected
    // value, not the serializer's parsed output or a candidate-derived value.
    expected.push(freeze(structuredClone(assignment.expected)));
    rows.push({ ordinal, id, vectorId, entrypoint, subject, construction,
      file: `${String(ordinal).padStart(6, '0')}.json`, maxBytes, maxNodes,
      expectedBytes: expectedBytes.length, expectedSha256: digest(expectedBytes) });
  }
  const manifestBytes = encoded({ format: FORMAT, context, rows });
  const manifest = freeze(JSON.parse(manifestBytes.toString('utf8')));
  const planSha256 = digest(manifestBytes);
  const indexMaximum = encoded({ format: FORMAT, planSha256,
    files: manifest.rows.map(row => manifestRow(row, row.maxBytes, '0'.repeat(64))) }).length;
  const resultReservation = manifest.rows.reduce((sum, row) => sum + row.maxBytes, 0);
  const temporaryReservation = Math.max(manifestBytes.length, indexMaximum, ...manifest.rows.map(row => row.maxBytes));
  const reservationBytes = resultReservation + manifestBytes.length + indexMaximum + temporaryReservation;
  need(Number.isSafeInteger(reservationBytes) && reservationBytes <= retainedLimits.treeBytes, 'session-byte-budget');
  const plan = Object.freeze({ planSha256, reservationBytes, count: manifest.rows.length });
  plans.set(plan, { manifest, manifestBytes, expected, indexMaximum });
  return plan;
}

export async function createOrdinaryResultStore(plan, { directory, onPlan, onResults }) {
  const prepared = known(plan);
  need(typeof onPlan === 'function' && typeof onResults === 'function', 'outside-sinks-required');
  absolute(directory);
  const capacity = await statfs(dirname(directory), { bigint: true });
  need(capacity.bavail * capacity.bsize >= BigInt(plan.reservationBytes), 'available-storage');
  await createOutputDirectory(directory);
  await writeExclusive(join(directory, 'plan.json'), prepared.manifestBytes);
  await captureOutsideAnchor(onPlan, { directory, planSha256: plan.planSha256 });
  const positions = new Map(prepared.manifest.rows.map(row => [row.id, row.ordinal]));
  const claimed = new Set(), files = new Array(plan.count);
  let inFlight = 0, failed = false, closed = false;
  return Object.freeze({
    async retain(id, actual) {
      try {
        need(!failed && !closed, 'store-closed');
        need(positions.has(id) && !claimed.has(id), 'unknown-or-duplicate-result');
        claimed.add(id); inFlight += 1;
        try {
          const ordinal = positions.get(id), row = prepared.manifest.rows[ordinal];
          const bytes = encodeOrdinaryValue(actual, row);
          await writeExclusive(join(directory, row.file), bytes);
          files[ordinal] = manifestRow(row, bytes.length, digest(bytes));
        } finally { inFlight -= 1; }
      } catch (error) { failed = true; throw error; }
    },
    async finish() {
      try {
        need(!failed && !closed && inFlight === 0 && claimed.size === plan.count
          && files.every(Boolean), 'incomplete-results');
        closed = true;
        const bytes = encoded({ format: FORMAT, planSha256: plan.planSha256, files });
        need(bytes.length <= prepared.indexMaximum, 'index-reservation');
        await writeExclusive(join(directory, 'index.json'), bytes);
        const receipt = { directory, planSha256: plan.planSha256, indexSha256: digest(bytes) };
        await captureOutsideAnchor(onResults, receipt);
        return Object.freeze(receipt);
      } catch (error) { failed = true; throw error; }
    },
  });
}

export async function verifyOrdinaryResults(plan, { directory, planSha256, indexSha256 }) {
  const prepared = known(plan);
  absolute(directory); hash(planSha256); hash(indexSha256);
  assert.equal(await realpath(directory), directory, 'canonical result directory');
  assert.equal(planSha256, plan.planSha256, 'outside plan anchor differs from trusted inventory');
  const planBytes = await readBytes(join(directory, 'plan.json'), metadataBudget.maxBytes);
  assert.deepEqual(planBytes, prepared.manifestBytes, 'retained plan differs from trusted inventory');
  const indexBytes = await readBytes(join(directory, 'index.json'), prepared.indexMaximum);
  assert.equal(digest(indexBytes), indexSha256, 'result index differs from outside anchor');
  need(isUtf8(indexBytes), 'index-utf8');
  const index = JSON.parse(indexBytes.toString('utf8'));
  assert.deepEqual(indexBytes, encoded(index), 'noncanonical result index');
  assert.deepEqual(Object.keys(index).sort(), ['files', 'format', 'planSha256']);
  assert.equal(index.format, FORMAT); assert.equal(index.planSha256, planSha256);
  need(Array.isArray(index.files) && index.files.length === plan.count, 'result-inventory');
  const names = ['plan.json', 'index.json', ...prepared.manifest.rows.map(row => row.file)].sort();
  assert.deepEqual((await readdir(directory)).sort(), names, 'extra or missing retained files');
  for (const row of prepared.manifest.rows) {
    const reference = index.files[row.ordinal];
    hash(reference?.sha256);
    need(Number.isSafeInteger(reference.bytes) && reference.bytes > 0 && reference.bytes <= row.maxBytes, 'result-byte-reservation');
    assert.deepEqual(reference, manifestRow(row, reference.bytes, reference.sha256), 'foreign or reordered result reference');
    const bytes = await readBytes(join(directory, row.file), row.maxBytes);
    assert.equal(bytes.length, reference.bytes); assert.equal(digest(bytes), reference.sha256);
    need(isUtf8(bytes), 'result-utf8');
    const actual = JSON.parse(bytes.toString('utf8'));
    assert.deepEqual(bytes, encodeOrdinaryValue(actual, row), 'noncanonical or lossy result');
    assert.deepEqual(actual, prepared.expected[row.ordinal], `complete result mismatch: ${row.id}`);
  }
  return Object.freeze({ count: plan.count, scope: 'complete-json-observations-against-supplied-trusted-inventory' });
}
