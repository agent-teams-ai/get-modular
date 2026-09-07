import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFile, copyFile, lstat, mkdir, mkdtemp, readFile, readdir,
  readlink, realpath, unlink, writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  absolute, digest, jsonBytes, readBytes, scanTree, within,
} from './support/m1-retained-observations.mjs';

// Cooperative execution and completeness diagnostics only. These records do
// not authenticate hostile code or establish custody, conformance, publication,
// or release eligibility. Native drivers retain their explicit unmet cases.
export const ROWS = Object.freeze([
  'node-24-linux', 'node-24-macos', 'node-24-windows',
  'chromium-window', 'chromium-dedicated-worker', 'electron-desktop-smoke',
]);
const platforms = ['linux', 'darwin', 'win32', 'linux', 'linux', 'linux'];
const repository = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const require = createRequire(import.meta.url);
const SHA = /^[a-f0-9]{40}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const INTEGRITY = /^sha512-[A-Za-z0-9+/]{86}==$/u;
const scope = 'partial-same-generated-archive-diagnostics';
const groupFor = id => id.startsWith('node-') ? id : 'native';
const json = async (path, value) =>
  writeFile(path, jsonBytes(value), { flag: 'wx', mode: 0o600 });

export function parseArguments(args) {
  assert.ok(Array.isArray(args) && args.every(value => typeof value === 'string'));
  const [command, row] = args;
  assert.ok(['init', 'pack', 'node', 'native', 'collect'].includes(command),
    'fixed command required');
  assert.equal(args.length, command === 'node' ? 2 : 1, 'closed arguments');
  if (command === 'node') assert.ok(ROWS.slice(0, 3).includes(row), 'fixed Node row');
  return { command, row };
}

function validateExpected(expected) {
  assert.match(expected.sourceCommit, SHA);
  assert.match(expected.runnerCommit, SHA);
  assert.equal(expected.runnerCommit, expected.sourceCommit, 'exact dispatch runner');
  assert.match(expected.archiveArtifactId, /^[1-9]\d*$/u);
  assert.match(expected.archiveIdentity.sha256, HASH);
  assert.match(expected.archiveIdentity.integrity, INTEGRITY);
  const encoded = expected.archiveIdentity.integrity.slice(7);
  assert.equal(Buffer.from(encoded, 'base64').toString('base64'), encoded);
}

// Pure finite transport validation. Runtime verification belongs to the drivers;
// a collector success cannot expand their coverage or authorize a claim.
export function collectRows(records, expected) {
  validateExpected(expected);
  assert.ok(Array.isArray(records) && records.length === ROWS.length,
    'exactly six rows required');
  const seen = new Set();
  for (const { group, file, record } of records) {
    assert.deepEqual(Object.keys(record).sort(), [
      'archiveArtifactId', 'archiveIdentity', 'claim', 'diagnostic',
      'outcome', 'platform', 'runnerCommit', 'runtimeCaseId', 'scope', 'sourceCommit',
    ].sort());
    const id = record.runtimeCaseId;
    assert.ok(ROWS.includes(id), 'substituted row');
    assert.ok(!seen.has(id), 'duplicate row');
    seen.add(id);
    assert.equal(group, `m3-rows-${groupFor(id)}`, 'substituted artifact group');
    assert.equal(file, `${id}.json`, 'substituted row filename');
    assert.equal(record.sourceCommit, expected.sourceCommit, 'wrong source');
    assert.equal(record.runnerCommit, expected.runnerCommit, 'wrong runner');
    assert.equal(record.archiveArtifactId, expected.archiveArtifactId, 'wrong archive artifact');
    assert.deepEqual(record.archiveIdentity, expected.archiveIdentity, 'wrong archive bytes');
    assert.equal(record.platform, platforms[ROWS.indexOf(id)], 'wrong actual OS');
    assert.equal(record.claim, 'not-claimed');
    assert.equal(record.scope, scope);
    assert.equal(record.outcome, 'verified', 'failed or incomplete runtime diagnostic');
    assert.deepEqual(Object.keys(record.diagnostic).sort(), ['path', 'sha256']);
    assert.match(record.diagnostic.sha256, HASH);
    const diagnosticPath = id.startsWith('node-')
      ? `${id}-capture/summary.json`
      : id.startsWith('chromium-') ? 'chromium/result.json' : 'electron/result.json';
    assert.equal(record.diagnostic.path, diagnosticPath, 'wrong driver result');
  }
  assert.deepEqual([...seen].sort(), [...ROWS].sort(), 'missing rows');
  return {
    claim: 'not-claimed', scope, outcome: 'six-diagnostic-rows-verified',
    sourceCommit: expected.sourceCommit, runnerCommit: expected.runnerCommit,
    archiveArtifactId: expected.archiveArtifactId,
    archiveIdentity: expected.archiveIdentity,
    rows: ROWS.map(id => records.find(row => row.record.runtimeCaseId === id).record),
    limitation: 'Partial driver coverage and cooperative records; no custody, conformance or publication claim.',
  };
}

