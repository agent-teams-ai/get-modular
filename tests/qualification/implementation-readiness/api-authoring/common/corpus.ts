import { deepFreeze, type Binding, type Declaration, type Expected, type Scenario, type Slot, type World } from "./types.js";

const cap = (id: string, version = 1) => ({ id, version } as const);
const card = {
  required: { kind: "required" } as const,
  optional: { kind: "optional" } as const,
  many: (min: number, max: number) => ({ kind: "many", min, max, order: "profile" } as const),
};
const decl = (moduleId: string, implementationId: string, provides: readonly ReturnType<typeof cap>[] = [], slots: readonly Slot[] = []): Declaration => ({
  moduleId, implementationId, owner: { authority: "lab", path: moduleId.split("/").slice(1) }, provides, slots,
});
const provider = (name: string, capability = "lab/service", version = 1): Declaration => decl(`lab/${name}`, `lab/${name}/default`, [cap(capability, version)]);
const consumer = (slot?: Slot): Declaration => decl("lab/consumer", "lab/consumer/default", [], slot ? [slot] : []);
const serviceSlot = (cardinality: Slot["cardinality"] = card.required, id = "service"): Slot => ({ id, capability: cap("lab/service"), cardinality });
const bind = (providers: readonly string[], slotId = "service", consumerId = "lab/consumer/default"): Binding => ({ consumerImplementationId: consumerId, slotId, providerImplementationIds: providers });
const world = (
  declarations: readonly Declaration[], bindings: readonly Binding[], roots: readonly string[],
  selections: readonly { moduleId: string; implementationId: string }[] = declarations.map(({ moduleId, implementationId }) => ({ moduleId, implementationId })),
  extra: Pick<World, "desiredProfile" | "fallbackBindings"> = {},
): World => ({ declarations, profile: { roots, selections, bindings }, ...extra });
const ok = (inventory?: readonly string[], dependencyOrder?: readonly string[]): Expected => ({ ok: true, codes: [], inventory, dependencyOrder });
const bad = (...codes: string[]): Expected => ({ ok: false, codes });
const scenario = (id: string, title: string, input: World, expected: Expected, evidenceClass: Scenario["evidenceClass"] = "semantic", hostProbe?: Scenario["hostProbe"]): Scenario => ({ id, title, input, expected, evidenceClass, ...(hostProbe ? { hostProbe } : {}) });

const c = "lab/consumer/default";
const p1 = "lab/provider-a/default";
const p2 = "lab/provider-b/default";
const p3 = "lab/provider-c/default";
const requiredBase = world([consumer(serviceSlot()), provider("provider-a")], [bind([p1])], ["lab/consumer"]);
const manyWorld = (providers: readonly Declaration[]): World => world(
  [consumer(serviceSlot(card.many(0, 3))), ...providers], [bind(providers.map(({ implementationId }) => implementationId))], ["lab/consumer"],
);
const cycleA = decl("lab/a", "lab/a/default", [cap("lab/a-cap")], [{ id: "b", capability: cap("lab/b-cap"), cardinality: card.required }]);
const cycleB = decl("lab/b", "lab/b/default", [cap("lab/b-cap")], [{ id: "a", capability: cap("lab/a-cap"), cardinality: card.required }]);
const hostileIds = ["constructor", "then"] as const;
const hostileDeclaration = decl("lab/hostile", "lab/hostile/default", [], hostileIds.map((id) => ({ id, capability: cap("lab/hostile"), cardinality: card.optional })));
const hostileBindings = hostileIds.map((id) => bind([], id, "lab/hostile/default"));
const declarationWithUnknownField = { ...provider("provider-a"), executable: "not-allowed-even-when-inert" } as Declaration;
const invalidOwner = { ...provider("provider-a"), owner: { authority: "lab", path: ["provider-a/source.ts"] } } as Declaration;

