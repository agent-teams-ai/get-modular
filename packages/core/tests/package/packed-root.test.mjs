import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { readPackageArchive } from '../../../../tests/qualification/support/package-archive.mjs';
import { auditM1DeclarationClosure } from '../../../../tests/qualification/support/m1-declarations-closure.mjs';
import { auditM1JavaScriptClosure } from '../../../../tests/qualification/support/m1-javascript-closure.mjs';
import { prepareM1PackedConsumers, m1NodeEnvironment, runtimeNames } from '../../../../tests/qualification/support/m1-packed-consumers.mjs';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const require = createRequire(import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function npmCli() {
  const binary = await realpath(process.execPath);
  const candidates = [join(dirname(binary), 'node_modules/npm/bin/npm-cli.js'),
    join(dirname(dirname(binary)), 'lib/node_modules/npm/bin/npm-cli.js')];
  if (process.env.npm_execpath?.endsWith('npm-cli.js')) candidates.unshift(process.env.npm_execpath);
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    try {
      const target = await realpath(join(directory, 'npm'));
      if (target.endsWith('npm-cli.js')) candidates.push(target);
    } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error; }
  }
  for (const path of candidates) { try { await access(path); return await realpath(path); } catch {} }
  throw new Error('The pinned Node toolchain must provide npm-cli.js; no shell or download fallback is used.');
}

async function program(path, version) {
  path = await realpath(path);
  return { path, version, sha256: hash(await readFile(path)) };
}

