import { Node, SyntaxKind } from "ts-morph";

export const ASSEMBLY = "@get-modular/assembly";
export const RESOURCES = "@get-modular/resources";
export const CONFORMANCE = "@get-modular/conformance";

const TYPE_NAMES = new Map([
  ["FactoryHandle", "ModuleEntry"],
  ["AnyFactoryHandle", "AnyModuleEntry"],
  ["InputHandle", "InputEntry"],
  ["AnyInputHandle", "AnyInputEntry"],
  ["RootHandles", "RootEntries"],
  ["InputHandles", "InputEntries"],
]);

const line = (node) => `line ${node.getStartLineNumber()}`;
const imported = (specifier) => (specifier.getAliasNode() ?? specifier.getNameNode()).getText();

function namedImports(file, name, module) {
  const found = [];
  for (const declaration of file.getImportDeclarations()) {
    if (declaration.getModuleSpecifierValue() !== module) continue;
    for (const specifier of declaration.getNamedImports()) {
      if (specifier.getName() === name) found.push({ declaration, specifier, local: imported(specifier) });
    }
  }
  return found;
}

function namespaceImports(file, module) {
  return file.getImportDeclarations()
    .filter((declaration) => declaration.getModuleSpecifierValue() === module)
    .map((declaration) => declaration.getNamespaceImport())
    .filter(Boolean);
}

function refersTo(identifier, target) {
  return identifier.getSymbol()?.getDeclarations().some((declaration) => declaration === target) === true;
}

function refersToNamespace(identifier, target) {
  return identifier.getSymbol()?.getDeclarations()
    .some((declaration) => declaration === target || declaration === target.getParent()) === true;
}

function importedIdentifier(identifier, name, module, { valueOnly = false } = {}) {
  for (const entry of namedImports(fileOf(identifier), name, module)) {
    if (valueOnly && entry.declaration.isTypeOnly()) continue;
    if (refersTo(identifier, entry.specifier)) return entry;
  }
  return undefined;
}

function fileOf(node) {
  return node.getSourceFile();
}

function importedCall(expression, name, module, { valueOnly = true } = {}) {
  if (Node.isIdentifier(expression)) {
    const entry = importedIdentifier(expression, name, module, { valueOnly });
    return entry ? { local: entry.local, namespace: false } : undefined;
  }
  if (Node.isPropertyAccessExpression(expression) && expression.getName() === name && Node.isIdentifier(expression.getExpression())) {
    const namespace = expression.getExpression();
    const match = namespaceImports(fileOf(expression), module).find((entry) => refersToNamespace(namespace, entry));
    return match ? { local: `${namespace.getText()}.${name}`, namespace: true } : undefined;
  }
  return undefined;
}

function importTypeModule(type) {
  const argument = type.getArgument();
  const text = argument.getText();
  return text.startsWith("\"") || text.startsWith("'") ? text.slice(1, -1) : undefined;
}

function typeArguments(node) {
  return node.getTypeArguments().map((argument) => argument.getText()).join(", ");
}

function assemblyType(typeNode) {
  if (typeNode.getKind() === SyntaxKind.TypeReference) {
    const name = typeNode.getTypeName();
    if (Node.isIdentifier(name)) {
      return importedIdentifier(name, "Assembly", ASSEMBLY) ? { typeArguments: typeArguments(typeNode) } : undefined;
    }
    if (Node.isQualifiedName(name) && name.getRight().getText() === "Assembly" && Node.isIdentifier(name.getLeft())) {
      const namespace = name.getLeft();
      return namespaceImports(fileOf(typeNode), ASSEMBLY).some((entry) => refersToNamespace(namespace, entry))
        ? { typeArguments: typeArguments(typeNode) } : undefined;
    }
  }
  if (Node.isImportTypeNode(typeNode) && importTypeModule(typeNode) === ASSEMBLY) {
    const qualifier = typeNode.getQualifier();
    if (Node.isIdentifier(qualifier) && qualifier.getText() === "Assembly") return { typeArguments: typeArguments(typeNode) };
  }
  return undefined;
}

function assemblyForCall(expression) {
  if (!Node.isCallExpression(expression) || !importedCall(expression.getExpression(), "assemblyFor", ASSEMBLY)) return undefined;
  return { typeArguments: expression.getTypeArguments().map((argument) => argument.getText()).join(", ") };
}

