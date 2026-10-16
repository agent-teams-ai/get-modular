import type { CompositionPlan, CompositionProfile, Diagnostic, ModuleDeclaration } from "@get-modular/core";
import type { AssemblyPreparationResult, AssemblyPrepareInput, DuplicateModule, InputEntries, ModuleItem, PreparationErrorCode, PreparedAssembly, RootEntries, RunOptions, SuccessfulComposition } from "./types.js";
import type { ConstructionPorts, Metadata, Program } from "./ports.js";
import { appendCreated } from "./ports.js";
import { SnapshotFault, copyPlan, data, dataObject, denseArray, envelope, inspectPlan, limits, record, rootKeys, snapshotPlan } from "./snapshot.js";
import { metadataFor } from "./entry.js";
import { walkModules } from "./group.js";
import { runAttempt } from "./run.js";
import { deriveProfile } from "./derive-profile.js";

class PreparationFault extends Error {
  readonly code: PreparationErrorCode;
  constructor(code: PreparationErrorCode) { super(code); this.code = code; }
}
function refuse(code: PreparationErrorCode): never { throw new PreparationFault(code); }
function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function samePlan(a: CompositionPlan, b: CompositionPlan): boolean {
  return a.profileId === b.profileId
    && sameStrings(a.roots, b.roots) && sameStrings(a.dependencyOrder, b.dependencyOrder)
    && a.selections.length === b.selections.length && a.selections.every((value, index) => {
      const other = b.selections.at(index);
      if (other === undefined) {return false;}
      return value.moduleId === other.moduleId && value.implementationId === other.implementationId;
    })
    && a.bindings.length === b.bindings.length && a.bindings.every((value, index) => {
      const other = b.bindings.at(index);
      if (other === undefined) {return false;}
      return value.consumerImplementationId === other.consumerImplementationId && value.slotId === other.slotId
      && value.capabilityId === other.capabilityId && value.compatibility.token === other.compatibility.token
        && sameStrings(value.providerImplementationIds, other.providerImplementationIds);
    });
}
function sameEnvelope(a: Readonly<Record<string, unknown>>, b: Readonly<Record<string, unknown>>): boolean {
  const keys = Reflect.ownKeys(a);
  return keys.length === Reflect.ownKeys(b).length && keys.every((key) => {
    if (typeof key !== "string" || !Object.hasOwn(b, key)) {return false;}
    return a[key] === b[key] || (key === "diagnostics" && Array.isArray(a[key]) && Array.isArray(b[key]));
  });
}
function profileFrom(plan: CompositionPlan): CompositionProfile {
  return Object.freeze({
    kind: "get-modular.composition-profile", schemaVersion: 1, profileId: plan.profileId,
    roots: plan.roots, selections: plan.selections,
    bindings: Object.freeze(plan.bindings.map((binding) => Object.freeze({
      consumerImplementationId: binding.consumerImplementationId,
      slotId: binding.slotId, providerImplementationIds: binding.providerImplementationIds,
    }))),
  });
}

type Collected = {
  readonly byEntry: Map<object, Metadata>;
  readonly byId: Map<string, Metadata>;
  readonly groupPaths: Map<string, readonly string[]>;
};
class DuplicateFault extends Error {
  readonly occurrences: readonly DuplicateModule[];
  constructor(occurrences: DuplicateFault["occurrences"]) { super("assembly.prepare.duplicate-module"); this.occurrences = occurrences; }
}
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
function collectMetadata(modules: readonly unknown[], inputEntries: readonly unknown[], inputAliases: readonly string[]): Collected {
  const walked = walkModules(modules, (kind) => refuse(kind === "input" ? "assembly.prepare.input-handles" : "assembly.prepare.handles"));
  let provides = 0;
  let slots = 0;
  const all: { readonly entry: unknown; readonly metadata: Metadata; readonly path: readonly string[]; readonly inputAlias?: string }[] = [];
  for (const { entry, path } of walked.entries) {
    all.push({ entry, metadata: metadataFor(entry) as Metadata, path });
  }
  for (const [index, entry] of inputEntries.entries()) {
    const found = metadataFor(entry);
    if (found?.input !== true) {refuse("assembly.prepare.input-handles");}
    all.push({ entry, metadata: found, path: [], inputAlias: inputAliases[index] ?? "" });
  }
  for (const { metadata } of all) {
    provides += metadata.declaration.provides.length;
    slots += metadata.declaration.slots.length;
    if (provides > limits.aggregateProvides || slots > limits.aggregateSlots) {throw new SnapshotFault("limit");}
  }
  const byEntry = new Map<object, Metadata>();
  const byId = new Map<string, Metadata>();
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
  const ids = sortIds(new Set([...paths.keys(), ...inputs.keys()]));
  const duplicated = ids.flatMap((id): DuplicateModule[] => {
    const modulePaths = paths.get(id) ?? [];
    const inputAliasesForId = inputs.get(id) ?? [];
    return modulePaths.length + inputAliasesForId.length > 1
      ? [{ implementationId: id, paths: Object.freeze(modulePaths), inputs: Object.freeze(inputAliasesForId) }] : [];
  });
  if (duplicated.length > 0) {
    throw new DuplicateFault(Object.freeze(duplicated));
  }
  return { byEntry, byId, groupPaths };
}

