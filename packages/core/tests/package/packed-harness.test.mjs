import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prepareM1PackedConsumers } from '../../../../tests/qualification/support/m1-packed-consumers.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// These unit cases deliberately mock subprocesses. They verify the harness's
// failure interpretation and evidence ordering, never package qualification.
// packed-root.test.mjs separately executes the actual Node/npm/TS consumers.
async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gm-harness-failure-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const archiveBytes = Buffer.from('controlled unit-test archive placeholder');
  const archivePath = join(root, 'fixture.tgz');
  await writeFile(archivePath, archiveBytes);
  const identity = { sha256: hash(archiveBytes), integrity: `sha512-${createHash('sha512').update(archiveBytes).digest('base64')}` };
  const workspace = join(root, 'consumers');
  await mkdir(workspace);
  const program = async (name, version) => {
    const path = join(root, name);
    const bytes = Buffer.from(`controlled ${name} unit-test tool entry`);
    await writeFile(path, bytes);
    return { path, version, sha256: hash(bytes) };
  };
  const toolchain = {
    node: await program('node', 'v24.18.0'),
    npm: await program('npm-cli.js', '11.0.0'),
    compilers: [
      { name: 'typescript', ...await program('tsc-current', '7.0.2') },
      { name: 'typescript-minimum', ...await program('tsc-minimum', '5.8.3') },
    ],
  };
  const osEnvironment = process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot } : {};
  const calls = [];
  let row;
  let fault;
  const mocked = t.mock.method(childProcess, 'spawnSync', (executable, args, options) => {
    assert.equal(executable, row.command.executable);
    assert.deepEqual(args, row.command.args);
    assert.deepEqual(options.env, row.command.env);
    calls.push(row.id);
    if (fault) return fault(row);
    if (row.kind === 'install') {
      const installed = join(row.command.cwd, 'node_modules/@get-modular/core');
      mkdirSync(installed, { recursive: true });
      writeFileSync(join(installed, 'package.json'), '{}');
    }
    const stdout = Buffer.from(row.expected.stdoutTrimmed ?? '');
    const protocol = Buffer.from(row.expected.completion?.map(value => JSON.stringify(value) + '\n').join('') ?? '');
    return { status: 0, signal: null, stdout, stderr: Buffer.alloc(0), output: [null, stdout, Buffer.alloc(0), protocol] };
  });
  syncBuiltinESMExports();
  t.after(() => { mocked.mock.restore(); syncBuiltinESMExports(); });
  const prepared = await prepareM1PackedConsumers({
    archive: { path: archivePath, identity, files: new Map([['package.json', Buffer.from('{}')]]) },
    workspace, toolchain, contextId: 'controlled-failure-unit', osEnvironment,
  });
  assert.deepEqual(calls, [], 'preparation must not execute a consumer');
  const events = [];
  const run = async (next, failure, sink = event => events.push(event)) => {
    row = next;
    fault = failure;
    return prepared.runCase(next.id, sink);
  };
  const advanceTo = async id => {
    for (const next of prepared.cases) {
      if (next.id === id) return next;
      await run(next);
    }
    assert.fail(`missing required unit-test case ${id}`);
  };
  return { prepared, events, calls, run, advanceTo, archivePath };
}

const processResult = (protocol, extra = {}) => ({
  status: 0, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0),
  output: [null, Buffer.alloc(0), Buffer.alloc(0), Buffer.from(protocol)], ...extra,
});

const badCompletions = [
  ['zero exit without a completion record', () => ''],
  ['only a start record', row => JSON.stringify(row.expected.completion[0]) + '\n'],
  ['duplicate completion', row => [...row.expected.completion, row.expected.completion[1]].map(x => JSON.stringify(x) + '\n').join('')],
  ['foreign archive binding', row => row.expected.completion.map(x => JSON.stringify({ ...x, archiveIdentity: { ...x.archiveIdentity, sha256: '0'.repeat(64) } }) + '\n').join('')],
  ['foreign case binding', row => row.expected.completion.map(x => JSON.stringify({ ...x, caseId: 'other-case' }) + '\n').join('')],
  ['unterminated completion', row => row.expected.completion.map(x => JSON.stringify(x)).join('\n')],
];

