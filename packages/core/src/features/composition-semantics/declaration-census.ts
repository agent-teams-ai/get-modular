import type { ModuleDeclaration } from "../authoring/internal.js";
import type { DiagnosticCollector } from "../diagnostics/internal.js";

type Capability = ModuleDeclaration["provides"][number];
type Slot = ModuleDeclaration["slots"][number];
export type DeclaredImplementation = {
  readonly declaration: ModuleDeclaration;
  // Undefined is absent; null is ambiguous. Neither is a chosen declaration.
  readonly capability: (id: string) => Capability | null | undefined;
  readonly slot: (id: string) => Slot | null | undefined;
  readonly uniqueSlots: readonly Slot[];
};
export type DeclarationCensus = {
  readonly implementation: (id: string) => DeclaredImplementation | null | undefined;
  readonly hasModule: (id: string) => boolean;
  readonly identityCensusComplete: boolean;
  readonly moduleCensusComplete: boolean;
  readonly hasErrors: boolean;
};

function uniqueIndex<T>(values: readonly T[], identity: (value: T) => string): Map<string, T | null> {
  const result = new Map<string, T | null>();
  for (const value of values) {
    const id = identity(value);
    result.set(id, result.has(id) ? null : value);
  }
  return result;
}

/** Only bounded, owned, frozen, whole-schema-admitted declarations enter. */
export function createDeclarationCensus(declarations: readonly ModuleDeclaration[], allDeclarationsAdmitted: boolean,
  collector: Pick<DiagnosticCollector, "addUnique">): DeclarationCensus {
  const groups = new Map<string, ModuleDeclaration[]>();
  const modules = new Set<string>();
  for (const declaration of declarations) {
    modules.add(declaration.moduleId);
    const group = groups.get(declaration.implementationId);
    if (group) group.push(declaration);
    else groups.set(declaration.implementationId, [declaration]);
  }
  let identitiesUnique = true;
  let hasErrors = false;
  const implementations = new Map<string, DeclaredImplementation | null>();
  const add: DiagnosticCollector["addUnique"] = diagnostic => { hasErrors = true; collector.addUnique(diagnostic); };
  for (const [implementationId, group] of groups) {
    if (group.length > 1) {
      identitiesUnique = false;
      implementations.set(implementationId, null);
      add(Object.freeze({ code: "declaration.duplicate-implementation", phase: "declaration", path: Object.freeze([]),
        coordinate: Object.freeze({ implementationId }), details: Object.freeze({ reason: "duplicate" }) }));
    }
    // These bounded, per-identity sets deduplicate normalized candidates across
    // duplicate declaration documents. They are not a global diagnostic set.
    const duplicateCapabilities = new Set<number>();
    const duplicateSlots = new Map<string, Set<number>>();
    for (const declaration of group) {
      const provides = [...declaration.provides].sort((left, right) => left.capabilityId < right.capabilityId ? -1 : left.capabilityId > right.capabilityId ? 1 : 0);
      const slots = [...declaration.slots].sort((left, right) => left.slotId < right.slotId ? -1 : left.slotId > right.slotId ? 1 : 0);
      // Structural positions belong to identity-sorted lists, never the caller's
      // registration order. Equal identities need no winner or value tie-break.
      for (let index = 1; index < provides.length; index += 1) {
        if (provides[index]!.capabilityId !== provides[index - 1]!.capabilityId || duplicateCapabilities.has(index)) continue;
        duplicateCapabilities.add(index);
        add(Object.freeze({ code: "declaration.duplicate-capability", phase: "declaration",
          path: Object.freeze([Object.freeze({ kind: "field", value: "provides" }), Object.freeze({ kind: "index", value: index })]),
          coordinate: Object.freeze({ implementationId }), details: Object.freeze({ reason: "duplicate" }) }));
      }
      for (let index = 1; index < slots.length; index += 1) {
        const slotId = slots[index]!.slotId;
        if (slotId !== slots[index - 1]!.slotId) continue;
        let seen = duplicateSlots.get(slotId);
        if (!seen) { seen = new Set<number>(); duplicateSlots.set(slotId, seen); }
        if (seen.has(index)) continue;
        seen.add(index);
        add(Object.freeze({ code: "declaration.duplicate-slot", phase: "declaration",
          path: Object.freeze([Object.freeze({ kind: "field", value: "slots" }), Object.freeze({ kind: "index", value: index })]),
          coordinate: Object.freeze({ implementationId, slotId }), details: Object.freeze({ reason: "duplicate" }) }));
      }
      if (group.length !== 1) continue;
      const capabilities = uniqueIndex(provides, capability => capability.capabilityId);
      const slotIndex = uniqueIndex(slots, slot => slot.slotId);
      implementations.set(implementationId, Object.freeze({ declaration,
        capability: (id: string) => capabilities.get(id), slot: (id: string) => slotIndex.get(id),
        uniqueSlots: Object.freeze([...slotIndex.values()].filter((slot): slot is Slot => slot !== null)),
      }));
    }
  }
  return Object.freeze({ implementation: (id: string) => implementations.get(id), hasModule: (id: string) => modules.has(id),
    identityCensusComplete: allDeclarationsAdmitted && identitiesUnique, moduleCensusComplete: allDeclarationsAdmitted, hasErrors });
}
