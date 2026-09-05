// Private plan-emission behavior; public compiler qualification remains pending.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import canonicalizeOracle from "canonicalize";
import { canonicalize as secondOracle } from "json-canonicalize";
import { createPlanOutput } from "../../../dist-test/features/plan-output/factory.js";
import { createOwnedJcs } from "../../../dist-test/features/canonicalization/owned-jcs/factory.js";
import { canonicalBytesCapabilityId, canonicalBytesToken } from "../../../dist-test/features/canonicalization/identity.js";
import { planOutputDeclaration, planOutputImplementation, planOutputModuleId, planEmissionCapabilityId, planEmissionToken } from "../../../dist-test/features/plan-output/declaration.js";

const root = new URL("../../../../../", import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), "utf8"));
const simple = (await read("architecture/contracts/v1/canonical-vectors.json")).positive;
const branching = (await read("architecture/qualification/v1/normalization-vectors.json")).cases;
const vectors = [
  ...simple.map(item => ({ ...item, plan: item.envelope.plan })),
  ...branching.map(item => ({ ...item, plan: item.expectedPlan })),
];
const canonicalizer = createOwnedJcs({});
const subject = createPlanOutput({ canonicalizer });
const envelope = plan => ({
  canonicalization: "RFC8785", hashAlgorithm: "SHA-256",
  kind: "get-modular.plan-content", plan, protocolVersion: 1,
});
const digest = bytes => `gm-plan:v1:sha-256:${createHash("sha256").update(bytes).digest("hex")}`;
const expectedDigest = plan => {
  const expected = canonicalizeOracle(envelope(plan));
  assert.equal(secondOracle(envelope(plan)), expected);
  return digest(expected);
};
function containers(rootValue) {
  const seen = new Set();
  const pending = [rootValue];
  while (pending.length > 0) {
    const value = pending.pop();
    if (value === null || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    assert.equal(Object.getPrototypeOf(value), Array.isArray(value) ? Array.prototype : Object.prototype);
    for (const key of Reflect.ownKeys(value)) {
      assert.equal(typeof key, "string");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      assert.ok(Object.hasOwn(descriptor, "value"));
      pending.push(descriptor.value);
    }
  }
  return seen;
}

for (const vector of vectors) {
  test(`emits exact accepted plan, canonical envelope and digest: ${vector.name}`, async () => {
    let calls = 0;
    const output = createPlanOutput({ canonicalizer: { canonicalize(value) {
      calls += 1;
      assert.deepEqual(value, envelope(vector.plan));
      const bytes = canonicalizer.canonicalize(value);
      assert.equal(new TextDecoder().decode(bytes), vector.canonicalUtf8);
      return bytes;
    } } });
    assert.equal(calls, 0, "factory construction is inert");
    const result = await output.emit(structuredClone(vector.plan));
    assert.equal(calls, 1);
    assert.deepEqual(Object.keys(result).sort(), ["digest", "plan"]);
    assert.deepEqual(result.plan, vector.plan);
    assert.equal(result.digest, vector.digest);
  });
}

test("copies every plan container before canonicalization and caller mutation", async () => {
  const input = structuredClone(branching[0].expectedPlan);
  const expected = structuredClone(input);
  const originalContainers = containers(input);
  let observedPlan;
  const output = createPlanOutput({ canonicalizer: { canonicalize(value) {
    observedPlan = value.plan;
    input.bindings[0].compatibility.token = "changed/inside-canonicalizer";
    assert.deepEqual(value.plan, expected);
    for (const item of containers(value)) assert.equal(Object.isFrozen(item), true);
    return canonicalizer.canonicalize(value);
  } } });
  const pending = output.emit(input);
  input.profileId = "changed/profile";
  input.roots.reverse();
  input.selections[0].implementationId = "changed/implementation";
  input.bindings[1].providerImplementationIds.reverse();
  input.bindings[0].slotId = "changed-slot";
  input.dependencyOrder.length = 0;
  const result = await pending;
  assert.deepEqual(result.plan, expected);
  assert.equal(result.plan, observedPlan);
  assert.equal(result.digest, branching[0].digest);
  for (const item of containers(result)) {
    assert.equal(originalContainers.has(item), false);
    assert.equal(Object.isFrozen(item), true);
    assert.throws(() => Object.defineProperty(item, "mutation", { value: 1 }), TypeError);
    if (Array.isArray(item)) assert.throws(() => item.push("mutation"), TypeError);
  }
  for (const item of originalContainers) assert.equal(Object.isFrozen(item), false);
});

test("preserves ordered many providers and hashes compatibility and profile content", async () => {
  const original = structuredClone(branching[0].expectedPlan);
  const mutations = [
    value => value.bindings[1].providerImplementationIds.reverse(),
    value => { value.profileId = "example/alternative"; },
    value => { value.bindings[0].compatibility.token = "example/database-access/v2"; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(original);
    mutate(changed);
    const result = await subject.emit(changed);
    assert.deepEqual(result.plan, changed);
    assert.equal(result.digest, expectedDigest(changed));
    assert.notEqual(result.digest, branching[0].digest);
  }
});

test("is independent of record-key insertion order and retains no state between calls", async () => {
  const reorder = value => Array.isArray(value) ? value.map(reorder)
    : value !== null && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).reverse().map(([key, member]) => [key, reorder(member)]))
      : value;
  const results = await Promise.all(vectors.flatMap(vector => [vector.plan, reorder(vector.plan)])
    .map(plan => subject.emit(plan)));
  for (let index = 0; index < vectors.length; index += 1) {
    assert.deepEqual(results[index * 2], results[index * 2 + 1]);
    assert.equal(results[index * 2].digest, vectors[index].digest);
    const firstContainers = containers(results[index * 2]);
    for (const item of containers(results[index * 2 + 1])) assert.equal(firstContainers.has(item), false);
  }
});

