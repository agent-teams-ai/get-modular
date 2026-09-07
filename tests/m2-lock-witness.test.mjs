import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { parse, stringify } from 'yaml';
import { validateAssemblyAdmission, createHistoricalM2EvidenceReader } from '../architecture/checks/assembly-admission.mjs';
import { M2_EVIDENCE_LEDGER, validateM2StartAuthority } from '../architecture/checks/m2-evidence.mjs';
import { M2_LOCK_DECISION, M2_LOCK_WITNESS, M2_ORIGINAL_DECISION,
  M2_LEDGER_DIGEST, m2Digest, readCurrentM2Authority } from '../architecture/checks/m2-lock-witness.mjs';
import { captureGitIndexSnapshot, readIndexSnapshotFile, assertGitIndexSnapshotCurrent } from '../architecture/checks/tracked-file-custody.mjs';
import { prepareM2EvidenceFixture, validateM2FixtureEvents } from './qualification/support/m2-evidence-fixture.mjs';

const exec = promisify(execFile);
const root = resolve('.');
const read = path => readFile(join(root, path));
const ledger = JSON.parse(await read(M2_EVIDENCE_LEDGER));
const snapshotReader = snapshot => path => readIndexSnapshotFile(snapshot, path, 'live M2 test input');
const verify = authority => validateM2StartAuthority({ ...authority, expectedLedgerDigest: M2_LEDGER_DIGEST });

test('live adapter keeps current tooling identity separate from authenticated historical replay', async () => {
  const snapshot = await captureGitIndexSnapshot(root);
  const authority = await readCurrentM2Authority(snapshotReader(snapshot));
  const result = await verify(authority);
  assert.equal(result.scope, 'retained-private-node-oracle');
  assert.equal(result.coreExecuted, false);
  assert.equal(authority.historicalLock.digest, ledger.artifacts.find(row => row.path === 'pnpm-lock.yaml').immutableDigest);
  assert.equal(Object.isFrozen(authority.toolingEvidence.inputs), true);
  for (const input of authority.toolingEvidence.inputs) assert.equal(input.digest, m2Digest(await read(input.path)));
  await assertGitIndexSnapshotCurrent(snapshot);
});

test('successor, original authority, witness and every immutable ledger member fail closed', async () => {
  for (const path of [M2_LOCK_DECISION, M2_ORIGINAL_DECISION, M2_LOCK_WITNESS,
    M2_EVIDENCE_LEDGER, ...ledger.artifacts.filter(row => row.path !== 'pnpm-lock.yaml').map(row => row.path)]) {
    await assert.rejects(readCurrentM2Authority(async requested => requested === path
      ? Buffer.concat([await read(requested), Buffer.from('\nchanged')]) : read(requested)), undefined, path);
  }
  const successor = (await read(M2_LOCK_DECISION)).toString();
  for (const replacement of ['status: proposed', 'status: superseded', 'status: wrong']) {
    await assert.rejects(readCurrentM2Authority(path => path === M2_LOCK_DECISION
      ? Buffer.from(successor.replace('status: accepted', replacement)) : read(path)));
  }
  for (const missing of [M2_LOCK_DECISION, 'pnpm-lock.yaml', 'package.json', 'pnpm-workspace.yaml']) {
    await assert.rejects(readCurrentM2Authority(path => path === missing ? undefined : read(path)));
  }
  await assert.rejects(readCurrentM2Authority(path => path === M2_LOCK_DECISION
    ? read(M2_ORIGINAL_DECISION) : read(path)));
  const authority = await readCurrentM2Authority(read);
  // Neither another ledger key nor a near-match path receives historical bytes.
  await assert.rejects(authority.readBytes('elsewhere/pnpm-lock.yaml'));
  assert.deepEqual(await authority.readBytes('architecture/checks/m2-evidence.mjs'),
    await read('architecture/checks/m2-evidence.mjs'));
});

