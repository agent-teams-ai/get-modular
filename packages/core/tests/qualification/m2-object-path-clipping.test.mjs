import assert from 'node:assert/strict';
import test from 'node:test';
import { compileComposition } from '../../dist/index.js';
import { admitObjectInput } from '../../dist-test/features/input-admission/object-admission.js';
import { createObjectResourceMeter } from '../../dist-test/features/input-admission/object-resource-meter.js';

// Expectations use literal safe local paths, without the production projector,
// documentPath, collector, or frozen checker to derive addresses or uniqueness.
const tagged = path => path.map(value => ({ kind: typeof value === 'string' ? 'field' : 'index', value }));
const nonPlain = path => ({ code: 'schema.non-plain-value', phase: 'schema', path: tagged(path),
  coordinate: {}, details: { reason: 'non-plain-value' } });
const invalidType = path => ({ code: 'schema.invalid-value', phase: 'schema', path: tagged(path),
  coordinate: {}, details: { reason: 'invalid-type' } });
const truncated = omitted => ({ code: 'diagnostics.truncated', phase: 'output', path: [],
  coordinate: {}, details: { omitted } });

function comparePaths(left, right) {
  for (let index = 0; index < Math.min(left.path.length, right.path.length); index += 1) {
    const a = left.path[index];
    const b = right.path[index];
    if (a.kind !== b.kind) return a.kind === 'field' ? -1 : 1;
    if (a.value !== b.value) return a.value < b.value ? -1 : 1;
  }
  return left.path.length - right.path.length;
}

function wrap(value, count) {
  for (let index = 0; index < count; index += 1) value = [value];
  return value;
}

async function expectDocument(kind, value, localPaths) {
  const input = kind === 'declaration' ? { declarations: [value], profile: [] }
    : { declarations: [], profile: value };
  const prefix = kind === 'declaration' ? ['declarations', 0] : ['profile'];
  const expected = localPaths.map(local => nonPlain([...prefix, ...local]));
  for (const diagnostic of expected) assert.ok(diagnostic.path.length <= 32);
  const independent = kind === 'declaration' ? [invalidType(['profile'])] : [];
  const observed = [];
  const admitted = admitObjectInput(input, { addUnique: diagnostic => observed.push(diagnostic) });
  // This sink deliberately retains every submission, exposing producer duplicates
  // before collection can change the count or retained subset.
  assert.deepEqual(observed, [...expected, ...independent]);
  assert.equal(admitted.hasErrors, true);
  assert.deepEqual(admitted.declarations, []);
  assert.equal(admitted.profile, null);
  assert.equal(admitted.profileResources, null);
  const ordered = [...independent, ...expected.toSorted(comparePaths)];
  const diagnostics = ordered.length <= 256 ? ordered
    : [...ordered.slice(0, 255), truncated(ordered.length - 255)];
  const result = await compileComposition(input);
  assert.deepEqual(result, { ok: false, diagnostics });
  return result;
}

function inspectMeter(value, expected, depth) {
  const callbacks = [];
  const meter = createObjectResourceMeter();
  const scan = meter.scanDocument(value, path => callbacks.push(path));
  assert.equal(scan.stoppedBy, null);
  assert.equal(scan.nonPlainValue, true);
  assert.equal(scan.jsonDepth, depth);
  assert.deepEqual(callbacks, expected);
  assert.equal(meter.statistics().peakOpenContainers, depth);
  return meter.statistics();
}

test('root arrays still produce complete ordinary root-record type failures', async () => {
  const input = { declarations: [[{ moduleId: 0 }]], profile: [{ profileId: 0 }] };
  const diagnostics = [invalidType(['declarations', 0]), invalidType(['profile'])];
  const observed = [];
  admitObjectInput(input, { addUnique: diagnostic => observed.push(diagnostic) });
  assert.deepEqual(observed, diagnostics);
  assert.deepEqual(await compileComposition(input), { ok: false, diagnostics });
});

test('declaration non-plain locations retain root and nested numeric fallback without resetting scalar candidates', async () => {
  const value = [
    { moduleId: [undefined, { owner: undefined }] },
    { owner: [{ authority: undefined, path: [[undefined, { authority: undefined }]] }] },
    { slots: [[{ cardinality: [{ min: undefined, max: undefined, order: undefined, kind: undefined }] }]] },
    { secret: { moduleId: undefined } },
  ];
  await expectDocument('declaration', value, [
    [0, 'moduleId', 0],
    [0, 'moduleId', 1],
    [1, 'owner', 0, 'authority'],
    [1, 'owner', 0, 'path', 0, 0],
    [1, 'owner', 0, 'path', 0, 1],
    [2, 'slots', 0, 0, 'cardinality', 0, 'min'],
    [2, 'slots', 0, 0, 'cardinality', 0, 'max'],
    [2, 'slots', 0, 0, 'cardinality', 0, 'order'],
    [2, 'slots', 0, 0, 'cardinality', 0, 'kind'],
    [3],
  ]);
});

