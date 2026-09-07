import assert from 'node:assert/strict';
import { lstat, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepareM3RuntimeNode, verifyM3RuntimeNode } from './m3-runtime-node.mjs';
import { assertM3RuntimeIdentity } from './support/m3-runtime-observations.mjs';
import { absolute, createOutputDirectory, jsonBytes, need, readBytes,
  within, writeExclusive } from './support/m1-retained-observations.mjs';

// Caller authenticates exact source and tool inventories, including this wrapper.
// Capture is cooperative parent-owned storage, not external immutable custody.
// This fixed generated-archive row establishes neither malicious-code isolation
// nor custody, full runtime conformance, publication or release eligibility.
function dataSnapshot(input) {
  let remaining = 1_000_000, bytes = 0;
  const seen = new Set();
  function copy(value, depth = 0) {
    need(--remaining >= 0 && depth <= 64, 'row-data-budget');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      bytes += Buffer.byteLength(value);
      need(bytes <= 64 * 1024 * 1024, 'row-data-budget');
      return value;
    }
    if (typeof value === 'number') {
      need(Number.isSafeInteger(value) && !Object.is(value, -0), 'row-number');
      return value;
    }
    need(value && typeof value === 'object' && !seen.has(value), 'row-data');
    const array = Array.isArray(value);
    need(Object.getPrototypeOf(value) === (array ? Array.prototype : Object.prototype)
      || (!array && Object.getPrototypeOf(value) === null), 'row-prototype');
    seen.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    need(keys.every(key => typeof key === 'string'), 'row-symbol-key');
    const result = array ? [] : Object.create(null);
    if (array) need(value.length <= 100_000, 'row-array-budget');
    for (const key of keys) {
      const descriptor = descriptors[key];
      need(Object.hasOwn(descriptor, 'value'), 'row-accessor');
      if (array && key === 'length') continue;
      need(descriptor.enumerable && (!array || /^(0|[1-9]\d*)$/u.test(key)),
        'row-data-key');
      Object.defineProperty(result, key, {
        value: copy(descriptor.value, depth + 1), enumerable: true,
      });
    }
    if (array) need(keys.length === value.length + 1, 'row-dense-array');
    return Object.freeze(result);
  }
  return copy(input);
}

function shape(value, required, optional = []) {
  need(value && typeof value === 'object' && !Array.isArray(value), 'row-record');
  need(required.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => [...required, ...optional].includes(key)),
  'row-keys');
}

function validate(input) {
  const value = dataSnapshot(input);
  shape(value, ['runtimeCaseId', 'sourceCommit', 'trustedRunner', 'archive',
    'toolchain', 'outputDirectory', 'captureDirectory'], ['osEnvironment']);
  if (value.osEnvironment !== undefined) {
    shape(value.osEnvironment, [], ['SystemRoot', 'WINDIR']);
    need(Object.values(value.osEnvironment).every(item => typeof item === 'string'), 'row-os-environment');
  }
  shape(value.trustedRunner, ['commit', 'files']);
  shape(value.archive, ['path', 'identity'], ['bytes']);
  shape(value.archive.identity, ['sha256', 'integrity']);
  shape(value.toolchain, ['node', 'npm', 'compilers', 'closures']);
  const { files } = value.trustedRunner;
  const { node, npm, compilers, closures } = value.toolchain;
  need(Array.isArray(files) && files.length > 0 && files.length <= 4096
    && Array.isArray(compilers) && compilers.length === 2
    && Array.isArray(closures) && closures.length > 0 && closures.length <= 8,
  'row-inventories');
  for (const row of files) shape(row, ['path', 'sha256']);
  for (const row of [node, npm]) shape(row, ['path', 'version', 'sha256']);
  for (const row of compilers) shape(row, ['name', 'path', 'version', 'sha256']);
  for (const closure of closures) {
    shape(closure, ['root', 'entries']);
    need(Array.isArray(closure.entries) && closure.entries.length <= 100_000,
      'row-tree-inventory');
    for (const entry of closure.entries) {
      const fields = { directory: [], file: ['bytes', 'sha256', 'mode'],
        link: ['target', 'resolved'] };
      need(Object.hasOwn(fields, entry.kind), 'row-tree-kind');
      shape(entry, ['path', 'kind', ...fields[entry.kind]]);
    }
  }
  assertM3RuntimeIdentity(value);
  const protectedPaths = [value.archive.path, ...files.map(row => row.path),
    ...closures.map(row => row.root), ...[node, npm, ...compilers].map(row => row.path)];
  for (const path of [value.outputDirectory, value.captureDirectory, ...protectedPaths]) absolute(path);
  return { value, protectedPaths };
}

