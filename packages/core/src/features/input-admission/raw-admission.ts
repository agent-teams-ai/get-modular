import type { ModuleDeclaration } from "../authoring/internal.js";
import type { DiagnosticCandidate } from "../diagnostics/internal.js";
import { documentPath, type DocumentLocator } from "./document-path.js";
import { schemaSafeLocalPath, validateDeclarationView, validateProfileView } from "./document-shape.js";
import { snapshotDeclarationView, snapshotProfileView } from "./document-snapshot.js";
import { profileResourceFactsView } from "./profile-resource-facts.js";
import type { AdmittedObjectInput, AdmissionDiagnosticSink, RawScannerPort } from "./ports.js";
import { captureRawInput } from "./raw-byte-input.js";
import { rawDocumentView, scanRawDocument, type RawDocumentScan, type RawValue } from "./raw-document.js";
import type { DocumentView } from "./document-reader.js";
import { visitRawDuplicatePaths } from "./raw-duplicate-replay.js";
import { numericFailureMask, visitRawNumericFailures } from "./raw-numeric-admission.js";
import { resourceDiagnostic } from "./resource-diagnostic.js";
import { admissionLimits } from "./resource-limits.js";
import { schemaDiagnostic } from "./schema-diagnostic.js";

/** Own the complete byte batch before scanning; admit no snapshots until all
 * aggregate budgets are proved. Malformed documents withhold only their facts.
 * The scanner port belongs to this consumer and carries no schema policy. */
