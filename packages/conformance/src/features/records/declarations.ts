import type { ModuleDeclaration } from "@get-modular/core";
import { invalid } from "../errors/errors.js";
import { ownData, ownTextField } from "./own.js";

export type DeclarationCardinality = "required" | "optional" | "many";

/** The facts of a `ModuleDeclaration` that the oracle checks read, validated from own data only. */
export type DeclarationFacts = {
  readonly moduleId: string;
  readonly implementationId: string;
  readonly provides: readonly string[];
  readonly slots: ReadonlyMap<string, { readonly capabilityId: string; readonly cardinality: DeclarationCardinality }>;
};

/** The declarations a test passes to `checkNamespaces`, `compileComposition` and `checkWiring`. */
export type DeclarationList = readonly ModuleDeclaration[];

function items(record: unknown, path: string, caller: string): readonly unknown[] {
  if (!Array.isArray(record)) {
    throw invalid(`${caller}() requires ${path} to be an array`);
  }
  return record;
}

/** Reads every declaration of a list; a malformed one is a `conformance.argument.invalid`. */
export function readDeclarations(list: unknown, path: string, caller: string): readonly DeclarationFacts[] {
  const declarations = items(list, path, caller);
  const facts: DeclarationFacts[] = [];
  for (let index = 0; index < declarations.length; index += 1) {
    const at = `${path}[${String(index)}]`;
    const declaration: unknown = ownData(declarations, String(index));
    const provided = items(ownData(declaration, "provides"), `${at}.provides`, caller);
    const slots = items(ownData(declaration, "slots"), `${at}.slots`, caller);
    const slotFacts = new Map<string, { readonly capabilityId: string; readonly cardinality: DeclarationCardinality }>();
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const slotPath = `${at}.slots[${String(slotIndex)}]`;
      const slot: unknown = ownData(slots, String(slotIndex));
      const kind = ownData(ownData(slot, "cardinality"), "kind");
      if (kind !== "required" && kind !== "optional" && kind !== "many") {
        throw invalid(`${caller}() requires ${slotPath}.cardinality.kind to be required, optional or many`);
      }
      slotFacts.set(ownTextField(slot, slotPath, "slotId", caller), {
        capabilityId: ownTextField(slot, slotPath, "capabilityId", caller), cardinality: kind,
      });
    }
    facts.push(Object.freeze({
      moduleId: ownTextField(declaration, at, "moduleId", caller),
      implementationId: ownTextField(declaration, at, "implementationId", caller),
      provides: Object.freeze(provided.map((entry, provideIndex) =>
        ownTextField(entry, `${at}.provides[${String(provideIndex)}]`, "capabilityId", caller))),
      slots: slotFacts,
    }));
  }
  return Object.freeze(facts);
}
