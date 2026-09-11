// Node-only evidence preparation. No Core subject supplies expectations.
// Five bounded P500 fixtures; no operation-counter or full runtime claim.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { findRepoRoot, repoFileUrl } from './load-repo-json.mjs';
import {
  generateDenseProfile, loadP500Recipe, meterJsonResources, observeDenseProfile,
} from './resource-profile-v2.mjs';
import {
  expectedP500Plan as independentExpectedP500Plan, expectedDigest, p500Digest,
} from './scale-output.mjs';

export const p500RuntimeCounts = Object.freeze({
  baseline: 3, missingLastBinding: 1, changedOrderedMany48: 1,
});
export const p500RuntimeFixtureCount = 5;
export const p500RuntimeParameters = Object.freeze({
  moduleCount: 500, manyWindow: 48, implementationIdPadding: 48,
  rootModuleIndex: 499,
});

const reorderings = [
  ['identity', values => [...values]],
  ['reverse', values => [...values].reverse()],
  ['rotate', values => values.length ? [...values.slice(1), values[0]] : []],
];

function prepare(id, category, input, expected, limits) {
  const fixture = { id, category, input, expected };
  assert.deepStrictEqual(JSON.parse(JSON.stringify(fixture)), fixture,
    `${id}: lossless ordinary JSON`);
  const object = meterJsonResources([...input.declarations, input.profile], limits);
  assert.equal(object.rejection, null);
  for (const name of ['jsonValueOccurrences', 'aggregateStringBytes', 'jsonDepth']) {
    assert.ok(object[name] <= limits[name], `${id}: object ${name}`);
  }
  // Measure the actual serialization, including each reordered document.
  const declarationBytes = input.declarations.map(value =>
    Buffer.byteLength(JSON.stringify(value), 'utf8'));
  const profileBytes = Buffer.byteLength(JSON.stringify(input.profile), 'utf8');
  const aggregateBytes = declarationBytes.reduce((sum, bytes) => sum + bytes, profileBytes);
  assert.ok(declarationBytes.every(bytes => bytes <= limits.declarationRawDocumentBytes));
  assert.ok(profileBytes <= limits.profileRawDocumentBytes);
  assert.ok(aggregateBytes <= limits.aggregateRawBytes);
  fixture.rawEligibility = { declarationBytes, profileBytes, aggregateBytes };
  return fixture;
}

export async function* produceP500RuntimeFixtures() {
  const recipe = await loadP500Recipe();
  for (const [name, value] of Object.entries(p500RuntimeParameters)) {
    assert.equal(recipe[name], value, `closed P500 parameter: ${name}`);
  }
  const { limits } = JSON.parse(await readFile(repoFileUrl('architecture/qualification/v1/resource-profile-v2.json'), 'utf8'));
  const baseline = generateDenseProfile(recipe);
  assert.deepEqual(observeDenseProfile(baseline, limits), recipe.expected,
    'accepted P500 input and resource observations');
  const plan = independentExpectedP500Plan();
  assert.equal(expectedDigest(plan), p500Digest);
  const success = { ok: true, plan, digest: p500Digest };
  const ids = new Set();
  const emit = (suffix, category, input, expected) => {
    const id = `p500/500-48-48-499/${suffix}`;
    assert.ok(!ids.has(id));
    ids.add(id);
    // Each yielded fixture owns its entire input and expectation.
    return prepare(id, category, structuredClone(input),
      structuredClone(expected), limits);
  };
  for (const [name, reorder] of reorderings) {
    yield emit(`baseline-${name}`, 'baseline', {
      declarations: reorder(baseline.declarations),
      profile: {
        ...baseline.profile,
        selections: reorder(baseline.profile.selections),
        bindings: reorder(baseline.profile.bindings),
        roots: reorder(baseline.profile.roots),
      },
    }, success);
  }
  const missing = generateDenseProfile(recipe);
  const lastImplementation = plan.selections[499].implementationId;
  assert.deepEqual(missing.profile.bindings.at(-1), {
    consumerImplementationId: lastImplementation, slotId: 'many',
    providerImplementationIds: plan.bindings.find(binding =>
      binding.consumerImplementationId === lastImplementation &&
      binding.slotId === 'many').providerImplementationIds,
  });
  missing.profile.bindings.pop();
  yield emit('missing-last-binding', 'missingLastBinding', missing, {
    ok: false, diagnostics: [{
      code: 'binding.missing', phase: 'binding', path: [],
      coordinate: { implementationId: lastImplementation, slotId: 'many' },
      details: { reason: 'missing' },
    }],
  });
  const changed = generateDenseProfile(recipe);
  const ordered = independentExpectedP500Plan();
  const consumer = ordered.selections[48].implementationId;
  for (const bindings of [changed.profile.bindings, ordered.bindings]) {
    const row = bindings.find(binding =>
      binding.consumerImplementationId === consumer && binding.slotId === 'many');
    assert.equal(row.providerImplementationIds.length, 48);
    row.providerImplementationIds.reverse();
  }
  const digest = expectedDigest(ordered);
  assert.notEqual(digest, p500Digest);
  yield emit('changed-ordered-many48', 'changedOrderedMany48', changed,
    { ok: true, plan: ordered, digest });
  assert.equal(ids.size, p500RuntimeFixtureCount);
}
