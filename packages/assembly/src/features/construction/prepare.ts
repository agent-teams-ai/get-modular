import type { CompositionPlan, CompositionProfile, Diagnostic, ModuleDeclaration } from "@get-modular/core";
import type { AssemblyPreparationResult, AssemblyPrepareInput, InputEntries, ModuleItem, PreparedAssembly, RootEntries, RunOptions, SuccessfulComposition } from "./types.js";
import type { ConstructionPorts } from "./ports.js";
import { appendCreated } from "./ports.js";
import { SnapshotFault, copyPlan, data, dataObject, denseArray, envelope, inspectPlan, limits, record, rootKeys, snapshotPlan } from "./snapshot.js";
import { runAttempt } from "./run.js";
import { deriveProfile } from "./derive-profile.js";
import { bindInputs, bindRoots, collectMetadata, createProgram, DuplicateFault, PreparationFault, refuse, rootModuleIds, validateSelections } from "./prepare-program.js";

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

function rejectedByCore(diagnostics: readonly Diagnostic[]): AssemblyPreparationResult<never> {
  return Object.freeze({
    status: "failed", error: Object.freeze({ code: "assembly.prepare.core-rejected", cause: undefined }),
    diagnostics: Object.freeze([...diagnostics]),
  });
}
// Root entries name the profile roots; a missing, borrowed or repeated entry is a roots fault.
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
function explicitComposition(supplied: Supplied): { readonly header: Readonly<Record<string, unknown>>; readonly census: ReturnType<typeof inspectPlan> } {
  const composition = dataObject(data(supplied, "composition"));
  return { header: envelope(composition), census: inspectPlan(data(composition, "plan")) };
}
async function verifyExplicit(compile: ConstructionPorts["compileComposition"], declarations: readonly ModuleDeclaration[],
  plan: CompositionPlan, explicit: ReturnType<typeof explicitComposition>): Promise<AssemblyPreparationResult<never> | SuccessfulComposition> {
  const checked = await compile({ declarations, profile: profileFrom(plan) });
  if (!checked.ok) {return rejectedByCore(checked.diagnostics);}
  if (!sameEnvelope(explicit.header, envelope(checked)) || !samePlan(plan, snapshotPlan(checked.plan))) {
    return refuse("assembly.prepare.plan-mismatch");
  }
  return checked;
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
      ? { plan: copyPlan(explicit.census), supplied: explicit }
      : await completeProfile(compile, declarations, {
        profileId: data(supplied, "profileId"),
        bindings: given("bindings") ? data(supplied, "bindings") : undefined,
        byId, groupPaths, rootModuleIds: rootModuleIds(aliases, byEntry),
      });
    if ("status" in resolved) {return resolved;}
    const { plan } = resolved;
    validateSelections(plan, byId);
    const roots = bindRoots(aliases, plan, byEntry);
    const inputs = bindInputs(inputAliases.keys, inputEntries, byEntry);
    // Both preparation modes expose the verified Core result after the same handle/root checks.
    const composition = "supplied" in resolved
      ? await verifyExplicit(compile, declarations, plan, resolved.supplied) : resolved.composition;
    if ("status" in composition) {return composition;}
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