export const corpus: readonly Scenario[] = deepFreeze([
  scenario("S01", "one provider", world([provider("provider-a")], [], ["lab/provider-a"]), ok([p1], [p1])),
  scenario("S02", "one consumer", world([consumer()], [], ["lab/consumer"]), ok([c], [c])),
  scenario("S03", "required dependency", requiredBase, ok([c, p1], [p1, c])),
  scenario("S04", "missing required dependency", world([consumer(serviceSlot())], [bind([])], ["lab/consumer"]), bad("binding.missing")),
  scenario("S05", "missing optional dependency", world([consumer(serviceSlot(card.optional))], [bind([])], ["lab/consumer"]), ok([c], [c])),
  scenario("S06", "zero many", manyWorld([]), ok([c], [c])),
  scenario("S07", "one many", manyWorld([provider("provider-a")]), ok([c, p1], [p1, c])),
  scenario("S08", "multiple many", manyWorld([provider("provider-a"), provider("provider-b"), provider("provider-c")]), ok([c, p1, p2, p3], [p1, p2, p3, c])),
  scenario("S09", "duplicate provider", world([consumer(serviceSlot(card.many(0, 3))), provider("provider-a")], [bind([p1, p1])], ["lab/consumer"]), bad("binding.duplicate")),
  scenario("S10", "ambiguous binding", world([consumer(serviceSlot()), provider("provider-a"), provider("provider-b")], [bind([p1, p2])], ["lab/consumer"]), bad("binding.cardinality")),
  scenario("S11", "incompatible capability", world([consumer(serviceSlot()), provider("provider-a", "lab/other")], [bind([p1])], ["lab/consumer"]), bad("binding.capability-missing")),
  scenario("S12", "dependency cycle", world([cycleA, cycleB], [bind(["lab/b/default"], "b", "lab/a/default"), bind(["lab/a/default"], "a", "lab/b/default")], ["lab/a"]), bad("graph.cycle")),
  scenario("S13", "disabled root", world([provider("provider-a")], [], ["lab/provider-a"], undefined, { desiredProfile: { disabledModuleIds: ["lab/provider-a"] } }), bad("host.profile.root-disabled")),
  scenario("S14", "disabled required provider", world([consumer(serviceSlot()), provider("provider-a")], [bind([p1])], ["lab/consumer"], undefined, { desiredProfile: { disabledModuleIds: ["lab/provider-a"] } }), bad("binding.missing")),
  scenario("S15", "disabled optional provider", world([consumer(serviceSlot(card.optional)), provider("provider-a")], [bind([p1])], ["lab/consumer"], undefined, { desiredProfile: { disabledModuleIds: ["lab/provider-a"] } }), ok([c], [c])),
  scenario("S16", "unreachable provider", world([consumer(serviceSlot()), provider("provider-a"), provider("provider-b")], [bind([p1])], ["lab/consumer"]), bad("profile.unreachable-selection")),
  scenario("S17", "multiple roots", world([provider("provider-a"), provider("provider-b")], [], ["lab/provider-b", "lab/provider-a"]), ok([p1, p2], [p1, p2])),
  scenario("S18", "deterministic reorder", world([provider("provider-b"), consumer(serviceSlot()), provider("provider-a")], [bind([p1])], ["lab/provider-b", "lab/consumer"]), ok([c, p1, p2], [p1, c, p2])),
  scenario("S19", "hostile slot names: own __proto__, constructor, then, composed and decomposed Unicode", world([hostileDeclaration], hostileBindings, ["lab/hostile"]), ok(["lab/hostile/default"], ["lab/hostile/default"]), "representation"),
  scenario("S20", "unknown declaration fields", world([declarationWithUnknownField], [], ["lab/provider-a"]), bad("schema.unknown-field"), "representation"),
  scenario("S21", "duplicate profile selections", world([provider("provider-a"), { ...provider("provider-a"), implementationId: "lab/provider-a/other" }], [], ["lab/provider-a"]), bad("profile.duplicate-selection")),
  scenario("S22", "duplicate implementation IDs", world([provider("provider-a"), { ...provider("provider-b"), implementationId: p1 }], [], ["lab/provider-a"]), bad("declaration.duplicate-implementation")),
  scenario("S23", "invalid owner path", world([invalidOwner], [], ["lab/provider-a"]), bad("schema.invalid-value"), "representation"),
  scenario("S24", "profile with unknown module", world([], [], ["lab/unknown"], [{ moduleId: "lab/unknown", implementationId: "lab/unknown/default" }]), bad("profile.unknown-module")),
  scenario("S25", "hidden fallback attempt", world([consumer(serviceSlot()), provider("provider-a")], [], ["lab/consumer"], undefined, { fallbackBindings: [bind([p1])] }), bad("binding.missing")),
  scenario("S26", "discovery without executable imports", requiredBase, ok([c, p1], [p1, c]), "representation"),
  scenario("S27", "literal loader table for selected modules only", world([consumer(serviceSlot()), provider("provider-a"), provider("unselected")], [bind([p1])], ["lab/consumer"], [{ moduleId: "lab/consumer", implementationId: c }, { moduleId: "lab/provider-a", implementationId: p1 }]), ok([c, p1], [p1, c]), "host-probe", "selected-literal-loaders"),
  scenario("S28", "direct Pure DI parity", requiredBase, ok([c, p1], [p1, c]), "host-probe", "direct-pure-di-parity"),
  scenario("S29", "declaration serializability", requiredBase, ok([c, p1], [p1, c]), "representation"),
  scenario("S30", "TypeScript declaration emit", requiredBase, ok([c, p1], [p1, c]), "representation"),
] satisfies readonly Scenario[]);
