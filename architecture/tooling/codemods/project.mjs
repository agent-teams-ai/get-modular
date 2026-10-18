import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { version } from "typescript";
import { API } from "typescript/unstable/sync";
import { createVirtualFileSystem } from "typescript/unstable/fs";
import * as syntax from "typescript/unstable/ast";

export { syntax };
export const { SyntaxKind } = syntax;
const documents = new WeakMap();
export const fileOf = node => documents.get(node.getSourceFile());
export const lineNumber = node => node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1;
export const parentOfKind = (node, kind) => node.parent?.kind === kind ? node.parent : undefined;
export const importedName = specifier => (specifier.propertyName ?? specifier.name).getText();
export const importNames = declaration => declaration.importClause?.namedBindings?.kind === SyntaxKind.NamedImports
  ? declaration.importClause.namedBindings.elements : [];
export const namespaceName = declaration => declaration.importClause?.namedBindings?.kind === SyntaxKind.NamespaceImport
  ? declaration.importClause.namedBindings.name : undefined;
export const exportNames = declaration => declaration.exportClause?.kind === SyntaxKind.NamedExports ? declaration.exportClause.elements : [];
export const moduleName = declaration => declaration.moduleSpecifier?.text;
export const typeOnly = declaration => declaration.importClause?.isTypeOnly ?? declaration.isTypeOnly ?? false;
export const symbolDeclarations = node => fileOf(node).checker.getSymbolAtLocation(node)?.declarations
  .map(handle => handle.resolve()).filter(Boolean) ?? [];

