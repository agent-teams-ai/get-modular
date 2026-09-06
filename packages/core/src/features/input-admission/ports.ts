import type { CompositionProfile, ModuleDeclaration } from "../authoring/internal.js";
import type { DiagnosticCollector } from "../diagnostics/internal.js";

export type ObjectInput = { readonly declarations: readonly unknown[]; readonly profile: unknown };

export type BindingResourceCount = {
  readonly ordinal: number;
  readonly consumerImplementationId: string;
  readonly slotId: string | null;
  readonly providerOccurrences: number;
};
// These are resource-only observations, never an admitted semantic profile.
// A schema-invalid profile cannot create declarations, edges or plan bindings.
export type ProfileResourceFacts = {
  readonly selections: CompositionProfile["selections"];
  readonly selectionCensusComplete: boolean;
  readonly bindings: readonly BindingResourceCount[];
};

export type AdmittedObjectInput = {
  readonly declarations: readonly ModuleDeclaration[];
  // Complete admission is necessary, but not sufficient, for semantic identity
  // uniqueness. Semantics must still establish its own identity/module census.
  readonly allDeclarationsAdmitted: boolean;
  readonly profile: CompositionProfile | null;
  readonly profileResources: ProfileResourceFacts | null;
  readonly hasErrors: boolean;
};

export type AdmissionDiagnosticSink = Pick<DiagnosticCollector, "addUnique">;

export interface InputAdmissionPort {
  readonly admitObjectInput: (input: ObjectInput, collector: AdmissionDiagnosticSink) => AdmittedObjectInput;
}

export type InputAdmissionDeps = Readonly<Record<string, never>>;

// Consumer-owned structural contract; no import of a concrete scanner provider.
export type RawToken =
  | {
      readonly kind: "string";
      readonly start: number;
      readonly end: number;
      /** Decoded UTF-8 length, charging three bytes for each lone surrogate. */
      readonly decodedUtf8Bytes: number;
      readonly wellFormedUtf16: boolean;
    }
  | {
      readonly kind:
        | "object-start"
        | "object-end"
        | "array-start"
        | "array-end"
        | "colon"
        | "comma"
        | "true"
        | "false"
        | "null"
        | "number"
        | "end"
        | "invalid";
      readonly start: number;
      readonly end: number;
    };

export interface RawTokenCursor {
  /** Lexical failure emits one invalid token; subsequent calls return end. */
  readonly next: () => RawToken;
  /**
   * Lazily decode a string token returned by this cursor. Tokens remain usable
   * after later next calls, including end or invalid. Lone escaped surrogates
   * are preserved as UTF-16 code units for the consumer's schema checks.
   */
  readonly decodeString: (token: Extract<RawToken, { readonly kind: "string" }>) => string;
}

export interface RawScannerPort {
  /**
   * The consumer supplies owned, fixed bytes and keeps them unchanged for the
   * cursor's lifetime. Carrier admission, copying and resource policy belong
   * to the consumer. Each open call creates independent synchronous state.
   */
  readonly open: (ownedBytes: Uint8Array) => RawTokenCursor;
}

