import type { Binding, Declaration, Diagnostic, Outcome, Profile, World } from "./types.js";

const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const own = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);
const diagnostic = (code: string, path: string, detail: string): Diagnostic => ({ code, path, detail });
const bindingPath = (binding: Binding, provider = ""): string => `/bindings/${binding.consumerImplementationId}/${binding.slotId}${provider ? `/${provider}` : ""}`;
const declarationKeys = new Set(["moduleId", "implementationId", "owner", "provides", "slots"]);
const ownerSegment = /^[a-z][a-z0-9-]*$/;

function finish(diagnostics: Diagnostic[], inventory: string[], dependencyOrder: string[] = []): Outcome {
  diagnostics.sort((a, b) => compare(a.code, b.code) || compare(a.path, b.path) || compare(a.detail, b.detail));
  return Object.freeze({
    ok: diagnostics.length === 0,
    diagnostics: Object.freeze(diagnostics.map((item) => Object.freeze(item))),
    inventory: Object.freeze([...inventory]),
    dependencyOrder: Object.freeze([...dependencyOrder]),
  });
}

function selectedDeclarations(profile: Profile, byImplementation: Map<string, Declaration>): Declaration[] {
  const result: Declaration[] = [];
  for (const selection of profile.selections) {
    const declaration = byImplementation.get(selection.implementationId);
    if (declaration && declaration.moduleId === selection.moduleId) result.push(declaration);
  }
  return result;
}

function applyDesiredProfile(world: World, byImplementation: Map<string, Declaration>, diagnostics: Diagnostic[]): Profile {
  const disabled = new Set(world.desiredProfile?.disabledModuleIds ?? []);
  for (const root of world.profile.roots) {
    if (disabled.has(root)) diagnostics.push(diagnostic("host.profile.root-disabled", `/desired-profile/disabled/${root}`, root));
  }
  const selections = world.profile.selections.filter(({ moduleId }) => !disabled.has(moduleId));
  const bindings = world.profile.bindings.map((binding) => ({
    ...binding,
    providerImplementationIds: binding.providerImplementationIds.filter((id) => {
      const declaration = byImplementation.get(id);
      return declaration === undefined || !disabled.has(declaration.moduleId);
    }),
  }));
  return { roots: world.profile.roots.filter((root) => !disabled.has(root)), selections, bindings };
}

