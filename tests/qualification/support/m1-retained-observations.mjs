import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

// Private transport and completeness checks. This module imports neither the
// producer nor a candidate. Its caller must obtain expectedPlan from the trusted
// harness, and must authenticate the seal against an OUTSIDE invocation anchor.
// A passing synthetic transport test is never actual package qualification.
export const retainedLimits = Object.freeze({
  recordBytes: 8 * 1024 * 1024, journalBytes: 128 * 1024 * 1024,
  records: 20_000, jsonBytes: 64 * 1024 * 1024,
  fileBytes: 256 * 1024 * 1024, treeBytes: 2 * 1024 * 1024 * 1024,
  entries: 100_000, depth: 64,
});
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const jsonBytes = value => Buffer.from(JSON.stringify(value) + '\n');
export const rowDigest = row => digest(jsonBytes(row));
export function verifyObservationAnchor(events, expectedSha256) {
  need(typeof expectedSha256 === 'string' && /^[a-f0-9]{64}$/u.test(expectedSha256), 'outside-observation-anchor-required');
  assert.equal(digest(jsonBytes(events)), expectedSha256, 'completed observations differ from outside capture');
}
export async function captureOutsideAnchor(sink, anchor) {
  need(typeof sink === 'function', 'outside-capture-sink-required');
  await sink(Object.freeze({ ...anchor }));
}
export function need(condition, reason) {
  if (condition) return;
  const error = new Error(`Private retained M1 check failed: ${reason}`);
  error.code = 'm1.retained.invalid';
  error.context = { reason };
  throw error;
}
export function absolute(path) {
  need(typeof path === 'string' && isAbsolute(path) && resolve(path) === path
    && path.length <= 4096 && !/[\0\r\n]/u.test(path), 'absolute-path');
  return path;
}
export function within(path, root) {
  const suffix = relative(root, path);
  return suffix === '' || (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith(`..${sep}`));
}
export async function readBytes(path, maximum = retainedLimits.fileBytes) {
  absolute(path);
  need(await fs.realpath(path) === path, 'regular-canonical-path');
  const handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    need(before.isFile() && before.size <= maximum, 'regular-file-budget');
    // A fixed allocation prevents a growing file from bypassing the read budget.
    const buffer = Buffer.alloc(before.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const result = await handle.read(buffer, length, buffer.length - length, length);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    const after = await handle.stat();
    need(length === before.size && after.size === before.size
      && after.mtimeMs === before.mtimeMs && after.ctimeMs === before.ctimeMs,
    'file-changed-during-read');
    return buffer.subarray(0, length);
  } finally { await handle.close(); }
}
export async function readJson(path, maximum = retainedLimits.jsonBytes) {
  const bytes = await readBytes(path, maximum);
  const value = JSON.parse(bytes.toString('utf8'));
  // Also rejects duplicate JSON keys, trailing material and incomplete records.
  need(bytes.equals(jsonBytes(value)), 'noncanonical-or-incomplete-json');
  return value;
}
export async function writeExclusive(path, bytes) {
  absolute(path);
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  const partial = `${path}.partial`;
  const handle = await fs.open(partial, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
  // link is an exclusive publication operation; rename could replace a result.
  // Failure leaves the partial for diagnosis. No session cleanup is registered.
  await fs.link(partial, path);
  await fs.unlink(partial);
}
export async function createOutputDirectory(path, excludedRoots = []) {
  absolute(path);
  need(await fs.realpath(dirname(path)) === dirname(path), 'destination-parent-symlink');
  for (const root of excludedRoots) {
    absolute(root);
    need(!within(path, root) && !within(root, path), 'destination-overlap');
  }
  for (let parent = dirname(path); ; parent = dirname(parent)) {
    try {
      await fs.lstat(join(parent, '.git'));
      need(false, 'destination-inside-worktree');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (dirname(parent) === parent) break;
  }
  await fs.mkdir(path, { mode: 0o700 });
  need(await fs.realpath(path) === path, 'destination-symlink');
  return path;
}
export async function scanTree(root) {
  absolute(root);
  need(await fs.realpath(root) === root && (await fs.lstat(root)).isDirectory(), 'tree-root');
  const pending = [''];
  const entries = [];
  let total = 0;
  while (pending.length) {
    const suffix = pending.pop();
    need(suffix.split('/').length <= retainedLimits.depth, 'tree-depth');
    const directory = await fs.opendir(join(root, suffix));
    const names = [];
    for await (const entry of directory) {
      names.push(entry.name);
      need(entries.length + names.length + pending.length <= retainedLimits.entries, 'tree-entry-budget');
    }
    for (const name of names.sort()) {
      need(name !== '.' && name !== '..' && !/[\0\r\n\\]/u.test(name), 'tree-name');
      const path = suffix ? `${suffix}/${name}` : name;
      const full = join(root, path);
      const metadata = await fs.lstat(full);
      if (metadata.isDirectory()) {
        entries.push({ path, kind: 'directory' });
        pending.push(path);
      } else if (metadata.isSymbolicLink()) {
        const target = await fs.realpath(full);
        need(within(target, root), 'dependency-link-escapes-snapshot');
        entries.push({ path, kind: 'link', target: await fs.readlink(full), resolved: relative(root, target).split(sep).join('/') });
      } else {
        need(metadata.isFile(), 'tree-special-file');
        total += metadata.size;
        need(total <= retainedLimits.treeBytes, 'tree-byte-budget');
        const bytes = await readBytes(full);
        entries.push({ path, kind: 'file', bytes: bytes.length, sha256: digest(bytes), mode: metadata.mode & 0o777 });
      }
      need(entries.length <= retainedLimits.entries, 'tree-entry-budget');
    }
  }
  entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return entries;
}
export async function checkTree(root, expected) {
  assert.deepEqual(await scanTree(root), expected, 'retained full dependency/source closure changed');
}
export function checkProcess(observation, command, expected) {
  assert.deepEqual(Object.keys(observation).sort(), ['error', 'outputLimitExceeded', 'protocol', 'receivedBytes',
    'signal', 'spawnError', 'status', 'stderr', 'stdout', 'timedOut', 'truncated'].sort());
  for (const field of ['error', 'spawnError', 'signal']) assert.equal(observation[field], null, field);
  for (const field of ['timedOut', 'outputLimitExceeded']) assert.equal(observation[field], false, field);
  assert.deepEqual(observation.truncated, { stdout: false, stderr: false, protocol: false });
  need(Number.isInteger(observation.status) && observation.status >= 0, 'nonterminal-process');
  let total = 0;
  for (const channel of ['stdout', 'stderr', 'protocol']) {
    need(typeof observation[channel] === 'string', 'log-shape');
    const length = Buffer.byteLength(observation[channel]);
    need(length === observation.receivedBytes[channel], 'unverifiable-log-bytes');
    total += length;
  }
  need(total <= command.maxOutputBytes && Buffer.byteLength(observation.protocol) <= command.maxProtocolBytes,
    'log-budget');
  if (expected.status === 'nonzero') need(observation.status !== 0, 'expected-negative-exit');
  else assert.equal(observation.status, expected.status);
  if (expected.completion) {
    const lines = observation.protocol.split('\n');
    assert.equal(lines.pop(), '', 'completion channel must terminate its last record');
    assert.deepEqual(lines.map(line => JSON.parse(line)), expected.completion);
    assert.equal(observation.protocol, expected.completion.map(value => JSON.stringify(value) + '\n').join(''));
  } else assert.equal(observation.protocol, '');
  if (Object.hasOwn(expected, 'stdoutTrimmed')) assert.equal(observation.stdout.trim(), expected.stdoutTrimmed);
  if (Object.hasOwn(expected, 'diagnosticCodes')) {
    const codes = [...new Set((observation.stdout + '\n' + observation.stderr).match(/TS\d+/gu) ?? [])].sort();
    assert.deepEqual(codes, [...expected.diagnosticCodes].sort(), 'exact compiler diagnostic set');
  }
}
function installedOrder(paths) {
  const directories = new Map([['', new Map()]]);
  for (const path of paths) {
    const parts = path.split('/');
    let prefix = '';
    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index];
      const child = prefix ? `${prefix}/${name}` : name;
      directories.get(prefix).set(name, { path: child, directory: index < parts.length - 1 });
      if (index < parts.length - 1 && !directories.has(child)) directories.set(child, new Map());
      prefix = child;
    }
  }
  const result = [], pending = [''];
  while (pending.length) {
    const directory = pending.pop();
    for (const [name, row] of [...directories.get(directory)].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
      void name;
      if (row.directory) pending.push(row.path); else result.push(row.path);
    }
  }
  return result;
}
export function verifyCaseObservations(row, events, { contextId, archive, inventory }) {
  let next = 0;
  function take(kind) {
    const event = events[next++];
    need(event && event.kind === kind, `expected-event:${row.id}:${kind}`);
    assert.equal(event.contextId, contextId);
    assert.deepEqual(event.archiveIdentity, archive.identity);
    assert.equal(event.caseId, row.id);
    assert.equal(event.rowSha256, rowDigest(row));
    return event.details;
  }
  assert.deepEqual(take('case-started'), {});
  const inputs = new Map();
  for (const input of row.inputs.filter(value => value.kind !== 'archive')) {
    if (inputs.has(input.path)) assert.deepEqual(inputs.get(input.path), input);
    inputs.set(input.path, input);
  }
  for (const input of inputs.values()) {
    assert.deepEqual(take('input-file'), { path: input.path, regular: true, bytes: input.bytes });
    assert.deepEqual(take('input-identity'), { path: input.path, sha256: input.sha256, bytes: input.bytes });
  }
  const archiveEvents = () => {
    assert.deepEqual(take('archive-file'), { path: archive.path, regular: true, bytes: archive.bytes });
    assert.deepEqual(take('archive-identity'), { actual: archive.identity });
  };
  if (row.kind === 'install') {
    assert.deepEqual(take('install-cache'), { path: row.command.env.npm_config_cache, entries: [], count: 0 });
    archiveEvents();
  }
  if (row.command) {
    const details = take('command');
    assert.deepEqual(Object.keys(details), ['observation']);
    checkProcess(details.observation, row.command, row.expected);
  } else need(row.kind === 'archive', 'missing-case-command');
  if (row.kind === 'install') {
    const root = join(row.command.cwd, 'node_modules/@get-modular/core');
    assert.deepEqual(take('installed-root'), { path: root, directory: true, symlink: false });
    const members = new Map(inventory.map(value => [value.path, value]));
    for (const path of installedOrder(inventory.map(value => value.path))) {
      const member = members.get(path);
      assert.deepEqual(take('installed-member'), { path, regular: true, symlink: false, bytes: member.size });
      assert.deepEqual(take('installed-member-bytes'), { path, bytes: member.size, sha256: member.sha256 });
    }
    assert.deepEqual(take('installed-inventory'), { paths: inventory.map(value => value.path) });
  }
  if (row.kind === 'archive') archiveEvents();
  assert.deepEqual(take('case-passed'), {});
  assert.equal(next, events.length, 'unknown, duplicated or trailing case events');
}
export function verifyM1Observations({ expectedPlan, events, anchor, contextId, archive, inventory }) {
  const cases = expectedPlan.cases;
  need(Array.isArray(cases) && cases.length > 0 && cases.length <= 256, 'case-inventory');
  const ids = cases.map(row => row.id);
  need(ids.every(id => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,159}$/u.test(id)), 'case-id');
  need(new Set(ids).size === ids.length, 'duplicate-case-inventory');
  need(Array.isArray(events) && events.length <= retainedLimits.records, 'event-inventory');
  for (const [sequence, event] of events.entries()) {
    assert.deepEqual(Object.keys(event).sort(), ['anchor', 'archiveIdentity', 'caseId', 'contextId', 'details', 'kind', 'rowSha256', 'sequence'].sort());
    assert.equal(event.sequence, sequence);
    assert.equal(event.anchor, anchor);
  }
  let position = 0;
  for (const row of cases) {
    const start = position;
    while (position < events.length && events[position].caseId === row.id) position += 1;
    need(position > start, `missing-case:${row.id}`);
    verifyCaseObservations(row, events.slice(start, position), { contextId, archive, inventory });
  }
  assert.equal(events.length, position + 1, 'complete inventory needs exactly one terminal event');
  assert.deepEqual(events[position], { sequence: position, anchor, contextId,
    archiveIdentity: archive.identity, caseId: null, rowSha256: null,
    kind: 'session-ended', details: { completed: ids } });
  return Object.freeze({ completed: [...ids], scope: 'transport-and-case-expectations' });
}
export async function readJournal(directory) {
  const names = (await fs.readdir(directory)).sort();
  need(names.length > 0 && names.length <= retainedLimits.records, 'journal-record-count');
  const events = [];
  let total = 0;
  for (const [index, name] of names.entries()) {
    need(name === `${String(index).padStart(6, '0')}.json`, 'journal-gap-extra-or-partial');
    const path = join(directory, name);
    const bytes = await readBytes(path, retainedLimits.recordBytes);
    total += bytes.length;
    need(total <= retainedLimits.journalBytes, 'journal-byte-budget');
    const event = JSON.parse(bytes.toString('utf8'));
    need(bytes.equals(jsonBytes(event)), 'journal-incomplete-record');
    events.push(event);
  }
  return events;
}
