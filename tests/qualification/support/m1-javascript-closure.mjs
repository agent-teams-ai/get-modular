import { Buffer, isUtf8 } from 'node:buffer';
import { posix } from 'node:path';
import ts from 'typescript-minimum';

// Private finite artifact profile for the direct M1 archive. The existing,
// pinned development-only TS 5.8.3 parser understands this emitted syntax.
// The compiler host below has no filesystem fallback, libraries or declarations.
// Candidate code is never loaded, evaluated, emitted or extracted.
//
// Evidence: ADR-0012 archive purpose; ADR-0009/0017's five public values;
// ADR-0016's literal construction and ADR-0021's internal raw-admission closure.
// The reviewed source constructs six factories, including the required scanner.
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
const M2_VALUES = ['compileComposition', 'compileCompositionJson', 'defineModule', 'many', 'optional', 'required'];
const FACADE = 'dist/features/compiler-facade/factory.js';
const profiles = new Set(['m1', 'm1-shared', 'm2']);
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
  ['features/composition-semantics/binding-record', 'validateBindingRecord validateBindingRecords', '', 'add'],
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
  ['features/input-admission/byte-carrier', 'classifyByteCarrier copyByteCarrier', 'capturedApply CapturedUint8Array typedArrayPrototype brandOf bufferOf lengthOf sharedProbe usableProbe captureGetter', ''],
  ['features/input-admission/document-path', 'documentPath', '', ''],
  ['features/input-admission/document-reader', 'objectDocument', 'objectKind objectOwn objectKeys objectLength objectItem objectText objectInteger objectReader', ''],
  ['features/input-admission/document-shape', 'schemaSafeLocalPath validateDeclarationShape validateProfileShape validateDeclarationView validateProfileView', 'record literal integer identity array portable local compatibility cardinality provided slot selection binding declarationShape profileShape isWellFormedUtf16 checks', 'fail checkRecord admittedInteger numericValue check supportedDocumentVersion'],
  ['features/input-admission/document-snapshot', 'snapshotDeclaration snapshotProfile snapshotDeclarationView snapshotProfileView', 'record projection', 'member text integer list compatibility cardinality'],
  ['features/input-admission/factory', 'createInputAdmission', '', ''],
  ['features/input-admission/identity-format', 'isPortableIdFormat isLocalTokenFormat', 'matchesFormat', ''],
  ['features/input-admission/invocation-wrapper', 'inspectInvocation', 'getOwnDescriptor hasOwn isArray getPrototypeOf arrayPrototype isInteger defineProperty freeze ownData invalidWrapper', ''],
  ['features/input-admission/object-admission', 'admitObjectInput', '', 'add empty scan validate'],
  ['features/input-admission/object-resource-meter', 'createObjectResourceMeter', 'valueLimit stringLimit depthLimit', 'countValues countString scanDocument nonPlain enter'],
  ['features/input-admission/profile-resource-facts', 'ownValue profileResourceFacts profileResourceFactsView', 'portable', 'ownMember textMember'],
  ['features/input-admission/raw-admission', 'admitRawInput', '', 'add empty scan arrayLength validate hasVersionOne'],
  ['features/input-admission/raw-byte-input', 'captureRawInput', 'appendOwn defineProperty', 'add empty'],
  ['features/input-admission/raw-document', 'scanRawDocument rawDocumentView', 'lexicalKind duplicatePath invalidAccess valueEnd', 'chargeString spanOf open capture recordOf arrayOf item text'],
  ['features/input-admission/raw-duplicate-replay', 'visitRawDuplicatePaths', 'invalidReplay isContainer isValue newGroup', 'admits retainSpan open releaseCursor read capture fold collectRecord visit'],
  ['features/input-admission/raw-numeric-admission', 'numericFailureMask visitRawNumericFailures', 'localPathCapacity union integerMask stoppedMask ownerMask', 'child emitMask visitChild visitOwner'],
  ['features/input-admission/raw-integer', 'admitRawInteger', 'maximumSafeIntegerDigits', ''],
  ['features/input-admission/resource-diagnostic', 'resourceDiagnostic', 'phases', ''],
  ['features/input-admission/resource-limits', 'admissionLimits', 'limits', ''],
  ['features/input-admission/schema-diagnostic', 'schemaDiagnostic', '', ''],
  ['features/plan-output/factory', 'createPlanOutput', 'snapshotPlan', ''],
  ['features/raw-scanner/owned-iterative/factory', 'createOwnedRawScanner', '', ''],
  ['features/raw-scanner/owned-iterative/scanner', 'openOwnedRawTokenCursor', 'fromCharCode invalidToken isWhitespace isDigit isBoundary scalarBytes isContinuation readScalar hexDigit readHexUnit escapedUnit scanString scanNumber scanKeyword', 'next decodeString'],
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
  [feature('plan-output'), 'createPlanOutput', ['canonicalizer'], ['emit']],
  [feature('raw-scanner/owned-iterative'), 'createOwnedRawScanner', [], ['open']],
  [feature('input-admission'), 'createInputAdmission', ['scanner'], ['admitObjectInput', 'admitRawInput']],
  [feature('compiler-facade'), 'createCompilerFacade', ['admission', 'semantics', 'output'], ['compileComposition']],
];
const QUEUE = 'dist/features/composition-semantics/ready-queue.js';
const SHAPE = 'dist/features/input-admission/document-shape.js';
const SNAPSHOT = 'dist/features/input-admission/document-snapshot.js';
const WRAPPER = 'dist/features/input-admission/invocation-wrapper.js';
const BYTE_CARRIER = 'dist/features/input-admission/byte-carrier.js';
const RAW_ADMISSION = 'dist/features/input-admission/raw-admission.js';
const RAW_BYTES = 'dist/features/input-admission/raw-byte-input.js';
const RAW_DOCUMENT = 'dist/features/input-admission/raw-document.js';
const SCANNER = 'dist/features/raw-scanner/owned-iterative/scanner.js';
const routing = new Set([ENTRY, ROOT, AUTHORING, DIAGNOSTICS]);
// New selectors belong only to their reviewed implementation roles. In
// particular, schema metadata such as expected is not general fixture data.
const scopedMembers = new Map([
  [ROOT, words('scanner')],
  [SHAPE, words('type fields expected matchesFormat variants many required optional')],
  [SNAPSHOT, words('create defineProperty')],
  [WRAPPER, words('defineProperty configurable writable')],
  [BYTE_CARRIER, words('apply at toStringTag visibleLength')],
  [feature('input-admission'), words('scanner admitRawInput')],
  ['dist/features/input-admission/object-resource-meter.js', words('segment')],
  [RAW_ADMISSION, words('blocked allDeclarationsCaptured valuesRemaining stringBytesRemaining valueOccurrences stringBytes invalidJson decoded duplicateKey')],
  [RAW_BYTES, words('blocked allDeclarationsCaptured visibleLength declarationRawDocumentBytes profileRawDocumentBytes aggregateRawBytes defineProperty __proto__ configurable writable')],
  ['dist/features/input-admission/resource-limits.js', words('declarationRawDocumentBytes profileRawDocumentBytes aggregateRawBytes')],
  ['dist/features/input-admission/resource-diagnostic.js', words('declarationRawDocumentBytes profileRawDocumentBytes aggregateRawBytes')],
  ['dist/features/input-admission/raw-duplicate-replay.js', words('start end spans duplicate source base current cursor keys keyExpected tokenVisits arrayCursorSteps peakLiveSpans peakLiveCursors peakGroupDepth open subarray decodeString')],
  ['dist/features/input-admission/raw-numeric-admission.js', words('next')],
  [RAW_DOCUMENT, words('open subarray start end decodedUtf8Bytes segment state key nextIndex cursor last decodeString valuesRemaining stringBytesRemaining valueOccurrences stringBytes maximumDepth invalidJson duplicateKey decoded')],
  [feature('raw-scanner/owned-iterative'), words('open')],
  [SCANNER, words('fromCharCode start end decodedUtf8Bytes wellFormedUtf16 decodeString')],
]);
const intrinsicSelectors = words('create defineProperty apply at toStringTag fromCharCode');
const dataExports = new Map([
  ['selectedGraphDepthLimit', null],
  ['semanticResourceLimits', words('graphEdges providersPerManySlot')],
  ['admissionLimits', words('declarationRawDocumentBytes profileRawDocumentBytes aggregateRawBytes jsonValueOccurrences jsonDepth aggregateStringBytes identifierBytes ownerPathSegments declarations capabilitiesPerDeclaration slotsPerDeclaration totalCapabilities totalSlots roots selections bindings')],
]);