test('profile non-plain locations preserve numeric transitions and permanently redact string zero and unknown ancestors', async () => {
  const value = [
    { profileId: undefined },
    { bindings: [[{ slotId: undefined, providerImplementationIds: [[undefined, { slotId: undefined }]] }]] },
    { bindings: { '0': { slotId: undefined } } },
    { secret: [{ profileId: undefined }] },
    { profileId: [[undefined, { profileId: undefined }]] },
  ];
  await expectDocument('profile', value, [
    [0, 'profileId'],
    [1, 'bindings', 0, 0, 'slotId'],
    [1, 'bindings', 0, 0, 'providerImplementationIds', 0, 0],
    [1, 'bindings', 0, 0, 'providerImplementationIds', 0, 1],
    [2, 'bindings'],
    [3],
    [4, 'profileId', 0, 0],
    [4, 'profileId', 0, 1],
  ]);
});

for (const kind of ['declaration', 'profile']) {
  test(kind + ' clips different local lengths and sibling faults once while preserving emitted segment 32', async () => {
    const capacity = kind === 'declaration' ? 30 : 31;
    const branch = kind === 'declaration' ? [undefined, [undefined, undefined]] : [undefined, undefined];
    Object.defineProperty(branch, '0', { enumerable: false });
    const value = wrap([branch, branch], capacity - 1);
    const base = Array(capacity - 1).fill(0);
    const visible = [0, 1].map(index => [...base, index]);
    const callbacks = visible.flatMap(path => [
      path,
      [...path, 0],
      ...(kind === 'declaration' ? [[...path, 1, 0], [...path, 1, 1]] : [[...path, 1]]),
    ]);
    const statistics = inspectMeter(value, callbacks, 32);
    // A shared branch is charged and traversed separately at both occurrences.
    assert.equal(statistics.jsonValueOccurrences, kind === 'declaration' ? 40 : 37);
    await expectDocument(kind, value, visible);
  });
}

test('meter callbacks finish sibling subtrees and interleave ancestor observations without duplicating shared DAG paths', async () => {
  const shared = { before: undefined, authority: undefined, between: undefined,
    path: [undefined], after: undefined };
  const row = { owner: shared, tail: undefined };
  Object.defineProperty(row, 'owner', { enumerable: false });
  const value = [row, row];
  const callbacks = [0, 1].flatMap(index => [
    [index],
    [index, 'owner', 'before'],
    [index, 'owner', 'authority'],
    [index, 'owner', 'between'],
    [index, 'owner', 'path', 0],
    [index, 'owner', 'after'],
    [index, 'tail'],
  ]);
  inspectMeter(value, callbacks, 4);
  await expectDocument('declaration', value, [0, 1].flatMap(index => [
    [index], [index, 'owner'], [index, 'owner', 'authority'], [index, 'owner', 'path', 0],
  ]));
});

for (const kind of ['declaration', 'profile']) {
  test(kind + ' retains index 65535 and folds all later index descendants into the containing address', async () => {
    const field = kind === 'declaration' ? 'moduleId' : 'profileId';
    const value = Array(65538).fill(null);
    value[65535] = { [field]: undefined };
    value[65536] = { [field]: undefined };
    value[65537] = { [field]: [undefined] };
    await expectDocument(kind, value, [[65535, field], []]);
  });
}

for (const count of [1, 256, 257, 258]) {
  test('clipped non-plain observations count ' + count + ' unique final tuples before collection', async () => {
    const shared = Array(count === 1 ? 2048 : 8).fill(undefined);
    const value = wrap(Array(count).fill(shared), 30);
    const base = Array(30).fill(0);
    const result = await expectDocument('profile', value,
      Array.from({ length: count }, (_, index) => [...base, index]));
    if (count > 256) assert.deepEqual(result.diagnostics.at(-1), truncated(count - 255));
    else assert.equal(result.diagnostics.length, count);
  });
}

test('late earlier-sorting paths replace retained candidates and property permutations preserve complete results', async () => {
  const shared = { secret: undefined, nested: [undefined, undefined] };
  const profileId = Array(258).fill(shared);
  const bindings = Array(3).fill({ slotId: undefined, secret: undefined });
  const scalarPaths = Array.from({ length: 258 }, (_, index) => ['profileId', index]);
  const bindingPaths = Array.from({ length: 3 }, (_, index) => [
    ['bindings', index, 'slotId'], ['bindings', index],
  ]).flat();
  const forward = await expectDocument('profile', { profileId, bindings }, [...scalarPaths, ...bindingPaths]);
  const reverse = await expectDocument('profile', { bindings, profileId }, [...bindingPaths, ...scalarPaths]);
  assert.deepEqual(reverse, forward);
  assert.deepEqual(forward.diagnostics.at(-1), truncated(9));
});
