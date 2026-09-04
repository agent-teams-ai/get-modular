import type { Binding, CompositionInput, Declaration, Diagnostic, Outcome, Profile } from "./types.js";

const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
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

export function qualify(world: CompositionInput): Outcome {
  if ("desiredProfile" in world) throw new Error("desired state requires Host preprocessing");
  const diagnostics: Diagnostic[] = [];
  const modules = new Set<string>();
  const byImplementation = new Map<string, Declaration>();
  for (const declaration of world.declarations) {
    for (const key of Object.keys(declaration)) {
      if (!declarationKeys.has(key)) diagnostics.push(diagnostic("schema.unknown-field", `/declarations/${declaration.implementationId}/${key}`, key));
    }
    declaration.owner.path.forEach((segment, index) => {
      if (!ownerSegment.test(segment)) diagnostics.push(diagnostic("schema.invalid-value", `/declarations/${declaration.implementationId}/owner/path/${index}`, segment));
    });
    modules.add(declaration.moduleId);
    if (byImplementation.has(declaration.implementationId)) diagnostics.push(diagnostic("declaration.duplicate-implementation", `/implementations/${declaration.implementationId}`, declaration.implementationId));
    else byImplementation.set(declaration.implementationId, declaration);
  }
  const profile = world.profile;
  const inventory = [...new Set(profile.selections.map((item) => item.implementationId))].sort(compare);
  if (diagnostics.length) return finish(diagnostics, inventory);
  const selectedModules = new Set<string>();
  for (const selection of profile.selections) {
    if (selectedModules.has(selection.moduleId)) diagnostics.push(diagnostic("profile.duplicate-selection", `/profile/selections/${selection.moduleId}`, selection.moduleId));
    selectedModules.add(selection.moduleId);
    if (!modules.has(selection.moduleId)) diagnostics.push(diagnostic("profile.unknown-module", `/profile/selections/${selection.moduleId}`, selection.moduleId));
    else {
      const implementation = byImplementation.get(selection.implementationId);
      if (!implementation) diagnostics.push(diagnostic("profile.unknown-implementation", `/profile/selections/${selection.moduleId}`, selection.implementationId));
      else if (implementation.moduleId !== selection.moduleId) diagnostics.push(diagnostic("profile.implementation-mismatch", `/profile/selections/${selection.moduleId}`, selection.implementationId));
    }
  }
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
      diagnostics.push(diagnostic("binding.unknown-consumer", bindingPath(binding), binding.consumerImplementationId));
      continue;
    }
    if (new Set(binding.providerImplementationIds).size !== binding.providerImplementationIds.length) {
      diagnostics.push(diagnostic("binding.duplicate", bindingPath(binding), binding.providerImplementationIds.join(",")));
      continue;
    }
    const slot = consumer.slots.find((item) => item.id === binding.slotId);
    if (!slot) {
      diagnostics.push(diagnostic("binding.unknown-slot", bindingPath(binding), binding.slotId));
      continue;
    }
    if ((slot.cardinality.kind === "required" || slot.cardinality.kind === "optional") && binding.providerImplementationIds.length > 1) {
      diagnostics.push(diagnostic("binding.cardinality", bindingPath(binding), binding.providerImplementationIds.join(",")));
      continue;
    }
    const unknownProviders = binding.providerImplementationIds.filter((id) => !byImplementation.has(id));
    for (const id of unknownProviders) diagnostics.push(diagnostic("binding.unknown-provider", bindingPath(binding, id), id));
    if (unknownProviders.length) continue;
    for (const providerId of binding.providerImplementationIds) {
      const provider = byImplementation.get(providerId)!;
      if (!selectedIds.has(providerId)) {
        diagnostics.push(diagnostic("binding.provider-not-selected", bindingPath(binding, providerId), providerId));
        continue;
      }
      const compatible = provider.provides.find((item) => item.id === slot.capability.id);
      if (!compatible) diagnostics.push(diagnostic("binding.capability-missing", bindingPath(binding, providerId), slot.capability.id));
      else if (compatible.version !== slot.capability.version) diagnostics.push(diagnostic("binding.compatibility-mismatch", bindingPath(binding, providerId), slot.capability.id));
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
  for (const id of inventory) if (!reachable.has(id)) diagnostics.push(diagnostic("profile.unreachable-selection", `/implementations/${id}`, id));

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