// Member selectors and constructed record keys have a closed data/operation
// vocabulary. Arbitrary string VALUES remain legal, including hostile IDs.
// Reachability or renaming admits no additional loader, carrier, Host, fixture
// or conformance operations; internal raw roles have explicit scopes above.
const members = words(`
kind schemaVersion moduleId implementationId profileId owner authority path provides slots
capabilityId compatibility family familyVersion token slotId cardinality min max order
compileComposition admission semantics output canonicalizer canonicalize newCollector analyze admitObjectInput emit
ok plan digest canonicalization hashAlgorithm protocolVersion declarations profile profileResources allDeclarationsAdmitted hasErrors
roots selections bindings consumerImplementationId providerImplementationIds dependencyOrder
code phase coordinate details reason limitName limit actual expectedCardinality actualCardinality providerImplementationId expectedCompatibility actualCompatibility component omitted input.limit-exceeded input.invalid-byte-carrier
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
reader root own item text integer present admitted
`);
const globalMembers = new Map([
  ['Object', words('freeze getOwnPropertyDescriptor getOwnPropertyDescriptors getPrototypeOf hasOwn is keys prototype')],
  ['Array', words('isArray from prototype')], ['Math', words('min max floor')],
  ['Number', words('isFinite isInteger isSafeInteger MAX_SAFE_INTEGER')],
  ['JSON', words('stringify')], ['Reflect', words('ownKeys')],
]);
const constructors = words('Map Set WeakMap WeakSet Uint8Array Uint16Array Uint32Array TextEncoder Error TypeError');
const globals = new Set([...globalMembers.keys(), ...constructors, 'String', 'Symbol', 'ArrayBuffer', 'undefined', 'NaN', 'Infinity', 'globalThis']);

// These are exact intrinsic capture sites, not permissions to borrow arbitrary
// ambient functions. References to the resulting bindings are checked below.
const captureInitializers = new Map([
  [WRAPPER, new Map([
    ['getOwnDescriptor', 'Object.getOwnPropertyDescriptor'], ['hasOwn', 'Object.hasOwn'],
    ['isArray', 'Array.isArray'], ['getPrototypeOf', 'Object.getPrototypeOf'],
    ['arrayPrototype', 'Array.prototype'], ['isInteger', 'Number.isInteger'],
    ['defineProperty', 'Object.defineProperty'], ['freeze', 'Object.freeze'],
  ])],
  [BYTE_CARRIER, new Map([
    ['capturedApply', 'Reflect.apply'], ['CapturedUint8Array', 'Uint8Array'],
    ['typedArrayPrototype', 'Object.getPrototypeOf(CapturedUint8Array.prototype)'],
    ['brandOf', 'captureGetter(typedArrayPrototype, Symbol.toStringTag)'],
    ['bufferOf', 'captureGetter(typedArrayPrototype, "buffer")'],
    ['lengthOf', 'captureGetter(typedArrayPrototype, "length")'],
    ['sharedProbe', 'captureGetter(ArrayBuffer.prototype, "byteLength")'],
    ['usableProbe', 'typedArrayPrototype.at'],
  ])],
  [RAW_BYTES, new Map([['defineProperty', 'Object.defineProperty']])],
  [SCANNER, new Map([['fromCharCode', 'String.fromCharCode']])],
]);
const shapeConstructors = new Map([
  ['record', [1, 1, 'function record(fields) { return { type: "record", fields }; }']],
  ['literal', [1, 1, 'function literal(expected) { return { type: "literal", expected }; }']],
  ['integer', [2, 2, 'function integer(min, max) { return { type: "integer", min, max }; }']],
  ['identity', [3, 3, 'function identity(matchesFormat, min, max) { return { type: "identity", matchesFormat, min, max }; }']],
  ['array', [3, 4, 'function array(min, max, item, limit) { return { type: "array", min, max, item, limit }; }']],
]);
// Tiny helpers that execute during initialization or introduce intrinsic writes
// need a closed body as well as a name. No scanner/schema algorithm is pinned.
const functionProfiles = new Map([
  [`${RAW_BYTES}:appendOwn`, 'function appendOwn(values, value) { const descriptor = { __proto__: null, value, enumerable: true, configurable: true, writable: true }; defineProperty(values, values.length, descriptor); }'],
  [`${BYTE_CARRIER}:captureGetter`, 'function captureGetter(prototype, key) { const getter = Object.getOwnPropertyDescriptor(prototype, key)?.get; if (getter === undefined) { throw new TypeError("Required byte carrier intrinsic is unavailable"); } return getter; }'],
  [`${SNAPSHOT}:record`, 'function record(fields) { const value = Object.create(null); for (const key of Object.keys(fields)) { Object.defineProperty(value, key, { value: fields[key], enumerable: true }); } return Object.freeze(value); }'],
  ...[...shapeConstructors].map(([name, contract]) => [`${SHAPE}:${name}`, contract[2]]),
]);
const applySites = new Map([
  ['brandOf', 'capturedApply(brandOf, value, [])'],
  ['bufferOf', 'capturedApply(bufferOf, value, [])'],
  ['sharedProbe', 'capturedApply(sharedProbe, buffer, [])'],
  ['usableProbe', 'capturedApply(usableProbe, value, [0])'],
  ['lengthOf', 'capturedApply(lengthOf, value, [])'],
]);

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
// Compare the finite helper/capture grammar without depending on emitter
// whitespace, comments or quote style. Candidate text is only tokenized.
function sameSyntax(node, expected) {
  const tokens = text => {
    const scanner = ts.createScanner(ts.ScriptTarget.ESNext, true, ts.LanguageVariant.Standard, text);
    const result = [];
    for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
      result.push([kind, kind === ts.SyntaxKind.StringLiteral ? scanner.getTokenValue() : scanner.getTokenText()]);
    }
    return JSON.stringify(result);
  };
  if (!node || tokens(node.getText()) !== tokens(expected)) return false;
  // Equal tokens can still parse differently after a restricted-production
  // newline (for example return followed by an expression on the next line).
  const declaration = ts.isFunctionDeclaration(node);
  const parsed = ts.createSourceFile('profile.js', declaration ? expected : `(${expected});`,
    ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  if (parsed.parseDiagnostics.length !== 0) return false;
  const statement = parsed.statements[0];
  const reference = declaration ? statement
    : statement && ts.isExpressionStatement(statement) ? unwrap(statement.expression) : undefined;
  if (!reference) return false;
  const shape = root => {
    const result = [], stack = [root];
    while (stack.length !== 0) {
      const current = stack.pop();
      result.push(current.kind);
      const children = [];
      ts.forEachChild(current, child => { children.push(child); });
      for (let index = children.length - 1; index >= 0; index--) stack.push(children[index]);
    }
    return result;
  };
  const actualShape = shape(node), expectedShape = shape(reference);
  return actualShape.length === expectedShape.length
    && actualShape.every((kind, index) => kind === expectedShape[index]);
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

function audit(files, profile) {
  // Only the trusted caller selects this finite profile. Archive contents,
  // including metadata and the export inventory, cannot activate it.
  requireThat(profiles.has(profile), 'profile');
  const shared = profile !== 'm1';
  const publicValues = profile === 'm2' ? M2_VALUES : VALUES;
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
    const role = path === ENTRY && profile === 'm2'
      ? { ...roles.get(path), exports: new Set(publicValues) } : roles.get(path);
    modules.set(path, { source, role, exports: new Set(), links: [] });
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
        requireThat(!captureInitializers.get(path)?.has(element.name.text), 'top-level');
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
  // This identity grants syntax only to the first owned nested declaration.
  // The complete factory and helper grammar is checked below.
  const facade = shared ? exported(FACADE, 'createCompilerFacade') : undefined;
  const sharedHelper = facade?.kind === 'function'
    ? facade.node.body?.statements[0] : undefined;
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
  const reviewedNodes = new Set(), reviewedInitializers = new Set(), reviewedFunctions = new Set();
  const captures = new Map();
  for (const [path, module] of modules) for (const statement of module.source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      requireThat(!captureInitializers.get(path)?.has(statement.name.text), 'top-level');
      const expected = functionProfiles.get(`${path}:${statement.name.text}`);
      if (expected !== undefined) {
        requireThat(sameSyntax(statement, expected), 'construction');
        reviewedFunctions.add(statement);
        visit(statement, node => { reviewedNodes.add(node); }, budget);
      }
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue;
      requireThat(!functionProfiles.has(`${path}:${declaration.name.text}`), 'construction');
      const expected = captureInitializers.get(path)?.get(declaration.name.text);
      if (expected === undefined) continue;
      const initializer = unwrap(declaration.initializer);
      requireThat(constant(declaration) && sameSyntax(initializer, expected), 'top-level');
      captures.set(declaration, { path, name: declaration.name.text });
      reviewedInitializers.add(initializer);
      visit(initializer, node => { reviewedNodes.add(node); }, budget);
    }
  }
  // Matching a spelling cannot substitute an import or borrowed helper for the
  // owned captures and the checked getter body that initialization actually uses.
  for (const initializer of reviewedInitializers) visit(initializer, node => {
    if (!ts.isIdentifier(node) || nonReference(node) || globals.has(node.text)) return;
    const declaration = declarationOf(symbolAt(node)), capture = captures.get(declaration);
    requireThat(capture && capture.path === pathOf(node) && capture.name === node.text
      || declaration && reviewedFunctions.has(declaration) && pathOf(declaration) === BYTE_CARRIER
        && declaration.name?.text === 'captureGetter', 'top-level');
  }, budget);
  function checkMember(name, node) {
    const sharedMember = shared && pathOf(node) === FACADE
      && ['compileCompositionJson', 'admitRawInput'].includes(name);
    requireThat(sharedMember || profile === 'm2' && pathOf(node) === ENTRY && name === 'compileCompositionJson'
      || members.has(name) || scopedMembers.get(pathOf(node))?.has(name)
      || /^(?:decode|schema|identity|declaration|profile|binding|graph|diagnostics)\.[a-z-]+$/u.test(name), 'purpose');
    if (intrinsicSelectors.has(name)) requireThat(reviewedNodes.has(node), 'purpose');
  }
  function inert(node) {
    node = unwrap(node);
    if (!node) return false;
    if (reviewedInitializers.has(node)) return true;
    if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)
      || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(node.kind)) return true;
    if (ts.isPropertyAccessExpression(node)) return inert(node.expression);
    if (ts.isArrayLiteralExpression(node)) return node.elements.every(item => !ts.isSpreadElement(item) && inert(item));
    if (ts.isObjectLiteralExpression(node)) return node.properties.every(item =>
      ts.isShorthandPropertyAssignment(item) || ts.isPropertyAssignment(item) && inert(item.initializer));
    if (ts.isPrefixUnaryExpression(node)) return [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken,
      ts.SyntaxKind.ExclamationToken, ts.SyntaxKind.TildeToken].includes(node.operator) && inert(node.operand);
    if (ts.isBinaryExpression(node)) return [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken,
      ts.SyntaxKind.SlashToken, ts.SyntaxKind.PercentToken, ts.SyntaxKind.AsteriskAsteriskToken].includes(node.operatorToken.kind)
      && inert(node.left) && inert(node.right);
    if (ts.isCallExpression(node) && !node.questionDotToken && pathOf(node) === SHAPE
      && ts.isIdentifier(unwrap(node.expression))) {
      const target = origin(node.expression);
      const contract = target.kind === 'function' && pathOf(target.node) === SHAPE
        && reviewedFunctions.has(target.node) ? shapeConstructors.get(target.node.name.text) : undefined;
      if (contract && node.arguments.length >= contract[0] && node.arguments.length <= contract[1]
        && node.arguments.every(inert)) return true;
    }
    return builtinCall(node, 'Object', 'freeze') && node.arguments.length === 1 && inert(node.arguments[0]);
  }
  function nearestFunction(node) {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (ts.isFunctionDeclaration(parent) || ts.isArrowFunction(parent) || ts.isMethodDeclaration(parent)
        || ts.isGetAccessorDeclaration(parent) || ts.isSetAccessorDeclaration(parent)) return parent;
    }
    return undefined;
  }
  function capturedApplication(call) {
    if (!ts.isCallExpression(call) || call.questionDotToken || call.arguments.length !== 3
      || !ts.isIdentifier(unwrap(call.expression)) || !ts.isIdentifier(unwrap(call.arguments[0]))) return false;
    const apply = captures.get(declarationOf(symbolAt(unwrap(call.expression))));
    const target = captures.get(declarationOf(symbolAt(unwrap(call.arguments[0]))));
    const expected = target?.path === BYTE_CARRIER ? applySites.get(target.name) : undefined;
    return apply?.path === BYTE_CARRIER && apply.name === 'capturedApply' && expected !== undefined
      && pathOf(call) === BYTE_CARRIER && nearestFunction(call)?.name?.text === 'classifyByteCarrier'
      && sameSyntax(call, expected);
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
  // Match a small reviewed AST grammar, resolving every local reference to
  // its binding. Local spelling, comments, quotes and parentheses may vary.
  // Each invocation has its own binding map; callback scopes cannot borrow
  // the helper's collector merely by using the same identifier text.
  function bindingSyntax(actual, expected, seeds) {
    const method = ts.isMethodDeclaration(actual);
    const source = ts.createSourceFile('facade-profile.js',
      method ? `({${expected}});` : expected,
      ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
    requireThat(source.parseDiagnostics.length === 0, 'checker-failed');
    const reference = method
      ? unwrap(source.statements[0].expression).properties[0] : source.statements[0];
    const bindings = new Map(seeds);
    function match(left, right) {
      left = unwrap(left);
      right = unwrap(right);
      requireThat(left && right && left.kind === right.kind, 'construction');
      // Unary operators are scalar AST fields, not forEachChild children.
      if (ts.isPrefixUnaryExpression(left) || ts.isPostfixUnaryExpression(left)) {
        requireThat(left.operator === right.operator, 'construction');
      }
      if (ts.isIdentifier(left)) {
        if (bindingName(right)) {
          const declaration = declarationOf(symbolAt(left));
          requireThat(bindingName(left) && declaration === left.parent
            && !bindings.has(right.text)
            && ![...bindings.values()].includes(declaration), 'construction');
          bindings.set(right.text, declaration);
        } else if (nonReference(right)) {
          requireThat(nonReference(left) && left.text === right.text, 'construction');
        } else {
          requireThat(!nonReference(left), 'construction');
          const declaration = declarationOf(symbolAt(left));
          requireThat(bindings.has(right.text)
            ? declaration === bindings.get(right.text)
            : globals.has(right.text) && left.text === right.text && !declaration, 'construction');
        }
        return;
      }
      if (ts.isVariableDeclarationList(left)) {
        requireThat((left.flags & ts.NodeFlags.Const) === (right.flags & ts.NodeFlags.Const), 'construction');
      }
      if (ts.isStringLiteral(left) || ts.isNumericLiteral(left)) {
        requireThat(left.text === right.text, 'construction');
      }
      const children = node => {
        const result = [];
        ts.forEachChild(node, child => { result.push(child); });
        return result;
      };
      const actualChildren = children(left), expectedChildren = children(right);
      requireThat(actualChildren.length === expectedChildren.length, 'construction');
      actualChildren.forEach((child, index) => match(child, expectedChildren[index]));
    }
    match(actual, reference);
  }
  function checkCapturedReference(node, declaration) {
    if (reviewedNodes.has(node)) return;
    if (ts.isFunctionDeclaration(declaration) && pathOf(declaration) === BYTE_CARRIER
      && declaration.name?.text === 'captureGetter') fail('construction');
    const capture = captures.get(declaration);
    if (!capture) return;
    const use = outer(node).parent, fn = nearestFunction(node);
    requireThat(pathOf(node) === capture.path, 'global');
    const direct = ts.isCallExpression(use) && !use.questionDotToken && unwrap(use.expression) === node
      && use.arguments.every(argument => !ts.isSpreadElement(argument));
    if (capture.path === WRAPPER) {
      if (capture.name === 'arrayPrototype') {
        requireThat(fn?.name?.text === 'inspectInvocation' && ts.isBinaryExpression(use)
          && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(use.operatorToken.kind), 'global');
        return;
      }
      const contracts = new Map([
        ['getOwnDescriptor', [2, ['ownData']]], ['hasOwn', [2, ['ownData']]],
        ['isArray', [1, ['inspectInvocation']]], ['getPrototypeOf', [1, ['inspectInvocation']]],
        ['isInteger', [1, ['inspectInvocation']]], ['defineProperty', [3, ['inspectInvocation']]],
        ['freeze', [1, ['invalidWrapper', 'inspectInvocation']]],
      ]);
      const contract = contracts.get(capture.name);
      requireThat(contract && direct && use.arguments.length === contract[0]
        && contract[1].includes(fn?.name?.text), 'global');
      if (capture.name === 'defineProperty') {
        requireThat([
          'defineProperty(declarations, key, { value: item.value, enumerable: true, configurable: true, writable: true })',
          'defineProperty(declarations, key, { value: item.value, enumerable: true, configurable: true, writable: true, })',
        ].some(expected => sameSyntax(use, expected)), 'construction');
        const storage = origin(use.arguments[0]);
        requireThat(storage.kind === 'value' && ts.isArrayLiteralExpression(storage.node)
          && storage.node.elements.length === 0 && nearestFunction(storage.node) === fn, 'construction');
      }
      return;
    }
    if (capture.path === SCANNER) {
      requireThat(capture.name === 'fromCharCode' && fn?.name?.text === 'scanString' && direct
        && [1, 2].includes(use.arguments.length), 'global');
      return;
    }
    if (capture.name === 'CapturedUint8Array') {
      requireThat(ts.isNewExpression(use) && unwrap(use.expression) === node
        && fn?.name?.text === 'copyByteCarrier' && fn.parameters.length === 1 && use.arguments?.length === 1
        && ts.isIdentifier(unwrap(use.arguments[0]))
        && declarationOf(symbolAt(unwrap(use.arguments[0]))) === fn.parameters[0], 'construction');
      return;
    }
    requireThat(capturedApplication(use) && (capture.name === 'capturedApply'
      ? unwrap(use.expression) === node : unwrap(use.arguments[0]) === node), 'global');
  }
  function checkGlobal(node) {
    const name = node.text, reference = outer(node), parent = reference.parent;
    if (reviewedNodes.has(node)) return;
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
      requireThat(name !== 'WeakMap' || pathOf(node) === RAW_DOCUMENT, 'global');
      return;
    }
    if ((name === 'String' || name === 'Number') && ts.isCallExpression(parent) && parent.expression === reference) {
      requireThat(parent.arguments.length === 1, 'global');
      return;
    }
    requireThat((ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === reference, 'global');
    const member = ts.isPropertyAccessExpression(parent) ? parent.name.text : staticString(parent.argumentExpression);
    const shapeValues = name === 'Object' && member === 'values' && pathOf(node) === SHAPE
      && nearestFunction(node)?.name?.text === 'schemaSafeLocalPath'
      && ts.isCallExpression(outer(parent).parent)
      && sameSyntax(outer(parent).parent, 'Object.values(shape.variants)');
    requireThat((globalMembers.get(name)?.has(member) || shapeValues) && !parent.questionDotToken, 'global');
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
        && ((node.parent === source ? role.definitions : role.functions).has(node.name.text)
          || shared && path === FACADE && node === sharedHelper), 'purpose');
      if (ts.isArrowFunction(node)) {
        const parent = outer(node).parent;
        if (ts.isVariableDeclaration(parent)) requireThat(ts.isIdentifier(parent.name)
          && role.functions.has(parent.name.text), 'purpose');
      }
      if (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node)) {
        const allowed = path === QUEUE ? words('size less push take') : path === SHAPE || path === SNAPSHOT ? words('declaration profile')
          : path === FACADE ? words(shared ? 'compileComposition compileCompositionJson' : 'compileComposition')
            : path === feature('plan-output') ? words('emit') : path === feature('composition-semantics') ? words('newCollector') : new Set();
        requireThat(node.body && allowed.has(propertyName(node.name)), 'purpose');
        requireThat(!ts.isGetAccessorDeclaration(node) || path === QUEUE && node.name.text === 'size', 'purpose');
      }
      if (node.asteriskToken) fail('syntax-profile');
      if (modified(node, ts.SyntaxKind.AsyncKeyword)) requireThat(
        shared && path === FACADE && node === sharedHelper && ts.isFunctionDeclaration(node)
        || ts.isMethodDeclaration(node)
          && (path === FACADE && (node.name.text === 'compileComposition'
            || shared && node.name.text === 'compileCompositionJson')
            || path === feature('plan-output') && node.name.text === 'emit'), 'syntax-profile');
      if (ts.isAwaitExpression(node)) requireThat(modified(nearestFunction(node) ?? {}, ts.SyntaxKind.AsyncKeyword), 'syntax-profile');
      if (ts.isForOfStatement(node)) requireThat(!node.awaitModifier, 'syntax-profile');
      if (node.kind === ts.SyntaxKind.ThisKeyword) requireThat(path === QUEUE && nearestFunction(node), 'purpose');
      if (node.kind === ts.SyntaxKind.SuperKeyword) fail('syntax-profile');
      if (ts.isReturnStatement(node)) requireThat(nearestFunction(node), 'parse');
      if (ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression)) requireThat(node.expression.text === 'use strict', 'directive');
      if (ts.isPropertyAccessExpression(node)) {
        // The sole ambient chain is checked in full at its globalThis identifier.
        if (!['crypto', 'subtle', 'digest'].includes(node.name.text)) checkMember(propertyName(node.name), node);
      }
      if (ts.isElementAccessExpression(node)) {
        const name = staticString(node.argumentExpression);
        if (name !== undefined) checkMember(name, node);
      }
      if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent) && !node.dotDotDotToken) {
        const selector = node.propertyName ?? node.name;
        const name = ts.isComputedPropertyName(selector) ? staticString(selector.expression) : propertyName(selector);
        requireThat(name !== undefined, 'purpose');
        checkMember(name, node);
      }
      if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node) || ts.isPropertyDeclaration(node)
        || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node)) checkMember(propertyName(node.name), node);
      if (ts.isIdentifier(node)) {
        if (bindingName(node)) {
          requireThat(!globals.has(node.text) && node.text !== 'eval' && node.text !== 'arguments', 'binding');
          requireThat((checker.getSymbolAtLocation(node)?.declarations?.length ?? 0) === 1, 'binding');
        } else if (!nonReference(node)) {
          const declaration = declarationOf(symbolAt(node));
          if (path === RAW_BYTES && node.text === 'appendOwn') {
            const use = outer(node).parent;
            requireThat(declaration && reviewedFunctions.has(declaration) && pathOf(declaration) === path
              && declaration.name?.text === node.text && ts.isCallExpression(use)
              && unwrap(use.expression) === node && !use.questionDotToken && use.arguments.length === 2
              && use.arguments.every(argument => !ts.isSpreadElement(argument)), 'construction');
          }
          if (declaration) {
            requireThat(modules.has(pathOf(declaration)), 'global');
            checkCapturedReference(node, declaration);
          }
          else { requireThat(globals.has(node.text), 'global'); checkGlobal(node); }
        }
      }
      if (ts.isNewExpression(node)) {
        const callee = unwrap(node.expression), resolved = origin(callee);
        const captured = ts.isIdentifier(callee) ? captures.get(declarationOf(symbolAt(callee))) : undefined;
        requireThat(ts.isIdentifier(callee) && constructors.has(callee.text) && !declarationOf(symbolAt(callee))
          || captured?.path === BYTE_CARRIER && captured.name === 'CapturedUint8Array' && path === BYTE_CARRIER
          || resolved.kind === 'class' && pathOf(resolved.node) === QUEUE && resolved.node.name.text === 'ReadyQueue', 'construction');
      }
      if (ts.isCallExpression(node)) {
        const callee = unwrap(node.expression);
        requireThat(callee.kind !== ts.SyntaxKind.ImportKeyword, 'code-loading');
        // The current schema reader uses named functions and a tagged shape;
        // its former computed validator dispatch is no longer in the closure.
        if (ts.isElementAccessExpression(callee)) fail('computed-call');
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
    const sharedFacade = shared && path === FACADE;
    const returnIndex = sharedFacade ? 1 : 0;
    requireThat(fn.body.statements.length === returnIndex + 1
      && ts.isReturnStatement(fn.body.statements[returnIndex]), 'construction');
    const slotBindings = sharedFacade ? new Map(parameter.name.elements.map(item =>
      [propertyName(item.propertyName ?? item.name), item])) : undefined;
    if (sharedFacade) {
      requireThat(sharedHelper === fn.body.statements[0]
        && ts.isFunctionDeclaration(sharedHelper), 'construction');
      bindingSyntax(sharedHelper, `async function compile(admit) {
        const collector = semantics.newCollector();
        const admitted = admit(collector);
        const analyzed = semantics.analyze(admitted, collector);
        if (!analyzed.ok) return analyzed;
        const emitted = await output.emit(analyzed.plan);
        return Object.freeze({ ok: true, plan: emitted.plan, digest: emitted.digest });
      }`, slotBindings);
    }
    const result = unwrap(fn.body.statements[returnIndex].expression);
    requireThat(builtinCall(result, 'Object', 'freeze') && result.arguments.length === 1, 'construction');
    const props = properties(result.arguments[0]);
    const expectedPorts = sharedFacade ? ['compileComposition', 'compileCompositionJson'] : ports;
    requireThat(equalNames(new Set(props.keys()), new Set(expectedPorts)), 'construction');
    for (const [key, property] of props) {
      if (['compileComposition', 'compileCompositionJson', 'emit', 'newCollector'].includes(key)) {
        requireThat(ts.isMethodDeclaration(property)
          && modified(property, ts.SyntaxKind.AsyncKeyword) === (key !== 'newCollector'), 'construction');
        if (sharedFacade) {
          const member = key === 'compileComposition' ? 'admitObjectInput' : 'admitRawInput';
          bindingSyntax(property, `async ${key}(input) {
            return compile(collector => admission.${member}(input, collector));
          }`, new Map([
            ['compile', sharedHelper],
            ['admission', slotBindings.get('admission')],
          ]));
        }
      } else if (key === 'admitRawInput') {
        const arrow = unwrap(propertyValue(property));
        requireThat(path === feature('input-admission') && ts.isPropertyAssignment(property)
          && arrow && ts.isArrowFunction(arrow) && !modified(arrow, ts.SyntaxKind.AsyncKeyword)
          && arrow.parameters.length === 2 && arrow.parameters.every(item => ts.isIdentifier(item.name)
            && !item.initializer && !item.dotDotDotToken), 'construction');
        const call = unwrap(arrow.body);
        requireThat(ts.isCallExpression(call) && !call.questionDotToken && call.arguments.length === 3
          && isFunction(origin(call.expression), RAW_ADMISSION, 'admitRawInput'), 'construction');
        const scanner = parameter.name.elements.find(item => propertyName(item.propertyName ?? item.name) === 'scanner');
        for (let index = 0; index < 3; index += 1) {
          const argument = unwrap(call.arguments[index]);
          requireThat(ts.isIdentifier(argument) && declarationOf(symbolAt(argument))
            === (index < 2 ? arrow.parameters[index] : scanner), 'construction');
        }
      } else {
        const owner = key === 'canonicalize' ? path : key === 'analyze'
          ? 'dist/features/composition-semantics/semantic-analysis.js' : key === 'open'
            ? SCANNER : 'dist/features/input-admission/object-admission.js';
        const targetName = key === 'analyze' ? 'analyzeCompositionSemantics' : key === 'open' ? 'openOwnedRawTokenCursor' : key;
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
        const index = { canonicalizer: 0, semantics: 1, output: 2, scanner: 3, admission: 4 }[key];
        requireThat(index !== undefined && index < built.length
          && provider.kind === 'call' && provider.node === built[index], 'construction');
      }
      built.push(call);
    }
  }
  requireThat(built.length === factories.length && exported(ROOT, 'root').node === built[5], 'construction');
  const compilers = (profile === 'm2' ? ['compileComposition', 'compileCompositionJson'] : ['compileComposition'])
    .map(name => {
      const compiler = exported(ENTRY, name);
      requireThat(compiler.kind === 'member' && compiler.name === name
        && compiler.base.kind === 'call' && compiler.base.node === built[5], 'public-origin');
      return compiler;
    });
  for (const statement of modules.get(ENTRY).source.statements) if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      const value = origin(declaration);
      requireThat(value.kind === 'member' && compilers.some(compiler => value.node === compiler.node)
        || value.kind === 'call' && value.node === built[5]
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
  return { modules: [...reached].sort(), exports: [...publicValues] };
}

// Historical M1 remains the default. The shared private facade and public M2
// are distinct opt-in witnesses, selected by trusted qualification tooling.
export function auditM1JavaScriptClosure(files, profile = 'm1') {
  try { return audit(files, profile); }
  catch (error) {
    if (error instanceof InvalidClosure) throw error;
    fail('checker-failed');
  }
}
