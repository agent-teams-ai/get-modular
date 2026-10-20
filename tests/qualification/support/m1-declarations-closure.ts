import { Buffer, isUtf8 } from "node:buffer";
import { readFileSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { tmpdir } from "node:os";
import * as ts from "typescript/unstable/ast";
import { SymbolFlags, DiagnosticCategory, type Symbol as NativeSymbol, type Type } from "typescript/unstable/async";
import { withTypeScriptProject, typeScriptLibraryDirectory } from "./typescript-project.ts";

type Generation = 1 | 2;
type Surface = "m1" | "m2";
type DefinitionNode = ts.TypeAliasDeclaration | ts.InterfaceDeclaration | ts.FunctionDeclaration | ts.VariableDeclaration;
interface Definition { module: string; name: string; node: DefinitionNode; statement: ts.Statement; kind: "type" | "value" }
interface ImportEdge { module: string; name: string; typeOnly: boolean }
interface ExportEdge { module?: string | undefined; name: string; typeOnly: boolean }
interface DeclarationModule {
  path: string;
  ast?: ts.SourceFile | undefined;
  definitions: Map<string, Definition>;
  imports: Map<string, ImportEdge>;
  exports: Map<string, ExportEdge>;
  edges: Set<string>;
}
interface ResolvedExport { definition: Definition; typeOnly: boolean }
interface PendingType { node: ts.TypeNode; substitutions: Map<ts.TypeParameterDeclaration, PendingType> }

// Private artifact qualification. The installed, pinned TypeScript 7 compiler supplies
// its explicit native snapshot/AST/checker API; neither compiler enters Core's pack.
const BASE = resolve(tmpdir(), "__gm_m1").replaceAll("\\", "/");
const LIB = resolve(tmpdir(), "__gm_m1_lib").replaceAll("\\", "/");
const ROOT = "dist/index.d.ts";
const VALUES = ["compileComposition", "defineModule", "many", "optional", "required"];
const TYPES = ["CompileCompositionResult", "CompositionPlan", "CompositionProfile",
  "Diagnostic", "DiagnosticCode", "ModuleDeclaration", "PlanDigest"];
const LIB_NAMES = ["lib.es5.d.ts", "lib.decorators.d.ts", "lib.decorators.legacy.d.ts"];
const LIB_TYPES = new Set(["Array", "ReadonlyArray", "Promise", "Readonly", "Record",
  "Pick", "Omit", "Exclude", "Extract", "Partial", "Required", "NonNullable",
  "Uppercase", "Lowercase", "Capitalize", "Uncapitalize"]);
let libraryTexts: readonly (readonly [string, string])[] | undefined;

class InvalidDeclarations extends Error {
  readonly code: string;
  readonly reason: string;
  constructor(reason: string) {
    super("Invalid M1 declaration closure.");
    this.code = "declarations.invalid";
    this.reason = reason;
  }
}
function fail(reason: string): never { throw new InvalidDeclarations(reason); }
function need(condition: unknown, reason: string): asserts condition { if (!condition) fail(reason); }
function same(left: unknown, right: unknown) { return JSON.stringify(left) === JSON.stringify(right); }
function modifiers(node: ts.Node, kind: ts.SyntaxKind) {
  return (ts.isVariableStatement(node) || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)
    || ts.isFunctionDeclaration(node) || ts.isTypeParameterDeclaration(node))
    && (node.modifiers?.some(item => item.kind === kind) ?? false);
}
function identifier(node: ts.Node | undefined) {
  need(node && ts.isIdentifier(node), "syntax-profile");
  return node.text;
}
async function walk(root: ts.Node, visit: (node: ts.Node) => void | Promise<void>) {
  const pending: [ts.Node, number][] = [[root, 0]];
  let count = 0;
  while (pending.length) {
    const entry = pending.pop(); need(entry, "syntax-budget");
    const [node, depth] = entry;
    need(++count <= 25_000 && depth <= 96, "syntax-budget");
    await visit(node);
    node.forEachChild(child => { pending.push([child, depth + 1]); });
  }
}
async function declarationsOf(symbol: NativeSymbol | undefined) {
  if (symbol === undefined) return;
  const declarations: ts.Node[] = [];
  for (const handle of symbol.declarations) {
    const node = await handle.resolve(); need(node, "symbol-reference");
    declarations.push(node);
  }
  return declarations;
}

