import type { ModuleDeclaration } from "../authoring/internal.js";
import type { DiagnosticCandidate } from "../diagnostics/internal.js";
import { documentPath, type DocumentLocator } from "./document-path.js";
import { schemaSafeLocalPath, validateDeclarationView, validateProfileView } from "./document-shape.js";
import { snapshotDeclarationView, snapshotProfileView } from "./document-snapshot.js";
import { profileResourceFactsView } from "./profile-resource-facts.js";
import type { AdmittedObjectInput, AdmissionDiagnosticSink, RawScannerPort } from "./ports.js";
import { captureRawInput, type RawInputCapture } from "./raw-byte-input.js";
import { rawDocumentView, scanRawDocument, type RawDocumentScan, type RawValue } from "./raw-document.js";
import type { DocumentView } from "./document-reader.js";
import { visitRawDuplicatePaths } from "./raw-duplicate-replay.js";
import { numericFailureMask, visitRawNumericFailures } from "./raw-numeric-admission.js";
import { resourceDiagnostic } from "./resource-diagnostic.js";
import { admissionLimits } from "./resource-limits.js";
import { schemaDiagnostic } from "./schema-diagnostic.js";

function arrayLength(view: DocumentView<RawValue>, key: string): number {
  const { root, reader } = view;
  if (reader.kind(root) !== "record") {return 0;}
  const member = reader.own(root, key);
  return member.present && reader.kind(member.value) === "array" ? reader.length(member.value) : 0;
}

function hasVersionOne(view: DocumentView<RawValue>): boolean {
  const { root, reader } = view;
  if (reader.kind(root) !== "record") {return false;}
  const member = reader.own(root, "schemaVersion");
  if (!member.present || reader.kind(member.value) !== "number") {return false;}
  const integer = reader.integer(member.value);
  return integer.admitted && integer.value === 1;
}

type AddDiagnostic = (diagnostic: DiagnosticCandidate) => void;
type RawBudgetState = { valuesRemaining: number; stringBytesRemaining: number; batchBlocked: boolean };

function scanRawEntry(bytes: Uint8Array | null, locator: DocumentLocator, scanner: RawScannerPort,
  state: RawBudgetState, add: AddDiagnostic): RawDocumentScan | null {
  if (bytes === null) {return null;}
  let observedEnd = 0;
  let depthPath: readonly (string | number)[] = [];
  const result = scanRawDocument(bytes, scanner, state, () => {}, {
    replayBoundary: end => { observedEnd = end; }, depthLimit: local => { depthPath = local; },
  });
  if (result.duplicateKey) {visitRawDuplicatePaths(bytes, scanner, observedEnd, locator.kind, local => {
    add(Object.freeze({ code: "decode.duplicate-key", phase: "decode", coordinate: Object.freeze({}),
      path: documentPath(locator, local), details: Object.freeze({ reason: "duplicate-key" }) }));
  });}
  state.valuesRemaining = Math.max(0, state.valuesRemaining - result.valueOccurrences);
  state.stringBytesRemaining = Math.max(0, state.stringBytesRemaining - result.stringBytes);
  if (result.invalidJson) {add(Object.freeze({ code: "decode.invalid-json", phase: "decode", coordinate: Object.freeze({}),
    path: documentPath(locator), details: Object.freeze({ reason: "invalid-json" }) }));}
  if (result.stoppedBy === "jsonDepth") {
    add(resourceDiagnostic("jsonDepth", documentPath(locator, schemaSafeLocalPath(locator.kind, depthPath))));
  } else if (result.stoppedBy !== null) {add(resourceDiagnostic(result.stoppedBy)); state.batchBlocked = true;}
  return result;
}

function scanCaptured(captured: RawInputCapture, scanner: RawScannerPort, add: AddDiagnostic): {
  readonly scans: readonly (RawDocumentScan | null)[];
  readonly profileScan: RawDocumentScan | null;
  readonly batchBlocked: boolean;
} {
  const state: RawBudgetState = { valuesRemaining: admissionLimits.jsonValueOccurrences,
    stringBytesRemaining: admissionLimits.aggregateStringBytes, batchBlocked: false };
  const scans: (RawDocumentScan | null)[] = [];
  for (let ordinal = 0; ordinal < captured.declarations.length && !state.batchBlocked; ordinal += 1) {
    scans.push(scanRawEntry(captured.declarations[ordinal]!, { kind: "declaration", ordinal }, scanner, state, add));
  }
  const profileScan = state.batchBlocked ? null : scanRawEntry(captured.profile, { kind: "profile" }, scanner, state, add);
  return { scans, profileScan, batchBlocked: state.batchBlocked };
}

