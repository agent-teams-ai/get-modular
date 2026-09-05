import type { CompositionProfile, ModuleDeclaration } from "../authoring/internal.js";
import type { DiagnosticCollector } from "../diagnostics/internal.js";
import { documentPath, type DocumentLocator } from "./document-path.js";
import { validateDeclarationShape, validateProfileShape } from "./document-shape.js";
import { snapshotDeclaration, snapshotProfile } from "./document-snapshot.js";
import { createObjectResourceMeter, type ObjectResourceScan } from "./object-resource-meter.js";
import { ownValue, profileResourceFacts } from "./profile-resource-facts.js";
import type { AdmittedObjectInput, AdmissionDiagnosticSink, ObjectInput } from "./ports.js";
import { resourceDiagnostic } from "./resource-diagnostic.js";
import { admissionLimits } from "./resource-limits.js";
import { schemaDiagnostic } from "./schema-diagnostic.js";

/**
 * Synchronous private M1 admission for the accepted cooperative invocation
 * record and dense ordinary declaration list. Malformed wrapper/carrier policy
 * is not selected here. No caller reference survives; the caller supplies the
 * per-invocation collector, and only semantics/facade finalize that collector.
 * ADR-0020: outside the resource envelope, reject with a truthful early limit;
 * enumeration need not select the same failure. Batch value/string exhaustion
 * admits no snapshots; depth remains document-local. Complete eligible
 * diagnostic determinism is preserved inside the resource envelope.
 */
export function admitObjectInput(input: ObjectInput, collector: AdmissionDiagnosticSink): AdmittedObjectInput {
  let hasErrors = false;
  const add: DiagnosticCollector["addUnique"] = diagnostic => { hasErrors = true; collector.addUnique(diagnostic); };
  const empty = (): AdmittedObjectInput => Object.freeze({ declarations: Object.freeze([]), allDeclarationsAdmitted: false,
    profile: null, profileResources: null, hasErrors });
  // Inspect the rejected dimension before copying the invocation list.
  if (input.declarations.length > admissionLimits.declarations) { add(resourceDiagnostic("declarations")); return empty(); }
  const declarations = [...input.declarations];
  const profile = input.profile;
  const meter = createObjectResourceMeter();
  const scans: ObjectResourceScan[] = [];
  let totalCapabilities = 0;
  let totalSlots = 0;
  let batchBlocked = false;

  // These bounded shallow counts have no decoded-document prerequisite. Count
  // the complete supplied world before a later JSON traversal can stop; a
  // separately proven aggregate failure must not disappear behind that stop.
  for (const value of declarations) {
    const provides = ownValue(value, "provides");
    const slots = ownValue(value, "slots");
    if (Array.isArray(provides)) totalCapabilities = Math.min(admissionLimits.totalCapabilities + 1, totalCapabilities + provides.length);
    if (Array.isArray(slots)) totalSlots = Math.min(admissionLimits.totalSlots + 1, totalSlots + slots.length);
  }
  if (totalCapabilities > admissionLimits.totalCapabilities) { add(resourceDiagnostic("totalCapabilities")); batchBlocked = true; }
  if (totalSlots > admissionLimits.totalSlots) { add(resourceDiagnostic("totalSlots")); batchBlocked = true; }

  function scan(value: unknown, locator: DocumentLocator): ObjectResourceScan {
    const result = meter.scanDocument(value);
    if (result.stoppedBy === "jsonDepth") add(resourceDiagnostic("jsonDepth", documentPath(locator)));
    else if (result.stoppedBy !== null) { add(resourceDiagnostic(result.stoppedBy)); batchBlocked = true; }
    return result;
  }
  // No document snapshots or semantic maps are allocated until the entire
  // batch's value/string and aggregate structural budgets have been proved.
  for (let ordinal = 0; ordinal < declarations.length; ordinal += 1) {
    const value = declarations[ordinal];
    const result = scan(value, { kind: "declaration", ordinal });
    scans.push(result);
    if (result.stoppedBy !== null && result.stoppedBy !== "jsonDepth") return empty();
  }
  const profileScan = scan(profile, { kind: "profile" });
  if (profileScan.stoppedBy !== null && profileScan.stoppedBy !== "jsonDepth") return empty();

  function validate(value: unknown, result: ObjectResourceScan, locator: DocumentLocator): boolean {
    if (result.stoppedBy !== null) return false;
    if (result.nonPlainValue) {
      add(Object.freeze({ code: "schema.non-plain-value", phase: "schema", coordinate: Object.freeze({}),
        path: documentPath(locator), details: Object.freeze({ reason: "non-plain-value" }) }));
      return false;
    }
    const validateShape = locator.kind === "declaration" ? validateDeclarationShape : validateProfileShape;
    return validateShape(value, violation => add(schemaDiagnostic(violation, locator)),
      (name, _actual, path) => add(resourceDiagnostic(name, documentPath(locator, path))));
  }
  const admitted: ModuleDeclaration[] = [];
  let allDeclarationsAdmitted = !batchBlocked;
  for (let ordinal = 0; ordinal < declarations.length; ordinal += 1) {
    const value = declarations[ordinal];
    if (!validate(value, scans[ordinal]!, { kind: "declaration", ordinal })) allDeclarationsAdmitted = false;
    else if (!batchBlocked) admitted.push(snapshotDeclaration(value as ModuleDeclaration));
  }
  const profileValid = validate(profile, profileScan, { kind: "profile" });
  const resourceFacts = !batchBlocked && profileScan.stoppedBy === null && !profileScan.nonPlainValue
    && ownValue(profile, "schemaVersion") === 1 ? profileResourceFacts(profile) : null;
  return Object.freeze({ declarations: Object.freeze(admitted), allDeclarationsAdmitted,
    profile: !batchBlocked && profileValid ? snapshotProfile(profile as CompositionProfile) : null,
    profileResources: resourceFacts, hasErrors });
}