export function qualify(world: World): Outcome {
  const diagnostics: Diagnostic[] = [];
  const byModule = new Map<string, Declaration>();
  const byImplementation = new Map<string, Declaration>();
  for (const declaration of world.declarations) {
    for (const key of Object.keys(declaration)) {
      if (!declarationKeys.has(key)) diagnostics.push(diagnostic("declaration.unknown-field", `/declarations/${declaration.implementationId}/${key}`, key));
    }
    declaration.owner.path.forEach((segment, index) => {
      if (!ownerSegment.test(segment)) diagnostics.push(diagnostic("owner.path-invalid", `/declarations/${declaration.implementationId}/owner/path/${index}`, segment));
    });
    if (byModule.has(declaration.moduleId)) diagnostics.push(diagnostic("module.duplicate", `/modules/${declaration.moduleId}`, declaration.moduleId));
    else byModule.set(declaration.moduleId, declaration);
    if (byImplementation.has(declaration.implementationId)) diagnostics.push(diagnostic("implementation.duplicate", `/implementations/${declaration.implementationId}`, declaration.implementationId));
    else byImplementation.set(declaration.implementationId, declaration);
  }
  for (const selection of world.profile.selections) {
    if (!byModule.has(selection.moduleId)) diagnostics.push(diagnostic("profile.module-unknown", `/profile/selections/${selection.moduleId}`, selection.moduleId));
  }
  const profile = applyDesiredProfile(world, byImplementation, diagnostics);
  const inventory = [...new Set(profile.selections.map((item) => item.implementationId))].sort(compare);
  if (diagnostics.length) return finish(diagnostics, inventory);

  const selected = selectedDeclarations(profile, byImplementation);
  const selectedIds = new Set(selected.map((item) => item.implementationId));
  const bindingBySlot = new Map<string, Binding>();
  const validEdges: Array<readonly [string, string]> = [];
  for (const binding of profile.bindings) {
    const key = `${binding.consumerImplementationId}\u0000${binding.slotId}`;
    bindingBySlot.set(key, binding);
    const consumer = byImplementation.get(binding.consumerImplementationId);
    if (!consumer) {
      diagnostics.push(diagnostic("binding.consumer-unknown", bindingPath(binding), binding.consumerImplementationId));
      continue;
    }
    if (new Set(binding.providerImplementationIds).size !== binding.providerImplementationIds.length) {
      diagnostics.push(diagnostic("binding.provider-duplicate", bindingPath(binding), binding.providerImplementationIds.join(",")));
      continue;
    }
    const slot = consumer.slots.find((item) => item.id === binding.slotId);
    if (!slot) {
      diagnostics.push(diagnostic("binding.slot-unknown", bindingPath(binding), binding.slotId));
      continue;
    }
    if ((slot.cardinality.kind === "required" || slot.cardinality.kind === "optional") && binding.providerImplementationIds.length > 1) {
      diagnostics.push(diagnostic("binding.ambiguous", bindingPath(binding), binding.providerImplementationIds.join(",")));
      continue;
    }
    const unknownProviders = binding.providerImplementationIds.filter((id) => !byImplementation.has(id));
    for (const id of unknownProviders) diagnostics.push(diagnostic("binding.provider-unknown", bindingPath(binding, id), id));
    if (unknownProviders.length) continue;
    for (const providerId of binding.providerImplementationIds) {
      const provider = byImplementation.get(providerId)!;
      if (!selectedIds.has(providerId)) {
        diagnostics.push(diagnostic("binding.provider-unselected", bindingPath(binding, providerId), providerId));
        continue;
      }
      const compatible = provider.provides.find((item) => item.id === slot.capability.id);
      if (!compatible || compatible.version !== slot.capability.version) diagnostics.push(diagnostic("binding.capability", bindingPath(binding, providerId), slot.capability.id));
      else validEdges.push([consumer.implementationId, providerId]);
    }
    const count = binding.providerImplementationIds.length;
    if (slot.cardinality.kind === "required" && count === 0) diagnostics.push(diagnostic("binding.missing", bindingPath(binding), slot.id));
    else if (slot.cardinality.kind === "many" && (count < slot.cardinality.min || count > slot.cardinality.max)) diagnostics.push(diagnostic("binding.cardinality", bindingPath(binding), String(count)));
  }
  for (const declaration of selected) {
    for (const slot of declaration.slots) {
      const key = `${declaration.implementationId}\u0000${slot.id}`;
      if (!bindingBySlot.has(key)) diagnostics.push(diagnostic("binding.missing", `/bindings/${declaration.implementationId}/${slot.id}`, slot.id));
    }
  }
  if (diagnostics.length) return finish(diagnostics, inventory);

  const selectedByModule = new Map<string, string>(profile.selections.map((item) => [item.moduleId, item.implementationId]));
  const dependencies = new Map<string, string[]>(inventory.map((id) => [id, []]));
  for (const [consumerId, providerId] of validEdges) dependencies.get(consumerId)?.push(providerId);
  const reachable = new Set<string>();
  const pending = profile.roots.map((root) => selectedByModule.get(root)).filter((item): item is string => item !== undefined);
  while (pending.length) {
    const id = pending.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    pending.push(...(dependencies.get(id) ?? []));
  }
  for (const id of inventory) if (!reachable.has(id)) diagnostics.push(diagnostic("graph.unreachable", `/implementations/${id}`, id));

  const consumers = new Map<string, string[]>();
  const indegree = new Map<string, number>(inventory.map((id) => [id, 0]));
  for (const [consumerId, providerId] of validEdges) {
    consumers.set(providerId, [...(consumers.get(providerId) ?? []), consumerId]);
    indegree.set(consumerId, (indegree.get(consumerId) ?? 0) + 1);
  }
  const ready = inventory.filter((id) => indegree.get(id) === 0).sort(compare);
  const order: string[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    order.push(id);
    for (const consumerId of (consumers.get(id) ?? []).sort(compare)) {
      const next = indegree.get(consumerId)! - 1;
      indegree.set(consumerId, next);
      if (next === 0) { ready.push(consumerId); ready.sort(compare); }
    }
  }
  if (order.length !== inventory.length) diagnostics.push(diagnostic("graph.cycle", "/graph", inventory.filter((id) => !order.includes(id)).sort(compare).join(",")));
  return finish(diagnostics, inventory, diagnostics.length ? [] : order);
}
