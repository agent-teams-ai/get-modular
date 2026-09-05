// The caller first proves the cooperative JSON-shaped document's resource
// bounds and plain descriptors. This owner-private pass checks the closed wire
// schema, not semantic relationships or public diagnostic eligibility.
// Violations stream to the caller: no unbounded error list or input is retained.
export type DocumentShapeViolation = {
  readonly rule: "type" | "required" | "constant" | "integer" | "range" | "identity" | "size" | "closed";
  readonly path: readonly (string | number)[];
};
type Report = (violation: DocumentShapeViolation) => void;
type Path = readonly (string | number)[];
type Check = (value: unknown, path: Path) => void;

const portablePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+$/;
const localPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function checks(report: Report) {
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
      else if (value !== expected) fail("constant", path);
    };
  }
  function integer(min: number, max: number): Check {
    return (value, path) => {
      if (typeof value !== "number") fail("type", path);
      else if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail("integer", path);
      else if (value < min || value > max) fail("range", path);
    };
  }
  function identity(pattern: RegExp, min: number, max: number): Check {
    return (value, path) => {
      if (typeof value !== "string") fail("type", path);
      // Length is checked first, bounding regexp work even for rejected input.
      // Require the match to consume the whole string: JS `$` admits a final
      // line terminator, which is outside the accepted portable ASCII grammar.
      else if (value.length < min || value.length > max || pattern.exec(value)?.[0] !== value) fail("identity", path);
    };
  }
  function array(min: number, max: number, item: Check): Check {
    return (value, path) => {
      if (!Array.isArray(value)) { fail("type", path); return; }
      if (value.length < min || value.length > max) { fail("size", path); return; }
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor && Object.hasOwn(descriptor, "value")) item(descriptor.value, [...path, index]);
        else fail("type", [...path, index]);
      }
    };
  }
  const portable = identity(portablePattern, 3, 128);
  const local = identity(localPattern, 1, 64);
  const compatibility: Check = (value, path) => record(value, path, {
    family: literal("exact"), familyVersion: literal(1), token: portable,
  });
  const cardinality: Check = (value, path) => {
    const kind = value !== null && typeof value === "object"
      ? Object.getOwnPropertyDescriptor(value, "kind") : undefined;
    const tag = kind && Object.hasOwn(kind, "value") ? kind.value : undefined;
    if (tag === "many") record(value, path, {
      kind: literal("many"), min: integer(0, 1024), max: integer(1, 1024), order: literal("profile"),
    });
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

  return {
    declaration(value: unknown): boolean {
      record(value, [], {
        kind: literal("get-modular.module-declaration"), schemaVersion: literal(1),
        moduleId: portable, implementationId: portable,
        owner: (owner, path) => record(owner, path, { authority: local, path: array(1, 8, local) }),
        provides: array(0, 64, provided), slots: array(0, 128, slot),
      });
      return valid;
    },
    profile(value: unknown): boolean {
      record(value, [], {
        kind: literal("get-modular.composition-profile"), schemaVersion: literal(1), profileId: portable,
        roots: array(1, 1024, portable), selections: array(1, 4096, selection), bindings: array(0, 65_536, binding),
      });
      return valid;
    },
  };
}

export function validateDeclarationShape(value: unknown, report: Report): boolean {
  return checks(report).declaration(value);
}

export function validateProfileShape(value: unknown, report: Report): boolean {
  return checks(report).profile(value);
}
