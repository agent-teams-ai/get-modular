import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { readPackageArchive } from './support/package-archive.mjs';
import { auditM1JavaScriptClosure } from './support/m1-javascript-closure.mjs';
import { auditM1DeclarationClosure } from './support/m1-declarations-closure.mjs';

// Cooperative local preparation, not custody, conformance, or publication.
// There is deliberately no consumer callback, command override, or pack handle.
const MAX_FILE = 16 * 1024 * 1024;
const MAX_SOURCE = 128 * 1024 * 1024;
const GENERATED = 'packages/core/src/composition/generated/stage1.ts';
const keys = ['repositoryRoot', 'exactSourceSHA', 'nodeExecutable', 'npmCLI', 'outputDirectory'];
const hash = (bytes, algorithm = 'sha256', encoding = 'hex') =>
  createHash(algorithm).update(bytes).digest(encoding);
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function need(value, code) {
  if (!value) throw Object.assign(new Error(code), { code });
}
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function inputRecord(options) {
  need(options !== null && typeof options === 'object'
    && [Object.prototype, null].includes(Object.getPrototypeOf(options)), 'pack.input');
  const descriptors = Object.getOwnPropertyDescriptors(options);
  need(Reflect.ownKeys(descriptors).length === keys.length
    && keys.every(key => Object.hasOwn(descriptors, key)
      && Object.hasOwn(descriptors[key], 'value')
      && typeof descriptors[key].value === 'string'), 'pack.input');
  const input = Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
  need(/^[a-f0-9]{40}$/u.test(input.exactSourceSHA), 'pack.source-sha');
  for (const key of keys.filter(key => key !== 'exactSourceSHA')) {
    need(isAbsolute(input[key]) && resolve(input[key]) === input[key]
      && !input[key].includes('\0'), 'pack.absolute-path');
  }
  return input;
}
function within(path, root) {
  const suffix = relative(root, path);
  return suffix === '' || suffix !== '..' && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix);
}
async function canonical(path) {
  need(await realpath(path) === path, 'pack.path-alias');
  let current = path;
  while (true) {
    need(!(await lstat(current)).isSymbolicLink(), 'pack.symlink');
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
async function bytes(path, limit = MAX_FILE) {
  await canonical(path);
  const info = await lstat(path);
  need(info.isFile() && info.nlink === 1 && info.size <= limit, 'pack.file');
  const result = await readFile(path);
  need(result.length <= limit, 'pack.file-budget');
  return result;
}
async function put(path, value) {
  await writeFile(path, value, { flag: 'wx', mode: 0o600 });
}
async function sourceDirectories(root) {
  let count = 0;
  async function visit(path) {
    need(++count <= 30000, 'pack.source-entry-budget');
    await canonical(path);
    const info = await lstat(path);
    need(info.isDirectory() || info.isFile(), 'pack.source-special');
    if (info.isDirectory()) {
      for (const name of await readdir(path)) await visit(join(path, name));
    }
  }
  for (const path of ['packages/core/src', 'packages/core/self-composition',
    'architecture/tooling', 'tests/qualification/support']) {
    await visit(join(root, path));
  }
}
function environment(output, node) {
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT']) {
    if (typeof process.env[key] === 'string') env[key] = process.env[key];
  }
  return {
    ...env, PATH: [dirname(node), '/usr/bin', '/bin'].join(process.platform === 'win32' ? ';' : ':'),
    HOME: join(output, 'home'), USERPROFILE: join(output, 'home'),
    TMPDIR: join(output, 'tmp'), TMP: join(output, 'tmp'), TEMP: join(output, 'tmp'),
    LANG: 'C', LC_ALL: 'C', TZ: 'UTC', CI: 'true',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(output, 'empty-config'),
    GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0',
    npm_config_userconfig: join(output, 'empty-config'),
    npm_config_globalconfig: join(output, 'empty-global-config'),
    npm_config_cache: join(output, 'npm-cache'),
    npm_config_ignore_scripts: 'true', npm_config_offline: 'true',
    npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false',
  };
}

export async function runPackSubject(options) {
  const input = inputRecord(options);
  const { repositoryRoot: root, outputDirectory: output, nodeExecutable: node, npmCLI } = input;
  await canonical(root);
  await canonical(dirname(output));
  need(!within(output, root) && !within(root, output), 'pack.output-overlap');
  for (const tool of [node, npmCLI]) {
    need(!within(tool, output), 'pack.tool-output-overlap');
  }
  // mkdir is the exclusive reservation. Existing output is never inspected,
  // repaired, overwritten, or used as a source of candidate archives.
  await mkdir(output, { mode: 0o700 });
  const metadata = {
    formatVersion: 1, status: 'failed', claim: 'not-claimed',
    scope: 'diagnostic-single-pack-preparation', input,
    platform: { platform: process.platform, arch: process.arch },
    commands: [], packInvocations: 0,
  };
  let snapshot;
  let git;
  let env;
  let sequence = 0;
  async function command(executable, args, cwd, timeout = 60000) {
    need(metadata.commands.length < 32, 'pack.command-budget');
    const id = String(sequence++).padStart(2, '0');
    const stdoutPath = join(output, `${id}.stdout`);
    const stderrPath = join(output, `${id}.stderr`);
    const result = spawnSync(executable, args, {
      cwd, env, shell: false, encoding: null, timeout,
      killSignal: 'SIGKILL', maxBuffer: 8 * 1024 * 1024,
    });
    await put(stdoutPath, result.stdout ?? Buffer.alloc(0));
    await put(stderrPath, result.stderr ?? Buffer.alloc(0));
    metadata.commands.push({
      executable, args, cwd, environment: env, timeoutMs: timeout,
      maxBufferBytes: 8 * 1024 * 1024, exitCode: result.status,
      signal: result.signal, errorCode: result.error?.code ?? null,
      stdoutPath, stderrPath,
    });
    need(!result.error && result.status === 0 && result.signal === null, 'pack.command-failed');
    return result.stdout.toString('utf8');
  }
  const gitRun = args => command(git, ['-c', 'core.fsmonitor=false', '-C', root, ...args], root);
  async function tracked() {
    need((await gitRun(['rev-parse', '--show-toplevel'])).trim() === root, 'pack.repository-root');
    need((await gitRun(['rev-parse', '--verify', 'HEAD'])).trim() === input.exactSourceSHA,
      'pack.wrong-source');
    need((await gitRun(['status', '--porcelain=v1', '--untracked-files=all',
      '--ignore-submodules=none'])).length === 0, 'pack.dirty-source');
    const tree = (await gitRun(['rev-parse', 'HEAD^{tree}'])).trim();
    const rows = (await gitRun(['ls-tree', '-rz', '--full-tree', 'HEAD'])).split('\0').filter(Boolean);
    need(rows.length > 0 && rows.length <= 20000, 'pack.tracked-budget');
    let total = 0;
    const entries = [];
    for (const row of rows) {
      const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/su.exec(row);
      need(match, 'pack.unsupported-tracked-input');
      const [, mode, object, path] = match;
      need(path !== GENERATED && path.split('/').every(part => part && part !== '.' && part !== '..'),
        'pack.tracked-path');
      const file = join(root, path);
      const content = await bytes(file);
      total += content.length;
      need(total <= MAX_SOURCE, 'pack.source-byte-budget');
      const blob = createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
      need(blob === object, 'pack.tracked-byte-mismatch');
      need(Boolean((await lstat(file)).mode & 0o111) === (mode === '100755'), 'pack.tracked-mode');
      entries.push({ path, mode, object, bytes: content.length, sha256: hash(content) });
    }
    return { commit: input.exactSourceSHA, tree, entries, sha256: hash(json(entries)) };
  }
  try {
    await canonical(output);
    for (const name of ['home', 'tmp', 'npm-cache', 'archive']) await mkdir(join(output, name));
    await put(join(output, 'empty-config'), '');
    await put(join(output, 'empty-global-config'), '');
    env = environment(output, node);
    need(process.execArgv.length === 0
      && !process.env.NODE_OPTIONS && !process.env.NODE_PATH, 'pack.controller-flags');
    await canonical(node);
    need(await realpath(process.execPath) === node, 'pack.controller-node');
    const pinned = (await bytes(join(root, '.node-version'))).toString('utf8').trim();
    need(/^24\.(?:18|19|[2-9]\d|\d{3,})\.\d+$/u.test(pinned)
      && process.version === `v${pinned}`, 'pack.node-version');
    git = process.platform === 'darwin' ? '/Library/Developer/CommandLineTools/usr/bin/git'
      : process.platform === 'linux' ? '/usr/bin/git' : undefined;
    need(git, 'pack.git-platform');
    metadata.git = { path: git, sha256: hash(await bytes(git, MAX_SOURCE)) };
    const npmRoot = dirname(dirname(npmCLI));
    need(npmCLI === join(npmRoot, 'bin', 'npm-cli.js'), 'pack.npm-cli');
    const npmManifest = JSON.parse((await bytes(join(npmRoot, 'package.json'))).toString('utf8'));
    need(npmManifest.name === 'npm' && typeof npmManifest.version === 'string', 'pack.npm-identity');
    metadata.node = { path: node, version: process.version, sha256: hash(await bytes(node, MAX_SOURCE)) };
    metadata.npm = { path: npmCLI, version: npmManifest.version, sha256: hash(await bytes(npmCLI)) };
    need((await command(node, [npmCLI, '--version'], join(output, 'home'))).trim()
      === npmManifest.version, 'pack.npm-version');
    metadata.git.version = (await command(git, ['--version'], join(output, 'home'))).trim();
    snapshot = await tracked();
    metadata.source = snapshot;
    await put(join(output, 'source-inputs.json'), json(snapshot));
    await sourceDirectories(root);
    await command(node, [join(root, 'architecture/tooling/build-core.mjs')], root, 600000);
    need(same(await tracked(), snapshot), 'pack.source-changed');
    const generatedBytes = await bytes(join(root, GENERATED));
    metadata.generatedWiring = { path: GENERATED, bytes: generatedBytes.length, sha256: hash(generatedBytes) };
    const destination = join(output, 'archive');
    need((await readdir(destination)).length === 0, 'pack.nonempty-destination');
    metadata.packInvocations += 1;
    const report = JSON.parse(await command(node, [npmCLI, 'pack', '--json', '--ignore-scripts',
      '--pack-destination', destination], join(root, 'packages/core'), 120000));
    await put(join(output, 'npm-pack.json'), json(report));
    need(Array.isArray(report) && report.length === 1, 'pack.report');
    const packed = report[0];
    need(typeof packed.filename === 'string'
      && /^[A-Za-z0-9][A-Za-z0-9._-]*\.tgz$/u.test(packed.filename), 'pack.filename');
    need(same(await readdir(destination), [packed.filename]), 'pack.archive-count');
    const archivePath = join(destination, packed.filename);
    const content = await bytes(archivePath);
    const identity = { sha256: hash(content), integrity: `sha512-${hash(content, 'sha512', 'base64')}` };
    metadata.partialArchive = { path: archivePath, bytes: content.length, identity };
    need(packed.integrity === identity.integrity && packed.size === content.length
      && packed.shasum === hash(content, 'sha1'), 'pack.audit-identity-mismatch');
    const audited = readPackageArchive(content, identity);
    const javascript = auditM1JavaScriptClosure(audited.files, 'm2-generated');
    const declarations = auditM1DeclarationClosure(audited.files, 2, 'm2');
    const manifest = JSON.parse(audited.files.get('package.json').toString('utf8'));
    need(manifest.name === '@get-modular/core' && manifest.type === 'module', 'pack.manifest');
    need(same(manifest.exports, {
      '.': { import: { types: './dist/index.d.ts', default: './dist/index.js' }, default: './dist/index.js' },
    }), 'pack.exports');
    for (const key of ['scripts', 'main', 'module', 'types', 'typings', 'typesVersions', 'browser',
      'dependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies', 'bundleDependencies']) {
      need(!Object.hasOwn(manifest, key), 'pack.manifest-field');
    }
    need(Array.isArray(manifest.files) && manifest.files.every(path => typeof path === 'string'),
      'pack.file-list');
    assert.deepEqual(audited.inventory.map(row => row.path),
      [...manifest.files, 'LICENSE', 'README.md', 'package.json'].sort());
    need(audited.inventory.every(row => row.mode === 0o644), 'pack.member-mode');
    need(Array.isArray(packed.files), 'pack.report-files');
    assert.deepEqual(packed.files.map(({ path, size, mode }) => ({ path, size, mode }))
      .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
    audited.inventory.map(({ path, size, mode }) => ({ path, size, mode })));
    need(same(await tracked(), snapshot), 'pack.source-changed');
    need(hash(await bytes(join(root, GENERATED))) === metadata.generatedWiring.sha256, 'pack.wiring-changed');
    need(hash(await bytes(archivePath)) === identity.sha256, 'pack.archive-changed');
    need(hash(await bytes(node, MAX_SOURCE)) === metadata.node.sha256
      && hash(await bytes(npmCLI)) === metadata.npm.sha256, 'pack.tool-changed');
    metadata.archive = metadata.partialArchive;
    delete metadata.partialArchive;
    metadata.publicManifest = manifest;
    metadata.exports = { javascript: javascript.exports, declarations: declarations.rootExports };
    metadata.inventory = audited.inventory;
    metadata.status = 'prepared';
    await put(join(output, 'subject.json'), json(metadata));
    return freeze(metadata);
  } catch (error) {
    metadata.status = 'failed';
    metadata.failure = { code: error.code ?? 'pack.failed', reason: error.reason ?? error.message };
    if (snapshot) {
      try { metadata.sourceUnchangedAfterFailure = same(await tracked(), snapshot); }
      catch { metadata.sourceUnchangedAfterFailure = false; }
    }
    await put(join(output, 'failure.json'), json(metadata));
    return freeze(metadata);
  }
}