function declarationName(declaration) {
  const name = declaration.getNameNode?.();
  return Node.isIdentifier(name) ? name.getText() : undefined;
}

function bindingNames(node, result = new Set()) {
  if (Node.isIdentifier(node)) result.add(node.getText());
  else if (Node.isObjectBindingPattern(node) || Node.isArrayBindingPattern(node)) {
    for (const element of node.getElements()) bindingNames(element.getNameNode(), result);
  }
  return result;
}

function scopeNames(node, result = new Set()) {
  const add = (name) => {
    const names = bindingNames(name, new Set());
    for (const value of names) result.add(value);
  };
  if (Node.isVariableDeclaration(node)) add(node.getNameNode());
  if (node.getKind() === SyntaxKind.Parameter) add(node.getNameNode());
  if (Node.isFunctionDeclaration(node) || Node.isClassDeclaration(node) || Node.isEnumDeclaration(node)
    || Node.isInterfaceDeclaration(node) || Node.isTypeAliasDeclaration(node)) {
    const name = node.getNameNode?.();
    if (name) add(name);
  }
  if (Node.isCatchClause(node)) {
    const variable = node.getVariableDeclaration();
    if (variable) add(variable.getNameNode());
  }
  return result;
}

function scopeOwner(node) {
  let current = node.getParent();
  while (current) {
    if (Node.isSourceFile(current) || Node.isBlock(current) || Node.isFunctionDeclaration(current)
      || Node.isFunctionExpression(current) || Node.isArrowFunction(current) || Node.isCatchClause(current)
      || Node.isForStatement(current) || Node.isForInStatement(current) || Node.isForOfStatement(current)) return current;
    current = current.getParent();
  }
  return undefined;
}

function namesInScope(scope) {
  const names = new Set();
  if (!scope) return names;
  const nodes = Node.isSourceFile(scope) ? scope.getStatements() : scope.getStatements?.() ?? [];
  for (const statement of nodes) {
    if (Node.isVariableStatement(statement)) {
      for (const declaration of statement.getDeclarations()) scopeNames(declaration, names);
    } else scopeNames(statement, names);
  }
  if (!Node.isSourceFile(scope)) {
    if (Node.isFunctionDeclaration(scope) || Node.isFunctionExpression(scope) || Node.isArrowFunction(scope)) {
      for (const parameter of scope.getParameters()) scopeNames(parameter, names);
    }
    if (Node.isCatchClause(scope)) scopeNames(scope, names);
  }
  return names;
}

export function nameWouldCollide(file, name, at) {
  if (namedImports(file, name, ASSEMBLY).length > 0 || namedImports(file, name, RESOURCES).length > 0) return false;
  let current = at;
  while (current) {
    const scope = scopeOwner(current);
    if (!scope) break;
    if (namesInScope(scope).has(name)) return true;
    current = Node.isSourceFile(scope) ? undefined : scope.getParent();
  }
  return false;
}

export function receiver(file, expression, { inline = true } = {}) {
  const fromCall = assemblyForCall(expression);
  if (fromCall) {
    if (!inline) return { ok: false, reason: "inline assemblyFor()" };
    const noArguments = fromCall.typeArguments === "";
    return file.getFilePath().match(/\\.(?:mjs|js|cjs)$/u) && !noArguments
      ? { ok: false, reason: "JavaScript assemblyFor() with a type argument" }
      : { ok: true, typeArguments: fromCall.typeArguments, inline: true };
  }
  if (!Node.isIdentifier(expression)) return { ok: false, reason: "receiver is not a local identifier" };
  const declarations = expression.getSymbol()?.getDeclarations() ?? [];
  for (const declaration of declarations) {
    if (Node.isVariableDeclaration(declaration) && declarationName(declaration) === expression.getText()) {
      const initializer = declaration.getInitializer();
      const initialized = initializer ? assemblyForCall(initializer) : undefined;
      if (initialized) {
        const noArguments = initialized.typeArguments === "";
        if (file.getFilePath().match(/\\.(?:mjs|js|cjs)$/u) && !noArguments) {
          return { ok: false, reason: "JavaScript assemblyFor() with a type argument" };
        }
        return { ok: true, typeArguments: initialized.typeArguments };
      }
      const typeNode = declaration.getTypeNode();
      const annotated = typeNode ? assemblyType(typeNode) : undefined;
      if (annotated && !file.getFilePath().match(/\\.(?:mjs|js|cjs)$/u)) return { ok: true, typeArguments: annotated.typeArguments };
    }
    if (declaration.getKind() === SyntaxKind.Parameter && declarationName(declaration) === expression.getText()) {
      const typeNode = declaration.getTypeNode();
      const annotated = typeNode ? assemblyType(typeNode) : undefined;
      if (annotated && !file.getFilePath().match(/\\.(?:mjs|js|cjs)$/u)) return { ok: true, typeArguments: annotated.typeArguments };
    }
  }
  return { ok: false, reason: "receiver does not resolve to an Assembly binding in this file" };
}

