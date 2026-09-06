// Focused private metadata integrity controls, never acceptance mutation rows.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { mutationEvidence } from './mutation-evidence.mjs';

const runnerBytes = readFileSync(new URL(import.meta.url));
const sourcePath = 'tests/qualification/m2-candidate/mutation-evidence.test.mjs';
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const CHANGES = [['one', value => { value.value = 2; }], ['two', value => { value.value = 3; }]];
function encodeControl(value) {
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.deepEqual(Reflect.ownKeys(value), ['value']);
  const descriptor = Object.getOwnPropertyDescriptor(value, 'value');
  assert(Object.hasOwn(descriptor, 'value') && descriptor.enumerable);
  assert(Number.isSafeInteger(descriptor.value) && !Object.is(descriptor.value, -0));
  return Buffer.from(JSON.stringify({ value: descriptor.value }));
}
function checker(value) {
  try { assert.equal(value.value, 1); }
  catch (error) { error.privateCheck = 'checkCandidate'; throw error; }
}
function definitions(changes = CHANGES) {
  return changes.map(([id, change]) => ({
    mutationId: id, targetKind: 'candidate-artifact', sourcePath, sourceBytes: runnerBytes,
    baseBytes: Buffer.from('{"value":1}'), change, caseId: id,
    entryPoint: 'checkCandidate', checker: 'checkCandidate', rejectedBy: 'checkCandidate',
  }));
}
const session = changes => mutationEvidence('metadata-controls', runnerBytes, definitions(changes));
async function completed() {
  const evidence = session();
  for (const [id] of CHANGES) await evidence.run(id, checker, encodeControl);
  return evidence;
}

test('closed receipts reject independently altered identities even after outer rehashing', async () => {
  const evidence = await completed();
  const report = evidence.report();
  evidence.verify(JSON.parse(JSON.stringify(report)));
  const alterations = [
    value => value.rows.pop(),
    value => value.rows.push(structuredClone(value.rows[0])),
    value => { value.rows[1] = structuredClone(value.rows[0]); },
    value => value.rows.reverse(),
    value => { value.rows[0].mutationId = 'unexecuted'; },
    value => { value.rows[0].targetKind = 'oracle-source'; },
    value => { value.rows[0].source.path = 'packages/core/src/index.ts'; },
    value => { value.rows[0].recipe.utf8 += '\n'; },
    value => { value.rows[0].recipe.owner = 'unowned.mjs'; },
    value => { value.rows[0].mutant.sha256 = value.rows[1].mutant.sha256; },
    value => { value.rows[0].checker.entryPoint = 'buildGenerationTwo'; },
    value => { value.rows[0].witness.caseId = 'two'; },
    value => { value.rows[0].witness.entryPoint = 'other'; },
    value => { value.rows[0].rejection.code = 'ERR_OTHER'; },
    value => { value.rows[0].rejection.privateCheck = 'other'; },
    value => { value.rows[0].rejection.messageSha256 = sha('substitution'); },
    value => { value.runner.sha256 = sha('other runner'); },
    value => { value.helper.sha256 = sha('other helper'); },
    value => { value.scope = 'accepted'; },
    value => { value.reproductionCommand = 'invented parent command'; },
    value => { value.observedProcess.argv.push('unobserved argument'); },
    value => { value.observedProcess.execArgv = ['--invented-flag']; },
    value => { value.observedProcess.nodeOptions = '--invented-option'; },
  ];
  for (const field of ['source', 'base', 'recipe', 'mutant']) {
    alterations.push(value => { delete value.rows[0][field].sha256; });
    alterations.push(value => { value.rows[0][field].sha256 = sha('independent substitution'); });
  }
  for (const alter of alterations) {
    const forged = structuredClone(report);
    alter(forged);
    forged.mutationCount = forged.rows.length;
    forged.rowStreamSha256 = sha(forged.rows.map(row => JSON.stringify(row) + '\n').join(''));
    assert.throws(() => evidence.verify(forged), { code: 'ERR_ASSERTION' });
  }
  let reads = 0;
  const malformed = [
    value => { value.rows[0].source.sha256 = undefined; },
    value => { value.rows[0].source.sha256 = NaN; },
    value => { value.rows[0][Symbol('hidden')] = true; },
    value => { Object.defineProperty(value.rows[0].source, 'sha256', { get() { reads++; return report.rows[0].source.sha256; } }); },
    value => { delete value.rows[0]; },
    value => { value.rows[0].source = value.rows[0]; },
  ];
  for (const alter of malformed) {
    const forged = structuredClone(report);
    alter(forged);
    assert.throws(() => evidence.verify(forged), { code: 'ERR_ASSERTION' });
  }
  assert.equal(reads, 0);
  evidence.verify(report);
});

