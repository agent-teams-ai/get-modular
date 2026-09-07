import type { AssemblyOutcome, CreatedEntry, ReturnedProduct, RootInstances, RunErrorCode, RunOptions } from "./types.js";
import type { CommitCreated, Metadata, Program } from "./ports.js";
import { SnapshotFault, data, record } from "./snapshot.js";

type Settlement =
  | { readonly kind: "returned"; readonly product: unknown; readonly then: undefined }
  | { readonly kind: "rejected"; readonly cause: unknown; readonly then: undefined }
  | { readonly kind: "unsupported"; readonly cause: unknown; readonly then: undefined };
function observe(carrier: unknown): Promise<Settlement> {
  if (carrier === null || typeof carrier !== "object" || Object.getPrototypeOf(carrier) !== Promise.prototype) {
    throw new TypeError("Expected a current-realm ordinary Promise");
  }
  // In particular, reject an own constructor getter before species lookup.
  if (Reflect.ownKeys(carrier).length !== 0) throw new TypeError("Factory Promise must have no own properties");
  return new Promise<Settlement>((resolve) => {
    try {
      Reflect.apply(Promise.prototype.then, carrier, [
        (product: unknown) => { resolve(Object.freeze({ kind: "returned" as const, product, then: undefined })); },
        (cause: unknown) => { resolve(Object.freeze({ kind: "rejected" as const, cause, then: undefined })); },
      ]);
    } catch (cause) {
      resolve(Object.freeze({ kind: "unsupported" as const, cause, then: undefined }));
    }
  });
}
function snapshotProduct(product: unknown, metadata: Metadata): CreatedEntry {
  const result = record(product, ["instance", "capabilities"]);
  const keys = metadata.declaration.provides.map((provided) => provided.capabilityId);
  const supplied = record(data(result, "capabilities"), keys);
  const capabilities: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) capabilities[key] = data(supplied, key);
  return Object.freeze({
    moduleId: metadata.declaration.moduleId, implementationId: metadata.declaration.implementationId,
    instance: data(result, "instance"), capabilities: Object.freeze(capabilities),
  });
}
export async function runAttempt<R>(
  program: Program, options: RunOptions | undefined, commit: CommitCreated,
): Promise<AssemblyOutcome<R>> {
  const journal: CreatedEntry[] = [];
  const createdById = new Map<string, CreatedEntry>();
  let signal: AbortSignal | undefined;
  let current: string | undefined;
  let returned: ReturnedProduct | undefined;
  const failed = (phase: "factory" | "completion" | "internal", code: RunErrorCode, cause: unknown): AssemblyOutcome<R> => Object.freeze({
    status: "failed", phase, code, cause, implementationId: current, returned,
    created: Object.freeze(journal),
    cancellation: signal?.aborted ? Object.freeze({ reason: signal.reason }) : undefined,
  });
  const cancelled = (): AssemblyOutcome<R> => Object.freeze({
    status: "cancelled", reason: signal!.reason, created: Object.freeze(journal),
  });
  const capability = (id: string, key: string): unknown => {
    const provider = createdById.get(id);
    if (!provider || !Object.hasOwn(provider.capabilities, key)) throw new Error("assembly.internal.missing-capability");
    return provider.capabilities[key];
  };
  try {
    signal = options?.signal ?? new AbortController().signal;
    const context = Object.freeze({ signal });
    if (signal.aborted) return cancelled();
    for (const step of program.steps) {
      current = step.metadata.declaration.implementationId;
      if (signal.aborted) return cancelled();
      const dependencies: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (const injection of step.injections) {
        dependencies[injection.slotId] = injection.kind === "many"
          ? Object.freeze(injection.providers.map((id) => capability(id, injection.capabilityId)))
          : injection.providers.length === 0 ? undefined : capability(injection.providers[0]!, injection.capabilityId);
      }
      Object.freeze(dependencies);
      let carrier: unknown;
      try {
        carrier = step.metadata.factory(dependencies, context);
      } catch (cause) {
        return failed("factory", "assembly.run.factory-threw", cause);
      }
      let settlement: Settlement;
      try {
        settlement = await observe(carrier);
      } catch (cause) {
        return failed("factory", "assembly.run.unsupported-carrier", cause);
      }
      if (settlement.kind === "rejected") return failed("factory", "assembly.run.factory-rejected", settlement.cause);
      if (settlement.kind === "unsupported") return failed("factory", "assembly.run.unsupported-carrier", settlement.cause);
      // Retain the raw fulfillment before inspecting any part of the product.
      returned = Object.freeze({ implementationId: current, product: settlement.product });
      let entry: CreatedEntry;
      try {
        entry = snapshotProduct(settlement.product, step.metadata);
      } catch (cause) {
        if (cause instanceof SnapshotFault) return failed("completion", "assembly.run.invalid-product", cause);
        throw cause;
      }
      const position = journal.length;
      try {
        commit(journal, entry);
      } finally {
        // A helper throwing after append has already transferred this product.
        if (journal.length === position + 1 && journal[position] === entry) returned = undefined;
      }
      if (returned !== undefined) throw new Error("assembly.internal.uncommitted-product");
      createdById.set(current, entry);
    }
    const roots: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const root of program.roots) {
      const entry = createdById.get(root.implementationId);
      if (!entry) throw new Error("assembly.internal.missing-root");
      roots[root.alias] = entry.instance;
    }
    Object.freeze(roots);
    if (signal.aborted) return cancelled();
    return Object.freeze({
      status: "succeeded", roots: roots as RootInstances<R>, created: Object.freeze(journal),
    });
  } catch (cause) {
    return failed("internal", "assembly.run.internal", cause);
  }
}

// Factory products, instance objects, capability values and causes are opaque.
// Only records and arrays allocated for the assembly protocol are frozen.
