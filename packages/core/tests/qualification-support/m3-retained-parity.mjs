// Diagnostic retained replay. No build, pack, custody, or promotion operation.
// trustedRunner.sha256 authenticates the inventory produced by sourceIdentity:
// sorted relative paths, exact file hashes, and internal link destinations.
// The caller authenticates that inventory and both archives independently.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { lstat, mkdir, readFile, readdir, readlink, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findRepoRoot, repoFileUrl } from './support/load-repo-json.mjs';

const ROOT = fileURLToPath(pathToFileURL(findRepoRoot() + '/'));
const ORDERED_SHA = '3743e08de1c73b8c920145f56219ccbe89219ec8bf27023a2cd0ed7bb78ed6d2';
const RELATION = 'od006.extended-overlap.v1/ordered-many-reversal';
const MAX_RECORD = 128 * 1024 * 1024;
const MAX_TOTAL = 2 * 1024 * 1024 * 1024;
const MAX_LOG = 2 * 1024 * 1024;
const TIMEOUT = 600_000;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const encode = value => Buffer.from(`${JSON.stringify(value)}\n`);
const inside = (root, path) => {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
};
function fields(value, names) {
  assert.ok(value && Object.getPrototypeOf(value) === Object.prototype);
  assert.deepEqual(Reflect.ownKeys(value).sort(), [...names].sort());
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value)))
    assert.ok(Object.hasOwn(descriptor, 'value'), 'input accessors forbidden');
}
function absolute(value) {
  assert.equal(typeof value, 'string');
  assert.ok(isAbsolute(value) && !value.includes('\0'));
  assert.equal(resolve(value), value, 'canonical absolute path required');
}
async function exclusive(path, value) {
  await writeFile(path, Buffer.isBuffer(value) ? value : encode(value), { flag: 'wx', mode: 0o600 });
}
export function validateInput(value) {
  fields(value, ['trustedRunner', 'archives', 'outputDir', 'nodePath', 'npmPath', 'orderedManyPath']);
  fields(value.trustedRunner, ['path', 'sourceCommit', 'sha256']);
  absolute(value.trustedRunner.path);
  assert.match(value.trustedRunner.sourceCommit, /^[a-f0-9]{40}$/u);
  assert.match(value.trustedRunner.sha256, /^[a-f0-9]{64}$/u);
  for (const key of ['outputDir', 'nodePath', 'npmPath', 'orderedManyPath']) absolute(value[key]);
  assert.ok(!inside(value.trustedRunner.path, value.outputDir), 'output must be outside runner source');
  assert.ok(Array.isArray(value.archives));
  assert.equal(value.archives.length, 2);
  assert.deepEqual(value.archives.map(row => row.assembly), ['direct', 'generated']);
  for (const row of value.archives) {
    fields(row, ['assembly', 'path', 'sourceCommit', 'sha256', 'integrity']);
    absolute(row.path);
    assert.match(row.sourceCommit, /^[a-f0-9]{40}$/u);
    assert.equal(row.sourceCommit, value.archives[0].sourceCommit, 'two subjects from the same source');
    assert.match(row.sha256, /^[a-f0-9]{64}$/u);
    assert.match(row.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/u);
    assert.equal(Buffer.from(row.integrity.slice(7), 'base64').toString('base64'), row.integrity.slice(7));
  }
  assert.notEqual(value.archives[0].path, value.archives[1].path);
  assert.notEqual(value.archives[0].sha256, value.archives[1].sha256);
  return structuredClone(value);
}

