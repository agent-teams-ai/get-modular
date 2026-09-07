import type { CompositionPlan, CompositionProfile, Diagnostic } from "@get-modular/core";
import type { AssemblyPreparationResult, AssemblyPrepareInput, PreparationErrorCode, RootHandles, RunOptions } from "./types.js";
import type { ConstructionPorts, Metadata, Program } from "./ports.js";
import { appendCreated } from "./ports.js";
import { SnapshotFault, copyPlan, data, dataObject, denseArray, envelope, inspectPlan, limits, record, rootKeys, snapshotPlan } from "./snapshot.js";
import { metadataFor } from "./bind.js";
import { runAttempt } from "./run.js";

class PreparationFault extends Error {
  readonly code: PreparationErrorCode;
  constructor(code: PreparationErrorCode) { super(code); this.code = code; }
}
function refuse(code: PreparationErrorCode): never { throw new PreparationFault(code); }
function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function samePlan(a: CompositionPlan, b: CompositionPlan): boolean {
  return a.kind === b.kind && a.schemaVersion === b.schemaVersion && a.profileId === b.profileId
    && sameStrings(a.roots, b.roots) && sameStrings(a.dependencyOrder, b.dependencyOrder)
    && a.selections.length === b.selections.length && a.selections.every((value, index) => {
      const other = b.selections[index]!;
      return value.moduleId === other.moduleId && value.implementationId === other.implementationId;
    })
    && a.bindings.length === b.bindings.length && a.bindings.every((value, index) => {
      const other = b.bindings[index]!;
      return value.consumerImplementationId === other.consumerImplementationId && value.slotId === other.slotId
        && value.capabilityId === other.capabilityId && value.compatibility.family === other.compatibility.family
        && value.compatibility.familyVersion === other.compatibility.familyVersion && value.compatibility.token === other.compatibility.token
        && sameStrings(value.providerImplementationIds, other.providerImplementationIds);
    });
}
function sameEnvelope(a: Readonly<Record<string, unknown>>, b: Readonly<Record<string, unknown>>): boolean {
  const keys = Reflect.ownKeys(a);
  return keys.length === Reflect.ownKeys(b).length && keys.every((key) => {
    if (typeof key !== "string" || !Object.hasOwn(b, key)) return false;
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
export async function prepareConstruction<C, R extends RootHandles<C>>(
  input: AssemblyPrepareInput<C, R>, ports: ConstructionPorts,
): Promise<AssemblyPreparationResult<R>> {
  try {
    const supplied = record(input, ["composition", "factories", "roots"]);
    const factories = denseArray(data(supplied, "factories"), limits.handles);
    const aliases = rootKeys(data(supplied, "roots"));
    const composition = dataObject(data(supplied, "composition"));
    const header = envelope(composition);
    const census = inspectPlan(data(composition, "plan"));
    let provides = 0, slots = 0;
    for (const handle of factories) {
      const metadata = metadataFor(handle);
      if (!metadata) return refuse("assembly.prepare.handles");
      provides += metadata.declaration.provides.length;
      slots += metadata.declaration.slots.length;
      if (provides > limits.aggregateProvides || slots > limits.aggregateSlots) throw new SnapshotFault("limit");
    }
    // All individual and aggregate counts precede proportional snapshot copies.
    const plan = copyPlan(census);
    const byHandle = new Map<object, Metadata>();
    const byId = new Map<string, Metadata>();
    for (const handle of factories) {
      const metadata = metadataFor(handle)!;
      const id = metadata.declaration.implementationId;
      if (byHandle.has(handle as object) || byId.has(id)) return refuse("assembly.prepare.handles");
      byHandle.set(handle as object, metadata);
      byId.set(id, metadata);
    }
    const selected = new Set(plan.selections.map((selection) => selection.implementationId));
    if (plan.selections.length !== byId.size || selected.size !== byId.size) return refuse("assembly.prepare.handles");
    for (const selection of plan.selections) {
      if (byId.get(selection.implementationId)?.declaration.moduleId !== selection.moduleId) return refuse("assembly.prepare.handles");
    }
    const rootIds = new Set(plan.roots), rootHandles = new Set<object>();
    if (aliases.keys.length !== plan.roots.length || rootIds.size !== plan.roots.length) return refuse("assembly.prepare.roots");
    const roots = Object.freeze(aliases.keys.map((alias) => {
      const handle = data(aliases.object, alias);
      const metadata = byHandle.get(handle as object);
      if (!metadata || rootHandles.has(handle as object) || !rootIds.has(metadata.declaration.implementationId)) return refuse("assembly.prepare.roots");
      rootHandles.add(handle as object);
      return Object.freeze({ alias, implementationId: metadata.declaration.implementationId });
    }));
    const declarations = Object.freeze(Array.from(byId.values(), (metadata) => metadata.declaration));
    const profile = profileFrom(plan);
    const compile = ports.compileComposition, commit = ports.commitCreated ?? appendCreated;
    const checked = await compile({ declarations, profile });
    if (!Object.getOwnPropertyDescriptor(checked, "plan")) {
      const diagnostics = data(checked, "diagnostics") as readonly Diagnostic[];
      return Object.freeze({
        status: "failed", error: Object.freeze({ code: "assembly.prepare.core-rejected", cause: undefined }),
        diagnostics: Object.freeze([...diagnostics]),
      });
    }
    if (!sameEnvelope(header, envelope(checked)) || !samePlan(plan, snapshotPlan(data(checked, "plan")))) {
      return refuse("assembly.prepare.plan-mismatch");
    }
    const bindings = new Map<string, Map<string, CompositionPlan["bindings"][number]>>();
    for (const binding of plan.bindings) {
      let rows = bindings.get(binding.consumerImplementationId);
      if (!rows) { rows = new Map(); bindings.set(binding.consumerImplementationId, rows); }
      rows.set(binding.slotId, binding);
    }
    const program: Program = Object.freeze({
      roots,
      steps: Object.freeze(plan.dependencyOrder.map((id) => {
        const metadata = byId.get(id)!;
        return Object.freeze({ metadata, injections: Object.freeze(metadata.declaration.slots.map((slot) => {
          const binding = bindings.get(id)!.get(slot.slotId)!;
          return Object.freeze({
            slotId: slot.slotId, capabilityId: binding.capabilityId,
            kind: slot.cardinality.kind, providers: binding.providerImplementationIds,
          });
        })) });
      })),
    });
    const prepared = Object.freeze({ run: (options?: RunOptions) => runAttempt<R>(program, options, commit) });
    return Object.freeze({ status: "prepared", prepared });
  } catch (cause) {
    const code = cause instanceof PreparationFault ? cause.code
      : cause instanceof SnapshotFault ? cause.kind === "limit" ? "assembly.prepare.limit" : "assembly.prepare.invalid-input" : undefined;
    if (code === undefined) throw cause;
    return Object.freeze({
      status: "failed", error: Object.freeze({ code, cause }), diagnostics: Object.freeze([]),
    });
  }
}
