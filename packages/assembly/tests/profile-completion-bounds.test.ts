import assert from "node:assert/strict";
import test from "node:test";
import { assemblyFor, declareModule, defineContract, implement, type CapabilitiesOf } from "../dist/index.js";
import { optional, required, type CompositionProfile, type ModuleDeclaration } from "@get-modular/core";
import { deriveProfile } from "../dist/features/construction/derive-profile.js";
import type { Metadata } from "../dist/features/construction/ports.js";
import { prepareConstruction } from "../dist/features/construction/prepare.js";

const Value = defineContract<number>()({ id: "completion/value", revision: 1 });
type Capabilities = CapabilitiesOf<typeof Value>;
const providerDeclaration = declareModule({
  moduleId: "completion/provider", implementationId: "completion/provider",
  owner: { authority: "completion", path: ["provider"] }, provides: [Value.provide()], slots: [],
});
const consumerDeclaration = declareModule({
  moduleId: "completion/consumer", implementationId: "completion/consumer",
  owner: { authority: "completion", path: ["consumer"] }, provides: [], slots: [Value.slot("value", required())],
});
const provider = implement<Capabilities>()(providerDeclaration, async () => ({ instance: 1, capabilities: { [Value.id]: 1 } }));
const consumer = implement<Capabilities>()(consumerDeclaration, async ({ value }) => ({ instance: value, capabilities: {} }));
const modules = [provider, consumer] as const;
const roots = { consumer };
type Row = CompositionProfile["bindings"][number];
const row = (index: number, count: number): Row => ({
  consumerImplementationId: "completion/unknown", slotId: `slot-${String(index)}`,
  providerImplementationIds: Array.from({ length: count }, () => "completion/provider"),
});

function bindingCounts(profile: unknown): { readonly rows: number; readonly occurrences: number } {
  assert.ok(typeof profile === "object" && profile !== null && "bindings" in profile && Array.isArray(profile.bindings));
  const bindings: readonly unknown[] = profile.bindings;
  let occurrences = 0;
  for (const binding of bindings) {
    assert.ok(typeof binding === "object" && binding !== null && "providerImplementationIds" in binding
      && Array.isArray(binding.providerImplementationIds));
    occurrences += binding.providerImplementationIds.length;
  }
  return { rows: bindings.length, occurrences };
}

test("explicit preparation still rejects invalid handles and roots before invoking Core", async () => {
  const original = await assemblyFor<Capabilities>().prepare({ profileId: "completion/profile", modules, roots });
  assert.equal(original.status, "prepared");
  if (original.status !== "prepared") throw new Error("fixture preparation failed");
  const composition = original.composition;
  let compilations = 0;
  const ports = { compileComposition: async () => { compilations += 1; return composition; } };
  const missing = await prepareConstruction<Capabilities, typeof roots, {}, typeof modules>({
    composition: { ...composition, plan: { ...composition.plan, selections: [] } }, modules, roots,
  }, ports);
  assert.equal(missing.status, "failed");
  if (missing.status === "failed") assert.equal(missing.error.code, "assembly.prepare.handles");
  const wrongRoots = { consumer: provider };
  const wrong = await prepareConstruction<Capabilities, typeof wrongRoots, {}, typeof modules>({
    composition, modules, roots: wrongRoots,
  }, ports);
  assert.equal(wrong.status, "failed");
  if (wrong.status === "failed") assert.equal(wrong.error.code, "assembly.prepare.roots");
  assert.equal(compilations, 0);
});

