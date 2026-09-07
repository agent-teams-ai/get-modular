// Closed historical-input replay; never an installed Core or current-gate proof.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { parse } from 'yaml';
import { M2_EVIDENCE_LEDGER } from '../../../architecture/checks/m2-evidence.mjs';
import { M2_ORIGINAL_DECISION, m2Digest, readCurrentM2Authority } from '../../../architecture/checks/m2-lock-witness.mjs';
import { assertGitIndexSnapshotCurrent, readIndexSnapshotFile } from '../../../architecture/checks/tracked-file-custody.mjs';

const exec = promisify(execFile);
const SUITES = Object.freeze(['tests/m2-start.test.mjs',
  'tests/qualification/m2-candidate/retained-acceptance.test.mjs']);
const CURRENT_MODULES = ['architecture/checks/assembly-admission.mjs', 'architecture/checks/private-core-start.mjs',
  'architecture/checks/production-artifacts.mjs', 'architecture/checks/tracked-file-custody.mjs'];
const ADR20 = 'docs/decisions/0020-define-diagnostic-coverage-outside-object-resource-admission.md';
const TOOLS = ['canonicalize', 'jsonc-parser', 'yaml'];
const REPORTER = 'export default async function* (events) {\n'
  + '  for await (const event of events) yield JSON.stringify(event) + "\\n";\n}\n';

async function regularFiles(directory, prefix = '') {
  const files = new Map();
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const path = prefix + entry.name;
    assert(!entry.isSymbolicLink(), `fixture symlink: ${path}`);
    if (entry.isDirectory()) {
      for (const [name, bytes] of await regularFiles(directory, path + '/')) files.set(name, bytes);
    } else {
      assert(entry.isFile(), `fixture non-regular member: ${path}`);
      files.set(path, await readFile(join(directory, path)));
    }
  }
  return files;
}

// Validate actual child events, including both files and their full seven tests.
// This function never manufactures success from a retained capture receipt.
export function validateM2FixtureEvents(events, directory) {
  assert(!events.some(row => row.type === 'test:fail'));
  const summaries = events.filter(row => row.type === 'test:summary' && row.data.file === undefined);
  assert.equal(summaries.length, 1, 'one terminal runner summary');
  const summary = summaries[0].data;
  assert.equal(summary.success, true);
  assert.equal(summary.counts.tests, 7);
  assert.equal(summary.counts.passed, 7);
  assert.equal(events.filter(row => row.type === 'test:summary').length, 3);
  for (const key of ['failed', 'cancelled', 'skipped', 'todo']) assert.equal(summary.counts[key], 0, key);
  const passed = events.filter(row => row.type === 'test:pass');
  assert.equal(passed.length, 7);
  for (const [index, suite] of SUITES.entries()) {
    const rows = passed.filter(row => row.data.file === join(directory, suite));
    const count = index === 0 ? 3 : 4;
    assert.equal(rows.length, count, `executed suite: ${suite}`);
    const terminal = events.filter(row => row.type === 'test:summary'
      && row.data.file === join(directory, suite));
    assert.equal(terminal.length, 1, `terminal suite result: ${suite}`);
    assert.equal(terminal[0].data.success, true);
    assert.equal(terminal[0].data.counts.tests, count);
    assert.equal(terminal[0].data.counts.passed, count);
    for (const key of ['failed', 'cancelled', 'skipped', 'todo']) assert.equal(terminal[0].data.counts[key], 0);
    assert(rows.every(row => !row.data.skip && !row.data.todo));
    assert.equal(new Set(rows.map(row => row.data.name)).size, rows.length);
  }
  return Object.freeze({ scope: 'fresh-historical-input-replay-with-current-tooling',
    coreExecuted: false, currentInstallationQualified: false, suites: [...SUITES], tests: 7 });
}

