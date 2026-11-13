import type { CompositionPlan } from "@get-modular/core";
import type { DuplicateModule, PreparationErrorCode } from "./types.js";
import type { Metadata, Program } from "./ports.js";
import { SnapshotFault, data, limits, rootKeys } from "./snapshot.js";
import type { EntryStore } from "./entry-store.js";
import type { GroupCollection } from "./group-collection.js";

// Private preflight: collect authenticated entries before mapping the verified plan to execution.
export class PreparationFault extends Error {
  readonly code: PreparationErrorCode;
  constructor(code: PreparationErrorCode) { super(code); this.code = code; }
}
export function refuse(code: PreparationErrorCode): never { throw new PreparationFault(code); }

type Collected<F> = {
  readonly byEntry: Map<object, Metadata<F>>;
  readonly byId: Map<string, Metadata<F>>;
  readonly groupPaths: Map<string, readonly string[]>;
};
export class DuplicateFault extends Error {
  readonly occurrences: readonly DuplicateModule[];
  constructor(occurrences: DuplicateFault["occurrences"]) { super("assembly.prepare.duplicate-module"); this.occurrences = occurrences; }
}
// Duplicate reporting is a bounded failure path (at most 4096 handles): preserve code-unit ordering.
function sortIds(values: Iterable<string>): string[] {
  const ids: string[] = [];
  for (const value of values) {
    const next = ids.findIndex((candidate) => candidate > value);
    ids.splice(next < 0 ? ids.length : next, 0, value);
  }
  return ids;
}
// Module entries come only through `modules` (groups flattened depth first) and input entries only through
// `inputs`; together they cover every selection exactly once.
export function collectMetadata<F>(modules: readonly unknown[], inputEntries: readonly unknown[], inputAliases: readonly string[],
  entries: EntryStore<F>, groups: GroupCollection): Collected<F> {
  const walked = groups.walk(modules, (kind) => refuse(kind === "input" ? "assembly.prepare.input-handles" : "assembly.prepare.handles"));
  // Borrowed inputs consume selections, independently of the module-tree node budget.
  if (walked.entries.length + inputEntries.length > limits.handles) {throw new SnapshotFault("limit");}
  let provides = 0;
  let slots = 0;
  const all: { readonly entry: unknown; readonly metadata: Metadata<F>; readonly path: readonly string[]; readonly inputAlias?: string }[] = [];
  for (const { entry, path } of walked.entries) {
    all.push({ entry, metadata: entries.metadataFor(entry) as Metadata<F>, path });
  }
  for (const [index, entry] of inputEntries.entries()) {
    const found = entries.metadataFor(entry);
    if (found?.input !== true) {refuse("assembly.prepare.input-handles");}
    all.push({ entry, metadata: found, path: [], inputAlias: inputAliases[index] ?? "" });
  }
  for (const { metadata } of all) {
    provides += metadata.declaration.provides.length;
    slots += metadata.declaration.slots.length;
    if (provides > limits.aggregateProvides || slots > limits.aggregateSlots) {throw new SnapshotFault("limit");}
  }
  const byEntry = new Map<object, Metadata<F>>();
  const byId = new Map<string, Metadata<F>>();
  const groupPaths = new Map<string, readonly string[]>();
  const paths = new Map<string, (readonly string[])[]>();
  const inputs = new Map<string, string[]>();
  for (const { entry, metadata, path, inputAlias } of all) {
    const id = metadata.declaration.implementationId;
    if (inputAlias === undefined) {
      const list = paths.get(id) ?? [];
      list.push(Object.freeze([...path]));
      paths.set(id, list);
    } else {
      const list = inputs.get(id) ?? [];
      list.push(inputAlias);
      inputs.set(id, list);
    }
    byEntry.set(entry as object, metadata);
    byId.set(id, metadata);
    if (inputAlias === undefined) {groupPaths.set(id, path);}
  }
  // Only duplicated ids are sorted, by code unit order.
  const repeated = sortIds([...new Set([...paths.keys(), ...inputs.keys()])]
    .filter((id) => (paths.get(id)?.length ?? 0) + (inputs.get(id)?.length ?? 0) > 1));
  const duplicated = repeated.map((id): DuplicateModule => Object.freeze({
    implementationId: id, paths: Object.freeze(paths.get(id) ?? []), inputs: Object.freeze(inputs.get(id) ?? []),
  }));
  if (duplicated.length > 0) {
    throw new DuplicateFault(Object.freeze(duplicated));
  }
  return { byEntry, byId, groupPaths };
}

