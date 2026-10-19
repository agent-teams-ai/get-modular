import type { CodemodFile } from "../project.ts";
import { syntax, SyntaxKind, lineNumber, parentOfKind, importedName, importNames, namespaceName,
  exportNames, moduleName, symbolDeclarations, replaceNode, addNamedImport, removeNamedImports } from "../project.ts";

const SPECIFIER = "@get-modular/assembly";
const OLD = "FactoryHandle";
const NEW = "AnyFactoryHandle";

function starLabel(declaration: syntax.ExportDeclaration) {
  const namespace = declaration.exportClause?.kind === SyntaxKind.NamespaceExport ? declaration.exportClause : undefined;
  return `export${declaration.isTypeOnly ? " type" : ""} *${namespace ? ` as ${namespace.name.getText()}` : ""}`;
}

// Only one-argument references resolved to the Assembly import are rewritten.
/** @param {import("../project.ts").CodemodFile} file @param {(message: string) => void} manual */
export default async function transform(file: CodemodFile, manual: (message: string) => void) {
  let edits = 0;
  const replacements: ReturnType<typeof replaceNode>[] = [];
  const renameOrReport = (name: syntax.Node, count: number, label: string) => {
    if (count === 1) { replacements.push(replaceNode(name, NEW)); edits += 1; return; }
    manual(`line ${lineNumber(name)}: ${label} with ${count} type arguments stays; `
      + `choose AnyFactoryHandle or keep the bound handle form by hand`);
  };
  for (const declaration of file.imports) {
    if (moduleName(declaration) !== SPECIFIER) continue;
    const specifier = importNames(declaration).find(entry => importedName(entry) === OLD);
    if (!specifier) continue;
    const localName = specifier.name.getText();
    const converted = [];
    let kept = 0;
    for (const identifier of file.descendants(SyntaxKind.Identifier)) {
      if (identifier.getText() !== localName || identifier.parent === specifier) continue;
      if (!(await symbolDeclarations(identifier)).includes(specifier)) continue;
      const parent = parentOfKind(identifier, SyntaxKind.TypeReference);
      const reference = parent && syntax.isTypeReferenceNode(parent) ? parent : undefined;
      if (reference?.typeName === identifier && (reference.typeArguments ?? []).length === 1) {
        converted.push(identifier);
        continue;
      }
      kept += 1;
      const count = reference?.typeArguments?.length ?? 0;
      manual(`line ${lineNumber(identifier)}: ${localName}${count ? ` with ${count} type arguments` : ""} stays; `
        + `choose AnyFactoryHandle or keep the bound handle form by hand`);
    }
    if (converted.length === 0) continue;
    const present = importNames(declaration).find(entry => importedName(entry) === NEW);
    if (kept === 0 && !present) {
      replacements.push(replaceNode(specifier.propertyName ?? specifier.name, NEW));
      if (!specifier.propertyName) for (const identifier of converted) replacements.push(replaceNode(identifier, NEW));
    } else {
      const target = present ? present.name.getText() : NEW;
      if (!present) replacements.push(addNamedImport(file, declaration, `${specifier.isTypeOnly ? "type " : ""}${NEW}`));
      for (const identifier of converted) replacements.push(replaceNode(identifier, target));
      if (kept === 0) replacements.push(...[removeNamedImports(file, declaration, new Set([specifier]))].flat());
    }
    edits += converted.length;
  }
  for (const declaration of file.imports) {
    const namespace = moduleName(declaration) === SPECIFIER ? namespaceName(declaration) : undefined;
    if (!namespace) continue;
    for (const name of file.descendants(SyntaxKind.QualifiedName).filter(syntax.isQualifiedName)) {
      if (name.right.getText() !== OLD || !syntax.isIdentifier(name.left)) continue;
      const declarations: readonly syntax.Node[] = await symbolDeclarations(name.left);
      if (!declarations.some(entry => entry === namespace || entry === namespace.parent)) continue;
      const parent = parentOfKind(name, SyntaxKind.TypeReference);
      const reference = parent && syntax.isTypeReferenceNode(parent) ? parent : undefined;
      if (reference?.typeName === name) renameOrReport(name.right, (reference.typeArguments ?? []).length, name.getText());
      else manual(`line ${lineNumber(name)}: ${name.getText()} is used outside a type reference; change it by hand`);
    }
  }
  for (const type of file.descendants(SyntaxKind.ImportType).filter(syntax.isImportTypeNode)) {
    const qualifier = type.qualifier;
    if (!qualifier || !syntax.isIdentifier(qualifier) || qualifier.getText() !== OLD) continue;
    if (type.argument.getText().slice(1, -1) !== SPECIFIER) continue;
    renameOrReport(qualifier, (type.typeArguments ?? []).length, `import("${SPECIFIER}").${OLD}`);
  }
  for (const declaration of file.exports) {
    if (moduleName(declaration) !== SPECIFIER) continue;
    if (declaration.exportClause?.kind !== SyntaxKind.NamedExports) {
      manual(`line ${lineNumber(declaration)}: ${starLabel(declaration)} re-exports the package; `
        + `importers of FactoryHandle through this module are not rewritten, check them by hand`);
    }
    for (const entry of exportNames(declaration)) {
      if (importedName(entry) === OLD) manual(`line ${lineNumber(entry)}: re-export of FactoryHandle stays; `
        + `importers of it through this module are not rewritten, check them by hand`);
    }
  }
  await file.apply(replacements);
  return edits;
}
