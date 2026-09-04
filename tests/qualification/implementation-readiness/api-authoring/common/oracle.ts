import type { Binding, Declaration, Diagnostic, Outcome, World } from "./types.js";

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const own = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key);
const diagnostic = (code: string, path: string, detail: string): Diagnostic => ({ code, path, detail });
const bindingPath = (binding: Binding, provider = "") => `/bindings/${binding.consumerImplementationId}/${binding.slotId}${provider ? `/${provider}` : ""}`;

function finish(world: World, diagnostics: Diagnostic[], inventory: string[], dependencyOrder: string[] = []): Outcome {
  diagnostics.sort((a, b) => compare(a.code, b.code) || compare(a.path, b.path) || compare(a.detail, b.detail));
  const retained = diagnostics.slice(0, world.diagnosticLimit ?? 32);
  return Object.freeze({
    ok: retained.length === 0,
    diagnostics: Object.freeze(retained.map((item) => Object.freeze(item))),
    inventory: Object.freeze([...inventory]),
    dependencyOrder: Object.freeze([...dependencyOrder]),
  });
}

function selectedDeclarations(world: World, byImplementation: Map<string, Declaration>): Declaration[] {
  const result: Declaration[] = [];
  for (const selection of world.profile.selections) {
    const declaration = byImplementation.get(selection.implementationId);
    if (declaration && declaration.moduleId === selection.moduleId) result.push(declaration);
  }
  return result;
}

export function qualify(world: World): Outcome {
  const diagnostics: Diagnostic[] = [];
  if (own(world, "extra")) diagnostics.push(diagnostic("input.unknown-field", "/extra", "closed world has an unknown field"));
  const byModule = new Map<string, Declaration>();
  const byImplementation = new Map<string, Declaration>();
  for (const declaration of world.declarations) {
    if (byModule.has(declaration.moduleId)) diagnostics.push(diagnostic("module.duplicate", `/modules/${declaration.moduleId}`, declaration.moduleId));
    else byModule.set(declaration.moduleId, declaration);
    if (byImplementation.has(declaration.implementationId)) diagnostics.push(diagnostic("implementation.duplicate", `/implementations/${declaration.implementationId}`, declaration.implementationId));
    else byImplementation.set(declaration.implementationId, declaration);
  }
  const inventory = [...new Set(world.profile.selections.map((item) => item.implementationId))].sort(compare);
  if (diagnostics.length) return finish(world, diagnostics, inventory);

  const selected = selectedDeclarations(world, byImplementation);
  const selectedIds = new Set(selected.map((item) => item.implementationId));
  const bindingBySlot = new Map<string, Binding>();
  const validEdges: Array<readonly [string, string]> = [];
  for (const binding of world.profile.bindings) {
    const key = `${binding.consumerImplementationId}\u0000${binding.slotId}`;
    bindingBySlot.set(key, binding);
    const consumer = byImplementation.get(binding.consumerImplementationId);
    const unknownProviders = binding.providerImplementationIds.filter((id) => !byImplementation.has(id));
    if (!consumer) {
      diagnostics.push(diagnostic("binding.consumer-unknown", bindingPath(binding), binding.consumerImplementationId));
      continue;
    }
    if (new Set(binding.providerImplementationIds).size !== binding.providerImplementationIds.length) {
      diagnostics.push(diagnostic("binding.provider-duplicate", bindingPath(binding), binding.providerImplementationIds.join(",")));
      continue;
    }
    for (const id of unknownProviders) diagnostics.push(diagnostic("binding.provider-unknown", bindingPath(binding, id), id));
    if (unknownProviders.length) continue;
    const slot = consumer.slots.find((item) => item.id === binding.slotId);
    if (!slot) {
      diagnostics.push(diagnostic("binding.slot-unknown", bindingPath(binding), binding.slotId));
      continue;
    }
    for (const providerId of binding.providerImplementationIds) {
      const provider = byImplementation.get(providerId)!;
      if (!selectedIds.has(providerId)) {
        diagnostics.push(diagnostic("binding.provider-unselected", bindingPath(binding, providerId), providerId));
        continue;
      }
      const compatible = provider.provides.find((item) => item.id === slot.capability.id);
      if (!compatible) diagnostics.push(diagnostic("binding.capability", bindingPath(binding, providerId), slot.capability.id));
      else if (compatible.version !== slot.capability.version) diagnostics.push(diagnostic("binding.version", bindingPath(binding, providerId), `${compatible.version}!=${slot.capability.version}`));
      else validEdges.push([consumer.implementationId, providerId]);
    }
    const count = binding.providerImplementationIds.length;
    const cardinalityOk = slot.cardinality.kind === "required" ? count === 1
      : slot.cardinality.kind === "optional" ? count <= 1
      : count >= slot.cardinality.min && count <= slot.cardinality.max;
    if (!cardinalityOk) diagnostics.push(diagnostic("binding.cardinality", bindingPath(binding), String(count)));
  }
  for (const declaration of selected) {
    for (const slot of declaration.slots) {
      const key = `${declaration.implementationId}\u0000${slot.id}`;
      if (!bindingBySlot.has(key) && slot.cardinality.kind !== "optional" && !(slot.cardinality.kind === "many" && slot.cardinality.min === 0)) {
        diagnostics.push(diagnostic("binding.missing", `/bindings/${declaration.implementationId}/${slot.id}`, slot.id));
      }
    }
  }
  if (diagnostics.length) return finish(world, diagnostics, inventory);

  const selectedByModule = new Map(world.profile.selections.map((item) => [item.moduleId, item.implementationId]));
  const reachable = new Set<string>();
  const dependencies = new Map<string, string[]>();
  for (const id of inventory) dependencies.set(id, []);
  for (const [consumer, provider] of validEdges) dependencies.get(consumer)?.push(provider);
  const pending = world.profile.roots.map((root) => selectedByModule.get(root)).filter((item): item is string => item !== undefined);
  while (pending.length) {
    const id = pending.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    pending.push(...(dependencies.get(id) ?? []));
  }
  for (const id of inventory) if (!reachable.has(id)) diagnostics.push(diagnostic("graph.unreachable", `/implementations/${id}`, id));

  const consumers = new Map<string, string[]>();
  const indegree = new Map(inventory.map((id) => [id, 0]));
  for (const [consumer, provider] of validEdges) {
    consumers.set(provider, [...(consumers.get(provider) ?? []), consumer]);
    indegree.set(consumer, (indegree.get(consumer) ?? 0) + 1);
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
  return finish(world, diagnostics, inventory, diagnostics.length ? [] : order);
}
