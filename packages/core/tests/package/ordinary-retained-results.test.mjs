import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { encodeOrdinaryValue, ordinaryValueLimits } from '../../../../tests/qualification/support/ordinary-result-format.mjs';
import { createOrdinaryResultStore, prepareOrdinaryResults, verifyOrdinaryResults } from '../../../../tests/qualification/support/ordinary-result-store.mjs';
import { expectedDigest, expectedP500Plan, p500Digest } from '../../../../tests/qualification/support/scale-output.mjs';

// Controlled TEST storage and real unretained Core observations. These tests
// do not qualify an archive or claim that M2/M3 retained execution is complete.
const budget = { maxBytes: 16 * 1024 * 1024, maxNodes: 200_000 };
const hash = value => createHash('sha256').update(value).digest('hex');
const failure = { ok: false, diagnostics: [{ code: 'schema.invalid-value', phase: 'schema',
  path: [], coordinate: {}, details: { reason: 'invalid-format' } }] };
const context = { kind: 'controlled-TEST', run: 'ordinary-results' };
const assignment = (expected, id = 'TEST/0', extra = {}) => ({ id, vectorId: id,
  entrypoint: 'compileComposition', subject: { kind: 'controlled-TEST', identity: 'subject-A' },
  construction: { kind: 'controlled-TEST-literal', recipe: id }, expected,
  maxBytes: budget.maxBytes, maxNodes: budget.maxNodes, ...extra });

async function setup(t, assignments = [assignment(failure)], suppliedPlan) {
  const parent = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'gm-TEST-results-')));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const directory = join(parent, 'results');
  const plan = suppliedPlan ?? prepareOrdinaryResults({ context, assignments });
  let planAnchor, resultAnchor;
  const writer = await createOrdinaryResultStore(plan, { directory,
    onPlan: async value => { planAnchor = value; },
    onResults: async value => { resultAnchor = value; },
  });
  return { parent, directory, plan, writer,
    anchors: () => ({ ...planAnchor, indexSha256: resultAnchor?.indexSha256 }),
    verify: () => verifyOrdinaryResults(plan, { ...planAnchor, indexSha256: resultAnchor?.indexSha256 }) };
}
async function completed(t, expected = failure) {
  const f = await setup(t, [assignment(expected)]);
  await f.writer.retain('TEST/0', expected);
  await f.writer.finish();
  return f;
}
async function rewriteIndex(f, mutate) {
  const path = join(f.directory, 'index.json');
  const index = JSON.parse(await fs.readFile(path, 'utf8'));
  mutate(index);
  const bytes = encodeOrdinaryValue(index, budget);
  await fs.writeFile(path, bytes);
  return { ...f.anchors(), indexSha256: hash(bytes) };
}

