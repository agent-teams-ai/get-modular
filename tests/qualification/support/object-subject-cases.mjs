import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { materialize } from "../../../architecture/checks/implementation-clarifications.mjs";
import { coverageInput } from "../../../packages/core/tests/features/input-admission/object-resource-coverage-cases.mjs";
import { generateDenseProfile, loadP500Recipe } from "./resource-profile-v2.mjs";
import { expectedP500Plan, expectedDigest, p500Digest } from "./scale-output.mjs";

// The subject is supplied only through its public compile function. Inputs and
// complete expected results come from accepted authority and independent recipes.
const root = new URL("../../../", import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), "utf8"));
const manifest = await json("architecture/qualification/v1/qualification-case-manifest.json");
const normalization = await json("architecture/qualification/v1/normalization-vectors.json");
const clarification = await json("architecture/qualification/implementation-clarifications/cases.json");
const coverage = await json("architecture/qualification/object-resource-coverage/cases.json");
const recipe = await loadP500Recipe();
const reorderings = [values => [...values], values => [...values].reverse(), values => values.length ? [...values.slice(1), values[0]] : []];
const permute = (input, reorder) => ({ declarations: reorder(input.declarations), profile: { ...input.profile,
  selections: reorder(input.profile.selections), bindings: reorder(input.profile.bindings), roots: reorder(input.profile.roots) } });
function permutations(values) {
  return values.length ? values.flatMap((value, i) => permutations(values.filter((_v, j) => j !== i)).map(tail => [value, ...tail])) : [[]];
}

function immutableResult(result) {
  if (!result.ok) {
    assert.equal(Object.hasOwn(result, "plan"), false);
    assert.equal(Object.hasOwn(result, "digest"), false);
  }
  const pending = [result];
  const seen = new Set();
  while (pending.length) {
    const value = pending.pop();
    if (value === null || typeof value !== "object") continue;
    if (seen.has(value)) continue;
    seen.add(value);
    assert.ok(Object.isFrozen(value), "every returned container is frozen");
    assert.equal(Object.getPrototypeOf(value), Array.isArray(value) ? Array.prototype : Object.prototype);
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
      assert.ok(Object.hasOwn(descriptor, "value"));
      assert.notEqual(typeof descriptor.value, "function");
      pending.push(descriptor.value);
    }
  }
}
async function complete(compile, input, expected, id) {
  const result = await compile(input);
  assert.deepEqual(result, expected, id);
  immutableResult(result);
  return result;
}

export const objectSubjectCases = [
  { id: "complete-object-diagnostic-partitions", async run(compile) {
    const cases = manifest.staticConformanceProtocol.cases.filter(row => row.caseId.startsWith("diag.object."));
    assert.equal(cases.length, 8);
    for (const row of cases) {
      const orders = row.caseId === "diag.object.pre-identity-index.v1" ? [row.input.declarations] : permutations(row.input.declarations);
      for (const declarations of orders) await complete(compile,
        structuredClone({ ...row.input, declarations }), row.expected, row.caseId);
    }
  } },
  { id: "normalized-plan-digest-permutations-and-synchronous-snapshots", async run(compile) {
    for (const row of normalization.cases) {
      const byId = new Map(row.declarations.map(value => [value.implementationId, value]));
      for (const order of row.declarationOrders) for (const profile of row.equivalentProfiles) {
        const input = structuredClone({ declarations: order.map(id => byId.get(id)), profile });
        const pending = compile(input);
        // Both the outer invocation record and nested caller data change before
        // the first await. No retained alias may influence plan or digest.
        input.declarations[0].owner.path.length = 0;
        input.profile.roots.length = 0;
        input.profile.bindings.length = 0;
        input.declarations.length = 0;
        input.declarations = [];
        input.profile = null;
        const result = await pending;
        assert.deepEqual(result, { ok: true, plan: row.expectedPlan, digest: row.digest }, row.name);
        immutableResult(result);
        assert.deepEqual(structuredClone(result), result);
      }
    }
  } },
  { id: "all-eight-mixed-cycle-depth-recipes", async run(compile) {
    assert.equal(clarification.graphCases.length, 8);
    for (const row of clarification.graphCases) {
      const input = materialize(row.recipe);
      for (const reorder of reorderings) await complete(compile, permute(input, reorder), row.expected, row.id);
    }
  } },
  { id: "P500-independent-whole-plan-and-fixed-digest", async run(compile) {
    assert.deepEqual([recipe.moduleCount, recipe.manyWindow, recipe.implementationIdPadding, recipe.rootModuleIndex], [500, 48, 48, 499]);
    const plan = expectedP500Plan();
    assert.equal(expectedDigest(plan), p500Digest);
    const input = generateDenseProfile(recipe);
    for (const reorder of reorderings) await complete(compile, permute(input, reorder), { ok: true, plan, digest: p500Digest });
    const missing = generateDenseProfile(recipe);
    const removed = missing.profile.bindings.pop();
    await complete(compile, missing, { ok: false, diagnostics: [{ code: "binding.missing", phase: "binding",
      path: [], coordinate: { implementationId: removed.consumerImplementationId, slotId: removed.slotId }, details: { reason: "missing" } }] });
    const changed = generateDenseProfile(recipe);
    const row = changed.profile.bindings.find(binding => binding.slotId === "many" && binding.providerImplementationIds.length === 48);
    row.providerImplementationIds.reverse();
    const ordered = structuredClone(plan);
    ordered.bindings.find(binding => binding.consumerImplementationId === row.consumerImplementationId && binding.slotId === "many").providerImplementationIds.reverse();
    const digest = expectedDigest(ordered);
    assert.notEqual(digest, p500Digest);
    await complete(compile, changed, { ok: true, plan: ordered, digest });
  } },
  { id: "accepted-resource-envelope-coverage", async run(compile) {
    assert.equal(coverage.cases.length, 9);
    for (const row of coverage.cases) {
      const observed = [];
      for (const variant of row.variants) {
        const input = coverageInput(row.id, variant);
        const result = await compile(input);
        assert.ok(row.permittedResults.some(expected => isDeepStrictEqual(result, expected)), `${row.id}/${variant}: ${JSON.stringify(result)}`);
        if (["prior-depth-then-batch", "shallow-then-batch"].includes(row.id)) {
          const name = variant === "string" ? "aggregateStringBytes" : "jsonValueOccurrences";
          assert.deepEqual(result.diagnostics.filter(d => ["jsonValueOccurrences", "aggregateStringBytes"].includes(d.details.limitName)).map(d => d.details.limitName), [name]);
        }
        immutableResult(result);
        const before = JSON.stringify(result);
        input.declarations.length = 0; input.profile.roots.length = 0;
        assert.equal(JSON.stringify(result), before);
        observed.push(result);
      }
      if (row.domain === "inside-envelope") for (const result of observed) assert.deepEqual(result, observed[0]);
    }
  } },
];
