// Development-only, proposed ADR-0013 witnesses; Node oracle scope only.
// No Core import, compiler fixture, subprocess, environment-selected cases or writes.
// The final diagnostic contains the complete receipt for the command owner to retain.
// Its verifier binds this process's executions; it supplies no external attestation.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { release, version } from 'node:os';
import { Script } from 'node:vm';
import test from 'node:test';
import { classifyByteCarrier, snapshotDeclarationCarrier } from './raw-carrier-oracle.mjs';
import { meterJsonResources } from '../support/resource-profile-v2.mjs';

const BASE_SOURCE = 'bef314106b341d659f58f5934b840e53277c997e';
const RUNNER_PATH = 'tests/qualification/m2-candidate/boundary-source-mutations.test.mjs';
const TEST_NAME = 'seven closed proposed ADR13 boundary source mutations';
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const clone = value => JSON.parse(JSON.stringify(value));
const COPY = '  const bytes = new OwnedUint8Array(value);';
const CLOSED_IDS = Object.freeze([
  'adr13.whole-backing-buffer-copy', 'adr13.accept-shared-storage',
  'adr13.own-slice-hook', 'adr13.iterator-hook', 'adr13.species-hook',
  'adr13.deduplicate-dag-references', 'adr13.missed-object-cycle',
]);
const SUBJECTS = [
  { key: 'carrier', path: 'tests/qualification/m2-candidate/raw-carrier-oracle.mjs',
    relative: './raw-carrier-oracle.mjs',
    sha256: 'sha256:66ceef427f7b99446e78081b910e2f77a117c0b8f3679350bd2cff4c9237e84c',
    imports: ['import { readFileSync } from "node:fs";'], metaOccurrences: 1,
    declarations: ['const declarationByteLimit', 'function classifyByteCarrier',
      'function snapshotDeclarationCarrier'],
    entryPoints: ['classifyByteCarrier', 'snapshotDeclarationCarrier'],
    direct: { classifyByteCarrier, snapshotDeclarationCarrier } },
  { key: 'meter', path: 'tests/qualification/support/resource-profile-v2.mjs',
    relative: '../support/resource-profile-v2.mjs',
    sha256: 'sha256:d9bc6451e98d7561c1a37cc7f0e41713c5e6b6eba9c914dbae2037e8ccd2860f',
    imports: ['import assert from "node:assert/strict";',
      'import { createHash } from "node:crypto";',
      'import { readFile } from "node:fs/promises";'], metaOccurrences: 2,
    declarations: ['function meterJsonResources', 'function meterRawResources',
      'async function loadP500Recipe', 'function generateDenseProfile',
      'function independentlyGenerateDenseProfile', 'function meterCompositionResources',
      'function observeDenseProfile', 'async function qualifyResourceProfileV2'],
    entryPoints: ['meterJsonResources'], direct: { meterJsonResources } },
];
const U8 = Uint8Array;
const TA = Object.getPrototypeOf(U8.prototype);
const getter = name => Object.getOwnPropertyDescriptor(TA, name).get;
const bufferOf = getter('buffer'), lengthOf = getter('length'), offsetOf = getter('byteOffset');
const bufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get;
const resizableOf = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable').get;
const fill = TA.fill;

// Complete independent literals; none are obtained from either subject.
const ZERO_HOOKS = { sliceGets: 0, sliceCalls: 0, iteratorGets: 0, iteratorCalls: 0,
  constructorGets: 0, speciesGets: 0, speciesConstructs: 0 };
const GOOD = {
  classification: { visibleLength: 2 },
  snapshot: { ok: true, bytes: [1, 2], copiedBytes: 2 },
  owned: { localUint8Array: true, aliasesInput: false, byteOffset: 0,
    backingBytes: 2, resizable: false, bytesAfterInputMutation: [1, 2] },
  hooks: ZERO_HOOKS,
};
const SHARED_REJECTED = {
  classification: { reason: 'shared-storage' },
  snapshot: { ok: false, carrierReason: 'shared-storage', copiedBytes: 0 },
  owned: null, hooks: ZERO_HOOKS,
};
const DAG = { jsonValueOccurrences: 5, aggregateStringBytes: 2, jsonDepth: 2, rejection: null };
const CYCLE = { jsonValueOccurrences: 2, aggregateStringBytes: 0, jsonDepth: 1,
  rejection: 'cycle-back-reference' };
