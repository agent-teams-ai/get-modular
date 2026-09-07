import assert from 'node:assert/strict';
import { mkdir, realpath } from 'node:fs/promises';
import { arch, release, type, version } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { absolute, captureOutsideAnchor, checkTree, createOutputDirectory, digest,
  jsonBytes, need, readBytes, readJournal, readJson, retainedLimits, rowDigest,
  scanTree, within, writeExclusive } from './support/m1-retained-observations.mjs';
import { assertM3RuntimeIdentity, freezeRuntimeData,
  verifyM3RuntimeObservations } from './support/m3-runtime-observations.mjs';

// Archive-only private adapter. No build, pack, Git, discovery or download.
//
// trustedRunner is externally authenticated { commit, files: [{path,sha256}] }.
// Its files must cover the runner/checker/fixture/vector dependency closure.
// toolchain uses the harness's node/npm/compilers records and adds closures:
// [{root,entries}], externally authenticated scanTree inventories covering npm,
// both complete compilers, and the runner's installed parser/tar dependencies.
// These are caller trust inputs, not provenance inferred from candidate bytes.
//
// Save the returned expected object in trusted invocation state before run().
// Await onSeal and onObservations in storage outside outputDirectory. A later
// verifier receives that expected object and both outside hashes explicitly.
// Reading expected back from seal.json does not meet this API's trust contract.
// Subprocesses are bounded cooperative probes, not a malicious-code sandbox.
const self = fileURLToPath(import.meta.url);
const support = name => fileURLToPath(new URL(`./support/${name}`, import.meta.url));
const requiredSources = [
  self, support('m3-runtime-observations.mjs'), support('m1-retained-observations.mjs'),
  support('m1-packed-consumers.mjs'), support('package-archive.mjs'),
  support('m1-javascript-closure.mjs'), support('m1-declarations-closure.mjs'),
];
const sha256 = value => need(typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value), 'sha256-required');
const snapshot = value => freezeRuntimeData(JSON.parse(JSON.stringify(value)));

async function checkTrust(trustedRunner, toolchain, required = requiredSources) {
  need(Array.isArray(trustedRunner.files) && trustedRunner.files.length > 0
    && trustedRunner.files.length <= 4096, 'trusted-source-inventory');
  const references = new Map();
  let total = 0;
  for (const row of trustedRunner.files) {
    absolute(row.path); sha256(row.sha256);
    need(!references.has(row.path), 'duplicate-trusted-source');
    const bytes = await readBytes(row.path, 16 * 1024 * 1024);
    total += bytes.length;
    need(total <= 128 * 1024 * 1024, 'trusted-source-byte-budget');
    assert.equal(digest(bytes), row.sha256, 'trusted source bytes changed');
    references.set(row.path, row);
  }
  for (const path of required) need(references.has(path), `trusted-source-missing:${path}`);
  need(Array.isArray(toolchain.closures) && toolchain.closures.length > 0
    && toolchain.closures.length <= 8, 'tool-dependency-closures-required');
  for (const closure of toolchain.closures) {
    absolute(closure.root);
    await checkTree(closure.root, closure.entries);
  }
  const programs = [toolchain.node, toolchain.npm, ...toolchain.compilers];
  for (const program of programs) {
    absolute(program.path); sha256(program.sha256);
    assert.equal(digest(await readBytes(program.path)), program.sha256, 'tool entry changed');
  }
  for (const program of [toolchain.npm, ...toolchain.compilers]) {
    need(toolchain.closures.some(row => within(program.path, row.root)), 'tool-outside-closure');
  }
  assert.deepEqual(toolchain.compilers.map(({ name, version }) => [name, version]),
    [['typescript', '7.0.2'], ['typescript-minimum', '5.8.3']]);
  for (const [program, name, entry] of [
    [toolchain.npm, 'npm', 'npm-cli.js'],
    ...toolchain.compilers.map(row => [row, 'typescript', 'tsc']),
  ]) {
    const root = dirname(dirname(program.path));
    assert.equal(program.path, join(root, 'bin', entry), 'exact package CLI path required');
    const manifest = JSON.parse((await readBytes(join(root, 'package.json'))).toString('utf8'));
    assert.equal(manifest.name, name);
    assert.equal(manifest.version, program.version);
  }
  assert.equal(await realpath(process.execPath), toolchain.node.path, 'controller uses selected Node');
  assert.equal(process.version, toolchain.node.version, 'actual Node version must match');
  assert.match(process.version, /^v24\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u);
  need(Number(process.version.split('.')[1]) >= 18, 'accepted-node-interval');
  need(process.execArgv.length === 0, 'controller-node-flags');
}

