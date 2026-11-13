import assert from "node:assert/strict";
import test from "node:test";
import {
  AssemblyBindingError, assemblyFor, captureWiringInputs, createEntryFamily, declareModule,
  defineContract, group, implement, injectionDependencies, input, snapshotFactoryProduct,
  type CapabilitiesOf, type WiringPreparationResult,
} from "../dist/index.js";
import { many, optional, required } from "@get-modular/core";

const Value = defineContract<object>()({ id: "wiring/value", revision: 1 });
type Capabilities = CapabilitiesOf<typeof Value>;
const providerDeclaration = declareModule({
  moduleId: "wiring/provider", implementationId: "wiring/provider",
  owner: { authority: "wiring", path: ["provider"] }, provides: [Value.provide()], slots: [],
});
const independentDeclaration = declareModule({
  moduleId: providerDeclaration.moduleId, implementationId: providerDeclaration.implementationId,
  owner: providerDeclaration.owner, provides: [], slots: [],
});
const rootDeclaration = declareModule({
  moduleId: "wiring/root", implementationId: "wiring/root",
  owner: { authority: "wiring", path: ["root"] }, provides: [],
  slots: [Value.slot("value", required()), Value.slot("maybe", optional()),
    Value.slot("values", many({ min: 1, max: 2 }))],
});
const bindings = [
  { consumerImplementationId: rootDeclaration.implementationId, slotId: "maybe", providerImplementationIds: [] },
  { consumerImplementationId: rootDeclaration.implementationId, slotId: "values",
    providerImplementationIds: [providerDeclaration.implementationId] },
];
type OpaqueFactory = () => string;
function prepared<F>(result: WiringPreparationResult<F>): Extract<WiringPreparationResult<F>, { readonly status: "prepared" }> {
  if (result.status !== "prepared") {throw new Error(`fixture failed: ${result.error.code}`);}
  return result;
}

test("shared preparation preserves exact slots and canonical Promise composition without executing payloads", async () => {
  const family = createEntryFamily<OpaqueFactory>();
  let calls = 0;
  const factory = (): string => { calls += 1; return "opaque"; };
  const provider = family.capture(providerDeclaration, factory);
  const root = family.capture(rootDeclaration, factory);
  const native = prepared(await family.prepare({ profileId: "wiring/profile", modules: [family.group("feature", [provider, root])],
    roots: { root }, bindings }));
  assert.equal(calls, 0);
  assert.equal(native.wiring.steps[0]!.metadata.factory, factory);
  assert.ok(Object.isFrozen(native.wiring.steps[1]!.injections));
  const value = {};
  const dependencies = injectionDependencies(native.wiring.steps[1]!.injections, (id, capability) => {
    assert.equal(id, providerDeclaration.implementationId);
    assert.equal(capability, Value.id);
    return value;
  });
  assert.equal(Object.getPrototypeOf(dependencies), null);
  assert.deepEqual(Object.keys(dependencies).sort(), ["maybe", "value", "values"]);
  assert.equal(dependencies.value, value);
  assert.equal(dependencies.maybe, undefined);
  assert.deepEqual(dependencies.values, [value]);
  assert.ok(Object.isFrozen(dependencies.values));
  const promisedProvider = implement<Capabilities>()(providerDeclaration, async () => ({ instance: value, capabilities: { [Value.id]: value } }));
  const promisedRoot = implement<Capabilities>()(rootDeclaration, async (deps) => ({ instance: deps, capabilities: {} }));
  const promised = await assemblyFor<Capabilities>().prepare({ profileId: "wiring/profile",
    modules: [group("different label", [promisedProvider, promisedRoot])], roots: { root: promisedRoot }, bindings });
  assert.equal(promised.status, "prepared");
  if (promised.status !== "prepared") {throw new Error("Promise fixture failed");}
  assert.deepEqual(native.composition, promised.composition);
});