const REJECTION = { name: 'AssertionError', code: 'ERR_ASSERTION',
  operator: 'deepStrictEqual', check: 'complete-observation' };

function makeCarrier(kind) {
  assert.ok(['offset', 'shared', 'slice', 'iterator', 'species'].includes(kind));
  const hooks = { ...ZERO_HOOKS };
  const value = kind === 'offset' ? new U8(new U8([9, 1, 2, 8]).buffer, 1, 2)
    : kind === 'shared' ? new U8(new SharedArrayBuffer(2)) : new U8([1, 2]);
  if (kind === 'shared') value.set([1, 2]);
  if (kind === 'slice') Object.defineProperty(value, 'slice', {
    get() {
      hooks.sliceGets += 1;
      return function ownSlice() { hooks.sliceCalls += 1; return new U8([1, 2]); };
    },
  });
  if (kind === 'iterator') Object.defineProperty(value, Symbol.iterator, {
    get() {
      hooks.iteratorGets += 1;
      return function* ownIterator() { hooks.iteratorCalls += 1; yield 1; yield 2; };
    },
  });
  if (kind === 'species') {
    const constructor = {};
    Object.defineProperty(constructor, Symbol.species, {
      get() {
        hooks.speciesGets += 1;
        return function Species(length) { hooks.speciesConstructs += 1; return new U8(length); };
      },
    });
    Object.defineProperty(value, 'constructor', {
      get() { hooks.constructorGets += 1; return constructor; },
    });
  }
  return { value, hooks };
}
function makeGraph(kind) {
  if (kind === 'dag') { const shared = { a: null }; return [shared, shared]; }
  assert.equal(kind, 'cycle');
  const self = []; self.push(self); return self;
}
function byteValues(value) {
  return Array.from({ length: lengthOf.call(value) }, (_, index) => value[index]);
}
function observe(spec, subject) {
  // Every call constructs a fresh fixture, including direct and adapted baselines.
  if (spec.subject === 'meter') return subject.meterJsonResources([makeGraph(spec.fixture)],
    { jsonValueOccurrences: 100, aggregateStringBytes: 100, jsonDepth: 32 });
  const { value, hooks } = makeCarrier(spec.fixture);
  const classification = subject.classifyByteCarrier(value);
  const result = subject.snapshotDeclarationCarrier(value);
  const snapshot = result.ok ? { ...result, bytes: byteValues(result.bytes) } : { ...result };
  let owned = null;
  if (result.ok) {
    const buffer = bufferOf.call(result.bytes);
    owned = { localUint8Array: Object.getPrototypeOf(result.bytes) === U8.prototype,
      aliasesInput: buffer === bufferOf.call(value), byteOffset: offsetOf.call(result.bytes),
      backingBytes: bufferLength.call(buffer), resizable: resizableOf.call(buffer),
      bytesAfterInputMutation: null };
    fill.call(value, 77);
    owned.bytesAfterInputMutation = byteValues(result.bytes);
  }
  return { classification, snapshot, owned, hooks: { ...hooks } };
}

const MUTATIONS = [
  { id: 'adr13.whole-backing-buffer-copy', subject: 'carrier', fixture: 'offset',
    before: COPY, after: '  const bytes = new OwnedUint8Array(new OwnedUint8Array(bufferOf.call(value)));',
    expected: GOOD, mutantExpected: { ...GOOD,
      snapshot: { ok: true, bytes: [9, 1, 2, 8], copiedBytes: 2 },
      owned: { ...GOOD.owned, backingBytes: 4, bytesAfterInputMutation: [9, 1, 2, 8] } } },
  { id: 'adr13.accept-shared-storage', subject: 'carrier', fixture: 'shared',
    before: '  try { sharedProbe.call(buffer); } catch { return { reason: "shared-storage" }; }',
    after: '  void buffer; // mutant: bypass shared-storage rejection',
    expected: SHARED_REJECTED, mutantExpected: GOOD },
  { id: 'adr13.own-slice-hook', subject: 'carrier', fixture: 'slice',
    before: COPY, after: '  const bytes = value.slice();', expected: GOOD,
    mutantExpected: { ...GOOD, hooks: { ...ZERO_HOOKS, sliceGets: 1, sliceCalls: 1 } } },
  { id: 'adr13.iterator-hook', subject: 'carrier', fixture: 'iterator',
    before: COPY, after: '  const bytes = new OwnedUint8Array([...value]);', expected: GOOD,
    mutantExpected: { ...GOOD, hooks: { ...ZERO_HOOKS, iteratorGets: 1, iteratorCalls: 1 } } },
  { id: 'adr13.species-hook', subject: 'carrier', fixture: 'species',
    before: COPY, after: '  const bytes = capturedSlice.call(value);', expected: GOOD,
    mutantExpected: { ...GOOD, hooks: { ...ZERO_HOOKS,
      constructorGets: 1, speciesGets: 1, speciesConstructs: 1 } } },
  { id: 'adr13.deduplicate-dag-references', subject: 'meter', fixture: 'dag',
    before: '      active.delete(frame.value);',
    after: '      /* mutant: retain completed nodes in the active set */',
    expected: DAG, mutantExpected: { jsonValueOccurrences: 4, aggregateStringBytes: 1,
      jsonDepth: 2, rejection: 'cycle-back-reference' } },
  { id: 'adr13.missed-object-cycle', subject: 'meter', fixture: 'cycle',
    before: '      reject("cycle-back-reference");',
    after: '      /* mutant: omit rejection; the following continue still terminates traversal */',
    expected: CYCLE, mutantExpected: { jsonValueOccurrences: 2, aggregateStringBytes: 0,
      jsonDepth: 1, rejection: null } },
];
function replaceOnce(source, before, after) {
  assert.notEqual(before, '');
  assert.notEqual(before, after);
  assert.equal(source.split(before).length, 2, 'exactly one source anchor required');
  return source.replace(before, () => after);
}
function identity(path, bytes) {
  const sourceUtf8 = bytes.toString('utf8');
  assert.equal(Buffer.from(sourceUtf8, 'utf8').equals(bytes), true);
  return { path, sha256: sha(bytes), sourceUtf8 };
}
function prepareWrapper(source, subject) {
  let body = source;
  const steps = [];
  const adapt = (before, after) => {
    body = replaceOnce(body, before, after);
    steps.push({ before, after, occurrences: 1 });
  };
  for (const line of subject.imports) adapt(line, '');
  for (const declaration of subject.declarations) adapt(`export ${declaration}`, declaration);
  assert.equal(body.split('import.meta.url').length - 1, subject.metaOccurrences);
  body = body.split('import.meta.url').join('moduleUrl');
  steps.push({ before: 'import.meta.url', after: 'moduleUrl', occurrences: subject.metaOccurrences });
  // The species mutant uses this adapter-local intrinsic capture. Its original
  // mutant module bytes are not claimed to execute without this recorded adapter.
  const sourceUtf8 = `(function boundaryOracleAdapter(readFileSync, readFile, assert, createHash, moduleUrl) {\n`
    + `"use strict";\nconst capturedSlice = Object.getPrototypeOf(Uint8Array.prototype).slice;\n`
    + `${body}\nreturn { ${subject.entryPoints.join(', ')} };\n})`;
  return { kind: 'adapted-whole-module/host-realm', sourceUtf8, sha256: sha(sourceUtf8),
    filename: `${RUNNER_PATH}:${subject.key}-adapter`,
    adapter: { steps, bindings: { readFileSync: 'node:fs#readFileSync',
      readFile: 'node:fs/promises#readFile', assert: 'node:assert/strict#default',
      createHash: 'node:crypto#createHash', moduleUrl: new URL(subject.relative, import.meta.url).href } } };
}
function executeWrapper(wrapper) {
  assert.equal(sha(wrapper.sourceUtf8), wrapper.sha256);
  // These exact script bytes were hashed before compilation and invocation.
  const factory = new Script(wrapper.sourceUtf8, { filename: wrapper.filename }).runInThisContext();
  return factory(readFileSync, readFile, assert, createHash, wrapper.adapter.bindings.moduleUrl);
}
function assertCompleteObservation(actual, expected) {
  assert.deepEqual(actual, expected, 'complete independent boundary observation');
}
function intendedRejection(actual, expected) {
  let rejection = null;
  // Evaluation and fixture invocation occur outside this catch. Crashes cannot kill a mutant.
  try { assertCompleteObservation(actual, expected); } catch (error) {
    assert.equal(error instanceof assert.AssertionError, true);
    assert.equal(error.actual, actual);
    assert.equal(error.expected, expected);
    rejection = { name: error.name, code: error.code, operator: error.operator,
      check: 'complete-observation' };
  }
  assert.deepEqual(rejection, REJECTION);
  return rejection;
}

test(TEST_NAME, t => {
  assert.deepEqual(MUTATIONS.map(row => row.id), CLOSED_IDS);
  assert.equal(new Set(CLOSED_IDS).size, 7);
  const sources = new Map(SUBJECTS.map(subject => {
    const record = identity(subject.path, readFileSync(new URL(subject.relative, import.meta.url)));
    assert.equal(record.sha256, subject.sha256, subject.path);
    return [subject.key, record];
  }));
  const profile = identity('architecture/qualification/v1/resource-profile-v2.json',
    readFileSync(new URL('../../../architecture/qualification/v1/resource-profile-v2.json', import.meta.url)));
  assert.equal(profile.sha256, 'sha256:9cc605e8a5b6b9553c4c12c1355eaf033daae8b7ecf000f7a159d88262c0674c');
  const runner = identity(RUNNER_PATH, readFileSync(new URL(import.meta.url)));
  const witnessSource = [makeCarrier, makeGraph, byteValues, observe].map(String).join('\n\n');
  const checkerSource = [assertCompleteObservation, intendedRejection].map(String).join('\n\n');
  const header = {
    kind: 'get-modular.proposed-boundary-source-mutations/v1',
    scope: 'proposed-only/node-oracle', baseSource: BASE_SOURCE,
    sourceIdentityScope: 'supplied-base-reference-and-pinned-file-bytes',
    compilerExecuted: false, m2Acceptance: 'not-claimed', attestation: 'process-local-only',
    runner: { ...runner, id: 'boundary-source-mutations', engine: 'node:test', testName: TEST_NAME },
    checker: { sourceUtf8: checkerSource, sha256: sha(checkerSource), runnerSha256: runner.sha256 },
    subjects: [...sources.values()], dependencies: [profile],
    runtime: { version: process.version, versions: { ...process.versions }, platform: process.platform,
      architecture: process.arch, operatingSystemRelease: release(), operatingSystemVersion: version(),
      realms: ['node-esm', 'vm-script-in-current-node-realm'] },
    observedCurrentNodeProcess: { executable: process.execPath, argv: [...process.argv],
      execArgv: [...process.execArgv], NODE_OPTIONS: process.env.NODE_OPTIONS ?? null },
    reproduction: { executable: 'node', argv: ['--test', RUNNER_PATH], NODE_OPTIONS: null },
  };
  const completed = [], metadataNegatives = [], executed = new Set();
  const seal = payload => ({ payload, sha256: sha(JSON.stringify(payload)) });
  function payload() {
    // Completion is private execution state, never a receipt-supplied boolean.
    assert.deepEqual(completed.map(row => row.mutationId), CLOSED_IDS);
    assert.deepEqual([...executed], CLOSED_IDS);
    return { ...clone(header), rows: clone(completed), metadataNegatives: clone(metadataNegatives) };
  }
  function verify(receipt) {
    assert.deepEqual(Object.keys(receipt).sort(), ['payload', 'sha256']);
    assert.equal(receipt.sha256, sha(JSON.stringify(receipt.payload)));
    assert.deepEqual(receipt.payload, payload(), 'closed process-local execution ledger');
  }
  function rejectMetadata(id, candidate) {
    candidate.sha256 = sha(JSON.stringify(candidate.payload));
    assert.equal(candidate.sha256, sha(JSON.stringify(candidate.payload)));
    assert.throws(() => verify(candidate), { code: 'ERR_ASSERTION' });
    metadataNegatives.push({ id, attackerRehashed: true, rejectedBy: 'closed-process-local-execution-ledger' });
  }
  rejectMetadata('unexecuted-with-forged-completion', seal({ ...clone(header),
    rows: MUTATIONS.map(row => ({ mutationId: row.id, executed: true })), metadataNegatives: [] }));

  for (const spec of MUTATIONS) {
    const subject = SUBJECTS.find(candidate => candidate.key === spec.subject);
    assert.ok(subject);
    const source = sources.get(spec.subject);
    const mutantSource = replaceOnce(source.sourceUtf8, spec.before, spec.after);
    const mutantSha256 = sha(mutantSource);
    const baselineWrapper = prepareWrapper(source.sourceUtf8, subject);
    const mutantWrapper = prepareWrapper(mutantSource, subject);
    // All source/wrapper hashes above precede any execution for this row.
    const actual = observe(spec, subject.direct);
    assertCompleteObservation(actual, spec.expected);
    const adaptedActual = observe(spec, executeWrapper(baselineWrapper));
    assertCompleteObservation(adaptedActual, spec.expected);
    const mutantActual = observe(spec, executeWrapper(mutantWrapper));
    const rejection = intendedRejection(mutantActual, spec.expected);
    assertCompleteObservation(mutantActual, spec.mutantExpected);
    assert.equal(executed.has(spec.id), false);
    completed.push(clone({ mutationId: spec.id, executed: true,
      source: { path: source.path, sha256: source.sha256 }, entryPoints: subject.entryPoints,
      transformation: { kind: 'exact-once-replacement', occurrences: 1,
        before: spec.before, after: spec.after },
      witness: { id: `${spec.id}/fixed-witness`, fixture: spec.fixture,
        sourceUtf8: witnessSource, sha256: sha(witnessSource), runnerSha256: runner.sha256,
        freshFixturePerInvocation: true },
      baseline: { execution: 'direct-unmodified-esm-and-adapted-unmodified-source',
        expected: spec.expected, actual, adaptedActual, wrapper: baselineWrapper },
      mutant: { sourceUtf8: mutantSource, sha256: mutantSha256, wrapper: mutantWrapper,
        expected: spec.mutantExpected, actual: mutantActual, rejection },
    }));
    executed.add(spec.id);
  }

  const corruptions = [
    ['missing-row', p => { p.rows.pop(); }],
    ['duplicate-row', p => { p.rows[1] = clone(p.rows[0]); }],
    ['reordered-rows', p => { [p.rows[0], p.rows[1]] = [p.rows[1], p.rows[0]]; }],
    ['substituted-id', p => { p.rows[0].mutationId = 'adr13.unlisted-mutation'; }],
    ['unexecuted-row', p => { p.rows[0].executed = false; }],
    ['extra-row', p => { p.rows.push(clone(p.rows[0])); }],
    ['substituted-source', p => { p.rows[0].source = clone(p.rows[5].source); }],
    ['substituted-transformation', p => { p.rows[0].transformation.after = p.rows[0].transformation.before; }],
    ['substituted-mutant-bytes', p => {
      p.rows[0].mutant.sourceUtf8 += '\n';
      p.rows[0].mutant.sha256 = sha(p.rows[0].mutant.sourceUtf8);
    }],
    ['substituted-wrapper-bytes', p => {
      p.rows[0].mutant.wrapper.sourceUtf8 += '\n';
      p.rows[0].mutant.wrapper.sha256 = sha(p.rows[0].mutant.wrapper.sourceUtf8);
    }],
    ['substituted-expectation', p => { p.rows[5].baseline.expected.jsonValueOccurrences = 4; }],
    ['substituted-observation', p => { p.rows[6].mutant.actual.rejection = 'cycle-back-reference'; }],
    ['substituted-witness', p => { p.rows[0].witness = clone(p.rows[1].witness); }],
    ['extra-field', p => { p.externalAttestation = true; }],
  ];
  for (const [id, corrupt] of corruptions) {
    const candidate = seal(payload());
    verify(candidate);
    corrupt(candidate.payload);
    rejectMetadata(id, candidate);
  }
  assert.equal(metadataNegatives.length, 15);
  const receipt = seal(payload());
  verify(receipt);
  // Only this final emission publishes a receipt, after all seven executions and controls.
  t.diagnostic(JSON.stringify(receipt));
});
