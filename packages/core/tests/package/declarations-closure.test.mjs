import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import { auditM1DeclarationClosure } from "../../../../tests/qualification/support/m1-declarations-closure.mjs";

const ROOT = "dist/index.d.ts";
const WIRE = "dist/features/authoring/wire.d.ts";
const ISSUES = "dist/features/authoring/issues.d.ts";
const HELPERS = "dist/features/authoring/constructors.d.ts";
const SURFACE = "dist/features/authoring/surface.d.ts";

// Complete declaration subjects, supplied as bytes. The diagnostic fixture keeps
// the emitted generic/mapped representation, while the checker independently
// describes the accepted concrete algebra. No subject JavaScript is evaluated.
const wire = `
export type Compatibility = { readonly family: "exact"; readonly familyVersion: 1; readonly token: string };
export type RequiredCardinality = { kind: "required" };
export type OptionalCardinality = { kind: "optional" };
export type ManyCardinality = { kind: "many"; min: number; max: number; order: "profile" };
export type Cardinality = Readonly<RequiredCardinality> | Readonly<OptionalCardinality> | Readonly<ManyCardinality>;
export type ProvidedCapability = { readonly capabilityId: string; readonly compatibility: Compatibility };
export type DependencySlot = ProvidedCapability & { readonly slotId: string; readonly cardinality: Cardinality };
export type ModuleDeclaration = {
  readonly kind: "get-modular.module-declaration"; readonly schemaVersion: 1;
  readonly moduleId: string; readonly implementationId: string;
  readonly owner: { readonly authority: string; readonly path: readonly string[] };
  readonly provides: readonly ProvidedCapability[]; readonly slots: readonly DependencySlot[];
};
export type Selection = { readonly moduleId: string; readonly implementationId: string };
export type Binding = { readonly consumerImplementationId: string; readonly slotId: string;
  readonly providerImplementationIds: readonly string[] };
export type CompositionProfile = {
  readonly kind: "get-modular.composition-profile"; readonly schemaVersion: 1; readonly profileId: string;
  readonly roots: readonly string[]; readonly selections: readonly Selection[]; readonly bindings: readonly Binding[];
};
export type PlanBinding = Binding & ProvidedCapability;
export type CompositionPlan = {
  readonly kind: "get-modular.composition-plan"; readonly schemaVersion: 1; readonly profileId: string;
  readonly roots: readonly string[]; readonly selections: readonly Selection[]; readonly bindings: readonly PlanBinding[];
  readonly dependencyOrder: readonly string[];
};
export type PlanDigest = \`gm-plan:v1:sha-256:\${string}\`;
`;
const issues = `
import type { Compatibility, CompositionPlan, PlanDigest } from "./wire.js";
export type DiagnosticPathSegment = { readonly kind: "field"; readonly value: string }
  | { readonly kind: "index"; readonly value: number };
type EmptyCoordinate = Readonly<Record<string, never>>;
type ModuleCoordinate = { readonly moduleId: string };
type ImplementationCoordinate = { readonly implementationId: string };
type SelectionCoordinate = ModuleCoordinate & ImplementationCoordinate;
type SlotCoordinate = ImplementationCoordinate & { readonly slotId: string };
type ProviderCoordinate = SlotCoordinate & { readonly providerImplementationId: string };
type Reason<R extends string> = { readonly reason: R };
type RecordFor<Code extends string, Phase extends string, Coordinate, Details> = {
  readonly code: Code; readonly phase: Phase; readonly path: readonly DiagnosticPathSegment[];
  readonly coordinate: Coordinate; readonly details: Details;
};
type LimitPhase = {
  declarationRawDocumentBytes: "decode"; profileRawDocumentBytes: "decode"; aggregateRawBytes: "decode";
  jsonValueOccurrences: "schema"; jsonDepth: "decode"; aggregateStringBytes: "decode"; identifierBytes: "schema";
  ownerPathSegments: "declaration"; declarations: "declaration"; capabilitiesPerDeclaration: "declaration";
  slotsPerDeclaration: "declaration"; totalCapabilities: "declaration"; totalSlots: "declaration";
  roots: "profile"; selections: "profile"; bindings: "profile"; graphEdges: "graph";
  providersPerManySlot: "binding"; graphDepth: "graph"; diagnostics: "output"; diagnosticPathSegments: "output";
};
type LimitDiagnostic = {
  [L in keyof LimitPhase]: RecordFor<"input.limit-exceeded", LimitPhase[L], EmptyCoordinate,
    { readonly limitName: L; readonly limit: number; readonly actual: number }>;
}[keyof LimitPhase];
export type Diagnostic =
  | RecordFor<"decode.invalid-json", "decode", EmptyCoordinate, Reason<"invalid-json">>
  | RecordFor<"decode.duplicate-key", "decode", EmptyCoordinate, Reason<"duplicate-key">>
  | LimitDiagnostic
  | RecordFor<"schema.unsupported-version", "schema", EmptyCoordinate, Reason<"unsupported-version">>
  | RecordFor<"schema.unknown-field", "schema", EmptyCoordinate, Reason<"unknown-field">>
  | RecordFor<"schema.invalid-value", "schema", EmptyCoordinate, Reason<"invalid-type" | "invalid-format">>
  | RecordFor<"schema.non-plain-value", "schema", EmptyCoordinate, Reason<"non-plain-value">>
  | RecordFor<"identity.invalid", "schema", EmptyCoordinate, Reason<"invalid-format">>
  | RecordFor<"declaration.duplicate-implementation", "declaration", ImplementationCoordinate, Reason<"duplicate">>
  | RecordFor<"declaration.duplicate-capability", "declaration", ImplementationCoordinate, Reason<"duplicate">>
  | RecordFor<"declaration.duplicate-slot", "declaration", SlotCoordinate, Reason<"duplicate">>
  | RecordFor<"profile.duplicate-root", "profile", ModuleCoordinate, Reason<"duplicate">>
  | RecordFor<"profile.unknown-root", "profile", ModuleCoordinate, Reason<"unknown">>
  | RecordFor<"profile.duplicate-selection", "profile", ModuleCoordinate, Reason<"duplicate">>
  | RecordFor<"profile.unknown-module", "profile", ModuleCoordinate, Reason<"unknown">>
  | RecordFor<"profile.unknown-implementation", "profile", SelectionCoordinate, Reason<"unknown">>
  | RecordFor<"profile.implementation-mismatch", "profile", SelectionCoordinate, Reason<"mismatch">>
  | RecordFor<"profile.missing-selection", "profile", ModuleCoordinate, Reason<"missing">>
  | RecordFor<"profile.unreachable-selection", "graph", SelectionCoordinate, Reason<"unreachable">>
  | RecordFor<"binding.duplicate", "binding", ProviderCoordinate, Reason<"duplicate">>
  | RecordFor<"binding.missing", "binding", SlotCoordinate, Reason<"missing">>
  | RecordFor<"binding.unknown-consumer", "binding", ImplementationCoordinate, Reason<"unknown">>
  | RecordFor<"binding.unknown-slot", "binding", SlotCoordinate, Reason<"unknown">>
  | RecordFor<"binding.unknown-provider", "binding", ProviderCoordinate, Reason<"unknown">>
  | RecordFor<"binding.provider-not-selected", "binding", ProviderCoordinate, Reason<"mismatch">>
  | RecordFor<"binding.cardinality", "binding", SlotCoordinate,
    { readonly expectedCardinality: "required" | "optional" | "many"; readonly actualCardinality: number }>
  | RecordFor<"binding.capability-missing", "binding", ProviderCoordinate, Reason<"missing">>
  | RecordFor<"binding.compatibility-mismatch", "binding", ProviderCoordinate,
    { readonly expectedCompatibility: Compatibility; readonly actualCompatibility: Compatibility }>
  | RecordFor<"graph.cycle", "graph", EmptyCoordinate, { readonly component: readonly string[] }>
  | RecordFor<"diagnostics.truncated", "output", EmptyCoordinate, { readonly omitted: number }>;
export type DiagnosticCode = Diagnostic["code"];
export type CompileCompositionResult =
  | { readonly ok: true; readonly plan: CompositionPlan; readonly digest: PlanDigest }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };
export {};
`;
const helpers = `
import type { ManyCardinality, ModuleDeclaration, OptionalCardinality, RequiredCardinality } from "./wire.js";
export declare function defineModule<const T extends ModuleDeclaration>(declaration: T): T;
export declare function required(): RequiredCardinality;
export declare function optional(): OptionalCardinality;
export declare function many(bounds: { readonly min: number; readonly max: number }): ManyCardinality;
`;
const surface = `
export { defineModule, required, optional, many } from "./constructors.js";
export type { ModuleDeclaration, CompositionProfile, CompositionPlan, PlanDigest } from "./wire.js";
export type { CompileCompositionResult, Diagnostic, DiagnosticCode } from "./issues.js";
`;
const compiler = `export declare const compileComposition: (input: {
  readonly declarations: readonly unknown[]; readonly profile: unknown;
}) => Promise<CompileCompositionResult>;`;
const root = `import type { CompileCompositionResult } from "./features/authoring/surface.js";
${compiler}
export { defineModule, required, optional, many } from "./features/authoring/surface.js";
export type { CompileCompositionResult, ModuleDeclaration, CompositionProfile, CompositionPlan,
  Diagnostic, DiagnosticCode, PlanDigest } from "./features/authoring/surface.js";
`;
const originals = new Map([[ROOT, root], [WIRE, wire], [ISSUES, issues], [HELPERS, helpers], [SURFACE, surface]]);
function fixture() { return new Map([...originals].map(([path, text]) => [path, Buffer.from(text)])); }
function replace(files, path, before, after) {
  const text = files.get(path).toString("utf8");
  assert.ok(text.includes(before), `mutation span exists in ${path}`);
  assert.notEqual(before, after);
  files.set(path, Buffer.from(text.replace(before, after)));
}
function append(files, path, text) { files.set(path, Buffer.concat([files.get(path), Buffer.from(text)])); }
function reject(files, reason) {
  assert.throws(() => auditM1DeclarationClosure(files), error => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "Invalid M1 declaration closure.");
    assert.equal(error.code, "declarations.invalid");
    assert.equal(typeof error.reason, "string");
    assert.notEqual(error.reason, "checker-failed", "a targeted rule, not a crashed checker, rejects the mutant");
    if (reason) assert.equal(error.reason, reason);
    assert.equal(error.cause, undefined);
    return true;
  });
}