// These codemods inspect the pinned compiler's actual nodes and symbols. Text edits
// are applied only at inspected ranges; untouched source, including trivia, stays exact.
export class CodemodProject {
  #api;
  #snapshot;
  #config;
  #fs;
  #files;
  constructor(files, { directory = process.cwd(), tsConfigFilePath, isolated = false } = {}) {
    assert.equal(version, "7.0.2", "codemods use the exact pinned TypeScript compiler");
    this.#files = [...files].map(([path, text]) => new CodemodFile(this, resolve(path), text));
    this.#config = join(resolve(directory), "__get_modular_codemod__.json").replaceAll("\\", "/");
    const contents = Object.fromEntries(this.#files.map(file => [file.path, file.text]));
    contents[this.#config] = JSON.stringify({
      ...(tsConfigFilePath ? { extends: tsConfigFilePath } : {}),
      compilerOptions: { allowJs: true, noEmit: true, noLib: true, types: [],
        target: "ESNext", module: "ESNext", moduleResolution: "Bundler", jsx: "preserve" },
      files: this.#files.map(file => file.path), include: [], exclude: [],
    });
    const fs = createVirtualFileSystem(contents);
    this.#fs = fs;
    if (!isolated) {
      // Overlay the selected sources while allowing the consumer's real config,
      // imports and declaration files to resolve through the native host.
      const fileExists = fs.fileExists;
      const directoryExists = fs.directoryExists;
      fs.fileExists = name => fileExists(name) || undefined;
      fs.directoryExists = name => directoryExists(name) || undefined;
    }
    if (isolated) {
      const readFile = fs.readFile;
      const entries = fs.getAccessibleEntries;
      fs.readFile = name => readFile(name) ?? null;
      fs.getAccessibleEntries = name => entries(name) ?? { files: [], directories: [] };
    }
    const require = createRequire(import.meta.url);
    const compiler = require.resolve("typescript/package.json");
    const native = createRequire(compiler).resolve(`@typescript/typescript-${process.platform}-${process.arch}/package.json`);
    assert.equal(JSON.parse(readFileSync(native, "utf8")).version, version);
    this.#api = new API({ cwd: resolve(directory), fs,
      tsserverPath: join(dirname(native), "lib", process.platform === "win32" ? "tsc.exe" : "tsc") });
    try { this.#refresh(); } catch (error) { this.close(); throw error; }
  }
  get files() { return this.#files; }
  #refresh(changed) {
    const previous = this.#snapshot;
    this.#snapshot = this.#api.updateSnapshot(changed
      ? { fileChanges: { changed: [changed] } } : { openProjects: [this.#config] });
    const project = this.#snapshot.getProject(this.#config);
    assert(project, "codemod project must be available");
    for (const file of this.#files) {
      file.source = project.program.getSourceFile(file.path);
      assert(file.source, `codemod source must be available: ${file.path}`);
      file.checker = project.checker;
      file.diagnostics = project.program.getSyntacticDiagnostics(file.path);
      documents.set(file.source, file);
    }
    previous?.dispose();
  }
  update(file, text) {
    this.#fs.writeFile(file.path, text);
    file.text = text;
    this.#refresh(file.path);
  }
  close() { this.#snapshot?.dispose(); this.#api.close(); }
}

export class CodemodFile {
  #project;
  constructor(project, path, text) { this.#project = project; this.path = path.replaceAll("\\", "/"); this.text = text; }
  get imports() { return this.source.statements.filter(syntax.isImportDeclaration); }
  get exports() { return this.source.statements.filter(syntax.isExportDeclaration); }
  descendants(kind) {
    const found = [];
    const visit = node => { if (node.kind === kind) found.push(node); node.forEachChild(visit); };
    this.source.forEachChild(visit);
    return found;
  }
  apply(edits) {
    if (edits.length === 0) return;
    let text = this.text;
    let boundary = text.length;
    for (const { start, end, text: replacement } of edits.toSorted((a, b) => b.start - a.start || b.end - a.end)) {
      assert(start >= 0 && start <= end && end <= boundary, "codemod edits must be disjoint inspected ranges");
      text = text.slice(0, start) + replacement + text.slice(end);
      boundary = start;
    }
    this.#project.update(this, text);
  }
  save() {
    assert.equal(this.diagnostics.length, 0, `refusing to write source that does not parse: ${this.path}`);
    writeFileSync(this.path, this.text);
  }
}

export const replaceNode = (node, text) => ({ start: node.getStart(), end: node.end, text });

// Add to an existing import without printing unrelated syntax. Existing multiline
// imports keep their indentation and trailing-comma convention.
export function addNamedImport(file, declaration, name) {
  const bindings = declaration.importClause.namedBindings;
  const names = importNames(declaration);
  const last = names.at(-1);
  if (!last) return { start: bindings.getStart() + 1, end: bindings.getStart() + 1, text: ` ${name}` };
  const tail = file.text.slice(last.end, bindings.end - 1);
  // Comments may precede a trailing comma or contain punctuation and newlines.
  // Only actual tokens can separate a specifier or locate the closing line.
  const scanner = syntax.createScanner(false, syntax.LanguageVariant.Standard, tail);
  let commaEnd;
  let closingLine;
  for (let kind = scanner.scan(); kind !== SyntaxKind.EndOfFile; kind = scanner.scan()) {
    if (kind === SyntaxKind.CommaToken) commaEnd = scanner.getTokenEnd();
    if (kind === SyntaxKind.NewLineTrivia) closingLine = scanner.getTokenEnd();
  }
  if (closingLine !== undefined && closingLine > (commaEnd ?? 0)) {
    const indentation = /^[^\S\r\n]*/u.exec(file.text.slice(file.text.lastIndexOf("\n", last.getStart()) + 1))[0];
    const newline = file.text.includes("\r\n") ? "\r\n" : "\n";
    const trailingComma = commaEnd !== undefined;
    const beforeClosing = `${trailingComma ? "" : ","}${tail.slice(0, closingLine)}`;
    const closingIndent = tail.slice(closingLine);
    return { start: last.end, end: bindings.end - 1,
      text: `${beforeClosing}${indentation}${name}${trailingComma ? "," : ""}${newline}${closingIndent}` };
  }
  const position = last.end + (commaEnd ?? 0);
  return { start: position, end: position, text: commaEnd === undefined ? `, ${name}` : ` ${name},` };
}

export function removeNamedImports(file, declaration, removed) {
  const names = importNames(declaration);
  const kept = names.filter(name => !removed.has(name));
  if (kept.length === 0) return replaceNode(declaration.importClause.namedBindings, "{}");
  const edits = [];
  for (let index = 0; index < names.length; index += 1) {
    if (!removed.has(names[index])) continue;
    const start = index;
    while (index + 1 < names.length && removed.has(names[index + 1])) index += 1;
    if (index + 1 < names.length) edits.push({ start: names[start].getStart(), end: names[index + 1].getStart(), text: "" });
    else {
      const comma = /^\s*,/u.exec(file.text.slice(names[index].end, declaration.importClause.namedBindings.end - 1));
      edits.push({ start: names[start - 1].end, end: names[index].end + (comma?.[0].length ?? 0), text: "" });
    }
  }
  return edits;
}
