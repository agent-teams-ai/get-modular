import assert from 'node:assert/strict';
import test from 'node:test';
import * as core from '../../dist/index.js';
import { rawDocumentCases } from '../../../../tests/qualification/m2-candidate/raw-document-cases.mjs';
import {
  produceRuntimeFixtures, runtimeFixtures,
} from '../../../../tests/qualification/support/m3-runtime-fixture-producer.mjs';
import {
  materializeDocument, materializeRuntimeInput,
} from '../../../../tests/qualification/support/m3-runtime-materializers.mjs';
import {
  executeRuntimeFixture, executeRuntimeFixtures,
} from '../../../../tests/qualification/support/m3-runtime-executor.mjs';

// Disposable Node execution of the portable slice against the generated public
// dist root. This is not packed-root, Chromium, Electron, foreign-realm, Buffer,
// full successor-inventory, or complete M3 qualification evidence.
const baseline = runtimeFixtures.find(row => row.id.endsWith('/baseline'));
const subject = compileCompositionJson => ({ ...core, compileCompositionJson });

function freeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

test('producer preserves all independent expectations and lossless recipes', () => {
  const original = [...rawDocumentCases()];
  assert.equal(runtimeFixtures.length, 123);
  assert.equal(new Set(runtimeFixtures.map(row => row.id)).size, 123);
  assert.deepStrictEqual(runtimeFixtures, original.map(row => ({
    id: row.caseId, inputRecipe: row.inputRecipe, expected: row.expected,
  })));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(runtimeFixtures)), runtimeFixtures);
  assert.throws(() => produceRuntimeFixtures([original[0], original[0]]),
    /duplicate fixture ID/);
  assert.throws(() => produceRuntimeFixtures(original.slice(1)), /complete raw-document/);
});

test('all 123 portable fixtures execute through the generated public root', async () => {
  const transported = JSON.parse(JSON.stringify(runtimeFixtures));
  const records = await executeRuntimeFixtures(core, transported);
  assert.equal(records.length, 123);
  records.forEach((record, index) => {
    assert.equal(record.id, transported[index].id);
    assert.deepStrictEqual(record.result, transported[index].expected);
    assert.ok(record.observations.containers > 0);
    assert.ok(record.observations.mutationRejections > 0);
    assert.ok(record.observations.mutatedBuffers > 0);
    assert.equal(record.observations.callerWrapperMutated, true);
  });
});

test('executor rejects missing freeze, wrong results and deferred byte ownership', async () => {
  await assert.rejects(executeRuntimeFixture(subject(async () =>
    structuredClone(baseline.expected)), baseline), /not frozen/);
  const wrong = structuredClone(baseline.expected);
  wrong.digest = 'sha256:wrong';
  await assert.rejects(executeRuntimeFixture(subject(async () =>
    freeze(wrong)), baseline), /result value mismatch/);
  await assert.rejects(executeRuntimeFixture(subject(async input => {
    // Retain the original views while delaying their byte reads.
    const delayed = { declarations: input.declarations.slice(), profile: input.profile };
    await Promise.resolve();
    return core.compileCompositionJson(delayed);
  }), baseline), /result (keys|value) mismatch/);
});

test('executor observes extra undefined keys and nonordinary nested prototypes', async () => {
  const extra = structuredClone(baseline.expected);
  extra.unexpected = undefined;
  await assert.rejects(executeRuntimeFixture(subject(async () =>
    freeze(extra)), baseline), /result keys mismatch/);
  const prototype = structuredClone(baseline.expected);
  Object.setPrototypeOf(prototype.plan, null);
  await assert.rejects(executeRuntimeFixture(subject(async () =>
    freeze(prototype)), baseline), /local ordinary prototype/);
});

test('executor enforces exactly the accepted public runtime exports', async () => {
  const missing = { ...core };
  delete missing.required;
  await assert.rejects(executeRuntimeFixture(missing, baseline), /public runtime exports/);
  await assert.rejects(executeRuntimeFixture({ ...core, default: core }, baseline),
    /public runtime exports/);
  await assert.rejects(executeRuntimeFixtures(core,
    runtimeFixtures.map((row, index) => index === 1 ? runtimeFixtures[0] : row)),
  /duplicate fixture ID/);
});

test('materializers preserve text and reject malformed recipes', () => {
  const source = ' \n{"n":1.0000000000000001,"n":-0,"s":"\\uD800"}\r\n';
  assert.deepStrictEqual(materializeDocument({ kind: 'utf8', source }),
    new TextEncoder().encode(source));
  assert.deepStrictEqual(materializeDocument({ kind: 'hex', source: '00aF80ff' }),
    new Uint8Array([0, 175, 128, 255]));
  for (const recipe of [
    null, {}, { kind: 'unknown' }, { kind: 'utf8', source: 1 },
    { kind: 'hex', source: '0' }, { kind: 'hex', source: 'gg' },
    { kind: 'hex', source: 'ab cd' }, { kind: 'shared', source: '{' },
    { kind: 'utf8', get source() { throw new Error('must not read accessor'); } },
  ]) {
    assert.throws(() => materializeDocument(recipe), TypeError);
  }
  assert.throws(() => materializeRuntimeInput({ declarations: [], profile: {} }), TypeError);
  assert.throws(() => materializeRuntimeInput({ declarations: [,,], profile: {} }), TypeError);
});
