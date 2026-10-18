import { syntax as Node, syntax as ts, SyntaxKind, fileOf, lineNumber, parentOfKind,
  importedName, importNames, namespaceName, exportNames, moduleName, typeOnly, symbolDeclarations,
  replaceNode, addNamedImport, removeNamedImports } from "../project.mjs";

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

const line = (node) => `line ${lineNumber(node)}`;
const imported = (specifier) => specifier.name.getText();
const javascript = (file) => /\.(?:mjs|js|cjs)$/u.test(file.path);

function namedImports(file, name, module) {
  const found = [];
  for (const declaration of file.imports) {
    if (moduleName(declaration) !== module) continue;
    for (const specifier of importNames(declaration)) {
      if (importedName(specifier) === name) found.push({ declaration, specifier, local: imported(specifier) });
    }
  }
  return found;
}

function namespaceImports(file, module) {
  return file.imports
    .filter((declaration) => moduleName(declaration) === module)
    .map((declaration) => namespaceName(declaration))
    .filter(Boolean);
}

function declarationsFor(identifier) {
  const symbolDeclarations = safeSymbolDeclarations(identifier);
  return symbolDeclarations.length > 0
    ? symbolDeclarations
    : fileOf(identifier).descendants(SyntaxKind.VariableDeclaration)
      .filter((declaration) => declarationName(declaration) === identifier.getText());
}

function safeSymbolDeclarations(identifier) {
  try {
    return symbolDeclarations(identifier);
  } catch {
    return [];
  }
}

function refersTo(identifier, target) {
  const declarations = safeSymbolDeclarations(identifier);
  if (declarations.length > 0) return declarations.some((declaration) => declaration === target);
  return identifier.getText() === imported(target);
}

function refersToNamespace(identifier, target) {
  const declarations = safeSymbolDeclarations(identifier);
  if (declarations.length > 0) return declarations.some((declaration) => declaration === target || declaration === target.parent);
  return identifier.getText() === target.getText();
}

function importedIdentifier(identifier, name, module, { valueOnly = false } = {}) {
  for (const entry of namedImports(fileOf(identifier), name, module)) {
    if (valueOnly && typeOnly(entry.declaration)) continue;
    if (refersTo(identifier, entry.specifier)) return entry;
  }
  return undefined;
}

function importedCall(expression, name, module, { valueOnly = true } = {}) {
  if (Node.isIdentifier(expression)) {
    const entry = importedIdentifier(expression, name, module, { valueOnly });
    return entry ? { local: entry.local, namespace: false } : undefined;
  }
  if (Node.isPropertyAccessExpression(expression) && expression.name.getText() === name && Node.isIdentifier(expression.expression)) {
    const namespace = expression.expression;
    const match = namespaceImports(fileOf(expression), module).find((entry) => refersToNamespace(namespace, entry));
    return match ? { local: `${namespace.getText()}.${name}`, namespace: true } : undefined;
  }
  return undefined;
}

function importTypeModule(type) {
  const argument = type.argument;
  const text = argument.getText();
  return text.startsWith("\"") || text.startsWith("'") ? text.slice(1, -1) : undefined;
}

function typeArguments(node) {
  return (node.typeArguments ?? []).map((argument) => argument.getText()).join(", ");
}

function assemblyType(typeNode) {
  if (typeNode.kind === SyntaxKind.TypeReference) {
    const name = typeNode.typeName;
    if (Node.isIdentifier(name)) {
      return importedIdentifier(name, "Assembly", ASSEMBLY) ? { typeArguments: typeArguments(typeNode) } : undefined;
    }
    if (Node.isQualifiedName(name) && name.right.getText() === "Assembly" && Node.isIdentifier(name.left)) {
      const namespace = name.left;
      return namespaceImports(fileOf(typeNode), ASSEMBLY).some((entry) => refersToNamespace(namespace, entry))
        ? { typeArguments: typeArguments(typeNode) } : undefined;
    }
  }
  if (Node.isImportTypeNode(typeNode) && importTypeModule(typeNode) === ASSEMBLY) {
    const qualifier = typeNode.qualifier;
    if (qualifier && Node.isIdentifier(qualifier) && qualifier.getText() === "Assembly") return { typeArguments: typeArguments(typeNode) };
  }
  return undefined;
}

function assemblyForCall(expression) {
  if (!Node.isCallExpression(expression) || !importedCall(expression.expression, "assemblyFor", ASSEMBLY)) return undefined;
  return { typeArguments: (expression.typeArguments ?? []).map((argument) => argument.getText()).join(", ") };
}

function declarationName(declaration) {
  const name = declaration.name;
  return name && Node.isIdentifier(name) ? name.getText() : undefined;
}

function bindingNames(node, result = new Set()) {
  if (!node) return result;
  if (Node.isIdentifier(node)) result.add(node.getText());
  else if (Node.isObjectBindingPattern(node) || Node.isArrayBindingPattern(node)) {
    for (const element of node.elements) bindingNames(element.name, result);
  }
  return result;
}

function scopeNames(node, result = new Set(), ignored = new Set()) {
  const add = (name) => {
    const names = bindingNames(name, new Set());
    for (const value of names) result.add(value);
  };
  if (Node.isVariableDeclaration(node) && !ignored.has(node)) add(node.name);
  if (node.kind === SyntaxKind.Parameter && !ignored.has(node)) add(node.name);
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
      if (!ignored.has(specifier)) result.add(imported(specifier));
    }
  }
  return result;
}

function scopeOwner(node) {
  let current = node.parent;
  while (current) {
    if (Node.isSourceFile(current) || Node.isBlock(current) || Node.isFunctionDeclaration(current)
      || Node.isFunctionExpression(current) || Node.isArrowFunction(current) || Node.isCatchClause(current)
      || Node.isForStatement(current) || Node.isForInStatement(current) || Node.isForOfStatement(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function namesInScope(scope, ignored) {
  const names = new Set();
  if (!scope) return names;
  const nodes = Node.isSourceFile(scope) ? scope.statements : scope.statements ?? [];
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

export function nameWouldCollide(file, name, at, ignored = new Set()) {
  let current = at;
  while (current) {
    const scope = scopeOwner(current);
    if (!scope) break;
    if (namesInScope(scope, ignored).has(name)) return true;
    current = Node.isSourceFile(scope) ? undefined : scope.parent;
  }
  return false;
}

export function receiver(file, expression, { inline = true } = {}) {
  const fromCall = assemblyForCall(expression);
  if (fromCall) {
    if (!inline) return { ok: false, reason: "inline assemblyFor()" };
    const noArguments = fromCall.typeArguments === "";
    return javascript(file) && !noArguments
      ? { ok: false, reason: "JavaScript assemblyFor() with a type argument" }
      : { ok: true, typeArguments: fromCall.typeArguments, inline: true };
  }
  if (!Node.isIdentifier(expression)) return { ok: false, reason: "receiver is not a local identifier" };
  const declarations = declarationsFor(expression);
  for (const declaration of declarations) {
    if (Node.isVariableDeclaration(declaration) && declarationName(declaration) === expression.getText()) {
      const initializer = declaration.initializer;
      const initialized = initializer ? assemblyForCall(initializer) : undefined;
      if (initialized) {
        const noArguments = initialized.typeArguments === "";
        if (javascript(file) && !noArguments) {
          return { ok: false, reason: "JavaScript assemblyFor() with a type argument" };
        }
        return { ok: true, typeArguments: initialized.typeArguments };
      }
      const typeNode = declaration.type;
      const annotated = typeNode ? assemblyType(typeNode) : undefined;
      if (annotated && !javascript(file)) return { ok: true, typeArguments: annotated.typeArguments };
    }
    if (declaration.kind === SyntaxKind.Parameter && declarationName(declaration) === expression.getText()) {
      const typeNode = declaration.type;
      const annotated = typeNode ? assemblyType(typeNode) : undefined;
      if (annotated && !javascript(file)) return { ok: true, typeArguments: annotated.typeArguments };
    }
  }
  return { ok: false, reason: "receiver does not resolve to an Assembly binding in this file" };
}

function methodName(call) {
  const expression = call.expression;
  if (Node.isIdentifier(expression)) {
    const declaration = safeSymbolDeclarations(expression).find((entry) => Node.isBindingElement(entry))
      ?? fileOf(expression).descendants(SyntaxKind.BindingElement)
        .find((entry) => entry.name.getText() === expression.getText()
          && ["bindFactory", "bindInput", "prepare"].includes(entry.propertyName?.getText() ?? entry.name.getText()));
    const boundName = declaration?.propertyName?.getText() ?? declaration?.name?.getText();
    if (declaration && ["bindFactory", "bindInput", "prepare"].includes(boundName)) {
      return { name: boundName, receiver: undefined, destructured: declaration, unsupported: "destructured method" };
    }
    return undefined;
  }
  if (Node.isPropertyAccessExpression(expression)
    && ["bindFactory", "bindInput", "prepare"].includes(expression.name.getText())) {
    return {
      name: expression.name.getText(), receiver: expression.expression, property: expression,
      unsupported: expression.questionDotToken !== undefined
        ? "optional method call" : undefined,
    };
  }
  if (Node.isElementAccessExpression(expression) && Node.isStringLiteral(expression.argumentExpression)
    && ["bindFactory", "bindInput", "prepare"].includes(expression.argumentExpression.text)) {
    return {
      name: expression.argumentExpression.text, receiver: expression.expression, element: expression,
      unsupported: "element-access method",
    };
  }
  return undefined;
}

function runtimePicked(expression, file) {
  if (Node.isConditionalExpression(expression) || Node.isBinaryExpression(expression)
    || Node.isNewExpression(expression) || Node.isSpreadElement(expression)) return true;
  if (Node.isCallExpression(expression)) {
    return !importedCall(expression.expression, "declareModule", ASSEMBLY);
  }
  return false;
}

function scopedCall(file, expression) {
  if (!Node.isCallExpression(expression)) return undefined;
  const target = importedCall(expression.expression, "scoped", RESOURCES, { valueOnly: false });
  return target ? { expression, target } : undefined;
}

function generic(typeArgumentsText) {
  return typeArgumentsText ? `<${typeArgumentsText}>` : "";
}

function valueImport(file, name, at) {
  const existing = namedImports(file, name, ASSEMBLY).find((entry) => !typeOnly(entry.declaration));
  if (existing) return {
    expression: existing.local,
    collision: nameWouldCollide(file, existing.local, at, new Set([existing.specifier])),
  };
  const namespaces = namespaceImports(file, ASSEMBLY);
  if (name !== "scoped" && namespaces.length > 0) return { expression: `${namespaces[0].getText()}.${name}`, collision: false };
  if (name === "scoped") {
    const resource = namedImports(file, "scoped", RESOURCES).find((entry) => !typeOnly(entry.declaration));
    if (resource) return {
      expression: resource.local,
      collision: nameWouldCollide(file, resource.local, at, new Set([resource.specifier])),
    };
    const resourceNamespace = namespaceImports(file, RESOURCES)[0];
    if (resourceNamespace) return { expression: `${resourceNamespace.getText()}.scoped`, collision: false };
  }
  return { expression: name, collision: nameWouldCollide(file, name, at) };
}

function addValueImport(file, name, module) {
  const existing = namedImports(file, name, module).find((entry) => !typeOnly(entry.declaration));
  if (existing) return existing.local;
  const namespace = name === "scoped" ? namespaceImports(file, module)[0] : undefined;
  if (namespace) return `${namespace.getText()}.${name}`;
  if (name !== "scoped") {
    const assemblyNamespace = namespaceImports(file, ASSEMBLY)[0];
    if (assemblyNamespace) return `${assemblyNamespace.getText()}.${name}`;
  }
  const valueImportDeclaration = file.imports
    .find((declaration) => moduleName(declaration) === module && !typeOnly(declaration)
      && importNames(declaration).length > 0 && !namespaceName(declaration));
  if (valueImportDeclaration) {
    file.apply([addNamedImport(file, valueImportDeclaration, name)]);
    return name;
  }
  const first = file.imports[0];
  const position = first?.getStart() ?? 0;
  file.apply([{ start: position, end: position, text: `import { ${name} } from "${module}";\n` }]);
  return name;
}

function entryInspection(file, call, method) {
  if (method.unsupported) {
    return {
      kind: method.name, node: call, status: "report", counted: true,
      message: `${line(call)}: ${method.name} ${method.unsupported} stays; use a direct Assembly method call`,
    };
  }
  const qualified = method.receiver ? receiver(file, method.receiver, { inline: false }) : { ok: false, reason: "destructured or element-access method" };
  const args = (call.arguments ?? []);
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
    const scopeArgs = (scoped.expression.arguments ?? []);
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
  for (const call of file.descendants(SyntaxKind.CallExpression)) {
    const method = methodName(call);
    if (method && method.name !== "prepare") sites.push(entryInspection(file, call, method));
  }
  return sites.sort((a, b) => a.node.getStart() - b.node.getStart());
}

function propertyName(property) {
  const name = property.name;
  return name && !Node.isComputedPropertyName(name) ? name.getText() : undefined;
}

function objectWithFactories(expression) {
  if (!expression) return false;
  if (Node.isObjectLiteralExpression(expression)) return expression.properties.some((property) => propertyName(property) === "factories");
  if (Node.isIdentifier(expression)) {
    const declaration = declarationsFor(expression).find((entry) => Node.isVariableDeclaration(entry));
    return declaration ? objectWithFactories(declaration.initializer) : false;
  }
  return false;
}

function unwrapExpression(expression) {
  let current = expression;
  while (current && (Node.isParenthesizedExpression(current) || Node.isAsExpression(current)
    || current.kind === SyntaxKind.TypeAssertionExpression || Node.isSatisfiesExpression(current)
    || Node.isNonNullExpression(current))) {
    current = current.expression;
  }
  return current;
}

function entryFactoryCall(call) {
  const method = methodName(call);
  if (method && ["bindFactory", "bindInput"].includes(method.name)) return true;
  const target = unwrapExpression(call.expression);
  if (!Node.isCallExpression(target)) return false;
  return ["implement", "input"].some((name) => importedCall(target.expression, name, ASSEMBLY));
}

function entryValue(expression) {
  const value = unwrapExpression(expression);
  if (!value) return false;
  if (Node.isSpreadElement(value)) return entryValue(value.expression);
  if (Node.isConditionalExpression(value)) return entryValue(value.whenTrue) || entryValue(value.whenFalse);
  if (Node.isArrayLiteralExpression(value)) return value.elements.some(entryValue);
  if (Node.isCallExpression(value)) return entryFactoryCall(value);
  if (Node.isPropertyAccessExpression(value)) return value.name.getText() === "factories";
  if (Node.isIdentifier(value)) {
    const declarations = declarationsFor(value);
    const initializers = declarations.filter((declaration) => Node.isVariableDeclaration(declaration))
      .map((declaration) => declaration.initializer).filter(Boolean);
    if (initializers.some(entryValue)) return true;
    return /^(?:bound|entry|factor(?:y|ies)|handle|module)s?$/iu.test(value.getText());
  }
  return false;
}

function holdsHandles(property) {
  if (Node.isShorthandPropertyAssignment(property)) return entryValue(property.name);
  return entryValue(property.initializer);
}

function prepareInspection(file, call, method) {
  const args = (call.arguments ?? []);
  const argument = args[0];
  const object = argument && Node.isObjectLiteralExpression(argument) ? argument : undefined;
  const factories = object?.properties.find((property) => propertyName(property) === "factories");
  const modules = object?.properties.some((property) => propertyName(property) === "modules");
  const roots = object?.properties.some((property) => propertyName(property) === "roots");
  const importsAssembly = file.imports.some((declaration) => moduleName(declaration) === ASSEMBLY);
  const narrow = importsAssembly && object && factories && roots;
  const migratedNarrow = importsAssembly && object && modules && roots;
  const qualified = method.receiver ? receiver(file, method.receiver, { inline: false }) : { ok: false, reason: "destructured or element-access method" };
  const isApiShape = method.receiver && (Node.isPropertyAccessExpression(method.receiver) && method.receiver.name.getText() === "api"
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
  if (object.properties.some((property) => Node.isSpreadAssignment(property))) {
    return { ...site, status: "report", message: `${line(call)}: prepare argument stays; remove its object spread and list the properties explicitly` };
  }
  if (!factories) return undefined;
  const profileId = object.properties.some((property) => propertyName(property) === "profileId");
  if (profileId && !javascript(file)) {
    const value = Node.isPropertyAssignment(factories) ? factories.initializer : undefined;
    const tuple = value && Node.isArrayLiteralExpression(value) && !value.elements.some((element) => Node.isSpreadElement(element));
    if (!tuple) {
      return { ...site, status: "report", message: `${line(call)}: prepare modules value stays; write a tuple array literal without a spread` };
    }
  }
  return { ...site, status: "rewrite", replacement: undefined, factories };
}

export function inspectPrepare(file) {
  const sites = [];
  for (const call of file.descendants(SyntaxKind.CallExpression)) {
    const method = methodName(call);
    if (method?.name !== "prepare") continue;
    const inspection = prepareInspection(file, call, method);
    if (inspection) sites.push(inspection);
  }
  return sites.sort((a, b) => a.node.getStart() - b.node.getStart());
}

/** Every comment inside the call, found through the syntax tree so that strings and templates cannot hide or fake one. */
function callComments(file, call) {
  const start = call.getStart();
  const characters = file.text.slice(start, call.end).split("");
  // AST literal spans protect comment-like text inside strings, regular
  // expressions and template chunks. The pinned scanner then sees every gap,
  // including punctuation that forEachChild deliberately does not return.
  const visit = node => {
    if (ts.isLiteralExpression(node) || ts.isTemplateLiteralToken(node) || node.kind === SyntaxKind.JsxText) {
      for (let position = node.getStart(); position < node.end; position += 1) {
        if (characters[position - start] !== "\n" && characters[position - start] !== "\r") characters[position - start] = " ";
      }
    } else node.forEachChild(visit);
  };
  visit(call);
  const scanner = ts.createScanner(false, ts.LanguageVariant.Standard, characters.join(""));
  const comments = [];
  for (let kind = scanner.scan(); kind !== SyntaxKind.EndOfFile; kind = scanner.scan()) {
    if (kind === SyntaxKind.SingleLineCommentTrivia || kind === SyntaxKind.MultiLineCommentTrivia) {
      comments.push({ pos: start + scanner.getTokenStart(), end: start + scanner.getTokenEnd() });
    }
  }
  return comments;
}

function isolateTarget(file, expression) {
  const qualified = receiver(file, expression);
  if (qualified.ok) return qualified;
  return { ok: false, reason: qualified.reason };
}

function isolateInspection(file, call) {
  const expression = call.expression;
  const importedIsolate = importedCall(expression, "isolate", CONFORMANCE);
  if (!importedIsolate) return undefined;
  const args = (call.arguments ?? []);
  const site = { kind: "isolate", node: call, counted: true };
  if (args.length !== 2 || !Node.isObjectLiteralExpression(args[1])) {
    return { ...site, status: "report", message: `${line(call)}: isolate stays; pass one entry source and one options object literal` };
  }
  const options = args[1];
  const declaration = options.properties.find((property) => propertyName(property) === "declaration");
  const factory = options.properties.find((property) => propertyName(property) === "factory");
  if (!declaration || !factory) return undefined;
  const target = isolateTarget(file, args[0]);
  if (!target.ok) return { ...site, status: "report", message: `${line(call)}: isolate api argument stays; use a local Assembly receiver or assemblyFor()` };
  const declarationValue = Node.isPropertyAssignment(declaration) ? declaration.initializer : declaration.name;
  const factoryValue = Node.isPropertyAssignment(factory) ? factory.initializer : factory.name;
  if (runtimePicked(declarationValue, file) || runtimePicked(factoryValue, file)) {
    return { ...site, status: "report", message: `${line(call)}: isolate declaration or factory stays; choose both at module scope before the call` };
  }
  const implement = valueImport(file, "implement", call);
  const scoped = valueImport(file, "scoped", call);
  if (implement.collision) return { ...site, status: "report", message: `${line(call)}: isolate stays; rename the local binding that collides with implement` };
  if (scoped.collision) return { ...site, status: "report", message: `${line(call)}: isolate stays; rename the local binding that collides with scoped` };
  const rest = options.properties.filter((property) => property !== declaration && property !== factory);
  const restText = rest.length === 0 ? "" : ` ${rest.map((property) => property.getText()).join(", ")} `;
  // The rewrite rebuilds the call, so only comments between the two arguments stay (in front of the options).
  // A comment anywhere else would be lost silently: leave the call to a hand edit.
  const betweenStart = args[0].getEnd();
  const betweenEnd = options.getStart();
  const comments = callComments(file, call);
  const keptComments = comments.filter((range) => range.pos >= betweenStart && range.end <= betweenEnd);
  if (keptComments.length < comments.length) {
    return { ...site, status: "report", message: `${line(call)}: isolate stays; move the comments out of the call or rewrite it by hand` };
  }
  const between = file.text.slice(betweenStart, betweenEnd);
  const kept = keptComments.length > 0;
  const separator = kept ? between : ", ";
  const directive = /@ts-(?:expect-error|ignore)/u.exec(between)?.[0];
  const note = kept && directive ? `${line(call)}: check the placement of ${directive} after the isolate rewrite` : undefined;
  return {
    ...site, status: "rewrite", note,
    replacement: `${importedIsolate.local}(${implement.expression}${generic(target.typeArguments)}()(${declarationValue.getText()}, ${factoryValue.getText()}, ${scoped.expression})${separator}{${restText}})`,
    imports: [["implement", ASSEMBLY], ["scoped", RESOURCES]],
  };
}

export function inspectIsolate(file) {
  const sites = [];
  for (const call of file.descendants(SyntaxKind.CallExpression)) {
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
  const original = importedName(specifier);
  const replacement = TYPE_NAMES.get(original);
  if (!replacement) return undefined;
  const local = imported(specifier);
  const renameImport = !specifier.propertyName;
  const collision = renameImport && nameWouldCollide(file, replacement, specifier);
  const references = file.descendants(SyntaxKind.Identifier)
    .filter((identifier) => identifier.getText() === local && refersTo(identifier, specifier)
      && identifier !== specifier.name && identifier !== specifier.propertyName);
  return references.map((identifier) => {
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
  for (const declaration of file.imports) {
    if (moduleName(declaration) !== ASSEMBLY) continue;
    for (const specifier of importNames(declaration)) {
      const found = typeImportInspection(file, declaration, specifier);
      if (found) {
        sites.push(...found);
      }
    }
  }
  for (const name of file.descendants(SyntaxKind.QualifiedName)) {
    const original = name.right.getText();
    if (!TYPE_NAMES.has(original) || !Node.isIdentifier(name.left)) continue;
    const namespace = name.left;
    if (!namespaceImports(file, ASSEMBLY).some((entry) => refersToNamespace(namespace, entry))) continue;
    const reference = parentOfKind(name, SyntaxKind.TypeReference);
    if (reference?.typeName === name) sites.push(typeInspection(file, name.right, original, (reference.typeArguments ?? []).length, "namespace"));
  }
  for (const type of file.descendants(SyntaxKind.ImportType)) {
    if (importTypeModule(type) !== ASSEMBLY) continue;
    const qualifier = type.qualifier;
    if (qualifier && Node.isIdentifier(qualifier) && TYPE_NAMES.has(qualifier.getText())) {
      sites.push(typeInspection(file, qualifier, qualifier.getText(), (type.typeArguments ?? []).length, "import-type"));
    }
  }
  return sites.sort((a, b) => a.node.getStart() - b.node.getStart());
}

function reportExtras(file) {
  const extras = [];
  const handledFactories = new Set(inspectPrepare(file).map((site) => site.factories).filter(Boolean));
  for (const property of file.descendants(SyntaxKind.PropertyAssignment)) {
    const name = propertyName(property);
    if (name === "bindFactory" || name === "bindInput") {
      extras.push({ status: "report", message: `${line(property)}: custom Assembly ${name} member stays; only its prepare member maps to the new Assembly` });
    }
  }
  for (const property of file.descendants(SyntaxKind.MethodDeclaration)) {
    const parent = property.parent;
    if (!Node.isObjectLiteralExpression(parent)) continue;
    if (["bindFactory", "bindInput"].includes(property.name.getText())) {
      extras.push({ status: "report", message: `${line(property)}: custom Assembly ${property.name.getText()} member stays; only its prepare member maps to the new Assembly` });
    }
  }
  for (const property of file.descendants(SyntaxKind.ShorthandPropertyAssignment)) {
    if (["bindFactory", "bindInput"].includes(property.name.getText())) {
      extras.push({ status: "report", message: `${line(property)}: custom Assembly ${property.name.getText()} member stays; only its prepare member maps to the new Assembly` });
    }
  }
  for (const property of file.descendants(SyntaxKind.PropertyAssignment)) {
    if (handledFactories.has(property) || propertyName(property) !== "factories") continue;
    if (holdsHandles(property)) extras.push({ status: "report", message: `${line(property)}: factories property stays; rename the helper property and its callers to modules by hand` });
  }
  for (const property of file.descendants(SyntaxKind.ShorthandPropertyAssignment)) {
    if (handledFactories.has(property) || property.name.getText() !== "factories") continue;
    if (holdsHandles(property)) extras.push({ status: "report", message: `${line(property)}: factories property stays; rename the helper property and its callers to modules by hand` });
  }
  for (const identifier of file.descendants(SyntaxKind.Identifier)) {
    if (!["BindingErrorCode", "PreparationErrorCode"].includes(identifier.getText())) continue;
    const fromAssembly = importedIdentifier(identifier, identifier.getText(), ASSEMBLY)
      || namespaceImports(file, ASSEMBLY).some((entry) => {
        const parent = identifier.parent;
        return Node.isQualifiedName(parent) && parent.right === identifier && refersToNamespace(parent.left, entry);
      });
    if (fromAssembly && identifier.parent.kind !== SyntaxKind.ImportSpecifier) {
      extras.push({ status: "report", message: `${line(identifier)}: ${identifier.getText()} reference stays; add assembly.bind.invalid-group and assembly.prepare.duplicate-module to exhaustive handling` });
    }
  }
  for (const declaration of file.exports) {
    if (moduleName(declaration) !== ASSEMBLY) continue;
    if (declaration.exportClause?.kind !== SyntaxKind.NamedExports) {
      extras.push({ status: "report", message: `${line(declaration)}: export${typeOnly(declaration) ? " type" : ""} * from ${ASSEMBLY} stays; importers of renamed types through this module need manual review` });
    }
    for (const entry of exportNames(declaration)) {
      if (TYPE_NAMES.has(importedName(entry))) {
        extras.push({ status: "report", message: `${line(entry)}: re-export of ${importedName(entry)} stays; importers of it through this module are not rewritten` });
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

export function reportAll(file) {
  const inspected = inspectAll(file);
  return [
    ...inspected.entries,
    ...inspected.prepare,
    ...inspected.isolate,
    ...inspected.types,
    ...inspected.extras,
  ].filter((site) => site.status === "report").map((site) => site.message);
}

function applyInspections(file, sites, manual) {
  let edits = 0;
  const renameImports = new Map();
  const replacements = [];
  const ordered = sites.slice().sort((a, b) => a.node.getStart() - b.node.getStart());
  for (const site of ordered) {
    if (site.status === "report") {
      manual(site.message);
    } else if (site.note) {
      manual(site.note);
    }
  }
  for (const site of ordered.slice().reverse()) {
    if (site.status === "report") continue;
    if (site.renameImport) renameImports.set(site.renameImport.specifier, site.renameImport.replacement);
    if (site.replacement !== undefined) {
      replacements.push(replaceNode(site.node, site.replacement));
      edits += 1;
    }
  }
  for (const [specifier, replacement] of renameImports) {
    replacements.push(replaceNode(specifier.propertyName ?? specifier.name, replacement));
    edits += 1;
  }
  file.apply(replacements);
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
  const replacements = [];
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
    if (Node.isShorthandPropertyAssignment(property)) replacements.push(replaceNode(property, `modules: ${property.name.getText()}`));
    else replacements.push(replaceNode(property.name, "modules"));
    edits += 1;
  }
  file.apply(replacements);
  return edits;
}

export function transformIsolate(file, manual) {
  return applyInspections(file, inspectIsolate(file), manual);
}

export function transformTypes(file, manual) {
  return applyInspections(file, inspectTypes(file), manual);
}

function usedImport(file, target) {
  const local = target.name?.getText() ?? target.getText();
  return file.descendants(SyntaxKind.Identifier).some((identifier) => {
    if (identifier === target.name || identifier === target.propertyName) return false;
    if (identifier.getText() !== local) return false;
    return true;
  });
}

const localName = (target) => target.name?.getText() ?? target.getText();
// Imports that were in use before any rewrite. Only these may be dropped when the rewrite leaves them unused.
const importsInUse = new WeakMap();

/** Call before the first rewrite of a file. */
export function recordImports(file) {
  const names = new Set();
  const bare = new Set();
  file.imports.forEach((declaration, index) => {
    if (![ASSEMBLY, RESOURCES].includes(moduleName(declaration))) return;
    const specifiers = [...importNames(declaration), ...(namespaceName(declaration) ? [namespaceName(declaration)] : [])];
    if (specifiers.length === 0 && !declaration.importClause?.name) bare.add(index);
    for (const specifier of specifiers) {
      if (usedImport(file, specifier)) names.add(`${moduleName(declaration)}|${localName(specifier)}`);
    }
  });
  importsInUse.set(file, { names, bare });
}

export function transformImports(file) {
  const recorded = importsInUse.get(file);
  if (!recorded) return 0;
  let edits = 0;
  const replacements = [];
  for (const [index, declaration] of file.imports.entries()) {
    const module = moduleName(declaration);
    if (![ASSEMBLY, RESOURCES].includes(module) || recorded.bare.has(index)) continue;
    const dropped = specifier => recorded.names.has(`${module}|${localName(specifier)}`) && !usedImport(file, specifier);
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
      const bindings = declaration.importClause.namedBindings;
      replacements.push({ start: declaration.importClause.name.end, end: bindings.end, text: "" });
    }
  }
  file.apply(replacements);
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
  };
}