test('unexecuted, partial, repeated, surviving, crashing and target-changing executions cannot report', async () => {
  const claimed = (await completed()).report();
  const absent = session();
  assert.throws(() => absent.verify(claimed), /incomplete mutation execution/);
  await absent.run('one', checker, encodeControl);
  assert.throws(() => absent.report(), /incomplete mutation execution/);
  await assert.rejects(absent.run('one', checker, encodeControl), { code: 'ERR_ASSERTION' });
  assert.throws(() => absent.report(), /incomplete mutation execution/);
  for (const execute of [() => {}, () => { throw new TypeError('unexpected'); },
    value => { try { assert.fail('wrong assertion'); } catch (error) { error.privateCheck = 'wrong'; throw error; } },
    value => { value.value = 4; checker(value); }]) {
    const evidence = session();
    await assert.rejects(evidence.run('one', execute, encodeControl), { code: 'ERR_ASSERTION' });
    assert.throws(() => evidence.report(), /incomplete mutation execution/);
  }
});

test('malformed payloads cannot obtain a digest by lossy JSON encoding', async () => {
  const changes = [
    ['undefined', value => { value.value = undefined; }],
    ['symbol', value => { value.value = Symbol('value'); }],
    ['nan', value => { value.value = NaN; }],
    ['infinity', value => { value.value = Infinity; }],
    ['negative-zero', value => { value.value = -0; }],
    ['getter', value => { Object.defineProperty(value, 'value', { get() { throw new Error('getter invoked'); } }); }],
  ];
  for (const change of changes) {
    const evidence = session([change]);
    let calls = 0;
    await assert.rejects(evidence.run(change[0], () => { calls++; }, encodeControl), { code: 'ERR_ASSERTION' });
    assert.equal(calls, 0);
    assert.throws(() => evidence.report(), /incomplete mutation execution/);
  }
});

test('source identity hashes the exact string delivered to the rejection witness', async () => {
  const change = source => source + '\n';
  const evidence = mutationEvidence('metadata-controls', runnerBytes, [{
    mutationId: 'source-control', targetKind: 'oracle-source', sourcePath, sourceBytes: runnerBytes,
    baseBytes: runnerBytes, change, caseId: 'source-control', entryPoint: 'control', checker: 'control', rejectedBy: 'control',
  }]);
  let delivered;
  await evidence.run('source-control', source => {
    delivered = source;
    try { assert.equal(source, runnerBytes.toString('utf8')); }
    catch (error) { error.privateCheck = 'control'; throw error; }
  });
  const report = evidence.report();
  assert.equal(report.rows[0].mutant.sha256, sha(Buffer.from(delivered)));
  assert.notEqual(report.rows[0].mutant.sha256, report.rows[0].source.sha256);
  assert.equal(report.rows[0].recipe.sha256, sha(Function.prototype.toString.call(change)));
  evidence.verify(report);
});

test('command metadata distinguishes reproduction from the observed Node process', async () => {
  const evidence = await completed();
  const report = evidence.report();
  assert.equal(report.reproductionCommand, `node --test ${sourcePath}`);
  assert.equal(Object.hasOwn(report, 'command'), false);
  assert.deepEqual(report.observedProcess, {
    scope: 'current-node-process', execPath: process.execPath,
    argv: [...process.argv], execArgv: [...process.execArgv],
    nodeOptions: process.env.NODE_OPTIONS ?? null,
  });
  report.observedProcess.argv.push('receipt consumer modification');
  assert.notDeepEqual(report.observedProcess.argv, process.argv);
  assert.throws(() => evidence.verify(report), { code: 'ERR_ASSERTION' });
  evidence.verify(evidence.report());
});
