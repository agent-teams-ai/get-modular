import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { runPackSubject } from '../../../../tests/qualification/m3-pack-subject.mjs';

const require = createRequire(import.meta.url);
const supported = process.platform !== 'win32' && /^v24\./u.test(process.version)
  && Number(process.version.split('.')[1]) >= 18
  && !process.env.NODE_OPTIONS && !process.env.NODE_PATH;

async function npmPath() {
  const candidates = [];
  try { candidates.push(join(dirname(require.resolve('npm/package.json')), 'bin/npm-cli.js')); }
  catch { /* Node distributions need not expose npm as a resolvable dependency. */ }
  const node = await realpath(process.execPath);
  candidates.push(resolve(dirname(node), '../lib/node_modules/npm/bin/npm-cli.js'),
    '/usr/share/nodejs/npm/bin/npm-cli.js');
  for (const path of candidates) {
    try { await access(path); return await realpath(path); }
    catch { /* Try the next explicit installed location; never install tools. */ }
  }
  return undefined;
}

async function fixture(t) {
  if (!supported) { t.skip('Requires an unflagged Node 24.18+ controller and Unix Git'); return; }
  const npmCLI = await npmPath();
  if (!npmCLI) { t.skip('No installed npm CLI available'); return; }
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'gm-m3-pack-subject-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = join(parent, 'repository');
  await mkdir(root);
  async function file(path, text) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  const env = {
    PATH: '/usr/bin:/bin', HOME: parent, LANG: 'C',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  };
  function git(args) {
    const result = spawnSync(process.platform === 'darwin'
      ? '/Library/Developer/CommandLineTools/usr/bin/git' : '/usr/bin/git', ['-C', root, ...args], {
      env, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  await file('.node-version', `${process.version.slice(1)}\n`);
  await file('.gitignore', 'packages/core/dist/\npackages/core/src/composition/generated/\n');
  await file('packages/core/src/input.ts', 'export const fixture = true;\n');
  await file('packages/core/self-composition/fixture.txt', 'disposable\n');
  await file('tests/qualification/support/fixture.txt', 'disposable\n');
  await file('packages/core/README.md', 'Disposable small archive fixture.\n');
  await file('packages/core/LICENSE', 'Fixture only.\n');
  await file('packages/core/package.json', JSON.stringify({
    name: '@get-modular/core', version: '0.0.0', private: true, type: 'module',
    files: ['dist/index.js'],
  }));
  // Only this disposable repository runs this fixture build. It intentionally
  // cannot pass the real generated closure audit and cannot produce a subject.
  await file('architecture/tooling/build-core.mjs', [
    "import { mkdir, writeFile } from 'node:fs/promises';",
    "await mkdir('packages/core/dist', { recursive: true });",
    "await mkdir('packages/core/src/composition/generated', { recursive: true });",
    "await writeFile('packages/core/dist/index.js', 'export const fixture = true;\\n');",
    "await writeFile('packages/core/src/composition/generated/stage1.ts', '// fixture\\n');",
  ].join('\n'));
  git(['init', '--quiet']);
  git(['add', '.']);
  git(['commit', '--quiet', '-m', 'Disposable pack fixture']);
  const runner = join(parent, 'run-pack.mjs');
  await writeFile(runner, [
    `import { runPackSubject } from ${JSON.stringify(new URL('../../../../tests/qualification/m3-pack-subject.mjs', import.meta.url).href)};`,
    'const result = await runPackSubject(JSON.parse(process.argv[2]));',
    'process.stdout.write(JSON.stringify(result));',
  ].join('\n'));
  function run(options) {
    const child = spawnSync(process.execPath, [runner, JSON.stringify(options)], {
      encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024,
    });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout);
  }
  return {
    root, file, run, git,
    options: {
      repositoryRoot: root, exactSourceSHA: git(['rev-parse', 'HEAD']),
      nodeExecutable: await realpath(process.execPath), npmCLI,
      outputDirectory: join(parent, 'output'),
    },
  };
}

test('strict data input rejects accessors without invoking them', async () => {
  let invoked = false;
  const options = Object.defineProperty({}, 'repositoryRoot', {
    get() { invoked = true; throw new Error('must not run'); },
  });
  await assert.rejects(runPackSubject(options), { code: 'pack.input' });
  assert.equal(invoked, false);
});

test('wrong exact source is retained as failure before build or pack', async t => {
  const f = await fixture(t);
  if (!f) return;
  const result = f.run({ ...f.options, exactSourceSHA: '0'.repeat(40) });
  assert.equal(result.status, 'failed');
  assert.equal(result.failure.code, 'pack.wrong-source');
  assert.equal(result.packInvocations, 0);
  assert.equal(result.commands.some(row => row.args.includes('pack')), false);
  assert.equal(JSON.parse(await readFile(join(f.options.outputDirectory, 'failure.json'), 'utf8'))
    .failure.code, 'pack.wrong-source');
});

test('dirty tracked source prevents the build and pack', async t => {
  const f = await fixture(t);
  if (!f) return;
  await f.file('packages/core/src/input.ts', 'export const changed = true;\n');
  const result = f.run(f.options);
  assert.equal(result.failure.code, 'pack.dirty-source');
  assert.equal(result.packInvocations, 0);
});

test('existing output remains untouched', async t => {
  const f = await fixture(t);
  if (!f) return;
  await mkdir(f.options.outputDirectory);
  const sentinel = join(f.options.outputDirectory, 'subject.json');
  await writeFile(sentinel, 'existing bytes');
  await assert.rejects(runPackSubject(f.options), { code: 'EEXIST' });
  assert.equal(await readFile(sentinel, 'utf8'), 'existing bytes');
});

test('one actual small npm pack is retained but an audit mismatch is never a subject', async t => {
  const f = await fixture(t);
  if (!f) return;
  const result = f.run(f.options);
  assert.equal(result.status, 'failed');
  assert.equal(result.claim, 'not-claimed');
  assert.equal(result.packInvocations, 1);
  assert.equal(result.failure.code, 'm1.javascript-closure.invalid');
  assert.equal(result.commands.filter(row => row.args.includes('pack')).length, 1);
  assert.equal(result.archive, undefined);
  assert.equal(result.sourceUnchangedAfterFailure, true);
  assert.ok((await readFile(result.partialArchive.path)).length > 0);
  await assert.rejects(access(join(f.options.outputDirectory, 'subject.json')), { code: 'ENOENT' });
  assert.match(result.partialArchive.identity.sha256, /^[a-f0-9]{64}$/u);
});


test('replacement commit cannot supply bytes under the original exact SHA', async t => {
  const f = await fixture(t);
  if (!f) return;
  const original = f.options.exactSourceSHA;
  await f.file('packages/core/src/input.ts', 'export const substituted = true;\n');
  f.git(['add', '.']);
  f.git(['commit', '--quiet', '-m', 'Disposable replacement']);
  const replacement = f.git(['rev-parse', 'HEAD']);
  f.git(['checkout', '--quiet', '--detach', original]);
  f.git(['replace', original, replacement]);
  f.git(['reset', '--hard', 'HEAD']);
  assert.equal(f.git(['rev-parse', 'HEAD']), original);
  assert.equal(f.git(['status', '--porcelain']), '');
  const result = f.run(f.options);
  assert.equal(result.status, 'failed');
  assert.equal(result.failure.code, 'pack.dirty-source');
  assert.equal(result.packInvocations, 0);
  assert.equal(result.commands.some(row => row.args.some(arg => arg.endsWith('build-core.mjs'))), false);
});
