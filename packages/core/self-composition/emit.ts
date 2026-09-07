import type { CompileCompositionResult, ModuleDeclaration } from "../src/features/authoring/internal.js";
import { compilerFacadeModuleId } from "../src/features/compiler-facade/declaration.js";
import type { AllowlistHandle } from "./allowlist-types.js";

type Code =
  | "allowlist.unknown-implementation"
  | "allowlist.missing-for-selected"
  | "allowlist.duplicate-local-name"
  | "allowlist.out-of-bound-import"
  | "allowlist.invalid-identifier"
  | "emitter.invalid-result"
  | "emitter.invalid-plan"
  | "emitter.invalid-declaration"
  | "emitter.invalid-factory"
  | "emitter.invalid-selection"
  | "emitter.invalid-order"
  | "emitter.invalid-binding"
  | "emitter.unsupported-cardinality"
  | "emitter.binding-name-collision";

const reserved = new Set([
  "break", "case", "catch", "class", "const", "continue", "debugger", "default",
  "delete", "do", "else", "enum", "export", "extends", "false", "finally",
  "for", "function", "if", "import", "in", "instanceof", "new", "null",
  "return", "super", "switch", "this", "throw", "true", "try", "typeof",
  "var", "void", "while", "with", "implements", "interface", "let", "package",
  "private", "protected", "public", "static", "yield", "await", "eval",
  "arguments", "abstract", "accessor", "as", "asserts", "assert", "any",
  "async", "boolean", "constructor", "declare", "get", "infer", "intrinsic",
  "is", "keyof", "module", "namespace", "never", "out", "override", "readonly",
  "require", "number", "object", "satisfies", "set", "string", "symbol",
  "type", "undefined", "unique", "unknown", "using", "from", "global", "of",
]);
const forbiddenSlots = new Set([
  ...Object.getOwnPropertyNames(Object.prototype), "prototype", "then",
]);

function check(condition: unknown, code: Code): asserts condition {
  if (!condition) {
    const error = new Error(code);
    throw Object.defineProperty(error, "code", { value: code, enumerable: true });
  }
}

function fields(value: unknown, keys: readonly string[]): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length && actual.every(key =>
    typeof key === "string" && keys.includes(key));
}

function portable(value: unknown): boolean {
  return typeof value === "string" && value.length <= 128
    && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+$/u.test(value);
}

function identifier(value: unknown): boolean {
  return typeof value === "string" && /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(value)
    && !reserved.has(value);
}

type Compatibility = ModuleDeclaration["provides"][number]["compatibility"];

function compatibility(value: Compatibility): boolean {
  return fields(value, ["family", "familyVersion", "token"])
    && value.family === "exact" && value.familyVersion === 1 && portable(value.token);
}

function same(left: Compatibility, right: Compatibility): boolean {
  return left.family === right.family && left.familyVersion === right.familyVersion
    && left.token === right.token;
}

function validateDeclaration(declaration: ModuleDeclaration): void {
  check(fields(declaration, ["kind", "schemaVersion", "moduleId", "implementationId",
    "owner", "provides", "slots"]), "emitter.invalid-declaration");
  check(declaration.kind === "get-modular.module-declaration" && declaration.schemaVersion === 1
    && portable(declaration.moduleId) && portable(declaration.implementationId)
    && Array.isArray(declaration.slots) && Array.isArray(declaration.provides),
  "emitter.invalid-declaration");
  const slots = new Set<string>();
  for (const slot of declaration.slots) {
    check(fields(slot, ["slotId", "capabilityId", "compatibility", "cardinality"])
      && typeof slot.slotId === "string" && /^[a-z][a-z0-9]{0,63}$/u.test(slot.slotId)
      && !forbiddenSlots.has(slot.slotId) && !slots.has(slot.slotId)
      && portable(slot.capabilityId) && compatibility(slot.compatibility),
    "emitter.invalid-declaration");
    check(fields(slot.cardinality, ["kind"]) && slot.cardinality.kind === "required",
      "emitter.unsupported-cardinality");
    slots.add(slot.slotId);
  }
  const capabilities = new Set<string>();
  for (const provided of declaration.provides) {
    check(fields(provided, ["capabilityId", "compatibility"])
      && portable(provided.capabilityId) && compatibility(provided.compatibility)
      && !capabilities.has(provided.capabilityId), "emitter.invalid-declaration");
    capabilities.add(provided.capabilityId);
  }
}

/**
 * Private production-path renderer. The caller owns source/build custody and
 * must independently verify allowlist correspondence before publishing output.
 * Runtime factory values are checked for function type only, never invoked.
 */
