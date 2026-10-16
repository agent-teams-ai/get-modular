// S0 0A: runtime behaviour of the prototype (implement, input, group, entriesOf, prepare({ modules }), smoke, isolate).
import assert from "node:assert/strict";
import test from "node:test";
import { assemblyFor, AssemblyBindingError, entriesOf, group, implement, input as inputEntry } from "@get-modular/assembly";
import { isolate, smoke, ConformanceError } from "@get-modular/conformance";
import { scoped } from "@get-modular/resources";
import { binding, declaration, profile, slot } from "./fixture.mjs";

const code = (error) => error?.code;
const throwsCode = (fn, expected) => assert.throws(fn, (error) => error instanceof AssemblyBindingError && error.code === expected);
const product = (id, value = {}) => async () => ({ instance: { id }, capabilities: { [`synthetic/${id}`]: value } });
// A chain of modules m0 <- m1 <- ... where each depends on the previous one.
function chain(count, prefix = "m") {
  return Array.from({ length: count }, (_, index) => declaration(`${prefix}${index}`, [`synthetic/${prefix}${index}`],
    index === 0 ? [] : [slot("previous", `synthetic/${prefix}${index - 1}`)]));
}

test("an entry is a frozen null-prototype pair; copying its fields forges nothing", async () => {
  const d = declaration("a", ["synthetic/a"]);
  const entry = implement()(d, product("a"));
  assert.equal(Object.getPrototypeOf(entry), null);
  assert.equal(Object.isFrozen(entry), true);
  assert.deepEqual(Object.keys(entry).sort(), ["declaration", "factory"]);
  assert.equal(Object.isFrozen(entry.declaration), true);
  d.provides.length = 0; // the snapshot is taken at implement
  assert.equal(entry.declaration.provides.length, 1);
  const forged = Object.freeze({ ...entry });
  const api = assemblyFor();
  const result = await api.prepare({ profileId: "synthetic/p", modules: [forged], roots: { a: entry } });
  assert.equal(result.error.code, "assembly.prepare.handles");
  throwsCode(() => group("g", [forged]), "assembly.bind.invalid-group");
});

test("implement validates synchronously and calls the adapter once with the implementation id", async () => {
  const d = declaration("a", ["synthetic/a"]);
  throwsCode(() => implement()(d, "nope"), "assembly.bind.invalid-factory");
  throwsCode(() => implement()(d, product("a"), "nope"), "assembly.bind.invalid-factory");
  throwsCode(() => implement()(d, product("a"), () => undefined), "assembly.bind.invalid-factory");
  throwsCode(() => implement()({ ...d, kind: "other" }, product("a")), "assembly.bind.invalid-declaration");
  const names = [];
  const adapter = (name, factory) => { names.push(name); return (deps, context) => factory(deps, { ...context, adapted: true }); };
  let seen;
  const entry = implement()(d, async (_deps, context) => { seen = context.adapted; return { instance: {}, capabilities: { "synthetic/a": {} } }; }, adapter);
  assert.deepEqual(names, ["synthetic/a"]);
  const api = assemblyFor();
  const ready = await api.prepare({ profileId: "synthetic/p", modules: [entry], roots: { a: entry } });
  assert.equal((await ready.prepared.run()).status, "succeeded");
  assert.equal(seen, true);
});

test("scoped is the adapter: the factory reads resources and the run scope never reaches it", async () => {
  const d = declaration("a", ["synthetic/a"]);
  let keys;
  const entry = implement()(d, async (_deps, context) => { keys = Object.keys(context).sort(); return { instance: {}, capabilities: { "synthetic/a": {} } }; }, scoped);
  const ready = await assemblyFor().prepare({ profileId: "synthetic/p", modules: [entry], roots: { a: entry } });
  const { createScope } = await import("@get-modular/resources");
  const scope = createScope({ name: "t" });
  assert.equal((await ready.prepared.run({ scope: scope.resources })).status, "succeeded");
  assert.deepEqual(keys, ["resources", "signal"]);
  assert.equal((await scope.control.close()).complete, true);
});