// Every mutation below starts with this complete, independently accepted control.
// Main additionally applies the audit and emitted-content mutants to the real pack.
test("complete generic/mapped declaration bytes yield module and root symbol inventories", () => {
  const files = fixture();
  const before = new Map([...files].map(([path, bytes]) => [path, Buffer.from(bytes)]));
  const result = auditM1DeclarationClosure(files);
  assert.deepEqual(result.modules, [...originals.keys()].sort());
  assert.deepEqual(result.rootExports, [
    ...["CompileCompositionResult", "CompositionPlan", "CompositionProfile", "Diagnostic", "DiagnosticCode",
      "ModuleDeclaration", "PlanDigest"].map(name => ({ name, kind: "type" })),
    ...["compileComposition", "defineModule", "many", "optional", "required"].map(name => ({ name, kind: "value" })),
  ]);
  assert.deepEqual(files, before);
  result.modules.length = 0;
  assert.equal(auditM1DeclarationClosure(files).modules.length, 5);
});

test("safe aliases, relocated owned modules and conditional/template helpers are accepted", () => {
  const files = fixture();
  replace(files, SURFACE, 'export { defineModule, required, optional, many } from "./constructors.js";',
    'import { required as makeRequired } from "./constructors.js";\nexport { makeRequired as required };\n'
    + 'export { defineModule, optional, many } from "./constructors.js";');
  replace(files, HELPERS, '<const T extends ModuleDeclaration>(declaration: T): T;',
    '<const Declaration extends ModuleDeclaration>(declaration: Declaration): Declaration;');
  append(files, WIRE, '\ntype Echo<S extends string> = S extends string ? `${S}` : never;\n');
  replace(files, WIRE, 'readonly token: string', 'readonly token: Echo<string>');
  const moved = "dist/features/authoring/nested/data.d.ts";
  files.set(moved, files.get(WIRE));
  files.delete(WIRE);
  for (const path of [HELPERS, SURFACE, ISSUES]) replace(files, path, '"./wire.js"', '"./nested/data.js"');
  assert.deepEqual(auditM1DeclarationClosure(files).modules, [...files.keys()].sort());
});

