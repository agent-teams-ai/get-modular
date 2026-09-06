import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { rawDocumentCases } from '../../../../tests/qualification/m2-candidate/raw-document-cases.mjs';
import { createOwnedJcs } from '../../dist-test/features/canonicalization/owned-jcs/factory.js';
import { createOwnedRawScanner } from '../../dist-test/features/raw-scanner/owned-iterative/factory.js';
import { createInputAdmission } from '../../dist-test/features/input-admission/factory.js';
import { createCompositionSemantics } from '../../dist-test/features/composition-semantics/factory.js';
import { createPlanOutput } from '../../dist-test/features/plan-output/factory.js';
import { createCompilerFacade } from '../../dist-test/features/compiler-facade/factory.js';

// Private entry readiness, not public E2E: compileCompositionJson is absent.
// Reuse only the fixed valid fixture's exact JSON and independent expectations.
// Every compiler operation below uses actual Core factories, never an oracle.
const LABEL = 'private entry readiness (not public E2E)';
function freeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

// Sorted property-list serialization is sufficient for this fixed JSON model.
// This independent digest helper receives expected plans only. Its baseline
// result is checked against the fixture's existing fixed digest before use.
const DIGEST_KEYS = Object.freeze([
  'bindings', 'canonicalization', 'capabilityId', 'compatibility',
  'consumerImplementationId', 'dependencyOrder', 'family', 'familyVersion',
  'hashAlgorithm', 'implementationId', 'kind', 'moduleId', 'plan', 'profileId',
  'protocolVersion', 'providerImplementationIds', 'roots', 'schemaVersion',
  'selections', 'slotId', 'token',
].sort());
function expectedDigest(plan) {
  const envelope = { canonicalization: 'RFC8785', hashAlgorithm: 'SHA-256',
    kind: 'get-modular.plan-content', plan, protocolVersion: 1 };
  return 'gm-plan:v1:sha-256:' + createHash('sha256')
    .update(JSON.stringify(envelope, DIGEST_KEYS), 'utf8').digest('hex');
}
const row = freeze(rawDocumentCases().next().value);
assert.equal(row.caseId, 'od005.raw-document.v1/baseline');
assert.equal(row.inputRecipe.profile.kind, 'utf8');
const base = freeze({
  sources: {
    declarations: row.inputRecipe.declarations.map(document => {
      assert.equal(document.kind, 'utf8');
      return document.source;
    }),
    profile: row.inputRecipe.profile.source,
  },
  expected: structuredClone(row.expected),
});
assert.equal(expectedDigest(base.expected.plan), base.expected.digest);
const alternatePlan = { ...structuredClone(base.expected.plan),
  profileId: 'example/raw-invocation-alternate' };
assert.notEqual(alternatePlan.profileId, base.expected.plan.profileId);
const cases = freeze([base, {
  sources: { declarations: [...base.sources.declarations],
    profile: JSON.stringify({ ...JSON.parse(base.sources.profile),
      profileId: alternatePlan.profileId }) },
  expected: { ok: true, plan: alternatePlan, digest: expectedDigest(alternatePlan) },
}]);
const failures = freeze({
  raw: { ok: false, diagnostics: [{ code: 'input.invalid-byte-carrier', phase: 'decode',
    path: [{ kind: 'field', value: 'profile' }], coordinate: {},
    details: { reason: 'not-uint8array' } }] },
  object: { ok: false, diagnostics: [{ code: 'schema.non-plain-value', phase: 'schema',
    path: [{ kind: 'field', value: 'profile' }], coordinate: {},
    details: { reason: 'non-plain-value' } }] },
});
const lateWrapperFailure = freeze({ ok: false, diagnostics: [{
  code: 'input.invalid-byte-carrier', phase: 'decode',
  path: [{ kind: 'field', value: 'declarations' }], coordinate: {},
  details: { reason: 'not-document-list' },
}] });

