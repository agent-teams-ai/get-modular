// Disposable diagnostic controller. This branch is never merged or qualified.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const source = '5c3d543807cd48258af2d98eb6ef537f89d23b7c';
const sourceTree = '1dc481d4db6e7be8b5466fc696978ace1cb193cf';
const originalTestDigest = '5e3701a42c9620e6d8766d2bf898fd39ddd0436efe923c555152f07481879f67';
const root = realpathSync(process.cwd());
const probe = realpathSync(join(dirname(fileURLToPath(import.meta.url)), 'workflow-native-probe.mjs'));
const output = resolve(process.env.WORKFLOW_NATIVE_DIAGNOSTIC_OUTPUT ?? '');
assert.ok(process.env.WORKFLOW_NATIVE_DIAGNOSTIC_OUTPUT && output !== root);
mkdirSync(output, { recursive: true });
const phases = join(output, 'phases');
mkdirSync(phases, { recursive: true });
const testPath = join(root, 'tests/repository-agent-workflow.test.ts');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const baseEnv = { ...process.env };
for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'EXPECTED_HEAD_SHA',
  'GET_MODULAR_ASSEMBLY_ARCHIVE', 'GET_MODULAR_PUBLISHED_CORE_ARCHIVE', 'GET_MODULAR_HISTORICAL_RELEASE']) delete baseEnv[key];
