import assert from 'node:assert/strict';
import test from 'node:test';
import * as production from '../../dist/index.js';
import * as direct from '../../dist-stage0/self-composition/stage0-entry.js';
import { rawDocumentCases } from '../qualification-support/m2-candidate/raw-document-cases.mjs';

// Ordinary integration-stack subjects; this does not establish M2 completion.
// Reuse the independent baseline's complete plan and literal digest unchanged.
const baseline = rawDocumentCases().next().value;
assert.equal(baseline.caseId, 'od005.raw-document.v1/baseline');
assert.equal(baseline.expected.ok, true);
function freeze(value) {
  for (const container of containers(value)) Object.freeze(container);
  return value;
}
const expected = freeze(structuredClone(baseline.expected));
const failures = freeze({
  object: { ok: false, diagnostics: [{ code: 'schema.non-plain-value', phase: 'schema',
    path: [{ kind: 'field', value: 'profile' }], coordinate: {},
    details: { reason: 'non-plain-value' } }] },
  raw: { ok: false, diagnostics: [{ code: 'input.invalid-byte-carrier', phase: 'decode',
    path: [{ kind: 'field', value: 'profile' }], coordinate: {},
    details: { reason: 'not-uint8array' } }] },
});

function inputFor(entry) {
  const materialize = document => {
    assert.equal(document.kind, 'utf8');
    return entry === 'raw'
      ? new TextEncoder().encode(document.source) : JSON.parse(document.source);
  };
  return { declarations: baseline.inputRecipe.declarations.map(materialize),
    profile: materialize(baseline.inputRecipe.profile) };
}

function containers(value, result = new Set()) {
  if (value !== null && typeof value === 'object' && !result.has(value)) {
    result.add(value);
    for (const child of Object.values(value)) containers(child, result);
  }
  return result;
}

function disjoint(left, right) {
  for (const container of right) {
    assert.equal(left.has(container), false, 'retained containers must not alias');
  }
}

function check(result, completeExpected) {
  assert.deepEqual(result, completeExpected);
  if (result.ok) {
    for (const container of containers(result)) {
      assert.equal(Object.isFrozen(container), true);
    }
    assert.throws(() => { result.plan.roots.push('example/mutated'); }, TypeError);
    assert.throws(() => { result.digest = 'mutated'; }, TypeError);
    assert.deepEqual(result, completeExpected);
  }
}

function mutateNested(value) {
  for (const [key, child] of Object.entries(value)) {
    if (child !== null && typeof child === 'object') mutateNested(child);
    else value[key] = null;
  }
  if (Array.isArray(value)) value.length = 0;
}

function mutateInput(entry, input) {
  if (entry === 'raw') {
    for (const view of [...input.declarations, input.profile]) view?.fill(0);
  } else {
    for (const declaration of input.declarations) mutateNested(declaration);
    if (input.profile !== undefined) mutateNested(input.profile);
  }
  input.declarations.length = 0;
  input.profile = undefined;
}

for (const [name, subject] of [['production', production], ['direct', direct]]) {
  const entries = { object: subject.compileComposition, raw: subject.compileCompositionJson };

  for (const entry of ['object', 'raw']) {
    test(`${name}: ${entry} owns valid nested input before the first await`, async () => {
      const input = inputFor(entry);
      const borrowed = containers(input);
      const pending = entries[entry](input);
      assert.ok(pending instanceof Promise);
      // No await or continuation intervenes before changing caller storage.
      mutateInput(entry, input);
      const result = await pending;
      check(result, expected);
      disjoint(borrowed, containers(result));
      const recoveryInput = inputFor(entry);
      const recoveryPending = entries[entry](recoveryInput);
      mutateInput(entry, recoveryInput);
      const recovery = await recoveryPending;
      check(recovery, expected);
      disjoint(containers(result.plan), containers(recovery.plan));
      check(result, expected);
    });
  }

  for (const left of ['object', 'raw']) {
    for (const right of ['object', 'raw']) {
      for (const badFirst of [false, true]) {
        test(`${name}: concurrent ${left}/${right}, ${badFirst ? 'failure' : 'success'} first`, async () => {
          const kinds = [left, right, left, right];
          const bad = badFirst ? [true, false, false, true] : [false, true, true, false];
          const inputs = kinds.map(entry => inputFor(entry));
          const borrowed = containers(inputs);
          const expectations = kinds.map((entry, index) =>
            bad[index] ? failures[entry] : expected);
          inputs.forEach((input, index) => { if (bad[index]) input.profile = undefined; });
          // Start every ordinary call before any await; real output suspends.
          const pending = kinds.map((entry, index) => entries[entry](inputs[index]));
          for (const promise of pending) assert.ok(promise instanceof Promise);
          inputs.forEach((input, index) => mutateInput(kinds[index], input));
          const results = await Promise.all(pending);
          results.forEach((result, index) => check(result, expectations[index]));
          const successes = results.filter(result => result.ok);
          assert.equal(successes.length, 2);
          for (const success of successes) {
            disjoint(borrowed, containers(success));
          }
          disjoint(containers(successes[0].plan), containers(successes[1].plan));
          const recovery = await entries[left](inputFor(left));
          check(recovery, expected);
          for (const success of successes) {
            disjoint(containers(success.plan), containers(recovery.plan));
            check(success, expected);
          }
        });
      }
    }
  }
}