test('a different tracked current lock passes; missing lock, worktree and index drift fail', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'TEST-gm-m2-current-'));
  const fixture = join(directory, 'repository');
  try {
    await exec('git', ['clone', '--quiet', '--no-hardlinks', root, fixture]);
    // Overlay only this change's additional authority inputs before staging.
    for (const path of [M2_LOCK_DECISION, M2_LOCK_WITNESS]) await cp(join(root, path), join(fixture, path));
    const git = (...args) => exec('git', args, { cwd: fixture });
    await git('add', M2_LOCK_DECISION, M2_LOCK_WITNESS);
    const original = await readFile(join(fixture, 'pnpm-lock.yaml'));
    const workspacePath = join(fixture, 'pnpm-workspace.yaml');
    const workspace = parse(await readFile(workspacePath, 'utf8'));
    const previous = workspace.catalog.yaml;
    const next = previous + '-m2-admission-fixture';
    const changed = Buffer.from(original.toString().replaceAll(previous, next));
    workspace.catalog.yaml = next;
    await writeFile(workspacePath, stringify(workspace));
    await git('add', 'pnpm-workspace.yaml');
    await writeFile(join(fixture, 'pnpm-lock.yaml'), changed);
    await git('add', 'pnpm-lock.yaml');
    const snapshot = await captureGitIndexSnapshot(fixture);
    const authority = await readCurrentM2Authority(snapshotReader(snapshot));
    assert.equal(authority.toolingEvidence.inputs.find(row => row.path === 'pnpm-lock.yaml').digest, m2Digest(changed));
    assert.notEqual(m2Digest(changed), authority.historicalLock.digest);
    await verify(authority);
    const indexedRead = snapshotReader(snapshot);
    assert.deepEqual(await validateAssemblyAdmission({
      productionArtifacts: ['packages/core/package.json', 'packages/assembly/package.json'],
      readBytes: indexedRead,
      readPackageManifest: async path => JSON.parse(await indexedRead(path)),
    }), ['packages/assembly/package.json']);
    const historicalRead = await createHistoricalM2EvidenceReader({
      ...authority, expectedLedgerDigest: M2_LEDGER_DIGEST,
    });
    await verify({ ...authority, readBytes: historicalRead });
    for (const path of ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml']) {
      const bytes = await readFile(join(fixture, path));
      await writeFile(join(fixture, path), Buffer.concat([bytes, Buffer.from('\n')]));
      await assert.rejects(readCurrentM2Authority(snapshotReader(snapshot)), /captured Git index/);
      await writeFile(join(fixture, path), bytes);
    }
    await writeFile(join(fixture, 'pnpm-lock.yaml'), original);
    await git('add', 'pnpm-lock.yaml');
    await assert.rejects(assertGitIndexSnapshotCurrent(snapshot), /index changed/);
    await git('rm', 'pnpm-lock.yaml');
    await assert.rejects(readCurrentM2Authority(snapshotReader(await captureGitIndexSnapshot(fixture))));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('both frozen suites execute verbatim and fixture or terminal-result substitutions fail', async t => {
  const fixture = await prepareM2EvidenceFixture(await captureGitIndexSnapshot(root));
  try {
    const receipt = await fixture.run();
    assert.equal(receipt.tests, 7);
    assert.equal(receipt.currentInstallationQualified, false);
    assert.equal(receipt.currentDependencies.length, 4);
    assert.deepEqual(receipt.currentDependencies.find(row => row.path === 'architecture/checks/assembly-admission.mjs'), {
      path: 'architecture/checks/assembly-admission.mjs',
      digest: m2Digest(await read('architecture/checks/assembly-admission.mjs')),
    });
    assert(receipt.toolInputs.length > 0);
    t.diagnostic(JSON.stringify(receipt));
    for (const suite of receipt.suites) {
      assert.throws(() => validateM2FixtureEvents(receipt.events.filter(row =>
        row.type !== 'test:summary' || row.data.file !== join(fixture.directory, suite)), fixture.directory));
      await assert.rejects(Promise.resolve().then(() => validateM2FixtureEvents(
        receipt.events.filter(row => row.data.file !== join(fixture.directory, suite)), fixture.directory)));
    }
    const events = structuredClone(receipt.events);
    events.find(row => row.type === 'test:summary' && row.data.file === undefined).data.success = false;
    assert.throws(() => validateM2FixtureEvents(events, fixture.directory));
    assert.throws(() => validateM2FixtureEvents(receipt.events, join(fixture.directory, 'substituted')));
    for (const path of ['pnpm-lock.yaml', 'architecture/checks/private-core-start.mjs',
      'architecture/checks/assembly-admission.mjs',
      'tests/m2-start.test.mjs', 'm2-reporter.mjs', 'node_modules/canonicalize/lib/canonicalize.js']) {
      const target = join(fixture.directory, path), bytes = await readFile(target);
      await writeFile(target, Buffer.concat([bytes, Buffer.from('\n// substitution')]));
      await assert.rejects(fixture.run());
      await writeFile(target, bytes);
    }
    const closure = join(fixture.directory, 'architecture/checks/assembly-admission.mjs');
    const closureBytes = await readFile(closure);
    await rm(closure);
    await assert.rejects(fixture.run(), /membership/);
    await writeFile(closure, closureBytes);
    const extra = join(fixture.directory, 'unlisted.mjs');
    await writeFile(extra, '');
    await assert.rejects(fixture.run(), /membership/);
    await rm(extra);
    const target = join(fixture.directory, receipt.suites[0]), bytes = await readFile(target);
    await rm(target);
    await assert.rejects(fixture.run(), /membership/);
    await symlink(join(root, receipt.suites[0]), target);
    await assert.rejects(fixture.run(), /symlink/);
    await rm(target);
    await writeFile(target, bytes);
  } finally { await fixture.dispose(); }
});
