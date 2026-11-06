import type { CodemodFile } from "../project.ts";
import { syntax as Node, SyntaxKind, importNames, namespaceName, moduleName, typeOnly,
  removeNamedImports, replaceNode } from "../project.ts";

// Migration-specific package identities; the live v0.4-to-v0.5 transforms use the same names.
export const ASSEMBLY = "@get-modular/assembly";
export const RESOURCES = "@get-modular/resources";

// Preserve the pre-rewrite import-use snapshot so cleanup never removes a previously unused import.
type ImportTarget = Node.ImportSpecifier | Node.Identifier;
type Edit = ReturnType<typeof replaceNode>;

function usedImport(file: CodemodFile, target: ImportTarget) {
  const local = Node.isImportSpecifier(target) ? target.name.getText() : target.getText();
  return file.descendants(SyntaxKind.Identifier).filter(Node.isIdentifier).some((identifier) => {
    if (Node.isImportSpecifier(target) && (identifier === target.name || identifier === target.propertyName)) return false;
    if (identifier.getText() !== local) return false;
    return true;
  });
}

const localName = (target: ImportTarget) => Node.isImportSpecifier(target) ? target.name.getText() : target.getText();
// Imports that were in use before any rewrite. Only these may be dropped when the rewrite leaves them unused.
const importsInUse = new WeakMap<CodemodFile, { names: Set<string>; bare: Set<number> }>();

/** Call before the first rewrite of a file. */
export function recordImports(file: CodemodFile) {
  const names = new Set<string>();
  const bare = new Set<number>();
  file.imports.forEach((declaration, index) => {
    if (![ASSEMBLY, RESOURCES].some(module => module === moduleName(declaration))) return;
    const namespace = namespaceName(declaration);
    const specifiers = [...importNames(declaration), ...(namespace ? [namespace] : [])];
    if (specifiers.length === 0 && !declaration.importClause?.name) bare.add(index);
    for (const specifier of specifiers) {
      if (usedImport(file, specifier)) names.add(`${moduleName(declaration)}|${localName(specifier)}`);
    }
  });
  importsInUse.set(file, { names, bare });
}

export async function transformImports(file: CodemodFile) {
  const recorded = importsInUse.get(file);
  if (!recorded) return 0;
  let edits = 0;
  const replacements: Edit[] = [];
  for (const [index, declaration] of file.imports.entries()) {
    const module = moduleName(declaration);
    if (![ASSEMBLY, RESOURCES].some(name => name === module) || recorded.bare.has(index)) continue;
    const dropped = (specifier: ImportTarget) => recorded.names.has(`${module}|${localName(specifier)}`) && !usedImport(file, specifier);
    const names = importNames(declaration);
    const removed = new Set(names.filter(dropped));
    const namespace = namespaceName(declaration);
    const dropNamespace = namespace && dropped(namespace);
    const count = removed.size + (dropNamespace ? 1 : 0);
    if (count === 0) continue;
    edits += count;
    if (removed.size === names.length && (!namespace || dropNamespace) && !declaration.importClause?.name && !typeOnly(declaration)) {
      // Drop the complete import line, retaining the preceding comments and the
      // following declaration's own trivia.
      const end = file.text[declaration.end] === "\r" ? declaration.end + 2
        : file.text[declaration.end] === "\n" ? declaration.end + 1 : declaration.end;
      replacements.push({ start: declaration.getStart(), end, text: "" });
      edits += 1;
    } else if (removed.size > 0) {
      replacements.push(...[removeNamedImports(file, declaration, removed)].flat());
    } else if (dropNamespace) {
      const clause = declaration.importClause;
      const bindings = clause?.namedBindings;
      // This branch retains a default import while dropping its namespace.
      if (clause?.name && bindings) replacements.push({ start: clause.name.end, end: bindings.end, text: "" });
    }
  }
  await file.apply(replacements);
  return edits;
}

