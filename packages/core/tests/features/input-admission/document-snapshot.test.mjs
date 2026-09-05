// These private primitives require already validated and bounded wire values.
// The public unknown-input boundary and async invocation timing are later gates.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { snapshotDeclaration, snapshotProfile } from "../../../dist-test/features/input-admission/document-snapshot.js";

const vectors = JSON.parse(await readFile(new URL("../../../../../architecture/qualification/v1/normalization-vectors.json", import.meta.url), "utf8"));
const examples = JSON.parse(await readFile(new URL("../../../../../tests/qualification/compiler-engineer/examples.json", import.meta.url), "utf8"));

function containers(value) {
  const found = new Set();
  const pending = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === null || typeof current !== "object" || found.has(current)) continue;
    found.add(current);
    pending.push(...Object.values(current));
  }
  return found;
}

function assertOwnedSnapshot(copy, input) {
  const callerContainers = containers(input);
  const expected = structuredClone(input);
  const result = copy(input);
  assert.deepEqual(result, expected);
  for (const value of callerContainers) assert.equal(Object.isFrozen(value), false);
  for (const value of containers(result)) {
    assert.equal(callerContainers.has(value), false);
    assert.equal(Object.isFrozen(value), true);
    assert.throws(() => Object.defineProperty(value, "changed", { value: true }), TypeError);
  }
  // Mutate every caller container, including shared nested objects and arrays.
  for (const value of callerContainers) {
    if (Array.isArray(value)) value.length = 0;
    else for (const key of Object.keys(value)) value[key] = "caller mutation";
  }
  assert.deepEqual(result, expected);
  return result;
}

test("all declaration containers are owned and frozen for every accepted cardinality", () => {
  const cardinalities = new Set();
  const cases = [vectors.cases[0], ...examples.cases.filter(value => value.expected?.ok === true).map(value => value.input)];
  for (const fixture of cases) for (const declaration of fixture.declarations) {
    for (const slot of declaration.slots) cardinalities.add(slot.cardinality.kind);
    assertOwnedSnapshot(snapshotDeclaration, structuredClone(declaration));
  }
  assert.deepEqual([...cardinalities].sort(), ["many", "optional", "required"]);
});

test("profiles preserve all row and provider ordering while owning every container", () => {
  const profiles = [...vectors.cases[0].equivalentProfiles,
    ...examples.cases.filter(value => value.expected?.ok === true).map(value => value.input.profile)];
  for (const profile of profiles) assertOwnedSnapshot(snapshotProfile, structuredClone(profile));
  const reverse = structuredClone(vectors.cases[0].equivalentProfiles[0]);
  reverse.roots.reverse(); reverse.selections.reverse(); reverse.bindings.reverse();
  for (const binding of reverse.bindings) binding.providerImplementationIds.reverse();
  assertOwnedSnapshot(snapshotProfile, reverse);
});

test("shared compatibility and cardinality containers are copied at every occurrence", () => {
  const declaration = structuredClone(vectors.cases[0].declarations[0]);
  const compatibility = declaration.slots[0].compatibility;
  declaration.provides = [{ capabilityId: "example/database-access", compatibility }];
  declaration.slots[1].compatibility = compatibility;
  declaration.slots[1].cardinality = declaration.slots[0].cardinality;
  const snapshot = assertOwnedSnapshot(snapshotDeclaration, declaration);
  assert.notEqual(snapshot.provides[0].compatibility, snapshot.slots[0].compatibility);
  assert.notEqual(snapshot.slots[0].compatibility, snapshot.slots[1].compatibility);
  assert.notEqual(snapshot.slots[0].cardinality, snapshot.slots[1].cardinality);
});

test("snapshot calls are isolated and do not install identity or factory state", () => {
  const value = structuredClone(vectors.cases[0].declarations[0]);
  const first = snapshotDeclaration(value);
  const second = snapshotDeclaration(value);
  assert.deepEqual(first, second);
  const firstContainers = containers(first);
  for (const item of containers(second)) assert.equal(firstContainers.has(item), false);
  assert.deepEqual(Reflect.ownKeys(first).sort(), Reflect.ownKeys(value).sort());
  assert.equal(Object.getPrototypeOf(first), Object.prototype);
});
