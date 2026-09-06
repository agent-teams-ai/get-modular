import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { m1NodeEnvironment } from '../../../../tests/qualification/support/m1-packed-consumers.mjs';
import { readPackageArchive } from '../../../../tests/qualification/support/package-archive.mjs';
import { staticConsumerSource, staticConsumerTests } from '../../../../tests/qualification/support/static-consumer-source.mjs';

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
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    }
  }
  for (const path of candidates) {
    try { await access(path); return await realpath(path); } catch {}
  }
  throw new Error('The local Node toolchain must provide npm-cli.js.');
}

function run(node, args, cwd, env) {
  const result = spawnSync(node, args, { cwd, env, encoding: 'utf8',
    timeout: 60_000, maxBuffer: 4_000_000, killSignal: 'SIGKILL', windowsHide: true });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, (result.stdout ?? '') + (result.stderr ?? ''));
  return result.stdout;
}

// core:build supplies the current package output before core:test. This test
// packs once and owns only its TEST-prefixed disposable directories. These are
// synthetic regressions, not retained qualification or product-adoption evidence.
test('a static report app compiles and executes through freshly installed Core', async t => {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), 'TEST-gm-static-consumer-')));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const consumer = join(temporary, 'TEST-report-consumer');
  for (const name of ['TEST-report-consumer', 'scratch', 'pack-cache', 'install-cache']) {
    await mkdir(join(temporary, name));
  }
  const userconfig = join(temporary, 'user.npmrc');
  const globalconfig = join(temporary, 'global.npmrc');
  await writeFile(userconfig, '\n', { flag: 'wx' });
  await writeFile(globalconfig, '\n', { flag: 'wx' });
  const osEnvironment = {};
  if (process.platform === 'win32') {
    for (const key of ['SystemRoot', 'WINDIR']) {
      if (process.env[key] !== undefined) osEnvironment[key] = process.env[key];
    }
  }
  const node = await realpath(process.execPath);
  const npm = await npmCli();
  assert.equal(JSON.parse(await readFile(join(dirname(dirname(npm)), 'package.json'), 'utf8')).name, 'npm');
  const compilerManifest = require.resolve('typescript/package.json');
  assert.equal(JSON.parse(await readFile(compilerManifest, 'utf8')).version, '7.0.2');
  const compiler = await realpath(join(dirname(compilerManifest), 'bin/tsc'));
  const environment = cache => m1NodeEnvironment({ node, temporary: join(temporary, 'scratch'),
    cache: join(temporary, cache), userconfig, globalconfig, osEnvironment });
  const packEnv = environment('pack-cache');
  const consumerEnv = environment('install-cache');
  assert.equal(run(node, [compiler, '--version'], consumer, consumerEnv).trim(), 'Version 7.0.2');

  const packed = JSON.parse(run(node, [npm, 'pack', '--ignore-scripts', '--json',
    '--workspaces=false', '--pack-destination', temporary], join(repo, 'packages/core'), packEnv));
  assert.equal(packed.length, 1);
  assert.match(packed[0].filename, /^[A-Za-z0-9_.-]+\.tgz$/u);
  const archive = join(temporary, packed[0].filename);
  const bytes = await readFile(archive);
  const identity = { sha256: hash(bytes),
    integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64') };
  assert.equal(packed[0].integrity, identity.integrity);
  const audited = readPackageArchive(bytes, identity);
  assert.ok(audited.files.has('dist/index.js') && audited.files.has('dist/index.d.ts'));

  try {
    await writeFile(join(consumer, 'package.json'), JSON.stringify({
      name: 'test-get-modular-static-consumer', private: true, type: 'module',
    }), { flag: 'wx' });
    await writeFile(join(consumer, '.npmrc'),
      'ignore-scripts=true\noffline=true\naudit=false\nfund=false\npackage-lock=false\n', { flag: 'wx' });
    run(node, [npm, 'install', '--ignore-scripts', '--offline', '--no-audit', '--no-fund',
      '--no-save', '--no-package-lock', '--workspaces=false', '--global=false',
      '--prefix', consumer, archive], consumer, consumerEnv);
    const installed = join(consumer, 'node_modules/@get-modular/core');
    assert.equal(await realpath(installed), installed, 'the consumer has a physical installed package');
    for (const [path, expected] of audited.files) {
      assert.deepEqual(await readFile(join(installed, path)), expected, 'installed archive member: ' + path);
    }
    await writeFile(join(consumer, 'report.mts'), staticConsumerSource(), { flag: 'wx' });
    await writeFile(join(consumer, 'report.test.mjs'), staticConsumerTests(), { flag: 'wx' });
    await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { target: 'ES2022', lib: ['ES2022'], module: 'NodeNext',
        moduleResolution: 'NodeNext', strict: true, exactOptionalPropertyTypes: true,
        noUncheckedIndexedAccess: true, isolatedModules: true, erasableSyntaxOnly: true,
        types: [], skipLibCheck: false, noEmitOnError: true },
      files: ['report.mts'],
    }), { flag: 'wx' });
    run(node, [compiler, '-p', 'tsconfig.json', '--pretty', 'false'], consumer, consumerEnv);
    await access(join(consumer, 'report.mjs'));
    const output = run(node, ['--test', '--test-reporter=tap', 'report.test.mjs'], consumer, consumerEnv);
    assert.match(output, /^# tests 13$/mu);
    assert.match(output, /^# pass 13$/mu);
    assert.match(output, /^# fail 0$/mu);
  } finally {
    assert.equal(hash(await readFile(archive)), identity.sha256);
  }
});