export async function prepareM2EvidenceFixture(snapshot) {
  const observed = new Map();
  const read = async path => {
    const bytes = await readIndexSnapshotFile(snapshot, path, 'M2 fixture input');
    observed.set(path, bytes);
    return bytes;
  };
  const authority = await readCurrentM2Authority(read);
  const files = new Map();
  for (const row of JSON.parse(authority.ledgerBytes).artifacts) {
    files.set(row.path, await authority.readBytes(row.path));
  }
  files.set(M2_EVIDENCE_LEDGER, authority.ledgerBytes);
  files.set(M2_ORIGINAL_DECISION, await read(M2_ORIGINAL_DECISION));
  const adr20 = await read(ADR20);
  assert.equal(m2Digest(adr20), 'sha256:c63b2b8782329459a1f84c8b34927e48fed7d501de6adbc9e93b8aa942ccfece');
  files.set(ADR20, adr20);
  const currentDependencies = [];
  for (const path of CURRENT_MODULES) {
    const bytes = await read(path);
    files.set(path, bytes);
    currentDependencies.push({ path, digest: m2Digest(bytes) });
  }
  const manifest = JSON.parse(observed.get('package.json'));
  const workspace = parse(observed.get('pnpm-workspace.yaml').toString());
  const lock = parse(observed.get('pnpm-lock.yaml').toString());
  const toolInputs = [];
  // Static import closure: 14 repository modules reach these three leaf tools.
  // No copied consumer, dependency install, package script or tool override.
  for (const name of TOOLS) {
    const directory = await realpath(join(snapshot.repositoryRoot, 'node_modules', name));
    const members = await regularFiles(directory);
    const metadata = JSON.parse(members.get('package.json'));
    assert.equal(metadata.name, name);
    assert.equal(manifest.devDependencies[name], 'catalog:');
    assert.equal(metadata.version, workspace.catalog[name]);
    assert.equal(lock.importers['.'].devDependencies[name].version, metadata.version);
    for (const key of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      assert.equal(Object.keys(metadata[key] ?? {}).length, 0, `${name}: unexpected dependency closure`);
    }
    for (const [path, bytes] of members) {
      assert(!path.split('/').includes('node_modules'), 'nested tooling closure');
      files.set(`node_modules/${name}/${path}`, bytes);
      toolInputs.push({ path: `${name}/${path}`, digest: m2Digest(bytes) });
    }
  }
  files.set('package.json', Buffer.from('{"private":true,"type":"module"}\n'));
  files.set('m2-reporter.mjs', Buffer.from(REPORTER));
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'TEST-gm-m2-evidence-')));
  const dispose = () => rm(directory, { recursive: true, force: true });
  const verify = async () => {
    assert((await lstat(directory)).isDirectory());
    const actual = await regularFiles(directory);
    assert.deepEqual([...actual.keys()].sort(), [...files.keys()].sort(), 'closed fixture membership');
    for (const [path, bytes] of files) assert.deepEqual(actual.get(path), bytes, path);
    for (const [path, bytes] of observed) {
      assert.deepEqual(await readIndexSnapshotFile(snapshot, path, 'M2 fixture completion'), bytes, path);
    }
    await assertGitIndexSnapshotCurrent(snapshot);
  };
  try {
    for (const [path, bytes] of files) {
      await mkdir(dirname(join(directory, path)), { recursive: true });
      await writeFile(join(directory, path), bytes, { flag: 'wx' });
    }
    await verify();
    return { directory, dispose, async run() {
      await verify();
      const env = { ...process.env };
      for (const key of Object.keys(env)) if (key.startsWith('NODE_')) delete env[key];
      const { stdout, stderr } = await exec(process.execPath, ['--test', '--test-concurrency=1',
        '--test-reporter=./m2-reporter.mjs', ...SUITES], {
        cwd: directory, env, timeout: 120_000, maxBuffer: 2 * 1024 * 1024,
      });
      assert.equal(stderr, '');
      const events = stdout.trimEnd().split('\n').map(line => JSON.parse(line));
      const result = validateM2FixtureEvents(events, resolve(directory));
      await verify();
      return { ...result, events, currentDependencies, toolInputs,
        toolingEvidence: authority.toolingEvidence, historicalLock: authority.historicalLock };
    } };
  } catch (error) { await dispose(); throw error; }
}