function methodName(call) {
  const expression = call.getExpression();
  if (Node.isIdentifier(expression)) {
    const declaration = expression.getSymbol()?.getDeclarations().find((entry) => Node.isBindingElement(entry))
      ?? fileOf(expression).getDescendantsOfKind(SyntaxKind.BindingElement)
        .find((entry) => entry.getName() === expression.getText()
          && ["bindFactory", "bindInput", "prepare"].includes(entry.getPropertyNameNode()?.getText() ?? entry.getName()));
    const boundName = declaration?.getPropertyNameNode()?.getText() ?? declaration?.getName();
    if (declaration && ["bindFactory", "bindInput", "prepare"].includes(boundName)) {
      return { name: boundName, receiver: undefined, destructured: declaration, unsupported: "destructured method" };
    }
    return undefined;
  }
  if ((Node.isPropertyAccessExpression(expression) || expression.getKind() === SyntaxKind.PropertyAccessChain)
    && ["bindFactory", "bindInput", "prepare"].includes(expression.getName())) {
    return {
      name: expression.getName(), receiver: expression.getExpression(), property: expression,
      unsupported: expression.getChildren().some((child) => child.getKind() === SyntaxKind.QuestionDotToken)
        ? "optional method call" : undefined,
    };
  }
  if (Node.isElementAccessExpression(expression) && Node.isStringLiteral(expression.getArgumentExpression())
    && ["bindFactory", "bindInput", "prepare"].includes(expression.getArgumentExpression().getLiteralValue())) {
    return {
      name: expression.getArgumentExpression().getLiteralValue(), receiver: expression.getExpression(), element: expression,
      unsupported: "element-access method",
    };
  }
  return undefined;
}

function runtimePicked(expression, file) {
  if (Node.isConditionalExpression(expression) || Node.isBinaryExpression(expression)
    || Node.isNewExpression(expression) || Node.isSpreadElement(expression)) return true;
  if (Node.isCallExpression(expression)) {
    return !importedCall(expression.getExpression(), "declareModule", ASSEMBLY);
  }
  return false;
}

function scopedCall(file, expression) {
  if (!Node.isCallExpression(expression)) return undefined;
  const target = importedCall(expression.getExpression(), "scoped", RESOURCES);
  return target ? { expression, target } : undefined;
}

function generic(typeArgumentsText) {
  return typeArgumentsText ? `<${typeArgumentsText}>` : "";
}

function valueImport(file, name, at) {
  const existing = namedImports(file, name, ASSEMBLY).find((entry) => !entry.declaration.isTypeOnly());
  if (existing) return { expression: existing.local, collision: false };
  const namespaces = namespaceImports(file, ASSEMBLY);
  if (name !== "scoped" && namespaces.length > 0) return { expression: `${namespaces[0].getText()}.${name}`, collision: false };
  if (name === "scoped") {
    const resource = namedImports(file, "scoped", RESOURCES).find((entry) => !entry.declaration.isTypeOnly());
    if (resource) return { expression: resource.local, collision: false };
    const resourceNamespace = namespaceImports(file, RESOURCES)[0];
    if (resourceNamespace) return { expression: `${resourceNamespace.getText()}.scoped`, collision: false };
  }
  return { expression: name, collision: nameWouldCollide(file, name, at) };
}

