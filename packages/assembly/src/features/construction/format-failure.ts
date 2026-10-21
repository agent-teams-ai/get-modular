import type { CompileCompositionResult, DiagnosticCode } from "@get-modular/core";
import type { AssemblyPreparationResult, PreparationErrorCode } from "./types.js";
import { arrayLength, count, failureText, maximumItems, maximumMembers, members, own, quoted, type FailureText } from "./failure-text.js";

const coreHints = {
  "input.invalid-byte-carrier": "Supply supported UTF-8 Uint8Array document carriers.",
  "decode.invalid-json": "Correct the JSON document at the reported path.",
  "decode.duplicate-key": "Remove duplicate JSON keys at the reported path.",
  "input.limit-exceeded": "Reduce the input dimension named by the limit.",
  "schema.unsupported-version": "Use the supported declaration or profile schema version.",
  "schema.unknown-field": "Remove unsupported fields at the reported path.",
  "schema.invalid-value": "Correct the value at the reported path.",
  "schema.non-plain-value": "Supply plain data at the reported path.",
  "identity.invalid": "Use a valid portable identity at the reported path.",
  "declaration.duplicate-implementation": "List each implementation identity once.",
  "declaration.duplicate-capability": "Declare each provided capability once.",
  "declaration.duplicate-slot": "Declare each local slot identity once.",
  "profile.duplicate-root": "List each root module once.",
  "profile.unknown-root": "Select a declared module as the root.",
  "profile.duplicate-selection": "Select one implementation per module.",
  "profile.unknown-module": "Select a declared module identity.",
  "profile.unknown-implementation": "Select a declared implementation identity.",
  "profile.implementation-mismatch": "Select an implementation belonging to this module.",
  "profile.missing-selection": "Add the missing explicit module selection.",
  "profile.unreachable-selection": "Remove the unused selection or declare its intended dependency.",
  "binding.duplicate-record": "Keep one explicit binding row per consumer and slot.",
  "binding.duplicate": "List each provider once in this binding row.",
  "binding.missing": "Add an explicit binding row; optional absence is an empty provider list.",
  "binding.unknown-consumer": "Use a declared consumer implementation in the binding row.",
  "binding.unknown-slot": "Use a slot declared by this consumer.",
  "binding.unknown-provider": "Use a declared provider implementation in the binding row.",
  "binding.provider-not-selected": "Select the intended provider explicitly.",
  "binding.cardinality": "Match the slot's required, optional or bounded-many provider count.",
  "binding.capability-missing": "Bind a provider that declares this slot's capability; instance is no fallback.",
  "binding.compatibility-mismatch": "Align provider and consumer contract revisions; incompatible templates need an explicit Host facade.",
  "graph.cycle": "Review the component's dependency boundaries or introduce a common ancestor.",
  "diagnostics.truncated": "Correct the reported failures and compile again for remaining diagnostics.",
} as const satisfies Record<DiagnosticCode, string>;
const assemblyHints = {
  "assembly.prepare.invalid-input": "Check the preparation input's supported data-only shape.",
  "assembly.prepare.limit": "Reduce preparation input sizes to the supported envelope.",
  "assembly.prepare.handles": "Supply exactly the selected authenticated module entries.",
  "assembly.prepare.roots": "Name each selected root once using its supplied module entry.",
  "assembly.prepare.core-rejected": "Correct the Core diagnostics below before running factories.",
  "assembly.prepare.plan-mismatch": "Use the original successful composition with its matching declarations.",
  "assembly.prepare.input-handles": "Supply authenticated input entries only through input aliases.",
  "assembly.prepare.unresolved-binding": "Add explicit optional/many rows, including [] for absence; choose a provider for ambiguous required slots.",
  "assembly.prepare.duplicate-module": "Remove repeated module entries or input aliases; do not choose an occurrence implicitly.",
} as const satisfies Record<PreparationErrorCode, string>;
const phases = new Set(["decode", "schema", "declaration", "profile", "binding", "graph", "output"]);
const pathFields = new Set([
  "declarations", "profile", "kind", "schemaVersion", "moduleId", "implementationId", "owner", "authority", "path",
  "provides", "slots", "capabilityId", "slotId", "compatibility", "family", "familyVersion", "token", "cardinality",
  "min", "max", "order", "profileId", "roots", "selections", "bindings", "consumerImplementationId", "providerImplementationIds",
]);
const limitNames = new Set([
  "declarationRawDocumentBytes", "profileRawDocumentBytes", "aggregateRawBytes", "jsonValueOccurrences", "jsonDepth",
  "aggregateStringBytes", "identifierBytes", "ownerPathSegments", "declarations", "capabilitiesPerDeclaration", "slotsPerDeclaration",
  "totalCapabilities", "totalSlots", "roots", "selections", "bindings", "graphEdges", "providersPerManySlot", "graphDepth",
  "diagnostics", "diagnosticPathSegments",
]);

