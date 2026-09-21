import type { DiagnosticCandidate } from "../diagnostics/internal.js";
import { classifyByteCarrier, copyByteCarrier } from "./byte-carrier.js";
import { documentPath, type DocumentLocator } from "./document-path.js";
import { inspectInvocation } from "./invocation-wrapper.js";
import type { AdmissionDiagnosticSink } from "./ports.js";
import { admissionLimits } from "./resource-limits.js";
import { resourceDiagnostic } from "./resource-diagnostic.js";

const defineProperty = Object.defineProperty;

// Bypass replaceable array methods and inherited index setters.
function appendOwn<T>(values: T[], value: T): void {
  // Descriptor conversion must not consult inherited properties either.
  const descriptor = { __proto__: null, value, enumerable: true, configurable: true, writable: true };
  defineProperty(values, values.length, descriptor);
}

export type RawInputCapture = {
  readonly declarations: readonly (Uint8Array | null)[];
  readonly profile: Uint8Array | null;
  readonly allDeclarationsCaptured: boolean;
  readonly hasErrors: boolean;
  readonly blocked: boolean;
};

type CarrierOutcome = boolean | "not-uint8array" | "shared-storage" | "unusable-view";
type AdmittedInvocation = Extract<ReturnType<typeof inspectInvocation>, { readonly kind: "admitted" }>;
type AddDiagnostic = (diagnostic: DiagnosticCandidate) => void;

function defined<T>(value: T | undefined): T {
  if (value === undefined) {throw new Error("Missing internal carrier outcome");}
  return value;
}

function reportInvalidWrapper(roots: readonly string[], add: AddDiagnostic): void {
  for (const field of roots) {
    add(Object.freeze({ code: "input.invalid-byte-carrier", phase: "decode", coordinate: Object.freeze({}),
      path: Object.freeze([Object.freeze({ kind: "field", value: field })]),
      details: Object.freeze({ reason: "not-document-list" }) }));
  }
}

function preflightCarriers(invocation: AdmittedInvocation): {
  readonly outcomes: readonly CarrierOutcome[];
  readonly totalBytes: number;
  readonly allDeclarationsCaptured: boolean;
} {
  const count = invocation.declarations.length;
  const outcomes: CarrierOutcome[] = [];
  let totalBytes = 0;
  let allDeclarationsCaptured = true;
  for (let ordinal = 0; ordinal <= count; ordinal += 1) {
    const profile = ordinal === count;
    const value = profile ? invocation.profile : invocation.declarations[ordinal];
    const carrier = classifyByteCarrier(value);
    if (carrier.kind === "rejected") {
      appendOwn(outcomes, carrier.reason);
      if (!profile) {allDeclarationsCaptured = false;}
      continue;
    }
    const nextTotal = totalBytes + carrier.visibleLength;
    totalBytes = nextTotal > admissionLimits.aggregateRawBytes ? admissionLimits.aggregateRawBytes + 1 : nextTotal;
    const limit = profile ? "profileRawDocumentBytes" : "declarationRawDocumentBytes";
    const admitted = carrier.visibleLength <= admissionLimits[limit];
    appendOwn(outcomes, admitted);
    if (!admitted && !profile) {allDeclarationsCaptured = false;}
  }
  return { outcomes, totalBytes, allDeclarationsCaptured };
}

function copyCaptured(invocation: AdmittedInvocation, outcomes: readonly CarrierOutcome[]): {
  readonly declarations: readonly (Uint8Array | null)[];
  readonly profile: Uint8Array | null;
} {
  const declarations: (Uint8Array | null)[] = [];
  for (let ordinal = 0; ordinal < invocation.declarations.length; ordinal += 1) {
    appendOwn(declarations, outcomes[ordinal] === true
      ? copyByteCarrier(invocation.declarations[ordinal] as Uint8Array) : null);
  }
  const profile = outcomes[invocation.declarations.length] === true
    ? copyByteCarrier(invocation.profile as Uint8Array) : null;
  return { declarations, profile };
}

function reportCarrierOutcomes(outcomes: readonly CarrierOutcome[], count: number, add: AddDiagnostic): void {
  for (let ordinal = 0; ordinal <= count; ordinal += 1) {
    const outcome = defined(outcomes[ordinal]);
    if (outcome === true) {continue;}
    const isProfile = ordinal === count;
    const locator: DocumentLocator = isProfile ? { kind: "profile" } : { kind: "declaration", ordinal };
    if (outcome === false) {
      add(resourceDiagnostic(isProfile ? "profileRawDocumentBytes" : "declarationRawDocumentBytes", documentPath(locator)));
    } else {
      add(Object.freeze({ code: "input.invalid-byte-carrier", phase: "decode", coordinate: Object.freeze({}),
        path: documentPath(locator), details: Object.freeze({ reason: outcome }) }));
    }
  }
}

/** Synchronous wrapper, all-carrier byte preflight, then owned copies only. */
export function captureRawInput(input: unknown, sink: AdmissionDiagnosticSink): RawInputCapture {
  let hasErrors = false;
  const add = (diagnostic: DiagnosticCandidate): void => { hasErrors = true; sink.addUnique(diagnostic); };
  const empty = (): RawInputCapture => Object.freeze({ declarations: Object.freeze([]), profile: null,
    allDeclarationsCaptured: false, hasErrors, blocked: true });
  const invocation = inspectInvocation(input, "raw");
  if (invocation.kind === "invalid-wrapper") {
    reportInvalidWrapper(invocation.roots, add);
    return empty();
  }
  if (invocation.kind === "declarations-limit") { add(resourceDiagnostic("declarations")); return empty(); }
  const count = invocation.declarations.length;
  // true means within the document limit; false means oversized.
  // Rejected carriers retain only their primitive reason.
  // Only captured intrinsics and own data may participate from the first
  // classification through the last eligible copy.
  const { outcomes, totalBytes, allDeclarationsCaptured } = preflightCarriers(invocation);
  const blocked = totalBytes > admissionLimits.aggregateRawBytes;
  const copied = blocked ? { declarations: Object.freeze([]), profile: null } : copyCaptured(invocation, outcomes);

  // Paths, diagnostic construction and sink calls may invoke caller code.
  // All preflight facts and eligible copies are complete before they run.
  reportCarrierOutcomes(outcomes, count, add);
  if (blocked) { add(resourceDiagnostic("aggregateRawBytes")); return empty(); }
  return Object.freeze({ declarations: Object.freeze(copied.declarations), profile: copied.profile,
    allDeclarationsCaptured, hasErrors, blocked: false });
}