test('strict transport has literal scalar/key ordering and preserves repeated DAG occurrences', () => {
  const shared = { x: 1 };
  const value = { z: [shared, shared], a: '\u0000\n😀', n: 1.5 };
  const bytes = encodeOrdinaryValue(value, budget);
  assert.equal(bytes.toString(), '{"a":"\\u0000\\n😀","n":1.5,"z":[{"x":1},{"x":1}]}\n');
  assert.deepEqual(JSON.parse(bytes.toString()), value);
  assert.equal(encodeOrdinaryValue(value, { ...budget, maxBytes: bytes.length }).length, bytes.length);
  assert.throws(() => encodeOrdinaryValue(value, { ...budget, maxBytes: bytes.length - 1 }));
});
test('bounded scalar escaping preserves boundary surrogate pairs, lone surrogates and JSON escapes', () => {
  for (const suffix of ['😀', '\ud800', '\udfff', '\\"\n\u0000']) {
    const value = 'x'.repeat(4095) + suffix + 'y'.repeat(4100);
    assert.equal(encodeOrdinaryValue(value, budget).toString(), JSON.stringify(value) + '\n');
  }
  const original = JSON.stringify;
  let largest = 0;
  try {
    JSON.stringify = (value, ...args) => {
      if (typeof value === 'string') largest = Math.max(largest, value.length);
      return original(value, ...args);
    };
    assert.throws(() => encodeOrdinaryValue('x'.repeat(1_000_000), { maxBytes: 64, maxNodes: 10 }));
  } finally { JSON.stringify = original; }
  assert.ok(largest <= 4097, 'an oversized scalar is never passed whole to the native encoder');
});
for (const [name, make] of [
  ['undefined', () => ({ lost: undefined })], ['function', () => ({ lost() {} })],
  ['symbol value', () => [Symbol('x')]], ['symbol key', () => ({ [Symbol('x')]: 1 })],
  ['BigInt', () => 1n], ['NaN', () => NaN], ['Infinity', () => Infinity], ['negative zero', () => -0],
  ['sparse array', () => new Array(1)], ['extra array key', () => Object.assign([], { extra: 1 })],
  ['Date', () => new Date(0)], ['cycle', () => { const x = {}; x.self = x; return x; }],
  ['nonenumerable data', () => Object.defineProperty({}, 'x', { value: 1 })],
]) test(`strict transport rejects ${name} without losing observations`, () => {
  assert.throws(() => encodeOrdinaryValue(make(), budget), { code: 'ordinary.result.invalid' });
});
test('strict transport does not invoke object or array getters', () => {
  let calls = 0;
  for (const value of [Object.defineProperty({}, 'x', { enumerable: true, get() { calls++; return 1; } }),
    Object.defineProperty([1], '0', { enumerable: true, get() { calls++; return 1; } })]) {
    assert.throws(() => encodeOrdinaryValue(value, budget));
  }
  assert.equal(calls, 0);
});
test('finite node, depth and reservation limits reject before result publication', () => {
  assert.throws(() => encodeOrdinaryValue([null, null], { maxBytes: 100, maxNodes: 2 }));
  let value = null;
  for (let i = 0; i <= ordinaryValueLimits.depth; i++) value = [value];
  assert.throws(() => encodeOrdinaryValue(value, budget));
  for (const maxBytes of [0, -1, Infinity, Number.MAX_SAFE_INTEGER, 268435457]) {
    assert.throws(() => prepareOrdinaryResults({ context, assignments: [assignment(null, 'TEST/0', { maxBytes })] }));
  }
  assert.throws(() => prepareOrdinaryResults({ context, assignments:
    Array.from({ length: 9 }, (_, i) => assignment(null, `TEST/${i}`, { maxBytes: 256 * 1024 * 1024 })) }),
  { reason: 'session-byte-budget' });
  assert.throws(() => prepareOrdinaryResults({ context, assignments: [assignment(failure, 'TEST/0', { maxBytes: 2 })] }));
  assert.throws(() => prepareOrdinaryResults({ context, assignments: [assignment(null), assignment(null)] }));
});

