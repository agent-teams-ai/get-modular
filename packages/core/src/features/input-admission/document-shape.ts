import { objectDocument, type DocumentView } from "./document-reader.js";
import { isLocalTokenFormat, isPortableIdFormat } from "./identity-format.js";
import { admissionLimits, type DocumentLimit, type ReportDocumentLimit } from "./resource-limits.js";

// The caller first proves the cooperative JSON-shaped document's resource
// bounds and plain descriptors. This owner-private pass checks the closed wire
// schema, not semantic relationships or public diagnostic eligibility.
// Violations stream to the caller: no unbounded error list or input is retained.
export type DocumentShapeViolation = {
  readonly rule: "type" | "required" | "constant" | "integer" | "range" | "unicode" | "identity" | "size" | "closed" | "unsupported-version";
  readonly path: readonly (string | number)[];
};
type Report = (violation: DocumentShapeViolation) => void;
type Path = readonly (string | number)[];
type Check<Value> = (value: Value, path: Path) => void;

// Resource preflight bounds this scan; malformed code units precede ASCII grammar.
function isWellFormedUtf16(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

function checks<Value>(view: DocumentView<Value>, report: Report, reportLimit?: ReportDocumentLimit) {
  const reader = view.reader;
  let valid = true;
  function fail(rule: DocumentShapeViolation["rule"], path: Path): void {
    valid = false;
    report(Object.freeze({ rule, path: Object.freeze([...path]) }));
  }
  function record(value: Value, path: Path, fields: Readonly<Record<string, Check<Value>>>): void {
    if (reader.kind(value) !== "record") { fail("type", path); return; }
    if (reader.keys(value).some(key => !Object.hasOwn(fields, key))) fail("closed", path);
    for (const key of Object.keys(fields)) {
      const next = [...path, key];
      const member = reader.own(value, key);
      if (!member.present) fail("required", next);
      else fields[key]!(member.value, next);
    }
  }
  function literal(expected: string | number): Check<Value> {
    return (value, path) => {
      if (reader.kind(value) !== typeof expected) { fail("type", path); return; }
      if (typeof expected === "number") {
        const integer = reader.integer(value);
        if (!integer.admitted) fail(integer.reason === "invalid-type" ? "integer" : "range", path);
        else if (integer.value !== expected) fail("constant", path);
      } else if (reader.text(value) !== expected) fail("constant", path);
    };
  }
  function integer(min: number, max: number): Check<Value> {
    return (value, path) => {
      if (reader.kind(value) !== "number") { fail("type", path); return; }
      const integer = reader.integer(value);
      if (!integer.admitted) fail(integer.reason === "invalid-type" ? "integer" : "range", path);
      else if (integer.value < min || integer.value > max) fail("range", path);
    };
  }
  function admittedInteger(value: Value, min: number, max: number): number | null {
    if (reader.kind(value) !== "number") return null;
    const integer = reader.integer(value);
    return integer.admitted && integer.value >= min && integer.value <= max ? integer.value : null;
  }
  function identity(matchesFormat: (value: string) => boolean, min: number, max: number): Check<Value> {
    return (value, path) => {
      if (reader.kind(value) !== "string") { fail("type", path); return; }
      const text = reader.text(value);
      if (!isWellFormedUtf16(text)) fail("unicode", path);
      else {
        // The meter already bounded string work. The byte limit is meaningful
        // only after the complete ASCII grammar succeeds, independent of the
        // schema's shorter bound for local tokens.
        const formatValid = matchesFormat(text);
        if (formatValid && text.length > admissionLimits.identifierBytes) {
          reportLimit?.("identifierBytes", admissionLimits.identifierBytes + 1, path);
        }
        if (text.length < min || text.length > max || !formatValid) fail("identity", path);
      }
    };
  }
  function array(min: number, max: number, item: Check<Value>, limit?: DocumentLimit): Check<Value> {
    return (value, path) => {
      if (reader.kind(value) !== "array") { fail("type", path); return; }
      const length = reader.length(value);
      if (limit && length > admissionLimits[limit]) reportLimit?.(limit, admissionLimits[limit] + 1, path);
      if (length < min || length > max) { fail("size", path); return; }
      for (let index = 0; index < length; index += 1) item(reader.item(value, index), [...path, index]);
    };
  }
  const portable = identity(isPortableIdFormat, 3, admissionLimits.identifierBytes);
  const local = identity(isLocalTokenFormat, 1, 64);
  const compatibility: Check<Value> = (value, path) => record(value, path, {
    family: literal("exact"), familyVersion: literal(1), token: portable,
  });
  const cardinality: Check<Value> = (value, path) => {
    const kind = reader.kind(value) === "record" ? reader.own(value, "kind") : { present: false } as const;
    const tag = kind.present && reader.kind(kind.value) === "string" ? reader.text(kind.value) : undefined;
    if (tag === "many") {
      record(value, path, {
        kind: literal("many"), min: integer(0, 1024), max: integer(1, 1024), order: literal("profile"),
      });
      const minimum = reader.own(value, "min");
      const maximum = reader.own(value, "max");
      const min = minimum.present ? admittedInteger(minimum.value, 0, 1024) : null;
      const max = maximum.present ? admittedInteger(maximum.value, 1, 1024) : null;
      if (min !== null && max !== null && min > max) fail("range", path);
    }
    else if (tag === "required" || tag === "optional") record(value, path, { kind: literal(tag) });
    else if (reader.kind(value) !== "record") fail("type", path);
    else if (!kind.present) fail("required", [...path, "kind"]);
    else fail(typeof tag === "string" ? "constant" : "type", [...path, "kind"]);
  };
  const provided: Check<Value> = (value, path) => record(value, path, { capabilityId: portable, compatibility });
  const slot: Check<Value> = (value, path) => record(value, path, { slotId: local, capabilityId: portable, compatibility, cardinality });
  const selection: Check<Value> = (value, path) => record(value, path, { moduleId: portable, implementationId: portable });
  const binding: Check<Value> = (value, path) => record(value, path, {
    consumerImplementationId: portable, slotId: local, providerImplementationIds: array(0, 1024, portable),
  });

  function supportedDocumentVersion(value: Value): boolean {
    if (reader.kind(value) !== "record") return true;
    const member = reader.own(value, "schemaVersion");
    if (!member.present || reader.kind(member.value) !== "number") return true;
    const version = reader.integer(member.value);
    if (version.admitted && version.value !== 1) {
      fail("unsupported-version", ["schemaVersion"]);
      return false;
    }
    return true;
  }

  return {
    declaration(value: Value): boolean {
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
    profile(value: Value): boolean {
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
  return validateDeclarationView(objectDocument(value), report, reportLimit);
}

export function validateProfileShape(value: unknown, report: Report, reportLimit?: ReportDocumentLimit): boolean {
  return validateProfileView(objectDocument(value), report, reportLimit);
}

export function validateDeclarationView<Value>(view: DocumentView<Value>, report: Report, reportLimit?: ReportDocumentLimit): boolean {
  return checks(view, report, reportLimit).declaration(view.root);
}

export function validateProfileView<Value>(view: DocumentView<Value>, report: Report, reportLimit?: ReportDocumentLimit): boolean {
  return checks(view, report, reportLimit).profile(view.root);
}
