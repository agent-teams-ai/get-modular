import { Buffer, isUtf8 } from 'node:buffer';
import { posix } from 'node:path';
import ts from 'typescript-minimum';

// Private finite artifact profile for the direct M1 archive. The existing,
// pinned development-only TS 5.8.3 parser understands this emitted syntax.
// The compiler host below has no filesystem fallback, libraries or declarations.
// Candidate code is never loaded, evaluated, emitted or extracted.
//
// Evidence: ADR-0012 archive purpose; ADR-0009/0017 M1 values; ADR-0016 and
// the self-composition guide's five factories, literal root and owned libraries.
// This profile permits named ESM bindings, const aliases, ordinary data
// algorithms, the reviewed ReadyQueue class, and the closed operations below.
// Prose and string values are not classified by suspicious substrings.
// New implementation roles, operations or syntax require profile review.
// This is a construction/purpose audit of reviewed source delivered as inert
// bytes, not a sandbox or a proof of compiler algorithm correctness. Independent
// packed behavioral tests, declaration semantics and physical inventory remain
// separate obligations. No repository hashes or candidate manifest allowlists
// determine acceptance here.

const PREFIX = '/__m1_archive__/';
const ENTRY = 'dist/index.js';
const ROOT = 'dist/composition/stage0.js';
const HELPERS = 'dist/features/authoring/helpers.js';
const AUTHORING = 'dist/features/authoring/internal.js';
const DIAGNOSTICS = 'dist/features/diagnostics/internal.js';
const VALUES = ['compileComposition', 'defineModule', 'many', 'optional', 'required'];
const MAX_FILE = 1024 * 1024;
const MAX_TOTAL = 8 * MAX_FILE;
const MAX_NODES = 500_000;
const MAX_DEPTH = 256;
const MAX_STATIC_STEPS = 32_768;
const words = text => new Set(text.split(/\s+/u).filter(Boolean));

// Columns: module, exact exports, other top-level definitions, named local
// functions/arrows. These are role witnesses, not copies of algorithm bodies.
const rows = [
  ['index', 'compileComposition defineModule required optional many', '', ''],
  ['composition/stage0', 'root', '', ''],
  ['features/authoring/internal', 'defineModule required optional many', '', ''],
  ['features/authoring/helpers', 'defineModule required optional many', '', ''],
  ['features/canonicalization/owned-jcs/factory', 'createOwnedJcs', 'invalidValue quote member container canonicalize', ''],
  ['features/compiler-facade/factory', 'createCompilerFacade', '', ''],
  ['features/composition-semantics/binding-record', 'validateBindingRecord', '', 'add'],
  ['features/composition-semantics/declaration-census', 'createDeclarationCensus', 'uniqueIndex', 'add'],
  ['features/composition-semantics/factory', 'createCompositionSemantics', '', ''],
  ['features/composition-semantics/graph-components', 'graphComponents', '', ''],
  ['features/composition-semantics/graph-diagnostics', 'collectGraphFailures', '', ''],
  ['features/composition-semantics/graph-resources', 'semanticResourceLimits collectGraphResourceLimits', 'limits', ''],
  ['features/composition-semantics/profile-census', 'createProfileCensus', '', 'add'],
  ['features/composition-semantics/ready-queue', 'ReadyQueue', '', ''],
  ['features/composition-semantics/selected-bindings', 'validateSelectedBindings', '', 'add'],
  ['features/composition-semantics/selected-graph', 'selectedGraphDepthLimit analyzeSelectedGraph', '', 'vertex'],
  ['features/composition-semantics/semantic-analysis', 'analyzeCompositionSemantics', '', ''],
  ['features/diagnostics/collector', 'createDiagnosticCollector', 'retainedLimit maximumOmitted countCeiling snapshot', 'compare addUnique finish'],
  ['features/diagnostics/internal', 'compareDiagnostics createDiagnosticCollector', '', ''],
  ['features/diagnostics/order', 'compareDiagnostics', 'phases codes coordinateFields lexical', ''],
  ['features/input-admission/document-path', 'documentPath', '', ''],
  ['features/input-admission/document-shape', 'validateDeclarationShape validateProfileShape', 'isWellFormedUtf16 checks', 'fail record literal integer admittedInteger identity array supportedDocumentVersion compatibility cardinality provided slot selection binding'],
  ['features/input-admission/document-snapshot', 'snapshotDeclaration snapshotProfile', 'compatibility cardinality', ''],
  ['features/input-admission/factory', 'createInputAdmission', '', ''],
  ['features/input-admission/identity-format', 'isPortableIdFormat isLocalTokenFormat', 'matchesFormat', ''],
  ['features/input-admission/object-admission', 'admitObjectInput', '', 'add empty scan validate'],
  ['features/input-admission/object-resource-meter', 'createObjectResourceMeter', 'valueLimit stringLimit depthLimit', 'countValues countString scanDocument enter'],
  ['features/input-admission/profile-resource-facts', 'ownValue profileResourceFacts', 'portable', ''],
  ['features/input-admission/resource-diagnostic', 'resourceDiagnostic', 'phases', ''],
  ['features/input-admission/resource-limits', 'admissionLimits', 'limits', ''],
  ['features/input-admission/schema-diagnostic', 'schemaDiagnostic', '', ''],
  ['features/plan-output/factory', 'createPlanOutput', 'snapshotPlan', ''],
];
const roles = new Map(rows.map(([path, exports, locals, functions]) => [
  `dist/${path}.js`, { exports: words(exports), definitions: words(`${exports} ${locals}`), functions: words(functions) },
]));
const declarations = new Set(['dist/index.d.ts', ...['internal', 'helpers', 'wire-types', 'diagnostic-types']
  .map(name => `dist/features/authoring/${name}.d.ts`)]);
