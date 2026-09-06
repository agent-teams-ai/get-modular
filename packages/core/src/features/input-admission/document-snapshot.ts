import type { CompositionProfile, ModuleDeclaration } from "../authoring/internal.js";
import { objectDocument, type DocumentView } from "./document-reader.js";

type Compatibility = ModuleDeclaration["provides"][number]["compatibility"];
type Cardinality = ModuleDeclaration["slots"][number]["cardinality"];

function record<Value extends object>(fields: Value): Value {
  const value = Object.create(null) as Value;
  for (const key of Object.keys(fields)) {
    Object.defineProperty(value, key, { value: fields[key as keyof Value], enumerable: true });
  }
  return Object.freeze(value);
}

// One fixed-schema projection for either reader. Every record is defined into
// null-prototype owned storage; arrays preserve caller order and occurrences.
// The caller has already proved whole-batch resource and document schema facts.
function projection<Value>(view: DocumentView<Value>) {
  const reader = view.reader;
  function member(value: Value, key: string): Value {
    const own = reader.own(value, key);
    if (!own.present) throw new TypeError("Snapshot requires an admitted document");
    return own.value;
  }
  function text(value: Value, key: string): string { return reader.text(member(value, key)); }
  function integer(value: Value, key: string): number {
    const result = reader.integer(member(value, key));
    if (!result.admitted) throw new TypeError("Snapshot requires an admitted integer");
    return result.value;
  }
  function list<Result>(value: Value, key: string, copy: (item: Value) => Result): readonly Result[] {
    const source = member(value, key);
    const result: Result[] = [];
    const length = reader.length(source);
    for (let index = 0; index < length; index += 1) result.push(copy(reader.item(source, index)));
    return Object.freeze(result);
  }
  function compatibility(value: Value): Compatibility {
    return record<Compatibility>({ family: "exact", familyVersion: 1, token: text(value, "token") });
  }
  function cardinality(value: Value): Cardinality {
    const kind = text(value, "kind");
    if (kind === "many") return record<Cardinality>({ kind, min: integer(value, "min"), max: integer(value, "max"), order: "profile" });
    if (kind === "required" || kind === "optional") return record<Cardinality>({ kind });
    throw new TypeError("Snapshot requires an admitted cardinality");
  }
  return {
    declaration(): ModuleDeclaration {
      const value = view.root;
      const owner = member(value, "owner");
      return record<ModuleDeclaration>({
        kind: "get-modular.module-declaration", schemaVersion: 1,
        moduleId: text(value, "moduleId"), implementationId: text(value, "implementationId"),
        owner: record({ authority: text(owner, "authority"), path: list(owner, "path", item => reader.text(item)) }),
        provides: list(value, "provides", item => record({ capabilityId: text(item, "capabilityId"),
          compatibility: compatibility(member(item, "compatibility")) })),
        slots: list(value, "slots", item => record({ slotId: text(item, "slotId"), capabilityId: text(item, "capabilityId"),
          compatibility: compatibility(member(item, "compatibility")), cardinality: cardinality(member(item, "cardinality")) })),
      });
    },
    profile(): CompositionProfile {
      const value = view.root;
      return record<CompositionProfile>({
        kind: "get-modular.composition-profile", schemaVersion: 1, profileId: text(value, "profileId"),
        roots: list(value, "roots", item => reader.text(item)),
        selections: list(value, "selections", item => record({ moduleId: text(item, "moduleId"), implementationId: text(item, "implementationId") })),
        bindings: list(value, "bindings", item => record({ consumerImplementationId: text(item, "consumerImplementationId"),
          slotId: text(item, "slotId"), providerImplementationIds: list(item, "providerImplementationIds", provider => reader.text(provider)) })),
      });
    },
  };
}

export function snapshotDeclaration(value: ModuleDeclaration): ModuleDeclaration {
  return snapshotDeclarationView(objectDocument(value));
}
export function snapshotProfile(value: CompositionProfile): CompositionProfile {
  return snapshotProfileView(objectDocument(value));
}
export function snapshotDeclarationView<Value>(view: DocumentView<Value>): ModuleDeclaration {
  return projection(view).declaration();
}
export function snapshotProfileView<Value>(view: DocumentView<Value>): CompositionProfile {
  return projection(view).profile();
}
