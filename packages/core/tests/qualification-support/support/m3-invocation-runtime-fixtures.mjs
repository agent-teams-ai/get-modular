// Node-only producer. Transport carries closed identities, never live inputs.
import assert from 'node:assert/strict';
import { rawInvocationCaseIds } from './m2-raw-invocation-fixtures.mjs';
import {
  rawInvocationExpectedIds, rawInvocationExpectedResult,
} from './m2-raw-invocation-expectations.mjs';

export const invocationRuntimeCounts = Object.freeze({
  cases: 62, foreignRealmRequired: 3, nodeBufferRequired: 1,
});

const foreignIds = new Set([
  'foreign-null-frozen-wrapper', 'realm-array-cleared', 'realm-shared-both',
]);

export function* produceInvocationRuntimeFixtures() {
  assert.deepStrictEqual(rawInvocationCaseIds(), rawInvocationExpectedIds());
  assert.equal(rawInvocationCaseIds().length, invocationRuntimeCounts.cases);
  for (const id of rawInvocationCaseIds()) {
    const fixture = {
      id,
      recipe: { inventory: 'original62', factoryId: id },
      expected: rawInvocationExpectedResult(id),
      applicability: {
        raw: 'applicable',
        foreignRealm: foreignIds.has(id) ? 'required' : 'nonapplicable',
        nodeBuffer: id === 'dense-offset-buffer' ? 'required' : 'nonapplicable',
        resultOwnership: 'applicable',
        privateSnapshot: 'nonapplicable: public results do not expose raw copies',
      },
    };
    const portable = JSON.parse(JSON.stringify(fixture));
    assert.deepStrictEqual(portable, fixture);
    yield portable;
  }
}

// This support is source-build runtime evidence, not retained-archive or loader
// qualification. Drivers must inject genuine runtime capabilities and preserve
// archive/root-resolution custody separately. The original62 recipes all have
// failure results; successful-plan byte ownership needs the other runtime suite.
// A complete run rejects missing capabilities; there are no successful skips.
// Native inspection proves result ownership, not private raw-copy multiplicity.
