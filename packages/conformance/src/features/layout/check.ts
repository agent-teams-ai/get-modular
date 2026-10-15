import { ConformanceError, invalid } from "../errors/errors.js";
import type {
  LayoutExport, LayoutImport, LayoutViolation, ModuleLayoutMetrics, ModuleLayoutRecords, ModuleLayoutReport,
} from "./types.js";

const MODULE = /\.module\.[cm]?tsx?$/u;
const DECLARATION = /\.declaration\.[cm]?tsx?$/u;
const GROUP = /\.group\.[cm]?tsx?$/u;
const ROOT = /\.root\.[cm]?tsx?$/u;
const INPUTS = /\.inputs\.[cm]?tsx?$/u;
const CONTRACTS = /\.contracts\.[cm]?tsx?$/u;
const SOURCE = /\.[cm]?tsx?$/u;

type Importers = Map<string, LayoutImport[]>;
type LayoutContext = {
  readonly files: ReadonlySet<string>;
  readonly imports: readonly LayoutImport[];
  readonly importers: Importers;
  readonly groups: ReadonlyMap<string, string>;
  readonly useCaseExports: ReadonlyMap<string, readonly LayoutExport[]>;
};

function normalize(path: string, label: string): string {
  const value = path.replaceAll("\\", "/");
  if (value.length === 0 || value.startsWith("/") || value.split("/").some(segment =>
    segment.length === 0 || segment === "." || segment === "..")) {
    throw invalid(`checkModuleLayout() requires ${label} to be a normalized relative path`);
  }
  return value;
}

function ownData(record: unknown, key: string): unknown {
  if (typeof record !== "object" || record === null) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
}

function array(record: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(record)) {
    throw invalid(`checkModuleLayout() requires ${path} to be an array`);
  }
  return record;
}

function text(record: unknown, path: string): string {
  if (typeof record !== "string" || record.length === 0) {
    throw invalid(`checkModuleLayout() requires ${path} to be a non-empty string`);
  }
  return record;
}

function routeOf(path: string): readonly string[] {
  const segments = path.split("/");
  const route: string[] = [];
  for (let index = 0; index < segments.length - 1; index += 1) {
    if (segments[index] === "features" && segments[index + 1] !== undefined) {
      route.push(segments[index + 1] ?? "");
      index += 1;
    }
  }
  return Object.freeze(route);
}

const routeText = (route: readonly string[]): string => route.join("/");
const basename = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

function isDescriptor(path: string): boolean {
  const route = routeOf(path);
  const own = route.at(-1);
  return CONTRACTS.test(path) && own !== undefined
    && path.endsWith(`/composition/${own}.contracts.ts`);
}

function featureFile(files: ReadonlySet<string>, route: readonly string[], suffix: string): string | undefined {
  const name = route.at(-1);
  if (name === undefined) {
    return undefined;
  }
  return [...files].find(path => routeText(routeOf(path)) === routeText(route)
    && path.includes("/composition/") && basename(path) === `${name}${suffix}`);
}

function violation(code: LayoutViolation["code"], path: string, message: string, relatedPath?: string): LayoutViolation {
  return Object.freeze({ code, path, relatedPath, message });
}

