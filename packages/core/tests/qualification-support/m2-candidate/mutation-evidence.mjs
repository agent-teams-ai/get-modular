// Finite private rejection receipts for two owned runners and their metadata tests.
// This is an in-process comparison against actual observations, not an external
// execution attestation. Retained source/collector custody remains separate.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { findRepoRoot, repoFileUrl } from '../support/load-repo-json.mjs';
import { pathToFileURL } from 'node:url';

const ROOT = 'tests/qualification/m2-candidate/';
const OWNERS = {
  'raw-invocation': 'raw-invocation-oracle.test.mjs',
  'generation-two-artifacts': 'generation-two-artifacts.test.mjs',
  'metadata-controls': 'mutation-evidence.test.mjs',
};
const ACCEPTED_PATHS = [
  'architecture/contracts/v1/composition.schema.json',
  'architecture/contracts/v1/diagnostic-catalog.json',
  'architecture/qualification/v1/diagnostic-contract.json',
  'architecture/qualification/v1/diagnostic-snapshots.json',
  'architecture/qualification/implementation-clarifications/contract.json',
  'architecture/qualification/implementation-clarifications/cases.json',
  'architecture/authority/implementation-clarifications-ledger.json',
  'docs/decisions/0020-define-diagnostic-coverage-outside-object-resource-admission.md',
  'architecture/authority/object-resource-coverage-ledger.json',
];
const RAW_CHECKS = ['wrapper-scope', 'wrapper-path', 'wrapper-facts', 'classification',
  'copy-preflight', 'getters', 'ownership', 'synchronous', 'index-bound',
  'count-byte-facts', 'count-diagnostic', 'safe-path'];
const eq = assert.deepStrictEqual;
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const read = path => readFileSync(new URL(path, pathToFileURL(findRepoRoot() + '/')));
const copy = value => JSON.parse(JSON.stringify(value));

// Traverse only the finite shape of a privately captured receipt. No candidate
// serializer, getters, toJSON hooks, or lossy normalization of submitted evidence.
function exactReceipt(actual, expected) {
  if (expected === null || typeof expected !== 'object') { eq(actual, expected); return; }
  assert(actual !== null && typeof actual === 'object');
  eq(Object.getPrototypeOf(actual), Array.isArray(expected) ? Array.prototype : Object.prototype);
  eq(Reflect.ownKeys(actual), Reflect.ownKeys(expected));
  const descriptors = Object.getOwnPropertyDescriptors(actual);
  for (const key of Reflect.ownKeys(expected)) {
    const descriptor = descriptors[key];
    assert(Object.hasOwn(descriptor, 'value'), 'receipt accessor');
    eq(descriptor.enumerable, Object.getOwnPropertyDescriptor(expected, key).enumerable);
    exactReceipt(descriptor.value, expected[key]);
  }
}