test("structured clone and a separate process retain values and recomputed digest", async () => {
  const result = await subject.emit(branching[0].expectedPlan);
  const cloned = structuredClone(result);
  assert.deepEqual(cloned, result);
  assert.equal(Object.isFrozen(cloned.plan), false);
  assert.equal(expectedDigest(cloned.plan), result.digest);
  const factory = new URL("../../../dist-test/features/plan-output/factory.js", import.meta.url).href;
  const canonical = new URL("../../../dist-test/features/canonicalization/owned-jcs/factory.js", import.meta.url).href;
  const script = `import {readFileSync} from 'node:fs';
    import {createPlanOutput} from ${JSON.stringify(factory)};
    import {createOwnedJcs} from ${JSON.stringify(canonical)};
    const plan=JSON.parse(readFileSync(0,'utf8'));
    process.stdout.write(JSON.stringify(await createPlanOutput({canonicalizer:createOwnedJcs({})}).emit(plan)));`;
  const child = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    input: JSON.stringify(result.plan), encoding: "utf8", timeout: 10_000,
  });
  assert.deepEqual(JSON.parse(child), result);
});

test("canonicalizer implementation failure rejects the Promise without diagnostics", async () => {
  const failure = new Error("private-canonicalizer-failure");
  const output = createPlanOutput({ canonicalizer: { canonicalize() { throw failure; } } });
  const pending = output.emit(vectors[0].plan);
  assert.ok(pending instanceof Promise);
  await assert.rejects(pending, error => error === failure);
  assert.equal((await subject.emit(vectors[0].plan)).digest, vectors[0].digest);
});

test("uses the injected canonicalizer for content identity without a concrete fallback", async () => {
  const prefix = new TextEncoder().encode("qualification-only:");
  const bytes = new Uint8Array([...prefix, ...new TextEncoder().encode(vectors[0].canonicalUtf8)]);
  const output = createPlanOutput({ canonicalizer: { canonicalize: () => bytes } });
  const result = await output.emit(vectors[0].plan);
  assert.deepEqual(result.plan, vectors[0].plan);
  assert.equal(result.digest, digest(bytes));
  assert.notEqual(result.digest, vectors[0].digest);
});

test("declares one required canonicalizer with frozen inert metadata", () => {
  assert.equal(planOutputDeclaration.moduleId, planOutputModuleId);
  assert.equal(planOutputDeclaration.implementationId, planOutputImplementation);
  assert.deepEqual(planOutputDeclaration.owner, { authority: "get-modular", path: ["plan-output"] });
  assert.deepEqual(planOutputDeclaration.provides, [{ capabilityId: planEmissionCapabilityId,
    compatibility: { family: "exact", familyVersion: 1, token: planEmissionToken } }]);
  assert.deepEqual(planOutputDeclaration.slots, [{ slotId: "canonicalizer", capabilityId: canonicalBytesCapabilityId,
    compatibility: { family: "exact", familyVersion: 1, token: canonicalBytesToken }, cardinality: { kind: "required" } }]);
  for (const value of containers(planOutputDeclaration)) assert.equal(Object.isFrozen(value), true);
});

for (const [name, install, rejection] of [
  ["unavailable Web Crypto", "Object.defineProperty(globalThis,'crypto',{value:undefined, configurable:true});", "TypeError"],
  ["rejected Web Crypto hash", "const failure=new Error('hash failure'); Object.defineProperty(globalThis,'crypto',{value:{subtle:{digest:()=>Promise.reject(failure)}}, configurable:true});", "error=>error===failure"],
]) test(`${name} rejects without a fabricated digest or diagnostic`, () => {
  const factory = new URL("../../../dist-test/features/plan-output/factory.js", import.meta.url).href;
  const canonical = new URL("../../../dist-test/features/canonicalization/owned-jcs/factory.js", import.meta.url).href;
  const script = `import assert from 'node:assert/strict';
    ${install}
    const {createPlanOutput} = await import(${JSON.stringify(factory)});
    const {createOwnedJcs} = await import(${JSON.stringify(canonical)});
    const output=createPlanOutput({canonicalizer:createOwnedJcs({})});
    await assert.rejects(output.emit(${JSON.stringify(vectors[0].plan)}), ${rejection});`;
  execFileSync(process.execPath, ["--input-type=module", "-e", script], { timeout: 10_000 });
});
