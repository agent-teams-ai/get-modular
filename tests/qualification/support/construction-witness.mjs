import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import canonicalize from 'canonicalize';
import { version } from 'typescript';
import { createScanner, SyntaxKind } from 'typescript/unstable/ast';

const invalidCode = 'witness.invalid-construction';
const correspondenceCode = 'witness.allowlist-correspondence';
const basePath = 'self-composition/allowlist.ts';
const variantPath = 'self-composition/allowlist.variant.ts';
const variantDirectory = 'tests/features/canonicalization/witness-variant';
const forbiddenSlots = new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype', 'then']);
const handleFields = ['declaration', 'factory', 'importPath', 'factoryExport', 'declarationExport', 'localName'];

function invalid(reason) {
  return Object.assign(new Error('Invalid finite construction witness input.'), {
    code: invalidCode, context: { reason },
  });
}
function check(condition, reason = 'syntax') {
  if (!condition) throw invalid(reason);
}
function portable(value) {
  return typeof value === 'string' && value.length <= 128
    && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+$/u.test(value);
}
function relativePath(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_./-]+$/u.test(value)
    && !isAbsolute(value) && !value.startsWith('../') && value !== '..'
    && posix.normalize(value) === value && !value.split('/').includes('.');
}
function modulePath(from, specifier) {
  check(typeof specifier === 'string' && /^\.\.?\/[A-Za-z0-9_./-]+\.js$/u.test(specifier), 'relative-import');
  const result = posix.normalize(posix.join(posix.dirname(from), specifier));
  check(relativePath(result), 'relative-import');
  return result;
}
function reference(module, exported) { return { module, export: exported }; }
function safeReference(value) {
  return {
    module: relativePath(value?.module) ? value.module : null,
    export: typeof value?.export === 'string' && /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(value.export)
      ? value.export : null,
  };
}
function corresponds(implementationId, field, expected, actual) {
  if (expected.module === actual?.module && expected.export === actual?.export) return;
  check(portable(implementationId), 'implementation-identity');
  throw Object.assign(new Error('Allowlist handle and source import disagree.'), {
    code: correspondenceCode,
    context: { implementationId, field, expected: safeReference(expected), actual: safeReference(actual) },
  });
}
function fields(value, expected, reason) {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), reason);
  const keys = Reflect.ownKeys(value);
  check(keys.length === expected.length && keys.every(key => expected.includes(key)), reason);
}

