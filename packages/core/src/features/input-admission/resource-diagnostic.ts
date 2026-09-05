import type { Diagnostic } from "../authoring/internal.js";
import type { DiagnosticCandidate } from "../diagnostics/internal.js";
import { admissionLimits, type AdmissionLimit } from "./resource-limits.js";

type LimitDiagnostic = Extract<DiagnosticCandidate, { readonly code: "input.limit-exceeded" }>;
const phases = Object.freeze({
  jsonValueOccurrences: "schema", jsonDepth: "decode", aggregateStringBytes: "decode",
  identifierBytes: "schema", ownerPathSegments: "declaration", declarations: "declaration",
  capabilitiesPerDeclaration: "declaration", slotsPerDeclaration: "declaration",
  totalCapabilities: "declaration", totalSlots: "declaration",
  roots: "profile", selections: "profile", bindings: "profile",
} as const satisfies { [L in AdmissionLimit]: Extract<LimitDiagnostic, { details: { limitName: L } }>["phase"] });

// Admission calls this only for an established over-limit count. Fixed
// limit+1 saturation avoids exposing input magnitude beyond the named bound.
export function resourceDiagnostic(name: AdmissionLimit, path: Diagnostic["path"] = []): LimitDiagnostic {
  const limit = admissionLimits[name];
  return Object.freeze({ code: "input.limit-exceeded", phase: phases[name],
    path: Object.freeze(path.map(segment => Object.freeze({ ...segment }))),
    coordinate: Object.freeze({}), details: Object.freeze({ limitName: name, limit, actual: limit + 1 }),
  }) as LimitDiagnostic;
}