test("a local import type preserves a public wire reference without filesystem fallback", () => {
  const files = fixture();
  replace(files, ISSUES, 'readonly plan: CompositionPlan;', 'readonly plan: import("./wire.js").CompositionPlan;');
  assert.equal(auditM1DeclarationClosure(files).rootExports.length, 12);
});

test("equivalent array representations preserve empty providers and ordinary inputs and results", async t => {
  const cases = [
    ["readonly array alias", WIRE, 'readonly providerImplementationIds: readonly string[]',
      'readonly providerImplementationIds: ReadonlyArray<string>'],
    ["spread-only readonly tuple admits empty providers", WIRE, 'readonly providerImplementationIds: readonly string[]',
      'readonly providerImplementationIds: readonly [...string[]]'],
    ["required existing length property preserves ordinary arrays", WIRE, 'readonly providerImplementationIds: readonly string[]',
      'readonly providerImplementationIds: readonly string[] & { readonly length: number }'],
    ["mapped readonly array preserves providers", WIRE, 'readonly providerImplementationIds: readonly string[]',
      'readonly providerImplementationIds: Readonly<Array<string>>'],
    ["optional existing length property preserves ordinary arrays", WIRE, 'readonly providerImplementationIds: readonly string[]',
      'readonly providerImplementationIds: readonly string[] & { readonly length?: number }'],
    ["equivalent array union preserves providers", WIRE, 'readonly providerImplementationIds: readonly string[]',
      'readonly providerImplementationIds: ReadonlyArray<string> | readonly [...string[]]'],
    ["nested binding array preserves redundant readonly length", WIRE, 'readonly bindings: readonly Binding[]',
      'readonly bindings: ReadonlyArray<Binding> & { readonly length: number }'],
    ["array within a diagnostic union preserves redundant readonly length", ISSUES, 'readonly component: readonly string[]',
      'readonly component: ReadonlyArray<string> & { readonly length: number }'],
    ["equivalent compiler input array", ROOT, 'readonly declarations: readonly unknown[]',
      'readonly declarations: readonly [...unknown[]]'],
    ["equivalent compiler result array", ISSUES, 'readonly diagnostics: readonly Diagnostic[]',
      'readonly diagnostics: readonly [...Diagnostic[]]'],
  ];
  for (const [name, path, before, after] of cases) await t.test(name, () => {
    const files = fixture();
    replace(files, path, before, after);
    assert.deepEqual(auditM1DeclarationClosure(files).modules, [...originals.keys()].sort());
  });
});