function readRecords(records: ModuleLayoutRecords): {
  readonly files: ReadonlySet<string>;
  readonly imports: readonly LayoutImport[];
  readonly useCaseExports: ReadonlyMap<string, readonly LayoutExport[]>;
} {
  const paths = array(ownData(records, "files"), "records.files").map((entry, index) =>
    normalize(text(entry, `records.files[${String(index)}]`), `records.files[${String(index)}]`));
  const files = new Set(paths);
  if (files.size !== paths.length) {
    throw invalid("checkModuleLayout() requires records.files to contain distinct paths");
  }
  const imports = array(ownData(records, "imports"), "records.imports").map((entry, index) => {
    const path = `records.imports[${String(index)}]`;
    const from = normalize(text(ownData(entry, "from"), `${path}.from`), `${path}.from`);
    const to = normalize(text(ownData(entry, "to"), `${path}.to`), `${path}.to`);
    const mode = ownData(entry, "mode");
    if (mode !== "type" && mode !== "value") {
      throw invalid(`checkModuleLayout() requires ${path}.mode to be "type" or "value"`);
    }
    return Object.freeze({ from, to, mode });
  });
  const exportsInput = ownData(records, "useCaseExports");
  const useCaseExports = new Map<string, readonly LayoutExport[]>();
  if (typeof exportsInput !== "object" || exportsInput === null || Array.isArray(exportsInput)) {
    throw invalid("checkModuleLayout() requires records.useCaseExports to be an object");
  }
  for (const key of Object.keys(exportsInput)) {
    const path = normalize(key, "records.useCaseExports key");
    const values = array(ownData(exportsInput, key), `records.useCaseExports.${key}`).map((entry, index) => {
      const item = `records.useCaseExports.${key}[${String(index)}]`;
      const name = text(ownData(entry, "name"), `${item}.name`);
      const kind = ownData(entry, "kind");
      if (kind !== "function" && kind !== "value") {
        throw invalid(`checkModuleLayout() requires ${item}.kind to be "function" or "value"`);
      }
      return Object.freeze({ name, kind });
    });
    useCaseExports.set(path, Object.freeze(values));
  }
  return { files, imports: Object.freeze(imports), useCaseExports };
}

function indexImports(files: ReadonlySet<string>, imports: readonly LayoutImport[]): Importers {
  const importers: Importers = new Map();
  for (const edge of imports) {
    if (!files.has(edge.from) || !files.has(edge.to)) {
      throw invalid(`checkModuleLayout() requires every import endpoint in records.files (${edge.from} -> ${edge.to})`);
    }
    const edges = importers.get(edge.to) ?? [];
    edges.push(edge);
    importers.set(edge.to, edges);
  }
  return importers;
}

function groupsOf(files: ReadonlySet<string>): ReadonlyMap<string, string> {
  const groups = new Map<string, string>();
  for (const path of files) {
    if (GROUP.test(path)) {
      groups.set(routeText(routeOf(path)), path);
    }
  }
  return groups;
}

function placementViolations(path: string, useCaseExports: ReadonlyMap<string, readonly LayoutExport[]>):
LayoutViolation[] {
  const violations: LayoutViolation[] = [];
  if (CONTRACTS.test(path) && !isDescriptor(path)) {
    violations.push(violation("descriptor-path", path,
      "a *.contracts.ts file must be composition/<own segment>.contracts.ts"));
  }
  const afterComposition = /\/composition\/(.+)$/u.exec(path)?.[1];
  if (afterComposition !== undefined && afterComposition.includes("/")) {
    violations.push(violation("nested-composition", path, "composition/ must stay flat"));
  }
  const application = path.lastIndexOf("/application/");
  const rest = application < 0 ? "" : path.slice(application + "/application/".length);
  if (application >= 0 && !rest.includes("/") && SOURCE.test(rest)) {
    violations.push(violation("application-file", path, "a source file must not sit directly in application/"));
  }
  if (path.includes("/application/use-cases/") && SOURCE.test(path)) {
    const exports = useCaseExports.get(path) ?? [];
    if (exports.length !== 1 || exports[0]?.kind !== "function") {
      violations.push(violation("use-case-export", path, "a use-case file must export exactly one function"));
    }
  }
  return violations;
}

function moduleDeclarationViolations(path: string, context: LayoutContext): LayoutViolation[] {
  const violations: LayoutViolation[] = [];
  const route = routeOf(path);
  if (MODULE.test(path)) {
    const declarations = context.imports.filter(edge => edge.from === path && DECLARATION.test(edge.to)
      && routeText(routeOf(edge.to)) === routeText(route));
    if (declarations.length === 0) {
      violations.push(violation("orphan-module", path,
        "a *.module.ts file must import a *.declaration.* file of its feature"));
    }
  }
  if (!DECLARATION.test(path)) {
    return violations;
  }
  const ownInputs = `${route.at(-1) ?? ""}.inputs.ts`;
  const consumers = (context.importers.get(path) ?? []).filter(edge =>
    (MODULE.test(edge.from) || INPUTS.test(edge.from)) && routeText(routeOf(edge.from)) === routeText(route)
    && (!INPUTS.test(edge.from) || basename(edge.from) === ownInputs));
  if (consumers.length === 0) {
    violations.push(violation("orphan-declaration", path,
      "a *.declaration.ts file must be imported by one *.module.ts file or its feature inputs file"));
  }
  for (const edge of context.imports.filter(entry => entry.from === path && CONTRACTS.test(entry.to))) {
    if (!context.files.has(edge.to) || !isDescriptor(edge.to)) {
      violations.push(violation("descriptor-path", path,
        "a declaration import must resolve to composition/<own segment>.contracts.ts", edge.to));
    }
  }
  return violations;
}