export function mutationEvidence(owner, runnerBytes, definitions) {
  assert(Object.hasOwn(OWNERS, owner));
  assert(Array.isArray(definitions) && definitions.length > 0 && definitions.length <= 128);
  const runnerPath = ROOT + OWNERS[owner];
  const helperPath = ROOT + 'mutation-evidence.mjs';
  eq(runnerBytes, read(runnerPath));
  const retained = new Map([[runnerPath, Buffer.from(runnerBytes)], [helperPath, read(helperPath)]]);
  const runnerText = runnerBytes.toString('utf8');
  eq(Buffer.from(runnerText), runnerBytes);
  const controls = owner === 'metadata-controls';
  const entries = definitions.map(definition => {
    eq(Object.keys(definition).sort(), ['mutationId', 'targetKind', 'sourcePath', 'sourceBytes',
      'baseBytes', 'change', 'caseId', 'entryPoint', 'checker', 'rejectedBy'].sort());
    const d = { ...definition };
    assert(typeof d.mutationId === 'string' && d.mutationId.length > 0);
    assert(typeof d.caseId === 'string' && d.caseId.length > 0);
    assert(['oracle-source', 'candidate-artifact', 'accepted-source-bytes'].includes(d.targetKind));
    if (d.targetKind === 'oracle-source') {
      assert(owner === 'raw-invocation' || controls);
      eq(d.sourcePath, controls ? runnerPath : ROOT + 'raw-invocation-oracle.mjs');
      assert((controls ? ['control'] : ['executeCase', 'safe-path']).includes(d.checker));
      eq(d.entryPoint, controls ? 'control' : d.checker === 'safe-path' ? 'privatePath' : 'observeRawInvocation');
      assert((controls ? ['control'] : RAW_CHECKS).includes(d.rejectedBy));
    } else {
      assert(owner === 'generation-two-artifacts' || controls);
      const candidate = d.targetKind === 'candidate-artifact';
      eq(d.checker, candidate ? 'checkCandidate' : 'buildGenerationTwo');
      eq(d.entryPoint, d.checker);
      eq(d.rejectedBy, candidate ? 'checkCandidate' : null);
      if (candidate || controls) eq(d.sourcePath, controls ? runnerPath : ROOT + 'generation-two-artifacts.mjs');
      else assert(ACCEPTED_PATHS.includes(d.sourcePath));
    }
    assert(Buffer.isBuffer(d.sourceBytes) && Buffer.isBuffer(d.baseBytes));
    if (!retained.has(d.sourcePath)) retained.set(d.sourcePath, read(d.sourcePath));
    eq(d.sourceBytes, retained.get(d.sourcePath));
    if (d.targetKind !== 'candidate-artifact') eq(d.baseBytes, d.sourceBytes);
    d.baseBytes = Buffer.from(d.baseBytes);
    const recipe = Function.prototype.toString.call(d.change);
    assert(runnerText.includes(recipe), 'recipe must be owned by exact runner bytes');
    const encoding = d.targetKind === 'candidate-artifact' ? 'sorted-key-json-utf8-safe-integer-subset' : 'exact-source-bytes';
    const identity = {
      mutationId: d.mutationId, targetKind: d.targetKind,
      source: { path: d.sourcePath, sha256: sha(d.sourceBytes) },
      base: { encoding, sha256: sha(d.baseBytes) },
      recipe: { encoding: 'closed-runner-callback-utf8', owner: runnerPath, utf8: recipe, sha256: sha(recipe) },
      checker: { path: runnerPath, entryPoint: d.checker },
      witness: { caseId: d.caseId, entryPoint: d.entryPoint,
        realm: owner === 'raw-invocation' ? 'instrumented-vm' : 'node-module' },
    };
    return { d, identity, encoding };
  });
  eq(new Set(entries.map(({ d }) => d.mutationId)).size, entries.length);
  const sealed = new Map();
  let started = 0;
  let failed = false;
  const header = {
    kind: 'get-modular.private-mutation-evidence',
    scope: controls ? 'private-metadata-integrity-controls' : owner === 'raw-invocation'
      ? 'proposed-only/raw-invocation-source-mutations' : 'proposed-only/static-artifact-mutations',
    runner: { path: runnerPath, sha256: sha(runnerBytes) },
    helper: { path: helperPath, sha256: sha(retained.get(helperPath)) },
    reproductionCommand: `node --test ${runnerPath}`,
    // Node test isolation exposes this worker process, not the parent pnpm or
    // multi-file test command. Retain only what this process actually observes.
    observedProcess: { scope: 'current-node-process', execPath: process.execPath,
      argv: [...process.argv], execArgv: [...process.execArgv],
      nodeOptions: process.env.NODE_OPTIONS ?? null },
    runtime: process.version, platform: process.platform, architecture: process.arch,
    rowEncoding: 'fixed-field-json-utf8-followed-by-one-LF-per-row',
  };
  function expectedReport() {
    assert(!failed && started === entries.length && sealed.size === entries.length, 'incomplete mutation execution');
    const rows = entries.map(({ d }) => JSON.parse(sealed.get(d.mutationId)));
    return { ...header, mutationCount: rows.length, rows,
      rowStreamSha256: sha(rows.map(value => JSON.stringify(value) + '\n').join('')) };
  }
  return {
    async run(id, execute, encodeCandidate) {
      try {
        assert(!failed && started < entries.length, 'closed mutation execution');
        const { d, identity, encoding } = entries[started];
        eq(id, d.mutationId, 'closed mutation execution order');
        started++;
        let value;
        const encode = item => {
          if (d.targetKind === 'candidate-artifact') {
            const result = encodeCandidate(item);
            assert(Buffer.isBuffer(result));
            return Buffer.from(result);
          }
          if (d.targetKind === 'oracle-source') {
            assert.equal(typeof item, 'string');
            eq(Buffer.from(item).toString('utf8'), item);
          } else assert(Buffer.isBuffer(item));
          return Buffer.from(item);
        };
        if (d.targetKind === 'candidate-artifact') {
          assert(runnerText.includes(Function.prototype.toString.call(encodeCandidate)), 'owned candidate encoder');
          value = JSON.parse(d.baseBytes.toString('utf8'));
          eq(encode(value), d.baseBytes);
          d.change(value);
        } else if (d.targetKind === 'oracle-source') {
          eq(Buffer.from(d.baseBytes.toString('utf8')), d.baseBytes);
          value = d.change(d.baseBytes.toString('utf8'));
        } else value = d.change(Buffer.from(d.baseBytes));
        const executedBytes = encode(value); // Before execution, never reconstructed later.
        assert.notDeepStrictEqual(executedBytes, d.baseBytes, 'mutation must change its target');
        let rejection;
        try { await execute(value); } catch (error) { rejection = error; }
        assert(rejection, `${id} survived`);
        const observed = { name: rejection.name, code: rejection.code ?? null, privateCheck: rejection.privateCheck ?? null };
        const fingerprint = d.targetKind === 'accepted-source-bytes';
        eq(observed, { name: fingerprint ? 'Error' : 'AssertionError',
          code: fingerprint ? null : 'ERR_ASSERTION', privateCheck: d.rejectedBy });
        assert.equal(typeof rejection.message, 'string');
        if (fingerprint) eq(rejection.message, `base-fingerprint: ${d.sourcePath}`);
        eq(encode(value), executedBytes, 'checker changed the hashed target');
        sealed.set(id, JSON.stringify({ ...identity, mutant: { encoding, sha256: sha(executedBytes) },
          rejection: { ...observed, message: fingerprint ? rejection.message : null,
            messageSha256: sha(rejection.message) } }));
        return rejection;
      } catch (error) { failed = true; throw error; }
    },
    verify(report) { exactReceipt(report, expectedReport()); },
    report() {
      for (const [path, bytes] of retained) eq(read(path), bytes, 'mutation source bytes changed');
      return copy(expectedReport());
    },
  };
}