function structuralPath(value: unknown): string | undefined {
  const length = arrayLength(value, 32);
  if (length === undefined || length === 0) {return undefined;}
  const segments: string[] = [];
  for (let index = 0; index < length; index++) {
    const segment = own(value, String(index)), field = own(segment, "value");
    if (own(segment, "kind") === "field" && typeof field === "string" && pathFields.has(field)) {segments.push(field);}
    else if (own(segment, "kind") === "index" && typeof field === "number"
      && Number.isSafeInteger(field) && field >= 0 && field <= 65_535) {segments.push(String(field));}
    else {return undefined;}
  }
  return segments.join("/");
}

function field(text: FailureText, label: string, value: unknown): void {
  const display = quoted(value);
  if (display !== undefined) {text.add(`  ${label}: ${display}`);}
}

function details(text: FailureText, code: DiagnosticCode, value: unknown): void {
  if (code === "binding.compatibility-mismatch") {
    field(text, "expected compatibility", own(own(value, "expectedCompatibility"), "token"));
    field(text, "actual compatibility", own(own(value, "actualCompatibility"), "token"));
  } else if (code === "binding.cardinality") {
    const expected = own(value, "expectedCardinality"), actual = count(own(value, "actualCardinality"));
    if (expected === "required" || expected === "optional" || expected === "many") {text.add(`  cardinality: ${expected}`);}
    if (actual !== undefined) {text.add(`  actual providers: ${actual}`);}
  } else if (code === "input.limit-exceeded") {
    const name = own(value, "limitName"), limit = count(own(value, "limit")), actual = count(own(value, "actual"));
    if (typeof name === "string" && limitNames.has(name)) {text.add(`  limit: ${name}`);}
    if (limit !== undefined && actual !== undefined) {text.add(`  allowed: ${limit}; observed (possibly saturated): ${actual}`);}
  } else if (code === "graph.cycle") {
    const component = members(own(value, "component"), 4096);
    if (component !== undefined) {text.add(`  component: ${component}`);}
  }
}

function coreDiagnostics(text: FailureText, value: unknown): void {
  const length = arrayLength(value, 256);
  if (length === undefined) {text.add("Core diagnostic context unavailable."); return;}
  // The upstream truncation marker is normally last, beyond the local display cap.
  for (let index = 0; index < length; index++) {
    const diagnostic = own(value, String(index));
    if (own(diagnostic, "code") !== "diagnostics.truncated") {continue;}
    const omitted = own(own(diagnostic, "details"), "omitted");
    if (typeof omitted === "number" && Number.isSafeInteger(omitted) && omitted >= 0 && omitted <= 262_144) {
      text.add(`Core diagnostics omitted: ${omitted === 262_144 ? "at least " : ""}${omitted}.`);
    }
  }
  for (let index = 0; index < Math.min(length, maximumItems); index++) {
    const diagnostic = own(value, String(index)), code = own(diagnostic, "code");
    if (typeof code !== "string" || !Object.hasOwn(coreHints, code)) {text.add("Unsupported Core diagnostic."); continue;}
    const known = code as DiagnosticCode, phase = own(diagnostic, "phase");
    text.add(`${known}${typeof phase === "string" && phases.has(phase) ? ` [${phase}]` : ""}`);
    const coordinate = own(diagnostic, "coordinate");
    for (const key of ["moduleId", "implementationId", "slotId", "providerImplementationId"] as const) {
      field(text, key, own(coordinate, key));
    }
    const path = structuralPath(own(diagnostic, "path"));
    if (path !== undefined) {text.add(`  path: ${path}`);}
    details(text, known, own(diagnostic, "details"));
    text.add(`  hint: ${coreHints[known]}`);
  }
  if (length > maximumItems) {text.add(`Display diagnostics omitted: ${length - maximumItems}.`);}
}