// This adapter owns one disposable pack and all physical/content/source
// comparisons. Its local tool observations are not retained build provenance.
// The private shared harness owns the complete consumer inventory and bodies.
test('packed M1 exposes one root across Node and TypeScript consumers', async t => {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), 'gm-packed-consumer-')));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const osEnvironment = {};
  if (process.platform === 'win32') {
    for (const key of ['SystemRoot', 'WINDIR']) {
      if (process.env[key] !== undefined) osEnvironment[key] = process.env[key];
    }
  }
  const node = await program(process.execPath, process.version);
  const npmPath = await npmCli();
  const npmManifest = JSON.parse(await readFile(join(dirname(dirname(npmPath)), 'package.json'), 'utf8'));
  assert.equal(npmManifest.name, 'npm');
  const npm = await program(npmPath, npmManifest.version);
  const compilers = [];
  for (const name of ['typescript', 'typescript-minimum']) {
    const manifestPath = require.resolve(`${name}/package.json`);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    compilers.push({ name, ...await program(join(dirname(manifestPath), 'bin/tsc'), manifest.version) });
  }
  assert.equal(compilers[0].version, '7.0.2', 'the build compiler remains pinned');
  assert.equal(compilers[1].version, '5.8.3', 'the minimum consumer compiler is pinned separately from the build compiler');

  const packContext = join(temporary, 'pack-context');
  await mkdir(packContext);
  await mkdir(join(packContext, 'cache'));
  await mkdir(join(packContext, 'tmp'));
  const userconfig = join(packContext, 'user.npmrc');
  const globalconfig = join(packContext, 'global.npmrc');
  await writeFile(userconfig, '\n', { flag: 'wx' });
  await writeFile(globalconfig, '\n', { flag: 'wx' });
  const env = m1NodeEnvironment({ node: node.path, temporary: join(packContext, 'tmp'),
    cache: join(packContext, 'cache'), userconfig, globalconfig, osEnvironment });
  const args = [npm.path, 'pack', '--ignore-scripts', '--json', '--pack-destination', temporary];
  const cwd = join(repo, 'packages/core');
  const result = spawnSync(node.path, args, { cwd, env, encoding: 'utf8',
    timeout: 60_000, maxBuffer: 4_000_000, killSignal: 'SIGKILL', windowsHide: true });
  // Capture the pack outcome before any assertion or JSON parsing can throw.
  const packObservation = { phase: 'pack', command: { executable: node.path, args, cwd, env },
    status: result.status, signal: result.signal,
    error: result.error ? { code: result.error.code ?? null, message: result.error.message.slice(0, 8192) } : null,
    timedOut: result.error?.code === 'ETIMEDOUT',
    outputLimitExceeded: result.error?.code === 'ENOBUFS',
    stdout: (result.stdout ?? '').slice(0, 4_000_000), stderr: (result.stderr ?? '').slice(0, 4_000_000) };
  if (result.error || result.signal || result.status !== 0) t.diagnostic(JSON.stringify(packObservation));
  assert.ifError(result.error);
  assert.equal(result.signal, null, `child terminated by ${result.signal}`);
  assert.ok(Number.isInteger(result.status), 'child must complete with an exit status');
  assert.equal(result.status, 0, packObservation.stdout + packObservation.stderr);
  const inventory = JSON.parse(result.stdout);
  assert.equal(inventory.length, 1);
  const packed = inventory[0];
  assert.ok(packed.files.every(file => !/(?:^|\/)(?:tests|self-composition|dist-seed|dist-stage0|dist-qualification)(?:\/|$)|witness-variant|\.variant\./u.test(file.path)),
    'the actual packed inventory excludes qualification roots and the replacement provider');
  assert.match(packed.filename, /^[A-Za-z0-9_.-]+\.tgz$/u);
  const archive = join(temporary, packed.filename);
  const bytes = await readFile(archive);
  assert.equal(packed.integrity, `sha512-${createHash('sha512').update(bytes).digest('base64')}`);
  const archiveHash = hash(bytes);
  const identity = { sha256: archiveHash, integrity: packed.integrity };
  const audited = readPackageArchive(bytes, identity);
  assert.deepEqual(auditM1JavaScriptClosure(audited.files).exports, runtimeNames,
    'the physical JavaScript members have the closed M1 purpose, imports and construction');
  assert.deepEqual(auditM1DeclarationClosure(audited.files).rootExports,
    ['CompileCompositionResult', 'CompositionPlan', 'CompositionProfile', 'Diagnostic', 'DiagnosticCode',
      'ModuleDeclaration', 'PlanDigest'].map(name => ({ name, kind: 'type' }))
      .concat(runtimeNames.map(name => ({ name, kind: 'value' }))),
    'the physical declarations preserve all accepted signatures, shapes and owners');
  const manifestBytes = await readFile(join(repo, 'packages/core/package.json'));
  const manifest = JSON.parse(manifestBytes);
  assert.deepEqual(audited.files.get('package.json'), manifestBytes);
  assert.deepEqual(audited.inventory.map(({ path, size, mode }) => ({ path, size, mode })),
    [...packed.files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
    'byte-derived physical inventory agrees with the npm report without losing duplicates');
  assert.deepEqual(audited.inventory.map(file => file.path),
    [...manifest.files, 'LICENSE', 'README.md', 'package.json'].sort(),
    'the real archive has exactly the reviewed files, license, documentation and manifest');
  assert.ok(audited.inventory.every(file => file.mode === 0o644), 'this package ships no executable files');
  assert.deepEqual(audited.files.get('LICENSE'), await readFile(join(repo, 'LICENSE')));

  const workspace = join(temporary, 'consumers');
  await mkdir(workspace);
  try {
    const prepared = await prepareM1PackedConsumers({ archive: { path: archive, identity, files: audited.files },
      workspace, toolchain: { node, npm, compilers }, contextId: 'disposable-packed-root', osEnvironment });
    let lastCommand;
    const observe = async event => {
      if (event.kind === 'case-started') lastCommand = undefined;
      if (event.kind === 'command') lastCommand = event;
      if (event.kind === 'case-failed' || event.kind === 'case-rejected') {
        if (lastCommand) t.diagnostic(JSON.stringify(lastCommand));
        t.diagnostic(JSON.stringify(event));
      }
    };
    for (const row of prepared.cases) {
      await t.test(row.title, () => prepared.runCase(row.id, observe));
      if (prepared.progress().failed !== null) break;
    }
    assert.equal(prepared.progress().failed, null, 'every prepared consumer case must pass');
    assert.deepEqual(prepared.progress().pending, [], 'every prepared consumer case must execute');
  } finally {
    // Preserve the original final guard even when a subtest or preparation fails.
    assert.equal(hash(await readFile(archive)), archiveHash);
  }
});
