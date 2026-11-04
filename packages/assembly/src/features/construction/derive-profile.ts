import type { CompositionProfile } from "@get-modular/core";
import type { Metadata } from "./ports.js";
import type { UnresolvedBinding } from "./types.js";
import { SnapshotFault, data, denseArray, identifier, limits, record } from "./snapshot.js";

export type DerivedProfile =
  | { readonly ok: true; readonly profile: CompositionProfile }
  | { readonly ok: false; readonly unresolved: readonly UnresolvedBinding[] };

type Row = CompositionProfile["bindings"][number];

function compareCodePoints(a: string, b: string): number {
  const left = Array.from(a, (point) => point.codePointAt(0) ?? 0);
  const right = Array.from(b, (point) => point.codePointAt(0) ?? 0);
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {return difference;}
  }
  return left.length - right.length;
}
function sorted<T>(values: readonly T[], compare: (a: T, b: T) => number): T[] {
  const result = [...values];
  result.sort(compare);
  return result;
}
function compareRows(a: { readonly consumerImplementationId: string; readonly slotId: string },
  b: { readonly consumerImplementationId: string; readonly slotId: string }): number {
  return compareCodePoints(a.consumerImplementationId, b.consumerImplementationId) || compareCodePoints(a.slotId, b.slotId);
}
function snapshotRows(value: unknown): { readonly rows: readonly Row[]; readonly occurrences: number } {
  const rows = denseArray(value, limits.bindings);
  // The aggregate bound precedes every proportional copy, as for a supplied plan.
  let occurrences = 0;
  for (const rowValue of rows) {
    const row = record(rowValue, ["consumerImplementationId", "slotId", "providerImplementationIds"]);
    occurrences += denseArray(data(row, "providerImplementationIds"), limits.providers).length;
    if (occurrences > limits.providerOccurrences) {throw new SnapshotFault("limit");}
  }
  const captured = Object.freeze(rows.map((rowValue) => {
    const row = record(rowValue, ["consumerImplementationId", "slotId", "providerImplementationIds"]);
    return Object.freeze({
      consumerImplementationId: identifier(data(row, "consumerImplementationId")),
      slotId: identifier(data(row, "slotId")),
      providerImplementationIds: Object.freeze(denseArray(data(row, "providerImplementationIds"), limits.providers).map(identifier)),
    });
  }));
  return { rows: captured, occurrences };
}

// Candidates depend on capability identity, never revision. Share immutable lists across slots;
// only a consumer that provides the capability needs its own self-excluding snapshot.
function candidateIndex(byId: ReadonlyMap<string, Metadata>): (consumer: string, capability: string) => readonly string[] {
  const providersOf = new Map<string, Set<string>>();
  for (const [implementationId, metadata] of byId) {
    for (const provided of metadata.declaration.provides) {
      let providers = providersOf.get(provided.capabilityId);
      if (providers === undefined) { providers = new Set(); providersOf.set(provided.capabilityId, providers); }
      providers.add(implementationId);
    }
  }
  const indexed = new Map([...providersOf].map(([capability, providers]) => [capability, {
    providers, candidates: Object.freeze(sorted([...providers], compareCodePoints)),
    excluding: new Map<string, readonly string[]>(),
  }]));
  const empty: readonly string[] = Object.freeze([]);
  return (consumer, capability) => {
    const found = indexed.get(capability);
    if (found === undefined) {return empty;}
    if (!found.providers.has(consumer)) {return found.candidates;}
    let candidates = found.excluding.get(consumer);
    if (candidates === undefined) {
      candidates = Object.freeze(found.candidates.filter((id) => id !== consumer));
      found.excluding.set(consumer, candidates);
    }
    return candidates;
  };
}

// ADR-0035: the profile follows the module entries. An explicit row is kept as written; a `required` slot
// without a row takes its only other provider; every other missing row is reported, never guessed.
export function deriveProfile(input: {
  readonly profileId: unknown;
  readonly bindings: unknown;
  readonly byId: ReadonlyMap<string, Metadata>;
  readonly groupPaths: ReadonlyMap<string, readonly string[]>;
  readonly rootModuleIds: readonly string[];
}): DerivedProfile {
  const profileId = identifier(input.profileId);
  const captured = input.bindings === undefined ? { rows: [], occurrences: 0 } : snapshotRows(input.bindings);
  const explicit = captured.rows;
  const keys = new Set(explicit.map((row) => JSON.stringify([row.consumerImplementationId, row.slotId])));
  const candidatesFor = candidateIndex(input.byId);
  const inferred: { readonly consumerImplementationId: string; readonly slotId: string; readonly provider: string }[] = [];
  const unresolved: UnresolvedBinding[] = [];
  for (const [consumerImplementationId, metadata] of input.byId) {
    let groupPath: readonly string[] | undefined;
    for (const slot of metadata.declaration.slots) {
      if (keys.has(JSON.stringify([consumerImplementationId, slot.slotId]))) {continue;}
      const candidates = candidatesFor(consumerImplementationId, slot.capabilityId);
      const only = candidates.at(0);
      if (slot.cardinality.kind === "required" && candidates.length === 1 && only !== undefined) {
        inferred.push({ consumerImplementationId, slotId: slot.slotId, provider: only });
      } else {
        groupPath ??= Object.freeze([...input.groupPaths.get(consumerImplementationId) ?? []]);
        unresolved.push(Object.freeze({
          consumerImplementationId, slotId: slot.slotId, capabilityId: slot.capabilityId,
          cardinality: slot.cardinality.kind, groupPath, candidates,
        }));
      }
    }
  }
  if (unresolved.length > 0) {
    return { ok: false, unresolved: Object.freeze(sorted(unresolved, compareRows)) };
  }
  // Keep the unresolved outcome above. Only a complete profile needs the completed carrier budget;
  // count inferred rows and their one provider before allocating that profile or invoking Core.
  if (explicit.length + inferred.length > limits.bindings || captured.occurrences + inferred.length > limits.providerOccurrences) {
    throw new SnapshotFault("limit");
  }
  const completed: Row[] = [...explicit, ...inferred.map(({ consumerImplementationId, slotId, provider }) => Object.freeze({
    consumerImplementationId, slotId, providerImplementationIds: Object.freeze([provider]),
  }))];
  const selections = [...input.byId.values()].map((metadata) => Object.freeze({
    moduleId: metadata.declaration.moduleId, implementationId: metadata.declaration.implementationId,
  }));
  selections.sort((a, b) => compareCodePoints(a.implementationId, b.implementationId));
  return {
    ok: true,
    profile: Object.freeze({
      kind: "get-modular.composition-profile", schemaVersion: 1, profileId,
      roots: Object.freeze(sorted(input.rootModuleIds, compareCodePoints)),
      selections: Object.freeze(selections),
      bindings: Object.freeze(sorted(completed, compareRows)),
    }),
  };
}
