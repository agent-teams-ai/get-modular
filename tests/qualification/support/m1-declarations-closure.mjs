import { Buffer, isUtf8 } from "node:buffer";
import { readFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import ts from "typescript-minimum";

// Private artifact qualification. The installed, pinned minimum compiler supplies
// its public JavaScript parser/checker API; neither compiler enters Core's pack.
const BASE = "/__gm_m1";
const LIB = "/__gm_m1_lib";
const ROOT = "dist/index.d.ts";
const VALUES = ["compileComposition", "defineModule", "many", "optional", "required"];
const TYPES = ["CompileCompositionResult", "CompositionPlan", "CompositionProfile",
  "Diagnostic", "DiagnosticCode", "ModuleDeclaration", "PlanDigest"];
const LIB_NAMES = ["lib.es5.d.ts", "lib.decorators.d.ts", "lib.decorators.legacy.d.ts"];
const LIB_TYPES = new Set(["Array", "ReadonlyArray", "Promise", "Readonly", "Record",
  "Pick", "Omit", "Exclude", "Extract", "Partial", "Required", "NonNullable",
  "Uppercase", "Lowercase", "Capitalize", "Uncapitalize"]);
let libraryTexts;

class InvalidDeclarations extends Error {
  constructor(reason) {
    super("Invalid M1 declaration closure.");
    this.code = "declarations.invalid";
    this.reason = reason;
  }
}
function fail(reason) { throw new InvalidDeclarations(reason); }
function need(condition, reason) { if (!condition) fail(reason); }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function modifiers(node, kind) { return node.modifiers?.some(item => item.kind === kind) ?? false; }
function identifier(node) {
  need(node && ts.isIdentifier(node), "syntax-profile");
  return node.text;
}
function walk(root, visit) {
  const pending = [[root, 0]];
  let count = 0;
  while (pending.length) {
    const [node, depth] = pending.pop();
    need(++count <= 25_000 && depth <= 96, "syntax-budget");
    visit(node);
    ts.forEachChild(node, child => { pending.push([child, depth + 1]); });
  }
}
function source(name, text) {
  return ts.createSourceFile(name, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
}
function hostFor(sources, resolve) {
  return {
    getSourceFile: name => sources.get(name),
    readFile: name => sources.get(name)?.text,
    fileExists: name => sources.has(name),
    directoryExists: name => [...sources.keys()].some(file => file.startsWith(`${name}/`)),
    getDirectories: () => [],
    getCurrentDirectory: () => BASE,
    getCanonicalFileName: name => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    getDefaultLibFileName: () => `${LIB}/lib.es5.d.ts`,
    realpath: name => name,
    writeFile: () => fail("unexpected-write"),
    resolveModuleNames: (names, containing) => names.map(name => resolve?.(name, containing)),
    resolveTypeReferenceDirectives: names => names.map(() => undefined),
  };
}

// These rows transcribe the effective diagnostic contract's phase, coordinate
// and reason algebra (ADR-0007/0018), not the candidate's declarations/catalog.
const REASONS = [
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
const quote = value => JSON.stringify(value);
const literals = values => values.map(quote).join(" | ");
const record = (fields, readonly = true) => `{ ${Object.entries(fields)
  .map(([key, type]) => `${readonly ? "readonly " : ""}${key}: ${type};`).join(" ")} }`;
const coordinate = names => names ? record(Object.fromEntries(names.split(" ").map(name => [name, "string"])))
  : "{ readonly [key: string]: never }";
function diagnostic(code, phase, names, details) {
  return record({ code: quote(code), phase: quote(phase), path: "readonly EPath[]",
    coordinate: coordinate(names), details });
}

function contractSource() {
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
  const rows = REASONS.map(([code, phase, names, reasons]) =>
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
  const codes = [...REASONS.map(row => row[0]), "input.limit-exceeded", "binding.cardinality",
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

function audit(files) {
  need(files instanceof Map && files.size <= 512, "input");
  const sources = new Map();
  const modules = new Map();
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
    const ast = source(`${BASE}/${path}`, text);
    sources.set(ast.fileName, ast);
    modules.set(path, { path, ast, definitions: new Map(), imports: new Map(), exports: new Map(), edges: new Set() });
  }
  need(modules.has(ROOT), "missing-root");
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, exactOptionalPropertyTypes: true,
    noEmit: true, noLib: true, skipLibCheck: false, types: [] };
  const syntax = ts.createProgram([...sources.keys()], { ...options, noResolve: true }, hostFor(sources));
  need(syntax.getSyntacticDiagnostics().length === 0, "parse");

  function target(specifier, from) {
    need(typeof specifier === "string" && /^(?:\.\/|\.\.\/)[A-Za-z0-9_./-]+\.js$/u.test(specifier), "module-reference");
    const js = posix.normalize(posix.join(posix.dirname(from), specifier));
    let relative = posix.relative(posix.dirname(from), js);
    if (!relative.startsWith(".")) relative = `./${relative}`;
    need(relative === specifier && js.startsWith("dist/"), "module-reference");
    const declaration = `${js.slice(0, -3)}.d.ts`;
    need(modules.has(declaration), "missing-declaration");
    return declaration;
  }
  const definitionsByStatement = new Map();
  function add(map, name, value) {
    need(!map.has(name), "duplicate-symbol");
    map.set(name, value);
  }
  for (const module of modules.values()) {
    const { ast, path } = module;
    need(ts.isExternalModule(ast), "ambient");
    need(!ast.referencedFiles.length && !ast.typeReferenceDirectives.length
      && !ast.libReferenceDirectives.length && !ast.hasNoDefaultLib, "reference-directive");
    walk(ast, node => {
      need(!ts.isModuleDeclaration(node) && !ts.isNamespaceExportDeclaration(node), "ambient");
      need(!ts.isTypeQueryNode(node) && !(ts.isImportTypeNode(node) && node.isTypeOf), "type-query");
      need(node.kind !== ts.SyntaxKind.AnyKeyword, "any-type");
      need(!ts.isTypeParameterDeclaration(node) || !node.default, "generic-default");
      need(!ts.isComputedPropertyName(node) && !ts.isMethodSignature(node)
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
          module: dependency, name: identifier(item.propertyName ?? item.name), typeOnly: clause.isTypeOnly || item.isTypeOnly,
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
        let node = statement;
        if (ts.isVariableStatement(statement)) {
          need(statement.declarationList.flags & ts.NodeFlags.Const, "callable");
          need(statement.declarationList.declarations.length === 1, "syntax-profile");
          node = statement.declarationList.declarations[0];
          need(!node.initializer && node.type && ts.isFunctionTypeNode(node.type), "callable");
        } else need(ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)
          || ts.isFunctionDeclaration(node), "syntax-profile");
        need(!modifiers(statement, ts.SyntaxKind.DefaultKeyword), "export-profile");
        if (ts.isFunctionDeclaration(node)) need(!node.body && node.type && !node.asteriskToken, "callable");
        const name = identifier(node.name);
        const kind = ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) ? "type" : "value";
        const definition = { module: path, name, node, statement, kind };
        add(module.definitions, name, definition);
        definitionsByStatement.set(statement, definition);
        if (modifiers(statement, ts.SyntaxKind.ExportKeyword)) add(module.exports, name, { name, typeOnly: kind === "type" });
      }
    }
    for (const name of module.imports.keys()) need(!module.definitions.has(name), "duplicate-symbol");
  }
  const reachedModules = new Set();
  const pending = [ROOT];
  while (pending.length) {
    const path = pending.pop();
    if (reachedModules.has(path)) continue;
    reachedModules.add(path);
    pending.push(...modules.get(path).edges);
  }
  need(reachedModules.size === modules.size, "unreachable-module");

  function exported(path, name, active = new Set()) {
    const key = `${path}:${name}`;
    need(!active.has(key), "alias-cycle");
    active.add(key);
    const module = modules.get(path);
    const edge = module.exports.get(name);
    need(edge, "missing-symbol");
    let result;
    if (edge.module) result = exported(edge.module, edge.name, active);
    else if (module.definitions.has(edge.name)) result = { definition: module.definitions.get(edge.name), typeOnly: false };
    else {
      const imported = module.imports.get(edge.name);
      need(imported, "missing-symbol");
      result = exported(imported.module, imported.name, active);
      result = { ...result, typeOnly: result.typeOnly || imported.typeOnly };
    }
    active.delete(key);
    return { ...result, typeOnly: result.typeOnly || edge.typeOnly };
  }
  const expectedNames = [...VALUES, ...TYPES].sort();
  need(same([...modules.get(ROOT).exports.keys()].sort(), expectedNames), "root-exports");
  const roots = expectedNames.map(name => {
    const { definition, typeOnly } = exported(ROOT, name);
    const kind = VALUES.includes(name) ? "value" : "type";
    need(definition.kind === kind && (kind !== "value" || !typeOnly), "export-kind");
    need(definition.name === name && (name === "compileComposition"
      ? definition.module === ROOT : definition.module.startsWith("dist/features/authoring/")), "export-origin");
    if (kind === "type") need(!definition.node.typeParameters?.length, "public-generic");
    return definition;
  });
  for (const definition of roots.filter(item => item.kind === "value")) {
    const signature = ts.isFunctionDeclaration(definition.node) ? definition.node : definition.node.type;
    const name = definition.name;
    const arity = name === "required" || name === "optional" ? 0 : 1;
    need(signature.parameters.length === arity && signature.type, "callable");
    for (const parameter of signature.parameters) need(parameter.type && !parameter.questionToken
      && !parameter.dotDotDotToken && !parameter.initializer && identifier(parameter.name) !== "this", "callable");
    const parameters = signature.typeParameters ?? [];
    if (name === "defineModule") {
      need(parameters.length === 1 && parameters[0].constraint && modifiers(parameters[0], ts.SyntaxKind.ConstKeyword), "helper-generic");
      const identity = node => ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)
        && node.typeName.text === parameters[0].name.text && !node.typeArguments?.length;
      need(identity(signature.parameters[0].type) && identity(signature.type), "helper-generic");
    } else need(parameters.length === 0, "callable");
  }
  const rootDefinitions = new Set(roots);
  for (const module of modules.values()) for (const definition of module.definitions.values()) {
    need(definition.kind !== "value" || rootDefinitions.has(definition), "private-callable");
    need(!/^(?:Host|Context|Fiber|Registry|Container|Resolver)|(?:Factory|Adapter|Port|Deps)$/u.test(definition.name), "private-symbol");
    need(definition.kind !== "type" || definition.module !== ROOT, "declaration-owner");
  }

  need(ts.version === "5.8.3", "toolchain");
  if (!libraryTexts) {
    const directory = dirname(ts.getDefaultLibFilePath({ target: ts.ScriptTarget.ES5 }));
    // The only filesystem reads: three explicit standard libraries belonging to
    // this installed compiler. No candidate or dependency resolution uses fs.
    libraryTexts = LIB_NAMES.map(name => [name, readFileSync(join(directory, name), "utf8")]);
  }
  for (const [name, text] of libraryTexts) sources.set(`${LIB}/${name}`, source(`${LIB}/${name}`, text));
  sources.set(`${BASE}/contract.ts`, source(`${BASE}/contract.ts`, contractSource()));
  const host = hostFor(sources, (specifier, containing) => {
    need(containing.startsWith(`${BASE}/`), "module-reference");
    return { resolvedFileName: `${BASE}/${target(specifier, containing.slice(BASE.length + 1))}`,
      extension: ts.Extension.Dts, isExternalLibraryImport: false };
  });
  const program = ts.createProgram([...sources.keys()], options, host);
  need(!ts.getPreEmitDiagnostics(program).some(item => item.category === ts.DiagnosticCategory.Error), "type-contract");
  const checker = program.getTypeChecker();
  const rootSymbol = checker.getSymbolAtLocation(modules.get(ROOT).ast);
  need(rootSymbol && same(checker.getExportsOfModule(rootSymbol).map(item => item.name).sort(), expectedNames), "root-exports");

  // Follow declaration references, including uninstantiated constraints and
  // conditional branches. Structural equivalence cannot erase symbol provenance.
  const reachedDefinitions = new Set();
  const work = [...roots];
  function reference(symbol) {
    need(symbol, "symbol-reference");
    if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    const declarations = symbol.getDeclarations();
    need(declarations?.length, "symbol-reference");
    for (let declaration of declarations) {
      const file = declaration.getSourceFile().fileName;
      if (file.startsWith(`${LIB}/`)) {
        need(LIB_NAMES.includes(file.slice(LIB.length + 1)) && LIB_TYPES.has(symbol.name), "library-type");
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
    const definition = work.pop();
    if (reachedDefinitions.has(definition)) continue;
    reachedDefinitions.add(definition);
    walk(definition.node, node => {
      if (ts.isTypeReferenceNode(node)) reference(checker.getSymbolAtLocation(node.typeName));
      if (ts.isExpressionWithTypeArguments(node)) reference(checker.getSymbolAtLocation(node.expression));
      if (ts.isImportTypeNode(node)) {
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
}

export function auditM1DeclarationClosure(files) {
  try { return audit(files); }
  catch (error) {
    if (error instanceof InvalidDeclarations) throw error;
    fail("checker-failed");
  }
}
