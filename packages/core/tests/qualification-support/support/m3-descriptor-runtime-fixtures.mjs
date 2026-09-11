// Node-only preparation from independent, frozen expectations. No Core imports.
import assert from 'node:assert/strict';
import {
  BASELINE, WORLD, CASES,
} from '../m2-candidate/object-descriptor-cases.mjs';

export const descriptorRuntimeCounts = Object.freeze({
  cases: 68, foreignRealmRequired: 3,
});

export function* produceDescriptorRuntimeFixtures() {
  const ids = new Set();
  let foreignCount = 0;
  for (const row of CASES) {
    assert.equal(row.entryPoint, 'compileComposition');
    assert.equal(row.expected.scope, 'complete-compiler-result');
    assert.equal(row.recipe.worldId, WORLD.worldId);
    assert.equal(row.recipe.baselineSha256, BASELINE.sha256);
    assert.equal(BASELINE.declarations.length, 5);
    assert.ok(!ids.has(row.caseId), 'duplicate descriptor ID');
    ids.add(row.caseId);
    const foreignRealm = ['foreign', 'foreign-null', 'foreign-object']
      .includes(row.recipe.parameters.mode);
    if (foreignRealm) foreignCount += 1;
    const fixture = {
      id: row.caseId,
      category: row.recipe.factoryId,
      recipe: row.recipe,
      templates: {
        declarations: BASELINE.declarations, profile: BASELINE.profile,
        appendedDeclaration: WORLD.appendedDeclaration,
      },
      expected: row.expected.result,
      fixtureExpected: row.fixtureExpected,
      applicability: {
        object: 'applicable',
        raw: 'nonapplicable: descriptor semantics are not a byte carrier',
        foreignRealm: foreignRealm ? 'required' : 'nonapplicable',
        privateSnapshot: 'nonapplicable: public result cannot expose admission snapshots',
        resultOwnership: 'applicable',
      },
    };
    // Only inert templates, recipe parameters and expectations cross transport.
    // Never call materializeCase here or serialize its exotic object graph.
    const portable = JSON.parse(JSON.stringify(fixture));
    assert.deepStrictEqual(portable, fixture, 'lossless recipe transport');
    yield portable;
  }
  assert.equal(ids.size, descriptorRuntimeCounts.cases);
  assert.equal(foreignCount, descriptorRuntimeCounts.foreignRealmRequired);
}
