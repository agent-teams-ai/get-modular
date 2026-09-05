import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { checkProcess, checkTree, createOutputDirectory, digest, jsonBytes, readJournal,
  rowDigest, scanTree, verifyM1Observations, writeExclusive, captureOutsideAnchor, verifyObservationAnchor } from '../../../../tests/qualification/support/m1-retained-observations.mjs';
import { createExactSourceCheckout, inspectExactSource, parseRetainedM1Arguments, relocatePreparedPlan, retainedM1Main, runM1RetainedSession, verifyBuildCompiler, writeM1Anchor } from '../../../../tests/qualification/m1-retained-session.mjs';

// Controlled TEST transports below do not build, install or qualify Core. The
// real opt-in retained command executes the shared 97-case inventory separately.
const identity = { sha256: 'a'.repeat(64), integrity: 'sha512-' + 'A'.repeat(86) + '==' };
const archive = { path: '/TEST/archive.tgz', bytes: 12, identity };
const assigned = { executable: '/TEST/node', args: ['/TEST/consumer.mjs'], cwd: '/TEST', env: {},
  timeoutMs: 60_000, maxOutputBytes: 4_000_000, maxProtocolBytes: 65_536, killSignal: 'SIGKILL' };
function outcome(expected) {
  const protocol = expected.completion?.map(value => JSON.stringify(value) + '\n').join('') ?? '';
  const stdout = expected.diagnosticCodes?.join('\n') ?? expected.stdoutTrimmed ?? '';
  return { status: expected.status === 'nonzero' ? 2 : 0, signal: null, error: null, spawnError: null,
    timedOut: false, outputLimitExceeded: false, stdout, stderr: '', protocol,
    receivedBytes: { stdout: Buffer.byteLength(stdout), stderr: 0, protocol: Buffer.byteLength(protocol) },
    truncated: { stdout: false, stderr: false, protocol: false } };
}
function transportFixture() {
  const contextId = 'controlled-TEST-context', anchor = 'b'.repeat(64);
  const cases = ['TEST/first', 'TEST/second'].map(id => ({ id, title: id, kind: 'node', inputs: [], command: assigned,
    expected: { status: 0, completion: ['started', 'passed'].map(phase => ({ caseId: id, contextId,
      archiveIdentity: identity, inputSha256: 'c'.repeat(64), phase })) } }));
  const events = [];
  for (const row of cases) for (const [kind, details] of [
    ['case-started', {}], ['command', { observation: outcome(row.expected) }], ['case-passed', {}],
  ]) events.push({ sequence: events.length, anchor, contextId, archiveIdentity: identity,
    caseId: row.id, rowSha256: rowDigest(row), kind, details });
  events.push({ sequence: events.length, anchor, contextId, archiveIdentity: identity,
    caseId: null, rowSha256: null, kind: 'session-ended', details: { completed: cases.map(row => row.id) } });
  return { expectedPlan: { cases }, events, anchor, contextId, archive, inventory: [] };
}
const renumber = fixture => fixture.events.forEach((event, index) => { event.sequence = index; });

test('controlled TEST transport requires every assigned expectation and terminal record', () => {
  const result = verifyM1Observations(transportFixture());
  assert.deepEqual(result.completed, ['TEST/first', 'TEST/second']);
  assert.equal(result.scope, 'transport-and-case-expectations');
});
for (const [name, mutate] of [
  ['dropped case', f => f.events.splice(3, 3)],
  ['reordered complete cases', f => f.events.splice(0, 6, ...f.events.slice(3, 6), ...f.events.slice(0, 3))],
  ['duplicate passing event', f => f.events.splice(3, 0, structuredClone(f.events[2]))],
  ['foreign observation', f => { f.events[1].caseId = 'TEST/foreign'; }],
  ['foreign seal', f => { f.events[1].anchor = 'd'.repeat(64); }],
  ['changed command binding', f => { f.expectedPlan.cases[0].command = { ...assigned, args: ['/TEST/other.mjs'] }; }],
  ['missing terminal record', f => { f.events.pop(); }],
  ['fake successful terminal without cases', f => { f.events = [f.events.at(-1)]; }],
  ['skipped case', f => { f.events[2].kind = 'case-skipped'; }],
  ['empty expected inventory', f => { f.expectedPlan.cases = []; }],
  ['duplicate expected ID', f => { f.expectedPlan.cases[1].id = f.expectedPlan.cases[0].id; }],
]) test(`controlled TEST verifier rejects ${name}`, () => {
  const fixture = transportFixture(); mutate(fixture); renumber(fixture);
  assert.throws(() => verifyM1Observations(fixture));
});