for (const [name, protocol] of badCompletions) {
  test(`packed harness rejects ${name} and captures the command before failure`, async t => {
    const f = await fixture(t);
    const row = await f.advanceTo('node-root');
    await assert.rejects(f.run(row, value => processResult(protocol(value))), assert.AssertionError);
    const events = f.events.filter(event => event.case?.id === row.id);
    const commandIndex = events.findIndex(event => event.kind === 'command');
    assert.ok(commandIndex >= 0 && commandIndex < events.findIndex(event => event.kind === 'case-failed'));
    assert.equal(events.filter(event => event.kind === 'case-passed').length, 0);
    assert.equal(f.prepared.progress().failed, row.id);
  });
}

for (const [name, result, flag] of [
  ['signal after an expected negative diagnostic', processResult('', { status: null, signal: 'SIGTERM', stdout: Buffer.from('TS1479') }), 'signal'],
  ['timeout', processResult('', { status: null, error: Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }) }), 'timedOut'],
  ['process launch failure', processResult('', { status: null, error: Object.assign(new Error('missing executable'), { code: 'ENOENT' }) }), 'spawnError'],
  ['output overflow', processResult('', { status: null, error: Object.assign(new Error('too much output'), { code: 'ENOBUFS' }) }), 'outputLimitExceeded'],
  ['protocol overflow', processResult('x'.repeat(65_537)), 'outputLimitExceeded'],
]) {
  test(`packed harness rejects ${name} before interpreting success`, async t => {
    const f = await fixture(t);
    const row = flag === 'signal' ? await f.advanceTo('typescript/typescript/Node16/cts') : f.prepared.cases[0];
    await assert.rejects(f.run(row, () => result), assert.AssertionError);
    const capture = f.events.findLast(event => event.kind === 'command').observation;
    assert.ok(capture[flag]);
    assert.ok(Buffer.byteLength(capture.protocol) <= 65_536);
    assert.equal(f.events.at(-1).kind, 'case-failed');
    assert.equal(f.prepared.progress().failed, row.id);
  });
}

test('packed harness does not accept stdout success markers', async t => {
  const f = await fixture(t);
  const row = await f.advanceTo('node-root');
  await assert.rejects(f.run(row, value => processResult('', {
    stdout: Buffer.from(value.expected.completion.map(x => JSON.stringify(x) + '\n').join('')),
  })), assert.AssertionError);
  assert.equal(f.prepared.progress().failed, row.id);
});

test('packed harness rejects out-of-order execution without launching a command', async t => {
  const f = await fixture(t);
  await assert.rejects(f.run(f.prepared.cases[1]), /once, sequentially/);
  assert.deepEqual(f.calls, []);
  assert.equal(f.events[0].kind, 'case-rejected');
});

test('packed harness rejects repeated execution without launching another command', async t => {
  const f = await fixture(t);
  const first = f.prepared.cases[0];
  await f.run(first);
  await assert.rejects(f.run(first), /once, sequentially/);
  assert.deepEqual(f.calls, [first.id]);
  assert.equal(f.prepared.progress().failed, first.id);
});

test('packed harness does not launch when its observation sink rejects the start', async t => {
  const f = await fixture(t);
  const failure = new Error('retained sink unavailable');
  await assert.rejects(f.run(f.prepared.cases[0], null, async event => {
    f.events.push(event);
    if (event.kind === 'case-started') throw failure;
  }), error => error === failure);
  assert.deepEqual(f.calls, []);
  assert.equal(f.events.at(-1).kind, 'case-failed');
});

test('packed harness detects changed prepared input before the command', async t => {
  const f = await fixture(t);
  const row = await f.advanceTo('node-root');
  const generated = row.inputs.find(input => input.kind === 'generated' && input.path.endsWith('.mjs'));
  const bytes = await readFile(generated.path);
  bytes[0] ^= 1;
  await writeFile(generated.path, bytes);
  const before = f.calls.length;
  await assert.rejects(f.run(row), /exact prepared input/);
  assert.equal(f.calls.length, before);
  assert.equal(f.events.at(-1).kind, 'case-failed');
});
