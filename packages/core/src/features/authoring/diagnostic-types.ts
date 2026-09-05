import type { Compatibility, CompositionPlan, PlanDigest } from "./wire-types.js";

export type DiagnosticPathSegment =
  | { readonly kind: "field"; readonly value: string }
  | { readonly kind: "index"; readonly value: number };

type EmptyCoordinate = Readonly<Record<string, never>>;
type ModuleCoordinate = { readonly moduleId: string };
type ImplementationCoordinate = { readonly implementationId: string };
type SelectionCoordinate = ModuleCoordinate & ImplementationCoordinate;
type SlotCoordinate = ImplementationCoordinate & { readonly slotId: string };
type ProviderCoordinate = SlotCoordinate & { readonly providerImplementationId: string };
type Reason<R extends string> = { readonly reason: R };
type RecordFor<Code extends string, Phase extends string, Coordinate, Details> = {
  readonly code: Code;
  readonly phase: Phase;
  readonly path: readonly DiagnosticPathSegment[];
  readonly coordinate: Coordinate;
  readonly details: Details;
};

// This inert type mapping is owned by the public authoring contract, not a
// configurable diagnostic engine. Runtime limits remain admission-owned.
type LimitPhase = {
  declarationRawDocumentBytes: "decode";
  profileRawDocumentBytes: "decode";
  aggregateRawBytes: "decode";
  jsonValueOccurrences: "schema";
  jsonDepth: "decode";
  aggregateStringBytes: "decode";
  identifierBytes: "schema";
  ownerPathSegments: "declaration";
  declarations: "declaration";
  capabilitiesPerDeclaration: "declaration";
  slotsPerDeclaration: "declaration";
  totalCapabilities: "declaration";
  totalSlots: "declaration";
  roots: "profile";
  selections: "profile";
  bindings: "profile";
  graphEdges: "graph";
  providersPerManySlot: "binding";
  graphDepth: "graph";
  diagnostics: "output";
  diagnosticPathSegments: "output";
};
type LimitDiagnostic = {
  [L in keyof LimitPhase]: RecordFor<"input.limit-exceeded", LimitPhase[L], EmptyCoordinate, {
    readonly limitName: L;
    readonly limit: number;
    readonly actual: number;
  }>;
}[keyof LimitPhase];

export type Diagnostic =
  | RecordFor<"decode.invalid-json", "decode", EmptyCoordinate, Reason<"invalid-json">>
  | RecordFor<"decode.duplicate-key", "decode", EmptyCoordinate, Reason<"duplicate-key">>
  | LimitDiagnostic
  | RecordFor<"schema.unsupported-version", "schema", EmptyCoordinate, Reason<"unsupported-version">>
  | RecordFor<"schema.unknown-field", "schema", EmptyCoordinate, Reason<"unknown-field">>
  | RecordFor<"schema.invalid-value", "schema", EmptyCoordinate, Reason<"invalid-type" | "invalid-format">>
  | RecordFor<"schema.non-plain-value", "schema", EmptyCoordinate, Reason<"non-plain-value">>
  | RecordFor<"identity.invalid", "schema", EmptyCoordinate, Reason<"invalid-format">>
  | RecordFor<"declaration.duplicate-implementation", "declaration", ImplementationCoordinate, Reason<"duplicate">>
  | RecordFor<"declaration.duplicate-capability", "declaration", ImplementationCoordinate, Reason<"duplicate">>
  | RecordFor<"declaration.duplicate-slot", "declaration", SlotCoordinate, Reason<"duplicate">>
  | RecordFor<"profile.duplicate-root", "profile", ModuleCoordinate, Reason<"duplicate">>
  | RecordFor<"profile.unknown-root", "profile", ModuleCoordinate, Reason<"unknown">>
  | RecordFor<"profile.duplicate-selection", "profile", ModuleCoordinate, Reason<"duplicate">>
  | RecordFor<"profile.unknown-module", "profile", ModuleCoordinate, Reason<"unknown">>
  | RecordFor<"profile.unknown-implementation", "profile", SelectionCoordinate, Reason<"unknown">>
  | RecordFor<"profile.implementation-mismatch", "profile", SelectionCoordinate, Reason<"mismatch">>
  | RecordFor<"profile.missing-selection", "profile", ModuleCoordinate, Reason<"missing">>
  | RecordFor<"profile.unreachable-selection", "graph", SelectionCoordinate, Reason<"unreachable">>
  | RecordFor<"binding.duplicate", "binding", ProviderCoordinate, Reason<"duplicate">>
  | RecordFor<"binding.missing", "binding", SlotCoordinate, Reason<"missing">>
  | RecordFor<"binding.unknown-consumer", "binding", ImplementationCoordinate, Reason<"unknown">>
  | RecordFor<"binding.unknown-slot", "binding", SlotCoordinate, Reason<"unknown">>
  | RecordFor<"binding.unknown-provider", "binding", ProviderCoordinate, Reason<"unknown">>
  | RecordFor<"binding.provider-not-selected", "binding", ProviderCoordinate, Reason<"mismatch">>
  | RecordFor<"binding.cardinality", "binding", SlotCoordinate, {
    readonly expectedCardinality: "required" | "optional" | "many";
    readonly actualCardinality: number;
  }>
  | RecordFor<"binding.capability-missing", "binding", ProviderCoordinate, Reason<"missing">>
  | RecordFor<"binding.compatibility-mismatch", "binding", ProviderCoordinate, {
    readonly expectedCompatibility: Compatibility;
    readonly actualCompatibility: Compatibility;
  }>
  | RecordFor<"graph.cycle", "graph", EmptyCoordinate, { readonly component: readonly string[] }>
  | RecordFor<"diagnostics.truncated", "output", EmptyCoordinate, { readonly omitted: number }>;

export type DiagnosticCode = Diagnostic["code"];

export type CompileCompositionResult =
  | { readonly ok: true; readonly plan: CompositionPlan; readonly digest: PlanDigest }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };
