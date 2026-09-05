import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import canonicalizeOracle from "canonicalize";
import * as direct from "../../dist-stage0/self-composition/stage0-entry.js";
import * as variant from "../../dist-seed/self-composition/stage0-entry.variant.js";
import { ownDeclarations, ownProfile } from "../../dist-stage0/self-composition/own-profile.js";
import { ownDeclarations as variantDeclarations, ownProfile as variantProfile } from "../../dist-seed/self-composition/own-profile.variant.js";
import { createOwnedJcs } from "../../dist-seed/src/features/canonicalization/owned-jcs/factory.js";
import { createCompositionSemantics } from "../../dist-seed/src/features/composition-semantics/factory.js";
import { createWitnessVariant } from "../../dist-seed/tests/features/canonicalization/witness-variant/factory.js";

const coreRoot = fileURLToPath(new URL("../../", import.meta.url));
const prefix = "get-modular/witness-variant/v1\0";
const moduleId = "example/root";
const implementationId = "example/root/default";
const fixedInput = {
  declarations: [{ kind: "get-modular.module-declaration", schemaVersion: 1, moduleId, implementationId,
    owner: { authority: "example", path: ["root"] }, provides: [], slots: [] }],
  profile: { kind: "get-modular.composition-profile", schemaVersion: 1, profileId: "example/profile",
    roots: [moduleId], selections: [{ moduleId, implementationId }], bindings: [] },
};
const fixedPlan = { kind: "get-modular.composition-plan", schemaVersion: 1, profileId: "example/profile",
  roots: [moduleId], selections: [{ moduleId, implementationId }], bindings: [], dependencyOrder: [implementationId] };
function digest(plan, variantEncoding = false) {
  const bytes = canonicalizeOracle({ canonicalization: "RFC8785", hashAlgorithm: "SHA-256",
    kind: "get-modular.plan-content", plan, protocolVersion: 1 });
  return `gm-plan:v1:sha-256:${createHash("sha256").update(variantEncoding ? prefix : "").update(bytes).digest("hex")}`;
}

test("one selected canonicalizer and its two bindings are the only own-profile replacements", async () => {
  const ownedId = "get-modular/canonicalization/owned-jcs";
  const variantId = "get-modular/canonicalization/witness-variant";
  const replace = value => value === ownedId ? variantId : value;
  assert.deepEqual(variantProfile, {
    ...ownProfile,
    selections: ownProfile.selections.map(value => ({ ...value, implementationId: replace(value.implementationId) })),
    bindings: ownProfile.bindings.map(value => ({ ...value, providerImplementationIds: value.providerImplementationIds.map(replace) })),
  });
  assert.equal(variantProfile.bindings.filter(value => value.providerImplementationIds.includes(variantId)).length, 2);
  assert.deepEqual(variantDeclarations.slice(0, 5), ownDeclarations);
  assert.equal(variantDeclarations.length, 6);
  assert.equal(variantDeclarations[5].implementationId, variantId);
  const base = await direct.compileComposition({ declarations: ownDeclarations, profile: ownProfile });
  assert.equal(base.ok, true);
  const expectedPlan = {
    ...base.plan,
    selections: base.plan.selections.map(value => ({ ...value, implementationId: replace(value.implementationId) })),
    bindings: base.plan.bindings.map(value => ({ ...value, providerImplementationIds: value.providerImplementationIds.map(replace) })),
    dependencyOrder: base.plan.dependencyOrder.map(replace),
  };
  // The base complete plan has a separate independent fixed oracle in own-profile.test.
  for (const [compile, changedBytes] of [[direct.compileComposition, false], [variant.compileComposition, true]]) {
    assert.deepEqual(await compile({ declarations: variantDeclarations, profile: variantProfile }), {
      ok: true, plan: expectedPlan, digest: digest(expectedPlan, changedBytes),
    });
  }
});

test("direct replacement changes the fixed input digest and rebinding restores it", async () => {
  assert.deepEqual(Object.keys(variant).sort(), Object.keys(direct).sort());
  const normal = { ok: true, plan: fixedPlan, digest: digest(fixedPlan) };
  const replacement = { ok: true, plan: fixedPlan, digest: digest(fixedPlan, true) };
  assert.notEqual(normal.digest, replacement.digest);
  assert.deepEqual(await direct.compileComposition(structuredClone(fixedInput)), normal);
  assert.deepEqual(await variant.compileComposition(structuredClone(fixedInput)), replacement);
  assert.deepEqual(await direct.compileComposition(structuredClone(fixedInput)), normal);
});

const snapshots = JSON.parse(await readFile(new URL(
  "../../../../architecture/qualification/v1/diagnostic-snapshots.json", import.meta.url), "utf8"));
const witness = snapshots.orderingCases.find(value => value.name === "details-use-rfc8785-key-order-and-utf8-bytes");
const byName = new Map(snapshots.snapshots.map(value => [value.name, value.diagnostic]));
const operands = new Map(witness.operands.map(value => [value.name, {
  ...structuredClone(byName.get(value.snapshot)), ...structuredClone(value.override ?? {}),
}]));
const expectedOwned = witness.expected.map(name => operands.get(name));
const expectedVariant = [...expectedOwned].reverse();
assert.equal(expectedOwned.length, 2);
assert.deepEqual(expectedOwned.map(value => value.details.actual), [10, 2]);
function collect(factory, canonicalizer, values) {
  const collector = factory({ canonicalizer }).newCollector();
  for (const value of values) collector.addUnique(value);
  return collector.finish();
}
function assertReturnedBytesUsed(factory, canonicalizer) {
  for (const values of [expectedOwned, expectedVariant]) {
    assert.deepEqual(collect(factory, canonicalizer, values), expectedVariant);
  }
}

test("the actual semantics factory consumes variant detail bytes and preserves the SCC exception", () => {
  assertReturnedBytesUsed(createCompositionSemantics, createWitnessVariant({}));
  assert.deepEqual(collect(createCompositionSemantics, createOwnedJcs({}), expectedVariant), expectedOwned);
  const cycle = component => ({ code: "graph.cycle", phase: "graph", coordinate: {}, path: [], details: { component } });
  const cycles = [cycle(["example/a"]), cycle(["example/z"])];
  for (const canonicalizer of [createOwnedJcs({}), createWitnessVariant({})]) {
    assert.deepEqual(collect(createCompositionSemantics, canonicalizer, [...cycles].reverse()), cycles);
  }
  const failure = new Error("controlled private provider failure");
  assert.throws(() => collect(createCompositionSemantics, { canonicalize() { throw failure; } }, expectedOwned),
    error => error === failure);
});

for (const mode of ["ignore-dependency", "discard-returned-bytes"]) {
  test(`the dependency regression kills the ${mode} mutant while output still uses its provider`, async t => {
    const sandbox = await mkdtemp(join(tmpdir(), "gm-diagnostic-witness-"));
    t.after(() => rm(sandbox, { recursive: true, force: true }));
    await cp(join(coreRoot, "dist-seed"), sandbox, { recursive: true });
    await writeFile(join(sandbox, "package.json"), '{"type":"module"}\n');
    const factoryPath = join(sandbox, "src/features/composition-semantics/factory.js");
    const original = await readFile(factoryPath, "utf8");
    const needle = "details => canonicalizer.canonicalize(details)";
    assert.equal(original.split(needle).length, 2, "mutates exactly the actual compiled consumer seam");
    const replacement = mode === "ignore-dependency" ? "details => hardcoded.canonicalize(details)"
      : "details => { canonicalizer.canonicalize(details); return hardcoded.canonicalize(details); }";
    await writeFile(factoryPath, 'import { createOwnedJcs } from "../canonicalization/owned-jcs/factory.js";\n'
      + "const hardcoded = createOwnedJcs({});\n" + original.replace(needle, replacement));
    const mutated = await import(pathToFileURL(factoryPath).href);
    let calls = 0;
    const provider = createWitnessVariant({});
    const counted = { canonicalize(value) { calls += 1; return provider.canonicalize(value); } };
    assert.throws(() => assertReturnedBytesUsed(mutated.createCompositionSemantics, counted), {
      code: "ERR_ASSERTION", operator: "deepStrictEqual",
    });
    assert.equal(calls > 0, mode === "discard-returned-bytes");
    assert.deepEqual(collect(mutated.createCompositionSemantics, counted, expectedVariant), expectedOwned);
    // A public digest-only witness would still pass for both defective consumers.
    const subject = await import(pathToFileURL(join(sandbox, "self-composition/stage0-entry.variant.js")).href);
    assert.deepEqual(await subject.compileComposition(structuredClone(fixedInput)), {
      ok: true, plan: fixedPlan, digest: digest(fixedPlan, true),
    });
  });
}
