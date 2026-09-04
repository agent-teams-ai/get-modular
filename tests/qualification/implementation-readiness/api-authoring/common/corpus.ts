import { deepFreeze, type Binding, type Declaration, type Expected, type Scenario, type Slot, type World } from "./types.js";

const cap = (id: string, version = 1) => ({ id, version } as const);
const card = {
  required: { kind: "required" } as const,
  optional: { kind: "optional" } as const,
  many: (min: number, max: number) => ({ kind: "many", min, max } as const),
};
const decl = (moduleId: string, implementationId: string, provides: readonly ReturnType<typeof cap>[] = [], slots: readonly Slot[] = []): Declaration => ({
  moduleId, implementationId, owner: { authority: "lab", feature: moduleId }, provides, slots,
});
const provider = (name: string, capability = "lab/service", version = 1) => decl(`lab/${name}`, `lab/${name}/default`, [cap(capability, version)]);
const consumer = (slot: Slot = { id: "service", capability: cap("lab/service"), cardinality: card.required }) => decl("lab/consumer", "lab/consumer/default", [], [slot]);
const bind = (providers: readonly string[], slotId = "service", consumerId = "lab/consumer/default"): Binding => ({ consumerImplementationId: consumerId, slotId, providerImplementationIds: providers });
const world = (declarations: readonly Declaration[], bindings: readonly Binding[], roots = ["lab/consumer"], selections?: readonly { moduleId: string; implementationId: string }[], extra?: Partial<World>): World => ({
  declarations,
  profile: {
    roots,
    selections: selections ?? declarations.map(({ moduleId, implementationId }) => ({ moduleId, implementationId })),
    bindings,
  },
  ...extra,
});
const ok = (inventory?: readonly string[], dependencyOrder?: readonly string[]): Expected => ({ ok: true, codes: [], inventory, dependencyOrder });
const bad = (...codes: string[]): Expected => ({ ok: false, codes });
const p1 = "lab/provider-a/default";
const p2 = "lab/provider-b/default";
const p3 = "lab/provider-c/default";
const requiredBase = world([consumer(), provider("provider-a")], [bind([p1])]);
const manyWorld = (count: number, min: number, max: number): World => {
  const providers = [provider("provider-a"), provider("provider-b"), provider("provider-c")].slice(0, count);
  return world([consumer({ id: "service", capability: cap("lab/service"), cardinality: card.many(min, max) }), ...providers], [bind([p1, p2, p3].slice(0, count))]);
};
const scenario = (id: string, title: string, input: World, expected: Expected, evidenceClass: Scenario["evidenceClass"] = "semantic", hostProbe?: Scenario["hostProbe"]): Scenario => ({ id, title, evidenceClass, input, expected, ...(hostProbe ? { hostProbe } : {}) });

const hostile = JSON.parse('{"__proto__":"own-proto","constructor":"own-constructor","then":"own-then","é":"composed","é":"decomposed"}') as Record<string, string>;
const hostileSlots = Object.keys(hostile).map((id) => ({ id, capability: cap(`hostile/${id.normalize("NFD").replaceAll("́", "mark")}`), cardinality: card.optional } as const));
const cycleA = decl("lab/a", "lab/a/default", [], [{ id: "b", capability: cap("lab/b-cap"), cardinality: card.required }]);
const cycleB = decl("lab/b", "lab/b/default", [cap("lab/b-cap")], [{ id: "a", capability: cap("lab/a-cap"), cardinality: card.required }]);
const cycleProviderA = { ...cycleA, provides: [cap("lab/a-cap")] };