function fileViolations(context: LayoutContext): LayoutViolation[] {
  const violations: LayoutViolation[] = [];
  for (const path of context.files) {
    violations.push(...placementViolations(path, context.useCaseExports), ...moduleDeclarationViolations(path, context));
  }
  return violations;
}

function ownerViolations(context: LayoutContext): LayoutViolation[] {
  const violations: LayoutViolation[] = [];
  for (const path of context.files) {
    if (!MODULE.test(path)) {
      continue;
    }
    const route = routeOf(path);
    const owners = (context.importers.get(path) ?? []).filter(edge => GROUP.test(edge.from) || ROOT.test(edge.from));
    const ownGroup = featureFile(context.files, route, ".group.ts");
    const valid = owners.filter(edge => ROOT.test(edge.from) || edge.from === ownGroup);
    if (owners.length === 0) {
      violations.push(violation("orphan-module", path,
        "a *.module.ts file must be imported by its feature group or a root"));
    } else if (owners.length !== 1 || valid.length !== 1) {
      violations.push(violation("group-count", path,
        "a *.module.ts file must be imported by exactly one own feature group or root"));
    }
  }
  return violations;
}

function groupViolations(context: LayoutContext): LayoutViolation[] {
  const violations: LayoutViolation[] = [];
  for (const [groupRoute, groupPath] of context.groups) {
    const route = groupRoute.split("/").filter(Boolean);
    for (const edge of context.importers.get(groupPath) ?? []) {
      if (ROOT.test(edge.from)) {
        if (route.length > 1) {
          violations.push(violation("root-imports-sub-feature-group", edge.from,
            "a root must not import a sub-feature group", groupPath));
        }
        continue;
      }
      const expected = featureFile(context.files, route.slice(0, -1), ".group.ts");
      if (!GROUP.test(edge.from) || edge.from !== expected) {
        violations.push(violation("child-group-outside-parent", edge.from,
          "a child group may be imported only by its parent group", groupPath));
      }
    }
  }
  return violations;
}

function metrics(files: ReadonlySet<string>): ModuleLayoutMetrics {
  const featureRoutes = new Set([...files].map(path => routeText(routeOf(path))).filter(Boolean));
  return {
    featureCount: featureRoutes.size,
    moduleCount: [...files].filter(path => MODULE.test(path)).length,
    modulesPerFeature: Object.freeze(Object.fromEntries(
      [...featureRoutes].toSorted().map(route => [
        route,
        [...files].filter(path => MODULE.test(path) && routeText(routeOf(path)) === route).length,
      ]),
    )),
  };
}

/**
 * Checks the Get Modular rules of the Consumer Module Standard over normalized source records. It returns the
 * modules-per-feature metrics when the tree passes and throws one `conformance.layout.violation` with every
 * violation and those metrics in `details` otherwise.
 */
export function checkModuleLayout(records: ModuleLayoutRecords): ModuleLayoutReport {
  array(ownData(records, "files"), "records.files");
  const { files, imports, useCaseExports } = readRecords(records);
  const context: LayoutContext = {
    files, imports, importers: indexImports(files, imports), groups: groupsOf(files), useCaseExports,
  };
  const violations = [
    ...fileViolations(context), ...ownerViolations(context), ...groupViolations(context),
  ];
  const report: ModuleLayoutReport = Object.freeze({ ...metrics(files), violations: Object.freeze(violations) });
  if (violations.length > 0) {
    throw new ConformanceError("conformance.layout.violation",
      `${String(violations.length)} layout violation${violations.length === 1 ? "" : "s"}: ${
        violations.map(entry => `${entry.code} ${entry.path}`).join("; ")}`,
      { details: report });
  }
  return report;
}
