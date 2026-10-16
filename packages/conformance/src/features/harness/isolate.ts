import { assemblyFor, input as inputEntry } from "@get-modular/assembly";
import type { AnyEntry, CapabilitiesProvidedBy, DependenciesOf, InstanceOf } from "@get-modular/assembly";
import { compileComposition } from "@get-modular/core";
import type { ModuleDeclaration } from "@get-modular/core";
import { createScope } from "@get-modular/resources";
import type { Resources, Scope } from "@get-modular/resources";
import { ConformanceError, invalid } from "../errors/errors.js";
import type { Isolated, LooseAssembly, LooseOutcome } from "./types.js";

const makeInput = inputEntry() as unknown as (declaration: ModuleDeclaration) => unknown;

/** Ids with this prefix belong to the fakes `isolate` generates; a module under test cannot use them. */
const SYNTHETIC = "conformance";
const inSynthetic = (id: string): boolean => id === SYNTHETIC || id.startsWith(`${SYNTHETIC}/`);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

/** Reads an own data property; an accessor is never called. */
function ownData(record: object, key: string | number): { readonly present: boolean; readonly value: unknown } {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor !== undefined && "value" in descriptor
    ? { present: true, value: descriptor.value }
    : { present: false, value: undefined };
}

function text(record: Readonly<Record<string, unknown>>, key: string, what: string): string {
  const { value } = ownData(record, key);
  if (typeof value !== "string" || value.length === 0) {
    throw invalid(`isolate() requires ${what} to have a non-empty string ${key}`);
  }
  return value;
}

type Fake = { readonly declaration: ModuleDeclaration; readonly alias: string; readonly record: Readonly<Record<string, unknown>> };
type Wiring = {
  readonly fakes: readonly Fake[];
  readonly providers: ReadonlyMap<string, readonly string[]>;
};

/** Checks the declaration and the dependency record synchronously, then turns every dependency into a fake. */
function wire(declaration: unknown, dependencies: unknown): Wiring {
  if (!isRecord(declaration)) {
    throw invalid("isolate() requires a module declaration");
  }
  const moduleId = text(declaration, "moduleId", "the declaration");
  const implementationId = text(declaration, "implementationId", "the declaration");
  const provides = ownData(declaration, "provides").value;
  const slots = ownData(declaration, "slots").value;
  if (!Array.isArray(provides) || !Array.isArray(slots)) {
    throw invalid("isolate() requires a declaration with provides and slots arrays");
  }
  const entries: readonly unknown[] = [...provides as readonly unknown[], ...slots as readonly unknown[]];
  if (!isRecord(dependencies)) {
    throw invalid("isolate() requires a dependency record");
  }
  const ids = [moduleId, implementationId];
  for (const entry of entries) {
    if (!isRecord(entry)) {
      throw invalid("isolate() requires provides and slots entries to be records");
    }
    ids.push(text(entry, "capabilityId", "every provides and slots entry"));
  }
  const reserved = ids.find(inSynthetic);
  if (reserved !== undefined) {
    throw invalid(`isolate() reserves the ${SYNTHETIC}/ id prefix for generated fakes: ${reserved}`);
  }

  const fakes: Fake[] = [];
  const providers = new Map<string, readonly string[]>();
  const fake = (capabilityId: string, compatibility: unknown, value: unknown): string => {
    const alias = `fake${String(fakes.length)}`;
    const id = `${SYNTHETIC}/fake-${String(fakes.length)}`;
    fakes.push({
      alias,
      declaration: {
        kind: "get-modular.module-declaration", schemaVersion: 1, moduleId: id, implementationId: id,
        owner: { authority: SYNTHETIC, path: ["fake"] },
        provides: [{ capabilityId, compatibility: { ...(compatibility as ModuleDeclaration["provides"][number]["compatibility"]) } }],
        slots: [],
      },
      record: { [capabilityId]: value },
    });
    return id;
  };
  for (const slot of slots as readonly Readonly<Record<string, unknown>>[]) {
    const slotId = text(slot, "slotId", "every slots entry");
    const capabilityId = text(slot, "capabilityId", "every slots entry");
    const { value: compatibility } = ownData(slot, "compatibility");
    const { value: cardinality } = ownData(slot, "cardinality");
    if (!isRecord(compatibility) || !isRecord(cardinality)) {
      throw invalid(`isolate() requires slot ${slotId} to have compatibility and cardinality records`);
    }
    const supplied = ownData(dependencies, slotId);
    if (!supplied.present) {
      throw invalid(`isolate() requires an own data property for slot ${slotId} in dependencies`);
    }
    const { value } = supplied;
    const kind = ownData(cardinality, "kind").value;
    const chosen: string[] = [];
    if (kind === "many") {
      if (!Array.isArray(value)) {
        throw invalid(`isolate() requires slot ${slotId} to be an array`);
      }
      for (let index = 0; index < value.length; index += 1) {
        const element = ownData(value, index);
        if (!element.present) {
          throw invalid(`isolate() requires slot ${slotId} to be a dense array of data elements`);
        }
        chosen.push(fake(capabilityId, compatibility, element.value));
      }
    } else if (kind !== "optional" || value !== undefined) {
      chosen.push(fake(capabilityId, compatibility, value));
    }
    providers.set(slotId, chosen);
  }
  return { fakes, providers };
}