export const corpus: readonly Scenario[] = deepFreeze([
  scenario("S01", "required one", requiredBase, ok(["lab/consumer/default", p1], [p1, "lab/consumer/default"])),
  scenario("S02", "optional zero", world([consumer({ id: "service", capability: cap("lab/service"), cardinality: card.optional })], [bind([])]), ok()),
  scenario("S03", "optional one", world([consumer({ id: "service", capability: cap("lab/service"), cardinality: card.optional }), provider("provider-a")], [bind([p1])]), ok()),
  scenario("S04", "many zero", manyWorld(0, 0, 3), ok()),
  scenario("S05", "many minimum", manyWorld(1, 1, 3), ok()),
  scenario("S06", "many interior", manyWorld(2, 1, 3), ok()),
  scenario("S07", "many maximum", manyWorld(3, 1, 3), ok()),
  scenario("S08", "many below minimum", manyWorld(0, 1, 3), bad("binding.cardinality")),
  scenario("S09", "many above maximum", manyWorld(3, 0, 2), bad("binding.cardinality")),
  scenario("S10", "missing required", world([consumer()], []), bad("binding.missing")),
  scenario("S11", "duplicate module", world([consumer(), provider("provider-a"), { ...provider("provider-a"), implementationId: "lab/provider-a/other" }], [bind([p1])]), bad("module.duplicate")),
  scenario("S12", "duplicate provider", world([consumer(), provider("provider-a")], [bind([p1, p1])]), bad("binding.provider-duplicate")),
  scenario("S13", "unknown binding consumer", world([consumer(), provider("provider-a")], [bind([p1], "service", "lab/unknown/default")]), bad("binding.consumer-unknown", "binding.missing")),
  scenario("S14", "unknown provider", world([consumer()], [bind(["lab/unknown/default"])]), bad("binding.provider-unknown")),
  scenario("S15", "provider not selected", world([consumer(), provider("provider-a")], [bind([p1])], undefined, [{ moduleId: "lab/consumer", implementationId: "lab/consumer/default" }]), bad("binding.provider-unselected")),
  scenario("S16", "capability mismatch", world([consumer(), provider("provider-a", "lab/other")], [bind([p1])]), bad("binding.capability")),
  scenario("S17", "version mismatch", world([consumer(), provider("provider-a", "lab/service", 2)], [bind([p1])]), bad("binding.version")),
  scenario("S18", "dependency cycle", world([cycleProviderA, cycleB], [bind(["lab/b/default"], "b", "lab/a/default"), bind(["lab/a/default"], "a", "lab/b/default")], ["lab/a"]), bad("graph.cycle")),
  scenario("S19", "multiple roots", world([provider("provider-a"), provider("provider-b")], [], ["lab/provider-b", "lab/provider-a"]), ok([p1, p2], [p1, p2])),
  scenario("S20", "unreachable selection", world([provider("provider-a"), provider("provider-b")], [], ["lab/provider-a"]), bad("graph.unreachable")),
  scenario("S21", "permutation determinism", world([provider("provider-b"), consumer(), provider("provider-a")], [bind([p1])], ["lab/consumer", "lab/provider-b"]), ok(["lab/consumer/default", p1, p2])),
  scenario("S22", "bounded diagnostics", world([consumer()], [bind(["lab/z/default"]), bind(["lab/y/default"], "other"), bind(["lab/x/default"], "third")], undefined, undefined, { diagnosticLimit: 2 }), bad("binding.provider-unknown", "binding.provider-unknown")),
  scenario("S23", "cascade suppression", world([consumer()], [bind(["lab/unknown/default"])]), bad("binding.provider-unknown")),
  scenario("S24", "no implicit fallback", world([consumer(), provider("provider-a"), provider("provider-b")], []), bad("binding.missing")),
  scenario("S25", "hostile own keys and Unicode", world([decl("lab/hostile", "lab/hostile/default", [], hostileSlots)], [], ["lab/hostile"], undefined, { hostile }), ok(), "representation"),
  scenario("S26", "unknown field rejected", { ...requiredBase, extra: { surprise: true } }, bad("input.unknown-field"), "representation"),
  scenario("S27", "inert JSON round trip", requiredBase, ok(), "representation"),
  scenario("S28", "discovery imports no executable", requiredBase, ok(), "representation"),
  scenario("S29", "direct Pure DI host", requiredBase, ok(), "host-probe", "direct-pure-di"),
  scenario("S30", "selected literal loader host", requiredBase, ok(), "host-probe", "selected-literal-loader"),
] satisfies readonly Scenario[]);
