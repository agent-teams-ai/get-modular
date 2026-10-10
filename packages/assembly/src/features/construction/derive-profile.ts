import type { CompositionProfile } from "@get-modular/core";
import type { Metadata } from "./ports.js";
import type { UnresolvedBinding } from "./types.js";
import { data, denseArray, identifier, limits, record } from "./snapshot.js";

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
function snapshotRows(value: unknown): readonly Row[] {
  return Object.freeze(denseArray(value, limits.bindings).map((rowValue) => {
    const row = record(rowValue, ["consumerImplementationId", "slotId", "providerImplementationIds"]);
    return Object.freeze({
      consumerImplementationId: identifier(data(row, "consumerImplementationId")),
      slotId: identifier(data(row, "slotId")),
      providerImplementationIds: Object.freeze(denseArray(data(row, "providerImplementationIds"), limits.providers).map(identifier)),
    });
  }));
}

// ADR-0035: the profile follows the bound handles. An explicit row is kept as written; a `required` slot
// without a row takes its only other provider; every other missing row is reported, never guessed.
export function deriveProfile(input: {
  readonly profileId: unknown;
  readonly bindings: unknown;
  readonly byId: ReadonlyMap<string, Metadata>;
  readonly rootModuleIds: readonly string[];
}): DerivedProfile {
  const profileId = identifier(input.profileId);
  const explicit = input.bindings === undefined ? [] : snapshotRows(input.bindings);
  const keys = new Set(explicit.map((row) => JSON.stringify([row.consumerImplementationId, row.slotId])));
  const providersOf = new Map<string, string[]>();
  for (const [implementationId, metadata] of input.byId) {
    for (const provided of metadata.declaration.provides) {
      const providers = providersOf.get(provided.capabilityId);
      if (providers === undefined) {providersOf.set(provided.capabilityId, [implementationId]);}
      else {providers.push(implementationId);}
    }
  }
  const completed: Row[] = [...explicit];
  const unresolved: UnresolvedBinding[] = [];
  for (const [consumerImplementationId, metadata] of input.byId) {
    for (const slot of metadata.declaration.slots) {
      if (keys.has(JSON.stringify([consumerImplementationId, slot.slotId]))) {continue;}
      const candidates = (providersOf.get(slot.capabilityId) ?? [])
        .filter((id) => id !== consumerImplementationId).sort(compareCodePoints);
      const [only] = candidates;
      if (slot.cardinality.kind === "required" && candidates.length === 1 && only !== undefined) {
        completed.push(Object.freeze({
          consumerImplementationId, slotId: slot.slotId, providerImplementationIds: Object.freeze([only]),
        }));
      } else {
        unresolved.push(Object.freeze({
          consumerImplementationId, slotId: slot.slotId, capabilityId: slot.capabilityId,
          cardinality: slot.cardinality.kind, candidates: Object.freeze(candidates),
        }));
      }
    }
  }
  if (unresolved.length > 0) {
    return { ok: false, unresolved: Object.freeze(unresolved.sort((a, b) =>
      compareCodePoints(a.consumerImplementationId, b.consumerImplementationId) || compareCodePoints(a.slotId, b.slotId))) };
  }
  const selections = [...input.byId.values()].map((metadata) => Object.freeze({
    moduleId: metadata.declaration.moduleId, implementationId: metadata.declaration.implementationId,
  })).sort((a, b) => compareCodePoints(a.implementationId, b.implementationId));
  return {
    ok: true,
    profile: Object.freeze({
      kind: "get-modular.composition-profile", schemaVersion: 1, profileId,
      roots: Object.freeze([...input.rootModuleIds].sort(compareCodePoints)),
      selections: Object.freeze(selections),
      bindings: Object.freeze(completed.sort((a, b) =>
        compareCodePoints(a.consumerImplementationId, b.consumerImplementationId) || compareCodePoints(a.slotId, b.slotId))),
    }),
  };
}