function authoringItem(text: FailureText, code: PreparationErrorCode, value: unknown): void {
  if (code === "assembly.prepare.unresolved-binding") {
    const consumer = quoted(own(value, "consumerImplementationId")), slot = quoted(own(value, "slotId"));
    const capability = quoted(own(value, "capabilityId")), cardinality = own(value, "cardinality");
    const candidates = members(own(value, "candidates"), 4096), groups = members(own(value, "groupPath"), 16);
    if (consumer === undefined || slot === undefined || capability === undefined || candidates === undefined || groups === undefined
      || cardinality !== "required" && cardinality !== "optional" && cardinality !== "many") {
      text.add("  Authoring context unavailable."); return;
    }
    text.add(`  consumer: ${consumer}; slot: ${slot}; cardinality: ${cardinality}`);
    text.add(`  capability: ${capability}; groups: ${groups}`);
    text.add(`  candidates: ${candidates}`);
  } else {
    const implementation = quoted(own(value, "implementationId")), paths = own(value, "paths");
    const length = arrayLength(paths, 4096), inputs = members(own(value, "inputs"), 1024);
    if (implementation === undefined || length === undefined || inputs === undefined) {
      text.add("  Authoring context unavailable."); return;
    }
    text.add(`  implementationId: ${implementation}; input aliases: ${inputs}`);
    for (let index = 0; index < Math.min(length, maximumMembers); index++) {
      const path = members(own(paths, String(index)), 16);
      text.add(path === undefined ? "  Group path unavailable." : `  groups: ${path}`);
    }
    if (length > maximumMembers) {text.add(`  Group paths omitted: ${length - maximumMembers}.`);}
  }
}

function authoring(text: FailureText, code: PreparationErrorCode, cause: unknown, include: boolean): void {
  const length = arrayLength(cause, code === "assembly.prepare.unresolved-binding" ? 65_536 : 4096);
  if (length === undefined) {text.add("Authoring context unavailable."); return;}
  text.add(`Reported authoring items: ${length}.`);
  if (!include) {text.add("Authoring context hidden; enable only for trusted local output."); return;}
  text.add("Authoring context (Host-supplied; not Core-validated):");
  for (let index = 0; index < Math.min(length, maximumItems); index++) {
    authoringItem(text, code, own(cause, String(index)));
  }
  if (length > maximumItems) {text.add(`Display authoring items omitted: ${length - maximumItems}.`);}
}

/**
 * Format cooperative library failures without changing or serializing their original data.
 * Authoring context may contain secrets; opt in only for trusted local output.
 */
export function formatFailure(
  failure: Extract<CompileCompositionResult, { readonly ok: false }>
    | Extract<AssemblyPreparationResult<never>, { readonly status: "failed" }>,
  options?: { readonly includeAuthoringContext?: boolean },
): string {
  const text = failureText();
  if (own(failure, "ok") === false) {coreDiagnostics(text, own(failure, "diagnostics"));}
  else if (own(failure, "status") === "failed") {
    const error = own(failure, "error"), code = own(error, "code");
    if (typeof code !== "string" || !Object.hasOwn(assemblyHints, code)) {return "Unsupported preparation failure.";}
    const known = code as PreparationErrorCode;
    text.add(`${known} [prepare]`);
    text.add(`  hint: ${assemblyHints[known]}`);
    if (known === "assembly.prepare.core-rejected") {coreDiagnostics(text, own(failure, "diagnostics"));}
    else if (known === "assembly.prepare.unresolved-binding" || known === "assembly.prepare.duplicate-module") {
      authoring(text, known, own(error, "cause"), own(options, "includeAuthoringContext") === true);
    }
  } else {return "Unsupported failure.";}
  return text.finish();
}