const metadata = new Set(['package.json', 'README.md', 'LICENSE']);
const feature = name => `dist/features/${name}/factory.js`;
const factories = [
  [feature('canonicalization/owned-jcs'), 'createOwnedJcs', [], ['canonicalize']],
  [feature('composition-semantics'), 'createCompositionSemantics', ['canonicalizer'], ['newCollector', 'analyze']],
  [feature('input-admission'), 'createInputAdmission', [], ['admitObjectInput']],
  [feature('plan-output'), 'createPlanOutput', ['canonicalizer'], ['emit']],
  [feature('compiler-facade'), 'createCompilerFacade', ['admission', 'semantics', 'output'], ['compileComposition']],
];
const QUEUE = 'dist/features/composition-semantics/ready-queue.js';
const SHAPE = 'dist/features/input-admission/document-shape.js';
const routing = new Set([ENTRY, ROOT, AUTHORING, DIAGNOSTICS]);
const dataExports = new Map([
  ['selectedGraphDepthLimit', null],
  ['semanticResourceLimits', words('graphEdges providersPerManySlot')],
  ['admissionLimits', words('jsonValueOccurrences jsonDepth aggregateStringBytes identifierBytes ownerPathSegments declarations capabilitiesPerDeclaration slotsPerDeclaration totalCapabilities totalSlots roots selections bindings')],
]);

// Member selectors and constructed record keys have a closed data/operation
// vocabulary. Arbitrary string VALUES remain legal, including hostile IDs.
// In particular this does not admit loader, raw-carrier, Host, fixture or
// conformance ports merely because their module is reachable or renamed.
const members = words(`
kind schemaVersion moduleId implementationId profileId owner authority path provides slots
capabilityId compatibility family familyVersion token slotId cardinality min max order
compileComposition admission semantics output canonicalizer canonicalize newCollector analyze admitObjectInput emit
ok plan digest canonicalization hashAlgorithm protocolVersion declarations profile profileResources allDeclarationsAdmitted hasErrors
roots selections bindings consumerImplementationId providerImplementationIds dependencyOrder
code phase coordinate details reason limitName limit actual expectedCardinality actualCardinality providerImplementationId expectedCompatibility actualCompatibility component omitted input.limit-exceeded
retainedCount peakRetained comparisons saturatedFailureCount failureCountSaturated statistics addUnique finish
identityCensusComplete moduleCensusComplete hasModule implementation capability slot uniqueSlots declaration
selectedImplementationIds isSelected resolvedNodes resolvedRoots selectionsUnique selection frontierComplete validBindings binding
selectionCensusComplete providerOccurrences ordinal countedInputEdges edgeLimitExceeded graphEdges providersPerManySlot
members edgeVisits peakFrames vertex next array index keys value values depth cycles residualDepth rootClosure
selectedNodes validEdgeOccurrences adjacencyEdges sccEdgeVisits depthEdgeVisits closureEdgeVisits peakTraversalFrames peakReady readyComparisons
peakSize size items less push take jsonValueOccurrences aggregateStringBytes jsonDepth identifierBytes ownerPathSegments
capabilitiesPerDeclaration slotsPerDeclaration totalCapabilities totalSlots diagnostics diagnosticPathSegments
scanDocument stoppedBy nonPlainValue peakOpenContainers ownKeyVisits arrayIndexCodeUnits descriptors arrayLength indexes enumerable prototype length rule
freeze getOwnPropertyDescriptor getOwnPropertyDescriptors getPrototypeOf hasOwn is isArray ownKeys isFinite isInteger isSafeInteger
MAX_SAFE_INTEGER isWellFormed stringify charCodeAt set get has delete add pop map sort some filter every fill encode join from toString padStart slice floor
schema decode graph
`);
const globalMembers = new Map([
  ['Object', words('freeze getOwnPropertyDescriptor getOwnPropertyDescriptors getPrototypeOf hasOwn is keys prototype')],
  ['Array', words('isArray from prototype')], ['Math', words('min max floor')],
  ['Number', words('isFinite isInteger isSafeInteger MAX_SAFE_INTEGER')],
  ['JSON', words('stringify')], ['Reflect', words('ownKeys')],
]);
const constructors = words('Map Set WeakSet Uint8Array Uint16Array Uint32Array TextEncoder Error TypeError');
const globals = new Set([...globalMembers.keys(), ...constructors, 'String', 'undefined', 'NaN', 'Infinity', 'globalThis']);

