import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { version } from "typescript";
import { API, type Checker, type Diagnostic, type Snapshot } from "typescript/unstable/async";
import { createVirtualFileSystem } from "typescript/unstable/fs";
import * as syntax from "typescript/unstable/ast";

export { syntax };
export const { SyntaxKind } = syntax;
interface TextEdit { readonly start: number; readonly end: number; readonly text: string }
interface ProjectOptions { readonly directory?: string; readonly tsConfigFilePath?: string; readonly isolated?: boolean }
const documents = new WeakMap<syntax.SourceFile, CodemodFile>();
export const fileOf = (node: syntax.Node): CodemodFile => {
  const file = documents.get(node.getSourceFile());
  assert(file, "codemod node must belong to its project");
  return file;
};
export const lineNumber = (node: syntax.Node) => node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1;
export const parentOfKind = (node: syntax.Node, kind: syntax.SyntaxKind) => node.parent?.kind === kind ? node.parent : undefined;
export const importedName = (specifier: syntax.ImportSpecifier | syntax.ExportSpecifier) => (specifier.propertyName ?? specifier.name).getText();
export const importNames = (declaration: syntax.ImportDeclaration) => declaration.importClause?.namedBindings?.kind === SyntaxKind.NamedImports
  ? declaration.importClause.namedBindings.elements : [];
export const namespaceName = (declaration: syntax.ImportDeclaration) => declaration.importClause?.namedBindings?.kind === SyntaxKind.NamespaceImport
  ? declaration.importClause.namedBindings.name : undefined;
export const exportNames = (declaration: syntax.ExportDeclaration) => declaration.exportClause?.kind === SyntaxKind.NamedExports ? declaration.exportClause.elements : [];
export const moduleName = (declaration: syntax.ImportDeclaration | syntax.ExportDeclaration) => {
  const specifier = declaration.moduleSpecifier;
  return specifier && syntax.isStringLiteralLikeNode(specifier) ? specifier.text : undefined;
};
export const typeOnly = (declaration: syntax.ImportDeclaration | syntax.ExportDeclaration) => syntax.isImportDeclaration(declaration)
  ? declaration.importClause?.phaseModifier === SyntaxKind.TypeKeyword : declaration.isTypeOnly ?? false;
export async function symbolDeclarations(node: syntax.Node): Promise<syntax.Node[]> {
  const symbol = await fileOf(node).checker.getSymbolAtLocation(node);
  const declarations: syntax.Node[] = [];
  for (const handle of symbol?.declarations ?? []) {
    const declaration = await handle.resolve();
    if (declaration !== undefined) { declarations.push(declaration); }
  }
  return declarations;
}