async function boundedRead(path, maximum = MAX_RECORD) {
  const stat = await lstat(path);
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'regular file required');
  assert.ok(stat.size <= maximum, 'file exceeds private replay budget');
  const bytes = await readFile(path);
  assert.equal(bytes.length, stat.size, 'file changed during read');
  assert.ok(bytes.length <= maximum);
  return bytes;
}
export async function sourceIdentity(root) {
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
  Object.assign(env, { GIT_NO_REPLACE_OBJECTS: '1', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' });
  const git = args => execFileSync('git', ['-C', root, ...args], {
    env, encoding: 'utf8', timeout: 15000, maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(resolve(git(['rev-parse', '--show-toplevel']).trim()), root);
  const sourceCommit = git(['rev-parse', '--verify', 'HEAD']).trim();
  assert.match(sourceCommit, /^[a-f0-9]{40}$/u);
  assert.equal(git(['status', '--porcelain=v1', '--untracked-files=all']), '');
  const tracked = new Map(git(['ls-tree', '-rz', '--full-tree', 'HEAD']).split('\0').filter(Boolean).map(row => {
    const match = /^(?:100644|100755) blob ([a-f0-9]{40})\t(.+)$/su.exec(row);
    assert.ok(match, 'regular tracked source');
    return [match[2], match[1]];
  }));
  assert.equal(await realpath(root), root, 'runner root must be physical');
  const inventory = [];
  let total = 0;
  async function visit(directory) {
    for (const name of (await readdir(directory)).sort()) {
      if (directory === root && name === '.git') continue;
      const path = join(directory, name);
      const logical = relative(root, path).split(sep).join('/');
      const stat = await lstat(path);
      assert.ok(inventory.length < 100_000, 'runner inventory budget');
      if (stat.isSymbolicLink()) {
        const target = await realpath(path);
        assert.ok(inside(root, target), 'runner dependency link escapes authenticated tree');
        inventory.push({ path: logical, link: await readlink(path) });
      } else if (stat.isDirectory()) {
        inventory.push({ path: logical, directory: true });
        await visit(path);
      } else {
        assert.ok(stat.isFile(), 'unsupported runner source entry');
        const bytes = await boundedRead(path);
        total += bytes.length;
        assert.ok(total <= MAX_TOTAL, 'runner byte budget');
        if (tracked.has(logical)) {
          assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
            tracked.get(logical), 'tracked bytes match exact source');
          tracked.delete(logical);
        }
        inventory.push({ path: logical, bytes: bytes.length, sha256: hash(bytes) });
      }
    }
  }
  await visit(root);
  inventory.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  assert.equal(tracked.size, 0, 'all tracked source bytes checked');
  return { sourceCommit, sha256: hash(encode(inventory)), inventory };
}

export async function physicalOutputDestination(runnerRoot, outputDir) {
  const root = await realpath(runnerRoot);
  const parent = await realpath(dirname(outputDir));
  assert.ok((await lstat(parent)).isDirectory(), 'output parent must be an existing directory');
  const destination = join(parent, relative(dirname(outputDir), outputDir));
  assert.ok(!inside(root, destination), 'physical output must be outside runner source');
  return destination;
}

export async function npmIdentity(path) {
  const launcher = await toolIdentity(path);
  const root = dirname(dirname(launcher.physicalPath));
  assert.equal(launcher.physicalPath, join(root, 'bin/npm-cli.js'), 'npm package launcher required');
  for (const name of ['bin', 'lib', 'node_modules']) {
    assert.ok((await lstat(join(root, name))).isDirectory(), `npm ${name} directory required`);
  }
  const inventory = [];
  let total = 0;
  async function visit(directory) {
    for (const name of (await readdir(directory)).sort()) {
      assert.ok(inventory.length < 100_000, 'npm inventory budget');
      const child = join(directory, name);
      const logical = relative(root, child).split(sep).join('/');
      const stat = await lstat(child);
      if (stat.isSymbolicLink()) {
        assert.ok(inside(root, await realpath(child)), 'npm link escapes implementation tree');
        inventory.push({ path: logical, link: await readlink(child) });
      } else if (stat.isDirectory()) {
        inventory.push({ path: logical, directory: true });
        await visit(child);
      } else {
        assert.ok(stat.isFile(), 'unsupported npm implementation entry');
        assert.ok(total + stat.size <= MAX_TOTAL, 'npm byte budget');
        const bytes = await boundedRead(child);
        total += bytes.length;
        assert.ok(total <= MAX_TOTAL, 'npm byte budget');
        if (logical === 'package.json') {
          assert.equal(JSON.parse(bytes.toString('utf8')).name, 'npm', 'npm package required');
        }
        inventory.push({ path: logical, bytes: bytes.length, sha256: hash(bytes) });
      }
    }
  }
  await visit(root);
  assert.ok(inventory.some(row => row.path === 'package.json' && row.sha256),
    'regular npm package manifest required');
  const entry = inventory.find(row => row.path === 'bin/npm-cli.js');
  assert.equal(entry?.sha256, launcher.sha256, 'npm launcher changed during inventory');
  inventory.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return {
    ...launcher,
    implementation: { root, sha256: hash(encode(inventory)), inventory },
  };
}

async function toolIdentity(path) {
  const physicalPath = await realpath(path);
  const bytes = await boundedRead(physicalPath);
  return { path, physicalPath, bytes: bytes.length, sha256: hash(bytes) };
}
export function admitManifest(files, assembly) {
  assert.ok(['direct', 'generated'].includes(assembly));
  const manifest = JSON.parse(files.get('package.json')?.toString('utf8'));
  assert.equal(manifest.name, '@get-modular/core');
  assert.equal(manifest.type, 'module');
  assert.match(manifest.version, /^0\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/u);
  const stem = assembly === 'direct'
    ? './dist-stage0/self-composition/stage0-entry' : './dist/index';
  assert.deepEqual(Object.keys(manifest.exports), ['.']);
  assert.deepEqual(Object.keys(manifest.exports['.']), ['import', 'default']);
  assert.deepEqual(Object.keys(manifest.exports['.'].import), ['types', 'default']);
  assert.deepEqual(manifest.exports, {
    '.': { import: { types: `${stem}.d.ts`, default: `${stem}.js` }, default: `${stem}.js` },
  });
  for (const key of [
    'main', 'module', 'types', 'typings', 'typesVersions', 'browser', 'scripts',
    'dependencies', 'optionalDependencies', 'peerDependencies', 'peerDependenciesMeta',
    'bundledDependencies', 'bundleDependencies', 'devDependencies', 'overrides', 'workspaces',
  ]) assert.ok(!Object.hasOwn(manifest, key), `dependency lookup or alternate carrier: ${key}`);
  for (const suffix of ['.js', '.d.ts']) assert.ok(files.has(`${stem.slice(2)}${suffix}`));
  assert.ok(![...files.keys()].some(path => path.split('/').includes('node_modules')));
  return manifest;
}

async function installedIdentity(root, archive) {
  const observed = [];
  async function visit(path) {
    for (const name of (await readdir(path)).sort()) {
      const child = join(path, name), stat = await lstat(child);
      assert.ok(!stat.isSymbolicLink(), 'installed package link');
      if (stat.isDirectory()) await visit(child);
      else observed.push([relative(root, child).split(sep).join('/'), await boundedRead(child)]);
    }
  }
  await visit(root);
  assert.deepEqual(observed.map(([path]) => path).sort(), [...archive.files.keys()].sort());
  for (const [path, bytes] of observed) assert.deepEqual(bytes, archive.files.get(path), path);
}

async function processRecord(node, args, cwd, prefix, timeout = TIMEOUT) {
  const env = {
    HOME: join(cwd, 'home'), TMPDIR: join(cwd, 'tmp'), LANG: 'C.UTF-8',
    PATH: dirname(node), npm_config_userconfig: join(cwd, 'empty.npmrc'),
    npm_config_globalconfig: join(cwd, 'empty-global.npmrc'),
    npm_config_cache: join(cwd, 'cache'), npm_config_offline: 'true',
    npm_config_ignore_scripts: 'true', npm_config_audit: 'false', npm_config_fund: 'false',
  };
  await exclusive(`${prefix}.launch.json`, { executable: node, args, cwd, env, timeout });
  const stdout = [], stderr = [];
  let size = 0, violation = null;
  const child = spawn(node, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const kill = () => {
    if (!child.pid) return;
    try { process.kill(-child.pid, 'SIGKILL'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  const capture = target => bytes => {
    const available = Math.max(0, MAX_LOG - size);
    target.push(bytes.subarray(0, available)); size += bytes.length;
    if (size > MAX_LOG) { violation = 'output-limit'; kill(); }
  };
  child.stdout.on('data', capture(stdout)); child.stderr.on('data', capture(stderr));
  const timer = setTimeout(() => { violation = 'timeout'; kill(); }, timeout);
  const exit = await new Promise(resolveExit => {
    child.once('error', error => resolveExit({ error: String(error), code: null, signal: null }));
    child.once('close', (code, signal) => resolveExit({ code, signal }));
  });
  clearTimeout(timer); kill();
  await exclusive(`${prefix}.stdout`, Buffer.concat(stdout));
  await exclusive(`${prefix}.stderr`, Buffer.concat(stderr));
  await exclusive(`${prefix}.exit.json`, { ...exit, violation });
  assert.ok(!violation && !exit.error && exit.code === 0 && exit.signal === null, 'child did not complete');
  return Buffer.concat(stdout).toString('utf8');
}
async function helpers() {
  const [
    object, semantic, descriptors, raw, invocations, p500, semanticExecutor,
    descriptorExecutor, rawExecutor, invocationExecutor, overlaps, chromium,
  ] = await Promise.all([
    import('./support/object-subject-cases.mjs'),
    import('./support/m3-semantic-runtime-fixtures.mjs'),
    import('./support/m3-descriptor-runtime-fixtures.mjs'),
    import('./support/m3-runtime-fixture-producer.mjs'),
    import('./support/m3-invocation-runtime-fixtures.mjs'),
    import('./support/m3-p500-runtime-fixtures.mjs'),
    import('./support/m3-semantic-runtime-executor.mjs'),
    import('./support/m3-descriptor-runtime-executor.mjs'),
    import('./support/m3-runtime-executor.mjs'),
    import('./support/m3-invocation-runtime-executor.mjs'),
    import('./m2-candidate/duplicate-record-extended-overlaps.mjs'),
    import('./m3-chromium-consumer.mjs'),
  ]);
  return { object, semantic, descriptors, raw, invocations, p500, semanticExecutor,
    descriptorExecutor, rawExecutor, invocationExecutor, overlaps, chromium };
}

function eligibility(input) {
  const declarationBytes = input.declarations.map(row => Buffer.byteLength(JSON.stringify(row)));
  const profileBytes = Buffer.byteLength(JSON.stringify(input.profile));
  const aggregateBytes = declarationBytes.reduce((sum, value) => sum + value, profileBytes);
  assert.ok(declarationBytes.every(value => value <= 1048576));
  assert.ok(profileBytes <= 8388608 && aggregateBytes <= 16777216);
  return { declarationBytes, profileBytes, aggregateBytes };
}
const ORDERS = Object.freeze([
  ['object', 'object'], ['raw', 'raw'], ['object', 'raw'], ['raw', 'object'],
]);
export async function prepareCases(orderedBytes) {
  assert.equal(hash(orderedBytes), ORDERED_SHA, 'exact independent ordered-many JSON required');
  const h = await helpers();
  const ordered = JSON.parse(orderedBytes);
  assert.equal(ordered.vectorId, RELATION);
  assert.deepEqual(ordered.members.map(row => row.member), ['forward', 'reverse']);
  const relation = h.overlaps.materializeDuplicateRecordExtendedOverlap(RELATION);
  const rows = [];
  const add = (suite, fixture, mode) => rows.push({
    id: `${suite}/${fixture.id}/${mode}`, suite, mode, fixture,
  });
  for (const fixture of h.semantic.produceSemanticRuntimeFixtures())
    for (const mode of ['object', 'raw']) add('semantic', fixture, mode);
  assert.equal(rows.length, 1636);
  for (const fixture of h.descriptors.produceDescriptorRuntimeFixtures()) add('descriptor', fixture, 'object');
  assert.equal(rows.length, 1704);
  for (const fixture of h.raw.produceRuntimeFixtures()) add('raw', fixture, 'raw');
  assert.equal(rows.length, 1827);
  for (const fixture of h.invocations.produceInvocationRuntimeFixtures()) add('invocation', fixture, 'raw');
  assert.equal(rows.length, 1889);
  let baseline;
  for await (const fixture of h.p500.produceP500RuntimeFixtures()) {
    baseline ??= fixture;
    for (const mode of ['object', 'raw']) add('p500', fixture, mode);
  }
  assert.equal(rows.length, 1899);
  for (const member of ordered.members) {
    assert.equal(member.expected.ok, true);
    assert.deepEqual(JSON.parse(member.canonicalEnvelope).plan, member.expected.plan);
    assert.equal(member.expected.digest, `gm-plan:v1:sha-256:${hash(member.canonicalEnvelope)}`);
    const input = relation.inputs[member.member];
    const fixture = { id: `${RELATION}/${member.member}`, category: 'independent-member',
      input, expected: member.expected, rawEligibility: eligibility(input) };
    for (const mode of ['object', 'raw']) add('ordered', fixture, mode);
  }
  assert.equal(rows.length, 1903);
  const m1 = h.object.objectSubjectCases.map(row => ({ id: `m1/${row.id}`, suite: 'm1', run: row.run }));
  const concurrent = ORDERS.map(modes => ({
    id: `concurrent/${modes.join('/')}`, suite: 'concurrent', modes, fixture: baseline,
  }));
  const cases = [...m1, ...rows, ...concurrent];
  assert.equal(new Set(cases.map(row => row.id)).size, cases.length);
  return { h, cases, m1Groups: m1.length, m2Calls: rows.length };
}

function containers(value, found = new Set()) {
  if (value === null || typeof value !== 'object' || found.has(value)) return found;
  found.add(value);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value)))
    if (Object.hasOwn(descriptor, 'value')) containers(descriptor.value, found);
  return found;
}

function capabilities(h) {
  const options = { contextCodeGeneration: { strings: false, wasm: false } };
  return {
    invocation: { nodeBuffer: Buffer, foreignRealmFactory:
      runInNewContext(h.chromium.invocationForeignSource, Object.create(null), options) },
    descriptor: { foreignRealmFactory: runInNewContext(`(() => ({
      objectPrototype: Object.prototype, arrayPrototype: Array.prototype,
      record: () => ({}), nullRecord: () => Object.create(null), array: () => [],
    }))`, Object.create(null), options) },
  };
}

function validateOutcome(row, record) {
  assert.equal(record.id, row.id);
  assert.equal(record.suite, row.suite);
  if (row.suite === 'm1') {
    assert.ok(Array.isArray(record.calls) && record.calls.length > 0);
    assert.equal(record.completed, true, 'unchanged M1 executor must finish');
    for (const call of record.calls) assert.equal(typeof call.ok, 'boolean');
  } else if (row.suite === 'concurrent') {
    assert.equal(record.records.length, 2);
    for (const item of record.records) assert.deepEqual(item.result, row.fixture.expected);
    assert.equal(record.independent, true);
  } else {
    assert.deepEqual(record.record.result, row.fixture.expected, row.id);
  }
}
// Called only by the fixed bootstrap in the fresh installed consumer. There is
// no subject parameter, alternate entrypoint, or injectable successful compiler.
export async function childReplay() {
  assert.equal(process.argv.length, 2);
  assert.equal(process.argv[1], join(process.cwd(), 'bootstrap.mjs'));
  const require = createRequire(join(process.cwd(), 'package.json'));
  const resolved = require.resolve('@get-modular/core');
  assert.ok(inside(join(process.cwd(), 'node_modules/@get-modular/core'), resolved));
  const namespace = await import(pathToFileURL(resolved).href);
  const prepared = await prepareCases(await boundedRead(join(process.cwd(), '../ordered-many.json')));
  const { h, cases } = prepared, native = capabilities(h);
  const emit = event => process.stdout.write(`${JSON.stringify(event)}\n`);
  emit({ event: 'start', resolved, count: cases.length, node: process.version });
  let total = 0;
  for (let index = 0; index < cases.length; index += 1) {
    const row = cases[index];
    let record;
    if (row.suite === 'm1') {
      const calls = [];
      await row.run(input => {
        const pending = namespace.compileComposition(input);
        assert.ok(pending instanceof Promise);
        return pending.then(result => { calls.push(result); return result; });
      });
      record = { id: row.id, suite: row.suite, calls, completed: true };
    } else if (row.suite === 'concurrent') {
      const pending = row.modes.map(mode =>
        h.semanticExecutor.executeSemanticRuntimeFixture(namespace, row.fixture, mode));
      // Each existing executor invokes synchronously and immediately poisons its
      // caller graph and bytes. Both invocations start before this first await.
      const records = await Promise.all(pending);
      const first = containers(records[0].result);
      const observations = { containers: 0, mutationRejections: 0 };
      h.rawExecutor.inspectRuntimeResult(records[1].result, row.fixture.expected, first, observations);
      record = { id: row.id, suite: row.suite, records, independent: true };
    } else {
      let result;
      if (row.suite === 'descriptor')
        result = await h.descriptorExecutor.executeDescriptorRuntimeFixture(namespace, row.fixture, native.descriptor);
      else if (row.suite === 'raw')
        result = await h.rawExecutor.executeRuntimeFixture(namespace, row.fixture);
      else if (row.suite === 'invocation')
        result = await h.invocationExecutor.executeInvocationRuntimeFixture(namespace, row.fixture, native.invocation);
      else result = await h.semanticExecutor.executeSemanticRuntimeFixture(namespace, row.fixture, row.mode);
      record = { id: row.id, suite: row.suite, record: result };
    }
    validateOutcome(row, record);
    const bytes = encode(record);
    total += bytes.length;
    assert.ok(bytes.length <= MAX_RECORD && total <= MAX_TOTAL, 'outcome byte budget');
    const file = `${String(index).padStart(5, '0')}.json`;
    await exclusive(join(process.cwd(), '../records', file), bytes);
    emit({ event: 'case', index, id: row.id, file, sha256: hash(bytes), bytes: bytes.length });
  }
  emit({ event: 'complete', count: cases.length, m2Calls: 1903, concurrentCalls: 8, bytes: total });
}

export function validateEvents(events, cases) {
  assert.equal(events.length, cases.length + 2, 'missing or extra child events');
  assert.equal(events[0].event, 'start');
  assert.equal(events[0].count, cases.length);
  for (let index = 0; index < cases.length; index += 1) {
    const event = events[index + 1];
    fields(event, ['event', 'index', 'id', 'file', 'sha256', 'bytes']);
    assert.equal(event.event, 'case');
    assert.equal(event.index, index);
    assert.equal(event.id, cases[index].id);
    assert.equal(event.file, `${String(index).padStart(5, '0')}.json`);
    assert.match(event.sha256, /^[a-f0-9]{64}$/u);
    assert.ok(Number.isSafeInteger(event.bytes) && event.bytes > 0 && event.bytes <= MAX_RECORD);
  }
  assert.deepEqual(events.at(-1), {
    event: 'complete', count: cases.length, m2Calls: 1903, concurrentCalls: 8,
    bytes: events.slice(1, -1).reduce((sum, row) => sum + row.bytes, 0),
  });
  assert.ok(events.at(-1).bytes <= MAX_TOTAL);
}

async function verifyOutcomes(directory, events, cases) {
  validateEvents(events, cases);
  assert.deepEqual((await readdir(directory)).sort(), events.slice(1, -1).map(row => row.file));
  for (let index = 0; index < cases.length; index += 1) {
    const event = events[index + 1];
    const bytes = await boundedRead(join(directory, event.file));
    assert.equal(bytes.length, event.bytes);
    assert.equal(hash(bytes), event.sha256);
    validateOutcome(cases[index], JSON.parse(bytes));
  }
}

export async function runRetainedParity(rawInput) {
  const input = validateInput(rawInput);
  assert.ok(['linux', 'darwin'].includes(process.platform), 'owned POSIX process groups required');
  assert.equal(await realpath(ROOT), input.trustedRunner.path);
  input.outputDir = await physicalOutputDestination(input.trustedRunner.path, input.outputDir);
  const source = await sourceIdentity(input.trustedRunner.path);
  assert.equal(source.sourceCommit, input.trustedRunner.sourceCommit, 'actual runner commit');
  assert.equal(source.sha256, input.trustedRunner.sha256, 'authenticated runner source mismatch');
  const tools = { node: await toolIdentity(input.nodePath), npm: await npmIdentity(input.npmPath) };
  const orderedBytes = await boundedRead(input.orderedManyPath, 1024 * 1024);
  const prepared = await prepareCases(orderedBytes);
  const { readPackageArchive } = await import('./support/package-archive.mjs');
  const archives = [];
  for (const subject of input.archives) {
    const bytes = await boundedRead(subject.path, 16 * 1024 * 1024);
    const archive = readPackageArchive(bytes, { sha256: subject.sha256, integrity: subject.integrity });
    const manifest = admitManifest(archive.files, subject.assembly);
    archives.push({ subject, bytes, archive, manifest });
  }
  await mkdir(input.outputDir, { mode: 0o700 });
  try {
    await exclusive(join(input.outputDir, 'input.json'), input);
    await exclusive(join(input.outputDir, 'source.json'), source);
    await exclusive(join(input.outputDir, 'tools.json'), tools);
    await exclusive(join(input.outputDir, 'case-inventory.json'), prepared.cases.map(({ id, suite }) => ({ id, suite })));
    await mkdir(join(input.outputDir, 'fixtures'));
    let fixtureBytes = 0;
    for (let index = 0; index < prepared.cases.length; index += 1) {
      const { run, ...fixture } = prepared.cases[index];
      const bytes = encode(fixture);
      fixtureBytes += bytes.length;
      assert.ok(bytes.length <= MAX_RECORD && fixtureBytes <= MAX_TOTAL, 'fixture byte budget');
      await exclusive(join(input.outputDir, 'fixtures', `${String(index).padStart(5, '0')}.json`), bytes);
    }
    const subjects = [];
    for (const { subject, bytes, archive, manifest } of archives) {
      const out = join(input.outputDir, subject.assembly), consumer = join(out, 'consumer');
      await mkdir(out); await mkdir(consumer); await mkdir(join(out, 'records'));
      await exclusive(join(out, 'archive.tgz'), bytes);
      await exclusive(join(out, 'archive.json'), { ...subject, inventory: archive.inventory, manifest });
      await exclusive(join(out, 'ordered-many.json'), orderedBytes);
      for (const directory of ['home', 'tmp', 'cache']) await mkdir(join(consumer, directory));
      for (const file of ['empty.npmrc', 'empty-global.npmrc']) await exclusive(join(consumer, file), Buffer.alloc(0));
      await exclusive(join(consumer, 'package.json'), { name: 'retained-parity-consumer', version: '0.0.0', private: true, type: 'module' });
      await processRecord(input.nodePath, [input.npmPath, 'install', '--offline', '--ignore-scripts',
        '--no-audit', '--no-fund', '--no-package-lock', '--no-save', '--ignore-engines',
        '--legacy-peer-deps', '--registry=http://127.0.0.1:9',
        `file:${join(out, 'archive.tgz')}`], consumer, join(out, 'install'), 120_000);
      const installed = join(consumer, 'node_modules/@get-modular/core');
      await installedIdentity(installed, archive);
      const bootstrap = `import { childReplay } from ${JSON.stringify(import.meta.url)};\nawait childReplay();\n`;
      await exclusive(join(consumer, 'bootstrap.mjs'), Buffer.from(bootstrap));
      await exclusive(join(out, 'bootstrap-identity.json'), { sha256: hash(bootstrap) });
      const stdout = await processRecord(input.nodePath, [join(consumer, 'bootstrap.mjs')],
        consumer, join(out, 'replay'));
      assert.ok(stdout.endsWith('\n'), 'incomplete event transport');
      const events = stdout.slice(0, -1).split('\n').map(line => JSON.parse(line));
      const target = manifest.exports['.'].default.slice(2);
      assert.equal(events[0].resolved, join(installed, target), 'installed public root resolution');
      await exclusive(join(out, 'events.json'), events);
      await verifyOutcomes(join(out, 'records'), events, prepared.cases);
      await installedIdentity(installed, archive);
      assert.deepEqual(await boundedRead(subject.path, 16 * 1024 * 1024), bytes);
      assert.deepEqual(await boundedRead(join(out, 'archive.tgz'), 16 * 1024 * 1024), bytes);
      subjects.push({ assembly: subject.assembly, sha256: subject.sha256,
        m1Groups: prepared.m1Groups, m2Calls: prepared.m2Calls, concurrentCalls: 8 });
    }
    assert.deepEqual(await toolIdentity(input.nodePath), tools.node);
    assert.deepEqual(await npmIdentity(input.npmPath), tools.npm, 'npm implementation changed');
    assert.equal((await sourceIdentity(input.trustedRunner.path)).sha256, source.sha256);
    assert.deepEqual(await boundedRead(input.orderedManyPath, 1024 * 1024), orderedBytes);
    const result = {
      status: 'verified', purpose: 'diagnostic', claim: 'not-claimed', promotion: 'none',
      custody: 'not-established', sourceCommit: input.archives[0].sourceCommit,
      runnerCommit: source.sourceCommit, runnerSha256: source.sha256,
      orderedManySha256: ORDERED_SHA,
      orderedManyAuthority: 'independent member expectations; frozen relation unchanged; no new normative authority',
      m2CallsPerSubject: 1903, m2CallsPair: 3806,
      concurrentCallsPerSubject: 8, concurrentOrdersPerSubject: 4,
      m1: 'complete unchanged objectSubjectCases; group inventory retained separately; nested calls and P500 overlap M2',
      subjects,
    };
    await exclusive(join(input.outputDir, 'result.json'), result);
    return result;
  } catch (error) {
    await exclusive(join(input.outputDir, 'failure.json'), {
      status: 'failed', claim: 'not-claimed', error: String(error?.stack ?? error),
    });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.argv.length, 3, 'one explicit absolute JSON input path required');
  absolute(process.argv[2]);
  const bytes = await boundedRead(process.argv[2], 1024 * 1024);
  const input = validateInput(JSON.parse(bytes));
  input.outputDir = await physicalOutputDestination(input.trustedRunner.path, input.outputDir);
  const result = await runRetainedParity(input);
  await exclusive(join(input.outputDir, 'input-exact.json'), bytes);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