async function modules() {
  // Only fixed trusted imports; no candidate-selected module path.
  const harness = await import('./support/m1-packed-consumers.mjs');
  const archive = await import('./support/package-archive.mjs');
  const javascript = await import('./support/m1-javascript-closure.mjs');
  const declarations = await import('./support/m1-declarations-closure.mjs');
  return { ...harness, ...archive, ...javascript, ...declarations };
}

async function audit(modules, archive) {
  const bytes = await readBytes(archive.path, 16 * 1024 * 1024);
  if (archive.bytes !== undefined) assert.equal(bytes.length, archive.bytes);
  const result = modules.readPackageArchive(bytes, archive.identity);
  modules.auditM1JavaScriptClosure(result.files, 'm2');
  modules.auditM1DeclarationClosure(result.files, 2, 'm2');
  const manifest = JSON.parse(result.files.get('package.json').toString('utf8'));
  assert.equal(manifest.name, '@get-modular/core');
  assert.equal(manifest.type, 'module');
  assert.equal(JSON.stringify(manifest.exports), JSON.stringify({
    '.': { import: { types: './dist/index.d.ts', default: './dist/index.js' }, default: './dist/index.js' },
  }));
  for (const key of ['scripts', 'main', 'module', 'types', 'typings', 'typesVersions', 'browser',
    'dependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies', 'bundleDependencies']) {
    need(!Object.hasOwn(manifest, key), `unsupported-package-field:${key}`);
  }
  need(Array.isArray(manifest.files) && manifest.files.every(path => typeof path === 'string'), 'literal-file-list');
  assert.deepEqual(result.inventory.map(row => row.path),
    [...manifest.files, 'LICENSE', 'README.md', 'package.json'].sort());
  need(result.inventory.every(row => row.mode === 0o644), 'archive-member-mode');
  return result;
}

async function checkArtifacts(plan) {
  for (const artifact of plan.artifacts) {
    const bytes = await readBytes(artifact.path, 8 * 1024 * 1024);
    assert.equal(bytes.length, artifact.bytes);
    assert.equal(digest(bytes), artifact.sha256);
    assert.equal(bytes.toString('utf8'), artifact.content);
  }
}

async function checkInstalled(workspace, inventory) {
  for (const name of ['first', 'second']) {
    const root = join(workspace, name, 'node_modules/@get-modular/core');
    const entries = await scanTree(root);
    need(entries.every(row => row.kind === 'file' || row.kind === 'directory'), 'installed-special-member');
    assert.deepEqual(entries.filter(row => row.kind === 'file').map(({ path, bytes, sha256 }) =>
      ({ path, size: bytes, sha256 })), inventory.map(({ path, size, sha256 }) => ({ path, size, sha256 })));
  }
}