test("a group is a frozen static list; names, members, kinds and depth are validated at creation", () => {
  const entries = chain(3).map((d) => implement()(d, product(d.moduleId.slice(10))));
  const g = group("feature", entries);
  assert.equal(Object.isFrozen(g), true);
  assert.equal(Object.isFrozen(g.members), true);
  assert.equal(Object.getPrototypeOf(g), null);
  assert.deepEqual(Object.keys(g).sort(), ["members", "name"]);
  throwsCode(() => group("", entries), "assembly.bind.invalid-group");
  throwsCode(() => group("x".repeat(129), entries), "assembly.bind.invalid-group");
  assert.doesNotThrow(() => group("\u00e9".repeat(64), entries));
  throwsCode(() => group("\u00e9".repeat(65), entries), "assembly.bind.invalid-group");
  throwsCode(() => group("g", [{}]), "assembly.bind.invalid-group");
  throwsCode(() => group("g", [inputEntry()(declaration("in", ["synthetic/in"]))]), "assembly.bind.invalid-group");
  throwsCode(() => group("g", Object.assign([entries[0]], { 1: entries[1], length: 3 })), "assembly.bind.invalid-group");
  let reads = 0;
  const getter = [entries[0]];
  Object.defineProperty(getter, 1, { get() { reads += 1; return entries[1]; }, enumerable: true });
  throwsCode(() => group("g", getter), "assembly.bind.invalid-group");
  assert.equal(reads, 0);
  // Depth: `modules` is level 0, so sixteen nested groups pass and the seventeenth throws at creation.
  let nested = group("level-1", [entries[0]]);
  for (let level = 2; level <= 16; level += 1) nested = group(`level-${level}`, [nested]);
  throwsCode(() => group("level-17", [nested]), "assembly.bind.invalid-group");
});

test("order and nesting never change the profile, the plan or the digest", async () => {
  const declarations = chain(6);
  const entries = declarations.map((d, index) => implement()(d, product(`m${index}`)));
  const api = assemblyFor();
  const prepare = (modules) => api.prepare({ profileId: "synthetic/p", modules, roots: { last: entries[5] } });
  const flat = await prepare(entries);
  const nested = await prepare([group("a", [entries[3], group("b", [entries[0], entries[5]])]), entries[1], group("c", [entries[4], entries[2]])]);
  const reversed = await prepare([...entries].reverse());
  for (const result of [flat, nested, reversed]) assert.equal(result.status, "prepared", JSON.stringify(result));
  assert.equal(nested.composition.digest, flat.composition.digest);
  assert.equal(reversed.composition.digest, flat.composition.digest);
  assert.deepEqual(nested.composition.plan, flat.composition.plan);
  assert.equal((await nested.prepared.run()).status, "succeeded");
});

test("duplicates fail with every occurrence listed and no deduplication", async () => {
  const [a, b] = chain(2).map((d, index) => implement()(d, product(`m${index}`)));
  const twin = implement()(chain(2)[0], product("m0"));
  const api = assemblyFor();
  const reached = await api.prepare({ profileId: "synthetic/p", modules: [group("one", [a, b]), group("two", [group("deep", [a])])], roots: { b } });
  assert.equal(reached.error.code, "assembly.prepare.duplicate-module");
  assert.deepEqual(reached.error.cause, [{ implementationId: "synthetic/m0", paths: [["one"], ["two", "deep"]], inputs: [] }]);
  const same = await api.prepare({ profileId: "synthetic/p", modules: [a, b, group("g", [twin])], roots: { b } });
  assert.equal(same.error.code, "assembly.prepare.duplicate-module");
  assert.deepEqual(same.error.cause, [{ implementationId: "synthetic/m0", paths: [[], ["g"]], inputs: [] }]);
  const asInput = await api.prepare({ profileId: "synthetic/p", modules: [a, b], inputs: { dup: inputEntry()(chain(2)[0]) }, roots: { b } });
  assert.equal(asInput.error.code, "assembly.prepare.duplicate-module");
  assert.deepEqual(asInput.error.cause.at(0).inputs, ["dup"]);
});

test("forged groups, input entries in modules and roots outside modules keep their codes", async () => {
  const [a, b] = chain(2).map((d, index) => implement()(d, product(`m${index}`)));
  const api = assemblyFor();
  const forgedGroup = Object.freeze({ name: "forged", members: Object.freeze([a, b]) });
  assert.equal((await api.prepare({ profileId: "synthetic/p", modules: [forgedGroup], roots: { b } })).error.code, "assembly.prepare.handles");
  const inModules = inputEntry()(declaration("in", ["synthetic/in"]));
  assert.equal((await api.prepare({ profileId: "synthetic/p", modules: [a, b, inModules], roots: { b } })).error.code, "assembly.prepare.input-handles");
  assert.equal((await api.prepare({ profileId: "synthetic/p", modules: [a], roots: { b } })).error.code, "assembly.prepare.roots");
});

test("unresolved bindings report the group path of the consumer", async () => {
  const provider = [declaration("p1", ["synthetic/value"]), declaration("p2", ["synthetic/value"])];
  const consumer = declaration("c", [], [slot("value", "synthetic/value")]);
  const entries = provider.map((d, i) => implement()(d, product(`p${i + 1}`)));
  const c = implement()(consumer, async () => ({ instance: {}, capabilities: {} }));
  const result = await assemblyFor().prepare({ profileId: "synthetic/p", modules: [group("outer", [group("inner", [c]), ...entries])], roots: { c } });
  assert.equal(result.error.code, "assembly.prepare.unresolved-binding");
  assert.deepEqual(result.error.cause.map((row) => row.groupPath), [["outer", "inner"]]);
});

