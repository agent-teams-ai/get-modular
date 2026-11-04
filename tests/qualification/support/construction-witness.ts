// Maintained source: tests/qualification/support/construction-witness.ts.
// The Core-local copy is generated with:
// node architecture/tooling/construction-witness-projection.ts --write
// Cold checking and builds reject any complete-byte difference.

import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import canonicalize from 'canonicalize';
import { version } from 'typescript';
import { createScanner, SyntaxKind } from 'typescript/unstable/ast';


/** Finite observations owned by the witness, independent of Core's API types. */
export type ConstructionTuple = [
  implementationId: string,
  index: number,
  providers: [slotId: string, providerId: string][],
];
export interface ConstructionWitness {
  tuples: ConstructionTuple[];
  digest: string;
}
export interface WitnessInput {
  packageRoot: string;
  buildRoot: string;
  compositionPath: string;
  allowlistPath: string;
  plan: unknown;
  qualification?: boolean;
}
export interface GeneratedWitnessInput {
  sourceText: unknown;
  packageRoot: unknown;
  buildRoot: unknown;
  allowlistPath: string;
  plan: unknown;
}
interface Token { kind: SyntaxKind; text: string }
interface Reference { module: string; export: string }
interface ImportBinding extends Reference { local: string; typeOnly: boolean }
interface ImportGroup { typeOnly: boolean; specifiers: { export: string; local: string }[] }
interface Construction { local: string; factory: string; slots: Map<string, string> }
interface RootSyntax {
  bindings: Map<string, ImportBinding>;
  groups: ImportGroup[];
  constructions: Construction[];
  port: string;
  value: string;
}
type AllowlistEntry =
  | { spread: string; key?: never; handle?: never }
  | { key: string; handle: Map<string, string>; spread?: never };
interface Compatibility { family: 'exact'; familyVersion: 1; token: string }
interface Capability { capabilityId: string; compatibility: Compatibility }
interface Slot extends Capability { slotId: string }
interface Handle {
  declaration: { moduleId: string };
  declarationRef: Reference;
  factoryRef: Reference;
  localName: string;
  slots: Map<string, Slot>;
  provides: Map<string, Capability>;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
function list(value: unknown): value is unknown[] { return Array.isArray(value); }
function errorCode(error: unknown): unknown { return record(error) ? error.code : undefined; }
function present<T>(value: T | undefined, reason = 'syntax'): T {
  check(value !== undefined, reason);
  return value;
}

const invalidCode = 'witness.invalid-construction';
const correspondenceCode = 'witness.allowlist-correspondence';
const basePath = 'self-composition/allowlist.ts';
const variantPath = 'self-composition/allowlist.variant.ts';
const variantDirectory = 'tests/features/canonicalization/witness-variant';
const generatedPath = 'src/composition/generated/stage1.ts';
const generatedTextByteLimit = 1024 * 1024;
const forbiddenSlots = new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype', 'then']);
const handleFields = ['declaration', 'factory', 'importPath', 'factoryExport', 'declarationExport', 'localName'];

function invalid(reason: string) {
  return Object.assign(new Error('Invalid finite construction witness input.'), {
    code: invalidCode, context: { reason },
  });
}
function check(condition: unknown, reason = 'syntax'): asserts condition {
  if (!condition) throw invalid(reason);
}
function portable(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 128
    && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+$/u.test(value);
}
function relativePath(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_./-]+$/u.test(value)
    && !isAbsolute(value) && !value.startsWith('../') && value !== '..'
    && posix.normalize(value) === value && !value.split('/').includes('.');
}
function modulePath(from: string, specifier: unknown): string {
  check(typeof specifier === 'string' && /^\.\.?\/[A-Za-z0-9_./-]+\.js$/u.test(specifier), 'relative-import');
  const result = posix.normalize(posix.join(posix.dirname(from), specifier));
  check(relativePath(result), 'relative-import');
  return result;
}
function reference<M, E>(module: M, exported: E) { return { module, export: exported }; }
function safeReference(value: { module: unknown; export: unknown } | undefined) {
  return {
    module: relativePath(value?.module) ? value.module : null,
    export: bindingName(value?.export) ? value.export : null,
  };
}
function corresponds(implementationId: unknown, field: string, expected: Reference, actual: { module: unknown; export: unknown } | undefined) {
  if (expected.module === actual?.module && expected.export === actual?.export) return;
  check(portable(implementationId), 'implementation-identity');
  throw Object.assign(new Error('Allowlist handle and source import disagree.'), {
    code: correspondenceCode,
    context: { implementationId, field, expected: safeReference(expected), actual: safeReference(actual) },
  });
}
function fields(value: unknown, expected: readonly string[], reason: string): asserts value is Record<string, unknown> {
  check(record(value) && !Array.isArray(value), reason);
  const keys = Reflect.ownKeys(value);
  check(keys.length === expected.length && keys.every(key => typeof key === 'string' && expected.includes(key)), reason);
}