test("candidate JavaScript remains inert and is left to the JavaScript closure owner", () => {
  const files = fixture();
  files.set("dist/index.js", Buffer.from('throw new Error("candidate must never execute");'));
  assert.equal(auditM1DeclarationClosure(files).modules.length, 5);
});

test("content mutations reject even with the same complete declaration inventory", async t => {
  assert.equal(auditM1DeclarationClosure(fixture()).rootExports.length, 12);
  const cases = [
    ["extra root value", files => append(files, ROOT, '\nexport declare function harmless(): void;'), "root-exports"],
    ["extra root catalog type", files => append(files, ROOT, '\nexport type DiagnosticCatalogCode = string;'), "root-exports"],
    ["type-only helper reexport", files => replace(files, SURFACE,
      'export { defineModule, required, optional, many }', 'export type { defineModule, required, optional, many }'), "export-kind"],
    ["alias substitution under a helper's innocent name", files => {
      replace(files, SURFACE, 'defineModule, required, optional, many', 'defineModule, friendly as required, optional, many');
      append(files, HELPERS, '\nexport declare function friendly(): RequiredCardinality;');
    }, "export-origin"],
    ["compatible private callable substituted under compileComposition", files => {
      replace(files, ROOT, compiler, 'export { assemble as compileComposition } from "./features/authoring/constructors.js";');
      append(files, HELPERS, '\nimport type { CompileCompositionResult } from "./issues.js";\n'
        + 'export declare function assemble(input: { readonly declarations: readonly unknown[]; readonly profile: unknown }): Promise<CompileCompositionResult>;');
    }, "export-origin"],
    ["factory parameters under required", files => replace(files, HELPERS,
      'required(): RequiredCardinality', 'required(deps: { readonly canonicalizer: unknown }): RequiredCardinality'), "callable"],
    ["private return under compileComposition", files => replace(files, ROOT,
      'Promise<CompileCompositionResult>', 'Promise<{ readonly activate: () => void }>'), "nested-callable"],
    ["private return alias under a helper", files => {
      replace(files, HELPERS, 'required(): RequiredCardinality', 'required(): Friendly');
      append(files, HELPERS, '\ntype Friendly = { readonly start: () => void };');
    }, "nested-callable"],
    ["private constraint under defineModule", files => {
      replace(files, HELPERS, 'T extends ModuleDeclaration', 'T extends ModuleDeclaration & Friendly');
      append(files, HELPERS, '\ntype Friendly = { readonly authority: string };');
    }, "type-contract"],
    ["private generic default", files => {
      replace(files, HELPERS, 'T extends ModuleDeclaration>', 'T extends ModuleDeclaration = HostDeclaration>');
      append(files, HELPERS, '\ntype HostDeclaration = ModuleDeclaration & { readonly host: string };');
    }, "generic-default"],
    ["const inference removed", files => replace(files, HELPERS,
      '<const T extends ModuleDeclaration>', '<T extends ModuleDeclaration>'), "helper-generic"],
    ["generic return erases literals", files => replace(files, HELPERS,
      '(declaration: T): T;', '(declaration: T): ModuleDeclaration;'), "helper-generic"],
    ["helper overload", files => append(files, HELPERS,
      '\nexport declare function required(value: number): RequiredCardinality;'), "duplicate-symbol"],
    ["optional compiler argument", files => replace(files, ROOT, '(input: {', '(input?: {'), "callable"],
    ["rest helper parameters", files => replace(files, HELPERS,
      'optional(): OptionalCardinality', 'optional(...args: never[]): OptionalCardinality'), "callable"],
    ["compiler narrows unknown input", files => replace(files, ROOT,
      'readonly declarations: readonly unknown[]', 'readonly declarations: readonly never[]'), "type-contract"],
    ["compiler input requires a non-empty readonly tuple", files => replace(files, ROOT,
      'readonly declarations: readonly unknown[]', 'readonly declarations: readonly [unknown, ...unknown[]]'), "type-contract"],
    ["compiler input array gains a required intersection property", files => replace(files, ROOT,
      'readonly declarations: readonly unknown[]',
      'readonly declarations: readonly unknown[] & { readonly marker: true }'), "type-contract"],
    ["compiler synchronous result", files => replace(files, ROOT,
      'Promise<CompileCompositionResult>', 'CompileCompositionResult'), "type-contract"],
    ["typeof a private callable", files => {
      replace(files, ROOT, compiler, 'export declare const compileComposition: typeof hidden;');
      append(files, ROOT, '\ndeclare function hidden(): never;');
    }, "type-query"],
    ["typeof import of a private callable", files => replace(files, ROOT, compiler,
      'export declare const compileComposition: typeof import("./features/authoring/constructors.js").required;'), "type-query"],
    ["import type leaks an innocently named private data shape", files => {
      replace(files, ISSUES, 'readonly plan: CompositionPlan;', 'readonly plan: import("./wire.js").Friendly;');
      append(files, WIRE, '\nexport type Friendly = { readonly hostState: string };');
    }, "type-contract"],
    ["reserved code added to DiagnosticCode", files => replace(files, ISSUES,
      'DiagnosticCode = Diagnostic["code"]', 'DiagnosticCode = Diagnostic["code"] | "output.canonicalization-failed"'), "type-contract"],
    ["reserved code added to both unions", files => replace(files, ISSUES,
      'export type DiagnosticCode =', 'type Reserved = RecordFor<"output.canonicalization-failed", "output", EmptyCoordinate, Reason<"failed">>;\nexport type DiagnosticCode =')
      || replace(files, ISSUES, '| LimitDiagnostic', '| LimitDiagnostic | Reserved'), "type-contract"],
    ["real diagnostic removed", files => replace(files, ISSUES,
      '| RecordFor<"identity.invalid", "schema", EmptyCoordinate, Reason<"invalid-format">>', ''), "type-contract"],
    ["closed diagnostic reason widened", files => replace(files, ISSUES,
      'Reason<"invalid-json">', 'Reason<string>'), "type-contract"],
    ["code phase association changed", files => replace(files, ISSUES,
      'RecordFor<"identity.invalid", "schema", EmptyCoordinate',
      'RecordFor<"identity.invalid", "decode", EmptyCoordinate'), "type-contract"],
    ["limit phase changed", files => replace(files, ISSUES,
      'graphDepth: "graph"', 'graphDepth: "schema"'), "type-contract"],
    ["diagnostic detail gains optional property", files => replace(files, ISSUES,
      'readonly omitted: number', 'readonly omitted: number; readonly harmless?: string'), "type-contract"],
    ["diagnostic details lose readonly", files => replace(files, ISSUES,
      'readonly details: Details', 'details: Details'), "type-contract"],
    ["diagnostic path array gains a required intersection property", files => replace(files, ISSUES,
      'readonly path: readonly DiagnosticPathSegment[]',
      'readonly path: readonly DiagnosticPathSegment[] & { readonly marker: true }'), "type-contract"],
    ["result gains optional property", files => replace(files, ISSUES,
      'readonly digest: PlanDigest', 'readonly digest: PlanDigest; readonly extra?: never'), "type-contract"],
    ["compiler result requires a non-empty readonly diagnostic tuple", files => replace(files, ISSUES,
      'readonly diagnostics: readonly Diagnostic[]',
      'readonly diagnostics: readonly [Diagnostic, ...Diagnostic[]]'), "type-contract"],
    ["compiler result array gains a required intersection property", files => replace(files, ISSUES,
      'readonly diagnostics: readonly Diagnostic[]',
      'readonly diagnostics: readonly Diagnostic[] & { readonly marker: true }'), "type-contract"],
    ["plan dependency order requires a non-empty readonly tuple", files => replace(files, WIRE,
      'readonly dependencyOrder: readonly string[]',
      'readonly dependencyOrder: readonly [string, ...string[]]'), "type-contract"],
    ["plan field loses readonly", files => replace(files, WIRE,
      'readonly dependencyOrder: readonly string[]', 'dependencyOrder: readonly string[]'), "type-contract"],
    ["nested binding array becomes mutable", files => replace(files, WIRE,
      'readonly providerImplementationIds: readonly string[]', 'readonly providerImplementationIds: string[]'), "type-contract"],
    ["binding providers require a non-empty readonly tuple", files => replace(files, WIRE,
      'readonly providerImplementationIds: readonly string[]',
      'readonly providerImplementationIds: readonly [string, ...string[]]'), "type-contract"],
    ["binding provider array gains a required intersection property", files => replace(files, WIRE,
      'readonly providerImplementationIds: readonly string[]',
      'readonly providerImplementationIds: readonly string[] & { readonly marker: true }'), "type-contract"],
    ["supplied review mutant narrows optional provider position zero", files => replace(files, WIRE,
      'readonly providerImplementationIds: readonly string[]',
      'readonly providerImplementationIds: readonly string[] & { readonly length: number; readonly "0"?: "only"; };'), "type-contract"],
    ["binding provider array narrows an optional nonzero position", files => replace(files, WIRE,
      'readonly providerImplementationIds: readonly string[]',
      'readonly providerImplementationIds: readonly string[] & { readonly "7"?: "only" }'), "type-contract"],
    ["numeric literal position survives the broad numeric index", files => replace(files, WIRE,
      'readonly providerImplementationIds: readonly string[]',
      'readonly providerImplementationIds: readonly string[] & { readonly 7?: "only" }'), "type-contract"],
    ["array union arms narrow different optional provider positions", files => replace(files, WIRE,
      'readonly providerImplementationIds: readonly string[]',
      'readonly providerImplementationIds: (readonly string[] & { readonly "0"?: "only" }) | (readonly string[] & { readonly "7"?: "only" })'), "type-contract"],
    ["nested array in a diagnostic union excludes an optional position", files => replace(files, ISSUES,
      'readonly component: readonly string[]',
      'readonly component: readonly string[] & { readonly "2"?: never }'), "type-contract"],
    ["compiler input array narrows an optional position despite unknown elements", files => replace(files, ROOT,
      'readonly declarations: readonly unknown[]',
      'readonly declarations: readonly unknown[] & { readonly "2"?: "only" }'), "type-contract"],
    ["owner path becomes mutable", files => replace(files, WIRE,
      'readonly path: readonly string[]', 'readonly path: string[]'), "type-contract"],
    ["module owner path requires a non-empty readonly tuple", files => replace(files, WIRE,
      'readonly path: readonly string[]', 'readonly path: readonly [string, ...string[]]'), "type-contract"],
    ["wire cardinality becomes mutable", files => replace(files, WIRE,
      'Readonly<RequiredCardinality> | Readonly<OptionalCardinality> | Readonly<ManyCardinality>',
      'RequiredCardinality | OptionalCardinality | ManyCardinality'), "type-contract"],
    ["helper return becomes readonly", files => replace(files, WIRE,
      'RequiredCardinality = { kind: "required" }', 'RequiredCardinality = Readonly<{ kind: "required" }>'), "type-contract"],
    ["many return narrows numeric literals", files => replace(files, WIRE,
      'kind: "many"; min: number; max: number;', 'kind: "many"; min: 0; max: 2;'), "type-contract"],
    ["many accepts a missing bound", files => replace(files, HELPERS,
      'readonly max: number', 'readonly max?: number'), "type-contract"],
    ["digest widens to arbitrary string", files => replace(files, WIRE,
      '`gm-plan:v1:sha-256:${string}`', 'string'), "type-contract"],
    ["public generic default hidden behind export", files => replace(files, WIRE,
      'type ModuleDeclaration =', 'type ModuleDeclaration<Extra = never> ='), "generic-default"],
    ["unused private symbol in a reached file", files => append(files, WIRE,
      '\ntype Unused = { readonly state: string };'), "unreachable-symbol"],
    ["Host type alias in an otherwise equivalent return", files => {
      append(files, HELPERS, '\ntype HostRecord = RequiredCardinality;');
      replace(files, HELPERS, 'required(): RequiredCardinality', 'required(): HostRecord');
    }, "private-symbol"],
    ["external reference in a dead conditional branch", files => {
      append(files, WIRE, '\ntype Hidden<T> = T extends never ? import("node:fs").Stats : string;');
      replace(files, WIRE, 'readonly token: string', 'readonly token: Hidden<string>');
    }, "module-reference"],
    ["ambient global", files => append(files, ISSUES,
      '\ndeclare global { interface Object { leaked: string } }'), "ambient"],
    ["ambient module", files => append(files, ISSUES,
      '\ndeclare module "host-runtime" { export type Port = string }'), "ambient"],
    ["triple slash path", files => replace(files, ROOT, 'import type', '/// <reference path="./private.d.ts" />\nimport type'), "reference-directive"],
    ["triple slash types", files => replace(files, ROOT, 'import type', '/// <reference types="node" />\nimport type'), "reference-directive"],
    ["candidate standard library request", files => replace(files, ROOT, 'import type', '/// <reference lib="dom" />\nimport type'), "reference-directive"],
    ["compiler suppression", files => replace(files, ROOT, 'import type', '// @ts-nocheck\nimport type'), "reference-directive"],
    ["declaration source map", files => append(files, WIRE, '\n//# sourceMappingURL=private.ts.map'), "source-map"],
    ["malformed syntax", files => append(files, WIRE, '\nexport type Broken = {'), "parse"],
    ["unresolved local symbol", files => replace(files, HELPERS,
      'required(): RequiredCardinality', 'required(): MissingCardinality'), "type-contract"],
    ["any can hide a type leak", files => replace(files, HELPERS,
      'required(): RequiredCardinality', 'required(): any'), "any-type"],
  ];
  for (const [name, edit, reason] of cases) await t.test(name, () => {
    const files = fixture();
    edit(files);
    assert.deepEqual([...files.keys()], [...originals.keys()], "content mutation keeps the complete file inventory");
    reject(files, reason);
  });
});