function failure(implementationId: string, outcome: LooseOutcome, complete: boolean, debts: number): string {
  const closed = complete ? "complete" : `incomplete with ${String(debts)} debt(s)`;
  return outcome.status === "failed"
    ? `${implementationId} failed in phase ${outcome.phase} with ${outcome.code}; its scope closed ${closed}`
    : `${implementationId} was cancelled before it was built; its scope closed ${closed}`;
}

/**
 * Builds one module through a real Assembly run: each dependency becomes an input module of its own, so the
 * module sees the same frozen records, the same product check and the same scope as in production. The entry
 * already carries its adapter, so no `scoped` is applied here.
 */
export async function isolate<const E extends AnyEntry>(
  entry: E,
  input: {
    readonly dependencies: DependenciesOf<E>;
    readonly signal?: AbortSignal | undefined;
    /** Open the module's scope under this one instead of a new root scope. */
    readonly within?: Resources | undefined;
  },
): Promise<Isolated<InstanceOf<E>, CapabilitiesProvidedBy<E>>> {
  if (!isRecord(entry) || !isRecord(input)) {
    throw invalid("isolate() requires a module entry and an input record");
  }
  const { fakes, providers } = wire(entry.declaration, input.dependencies);
  const declaration: ModuleDeclaration = entry.declaration;
  const assembly = assemblyFor<{}>() as unknown as LooseAssembly;

  const declarations: ModuleDeclaration[] = [declaration, ...fakes.map(fake => fake.declaration)];
  const composition = await compileComposition({
    declarations,
    profile: {
      kind: "get-modular.composition-profile", schemaVersion: 1, profileId: `${SYNTHETIC}/isolate`,
      roots: [declaration.moduleId],
      selections: declarations.map(({ moduleId, implementationId }) => ({ moduleId, implementationId })),
      bindings: declaration.slots.map(slot => ({
        consumerImplementationId: declaration.implementationId,
        slotId: slot.slotId,
        providerImplementationIds: providers.get(slot.slotId) ?? [],
      })),
    },
  });
  if (!composition.ok) {
    throw new ConformanceError("conformance.isolate.construction-failed",
      `${declaration.implementationId} cannot be composed with its dependencies: ${composition.diagnostics.map(diagnostic => diagnostic.code).join(", ")}`,
      { details: { diagnostics: composition.diagnostics } });
  }

  const inputHandles = Object.fromEntries(fakes.map(fake => [fake.alias, makeInput(fake.declaration)]));
  const preparation = await assembly.prepare({
    composition, modules: [entry], roots: { module: entry },
    ...fakes.length === 0 ? {} : { inputs: inputHandles },
  });
  if (preparation.status !== "prepared") {
    throw new ConformanceError("conformance.isolate.construction-failed",
      `${declaration.implementationId} was not prepared: ${preparation.error.code}`,
      { cause: preparation.error.cause, details: { preparation } });
  }

  const scope: Scope = input.within === undefined
    ? createScope({ name: "isolate" })
    : input.within.child({ name: "isolate" });
  let outcome: LooseOutcome;
  try {
    outcome = await preparation.prepared.run({
      ...input.signal === undefined ? {} : { signal: input.signal },
      scope: scope.resources,
      ...fakes.length === 0 ? {} : { inputs: Object.fromEntries(fakes.map(fake => [fake.alias, fake.record])) },
    });
  } catch (error) {
    await scope.control.close();
    throw error;
  }
  const created = outcome.status === "succeeded"
    ? outcome.created.find(candidate => candidate.implementationId === declaration.implementationId)
    : undefined;
  if (outcome.status !== "succeeded" || created === undefined) {
    const report = await scope.control.close();
    throw new ConformanceError("conformance.isolate.construction-failed",
      failure(declaration.implementationId, outcome, report.complete, report.debts.length),
      { cause: outcome.status === "failed" ? outcome.cause : outcome.status === "cancelled" ? outcome.reason : undefined,
        details: { outcome, report } });
  }
  return {
    instance: outcome.roots["module"] as InstanceOf<E>,
    capabilities: created.capabilities as CapabilitiesProvidedBy<E>,
    close: () => scope.control.close(),
    [Symbol.asyncDispose]: () => scope.control[Symbol.asyncDispose](),
  };
}