// Check skipped trivia as well: an unterminated comment or a reference directive
// cannot disappear behind the scanner's skipTrivia setting.
function trivia(source: string) {
  let index = 0;
  while (index < source.length) {
    if (/\s/u.test(present(source[index]))) { index += 1; continue; }
    if (source.startsWith('//', index)) {
      let end = index + 2;
      while (end < source.length && !/[\r\n\u2028\u2029]/u.test(present(source[end]))) end += 1;
      check(!/^\/\/\/\s*<reference\b/u.test(source.slice(index, end)), 'reference-directive');
      index = end;
    } else if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2);
      check(end !== -1, 'unterminated-comment');
      index = end + 2;
    } else throw invalid('scanner-trivia');
  }
}
function tokens(source: string): Token[] {
  const scanner = createScanner(true, undefined, source);
  const result: Token[] = [];
  let previousEnd = 0;
  let braces = 0;
  const templates: number[] = [];
  for (;;) {
    let kind = scanner.scan();
    if (kind === SyntaxKind.CloseBraceToken && templates.at(-1) === braces) {
      kind = scanner.reScanTemplateToken(false);
      if (kind === SyntaxKind.TemplateTail) templates.pop();
    } else if (kind === SyntaxKind.OpenBraceToken) braces += 1;
    else if (kind === SyntaxKind.CloseBraceToken) braces -= 1;
    if (kind === SyntaxKind.TemplateHead) templates.push(braces);
    const start = scanner.getTokenStart();
    const end = scanner.getTokenEnd();
    trivia(source.slice(previousEnd, start));
    check(!scanner.isUnterminated() && !scanner.hasUnicodeEscape()
      && !scanner.hasExtendedUnicodeEscape(), 'unsupported-token-spelling');
    if (kind === SyntaxKind.EndOfFile) {
      trivia(source.slice(start));
      break;
    }
    check(end > start, 'scanner-token');
    result.push({ kind, text: scanner.getTokenText() });
    previousEnd = end;
  }
  return result;
}
// Scanner keywords include contextual words that remain legal bindings.
// Keep strict module exclusions independent of the candidate emitter.
const forbiddenBindings = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
  'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for',
  'function', 'if', 'import', 'in', 'instanceof', 'new', 'null', 'return',
  'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void',
  'while', 'with', 'implements', 'interface', 'let', 'package', 'private',
  'protected', 'public', 'static', 'await', 'yield', 'eval', 'arguments',
]);
function rawBindingSpelling(value: unknown): value is string {
  return typeof value === 'string'
    && /^[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*$/u.test(value)
    && !forbiddenBindings.has(value);
}
function bindingToken(item: Token | undefined): item is Token {
  return rawBindingSpelling(item?.text) && (item.kind === SyntaxKind.Identifier
    || (item.kind >= SyntaxKind.FirstKeyword && item.kind <= SyntaxKind.LastKeyword));
}
function bindingName(value: unknown): value is string {
  if (!rawBindingSpelling(value)) return false;
  const scanned = tokens(value);
  return scanned.length === 1 && scanned[0]?.text === value && bindingToken(scanned[0]);
}
function slotName(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9]{0,63}$/u.test(value)
    && !forbiddenSlots.has(value);
}
class Parser {
  items: Token[]; index: number;
  constructor(source: string) { this.items = tokens(source); this.index = 0; }
  peek() { return this.items[this.index]?.text; }
  eat(text: string) {
    if (this.peek() !== text) return false;
    this.index += 1;
    return true;
  }
  need(...words: string[]) { for (const word of words) check(this.eat(word)); }
  identifier() {
    const item = this.items[this.index++];
    check(bindingToken(item));
    return item.text;
  }
  slot() {
    const item = this.items[this.index++];
    check(item !== undefined && slotName(item.text), 'invalid-slot');
    return item.text;
  }
  string() {
    const raw = this.items[this.index++]?.text;
    check(typeof raw === 'string' && raw.length >= 2);
    const quote = raw[0];
    check((quote === '"' || quote === "'") && raw.at(-1) === quote);
    const body = raw.slice(1, -1);
    // Extend metadata only for raw identifier spellings; paths retain their
    // existing ASCII grammar, and escaped strings remain outside this reader.
    check(!body.includes(quote) && !body.includes('\\')
      && (!/[^\x20-\x7e]/u.test(body) || bindingName(body)), 'unsupported-string-spelling');
    return body;
  }
  list<T>(open: string, close: string, item: () => T): T[] {
    this.need(open);
    const result: T[] = [];
    while (!this.eat(close)) {
      result.push(item());
      if (this.eat(close)) break;
      this.need(',');
    }
    return result;
  }
  end() { check(this.index === this.items.length); }
}
function claimName(names: Set<string>, name: string) {
  check(bindingName(name), 'invalid-binding');
  check(!names.has(name), 'duplicate-binding');
  names.add(name);
}
function imports(parser: Parser, from: string, names: Set<string>) {
  const bindings = new Map<string, ImportBinding>();
  const groups: ImportGroup[] = [];
  while (parser.eat('import')) {
    const typeOnly = parser.eat('type');
    const specifiers = parser.list('{', '}', () => {
      const exported = parser.identifier();
      const local = parser.eat('as') ? parser.identifier() : exported;
      claimName(names, local);
      return { export: exported, local };
    });
    check(specifiers.length > 0, 'empty-import');
    parser.need('from');
    const module = modulePath(from, parser.string());
    parser.need(';');
    for (const specifier of specifiers) {
      const binding = { ...specifier, module, typeOnly };
      bindings.set(binding.local, binding);
    }
    groups.push({ typeOnly, specifiers });
  }
  return { bindings, groups };
}
function parseRoot(source: string, path: string): RootSyntax {
  const parser = new Parser(source);
  const names = new Set(['root']);
  const imported = imports(parser, path, names);
  const constructions: Construction[] = [];
  while (parser.eat('const')) {
    const local = parser.identifier();
    claimName(names, local);
    parser.need('=');
    const factory = parser.identifier();
    parser.need('(');
    const slots = new Map<string, string>();
    parser.list('{', '}', () => {
      const slot = parser.slot();
      const provider = parser.eat(':') ? parser.identifier() : slot;
      check(bindingName(provider), 'invalid-binding');
      check(!slots.has(slot), 'duplicate-slot');
      slots.set(slot, provider);
    });
    parser.need(')', ';');
    constructions.push({ local, factory, slots });
  }
  parser.need('export', 'const', 'root', ':');
  const port = parser.identifier();
  parser.need('=');
  const value = parser.identifier();
  parser.need(';');
  parser.end();
  return { ...imported, constructions, port, value };
}
function parseAllowlist(source: string, path: string) {
  const parser = new Parser(source);
  const imported = imports(parser, path, new Set(['Map', 'ReadonlyMap', 'allowlist']));
  const typeGroups = imported.groups.filter(group => group.typeOnly);
  check(typeGroups.length === 1 && typeGroups[0]?.specifiers.length === 1, 'allowlist-type');
  const typeLocal = present(present(typeGroups[0]).specifiers[0]).local;
  const type = imported.bindings.get(typeLocal);
  check(type !== undefined && type.export === 'AllowlistHandle' && type.module === 'self-composition/allowlist-types.js', 'allowlist-type');
  const generic = () => parser.need('<', 'string', ',', typeLocal, '>');
  parser.need('export', 'const', 'allowlist', ':', 'ReadonlyMap');
  generic();
  parser.need('=', 'new', 'Map');
  generic();
  parser.need('(');
  const entries = parser.list<AllowlistEntry>('[', ']', () => {
    if (parser.eat('...')) return { spread: parser.identifier() };
    parser.need('[');
    const key = parser.identifier();
    parser.need(',');
    const handle = new Map<string, string>();
    parser.list('{', '}', () => {
      const field = parser.identifier();
      check(handleFields.includes(field) && !handle.has(field), 'handle-fields');
      parser.need(':');
      handle.set(field, field === 'declaration' || field === 'factory' ? parser.identifier() : parser.string());
    });
    check(handle.size === handleFields.length, 'handle-fields');
    parser.need(']');
    return { key, handle };
  });
  parser.need(')', ';');
  parser.end();
  return { ...imported, entries, typeLocal };
}

// This finite owner format admits local exported constants, not forwarding
// modules. Checking namespace values alone loses a re-export's defining module
// and can incorrectly authorize a different sibling factory for the same ID.
function localDeclaration(source: string, module: string, identityName: string, declarationName: string) {
  const parser = new Parser(source);
  // The finite format has no regex literals or division. Their tokens need
  // expression-sensitive rescanning; treating regex braces as delimiters can
  // disguise a property expression as a complete object literal.
  check(parser.items.every(item => ![SyntaxKind.SlashToken, SyntaxKind.SlashEqualsToken,
    SyntaxKind.Unknown].includes(item.kind)), 'nonlocal-declaration');
  const names = new Set(['Object']);
  imports(parser, module, names);
  const definitions = new Map<string, Token[]>();
  while (parser.peek() !== undefined) {
    check(parser.eat('export') && parser.eat('const'), 'nonlocal-declaration');
    const name = parser.identifier();
    claimName(names, name);
    if (parser.eat(':')) {
      // Types are erased by the separately checked build. They do not establish
      // the value's origin; the initializer below does.
      while (parser.peek() !== '=') {
        check(parser.peek() !== undefined && parser.peek() !== ';', 'nonlocal-declaration');
        parser.index += 1;
      }
    }
    parser.need('=');
    const start = parser.index;
    const close: string[] = [];
    const delimiters = new Map([['(', ')'], ['[', ']'], ['{', '}']]);
    while (parser.peek() !== ';' || close.length > 0) {
      const text = parser.peek();
      check(text !== undefined, 'nonlocal-declaration');
      if (delimiters.has(text)) close.push(present(delimiters.get(text)));
      else if ([')', ']', '}'].includes(text)) check(close.pop() === text, 'nonlocal-declaration');
      parser.index += 1;
    }
    definitions.set(name, parser.items.slice(start, parser.index));
    parser.need(';');
  }
  const identity = definitions.get(identityName);
  const declaration = definitions.get(declarationName)?.map(item => item.text);
  // Own IDs are local string/template constants. A borrowed constant alias
  // cannot relocate its declaration's ownership.
  const literalIdentity = identity?.length === 1
    && [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral].includes(present(identity[0]).kind);
  const templateIdentity = identity?.length === 3 && identity[0]?.kind === SyntaxKind.TemplateHead
    && bindingToken(identity[1]) && identity[2]?.kind === SyntaxKind.TemplateTail;
  check(literalIdentity || templateIdentity, 'nonlocal-declaration');
  check(declaration !== undefined && declaration.slice(0, 3).join(' ') === 'Object . freeze', 'nonlocal-declaration');
  let offset = 3;
  if (declaration[offset] === '<') {
    check(declaration[offset + 1] === 'ModuleDeclaration' && declaration[offset + 2] === '>', 'nonlocal-declaration');
    offset += 3;
  }
  check(declaration[offset] === '(' && declaration[offset + 1] === '{'
    && declaration.at(-2) === '}' && declaration.at(-1) === ')', 'nonlocal-declaration');
  // The matching literal close must end the sole argument. A suffix check
  // alone also accepts `{ borrowed }.borrowed || {}`, which returns an alias.
  let depth = 0;
  let end = offset + 1;
  do {
    check(end < declaration.length, 'nonlocal-declaration');
    if (declaration[end] === '{') depth += 1;
    else if (declaration[end] === '}') depth -= 1;
    end += 1;
  } while (depth > 0);
  check(end === declaration.length - 1, 'nonlocal-declaration');
}
function featureModule(module: string, qualification: boolean) {
  return /^src\/features\/[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)?\/(?:declaration|factory)\.js$/u.test(module)
    || (qualification && (module === `${variantDirectory}/declaration.js` || module === `${variantDirectory}/factory.js`));
}
function compatibility(value: unknown): asserts value is Compatibility {
  fields(value, ['family', 'familyVersion', 'token'], 'compatibility');
  check(value.family === 'exact' && value.familyVersion === 1 && portable(value.token), 'compatibility');
}
function sameCompatibility(left: Compatibility, right: Compatibility) {
  return left.family === right.family && left.familyVersion === right.familyVersion && left.token === right.token;
}
function declarationMaps(declaration: unknown) {
  check(record(declaration) && declaration.kind === 'get-modular.module-declaration' && declaration.schemaVersion === 1
    && portable(declaration.moduleId) && portable(declaration.implementationId)
    && list(declaration.slots) && list(declaration.provides), 'declaration');
  const slots = new Map<string, Slot>();
  const provides = new Map<string, Capability>();
  for (const slot of declaration.slots) {
    check(record(slot) && slotName(slot.slotId) && !slots.has(slot.slotId), 'declared-slot');
    fields(slot.cardinality, ['kind'], 'required-cardinality');
    check(slot.cardinality.kind === 'required' && portable(slot.capabilityId), 'required-cardinality');
    compatibility(slot.compatibility);
    slots.set(slot.slotId, { slotId: slot.slotId, capabilityId: slot.capabilityId, compatibility: slot.compatibility });
  }
  for (const provided of declaration.provides) {
    check(record(provided) && portable(provided.capabilityId) && !provides.has(provided.capabilityId), 'provided-capability');
    compatibility(provided.compatibility);
    provides.set(provided.capabilityId, { capabilityId: provided.capabilityId, compatibility: provided.compatibility });
  }
  return { declaration: { moduleId: declaration.moduleId }, slots, provides };
}
async function directory(path: unknown): Promise<string> {
  check(typeof path === 'string' && isAbsolute(path), 'absolute-directory');
  try {
    const actual = await realpath(path);
    check((await stat(actual)).isDirectory(), 'absolute-directory');
    return actual;
  } catch (error) {
    if (errorCode(error) === invalidCode) throw error;
    throw invalid('unavailable-directory');
  }
}
async function checkedFile(root: string, path: string) {
  check(relativePath(path), 'source-path');
  const target = resolve(root, ...path.split('/'));
  try {
    check(await realpath(target) === target, 'symlink-input');
    check((await stat(target)).isFile(), 'regular-file');
    return target;
  } catch (error) {
    if (errorCode(error) === invalidCode) throw error;
    throw invalid('unavailable-input');
  }
}
async function textFile(root: string, path: string) {
  const target = await checkedFile(root, path);
  try { return await readFile(target, 'utf8'); }
  catch { throw invalid('unavailable-input'); }
}
function sourcePath(module: string) { return module.slice(0, -3) + '.ts'; }
function declarationPath(module: string) { return module.slice(0, -3) + '.d.ts'; }

