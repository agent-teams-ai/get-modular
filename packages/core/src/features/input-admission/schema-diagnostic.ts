import type { DiagnosticCandidate } from "../diagnostics/internal.js";
import type { DocumentShapeViolation } from "./document-shape.js";
import { documentPath, type DocumentLocator } from "./document-path.js";

// The shape checker supplies only schema-known path fields and bounded indices.
// These failures have no semantic coordinates; failed documents never acquire
// an identity merely because one field happened to contain a valid-looking ID.
export function schemaDiagnostic(violation: DocumentShapeViolation, locator: DocumentLocator): DiagnosticCandidate {
  const path = documentPath(locator, violation.path);
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
    case "constant": case "range": case "size":
      return Object.freeze({ ...common, code: "schema.invalid-value", details: Object.freeze({ reason: "invalid-format" }) });
  }
}