test("completed row and provider occurrence ceilings include inferred required bindings before Core", async () => {
  const original = await assemblyFor<Capabilities>().prepare({ profileId: "completion/profile", modules, roots });
  assert.equal(original.status, "prepared");
  if (original.status !== "prepared") throw new Error("fixture preparation failed");
  for (const [name, atBoundary, beyondBoundary] of [
    ["rows", Array.from({ length: 65535 }, (_, index) => row(index, 0)),
      Array.from({ length: 65536 }, (_, index) => row(index, 0))],
    ["provider occurrences", Array.from({ length: 256 }, (_, index) => row(index, index === 255 ? 1023 : 1024)),
      Array.from({ length: 256 }, (_, index) => row(index, 1024))],
  ] as const) {
    let compilations = 0;
    let observed: unknown;
    const ports = { compileComposition: async (input: Parameters<typeof import("@get-modular/core").compileComposition>[0]) => {
      compilations += 1;
      observed = input.profile;
      return original.composition;
    } };
    await prepareConstruction<Capabilities, typeof roots, {}, typeof modules>({
      profileId: "completion/profile", bindings: atBoundary, modules, roots,
    }, ports);
    assert.equal(compilations, 1, `${name}: the exact structural boundary reaches Core`);
    assert.deepEqual(bindingCounts(observed), { rows: atBoundary.length + 1,
      occurrences: atBoundary.reduce((sum, binding) => sum + binding.providerImplementationIds.length, 0) + 1 });
    compilations = 0;
    const rejected = await prepareConstruction<Capabilities, typeof roots, {}, typeof modules>({
      profileId: "completion/profile", bindings: beyondBoundary, modules, roots,
    }, ports);
    assert.equal(rejected.status, "failed", name);
    if (rejected.status === "failed") assert.equal(rejected.error.code, "assembly.prepare.limit", name);
    assert.equal(compilations, 0, `${name}: overflow must not invoke Core`);
    const publicResult = await assemblyFor<Capabilities>().prepare({
      profileId: "completion/profile", bindings: beyondBoundary, modules, roots,
    });
    assert.equal(publicResult.status, "failed", name);
    if (publicResult.status === "failed") assert.equal(publicResult.error.code, "assembly.prepare.limit", name);
  }
});

const neverCalled: Metadata["factory"] = () => { throw new Error("profile analysis must not execute factories"); };
function metadata(id: string, provides: ModuleDeclaration["provides"], slots: ModuleDeclaration["slots"]): Metadata {
  return { factory: neverCalled, declaration: {
    kind: "get-modular.module-declaration", schemaVersion: 1, moduleId: id, implementationId: id,
    owner: { authority: "completion", path: ["scale"] }, provides, slots,
  } };
}

test("an unresolved slot retains precedence over overflow from otherwise inferred bindings", () => {
  const byId = new Map<string, Metadata>([
    [providerDeclaration.implementationId, { declaration: providerDeclaration, factory: neverCalled }],
    [consumerDeclaration.implementationId, metadata(consumerDeclaration.implementationId, [], [
      ...consumerDeclaration.slots, Value.slot("optional", optional()),
    ])],
  ]);
  const result = deriveProfile({
    profileId: "completion/unresolved", bindings: Array.from({ length: 65536 }, (_, index) => row(index, 0)),
    byId, groupPaths: new Map(), rootModuleIds: [consumerDeclaration.moduleId],
  });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected unresolved binding");
  assert.deepEqual(result.unresolved.map(binding => ({ slot: binding.slotId, candidates: binding.candidates })), [
    { slot: "optional", candidates: [providerDeclaration.implementationId] },
  ]);
});