test('controlled TEST verifier does not accept a zero exit or stdout success marker', () => {
  const fixture = transportFixture();
  const observed = fixture.events[1].details.observation;
  observed.stdout = observed.protocol; observed.protocol = '';
  observed.receivedBytes = { stdout: Buffer.byteLength(observed.stdout), stderr: 0, protocol: 0 };
  assert.throws(() => verifyM1Observations(fixture));
});
test('controlled TEST verifier rejects changed compiler code even with nonzero exit', () => {
  const expected = { status: 'nonzero', diagnosticCodes: ['TS1479'] };
  const observed = outcome({ ...expected, diagnosticCodes: ['TS2307'] });
  assert.throws(() => checkProcess(observed, assigned, expected));
});
test('controlled TEST verifier rejects truncated, signalled and nonterminal outcomes', () => {
  for (const change of [{ status: null }, { signal: 'SIGTERM' }, { timedOut: true },
    { spawnError: { code: 'ENOENT' } }, { outputLimitExceeded: true },
    { truncated: { stdout: true, stderr: false, protocol: false } }]) {
    assert.throws(() => checkProcess({ ...outcome({ status: 0 }), ...change }, assigned, { status: 0 }));
  }
});
test('controlled TEST final outside anchor rejects a synthesized successful journal under the genuine seal', () => {
  const genuine = transportFixture();
  genuine.events[1].details.observation.status = 1;
  const outside = digest(jsonBytes(genuine.events));
  verifyObservationAnchor(genuine.events, outside);
  const forged = transportFixture();
  assert.equal(forged.anchor, genuine.anchor);
  // A self-consistent invented success passes the case semantics checker alone.
  assert.deepEqual(verifyM1Observations(forged).completed, ['TEST/first', 'TEST/second']);
  assert.throws(() => verifyObservationAnchor(forged.events, outside), /outside capture/);
  assert.throws(() => verifyObservationAnchor(forged.events), /outside-observation-anchor-required/);
});
test('controlled TEST outside capture is required, awaited and propagates failure', async () => {
  await assert.rejects(captureOutsideAnchor(undefined, {}), /outside-capture-sink-required/);
  const failure = new Error('TEST external storage failed');
  await assert.rejects(captureOutsideAnchor(async () => { throw failure; }, {}), error => error === failure);
  let acknowledge, received, completed = false;
  const pending = captureOutsideAnchor(anchor => {
    received = anchor;
    return new Promise(resolve => { acknowledge = resolve; });
  }, { sealSha256: 'a'.repeat(64) }).then(() => { completed = true; });
  await Promise.resolve();
  assert.equal(completed, false);
  assert.equal(Object.isFrozen(received), true);
  acknowledge(); await pending; assert.equal(completed, true);
  await assert.rejects(runM1RetainedSession({ sourceCommit: '1'.repeat(40), trustedCommit: '2'.repeat(40) }),
    /outside-capture-sinks-required/);
});
test('controlled TEST CLI anchor waits for stream acknowledgement and rejects write failure', async () => {
  let acknowledge, bytes, completed = false;
  const pending = writeM1Anchor({ phase: 'TEST-anchor' }, { write(value, done) { bytes = value; acknowledge = done; return false; } })
    .then(() => { completed = true; });
  await Promise.resolve(); assert.equal(completed, false);
  assert.equal(bytes, '{"phase":"TEST-anchor"}\n');
  acknowledge(); await pending; assert.equal(completed, true);
  const failure = new Error('TEST broken external stream');
  await assert.rejects(writeM1Anchor({}, { write(value, done) { done(failure); } }), error => error === failure);
});

async function temporary(t) {
  const directory = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'gm-retained-TEST-')));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}
