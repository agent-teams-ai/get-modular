import assert from "node:assert/strict";
import test from "node:test";
import { many, optional, required } from "@get-modular/core";
import { assemblyFor } from "@get-modular/assembly";
import { binding, compile, declaration, profile, slot, synthetic } from "./fixture.mjs";

// ADR-0035: prepare completes the profile from the bound handles and never guesses.
function bindAll(api, declarations, calls = []) {
  return declarations.map((item) => api.bindFactory(item, async () => {
    calls.push(item.implementationId);
    return { instance: item.implementationId, capabilities: Object.fromEntries(item.provides.map(({ capabilityId }) => [capabilityId, {}])) };
  }));
}

test("a profileId root plans exactly like the explicit composition", async () => {
  for (const logger of [false, true]) {
    const host = await synthetic({ logger });
    const rows = host.input.composition.plan.bindings;
    const explicit = rows.filter(({ slotId }) => slotId === "logger" || slotId === "filters")
      .map(({ consumerImplementationId, slotId, providerImplementationIds }) => binding(consumerImplementationId, slotId, providerImplementationIds));
    const result = await host.api.prepare({ profileId: "synthetic/profile", bindings: explicit, factories: host.input.factories, roots: host.input.roots });
    assert.equal(result.status, "prepared", JSON.stringify(result));
    assert.equal(result.composition.digest, host.input.composition.digest);
    assert.deepEqual(result.composition.plan, host.input.composition.plan);
    assert.equal((await result.prepared.run()).status, "succeeded");
  }
});

test("inputs take part in completion like any other provider", async () => {
  const api = assemblyFor();
  const session = declaration("session", ["synthetic/session"]);
  const store = declaration("store", ["synthetic/store"], [slot("session", "synthetic/session")]);
  const app = declaration("app", [], [slot("store", "synthetic/store"), slot("session", "synthetic/session")]);
  const declarations = [session, store, app];
  const explicit = await compile(declarations, profile(declarations, [
    binding("synthetic/store", "session", ["synthetic/session"]), binding("synthetic/app", "store", ["synthetic/store"]),
    binding("synthetic/app", "session", ["synthetic/session"]),
  ]));
  const input = api.bindInput(session);
  const [storeHandle, appHandle] = bindAll(api, [store, app]);
  const result = await api.prepare({ profileId: "synthetic/profile", factories: [storeHandle, appHandle], roots: { app: appHandle }, inputs: { session: input } });
  assert.equal(result.status, "prepared", JSON.stringify(result));
  assert.equal(result.composition.digest, explicit.digest);
});

test("the order of factories, roots and bindings never changes the plan", async () => {
  const api = assemblyFor();
  const base = declaration("base", ["synthetic/base"]);
  const left = declaration("left", ["synthetic/left"], [slot("base", "synthetic/base")]);
  const right = declaration("right", ["synthetic/right"], [slot("base", "synthetic/base")]);
  const top = declaration("top", [], [slot("left", "synthetic/left"), slot("right", "synthetic/right"), slot("list", "synthetic/left", optional())]);
  const handles = bindAll(api, [base, left, right, top]);
  const [baseHandle, leftHandle, rightHandle, topHandle] = handles;
  const rows = [binding("synthetic/top", "list", []), binding("synthetic/left", "base", ["synthetic/base"])];
  const digests = new Set();
  for (const [factories, roots, bindings] of [
    [[baseHandle, leftHandle, rightHandle, topHandle], { top: topHandle, right: rightHandle }, rows],
    [[topHandle, rightHandle, leftHandle, baseHandle], { right: rightHandle, top: topHandle }, [...rows].reverse()],
  ]) {
    const result = await api.prepare({ profileId: "synthetic/order", bindings, factories, roots });
    assert.equal(result.status, "prepared", JSON.stringify(result));
    digests.add(result.composition.digest);
  }
  assert.equal(digests.size, 1);
});

