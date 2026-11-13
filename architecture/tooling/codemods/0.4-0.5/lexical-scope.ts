import type { CodemodFile } from "../project.ts";
import { syntax as Node, importNames, namespaceName } from "../project.ts";

// A private owner for lexical collisions during the 0.4-to-0.5 source migration.
// Keep this analysis side-effect-free: a reported collision must never rewrite a user binding.
function bindingNames(node: Node.Node | undefined, result = new Set<string>()) {
  if (!node) return result;
  if (Node.isIdentifier(node)) result.add(node.getText());
  else if (Node.isObjectBindingPattern(node) || Node.isArrayBindingPattern(node)) {
    for (const element of node.elements) if (Node.isBindingElement(element)) bindingNames(element.name, result);
  }
  return result;
}

function scopeNames(node: Node.Node, result = new Set<string>(), ignored: ReadonlySet<Node.Node> = new Set()) {
  const add = (name: Node.Node | undefined) => {
    const names = bindingNames(name, new Set());
    for (const value of names) result.add(value);
  };
  if (Node.isVariableDeclaration(node) && !ignored.has(node)) add(node.name);
  if (Node.isParameterDeclaration(node) && !ignored.has(node)) add(node.name);
  if (Node.isFunctionDeclaration(node) || Node.isClassDeclaration(node) || Node.isEnumDeclaration(node)
    || Node.isInterfaceDeclaration(node) || Node.isTypeAliasDeclaration(node)) {
    const name = node.name;
    if (name) add(name);
  }
  if (Node.isCatchClause(node)) {
    const variable = node.variableDeclaration;
    if (variable) add(variable.name);
  }
  if (Node.isImportDeclaration(node)) {
    const defaultImport = node.importClause?.name;
    const namespaceImport = namespaceName(node);
    if (defaultImport) result.add(defaultImport.getText());
    if (namespaceImport) result.add(namespaceImport.getText());
    for (const specifier of importNames(node)) {
      if (!ignored.has(specifier)) result.add(specifier.name.getText());
    }
  }
  return result;
}

function scopeOwner(node: Node.Node) {
  let current = node.parent;
  while (current) {
    if (Node.isSourceFile(current) || Node.isBlock(current) || Node.isFunctionDeclaration(current)
      || Node.isFunctionExpression(current) || Node.isArrowFunction(current) || Node.isCatchClause(current)
      || Node.isForStatement(current) || Node.isForInStatement(current) || Node.isForOfStatement(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function namesInScope(scope: ReturnType<typeof scopeOwner>, ignored: ReadonlySet<Node.Node>) {
  const names = new Set<string>();
  if (!scope) return names;
  const nodes = Node.isSourceFile(scope) || Node.isBlock(scope) ? scope.statements : [];
  for (const statement of nodes) {
    if (Node.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) scopeNames(declaration, names, ignored);
    } else scopeNames(statement, names, ignored);
  }
  if (!Node.isSourceFile(scope)) {
    if (Node.isFunctionDeclaration(scope) || Node.isFunctionExpression(scope) || Node.isArrowFunction(scope)) {
      for (const parameter of scope.parameters) scopeNames(parameter, names, ignored);
    }
    if (Node.isCatchClause(scope)) scopeNames(scope, names, ignored);
  }
  return names;
}

export function nameWouldCollide(file: CodemodFile, name: string, at: Node.Node, ignored: ReadonlySet<Node.Node> = new Set()) {
  let current: Node.Node | undefined = at;
  while (current) {
    const scope = scopeOwner(current);
    if (!scope) break;
    if (namesInScope(scope, ignored).has(name)) return true;
    current = Node.isSourceFile(scope) ? undefined : scope.parent;
  }
  return false;
}

