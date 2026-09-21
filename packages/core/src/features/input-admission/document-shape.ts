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

function defined<T>(value: T | undefined): T {
  if (value === undefined) {throw new Error("Missing internal document-shape value");}
  return value;
}

type RecordShape = {
  readonly type: "record";
  readonly fields: Readonly<Record<string, Shape>>;
};
type Shape = RecordShape
  | { readonly type: "literal"; readonly expected: string | number }
  | { readonly type: "integer"; readonly min: number; readonly max: number }
  | { readonly type: "identity"; readonly matchesFormat: (value: string) => boolean; readonly min: number; readonly max: number }
  | { readonly type: "array"; readonly min: number; readonly max: number; readonly item: Shape; readonly limit: DocumentLimit | undefined }
  | { readonly type: "cardinality"; readonly variants: Readonly<Record<"many" | "required" | "optional", RecordShape>> };

function record(fields: Readonly<Record<string, Shape>>): RecordShape {
  return { type: "record", fields };
}
function literal(expected: string | number): Shape {
  return { type: "literal", expected };
}
function integer(min: number, max: number): Shape {
  return { type: "integer", min, max };
}
function identity(matchesFormat: (value: string) => boolean, min: number, max: number): Shape {
  return { type: "identity", matchesFormat, min, max };
}
function array(min: number, max: number, item: Shape, limit?: DocumentLimit): Shape {
  return { type: "array", min, max, item, limit };
}

// Validation and path projection consume these same closed field declarations.
// This static description contains no document values or reader handles.
const portable = identity(isPortableIdFormat, 3, admissionLimits.identifierBytes);
const local = identity(isLocalTokenFormat, 1, 64);
const compatibility = record({
  family: literal("exact"), familyVersion: literal(1), token: portable,
});
const cardinality: Shape = {
  type: "cardinality",
  variants: {
    many: record({
      kind: literal("many"), min: integer(0, 1024), max: integer(1, 1024), order: literal("profile"),
    }),
    required: record({ kind: literal("required") }),
    optional: record({ kind: literal("optional") }),
  },
};
const provided = record({ capabilityId: portable, compatibility });
const slot = record({ slotId: local, capabilityId: portable, compatibility, cardinality });
const selection = record({ moduleId: portable, implementationId: portable });
const binding = record({
  consumerImplementationId: portable, slotId: local, providerImplementationIds: array(0, 1024, portable),
});
const declarationShape = record({
  kind: literal("get-modular.module-declaration"), schemaVersion: literal(1),
  moduleId: portable, implementationId: portable,
  owner: record({ authority: local,
    path: array(1, admissionLimits.ownerPathSegments, local, "ownerPathSegments") }),
  provides: array(0, admissionLimits.capabilitiesPerDeclaration, provided, "capabilitiesPerDeclaration"),
  slots: array(0, admissionLimits.slotsPerDeclaration, slot, "slotsPerDeclaration"),
});
const profileShape = record({
  kind: literal("get-modular.composition-profile"), schemaVersion: literal(1), profileId: portable,
  roots: array(1, admissionLimits.roots, portable, "roots"),
  selections: array(1, admissionLimits.selections, selection, "selections"),
  bindings: array(0, admissionLimits.bindings, binding, "bindings"),
});

function projectedShapes(current: readonly Shape[], segment: string | number): Shape[] {
  const next: Shape[] = [];
  for (const shape of current) {
    if (shape.type === "record" && typeof segment === "string" && Object.hasOwn(shape.fields, segment)) {
      next.push(defined(shape.fields[segment]));
    } else if (shape.type === "array" && typeof segment === "number"
      && Number.isInteger(segment) && segment >= 0 && segment <= 65535) {
      next.push(shape.item);
    } else if (shape.type === "cardinality" && typeof segment === "string") {
      for (const variant of Object.values(shape.variants)) {
        if (Object.hasOwn(variant.fields, segment)) {next.push(defined(variant.fields[segment]));}
      }
    }
  }
  return next;
}

function representablePathSegment(segment: string | number, next: readonly Shape[]): boolean {
  return typeof segment === "number"
    ? Number.isSafeInteger(segment) && segment >= 0 && segment <= 65535
    : next.length > 0;
}

/** Project a scanner-owned local path without accessing the input document. */
export function schemaSafeLocalPath(kind: "declaration" | "profile", segments: readonly (string | number)[]): readonly (string | number)[] {
  const path: (string | number)[] = [];
  let current: readonly Shape[] = [kind === "declaration" ? declarationShape : profileShape];
  for (const segment of segments) {
    // All cardinality variants contribute paths without consulting an input tag.
    const next = projectedShapes(current, segment);
    if (!representablePathSegment(segment, next)) {break;}
    path.push(segment);
    // Numeric fallback preserves the current candidates, never a parent or root.
    if (next.length > 0) {current = next;}
  }
  // Invocation prefixes and the global segment cap belong to documentPath.
  return Object.freeze(path);
}