export function admitRawInput(input: unknown, collector: AdmissionDiagnosticSink, scanner: RawScannerPort): AdmittedObjectInput {
  let hasErrors = false;
  const add = (diagnostic: DiagnosticCandidate): void => { hasErrors = true; collector.addUnique(diagnostic); };
  const empty = (): AdmittedObjectInput => Object.freeze({ declarations: Object.freeze([]), allDeclarationsAdmitted: false,
    profile: null, profileResources: null, hasErrors });
  const captured = captureRawInput(input, { addUnique: add });
  if (captured.blocked) return empty();
  let valuesRemaining: number = admissionLimits.jsonValueOccurrences;
  let stringBytesRemaining: number = admissionLimits.aggregateStringBytes;
  let batchBlocked = false;

  function scan(bytes: Uint8Array | null, locator: DocumentLocator): RawDocumentScan | null {
    if (bytes === null) return null;
    let observedEnd = 0;
    let depthPath: readonly (string | number)[] = [];
    const result = scanRawDocument(bytes, scanner, { valuesRemaining, stringBytesRemaining }, () => {},
      end => { observedEnd = end; }, local => { depthPath = local; });
    if (result.duplicateKey) visitRawDuplicatePaths(bytes, scanner, observedEnd, locator.kind, local => {
      add(Object.freeze({ code: "decode.duplicate-key", phase: "decode", coordinate: Object.freeze({}),
        path: documentPath(locator, local), details: Object.freeze({ reason: "duplicate-key" }) }));
    });
    valuesRemaining = Math.max(0, valuesRemaining - result.valueOccurrences);
    stringBytesRemaining = Math.max(0, stringBytesRemaining - result.stringBytes);
    if (result.invalidJson) add(Object.freeze({ code: "decode.invalid-json", phase: "decode", coordinate: Object.freeze({}),
      path: documentPath(locator), details: Object.freeze({ reason: "invalid-json" }) }));
    if (result.stoppedBy === "jsonDepth") add(resourceDiagnostic("jsonDepth",
      documentPath(locator, schemaSafeLocalPath(locator.kind, depthPath))));
    else if (result.stoppedBy !== null) { add(resourceDiagnostic(result.stoppedBy)); batchBlocked = true; }
    return result;
  }

  const scans: (RawDocumentScan | null)[] = [];
  for (let ordinal = 0; ordinal < captured.declarations.length; ordinal += 1) {
    scans.push(scan(captured.declarations[ordinal]!, { kind: "declaration", ordinal }));
    if (batchBlocked) return empty();
  }
  const profileScan = scan(captured.profile, { kind: "profile" });
  if (batchBlocked) return empty();

  // Views contain private byte spans, never caller values or materialized JSON
  // trees. Only decoded documents authorize shape reads or semantic snapshots.
  const views: (DocumentView<RawValue> | null)[] = [];
  let totalCapabilities = 0;
  let totalSlots = 0;
  function arrayLength(view: DocumentView<RawValue>, key: string): number {
    const { root, reader } = view;
    if (reader.kind(root) !== "record") return 0;
    const member = reader.own(root, key);
    return member.present && reader.kind(member.value) === "array" ? reader.length(member.value) : 0;
  }
  for (let ordinal = 0; ordinal < captured.declarations.length; ordinal += 1) {
    const view = scans[ordinal]?.decoded ? rawDocumentView(captured.declarations[ordinal]!, scanner) : null;
    views.push(view);
    if (view === null) continue;
    totalCapabilities = Math.min(admissionLimits.totalCapabilities + 1, totalCapabilities + arrayLength(view, "provides"));
    totalSlots = Math.min(admissionLimits.totalSlots + 1, totalSlots + arrayLength(view, "slots"));
  }
  if (totalCapabilities > admissionLimits.totalCapabilities) { add(resourceDiagnostic("totalCapabilities")); batchBlocked = true; }
  if (totalSlots > admissionLimits.totalSlots) { add(resourceDiagnostic("totalSlots")); batchBlocked = true; }

  function validate(view: DocumentView<RawValue>, locator: DocumentLocator): boolean {
    const validateShape = locator.kind === "declaration" ? validateDeclarationView : validateProfileView;
    const shapeValid = validateShape(view, violation => {
      const candidate = schemaDiagnostic(violation, locator);
      if (candidate.code === "schema.invalid-value") {
        const bit = candidate.details.reason === "invalid-type" ? 1 : 2;
        // Numeric admission owns this exact reason/path when both traversals
        // observe it. Shape validity still fails, without a duplicate candidate.
        if ((numericFailureMask(view, locator.kind, violation.path) & bit) !== 0) return;
      }
      add(candidate);
    }, (name, _actual, path) => add(resourceDiagnostic(name, documentPath(locator, path))));
    const numericInvalid = visitRawNumericFailures(view, locator.kind, (path, reason) => {
      add(schemaDiagnostic({ rule: reason === "invalid-type" ? "integer" : "range", path }, locator));
    });
    return shapeValid && !numericInvalid;
  }
  const declarations: ModuleDeclaration[] = [];
  let allDeclarationsAdmitted = captured.allDeclarationsCaptured && !batchBlocked;
  for (let ordinal = 0; ordinal < views.length; ordinal += 1) {
    const view = views[ordinal]!;
    if (view === null || !validate(view, { kind: "declaration", ordinal })) allDeclarationsAdmitted = false;
    else if (!batchBlocked) declarations.push(snapshotDeclarationView(view));
  }
  const profileView = profileScan?.decoded ? rawDocumentView(captured.profile!, scanner) : null;
  const profileValid = profileView !== null && validate(profileView, { kind: "profile" });
  function hasVersionOne(view: DocumentView<RawValue>): boolean {
    const { root, reader } = view;
    if (reader.kind(root) !== "record") return false;
    const member = reader.own(root, "schemaVersion");
    if (!member.present || reader.kind(member.value) !== "number") return false;
    const integer = reader.integer(member.value);
    return integer.admitted && integer.value === 1;
  }
  return Object.freeze({ declarations: Object.freeze(declarations), allDeclarationsAdmitted,
    profile: !batchBlocked && profileValid ? snapshotProfileView(profileView!) : null,
    profileResources: !batchBlocked && profileView !== null && hasVersionOne(profileView) ? profileResourceFactsView(profileView) : null,
    hasErrors });
}