async function readHandles(packageRoot: string, buildRoot: string, initialPath: string, qualification: boolean) {
  const namespaces = new Map<string, Map<string, unknown>>();
  const visited = new Set<string>();
  async function namespace(module: string, role: string, allowTests: boolean) {
    check(featureModule(module, allowTests) && module.endsWith(`/${role}.js`), 'feature-layout');
    if (!namespaces.has(module)) {
      await checkedFile(packageRoot, sourcePath(module));
      const built = await checkedFile(buildRoot, module);
      try {
        // Only original feature namespaces are read. Neither source root nor
        // source/built allowlist is imported, and no factory is invoked.
        const loaded: unknown = await import(pathToFileURL(built).href);
        check(record(loaded), 'unavailable-namespace');
        namespaces.set(module, new Map(Object.entries(loaded)));
      } catch { throw invalid('unavailable-namespace'); }
    }
    return present(namespaces.get(module));
  }
  async function read(path: string, depth: number): Promise<Map<string, Handle>> {
    check(depth <= 1 && !visited.has(path), 'allowlist-cycle');
    visited.add(path);
    const extension = path === variantPath;
    check(!extension || qualification, 'qualification-only');
    const ast = parseAllowlist(await textFile(packageRoot, path), path);
    const used = new Set([ast.typeLocal]);
    const use = (local: string | undefined) => {
      const binding = local === undefined ? undefined : ast.bindings.get(local);
      check(binding && !binding.typeOnly, 'unresolved-binding');
      used.add(binding.local);
      return binding;
    };
    for (const binding of ast.bindings.values()) {
      if (binding.typeOnly) continue;
      check(featureModule(binding.module, extension && qualification)
        || (extension && binding.module === 'self-composition/allowlist.js' && binding.export === 'allowlist'), 'allowlist-import');
    }
    let result = new Map<string, Handle>();
    let entries = ast.entries;
    if (extension) {
      check(entries.length === 2 && entries[0]?.spread && entries[1]?.handle, 'variant-extension');
      const base = use(present(entries[0]).spread);
      check(base.module === 'self-composition/allowlist.js' && base.export === 'allowlist', 'base-import');
      result = new Map(await read(basePath, depth + 1));
      entries = entries.slice(1);
    } else check(entries.every(entry => entry.handle), 'base-spread');
    const localNames = new Set([...result.values()].map(handle => handle.localName));
    for (const entry of entries) {
      check(entry.handle !== undefined, 'base-spread');
      const key = use(entry.key);
      const declared = use(entry.handle.get('declaration'));
      const factory = use(entry.handle.get('factory'));
      const keyExports = await namespace(key.module, 'declaration', extension);
      const id = keyExports.get(key.export);
      const candidates = [...keyExports].filter(([, value]) => record(value) && value.kind === 'get-modular.module-declaration'
        && portable(id) && value.implementationId === id);
      if (candidates.length !== 1) {
        const actualExports = await namespace(declared.module, 'declaration', extension);
        const actualDeclaration = actualExports.get(declared.export);
        check(record(actualDeclaration) && portable(actualDeclaration.implementationId), 'declaration-identity');
        const identities = [...actualExports].filter(([, value]) => value === actualDeclaration.implementationId);
        check(identities.length === 1, 'identity-export');
        corresponds(actualDeclaration.implementationId, 'implementationId', reference(declared.module, present(identities[0])[0]), key);
        throw invalid('declaration-identity');
      }
      const [declarationExport, declaration] = present(candidates[0]);
      check(portable(id), 'declaration-identity');
      localDeclaration(await textFile(packageRoot, sourcePath(key.module)), key.module, key.export, declarationExport);
      localDeclaration(await textFile(buildRoot, key.module), key.module, key.export, declarationExport);
      const declarationRef = reference(key.module, declarationExport);
      corresponds(id, 'declaration', declarationRef, declared);
      if (extension) check(declarationRef.module === `${variantDirectory}/declaration.js`, 'variant-entry');
      const factoryModule = posix.join(posix.dirname(key.module), 'factory.js');
      const exports = await namespace(factoryModule, 'factory', extension);
      const factories = [...exports].filter(([, value]) => typeof value === 'function');
      check(factories.length === 1 && bindingName(present(factories[0])[0]), 'factory-export');
      const factoryRef = reference(factoryModule, present(factories[0])[0]);
      corresponds(id, 'factory', factoryRef, factory);
      const factoryExport = entry.handle.get('factoryExport');
      let textualModule: string | null = null;
      try { textualModule = modulePath('src/composition/generated/stage1.ts', entry.handle.get('importPath')); }
      catch (error) { if (errorCode(error) !== invalidCode) throw error; }
      corresponds(id, 'importPath', factoryRef, reference(textualModule, factoryRef.export));
      corresponds(id, 'factoryExport', factoryRef, reference(textualModule, factoryExport));
      corresponds(id, 'declarationExport', declarationRef, reference(key.module, entry.handle.get('declarationExport')));
      const localName = entry.handle.get('localName');
      check(bindingName(localName) && !localNames.has(localName), 'allowlist-local-name');
      check(!result.has(id), 'duplicate-implementation');
      const maps = declarationMaps(declaration);
      localNames.add(localName);
      result.set(id, { declarationRef, factoryRef, localName, ...maps });
    }
    check(used.size === ast.bindings.size, 'unused-allowlist-import');
    return result;
  }
  return read(initialPath, 0);
}

function checkPlan(plan: unknown, handles: Map<string, Handle>) {
  fields(plan, ['kind', 'schemaVersion', 'profileId', 'roots', 'selections', 'bindings', 'dependencyOrder'], 'plan-shape');
  check(plan.kind === 'get-modular.composition-plan' && plan.schemaVersion === 1 && portable(plan.profileId), 'plan-shape');
  check(list(plan.roots) && plan.roots.length === 1 && plan.roots[0] === 'get-modular/compiler-facade'
    && list(plan.selections) && plan.selections.length > 0
    && list(plan.bindings) && list(plan.dependencyOrder), 'finite-plan-shape');
  const selected = new Map<string, Handle>();
  const modules = new Map<string, string>();
  const rows = new Map<string, Map<string, string>>();
  for (const selection of plan.selections) {
    fields(selection, ['moduleId', 'implementationId'], 'selection-shape');
    check(typeof selection.implementationId === 'string' && typeof selection.moduleId === 'string', 'selected-implementation');
    const handle = handles.get(selection.implementationId);
    check(handle && handle.declaration.moduleId === selection.moduleId
      && !selected.has(selection.implementationId) && !modules.has(selection.moduleId), 'selected-implementation');
    selected.set(selection.implementationId, handle);
    modules.set(selection.moduleId, selection.implementationId);
    rows.set(selection.implementationId, new Map<string, string>());
  }
  const facade = modules.get('get-modular/compiler-facade');
  check(facade !== undefined, 'selected-root');
  const position = new Map<string, number>();
  for (const [index, id] of plan.dependencyOrder.entries()) {
    check(typeof id === 'string' && selected.has(id) && !position.has(id), 'dependency-order');
    position.set(id, index);
  }
  check(position.size === selected.size, 'dependency-order');
  for (const binding of plan.bindings) {
    fields(binding, ['consumerImplementationId', 'slotId', 'providerImplementationIds', 'capabilityId', 'compatibility'], 'binding-shape');
    check(typeof binding.consumerImplementationId === 'string' && typeof binding.slotId === 'string', 'required-binding');
    const consumer = selected.get(binding.consumerImplementationId);
    const slot = consumer?.slots.get(binding.slotId);
    check(slot && list(binding.providerImplementationIds)
      && binding.providerImplementationIds.length === 1, 'required-binding');
    compatibility(binding.compatibility);
    const providerId = binding.providerImplementationIds[0];
    check(typeof providerId === 'string', 'binding-correspondence');
    const provider = selected.get(providerId);
    const provided = provider?.provides.get(slot.capabilityId);
    check(provided && binding.capabilityId === slot.capabilityId
      && sameCompatibility(binding.compatibility, slot.compatibility)
      && sameCompatibility(provided.compatibility, slot.compatibility), 'binding-correspondence');
    check(present(position.get(providerId), 'provider-order') < present(position.get(binding.consumerImplementationId), 'provider-order'), 'provider-order');
    const bindings = present(rows.get(binding.consumerImplementationId));
    check(!bindings.has(binding.slotId), 'duplicate-plan-binding');
    bindings.set(binding.slotId, providerId);
  }
  for (const [id, handle] of selected) check(present(rows.get(id)).size === handle.slots.size, 'missing-plan-binding');
  const reached = new Set<string>();
  const pending = [facade];
  while (pending.length) {
    const id = present(pending.pop());
    if (reached.has(id)) continue;
    reached.add(id);
    pending.push(...present(rows.get(id)).values());
  }
  check(reached.size === selected.size, 'unreachable-selection');
  return { selected, rows, facade, dependencyOrder: plan.dependencyOrder };
}
function declaresType(source: string, name: string) {
  const items = tokens(source);
  const stack: string[] = [];
  const delimiters = new Map([['{', '}'], ['[', ']'], ['(', ')']]);
  let count = 0;
  for (let index = 0; index < items.length; index += 1) {
    const word = present(items[index]).text;
    if (stack.length === 0 && word === 'export' && ['interface', 'type'].includes(items[index + 1]?.text ?? '')
      && items[index + 2]?.text === name) count += 1;
    if (delimiters.has(word)) stack.push(present(delimiters.get(word)));
    else if (['}', ']', ')'].includes(word)) check(stack.pop() === word, 'port-declaration');
  }
  check(stack.length === 0 && count === 1, 'provided-port-export');
}
async function providedPort(packageRoot: string, buildRoot: string, facade: Handle) {
  // Read only the pinned build's declaration signature, not factory bodies or
  // runtime return values. This finite signature has one typed deps parameter.
  const path = declarationPath(facade.factoryRef.module);
  const parser = new Parser(await textFile(buildRoot, path));
  const imported = imports(parser, path, new Set<string>());
  check(imported.groups.every(group => group.typeOnly), 'factory-signature-import');
  parser.need('export', 'declare', 'function');
  check(parser.identifier() === facade.factoryRef.export, 'factory-signature');
  parser.need('(');
  if (parser.peek() === '{') parser.list('{', '}', () => parser.identifier());
  else parser.identifier();
  parser.need(':');
  const deps = imported.bindings.get(parser.identifier());
  parser.need(')', ':');
  const provided = imported.bindings.get(parser.identifier());
  parser.need(';');
  parser.end();
  const parts = facade.declarationRef.module.split('/');
  const portModule = parts.slice(0, 3).join('/') + '/ports.js';
  check(deps?.typeOnly && provided?.typeOnly && deps.module === portModule && provided.module === portModule, 'factory-provided-port');
  declaresType(await textFile(packageRoot, sourcePath(portModule)), provided.export);
  return provided;
}

/**
 * Independent required-slot M1 source witness. buildRoot is the caller's
 * existing original build, mirroring package-relative paths. Mutation fixtures
 * change source copies and supply a separate original namespace mapping.
 * No compiler algorithm, production canonicalizer, root, or allowlist executes.
 */
export async function verifyConstruction({ packageRoot, buildRoot, compositionPath, allowlistPath, plan, qualification = false }: WitnessInput): Promise<ConstructionWitness> {
  check(version === '7.0.2', 'pinned-typescript');
  check(typeof qualification === 'boolean', 'qualification-flag');
  check(relativePath(compositionPath) && compositionPath.endsWith('.ts')
    && relativePath(allowlistPath) && allowlistPath.endsWith('.ts'), 'source-path');
  packageRoot = await directory(packageRoot);
  buildRoot = await directory(buildRoot);
  const ast = parseRoot(await textFile(packageRoot, compositionPath), compositionPath);
  return verifyRoot({ packageRoot, buildRoot, ast, allowlistPath, plan, qualification });
}

/**
 * Production W0 proof before publication. Only the candidate root is supplied
 * as text; allowlist correspondence still uses real source and original built
 * feature namespaces. The designated destination is never inspected or read.
 * This private text entry has a 1 MiB UTF-8 budget and requires lossless LF text.
 */