test("declaration resolution is closed over owned bytes", async t => {
  assert.equal(auditM1DeclarationClosure(fixture()).modules.length, 5);
  for (const specifier of ["typescript", "node:fs", "@get-modular/core", "/developer/checkout/wire.js",
    "../../../../outside.js", "./wire", "./wire.ts", "./wire.js?types", "./nested/../wire.js"]) {
    await t.test(specifier, () => {
      const files = fixture();
      replace(files, HELPERS, '"./wire.js"', JSON.stringify(specifier));
      reject(files, "module-reference");
    });
  }
  const missing = fixture();
  missing.delete(WIRE);
  reject(missing, "missing-declaration");
  const orphan = fixture();
  orphan.set("dist/features/authoring/leftover.d.ts", Buffer.from("export type Leftover = string;"));
  reject(orphan, "unreachable-module");
  const privateOwner = fixture();
  privateOwner.set("dist/features/compiler-facade/ports.d.ts", Buffer.from("export interface Friendly { readonly value: string }"));
  append(privateOwner, ROOT, '\nimport type { Friendly } from "./features/compiler-facade/ports.js";');
  reject(privateOwner, "declaration-owner");
  const map = fixture();
  map.set("dist/innocent.map", Buffer.from('{"sources":["../../private.ts"]}'));
  reject(map, "source-map");
  const sourceArtifact = fixture();
  sourceArtifact.set("dist/features/authoring/private.ts", Buffer.from("export {};"));
  reject(sourceArtifact, "declaration-artifact");
  const invalid = fixture();
  invalid.set(WIRE, Buffer.concat([invalid.get(WIRE), Buffer.from([0xc0, 0xaf])]));
  reject(invalid, "utf8");
  const cycle = fixture();
  replace(cycle, SURFACE, 'export { defineModule, required, optional, many } from "./constructors.js";',
    'export { defineModule, optional, many } from "./constructors.js";\nexport { required } from "./surface.js";');
  reject(cycle, "alias-cycle");
});