test("repeated unresolved slots share complete immutable candidates and retain deterministic diagnostics", () => {
  const byId = new Map<string, Metadata>();
  const expected = Array.from({ length: 1024 }, (_, index) => `completion/p${String(index).padStart(4, "0")}`);
  for (const id of [...expected].reverse()) byId.set(id, metadata(id, [Value.provide(), Value.provide()], []));
  const slots = Array.from({ length: 128 }, (_, index) => Value.slot(`slot-${String(index).padStart(3, "0")}`, required()));
  const groupPaths = new Map<string, readonly string[]>();
  for (let index = 15; index >= 0; index -= 1) {
    const id = `completion/c${String(index).padStart(2, "0")}`;
    byId.set(id, metadata(id, [], slots));
    groupPaths.set(id, ["outer", "consumer"]);
  }
  const result = deriveProfile({ profileId: "completion/scale", bindings: undefined, byId, groupPaths, rootModuleIds: [] });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected unresolved bindings");
  assert.equal(result.unresolved.length, 2048);
  assert.equal(new Set(result.unresolved.map(binding => binding.candidates)).size, 1,
    "one capability candidate snapshot must serve all consumers that do not provide it");
  const expectedRows = Array.from({ length: 16 }, (_, consumerIndex) =>
    Array.from({ length: 128 }, (_, slotIndex) => ({
      consumerImplementationId: `completion/c${String(consumerIndex).padStart(2, "0")}`,
      slotId: `slot-${String(slotIndex).padStart(3, "0")}`, capabilityId: "completion/value",
      cardinality: "required", groupPath: ["outer", "consumer"], candidates: expected,
    }))).flat();
  assert.deepEqual(result.unresolved, expectedRows);
  assert.ok(Object.isFrozen(result.unresolved[0]!.candidates));
  assert.ok(Object.isFrozen(result.unresolved[0]!.groupPath));
  assert.equal(new Set(result.unresolved.slice(0, 128).map(binding => binding.groupPath)).size, 1);
});

test("candidate snapshots exclude only the consumer, share repeated exclusions, and include other revisions", () => {
  const later = defineContract<number>()({ id: "completion/value", revision: 2 });
  const slots = [Value.slot("a", required()), Value.slot("b", required())];
  const byId = new Map([
    ["completion/z", metadata("completion/z", [later.provide()], slots)],
    ["completion/a", metadata("completion/a", [Value.provide()], slots)],
    ["completion/m", metadata("completion/m", [Value.provide()], slots)],
  ]);
  const result = deriveProfile({ profileId: "completion/self", bindings: undefined, byId, groupPaths: new Map(), rootModuleIds: [] });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected ambiguous bindings");
  assert.equal(result.unresolved.length, 6);
  for (const [index, candidates] of [[0, ["completion/m", "completion/z"]], [2, ["completion/a", "completion/z"]],
    [4, ["completion/a", "completion/m"]]] as const) {
    assert.deepEqual(result.unresolved[index]!.candidates, candidates);
    assert.equal(result.unresolved[index]!.candidates, result.unresolved[index + 1]!.candidates);
    assert.ok(Object.isFrozen(result.unresolved[index]!.candidates));
  }
});

test("profile identity sorting preserves Unicode code point order and the original explicit row", () => {
  // This unit-level profile input deliberately bypasses Core's stricter identifier grammar.
  // The private ordering function must retain its previous code point semantics.
  const bmp = "completion/\uE000";
  const astral = "completion/\u{10000}";
  const consumerId = "completion/consumer";
  const byId = new Map<string, Metadata>([
    [astral, metadata(astral, [Value.provide()], [])],
    [bmp, metadata(bmp, [Value.provide()], [])],
    [consumerId, metadata(consumerId, [], [Value.slot("value", required())])],
    ["completion/provider", metadata("completion/provider", [Value.provide()], [])],
  ]);
  const explicit: Row = {
    consumerImplementationId: consumerId,
    slotId: "value",
    providerImplementationIds: ["completion/provider"],
  };
  const result = deriveProfile({
    profileId: "completion/codepoints",
    bindings: [explicit],
    byId,
    groupPaths: new Map(),
    rootModuleIds: [astral, bmp],
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("explicitly completed profile rejected");
  assert.deepEqual(result.profile.roots, [bmp, astral]);
  assert.deepEqual(result.profile.selections.map(({ implementationId }) => implementationId), [consumerId, "completion/provider", bmp, astral]);
  assert.deepEqual(result.profile.bindings, [explicit]);
});
