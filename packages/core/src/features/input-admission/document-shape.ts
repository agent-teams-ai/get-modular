import { isLocalTokenFormat, isPortableIdFormat } from "./identity-format.js";
import { admissionLimits, type DocumentLimit, type ReportDocumentLimit } from "./resource-limits.js";

// The caller first proves the cooperative JSON-shaped document's resource
// bounds and plain descriptors. This owner-private pass checks the closed wire
// schema, not semantic relationships or public diagnostic eligibility.
// Violations stream to the caller: no unbounded error list or input is retained.
export type DocumentShapeViolation = {
  readonly rule: "type" | "required" | "constant" | "integer" | "range" | "identity" | "size" | "closed" | "unsupported-version";
  readonly path: readonly (string | number)[];
};
type Report = (violation: DocumentShapeViolation) => void;
type Path = readonly (string | number)[];
type Check = (value: unknown, path: Path) => void;

function checks(report: Report, reportLimit?: ReportDocumentLimit) {
  let valid = true;
  function fail(rule: DocumentShapeViolation["rule"], path: Path): void {
    valid = false;
    report(Object.freeze({ rule, path: Object.freeze([...path]) }));
  }
  function record(value: unknown, path: Path, fields: Readonly<Record<string, Check>>): void {
    if (value === null || typeof value !== "object" || Array.isArray(value)) { fail("type", path); return; }
    const own = Object.getOwnPropertyDescriptors(value);
    // All unknown spellings collapse to the containing object's safe path.
    // Neither the key nor its value is copied into a violation or traversed.
    if (Object.keys(own).some(key => !Object.hasOwn(fields, key))) fail("closed", path);
    for (const key of Object.keys(fields)) {
      const next = [...path, key];
      if (!Object.hasOwn(own, key)) fail("required", next);
      else if (Object.hasOwn(own[key]!, "value")) fields[key]!(own[key]!.value, next);
      // The preflight owns accessor/non-plain rejection. Never invoke one even
      // if this private pass is accidentally called without that prerequisite.
      else fail("type", next);
    }
  }
  function literal(expected: string | number): Check {
    return (value, path) => {
      if (typeof value !== typeof expected) fail("type", path);
      else if (typeof value === "number" && !Number.isInteger(value)) fail("integer", path);
      else if (typeof value === "number" && (!Number.isSafeInteger(value) || Object.is(value, -0))) fail("range", path);
      else if (value !== expected) fail("constant", path);
    };
  }
  function integer(min: number, max: number): Check {
    return (value, path) => {
      if (typeof value !== "number") fail("type", path);
      else if (!Number.isInteger(value)) fail("integer", path);
      else if (!admittedInteger(value, min, max)) fail("range", path);
    };
  }
  function admittedInteger(value: unknown, min: number, max: number): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0) && value >= min && value <= max;
  }
  function identity(matchesFormat: (value: string) => boolean, min: number, max: number): Check {
    return (value, path) => {
      if (typeof value !== "string") fail("type", path);
      else {
        // The meter already bounded string work. The byte limit is meaningful
        // only after the complete ASCII grammar succeeds, independent of the
        // schema's shorter bound for local tokens.
        const formatValid = matchesFormat(value);
        if (formatValid && value.length > admissionLimits.identifierBytes) {
          reportLimit?.("identifierBytes", admissionLimits.identifierBytes + 1, path);
        }
        if (value.length < min || value.length > max || !formatValid) fail("identity", path);
      }
    };
  }
  function array(min: number, max: number, item: Check, limit?: DocumentLimit): Check {
    return (value, path) => {
      if (!Array.isArray(value)) { fail("type", path); return; }
      if (limit && value.length > admissionLimits[limit]) reportLimit?.(limit, admissionLimits[limit] + 1, path);
      if (value.length < min || value.length > max) { fail("size", path); return; }
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor && Object.hasOwn(descriptor, "value")) item(descriptor.value, [...path, index]);
        else fail("type", [...path, index]);
      }
    };
  }
  const portable = identity(isPortableIdFormat, 3, admissionLimits.identifierBytes);
  const local = identity(isLocalTokenFormat, 1, 64);
  const compatibility: Check = (value, path) => record(value, path, {
    family: literal("exact"), familyVersion: literal(1), token: portable,
  });
  const cardinality: Check = (value, path) => {
    const kind = value !== null && typeof value === "object"
      ? Object.getOwnPropertyDescriptor(value, "kind") : undefined;
    const tag = kind && Object.hasOwn(kind, "value") ? kind.value : undefined;
    if (tag === "many") {
      record(value, path, {
        kind: literal("many"), min: integer(0, 1024), max: integer(1, 1024), order: literal("profile"),
      });
      const minimum = Object.getOwnPropertyDescriptor(value, "min");
      const maximum = Object.getOwnPropertyDescriptor(value, "max");
      const min = minimum && Object.hasOwn(minimum, "value") ? minimum.value : undefined;
      const max = maximum && Object.hasOwn(maximum, "value") ? maximum.value : undefined;
      // ADR-0007's range refinement is stricter than the JSON Schema alone.
      // Report its containing constraint, not an invented provider count.
      if (admittedInteger(min, 0, 1024) && admittedInteger(max, 1, 1024) && min > max) fail("range", path);
    }
    else if (tag === "required" || tag === "optional") record(value, path, { kind: literal(tag) });
    else if (value === null || typeof value !== "object" || Array.isArray(value)) fail("type", path);
    else if (!kind) fail("required", [...path, "kind"]);
    else fail(typeof tag === "string" ? "constant" : "type", [...path, "kind"]);
  };
  const provided: Check = (value, path) => record(value, path, { capabilityId: portable, compatibility });
  const slot: Check = (value, path) => record(value, path, { slotId: local, capabilityId: portable, compatibility, cardinality });
  const selection: Check = (value, path) => record(value, path, { moduleId: portable, implementationId: portable });
  const binding: Check = (value, path) => record(value, path, {
    consumerImplementationId: portable, slotId: local, providerImplementationIds: array(0, 1024, portable),
  });

  function supportedDocumentVersion(value: unknown): boolean {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return true;
    const descriptor = Object.getOwnPropertyDescriptor(value, "schemaVersion");
    const version = descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
    if (typeof version === "number" && Number.isSafeInteger(version) && !Object.is(version, -0) && version !== 1) {
      // An unknown document version supplies no evidence for this version's
      // required/unknown-field checks. The accepted partial-version case has
      // exactly this failure, without invented missing fields.
      fail("unsupported-version", ["schemaVersion"]);
      return false;
    }
    return true;
  }

  return {
    declaration(value: unknown): boolean {
      if (!supportedDocumentVersion(value)) return false;
      record(value, [], {
        kind: literal("get-modular.module-declaration"), schemaVersion: literal(1),
        moduleId: portable, implementationId: portable,
        owner: (owner, path) => record(owner, path, { authority: local,
          path: array(1, admissionLimits.ownerPathSegments, local, "ownerPathSegments") }),
        provides: array(0, admissionLimits.capabilitiesPerDeclaration, provided, "capabilitiesPerDeclaration"),
        slots: array(0, admissionLimits.slotsPerDeclaration, slot, "slotsPerDeclaration"),
      });
      return valid;
    },
    profile(value: unknown): boolean {
      if (!supportedDocumentVersion(value)) return false;
      record(value, [], {
        kind: literal("get-modular.composition-profile"), schemaVersion: literal(1), profileId: portable,
        roots: array(1, admissionLimits.roots, portable, "roots"),
        selections: array(1, admissionLimits.selections, selection, "selections"),
        bindings: array(0, admissionLimits.bindings, binding, "bindings"),
      });
      return valid;
    },
  };
}

export function validateDeclarationShape(value: unknown, report: Report, reportLimit?: ReportDocumentLimit): boolean {
  return checks(report, reportLimit).declaration(value);
}

export function validateProfileShape(value: unknown, report: Report, reportLimit?: ReportDocumentLimit): boolean {
  return checks(report, reportLimit).profile(value);
}