function setup() {
  const probe = { opens: 0, buffers: new Set(), collectors: [] };
  const actualScanner = createOwnedRawScanner({});
  const admission = createInputAdmission({ scanner: {
    open(bytes) {
      probe.opens += 1;
      probe.buffers.add(bytes.buffer);
      return actualScanner.open(bytes);
    },
  } });
  const canonicalizer = createOwnedJcs({});
  const actualSemantics = createCompositionSemantics({ canonicalizer });
  const semantics = {
    newCollector() {
      const collector = actualSemantics.newCollector();
      probe.collectors.push(collector);
      return collector;
    },
    analyze: actualSemantics.analyze,
  };
  const output = createPlanOutput({ canonicalizer });
  // Mirror the supplied private adapter; the object facade retains actual
  // object admission. Both facades share providers to exercise call isolation.
  const rawFacade = createCompilerFacade({
    admission: { admitObjectInput: admission.admitRawInput }, semantics, output,
  });
  const objectFacade = createCompilerFacade({ admission, semantics, output });
  return { raw: rawFacade.compileComposition,
    object: objectFacade.compileComposition, probe };
}
const encode = source => new TextEncoder().encode(source);
function inputFor(entry, variant = 0) {
  const sources = cases[variant].sources;
  const materialize = entry === 'raw' ? encode : source => JSON.parse(source);
  return { declarations: sources.declarations.map(materialize),
    profile: materialize(sources.profile) };
}
function containers(value, result = new Set()) {
  if (value !== null && typeof value === 'object' && !result.has(value)) {
    result.add(value);
    for (const child of Object.values(value)) containers(child, result);
  }
  return result;
}
function check(result, expected) {
  assert.deepEqual(result, expected); // Includes every field; rejects extras.
  if (result.ok) {
    for (const value of containers(result)) assert.equal(Object.isFrozen(value), true);
  }
}
function separatePlans(left, right) {
  const previous = containers(left.plan);
  for (const value of containers(right.plan)) {
    assert.equal(previous.has(value), false, 'invocations must not share plan containers');
  }
}

for (const action of ['mutate', 'detach']) {
  test(`${LABEL}: synchronous ownership before immediate ${action}`, async () => {
    const subject = setup();
    const input = inputFor('raw');
    const views = [...input.declarations, input.profile];
    const buffers = [...new Set(views.map(view => view.buffer))];
    const pending = subject.raw(input);
    assert.ok(pending instanceof Promise);
    // No await or continuation between invocation and caller storage changes.
    if (action === 'mutate') for (const view of views) view.fill(0);
    else for (const buffer of buffers) {
      structuredClone(buffer, { transfer: [buffer] });
      assert.equal(buffer.byteLength, 0);
    }
    input.declarations.length = 0;
    input.profile = undefined;
    assert.ok(subject.probe.opens > 0, 'admission and scanning are synchronous');
    for (const buffer of buffers) assert.equal(subject.probe.buffers.has(buffer), false);
    check(await pending, cases[0].expected);
  });
}

test(`${LABEL}: foreign offset subclasses and callable wrapper never invoke hooks`, async () => {
  const subject = setup();
  const foreign = runInNewContext(`(() => {
    const counters = { calls: 0 };
    const forbidden = () => { counters.calls += 1; throw new Error('foreign hook invoked'); };
    class ForeignBytes extends Uint8Array {
      static get [Symbol.species]() { return forbidden(); }
    }
    const buffers = [];
    function wrap(payload) {
      const buffer = new ArrayBuffer(payload.length + 6);
      new Uint8Array(buffer).fill(255);
      const view = new ForeignBytes(buffer, 3, payload.length);
      view.set(payload);
      buffers.push(buffer);
      for (const key of ['buffer', 'length', 'byteLength', 'byteOffset',
        'constructor', 'slice', 'subarray', 'then', Symbol.iterator, Symbol.toStringTag]) {
        Object.defineProperty(view, key, { get: forbidden });
      }
      return view;
    }
    const declarations = [];
    for (const payload of payloads.declarations) declarations.push(wrap(payload));
    const profile = wrap(payloads.profile);
    for (const key of ['slice', 'constructor', Symbol.iterator, Symbol.toStringTag]) {
      Object.defineProperty(declarations, key, { get: forbidden });
    }
    function input() { return forbidden(); }
    Object.defineProperties(input, {
      declarations: { value: declarations }, profile: { value: profile },
      then: { get: forbidden }, ignored: { get: forbidden },
    });
    Object.defineProperty(input, Symbol.toPrimitive, { value: forbidden });
    return { input, buffers, counters };
  })()`, { payloads: inputFor('raw') });
  assert.equal(foreign.input.declarations instanceof Array, false);
  assert.equal(foreign.input.declarations[0] instanceof Uint8Array, false);
  const pending = subject.raw(foreign.input);
  assert.ok(pending instanceof Promise);
  for (const buffer of foreign.buffers) {
    structuredClone(buffer, { transfer: [buffer] });
    assert.equal(buffer.byteLength, 0);
    assert.equal(subject.probe.buffers.has(buffer), false);
  }
  assert.equal(foreign.counters.calls, 0);
  assert.ok(subject.probe.opens > 0);
  check(await pending, cases[0].expected);
  assert.equal(foreign.counters.calls, 0);
});