export async function prepareM3RuntimeNode(options) {
  assertM3RuntimeIdentity(options);
  need(typeof options.onSeal === 'function' && typeof options.onObservations === 'function',
    'outside-capture-sinks-required');
  const { onSeal, onObservations } = options;
  const input = snapshot({
    runtimeCaseId: options.runtimeCaseId, sourceCommit: options.sourceCommit,
    trustedRunner: options.trustedRunner, toolchain: options.toolchain,
    archive: options.archive, outputDirectory: options.outputDirectory,
    osEnvironment: options.osEnvironment ?? {},
  });
  absolute(input.archive.path); absolute(input.outputDirectory);
  await checkTrust(input.trustedRunner, input.toolchain);
  const loaded = await modules();
  const audited = await audit(loaded, input.archive);
  const excluded = [input.archive.path, ...input.trustedRunner.files.map(row => row.path),
    ...input.toolchain.closures.map(row => row.root), input.toolchain.node.path];
  await createOutputDirectory(input.outputDirectory, excluded);
  const workspace = join(input.outputDirectory, 'consumers');
  await mkdir(workspace);
  const contextId = `private-archive-node-${digest(jsonBytes(input))}`;
  const prepared = await loaded.prepareM1PackedConsumers({
    archive: { path: input.archive.path, identity: input.archive.identity, files: audited.files },
    workspace, toolchain: input.toolchain, contextId, osEnvironment: input.osEnvironment,
    surface: 'm2', diagnosticGeneration: 2,
  });
  assert.equal(prepared.cases.length, 282, 'complete current inventory required');
  assert.equal(new Set(prepared.cases.map(row => row.id)).size, 282);
  await checkTrust(input.trustedRunner, input.toolchain,
    [...requiredSources, ...prepared.trustedSources.map(row => row.path)]);
  const expected = snapshot({
    ...input, archive: { ...input.archive, bytes: audited.compressedBytes },
    contextId, workspace, inventory: audited.inventory,
    platform: { platform: process.platform, arch: arch(), type: type(), release: release(), version: version() },
    plan: { cases: prepared.cases, artifacts: prepared.artifacts, trustedSources: prepared.trustedSources,
      toolchain: prepared.toolchain, archive: prepared.archive },
  });
  await checkArtifacts(expected.plan);
  await mkdir(join(input.outputDirectory, 'observations'));
  await writeExclusive(join(input.outputDirectory, 'seal.json'), jsonBytes(expected));
  const sealSha256 = digest(jsonBytes(expected));
  await captureOutsideAnchor(onSeal, { sealSha256, outputDirectory: input.outputDirectory });
  let used = false;
  return Object.freeze({ expected, sealSha256, run: async () => {
    need(!used, 'runtime-adapter-already-started');
    used = true;
    let sequence = 0, total = 0;
    const put = async (caseId, rowSha256, kind, details) => {
      const event = { sequence, anchor: sealSha256, contextId, archiveIdentity: expected.archive.identity,
        caseId, rowSha256, kind, details };
      const bytes = jsonBytes(event);
      need(sequence < retainedLimits.records && bytes.length <= retainedLimits.recordBytes
        && total + bytes.length <= retainedLimits.journalBytes, 'journal-budget');
      await writeExclusive(join(input.outputDirectory, 'observations',
        `${String(sequence).padStart(6, '0')}.json`), bytes);
      sequence += 1; total += bytes.length;
    };
    await checkTrust(input.trustedRunner, input.toolchain);
    await checkArtifacts(expected.plan);
    for (const row of prepared.cases) {
      loaded.readPackageArchive(await readBytes(input.archive.path, 16 * 1024 * 1024), input.archive.identity);
      await prepared.runCase(row.id, async event => {
        const { case: actual, contextId: context, archiveIdentity, surface, kind, ...details } = event;
        assert.equal(context, contextId); assert.equal(surface, 'm2');
        assert.deepEqual(archiveIdentity, expected.archive.identity);
        assert.deepEqual(actual, row);
        await put(row.id, rowDigest(row), kind, details);
      });
    }
    await checkTrust(input.trustedRunner, input.toolchain);
    await checkArtifacts(expected.plan);
    await checkInstalled(workspace, expected.inventory);
    await audit(loaded, expected.archive);
    await put(null, null, 'session-ended', { completed: expected.plan.cases.map(row => row.id) });
    const events = await readJournal(join(input.outputDirectory, 'observations'));
    const observationsSha256 = digest(jsonBytes(events));
    await captureOutsideAnchor(onObservations, { sealSha256, observationsSha256,
      outputDirectory: input.outputDirectory });
    return Object.freeze({ sealSha256, observationsSha256, outputDirectory: input.outputDirectory });
  } });
}

export async function verifyM3RuntimeNode({ expected, sealSha256, observationsSha256 }) {
  // expected is the caller's independently retained pre-execution plan.
  expected = snapshot(expected);
  assertM3RuntimeIdentity(expected);
  sha256(sealSha256); sha256(observationsSha256);
  assert.equal(expected.plan.cases.length, 282);
  assert.equal(digest(jsonBytes(expected)), sealSha256, 'outside plan anchor mismatch');
  assert.deepEqual(await readJson(join(expected.outputDirectory, 'seal.json')), expected);
  await checkTrust(expected.trustedRunner, expected.toolchain,
    [...requiredSources, ...expected.plan.trustedSources.map(row => row.path)]);
  await checkArtifacts(expected.plan);
  const loaded = await modules();
  const audited = await audit(loaded, expected.archive);
  assert.deepEqual(audited.inventory, expected.inventory);
  const interpreted = verifyM3RuntimeObservations({
    expectedPlan: expected.plan, events: await readJournal(join(expected.outputDirectory, 'observations')),
    anchor: sealSha256, observationsSha256, contextId: expected.contextId,
    archive: expected.archive, inventory: expected.inventory,
  });
  await checkInstalled(expected.workspace, expected.inventory);
  return snapshot({ status: 'not-claimed', scope: 'reviewed-archive-runtime-diagnostics',
    runtimeCaseId: expected.runtimeCaseId, sourceCommit: expected.sourceCommit,
    trustedCommit: expected.trustedRunner.commit, archiveIdentity: expected.archive.identity,
    sealSha256, observationsSha256, platform: expected.platform, completed: interpreted.completed });
}