function dispatchSHA() {
  assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch');
  assert.match(process.env.M3_DISPATCH_SHA ?? '', SHA);
  assert.equal(process.env.GITHUB_SHA, process.env.M3_DISPATCH_SHA);
  assert.equal(process.env.GIT_NO_REPLACE_OBJECTS, '1');
  assert.equal(process.execArgv.length, 0);
  assert.ok(!process.env.NODE_OPTIONS && !process.env.NODE_PATH);
  return process.env.M3_DISPATCH_SHA;
}

function expectedIdentity() {
  const expected = {
    sourceCommit: dispatchSHA(), runnerCommit: dispatchSHA(),
    archiveArtifactId: process.env.M3_ARCHIVE_ARTIFACT_ID ?? '',
    archiveIdentity: {
      sha256: process.env.M3_ARCHIVE_SHA256 ?? '',
      integrity: process.env.M3_ARCHIVE_INTEGRITY ?? '',
    },
  };
  validateExpected(expected);
  return expected;
}

async function init() {
  dispatchSHA();
  const temporary = await realpath(absolute(process.env.RUNNER_TEMP));
  assert.ok(!within(temporary, repository), 'temporary root outside checkout');
  const root = await mkdtemp(join(temporary, 'm3-runtime-matrix-'));
  assert.equal(await realpath(root), root);
  for (const name of ['diagnostics', 'rows', 'home', 'tmp', 'npm-cache']) {
    await mkdir(join(root, name));
  }
  assert.ok(!/[\r\n]/u.test(root));
  await appendFile(process.env.GITHUB_ENV, `M3_ROOT=${root}\n`);
}

async function context() {
  const sourceCommit = dispatchSHA();
  const root = absolute(process.env.M3_ROOT);
  assert.equal(await realpath(root), root);
  assert.ok(within(root, await realpath(absolute(process.env.RUNNER_TEMP))));
  assert.ok(!within(root, repository) && !within(repository, root));
  assert.equal(await realpath(repository), repository);
  const pinned = (await readBytes(join(repository, '.node-version'))).toString().trim();
  assert.equal(process.version, `v${pinned}`);
  assert.equal(pinned, '24.18.0');
  return { root, sourceCommit, diagnostics: join(root, 'diagnostics') };
}

function command(executable, args, cwd, env = process.env, timeout = 60_000) {
  const result = spawnSync(executable, args, {
    cwd, env: { ...env, GIT_NO_REPLACE_OBJECTS: '1' },
    shell: false, encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024,
    killSignal: 'SIGKILL',
  });
  assert.ok(!result.error && result.status === 0 && result.signal === null,
    `${executable} failed: ${result.error?.message ?? result.stderr?.slice(-4096)}`);
  return result.stdout;
}

async function logged(ctx, name, executable, args, cwd, env, timeout = 600_000) {
  const result = spawnSync(executable, args, {
    cwd, env: { ...env, GIT_NO_REPLACE_OBJECTS: '1' },
    shell: false, encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024,
    killSignal: 'SIGKILL',
  });
  await json(join(ctx.diagnostics, `${name}.json`), {
    executable, args, cwd, timeout, status: result.status, signal: result.signal,
    error: result.error?.message ?? null,
    stdout: result.stdout ?? '', stderr: result.stderr ?? '',
  });
  assert.ok(!result.error && result.status === 0 && result.signal === null,
    `${name} failed; inspect retained output`);
  return result.stdout.trim();
}

