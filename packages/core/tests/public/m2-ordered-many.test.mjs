import assert from 'node:assert/strict';
import test from 'node:test';
import * as production from '../../dist/index.js';
import * as direct from '../../dist-stage0/self-composition/stage0-entry.js';
import { materializeDuplicateRecordExtendedOverlap } from '../qualification-support/m2-candidate/duplicate-record-extended-overlaps.mjs';
import { expectedDigest } from '../qualification-support/support/scale-output.mjs';

// Independently specified complete plans for the original relation-only case.
// These literal results predate Core replay. Neither candidate output nor input
// traversal supplies the expected plans. Original frozen relation stays intact.
const members = [
  {
    "member": "forward",
    "expected": {
      "ok": true,
      "plan": {
        "kind": "get-modular.composition-plan",
        "schemaVersion": 1,
        "profileId": "example/extended-overlap",
        "roots": [
          "example/c"
        ],
        "selections": [
          {
            "moduleId": "example/c",
            "implementationId": "example/c/default"
          },
          {
            "moduleId": "example/p",
            "implementationId": "example/p/default"
          },
          {
            "moduleId": "example/q",
            "implementationId": "example/q/default"
          }
        ],
        "bindings": [
          {
            "consumerImplementationId": "example/c/default",
            "slotId": "dependency",
            "capabilityId": "example/link",
            "compatibility": {
              "family": "exact",
              "familyVersion": 1,
              "token": "example/link"
            },
            "providerImplementationIds": [
              "example/p/default",
              "example/q/default"
            ]
          }
        ],
        "dependencyOrder": [
          "example/p/default",
          "example/q/default",
          "example/c/default"
        ]
      },
      "digest": "gm-plan:v1:sha-256:4776af9296c66f725f03510faa8552446c0c2b893194f20619808fc5f42d8a25"
    }
  },
  {
    "member": "reverse",
    "expected": {
      "ok": true,
      "plan": {
        "kind": "get-modular.composition-plan",
        "schemaVersion": 1,
        "profileId": "example/extended-overlap",
        "roots": [
          "example/c"
        ],
        "selections": [
          {
            "moduleId": "example/c",
            "implementationId": "example/c/default"
          },
          {
            "moduleId": "example/p",
            "implementationId": "example/p/default"
          },
          {
            "moduleId": "example/q",
            "implementationId": "example/q/default"
          }
        ],
        "bindings": [
          {
            "consumerImplementationId": "example/c/default",
            "slotId": "dependency",
            "capabilityId": "example/link",
            "compatibility": {
              "family": "exact",
              "familyVersion": 1,
              "token": "example/link"
            },
            "providerImplementationIds": [
              "example/q/default",
              "example/p/default"
            ]
          }
        ],
        "dependencyOrder": [
          "example/p/default",
          "example/q/default",
          "example/c/default"
        ]
      },
      "digest": "gm-plan:v1:sha-256:9b48afb145d97ed61f45994d5cebf3d338fb7e924ddb747a19de63150254cd70"
    }
  }
];
const vectorId = 'od006.extended-overlap.v1/ordered-many-reversal';

test('ordered-many independent complete expectations retain the original relation', () => {
  const { expectedRelation } = materializeDuplicateRecordExtendedOverlap(vectorId);
  const [forward, reverse] = members.map(row => row.expected);
  for (const { expected } of members) assert.equal(expectedDigest(expected.plan), expected.digest);
  assert.deepEqual(forward.plan.bindings[0].providerImplementationIds, expectedRelation.forwardPlanProviders);
  assert.deepEqual(reverse.plan.bindings[0].providerImplementationIds, expectedRelation.reversePlanProviders);
  assert.deepEqual(forward.plan.dependencyOrder, reverse.plan.dependencyOrder);
  assert.notDeepEqual(forward.plan, reverse.plan);
  assert.notEqual(forward.digest, reverse.digest);
});

for (const [name, subject] of [['production', production], ['direct', direct]]) {
  for (const mode of ['object', 'raw']) {
    test(`${name}/${mode}: ordered-many complete results and digest`, async () => {
      const { inputs } = materializeDuplicateRecordExtendedOverlap(vectorId);
      for (const { member, expected } of members) {
        const input = inputs[member];
        const encode = value => new TextEncoder().encode(JSON.stringify(value));
        const result = mode === 'object'
          ? await subject.compileComposition(input)
          : await subject.compileCompositionJson({
            declarations: input.declarations.map(encode), profile: encode(input.profile),
          });
        assert.deepEqual(result, expected, member);
      }
    });
  }
}