function addValueImport(file, name, module) {
  const existing = namedImports(file, name, module).find((entry) => !entry.declaration.isTypeOnly());
  if (existing) return existing.local;
  const namespace = name === "scoped" ? namespaceImports(file, module)[0] : undefined;
  if (namespace) return `${namespace.getText()}.${name}`;
  if (name !== "scoped") {
    const assemblyNamespace = namespaceImports(file, ASSEMBLY)[0];
    if (assemblyNamespace) return `${assemblyNamespace.getText()}.${name}`;
  }
  const valueImportDeclaration = file.getImportDeclarations()
    .find((declaration) => declaration.getModuleSpecifierValue() === module && !declaration.isTypeOnly()
      && declaration.getNamedImports().length > 0 && !declaration.getNamespaceImport());
  if (valueImportDeclaration) {
    return valueImportDeclaration.addNamedImport(name).getName();
  }
  const first = file.getImportDeclarations()[0];
  const declaration = first
    ? first.getParent().insertImportDeclaration(first.getChildIndex(), { moduleSpecifier: module, namedImports: [name] })
    : file.addImportDeclaration({ moduleSpecifier: module, namedImports: [name] });
  return declaration.getNamedImports()[0].getName();
}

function entryInspection(file, call, method) {
  if (method.unsupported) {
    return {
      kind: method.name, node: call, status: "report", counted: true,
      message: `${line(call)}: ${method.name} ${method.unsupported} stays; use a direct Assembly method call`,
    };
  }
  const qualified = method.receiver ? receiver(file, method.receiver, { inline: false }) : { ok: false, reason: "destructured or element-access method" };
  const args = call.getArguments();
  const site = { kind: method.name, node: call };
  if (!qualified.ok) {
    return { ...site, status: "report", message: `${line(call)}: ${method.name} call stays; make its Assembly receiver a local assemblyFor() value or an Assembly<M> parameter` };
  }
  if (method.name === "bindInput") {
    if (args.length !== 1) return { ...site, status: "report", message: `${line(call)}: bindInput with ${args.length} arguments stays; pass exactly one module declaration` };
    if (runtimePicked(args[0], file)) return { ...site, status: "report", message: `${line(call)}: bindInput declaration stays; choose the declaration at module scope before the call` };
    const input = valueImport(file, "input", call);
    if (input.collision) return { ...site, status: "report", message: `${line(call)}: bindInput call stays; rename the local binding that collides with input` };
    return { ...site, status: "rewrite", replacement: `${input.expression}${generic(qualified.typeArguments)}()(${args[0].getText()})`, imports: [["input", ASSEMBLY]] };
  }
  if (args.length !== 2) return { ...site, status: "report", message: `${line(call)}: bindFactory with ${args.length} arguments stays; pass one declaration and one factory` };
  const declaration = args[0];
  let factory = args[1];
  let adapter;
  const scoped = scopedCall(file, factory);
  if (scoped) {
    const scopeArgs = scoped.expression.getArguments();
    const scope = valueImport(file, "scoped", call);
    const expected = `${declaration.getText()}.implementationId`;
    if (scopeArgs.length !== 2 || scopeArgs[0].getText() !== expected) {
      return { ...site, status: "report", message: `${line(call)}: bindFactory scoped name stays; use ${expected}` };
    }
    factory = scopeArgs[1];
    adapter = scope.expression;
  }
  if (runtimePicked(declaration, file) || runtimePicked(factory, file)) {
    return { ...site, status: "report", message: `${line(call)}: bindFactory declaration or factory stays; choose both at module scope before the call` };
  }
  const implement = valueImport(file, "implement", call);
  const imports = [["implement", ASSEMBLY]];
  if (adapter) {
    const scopedImport = valueImport(file, "scoped", call);
    if (scopedImport.collision) return { ...site, status: "report", message: `${line(call)}: bindFactory call stays; rename the local binding that collides with scoped` };
    adapter = scopedImport.expression;
    imports.push(["scoped", RESOURCES]);
  }
  if (implement.collision) return { ...site, status: "report", message: `${line(call)}: bindFactory call stays; rename the local binding that collides with implement` };
  return {
    ...site, status: "rewrite",
    replacement: `${implement.expression}${generic(qualified.typeArguments)}()(${declaration.getText()}, ${factory.getText()}${adapter ? `, ${adapter}` : ""})`,
    imports,
  };
}

export function inspectEntries(file) {
  const sites = [];
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const method = methodName(call);
    if (method && method.name !== "prepare") sites.push(entryInspection(file, call, method));
  }
  return sites.sort((a, b) => a.node.getStart() - b.node.getStart());
}

function propertyName(property) {
  const name = property.getNameNode?.();
  return name && !Node.isComputedPropertyName(name) ? name.getText() : undefined;
}