test("slots without a safe completion fail together, with their candidates, before any factory runs", async () => {
  const api = assemblyFor(), calls = [];
  const one = declaration("one", ["synthetic/dup"]), two = declaration("two", ["synthetic/dup"]);
  const solo = declaration("solo", ["synthetic/solo"]);
  const consumer = declaration("consumer", [], [
    slot("dup", "synthetic/dup"), slot("opt-one", "synthetic/solo", optional()),
    slot("opt-none", "synthetic/missing", optional()), slot("list", "synthetic/dup", many({ min: 0, max: 2 })),
    slot("ok", "synthetic/solo", required()),
  ]);
  const handles = bindAll(api, [one, two, solo, consumer], calls);
  const result = await api.prepare({ profileId: "synthetic/open", factories: handles, roots: { consumer: handles[3] } });
  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "assembly.prepare.unresolved-binding");
  assert.deepEqual(result.error.cause, [
    { consumerImplementationId: "synthetic/consumer", slotId: "dup", capabilityId: "synthetic/dup", cardinality: "required", candidates: ["synthetic/one", "synthetic/two"] },
    { consumerImplementationId: "synthetic/consumer", slotId: "list", capabilityId: "synthetic/dup", cardinality: "many", candidates: ["synthetic/one", "synthetic/two"] },
    { consumerImplementationId: "synthetic/consumer", slotId: "opt-none", capabilityId: "synthetic/missing", cardinality: "optional", candidates: [] },
    { consumerImplementationId: "synthetic/consumer", slotId: "opt-one", capabilityId: "synthetic/solo", cardinality: "optional", candidates: ["synthetic/solo"] },
  ]);
  assert.deepEqual(calls, []);
  // Explicit rows settle every one of them, including the ambiguous slot, and keep what was written.
  const settled = await api.prepare({
    profileId: "synthetic/open", factories: handles, roots: { consumer: handles[3] },
    bindings: [
      binding("synthetic/consumer", "dup", ["synthetic/two"]),
      binding("synthetic/consumer", "opt-one", []), binding("synthetic/consumer", "opt-none", []),
      binding("synthetic/consumer", "list", ["synthetic/two", "synthetic/one"]),
    ],
  });
  assert.equal(settled.status, "prepared", JSON.stringify(settled));
  const rows = new Map(settled.composition.plan.bindings.map((row) => [row.slotId, row.providerImplementationIds]));
  assert.deepEqual(rows.get("dup"), ["synthetic/two"]);
  assert.deepEqual(rows.get("list"), ["synthetic/two", "synthetic/one"]);
  assert.deepEqual(rows.get("ok"), ["synthetic/solo"]);
});

test("a required slot with no provider is reported with no candidates", async () => {
  const api = assemblyFor(), calls = [];
  const orphan = declaration("orphan", [], [slot("none", "synthetic/missing")]);
  const handles = bindAll(api, [orphan], calls);
  const result = await api.prepare({ profileId: "synthetic/none", factories: handles, roots: { orphan: handles[0] } });
  assert.equal(result.error.code, "assembly.prepare.unresolved-binding");
  assert.deepEqual(result.error.cause, [{
    consumerImplementationId: "synthetic/orphan", slotId: "none", capabilityId: "synthetic/missing", cardinality: "required", candidates: [],
  }]);
  assert.deepEqual(calls, []);
});

test("a completed binding with another revision is rejected by Core, not by Assembly", async () => {
  const api = assemblyFor(), calls = [];
  const provider = { ...declaration("provider", []), provides: [{ capabilityId: "synthetic/value", compatibility: { family: "exact", familyVersion: 1, token: "synthetic/v2" } }] };
  const consumer = declaration("consumer", [], [slot("value", "synthetic/value")]);
  const handles = bindAll(api, [provider, consumer], calls);
  const result = await api.prepare({ profileId: "synthetic/mismatch", factories: handles, roots: { consumer: handles[1] } });
  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "assembly.prepare.core-rejected");
  assert.ok(result.diagnostics.length > 0);
  assert.deepEqual(calls, []);
});

test("composition, profileId and bindings are exclusive", async () => {
  const host = await synthetic();
  const { factories, roots, composition } = host.input;
  for (const input of [
    { factories, roots }, { composition, profileId: "p", factories, roots },
    { composition, bindings: [], factories, roots }, { profileId: "p", bindings: "rows", factories, roots },
  ]) {
    const result = await host.api.prepare(input);
    assert.equal(result.status, "failed");
    assert.equal(result.error.code, "assembly.prepare.invalid-input");
  }
});