const receipt = {
  schemaVersion: 1, diagnosticOnly: true, qualificationCredit: false,
  source, sourceTree, workflowSha: process.env.GITHUB_SHA ?? null,
  workflowRunId: process.env.GITHUB_RUN_ID ?? null, workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
  nodeVersion: process.versions.node, platform: process.platform, root,
  startedUtc: new Date().toISOString(), steps: [], originalRestored: false,
  verificationAfter: null, selectionReturned: false, observationHealth: 'unassessed',
  limitations: ['Read-only observation can change timing.',
    'Synchronous identity probes and module loading are outside async child-process observation.',
    'Self-check markers are synthetic owned fixtures; only actual Foundation control observations locate its phases.',
    'Missing, invalid or capped observations do not establish that a phase did not execute.',
    'The failure artifact inherits the diagnostic workflow SHA; this receipt binds the actual checkout separately.'],
};
const save = () => writeFileSync(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
function run(name, args, env = baseEnv) {
  const started = performance.now();
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
  const code = result.status ?? 1;
  receipt.steps.push({ name, args, exit: code, signal: result.signal,
    errorCode: result.error && 'code' in result.error ? String(result.error.code).slice(0,64) : null,
    elapsedMs: performance.now() - started });
  save();
  return code;
}
function git(...args) {
  const gitEnv = Object.fromEntries(Object.entries(baseEnv).filter(([key]) => !key.startsWith('GIT_')));
  const result = spawnSync('git', ['--no-replace-objects', '-C', root, ...args], { env: gitEnv, encoding: 'utf8' });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
let original;
let verdict = 1;
let interrupted = false;
save();
try {
  assert.equal(process.platform, 'win32');
  assert.equal(process.versions.node, '26.11.1');
  assert.equal(git('rev-parse', 'HEAD'), source);
  assert.equal(git('rev-parse', 'HEAD^{tree}'), sourceTree);
  const foundation = realpathSync(join(root, 'node_modules/@agent-teams/engineering-foundation'));
  const manifest = JSON.parse(readFileSync(join(foundation, 'package.json'), 'utf8'));
  assert.equal(manifest.version, '3.0.0');
  const foundationCli = realpathSync(join(foundation, manifest.bin['agent-teams-foundation']));
  receipt.foundationVersion = manifest.version;
  receipt.foundationCliSha256 = digest(readFileSync(foundationCli));
  receipt.probeSha256 = digest(readFileSync(probe));
  const verificationEnv = { ...baseEnv, EXPECTED_HEAD_SHA: source };
  if (run('verify-before', ['architecture/tooling/runtime/dev.ts', 'verify'], verificationEnv) !== 0) throw new Error('pre-observation verification failed');

  const probeEnv = { ...baseEnv,
    GET_MODULAR_WORKFLOW_PROBE_DIRECTORY: phases,
    GET_MODULAR_WORKFLOW_PROBE_CLI: foundationCli,
  };
  const selfCheckPath = join(output, 'observer-self-check.json');
  if (run('observer-self-check', [probe, '--self-check', selfCheckPath], probeEnv) !== 0) throw new Error('public observation channel self-check failed');
  const selfCheck = JSON.parse(readFileSync(selfCheckPath, 'utf8'));
  assert.equal(selfCheck.passed, true);
  assert.equal(selfCheck.diagnosticOnly, true);
  assert.equal(selfCheck.node, '26.11.1');
  assert.equal(selfCheck.platform, 'win32');
  receipt.observerSelfCheck = { passed: true, node: selfCheck.node, platform: selfCheck.platform,
    markers: 'synthetic-owned-calibration-only' };

  // Exact static-lane preparation before the first mandatory quality selection.
  const prefix = 'runtime:preflight governance:check assembly:build lifecycle:build resources:build conformance:build observation:build docs:protocol:check architecture:feature-module-profile';
  verdict = run('original-static-prefix', ['architecture/tooling/run-ci-check-lane.mjs'], { ...baseEnv, LANE_SCRIPTS: prefix });
  if (verdict !== 0) throw new Error('original static preparation failed');

  original = readFileSync(testPath);
  assert.equal(digest(original), originalTestDigest);
  const text = original.toString('utf8');
  const needle = 'const result = spawnSync(process.execPath, [\n    cli, "agent-workflow", "changed", "--consumer", root,';
  assert.equal(text.split(needle).length - 1, 1, 'outer changed invocation must have one exact injection site');
  const replacement = 'const result = spawnSync(process.execPath, [\n    "--import", ' + JSON.stringify(pathToFileURL(probe).href) + ',\n    cli, "agent-workflow", "changed", "--consumer", root,';
  const injected = Buffer.from(text.replace(needle, replacement));
  receipt.originalTestSha256 = digest(original);
  receipt.injectedTestSha256 = digest(injected);
  receipt.injection = { file: 'tests/repository-agent-workflow.test.ts', count: 1, original: needle, replacement };
  writeFileSync(join(output, 'original-test.ts'), original, { flag: 'wx' });
  writeFileSync(join(output, 'injected-test.ts'), injected, { flag: 'wx' });
  writeFileSync(testPath, injected);
  save();
  verdict = run('observed-mandatory-quality-selection', ['architecture/tooling/run-ci-check-lane.mjs'], {
    ...probeEnv, LANE_SCRIPTS: 'quality:critical:test',
    WORKFLOW_SUBPROCESS_FAILURE_ARTIFACT: join(output, 'workflow-subprocess-failure.json'),
  });
  receipt.testExit = verdict;
  receipt.selectionReturned = true;
} catch (error) {
  interrupted = true;
  receipt.controllerError = String(error).slice(0, 1024);
  if (verdict === 0) verdict = 1;
} finally {
  try {
    if (original) {
      writeFileSync(testPath, original);
      assert.ok(readFileSync(testPath).equals(original), 'test restoration must preserve exact bytes');
      receipt.originalRestored = true;
    } else receipt.originalRestored = digest(readFileSync(testPath)) === originalTestDigest;
  } catch (error) {
    receipt.restorationError = String(error).slice(0,1024);
    if (verdict === 0) verdict = 1;
  }
  receipt.verificationAfter = run('verify-after', ['architecture/tooling/runtime/dev.ts', 'verify'], { ...baseEnv, EXPECTED_HEAD_SHA: source });
  if (verdict === 0 && receipt.verificationAfter !== 0) verdict = receipt.verificationAfter;
  const phaseFiles = readdirSync(phases);
  const phaseBytes = phaseFiles.reduce((sum, name) => sum + statSync(join(phases, name)).size, 0);
  receipt.phaseFileCount = phaseFiles.length;
  receipt.phaseBytes = phaseBytes;
  receipt.expectedInvocationCount = 28; // Five ordinary calls and 23 escalation fixtures.
  if (receipt.testExit === 0 && phaseFiles.length !== receipt.expectedInvocationCount) {
    receipt.observationIncomplete = true;
    if (verdict === 0) verdict = 1;
  }
  if (phaseFiles.length > 32 || phaseBytes > 32 * 65536) {
    receipt.observationLimitExceeded = true;
    if (verdict === 0) verdict = 1;
  }
  receipt.interrupted = interrupted;
  receipt.finishedUtc = new Date().toISOString();
  receipt.exit = verdict;
  save();
}
console.log(JSON.stringify({ diagnosticOnly: true, source, testExit: receipt.testExit ?? null,
  originalRestored: receipt.originalRestored, verificationAfter: receipt.verificationAfter,
  selectionReturned: receipt.selectionReturned, observationHealth: receipt.observationHealth, exit: verdict }));
process.exitCode = verdict;