function objectWithFactories(expression) {
  if (Node.isObjectLiteralExpression(expression)) return expression.getProperties().some((property) => propertyName(property) === "factories");
  if (Node.isIdentifier(expression)) {
    const declaration = expression.getSymbol()?.getDeclarations().find((entry) => Node.isVariableDeclaration(entry));
    return declaration ? objectWithFactories(declaration.getInitializer()) : false;
  }
  return false;
}

function prepareInspection(file, call, method) {
  const args = call.getArguments();
  const argument = args[0];
  const object = Node.isObjectLiteralExpression(argument) ? argument : undefined;
  const factories = object?.getProperties().find((property) => propertyName(property) === "factories");
  const modules = object?.getProperties().some((property) => propertyName(property) === "modules");
  const roots = object?.getProperties().some((property) => propertyName(property) === "roots");
  const importsAssembly = file.getImportDeclarations().some((declaration) => declaration.getModuleSpecifierValue() === ASSEMBLY);
  const narrow = importsAssembly && object && factories && roots;
  const migratedNarrow = importsAssembly && object && modules && roots;
  const qualified = method.receiver ? receiver(file, method.receiver, { inline: false }) : { ok: false, reason: "destructured or element-access method" };
  const isApiShape = method.receiver && (Node.isPropertyAccessExpression(method.receiver) && method.receiver.getName() === "api"
    || Node.isIdentifier(method.receiver) && /^api$/iu.test(method.receiver.getText()));
  const site = {
    kind: "prepare", node: call, factories,
    counted: factories !== undefined || objectWithFactories(argument),
  };
  if (method.unsupported) {
    if (!site.counted) return undefined;
    return { ...site, status: "report", message: `${line(call)}: prepare ${method.unsupported} stays; use a direct Assembly method call` };
  }
  if (!qualified.ok && migratedNarrow) return undefined;
  if (!qualified.ok && !narrow) {
    if (!isApiShape && !(importsAssembly && factories)) return undefined;
    return { ...site, status: "report", message: `${line(call)}: prepare argument stays; give the Assembly prepare call an object literal with factories and roots` };
  }
  if (args.length !== 1 || !object) {
    return { ...site, status: "report", message: `${line(call)}: prepare argument stays; pass one object literal` };
  }
  if (object.getProperties().some((property) => Node.isSpreadAssignment(property))) {
    return { ...site, status: "report", message: `${line(call)}: prepare argument stays; remove its object spread and list the properties explicitly` };
  }
  if (!factories) return undefined;
  const profileId = object.getProperties().some((property) => propertyName(property) === "profileId");
  if (profileId && !file.getFilePath().match(/\\.(?:mjs|js|cjs)$/u)) {
    const value = Node.isPropertyAssignment(factories) ? factories.getInitializer() : undefined;
    const tuple = Node.isArrayLiteralExpression(value) && !value.getElements().some((element) => Node.isSpreadElement(element));
    if (!tuple) {
      return { ...site, status: "report", message: `${line(call)}: prepare modules value stays; write a tuple array literal without a spread` };
    }
  }
  return { ...site, status: "rewrite", replacement: undefined, factories };
}

export function inspectPrepare(file) {
  const sites = [];
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const method = methodName(call);
    if (method?.name !== "prepare") continue;
    const inspection = prepareInspection(file, call, method);
    if (inspection) sites.push(inspection);
  }
  return sites.sort((a, b) => a.node.getStart() - b.node.getStart());
}

function isolateTarget(file, expression) {
  const qualified = receiver(file, expression);
  if (qualified.ok) return qualified;
  return { ok: false, reason: qualified.reason };
}

