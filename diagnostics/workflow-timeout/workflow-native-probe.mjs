// Disposable diagnostic only. This file is never part of the qualified repository.
// Explicit --import observes only the outer CLI; it never wraps process functions.
import { spawn, spawnSync } from 'node:child_process';
import { channel } from 'node:diagnostics_channel';
import {
  appendFileSync, closeSync, lstatSync, mkdtempSync, openSync,
  readFileSync, readSync, readdirSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import { mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const self = fileURLToPath(import.meta.url);
const DIRECTORY = 'GET_MODULAR_WORKFLOW_PROBE_DIRECTORY';
const CLI = 'GET_MODULAR_WORKFLOW_PROBE_CLI';
const SMOKE = 'GET_MODULAR_WORKFLOW_PROBE_SMOKE';
const MAX_RECORDS = 256;
const MAX_BYTES = 65_536;
const MAX_FILES = 32;
// Match fs.promises.realpath used by the real fixture, including Windows 8.3 aliases.
const canonical = realpathSync.native;
const channels = {
  start: 'tracing:child_process.spawn:start',
  end: 'tracing:child_process.spawn:end',
  error: 'tracing:child_process.spawn:error',
  legacy: 'child_process',
};
const object = value => value !== null && typeof value === 'object';
const text = (value, limit = 256) => typeof value === 'string' ? value.slice(0, limit) : null;
const pathKey = value => process.platform === 'win32' ? value.toLowerCase() : value;
const samePath = (left, right) => pathKey(left) === pathKey(right);
const errorCode = error => object(error) ? text(error.code, 64) : null;

function boundedRead(path, maximum) {
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error('probe-read-boundary');
  if (metadata.size > maximum) {
    throw Object.assign(new Error('probe-read-limit'), {
      observedBytes: metadata.size, limitBytes: maximum, sizeEvidence: 'file-metadata',
    });
  }
  const descriptor = openSync(path, 'r');
  try {
    const bytes = Buffer.alloc(maximum + 1);
    const count = readSync(descriptor, bytes, 0, bytes.length, 0);
    if (count > maximum) {
      throw Object.assign(new Error('probe-read-limit'), {
        observedBytes: count, limitBytes: maximum, sizeEvidence: 'at-least-read',
      });
    }
    return bytes.toString('utf8', 0, count);
  } finally {
    closeSync(descriptor);
  }
}

function installObserver() {
  const directory = canonical(process.env[DIRECTORY]);
  const expectedCli = canonical(process.env[CLI]);
  if (!samePath(canonical(process.argv[1]), expectedCli)) throw new Error('probe-cli-binding');
  const calibration = process.env[SMOKE] === '1';
  let consumerArgument;
  if (calibration) {
    if (!samePath(expectedCli, canonical(self)) || process.argv[2] !== '--calibration-child') {
      throw new Error('probe-calibration-binding');
    }
    consumerArgument = process.argv[3];
  } else {
    if (process.argv[2] !== 'agent-workflow' || process.argv[3] !== 'changed') {
      throw new Error('probe-command-binding');
    }
    const positions = process.argv.flatMap((value, index) => value === '--consumer' ? [index] : []);
    if (positions.length !== 1) throw new Error('probe-consumer-binding');
    consumerArgument = process.argv[positions[0] + 1];
  }
  if (typeof consumerArgument !== 'string' || !isAbsolute(consumerArgument)) {
    throw new Error('probe-consumer-path');
  }
  const consumer = canonical(consumerArgument);
  const temporaryRoot = canonical(tmpdir());
  if (!samePath(dirname(consumer), temporaryRoot) ||
      !basename(consumer).startsWith('gm-changed-workflow-TEST-')) {
    throw new Error('probe-consumer-scope');
  }
  // Fixed exclusive slots impose a process-independent aggregate bound, including races.
  let output;
  for (let slot = 0; slot < MAX_FILES; slot += 1) {
    const candidate = join(directory, `phase-${String(slot).padStart(2, '0')}.jsonl`);
    try {
      writeFileSync(candidate, '', { flag: 'wx', mode: 0o600 });
      output = candidate;
      break;
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error;
    }
  }
  if (output === undefined) return; // Missing invocation evidence is unknown, never success.
  const started = performance.now();
  let records = 0;
  let bytes = 0;
  let invalid = false;
  let capped = false;
  let writable = true;
  let timer;
  let nextId = 0;
  let validatedControls = 0;
  const counts = { start: 0, end: 0, error: 0, legacy: 0 };
  const children = new WeakMap();
  const controls = new Map();
  const subscriptions = [];

  function stopPolling() {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  }
  function append(kind, detail = {}, terminal = false) {
    if (!writable || capped && !terminal) return;
    const line = JSON.stringify({ kind, ms: Math.round((performance.now() - started) * 1000) / 1000, ...detail }) + '\n';
    const length = Buffer.byteLength(line);
    const recordLimit = terminal ? MAX_RECORDS : MAX_RECORDS - 2;
    const byteLimit = terminal ? MAX_BYTES : MAX_BYTES - 2048;
    if (records >= recordLimit || bytes + length > byteLimit) {
      if (!capped) {
        capped = true;
        stopPolling();
        append('capture-limit', { observation: 'incomplete-unknown' }, true);
      }
      return;
    }
    try {
      appendFileSync(output, line, { encoding: 'utf8' });
      records += 1;
      bytes += length;
    } catch {
      invalid = true;
      writable = false;
      stopPolling();
    }
  }
  function unhealthy(stage, error) {
    invalid = true;
    try {
      const ownReason = error instanceof Error && /^probe-[a-z-]+$/u.test(error.message)
        ? error.message : null;
      append('observer-error', {
        stage, code: errorCode(error), reason: ownReason, observation: 'invalid-unknown',
        ...(ownReason === 'probe-read-limit' ? {
          observedBytes: Number.isSafeInteger(error.observedBytes) ? error.observedBytes : null,
          limitBytes: Number.isSafeInteger(error.limitBytes) ? error.limitBytes : null,
          sizeEvidence: ['file-metadata', 'at-least-read'].includes(error.sizeEvidence) ? error.sizeEvidence : null,
        } : {}),
      });
    } catch {
      writable = false;
      try { stopPolling(); } catch { /* No observer exception may reach the observed CLI. */ }
    }
  }
  function safe(stage, callback) {
    return (...values) => {
      try { callback(...values); } catch (error) { unhealthy(stage, error); }
    };
  }
  function marker(path, allowed) {
    try {
      const value = boundedRead(path, 64).trim();
      if (value === '') return 'pending-write';
      if (!allowed.includes(value)) throw new Error('probe-marker-value');
      return value;
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return 'absent';
      throw error;
    }
  }
  function inspectMarkers(state) {
    if (state.root === undefined || capped) return;
    for (const [name, allowed] of [['launched', ['STARTED', 'FAILED']], ['contained', ['CONTAINED']]]) {
      const value = marker(join(state.root, name), allowed);
      if (state[name] !== value) {
        state[name] = value;
        append('control-marker', { child: state.id, marker: name, value });
      }
    }
  }
  function bindControl(state, cwd) {
    if (typeof cwd !== 'string' || !isAbsolute(cwd) ||
        !basename(cwd).startsWith('agent-teams-foundation-process-')) return;
    const root = canonical(cwd);
    if (!samePath(dirname(root), temporaryRoot)) throw new Error('probe-control-scope');
    const request = JSON.parse(boundedRead(join(root, 'request.json'), 65_536));
    if (!object(request) || request.schemaVersion !== 1 || typeof request.cwd !== 'string' ||
        typeof request.command !== 'string' || !Array.isArray(request.args) ||
        !request.args.every(value => typeof value === 'string') || typeof request.launchPath !== 'string' ||
        !samePath(canonical(request.cwd), consumer) || !isAbsolute(request.launchPath) ||
        basename(request.launchPath) !== 'launched' ||
        !samePath(canonical(dirname(request.launchPath)), root)) {
      throw new Error('probe-control-binding');
    }
    let operation = 'other';
    if (/^git(?:\.exe)?$/iu.test(basename(request.command))) {
      const verbs = ['rev-parse', 'check-ref-format', 'merge-base', 'diff', 'ls-files', 'status'];
      operation = `git:${verbs.find(value => request.args.includes(value)) ?? 'other'}`;
    } else if (request.args.includes('check:fast')) {
      operation = 'script:check:fast';
    } else if (calibration) {
      operation = 'calibration';
    }
    state.root = root;
    validatedControls += 1;
    controls.set(state.id, state);
    append('control-bound', { child: state.id, control: basename(root), operation });
    inspectMarkers(state);
    if (timer === undefined && !capped) {
      timer = setInterval(safe('marker-poll', () => {
        for (const current of controls.values()) inspectMarkers(current);
      }), 25);
      timer.unref();
    }
  }
  function getChild(child) {
    if (!object(child) || typeof child.once !== 'function') throw new Error('probe-channel-shape');
    let state = children.get(child);
    if (state === undefined) {
      state = { id: ++nextId };
      children.set(child, state);
      // Deliberately no 'error' listener: observation must not handle an otherwise unhandled error.
      child.once('spawn', safe('child-spawn', () => {
        append('child-spawn', { child: state.id, pid: child.pid ?? null });
      }));
      for (const event of ['exit', 'close']) {
        child.once(event, safe(`child-${event}`, (code, signal) => {
          inspectMarkers(state);
          append(`child-${event}`, { child: state.id, pid: child.pid ?? null,
            code: typeof code === 'number' ? code : null, signal: text(signal, 64) });
          if (event === 'close') {
            controls.delete(state.id);
            if (controls.size === 0) stopPolling();
          }
        }));
      }
    }
    return state;
  }
  append('observer-start', {
    pid: process.pid, ppid: process.ppid, node: process.versions.node, platform: process.platform,
    startedAt: new Date().toISOString(), mode: calibration ? 'calibration' : 'foundation-changed',
    cli: text(expectedCli, 2048), consumer: text(consumer, 2048),
    limits: { files: MAX_FILES, records: MAX_RECORDS, bytes: MAX_BYTES },
    coverage: 'async-spawn-and-scoped-control-markers; synchronous-probes-unobserved',
    observation: 'incomplete-until-observer-end',
  });
  for (const [name, channelName] of Object.entries(channels)) {
    const subscriber = safe(`channel-${name}`, message => {
      if (capped || !writable) return;
      counts[name] += 1;
      if (!object(message)) throw new Error('probe-channel-message');
      const state = getChild(message.process);
      if (name === 'start' && object(message.options)) {
        const cwd = message.options.cwd;
        bindControl(state, Buffer.isBuffer(cwd) ? cwd.toString() : cwd);
      }
      append(`spawn-${name}`, { child: state.id, pid: message.process.pid ?? null,
        ...(name === 'error' ? { code: errorCode(message.error) } : {}) });
    });
    channel(channelName).subscribe(subscriber);
    subscriptions.push([channelName, subscriber]);
  }
  process.once('exit', safe('observer-exit', exitCode => {
    stopPolling();
    for (const state of controls.values()) inspectMarkers(state);
    for (const [channelName, subscriber] of subscriptions) channel(channelName).unsubscribe(subscriber);
    append('observer-end', {
      exitCode, channels: counts, validatedControls, remainingControls: controls.size,
      observerHealth: invalid ? 'invalid-unknown' : capped ? 'capped-unknown' : 'no-observer-errors',
      channelCoverage: counts.start > 0 && counts.end > 0 ? 'observed' : 'unestablished-unknown',
      markerCoverage: validatedControls > 0 ? 'bound-controls-observed' : 'unestablished-unknown',
      // This is observation completion, never command or qualification success.
      observation: capped || invalid ? 'incomplete-unknown' : 'process-exit-observed',
    }, true);
  }));
}

async function calibrationChild() {
  const consumer = canonical(process.argv[3]);
  const root = mkdtempSync(join(tmpdir(), 'agent-teams-foundation-process-'));
  const launched = join(root, 'launched');
  const contained = join(root, 'contained');
  writeFileSync(join(root, 'request.json'), JSON.stringify({ schemaVersion: 1,
    command: process.execPath, args: ['calibration'], cwd: consumer, launchPath: launched }), { flag: 'wx' });
  try {
    const code = `const fs=require('node:fs');fs.writeFileSync('launched','STARTED',{flag:'wx'});` +
      `setTimeout(()=>fs.writeFileSync('contained','CONTAINED',{flag:'wx'}),120);`;
    const child = spawn(process.execPath, ['-e', code], { cwd: root, stdio: 'ignore' });
    // Calibration itself owns its child; the observer above never adds this error listener.
    await new Promise((accept, reject) => {
      child.once('error', reject);
      child.once('close', (status, signal) => status === 0 && signal === null ? accept() : reject(new Error('calibration-child-failed')));
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function selfCheck(destination) {
  const consumer = await realpath(await mkdtemp(join(tmpdir(), 'gm-changed-workflow-TEST-')));
  const directory = mkdtempSync(join(tmpdir(), 'workflow-native-probe-smoke-'));
  let receipt;
  try {
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(self).href, self,
      '--calibration-child', consumer], { encoding: 'utf8', timeout: 10_000, maxBuffer: 65_536,
      env: { ...process.env, [DIRECTORY]: directory, [CLI]: self, [SMOKE]: '1' } });
    const files = readdirSync(directory).filter(name => /^phase-\d\d\.jsonl$/u.test(name));
    const observations = files.flatMap(name => readFileSync(join(directory, name), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)));
    const end = observations.find(record => record.kind === 'observer-end');
    const started = observations.some(record => record.kind === 'control-marker' && record.marker === 'launched' && record.value === 'STARTED');
    const contained = observations.some(record => record.kind === 'control-marker' && record.marker === 'contained' && record.value === 'CONTAINED');
    const passed = result.error === undefined && result.status === 0 && result.signal === null &&
      files.length === 1 && end?.observerHealth === 'no-observer-errors' &&
      end.channels.start > 0 && end.channels.end > 0 && end.channels.legacy > 0 &&
      end.validatedControls === 1 && started && contained;
    receipt = { schemaVersion: 1, diagnosticOnly: true, node: process.versions.node,
      platform: process.platform, passed, childStatus: result.status, childSignal: result.signal,
      childErrorCode: errorCode(result.error), observations };
    process.exitCode = passed ? 0 : 1;
  } catch (error) {
    receipt = { schemaVersion: 1, diagnosticOnly: true, node: process.versions.node,
      platform: process.platform, passed: false, observerHealth: 'invalid-unknown', code: errorCode(error) };
    process.exitCode = 1;
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(consumer, { recursive: true, force: true });
  }
  writeFileSync(destination, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}

const direct = process.argv[1] !== undefined && samePath(resolve(process.argv[1]), resolve(self));
if (direct && process.argv[2] === '--self-check') {
  await selfCheck(process.argv[3]);
} else {
  // Invalid/missing capture is unknown evidence. Instrumentation must never alter CLI success/failure.
  try { installObserver(); } catch { /* The controller requires initial/final records independently. */ }
  if (direct && process.argv[2] === '--calibration-child' && process.env[SMOKE] === '1') {
    await calibrationChild();
  }
}