export async function verifyGeneratedConstruction({
  sourceText, packageRoot, buildRoot, allowlistPath, plan, ...unsupported
}: GeneratedWitnessInput): Promise<ConstructionWitness> {
  check(Object.keys(unsupported).length === 0, 'generated-options');
  check(version === '7.0.2', 'pinned-typescript');
  check(typeof sourceText === 'string', 'generated-text');
  // Bound work before checking encoding or allocating scanner tokens.
  check(sourceText.length <= generatedTextByteLimit, 'generated-text-size');
  check(sourceText.isWellFormed() && !/[\r\u0000\ufeff]/u.test(sourceText), 'generated-text-encoding');
  check(Buffer.byteLength(sourceText, 'utf8') <= generatedTextByteLimit, 'generated-text-size');
  check(relativePath(allowlistPath) && allowlistPath.endsWith('.ts'), 'source-path');
  const ast = parseRoot(sourceText, generatedPath);
  const sourceRoot = await directory(packageRoot);
  const originalBuild = await directory(buildRoot);
  return verifyRoot({
    packageRoot: sourceRoot, buildRoot: originalBuild, ast, allowlistPath, plan, qualification: false,
  });
}

// Both entry points use the same full-allowlist correspondence and tuple proof.
// Source acquisition and the production text policy are their only differences.
async function verifyRoot({
  packageRoot, buildRoot, ast, allowlistPath, plan, qualification,
}: { packageRoot: string; buildRoot: string; ast: RootSyntax; allowlistPath: string; plan: unknown; qualification: boolean }): Promise<ConstructionWitness> {
  const handles = await readHandles(packageRoot, buildRoot, allowlistPath, qualification);
  const { selected, rows, facade, dependencyOrder } = checkPlan(plan, handles);
  const typeGroups = ast.groups.filter(group => group.typeOnly);
  check(typeGroups.length === 1 && typeGroups[0]?.specifiers.length === 1, 'root-type-import');
  const type = ast.bindings.get(ast.port);
  check(type?.typeOnly && present(present(typeGroups[0]).specifiers[0]).local === ast.port, 'root-type-annotation');
  const expectedPort = await providedPort(packageRoot, buildRoot, present(selected.get(facade)));
  check(type.module === expectedPort.module && type.export === expectedPort.export, 'root-provided-port');
  const factoryIndex = new Map<string, Map<string, string>>();
  for (const [id, handle] of handles) {
    let exports = factoryIndex.get(handle.factoryRef.module);
    if (!exports) { exports = new Map<string, string>(); factoryIndex.set(handle.factoryRef.module, exports); }
    check(!exports.has(handle.factoryRef.export), 'ambiguous-factory');
    exports.set(handle.factoryRef.export, id);
  }
  const callees = new Map<string, string>();
  const importedIds = new Set<string>();
  for (const binding of ast.bindings.values()) {
    if (binding.typeOnly) continue;
    const id = factoryIndex.get(binding.module)?.get(binding.export);
    check(typeof id === 'string' && selected.has(id) && !importedIds.has(id), 'root-factory-import');
    importedIds.add(id);
    callees.set(binding.local, id);
  }
  check(importedIds.size === selected.size && ast.constructions.length === selected.size, 'construction-count');
  const locals = new Map<string, string>();
  const tuples: ConstructionTuple[] = [];
  for (const [index, construction] of ast.constructions.entries()) {
    const id = callees.get(construction.factory);
    check(id !== undefined && id === dependencyOrder[index], 'construction-order');
    const expected = present(rows.get(id));
    check(construction.slots.size === expected.size, 'construction-slots');
    const pairs: [string, string][] = [];
    for (const [slot, providerLocal] of construction.slots) {
      const provider = locals.get(providerLocal);
      check(expected.has(slot) && provider !== undefined && provider === expected.get(slot), 'construction-provider');
      pairs.push([slot, provider]);
    }
    pairs.sort((left, right) => left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0);
    tuples.push([id, index, pairs]);
    locals.set(construction.local, id);
  }
  check(locals.get(ast.value) === facade, 'exported-facade');
  const bytes = canonicalize(tuples);
  check(typeof bytes === 'string', 'canonical-tuples');
  return { tuples, digest: `sha256:${createHash('sha256').update(bytes, 'utf8').digest('hex')}` };
}