// These rows transcribe the effective diagnostic contract's phase, coordinate
// and reason algebra (ADR-0007/0018), not the candidate's declarations/catalog.
const REASONS: readonly (readonly [string, string, string, string])[] = [
  ["decode.invalid-json", "decode", "", "invalid-json"],
  ["decode.duplicate-key", "decode", "", "duplicate-key"],
  ["schema.unsupported-version", "schema", "", "unsupported-version"],
  ["schema.unknown-field", "schema", "", "unknown-field"],
  ["schema.invalid-value", "schema", "", "invalid-type|invalid-format"],
  ["schema.non-plain-value", "schema", "", "non-plain-value"],
  ["identity.invalid", "schema", "", "invalid-format"],
  ["declaration.duplicate-implementation", "declaration", "implementationId", "duplicate"],
  ["declaration.duplicate-capability", "declaration", "implementationId", "duplicate"],
  ["declaration.duplicate-slot", "declaration", "implementationId slotId", "duplicate"],
  ["profile.duplicate-root", "profile", "moduleId", "duplicate"],
  ["profile.unknown-root", "profile", "moduleId", "unknown"],
  ["profile.duplicate-selection", "profile", "moduleId", "duplicate"],
  ["profile.unknown-module", "profile", "moduleId", "unknown"],
  ["profile.unknown-implementation", "profile", "moduleId implementationId", "unknown"],
  ["profile.implementation-mismatch", "profile", "moduleId implementationId", "mismatch"],
  ["profile.missing-selection", "profile", "moduleId", "missing"],
  ["profile.unreachable-selection", "graph", "moduleId implementationId", "unreachable"],
  ["binding.duplicate", "binding", "implementationId slotId providerImplementationId", "duplicate"],
  ["binding.missing", "binding", "implementationId slotId", "missing"],
  ["binding.unknown-consumer", "binding", "implementationId", "unknown"],
  ["binding.unknown-slot", "binding", "implementationId slotId", "unknown"],
  ["binding.unknown-provider", "binding", "implementationId slotId providerImplementationId", "unknown"],
  ["binding.provider-not-selected", "binding", "implementationId slotId providerImplementationId", "mismatch"],
  ["binding.capability-missing", "binding", "implementationId slotId providerImplementationId", "missing"],
];
const LIMITS = {
  decode: ["declarationRawDocumentBytes", "profileRawDocumentBytes", "aggregateRawBytes",
    "jsonDepth", "aggregateStringBytes"],
  schema: ["jsonValueOccurrences", "identifierBytes"],
  declaration: ["ownerPathSegments", "declarations", "capabilitiesPerDeclaration",
    "slotsPerDeclaration", "totalCapabilities", "totalSlots"],
  profile: ["roots", "selections", "bindings"],
  binding: ["providersPerManySlot"],
  graph: ["graphEdges", "graphDepth"],
  output: ["diagnostics", "diagnosticPathSegments"],
};
const quote = (value: string) => JSON.stringify(value);
const literals = (values: readonly string[]) => values.map(quote).join(" | ");
const record = (fields: Readonly<Record<string, string>>, readonly = true) => `{ ${Object.entries(fields)
  .map(([key, type]) => `${readonly ? "readonly " : ""}${key}: ${type};`).join(" ")} }`;
const coordinate = (names: string) => names ? record(Object.fromEntries(names.split(" ").map(name => [name, "string"])))
  : "{ readonly [key: string]: never }";
function diagnostic(code: string, phase: string, names: string, details: string) {
  return record({ code: quote(code), phase: quote(phase), path: "readonly EPath[]",
    coordinate: coordinate(names), details });
}

