import { Node, SyntaxKind } from "ts-morph";

const SPECIFIER = "@get-modular/assembly";
const OLD = "FactoryHandle";
const NEW = "AnyFactoryHandle";

// 0.3.0: FactoryHandle<C> no longer means "any handle of map C"; that is AnyFactoryHandle<C>.
// Only references that resolve to the import from @get-modular/assembly are touched.
/** @param {import("ts-morph").SourceFile} file  @param {(message: string) => void} manual */
export default function transform(file, manual) {
  let edits = 0;
  // `gm.FactoryHandle<C>` and `import("@get-modular/assembly").FactoryHandle<C>` have no import specifier to rewrite:
  // one type argument is renamed in place, anything else is reported.
  const renameOrReport = (name, typeArguments, label) => {
    if (typeArguments === 1) { name.replaceWithText(NEW); edits += 1; return; }
    manual(`line ${name.getStartLineNumber()}: ${label} with ${typeArguments} type arguments stays; `
      + `choose AnyFactoryHandle or keep the bound handle form by hand`);
  };
  for (const declaration of file.getImportDeclarations()) {
    if (declaration.getModuleSpecifierValue() !== SPECIFIER) continue;
    const specifier = declaration.getNamedImports().find((entry) => entry.getName() === OLD);
    if (!specifier) continue;
    const localName = (specifier.getAliasNode() ?? specifier.getNameNode()).getText();
    const converted = [];
    let kept = 0;
    for (const identifier of file.getDescendantsOfKind(SyntaxKind.Identifier)) {
      if (identifier.getText() !== localName || identifier.getParent() === specifier) continue;
      if (!identifier.getSymbol()?.getDeclarations().includes(specifier)) continue;
      const reference = identifier.getParentIfKind(SyntaxKind.TypeReference);
      if (reference?.getTypeName() === identifier && reference.getTypeArguments().length === 1) {
        converted.push(identifier);
        continue;
      }
      kept += 1;
      const count = reference?.getTypeArguments().length;
      manual(`line ${identifier.getStartLineNumber()}: ${localName}${count ? ` with ${count} type arguments` : ""} stays; `
        + `choose AnyFactoryHandle or keep the bound handle form by hand`);
    }
    if (converted.length === 0) continue;
    if (kept === 0 && !declaration.getNamedImports().some((entry) => entry.getName() === NEW)) {
      // Nothing else uses it: rename the imported name in place, an alias keeps every reference as written.
      specifier.getNameNode().replaceWithText(NEW);
      if (!specifier.getAliasNode()) for (const identifier of converted.reverse()) identifier.replaceWithText(NEW);
    } else {
      const present = declaration.getNamedImports().find((entry) => entry.getName() === NEW);
      const target = present ? (present.getAliasNode() ?? present.getNameNode()).getText() : NEW;
      if (!present) declaration.addNamedImport({ name: NEW, isTypeOnly: specifier.isTypeOnly() });
      for (const identifier of converted.reverse()) identifier.replaceWithText(target);
      if (kept === 0) specifier.remove();
    }
    edits += converted.length;
  }
  for (const declaration of file.getImportDeclarations()) {
    const namespace = declaration.getModuleSpecifierValue() === SPECIFIER ? declaration.getNamespaceImport() : undefined;
    if (!namespace) continue;
    for (const name of file.getDescendantsOfKind(SyntaxKind.QualifiedName)) {
      const left = name.getLeft();
      if (name.getRight().getText() !== OLD || !Node.isIdentifier(left)) continue;
      if (!left.getSymbol()?.getDeclarations().some((entry) => entry === namespace || entry === namespace.getParent())) continue;
      const reference = name.getParentIfKind(SyntaxKind.TypeReference);
      if (reference?.getTypeName() === name) renameOrReport(name.getRight(), reference.getTypeArguments().length, name.getText());
      else manual(`line ${name.getStartLineNumber()}: ${name.getText()} is used outside a type reference; change it by hand`);
    }
  }
  for (const type of file.getDescendantsOfKind(SyntaxKind.ImportType)) {
    const qualifier = type.getQualifier();
    if (!Node.isIdentifier(qualifier) || qualifier.getText() !== OLD) continue;
    if (type.getArgument().getText().slice(1, -1) !== SPECIFIER) continue;
    renameOrReport(qualifier, type.getTypeArguments().length, `import("${SPECIFIER}").${OLD}`);
  }
  for (const declaration of file.getExportDeclarations()) {
    if (declaration.getModuleSpecifierValue() !== SPECIFIER) continue;
    if (!declaration.hasNamedExports() && !declaration.getNamespaceExport()) {
      manual(`line ${declaration.getStartLineNumber()}: export * re-exports FactoryHandle; `
        + `decide by hand whether it should export AnyFactoryHandle`);
    }
    for (const entry of declaration.getNamedExports()) {
      if (entry.getName() === OLD) {
        manual(`line ${entry.getStartLineNumber()}: re-export of FactoryHandle stays; `
          + `decide by hand whether it should export AnyFactoryHandle`);
      }
    }
  }
  return edits;
}