test("families reject foreign or forged entries and groups even when declarations and payloads match", async () => {
  const first = createEntryFamily<OpaqueFactory>();
  const second = createEntryFamily<OpaqueFactory>();
  const declaration = independentDeclaration;
  const root = first.capture(declaration, () => "opaque");
  const foreign = second.capture(declaration, root.factory);
  const foreignGroup = second.group("foreign", [foreign]);
  const copied = { ...root };
  Object.setPrototypeOf(copied, null);
  const copies = [foreign, foreignGroup, copied] as const;
  for (const suspect of copies) {
    const result = await first.prepare({ profileId: "wiring/auth", modules: [suspect], roots: { root } });
    assert.equal(result.status, "failed");
    if (result.status === "failed") {assert.equal(result.error.code, "assembly.prepare.handles");}
  }
  assert.throws(() => first.group("foreign", [foreign]), (cause) => cause instanceof AssemblyBindingError
    && cause.code === "assembly.bind.invalid-group");
  assert.throws(() => first.entriesOf([foreignGroup]), AssemblyBindingError);
  const forged = { ...root, factory: () => "substituted" };
  Object.setPrototypeOf(forged, null);
  const result = await first.prepare({ profileId: "wiring/forged", modules: [forged], roots: { root: forged } });
  assert.equal(result.status, "failed");
});

test("captured declarations, aliases, group members and factories are fixed before compilation awaits", async () => {
  const family = createEntryFamily<OpaqueFactory>();
  const source = structuredClone(independentDeclaration);
  const original = (): string => "original";
  const root = family.capture(source, original);
  Reflect.set(source, "implementationId", "wiring/changed");
  const roots = { root };
  const members = [root] as const;
  const bundled = family.group("captured", members);
  const pending = family.prepare({ profileId: "wiring/snapshot", modules: [bundled], roots });
  Reflect.set(roots, "root", {});
  Reflect.set(members, "0", {});
  const result = prepared(await pending);
  assert.deepEqual(result.wiring.roots, [{ alias: "root", implementationId: providerDeclaration.implementationId }]);
  assert.equal(result.wiring.steps[0]!.metadata.factory, original);
  assert.equal(result.wiring.steps[0]!.metadata.declaration.implementationId, providerDeclaration.implementationId);
  assert.ok(Object.isFrozen(result.wiring.steps[0]!.metadata.declaration));
  assert.equal(Object.isFrozen(source), false);
  assert.deepEqual(family.entriesOf([bundled]), [root]);
});

test("neutral inputs have no factory and value snapshots borrow opaque objects without invoking accessors", async () => {
  const family = createEntryFamily<OpaqueFactory>();
  const provided = input<Capabilities>()(providerDeclaration);
  const root = family.capture(rootDeclaration, () => "opaque");
  const { wiring } = prepared(await family.prepare({ profileId: "wiring/inputs", modules: [root],
    roots: { root }, inputs: { shared: provided }, bindings }));
  const metadata = wiring.inputs[0]!.metadata;
  assert.equal(metadata.input, true);
  assert.equal(Object.hasOwn(metadata, "factory"), false);
  let reads = 0;
  const value = { then: (): never => { throw new Error("opaque values must not be awaited"); } };
  const record = { [Value.id]: value };
  const captured = captureWiringInputs(wiring, { shared: record });
  Reflect.set(record, Value.id, {});
  assert.equal(captured.get(providerDeclaration.implementationId)!.capabilities[Value.id], value);
  assert.equal(Object.isFrozen(value), false);
  assert.throws(() => captureWiringInputs(wiring, { get shared() { reads += 1; return record; } }));
  assert.throws(() => snapshotFactoryProduct(providerDeclaration, { get instance() { reads += 1; return value; }, capabilities: record }));
  assert.equal(reads, 0);
  assert.throws(() => captureWiringInputs(wiring, { shared: {}, extra: {} }));
});

// These are rejecting public controls: the low-level family does not broaden Promise APIs.
function rejectForeignCarrier(): void {
  const family = createEntryFamily<OpaqueFactory>();
  const entry = family.capture(providerDeclaration, () => "opaque");
  // @ts-expect-error opaque native carriers are not Promise module entries
  group("wrong carrier", [entry]);
  // @ts-expect-error Promise preparation must not accept another execution carrier
  void assemblyFor<Capabilities>().prepare({ profileId: "wiring/types", modules: [entry], roots: { root: entry } });
}
void rejectForeignCarrier;
