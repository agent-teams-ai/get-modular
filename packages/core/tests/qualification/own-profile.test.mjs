import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compileComposition as production } from "../../dist/index.js";
import { compileComposition as direct } from "../../dist-stage0/self-composition/stage0-entry.js";
import { ownDeclarations, ownProfile } from "../../dist-stage0/self-composition/own-profile.js";
import { allowlist } from "../../dist-stage0/self-composition/allowlist.js";
import { expectedDigest } from "../../../../tests/qualification/support/scale-output.mjs";

// Independent fixed five-node graph from the accepted implementation guide.
const moduleId = name => `get-modular/${name}`;
const implementation = name => `${moduleId(name)}/${name === "canonicalization" ? "owned-jcs" : "default"}`;
const binding = (consumer, slotId, provider, capability) => ({
  consumerImplementationId: implementation(consumer), slotId,
  providerImplementationIds: [implementation(provider)],
  capabilityId: moduleId(capability),
  compatibility: { family: "exact", familyVersion: 1, token: `${moduleId(capability)}/v1` },
});
const expectedPlan = {
  kind: "get-modular.composition-plan", schemaVersion: 1,
  profileId: "get-modular/own-profile", roots: [moduleId("compiler-facade")],
  selections: ["canonicalization", "compiler-facade", "composition-semantics", "input-admission", "plan-output"]
    .map(name => ({ moduleId: moduleId(name), implementationId: implementation(name) })),
  bindings: [
    binding("compiler-facade", "admission", "input-admission", "admitted-input"),
    binding("compiler-facade", "output", "plan-output", "plan-emission"),
    binding("compiler-facade", "semantics", "composition-semantics", "semantic-analysis"),
    binding("composition-semantics", "canonicalizer", "canonicalization", "canonical-bytes"),
    binding("plan-output", "canonicalizer", "canonicalization", "canonical-bytes"),
  ],
  dependencyOrder: ["canonicalization", "composition-semantics", "input-admission", "plan-output", "compiler-facade"]
    .map(implementation),
};

for (const [name, compile] of [["production", production], ["direct", direct]]) {
  test(`${name} compiles its own five-module graph into the complete independent plan`, async () => {
    const expected = { ok: true, plan: expectedPlan, digest: expectedDigest(expectedPlan) };
    assert.deepEqual(await compile({ declarations: ownDeclarations, profile: ownProfile }), expected);
    assert.deepEqual(await compile({ declarations: [...ownDeclarations].reverse(), profile: {
      ...ownProfile, selections: [...ownProfile.selections].reverse(), bindings: [...ownProfile.bindings].reverse(),
    } }), expected);
  });
}

test("build-only own data references the real declaration handles", () => {
  assert.equal(allowlist.size, 5);
  assert.equal(Object.isFrozen(ownDeclarations), true);
  assert.equal(Object.isFrozen(ownProfile), true);
  assert.deepEqual([...allowlist.keys()], expectedPlan.dependencyOrder);
  for (const declaration of ownDeclarations) {
    const handle = allowlist.get(declaration.implementationId);
    assert.equal(handle.declaration, declaration);
    assert.equal(typeof handle.factory, "function");
    assert.equal(declaration.slots.every(slot => slot.cardinality.kind === "required"), true);
  }
  // These data/behavior checks do not yet prove static wiring or checkpoint A.
});

test("public declaration entry does not inherit the private root port", async () => {
  for (const path of ["../../dist/index.d.ts", "../../dist-stage0/self-composition/stage0-entry.d.ts"]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /compileComposition/u);
    assert.doesNotMatch(source, /CompilerFacade|composition\/|factory|ports\.js/u);
  }
});