async function trustedRunner(ctx) {
  const git = args => command(process.platform === 'win32' ? 'git.exe' : 'git',
    ['-c', 'core.fsmonitor=false', '-C', repository, ...args], repository);
  assert.equal(git(['rev-parse', '--verify', 'HEAD']).trim(), ctx.sourceCommit);
  assert.equal(git(['status', '--porcelain=v1', '--untracked-files=all',
    '--ignore-submodules=none']), '', 'clean exact-SHA checkout required');
  const entries = git(['ls-tree', '-rz', '--full-tree', ctx.sourceCommit])
    .split('\0').filter(Boolean);
  assert.ok(entries.length > 0 && entries.length <= 4096, 'bounded full tracked inventory');
  let total = 0;
  const files = [];
  for (const entry of entries) {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/su.exec(entry);
    assert.ok(match, 'regular tracked files only');
    const [, , blob, name] = match;
    assert.ok(!/[\\\0\r\n]/u.test(name)
      && name.split('/').every(part => part && part !== '.' && part !== '..'));
    const path = join(repository, name);
    assert.ok(within(path, repository));
    const bytes = await readBytes(path, 16 * 1024 * 1024);
    total += bytes.length;
    assert.ok(total <= 128 * 1024 * 1024, 'tracked byte budget');
    assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`)
      .update(bytes).digest('hex'), blob, `exact Git bytes: ${name}`);
    files.push({ path, sha256: digest(bytes) });
  }
  return { commit: ctx.sourceCommit, files };
}

async function nodeAndNpm() {
  const nodePath = await realpath(process.execPath);
  const candidates = [
    join(dirname(nodePath), 'node_modules/npm/bin/npm-cli.js'),
    join(dirname(dirname(nodePath)), 'lib/node_modules/npm/bin/npm-cli.js'),
  ];
  let npmPath;
  for (const candidate of candidates) {
    try {
      npmPath = await realpath(candidate);
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  assert.ok(npmPath, 'npm belonging to selected Node installation required');
  const npmRoot = dirname(dirname(npmPath));
  assert.equal(npmPath, join(npmRoot, 'bin/npm-cli.js'));
  const manifest = JSON.parse((await readBytes(join(npmRoot, 'package.json'))).toString());
  assert.equal(manifest.name, 'npm');
  assert.equal(command(nodePath, [npmPath, '--version'], repository).trim(), manifest.version);
  return {
    node: { path: nodePath, version: process.version, sha256: digest(await readBytes(nodePath)) },
    npm: { path: npmPath, version: manifest.version, sha256: digest(await readBytes(npmPath)) },
    npmRoot,
  };
}

async function toolchain(ctx) {
  const { node, npm, npmRoot } = await nodeAndNpm();
  const pnpmRoot = await realpath(join(repository, 'node_modules/.pnpm'));
  const removed = [];
  // This is the sole allowed dependency removal, before the snapshot. No Core
  // build is needed in a fresh consumer checkout. scanTree rejects other escapes.
  const link = join(pnpmRoot, 'node_modules/@get-modular/core');
  try {
    assert.ok((await lstat(link)).isSymbolicLink(), 'workspace Core must be a symlink');
    const target = await realpath(link);
    assert.equal(target, await realpath(join(repository, 'packages/core')));
    removed.push({ path: link, target, link: await readlink(link) });
    await unlink(link);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // A dangling symlink is not an absent path and must never be silently removed.
    try {
      await lstat(link);
      assert.fail('unexpected dangling workspace link');
    } catch (missing) {
      if (missing.code !== 'ENOENT') throw missing;
    }
  }
  await json(join(ctx.diagnostics, 'workspace-link-removal.json'), removed);
  const compilers = [];
  for (const [name, version] of [['typescript', '7.0.2'], ['typescript-minimum', '5.8.3']]) {
    const manifestPath = await realpath(require.resolve(`${name}/package.json`));
    const manifest = JSON.parse((await readBytes(manifestPath)).toString());
    assert.equal(manifest.name, 'typescript');
    assert.equal(manifest.version, version);
    const path = await realpath(join(dirname(manifestPath), 'bin/tsc'));
    assert.ok(within(path, pnpmRoot), 'compiler in scanned pnpm closure');
    compilers.push({ name, version, path, sha256: digest(await readBytes(path)) });
  }
  for (const name of ['tar', 'typescript-minimum', 'typescript']) {
    assert.ok(within(await realpath(require.resolve(name)), pnpmRoot),
      'actual runner parser/compiler dependency in pnpm closure');
  }
  const closures = [];
  for (const root of [npmRoot, pnpmRoot]) closures.push({ root, entries: await scanTree(root) });
  const result = { node, npm, compilers, closures };
  await json(join(ctx.diagnostics, 'toolchain.json'), result);
  return result;
}

async function archive(ctx, expected) {
  const directory = join(ctx.root, 'incoming');
  assert.deepEqual(await readdir(directory), ['core.tgz'], 'one downloaded inner archive');
  const path = join(directory, 'core.tgz');
  const bytes = await readBytes(path, 16 * 1024 * 1024);
  assert.equal(digest(bytes), expected.archiveIdentity.sha256, 'independent pack SHA256');
  assert.equal(`sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    expected.archiveIdentity.integrity, 'independent pack SHA512');
  return { path, identity: { ...expected.archiveIdentity }, bytes: bytes.length };
}