test("group nodes and entries count against the 4096 ceiling", async () => {
  const entries = Array.from({ length: 2049 }, (_, index) => implement()(declaration(`n${index}`, [`synthetic/n${index}`]), product(`n${index}`)));
  const groups = entries.map((entry, index) => group(`g${index}`, [entry]));
  const api = assemblyFor();
  const result = await api.prepare({ profileId: "synthetic/p", modules: groups, roots: { last: entries.at(-1) } });
  assert.equal(result.error.code, "assembly.prepare.limit");
  // A group wider than 4096 throws at creation with the group code, not the declaration limit code.
  throwsCode(() => group("wide", Array.from({ length: 4097 }, () => entries[0])), "assembly.bind.invalid-group");
});

test("entriesOf flattens depth first and refuses forged members", () => {
  const [a, b, c] = chain(3).map((d, index) => implement()(d, product(`m${index}`)));
  assert.deepEqual(entriesOf([group("x", [b, group("y", [a])]), c]), [b, a, c]);
  throwsCode(() => entriesOf([{ name: "forged", members: [] }]), "assembly.bind.invalid-group");
});

test("smoke rebuilds the tree through the public api, runs the real prepare first and fails a forged entry", async () => {
  const declarations = chain(3);
  const make = () => declarations.map((d, index) => implement()(d, async (deps, context) => {
    context.signal.throwIfAborted();
    return { instance: { index, deps }, capabilities: { [`synthetic/m${index}`]: {} } };
  }, scoped));
  const entries = make();
  const compose = (api) => api.prepare({ profileId: "synthetic/p", modules: [group("one", [entries[0], group("two", [entries[1]])]), entries[2]], roots: { last: entries[2] } });
  const steps = await smoke({ api: assemblyFor(), compose });
  assert.deepEqual(steps.map((step) => `${step.inject}${step.at ? ":" + step.at : ""}:${step.outcome}`), [
    "none:succeeded", "fail:synthetic/m0:failed", "abort:synthetic/m0:cancelled", "fail:synthetic/m1:failed",
    "abort:synthetic/m1:cancelled", "fail:synthetic/m2:failed", "abort:synthetic/m2:cancelled",
  ]);
  const forged = Object.freeze({ ...entries[0] });
  await assert.rejects(smoke({ api: assemblyFor(), compose: (api) => api.prepare({ profileId: "synthetic/p", modules: [forged, entries[1], entries[2]], roots: { last: entries[2] } }) }),
    (error) => error instanceof ConformanceError && /assembly\.prepare\.handles/u.test(error.message));
});

test("smoke detects a root that prepares outside the api it was given", async () => {
  const [a] = chain(1).map((d) => implement()(d, product("m0")));
  const outside = assemblyFor();
  await assert.rejects(smoke({ api: assemblyFor(), compose: () => outside.prepare({ profileId: "synthetic/p", modules: [a], roots: { a } }) }),
    (error) => error instanceof ConformanceError && /did not produce/u.test(error.message));
});

test("isolate(entry) builds one module with fakes as inputs and no api argument", async () => {
  const provider = declaration("store", ["synthetic/store"]);
  const consumer = declaration("app", ["synthetic/app"], [slot("store", "synthetic/store")]);
  let keys;
  const entry = implement()(consumer, async (deps, context) => {
    keys = Object.keys(context).sort();
    return { instance: { value: deps.store.value }, capabilities: { "synthetic/app": { read: () => deps.store.value } } };
  }, scoped);
  void provider;
  await using isolated = await isolate(entry, { dependencies: { store: { value: 41 } } });
  assert.equal(isolated.instance.value, 41);
  assert.equal(isolated.capabilities["synthetic/app"].read(), 41);
  assert.deepEqual(keys, ["resources", "signal"]);
});

test("a contract revision that differs from the consumer's slot is rejected by prepare through Core", async () => {
  const provider = declaration("p", ["synthetic/v"]);
  provider.provides[0] = { capabilityId: "synthetic/v", compatibility: { family: "exact", familyVersion: 1, token: "synthetic/v/r2" } };
  const consumer = declaration("c", [], [slot("v", "synthetic/v")]); // token synthetic/v1
  const p = implement()(provider, product("p"));
  const c = implement()(consumer, async () => ({ instance: {}, capabilities: {} }));
  const result = await assemblyFor().prepare({ profileId: "synthetic/p", modules: [group("g", [p, c])], roots: { c },
    bindings: [binding("synthetic/c", "v", ["synthetic/p"])] });
  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "assembly.prepare.core-rejected");
  assert.ok(result.diagnostics.length > 0);
});
