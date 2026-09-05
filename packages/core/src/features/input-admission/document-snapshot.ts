import type { CompositionProfile, ModuleDeclaration } from "../authoring/internal.js";

type Compatibility = ModuleDeclaration["provides"][number]["compatibility"];
type Cardinality = ModuleDeclaration["slots"][number]["cardinality"];

function compatibility(value: Compatibility): Compatibility {
  return Object.freeze({ family: value.family, familyVersion: value.familyVersion, token: value.token });
}

function cardinality(value: Cardinality): Cardinality {
  return value.kind === "many"
    ? Object.freeze({ kind: value.kind, min: value.min, max: value.max, order: value.order })
    : Object.freeze({ kind: value.kind });
}

// Owner-private primitives for already resource-bounded, schema-validated
// cooperative documents. These are not validators or public unknown-input APIs.
// The closed wire shapes have fixed depth; loops copy every occurrence before
// an async boundary without recursion or retained caller containers.
export function snapshotDeclaration(value: ModuleDeclaration): ModuleDeclaration {
  return Object.freeze({
    kind: value.kind,
    schemaVersion: value.schemaVersion,
    moduleId: value.moduleId,
    implementationId: value.implementationId,
    owner: Object.freeze({ authority: value.owner.authority, path: Object.freeze([...value.owner.path]) }),
    provides: Object.freeze(value.provides.map(provided => Object.freeze({
      capabilityId: provided.capabilityId,
      compatibility: compatibility(provided.compatibility),
    }))),
    slots: Object.freeze(value.slots.map(slot => Object.freeze({
      slotId: slot.slotId,
      capabilityId: slot.capabilityId,
      compatibility: compatibility(slot.compatibility),
      cardinality: cardinality(slot.cardinality),
    }))),
  });
}

export function snapshotProfile(value: CompositionProfile): CompositionProfile {
  return Object.freeze({
    kind: value.kind,
    schemaVersion: value.schemaVersion,
    profileId: value.profileId,
    roots: Object.freeze([...value.roots]),
    selections: Object.freeze(value.selections.map(selection => Object.freeze({
      moduleId: selection.moduleId,
      implementationId: selection.implementationId,
    }))),
    bindings: Object.freeze(value.bindings.map(binding => Object.freeze({
      consumerImplementationId: binding.consumerImplementationId,
      slotId: binding.slotId,
      providerImplementationIds: Object.freeze([...binding.providerImplementationIds]),
    }))),
  });
}
