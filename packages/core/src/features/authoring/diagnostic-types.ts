import type { CompositionPlan, PlanDigest } from "./wire-types.js";

export type Diagnostic =
  | {
      readonly [K in
        | "input.invalid-byte-carrier"
        | "decode.invalid-json"
        | "decode.duplicate-key"
        | "schema.unsupported-version"
        | "schema.unknown-field"
        | "schema.invalid-value"
        | "schema.non-plain-value"
        | "identity.invalid"
        | "declaration.duplicate-implementation"
        | "declaration.duplicate-capability"
        | "declaration.duplicate-slot"
        | "profile.duplicate-root"
        | "profile.unknown-root"
        | "profile.duplicate-selection"
        | "profile.unknown-module"
        | "profile.unknown-implementation"
        | "profile.implementation-mismatch"
        | "profile.missing-selection"
        | "profile.unreachable-selection"
        | "binding.duplicate-record"
        | "binding.duplicate"
        | "binding.missing"
        | "binding.unknown-consumer"
        | "binding.unknown-slot"
        | "binding.unknown-provider"
        | "binding.provider-not-selected"
        | "binding.cardinality"
        | "binding.capability-missing"
        | "binding.compatibility-mismatch"
        | "graph.cycle"
        | "diagnostics.truncated"]: {
        readonly code: K;
        readonly phase: K extends
          | "input.invalid-byte-carrier"
          | "decode.invalid-json"
          | "decode.duplicate-key" ? "decode"
          : K extends
            | "schema.unsupported-version"
            | "schema.unknown-field"
            | "schema.invalid-value"
            | "schema.non-plain-value"
            | "identity.invalid" ? "schema"
          : K extends
            | "declaration.duplicate-implementation"
            | "declaration.duplicate-capability"
            | "declaration.duplicate-slot" ? "declaration"
          : K extends
            | "profile.duplicate-root"
            | "profile.unknown-root"
            | "profile.duplicate-selection"
            | "profile.unknown-module"
            | "profile.unknown-implementation"
            | "profile.implementation-mismatch"
            | "profile.missing-selection" ? "profile"
          : K extends "profile.unreachable-selection" | "graph.cycle" ? "graph"
          : K extends "diagnostics.truncated" ? "output"
          : "binding";
        readonly path: readonly (
          | { readonly kind: "field"; readonly value: string }
          | { readonly kind: "index"; readonly value: number }
        )[];
        readonly coordinate: K extends
          | "input.invalid-byte-carrier"
          | "decode.invalid-json"
          | "decode.duplicate-key"
          | "schema.unsupported-version"
          | "schema.unknown-field"
          | "schema.invalid-value"
          | "schema.non-plain-value"
          | "identity.invalid"
          | "graph.cycle"
          | "diagnostics.truncated" ? Readonly<Record<string, never>>
          : K extends
            | "profile.duplicate-root"
            | "profile.unknown-root"
            | "profile.duplicate-selection"
            | "profile.unknown-module"
            | "profile.missing-selection" ? { readonly moduleId: string }
          : K extends
            | "declaration.duplicate-implementation"
            | "declaration.duplicate-capability"
            | "binding.unknown-consumer" ? { readonly implementationId: string }
          : K extends "profile.unknown-implementation" | "profile.implementation-mismatch" | "profile.unreachable-selection"
            ? { readonly moduleId: string; readonly implementationId: string }
          : K extends
            | "declaration.duplicate-slot"
            | "binding.duplicate-record"
            | "binding.missing"
            | "binding.unknown-slot"
            | "binding.cardinality"
            ? { readonly implementationId: string; readonly slotId: string }
          : {
              readonly implementationId: string;
              readonly slotId: string;
              readonly providerImplementationId: string;
            };
        readonly details: K extends "binding.cardinality" ? {
          readonly expectedCardinality: "required" | "optional" | "many";
          readonly actualCardinality: number;
        } : K extends "binding.compatibility-mismatch" ? {
          readonly expectedCompatibility: {
            readonly family: "exact";
            readonly familyVersion: 1;
            readonly token: string;
          };
          readonly actualCompatibility: {
            readonly family: "exact";
            readonly familyVersion: 1;
            readonly token: string;
          };
        } : K extends "graph.cycle" ? { readonly component: readonly string[] }
          : K extends "diagnostics.truncated" ? { readonly omitted: number }
          : {
              readonly reason: K extends "input.invalid-byte-carrier"
                ? "not-uint8array" | "unusable-view" | "shared-storage" | "not-document-list"
                : K extends "decode.invalid-json" ? "invalid-json"
                : K extends "decode.duplicate-key" ? "duplicate-key"
                : K extends "schema.unsupported-version" ? "unsupported-version"
                : K extends "schema.unknown-field" ? "unknown-field"
                : K extends "schema.invalid-value" ? "invalid-type" | "invalid-format"
                : K extends "schema.non-plain-value" ? "non-plain-value"
                : K extends "identity.invalid" ? "invalid-format"
                : K extends
                  | "declaration.duplicate-implementation"
                  | "declaration.duplicate-capability"
                  | "declaration.duplicate-slot"
                  | "profile.duplicate-root"
                  | "profile.duplicate-selection"
                  | "binding.duplicate-record"
                  | "binding.duplicate" ? "duplicate"
                : K extends
                  | "profile.unknown-root"
                  | "profile.unknown-module"
                  | "profile.unknown-implementation"
                  | "binding.unknown-consumer"
                  | "binding.unknown-slot"
                  | "binding.unknown-provider" ? "unknown"
                : K extends "profile.implementation-mismatch" | "binding.provider-not-selected" ? "mismatch"
                : K extends "profile.missing-selection" | "binding.missing" | "binding.capability-missing" ? "missing"
                : "unreachable";
            };
      };
    }[
      | "input.invalid-byte-carrier"
      | "decode.invalid-json"
      | "decode.duplicate-key"
      | "schema.unsupported-version"
      | "schema.unknown-field"
      | "schema.invalid-value"
      | "schema.non-plain-value"
      | "identity.invalid"
      | "declaration.duplicate-implementation"
      | "declaration.duplicate-capability"
      | "declaration.duplicate-slot"
      | "profile.duplicate-root"
      | "profile.unknown-root"
      | "profile.duplicate-selection"
      | "profile.unknown-module"
      | "profile.unknown-implementation"
      | "profile.implementation-mismatch"
      | "profile.missing-selection"
      | "profile.unreachable-selection"
      | "binding.duplicate-record"
      | "binding.duplicate"
      | "binding.missing"
      | "binding.unknown-consumer"
      | "binding.unknown-slot"
      | "binding.unknown-provider"
      | "binding.provider-not-selected"
      | "binding.cardinality"
      | "binding.capability-missing"
      | "binding.compatibility-mismatch"
      | "graph.cycle"
      | "diagnostics.truncated"]
  | {
      readonly [L in
        | "declarationRawDocumentBytes"
        | "profileRawDocumentBytes"
        | "aggregateRawBytes"
        | "jsonValueOccurrences"
        | "jsonDepth"
        | "aggregateStringBytes"
        | "identifierBytes"
        | "ownerPathSegments"
        | "declarations"
        | "capabilitiesPerDeclaration"
        | "slotsPerDeclaration"
        | "totalCapabilities"
        | "totalSlots"
        | "roots"
        | "selections"
        | "bindings"
        | "graphEdges"
        | "providersPerManySlot"
        | "graphDepth"
        | "diagnostics"
        | "diagnosticPathSegments"]: {
        readonly code: "input.limit-exceeded";
        readonly phase: L extends "jsonValueOccurrences" | "identifierBytes" ? "schema"
          : L extends
            | "ownerPathSegments"
            | "declarations"
            | "capabilitiesPerDeclaration"
            | "slotsPerDeclaration"
            | "totalCapabilities"
            | "totalSlots" ? "declaration"
          : L extends "roots" | "selections" | "bindings" ? "profile"
          : L extends "providersPerManySlot" ? "binding"
          : L extends "graphEdges" | "graphDepth" ? "graph"
          : L extends "diagnostics" | "diagnosticPathSegments" ? "output"
          : "decode";
        readonly path: readonly (
          | { readonly kind: "field"; readonly value: string }
          | { readonly kind: "index"; readonly value: number }
        )[];
        readonly coordinate: Readonly<Record<string, never>>;
        readonly details: { readonly limitName: L; readonly limit: number; readonly actual: number };
      };
    }[
      | "declarationRawDocumentBytes"
      | "profileRawDocumentBytes"
      | "aggregateRawBytes"
      | "jsonValueOccurrences"
      | "jsonDepth"
      | "aggregateStringBytes"
      | "identifierBytes"
      | "ownerPathSegments"
      | "declarations"
      | "capabilitiesPerDeclaration"
      | "slotsPerDeclaration"
      | "totalCapabilities"
      | "totalSlots"
      | "roots"
      | "selections"
      | "bindings"
      | "graphEdges"
      | "providersPerManySlot"
      | "graphDepth"
      | "diagnostics"
      | "diagnosticPathSegments"];

export type DiagnosticCode = Diagnostic["code"];

export type CompileCompositionResult =
  | { readonly ok: true; readonly plan: CompositionPlan; readonly digest: PlanDigest }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };
