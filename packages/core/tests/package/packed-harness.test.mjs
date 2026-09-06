import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepareM1PackedConsumers, runtimeNames, m2RuntimeNames } from '../../../../tests/qualification/support/m1-packed-consumers.mjs';
import { m1CaseIds, m2CaseIds } from '../../../../tests/qualification/support/m1-packed-object-consumer.mjs';
import { rawDocumentCases } from '../../../../tests/qualification/m2-candidate/raw-document-cases.mjs';
import { rawInvocationCaseIds } from '../../../../tests/qualification/support/m2-raw-invocation-fixtures.mjs';
import { rawInvocationExpectedResult } from '../../../../tests/qualification/support/m2-raw-invocation-expectations.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// These unit cases deliberately mock subprocesses. They verify the harness's
// failure interpretation and evidence ordering, never package qualification.
// packed-root.test.mjs separately executes the actual Node/npm/TS consumers.
async function fixture(t, selection = {}) {
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
    const negative = row.expected.status === 'nonzero';
    const stdout = Buffer.from(negative ? row.expected.diagnosticCodes.join('\n') : row.expected.stdoutTrimmed ?? '');
    const protocol = Buffer.from(row.expected.completion?.map(value => JSON.stringify(value) + '\n').join('') ?? '');
    return { status: negative ? 2 : 0, signal: null, stdout, stderr: Buffer.alloc(0), output: [null, stdout, Buffer.alloc(0), protocol] };
  });
  syncBuiltinESMExports();
  t.after(() => { mocked.mock.restore(); syncBuiltinESMExports(); });
  const prepared = await prepareM1PackedConsumers({
    archive: { path: archivePath, identity, files: new Map([['package.json', Buffer.from('{}')]]) },
    workspace, toolchain, contextId: 'controlled-failure-unit', osEnvironment, ...selection,
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

test('packed preparation rejects unknown surfaces and M2 with generation one before filesystem work', async () => {
  for (const surface of ['', 'M2', 'm3', null, 2, {}]) {
    await assert.rejects(prepareM1PackedConsumers({ surface }), /Unknown packed consumer surface/);
  }
  await assert.rejects(prepareM1PackedConsumers({ surface: 'm2' }), /M2 requires diagnostic generation 2/);
  await assert.rejects(prepareM1PackedConsumers({ surface: 'm2', diagnosticGeneration: 1 }),
    /M2 requires diagnostic generation 2/);
  await assert.rejects(prepareM1PackedConsumers({ surface: 'm2', diagnosticGeneration: 3 }),
    /Unknown diagnostic generation/);
});

for (const selection of [{}, { surface: 'm1' }, { surface: 'm1', diagnosticGeneration: 2 }]) {
  test(`historical M1 shape remains unchanged for ${JSON.stringify(selection)}`, async t => {
    const { prepared } = await fixture(t, selection);
    assert.equal(prepared.cases.length, 97);
    assert.equal(prepared.cases.some(row => row.kind === 'raw'), false);
    assert.deepEqual(Object.keys(prepared).sort(),
      ['archive', 'artifacts', 'cases', 'progress', 'runCase', 'toolchain', 'trustedSources']);
    assert.deepEqual(runtimeNames, ['compileComposition', 'defineModule', 'many', 'optional', 'required']);
    assert.equal(prepared.trustedSources.length, 7);
    for (const row of prepared.cases.filter(row => row.expected.completion)) {
      for (const completion of row.expected.completion) {
        assert.deepEqual(Object.keys(completion).sort(),
          ['archiveIdentity', 'caseId', 'contextId', 'inputSha256', 'phase']);
      }
    }
    const root = prepared.cases.find(row => row.id === 'node-root');
    assert.deepEqual(root.expected.assertions.runtimeNames, runtimeNames);
    for (const extension of ['mts', 'cts']) {
      const source = prepared.artifacts.find(row => row.path.replaceAll('\\', '/').endsWith(`/case.${extension}`));
      assert.ok(source.content.includes('// @ts-expect-error raw input is excluded from M1'));
      assert.equal(source.content.includes('const rawPending:'), false);
    }
  });
}

test('M2 preparation retains 97 cases and all 185 original independent raw constructions', async t => {
  const { prepared } = await fixture(t, { surface: 'm2', diagnosticGeneration: 2 });
  const raw = prepared.cases.filter(row => row.kind === 'raw');
  const documents = [...rawDocumentCases()];
  const invocationIds = rawInvocationCaseIds();
  assert.equal(prepared.cases.length, 282);
  assert.equal(raw.length, 185);
  assert.deepEqual(raw.map(row => row.id), [
    ...documents.map(row => `raw/document/${row.caseId}`),
    ...invocationIds.map(id => `raw/invocation/${id}`),
  ]);
  assert.deepEqual(raw.map(row => row.construction.id),
    [...documents.map(row => row.caseId), ...invocationIds]);
  assert.ok(raw.every(row => row.construction.entrypoint === 'compileCompositionJson'));
  for (const row of raw) {
    const expected = row.construction.export === 'materializeRawDocumentInput'
      ? documents.find(fixture => fixture.caseId === row.construction.id).expected
      : rawInvocationExpectedResult(row.construction.id);
    assert.deepEqual(row.expected.assertions.result, expected);
    assert.equal(Object.hasOwn(row.construction, 'input'), false);
    assert.equal(Object.hasOwn(row.expected.assertions, 'inputRecipe'), false);
  }
  assert.deepEqual(m2CaseIds(prepared.cases), prepared.cases.map(row => row.id));
  assert.throws(() => m1CaseIds(prepared.cases), /bounded/);
  assert.throws(() => m2CaseIds(Array.from({ length: 513 }, (_, i) => ({ id: `case-${i}` }))), /bounded/);
  assert.throws(() => m2CaseIds([{ id: 'same' }, { id: 'same' }]), /duplicate/);
  const root = prepared.cases.find(row => row.id === 'node-root');
  assert.deepEqual(root.expected.assertions.runtimeNames, m2RuntimeNames);
  assert.equal(m2RuntimeNames.length, 6);
  for (const row of prepared.cases.filter(row => row.expected.completion)) {
    assert.ok(row.expected.completion.every(value => value.surface === 'm2'));
    const source = prepared.artifacts.find(value => value.sha256 === row.expected.completion[0].inputSha256);
    assert.ok(source.content.includes('"surface":"m2"'));
    assert.equal(hash(source.content), source.sha256);
    assert.ok(row.command.args.includes(source.sha256));
  }
  const sourcePaths = prepared.trustedSources.map(row => row.path);
  for (const path of [
    'support/m2-packed-raw-cases.mjs',
    'm2-candidate/raw-document-cases.mjs',
    'support/m2-raw-invocation-fixtures.mjs',
    'support/m2-raw-invocation-expectations.mjs',
  ]) assert.ok(sourcePaths.some(value => value.replaceAll('\\', '/').endsWith(path)), path);
  assert.equal(prepared.trustedSources.length, 11);
  for (const extension of ['mts', 'cts']) {
    const source = prepared.artifacts.find(row => row.path.replaceAll('\\', '/').endsWith(`/case.${extension}`)).content;
    assert.equal(source.includes('raw input is excluded from M1'), false);
    assert.ok(source.includes('readonly declarations: readonly Uint8Array[]'));
    assert.ok(source.includes('readonly profile: Uint8Array'));
    assert.ok(source.includes('Equal<ReturnType<typeof compileCompositionJson>, Promise<CompileCompositionResult>>'));
    assert.ok(source.includes("declarations: ['{}']"));
    assert.ok(source.includes("profile: '{}'"));
    assert.ok(source.includes('compileCompositionJson(null)'));
  }
  assert.equal(prepared.cases.filter(row => row.kind === 'typescript').length, 18);
  for (const compiler of ['typescript', 'typescript-minimum']) {
    for (const mode of ['NodeNext/mts', 'Node16/mts', 'NodeNext/cts', 'Bundler/mts']) {
      const row = prepared.cases.find(row => row.id === `typescript/${compiler}/${mode}`);
      assert.deepEqual(row.expected, { status: 0, diagnosticCodes: [] });
    }
    assert.deepEqual(prepared.cases.find(row => row.id === `typescript/${compiler}/Node16/cts`).expected,
      { status: 'nonzero', diagnosticCodes: ['TS1479'] });
  }
});

for (const [name, mutate] of [
  ['missing surface', value => { const { surface, ...rest } = value; return rest; }],
  ['historical surface', value => ({ ...value, surface: 'm1' })],
  ['unknown surface', value => ({ ...value, surface: 'm3' })],
]) {
  test(`M2 completion rejects ${name}`, async t => {
    const f = await fixture(t, { surface: 'm2', diagnosticGeneration: 2 });
    const row = await f.advanceTo('node-root');
    await assert.rejects(f.run(row, value => processResult(
      value.expected.completion.map(record => JSON.stringify(mutate(record)) + '\n').join(''),
    )), assert.AssertionError);
    assert.equal(f.prepared.progress().failed, row.id);
    assert.equal(f.events.at(-1).surface, 'm2');
  });
}

test('M2 raw cases cannot skip completion and stop the once-only schedule', async t => {
  const f = await fixture(t, { surface: 'm2', diagnosticGeneration: 2 });
  const row = await f.advanceTo('raw/document/od005.raw-document.v1/baseline');
  await assert.rejects(f.run(row, () => processResult('')), assert.AssertionError);
  assert.equal(f.prepared.progress().failed, row.id);
  assert.equal(f.prepared.progress().completed.includes(row.id), false);
  const before = f.calls.length;
  await assert.rejects(f.run(row), /once, sequentially/);
  assert.equal(f.calls.length, before);
});

test('M2 mocked schedule completes every prepared case exactly once', async t => {
  const f = await fixture(t, { surface: 'm2', diagnosticGeneration: 2 });
  const passed = [];
  for (const row of f.prepared.cases) {
    await f.run(row, null, event => {
      if (event.kind === 'case-passed') passed.push(event.case.id);
    });
  }
  assert.deepEqual(passed, f.prepared.cases.map(row => row.id));
  assert.deepEqual(f.prepared.progress(), { completed: passed, failed: null, pending: [] });
  assert.equal(f.calls.filter(id => id.startsWith('raw/')).length, 185);
  assert.equal(new Set(f.calls).size, f.calls.length);
});

// These real child probes install a controlled six-export test double, not
// Core. They test dispatch and snapshot-test timing, never M2 qualification.
async function rawChild(t, caseId, expected, { surface = 'm2', omitSurface = false, timing = false } = {}) {
  const consumer = await realpath(await mkdtemp(join(tmpdir(), 'gm-raw-child-')));
  t.after(() => rm(consumer, { recursive: true, force: true }));
  const installed = join(consumer, 'node_modules/@get-modular/core');
  await mkdir(join(installed, 'dist'), { recursive: true });
  await writeFile(join(installed, 'package.json'), JSON.stringify({
    name: '@get-modular/core', type: 'module',
    exports: { '.': { import: { types: './dist/index.d.ts', default: './dist/index.js' }, default: './dist/index.js' } },
  }));
  await writeFile(join(installed, 'dist/index.js'), `
import assert from 'node:assert/strict';
export function compileComposition() { throw new Error('OBJECT-DISPATCH-FORBIDDEN'); }
export function compileCompositionJson(input) {
  process.stdout.write('RAW-DISPATCH\\n');
  ${timing ? `const original = input;
  const profile = input.profile.buffer;
  return Promise.resolve().then(() => {
    assert.equal(profile.byteLength, 0, 'fixture.after must detach before the first await');
    assert.deepEqual([...original.profile], [252], 'fixture.after replaces the wrapper profile');
    return ${JSON.stringify(expected)};
  });` : `return Promise.resolve(${JSON.stringify(expected)});`}
}
export function defineModule(value) { return value; }
export function required() { return { kind: 'required' }; }
export function optional() { return { kind: 'optional' }; }
export function many(value) { return { kind: 'many', ...value }; }
`);
  const child = fileURLToPath(new URL('../../../../tests/qualification/support/m1-packed-object-consumer.mjs', import.meta.url));
  const script = join(consumer, 'probe.mjs');
  const assignment = {
    caseId, contextId: 'controlled-raw-dispatch', consumer,
    archiveIdentity: { sha256: 'a'.repeat(64), integrity: `sha512-${'A'.repeat(86)}==` },
    ...(omitSurface ? {} : { surface }),
  };
  const source = `import { executeM1NodeCase } from ${JSON.stringify(pathToFileURL(child).href)};
await executeM1NodeCase({ ...${JSON.stringify(assignment)}, inputSha256: process.argv[2] }, {
  resolve: specifier => import.meta.resolve(specifier),
  load: specifier => import(specifier),
});
`;
  await writeFile(script, source);
  const observed = childProcess.spawnSync(process.execPath, [script, hash(source)], {
    cwd: consumer,
    env: { ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot } : {}), TZ: 'UTC' },
    stdio: ['ignore', 'pipe', 'pipe', 'pipe'], timeout: 60_000, maxBuffer: 4_000_000,
  });
  assert.equal(observed.error, undefined);
  assert.equal(observed.signal, null);
  const records = observed.output[3].toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line));
  return { observed, records, inputSha256: hash(source) };
}

for (const suffix of ['baseline', 'syntax/declaration/leading-zero-number']) {
  test(`M2 child dispatches ${suffix} to the installed raw function and compares the whole result`, async t => {
    const id = `od005.raw-document.v1/${suffix}`;
    const expected = [...rawDocumentCases()].find(row => row.caseId === id).expected;
    const { observed, records, inputSha256 } = await rawChild(t, `raw/document/${id}`, expected);
    assert.equal(observed.status, 0, observed.stderr.toString());
    assert.equal(observed.stdout.toString(), 'RAW-DISPATCH\n');
    assert.deepEqual(records.map(row => row.phase), ['started', 'passed']);
    assert.ok(records.every(row => row.surface === 'm2' && row.inputSha256 === inputSha256));
  });
}

test('M2 raw child runs invocation after immediately before awaiting the actual raw Promise', async t => {
  const id = 'postcall-detach-both';
  const { observed, records } = await rawChild(t, `raw/invocation/${id}`, rawInvocationExpectedResult(id), { timing: true });
  assert.equal(observed.status, 0, observed.stderr.toString());
  assert.equal(observed.stdout.toString(), 'RAW-DISPATCH\n');
  assert.deepEqual(records.map(row => row.phase), ['started', 'passed']);
});

test('M2 raw child rejects a complete-result mismatch', async t => {
  const { observed, records } = await rawChild(t, 'raw/document/od005.raw-document.v1/baseline', { ok: false, diagnostics: [] });
  assert.equal(observed.status, 1);
  assert.equal(observed.stdout.toString(), 'RAW-DISPATCH\n');
  assert.deepEqual(records.map(row => row.phase), ['started', 'failed']);
});

for (const options of [{ surface: 'm3' }, { omitSurface: true }]) {
  test(`raw child rejects an unassigned surface ${JSON.stringify(options)}`, async t => {
    const { observed, records } = await rawChild(t, 'raw/document/od005.raw-document.v1/baseline', {}, options);
    assert.equal(observed.status, 1);
    assert.equal(observed.stdout.toString(), '');
    assert.deepEqual(records.map(row => row.phase), ['started', 'failed']);
  });
}