function createRawViews(captured: RawInputCapture, scans: readonly (RawDocumentScan | null)[], scanner: RawScannerPort) {
  const views: (DocumentView<RawValue> | null)[] = [];
  let totalCapabilities = 0;
  let totalSlots = 0;
  for (let ordinal = 0; ordinal < captured.declarations.length; ordinal += 1) {
    const view = scans[ordinal]?.decoded ? rawDocumentView(captured.declarations[ordinal]!, scanner) : null;
    views.push(view);
    if (view === null) {continue;}
    totalCapabilities = Math.min(admissionLimits.totalCapabilities + 1,
      totalCapabilities + arrayLength(view, "provides"));
    totalSlots = Math.min(admissionLimits.totalSlots + 1, totalSlots + arrayLength(view, "slots"));
  }
  return { views, totalCapabilities, totalSlots };
}

function validateRawDocument(view: DocumentView<RawValue>, locator: DocumentLocator, add: AddDiagnostic): boolean {
  const validateShape = locator.kind === "declaration" ? validateDeclarationView : validateProfileView;
  const shapeValid = validateShape(view, violation => {
    const candidate = schemaDiagnostic(violation, locator);
    if (candidate.code === "schema.invalid-value") {
      const bit = candidate.details.reason === "invalid-type" ? 1 : 2;
      if ((numericFailureMask(view, locator.kind, violation.path) & bit) !== 0) {return;}
    }
    add(candidate);
  }, (name, _actual, path) => add(resourceDiagnostic(name, documentPath(locator, path))));
  const numericInvalid = visitRawNumericFailures(view, locator.kind, (path, reason) => {
    add(schemaDiagnostic({ rule: reason === "invalid-type" ? "integer" : "range", path }, locator));
  });
  return shapeValid && !numericInvalid;
}

function admitRawDeclarations(views: readonly (DocumentView<RawValue> | null)[], captured: RawInputCapture,
  batchBlocked: boolean, add: AddDiagnostic): { readonly declarations: readonly ModuleDeclaration[]; readonly allAdmitted: boolean } {
  const declarations: ModuleDeclaration[] = [];
  let allAdmitted = captured.allDeclarationsCaptured && !batchBlocked;
  for (let ordinal = 0; ordinal < views.length; ordinal += 1) {
    const view = views[ordinal]!;
    if (view === null || !validateRawDocument(view, { kind: "declaration", ordinal }, add)) {allAdmitted = false;}
    else if (!batchBlocked) {declarations.push(snapshotDeclarationView(view));}
  }
  return { declarations, allAdmitted };
}

/** Own the complete byte batch before scanning; admit no snapshots until all
 * aggregate budgets are proved. Malformed documents withhold only their facts.
 * The scanner port belongs to this consumer and carries no schema policy. */
export function admitRawInput(input: unknown, collector: AdmissionDiagnosticSink, scanner: RawScannerPort): AdmittedObjectInput {
  let hasErrors = false;
  const add = (diagnostic: DiagnosticCandidate): void => { hasErrors = true; collector.addUnique(diagnostic); };
  const empty = (): AdmittedObjectInput => Object.freeze({ declarations: Object.freeze([]), allDeclarationsAdmitted: false,
    profile: null, profileResources: null, hasErrors });
  const captured = captureRawInput(input, { addUnique: add });
  if (captured.blocked) {return empty();}
  const scanned = scanCaptured(captured, scanner, add);
  if (scanned.batchBlocked) {return empty();}

  // Views contain private byte spans, never caller values or materialized JSON
  // trees. Only decoded documents authorize shape reads or semantic snapshots.
  const viewState = createRawViews(captured, scanned.scans, scanner);
  let batchBlocked = false;
  if (viewState.totalCapabilities > admissionLimits.totalCapabilities) {add(resourceDiagnostic("totalCapabilities")); batchBlocked = true;}
  if (viewState.totalSlots > admissionLimits.totalSlots) {add(resourceDiagnostic("totalSlots")); batchBlocked = true;}
  const admitted = admitRawDeclarations(viewState.views, captured, batchBlocked, add);
  const profileView = scanned.profileScan?.decoded ? rawDocumentView(captured.profile!, scanner) : null;
  const profileValid = profileView !== null && validateRawDocument(profileView, { kind: "profile" }, add);
  return Object.freeze({ declarations: Object.freeze(admitted.declarations), allDeclarationsAdmitted: admitted.allAdmitted,
    profile: !batchBlocked && profileValid ? snapshotProfileView(profileView!) : null,
    profileResources: !batchBlocked && profileView !== null && hasVersionOne(profileView) ? profileResourceFactsView(profileView) : null,
    hasErrors });
}
