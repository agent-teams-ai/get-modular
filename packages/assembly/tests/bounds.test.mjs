import assert from "node:assert/strict";
import test from "node:test";
import { assemblyFor } from "@get-modular/assembly";
import { many } from "@get-modular/core";
import { prepareConstruction } from "../dist/features/construction/prepare.js";
import { rootKeys, snapshotDeclaration, snapshotPlan } from "../dist/features/construction/snapshot.js";
import { binding, compile, declaration, exact, profile, provide, slot } from "./fixture.mjs";

const limit = (operation) => assert.throws(operation, (error) => error.kind === "limit");
const plan = () => ({
  kind: "get-modular.composition-plan", schemaVersion: 1, profileId: "bounds",
  roots: ["root"], selections: [{ moduleId: "root", implementationId: "root" }],
  bindings: [], dependencyOrder: ["root"],
});
const row = (count) => ({
  ...binding("root", "slot", Array.from({ length: count }, () => "provider")),
  capabilityId: "value", compatibility: exact(),
});

test("all individual declaration, plan and alias ceilings accept boundary and refuse plus one", () => {
  for (const [field, maximum, make] of [
    ["provides", 64, (index) => provide(`value-${index}`)],
    ["slots", 128, (index) => slot(`slot-${index}`, "value")],
  ]) {
    const input = declaration("root");
    input[field] = Array.from({ length: maximum }, (_, index) => make(index));
    snapshotDeclaration(input);
    input[field].push(make(maximum));
    limit(() => snapshotDeclaration(input));
  }
  const owned = declaration("root");
  owned.owner.path = Array(8).fill("part");
  snapshotDeclaration(owned);
  owned.owner.path.push("part");
  limit(() => snapshotDeclaration(owned));
  for (const text of ["a".repeat(128), "é".repeat(64), "😀".repeat(32)]) {
    const input = declaration(text);
    snapshotDeclaration(input);
    input.moduleId += "a";
    limit(() => snapshotDeclaration(input));
  }
  for (const [field, maximum, value] of [
    ["roots", 1024, "root"], ["selections", 4096, { moduleId: "root", implementationId: "root" }],
    ["dependencyOrder", 4096, "root"], ["bindings", 65536, row(0)],
  ]) {
    const input = plan();
    input[field] = Array(maximum).fill(value);
    snapshotPlan(input);
    input[field].push(value);
    limit(() => snapshotPlan(input));
  }
  const input = plan();
  input.bindings = [row(1024)];
  snapshotPlan(input);
  input.bindings[0].providerImplementationIds.push("provider");
  limit(() => snapshotPlan(input));
  const aliases = Object.fromEntries(Array.from({ length: 1024 }, (_, index) => [`root-${index}`, {}]));
  rootKeys(aliases);
  aliases.extra = {};
  limit(() => rootKeys(aliases));
  rootKeys({ ["a".repeat(128)]: {} });
  limit(() => rootKeys({ ["a".repeat(129)]: {} }));
});

test("aggregate provider census refuses overflow before any compiler invocation", async () => {
  const api = assemblyFor(), item = declaration("root");
  const handle = api.bindFactory(item, async () => ({ instance: {}, capabilities: {} }));
  const original = await compile([item]), composition = structuredClone(original);
  composition.plan.bindings = Array.from({ length: 256 }, () => row(1024));
  snapshotPlan(composition.plan);
  composition.plan.bindings.push(row(1));
  let calls = 0;
  const result = await prepareConstruction({ composition, factories: [handle], roots: { root: handle } }, {
    compileComposition: async () => { calls++; return original; },
  });
  assert.equal(result.error.code, "assembly.prepare.limit");
  assert.equal(calls, 0);
});

test("aggregate declarations and handle count are checked before compilation", async () => {
  const api = assemblyFor(), original = await compile([declaration("seed")]);
  for (const field of ["provides", "slots"]) {
    const composition = structuredClone(original), factories = [];
    for (let index = 0; index < 4096; index++) {
      const item = declaration(`item-${index}`);
      item[field] = Array.from({ length: 16 }, (_, slotIndex) => field === "provides" ? provide(`value-${slotIndex}`) : slot(`slot-${slotIndex}`, "value"));
      factories.push(api.bindFactory(item, async () => ({ instance: {}, capabilities: {} })));
    }
    composition.plan.selections = factories.map((_, index) => ({ moduleId: `item-${index}`, implementationId: `item-${index}` }));
    composition.plan.dependencyOrder = factories.map((_, index) => `item-${index}`);
    composition.plan.roots = ["item-0"];
    let calls = 0;
    const ports = { compileComposition: async () => { calls++; return original; } };
    await prepareConstruction({ composition, factories, roots: { root: factories[0] } }, ports);
    assert.equal(calls, 1);
    const extra = declaration("item-4095");
    extra[field] = Array.from({ length: 17 }, (_, index) => field === "provides" ? provide(`value-${index}`) : slot(`slot-${index}`, "value"));
    factories[4095] = api.bindFactory(extra, async () => ({ instance: {}, capabilities: {} }));
    const result = await prepareConstruction({ composition, factories, roots: { root: factories[0] } }, ports);
    assert.equal(result.error.code, "assembly.prepare.limit");
    assert.equal(calls, 1);
    factories.push(factories[0]);
    assert.equal((await api.prepare({ composition, factories, roots: { root: factories[0] } })).error.code, "assembly.prepare.limit");
  }
});

test("dense arrays and alias own-key counts include nonenumerable and symbol properties", () => {
  const sparse = plan();
  sparse.roots = new Array(1);
  assert.throws(() => snapshotPlan(sparse));
  const extra = plan();
  Object.defineProperty(extra.roots, "hidden", { value: 1 });
  assert.throws(() => snapshotPlan(extra));
  assert.throws(() => rootKeys({ [Symbol("alias")]: {} }));
  const aliases = Object.fromEntries(Array.from({ length: 1024 }, (_, index) => [`root-${index}`, {}]));
  Object.defineProperty(aliases, "hidden", { value: {} });
  limit(() => rootKeys(aliases));
});

test("public Core accepts 4096 selected implementations and 1024 providers per row", async () => {
  const leaves = Array.from({ length: 4095 }, (_, index) => declaration(`leaf-${index}`, ["value"]));
  const groups = Array.from({ length: 4 }, (_, index) => leaves.slice(index * 1024, (index + 1) * 1024));
  const root = declaration("root", [], groups.map((group, index) => slot(`group-${index}`, "value", many({ min: group.length, max: group.length }))));
  const declarations = [...leaves, root];
  const rows = groups.map((group, index) => binding("root", `group-${index}`, group.map((item) => item.implementationId)));
  const composition = await compile(declarations, profile(declarations, rows));
  const api = assemblyFor();
  const handles = declarations.map((item) => api.bindFactory(item, async (dependencies) => ({
    instance: item === root ? dependencies : item.implementationId,
    capabilities: item === root ? {} : { value: item.implementationId },
  })));
  const result = await api.prepare({ composition, factories: handles, roots: { root: handles.at(-1) } });
  assert.equal(result.status, "prepared");
  const outcome = await result.prepared.run();
  assert.equal(outcome.created.length, 4096);
  assert.deepEqual(outcome.roots.root["group-0"], groups[0].map((item) => item.implementationId));
});
