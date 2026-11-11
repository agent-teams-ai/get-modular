import type { ModuleDeclaration } from "@get-modular/core";
import type { CreatedEntry } from "./types.js";
import type { Wiring, WiringInjection } from "./wiring-types.js";
import { data, record } from "./snapshot.js";

function nullRecord(): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  Object.setPrototypeOf(value, null);
  return value;
}
/** Checks a factory product against a captured declaration without reading getters or awaiting values. */
export function snapshotFactoryProduct(declaration: ModuleDeclaration, product: unknown): CreatedEntry {
  const result = record(product, ["instance", "capabilities"]);
  const keys = declaration.provides.map((provided) => provided.capabilityId);
  const supplied = record(data(result, "capabilities"), keys);
  const capabilities = nullRecord();
  for (const key of keys) {capabilities[key] = data(supplied, key);}
  return Object.freeze({
    moduleId: declaration.moduleId, implementationId: declaration.implementationId,
    instance: data(result, "instance"), capabilities: Object.freeze(capabilities),
  });
}
/** Captures exact borrowed values; it acquires no resource and registers no cleanup. Invalid shapes throw. */
export function captureWiringInputs(wiring: Pick<Wiring<unknown>, "inputs">, value: unknown): ReadonlyMap<string, CreatedEntry> {
  const captured = new Map<string, CreatedEntry>();
  if (wiring.inputs.length === 0 && value === undefined) {return captured;}
  const given = record(value, wiring.inputs.map((entry) => entry.alias));
  for (const { alias, metadata } of wiring.inputs) {
    const capabilities = data(given, alias);
    captured.set(metadata.declaration.implementationId,
      snapshotFactoryProduct(metadata.declaration, { instance: capabilities, capabilities }));
  }
  return captured;
}
/** Materializes the verified exact local slots, preserving ordered-many and absent-optional shape. */
export function injectionDependencies(injections: readonly WiringInjection[],
  capability: (implementationId: string, capabilityId: string) => unknown,
): Readonly<Record<string, unknown>> {
  const dependencies = nullRecord();
  for (const injection of injections) {
    if (injection.kind === "many") {
      dependencies[injection.slotId] = Object.freeze(injection.providers.map((id) => capability(id, injection.capabilityId)));
    } else {
      const provider = injection.providers.at(0);
      dependencies[injection.slotId] = provider === undefined ? undefined : capability(provider, injection.capabilityId);
    }
  }
  return Object.freeze(dependencies);
}
