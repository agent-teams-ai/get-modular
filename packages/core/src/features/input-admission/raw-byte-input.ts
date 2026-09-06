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

/** Synchronous wrapper, all-carrier byte preflight, then owned copies only. */
export function captureRawInput(input: unknown, sink: AdmissionDiagnosticSink): RawInputCapture {
  let hasErrors = false;
  const add = (diagnostic: DiagnosticCandidate): void => { hasErrors = true; sink.addUnique(diagnostic); };
  const empty = (): RawInputCapture => Object.freeze({ declarations: Object.freeze([]), profile: null,
    allDeclarationsCaptured: false, hasErrors, blocked: true });
  const invocation = inspectInvocation(input, "raw");
  if (invocation.kind === "invalid-wrapper") {
    for (const field of invocation.roots) {
      add(Object.freeze({ code: "input.invalid-byte-carrier", phase: "decode", coordinate: Object.freeze({}),
        path: Object.freeze([Object.freeze({ kind: "field", value: field })]),
        details: Object.freeze({ reason: "not-document-list" }) }));
    }
    return empty();
  }
  if (invocation.kind === "declarations-limit") { add(resourceDiagnostic("declarations")); return empty(); }
  const count = invocation.declarations.length;
  // true means within the document limit; false means oversized.
  // Rejected carriers retain only their primitive reason.
  const outcomes: (boolean | "not-uint8array" | "shared-storage" | "unusable-view")[] = [];
  let totalBytes = 0;
  let allDeclarationsCaptured = true;
  // Only captured intrinsics and own data may participate from the first
  // classification through the last eligible copy.
  for (let ordinal = 0; ordinal <= count; ordinal += 1) {
    const profile = ordinal === count;
    const value = profile ? invocation.profile : invocation.declarations[ordinal];
    const carrier = classifyByteCarrier(value);
    if (carrier.kind === "rejected") {
      appendOwn(outcomes, carrier.reason);
      if (!profile) allDeclarationsCaptured = false;
      continue;
    }
    // Oversized genuine views still contribute their complete visible length.
    // Invalid carriers contribute zero and never authorize byte observations.
    const nextTotal = totalBytes + carrier.visibleLength;
    totalBytes = nextTotal > admissionLimits.aggregateRawBytes ? admissionLimits.aggregateRawBytes + 1 : nextTotal;
    const limit = profile ? "profileRawDocumentBytes" : "declarationRawDocumentBytes";
    const admitted = carrier.visibleLength <= admissionLimits[limit];
    appendOwn(outcomes, admitted);
    if (!admitted && !profile) allDeclarationsCaptured = false;
  }
  const blocked = totalBytes > admissionLimits.aggregateRawBytes;
  const declarations: (Uint8Array | null)[] = [];
  let profile: Uint8Array | null = null;
  if (!blocked) {
    for (let ordinal = 0; ordinal < count; ordinal += 1) {
      appendOwn(declarations, outcomes[ordinal] === true ? copyByteCarrier(invocation.declarations[ordinal] as Uint8Array) : null);
    }
    profile = outcomes[count] === true ? copyByteCarrier(invocation.profile as Uint8Array) : null;
  }

  // Paths, diagnostic construction and sink calls may invoke caller code.
  // All preflight facts and eligible copies are complete before they run.
  for (let ordinal = 0; ordinal <= count; ordinal += 1) {
    const outcome = outcomes[ordinal]!;
    if (outcome === true) continue;
    const isProfile = ordinal === count;
    const locator: DocumentLocator = isProfile ? { kind: "profile" } : { kind: "declaration", ordinal };
    if (outcome === false) {
      add(resourceDiagnostic(isProfile ? "profileRawDocumentBytes" : "declarationRawDocumentBytes", documentPath(locator)));
    } else {
      add(Object.freeze({ code: "input.invalid-byte-carrier", phase: "decode", coordinate: Object.freeze({}),
        path: documentPath(locator), details: Object.freeze({ reason: outcome }) }));
    }
  }
  if (blocked) { add(resourceDiagnostic("aggregateRawBytes")); return empty(); }
  return Object.freeze({ declarations: Object.freeze(declarations), profile, allDeclarationsCaptured, hasErrors, blocked: false });
}