function isolateInspection(file, call) {
  const expression = call.getExpression();
  const importedIsolate = importedCall(expression, "isolate", CONFORMANCE);
  if (!importedIsolate) return undefined;
  const args = call.getArguments();
  const site = { kind: "isolate", node: call, counted: true };
  if (args.length !== 2 || !Node.isObjectLiteralExpression(args[1])) {
    return { ...site, status: "report", message: `${line(call)}: isolate stays; pass one entry source and one options object literal` };
  }
  const options = args[1];
  const declaration = options.getProperties().find((property) => propertyName(property) === "declaration");
  const factory = options.getProperties().find((property) => propertyName(property) === "factory");
  if (!declaration || !factory) return undefined;
  const target = isolateTarget(file, args[0]);
  if (!target.ok) return { ...site, status: "report", message: `${line(call)}: isolate api argument stays; use a local Assembly receiver or assemblyFor()` };
  const declarationValue = Node.isPropertyAssignment(declaration) ? declaration.getInitializer() : declaration.getNameNode();
  const factoryValue = Node.isPropertyAssignment(factory) ? factory.getInitializer() : factory.getNameNode();
  if (runtimePicked(declarationValue, file) || runtimePicked(factoryValue, file)) {
    return { ...site, status: "report", message: `${line(call)}: isolate declaration or factory stays; choose both at module scope before the call` };
  }
  const implement = valueImport(file, "implement", call);
  const scoped = valueImport(file, "scoped", call);
  if (implement.collision) return { ...site, status: "report", message: `${line(call)}: isolate stays; rename the local binding that collides with implement` };
  if (scoped.collision) return { ...site, status: "report", message: `${line(call)}: isolate stays; rename the local binding that collides with scoped` };
  const rest = options.getProperties().filter((property) => property !== declaration && property !== factory);
  const restText = rest.length === 0 ? "" : ` ${rest.map((property) => property.getText()).join(", ")} `;
  return {
    ...site, status: "rewrite",
    replacement: `${importedIsolate.local}(${implement.expression}${generic(target.typeArguments)}()(${declarationValue.getText()}, ${factoryValue.getText()}, ${scoped.expression}), {${restText}})`,
    imports: [["implement", ASSEMBLY], ["scoped", RESOURCES]],
  };
}

export function inspectIsolate(file) {
  const sites = [];
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const inspection = isolateInspection(file, call);
    if (inspection) sites.push(inspection);
  }
  return sites.sort((a, b) => a.node.getStart() - b.node.getStart());
}

function typeInspection(file, name, original, typeArgumentsCount, kind = "type") {
  const site = { kind: "type", type: original, node: name, counted: true };
  const replacement = TYPE_NAMES.get(original);
  if (!replacement) return undefined;
  return { ...site, status: "rewrite", replacement, typeArgumentsCount, importKind: kind };
}

function typeImportInspection(file, declaration, specifier) {
  const original = specifier.getName();
  const replacement = TYPE_NAMES.get(original);
  if (!replacement) return undefined;
  const local = imported(specifier);
  const renameImport = !specifier.getAliasNode();
  const collision = renameImport && nameWouldCollide(file, replacement, specifier);
  const references = file.getDescendantsOfKind(SyntaxKind.Identifier)
    .filter((identifier) => identifier.getText() === local && refersTo(identifier, specifier)
      && identifier !== specifier.getNameNode() && identifier !== specifier.getAliasNode());
  return references.map((identifier) => {
    const reference = identifier.getParentIfKind(SyntaxKind.TypeReference);
    const site = { kind: "type", type: original, node: identifier, counted: true };
    if (collision) {
      return { ...site, status: "report", message: `${line(identifier)}: ${original} reference stays; rename the local binding that collides with ${replacement}` };
    }
    return {
      ...site, status: "rewrite", replacement: renameImport ? replacement : undefined,
      renameImport: { specifier, replacement },
    };
  });
}

export function inspectTypes(file) {
  const sites = [];
  const handledIdentifiers = new Set();
  for (const declaration of file.getImportDeclarations()) {
    if (declaration.getModuleSpecifierValue() !== ASSEMBLY) continue;
    for (const specifier of declaration.getNamedImports()) {
      const found = typeImportInspection(file, declaration, specifier);
      if (found) {
        sites.push(...found);
        handledIdentifiers.add(specifier.getNameNode());
        if (specifier.getAliasNode()) handledIdentifiers.add(specifier.getAliasNode());
        for (const site of found) handledIdentifiers.add(site.node);
      }
    }
  }
  for (const name of file.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (!TYPE_NAMES.has(name.getText()) || handledIdentifiers.has(name)) continue;
    const reference = name.getParentIfKind(SyntaxKind.TypeReference);
    if (reference?.getTypeName() === name) {
      sites.push(typeInspection(file, name, name.getText(), reference.getTypeArguments().length));
    }
  }
  for (const name of file.getDescendantsOfKind(SyntaxKind.QualifiedName)) {
    const original = name.getRight().getText();
    if (!TYPE_NAMES.has(original) || !Node.isIdentifier(name.getLeft())) continue;
    const namespace = name.getLeft();
    if (!namespaceImports(file, ASSEMBLY).some((entry) => refersToNamespace(namespace, entry))) continue;
    const reference = name.getParentIfKind(SyntaxKind.TypeReference);
    if (reference?.getTypeName() === name) sites.push(typeInspection(file, name.getRight(), original, reference.getTypeArguments().length, "namespace"));
  }
  for (const type of file.getDescendantsOfKind(SyntaxKind.ImportType)) {
    if (importTypeModule(type) !== ASSEMBLY) continue;
    const qualifier = type.getQualifier();
    if (Node.isIdentifier(qualifier) && TYPE_NAMES.has(qualifier.getText())) {
      sites.push(typeInspection(file, qualifier, qualifier.getText(), type.getTypeArguments().length, "import-type"));
    }
  }
  return sites.sort((a, b) => a.node.getStart() - b.node.getStart());
}

function reportExtras(file) {
  const extras = [];
  const handledFactories = new Set(inspectPrepare(file).map((site) => site.factories).filter(Boolean));
  for (const property of file.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    const name = propertyName(property);
    if (name === "bindFactory" || name === "bindInput") {
      extras.push({ status: "report", message: `${line(property)}: custom Assembly ${name} member stays; only its prepare member maps to the new Assembly` });
    }
  }
  for (const property of file.getDescendantsOfKind(SyntaxKind.MethodDeclaration)) {
    const parent = property.getParent();
    if (!Node.isObjectLiteralExpression(parent)) continue;
    if (["bindFactory", "bindInput"].includes(property.getName())) {
      extras.push({ status: "report", message: `${line(property)}: custom Assembly ${property.getName()} member stays; only its prepare member maps to the new Assembly` });
    }
  }
  for (const property of file.getDescendantsOfKind(SyntaxKind.ShorthandPropertyAssignment)) {
    if (["bindFactory", "bindInput"].includes(property.getName())) {
      extras.push({ status: "report", message: `${line(property)}: custom Assembly ${property.getName()} member stays; only its prepare member maps to the new Assembly` });
    }
  }
  for (const property of file.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    if (handledFactories.has(property) || propertyName(property) !== "factories") continue;
    const value = property.getInitializer();
    const holdsHandles = Node.isArrayLiteralExpression(value) || Node.isIdentifier(value) || Node.isPropertyAccessExpression(value)
      || Node.isCallExpression(value) || /factor|handle|entr|module|bind/iu.test(value?.getText() ?? "");
    if (holdsHandles) extras.push({ status: "report", message: `${line(property)}: factories property stays; rename the helper property and its callers to modules by hand` });
  }
  for (const property of file.getDescendantsOfKind(SyntaxKind.ShorthandPropertyAssignment)) {
    if (handledFactories.has(property) || property.getName() !== "factories") continue;
    extras.push({ status: "report", message: `${line(property)}: factories property stays; rename the helper property and its callers to modules by hand` });
  }
  for (const identifier of file.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (!["BindingErrorCode", "PreparationErrorCode"].includes(identifier.getText())) continue;
    const fromAssembly = importedIdentifier(identifier, identifier.getText(), ASSEMBLY)
      || namespaceImports(file, ASSEMBLY).some((entry) => {
        const parent = identifier.getParent();
        return Node.isQualifiedName(parent) && parent.getRight() === identifier && refersToNamespace(parent.getLeft(), entry);
      });
    if (fromAssembly && identifier.getParent().getKind() !== SyntaxKind.ImportSpecifier) {
      extras.push({ status: "report", message: `${line(identifier)}: ${identifier.getText()} reference stays; add assembly.bind.invalid-group and assembly.prepare.duplicate-module to exhaustive handling` });
    }
  }
  for (const declaration of file.getExportDeclarations()) {
    if (declaration.getModuleSpecifierValue() !== ASSEMBLY) continue;
    if (!declaration.hasNamedExports()) {
      extras.push({ status: "report", message: `${line(declaration)}: export${declaration.isTypeOnly() ? " type" : ""} * from ${ASSEMBLY} stays; importers of renamed types through this module need manual review` });
    }
    for (const entry of declaration.getNamedExports()) {
      if (TYPE_NAMES.has(entry.getName())) {
        extras.push({ status: "report", message: `${line(entry)}: re-export of ${entry.getName()} stays; importers of it through this module are not rewritten` });
      }
    }
  }
  return extras;
}

