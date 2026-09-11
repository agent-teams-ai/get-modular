import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compileComposition as production } from "../../dist/index.js";
import { compileComposition as direct } from "../../dist-stage0/self-composition/stage0-entry.js";
import { ownDeclarations, ownProfile } from "../../dist-stage0/self-composition/own-profile.js";
import { allowlist } from "../../dist-stage0/self-composition/allowlist.js";
import { expectedDigest } from "../qualification-support/support/scale-output.mjs";

// Independent literal six-node M2 scanner graph, including its normalized order.
// The digest helper receives only this expected data, never the subject plan.
const expectedPlan = {
  kind: "get-modular.composition-plan", schemaVersion: 1,
  profileId: "get-modular/own-profile", roots: ["get-modular/compiler-facade"],
  selections: [
    { moduleId: "get-modular/canonicalization", implementationId: "get-modular/canonicalization/owned-jcs" },
    { moduleId: "get-modular/compiler-facade", implementationId: "get-modular/compiler-facade/default" },
    { moduleId: "get-modular/composition-semantics", implementationId: "get-modular/composition-semantics/default" },
    { moduleId: "get-modular/input-admission", implementationId: "get-modular/input-admission/default" },
    { moduleId: "get-modular/plan-output", implementationId: "get-modular/plan-output/default" },
    { moduleId: "get-modular/raw-scanner", implementationId: "get-modular/raw-scanner/owned-iterative" },
  ],
  bindings: [
    {
      consumerImplementationId: "get-modular/compiler-facade/default", slotId: "admission",
      providerImplementationIds: ["get-modular/input-admission/default"], capabilityId: "get-modular/admitted-input",
      compatibility: { family: "exact", familyVersion: 1, token: "get-modular/admitted-input/v1" },
    },
    {
      consumerImplementationId: "get-modular/compiler-facade/default", slotId: "output",
      providerImplementationIds: ["get-modular/plan-output/default"], capabilityId: "get-modular/plan-emission",
      compatibility: { family: "exact", familyVersion: 1, token: "get-modular/plan-emission/v1" },
    },
    {
      consumerImplementationId: "get-modular/compiler-facade/default", slotId: "semantics",
      providerImplementationIds: ["get-modular/composition-semantics/default"], capabilityId: "get-modular/semantic-analysis",
      compatibility: { family: "exact", familyVersion: 1, token: "get-modular/semantic-analysis/v1" },
    },
    {
      consumerImplementationId: "get-modular/composition-semantics/default", slotId: "canonicalizer",
      providerImplementationIds: ["get-modular/canonicalization/owned-jcs"], capabilityId: "get-modular/canonical-bytes",
      compatibility: { family: "exact", familyVersion: 1, token: "get-modular/canonical-bytes/v1" },
    },
    {
      consumerImplementationId: "get-modular/input-admission/default", slotId: "scanner",
      providerImplementationIds: ["get-modular/raw-scanner/owned-iterative"], capabilityId: "get-modular/raw-scanner",
      compatibility: { family: "exact", familyVersion: 1, token: "get-modular/raw-scanner/v1" },
    },
    {
      consumerImplementationId: "get-modular/plan-output/default", slotId: "canonicalizer",
      providerImplementationIds: ["get-modular/canonicalization/owned-jcs"], capabilityId: "get-modular/canonical-bytes",
      compatibility: { family: "exact", familyVersion: 1, token: "get-modular/canonical-bytes/v1" },
    },
  ],
  dependencyOrder: [
    "get-modular/canonicalization/owned-jcs",
    "get-modular/composition-semantics/default",
    "get-modular/plan-output/default",
    "get-modular/raw-scanner/owned-iterative",
    "get-modular/input-admission/default",
    "get-modular/compiler-facade/default",
  ],
};

for (const [name, compile] of [["production", production], ["direct", direct]]) {
  test(`${name} compiles its own six-module graph into the complete independent plan`, async () => {
    const expected = { ok: true, plan: expectedPlan, digest: expectedDigest(expectedPlan) };
    assert.deepEqual(await compile({ declarations: ownDeclarations, profile: ownProfile }), expected);
    assert.deepEqual(await compile({ declarations: [...ownDeclarations].reverse(), profile: {
      ...ownProfile, selections: [...ownProfile.selections].reverse(), bindings: [...ownProfile.bindings].reverse(),
    } }), expected);
  });
}

test("build-only own data references the real declaration handles", () => {
  assert.equal(allowlist.size, 6);
  assert.equal(ownDeclarations.length, 6);
  assert.equal(ownProfile.selections.length, 6);
  assert.equal(ownProfile.bindings.length, 6);
  assert.equal(Object.isFrozen(ownDeclarations), true);
  assert.equal(Object.isFrozen(ownProfile), true);
  assert.deepEqual([...allowlist.keys()], expectedPlan.dependencyOrder);
  for (const declaration of ownDeclarations) {
    const handle = allowlist.get(declaration.implementationId);
    assert.equal(handle.declaration, declaration);
    assert.equal(typeof handle.factory, "function");
    assert.equal(declaration.slots.every(slot => slot.cardinality.kind === "required"), true);
  }
  assert.deepEqual(allowlist.get("get-modular/input-admission/default").declaration.slots, [{
    slotId: "scanner", capabilityId: "get-modular/raw-scanner",
    compatibility: { family: "exact", familyVersion: 1, token: "get-modular/raw-scanner/v1" },
    cardinality: { kind: "required" },
  }]);
  // These data/behavior checks do not yet prove static wiring or checkpoint A.
});

test("public declaration entry does not inherit the private root port", async () => {
  for (const path of ["../../dist/index.d.ts", "../../dist-stage0/self-composition/stage0-entry.d.ts"]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /compileComposition/u);
    assert.doesNotMatch(source, /CompilerFacade|composition\/|factory|ports\.js/u);
  }
});