test('complete results bind a trusted plan and separately captured outside index', async t => {
  const f = await completed(t);
  assert.deepEqual(await f.verify(), { count: 1, scope: 'complete-json-observations-against-supplied-trusted-inventory' });
  assert.deepEqual(JSON.parse(await fs.readFile(join(f.directory, '000000.json'), 'utf8')), failure);
  await assert.rejects(verifyOrdinaryResults(f.plan, { directory: f.directory }), /outside-hash/);
});
test('completion order cannot swap assigned members or their source/entrypoint bindings', async t => {
  const rows = [assignment({ member: 'first' }, 'TEST/first'),
    assignment({ member: 'second' }, 'TEST/second', { entrypoint: 'compileCompositionJson' })];
  const f = await setup(t, rows);
  await Promise.all([f.writer.retain('TEST/second', rows[1].expected), f.writer.retain('TEST/first', rows[0].expected)]);
  await f.writer.finish();
  assert.equal((await f.verify()).count, 2);
  const anchors = await rewriteIndex(f, index => index.files.reverse());
  await assert.rejects(verifyOrdinaryResults(f.plan, anchors), /foreign or reordered/);
});
test('trusted preparation snapshots values and identity instead of retaining caller aliases', async t => {
  const row = assignment({ a: 1 });
  const plan = prepareOrdinaryResults({ context, assignments: [row] });
  row.expected.a = 2; row.subject.identity = 'changed'; row.construction.recipe = 'changed';
  const f = await setup(t, [], plan);
  await f.writer.retain('TEST/0', { a: 1 }); await f.writer.finish();
  assert.equal((await f.verify()).count, 1);
});
test('a producer pass marker without its complete expected result cannot qualify', async t => {
  const f = await setup(t);
  await f.writer.retain('TEST/0', { passed: true }); await f.writer.finish();
  await assert.rejects(f.verify(), /complete result mismatch/);
});
test('semantic mismatch is retained completely and remains separate from later rows', async t => {
  const f = await setup(t, [assignment(failure), assignment({ ok: true }, 'TEST/1')]);
  const wrong = { ...failure, plan: {}, digest: 'wrong' };
  await f.writer.retain('TEST/0', wrong); await f.writer.retain('TEST/1', { ok: true });
  await f.writer.finish();
  assert.deepEqual(JSON.parse(await fs.readFile(join(f.directory, '000000.json'), 'utf8')), wrong);
  await assert.rejects(f.verify(), /complete result mismatch/);
});
test('rewriting bytes and local hashes cannot bypass outside anchors or semantic comparison', async t => {
  const f = await completed(t);
  const wrong = encodeOrdinaryValue({ ok: false, diagnostics: [] }, budget);
  await fs.writeFile(join(f.directory, '000000.json'), wrong);
  const anchors = await rewriteIndex(f, index => {
    index.files[0].bytes = wrong.length; index.files[0].sha256 = hash(wrong);
  });
  await assert.rejects(f.verify(), /outside anchor/);
  // A separately anchored controlled test still has independent expectations.
  await assert.rejects(verifyOrdinaryResults(f.plan, anchors), /complete result mismatch/);
});
for (const [name, change] of [
  ['source', row => { row.subject.identity = 'foreign'; }],
  ['constructor', row => { row.construction.recipe = 'foreign'; }],
  ['entrypoint', row => { row.entrypoint = 'compileCompositionJson'; }],
  ['vector', row => { row.vectorId = 'foreign'; }],
]) test(`outside inventory rejects changed ${name}`, async t => {
  const f = await completed(t), row = assignment(failure); change(row);
  const foreign = prepareOrdinaryResults({ context, assignments: [row] });
  await assert.rejects(verifyOrdinaryResults(foreign, f.anchors()), /outside plan anchor/);
});
for (const attack of ['missing', 'extra', 'symlink', 'trailing bytes']) {
  test(`physical retention rejects ${attack}`, async t => {
    const f = await completed(t), path = join(f.directory, '000000.json');
    if (attack === 'missing') await fs.unlink(path);
    if (attack === 'extra') await fs.writeFile(join(f.directory, 'unassigned.json'), '{}');
    if (attack === 'symlink') {
      const outside = join(f.parent, 'outside.json'); await fs.rename(path, outside); await fs.symlink(outside, path);
    }
    if (attack === 'trailing bytes') await fs.appendFile(path, '\n');
    await assert.rejects(f.verify());
  });
}
test('incomplete, duplicate and oversized result attempts cannot publish successful completion', async t => {
  const missing = await setup(t); await assert.rejects(missing.writer.finish());
  await assert.rejects(fs.access(join(missing.directory, 'index.json')));
  const duplicate = await setup(t); await duplicate.writer.retain('TEST/0', failure);
  await assert.rejects(duplicate.writer.retain('TEST/0', failure)); await assert.rejects(duplicate.writer.finish());
  const oversized = await setup(t, [assignment(null, 'TEST/0', { maxBytes: 5 })]);
  await assert.rejects(oversized.writer.retain('TEST/0', 'too large')); await assert.rejects(oversized.writer.finish());
});
test('exclusive publication preserves a colliding file and failed partial', async t => {
  const f = await setup(t), path = join(f.directory, '000000.json');
  await fs.writeFile(path, 'existing TEST bytes');
  await assert.rejects(f.writer.retain('TEST/0', failure)); await assert.rejects(f.writer.finish());
  assert.equal(await fs.readFile(path, 'utf8'), 'existing TEST bytes');
  assert.deepEqual(JSON.parse(await fs.readFile(path + '.partial', 'utf8')), failure);
});
test('outside capture failure is awaited and cannot return a completed receipt', async t => {
  const parent = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'gm-TEST-anchor-')));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const plan = prepareOrdinaryResults({ context, assignments: [assignment(failure)] });
  const unavailable = async () => { throw new Error('TEST outside sink unavailable'); };
  await assert.rejects(createOrdinaryResultStore(plan, { directory: join(parent, 'early'),
    onPlan: unavailable, onResults: async () => {} }), /outside sink unavailable/);
  await assert.rejects(fs.access(join(parent, 'early', 'index.json')));
  const writer = await createOrdinaryResultStore(plan, { directory: join(parent, 'late'),
    onPlan: async () => {}, onResults: unavailable });
  await writer.retain('TEST/0', failure);
  await assert.rejects(writer.finish(), /outside sink unavailable/);
  await assert.rejects(writer.finish(), /incomplete-results/);
});
test('even a separately anchored duplicate-key payload cannot erase observed data', async t => {
  const f = await completed(t, { a: 2 });
  const bytes = Buffer.from('{"a":1,"a":2}\n');
  await fs.writeFile(join(f.directory, '000000.json'), bytes);
  const anchors = await rewriteIndex(f, index => {
    index.files[0].bytes = bytes.length; index.files[0].sha256 = hash(bytes);
  });
  await assert.rejects(verifyOrdinaryResults(f.plan, anchors), /noncanonical or lossy/);
});
test('a complete observation larger than the old journal record stays in its own file', async t => {
  const expected = { controlledLargeObservation: '\u0000'.repeat(1_500_000) };
  const f = await completed(t, expected);
  assert.ok((await fs.stat(join(f.directory, '000000.json'))).size > 8 * 1024 * 1024);
  assert.ok((await fs.stat(join(f.directory, 'index.json'))).size < 1024);
  assert.equal((await f.verify()).count, 1);
});
test('independent P500 expected bytes are retained whole without claiming a compiler run', async t => {
  const expected = { ok: true, plan: expectedP500Plan(), digest: p500Digest };
  const f = await completed(t, expected);
  assert.equal((await f.verify()).count, 1);
});
test('an actual ordinary M1 call retains its complete independently expected result', async t => {
  const { compileComposition } = await import('../../dist/index.js');
  const planValue = { kind: 'get-modular.composition-plan', schemaVersion: 1, profileId: 'x/p',
    roots: ['x/m'], selections: [{ moduleId: 'x/m', implementationId: 'x/i' }], bindings: [], dependencyOrder: ['x/i'] };
  const expected = { ok: true, plan: planValue, digest: expectedDigest(planValue) };
  const entry = await fs.readFile(new URL('../../dist/index.js', import.meta.url));
  const f = await setup(t, [assignment(expected, 'TEST/0', {
    subject: { kind: 'unretained-ordinary-Core-test', entrySha256: hash(entry) },
  })]);
  const actual = await compileComposition({ declarations: [{ kind: 'get-modular.module-declaration', schemaVersion: 1,
    moduleId: 'x/m', implementationId: 'x/i', owner: { authority: 'x', path: ['m'] }, provides: [], slots: [] }],
  profile: { kind: 'get-modular.composition-profile', schemaVersion: 1, profileId: 'x/p',
    roots: ['x/m'], selections: [{ moduleId: 'x/m', implementationId: 'x/i' }], bindings: [] } });
  await f.writer.retain('TEST/0', actual); await f.writer.finish();
  assert.equal((await f.verify()).count, 1);
});
for (const suffix of ['bindings/over', 'providersPerManySlot/over']) {
  test(`frozen resource disagreement stays observable and unqualified: ${suffix}`, async t => {
    const { compileComposition } = await import('../../dist/index.js');
    const { materializeDuplicateRecordResource } = await import('../../../../tests/qualification/m2-candidate/duplicate-record-resources.mjs');
    const id = `od006.resources.v1/${suffix}`, row = materializeDuplicateRecordResource(id);
    const f = await setup(t, [assignment(row.expected, id, {
      construction: { recipe: id, disposition: 'frozen-expectation-owner-choice-pending' },
      subject: { kind: 'unretained-ordinary-Core-test' },
    })]);
    const actual = await compileComposition(row.input);
    assert.notDeepEqual(actual, row.expected, 'this controlled negative does not accept a successor');
    await f.writer.retain(id, actual); await f.writer.finish();
    assert.deepEqual(JSON.parse(await fs.readFile(join(f.directory, '000000.json'), 'utf8')), actual);
    await assert.rejects(f.verify(), /complete result mismatch/);
  });
}
