import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { objectSubjectCases } from './object-subject-cases.mjs';
import { objectResourceAdmissionCases } from './object-resource-admission.mjs';
import { objectResourceSemanticCases } from './object-resource-semantics.mjs';
import { authoringScale } from './type-scale.mjs';
import { diagnosticTypeCase } from './diagnostic-type-cases.mjs';
import { m1CaseIds, m1NodeCaseDefinitions, m1ErrorDetails, runtimeNames } from './m1-packed-object-consumer.mjs';

export { runtimeNames };

// Private, pack-free extraction interface:
//
// prepareM1PackedConsumers({
//   archive: { path, identity: { sha256, integrity }, files: audited.files },
//   workspace, toolchain: {
//     node: { path, version, sha256 }, npm: { path, version, sha256 },
//     compilers: [{ name, path, version, sha256 }, ...]
//   }, contextId, osEnvironment
// }) -> { cases, artifacts, trustedSources, toolchain, archive, runCase, progress }
//
// Paths are absolute and canonical. workspace is an existing empty directory
// disjoint from this trusted checkout and the caller-owned archive. Preparation
// writes only there, exclusively, and launches no commands or candidate code.
// Each artifact contains its exact UTF-8 content, byte count and SHA-256. Cases
// contain commands (including the complete environment), input references and
// expectations before installation. Object input is a constructing fixture
// reference, never a serialized substitute for its cooperative object graph.
//
// The caller can seal this plan before calling runCase(id, observe), in inventory
// order, once per case. observe is an awaited sink: command captures precede
// assertions, and failures are observed before the original error is rethrown.
// A sink failure aborts execution too. progress is live scheduling state, not a
// retained result verifier. No retry, case selection, cleanup or retention is
// hidden in this interface.
//
// The caller admits the archive and establishes source, checker and toolchain
// trust. Entry-byte checks here do not establish the transitive compiler/parser/
// standard-library or fixture/recipe/vector provenance closure. trustedSources
// identifies direct harness inputs; the later controller must bind their full
// trusted dependency closure separately. contextId is a caller binding, not a
// manufactured provenance claim. Physical/content audits and source/member
// comparisons remain with the caller. Nothing here packs, builds, downloads a
// compiler, publishes, stores retained evidence or grants artifact ownership.
// Subprocess separation is not a malicious-code security sandbox.