for (const shape of ['missing', 'accessor', 'inherited']) {
  test(`${LABEL}: late ${shape} index withholds all document derivatives`, async () => {
    const subject = setup();
    const counters = { calls: 0 };
    const input = runInNewContext(`(() => {
      const declarations = [...prefix];
      declarations.length = 5;
      const forbidden = () => { counters.calls += 1; throw new Error('index getter invoked'); };
      if (shape === 'accessor') Object.defineProperty(declarations, '4', { get: forbidden });
      if (shape === 'inherited') {
        const prototype = Object.create(Array.prototype);
        Object.defineProperty(prototype, '4', { get: forbidden });
        Object.setPrototypeOf(declarations, prototype);
      }
      return { declarations, profile };
    })()`, { shape, counters,
      prefix: [encode(base.sources.declarations[0]), new Uint8Array(1_048_577),
        undefined, encode('{')],
      profile: new Uint8Array(8_388_609) });
    const pending = subject.raw(input);
    assert.ok(pending instanceof Promise);
    assert.equal(subject.probe.opens, 0);
    assert.equal(counters.calls, 0);
    check(await pending, lateWrapperFailure);
    assert.equal(subject.probe.opens, 0);
    assert.equal(counters.calls, 0);
  });
}

test(`${LABEL}: both document byte limits reject before any real scanner opens`, async () => {
  const subject = setup();
  const pending = subject.raw({ declarations: [new Uint8Array(1_048_577)],
    profile: new Uint8Array(8_388_609) });
  assert.ok(pending instanceof Promise);
  assert.equal(subject.probe.opens, 0);
  check(await pending, { ok: false, diagnostics: [
    { code: 'input.limit-exceeded', phase: 'decode',
      path: [{ kind: 'field', value: 'declarations' }, { kind: 'index', value: 0 }],
      coordinate: {}, details: { limitName: 'declarationRawDocumentBytes',
        limit: 1_048_576, actual: 1_048_577 } },
    { code: 'input.limit-exceeded', phase: 'decode',
      path: [{ kind: 'field', value: 'profile' }], coordinate: {},
      details: { limitName: 'profileRawDocumentBytes', limit: 8_388_608, actual: 8_388_609 } },
  ] });
  assert.equal(subject.probe.opens, 0);
});

test(`${LABEL}: aggregate preflight blocks earlier eligible malformed documents`, async () => {
  const subject = setup();
  // Shared caller references still count per document occurrence. Every view
  // meets its individual byte limit; the last profile byte exceeds the batch.
  const slab = new Uint8Array(1_048_576);
  slab[0] = 123;
  const pending = subject.raw({ declarations: Array.from({ length: 16 }, () => slab),
    profile: encode('{') });
  assert.ok(pending instanceof Promise);
  assert.equal(subject.probe.opens, 0);
  check(await pending, { ok: false, diagnostics: [{
    code: 'input.limit-exceeded', phase: 'decode', path: [], coordinate: {},
    details: { limitName: 'aggregateRawBytes', limit: 16_777_216, actual: 16_777_217 },
  }] });
  assert.equal(subject.probe.opens, 0);
});

for (const [left, right] of [['raw', 'raw'], ['raw', 'object'], ['object', 'raw'], ['object', 'object']]) {
  for (const badFirst of [false, true]) {
    test(`${LABEL}: concurrent ${left}/${right}, ${badFirst ? 'failure' : 'success'} first`, async () => {
      const subject = setup();
      const entries = [left, right, left, right];
      const bad = badFirst ? [true, false, false, true] : [false, true, true, false];
      const inputs = entries.map((entry, ordinal) => {
        const input = inputFor(entry, ordinal < 2 ? 0 : 1);
        if (bad[ordinal]) input.profile = undefined;
        return input;
      });
      const expected = entries.map((entry, ordinal) => bad[ordinal]
        ? failures[entry] : cases[ordinal < 2 ? 0 : 1].expected);
      // Issue every call before awaiting any result, including real async output.
      const pending = entries.map((entry, ordinal) => subject[entry](inputs[ordinal]));
      for (const promise of pending) assert.ok(promise instanceof Promise);
      for (const input of inputs) {
        input.declarations.length = 0;
        input.profile = undefined;
      }
      assert.equal(subject.probe.collectors.length, 4);
      assert.equal(new Set(subject.probe.collectors).size, 4);
      const results = await Promise.all(pending);
      results.forEach((result, ordinal) => check(result, expected[ordinal]));
      const successes = results.filter(result => result.ok);
      assert.equal(successes.length, 2);
      assert.notEqual(successes[0].plan.profileId, successes[1].plan.profileId);
      assert.notEqual(successes[0].digest, successes[1].digest);
      separatePlans(successes[0], successes[1]);
      const recovery = await subject[left](inputFor(left));
      check(recovery, cases[0].expected);
      for (const success of successes) separatePlans(success, recovery);
      assert.equal(subject.probe.collectors.length, 5);
      assert.equal(new Set(subject.probe.collectors).size, 5);
    });
  }
}