// Build-only inventory permits the one explicitly bound workspace link.
// Its target is covered by the separate exact tracked source inventory.
async function buildDependencies(root) {
  const entries = [], pending = [''];
  let total = 0;
  assert.equal(await realpath(root), root);
  while (pending.length) {
    const suffix = pending.pop();
    assert.ok(suffix.split('/').length <= 64);
    for (const name of (await readdir(join(root, suffix))).sort()) {
      assert.ok(!/[\\\0\r\n]/u.test(name));
      const path = suffix ? `${suffix}/${name}` : name, full = join(root, path);
      const stat = await lstat(full);
      if (stat.isSymbolicLink()) {
        const target = await realpath(full);
        assert.ok(within(target, root) || (path === 'node_modules/@get-modular/core'
          && target === await realpath(join(repository, 'packages/core'))), 'build dependency link escape');
        entries.push({ path, kind: 'link', target: await readlink(full), resolved: target });
      } else if (stat.isDirectory()) {
        entries.push({ path, kind: 'directory' }); pending.push(path);
      } else {
        assert.ok(stat.isFile()); total += stat.size;
        assert.ok(total <= 2 * 1024 ** 3);
        const bytes = await readBytes(full);
        entries.push({ path, kind: 'file', bytes: bytes.length, mode: stat.mode & 0o777, sha256: digest(bytes) });
      }
      assert.ok(entries.length + pending.length <= 100000);
    }
  }
  return entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

async function pack(ctx) {
  assert.equal(process.platform, 'linux');
  const trusted = await trustedRunner(ctx);
  await json(join(ctx.diagnostics, 'trusted-runner.json'), trusted);
  const tools = await nodeAndNpm();
  const pnpmPath = await realpath(command('/usr/bin/which', ['pnpm'], repository).trim());
  const pnpm = { path: pnpmPath, version: command(pnpmPath, ['--version'], repository).trim(),
    sha256: digest(await readBytes(pnpmPath)) };
  assert.equal(pnpm.version, '11.20.0');
  const dependenciesRoot = await realpath(join(repository, 'node_modules/.pnpm'));
  const buildBefore = { pnpm, npm: await scanTree(tools.npmRoot),
    dependencies: await buildDependencies(dependenciesRoot) };
  await json(join(ctx.diagnostics, 'build-tools-before.json'), buildBefore);
  const { runPackSubject } = await import('./m3-pack-subject.mjs');
  const subject = await runPackSubject({
    repositoryRoot: repository, exactSourceSHA: ctx.sourceCommit,
    nodeExecutable: tools.node.path, npmCLI: tools.npm.path,
    outputDirectory: join(ctx.diagnostics, 'pack'),
  });
  const buildAfter = { pnpm: { ...pnpm, sha256: digest(await readBytes(pnpmPath)) },
    npm: await scanTree(tools.npmRoot), dependencies: await buildDependencies(dependenciesRoot) };
  await json(join(ctx.diagnostics, 'build-tools-after.json'), buildAfter);
  assert.deepEqual(buildAfter, buildBefore, 'build tooling unchanged');
  assert.equal(subject.status, 'prepared', 'pack preparation failed');
  assert.equal(subject.packInvocations, 1);
  await mkdir(join(ctx.root, 'transfer'));
  const transfer = join(ctx.root, 'transfer/core.tgz');
  await copyFile(subject.archive.path, transfer);
  const bytes = await readBytes(transfer, 16 * 1024 * 1024);
  assert.equal(digest(bytes), subject.archive.identity.sha256);
  assert.equal(`sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    subject.archive.identity.integrity);
  // The diagnostic upload must not upload a second copy of the Core tarball.
  await unlink(subject.archive.path);
  await json(join(ctx.diagnostics, 'archive-transfer.json'), {
    sourceCommit: ctx.sourceCommit, runnerCommit: trusted.commit,
    originalPath: subject.archive.path, uploadedPath: transfer,
    archiveIdentity: subject.archive.identity,
  });
  await appendFile(process.env.GITHUB_OUTPUT,
    `sha256=${subject.archive.identity.sha256}\nintegrity=${subject.archive.identity.integrity}\n`);
}

async function row(ctx, expected, id, diagnosticPath, outcome = 'verified') {
  const path = join(ctx.diagnostics, diagnosticPath);
  await json(join(ctx.root, 'rows', `${id}.json`), {
    runtimeCaseId: id, ...expected, platform: process.platform, outcome,
    claim: 'not-claimed', scope,
    diagnostic: { path: diagnosticPath, sha256: digest(await readBytes(path)) },
  });
}

async function node(ctx, id) {
  assert.equal(process.platform, platforms[ROWS.indexOf(id)], 'actual requested OS');
  const expected = expectedIdentity();
  const subject = await archive(ctx, expected);
  const trusted = await trustedRunner(ctx);
  await json(join(ctx.diagnostics, 'trusted-runner.json'), trusted);
  const tools = await toolchain(ctx);
  const osEnvironment = {};
  if (process.platform === 'win32') {
    for (const name of ['SystemRoot', 'WINDIR']) {
      assert.equal(typeof process.env[name], 'string');
      osEnvironment[name] = process.env[name];
    }
  }
  const { runM3NodeRow } = await import('./m3-node-row.mjs');
  const result = await runM3NodeRow({
    runtimeCaseId: id, sourceCommit: expected.sourceCommit, trustedRunner: trusted,
    archive: subject, toolchain: tools, osEnvironment,
    outputDirectory: join(ctx.diagnostics, `${id}-execution`),
    captureDirectory: join(ctx.diagnostics, `${id}-capture`),
  });
  assert.equal(result.verified.completed.length, 282);
  assert.equal(new Set(result.verified.completed).size, 282);
  assert.equal(result.verified.trustedCommit, expected.runnerCommit);
  assert.equal(result.verified.sourceCommit, expected.sourceCommit);
  assert.deepEqual(result.verified.archiveIdentity, expected.archiveIdentity);
  await archive(ctx, expected);
  assert.deepEqual(await trustedRunner(ctx), trusted);
  await row(ctx, expected, id, `${id}-capture/summary.json`);
}

function installEnvironment(ctx) {
  return {
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
    HOME: join(ctx.root, 'home'), TMPDIR: join(ctx.root, 'tmp'),
    LANG: 'C.UTF-8', CI: 'true', GIT_NO_REPLACE_OBJECTS: '1',
    npm_config_cache: join(ctx.root, 'npm-cache'),
    npm_config_userconfig: join(ctx.root, 'native-user.npmrc'),
    npm_config_globalconfig: join(ctx.root, 'native-global.npmrc'),
    npm_config_audit: 'false', npm_config_fund: 'false',
    PLAYWRIGHT_BROWSERS_PATH: join(ctx.root, 'browsers'),
    electron_config_cache: join(ctx.root, 'electron-cache'),
  };
}

export function chromiumSandboxProfile({
  env, platform, arch, uid, temporary, root, executable, revision,
}) {
  admitElectronSandboxRunner(env, platform, arch, uid);
  // Closed Linux path grammar: no AppArmor expansion, quoting or traversal.
  for (const path of [temporary, root, executable]) {
    assert.equal(typeof path, 'string');
    assert.ok(path.length <= 4096, 'bounded sandbox path');
    assert.match(path, /^\/[A-Za-z0-9_-][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*$/u);
  }
  assert.ok(root.startsWith(`${temporary}/m3-runtime-matrix-`));
  assert.match(root.slice(temporary.length), /^\/m3-runtime-matrix-[A-Za-z0-9]{6}$/u,
    'direct disposable runner directory');
  assert.equal(typeof revision, 'string');
  assert.match(revision, /^[1-9][0-9]{0,9}$/u);
  assert.equal(executable,
    `${root}/browsers/chromium_headless_shell-${revision}/chrome-headless-shell-linux64/chrome-headless-shell`,
    'exact pinned headless shell path');
  const name = `m3-chromium-userns-${digest(Buffer.from(executable))}`;
  const bytes = `abi <abi/4.0>,\ninclude <tunables/global>\n\n`
    + `profile ${name} ${executable} flags=(unconfined) {\n  userns,\n}\n`;
  return {
    name, executable, bytes, sha256: digest(Buffer.from(bytes)),
    path: `${root}/diagnostics/chromium-userns.apparmor`,
  };
}

async function configureChromiumSandbox(ctx, tooling, env, executable) {
  dispatchSHA();
  assert.equal(tooling, join(ctx.root, 'tooling'));
  const manifest = JSON.parse(await readBytes(
    join(tooling, 'node_modules/playwright-core/package.json')));
  assert.equal(manifest.name, 'playwright-core');
  assert.equal(manifest.version, '1.63.0');
  const registry = JSON.parse(await readBytes(
    join(tooling, 'node_modules/playwright-core/browsers.json')));
  const shells = registry.browsers.filter(browser => browser.name === 'chromium-headless-shell');
  assert.equal(shells.length, 1, 'one pinned headless shell registry entry');
  const profile = chromiumSandboxProfile({
    env: process.env, platform: process.platform, arch: process.arch, uid: process.getuid(),
    temporary: await realpath(absolute(process.env.RUNNER_TEMP)),
    root: ctx.root, executable, revision: shells[0].revision,
  });
  assert.equal(await realpath(ctx.root), ctx.root);
  assert.equal(ctx.diagnostics, join(ctx.root, 'diagnostics'));
  assert.equal(await realpath(ctx.diagnostics), ctx.diagnostics);
  assert.equal(await realpath(executable), executable, 'exact physical Chromium executable');
  const stat = await lstat(executable);
  assert.ok(stat.isFile() && !stat.isSymbolicLink());
  assert.equal(stat.nlink, 1, 'unshared Chromium executable');
  assert.ok((stat.mode & 0o111) !== 0, 'executable Chromium file');
  const executableSha256 = digest(await readBytes(executable));
  await writeFile(profile.path, profile.bytes, { flag: 'wx', mode: 0o600 });
  assert.equal(await realpath(profile.path), profile.path);
  const profileStat = await lstat(profile.path);
  assert.ok(profileStat.isFile() && !profileStat.isSymbolicLink());
  assert.equal(profileStat.nlink, 1);
  assert.equal(digest(await readBytes(profile.path)), profile.sha256);
  await json(join(ctx.diagnostics, 'chromium-sandbox-profile.json'), {
    ...profile, executableSha256,
    lifetime: 'disposable hosted runner; exact executable attachment',
  });
  await logged(ctx, 'chromium-sandbox-load', '/usr/bin/sudo',
    ['-n', '/usr/sbin/apparmor_parser', '-a', '-I', '/etc/apparmor.d', '--', profile.path],
    tooling, env, 60_000);
  assert.equal(digest(await readBytes(profile.path)), profile.sha256);
  assert.equal(await realpath(executable), executable);
  assert.equal(digest(await readBytes(executable)), executableSha256);
  return {
    name: profile.name, path: profile.path, sha256: profile.sha256,
    executable, executableSha256, loaderResult: 'chromium-sandbox-load.json',
    loaderResultSha256: digest(await readBytes(join(ctx.diagnostics, 'chromium-sandbox-load.json'))),
  };
}

export function admitElectronSandboxRunner(env, platform, arch, uid) {
  assert.equal(platform, 'linux');
  assert.equal(arch, 'x64');
  assert.ok(Number.isInteger(uid) && uid > 0, 'non-root runner required');
  assert.equal(env.GITHUB_ACTIONS, 'true');
  assert.equal(env.GITHUB_EVENT_NAME, 'workflow_dispatch');
  assert.equal(env.RUNNER_ENVIRONMENT, 'github-hosted');
  assert.equal(env.RUNNER_OS, 'Linux');
  assert.match(env.ImageOS ?? '', /^ubuntu(?:22|24)$/u);
}

export function verifyElectronSandboxHelper(helper, dist, before) {
  assert.equal(helper.path, join(dist, 'chrome-sandbox'), 'exact helper path');
  assert.equal(helper.physicalPath, helper.path, 'physical non-symlink helper');
  assert.equal(helper.mode & 0o170000, 0o100000, 'regular helper required');
  assert.equal(helper.nlink, 1, 'unshared helper required');
  assert.match(helper.sha256, HASH);
  if (before) {
    verifyElectronSandboxHelper(before, dist);
    for (const key of ['path', 'physicalPath', 'dev', 'ino', 'nlink', 'sha256']) {
      assert.equal(helper[key], before[key], `sandbox helper unchanged: ${key}`);
    }
    assert.equal(helper.uid, 0, 'root helper uid');
    assert.equal(helper.gid, 0, 'root helper gid');
    assert.equal(helper.mode & 0o7777, 0o4755, 'setuid helper mode');
  }
}

async function configureElectronSandbox(ctx, tooling, env) {
  admitElectronSandboxRunner(process.env, process.platform, process.arch, process.getuid());
  dispatchSHA();
  const temporary = await realpath(absolute(process.env.RUNNER_TEMP));
  assert.equal(await realpath(ctx.root), ctx.root);
  assert.equal(dirname(ctx.root), temporary, 'disposable runner directory');
  assert.ok(ctx.root.startsWith(join(temporary, 'm3-runtime-matrix-')));
  assert.equal(tooling, join(ctx.root, 'tooling'));
  const dist = join(tooling, 'node_modules/electron/dist');
  assert.equal(await realpath(dist), dist, 'physical installed Electron dist');
  const path = join(dist, 'chrome-sandbox');
  const observe = async () => {
    const stat = await lstat(path);
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'regular non-symlink helper');
    const helper = {
      path, physicalPath: await realpath(path),
      dev: stat.dev, ino: stat.ino, nlink: stat.nlink,
      uid: stat.uid, gid: stat.gid, mode: stat.mode,
      sha256: digest(await readBytes(path)),
    };
    verifyElectronSandboxHelper(helper, dist);
    return helper;
  };
  const before = await observe();
  await json(join(ctx.diagnostics, 'electron-sandbox-before.json'), before);
  await logged(ctx, 'electron-sandbox-chown', '/usr/bin/sudo',
    ['-n', '/usr/bin/chown', '0:0', '--', path], tooling, env);
  await logged(ctx, 'electron-sandbox-chmod', '/usr/bin/sudo',
    ['-n', '/usr/bin/chmod', '04755', '--', path], tooling, env);
  const after = await observe();
  await json(join(ctx.diagnostics, 'electron-sandbox-after.json'), after);
  verifyElectronSandboxHelper(after, dist, before);
  return { dist, before, after };
}

async function native(ctx) {
  assert.equal(process.platform, 'linux');
  assert.equal(process.arch, 'x64', 'pinned Linux native distribution');
  assert.notEqual(process.getuid(), 0, 'native sandbox requires non-root runner');
  const expected = expectedIdentity();
  const subject = await archive(ctx, expected);
  const trusted = await trustedRunner(ctx);
  await json(join(ctx.diagnostics, 'trusted-runner.json'), trusted);
  const tools = await toolchain(ctx);
  const tooling = join(ctx.root, 'tooling');
  await mkdir(tooling);
  await json(join(tooling, 'package.json'), {
    name: 'm3-private-native-tools', version: '0.0.0', private: true,
    dependencies: { playwright: '1.63.0', electron: '44.2.0' },
  });
  const env = installEnvironment(ctx);
  await writeFile(env.npm_config_userconfig, '', { flag: 'wx' });
  await writeFile(env.npm_config_globalconfig, '', { flag: 'wx' });
  await logged(ctx, 'native-npm-install', tools.node.path,
    [tools.npm.path, 'install', '--ignore-scripts', '--no-audit', '--no-fund'],
    tooling, env);
  for (const [name, version] of [['playwright', '1.63.0'], ['electron', '44.2.0']]) {
    const manifest = JSON.parse(await readFile(join(tooling, 'node_modules', name, 'package.json')));
    assert.equal(manifest.name, name);
    assert.equal(manifest.version, version);
  }
  await logged(ctx, 'chromium-install', tools.node.path,
    [join(tooling, 'node_modules/playwright/cli.js'),
      'install', '--with-deps', '--only-shell', 'chromium'], tooling, env);
  await logged(ctx, 'electron-install', tools.node.path,
    [join(tooling, 'node_modules/electron/install.js')], tooling, env);
  const electronSandbox = await configureElectronSandbox(ctx, tooling, env);
  const browsers = await realpath(env.PLAYWRIGHT_BROWSERS_PATH);
  const shells = (await readdir(browsers)).filter(name => /^chromium_headless_shell-\d+$/u.test(name));
  assert.equal(shells.length, 1, 'one pinned headless shell installation');
  const chromium = await realpath(join(browsers, shells[0], 'chrome-headless-shell-linux64/chrome-headless-shell'));
  const chromiumSandbox = await configureChromiumSandbox(ctx, tooling, env, chromium);
  const electron = await realpath(join(tooling, 'node_modules/electron/dist/electron'));
  const browserVersion = await logged(ctx, 'chromium-version', chromium, ['--version'], tooling, env);
  const match = /^(?:Chromium|Google Chrome(?: for Testing)?|HeadlessChrome) (\d+\.\d+\.\d+\.\d+)$/u
    .exec(browserVersion);
  assert.ok(match, 'actual Chromium --version identity');
  const electronVersion = await logged(ctx, 'electron-version', '/usr/bin/xvfb-run',
    ['-a', electron, '--version'], tooling, env);
  assert.equal(electronVersion, 'v44.2.0');
  const roots = [tooling, browsers, await realpath(env.electron_config_cache)];
  const installation = [];
  for (const root of roots) installation.push({ root, entries: await scanTree(root) });
  assert.ok(installation[2].entries.some(entry => entry.kind === 'file'
    && entry.path.endsWith('.zip')), 'retained Electron distribution archive');
  assert.ok(installation[0].entries.some(entry => entry.kind === 'file'
    && entry.path.startsWith('node_modules/electron/dist/resources/')),
  'complete Electron resources');
  await json(join(ctx.diagnostics, 'native-installation.json'), {
    versions: { playwright: '1.63.0', electron: '44.2.0', browserVersion, electronVersion },
    binaries: {
      chromium: { path: chromium, sha256: digest(await readBytes(chromium)) },
      electron: { path: electron, sha256: digest(await readBytes(electron)) },
    },
    installation,
    chromiumSandbox,
    electronSandbox,
  });
  const failures = [];
  for (const kind of ['chromium', 'electron']) {
    try {
      await archive(ctx, expected);
      const input = {
        archivePath: subject.path, expectedSha256: expected.archiveIdentity.sha256,
        integrity: expected.archiveIdentity.integrity, exactSourceSHA: expected.sourceCommit,
        uniqueOutputDir: join(ctx.diagnostics, kind),
        ...(kind === 'chromium'
          ? { chromiumExecutable: chromium, expectedBrowserVersion: `HeadlessChrome/${match[1]}` }
          : { absoluteelectronExecutable: electron, expectedElectronVersion: '44.2.0' }),
      };
      const config = join(ctx.diagnostics, `${kind}-input.json`);
      await json(config, input);
      const driver = join(repository, `tests/qualification/m3-${kind}-consumer.mjs`);
      await logged(ctx, `${kind}-driver`, kind === 'electron' ? '/usr/bin/xvfb-run' : tools.node.path,
        kind === 'electron' ? ['-a', tools.node.path, driver, config] : [driver, config],
        tooling, env);
      const result = JSON.parse(await readFile(join(input.uniqueOutputDir, 'result.json')));
      assert.equal(result.status, 'verified');
      assert.equal(result.claim, 'not-claimed');
      assert.equal(result.exactSourceSHA, expected.sourceCommit);
      assert.equal(result.archiveSha256, expected.archiveIdentity.sha256);
      assert.equal(result.integrity, expected.archiveIdentity.integrity);
      await archive(ctx, expected);
      assert.deepEqual(await trustedRunner(ctx), trusted);
      for (const closure of installation) {
        assert.deepEqual(await scanTree(closure.root), closure.entries, 'native installation unchanged');
      }
      const ids = kind === 'chromium' ? ROWS.slice(3, 5) : ROWS.slice(5);
      for (const id of ids) await row(ctx, expected, id, `${kind}/result.json`);
    } catch (error) {
      failures.push({ driver: kind, error: String(error.stack ?? error).slice(0, 8192) });
    }
  }
  await json(join(ctx.diagnostics, 'native-driver-failures.json'), failures);
  assert.equal(failures.length, 0, 'native diagnostics incomplete');
}

async function collect(ctx) {
  const trusted = await trustedRunner(ctx);
  await json(join(ctx.diagnostics, 'trusted-runner.json'), trusted);
  const root = join(ctx.root, 'collected');
  const records = [];
  const groups = await readdir(root);
  assert.ok(groups.length <= 4, 'extra artifact groups');
  for (const group of groups.sort()) {
    assert.ok(['native', ...ROWS.slice(0, 3)].some(name => group === `m3-rows-${name}`));
    const files = await readdir(join(root, group));
    assert.ok(files.length <= 3, 'extra row files');
    for (const file of files.sort()) {
      assert.ok(ROWS.some(id => file === `${id}.json`), 'unexpected row file');
      const bytes = await readBytes(join(root, group, file), 64 * 1024);
      const record = JSON.parse(bytes.toString());
      assert.ok(bytes.equals(jsonBytes(record)), 'canonical complete row');
      records.push({ group, file, record });
    }
  }
  const summary = collectRows(records, expectedIdentity());
  for (const { group, record } of records) {
    const evidenceRoot = join(ctx.root, 'driver-evidence',
      group.replace('m3-rows-', 'm3-diagnostics-'));
    const diagnostic = await readBytes(join(evidenceRoot, record.diagnostic.path));
    assert.equal(digest(diagnostic), record.diagnostic.sha256,
      'downloaded driver evidence differs from row binding');
  }
  await json(join(ctx.diagnostics, 'collection.json'), summary);
}

async function main() {
  const { command: action, row: id } = parseArguments(process.argv.slice(2));
  if (action === 'init') return init();
  const ctx = await context();
  try {
    if (action === 'pack') await pack(ctx);
    else if (action === 'node') await node(ctx, id);
    else if (action === 'native') await native(ctx);
    else await collect(ctx);
  } catch (error) {
    await json(join(ctx.diagnostics, 'controller-failure.json'), {
      claim: 'not-claimed', scope, outcome: 'failed', command: action,
      sourceCommit: ctx.sourceCommit, runnerCommit: ctx.sourceCommit,
      error: String(error.stack ?? error).slice(0, 16384),
    });
    throw error;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
