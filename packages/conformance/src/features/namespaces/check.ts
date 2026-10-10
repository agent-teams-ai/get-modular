import type { ModuleDeclaration } from "@get-modular/core";
import { ConformanceError, invalid } from "../errors/errors.js";

/** One declaration that breaks a rule of "Identity and namespaces" of the Consumer Module Standard. */
export type NamespaceViolation = {
  readonly implementationId: string;
  readonly rule: "module-id" | "implementation-id" | "owner-authority";
  readonly value: string;
  /** What the value had to be: the namespace for an id, the first segment of `moduleId` for the authority. */
  readonly expected: string;
};

/** Reads an own data property; an accessor is never called. */
function ownData(record: unknown, key: string): unknown {
  if (typeof record !== "object" || record === null) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
}

const text = (record: unknown, path: string, key: string): string => {
  const value = ownData(record, key);
  if (typeof value !== "string" || value.length === 0) {
    throw invalid(`checkNamespaces() requires ${path} to have a non-empty string ${key}`);
  }
  return value;
};

/** Membership holds only at a segment boundary, so `agent` never covers `agent-runtime/x`. */
const inNamespace = (id: string, namespace: string): boolean => id === namespace || id.startsWith(`${namespace}/`);

/**
 * Checks rules 1, 2 and 6 of "Identity and namespaces": `moduleId` and `implementationId` lie in the
 * namespace of the product that supplies the code, and `owner.authority` equals the first segment of
 * `moduleId`. It does not check `capabilityId`, which belongs to the contract owner, nor ID history or session ids.
 */
export function checkNamespaces(input: {
  /** The product that supplies the code, as whole segments: "agent-runtime", "test", "acme/orders". */
  readonly namespace: string;
  readonly declarations: readonly ModuleDeclaration[];
}): void {
  const namespace = ownData(input, "namespace");
  const declarations = ownData(input, "declarations");
  if (typeof namespace !== "string" || namespace.split("/").some(segment => segment.length === 0)) {
    throw invalid("checkNamespaces() requires a namespace of non-empty segments separated by single slashes");
  }
  if (!Array.isArray(declarations)) {
    throw invalid("checkNamespaces() requires declarations to be an array");
  }

  const violations: NamespaceViolation[] = [];
  for (let index = 0; index < declarations.length; index += 1) {
    const path = `declarations[${String(index)}]`;
    const declaration: unknown = ownData(declarations, String(index));
    const moduleId = text(declaration, path, "moduleId");
    const implementationId = text(declaration, path, "implementationId");
    const authority = text(ownData(declaration, "owner"), `${path}.owner`, "authority");
    if (!inNamespace(moduleId, namespace)) {
      violations.push({ implementationId, rule: "module-id", value: moduleId, expected: namespace });
    }
    if (!inNamespace(implementationId, namespace)) {
      violations.push({ implementationId, rule: "implementation-id", value: implementationId, expected: namespace });
    }
    const first = moduleId.split("/")[0] ?? "";
    if (authority !== first) {
      violations.push({ implementationId, rule: "owner-authority", value: authority, expected: first });
    }
  }
  if (violations.length > 0) {
    throw new ConformanceError("conformance.namespaces.violation",
      `${String(violations.length)} namespace violation${violations.length === 1 ? "" : "s"} in ${namespace}: ${
        violations.map(entry => `${entry.rule} of ${entry.implementationId} is ${entry.value}, expected ${entry.expected}`).join("; ")}`,
      { details: { violations } });
  }
}