// Resource preflight bounds this scan; malformed code units precede ASCII grammar.
function isWellFormedUtf16(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (index + 1 >= value.length) {return false;}
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) {return false;}
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {return false;}
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
  function checkRecord(value: Value, path: Path, fields: Readonly<Record<string, Shape>>): void {
    if (reader.kind(value) !== "record") { fail("type", path); return; }
    if (reader.keys(value).some(key => !Object.hasOwn(fields, key))) {fail("closed", path);}
    for (const key of Object.keys(fields)) {
      const next = [...path, key];
      const member = reader.own(value, key);
      if (!member.present) {fail("required", next);}
      else {check(defined(fields[key]), member.value, next);}
    }
  }
  function admittedInteger(value: Value, min: number, max: number): number | null {
    if (reader.kind(value) !== "number") {return null;}
    const parsed = reader.integer(value);
    return parsed.admitted && parsed.value >= min && parsed.value <= max ? parsed.value : null;
  }
  function numericValue(value: Value, path: Path): boolean {
    if (reader.kind(value) !== "number") {return true;}
    const parsed = reader.integer(value);
    if (parsed.admitted) {return true;}
    fail(parsed.reason === "invalid-type" ? "integer" : "range", path);
    return false;
  }
  function checkLiteral(shape: Extract<Shape, { readonly type: "literal" }>, value: Value, path: Path): void {
    const expected = shape.expected;
    if (reader.kind(value) !== typeof expected) { fail("type", path); return; }
    if (typeof expected !== "number") {
      if (reader.text(value) !== expected) {fail("constant", path);}
      return;
    }
    const parsed = reader.integer(value);
    if (!parsed.admitted) {fail(parsed.reason === "invalid-type" ? "integer" : "range", path);}
    else if (parsed.value !== expected) {fail("constant", path);}
  }
  function checkInteger(shape: Extract<Shape, { readonly type: "integer" }>, value: Value, path: Path): void {
    if (reader.kind(value) !== "number") { fail("type", path); return; }
    const parsed = reader.integer(value);
    if (!parsed.admitted) {fail(parsed.reason === "invalid-type" ? "integer" : "range", path);}
    else if (parsed.value < shape.min || parsed.value > shape.max) {fail("range", path);}
  }
  function checkIdentity(shape: Extract<Shape, { readonly type: "identity" }>, value: Value, path: Path): void {
    if (reader.kind(value) !== "string") { fail("type", path); return; }
    const text = reader.text(value);
    if (!isWellFormedUtf16(text)) {fail("unicode", path); return;}
    const formatValid = shape.matchesFormat(text);
    if (formatValid && text.length > admissionLimits.identifierBytes) {
      reportLimit?.("identifierBytes", admissionLimits.identifierBytes + 1, path);
    }
    if (text.length < shape.min || text.length > shape.max || !formatValid) {fail("identity", path);}
  }
  function checkArray(shape: Extract<Shape, { readonly type: "array" }>, value: Value, path: Path): void {
    if (reader.kind(value) !== "array") { fail("type", path); return; }
    const length = reader.length(value);
    const limit = shape.limit;
    if (limit && length > admissionLimits[limit]) {reportLimit?.(limit, admissionLimits[limit] + 1, path);}
    if (length < shape.min || length > shape.max) { fail("size", path); return; }
    for (let index = 0; index < length; index += 1) {check(shape.item, reader.item(value, index), [...path, index]);}
  }
  function checkCardinality(shape: Extract<Shape, { readonly type: "cardinality" }>, value: Value, path: Path): void {
    const kind = reader.kind(value) === "record" ? reader.own(value, "kind") : { present: false } as const;
    const tag = kind.present && reader.kind(kind.value) === "string" ? reader.text(kind.value) : undefined;
    if (tag === "many") {
      checkRecord(value, path, shape.variants.many.fields);
      const minimum = reader.own(value, "min");
      const maximum = reader.own(value, "max");
      const min = minimum.present ? admittedInteger(minimum.value, 0, 1024) : null;
      const max = maximum.present ? admittedInteger(maximum.value, 1, 1024) : null;
      if (min !== null && max !== null && min > max) {fail("range", path);}
    } else if (tag === "required" || tag === "optional") {checkRecord(value, path, shape.variants[tag].fields);}
    else if (reader.kind(value) !== "record") {fail("type", path);}
    else if (!kind.present) {fail("required", [...path, "kind"]);}
    else if (numericValue(kind.value, [...path, "kind"])) {fail(typeof tag === "string" ? "constant" : "type", [...path, "kind"]);}
  }
  function check(shape: Shape, value: Value, path: Path): void {
    // Exact numeric admission precedes the field's narrower type or constant.
    // In particular, negative zero remains invalid-format in a string field.
    if (!numericValue(value, path)) {return;}
    switch (shape.type) {
      case "record":
        checkRecord(value, path, shape.fields);
        return;
      case "literal":
        checkLiteral(shape, value, path);
        return;
      case "integer":
        checkInteger(shape, value, path);
        return;
      case "identity":
        checkIdentity(shape, value, path);
        return;
      case "array":
        checkArray(shape, value, path);
        return;
      case "cardinality":
        checkCardinality(shape, value, path);
        return;
    }
  }

  function supportedDocumentVersion(value: Value): boolean {
    if (reader.kind(value) !== "record") {return true;}
    const member = reader.own(value, "schemaVersion");
    if (!member.present || reader.kind(member.value) !== "number") {return true;}
    const version = reader.integer(member.value);
    if (version.admitted && version.value !== 1) {
      fail("unsupported-version", ["schemaVersion"]);
      return false;
    }
    return true;
  }

  return {
    declaration(value: Value): boolean {
      if (!supportedDocumentVersion(value)) {return false;}
      check(declarationShape, value, []);
      return valid;
    },
    profile(value: Value): boolean {
      if (!supportedDocumentVersion(value)) {return false;}
      check(profileShape, value, []);
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