export function inspectAll(file) {
  return {
    entries: inspectEntries(file),
    prepare: inspectPrepare(file),
    isolate: inspectIsolate(file),
    types: inspectTypes(file),
    extras: reportExtras(file),
  };
}

function applyInspections(file, sites, manual) {
  let edits = 0;
  const renameImports = new Map();
  const ordered = sites.slice().sort((a, b) => a.node.getStart() - b.node.getStart());
  for (const site of ordered) {
    if (site.status === "report") {
      manual(site.message);
    }
  }
  for (const site of ordered.slice().reverse()) {
    if (site.status === "report") continue;
    if (site.renameImport) renameImports.set(site.renameImport.specifier, site.renameImport.replacement);
    if (site.replacement !== undefined) {
      site.node.replaceWithText(site.replacement);
      edits += 1;
    }
  }
  for (const [specifier, replacement] of renameImports) {
    specifier.getNameNode().replaceWithText(replacement);
    edits += 1;
  }
  for (const site of sites) {
    if (site.status !== "rewrite") continue;
    for (const [name, module] of site.imports ?? []) addValueImport(file, name, module);
  }
  return edits;
}

export function transformEntries(file, manual) {
  return applyInspections(file, inspectEntries(file), manual);
}

export function transformPrepare(file, manual) {
  const sites = inspectPrepare(file);
  let edits = 0;
  const ordered = sites.slice().sort((a, b) => a.node.getStart() - b.node.getStart());
  for (const site of ordered) {
    if (site.status === "report") {
      manual(site.message);
    }
  }
  for (const site of ordered.slice().reverse()) {
    if (site.status === "report") continue;
    const property = site.factories;
    if (Node.isShorthandPropertyAssignment(property)) property.replaceWithText(`modules: ${property.getName()}`);
    else property.getNameNode().replaceWithText("modules");
    edits += 1;
  }
  return edits;
}

export function transformIsolate(file, manual) {
  return applyInspections(file, inspectIsolate(file), manual);
}

export function transformTypes(file, manual) {
  return applyInspections(file, inspectTypes(file), manual);
}

function usedImport(file, target) {
  const local = target.getAliasNode?.()?.getText() ?? target.getNameNode?.()?.getText() ?? target.getText();
  return file.getDescendantsOfKind(SyntaxKind.Identifier).some((identifier) => {
    if (identifier === target.getNameNode?.() || identifier === target.getAliasNode?.()) return false;
    if (identifier.getText() !== local) return false;
    return true;
  });
}

export function transformImports(file) {
  let edits = 0;
  for (const declaration of file.getImportDeclarations().slice().reverse()) {
    if (![ASSEMBLY, RESOURCES].includes(declaration.getModuleSpecifierValue())) continue;
    for (const specifier of declaration.getNamedImports().slice().reverse()) {
      if (usedImport(file, specifier)) continue;
      specifier.remove();
      edits += 1;
    }
    const namespace = declaration.getNamespaceImport();
    if (namespace && !usedImport(file, namespace)) {
      declaration.removeNamespaceImport();
      edits += 1;
    }
    if (!declaration.isModuleSpecifierRelative() && declaration.getNamedImports().length === 0 && !declaration.getNamespaceImport()
      && !declaration.getDefaultImport() && !declaration.isTypeOnly()) {
      declaration.remove();
      edits += 1;
    }
  }
  return edits;
}

export function transformExtras(file, manual) {
  const extras = reportExtras(file);
  for (const extra of extras) manual(extra.message);
  return 0;
}

export function measure(file) {
  const inspected = inspectAll(file);
  const sites = [...inspected.entries, ...inspected.prepare.filter((site) => site.counted), ...inspected.isolate, ...inspected.types];
  return {
    sites: sites.length,
    rewritten: sites.filter((site) => site.status === "rewrite").length,
    reported: sites.filter((site) => site.status === "report").length,
    errorReferences: inspected.extras.filter((site) => /BindingErrorCode|PreparationErrorCode/u.test(site.message)).length,
    manualExtras: inspected.extras.filter((site) => !/BindingErrorCode|PreparationErrorCode/u.test(site.message)).length,
    inspected,
  };
}
