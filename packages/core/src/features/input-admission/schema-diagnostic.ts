import type { Diagnostic } from "../authoring/internal.js";
import type { DocumentShapeViolation } from "./document-shape.js";

export type DocumentLocator =
  | { readonly kind: "declaration"; readonly ordinal: number }
  | { readonly kind: "profile" };

// The shape checker supplies only schema-known path fields and bounded indices.
// These failures have no semantic coordinates; failed documents never acquire
// an identity merely because one field happened to contain a valid-looking ID.
export function schemaDiagnostic(violation: DocumentShapeViolation, locator: DocumentLocator): Diagnostic {
  const prefix = locator.kind === "declaration"
    ? [{ kind: "field" as const, value: "declarations" }, { kind: "index" as const, value: locator.ordinal }]
    : [{ kind: "field" as const, value: "profile" }];
  const path = Object.freeze([...prefix, ...violation.path.map(value => typeof value === "string"
    ? { kind: "field" as const, value } : { kind: "index" as const, value })]
    .slice(0, 32).map(segment => Object.freeze(segment)));
  const common = { phase: "schema" as const, path, coordinate: Object.freeze({}) };
  switch (violation.rule) {
    case "unsupported-version":
      return Object.freeze({ ...common, code: "schema.unsupported-version", details: Object.freeze({ reason: "unsupported-version" }) });
    case "closed":
      return Object.freeze({ ...common, code: "schema.unknown-field", details: Object.freeze({ reason: "unknown-field" }) });
    case "identity":
      return Object.freeze({ ...common, code: "identity.invalid", details: Object.freeze({ reason: "invalid-format" }) });
    case "type": case "required": case "integer":
      return Object.freeze({ ...common, code: "schema.invalid-value", details: Object.freeze({ reason: "invalid-type" }) });
    case "constant": case "range": case "size": case "unicode":
      return Object.freeze({ ...common, code: "schema.invalid-value", details: Object.freeze({ reason: "invalid-format" }) });
  }
}