class InvalidClosure extends Error {
  constructor(reason) {
    super('Invalid M1 JavaScript closure.');
    this.code = 'm1.javascript-closure.invalid';
    this.reason = reason;
  }
}
function fail(reason) { throw new InvalidClosure(reason); }
function requireThat(condition, reason) { if (!condition) fail(reason); }
function equalNames(actual, expected) {
  return actual.size === expected.size && [...actual].every(name => expected.has(name));
}
function unwrap(node) {
  while (node && ts.isParenthesizedExpression(node)) node = node.expression;
  return node;
}
function outer(node) {
  while (node.parent && ts.isParenthesizedExpression(node.parent)) node = node.parent;
  return node;
}
function pathOf(node) { return node.getSourceFile().fileName.slice(PREFIX.length); }
function modified(node, kind) { return node.modifiers?.some(item => item.kind === kind) ?? false; }
function topVariable(node) { return ts.isVariableDeclaration(node) && ts.isVariableStatement(node.parent.parent) && ts.isSourceFile(node.parent.parent.parent); }
function constant(node) { return ts.isVariableDeclaration(node) && !!(node.parent.flags & ts.NodeFlags.Const); }
function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  if (ts.isPrivateIdentifier(node)) return node.text.replace(/^#/u, '');
  fail('purpose');
}
function properties(node) {
  node = unwrap(node);
  requireThat(node && ts.isObjectLiteralExpression(node), 'construction');
  const result = new Map();
  for (const item of node.properties) {
    requireThat(ts.isPropertyAssignment(item) || ts.isShorthandPropertyAssignment(item) || ts.isMethodDeclaration(item), 'construction');
    const name = propertyName(item.name);
    requireThat(!result.has(name), 'construction');
    result.set(name, item);
  }
  return result;
}
function propertyValue(property) {
  return ts.isShorthandPropertyAssignment(property) ? property.name : property.initializer;
}
function builtinCall(node, owner, method) {
  node = unwrap(node);
  if (!node || !ts.isCallExpression(node) || node.questionDotToken) return false;
  const callee = unwrap(node.expression);
  return ts.isPropertyAccessExpression(callee) && !callee.questionDotToken
    && ts.isIdentifier(callee.expression) && callee.expression.text === owner && callee.name.text === method;
}
function resolveSpecifier(from, text) {
  requireThat(/^(?:\.\/|\.\.\/)[A-Za-z0-9_./-]+\.js$/u.test(text), 'specifier');
  const target = posix.normalize(posix.join(posix.dirname(from), text));
  requireThat(target.startsWith('dist/'), 'specifier');
  const relative = posix.relative(posix.dirname(from), target);
  requireThat(text === (relative.startsWith('.') ? relative : `./${relative}`), 'specifier');
  return target;
}
function visit(tree, callback, budget, tokens = false) {
  const pending = [[tree, 0]];
  while (pending.length) {
    const [node, depth] = pending.pop();
    requireThat(++budget.nodes <= MAX_NODES && depth <= MAX_DEPTH, 'limit');
    callback(node);
    if (tokens) {
      if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) continue;
      for (const child of node.getChildren(tree)) pending.push([child, depth + 1]);
    } else ts.forEachChild(node, child => { pending.push([child, depth + 1]); });
  }
}
function checkComments(source, budget) {
  requireThat(!source.text.startsWith('#!'), 'directive');
  const seen = new Set();
  visit(source, node => {
    const ranges = [...(ts.getLeadingCommentRanges(source.text, node.pos) ?? []),
      ...(ts.getTrailingCommentRanges(source.text, node.end) ?? [])];
    for (const range of ranges) {
      if (seen.has(range.pos)) continue;
      seen.add(range.pos);
      const raw = source.text.slice(range.pos, range.end);
      const body = raw.startsWith('//') ? raw.slice(2) : raw.slice(2, -2);
      // Trim each line once; adjacent greedy whitespace scans over a long
      // comment can otherwise make rejecting/accepting inert padding quadratic.
      for (const line of body.split(/\r\n?|\n/u)) {
        const trimmed = line.trimStart();
        const content = trimmed.startsWith('*') ? trimmed.slice(1).trimStart() : trimmed;
        requireThat(!/^(?:[#@][ \t]*source(?:Mapping)?URL[ \t]*=|\/?[ \t]*<(?:reference|amd-module|amd-dependency)\b|@(?:ts-check|ts-nocheck|ts-ignore|ts-expect-error|import|typedef|type|param|returns?|global|module|namespace)\b|(?:global|globals|eslint-env|jshint)\b)/u.test(content), 'directive');
      }
    }
  }, budget, true);
  requireThat(source.referencedFiles.length === 0 && source.typeReferenceDirectives.length === 0
    && source.libReferenceDirectives.length === 0 && !source.hasNoDefaultLib, 'directive');
}

function audit(files) {
  requireThat(files instanceof Map && files.size <= 512, 'input');
  const modules = new Map();
  const budget = { nodes: 0 };
  let total = 0;
  for (const [path, bytes] of files) {
    requireThat(typeof path === 'string' && Buffer.isBuffer(bytes), 'input');
    requireThat(roles.has(path) || declarations.has(path) || metadata.has(path), 'file-purpose');
    total += bytes.length;
    requireThat(bytes.length <= MAX_FILE && total <= MAX_TOTAL, 'limit');
    requireThat(isUtf8(bytes) && !(bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191), 'utf8');
    if (!roles.has(path)) continue; // Declaration and metadata semantics have other owners.
    let source;
    try { source = ts.createSourceFile(PREFIX + path, bytes.toString('utf8'), ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS); }
    catch { fail('parse'); }
    checkComments(source, budget);
    modules.set(path, { source, role: roles.get(path), exports: new Set(), links: [] });
  }
  requireThat(modules.has(ENTRY), 'entry-missing');
  for (const [path, module] of modules) {
    const addExport = name => {
      requireThat(name !== 'default' && !module.exports.has(name), 'exports');
      module.exports.add(name);
    };
    const link = (literal, elements) => {
      requireThat(literal && ts.isStringLiteral(literal)
        && literal.getText(module.source).slice(1, -1) === literal.text, 'specifier');
      const target = resolveSpecifier(path, literal.text);
      requireThat(modules.has(target), 'module-missing');
      for (const element of elements) {
        requireThat(!element.isTypeOnly && ts.isIdentifier(element.name)
          && (!element.propertyName || ts.isIdentifier(element.propertyName)), 'module-syntax');
        module.links.push({ target, name: (element.propertyName ?? element.name).text });
      }
    };
    for (const statement of module.source.statements) {
      requireThat(!modified(statement, ts.SyntaxKind.DefaultKeyword), 'exports');
      if (ts.isImportDeclaration(statement)) {
        const clause = statement.importClause;
        requireThat(clause && !clause.name && !clause.isTypeOnly && clause.namedBindings
          && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length > 0
          && !statement.attributes && !statement.assertClause, 'module-syntax');
        link(statement.moduleSpecifier, clause.namedBindings.elements);
      } else if (ts.isExportDeclaration(statement)) {
        requireThat(!statement.isTypeOnly && statement.exportClause && ts.isNamedExports(statement.exportClause)
          && !statement.attributes && !statement.assertClause, 'exports');
        for (const element of statement.exportClause.elements) {
          requireThat(!element.isTypeOnly && ts.isIdentifier(element.name)
            && (!element.propertyName || ts.isIdentifier(element.propertyName)), 'exports');
          addExport(element.name.text);
        }
        if (statement.moduleSpecifier) link(statement.moduleSpecifier, statement.exportClause.elements);
      } else if (ts.isExportAssignment(statement)) fail('exports');
      else if (modified(statement, ts.SyntaxKind.ExportKeyword)) {
        if (ts.isVariableStatement(statement)) {
          for (const declaration of statement.declarationList.declarations) {
            requireThat(ts.isIdentifier(declaration.name), 'module-syntax');
            addExport(declaration.name.text);
          }
        } else {
          requireThat((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name, 'module-syntax');
          addExport(statement.name.text);
        }
      }
    }
    requireThat(equalNames(module.exports, module.role.exports), 'exports');
  }
  for (const module of modules.values()) for (const link of module.links) {
    requireThat(modules.get(link.target).exports.has(link.name), 'export-missing');
  }

  // All reads and resolution are restricted to these already parsed JS members.
  const sourceAt = name => modules.get(name.slice(PREFIX.length))?.source;
  const host = {
    getSourceFile: name => sourceAt(name), getDefaultLibFileName: () => '',
    getCurrentDirectory: () => PREFIX, getCanonicalFileName: name => name,
    useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
    fileExists: name => !!sourceAt(name), readFile: name => sourceAt(name)?.text,
    writeFile: () => fail('checker-failed'),
    resolveModuleNames: (names, containing) => names.map(name => {
      const target = resolveSpecifier(containing.slice(PREFIX.length), name);
      return modules.has(target) ? { resolvedFileName: PREFIX + target, extension: ts.Extension.Js, isExternalLibraryImport: false } : undefined;
    }),
  };
  const program = ts.createProgram([...modules.keys()].map(path => PREFIX + path), {
    allowJs: true, checkJs: true, noLib: true, types: [], noEmit: true,
    target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  }, host);
  requireThat(program.getSyntacticDiagnostics().length === 0, 'parse');
  const checker = program.getTypeChecker();
  const symbolAt = node => ts.isShorthandPropertyAssignment(node.parent)
    ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node);
  function declarationOf(symbol) {
    if (!symbol) return undefined;
    if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    return symbol.valueDeclaration ?? symbol.declarations?.[0];
  }
  function origin(node, seen = new Set()) {
    node = unwrap(node);
    if (!node) return { kind: 'unknown' };
    requireThat(seen.size < 128 && !seen.has(node), 'alias-cycle');
    seen.add(node);
    if (ts.isIdentifier(node)) return origin(declarationOf(symbolAt(node)), seen);
    if (ts.isVariableDeclaration(node) && constant(node)) return origin(node.initializer, seen);
    if (ts.isFunctionDeclaration(node)) return { kind: 'function', node };
    if (ts.isClassDeclaration(node)) return { kind: 'class', node };
    if (ts.isCallExpression(node)) return { kind: 'call', node, callee: origin(node.expression, seen) };
    if (ts.isPropertyAccessExpression(node)) return { kind: 'member', node, name: node.name.text, base: origin(node.expression, seen) };
    if (ts.isElementAccessExpression(node) && ts.isStringLiteral(unwrap(node.argumentExpression))) {
      return { kind: 'member', node, name: unwrap(node.argumentExpression).text, base: origin(node.expression, seen) };
    }
    return { kind: 'value', node };
  }
  const exported = (path, name) => {
    const module = modules.get(path);
    requireThat(module, 'module-missing');
    const symbol = checker.getExportsOfModule(checker.getSymbolAtLocation(module.source)).find(item => item.name === name);
    const declaration = declarationOf(symbol);
    requireThat(declaration && modules.has(pathOf(declaration)), 'export-origin');
    return origin(declaration);
  };
  const isFunction = (value, path, name) => value.kind === 'function' && pathOf(value.node) === path && value.node.name?.text === name;
  // AST limits do not bound repeated expansion of const expression graphs.
  // Cache unknown results too; bound visits and concatenated text per audit.
  const staticStrings = new Map(), activeStrings = new Set();
  let staticSteps = 0, staticCharacters = 0;
  function staticString(node, depth = 0) {
    if (!node) return undefined;
    requireThat(++staticSteps <= MAX_STATIC_STEPS, 'limit');
    node = unwrap(node);
    if (staticStrings.has(node)) return staticStrings.get(node);
    requireThat(!activeStrings.has(node), 'alias-cycle');
    requireThat(depth <= 64, 'limit');
    activeStrings.add(node);
    let value;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) value = node.text;
    else if (ts.isIdentifier(node)) {
      const declaration = declarationOf(symbolAt(node));
      if (declaration && constant(declaration)) value = staticString(declaration.initializer, depth + 1);
    } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = staticString(node.left, depth + 1), right = staticString(node.right, depth + 1);
      if (left !== undefined && right !== undefined) {
        const length = left.length + right.length;
        requireThat(length <= MAX_FILE, 'limit');
        staticCharacters += length;
        requireThat(staticCharacters <= MAX_TOTAL, 'limit');
        value = left + right;
      }
    }
    activeStrings.delete(node);
    staticStrings.set(node, value);
    return value;
  }
  function checkMember(name) {
    requireThat(members.has(name) || /^(?:decode|schema|identity|declaration|profile|binding|graph|diagnostics)\.[a-z-]+$/u.test(name), 'purpose');
  }
  function inert(node) {
    node = unwrap(node);
    if (!node) return false;
    if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)
      || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(node.kind)) return true;
    if (ts.isPropertyAccessExpression(node)) return inert(node.expression);
    if (ts.isArrayLiteralExpression(node)) return node.elements.every(item => !ts.isSpreadElement(item) && inert(item));
    if (ts.isObjectLiteralExpression(node)) return node.properties.every(item =>
      ts.isShorthandPropertyAssignment(item) || ts.isPropertyAssignment(item) && inert(item.initializer));
    if (ts.isPrefixUnaryExpression(node)) return inert(node.operand);
    if (ts.isBinaryExpression(node)) return [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken,
      ts.SyntaxKind.SlashToken, ts.SyntaxKind.PercentToken, ts.SyntaxKind.AsteriskAsteriskToken].includes(node.operatorToken.kind)
      && inert(node.left) && inert(node.right);
    return builtinCall(node, 'Object', 'freeze') && node.arguments.length === 1 && inert(node.arguments[0]);
  }
  function nearestFunction(node) {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (ts.isFunctionDeclaration(parent) || ts.isArrowFunction(parent) || ts.isMethodDeclaration(parent)
        || ts.isGetAccessorDeclaration(parent) || ts.isSetAccessorDeclaration(parent)) return parent;
    }
    return undefined;
  }
  function bindingName(node) {
    const parent = node.parent;
    return parent.name === node && (ts.isVariableDeclaration(parent) || ts.isParameter(parent)
      || ts.isBindingElement(parent) || ts.isFunctionDeclaration(parent) || ts.isClassDeclaration(parent) || ts.isImportSpecifier(parent));
  }
  function nonReference(node) {
    const parent = node.parent;
    return bindingName(node) || ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)
      || ts.isPropertyAccessExpression(parent) && parent.name === node
      || (ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)
        || ts.isGetAccessorDeclaration(parent) || ts.isSetAccessorDeclaration(parent)) && parent.name === node
      || ts.isBindingElement(parent) && parent.propertyName === node;
  }
  function checkGlobal(node) {
    const name = node.text, reference = outer(node), parent = reference.parent;
    if (['undefined', 'NaN', 'Infinity'].includes(name)) return;
    if (name === 'globalThis') {
      let expression = reference;
      const parts = [];
      while (expression.parent && (ts.isPropertyAccessExpression(expression.parent) || ts.isElementAccessExpression(expression.parent))
        && expression.parent.expression === expression) {
        expression = expression.parent;
        parts.push(ts.isPropertyAccessExpression(expression) ? expression.name.text : staticString(expression.argumentExpression));
        requireThat(!expression.questionDotToken, 'global');
      }
      const call = expression.parent;
      requireThat(pathOf(node) === feature('plan-output') && parts.join('.') === 'crypto.subtle.digest'
        && ts.isCallExpression(call) && call.expression === expression && call.arguments.length === 2
        && staticString(call.arguments[0]) === 'SHA-256' && nearestFunction(node)?.name?.text === 'emit', 'global');
      return;
    }
    if (constructors.has(name)) {
      requireThat(ts.isNewExpression(parent) && unwrap(parent.expression) === node, 'global');
      requireThat(name !== 'TextEncoder' || pathOf(node) === feature('canonicalization/owned-jcs'), 'global');
      return;
    }
    if ((name === 'String' || name === 'Number') && ts.isCallExpression(parent) && parent.expression === reference) {
      requireThat(parent.arguments.length === 1, 'global');
      return;
    }
    requireThat((ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === reference, 'global');
    const member = ts.isPropertyAccessExpression(parent) ? parent.name.text : staticString(parent.argumentExpression);
    requireThat(globalMembers.get(name)?.has(member) && !parent.questionDotToken, 'global');
    if (member === 'prototype' || member === 'MAX_SAFE_INTEGER') {
      requireThat(!ts.isPropertyAccessExpression(parent.parent) && !ts.isElementAccessExpression(parent.parent), 'global');
    } else {
      const use = outer(parent).parent;
      requireThat(ts.isCallExpression(use) && use.expression === outer(parent), 'global');
    }
    requireThat(name !== 'JSON' || pathOf(node) === feature('canonicalization/owned-jcs'), 'global');
  }

  for (const [path, module] of modules) {
    const { source, role } = module;
    for (const statement of source.statements) {
      if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) continue;
      if (ts.isFunctionDeclaration(statement)) {
        requireThat(statement.name && role.definitions.has(statement.name.text) && !routing.has(path), 'purpose');
      } else if (ts.isClassDeclaration(statement)) requireThat(path === QUEUE && statement.name?.text === 'ReadyQueue', 'purpose');
      else if (ts.isVariableStatement(statement)) {
        requireThat(!!(statement.declarationList.flags & ts.NodeFlags.Const), 'top-level');
        for (const declaration of statement.declarationList.declarations) {
          requireThat(ts.isIdentifier(declaration.name) && declaration.initializer, 'top-level');
          requireThat(routing.has(path) || role.definitions.has(declaration.name.text) || ts.isIdentifier(unwrap(declaration.initializer)), 'purpose');
          if (path !== ROOT && path !== ENTRY) requireThat(inert(declaration.initializer), 'top-level');
        }
      } else requireThat(ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)
        && statement.expression.text === 'use strict', 'top-level');
    }
    visit(source, node => {
      requireThat(!ts.isImportEqualsDeclaration(node) && !ts.isModuleDeclaration(node) && !ts.isWithStatement(node)
        && !ts.isMetaProperty(node) && !ts.isTaggedTemplateExpression(node) && !ts.isFunctionExpression(node)
        && !ts.isLabeledStatement(node) && !ts.isDebuggerStatement(node) && !ts.isYieldExpression(node)
        && !ts.isConstructorDeclaration(node) && !ts.isClassStaticBlockDeclaration(node)
        && !modified(node, ts.SyntaxKind.StaticKeyword) && !modified(node, ts.SyntaxKind.DeclareKeyword), 'syntax-profile');
      if (ts.isClassDeclaration(node)) {
        requireThat(path === QUEUE && node.parent === source && !node.heritageClauses, 'purpose');
        requireThat(equalNames(new Set(node.members.map(item => propertyName(item.name))), words('items comparisons peakSize size less push take'))
          && node.members.length === 7, 'purpose');
        for (const item of node.members) if (ts.isPropertyDeclaration(item)) requireThat(inert(item.initializer), 'purpose');
      }
      if (ts.isClassExpression(node) || ts.isSetAccessorDeclaration(node)) fail('syntax-profile');
      if (ts.isFunctionDeclaration(node)) requireThat(node.body && node.name
        && (node.parent === source ? role.definitions : role.functions).has(node.name.text), 'purpose');
      if (ts.isArrowFunction(node)) {
        const parent = outer(node).parent;
        if (ts.isVariableDeclaration(parent)) requireThat(ts.isIdentifier(parent.name)
          && role.functions.has(parent.name.text), 'purpose');
      }
      if (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node)) {
        const allowed = path === QUEUE ? words('size less push take') : path === SHAPE ? words('declaration profile')
          : path === feature('compiler-facade') ? words('compileComposition')
            : path === feature('plan-output') ? words('emit') : path === feature('composition-semantics') ? words('newCollector') : new Set();
        requireThat(node.body && allowed.has(propertyName(node.name)), 'purpose');
        requireThat(!ts.isGetAccessorDeclaration(node) || path === QUEUE && node.name.text === 'size', 'purpose');
      }
      if (node.asteriskToken) fail('syntax-profile');
      if (modified(node, ts.SyntaxKind.AsyncKeyword)) requireThat(ts.isMethodDeclaration(node)
        && (path === feature('compiler-facade') && node.name.text === 'compileComposition'
          || path === feature('plan-output') && node.name.text === 'emit'), 'syntax-profile');
      if (ts.isAwaitExpression(node)) requireThat(modified(nearestFunction(node) ?? {}, ts.SyntaxKind.AsyncKeyword), 'syntax-profile');
      if (ts.isForOfStatement(node)) requireThat(!node.awaitModifier, 'syntax-profile');
      if (node.kind === ts.SyntaxKind.ThisKeyword) requireThat(path === QUEUE && nearestFunction(node), 'purpose');
      if (node.kind === ts.SyntaxKind.SuperKeyword) fail('syntax-profile');
      if (ts.isReturnStatement(node)) requireThat(nearestFunction(node), 'parse');
      if (ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression)) requireThat(node.expression.text === 'use strict', 'directive');
      if (ts.isPropertyAccessExpression(node)) {
        // The sole ambient chain is checked in full at its globalThis identifier.
        if (!['crypto', 'subtle', 'digest'].includes(node.name.text)) checkMember(propertyName(node.name));
      }
      if (ts.isElementAccessExpression(node)) {
        const name = staticString(node.argumentExpression);
        if (name !== undefined) checkMember(name);
      }
      if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent) && !node.dotDotDotToken) {
        const selector = node.propertyName ?? node.name;
        const name = ts.isComputedPropertyName(selector) ? staticString(selector.expression) : propertyName(selector);
        requireThat(name !== undefined, 'purpose');
        checkMember(name);
      }
      if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node) || ts.isPropertyDeclaration(node)
        || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node)) checkMember(propertyName(node.name));
      if (ts.isIdentifier(node)) {
        if (bindingName(node)) {
          requireThat(!globals.has(node.text) && node.text !== 'eval' && node.text !== 'arguments', 'binding');
          requireThat((checker.getSymbolAtLocation(node)?.declarations?.length ?? 0) === 1, 'binding');
        } else if (!nonReference(node)) {
          const declaration = declarationOf(symbolAt(node));
          if (declaration) requireThat(modules.has(pathOf(declaration)), 'global');
          else { requireThat(globals.has(node.text), 'global'); checkGlobal(node); }
        }
      }
      if (ts.isNewExpression(node)) {
        const callee = unwrap(node.expression), resolved = origin(callee);
        requireThat(ts.isIdentifier(callee) && constructors.has(callee.text) && !declarationOf(symbolAt(callee))
          || resolved.kind === 'class' && pathOf(resolved.node) === QUEUE && resolved.node.name.text === 'ReadyQueue', 'construction');
      }
      if (ts.isCallExpression(node)) {
        const callee = unwrap(node.expression);
        requireThat(callee.kind !== ts.SyntaxKind.ImportKeyword, 'code-loading');
        if (ts.isElementAccessExpression(callee)) {
          // The existing schema validator dispatches its closed literal field
          // validators through record's third parameter. No general computed
          // method/callback dispatcher is admitted by this profile.
          const declaration = ts.isIdentifier(callee.expression) ? declarationOf(symbolAt(callee.expression)) : undefined;
          requireThat(path === SHAPE && declaration && ts.isParameter(declaration)
            && ts.isFunctionDeclaration(declaration.parent) && declaration.parent.name?.text === 'record'
            && declaration.parent.parameters[2] === declaration, 'computed-call');
        }
        const resolved = origin(callee);
        if (factories.some(([owner, name]) => isFunction(resolved, owner, name))) {
          const use = outer(node).parent;
          requireThat(path === ROOT && topVariable(use) && unwrap(use.initializer) === node, 'construction');
        }
      }
    }, budget);
  }

  // Every exported implementation has its role's own definition. Curated
  // libraries may forward only the corresponding original function, through
  // named import/reexport/const aliases. Reachability alone grants no purpose.
  for (const [path, module] of modules) for (const name of module.exports) {
    if (path === ENTRY || path === ROOT) continue;
    const value = exported(path, name);
    if (dataExports.has(name)) {
      const keys = dataExports.get(name);
      if (keys === null) requireThat(value.kind === 'value' && ts.isNumericLiteral(value.node) && pathOf(value.node) === path, 'export-origin');
      else {
        requireThat(value.kind === 'call' && pathOf(value.node) === path && builtinCall(value.node, 'Object', 'freeze')
          && value.node.arguments.length === 1, 'export-origin');
        const record = origin(value.node.arguments[0]);
        requireThat(record.kind === 'value' && ts.isObjectLiteralExpression(record.node), 'export-origin');
        const props = properties(record.node);
        requireThat(equalNames(new Set(props.keys()), keys) && [...props.values()].every(item =>
          ts.isPropertyAssignment(item) && ts.isNumericLiteral(unwrap(item.initializer))), 'purpose');
      }
    } else if (name === 'ReadyQueue') requireThat(value.kind === 'class' && pathOf(value.node) === QUEUE, 'export-origin');
    else {
      const owner = path === AUTHORING ? HELPERS : path === DIAGNOSTICS
        ? `dist/features/diagnostics/${name === 'compareDiagnostics' ? 'order' : 'collector'}.js` : path;
      requireThat(isFunction(value, owner, name), 'export-origin');
    }
  }
  for (const name of ['defineModule', 'required', 'optional', 'many']) {
    const value = exported(ENTRY, name);
    requireThat(isFunction(value, HELPERS, name), 'public-origin');
    const fn = value.node, count = name === 'required' || name === 'optional' ? 0 : 1;
    requireThat(fn.parameters.length === count && fn.parameters.every(parameter => ts.isIdentifier(parameter.name)
      && !parameter.initializer && !parameter.dotDotDotToken) && fn.body.statements.length === 1
      && ts.isReturnStatement(fn.body.statements[0]), 'helper-contract');
    const result = unwrap(fn.body.statements[0].expression);
    if (name === 'defineModule') requireThat(ts.isIdentifier(result) && declarationOf(symbolAt(result)) === fn.parameters[0], 'helper-contract');
    else {
      requireThat(result && ts.isObjectLiteralExpression(result), 'helper-contract');
      const props = properties(result), expected = name === 'many' ? ['kind', 'min', 'max', 'order'] : ['kind'];
      requireThat(equalNames(new Set(props.keys()), new Set(expected)) && [...props.values()].every(ts.isPropertyAssignment), 'helper-contract');
      requireThat(staticString(props.get('kind').initializer) === name, 'helper-contract');
      if (name === 'many') {
        requireThat(staticString(props.get('order').initializer) === 'profile'
          && result.properties.indexOf(props.get('min')) < result.properties.indexOf(props.get('max')), 'helper-contract');
        for (const key of ['min', 'max']) {
          const read = unwrap(props.get(key).initializer);
          requireThat(ts.isPropertyAccessExpression(read) && !read.questionDotToken && read.name.text === key
            && ts.isIdentifier(read.expression) && declarationOf(symbolAt(read.expression)) === fn.parameters[0], 'helper-contract');
        }
      }
    }
  }

  for (const [path, name, slots, ports] of factories) {
    const value = exported(path, name);
    requireThat(isFunction(value, path, name), 'construction');
    const fn = value.node, parameter = fn.parameters[0];
    requireThat(fn.parameters.length === 1 && !parameter.initializer && !parameter.dotDotDotToken, 'construction');
    if (slots.length) {
      requireThat(ts.isObjectBindingPattern(parameter.name) && parameter.name.elements.length === slots.length, 'construction');
      const keys = parameter.name.elements.map(item => {
        requireThat(ts.isIdentifier(item.name) && !item.initializer && !item.dotDotDotToken, 'construction');
        return propertyName(item.propertyName ?? item.name);
      });
      requireThat(equalNames(new Set(keys), new Set(slots)), 'construction');
    } else requireThat(ts.isIdentifier(parameter.name), 'construction');
    requireThat(fn.body.statements.length === 1 && ts.isReturnStatement(fn.body.statements[0]), 'construction');
    const result = unwrap(fn.body.statements[0].expression);
    requireThat(builtinCall(result, 'Object', 'freeze') && result.arguments.length === 1, 'construction');
    const props = properties(result.arguments[0]);
    requireThat(equalNames(new Set(props.keys()), new Set(ports)), 'construction');
    for (const [key, property] of props) {
      if (['compileComposition', 'emit', 'newCollector'].includes(key)) {
        requireThat(ts.isMethodDeclaration(property)
          && modified(property, ts.SyntaxKind.AsyncKeyword) === (key !== 'newCollector'), 'construction');
      } else {
        const owner = key === 'canonicalize' ? path : key === 'analyze'
          ? 'dist/features/composition-semantics/semantic-analysis.js' : 'dist/features/input-admission/object-admission.js';
        const targetName = key === 'analyze' ? 'analyzeCompositionSemantics' : key;
        requireThat(isFunction(origin(propertyValue(property)), owner, targetName), 'construction');
      }
    }
  }
  const rootModule = modules.get(ROOT);
  requireThat(rootModule && rootModule.links.length === factories.length, 'construction');
  const imported = new Set(rootModule.links.map(link => `${link.target}:${link.name}`));
  requireThat(equalNames(imported, new Set(factories.map(([path, name]) => `${path}:${name}`))), 'construction');
  const built = [];
  for (const statement of rootModule.source.statements) if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      const call = unwrap(declaration.initializer);
      if (!ts.isCallExpression(call)) {
        requireThat(ts.isIdentifier(call), 'construction');
        const alias = origin(call);
        requireThat(alias.kind === 'call' && built.includes(alias.node), 'construction');
        continue;
      }
      const expected = factories[built.length];
      requireThat(expected && isFunction(origin(call.expression), expected[0], expected[1]) && call.arguments.length === 1, 'construction');
      const props = properties(call.arguments[0]);
      requireThat(equalNames(new Set(props.keys()), new Set(expected[2])), 'construction');
      for (const [key, property] of props) {
        requireThat(!ts.isMethodDeclaration(property), 'construction');
        const provider = origin(propertyValue(property));
        const index = key === 'canonicalizer' ? 0 : key === 'admission' ? 2 : key === 'semantics' ? 1 : 3;
        requireThat(provider.kind === 'call' && provider.node === built[index], 'construction');
      }
      built.push(call);
    }
  }
  requireThat(built.length === factories.length && exported(ROOT, 'root').node === built[4], 'construction');
  const compiler = exported(ENTRY, 'compileComposition');
  requireThat(compiler.kind === 'member' && compiler.name === 'compileComposition'
    && compiler.base.kind === 'call' && compiler.base.node === built[4], 'public-origin');
  for (const statement of modules.get(ENTRY).source.statements) if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      const value = origin(declaration);
      requireThat(value.kind === 'member' && value.node === compiler.node || value.kind === 'call' && value.node === built[4]
        || ['defineModule', 'required', 'optional', 'many'].some(name => isFunction(value, HELPERS, name)), 'public-origin');
    }
  }
  const reached = new Set(), pending = [ENTRY];
  while (pending.length) {
    const path = pending.pop();
    if (reached.has(path)) continue;
    reached.add(path);
    for (const link of modules.get(path).links) pending.push(link.target);
  }
  requireThat(reached.size === modules.size, 'orphan');
  return { modules: [...reached].sort(), exports: [...VALUES] };
}

export function auditM1JavaScriptClosure(files) {
  try { return audit(files); }
  catch (error) {
    if (error instanceof InvalidClosure) throw error;
    fail('checker-failed');
  }
}