test('TEST output destinations are exclusive, disjoint and reject symlinks', async t => {
  const root = await temporary(t);
  const source = join(root, 'TEST-source'); await fs.mkdir(source); await fs.mkdir(join(source, '.git'));
  await assert.rejects(createOutputDirectory(join(source, 'evidence'), [source]));
  const output = join(root, 'TEST-output');
  const results = await Promise.allSettled([createOutputDirectory(output, [source]), createOutputDirectory(output, [source])]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(results.filter(row => row.status === 'rejected').length, 1);
  await fs.writeFile(join(output, 'preserved'), 'TEST evidence');
  await assert.rejects(createOutputDirectory(output));
  assert.equal(await fs.readFile(join(output, 'preserved'), 'utf8'), 'TEST evidence');
  await fs.symlink(output, join(root, 'TEST-link'), 'dir');
  await assert.rejects(createOutputDirectory(join(root, 'TEST-link')));
});
test('TEST atomic records cannot overwrite evidence and partial journals fail closed', async t => {
  const root = await temporary(t);
  const path = join(root, '000000.json');
  await writeExclusive(path, jsonBytes({ sequence: 0 }));
  await assert.rejects(writeExclusive(path, jsonBytes({ sequence: 1 })));
  assert.deepEqual(JSON.parse(await fs.readFile(path, 'utf8')), { sequence: 0 });
  await assert.rejects(readJournal(root));
});
test('TEST full snapshots detect same-size changes and missing transitive inputs', async t => {
  const root = await temporary(t);
  await fs.mkdir(join(root, 'lib'));
  await fs.writeFile(join(root, 'entry.mjs'), 'import x from "./lib/oracle.mjs";');
  await fs.writeFile(join(root, 'lib/oracle.mjs'), 'export default 1;');
  await fs.writeFile(join(root, 'TEST-archive.tgz'), 'same-size-archive');
  const baseline = await scanTree(root);
  const bytes = await fs.readFile(join(root, 'TEST-archive.tgz')); bytes[0] ^= 1;
  await fs.writeFile(join(root, 'TEST-archive.tgz'), bytes);
  await assert.rejects(checkTree(root, baseline));
  bytes[0] ^= 1; await fs.writeFile(join(root, 'TEST-archive.tgz'), bytes);
  await fs.unlink(join(root, 'lib/oracle.mjs'));
  await assert.rejects(checkTree(root, baseline));
});
test('TEST snapshots bind resolved links and reject external dependency links', async t => {
  const root = await temporary(t);
  const closure = join(root, 'TEST-closure'); await fs.mkdir(closure);
  await fs.writeFile(join(root, 'outside'), 'TEST external');
  await fs.symlink('../outside', join(closure, 'escape'));
  await assert.rejects(scanTree(closure), /dependency-link-escapes-snapshot/);
});
test('TEST generated plan regeneration updates input bytes and completion bindings', () => {
  const from = '/TEST/a', to = '/TEST/longer';
  const content = `const consumer = '${from}/first';\n`;
  const hash = digest(content);
  const artifact = { kind: 'generated', path: `${from}/first/node.mjs`, content,
    bytes: Buffer.byteLength(content), sha256: hash };
  const plan = { artifacts: [artifact], cases: [{ id: 'TEST/node', inputs: [{ ...artifact, content: undefined }],
    command: { args: [artifact.path, hash] }, expected: { completion: [{ inputSha256: hash }] } }] };
  const relocated = relocatePreparedPlan(plan, from, to);
  const changed = relocated.artifacts[0];
  assert.equal(changed.sha256, digest(changed.content));
  assert.equal(changed.bytes, Buffer.byteLength(changed.content));
  assert.equal(relocated.cases[0].inputs[0].sha256, changed.sha256);
  assert.equal(relocated.cases[0].command.args[1], changed.sha256);
  assert.equal(relocated.cases[0].expected.completion[0].inputSha256, changed.sha256);
});

function sourceContext(fileBytes, { staged = false, flag = 'H', untracked = '' } = {}) {
  const oid = createHash('sha1').update(`blob ${fileBytes.length}\0`).update(fileBytes).digest('hex');
  const commit = '1'.repeat(40), tree = '2'.repeat(40);
  return { commit, context: { gitRun: async (root, args) => {
    if (args[0] === 'rev-parse') return (args[1] === '--show-toplevel' ? root : args[1] === 'HEAD' ? commit : tree) + '\n';
    if (args[0] === 'ls-tree') return `100644 blob ${oid}\tinput.ts\0`;
    if (args.includes('--stage')) return `100644 ${staged ? '3'.repeat(40) : oid} 0\tinput.ts\0`;
    if (args.includes('-v')) return `${flag} input.ts\0`;
    if (args.includes('--ignored')) return 'packages/core/dist/\0';
    return untracked;
  } } };
}
test('TEST source admission compares actual tracked bytes, index bytes and flags', async t => {
  const root = await temporary(t), original = Buffer.from('export const value = 1;\n');
  await fs.writeFile(join(root, 'input.ts'), original, { mode: 0o644 });
  const clean = sourceContext(original);
  const observation = await inspectExactSource({ checkout: root, ...clean });
  assert.deepEqual(observation.ignored, ['packages/core/dist/']);
  for (const mutation of [{ staged: true }, { flag: 'h' }, { flag: 'S' }, { untracked: 'extra.ts\0' }]) {
    await assert.rejects(inspectExactSource({ checkout: root, ...sourceContext(original, mutation) }));
  }
  await fs.writeFile(join(root, 'input.ts'), 'export const value = 2;\n');
  await assert.rejects(inspectExactSource({ checkout: root, ...clean }));
});
test('TEST Git root aliases preserve identity while relative and foreign roots fail', async t => {
  const root = await temporary(t), bytes = Buffer.from('export const value = 1;\n');
  await fs.writeFile(join(root, 'input.ts'), bytes, { mode: 0o644 });
  const base = sourceContext(bytes);
  const withRoot = value => ({ ...base, context: { gitRun: (cwd, args) =>
    args[0] === 'rev-parse' && args[1] === '--show-toplevel'
      ? Promise.resolve(value + '\n') : base.context.gitRun(cwd, args) } });
  await inspectExactSource({ checkout: root, ...withRoot(root + '/.') });
  await assert.rejects(inspectExactSource({ checkout: root, ...withRoot('.') }),
    error => error.context?.reason === 'absolute-git-root');
  const foreign = join(root, 'TEST-foreign-root');
  await fs.mkdir(foreign);
  await assert.rejects(inspectExactSource({ checkout: root, ...withRoot(foreign) }),
    /Git root differs from the admitted checkout/);
});
test('TEST failed source admission preserves the exclusively created session', async t => {
  const root = await temporary(t), checkout = await fs.realpath(fileURLToPath(new URL('../../../../', import.meta.url)));
  const output = join(root, 'TEST-failed-session');
  const options = { trustedCheckout: checkout, sourceCheckout: checkout,
    sourceCommit: '1'.repeat(40), trustedCommit: '2'.repeat(40), outputDirectory: output,
    tools: { git: join(root, 'TEST-missing-git') }, onSeal: async () => {}, onObservations: async () => {} };
  if (process.platform !== 'linux') {
    await assert.rejects(runM1RetainedSession(options), error => error.context?.reason === 'first-retained-adapter-requires-linux');
    await assert.rejects(fs.access(output), { code: 'ENOENT' });
    return;
  }
  // This deliberately fails before any Git command; the real source is read-only.
  await assert.rejects(runM1RetainedSession(options));
  const failure = JSON.parse(await fs.readFile(join(output, 'failure.json'), 'utf8'));
  assert.equal(failure.phase, 'source-admission');
  assert.equal(failure.status, 'not-claimed');
  await assert.rejects(fs.access(join(output, 'completion.json')));
});

test('real TEST Git bundles exclude ignored output and preserve committed source bytes', async t => {
  const root = await temporary(t), origin = join(root, 'TEST-origin');
  const control = join(root, 'TEST-control'), directory = join(root, 'TEST-evidence');
  for (const path of [origin, control, directory]) await fs.mkdir(path);
  await fs.mkdir(join(control, 'empty'));
  const exec = promisify(childProcess.execFile);
  const gitRun = async (cwd, args) => (await exec('git', [
    '-c', 'core.autocrlf=false', '-c', 'core.attributesFile=', '-c', 'core.fsmonitor=false',
    '-c', `core.hooksPath=${join(control, 'empty')}`, '-c', 'commit.gpgsign=false',
    '-c', 'user.name=Get Modular Test', '-c', 'user.email=get-modular-test@example.invalid',
    ...args,
  ], { cwd, env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '',
    GIT_ATTR_NOSYSTEM: '1', GIT_NO_REPLACE_OBJECTS: '1', GIT_OPTIONAL_LOCKS: '0' },
  timeout: 15_000, maxBuffer: 1_000_000 })).stdout;
  await gitRun(origin, ['init', '--initial-branch=main']);
  await fs.writeFile(join(origin, '.gitignore'), 'packages/core/dist/\n');
  await fs.mkdir(join(origin, 'packages/core'), { recursive: true });
  await fs.writeFile(join(origin, 'packages/core/package.json'), '{"name":"test-source-fixture"}\n');
  const original = 'export const value = 1;\n';
  await fs.writeFile(join(origin, 'input.ts'), original);
  await gitRun(origin, ['add', '.gitignore', 'input.ts', 'packages/core/package.json']);
  await gitRun(origin, ['commit', '-m', 'test: create isolated source fixture']);
  const commit = (await gitRun(origin, ['rev-parse', 'HEAD'])).trim();
  const stale = join(origin, 'packages/core/dist');
  await fs.mkdir(stale, { recursive: true });
  await fs.writeFile(join(stale, 'index.js'), 'unrelated ignored output');
  const context = { directory, control, gitRun };
  const admitted = await inspectExactSource({ checkout: origin, commit, context });
  assert.ok(admitted.ignored.some(path => path.startsWith('packages/core/dist')));
  const cloned = await createExactSourceCheckout(context, origin, commit, 'subject');
  assert.deepEqual(cloned.snapshot.entries, admitted.entries);
  assert.equal(await fs.readFile(join(cloned.path, 'input.ts'), 'utf8'), original);
  await assert.rejects(fs.access(join(cloned.path, 'packages/core/dist')), { code: 'ENOENT' });
  assert.equal(await fs.readFile(join(stale, 'index.js'), 'utf8'), 'unrelated ignored output');
  const dependencies = join(root, 'TEST-dependencies'), foreign = join(root, 'TEST-foreign-dependencies');
  await fs.mkdir(dependencies); await fs.mkdir(foreign);
  const mount = join(cloned.path, 'node_modules');
  await fs.symlink(dependencies, mount, 'dir');
  await assert.rejects(inspectExactSource({ checkout: cloned.path, commit, context }));
  const mounted = { checkout: cloned.path, commit, context, dependencyMount: dependencies };
  assert.deepEqual((await inspectExactSource(mounted)).entries, admitted.entries);
  await fs.writeFile(join(cloned.path, 'untracked.ts'), 'TEST untracked');
  await assert.rejects(inspectExactSource(mounted));
  await fs.unlink(join(cloned.path, 'untracked.ts'));
  await fs.unlink(mount); await fs.symlink(foreign, mount, 'dir');
  await assert.rejects(inspectExactSource(mounted), /exact assigned target/);
  await gitRun(origin, ['update-index', '--assume-unchanged', 'input.ts']);
  await fs.writeFile(join(origin, 'input.ts'), 'export const value = 2;\n');
  await assert.rejects(inspectExactSource({ checkout: origin, commit, context }));
});
test('real TEST builder resolution rejects a nearer compiler before executing it', async t => {
  const root = await temporary(t), source = join(root, 'TEST-source');
  await fs.mkdir(source);
  const compilerDirectory = join(source, 'node_modules/typescript');
  await fs.mkdir(join(compilerDirectory, 'bin'), { recursive: true });
  await fs.writeFile(join(compilerDirectory, 'package.json'), '{"name":"typescript","version":"0.0.0-test"}');
  const bytes = Buffer.from('throw new Error("TEST compiler must never execute");\n');
  const path = join(compilerDirectory, 'bin/tsc'); await fs.writeFile(path, bytes);
  const compiler = { path, bytes: bytes.length, sha256: digest(bytes) };
  await verifyBuildCompiler(source, compiler);
  const shadowSource = join(root, 'TEST-shadow-source');
  const shadow = join(shadowSource, 'architecture/node_modules/typescript');
  await fs.mkdir(join(shadow, 'bin'), { recursive: true });
  await fs.writeFile(join(shadow, 'package.json'), '{"name":"typescript","version":"0.0.0-test"}');
  await fs.writeFile(join(shadow, 'bin/tsc'), bytes);
  await assert.rejects(verifyBuildCompiler(shadowSource, compiler), /admitted compiler/);
});
test('private CLI admits its digit-bearing opt-in and seal options without executing', () => {
  const run = parseRetainedM1Arguments(['run', '--opt-in-private-m1', 'yes', '--source-commit', '1'.repeat(40)]);
  assert.equal(run.mode, 'run');
  assert.equal(run.options['--opt-in-private-m1'], 'yes');
  const verify = parseRetainedM1Arguments(['verify', '--opt-in-private-m1', 'yes', '--seal-sha256', 'a'.repeat(64), '--observations-sha256', 'b'.repeat(64)]);
  assert.equal(verify.mode, 'verify');
  assert.equal(verify.options['--seal-sha256'], 'a'.repeat(64));
  assert.equal(verify.options['--observations-sha256'], 'b'.repeat(64));
  for (const args of [
    ['run', '--opt-in-private-m1', 'yes', '--opt-in-private-m1', 'yes'],
    ['run', '--opt-in-private-m1', 'yes', '--unknown2', 'value'],
    ['run', '--opt-in-private-m1', 'yes', '--source-commit'],
  ]) assert.throws(() => parseRetainedM1Arguments(args));
});
test('private CLI needs explicit opt-in and never launches on invalid arguments', async t => {
  const mock = t.mock.method(childProcess, 'spawnSync', () => assert.fail('invalid CLI must not execute'));
  await assert.rejects(retainedM1Main(['run']));
  await assert.rejects(retainedM1Main(['run', '--opt-in-private-m1', 'yes', '--unknown', 'value']));
  assert.equal(mock.mock.callCount(), 0);
});
