import type { CompositionProfile } from "../authoring/internal.js";
import { objectDocument, type DocumentView, type OwnMember } from "./document-reader.js";
import { isLocalTokenFormat, isPortableIdFormat } from "./identity-format.js";
import type { BindingResourceCount, ProfileResourceFacts } from "./ports.js";
import { admissionLimits } from "./resource-limits.js";

export function ownValue(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}
function portable(value: unknown): value is string {
  return typeof value === "string" && value.length <= admissionLimits.identifierBytes && isPortableIdFormat(value);
}

/** Only a completely resource-bounded, plain cooperative document enters. */
export function profileResourceFacts(value: unknown): ProfileResourceFacts {
  return profileResourceFactsView(objectDocument(value));
}

/** Resource-only observations over an already decoded, resource-bounded view. */
export function profileResourceFactsView<Value>(view: DocumentView<Value>): ProfileResourceFacts {
  const { root, reader } = view;
  function ownMember(value: Value, key: string): OwnMember<Value> {
    return reader.kind(value) === "record" ? reader.own(value, key) : { present: false };
  }
  function textMember(value: Value, key: string): string | null {
    const member = ownMember(value, key);
    return member.present && reader.kind(member.value) === "string" ? reader.text(member.value) : null;
  }

  const selections: CompositionProfile["selections"][number][] = [];
  let selectionCensusComplete = false;
  const selectionRows = ownMember(root, "selections");
  if (selectionRows.present && reader.kind(selectionRows.value) === "array") {
    const length = reader.length(selectionRows.value);
    if (length <= admissionLimits.selections) {
      selectionCensusComplete = true;
      for (let index = 0; index < length; index += 1) {
        const row = reader.item(selectionRows.value, index);
        const moduleId = textMember(row, "moduleId");
        const implementationId = textMember(row, "implementationId");
        // A failed row withholds completeness, not other positive membership.
        if (!portable(moduleId) || !portable(implementationId)) { selectionCensusComplete = false; continue; }
        selections.push(Object.freeze({ moduleId, implementationId }));
      }
    }
  }
  const bindings: BindingResourceCount[] = [];
  const bindingRows = ownMember(root, "bindings");
  if (bindingRows.present && reader.kind(bindingRows.value) === "array") {
    const length = reader.length(bindingRows.value);
    if (length <= admissionLimits.bindings) {
      for (let ordinal = 0; ordinal < length; ordinal += 1) {
        const row = reader.item(bindingRows.value, ordinal);
        const consumerImplementationId = textMember(row, "consumerImplementationId");
        const slot = textMember(row, "slotId");
        const providers = ownMember(row, "providerImplementationIds");
        if (!portable(consumerImplementationId) || !providers.present || reader.kind(providers.value) !== "array") continue;
        const slotId = slot !== null && slot.length <= 64 && isLocalTokenFormat(slot) ? slot : null;
        // Provider contents never become evidence here; retain only their exact count.
        bindings.push(Object.freeze({ ordinal, consumerImplementationId, slotId,
          providerOccurrences: reader.length(providers.value) }));
      }
    }
  }
  return Object.freeze({ selections: Object.freeze(selections), selectionCensusComplete, bindings: Object.freeze(bindings) });
}