function contractSource(generation: Generation, surface: Surface) {
  // Independent structural expectations from the closed wire contract and the
  // ADR-0006 object signature. Intersections and mapped aliases in the subject
  // may implement these shapes; file text and source hashes are not oracles.
  const compatibility = record({ family: '"exact"', familyVersion: "1", token: "string" });
  const selection = record({ moduleId: "string", implementationId: "string" });
  const binding = { consumerImplementationId: "string", slotId: "string",
    providerImplementationIds: "readonly string[]" };
  const capability = { capabilityId: "string", compatibility: "ECompatibility" };
  const required = record({ kind: '"required"' }, false);
  const optional = record({ kind: '"optional"' }, false);
  const many = record({ kind: '"many"', min: "number", max: "number", order: '"profile"' }, false);
  const profile = { kind: '"get-modular.composition-profile"', schemaVersion: "1", profileId: "string",
    roots: "readonly string[]", selections: "readonly ESelection[]", bindings: "readonly EBinding[]" };
  const reasons: readonly (readonly [string, string, string, string])[] = generation === 1 ? REASONS : [
    ["input.invalid-byte-carrier", "decode", "", "not-uint8array|unusable-view|shared-storage|not-document-list"],
    ...REASONS, ["binding.duplicate-record", "binding", "implementationId slotId", "duplicate"],
  ];
  const rows = reasons.map(([code, phase, names, reasons]) =>
    diagnostic(code, phase, names, record({ reason: literals(reasons.split("|")) })));
  rows.push(diagnostic("binding.cardinality", "binding", "implementationId slotId", record({
    expectedCardinality: '"required" | "optional" | "many"', actualCardinality: "number",
  })), diagnostic("binding.compatibility-mismatch", "binding", "implementationId slotId providerImplementationId",
    record({ expectedCompatibility: "ECompatibility", actualCompatibility: "ECompatibility" })),
  diagnostic("graph.cycle", "graph", "", record({ component: "readonly string[]" })),
  diagnostic("diagnostics.truncated", "output", "", record({ omitted: "number" })));
  for (const [phase, limits] of Object.entries(LIMITS)) for (const limit of limits) {
    rows.push(diagnostic("input.limit-exceeded", phase, "", record({ limitName: quote(limit), limit: "number", actual: "number" })));
  }
  const codes = [...reasons.map(row => row[0]), "input.limit-exceeded", "binding.cardinality",
    "binding.compatibility-mismatch", "graph.cycle", "diagnostics.truncated"];
  return [
    'import * as P from "./dist/index.js";',
    // Assignability alone ignores readonly and permits extra properties. Encode
    // those attributes explicitly before comparing the finite concrete shapes.
    'type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)',
    '  ? ((<T>() => T extends B ? 1 : 2) extends (<T>() => T extends A ? 1 : 2) ? true : false) : false;',
    'type Member<T, K extends keyof T> = [',
    '  {} extends Pick<T, K> ? true : false, Same<Pick<T, K>, Readonly<Pick<T, K>>>, Shape<T[K]>];',
    // Remap keys before filtering: Exclude<keyof T, ...> would erase numeric
    // literal positions covered by number. Keep length and non-intrinsic members.
    'type ArrayMembers<T extends readonly unknown[]> = { -readonly [K in keyof T as',
    '    K extends number ? number extends K ? never : `${K}`',
    '    : K extends "length" ? K : K extends keyof readonly unknown[] ? never : K]-?: Member<T, K> };',
    // Shape recurses through element/member types and distributes over union arms.
    'type Shape<T> = 0 extends (1 & T) ? ["any"] : T extends readonly unknown[]',
    '  ? ["array", T extends unknown[] ? "mutable" : "readonly", T["length"],',
    '      Shape<T[number]>, ArrayMembers<T>]',
    '  : T extends object ? { -readonly [K in keyof T]-?: Member<T, K> } : T;',
    'type Check<T extends true> = T;',
    // Unprojected assignment remains complementary to recursive member metadata.
    'type Assignable<Expected, Candidate> = [Expected] extends [Candidate] ? true : false;',
    `type ECompatibility = ${compatibility};`,
    `type ESelection = ${selection};`,
    `type EBinding = ${record(binding)};`,
    `type ECapability = ${record(capability)};`,
    `type ERequired = ${required}; type EOptional = ${optional}; type EMany = ${many};`,
    'type ECardinality = Readonly<ERequired> | Readonly<EOptional> | Readonly<EMany>;',
    `type ESlot = ${record({ ...capability, slotId: "string", cardinality: "ECardinality" })};`,
    `type EModuleDeclaration = ${record({ kind: '"get-modular.module-declaration"', schemaVersion: "1",
      moduleId: "string", implementationId: "string", owner: record({ authority: "string", path: "readonly string[]" }),
      provides: "readonly ECapability[]", slots: "readonly ESlot[]" })};`,
    `type ECompositionProfile = ${record(profile)};`,
    `type EPlanBinding = ${record({ ...binding, ...capability })};`,
    `type ECompositionPlan = ${record({ ...profile, kind: '"get-modular.composition-plan"',
      bindings: "readonly EPlanBinding[]", dependencyOrder: "readonly string[]" })};`,
    'type EPlanDigest = `gm-plan:v1:sha-256:${string}`;',
    `type EPath = ${record({ kind: '"field"', value: "string" })} | ${record({ kind: '"index"', value: "number" })};`,
    `type EDiagnostic = ${rows.join(" | ")};`,
    `type EDiagnosticCode = ${literals(codes)};`,
    `type ECompileCompositionResult = ${record({ ok: "true", plan: "ECompositionPlan", digest: "EPlanDigest" })}`
      + ` | ${record({ ok: "false", diagnostics: "readonly EDiagnostic[]" })};`,
    ...TYPES.flatMap(name => [
      `type Test${name} = Check<Same<Shape<P.${name}>, Shape<E${name}>>>;`,
      `type Assign${name} = Check<Assignable<E${name}, P.${name}>>;`,
    ]),
    'type CodeProjection = Check<Same<P.DiagnosticCode, P.Diagnostic["code"]>>;',
    // Select each nested limit discriminant before comparing its shape, so
    // union comparison cannot lose the limit-name/phase association.
    ...Object.values(LIMITS).flat().map(limit => {
      const discriminator = `{ code: "input.limit-exceeded"; details: { limitName: ${quote(limit)} } }`;
      return `type Limit_${limit} = Check<Same<Shape<Extract<P.Diagnostic, ${discriminator}>>,`
        + ` Shape<Extract<EDiagnostic, ${discriminator}>>>>;`;
    }),
    `type EInput = ${record({ declarations: "readonly unknown[]", profile: "unknown" })};`,
    'type Input = Check<Same<Shape<Parameters<typeof P.compileComposition>[0]>, Shape<EInput>>>;',
    'type AssignInput = Check<Assignable<EInput, Parameters<typeof P.compileComposition>[0]>>;',
    'type PromiseResult = Check<Same<ReturnType<typeof P.compileComposition>, Promise<P.CompileCompositionResult>>>;',
    'type AssignPromiseResult = Check<Assignable<Promise<ECompileCompositionResult>, ReturnType<typeof P.compileComposition>>>;',
    ...(surface === "m2" ? [
      // Compare the raw signature without recursively interpreting typed-array
      // methods as wire fields. The checker separately proves carrier identity.
      'type EByteCarrier = Uint8Array;',
      'type EByteList = readonly EByteCarrier[];',
      `type ERawInput = ${record({ declarations: "EByteList", profile: "EByteCarrier" })};`,
      // Independent component verification precedes this comparison. Replace
      // verified field values while preserving wrapper keys and modifiers.
      'type RawFields<T> = { [K in keyof T]: K extends "declarations" ? EByteList : K extends "profile" ? EByteCarrier : T[K] };',
      'type RawArm<T> = T extends unknown ? Same<RawFields<T>, ERawInput> : never;',
      'type RawInput = Check<Same<RawArm<Parameters<typeof P.compileCompositionJson>[0]>, true>>;',
      'type AssignRawInput = Check<Assignable<ERawInput, Parameters<typeof P.compileCompositionJson>[0]>>;',
      'type RawPromiseResult = Check<Same<ReturnType<typeof P.compileCompositionJson>, Promise<P.CompileCompositionResult>>>;',
      'type AssignRawPromiseResult = Check<Assignable<Promise<ECompileCompositionResult>, ReturnType<typeof P.compileCompositionJson>>>;',
    ] : []),
    'type Constraint = Check<Same<Shape<Parameters<typeof P.defineModule>[0]>, Shape<EModuleDeclaration>>>;',
    'type AssignConstraint = Check<Assignable<EModuleDeclaration, Parameters<typeof P.defineModule>[0]>>;',
    'type AssignDefinedResult = Check<Assignable<EModuleDeclaration, ReturnType<typeof P.defineModule>>>;',
    'type RequiredResult = Check<Same<Shape<ReturnType<typeof P.required>>, Shape<ERequired>>>;',
    'type AssignRequiredResult = Check<Assignable<ERequired, ReturnType<typeof P.required>>>;',
    'type OptionalResult = Check<Same<Shape<ReturnType<typeof P.optional>>, Shape<EOptional>>>;',
    'type AssignOptionalResult = Check<Assignable<EOptional, ReturnType<typeof P.optional>>>;',
    'type ManyResult = Check<Same<Shape<ReturnType<typeof P.many>>, Shape<EMany>>>;',
    'type AssignManyResult = Check<Assignable<EMany, ReturnType<typeof P.many>>>;',
    `type EBounds = ${record({ min: "number", max: "number" })};`,
    'type Bounds = Check<Same<Shape<Parameters<typeof P.many>[0]>, Shape<EBounds>>>;',
    'type AssignBounds = Check<Assignable<EBounds, Parameters<typeof P.many>[0]>>;',
    'const emptyProviders: P.CompositionProfile["bindings"][number]["providerImplementationIds"] = [];',
    'const authored = P.defineModule({ kind: "get-modular.module-declaration", schemaVersion: 1,',
    '  moduleId: "qualification/app", implementationId: "qualification/app/default",',
    '  owner: { authority: "qualification", path: ["app"] }, provides: [], slots: [], extra: true });',
    'type Literal = Check<Same<typeof authored.moduleId, "qualification/app">>;',
    'type Extra = Check<Same<typeof authored.extra, true>>;',
    'declare const existing: P.ModuleDeclaration & { readonly marker: "preserved" };',
    'const preserved = P.defineModule(existing);',
    'type ReferenceType = Check<Same<typeof existing, typeof preserved>>;',
    'const r = P.required(); r.kind = "required";',
    'const o = P.optional(); o.kind = "optional";',
    'const m = P.many({ min: 0, max: 0 }); m.min = 2; m.max = 7; m.order = "profile";',
  ].join("\n");
}

