import type { DiagnosticCandidate } from "../diagnostics/internal.js";
import { classifyByteCarrier, copyByteCarrier } from "./byte-carrier.js";
import { documentPath, type DocumentLocator } from "./document-path.js";
import { inspectInvocation } from "./invocation-wrapper.js";
import type { AdmissionDiagnosticSink } from "./ports.js";
import { admissionLimits } from "./resource-limits.js";
import { resourceDiagnostic } from "./resource-diagnostic.js";

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
  const eligible: boolean[] = [];
  let totalBytes = 0;
  let allDeclarationsCaptured = true;
  for (let ordinal = 0; ordinal <= count; ordinal += 1) {
    const profile = ordinal === count;
    const locator: DocumentLocator = profile ? { kind: "profile" } : { kind: "declaration", ordinal };
    const value = profile ? invocation.profile : invocation.declarations[ordinal];
    const carrier = classifyByteCarrier(value);
    if (carrier.kind === "rejected") {
      eligible.push(false);
      if (!profile) allDeclarationsCaptured = false;
      add(Object.freeze({ code: "input.invalid-byte-carrier", phase: "decode", coordinate: Object.freeze({}),
        path: documentPath(locator), details: Object.freeze({ reason: carrier.reason }) }));
      continue;
    }
    // Oversized genuine views still contribute their complete visible length.
    // Invalid carriers contribute zero and never authorize byte observations.
    totalBytes = Math.min(admissionLimits.aggregateRawBytes + 1, totalBytes + carrier.visibleLength);
    const limit = profile ? "profileRawDocumentBytes" : "declarationRawDocumentBytes";
    const admitted = carrier.visibleLength <= admissionLimits[limit];
    eligible.push(admitted);
    if (!admitted) {
      if (!profile) allDeclarationsCaptured = false;
      add(resourceDiagnostic(limit, documentPath(locator)));
    }
  }
  if (totalBytes > admissionLimits.aggregateRawBytes) { add(resourceDiagnostic("aggregateRawBytes")); return empty(); }

  // No scanner, callbacks or continuations occur between preflight and the
  // complete set of copies. The returned arrays contain no caller-owned view.
  const declarations: (Uint8Array | null)[] = [];
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    declarations.push(eligible[ordinal] ? copyByteCarrier(invocation.declarations[ordinal] as Uint8Array) : null);
  }
  const profile = eligible[count] ? copyByteCarrier(invocation.profile as Uint8Array) : null;
  return Object.freeze({ declarations: Object.freeze(declarations), profile, allDeclarationsCaptured, hasErrors, blocked: false });
}
