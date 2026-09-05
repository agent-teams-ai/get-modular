import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { arch, release, type, version } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { absolute, checkProcess, checkTree, createOutputDirectory, digest, jsonBytes, need,
  readBytes, readJournal, readJson, retainedLimits, rowDigest, scanTree, verifyM1Observations,
  within, writeExclusive, captureOutsideAnchor, verifyObservationAnchor } from './support/m1-retained-observations.mjs';

// Opt-in private M1 evidence only. Import performs no I/O or candidate loading.
// runM1RetainedSession and verifyM1RetainedSession deliberately have separate
// entry points. The latter regenerates expected cases with the trusted harness
// and interprets actual observations; producer status/progress is not its oracle.
// Full snapshots trade disk space for a small, reviewable dependency boundary.
// No registry downloads, install scripts, source resets, source cleans or retries.
const SELF = 'tests/qualification/m1-retained-session.mjs';
const OBSERVATIONS = 'tests/qualification/support/m1-retained-observations.mjs';
const SUPPORT = 'tests/qualification/support/';
const BUILD = 'architecture/tooling/build-core.mjs';
const BUILD_HASH = '6f74ba92a33ac714a850f244fc60b7130ad2b67ada67e4e1ac9dcd69da2d84e2';
const MANIFEST_HASH = '84082fcd51d4bffff931615d50fbe6e552024306b5f458cb25b97e279b42e782';
const LOCK_HASH = '7420fcef084e65d3a61eba8e907a17bba9efbd255d1e9fe72b8370d216bdec99';
const mandatoryFiles = [
  'AGENTS.md', '.npmrc', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.base.json',
  'docs/architecture/system-boundary.md', 'docs/architecture/current-contract.md',
  'docs/architecture/mvp-implementation-roadmap.md', 'docs/architecture/self-composition-implementation-guide.md',
  'docs/architecture/feature-module-standard.md', 'docs/decisions/README.md',
  'docs/open-decisions/README.md', 'docs/requirements/module-system-v1.md', 'docs/provenance/source-map.yaml',
  'architecture/checks/feature-module-standard-profile.mjs',
  'architecture/authority/accepted-authorities.json', 'architecture/authority/accepted-contracts.json',
  'architecture/authority/v1-qualification-ledger.json',
  'architecture/authority/implementation-clarifications-ledger.json',
  'architecture/authority/object-resource-coverage-ledger.json',
  'architecture/qualification/v1/qualification-case-manifest.json',
  'architecture/qualification/v1/normalization-vectors.json',
  'architecture/qualification/v1/diagnostic-contract.json',
  'architecture/qualification/v1/diagnostic-snapshots.json',
  'architecture/qualification/v1/resource-profile-v2.json',
  'architecture/qualification/v1/resource-boundary-vectors.json',
  'architecture/contracts/v1/diagnostic-catalog.json',
  'architecture/qualification/implementation-clarifications/cases.json',
  'architecture/qualification/object-resource-coverage/cases.json',
  'architecture/checks/implementation-clarifications.mjs',
  'packages/core/tests/features/input-admission/object-resource-coverage-cases.mjs',
  ...['resource-profile-v2.mjs', 'scale-output.mjs', 'object-subject-cases.mjs',
    'object-resource-admission.mjs', 'object-resource-semantics.mjs', 'type-scale.mjs',
    'diagnostic-type-cases.mjs', 'm1-packed-consumers.mjs', 'm1-packed-object-consumer.mjs',
    'package-archive.mjs', 'm1-javascript-closure.mjs', 'm1-declarations-closure.mjs'].map(name => SUPPORT + name),
];
const configurations = ['tsconfig.json', 'tsconfig.test.json', 'tsconfig.typecheck.json',
  'tsconfig.stage0.json', 'tsconfig.seed.json'].map(name => `packages/core/${name}`);
const sha = value => need(typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value), 'exact-git-sha-required');
const sha256 = value => need(typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value), 'sha256-required');
function errorDetails(error) {
  const text = value => typeof value === 'string' ? value.slice(0, 8192) : null;
  return { name: text(error?.name), code: typeof error?.code === 'number' ? error.code : text(error?.code),
    message: text(error?.message), stack: text(error?.stack), reason: text(error?.reason),
    context: error?.context?.reason ? { reason: text(error.context.reason) } : null };
}
function capture(command) {
  let result;
  try {
    result = childProcess.spawnSync(command.executable, command.args, { cwd: command.cwd, env: command.env,
      stdio: ['ignore', 'pipe', 'pipe'], timeout: command.timeoutMs,
      maxBuffer: command.maxOutputBytes, killSignal: command.killSignal, windowsHide: true });
  } catch (error) { result = { error, status: null, signal: null }; }
  const stdout = result.stdout ?? Buffer.alloc(0), stderr = result.stderr ?? Buffer.alloc(0);
  const first = Math.min(stdout.length, command.maxOutputBytes);
  const second = Math.min(stderr.length, command.maxOutputBytes - first);
  return { status: result.status ?? null, signal: result.signal ?? null,
    error: result.error ? errorDetails(result.error) : null,
    spawnError: result.error && !['ETIMEDOUT', 'ENOBUFS'].includes(result.error.code) ? errorDetails(result.error) : null,
    timedOut: result.error?.code === 'ETIMEDOUT',
    outputLimitExceeded: result.error?.code === 'ENOBUFS' || stdout.length + stderr.length > command.maxOutputBytes,
    stdout: stdout.subarray(0, first).toString('utf8'), stderr: stderr.subarray(0, second).toString('utf8'), protocol: '',
    receivedBytes: { stdout: stdout.length, stderr: stderr.length, protocol: 0 },
    truncated: { stdout: first !== stdout.length, stderr: second !== stderr.length, protocol: false } };
}
function command(executable, args, cwd, env, timeoutMs = 60_000) {
  return { executable, args, cwd, env, timeoutMs, maxOutputBytes: 4_000_000,
    maxProtocolBytes: 65_536, killSignal: 'SIGKILL' };
}
async function canonicalDirectory(path) {
  absolute(path);
  need(await fs.realpath(path) === path && (await fs.lstat(path)).isDirectory(), 'canonical-directory-required');
  return path;
}
async function canonicalProgram(path) {
  absolute(path);
  const resolved = await fs.realpath(path);
  const bytes = await readBytes(resolved);
  return { origin: path, path: resolved, bytes: bytes.length, sha256: digest(bytes) };
}
async function makeContext(directory, gitPath) {
  const git = await canonicalProgram(gitPath);
  const control = join(directory, 'control');
  await fs.mkdir(control);
  await fs.mkdir(join(control, 'empty'));
  await fs.mkdir(join(control, 'tmp'));
  await writeExclusive(join(control, 'empty-config'), Buffer.from('\n'));
  await fs.mkdir(join(directory, 'preparation'));
  const config = join(control, 'empty-config');
  const env = { PATH: dirname(git.path), LANG: 'C', LC_ALL: 'C', TZ: 'UTC',
    TMPDIR: join(control, 'tmp'), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_SYSTEM: config,
    GIT_CONFIG_GLOBAL: config, GIT_ATTR_NOSYSTEM: '1', GIT_NO_REPLACE_OBJECTS: '1',
    GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' };
  const records = [];
  async function run(phase, assigned) {
    const observation = capture(assigned);
    const record = { phase, command: assigned, observation };
    const name = `${String(records.length).padStart(5, '0')}.json`;
    const bytes = jsonBytes(record);
    await writeExclusive(join(directory, 'preparation', name), bytes);
    records.push({ name, sha256: digest(bytes) });
    checkProcess(observation, assigned, { status: 0 });
    return observation.stdout;
  }
  const gitArgs = ['-c', `core.hooksPath=${join(control, 'empty')}`, '-c', 'core.autocrlf=false',
    '-c', `core.attributesFile=${config}`, '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false',
    '-c', 'core.sparseCheckout=false', '-c', 'maintenance.auto=false', '-c', 'gc.auto=0',
    '-c', 'protocol.file.allow=always'];
  const gitRun = (cwd, args) => run('git', command(git.path, [...gitArgs, ...args], cwd, env));
  return { directory, control, git, env, records, run, gitRun };
}
function nulRows(text) {
  need(text === '' || text.endsWith('\0'), 'truncated-git-list');
  return text === '' ? [] : text.slice(0, -1).split('\0');
}
async function treeRows(context, root, commit) {
  const rows = nulRows(await context.gitRun(root, ['ls-tree', '-r', '-z', commit]));
  need(rows.length > 0 && rows.length <= 12_000, 'source-file-count');
  const result = rows.map(row => {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/u.exec(row);
    need(match, 'source-links-submodules-or-special-files');
    const [, mode, oid, path] = match;
    need(!path.split('/').some(part => !part || part === '.' || part === '..')
      && !/[\0\r\n\\]/u.test(path) && !path.startsWith('/') && path.length <= 1024, 'source-path');
    return { path, mode, oid };
  });
  need(new Set(result.map(row => row.path)).size === result.length, 'duplicate-source-file');
  return result;
}
function ignoredAllowed(path) {
  return /^(?:node_modules|\.pnpm-store|\.agent-teams-local|coverage|dist)(?:\/|$)/u.test(path)
    || /^packages\/core\/(?:dist|dist-test|dist-stage0|dist-seed|dist-qualification)(?:\/|$)/u.test(path);
}
export async function inspectExactSource({ checkout, commit, context, dependencyMount }) {
  sha(commit);
  await canonicalDirectory(checkout);
  const gitRoot = (await context.gitRun(checkout, ['rev-parse', '--show-toplevel'])).trim();
  need(isAbsolute(gitRoot), 'absolute-git-root');
  assert.equal(await fs.realpath(gitRoot), checkout, 'Git root differs from the admitted checkout');
  assert.equal((await context.gitRun(checkout, ['rev-parse', 'HEAD'])).trim(), commit, 'source HEAD differs');
  const tree = (await context.gitRun(checkout, ['rev-parse', `${commit}^{tree}`])).trim();
  const rows = await treeRows(context, checkout, commit);
  const staged = nulRows(await context.gitRun(checkout, ['ls-files', '--stage', '-z'])).map(row => {
    const match = /^(100644|100755) ([a-f0-9]{40}) 0\t(.+)$/u.exec(row);
    need(match, 'unmerged-or-special-index');
    return { path: match[3], mode: match[1], oid: match[2] };
  });
  assert.deepEqual(staged, rows, 'index bytes/modes must match the requested commit');
  const flags = nulRows(await context.gitRun(checkout, ['ls-files', '-v', '-z']));
  assert.deepEqual(flags, rows.map(row => `H ${row.path}`), 'index flags cannot hide tracked edits');
  if (dependencyMount !== undefined) {
    await canonicalDirectory(dependencyMount);
    const mounted = join(checkout, 'node_modules');
    need((await fs.lstat(mounted)).isSymbolicLink(), 'controller-dependency-mount-required');
    assert.equal(await fs.readlink(mounted), dependencyMount, 'controller mount must use its exact assigned target');
    assert.equal(await fs.realpath(mounted), dependencyMount, 'controller mount target changed');
  }
  assert.deepEqual(nulRows(await context.gitRun(checkout, ['ls-files', '--others', '--exclude-standard', '-z']))
    .filter(path => dependencyMount !== undefined && path === 'node_modules' ? false : true), [],
    'untracked inputs are not admitted');
  const ignored = nulRows(await context.gitRun(checkout,
    ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '--no-empty-directory', '-z']));
  need(ignored.every(ignoredAllowed), 'unexpected-ignored-input');
  let total = 0;
  const entries = [];
  for (const row of rows) {
    const full = join(checkout, row.path);
    const bytes = await readBytes(full, 16 * 1024 * 1024);
    total += bytes.length;
    need(total <= 128 * 1024 * 1024, 'source-byte-budget');
    const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    assert.equal(blob, row.oid, `tracked bytes differ from Git object: ${row.path}`);
    const executable = !!((await fs.lstat(full)).mode & 0o111);
    assert.equal(executable, row.mode === '100755', `tracked mode differs: ${row.path}`);
    entries.push({ ...row, bytes: bytes.length, sha256: digest(bytes) });
  }
  return { commit, tree, entries, ignored, indexFlags: 'all-H', untracked: [] };
}
async function requireTracked(snapshot, paths) {
  const files = new Set(snapshot.entries.map(row => row.path));
  for (const path of paths) need(files.has(path), `mandatory-source-missing:${path}`);
}
export async function createExactSourceCheckout(context, origin, commit, label) {
  const bundle = join(context.directory, `${label}.bundle`);
  const destination = join(context.directory, label);
  await context.gitRun(origin, ['bundle', 'create', bundle, 'HEAD']);
  const bundleBytes = await readBytes(bundle);
  await context.gitRun(context.directory, ['clone', '--no-checkout', '--template', join(context.control, 'empty'), bundle, destination]);
  await context.gitRun(destination, ['checkout', '--detach', commit]);
  const snapshot = await inspectExactSource({ checkout: destination, commit, context });
  assert.deepEqual(snapshot.ignored, [], 'fresh object checkout has no inherited ignored output');
  return { path: destination, snapshot, bundle: { path: bundle, bytes: bundleBytes.length, sha256: digest(bundleBytes) } };
}
async function copyTree(origin, destination) {
  await canonicalDirectory(origin);
  const original = await scanTree(origin);
  await fs.mkdir(destination, { mode: 0o700 });
  for (const row of original.filter(value => value.kind === 'directory').sort((a, b) => a.path.length - b.path.length)) {
    await fs.mkdir(join(destination, row.path), { mode: 0o700 });
  }
  const entries = [];
  const links = [];
  for (const row of original) {
    const target = join(destination, row.path);
    if (row.kind === 'file') {
      const bytes = await readBytes(join(origin, row.path));
      assert.equal(digest(bytes), row.sha256, 'dependency changed while copying');
      await fs.writeFile(target, bytes, { flag: 'wx', mode: row.mode });
      await fs.chmod(target, row.mode);
      entries.push(row);
    } else if (row.kind === 'link') {
      const rewritten = relative(dirname(target), join(destination, row.resolved));
      await fs.symlink(rewritten, target);
      entries.push({ ...row, target: rewritten });
      links.push({ path: row.path, originalTarget: row.target, originalResolved: join(origin, row.resolved), retainedResolved: join(destination, row.resolved) });
    } else entries.push(row);
  }
  await checkTree(origin, original);
  await checkTree(destination, entries);
  return { origin, path: destination, entries, links };
}
async function retainProgram(program, destination) {
  const bytes = await readBytes(program.path);
  assert.equal(digest(bytes), program.sha256);
  await fs.writeFile(destination, bytes, { flag: 'wx', mode: 0o700 });
  return { ...program, origin: program.path, path: destination };
}
async function retainPackageTool(path, name, entry, destination) {
  const program = await canonicalProgram(path);
  const root = dirname(dirname(program.path));
  assert.equal(program.path, join(root, entry), 'explicit actual package CLI is required');
  const manifest = JSON.parse((await readBytes(join(root, 'package.json'))).toString('utf8'));
  assert.equal(manifest.name, name);
  const snapshot = await copyTree(root, destination);
  return { snapshot, program: { ...program, origin: program.path, path: join(destination, entry), version: manifest.version } };
}
async function trustedModules(root) {
  // Fixed paths from a verified TRUSTED checkout. No subject-supplied import.
  const load = name => import(pathToFileURL(join(root, SUPPORT + name)).href);
  const harness = await load('m1-packed-consumers.mjs');
  const archive = await load('package-archive.mjs');
  const javascript = await load('m1-javascript-closure.mjs');
  const declarations = await load('m1-declarations-closure.mjs');
  return { ...harness, ...archive, ...javascript, ...declarations };
}
async function toolsFor(context, trusted, supplied) {
  const originalNode = await canonicalProgram(supplied.node);
  assert.equal(originalNode.path, await fs.realpath(process.execPath), 'controller uses the selected Node executable');
  need(process.execArgv.length === 0, 'controller-node-flags');
  need(/^v24\.(?:18|19|[2-9]\d|[1-9]\d{2,})\.\d+$/u.test(process.version), 'accepted-node-interval');
  const node = { ...await retainProgram(originalNode, join(context.directory, 'node')), version: process.version };
  const npm = await retainPackageTool(supplied.npm, 'npm', 'bin/npm-cli.js', join(context.directory, 'npm'));
  const pnpm = await retainPackageTool(supplied.pnpm, 'pnpm', 'bin/pnpm.cjs', join(context.directory, 'pnpm'));
  assert.equal(pnpm.program.version, '11.20.0');
  const dependencies = await copyTree(join(trusted.origin, 'node_modules'), join(context.directory, 'dependencies'));
  await fs.symlink(dependencies.path, join(trusted.path, 'node_modules'), 'dir');
  const require = createRequire(join(trusted.path, 'package.json'));
  const yaml = await import(pathToFileURL(require.resolve('yaml')).href);
  const parseYaml = bytes => yaml.parse(bytes.toString('utf8'));
  const lockBytes = await readBytes(join(trusted.path, 'pnpm-lock.yaml'));
  assert.equal(digest(lockBytes), LOCK_HASH, 'this finite slice uses the supplied accepted lockfile');
  assert.deepEqual(parseYaml(await readBytes(join(dependencies.path, '.pnpm/lock.yaml'))), parseYaml(lockBytes),
    'local dependencies must have this exact installed lock');
  const workspace = parseYaml(await readBytes(join(trusted.path, 'pnpm-workspace.yaml')));
  const manifest = JSON.parse((await readBytes(join(trusted.path, 'package.json'))).toString('utf8'));
  assert.equal(manifest.packageManager, 'pnpm@11.20.0');
  assert.equal(manifest.engines.node, '>=24.18.0 <25');
  for (const [name, declared] of Object.entries(manifest.devDependencies)) {
    const selected = declared === 'catalog:' ? workspace.catalog[name] : declared;
    const expectedVersion = selected.startsWith('npm:') ? selected.slice(selected.lastIndexOf('@') + 1) : selected;
    const actualPath = await fs.realpath(join(dependencies.path, name, 'package.json'));
    need(within(actualPath, dependencies.path), 'dependency-manifest-outside-snapshot');
    const actual = JSON.parse((await readBytes(actualPath)).toString('utf8'));
    assert.equal(actual.version, expectedVersion, `locked root dependency: ${name}`);
    assert.equal(actual.name, name === 'typescript-minimum' ? 'typescript' : name);
  }
  const compilers = [];
  for (const [name, expected] of [['typescript', '7.0.2'], ['typescript-minimum', '5.8.3']]) {
    const manifestPath = await fs.realpath(join(dependencies.path, name, 'package.json'));
    const actual = JSON.parse((await readBytes(manifestPath)).toString('utf8'));
    assert.equal(actual.version, expected);
    const compiler = await canonicalProgram(join(dirname(manifestPath), 'bin/tsc'));
    compilers.push({ name, ...compiler, version: actual.version });
  }
  // The snapshots include the native TS implementation, all compiler libraries,
  // npm/pnpm bundled dependencies, parser, tar, Foundation presets and fixtures.
  return { node, npm: npm.program, pnpm: pnpm.program, compilers,
    snapshots: { dependencies, npm: npm.snapshot, pnpm: pnpm.snapshot } };
}
async function sourcePolicy(source, trusted) {
  for (const path of [BUILD, 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', 'tsconfig.base.json', ...configurations]) {
    assert.deepEqual(await readBytes(join(source, path)), await readBytes(join(trusted, path)), `reviewed build input: ${path}`);
  }
  assert.equal(digest(await readBytes(join(source, BUILD))), BUILD_HASH);
  assert.equal(digest(await readBytes(join(source, 'packages/core/package.json'))), MANIFEST_HASH);
  assert.deepEqual(await readBytes(join(source, 'packages/core/package.json')), await readBytes(join(trusted, 'packages/core/package.json')));
  const root = JSON.parse((await readBytes(join(source, 'package.json'))).toString('utf8'));
  const expected = JSON.parse((await readBytes(join(trusted, 'package.json'))).toString('utf8'));
  for (const key of ['packageManager', 'engines', 'devDependencies']) assert.deepEqual(root[key], expected[key]);
  // Unknown npm configuration must be reviewed explicitly, rather than silently
  // importing credentials, a user config path, proxies or executable hooks.
  const allowed = new Set(['ignore-scripts', 'engine-strict', 'strict-peer-dependencies',
    'auto-install-peers', 'shared-workspace-lockfile', 'save-exact', 'verify-store-integrity',
    'audit', 'fund', 'update-notifier', 'progress']);
  const npmrc = (await readBytes(join(source, '.npmrc'))).toString('utf8');
  for (const line of npmrc.split(/\r?\n/u).map(value => value.trim()).filter(value => value && !/^[#;]/u.test(value))) {
    const match = /^([a-z-]+)=(true|false)$/u.exec(line);
    need(match && allowed.has(match[1]), 'unreviewed-project-npm-configuration');
    if (match[1] === 'ignore-scripts') assert.equal(match[2], 'true');
  }
}
export async function verifyBuildCompiler(source, compiler) {
  const require = createRequire(join(source, BUILD));
  const selectedManifest = await fs.realpath(require.resolve('typescript/package.json'));
  const selected = await canonicalProgram(join(dirname(selectedManifest), 'bin/tsc'));
  assert.equal(selected.path, compiler.path, 'builder must resolve the admitted compiler');
  assert.equal(selected.bytes, compiler.bytes, 'builder compiler byte length changed');
  assert.equal(selected.sha256, compiler.sha256, 'builder compiler bytes changed');
}
async function packContext(context, modules, node) {
  const directory = join(context.directory, 'pack-context');
  await fs.mkdir(directory);
  for (const name of ['tmp', 'cache']) await fs.mkdir(join(directory, name));
  for (const name of ['user.npmrc', 'global.npmrc']) await writeExclusive(join(directory, name), Buffer.from('\n'));
  const env = modules.m1NodeEnvironment({ node: node.path, temporary: join(directory, 'tmp'),
    cache: join(directory, 'cache'), userconfig: join(directory, 'user.npmrc'), globalconfig: join(directory, 'global.npmrc') });
  return { directory, env };
}
async function auditArchive(modules, archive, source, packed) {
  const bytes = await readBytes(archive.path, 16 * 1024 * 1024);
  assert.equal(bytes.length, archive.bytes);
  const audited = modules.readPackageArchive(bytes, archive.identity);
  assert.deepEqual(modules.auditM1JavaScriptClosure(audited.files).exports, modules.runtimeNames);
  assert.deepEqual(modules.auditM1DeclarationClosure(audited.files).rootExports,
    ['CompileCompositionResult', 'CompositionPlan', 'CompositionProfile', 'Diagnostic', 'DiagnosticCode',
      'ModuleDeclaration', 'PlanDigest'].map(name => ({ name, kind: 'type' }))
      .concat(modules.runtimeNames.map(name => ({ name, kind: 'value' }))));
  const manifestBytes = await readBytes(join(source.path, 'packages/core/package.json'));
  assert.equal(digest(manifestBytes), MANIFEST_HASH);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  assert.deepEqual(audited.files.get('package.json'), manifestBytes);
  assert.equal(packed.integrity, archive.identity.integrity);
  assert.deepEqual(audited.inventory.map(({ path, size, mode }) => ({ path, size, mode })),
    [...packed.files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  assert.deepEqual(audited.inventory.map(row => row.path), [...manifest.files, 'LICENSE', 'README.md', 'package.json'].sort());
  const tracked = new Set(source.snapshot.entries.map(row => row.path));
  const origins = [];
  for (const member of audited.inventory) {
    assert.equal(member.mode, 0o644);
    let origin;
    if (member.path === 'LICENSE') {
      origin = tracked.has('packages/core/LICENSE') ? 'packages/core/LICENSE' : 'LICENSE';
      assert.deepEqual(audited.files.get(member.path), await readBytes(join(source.path, 'LICENSE')));
    } else {
      origin = `packages/core/${member.path}`;
      need(member.path.startsWith('dist/') || tracked.has(origin), 'unknown-archive-member-origin');
    }
    const built = await readBytes(join(source.path, origin), 8 * 1024 * 1024);
    assert.deepEqual(audited.files.get(member.path), built, `physical member differs from fresh build: ${member.path}`);
    origins.push({ path: member.path, origin, bytes: built.length, sha256: digest(built) });
  }
  return { audited, origins };
}
function preparedData(prepared) {
  return { cases: prepared.cases, artifacts: prepared.artifacts, trustedSources: prepared.trustedSources,
    toolchain: prepared.toolchain, archive: prepared.archive };
}
export function relocatePreparedPlan(plan, from, to) {
  // Regenerate in a new workspace without executing cases, then relocate only
  // this known workspace prefix and recompute generated-content references.
  const rewrite = value => {
    if (typeof value === 'string') return value.replaceAll(from, to);
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rewrite(child)]));
    return value;
  };
  const result = rewrite(plan);
  const hashes = new Map();
  const artifacts = new Map();
  for (const artifact of result.artifacts) {
    const old = artifact.sha256;
    artifact.bytes = Buffer.byteLength(artifact.content);
    artifact.sha256 = digest(artifact.content);
    if (old !== artifact.sha256) hashes.set(old, artifact.sha256);
    artifacts.set(artifact.path, artifact);
  }
  function bind(value) {
    if (typeof value === 'string') {
      for (const [old, current] of hashes) value = value.replaceAll(old, current);
      return value;
    }
    if (Array.isArray(value)) return value.map(bind);
    if (value && typeof value === 'object') {
      const result = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, bind(child)]));
      if (result.kind === 'generated' && artifacts.has(result.path)) {
        const artifact = artifacts.get(result.path);
        result.sha256 = artifact.sha256; result.bytes = artifact.bytes;
      }
      return result;
    }
    return value;
  }
  return bind(result);
}
function assertPlan(plan) {
  assert.equal(plan.cases.length, 97, 'all 97 prepared M1 cases are mandatory');
  assert.equal(new Set(plan.cases.map(row => row.id)).size, 97);
  assert.equal(new Set(plan.artifacts.map(row => row.path)).size, plan.artifacts.length);
  need(plan.artifacts.length > 0 && plan.artifacts.length <= 256, 'generated-inventory');
  for (const row of plan.cases) {
    need(row.inputs.length > 0, 'case-input-inventory');
    if (row.command) {
      assert.equal(row.command.timeoutMs, 60_000);
      assert.equal(row.command.maxOutputBytes, 4_000_000);
      assert.equal(row.command.maxProtocolBytes, 65_536);
    }
  }
}
async function verifyArtifacts(plan) {
  for (const artifact of plan.artifacts) {
    const bytes = await readBytes(artifact.path, 8 * 1024 * 1024);
    assert.equal(artifact.bytes, bytes.length);
    assert.equal(artifact.sha256, digest(bytes));
    assert.deepEqual(bytes, Buffer.from(artifact.content), 'retained generated bytes');
  }
}
async function recheckClosure(context, closure) {
  for (const subject of [closure.source, closure.trusted]) {
    await context.gitRun(subject.path, ['fsck', '--full', '--strict', '--no-reflogs']);
    const actual = await inspectExactSource({ checkout: subject.path, commit: subject.snapshot.commit, context,
      dependencyMount: closure.tools.snapshots.dependencies.path });
    assert.deepEqual(actual.entries, subject.snapshot.entries);
    assert.equal(actual.tree, subject.snapshot.tree);
    const bundle = await readBytes(subject.bundle.path);
    assert.equal(bundle.length, subject.bundle.bytes);
    assert.equal(digest(bundle), subject.bundle.sha256);
    assert.equal(await fs.readlink(join(subject.path, 'node_modules')), closure.tools.snapshots.dependencies.path);
  }
  for (const snapshot of Object.values(closure.tools.snapshots)) await checkTree(snapshot.path, snapshot.entries);
  for (const program of [closure.tools.node, closure.tools.npm, closure.tools.pnpm, ...closure.tools.compilers]) {
    const bytes = await readBytes(program.path);
    assert.equal(bytes.length, program.bytes);
    assert.equal(digest(bytes), program.sha256);
  }
}
async function finalInstalled(workspace, audited) {
  for (const consumer of ['first', 'second']) {
    const root = join(workspace, consumer, 'node_modules/@get-modular/core');
    const entries = await scanTree(root);
    need(entries.every(row => row.kind === 'file' || row.kind === 'directory'), 'installed-special-member');
    assert.deepEqual(entries.filter(row => row.kind === 'file').map(row => row.path), audited.inventory.map(row => row.path));
    for (const [path, expected] of audited.files) assert.deepEqual(await readBytes(join(root, path)), expected);
  }
}
async function journalWriter(directory, anchor, prepared, contextId, identity) {
  const rows = new Map(prepared.cases.map(row => [row.id, row]));
  let sequence = 0, total = 0;
  async function put(event) {
    const record = { sequence, anchor, ...event };
    const bytes = jsonBytes(record);
    need(sequence < retainedLimits.records && bytes.length <= retainedLimits.recordBytes
      && total + bytes.length <= retainedLimits.journalBytes, 'retained-observation-budget');
    await writeExclusive(join(directory, `${String(sequence).padStart(6, '0')}.json`), bytes);
    total += bytes.length; sequence += 1;
  }
  return {
    observe: async event => {
      const { case: row, contextId: actualContext, archiveIdentity, kind, ...details } = event;
      assert.equal(actualContext, contextId);
      assert.deepEqual(archiveIdentity, identity);
      // Preserve rejection/failure details too; the verifier will reject them.
      const caseId = row?.id ?? details.caseId ?? null;
      if (row) assert.deepEqual(row, rows.get(caseId));
      await put({ contextId, archiveIdentity, caseId, rowSha256: row ? rowDigest(row) : null, kind, details });
    },
    end: completed => put({ contextId, archiveIdentity: identity, caseId: null, rowSha256: null,
      kind: 'session-ended', details: { completed } }),
  };
}

export async function runM1RetainedSession({ trustedCheckout, sourceCheckout = trustedCheckout,
  sourceCommit, trustedCommit, outputDirectory, tools, onSeal, onObservations }) {
  sha(sourceCommit); sha(trustedCommit);
  need(typeof onSeal === 'function' && typeof onObservations === 'function', 'outside-capture-sinks-required');
  need(process.platform === 'linux', 'first-retained-adapter-requires-linux');
  await canonicalDirectory(trustedCheckout); await canonicalDirectory(sourceCheckout);
  assert.equal(await fs.realpath(fileURLToPath(import.meta.url)), join(trustedCheckout, SELF), 'run the reviewed trusted runner');
  await createOutputDirectory(outputDirectory, [trustedCheckout, sourceCheckout]);
  let phase = 'source-admission', prepared, anchor;
  try {
    const context = await makeContext(outputDirectory, tools.git);
    const admittedTrusted = await inspectExactSource({ checkout: trustedCheckout, commit: trustedCommit, context });
    const admittedSource = await inspectExactSource({ checkout: sourceCheckout, commit: sourceCommit, context });
    await requireTracked(admittedTrusted, [...mandatoryFiles, SELF, OBSERVATIONS, BUILD, ...configurations]);
    await requireTracked(admittedSource, [BUILD, 'packages/core/package.json', 'LICENSE', '.npmrc', ...configurations]);
    phase = 'exact-source-checkouts';
    const source = await createExactSourceCheckout(context, sourceCheckout, sourceCommit, 'source');
    const trusted = { ...await createExactSourceCheckout(context, trustedCheckout, trustedCommit, 'trusted'), origin: trustedCheckout };
    assert.deepEqual(source.snapshot.entries, admittedSource.entries);
    assert.deepEqual(trusted.snapshot.entries, admittedTrusted.entries);
    await sourcePolicy(source.path, trusted.path);
    phase = 'offline-dependency-snapshot';
    const toolchain = await toolsFor(context, trusted, tools);
    await fs.symlink(toolchain.snapshots.dependencies.path, join(source.path, 'node_modules'), 'dir');
    const modules = await trustedModules(trusted.path);
    const packing = await packContext(context, modules, toolchain.node);
    for (const [name, args, expected] of [
      ['node', ['--version'], toolchain.node.version],
      ['npm', [toolchain.npm.path, '--version'], toolchain.npm.version],
      ['pnpm', [toolchain.pnpm.path, '--version'], '11.20.0'],
      ...toolchain.compilers.map(value => [value.name, [value.path, '--version'], `Version ${value.version}`]),
    ]) assert.equal((await context.run(`identify/${name}`, command(toolchain.node.path, args, source.path, packing.env))).trim(), expected);
    const closure = { source, trusted, tools: toolchain,
      invokingSource: admittedSource, invokingTrusted: admittedTrusted, git: context.git,
      platform: { type: type(), release: release(), version: version(), arch: arch(), versions: { ...process.versions } } };
    // The baseline has ONLY committed source and the explicitly retained mount.
    const beforeBuild = await inspectExactSource({ checkout: source.path, commit: sourceCommit, context,
      dependencyMount: toolchain.snapshots.dependencies.path });
    need(beforeBuild.ignored.every(path => /^node_modules\/?$/u.test(path)), 'fresh-build-has-stale-output');
    phase = 'build';
    await verifyBuildCompiler(source.path, toolchain.compilers[0]);
    const buildCommand = command(toolchain.node.path, [join(source.path, BUILD)], source.path, packing.env, 240_000);
    await context.run('build', buildCommand);
    await inspectExactSource({ checkout: source.path, commit: sourceCommit, context,
      dependencyMount: toolchain.snapshots.dependencies.path });
    phase = 'pack';
    const pending = join(outputDirectory, 'pack-pending');
    await fs.mkdir(pending);
    const packCommand = command(toolchain.node.path, [toolchain.npm.path, 'pack', '--ignore-scripts', '--json', '--pack-destination', pending],
      join(source.path, 'packages/core'), packing.env);
    // The single production pack call. Neither shared consumers nor verifier pack.
    const report = JSON.parse(await context.run('pack', packCommand));
    assert.equal(report.length, 1);
    const packed = report[0];
    need(/^[A-Za-z0-9_.-]+\.tgz$/u.test(packed.filename), 'pack-filename');
    assert.deepEqual(await fs.readdir(pending), [packed.filename]);
    const pendingArchive = join(pending, packed.filename);
    const bytes = await readBytes(pendingArchive, 16 * 1024 * 1024);
    const identity = { sha256: digest(bytes), integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}` };
    assert.equal(packed.integrity, identity.integrity);
    const archive = { path: join(outputDirectory, `${identity.sha256}.tgz`), bytes: bytes.length, identity };
    // Publish a complete digest-named file exclusively, then remove only npm's
    // staging alias. This is one archive, not a second pack or changed subject.
    await writeExclusive(archive.path, bytes);
    await fs.chmod(archive.path, 0o444);
    await fs.unlink(pendingArchive);
    await writeExclusive(join(outputDirectory, 'pack.json'), jsonBytes(packed));
    phase = 'physical-and-content-audits';
    const { audited, origins } = await auditArchive(modules, archive, source, packed);
    await recheckClosure(context, closure);
    // Recheck the invoking tracked/index bytes too; ignored outputs are observed
    // there but have never been copied into the build authority.
    assert.deepEqual((await inspectExactSource({ checkout: sourceCheckout, commit: sourceCommit, context })).entries, admittedSource.entries);
    assert.deepEqual((await inspectExactSource({ checkout: trustedCheckout, commit: trustedCommit, context })).entries, admittedTrusted.entries);
    phase = 'prepare-and-seal';
    const workspace = join(outputDirectory, 'consumers');
    await fs.mkdir(workspace);
    const contextId = `private-m1-${randomUUID()}`;
    prepared = await modules.prepareM1PackedConsumers({ archive: { path: archive.path, identity, files: audited.files },
      workspace, toolchain, contextId });
    const plan = preparedData(prepared);
    assertPlan(plan);
    await verifyArtifacts(plan);
    await fs.mkdir(join(outputDirectory, 'observations'));
    const closureBytes = jsonBytes(closure);
    need(closureBytes.length <= retainedLimits.jsonBytes, 'closure-manifest-budget');
    await writeExclusive(join(outputDirectory, 'closure.json'), closureBytes);
    const seal = { format: 'private-retained-m1/1', status: 'not-claimed', contextId,
      sourceCommit, trustedCommit, outputDirectory, workspace, archive,
      closureSha256: digest(closureBytes), packedSha256: digest(jsonBytes(packed)),
      inventory: audited.inventory, origins, plan, buildCommand, packCommand,
      preparation: [...context.records], reuse: 'disabled',
      exclusions: ['M2/raw', 'M2/repeated-binding-records', 'M3/generated', 'six-runtime-matrix', 'publication', 'release-eligibility'] };
    const sealBytes = jsonBytes(seal);
    need(sealBytes.length <= retainedLimits.jsonBytes, 'seal-budget');
    await writeExclusive(join(outputDirectory, 'seal.json'), sealBytes);
    anchor = digest(sealBytes);
    // Give an outside caller the anchor BEFORE any prepared command executes.
    await captureOutsideAnchor(onSeal, { sourceCommit, trustedCommit, sealSha256: anchor, outputDirectory });
    const journal = await journalWriter(join(outputDirectory, 'observations'), anchor, prepared, contextId, identity);
    phase = 'consumers';
    for (const row of prepared.cases) {
      modules.readPackageArchive(await readBytes(archive.path, 16 * 1024 * 1024), identity);
      await prepared.runCase(row.id, journal.observe);
    }
    assert.deepEqual(prepared.progress(), { completed: plan.cases.map(row => row.id), failed: null, pending: [] });
    phase = 'final-custody-check';
    await recheckClosure(context, closure);
    await verifyArtifacts(plan);
    await auditArchive(modules, archive, source, packed);
    await journal.end(plan.cases.map(row => row.id));
    phase = 'capture-completed-observations';
    const observationsSha256 = digest(jsonBytes(await readJournal(join(outputDirectory, 'observations'))));
    await captureOutsideAnchor(onObservations, { sourceCommit, trustedCommit, sealSha256: anchor,
      observationsSha256, outputDirectory });
    phase = 'independent-completeness-check';
    const verified = await verifyM1RetainedSession({ trustedCheckout, trustedCommit, sourceCommit,
      directory: outputDirectory, sealSha256: anchor, observationsSha256, git: tools.git,
      verificationDirectory: join(outputDirectory, 'verification') });
    await writeExclusive(join(outputDirectory, 'completion.json'), jsonBytes(verified));
    return verified;
  } catch (error) {
    const failure = { format: 'private-retained-m1-failure/1', status: 'not-claimed', phase,
      sourceCommit, trustedCommit, sealSha256: anchor ?? null,
      progress: prepared?.progress() ?? { inventory: 'not-prepared' }, error: errorDetails(error) };
    try { await writeExclusive(join(outputDirectory, 'failure.json'), jsonBytes(failure)); }
    catch (retentionError) { error.retentionError = errorDetails(retentionError); }
    error.retainedDirectory = outputDirectory;
    throw error;
  }
}

export async function verifyM1RetainedSession({ trustedCheckout, trustedCommit, sourceCommit,
  directory, sealSha256, observationsSha256, git, verificationDirectory }) {
  sha(sourceCommit); sha(trustedCommit); sha256(sealSha256); sha256(observationsSha256);
  await canonicalDirectory(trustedCheckout); await canonicalDirectory(directory);
  assert.equal(await fs.realpath(fileURLToPath(import.meta.url)), join(trustedCheckout, SELF), 'use the independently trusted verifier checkout');
  const bytes = await readBytes(join(directory, 'seal.json'), retainedLimits.jsonBytes);
  assert.equal(digest(bytes), sealSha256, 'seal anchor must come from trusted invocation state, not this bundle');
  const seal = await readJson(join(directory, 'seal.json'));
  assert.equal(seal.format, 'private-retained-m1/1');
  assert.equal(seal.status, 'not-claimed');
  assert.equal(seal.sourceCommit, sourceCommit); assert.equal(seal.trustedCommit, trustedCommit);
  assert.equal(seal.outputDirectory, directory);
  assert.equal(seal.workspace, join(directory, 'consumers'));
  assert.equal(seal.reuse, 'disabled');
  for (const name of ['failure.json', 'completion.json.partial', 'seal.json.partial', 'closure.json.partial']) {
    try { await fs.lstat(join(directory, name)); need(false, `failed-or-incomplete-session:${name}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const closureBytes = await readBytes(join(directory, 'closure.json'), retainedLimits.jsonBytes);
  assert.equal(digest(closureBytes), seal.closureSha256);
  const closure = await readJson(join(directory, 'closure.json'));
  assert.equal(closure.source.path, join(directory, 'source'));
  assert.equal(closure.trusted.path, join(directory, 'trusted'));
  assert.equal(closure.source.snapshot.commit, sourceCommit);
  assert.equal(closure.trusted.snapshot.commit, trustedCommit);
  for (const snapshot of Object.values(closure.tools.snapshots)) need(within(snapshot.path, directory), 'snapshot-outside-session');
  await createOutputDirectory(verificationDirectory, [trustedCheckout, closure.source.path, closure.trusted.path, seal.workspace]);
  const context = await makeContext(verificationDirectory, git);
  assert.equal(context.git.sha256, closure.git.sha256);
  assert.equal(digest(await readBytes(await fs.realpath(process.execPath))), closure.tools.node.sha256);
  const trustedNow = await inspectExactSource({ checkout: trustedCheckout, commit: trustedCommit, context });
  await requireTracked(trustedNow, [...mandatoryFiles, SELF, OBSERVATIONS]);
  assert.deepEqual(trustedNow.entries, closure.trusted.snapshot.entries, 'verifier/checker/oracle source identity');
  await recheckClosure(context, closure);
  await sourcePolicy(closure.source.path, closure.trusted.path);
  await verifyBuildCompiler(closure.source.path, closure.tools.compilers[0]);
  const packed = await readJson(join(directory, 'pack.json'));
  assert.equal(digest(jsonBytes(packed)), seal.packedSha256);
  const modules = await trustedModules(closure.trusted.path);
  const { audited, origins } = await auditArchive(modules, seal.archive, closure.source, packed);
  assert.deepEqual(audited.inventory, seal.inventory); assert.deepEqual(origins, seal.origins);
  const phases = [];
  need(seal.preparation.length > 0 && seal.preparation.length <= 1024, 'preparation-inventory');
  for (const [index, reference] of seal.preparation.entries()) {
    assert.equal(reference.name, `${String(index).padStart(5, '0')}.json`);
    const path = join(directory, 'preparation', reference.name);
    assert.equal(digest(await readBytes(path, retainedLimits.recordBytes)), reference.sha256);
    const record = await readJson(path, retainedLimits.recordBytes);
    checkProcess(record.observation, record.command, { status: 0 });
    phases.push(record);
  }
  const builds = phases.filter(row => row.phase === 'build');
  const packs = phases.filter(row => row.phase === 'pack');
  assert.equal(builds.length, 1); assert.equal(packs.length, 1);
  assert.ok(phases.indexOf(builds[0]) < phases.indexOf(packs[0]));
  assert.deepEqual(builds[0].command, seal.buildCommand);
  assert.deepEqual(packs[0].command, seal.packCommand);
  const environment = modules.m1NodeEnvironment({ node: closure.tools.node.path,
    temporary: join(directory, 'pack-context/tmp'), cache: join(directory, 'pack-context/cache'),
    userconfig: join(directory, 'pack-context/user.npmrc'), globalconfig: join(directory, 'pack-context/global.npmrc') });
  assert.deepEqual(seal.buildCommand, command(closure.tools.node.path, [join(closure.source.path, BUILD)], closure.source.path, environment, 240_000));
  assert.deepEqual(seal.packCommand, command(closure.tools.node.path,
    [closure.tools.npm.path, 'pack', '--ignore-scripts', '--json', '--pack-destination', join(directory, 'pack-pending')],
    join(closure.source.path, 'packages/core'), environment));
  for (const name of ['user.npmrc', 'global.npmrc']) assert.deepEqual(await readBytes(join(directory, 'pack-context', name)), Buffer.from('\n'));
  assert.deepEqual(JSON.parse(packs[0].observation.stdout), [packed]);
  // Fresh preparation supplies the entire authoritative case/command/input list.
  // It has no pack or execute operation and does not reuse observed case results.
  const scratch = join(verificationDirectory, 'consumers');
  await fs.mkdir(scratch);
  const expected = await modules.prepareM1PackedConsumers({ archive: { path: seal.archive.path,
    identity: seal.archive.identity, files: audited.files }, workspace: scratch,
    toolchain: closure.tools, contextId: seal.contextId });
  const expectedPlan = relocatePreparedPlan(preparedData(expected), scratch, seal.workspace);
  assertPlan(expectedPlan);
  assert.deepEqual(seal.plan, expectedPlan, 'sealed inventory must equal independently regenerated trusted inventory');
  await verifyArtifacts(expectedPlan);
  const events = await readJournal(join(directory, 'observations'));
  verifyObservationAnchor(events, observationsSha256);
  const interpretation = verifyM1Observations({ expectedPlan, events, anchor: sealSha256,
    contextId: seal.contextId, archive: seal.archive, inventory: audited.inventory });
  await finalInstalled(seal.workspace, audited);
  modules.readPackageArchive(await readBytes(seal.archive.path, 16 * 1024 * 1024), seal.archive.identity);
  const result = { format: 'private-retained-m1-completeness/1', status: 'not-claimed',
    sourceCommit, trustedCommit, sealSha256, observationsSha256, archiveIdentity: seal.archive.identity,
    completed: interpretation.completed, evidenceDirectory: directory,
    claim: 'complete successful execution of this retained M1 inventory only' };
  try { assert.deepEqual(await readJson(join(directory, 'completion.json')), result); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return result;
}

export function parseRetainedM1Arguments(argv) {
  const [mode, ...arguments_] = argv;
  need(['run', 'verify'].includes(mode), 'explicit-run-or-verify-required');
  const options = {};
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index], value = arguments_[index + 1];
    need(/^--[a-z][a-z0-9-]*$/u.test(key) && typeof value === 'string' && !Object.hasOwn(options, key), 'cli-arguments');
    options[key] = value;
  }
  need(options['--opt-in-private-m1'] === 'yes', 'private-M1-opt-in-required');
  const allowed = mode === 'run'
    ? ['--opt-in-private-m1', '--trusted-checkout', '--source-checkout', '--source-commit', '--trusted-commit', '--output', '--git', '--node', '--npm', '--pnpm']
    : ['--opt-in-private-m1', '--trusted-checkout', '--source-commit', '--trusted-commit', '--output', '--git', '--seal-sha256', '--observations-sha256', '--verification-output'];
  need(Object.keys(options).every(key => allowed.includes(key)), 'unknown-cli-option');
  return { mode, options };
}
export async function retainedM1Main(argv) {
  const { mode, options: o } = parseRetainedM1Arguments(argv);
  const common = { trustedCheckout: o['--trusted-checkout'], trustedCommit: o['--trusted-commit'], sourceCommit: o['--source-commit'] };
  if (mode === 'run') return runM1RetainedSession({ ...common, sourceCheckout: o['--source-checkout'] ?? common.trustedCheckout,
    outputDirectory: o['--output'], tools: { git: o['--git'], node: o['--node'], npm: o['--npm'], pnpm: o['--pnpm'] },
    onSeal: anchor => writeM1Anchor({ phase: 'sealed-before-consumers', ...anchor }),
    onObservations: anchor => writeM1Anchor({ phase: 'completed-observations', ...anchor }) });
  return verifyM1RetainedSession({ ...common, directory: o['--output'], git: o['--git'],
    sealSha256: o['--seal-sha256'], observationsSha256: o['--observations-sha256'], verificationDirectory: o['--verification-output'] });
}
export async function writeM1Anchor(anchor, stream = process.stdout) {
  await new Promise((resolve, reject) => {
    stream.write(JSON.stringify(anchor) + '\n', error => error ? reject(error) : resolve());
  });
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.stdout.write(JSON.stringify(await retainedM1Main(process.argv.slice(2))) + '\n'); }
  catch (error) { process.stderr.write(JSON.stringify({ error: errorDetails(error), retainedDirectory: error.retainedDirectory ?? null }) + '\n'); process.exitCode = 1; }
}