async function fresh(path) {
  need(await realpath(dirname(path)) === dirname(path), 'row-parent-alias');
  try {
    await lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  need(false, 'row-directory-exists');
}

export async function runM3NodeRow(input) {
  const { value, protectedPaths } = validate(input);
  const { captureDirectory, outputDirectory } = value;
  const disjoint = (a, b) => need(!within(a, b) && !within(b, a), 'row-overlap');
  disjoint(captureDirectory, outputDirectory);
  for (const path of protectedPaths) {
    disjoint(captureDirectory, path);
    disjoint(outputDirectory, path);
  }
  await fresh(captureDirectory);
  await fresh(outputDirectory);
  for (const path of protectedPaths) {
    need(await realpath(path) === path, 'row-input-alias');
  }
  await createOutputDirectory(captureDirectory, [outputDirectory, ...protectedPaths]);
  const paths = Object.freeze({
    outputDirectory, captureDirectory,
    expected: join(captureDirectory, 'expected.json'),
    seal: join(captureDirectory, 'seal-anchor.json'),
    observations: join(captureDirectory, 'observations-anchor.json'),
    summary: join(captureDirectory, 'summary.json'),
  });
  const boundary = { status: 'not-claimed', scope: 'partial-Node282-only',
    capture: 'cooperative-parent-owned', runtimeCaseId: value.runtimeCaseId,
    sourceCommit: value.sourceCommit };
  let seal, observations, phase = 'prepare';
  try {
    const prepared = await prepareM3RuntimeNode({
      runtimeCaseId: value.runtimeCaseId, sourceCommit: value.sourceCommit,
      trustedRunner: value.trustedRunner, archive: value.archive,
      toolchain: value.toolchain, outputDirectory, javascriptProfile: 'm2-generated',
      osEnvironment: value.osEnvironment ?? {},
      onSeal: async anchor => {
        await writeExclusive(paths.seal, jsonBytes(anchor));
        seal = anchor;
      },
      onObservations: async anchor => {
        await writeExclusive(paths.observations, jsonBytes(anchor));
        observations = anchor;
      },
    });
    const expected = prepared.expected;
    await writeExclusive(paths.expected, jsonBytes(expected));
    phase = 'run';
    await prepared.run();
    phase = 'verify';
    need(seal && observations, 'row-captures-required');
    assert.equal(seal.sealSha256, observations.sealSha256);
    const verified = await verifyM3RuntimeNode({
      expected, sealSha256: seal.sealSha256,
      observationsSha256: observations.observationsSha256,
    });
    await writeExclusive(paths.summary, jsonBytes({ ...boundary, outcome: 'verified', verified }));
    return Object.freeze({ paths, verified });
  } catch (error) {
    await writeExclusive(paths.summary, jsonBytes({
      ...boundary, outcome: 'failed', phase, error: String(error).slice(0, 4096),
    }));
    throw Object.assign(new Error(`M3 Node row failed during ${phase}`, { cause: error }), { paths });
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  need(process.argv.length === 3, 'usage: m3-node-row.mjs /absolute/input.json');
  const input = JSON.parse((await readBytes(absolute(process.argv[2]), 64 * 1024 * 1024)).toString('utf8'));
  process.stdout.write(JSON.stringify(await runM3NodeRow(input)) + '\n');
}
