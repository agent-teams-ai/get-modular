import { inspectInvocation } from "./invocation-wrapper.js";
import type { CompositionProfile, ModuleDeclaration } from "../authoring/internal.js";
import type { DiagnosticCollector } from "../diagnostics/internal.js";
import { documentPath, type DocumentLocator } from "./document-path.js";
import { schemaSafeLocalPath, validateDeclarationShape, validateProfileShape } from "./document-shape.js";
import { snapshotDeclaration, snapshotProfile } from "./document-snapshot.js";
import { createObjectResourceMeter, type ObjectResourceScan } from "./object-resource-meter.js";
import { ownValue, profileResourceFacts } from "./profile-resource-facts.js";
import type { AdmittedObjectInput, AdmissionDiagnosticSink, ObjectInput } from "./ports.js";
import { resourceDiagnostic } from "./resource-diagnostic.js";
import { admissionLimits } from "./resource-limits.js";
import { schemaDiagnostic } from "./schema-diagnostic.js";

type AddDiagnostic = DiagnosticCollector["addUnique"];

function defined<T>(value: T | undefined): T {
  if (value === undefined) {throw new Error("Missing internal object-admission value");}
  return value;
}

function shallowCounts(declarations: readonly unknown[]): { readonly capabilities: number; readonly slots: number } {
  let capabilities = 0;
  let slots = 0;
  for (const value of declarations) {
    const provides = ownValue(value, "provides");
    const declaredSlots = ownValue(value, "slots");
    if (Array.isArray(provides)) {
      capabilities = Math.min(admissionLimits.totalCapabilities + 1, capabilities + provides.length);
    }
    if (Array.isArray(declaredSlots)) {slots = Math.min(admissionLimits.totalSlots + 1, slots + declaredSlots.length);}
  }
  return { capabilities, slots };
}

function scanObjectDocument(meter: ReturnType<typeof createObjectResourceMeter>, value: unknown,
  locator: DocumentLocator, add: AddDiagnostic): ObjectResourceScan {
  const result = meter.scanDocument(value);
  if (result.stoppedBy === "jsonDepth") {add(resourceDiagnostic("jsonDepth", documentPath(locator)));}
  else if (result.stoppedBy !== null) {add(resourceDiagnostic(result.stoppedBy));}
  return result;
}

function validateObjectDocument(value: unknown, result: ObjectResourceScan,
  locator: DocumentLocator, add: AddDiagnostic): boolean {
  if (result.stoppedBy !== null) {return false;}
  if (result.nonPlainValue) {
    const lastByDepth: (ReturnType<typeof documentPath> | undefined)[] = [];
    createObjectResourceMeter().scanDocument(value, local => {
      const path = documentPath(locator, schemaSafeLocalPath(locator.kind, local));
      const previous = lastByDepth[path.length];
      if (previous !== undefined && path.every((segment, index) =>
        segment.kind === defined(previous[index]).kind && segment.value === defined(previous[index]).value)) {return;}
      lastByDepth[path.length] = path;
      add(Object.freeze({ code: "schema.non-plain-value", phase: "schema", coordinate: Object.freeze({}),
        path, details: Object.freeze({ reason: "non-plain-value" }) }));
    });
    return false;
  }
  const validateShape = locator.kind === "declaration" ? validateDeclarationShape : validateProfileShape;
  return validateShape(value, violation =>{  add(schemaDiagnostic(violation, locator)); },
    (name, _actual, path) =>{  add(resourceDiagnostic(name, documentPath(locator, path))); });
}

function admitDeclarations(declarations: readonly unknown[], scans: readonly ObjectResourceScan[],
  batchBlocked: boolean, add: AddDiagnostic): { readonly admitted: readonly ModuleDeclaration[]; readonly allAdmitted: boolean } {
  const admitted: ModuleDeclaration[] = [];
  let allAdmitted = !batchBlocked;
  for (let ordinal = 0; ordinal < declarations.length; ordinal += 1) {
    const value = declarations[ordinal];
    if (!validateObjectDocument(value, defined(scans[ordinal]), { kind: "declaration", ordinal }, add)) {allAdmitted = false;}
    else if (!batchBlocked) {admitted.push(snapshotDeclaration(value as ModuleDeclaration));}
  }
  return { admitted, allAdmitted };
}

/**
 * Synchronous object admission for the accepted cooperative invocation record
 * and dense ordinary declaration list. ADR-0021 supplies the closed wrapper
 * policy. No caller reference survives; the caller supplies the
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
  const invocation = inspectInvocation(input, "object");
  if (invocation.kind === "invalid-wrapper") {
    for (const field of invocation.roots) {
      add(Object.freeze({ code: "schema.non-plain-value", phase: "schema", coordinate: Object.freeze({}),
        path: Object.freeze([Object.freeze({ kind: "field", value: field })]),
        details: Object.freeze({ reason: "non-plain-value" }) }));
    }
    return empty();
  }
  if (invocation.kind === "declarations-limit") { add(resourceDiagnostic("declarations")); return empty(); }
  const { declarations, profile } = invocation;
  const meter = createObjectResourceMeter();
  const scans: ObjectResourceScan[] = [];
  let batchBlocked = false;

  // These bounded shallow counts have no decoded-document prerequisite. Count
  // the complete supplied world before a later JSON traversal can stop; a
  // separately proven aggregate failure must not disappear behind that stop.
  const counts = shallowCounts(declarations);
  if (counts.capabilities > admissionLimits.totalCapabilities) { add(resourceDiagnostic("totalCapabilities")); batchBlocked = true; }
  if (counts.slots > admissionLimits.totalSlots) { add(resourceDiagnostic("totalSlots")); batchBlocked = true; }
  // No document snapshots or semantic maps are allocated until the entire
  // batch's value/string and aggregate structural budgets have been proved.
  for (let ordinal = 0; ordinal < declarations.length; ordinal += 1) {
    const value = declarations[ordinal];
    const result = scanObjectDocument(meter, value, { kind: "declaration", ordinal }, add);
    scans.push(result);
    if (result.stoppedBy !== null && result.stoppedBy !== "jsonDepth") {batchBlocked = true; return empty();}
  }
  const profileScan = scanObjectDocument(meter, profile, { kind: "profile" }, add);
  if (profileScan.stoppedBy !== null && profileScan.stoppedBy !== "jsonDepth") {batchBlocked = true; return empty();}
  const admittedDeclarations = admitDeclarations(declarations, scans, batchBlocked, add);
  const profileValid = validateObjectDocument(profile, profileScan, { kind: "profile" }, add);
  const resourceFacts = !batchBlocked && profileScan.stoppedBy === null && !profileScan.nonPlainValue
    && ownValue(profile, "schemaVersion") === 1 ? profileResourceFacts(profile) : null;
  return Object.freeze({ declarations: Object.freeze(admittedDeclarations.admitted),
    allDeclarationsAdmitted: admittedDeclarations.allAdmitted,
    profile: !batchBlocked && profileValid ? snapshotProfile(profile as CompositionProfile) : null,
    profileResources: resourceFacts, hasErrors });
}