function validateSelections(plan: CompositionPlan, byId: ReadonlyMap<string, Metadata>): void {
  const selected = new Set(plan.selections.map((selection) => selection.implementationId));
  if (plan.selections.length !== byId.size || selected.size !== byId.size) {refuse("assembly.prepare.handles");}
  for (const selection of plan.selections) {
    if (byId.get(selection.implementationId)?.declaration.moduleId !== selection.moduleId) {
      refuse("assembly.prepare.handles");
    }
  }
}

function bindRoots(aliases: Readonly<ReturnType<typeof rootKeys>>, plan: CompositionPlan,
  byEntry: ReadonlyMap<object, Metadata>): Program["roots"] {
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

function bindInputs(aliases: readonly string[], entries: readonly unknown[],
  byEntry: ReadonlyMap<object, Metadata>): Program["inputs"] {
  return Object.freeze(aliases.map((alias, index) => {
    const entry = entries[index];
    const metadata = entry !== null && typeof entry === "object" ? byEntry.get(entry) : undefined;
    if (metadata?.input !== true) {refuse("assembly.prepare.input-handles");}
    return Object.freeze({ alias, metadata });
  }));
}

function createProgram(plan: CompositionPlan, roots: Program["roots"], inputs: Program["inputs"],
  byId: ReadonlyMap<string, Metadata>): Program {
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
function rejectedByCore(diagnostics: readonly Diagnostic[]): AssemblyPreparationResult<never> {
  return Object.freeze({
    status: "failed", error: Object.freeze({ code: "assembly.prepare.core-rejected", cause: undefined }),
    diagnostics: Object.freeze([...diagnostics]),
  });
}
// Root entries name the profile roots; a missing, borrowed or repeated entry is a roots fault.
function rootModuleIds(aliases: Readonly<ReturnType<typeof rootKeys>>, byEntry: ReadonlyMap<object, Metadata>): readonly string[] {
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
type Completion = { readonly plan: CompositionPlan; readonly composition: SuccessfulComposition };
async function completeProfile(compile: ConstructionPorts["compileComposition"], declarations: readonly ModuleDeclaration[],
  input: Parameters<typeof deriveProfile>[0]): Promise<Completion | AssemblyPreparationResult<never>> {
  const derived = deriveProfile(input);
  if (!derived.ok) {
    return Object.freeze<AssemblyPreparationResult<never>>({
      status: "failed", error: Object.freeze({ code: "assembly.prepare.unresolved-binding", cause: derived.unresolved }),
      diagnostics: Object.freeze([]),
    });
  }
  const checked = await compile({ declarations, profile: derived.profile });
  if (!checked.ok) {return rejectedByCore(checked.diagnostics);}
  return { plan: snapshotPlan(checked.plan), composition: checked };
}
type Supplied = Record<string, unknown>;
function preparationMode(supplied: Supplied): { readonly withComposition: boolean; readonly given: (key: string) => boolean } {
  const given = (key: string): boolean => Object.hasOwn(supplied, key) && data(supplied, key) !== undefined;
  const withComposition = given("composition");
  if (withComposition === given("profileId")) {refuse("assembly.prepare.invalid-input");}
  if (withComposition && given("bindings")) {refuse("assembly.prepare.invalid-input");}
  return { withComposition, given };
}
function explicitComposition(supplied: Supplied): { readonly composition: Record<string, unknown>; readonly header: Readonly<Record<string, unknown>>; readonly census: ReturnType<typeof inspectPlan> } {
  const composition = dataObject(data(supplied, "composition"));
  return { composition, header: envelope(composition), census: inspectPlan(data(composition, "plan")) };
}
async function verifyExplicit(compile: ConstructionPorts["compileComposition"], declarations: readonly ModuleDeclaration[],
  plan: CompositionPlan, explicit: ReturnType<typeof explicitComposition>): Promise<AssemblyPreparationResult<never> | undefined> {
  const checked = await compile({ declarations, profile: profileFrom(plan) });
  if (!checked.ok) {return rejectedByCore(checked.diagnostics);}
  if (!sameEnvelope(explicit.header, envelope(checked)) || !samePlan(plan, snapshotPlan(checked.plan))) {
    return refuse("assembly.prepare.plan-mismatch");
  }
  return undefined;
}
export async function prepareConstruction<C, R extends RootEntries<C>, N extends InputEntries<C>,
  M extends readonly ModuleItem<C>[]>(
  input: AssemblyPrepareInput<C, R, N, M>, ports: ConstructionPorts,
): Promise<AssemblyPreparationResult<R, N>> {
  try {
    const supplied = record(input, ["modules", "roots"], ["composition", "profileId", "bindings", "inputs"]);
    const { withComposition, given } = preparationMode(supplied);
    const modules = denseArray(data(supplied, "modules"), limits.handles);
    const aliases = rootKeys(data(supplied, "roots"));
    const suppliedInputs = Object.hasOwn(supplied, "inputs") ? data(supplied, "inputs") : undefined;
    const inputAliases = rootKeys(suppliedInputs === undefined ? {} : suppliedInputs);
    const inputEntries = inputAliases.keys.map((alias) => data(inputAliases.object, alias));
    const explicit = withComposition ? explicitComposition(supplied) : undefined;
    // All individual and aggregate counts precede proportional snapshot copies.
    const { byEntry, byId, groupPaths } = collectMetadata(modules, inputEntries, inputAliases.keys);
    const declarations = Object.freeze(Array.from(byId.values(), (metadata) => metadata.declaration));
    const compile = ports.compileComposition, commit = ports.commitCreated ?? appendCreated;
    const resolved = explicit
      ? { plan: copyPlan(explicit.census), composition: explicit.composition as SuccessfulComposition }
      : await completeProfile(compile, declarations, {
        profileId: data(supplied, "profileId"),
        bindings: given("bindings") ? data(supplied, "bindings") : undefined,
        byId, groupPaths, rootModuleIds: rootModuleIds(aliases, byEntry),
      });
    if ("status" in resolved) {return resolved;}
    const { plan, composition } = resolved;
    validateSelections(plan, byId);
    const roots = bindRoots(aliases, plan, byEntry);
    const inputs = bindInputs(inputAliases.keys, inputEntries, byEntry);
    if (explicit) {
      const failed = await verifyExplicit(compile, declarations, plan, explicit);
      if (failed) {return failed;}
    }
    const program = createProgram(plan, roots, inputs, byId);
    // Run options are checked at run time; the declared shape exists only for callers.
    const prepared = Object.freeze({
      run: async (options?: RunOptions) => runAttempt<R>(program, options, commit),
    }) as PreparedAssembly<R, N>;
    return Object.freeze({ status: "prepared", prepared, composition });
  } catch (cause) {
    if (cause instanceof DuplicateFault) {
      return Object.freeze({
        status: "failed", error: Object.freeze({ code: "assembly.prepare.duplicate-module", cause: cause.occurrences }),
        diagnostics: Object.freeze([]),
      });
    }
    const code = cause instanceof PreparationFault ? cause.code
      : cause instanceof SnapshotFault ? cause.kind === "limit" ? "assembly.prepare.limit" : "assembly.prepare.invalid-input" : undefined;
    if (code === undefined) {throw cause;}
    return Object.freeze({
      status: "failed", error: Object.freeze({ code, cause }), diagnostics: Object.freeze([]),
    });
  }
}