export function emitComposition(
  result: CompileCompositionResult,
  allowlist: ReadonlyMap<string, AllowlistHandle>,
): string {
  check(result?.ok === true && fields(result, ["ok", "plan", "digest"])
    && typeof result.digest === "string"
    && /^gm-plan:v1:sha-256:[0-9a-f]{64}$/u.test(result.digest), "emitter.invalid-result");
  const plan = result.plan;
  check(fields(plan, ["kind", "schemaVersion", "profileId", "roots", "selections",
    "bindings", "dependencyOrder"]) && plan.kind === "get-modular.composition-plan"
    && plan.schemaVersion === 1 && portable(plan.profileId)
    && Array.isArray(plan.roots) && plan.roots.length === 1
    && plan.roots[0] === compilerFacadeModuleId && Array.isArray(plan.selections)
    && plan.selections.length > 0 && Array.isArray(plan.bindings)
    && Array.isArray(plan.dependencyOrder), "emitter.invalid-plan");

  const localNames = new Set<string>();
  for (const [id, handle] of allowlist) {
    check(handle?.declaration !== undefined && handle.declaration !== null
      && handle.declaration.implementationId === id, "allowlist.unknown-implementation");
    validateDeclaration(handle.declaration);
    check(typeof handle.factory === "function", "emitter.invalid-factory");
    check(identifier(handle.factoryExport) && identifier(handle.declarationExport)
      && identifier(handle.localName), "allowlist.invalid-identifier");
    check(!localNames.has(handle.localName), "allowlist.duplicate-local-name");
    localNames.add(handle.localName);
    check(typeof handle.importPath === "string"
      && /^\.\.\/\.\.\/features\/[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)?\/factory\.js$/u.test(handle.importPath),
    "allowlist.out-of-bound-import");
  }

  const selected = new Map<string, AllowlistHandle>();
  const modules = new Map<string, string>();
  const rows = new Map<string, Map<string, string>>();
  for (const selection of plan.selections) {
    check(fields(selection, ["moduleId", "implementationId"])
      && portable(selection.moduleId) && portable(selection.implementationId),
    "emitter.invalid-selection");
    const handle = allowlist.get(selection.implementationId);
    check(handle !== undefined, "allowlist.missing-for-selected");
    check(handle.declaration.moduleId === selection.moduleId
      && !selected.has(selection.implementationId) && !modules.has(selection.moduleId),
    "emitter.invalid-selection");
    selected.set(selection.implementationId, handle);
    modules.set(selection.moduleId, selection.implementationId);
    rows.set(selection.implementationId, new Map());
  }
  const facade = modules.get(compilerFacadeModuleId);
  check(facade !== undefined, "emitter.invalid-selection");
  const position = new Map<string, number>();
  for (const [index, id] of plan.dependencyOrder.entries()) {
    check(selected.has(id) && !position.has(id), "emitter.invalid-order");
    position.set(id, index);
  }
  check(position.size === selected.size, "emitter.invalid-order");

  const names = new Set(["root", "CompilerFacadePort"]);
  for (const handle of selected.values()) {
    for (const name of [handle.factoryExport, handle.localName]) {
      check(!names.has(name), "emitter.binding-name-collision");
      names.add(name);
    }
  }
  for (const binding of plan.bindings) {
    check(fields(binding, ["consumerImplementationId", "slotId", "providerImplementationIds",
      "capabilityId", "compatibility"]), "emitter.invalid-binding");
    const consumer = selected.get(binding.consumerImplementationId);
    const slot = consumer?.declaration.slots.find(item => item.slotId === binding.slotId);
    const bindings = rows.get(binding.consumerImplementationId);
    check(slot !== undefined && bindings !== undefined && !bindings.has(slot.slotId)
      && Array.isArray(binding.providerImplementationIds)
      && binding.providerImplementationIds.length === 1, "emitter.invalid-binding");
    const providerId = binding.providerImplementationIds[0];
    check(providerId !== undefined, "emitter.invalid-binding");
    const provider = selected.get(providerId);
    const provided = provider?.declaration.provides.find(item => item.capabilityId === slot.capabilityId);
    check(provided !== undefined && binding.capabilityId === slot.capabilityId
      && compatibility(binding.compatibility) && same(binding.compatibility, slot.compatibility)
      && same(provided.compatibility, slot.compatibility), "emitter.invalid-binding");
    const providerPosition = position.get(providerId);
    const consumerPosition = position.get(binding.consumerImplementationId);
    check(providerPosition !== undefined && consumerPosition !== undefined
      && providerPosition < consumerPosition, "emitter.invalid-order");
    bindings.set(slot.slotId, providerId);
  }
  for (const [id, handle] of selected) {
    check(rows.get(id)?.size === handle.declaration.slots.length, "emitter.invalid-binding");
  }
  // Validate closure using the supplied order; do not compute another order.
  const reached = new Set([facade]);
  for (const id of [...plan.dependencyOrder].reverse()) {
    check(reached.has(id), "emitter.invalid-selection");
    for (const provider of rows.get(id)?.values() ?? []) reached.add(provider);
  }

  const lines = [`// generated by the self-composition emitter from plan digest ${result.digest}`];
  for (const id of plan.dependencyOrder) {
    const handle = selected.get(id);
    check(handle !== undefined, "emitter.invalid-selection");
    lines.push(`import { ${handle.factoryExport} } from "${handle.importPath}";`);
  }
  lines.push('import type { CompilerFacadePort } from "../../features/compiler-facade/ports.js";', "");
  for (const id of plan.dependencyOrder) {
    const handle = selected.get(id);
    check(handle !== undefined, "emitter.invalid-selection");
    const dependencies = handle.declaration.slots.map(slot => {
      const providerId = rows.get(id)?.get(slot.slotId);
      const provider = providerId === undefined ? undefined : selected.get(providerId);
      check(provider !== undefined, "emitter.invalid-binding");
      return `${slot.slotId}: ${provider.localName}`;
    });
    const object = dependencies.length === 0 ? "{}" : `{ ${dependencies.join(", ")} }`;
    lines.push(`const ${handle.localName} = ${handle.factoryExport}(${object});`);
  }
  lines.push("", `export const root: CompilerFacadePort = ${selected.get(facade)?.localName};`, "");
  return lines.join("\n");
}