// These codemods inspect the pinned compiler's actual nodes and symbols. Text edits
// are applied only at inspected ranges; untouched source, including trivia, stays exact.
export class CodemodProject {
  readonly #api: API;
  #snapshot: Snapshot | undefined;
  readonly #config: string;
  readonly #fs: ReturnType<typeof createVirtualFileSystem>;
  readonly #files: CodemodFile[];
  private constructor(files: Iterable<readonly [string, string]>, { directory = process.cwd(), tsConfigFilePath, isolated = false }: ProjectOptions = {}) {
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
      const fileExists = fs.fileExists!;
      const directoryExists = fs.directoryExists!;
      fs.fileExists = name => fileExists(name) || undefined;
      fs.directoryExists = name => directoryExists(name) || undefined;
    }
    if (isolated) {
      const readFile = fs.readFile!;
      const entries = fs.getAccessibleEntries!;
      fs.readFile = name => readFile(name) ?? null;
      fs.getAccessibleEntries = name => entries(name) ?? { files: [], directories: [] };
    }
    const require = createRequire(import.meta.url);
    const compiler = require.resolve("typescript/package.json");
    const native = createRequire(compiler).resolve(`@typescript/typescript-${process.platform}-${process.arch}/package.json`);
    const manifest = JSON.parse(readFileSync(native, "utf8")) as { readonly version?: unknown };
    assert.equal(manifest.version, version);
    this.#api = new API({ cwd: resolve(directory), fs,
      tsserverPath: join(dirname(native), "lib", process.platform === "win32" ? "tsc.exe" : "tsc") });
  }
  static async create(files: Iterable<readonly [string, string]>, options: ProjectOptions = {}): Promise<CodemodProject> {
    const project = new CodemodProject(files, options);
    try { await project.#refresh(); return project; }
    catch (error) { await project.close(); throw error; }
  }
  get files() { return this.#files; }
  async #refresh(changed?: string) {
    const previous = this.#snapshot;
    this.#snapshot = await this.#api.updateSnapshot(changed
      ? { fileChanges: { changed: [changed] } } : { openProjects: [this.#config] });
    const project = this.#snapshot.getProject(this.#config);
    assert(project, "codemod project must be available");
    for (const file of this.#files) {
      const source = await project.program.getSourceFile(file.path);
      assert(source, `codemod source must be available: ${file.path}`);
      file.source = source;
      file.checker = project.checker;
      file.diagnostics = await project.program.getSyntacticDiagnostics(file.path);
      documents.set(file.source, file);
    }
    await previous?.dispose();
  }
  async update(file: CodemodFile, text: string) {
    this.#fs.writeFile!(file.path, text);
    file.text = text;
    await this.#refresh(file.path);
  }
  async close() {
    try { await this.#snapshot?.dispose(); }
    finally { await this.#api.close(); }
  }
}

export class CodemodFile {
  readonly #project: CodemodProject;
  readonly path: string;
  text: string;
  declare source: syntax.SourceFile;
  declare checker: Checker;
  declare diagnostics: readonly Diagnostic[];
  constructor(project: CodemodProject, path: string, text: string) { this.#project = project; this.path = path.replaceAll("\\", "/"); this.text = text; }
  get imports() { return this.source.statements.filter(syntax.isImportDeclaration); }
  get exports() { return this.source.statements.filter(syntax.isExportDeclaration); }
  descendants(kind: syntax.SyntaxKind) {
    const found: syntax.Node[] = [];
    const visit = (node: syntax.Node) => { if (node.kind === kind) { found.push(node); } node.forEachChild(visit); };
    this.source.forEachChild(visit);
    return found;
  }
  async apply(edits: readonly TextEdit[]) {
    if (edits.length === 0) { return; }
    let text = this.text;
    let boundary = text.length;
    for (const { start, end, text: replacement } of edits.toSorted((a, b) => b.start - a.start || b.end - a.end)) {
      assert(start >= 0 && start <= end && end <= boundary, "codemod edits must be disjoint inspected ranges");
      text = text.slice(0, start) + replacement + text.slice(end);
      boundary = start;
    }
    await this.#project.update(this, text);
  }
  save() {
    assert.equal(this.diagnostics.length, 0, `refusing to write source that does not parse: ${this.path}`);
    writeFileSync(this.path, this.text);
  }
}

export const replaceNode = (node: syntax.Node, text: string): TextEdit => ({ start: node.getStart(), end: node.end, text });

// Add to an existing import without printing unrelated syntax. Existing multiline
// imports keep their indentation and trailing-comma convention.
export function addNamedImport(file: CodemodFile, declaration: syntax.ImportDeclaration, name: string): TextEdit {
  const bindings = declaration.importClause?.namedBindings;
  assert(bindings?.kind === SyntaxKind.NamedImports, "a named import is required");
  const names = importNames(declaration);
  const last = names.at(-1);
  if (!last) { return { start: bindings.getStart() + 1, end: bindings.getStart() + 1, text: ` ${name}` }; }
  const tail = file.text.slice(last.end, bindings.end - 1);
  // Comments may precede a trailing comma or contain punctuation and newlines.
  // Only actual tokens can separate a specifier or locate the closing line.
  const scanner = syntax.createScanner(false, syntax.LanguageVariant.Standard, tail);
  let commaEnd;
  let closingLine;
  for (let kind = scanner.scan(); kind !== SyntaxKind.EndOfFile; kind = scanner.scan()) {
    if (kind === SyntaxKind.CommaToken) { commaEnd = scanner.getTokenEnd(); }
    if (kind === SyntaxKind.NewLineTrivia) { closingLine = scanner.getTokenEnd(); }
  }
  if (closingLine !== undefined && closingLine > (commaEnd ?? 0)) {
    const indentation = /^[^\S\r\n]*/u.exec(file.text.slice(file.text.lastIndexOf("\n", last.getStart()) + 1))![0];
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

export function removeNamedImports(file: CodemodFile, declaration: syntax.ImportDeclaration, removed: ReadonlySet<syntax.ImportSpecifier>): TextEdit | readonly TextEdit[] {
  const bindings = declaration.importClause?.namedBindings;
  assert(bindings?.kind === SyntaxKind.NamedImports, "a named import is required");
  const names = importNames(declaration);
  const kept = names.filter(name => !removed.has(name));
  if (kept.length === 0) { return replaceNode(bindings, "{}"); }
  const edits: TextEdit[] = [];
  for (let index = 0; index < names.length; index += 1) {
    if (!removed.has(names[index]!)) { continue; }
    const start = index;
    while (index + 1 < names.length && removed.has(names[index + 1]!)) { index += 1; }
    if (index + 1 < names.length) { edits.push({ start: names[start]!.getStart(), end: names[index + 1]!.getStart(), text: "" }); }
    else {
      const comma = /^\s*,/u.exec(file.text.slice(names[index]!.end, bindings.end - 1));
      edits.push({ start: names[start - 1]!.end, end: names[index]!.end + (comma?.[0].length ?? 0), text: "" });
    }
  }
  return edits;
}