const TIMEOUT = 60_000;
const MAX_OUTPUT = 4_000_000;
const MAX_PROTOCOL = 65_536;
const MAX_CASES = 256;
const trustedRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const childPath = fileURLToPath(new URL('./m1-packed-object-consumer.mjs', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function absolute(path) {
  assert.equal(typeof path, 'string');
  assert.ok(isAbsolute(path) && resolve(path) === path, 'an absolute normalized path is required');
  assert.ok(path.length <= 4096 && !/[\r\n\0]/u.test(path));
  return path;
}
function within(path, directory) {
  const suffix = relative(directory, path);
  return suffix === '' || (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith(`..${sep}`));
}

// Construct a complete child environment, never spread process.env. The only
// inherited OS values admitted are the Windows runtime directory values. npm's
// user/global config files, project config, caches and temporary files are
// explicit. Ambient NODE_OPTIONS, NODE_PATH, npm configuration, credentials,
// proxy settings, loader settings and test-runner variables do not propagate.
export function m1NodeEnvironment({ node, temporary, cache, userconfig, globalconfig, osEnvironment = {} }) {
  for (const path of [node, temporary, cache, userconfig, globalconfig]) absolute(path);
  const accepted = {};
  for (const [key, value] of Object.entries(osEnvironment)) {
    assert.ok(process.platform === 'win32' && ['SystemRoot', 'WINDIR'].includes(key), `unaccepted OS variable: ${key}`);
    assert.equal(typeof value, 'string');
    assert.ok(value.length > 0 && value.length <= 4096 && !/[\r\n\0]/u.test(value));
    accepted[key] = value;
  }
  if (process.platform === 'win32') assert.ok(accepted.SystemRoot, 'Windows requires an explicit SystemRoot');
  return freeze({ ...accepted, PATH: dirname(node), TMPDIR: temporary, TMP: temporary, TEMP: temporary,
    LANG: 'C', LC_ALL: 'C', TZ: 'UTC',
    npm_config_cache: cache, npm_config_userconfig: userconfig, npm_config_globalconfig: globalconfig,
    npm_config_ignore_scripts: 'true', npm_config_offline: 'true', npm_config_audit: 'false',
    npm_config_fund: 'false', npm_config_update_notifier: 'false', npm_config_progress: 'false',
    npm_config_registry: 'https://registry.npmjs.org/' });
}

async function sourceReference(path, kind) {
  absolute(path);
  assert.equal(await realpath(path), path, 'input paths must identify their actual files');
  assert.equal((await lstat(path)).isFile(), true, 'input must be a regular file');
  const bytes = await readFile(path);
  return freeze({ kind, path, bytes: bytes.length, sha256: hash(bytes) });
}

function capture(command) {
  let result;
  try {
    result = spawnSync(command.executable, command.args, { cwd: command.cwd, env: command.env,
      stdio: ['ignore', 'pipe', 'pipe', 'pipe'], timeout: command.timeoutMs,
      maxBuffer: command.maxOutputBytes, killSignal: 'SIGKILL', windowsHide: true });
  } catch (error) {
    result = { error, status: null, signal: null };
  }
  const stdout = result.stdout ?? Buffer.alloc(0);
  const stderr = result.stderr ?? Buffer.alloc(0);
  const protocol = result.output?.[3] ?? Buffer.alloc(0);
  // Prioritize the dedicated completion channel while bounding total capture.
  const protocolLength = Math.min(protocol.length, MAX_PROTOCOL, MAX_OUTPUT);
  const stdoutLength = Math.min(stdout.length, MAX_OUTPUT - protocolLength);
  const stderrLength = Math.min(stderr.length, MAX_OUTPUT - protocolLength - stdoutLength);
  const timedOut = result.error?.code === 'ETIMEDOUT';
  const outputLimitExceeded = result.error?.code === 'ENOBUFS'
    || stdout.length + stderr.length + protocol.length > MAX_OUTPUT || protocol.length > MAX_PROTOCOL;
  return freeze({ status: result.status ?? null, signal: result.signal ?? null,
    error: result.error ? m1ErrorDetails(result.error) : null,
    spawnError: result.error && !['ETIMEDOUT', 'ENOBUFS'].includes(result.error.code) ? m1ErrorDetails(result.error) : null,
    timedOut, outputLimitExceeded,
    stdout: stdout.subarray(0, stdoutLength).toString('utf8'),
    stderr: stderr.subarray(0, stderrLength).toString('utf8'),
    protocol: protocol.subarray(0, protocolLength).toString('utf8'),
    receivedBytes: { stdout: stdout.length, stderr: stderr.length, protocol: protocol.length },
    truncated: { stdout: stdoutLength !== stdout.length, stderr: stderrLength !== stderr.length,
      protocol: protocolLength !== protocol.length } });
}
function completedProcess(observation) {
  const details = `${JSON.stringify({ error: observation.error, signal: observation.signal,
    timedOut: observation.timedOut, outputLimitExceeded: observation.outputLimitExceeded })}\n${observation.stdout}${observation.stderr}`;
  assert.equal(observation.error, null, details);
  assert.equal(observation.signal, null, details);
  assert.equal(observation.timedOut, false, details);
  assert.equal(observation.outputLimitExceeded, false, details);
  assert.ok(Number.isInteger(observation.status), details);
}
function success(observation) {
  assert.equal(observation.status, 0, observation.stdout + observation.stderr);
}
function completedNodeCase(observation, binding) {
  success(observation);
  const lines = observation.protocol.split('\n');
  assert.equal(lines.pop(), '', 'the dedicated completion channel must end with a complete record');
  assert.equal(lines.length, 2, 'the assigned Node case must start and complete exactly once');
  assert.deepEqual(lines.map(line => JSON.parse(line)),
    [{ ...binding, phase: 'started' }, { ...binding, phase: 'passed' }],
    'zero exit and stdout markers cannot replace exact completion of the assigned case');
}

const projectConfig = 'ignore-scripts=true\noffline=true\naudit=false\nfund=false\nupdate-notifier=false\nprogress=false\npackage-lock=false\nsave=false\n';
const consumerManifest = '{"name":"get-modular-consumer-sandbox","private":true,"type":"module"}\n';
const jsdoc = `// @ts-check
import {defineModule, required, optional, many} from '@get-modular/core';
/** @type {'required'} */ const r = required().kind;
/** @type {'optional'} */ const o = optional().kind;
const cardinality = many({min:0,max:2}); cardinality.max = 3;
const declaration = defineModule({kind:'get-modular.module-declaration',schemaVersion:1,
  moduleId:'example/app',implementationId:'example/app/default',
  owner:{authority:'example',path:['app']},provides:[],slots:[]});
/** @type {'example/app'} */ const literal = declaration.moduleId;
/** @type {import('@get-modular/core').ModuleDeclaration} */ const wire = declaration;
// @ts-expect-error numeric bounds only
many({min:'0',max:2});
// @ts-expect-error required has no arguments
required({});
// @ts-expect-error both bounds are required
many({min:0});
`;
const declarations = `
import { compileComposition, defineModule, required, optional, many,
  type ModuleDeclaration, type CompositionProfile, type CompositionPlan,
  type CompileCompositionResult, type Diagnostic, type DiagnosticCode, type PlanDigest } from '@get-modular/core';
const declaration = defineModule({ kind: 'get-modular.module-declaration', schemaVersion: 1,
  moduleId: 'example/app', implementationId: 'example/app/default',
  owner: { authority: 'example', path: ['app'] }, provides: [], slots: [] });
const literal: 'example/app' = declaration.moduleId;
const wire: ModuleDeclaration = declaration;
const profile = { kind: 'get-modular.composition-profile', schemaVersion: 1, profileId: 'example/main',
  roots: [declaration.moduleId], selections: [{ moduleId: declaration.moduleId, implementationId: declaration.implementationId }], bindings: [] } satisfies CompositionProfile;
const pending: Promise<CompileCompositionResult> = compileComposition({ declarations: [declaration, null], profile });
const r = required(); r.kind = 'required';
const o = optional(); o.kind = 'optional';
const m = many({ min: 0, max: 2 }); m.max = 3;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const equal: Equal<DiagnosticCode, Diagnostic['code']> = true;
declare const result: CompileCompositionResult;
if (result.ok) { const plan: CompositionPlan = result.plan; const digest: PlanDigest = result.digest; }
else { const diagnostics: readonly Diagnostic[] = result.diagnostics; }
// @ts-expect-error reserved failure is not an emittable code
const reserved: DiagnosticCode = 'output.canonicalization-failed';
declare const declarePlan: CompositionPlan;
// @ts-expect-error public plans are immutable
declarePlan.roots.push('example/extra');
// @ts-expect-error nested bindings are immutable
declarePlan.bindings[0].providerImplementationIds.push('example/provider/default');
// @ts-expect-error helper takes no options
required({});
// @ts-expect-error many requires both bounds
many({ min: 0 });
// @ts-expect-error fresh wire values have no arbitrary fields
const excess = { ...declaration, extra: true } satisfies ModuleDeclaration;
// @ts-expect-error raw input is excluded from M1
import { compileCompositionJson } from '@get-modular/core';
// @ts-expect-error private factory is excluded
import { createCompilerFacade } from '@get-modular/core';
// @ts-expect-error no public historical catalog
import type { DiagnosticCatalogCode } from '@get-modular/core';
${authoringScale}
`;

export async function prepareM1PackedConsumers({ archive, workspace, toolchain, contextId, osEnvironment = {} }) {
  assert.equal(typeof contextId, 'string');
  assert.ok(contextId.length > 0 && contextId.length <= 256 && !/[\r\n\0]/u.test(contextId));
  absolute(workspace);
  assert.equal((await lstat(workspace)).isDirectory(), true);
  assert.equal(await realpath(workspace), workspace);
  assert.deepEqual(await readdir(workspace), [], 'the caller supplies a fresh empty consumer workspace');
  assert.ok(!within(workspace, trustedRoot) && !within(trustedRoot, workspace), 'consumers must be outside the trusted checkout');
  absolute(archive.path);
  assert.equal(await realpath(archive.path), archive.path);
  assert.ok(!within(archive.path, workspace), 'the archive remains outside the consumer workspace');
  assert.deepEqual(Object.keys(archive.identity).sort(), ['integrity', 'sha256']);
  assert.match(archive.identity.sha256, /^[a-f0-9]{64}$/u);
  assert.match(archive.identity.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/u);
  const identity = freeze({ ...archive.identity });
  const archivePath = archive.path;
  assert.ok(archive.files instanceof Map && archive.files.size > 0 && archive.files.size <= 512);
  const files = new Map([...archive.files].map(([path, bytes]) => [path, Buffer.from(bytes)]));
  const expectedPaths = [...files.keys()].sort();
  const archiveReference = freeze({ kind: 'archive', path: archivePath, sha256: identity.sha256, integrity: identity.integrity });

  // The resource arrays are the actual arrays already spread into the common
  // fixture source. Validate their expansion, without maintaining another list.
  for (const family of [objectResourceAdmissionCases, objectResourceSemanticCases]) {
    m1CaseIds(family);
    assert.ok(family.every(fixture => objectSubjectCases.includes(fixture)), 'every resource fixture belongs to the shared subject cases');
  }
  const nodeCases = m1NodeCaseDefinitions(objectSubjectCases);
  const pins = [['typescript', '7.0.2'], ['typescript-minimum', '5.8.3']];
  assert.deepEqual(toolchain.compilers.map(({ name, version }) => [name, version]), pins);
  assert.match(toolchain.node.version, /^v24\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u);
  assert.ok(Number(toolchain.node.version.split('.')[1]) >= 18, 'Node must be in >=24.18.0 <25');
  assert.match(toolchain.npm.version, /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/u);
  async function admitProgram(value) {
    assert.match(value.sha256, /^[a-f0-9]{64}$/u);
    assert.ok(!within(absolute(value.path), workspace));
    const reference = await sourceReference(value.path, 'toolchain');
    assert.equal(reference.sha256, value.sha256, 'trusted toolchain entry bytes must match the supplied identity');
    return freeze({ ...reference, version: value.version, ...(value.name ? { name: value.name } : {}) });
  }
  const admitted = freeze({ node: await admitProgram(toolchain.node), npm: await admitProgram(toolchain.npm),
    compilers: await Promise.all(toolchain.compilers.map(admitProgram)) });
  const trustedSources = [];
  for (const name of ['m1-packed-consumers.mjs', 'm1-packed-object-consumer.mjs', 'object-subject-cases.mjs',
    'object-resource-admission.mjs', 'object-resource-semantics.mjs', 'type-scale.mjs', 'diagnostic-type-cases.mjs']) {
    trustedSources.push(await sourceReference(fileURLToPath(new URL(name, import.meta.url)), 'trusted-source'));
  }
  freeze(trustedSources);

  for (const directory of ['config', 'tmp', 'npm-cache', 'npm-cache/toolchain', 'npm-cache/first', 'npm-cache/second', 'first', 'second']) {
    await mkdir(join(workspace, directory));
  }
  const artifacts = [];
  async function artifact(path, content) {
    const destination = join(workspace, path);
    const value = freeze({ kind: 'generated', path: destination, content,
      bytes: Buffer.byteLength(content), sha256: hash(content) });
    await writeFile(destination, content, { flag: 'wx', mode: 0o600 });
    artifacts.push(value);
    return freeze({ kind: value.kind, path: value.path, bytes: value.bytes, sha256: value.sha256 });
  }
  const userconfig = await artifact('config/user.npmrc', '\n');
  const globalconfig = await artifact('config/global.npmrc', '\n');
  const consumers = [];
  for (const name of ['first', 'second']) {
    const packageJson = await artifact(`${name}/package.json`, consumerManifest);
    const npmrc = await artifact(`${name}/.npmrc`, projectConfig);
    const path = join(workspace, name);
    const cache = join(workspace, 'npm-cache', name);
    const env = m1NodeEnvironment({ node: admitted.node.path, temporary: join(workspace, 'tmp'), cache,
      userconfig: userconfig.path, globalconfig: globalconfig.path, osEnvironment });
    consumers.push({ name, path, cache, env, inputs: [userconfig, globalconfig, packageJson, npmrc] });
  }
  const consumer = consumers[0];
  const toolEnv = m1NodeEnvironment({ node: admitted.node.path, temporary: join(workspace, 'tmp'),
    cache: join(workspace, 'npm-cache/toolchain'), userconfig: userconfig.path, globalconfig: globalconfig.path, osEnvironment });
  function command(args, cwd = consumer.path, env = consumer.env) {
    return freeze({ executable: admitted.node.path, args: [...args], cwd, env,
      timeoutMs: TIMEOUT, maxOutputBytes: MAX_OUTPUT, maxProtocolBytes: MAX_PROTOCOL, killSignal: 'SIGKILL' });
  }
  const cases = [];
  const actions = new Map();
  function add(row, action) {
    cases.push(freeze(row));
    actions.set(row.id, action);
  }
  for (const [id, program, args, stdout] of [
    ['node', admitted.node, ['--version'], admitted.node.version],
    ['npm', admitted.npm, [admitted.npm.path, '--version'], admitted.npm.version],
    ...admitted.compilers.map(value => [value.name, value, [value.path, '--version'], `Version ${value.version}`]),
  ]) {
    add({ id: `toolchain/${id}`, title: `trusted ${id} reports its supplied version`, kind: 'toolchain',
      inputs: [admitted.node, program, userconfig, globalconfig],
      command: command(args, consumer.path, toolEnv), expected: { status: 0, stdoutTrimmed: stdout } }, async ({ run }) => {
      const observed = await run();
      success(observed);
      assert.equal(observed.protocol, '');
      assert.equal(observed.stdout.trim(), stdout, observed.stdout + observed.stderr);
    });
  }

  async function checkArchive(emit) {
    const metadata = await lstat(archivePath);
    await emit('archive-file', { path: archivePath, regular: metadata.isFile(), bytes: metadata.size });
    assert.equal(metadata.isFile(), true);
    assert.ok(metadata.size <= 16 * 1024 * 1024, 'archive reads remain bounded');
    const bytes = await readFile(archivePath);
    const actual = { sha256: hash(bytes), integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}` };
    await emit('archive-identity', { actual });
    assert.deepEqual(actual, identity, 'every installation and final guard use the same compressed archive bytes');
  }
  async function checkInstalled(path, emit) {
    const installedPath = join(path, 'node_modules/@get-modular/core');
    const rootMetadata = await lstat(installedPath);
    await emit('installed-root', { path: installedPath, directory: rootMetadata.isDirectory(), symlink: rootMetadata.isSymbolicLink() });
    assert.equal(rootMetadata.isDirectory(), true);
    const installed = await realpath(installedPath);
    assert.equal(installed, installedPath);
    const pending = [''];
    const installedFiles = [];
    let entries = 0;
    while (pending.length) {
      const directory = pending.pop();
      const names = await readdir(join(installed, directory));
      entries += names.length;
      assert.ok(entries <= 2048, 'installed inventory traversal remains bounded');
      for (const name of names.sort()) {
        const path = directory ? join(directory, name) : name;
        const destination = join(installed, path);
        const metadata = await lstat(destination);
        const canonicalPath = path.split(sep).join('/');
        if (metadata.isDirectory()) { pending.push(path); continue; }
        await emit('installed-member', { path: canonicalPath, regular: metadata.isFile(), symlink: metadata.isSymbolicLink(), bytes: metadata.size });
        assert.equal(metadata.isFile(), true, 'installed package contains regular files only');
        assert.ok(metadata.size <= 8 * 1024 * 1024, 'installed file reads remain bounded');
        const bytes = await readFile(destination);
        await emit('installed-member-bytes', { path: canonicalPath, bytes: bytes.length, sha256: hash(bytes) });
        installedFiles.push(canonicalPath);
        assert.deepEqual(bytes, files.get(canonicalPath), `installed bytes equal the audited archive member: ${canonicalPath}`);
      }
    }
    installedFiles.sort();
    await emit('installed-inventory', { paths: installedFiles });
    assert.deepEqual(installedFiles, expectedPaths);
  }
  // Two distinct initially empty caches install the same caller-owned bytes.
  // Only the first installation executes the shared Node/TypeScript matrix.
  for (const current of consumers) {
    add({ id: `install/${current.name}`, title: `offline installation ${current.name} has exactly the audited regular files`, kind: 'install',
      inputs: [archiveReference, admitted.node, admitted.npm, ...current.inputs],
      command: command([admitted.npm.path, 'install', '--ignore-scripts', '--offline', '--no-audit', '--no-fund',
        '--no-save', '--no-package-lock', '--workspaces=false', '--global=false', '--prefix', current.path, archivePath], current.path, current.env),
      expected: { status: 0, installedFiles: expectedPaths, archiveIdentity: identity, emptyCache: true } }, async ({ run, emit }) => {
      const cacheEntries = await readdir(current.cache);
      await emit('install-cache', { path: current.cache, entries: cacheEntries.slice(0, 512), count: cacheEntries.length });
      assert.deepEqual(cacheEntries, [], 'each offline installation starts with an empty cache');
      await checkArchive(emit);
      const observed = await run();
      success(observed);
      assert.equal(observed.protocol, '');
      await checkInstalled(current.path, emit);
    });
  }

  for (const [index, definition] of nodeCases.entries()) {
    const assignment = { caseId: definition.id, contextId, archiveIdentity: identity, consumer: consumer.path };
    // These two closures reside in the installed consumer module, so bare ESM
    // resolution/import exercises its real package root. The child helper owns
    // all assertions and actual object fixture execution, with no compiler RPC.
    const script = await artifact(`first/node-${index}.mjs`,
      `import { executeM1NodeCase } from ${JSON.stringify(pathToFileURL(childPath).href)};\n`
      + `await executeM1NodeCase({ ...${JSON.stringify(assignment)}, inputSha256: process.argv[2] }, {\n`
      + `  resolve: specifier => import.meta.resolve(specifier),\n`
      + `  load: specifier => import(specifier),\n`
      + `});\n`);
    const binding = { caseId: definition.id, contextId, archiveIdentity: identity, inputSha256: script.sha256 };
    add({ id: definition.id, title: definition.title, kind: definition.construction ? 'object' : 'node',
      inputs: [archiveReference, admitted.node, ...consumer.inputs, script, ...trustedSources],
      ...(definition.construction ? { construction: definition.construction } : {}),
      command: command([...definition.flags, script.path, script.sha256]),
      expected: { status: 0, assertions: definition.expected,
        completion: [{ ...binding, phase: 'started' }, { ...binding, phase: 'passed' }] } }, async ({ run }) => {
      completedNodeCase(await run(), binding);
    });
  }

  const diagnosticSource = await artifact('first/diagnostics.mts', diagnosticTypeCase('@get-modular/core'));
  const jsdocSource = await artifact('first/authoring.mjs', jsdoc);
  const mts = await artifact('first/case.mts', declarations);
  const cts = await artifact('first/case.cts', declarations);
  const legacy = await artifact('first/legacy.mts', 'import { defineModule } from "@get-modular/core";\nvoid defineModule;\n');
  let configIndex = 0;
  async function typeCase(compiler, id, title, source, compilerOptions, code = null) {
    const configName = `tsconfig-${configIndex++}.json`;
    const config = await artifact(`first/${configName}`, JSON.stringify({ compilerOptions,
      files: [relative(consumer.path, source.path).split(sep).join('/')] }));
    add({ id: `typescript/${compiler.name}/${id}`, title: `TypeScript ${compiler.version} ${title}`, kind: 'typescript',
      inputs: [archiveReference, admitted.node, compiler, ...consumer.inputs, source, config, ...trustedSources],
      command: command([compiler.path, '-p', configName, '--pretty', 'false']),
      expected: { status: code ? 'nonzero' : 0, diagnosticCodes: code ? [code] : [] } }, async ({ run }) => {
      const observed = await run();
      assert.equal(observed.protocol, '');
      if (code) {
        assert.notEqual(observed.status, 0, observed.stdout + observed.stderr);
        assert.deepEqual([...new Set(observed.stdout.match(/TS\d+/gu))], [code], observed.stdout + observed.stderr);
      } else success(observed);
    });
  }
  for (const compiler of admitted.compilers) {
    for (const [id, title, source, extra] of [
      ['diagnostic-contract', 'preserves exhaustive accepted diagnostic contract through the installed root', diagnosticSource, {}],
      ['jsdoc-checkjs', 'preserves JavaScript JSDoc and checkJs through the installed root', jsdocSource, { allowJs: true, checkJs: true }],
    ]) {
      await typeCase(compiler, id, title, source, { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext',
        strict: true, exactOptionalPropertyTypes: true, noEmit: true, skipLibCheck: false, types: [], ...extra });
    }
  }
  for (const compiler of admitted.compilers) {
    for (const [mode, extension, module] of [
      ['NodeNext', 'mts', 'NodeNext'], ['Node16', 'mts', 'Node16'], ['NodeNext', 'cts', 'NodeNext'],
      ['Bundler', 'mts', 'ESNext'], ['Node16', 'cts', 'Node16'], ['Node10', 'mts', 'ESNext'], ['Classic', 'mts', 'ESNext'],
    ]) {
      const removed = ['Node10', 'Classic'].includes(mode);
      const code = mode === 'Node16' && extension === 'cts' ? 'TS1479'
        : removed ? compiler.name === 'typescript-minimum' ? mode === 'Node10' ? 'TS2307' : 'TS2792' : 'TS5108' : null;
      await typeCase(compiler, `${mode}/${extension}`,
        `${mode}/${extension} ${code ? 'rejects unsupported resolution' : 'preserves the packed contract and 1000 literal declarations'}`,
        removed ? legacy : extension === 'cts' ? cts : mts,
        { target: 'ES2022', module, moduleResolution: mode, strict: true,
          exactOptionalPropertyTypes: true, skipLibCheck: false, types: [], noEmit: true }, code);
    }
  }
  add({ id: 'archive-unchanged', title: 'consumer execution preserves the compressed archive identity', kind: 'archive',
    inputs: [archiveReference], command: null, expected: { archiveIdentity: identity } }, async ({ emit }) => checkArchive(emit));
  m1CaseIds(cases);
  assert.ok(cases.length <= MAX_CASES);
  freeze(cases);
  freeze(artifacts);

  async function checkInputs(row, emit) {
    for (const input of new Map(row.inputs.filter(input => input.kind !== 'archive').map(input => [input.path, input])).values()) {
      const metadata = await lstat(input.path);
      await emit('input-file', { path: input.path, regular: metadata.isFile(), bytes: metadata.size });
      assert.equal(metadata.isFile(), true, 'prepared inputs remain regular files');
      assert.equal(metadata.size, input.bytes, 'prepared input size must remain unchanged');
      const bytes = await readFile(input.path);
      const actual = hash(bytes);
      await emit('input-identity', { path: input.path, sha256: actual, bytes: bytes.length });
      assert.equal(bytes.length, input.bytes);
      assert.equal(actual, input.sha256, 'the command must consume its exact prepared input');
    }
  }
  let next = 0;
  let failed = null;
  let running = false;
  async function runCase(id, observe) {
    assert.equal(typeof observe, 'function', 'an observation sink is required');
    const row = cases[next];
    if (running || failed !== null || !row || row.id !== id) {
      failed ??= typeof id === 'string' ? id.slice(0, 160) : 'invalid-case-request';
      await observe(freeze({ kind: 'case-rejected', contextId, archiveIdentity: identity,
        caseId: typeof id === 'string' ? id.slice(0, 160) : null, expectedCaseId: row?.id ?? null }));
      throw new Error('M1 cases execute once, sequentially, in the prepared closed inventory order.');
    }
    running = true;
    const emit = (kind, details = {}) => observe(freeze({ kind, contextId, archiveIdentity: identity, case: row, ...details }));
    try {
      await emit('case-started');
      await checkInputs(row, emit);
      const run = async () => {
        assert.ok(row.command, 'this case has an assigned command');
        const observation = capture(row.command);
        await emit('command', { observation });
        completedProcess(observation);
        return observation;
      };
      await actions.get(row.id)({ run, emit });
      await emit('case-passed');
      next += 1;
    } catch (error) {
      failed = row.id;
      await emit('case-failed', { error: m1ErrorDetails(error) });
      throw error;
    } finally {
      running = false;
    }
  }
  return Object.freeze({ cases, artifacts, trustedSources, toolchain: admitted,
    archive: freeze({ ...archiveReference, files: [...files].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: hash(bytes) })) }),
    runCase,
    progress: () => freeze({ completed: cases.slice(0, next).map(row => row.id), failed,
      pending: cases.slice(next).filter(row => row.id !== failed).map(row => row.id) }) });
}