// Resolve only actual native declaration kinds that carry a type node. Other
// declaration handles have no type, matching the previous optional property read.
function declarationType(node: ts.Node): ts.TypeNode | undefined {
  if (ts.isVariableOrParameterDeclaration(node) || ts.isPropertySignatureDeclaration(node)
    || ts.isPropertyDeclaration(node) || ts.isFunctionLikeDeclaration(node)
    || ts.isTypeAliasDeclaration(node) || ts.isShorthandPropertyAssignment(node)) return node.type;
  return undefined;
}

function callableSignature(definition: Definition): ts.FunctionDeclaration | ts.FunctionTypeNode {
  const node = definition.node;
  if (ts.isFunctionDeclaration(node)) return node;
  need(ts.isVariableDeclaration(node) && node.type && ts.isFunctionTypeNode(node.type), "callable");
  return node.type;
}

function isInputMap(value: unknown): value is Map<unknown, unknown> { return value instanceof Map; }

async function audit(files: unknown, generation: Generation, surface: Surface) {
  need(isInputMap(files) && files.size <= 512, "input");
  const texts = new Map<string, string>();
  const modules = new Map<string, DeclarationModule>();
  let bytes = 0;
  for (const [path, content] of files) {
    need(typeof path === "string" && Buffer.isBuffer(content), "input");
    need(!path.endsWith(".map"), "source-map");
    if (!path.endsWith(".d.ts")) {
      need(!/\.(?:ts|tsx|mts|cts)$/u.test(path), "declaration-artifact");
      continue; // Physical inventory and JavaScript closure have separate owners.
    }
    need(path === ROOT || /^dist\/features\/authoring\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.d\.ts$/u.test(path), "declaration-owner");
    bytes += content.length;
    need(content.length <= 128 * 1024 && bytes <= 512 * 1024 && modules.size < 64, "declaration-budget");
    need(isUtf8(content), "utf8");
    const text = content.toString("utf8");
    need(!text.includes("\0"), "utf8");
    need(!/sourceMappingURL|sourceURL/u.test(text), "source-map");
    need(!/@ts-(?:ignore|expect-error|nocheck)|\/\/\/\s*<\s*(?:reference|amd-)/iu.test(text), "reference-directive");
    texts.set(`${BASE}/${path}`, text);
    modules.set(path, { path, definitions: new Map(), imports: new Map(), exports: new Map(), edges: new Set() });
  }
  need(modules.has(ROOT), "missing-root");
  if (!libraryTexts) {
    const directory = typeScriptLibraryDirectory();
    // Only these exact standard libraries of the pinned native compiler enter
    // the otherwise closed virtual filesystem.
    libraryTexts = LIB_NAMES.map(name => [name, readFileSync(join(directory, name), "utf8")]);
  }
  for (const [name, text] of libraryTexts) texts.set(`${LIB}/${name}`, text);
  texts.set(`${BASE}/contract.ts`, contractSource(generation, surface));
  return withTypeScriptProject(texts, { strict: true, exactOptionalPropertyTypes: true }, async project => {
  const { program, checker } = project;
  const sources = new Map<string, ts.SourceFile | undefined>();
  for (const name of texts.keys()) sources.set(name, await program.getSourceFile(name));
  need((await program.getSyntacticDiagnostics()).length === 0, "parse");
  for (const [path, module] of modules) module.ast = sources.get(`${BASE}/${path}`);

  function target(specifier: string, from: string) {
    need(typeof specifier === "string" && /^(?:\.\/|\.\.\/)[A-Za-z0-9_./-]+\.js$/u.test(specifier), "module-reference");
    const js = posix.normalize(posix.join(posix.dirname(from), specifier));
    let relative = posix.relative(posix.dirname(from), js);
    if (!relative.startsWith(".")) relative = `./${relative}`;
    need(relative === specifier && js.startsWith("dist/"), "module-reference");
    const declaration = `${js.slice(0, -3)}.d.ts`;
    need(modules.has(declaration), "missing-declaration");
    return declaration;
  }
  const definitionsByStatement = new Map<ts.Node, Definition>();
  function add<Value>(map: Map<string, Value>, name: string, value: Value) {
    need(!map.has(name), "duplicate-symbol");
    map.set(name, value);
  }
  for (const module of modules.values()) {
    const { ast, path } = module;
    need(ast, "parse");
    need(ast.externalModuleIndicator !== undefined, "ambient");
    // Native reference arrays complement the raw reference-directive refusal
    // above, which also rejects no-default-lib before parsing.
    need(!ast.referencedFiles.length && !ast.typeReferenceDirectives.length
      && !ast.libReferenceDirectives.length, "reference-directive");
    await walk(ast, node => {
      need(!ts.isModuleDeclaration(node) && !ts.isNamespaceExportDeclaration(node), "ambient");
      need(!ts.isTypeQueryNode(node) && !(ts.isImportTypeNode(node) && node.isTypeOf), "type-query");
      need(node.kind !== ts.SyntaxKind.AnyKeyword, "any-type");
      need(!ts.isTypeParameterDeclaration(node) || !node.defaultType, "generic-default");
      need(!ts.isComputedPropertyName(node) && !ts.isMethodSignatureDeclaration(node)
        && !ts.isCallSignatureDeclaration(node) && !ts.isConstructSignatureDeclaration(node)
        && !ts.isConstructorTypeNode(node) && !ts.isTypePredicateNode(node), "type-syntax");
      if (ts.isFunctionTypeNode(node)) {
        need(ts.isVariableDeclaration(node.parent) && node.parent.type === node, "nested-callable");
      }
      if (ts.isTypeReferenceNode(node)) identifier(node.typeName);
      if (ts.isExpressionWithTypeArguments(node)) identifier(node.expression);
      if (ts.isImportTypeNode(node)) {
        need(ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)
          && node.qualifier && !node.attributes, "module-reference");
        identifier(node.qualifier);
        module.edges.add(target(node.argument.literal.text, path));
      }
    });
    for (const statement of ast.statements) {
      if (ts.isImportDeclaration(statement)) {
        need(ts.isStringLiteral(statement.moduleSpecifier) && !statement.attributes, "module-reference");
        const clause = statement.importClause;
        need(clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings), "import-profile");
        const dependency = target(statement.moduleSpecifier.text, path);
        module.edges.add(dependency);
        for (const item of clause.namedBindings.elements) add(module.imports, identifier(item.name), {
          module: dependency, name: identifier(item.propertyName ?? item.name), typeOnly: clause.phaseModifier === ts.SyntaxKind.TypeKeyword || item.isTypeOnly,
        });
      } else if (ts.isExportDeclaration(statement)) {
        need(statement.exportClause && ts.isNamedExports(statement.exportClause) && !statement.attributes, "export-profile");
        let dependency;
        if (statement.moduleSpecifier) {
          need(ts.isStringLiteral(statement.moduleSpecifier), "module-reference");
          dependency = target(statement.moduleSpecifier.text, path);
          module.edges.add(dependency);
        }
        for (const item of statement.exportClause.elements) add(module.exports, identifier(item.name), {
          module: dependency, name: identifier(item.propertyName ?? item.name), typeOnly: statement.isTypeOnly || item.isTypeOnly,
        });
      } else {
        let node: DefinitionNode;
        if (ts.isVariableStatement(statement)) {
          need(statement.declarationList.flags & ts.NodeFlags.Const, "callable");
          need(statement.declarationList.declarations.length === 1, "syntax-profile");
          const declaration = statement.declarationList.declarations[0];
          need(declaration, "syntax-profile");
          node = declaration;
          need(!node.initializer && node.type && ts.isFunctionTypeNode(node.type), "callable");
        } else {
          need(ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)
            || ts.isFunctionDeclaration(statement), "syntax-profile");
          node = statement;
        }
        need(!modifiers(statement, ts.SyntaxKind.DefaultKeyword), "export-profile");
        if (ts.isFunctionDeclaration(node)) need(!node.body && node.type && !node.asteriskToken, "callable");
        const name = identifier(node.name);
        const kind = ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) ? "type" : "value";
        const definition: Definition = { module: path, name, node, statement, kind };
        add(module.definitions, name, definition);
        definitionsByStatement.set(statement, definition);
        if (modifiers(statement, ts.SyntaxKind.ExportKeyword)) add(module.exports, name, { name, typeOnly: kind === "type" });
      }
    }
    for (const name of module.imports.keys()) need(!module.definitions.has(name), "duplicate-symbol");
  }
  const reachedModules = new Set<string>();
  const pending = [ROOT];
  while (pending.length) {
    const path = pending.pop(); need(path, "missing-declaration");
    if (reachedModules.has(path)) continue;
    reachedModules.add(path);
    const module = modules.get(path); need(module, "missing-declaration");
    pending.push(...module.edges);
  }
  need(reachedModules.size === modules.size, "unreachable-module");

  function exported(path: string, name: string, active = new Set<string>()): ResolvedExport {
    const key = `${path}:${name}`;
    need(!active.has(key), "alias-cycle");
    active.add(key);
    const module = modules.get(path); need(module, "missing-declaration");
    const edge = module.exports.get(name);
    need(edge, "missing-symbol");
    let result: ResolvedExport;
    if (edge.module) result = exported(edge.module, edge.name, active);
    else if (module.definitions.has(edge.name)) {
      const definition = module.definitions.get(edge.name); need(definition, "missing-symbol");
      result = { definition, typeOnly: false };
    }
    else {
      const imported = module.imports.get(edge.name);
      need(imported, "missing-symbol");
      result = exported(imported.module, imported.name, active);
      result = { ...result, typeOnly: result.typeOnly || imported.typeOnly };
    }
    active.delete(key);
    return { ...result, typeOnly: result.typeOnly || edge.typeOnly };
  }
  const values = surface === "m2" ? [...VALUES, "compileCompositionJson"] : VALUES;
  const expectedNames = [...values, ...TYPES].sort();
  const rootModule = modules.get(ROOT); need(rootModule?.ast, "missing-root");
  need(same([...rootModule.exports.keys()].sort(), expectedNames), "root-exports");
  const roots = expectedNames.map(name => {
    const { definition, typeOnly } = exported(ROOT, name);
    const kind = values.includes(name) ? "value" : "type";
    need(definition.kind === kind && (kind !== "value" || !typeOnly), "export-kind");
    need(definition.name === name && (name === "compileComposition" || name === "compileCompositionJson"
      ? definition.module === ROOT : definition.module.startsWith("dist/features/authoring/")), "export-origin");
    if (kind === "type") need(!ts.isVariableDeclaration(definition.node) && !definition.node.typeParameters?.length, "public-generic");
    return definition;
  });
  for (const definition of roots.filter(item => item.kind === "value")) {
    const signature = callableSignature(definition);
    const name = definition.name;
    const arity = name === "required" || name === "optional" ? 0 : 1;
    need(signature.parameters.length === arity && signature.type, "callable");
    for (const parameter of signature.parameters) need(parameter.type && !parameter.questionToken
      && !parameter.dotDotDotToken && !parameter.initializer && identifier(parameter.name) !== "this", "callable");
    const parameters = signature.typeParameters ?? [];
    if (name === "defineModule") {
      const parameter = parameters[0];
      need(parameters.length === 1 && parameter?.constraint && modifiers(parameter, ts.SyntaxKind.ConstKeyword), "helper-generic");
      const identity = (node: ts.TypeNode | undefined) => node !== undefined && ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)
        && node.typeName.text === parameter.name.text && !node.typeArguments?.length;
      need(identity(signature.parameters[0]?.type) && identity(signature.type), "helper-generic");
    } else need(parameters.length === 0, "callable");
  }
  const rootDefinitions = new Set(roots);
  for (const module of modules.values()) for (const definition of module.definitions.values()) {
    need(definition.kind !== "value" || rootDefinitions.has(definition), "private-callable");
    need(!/^(?:Host|Context|Fiber|Registry|Container|Resolver)|(?:Factory|Adapter|Port|Deps)$/u.test(definition.name), "private-symbol");
    need(definition.kind !== "type" || definition.module !== ROOT, "declaration-owner");
  }

  if (surface === "m2") {
    const contract = sources.get(`${BASE}/contract.ts`); need(contract, "type-contract");
    const carrierDeclaration = contract.statements.filter(ts.isTypeAliasDeclaration).find(node => node.name.text === "EByteCarrier");
    need(carrierDeclaration, "library-type");
    const carrier = await checker.getTypeFromTypeNode(carrierDeclaration.type); need(carrier?.isTypeReference(), "library-type");
    const carrierSymbol = await carrier.getSymbol();
    need(carrierSymbol?.name === "Uint8Array"
      && (await declarationsOf(carrierSymbol))?.every(node =>
        node.getSourceFile() === sources.get(`${LIB}/lib.es5.d.ts`)), "library-type");
    const listDeclaration = contract.statements.filter(ts.isTypeAliasDeclaration).find(node => node.name.text === "EByteList");
    need(listDeclaration, "library-type");
    const readonlyList = await checker.getTypeFromTypeNode(listDeclaration.type); need(readonlyList?.isTypeReference(), "library-type");
    const listSymbol = await readonlyList.getSymbol();
    const carrierArguments = await checker.getTypeArguments(carrier);
    const carrierTarget = await carrier.getTarget();
    // Trusted reference targets fix members and modifiers; exact instantiated
    // arguments fix the carrier contract. Verify every union/intersection leaf
    // before canonicalizing, without comparing intersected method overloads.
    async function* components(type: Type): AsyncGenerator<Type> {
      const pending = [type];
      const seen = new Set<Type>();
      while (pending.length) {
        const component = pending.pop(); need(component, "raw-input");
        if (seen.has(component)) continue;
        seen.add(component);
        if (component.isUnionType() || component.isIntersectionType()) pending.push(...await component.getTypes());
        else yield component;
      }
    }
    async function verifyCarrier(type: Type) {
      for await (const alternative of components(type)) {
        need(alternative.isTypeReference() && await alternative.getSymbol() === carrierSymbol && await alternative.getTarget() === carrierTarget,
          "raw-carrier");
        const arguments_ = await checker.getTypeArguments(alternative);
        need(arguments_.length === carrierArguments.length
          && arguments_.every((argument, index) => argument === carrierArguments[index]), "type-contract");
      }
    }
    const raw = roots.find(item => item.name === "compileCompositionJson");
    need(raw, "raw-input");
    const signature = callableSignature(raw);
    const inputNode = signature.parameters[0]?.type; need(inputNode, "raw-input");
    const input = await checker.getTypeFromTypeNode(inputNode); need(input, "raw-input");
    // Verify every list/carrier component before the contract canonicalizes
    // field values; wrapper keys and modifiers remain in the semantic check.
    for (const arm of input.isUnionType() ? await input.getTypes() : [input]) {
      const declarations = await checker.getPropertyOfType(arm, "declarations");
      const profile = await checker.getPropertyOfType(arm, "profile");
      need(declarations && profile, "raw-input");
      const list = await checker.getTypeOfSymbolAtLocation(declarations, inputNode);
      const profileType = await checker.getTypeOfSymbolAtLocation(profile, inputNode);
      await verifyCarrier(profileType);
      for await (const alternative of components(list)) {
        need(await checker.isArrayType(alternative) && !await checker.isTupleType(alternative), "raw-input");
        need(alternative.isTypeReference() && await alternative.getSymbol() === listSymbol && await alternative.getTarget() === await readonlyList.getTarget(),
          "type-contract");
        const arguments_ = await checker.getTypeArguments(alternative);
        const argument = arguments_[0];
        need(arguments_.length === 1 && argument, "raw-carrier");
        await verifyCarrier(argument);
      }
      // Reject a declaration-list tuple spelled directly or through transparent
      // owned aliases. Carrier aliases and intermediate type computations are
      // governed by the nominal check and exact type contract, not their syntax.
      const emptySubstitutions = new Map<ts.TypeParameterDeclaration, PendingType>();
      const pendingTypes: PendingType[] = (await declarationsOf(declarations) ?? [])
        .map(declarationType)
        .filter((node): node is ts.TypeNode => node !== undefined)
        .map(node => ({ node, substitutions: emptySubstitutions }));
      const seenTypes = new Map<ts.TypeNode, Set<Map<ts.TypeParameterDeclaration, PendingType>>>();
      let visits = 0;
      while (pendingTypes.length) {
        const entry = pendingTypes.pop(); need(entry, "raw-input");
        const { node, substitutions } = entry;
        let seen = seenTypes.get(node);
        if (seen?.has(substitutions)) continue;
        if (!seen) seenTypes.set(node, seen = new Set());
        seen.add(substitutions);
        need(++visits <= 25_000, "syntax-budget");
        need(!ts.isTupleTypeNode(node), "raw-input");
        const enqueue = (child: ts.TypeNode) => pendingTypes.push({ node: child, substitutions });
        if (ts.isParenthesizedTypeNode(node) || ts.isTypeOperatorNode(node)) {
          enqueue(node.type);
        } else if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
          for (const child of node.types) enqueue(child);
        } else if (ts.isTypeReferenceNode(node) || ts.isImportTypeNode(node)) {
          const symbolNode = ts.isTypeReferenceNode(node) ? node.typeName : node.qualifier;
          need(symbolNode, "symbol-reference");
          let symbol = await checker.getSymbolAtLocation(symbolNode);
          if (symbol && symbol.flags & SymbolFlags.Alias) symbol = await checker.getAliasedSymbol(symbol);
          for (const declaration of await declarationsOf(symbol) ?? []) {
            if (ts.isTypeParameterDeclaration(declaration)) {
              const argument = substitutions.get(declaration);
              if (argument) pendingTypes.push(argument);
            } else if (declaration.getSourceFile().fileName.startsWith(`${BASE}/dist/`)
              && ts.isTypeAliasDeclaration(declaration)) {
              // Arguments retain their caller's scope; defaults see earlier
              // parameters. Fresh scopes distinguish visits; the budget bounds recursion.
              const instantiated = new Map<ts.TypeParameterDeclaration, PendingType>();
              for (const [index, parameter] of (declaration.typeParameters ?? []).entries()) {
                const argument = node.typeArguments?.[index];
                if (argument) {
                  instantiated.set(parameter, { node: argument, substitutions });
                } else if (parameter.defaultType) {
                  instantiated.set(parameter, {
                    node: parameter.defaultType, substitutions: new Map(instantiated),
                  });
                }
              }
              pendingTypes.push({
                node: declaration.type,
                substitutions: instantiated.size ? instantiated : emptySubstitutions,
              });
            }
          }
        }
      }
    }
  }
  need(![...await program.getProgramDiagnostics(), ...await program.getSyntacticDiagnostics(),
    ...await program.getBindDiagnostics(), ...await program.getSemanticDiagnostics(), ...await program.getGlobalDiagnostics()].some(item => item.category === DiagnosticCategory.Error), "type-contract");
  const rootSymbol = await checker.getSymbolAtLocation(rootModule.ast);
  need(rootSymbol && same((await checker.getExportsOfModule(rootSymbol)).map(item => item.name).sort(), expectedNames), "root-exports");

  // Follow declaration references, including uninstantiated constraints and
  // conditional branches. Structural equivalence cannot erase symbol provenance.
  const reachedDefinitions = new Set<Definition>();
  const work = [...roots];
  async function reference(symbol: NativeSymbol | undefined) {
    need(symbol, "symbol-reference");
    if (symbol.flags & SymbolFlags.Alias) symbol = await checker.getAliasedSymbol(symbol);
    const declarations = await declarationsOf(symbol);
    need(declarations?.length, "symbol-reference");
    for (const resolved of declarations) {
      let declaration: ts.Node = resolved;
      const file = declaration.getSourceFile().fileName;
      if (file.startsWith(`${LIB}/`)) {
        need(LIB_NAMES.includes(file.slice(LIB.length + 1))
          && (LIB_TYPES.has(symbol.name) || surface === "m2" && symbol.name === "Uint8Array"), "library-type");
        continue;
      }
      need(file.startsWith(`${BASE}/dist/`), "symbol-owner");
      while (declaration.parent && !ts.isSourceFile(declaration.parent)) declaration = declaration.parent;
      const definition = definitionsByStatement.get(declaration);
      need(definition, "symbol-owner");
      work.push(definition);
    }
  }
  while (work.length) {
    const definition = work.pop(); need(definition, "symbol-owner");
    if (reachedDefinitions.has(definition)) continue;
    reachedDefinitions.add(definition);
    await walk(definition.node, async node => {
      if (ts.isTypeReferenceNode(node)) await reference(await checker.getSymbolAtLocation(node.typeName));
      if (ts.isExpressionWithTypeArguments(node)) await reference(await checker.getSymbolAtLocation(node.expression));
      if (ts.isImportTypeNode(node)) {
        need(ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)
          && node.qualifier && ts.isIdentifier(node.qualifier), "module-reference");
        const dependency = target(node.argument.literal.text, definition.module);
        const imported = exported(dependency, node.qualifier.text).definition;
        need(imported.kind === "type", "symbol-owner");
        work.push(imported);
      }
    });
  }
  need(reachedDefinitions.size === definitionsByStatement.size, "unreachable-symbol");
  return { modules: [...reachedModules].sort(),
    rootExports: roots.map(({ name, kind }) => ({ name, kind })) };
  });
}

// Diagnostic generation and public surface are independent explicit selectors.
// Historical callers keep the M1 exports even when selecting generation two.
export async function auditM1DeclarationClosure(files: unknown, generation: number = 1, surface: string = "m1") {
  try {
    need(generation === 1 || generation === 2, "diagnostic-generation");
    need(surface === "m1" || surface === "m2", "public-surface");
    need(surface !== "m2" || generation === 2, "diagnostic-generation");
    return await audit(files, generation, surface);
  }
  catch (error) {
    if (error instanceof InvalidDeclarations) throw error;
    fail("checker-failed");
  }
}