export function validateSelections<F>(plan: CompositionPlan, byId: ReadonlyMap<string, Metadata<F>>): void {
  const selected = new Set(plan.selections.map((selection) => selection.implementationId));
  if (plan.selections.length !== byId.size || selected.size !== byId.size) {refuse("assembly.prepare.handles");}
  for (const selection of plan.selections) {
    if (byId.get(selection.implementationId)?.declaration.moduleId !== selection.moduleId) {
      refuse("assembly.prepare.handles");
    }
  }
}

export function bindRoots<F>(aliases: Readonly<ReturnType<typeof rootKeys>>, plan: CompositionPlan,
  byEntry: ReadonlyMap<object, Metadata<F>>): Program<F>["roots"] {
  const rootIds = new Set(plan.roots);
  const rootEntries = new Set<object>();
  if (aliases.keys.length !== plan.roots.length || rootIds.size !== plan.roots.length) {refuse("assembly.prepare.roots");}
  return Object.freeze(aliases.keys.map((alias) => {
    const entry = data(aliases.object, alias);
    if (entry === null || typeof entry !== "object") {refuse("assembly.prepare.roots");}
    const metadata = byEntry.get(entry);
    // A borrowed input is never a root.
    if (metadata?.input === true) {refuse("assembly.prepare.input-handles");}
    if (!metadata || rootEntries.has(entry) || !rootIds.has(metadata.declaration.moduleId)) {
      refuse("assembly.prepare.roots");
    }
    rootEntries.add(entry);
    return Object.freeze({ alias, implementationId: metadata.declaration.implementationId });
  }));
}

export function bindInputs<F>(aliases: readonly string[], entries: readonly unknown[],
  byEntry: ReadonlyMap<object, Metadata<F>>): Program<F>["inputs"] {
  return Object.freeze(aliases.map((alias, index) => {
    const entry = entries[index];
    const metadata = entry !== null && typeof entry === "object" ? byEntry.get(entry) : undefined;
    if (metadata?.input !== true) {refuse("assembly.prepare.input-handles");}
    return Object.freeze({ alias, metadata });
  }));
}

export function createProgram<F>(plan: CompositionPlan, roots: Program<F>["roots"], inputs: Program<F>["inputs"],
  byId: ReadonlyMap<string, Metadata<F>>): Program<F> {
  const bindings = new Map<string, Map<string, CompositionPlan["bindings"][number]>>();
  for (const binding of plan.bindings) {
    let rows = bindings.get(binding.consumerImplementationId);
    if (!rows) { rows = new Map(); bindings.set(binding.consumerImplementationId, rows); }
    rows.set(binding.slotId, binding);
  }
  return Object.freeze({
    roots, inputs,
    steps: Object.freeze(plan.dependencyOrder.map((id) => {
      const metadata = byId.get(id);
      if (!metadata) {refuse("assembly.prepare.handles");}
      const rows = bindings.get(id);
      if (metadata.declaration.slots.length > 0 && rows === undefined) {refuse("assembly.prepare.handles");}
      return Object.freeze({ metadata, injections: Object.freeze(metadata.declaration.slots.map((slot) => {
        const binding = rows?.get(slot.slotId);
        if (binding === undefined) {refuse("assembly.prepare.handles");}
        return Object.freeze({ slotId: slot.slotId, capabilityId: binding.capabilityId,
          kind: slot.cardinality.kind, providers: binding.providerImplementationIds });
      })) });
    })),
  });
}

export function rootModuleIds<F>(aliases: Readonly<ReturnType<typeof rootKeys>>, byEntry: ReadonlyMap<object, Metadata<F>>): readonly string[] {
  const seen = new Set<string>();
  return aliases.keys.map((alias) => {
    const entry = data(aliases.object, alias);
    const metadata = entry !== null && typeof entry === "object" ? byEntry.get(entry) : undefined;
    if (metadata?.input === true) {refuse("assembly.prepare.input-handles");}
    if (!metadata || seen.has(metadata.declaration.moduleId)) {refuse("assembly.prepare.roots");}
    seen.add(metadata.declaration.moduleId);
    return metadata.declaration.moduleId;
  });
}
