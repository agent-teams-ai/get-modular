// Closed admission-owned values from the accepted resource-profile-v2. This
// is not a configurable profile or a dependency on qualification tooling.
const limits = {
  jsonValueOccurrences: 2_097_152,
  jsonDepth: 32,
  aggregateStringBytes: 8_388_608,
  identifierBytes: 128,
  ownerPathSegments: 8,
  declarations: 4096,
  capabilitiesPerDeclaration: 64,
  slotsPerDeclaration: 128,
  totalCapabilities: 65_536,
  totalSlots: 65_536,
  roots: 1024,
  selections: 4096,
  bindings: 65_536,
} as const;
export const admissionLimits: typeof limits = Object.freeze(limits);
export type AdmissionLimit = keyof typeof admissionLimits;
export type DocumentLimit = "identifierBytes" | "ownerPathSegments" |
  "capabilitiesPerDeclaration" | "slotsPerDeclaration" | "roots" | "selections" | "bindings";
export type ReportDocumentLimit = (name: DocumentLimit, actual: number, path: readonly (string | number)[]) => void;