// Check skipped trivia as well: an unterminated comment or a reference directive
// cannot disappear behind the scanner's skipTrivia setting.
function trivia(source) {
  let index = 0;
  while (index < source.length) {
    if (/\s/u.test(source[index])) { index += 1; continue; }
    if (source.startsWith('//', index)) {
      let end = index + 2;
      while (end < source.length && !/[\r\n\u2028\u2029]/u.test(source[end])) end += 1;
      check(!/^\/\/\/\s*<reference\b/u.test(source.slice(index, end)), 'reference-directive');
      index = end;
    } else if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2);
      check(end !== -1, 'unterminated-comment');
      index = end + 2;
    } else throw invalid('scanner-trivia');
  }
}
function tokens(source) {
  const scanner = createScanner(true, undefined, source);
  const result = [];
  let previousEnd = 0;
  let braces = 0;
  const templates = [];
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
function bindingName(value) {
  if (value === 'eval' || value === 'arguments') return false;
  if (typeof value !== 'string' || !/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(value)) return false;
  const scanned = tokens(value);
  return scanned.length === 1 && scanned[0].kind === SyntaxKind.Identifier;
}
class Parser {
  constructor(source) { this.items = tokens(source); this.index = 0; }
  peek() { return this.items[this.index]?.text; }
  eat(text) {
    if (this.peek() !== text) return false;
    this.index += 1;
    return true;
  }
  need(...words) { for (const word of words) check(this.eat(word)); }
  identifier() {
    const item = this.items[this.index++];
    check(item?.kind === SyntaxKind.Identifier && /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(item.text));
    return item.text;
  }
  string() {
    const raw = this.items[this.index++]?.text;
    check(typeof raw === 'string' && raw.length >= 2);
    const quote = raw[0];
    check((quote === '"' || quote === "'") && raw.at(-1) === quote);
    const body = raw.slice(1, -1);
    check(!body.includes(quote) && !body.includes('\\') && !/[^\x20-\x7e]/u.test(body), 'unsupported-string-spelling');
    return body;
  }
  list(open, close, item) {
    this.need(open);
    const result = [];
    while (!this.eat(close)) {
      result.push(item());
      if (this.eat(close)) break;
      this.need(',');
    }
    return result;
  }
  end() { check(this.index === this.items.length); }
}
function claimName(names, name) {
  check(bindingName(name), 'invalid-binding');
  check(!names.has(name), 'duplicate-binding');
  names.add(name);
}
function imports(parser, from, names) {
  const bindings = new Map();
  const groups = [];
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
function parseRoot(source, path) {
  const parser = new Parser(source);
  const names = new Set(['root']);
  const imported = imports(parser, path, names);
  const constructions = [];
  while (parser.eat('const')) {
    const local = parser.identifier();
    claimName(names, local);
    parser.need('=');
    const factory = parser.identifier();
    parser.need('(');
    const slots = new Map();
    parser.list('{', '}', () => {
      const slot = parser.identifier();
      const provider = parser.eat(':') ? parser.identifier() : slot;
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
function parseAllowlist(source, path) {
  const parser = new Parser(source);
  const imported = imports(parser, path, new Set(['Map', 'ReadonlyMap', 'allowlist']));
  const typeGroups = imported.groups.filter(group => group.typeOnly);
  check(typeGroups.length === 1 && typeGroups[0].specifiers.length === 1, 'allowlist-type');
  const typeLocal = typeGroups[0].specifiers[0].local;
  const type = imported.bindings.get(typeLocal);
  check(type.export === 'AllowlistHandle' && type.module === 'self-composition/allowlist-types.js', 'allowlist-type');
  const generic = () => parser.need('<', 'string', ',', typeLocal, '>');
  parser.need('export', 'const', 'allowlist', ':', 'ReadonlyMap');
  generic();
  parser.need('=', 'new', 'Map');
  generic();
  parser.need('(');
  const entries = parser.list('[', ']', () => {
    if (parser.eat('...')) return { spread: parser.identifier() };
    parser.need('[');
    const key = parser.identifier();
    parser.need(',');
    const handle = new Map();
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
function localDeclaration(source, module, identityName, declarationName) {
  const parser = new Parser(source);
  const names = new Set(['Object']);
  imports(parser, module, names);
  const definitions = new Map();
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
    const close = [];
    const delimiters = new Map([['(', ')'], ['[', ']'], ['{', '}']]);
    while (parser.peek() !== ';' || close.length > 0) {
      const text = parser.peek();
      check(text !== undefined, 'nonlocal-declaration');
      if (delimiters.has(text)) close.push(delimiters.get(text));
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
    && [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral].includes(identity[0].kind);
  const templateIdentity = identity?.length === 3 && identity[0].kind === SyntaxKind.TemplateHead
    && identity[1].kind === SyntaxKind.Identifier && identity[2].kind === SyntaxKind.TemplateTail;
  check(literalIdentity || templateIdentity, 'nonlocal-declaration');
  check(declaration?.slice(0, 3).join(' ') === 'Object . freeze', 'nonlocal-declaration');
  let offset = 3;
  if (declaration[offset] === '<') {
    check(declaration[offset + 1] === 'ModuleDeclaration' && declaration[offset + 2] === '>', 'nonlocal-declaration');
    offset += 3;
  }
  check(declaration[offset] === '(' && declaration[offset + 1] === '{'
    && declaration.at(-2) === '}' && declaration.at(-1) === ')', 'nonlocal-declaration');
}
function featureModule(module, qualification) {
  return /^src\/features\/[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)?\/(?:declaration|factory)\.js$/u.test(module)
    || (qualification && (module === `${variantDirectory}/declaration.js` || module === `${variantDirectory}/factory.js`));
}
function compatibility(value) {
  fields(value, ['family', 'familyVersion', 'token'], 'compatibility');
  check(value.family === 'exact' && value.familyVersion === 1 && portable(value.token), 'compatibility');
}
function sameCompatibility(left, right) {
  return left.family === right.family && left.familyVersion === right.familyVersion && left.token === right.token;
}
function declarationMaps(declaration) {
  check(declaration?.kind === 'get-modular.module-declaration' && declaration.schemaVersion === 1
    && portable(declaration.moduleId) && portable(declaration.implementationId)
    && Array.isArray(declaration.slots) && Array.isArray(declaration.provides), 'declaration');
  const slots = new Map();
  const provides = new Map();
  for (const slot of declaration.slots) {
    check(typeof slot?.slotId === 'string' && /^[a-z][a-z0-9]{0,63}$/u.test(slot.slotId)
      && !forbiddenSlots.has(slot.slotId) && !slots.has(slot.slotId), 'declared-slot');
    fields(slot.cardinality, ['kind'], 'required-cardinality');
    check(slot.cardinality.kind === 'required' && portable(slot.capabilityId), 'required-cardinality');
    compatibility(slot.compatibility);
    slots.set(slot.slotId, slot);
  }
  for (const provided of declaration.provides) {
    check(portable(provided?.capabilityId) && !provides.has(provided.capabilityId), 'provided-capability');
    compatibility(provided.compatibility);
    provides.set(provided.capabilityId, provided);
  }
  return { slots, provides };
}
async function directory(path) {
  check(typeof path === 'string' && isAbsolute(path), 'absolute-directory');
  try {
    const actual = await realpath(path);
    check((await stat(actual)).isDirectory(), 'absolute-directory');
    return actual;
  } catch (error) {
    if (error.code === invalidCode) throw error;
    throw invalid('unavailable-directory');
  }
}
async function checkedFile(root, path) {
  check(relativePath(path), 'source-path');
  const target = resolve(root, ...path.split('/'));
  try {
    check(await realpath(target) === target, 'symlink-input');
    check((await stat(target)).isFile(), 'regular-file');
    return target;
  } catch (error) {
    if (error.code === invalidCode) throw error;
    throw invalid('unavailable-input');
  }
}
async function textFile(root, path) {
  const target = await checkedFile(root, path);
  try { return await readFile(target, 'utf8'); }
  catch { throw invalid('unavailable-input'); }
}
function sourcePath(module) { return module.slice(0, -3) + '.ts'; }
function declarationPath(module) { return module.slice(0, -3) + '.d.ts'; }

async function readHandles(packageRoot, buildRoot, initialPath, qualification) {
  const namespaces = new Map();
  const visited = new Set();
  async function namespace(module, role, allowTests) {
    check(featureModule(module, allowTests) && module.endsWith(`/${role}.js`), 'feature-layout');
    if (!namespaces.has(module)) {
      await checkedFile(packageRoot, sourcePath(module));
      const built = await checkedFile(buildRoot, module);
      try {
        // Only original feature namespaces are read. Neither source root nor
        // source/built allowlist is imported, and no factory is invoked.
        namespaces.set(module, new Map(Object.entries(await import(pathToFileURL(built).href))));
      } catch { throw invalid('unavailable-namespace'); }
    }
    return namespaces.get(module);
  }
  async function read(path, depth) {
    check(depth <= 1 && !visited.has(path), 'allowlist-cycle');
    visited.add(path);
    const extension = path === variantPath;
    check(!extension || qualification, 'qualification-only');
    const ast = parseAllowlist(await textFile(packageRoot, path), path);
    const used = new Set([ast.typeLocal]);
    const use = local => {
      const binding = ast.bindings.get(local);
      check(binding && !binding.typeOnly, 'unresolved-binding');
      used.add(local);
      return binding;
    };
    for (const binding of ast.bindings.values()) {
      if (binding.typeOnly) continue;
      check(featureModule(binding.module, extension && qualification)
        || (extension && binding.module === 'self-composition/allowlist.js' && binding.export === 'allowlist'), 'allowlist-import');
    }
    let result = new Map();
    let entries = ast.entries;
    if (extension) {
      check(entries.length === 2 && entries[0].spread && entries[1].handle, 'variant-extension');
      const base = use(entries[0].spread);
      check(base.module === 'self-composition/allowlist.js' && base.export === 'allowlist', 'base-import');
      result = new Map(await read(basePath, depth + 1));
      entries = entries.slice(1);
    } else check(entries.every(entry => entry.handle), 'base-spread');
    const localNames = new Set([...result.values()].map(handle => handle.localName));
    for (const entry of entries) {
      const key = use(entry.key);
      const declared = use(entry.handle.get('declaration'));
      const factory = use(entry.handle.get('factory'));
      const keyExports = await namespace(key.module, 'declaration', extension);
      const id = keyExports.get(key.export);
      const candidates = [...keyExports].filter(([, value]) => value?.kind === 'get-modular.module-declaration'
        && portable(id) && value.implementationId === id);
      if (candidates.length !== 1) {
        const actualExports = await namespace(declared.module, 'declaration', extension);
        const actualDeclaration = actualExports.get(declared.export);
        check(portable(actualDeclaration?.implementationId), 'declaration-identity');
        const identities = [...actualExports].filter(([, value]) => value === actualDeclaration.implementationId);
        check(identities.length === 1, 'identity-export');
        corresponds(actualDeclaration.implementationId, 'implementationId', reference(declared.module, identities[0][0]), key);
        throw invalid('declaration-identity');
      }
      const [declarationExport, declaration] = candidates[0];
      localDeclaration(await textFile(packageRoot, sourcePath(key.module)), key.module, key.export, declarationExport);
      localDeclaration(await textFile(buildRoot, key.module), key.module, key.export, declarationExport);
      const declarationRef = reference(key.module, declarationExport);
      corresponds(id, 'declaration', declarationRef, declared);
      if (extension) check(declarationRef.module === `${variantDirectory}/declaration.js`, 'variant-entry');
      const factoryModule = posix.join(posix.dirname(key.module), 'factory.js');
      const exports = await namespace(factoryModule, 'factory', extension);
      const factories = [...exports].filter(([, value]) => typeof value === 'function');
      check(factories.length === 1 && bindingName(factories[0][0]), 'factory-export');
      const factoryRef = reference(factoryModule, factories[0][0]);
      corresponds(id, 'factory', factoryRef, factory);
      const factoryExport = entry.handle.get('factoryExport');
      let textualModule = null;
      try { textualModule = modulePath('src/composition/generated/stage1.ts', entry.handle.get('importPath')); }
      catch (error) { if (error.code !== invalidCode) throw error; }
      corresponds(id, 'importPath', factoryRef, reference(textualModule, factoryRef.export));
      corresponds(id, 'factoryExport', factoryRef, reference(textualModule, factoryExport));
      corresponds(id, 'declarationExport', declarationRef, reference(key.module, entry.handle.get('declarationExport')));
      const localName = entry.handle.get('localName');
      check(bindingName(localName) && !localNames.has(localName), 'allowlist-local-name');
      check(!result.has(id), 'duplicate-implementation');
      const maps = declarationMaps(declaration);
      localNames.add(localName);
      result.set(id, { declaration, declarationRef, factoryRef, localName, ...maps });
    }
    check(used.size === ast.bindings.size, 'unused-allowlist-import');
    return result;
  }
  return read(initialPath, 0);
}

function checkPlan(plan, handles) {
  fields(plan, ['kind', 'schemaVersion', 'profileId', 'roots', 'selections', 'bindings', 'dependencyOrder'], 'plan-shape');
  check(plan.kind === 'get-modular.composition-plan' && plan.schemaVersion === 1 && portable(plan.profileId), 'plan-shape');
  check(Array.isArray(plan.roots) && plan.roots.length === 1 && plan.roots[0] === 'get-modular/compiler-facade'
    && Array.isArray(plan.selections) && plan.selections.length > 0
    && Array.isArray(plan.bindings) && Array.isArray(plan.dependencyOrder), 'finite-plan-shape');
  const selected = new Map();
  const modules = new Map();
  const rows = new Map();
  for (const selection of plan.selections) {
    fields(selection, ['moduleId', 'implementationId'], 'selection-shape');
    const handle = handles.get(selection.implementationId);
    check(handle && handle.declaration.moduleId === selection.moduleId
      && !selected.has(selection.implementationId) && !modules.has(selection.moduleId), 'selected-implementation');
    selected.set(selection.implementationId, handle);
    modules.set(selection.moduleId, selection.implementationId);
    rows.set(selection.implementationId, new Map());
  }
  const facade = modules.get(plan.roots[0]);
  check(facade !== undefined, 'selected-root');
  const position = new Map();
  for (const [index, id] of plan.dependencyOrder.entries()) {
    check(selected.has(id) && !position.has(id), 'dependency-order');
    position.set(id, index);
  }
  check(position.size === selected.size, 'dependency-order');
  for (const binding of plan.bindings) {
    fields(binding, ['consumerImplementationId', 'slotId', 'providerImplementationIds', 'capabilityId', 'compatibility'], 'binding-shape');
    const consumer = selected.get(binding.consumerImplementationId);
    const slot = consumer?.slots.get(binding.slotId);
    check(slot && Array.isArray(binding.providerImplementationIds)
      && binding.providerImplementationIds.length === 1, 'required-binding');
    compatibility(binding.compatibility);
    const providerId = binding.providerImplementationIds[0];
    const provider = selected.get(providerId);
    const provided = provider?.provides.get(slot.capabilityId);
    check(provided && binding.capabilityId === slot.capabilityId
      && sameCompatibility(binding.compatibility, slot.compatibility)
      && sameCompatibility(provided.compatibility, slot.compatibility), 'binding-correspondence');
    check(position.get(providerId) < position.get(binding.consumerImplementationId), 'provider-order');
    const bindings = rows.get(binding.consumerImplementationId);
    check(!bindings.has(binding.slotId), 'duplicate-plan-binding');
    bindings.set(binding.slotId, providerId);
  }
  for (const [id, handle] of selected) check(rows.get(id).size === handle.slots.size, 'missing-plan-binding');
  const reached = new Set();
  const pending = [facade];
  while (pending.length) {
    const id = pending.pop();
    if (reached.has(id)) continue;
    reached.add(id);
    pending.push(...rows.get(id).values());
  }
  check(reached.size === selected.size, 'unreachable-selection');
  return { selected, rows, facade };
}
function declaresType(source, name) {
  const items = tokens(source);
  const stack = [];
  const delimiters = new Map([['{', '}'], ['[', ']'], ['(', ')']]);
  let count = 0;
  for (let index = 0; index < items.length; index += 1) {
    const word = items[index].text;
    if (stack.length === 0 && word === 'export' && ['interface', 'type'].includes(items[index + 1]?.text)
      && items[index + 2]?.text === name) count += 1;
    if (delimiters.has(word)) stack.push(delimiters.get(word));
    else if (['}', ']', ')'].includes(word)) check(stack.pop() === word, 'port-declaration');
  }
  check(stack.length === 0 && count === 1, 'provided-port-export');
}
async function providedPort(packageRoot, buildRoot, facade) {
  // Read only the pinned build's declaration signature, not factory bodies or
  // runtime return values. This finite signature has one typed deps parameter.
  const path = declarationPath(facade.factoryRef.module);
  const parser = new Parser(await textFile(buildRoot, path));
  const imported = imports(parser, path, new Set());
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
export async function verifyConstruction({ packageRoot, buildRoot, compositionPath, allowlistPath, plan, qualification = false }) {
  check(version === '7.0.2', 'pinned-typescript');
  check(typeof qualification === 'boolean', 'qualification-flag');
  check(relativePath(compositionPath) && compositionPath.endsWith('.ts')
    && relativePath(allowlistPath) && allowlistPath.endsWith('.ts'), 'source-path');
  packageRoot = await directory(packageRoot);
  buildRoot = await directory(buildRoot);
  const ast = parseRoot(await textFile(packageRoot, compositionPath), compositionPath);
  const handles = await readHandles(packageRoot, buildRoot, allowlistPath, qualification);
  const { selected, rows, facade } = checkPlan(plan, handles);
  const typeGroups = ast.groups.filter(group => group.typeOnly);
  check(typeGroups.length === 1 && typeGroups[0].specifiers.length === 1, 'root-type-import');
  const type = ast.bindings.get(ast.port);
  check(type?.typeOnly && typeGroups[0].specifiers[0].local === ast.port, 'root-type-annotation');
  const expectedPort = await providedPort(packageRoot, buildRoot, selected.get(facade));
  check(type.module === expectedPort.module && type.export === expectedPort.export, 'root-provided-port');
  const factoryIndex = new Map();
  for (const [id, handle] of handles) {
    let exports = factoryIndex.get(handle.factoryRef.module);
    if (!exports) { exports = new Map(); factoryIndex.set(handle.factoryRef.module, exports); }
    check(!exports.has(handle.factoryRef.export), 'ambiguous-factory');
    exports.set(handle.factoryRef.export, id);
  }
  const callees = new Map();
  const importedIds = new Set();
  for (const binding of ast.bindings.values()) {
    if (binding.typeOnly) continue;
    const id = factoryIndex.get(binding.module)?.get(binding.export);
    check(selected.has(id) && !importedIds.has(id), 'root-factory-import');
    importedIds.add(id);
    callees.set(binding.local, id);
  }
  check(importedIds.size === selected.size && ast.constructions.length === selected.size, 'construction-count');
  const locals = new Map();
  const tuples = [];
  for (const [index, construction] of ast.constructions.entries()) {
    const id = callees.get(construction.factory);
    check(id !== undefined && id === plan.dependencyOrder[index], 'construction-order');
    const expected = rows.get(id);
    check(construction.slots.size === expected.size, 'construction-slots');
    const pairs = [];
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
