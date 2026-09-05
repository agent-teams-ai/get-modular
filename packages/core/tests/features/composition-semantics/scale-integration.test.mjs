import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { materialize } from "../../../../../architecture/checks/implementation-clarifications.mjs";
import { generateDenseProfile, loadP500Recipe } from "../../../../../tests/qualification/support/resource-profile-v2.mjs";
import { admitObjectInput } from "../../../dist/features/input-admission/object-admission.js";
import { analyzeCompositionSemantics } from "../../../dist/features/composition-semantics/semantic-analysis.js";
import { createDiagnosticCollector } from "../../../dist/features/diagnostics/internal.js";
import { createOwnedJcs } from "../../../dist/features/canonicalization/owned-jcs/factory.js";
import { createPlanOutput } from "../../../dist/features/plan-output/factory.js";

const root = new URL("../../../../../", import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), "utf8"));
const clarification = await json("architecture/qualification/implementation-clarifications/cases.json");
const recipe = await loadP500Recipe();
const output = createPlanOutput({ canonicalizer: createOwnedJcs() });
function compile(input) {
  const collector = createDiagnosticCollector(createOwnedJcs().canonicalize);
  return analyzeCompositionSemantics(admitObjectInput(input, collector), collector);
}
const permutations = [values => [...values], values => [...values].reverse(), values => [...values.slice(1), values[0]]];
function permute(input, reorder) {
  return { declarations: reorder(input.declarations), profile: { ...input.profile,
    selections: reorder(input.profile.selections), bindings: reorder(input.profile.bindings), roots: reorder(input.profile.roots) } };
}

test("all eight accepted mixed cycle/depth recipes retain full diagnostics through admission and semantics", () => {
  assert.equal(clarification.graphCases.length, 8);
  for (const fixture of clarification.graphCases) {
    const { declarations, profile } = materialize(fixture.recipe);
    for (const reorder of permutations) {
      assert.deepEqual(compile(permute({ declarations, profile }, reorder)), fixture.expected, fixture.id);
    }
  }
  // Literal depth companions exercise the inclusive boundary without a cycle.
  for (const count of [2048, 2049]) {
    const { declarations, profile } = materialize({ chainLength: count, cycle: "none", attachment: "none" });
    const result = compile({ declarations, profile });
    if (count === 2048) {
      assert.equal(result.ok, true);
      assert.deepEqual(result.plan.dependencyOrder,
        Array.from({ length: 2048 }, (_, i) => `example/n${String(i + 1).padStart(4, "0")}/default`));
    } else assert.deepEqual(result, { ok: false, diagnostics: [{ code: "input.limit-exceeded", phase: "graph",
      path: [], coordinate: {}, details: { limitName: "graphDepth", limit: 2048, actual: 2049 } }] });
  }
});

test("removing a cyclic bridge never joins two in-budget chains into a depth overflow", () => {
  const input = materialize({ chainLength: 2049, cycle: "self", attachment: "none" });
  // Split the chain into 1024 and 1025 nodes, joined only through cyclic a.
  // Original root closure reaches every node; removing the SCC leaves depth
  // 1025. Splicing across it would incorrectly produce the saturated 2049.
  input.profile.bindings.find(binding => binding.consumerImplementationId === "example/n1025/default")
    .providerImplementationIds = ["example/a/default"];
  const cyclic = input.declarations.find(declaration => declaration.moduleId === "example/a");
  cyclic.slots.push({ ...cyclic.slots[0], slotId: "d1" });
  input.profile.bindings.push({ consumerImplementationId: "example/a/default", slotId: "d1",
    providerImplementationIds: ["example/n1024/default"] });
  input.profile.roots = ["example/n2049"];
  const expected = { ok: false, diagnostics: [{ code: "graph.cycle", phase: "graph",
    path: [], coordinate: {}, details: { component: ["example/a/default"] } }] };
  for (const reorder of permutations) assert.deepEqual(compile(permute(input, reorder)), expected);
});

// Independent expected-output recipe: no input generator, subject census,
// graph traversal, canonicalizer or returned plan supplies these expectations.
function expectedP500Plan() {
  const module = i => `example/p500/module-${String(i).padStart(4, "0")}`;
  const implementation = i => `${module(i)}/implementation-${"x".repeat(48)}`;
  const bindings = [];
  for (let consumer = 1; consumer < 500; consumer += 1) {
    for (const slotId of ["many", "optional", "required"]) {
      if (slotId === "optional" && consumer === 1) continue;
      const providers = slotId === "many"
        ? Array.from({ length: Math.min(consumer, 48) }, (_, i) => Math.max(0, consumer - 48) + i)
        : [consumer - (slotId === "optional" ? 2 : 1)];
      bindings.push({ consumerImplementationId: implementation(consumer), slotId,
        capabilityId: "example/p500/capability", compatibility: {
          family: "exact", familyVersion: 1, token: "example/p500/capability" },
        providerImplementationIds: providers.map(implementation) });
    }
  }
  return { kind: "get-modular.composition-plan", schemaVersion: 1, profileId: "example/p500/profile",
    roots: [module(499)], selections: Array.from({ length: 500 }, (_, i) => ({ moduleId: module(i), implementationId: implementation(i) })),
    bindings, dependencyOrder: Array.from({ length: 500 }, (_, i) => implementation(i)) };
}

// This small oracle is deliberately restricted to the ASCII/integer fixture
// domain. It is not another general RFC8785 implementation.
function fixtureCanonical(value) {
  if (Array.isArray(value)) return `[${value.map(fixtureCanonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort()
    .map(key => `${JSON.stringify(key)}:${fixtureCanonical(value[key])}`).join(",")}}`;
  assert.ok(typeof value === "string" && /^[\x20-\x7e]*$/u.test(value) || Number.isSafeInteger(value));
  return JSON.stringify(value);
}
function expectedDigest(plan) {
  const bytes = fixtureCanonical({ canonicalization: "RFC8785", hashAlgorithm: "SHA-256",
    kind: "get-modular.plan-content", plan, protocolVersion: 1 });
  return `gm-plan:v1:sha-256:${createHash("sha256").update(bytes).digest("hex")}`;
}
// Independently reproduced with Python sorted compact JSON over this closed
// ASCII recipe, not captured from the production compiler or canonicalizer.
const p500Digest = "gm-plan:v1:sha-256:30ebe42d0c5fd429fe20177551c739bca784e74f97d4c7bf42300c9c46b46f55";

test("the real private P500 pipeline matches the entire independent plan and fixed digest under permutations", async () => {
  assert.deepEqual([recipe.moduleCount, recipe.manyWindow, recipe.implementationIdPadding, recipe.rootModuleIndex], [500, 48, 48, 499]);
  const expected = expectedP500Plan();
  assert.equal(expectedDigest(expected), p500Digest);
  const input = generateDenseProfile(recipe);
  for (const reorder of permutations) {
    const result = compile(permute(input, reorder));
    assert.deepEqual(result, { ok: true, plan: expected });
    assert.deepEqual(await output.emit(result.plan), { plan: expected, digest: p500Digest });
  }
});

test("P500 proof detects a lost binding and preserves semantically significant many order", async () => {
  const expected = expectedP500Plan();
  const missing = generateDenseProfile(recipe);
  const removed = missing.profile.bindings.pop();
  assert.deepEqual(compile(missing), { ok: false, diagnostics: [{ code: "binding.missing", phase: "binding",
    path: [], coordinate: { implementationId: removed.consumerImplementationId, slotId: removed.slotId },
    details: { reason: "missing" } }] });

  const input = generateDenseProfile(recipe);
  const row = input.profile.bindings.find(binding => binding.slotId === "many" && binding.providerImplementationIds.length === 48);
  row.providerImplementationIds.reverse();
  const ordered = structuredClone(expected);
  ordered.bindings.find(binding => binding.consumerImplementationId === row.consumerImplementationId && binding.slotId === "many")
    .providerImplementationIds.reverse();
  const result = compile(input);
  assert.deepEqual(result, { ok: true, plan: ordered });
  assert.notDeepEqual(ordered, expected);
  const emitted = await output.emit(result.plan);
  assert.deepEqual(emitted, { plan: ordered, digest: expectedDigest(ordered) });
  assert.notEqual(emitted.digest, p500Digest);
});

// These are private-component integration results. Public-entry, retained
// archive, direct/generated and runtime-matrix qualification remain separate.
