import { ConformanceError, invalid } from "../errors/errors.js";
import type {
  LayoutExport, LayoutImport, LayoutViolation, ModuleLayoutMetrics, ModuleLayoutRecords, ModuleLayoutReport,
} from "./types.js";

const EXTENSION = /\.[cm]?tsx?$/u;
const MODULE = /\.module\.[cm]?tsx?$/u;
const DECLARATION = /\.declaration\.[cm]?tsx?$/u;
const GROUP = /\.group\.[cm]?tsx?$/u;
const ROOT = /\.root\.[cm]?tsx?$/u;
const INPUTS = /\.inputs\.[cm]?tsx?$/u;
const CONTRACTS = /\.contracts\.[cm]?[jt]sx?$/u;

type FeatureSite = {
  /** Path of the feature root, for example `src/features/orders/features/child`; unique across source roots. */
  readonly key: string;
  readonly name: string;
  /** The parent feature's site, when the feature is a sub-feature. */
  readonly parent?: FeatureSite | undefined;
  /** Path segments below the feature root. */
  readonly rest: readonly string[];
};

type LayoutContext = {
  readonly files: ReadonlySet<string>;
  readonly sites: ReadonlyMap<string, FeatureSite | undefined>;
  readonly outgoing: ReadonlyMap<string, readonly LayoutImport[]>;
  /** Value-import edges by target; a type-only import never owns, uses or places a file. */
  readonly importers: ReadonlyMap<string, readonly LayoutImport[]>;
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

const basename = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

/** The innermost `features/<name>/` directory of a path that has at least one more segment below it. */
function siteOf(path: string): FeatureSite | undefined {
  const segments = path.split("/");
  let site: FeatureSite | undefined;
  for (let index = 0; index < segments.length - 2; index += 1) {
    const name = segments[index + 1];
    if (segments[index] === "features" && name !== undefined) {
      site = {
        key: segments.slice(0, index + 2).join("/"), name, parent: site, rest: segments.slice(index + 2),
      };
    }
  }
  return site;
}

/** The segments after the last `composition/` directory of a Host-level path, or of a feature's own rest. */
function belowComposition(segments: readonly string[], feature: boolean): readonly string[] | undefined {
  if (feature) {
    return segments[0] === "composition" ? segments.slice(1) : undefined;
  }
  const at = segments.lastIndexOf("composition");
  return at < 0 ? undefined : segments.slice(at + 1);
}

function violation(code: LayoutViolation["code"], path: string, message: string, relatedPath?: string): LayoutViolation {
  return Object.freeze({ code, path, relatedPath, message });
}

function readRecords(records: ModuleLayoutRecords): {
  readonly files: ReadonlySet<string>;
  readonly imports: readonly LayoutImport[];
  readonly useCaseExports: ReadonlyMap<string, readonly LayoutExport[]>;
} {
  const entries = array(ownData(records, "files"), "records.files");
  const paths: string[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const label = `records.files[${String(index)}]`;
    paths.push(normalize(text(ownData(entries, String(index)), label), label));
  }
  const files = new Set(paths);
  if (files.size !== paths.length) {
    throw invalid("checkModuleLayout() requires records.files to contain distinct paths");
  }
  const edges = array(ownData(records, "imports"), "records.imports");
  const imports: LayoutImport[] = [];
  for (let index = 0; index < edges.length; index += 1) {
    const path = `records.imports[${String(index)}]`;
    const entry = ownData(edges, String(index));
    const from = normalize(text(ownData(entry, "from"), `${path}.from`), `${path}.from`);
    const to = normalize(text(ownData(entry, "to"), `${path}.to`), `${path}.to`);
    const mode = ownData(entry, "mode");
    if (mode !== "type" && mode !== "value") {
      throw invalid(`checkModuleLayout() requires ${path}.mode to be "type" or "value"`);
    }
    if (!files.has(from)) {
      throw invalid(`checkModuleLayout() requires every import source in records.files (${from})`);
    }
    imports.push(Object.freeze({ from, to, mode }));
  }
  const exportsInput = ownData(records, "useCaseExports");
  const useCaseExports = new Map<string, readonly LayoutExport[]>();
  if (typeof exportsInput !== "object" || exportsInput === null || Array.isArray(exportsInput)) {
    throw invalid("checkModuleLayout() requires records.useCaseExports to be an object");
  }
  for (const key of Object.keys(exportsInput)) {
    const path = normalize(key, "records.useCaseExports key");
    const list = array(ownData(exportsInput, key), `records.useCaseExports.${key}`);
    const values: LayoutExport[] = [];
    for (let index = 0; index < list.length; index += 1) {
      const item = `records.useCaseExports.${key}[${String(index)}]`;
      const entry = ownData(list, String(index));
      const name = text(ownData(entry, "name"), `${item}.name`);
      const kind = ownData(entry, "kind");
      if (kind !== "function" && kind !== "value") {
        throw invalid(`checkModuleLayout() requires ${item}.kind to be "function" or "value"`);
      }
      values.push(Object.freeze({ name, kind }));
    }
    useCaseExports.set(path, Object.freeze(values));
  }
  return { files, imports: Object.freeze(imports), useCaseExports };
}

function buildContext(records: ModuleLayoutRecords): LayoutContext {
  const { files, imports, useCaseExports } = readRecords(records);
  const outgoing = new Map<string, LayoutImport[]>();
  const importers = new Map<string, LayoutImport[]>();
  for (const edge of imports) {
    outgoing.set(edge.from, [...outgoing.get(edge.from) ?? [], edge]);
    if (edge.mode === "value") {
      importers.set(edge.to, [...importers.get(edge.to) ?? [], edge]);
    }
  }
  const sites = new Map([...files].map(path => [path, siteOf(path)] as const));
  return { files, sites, outgoing, importers, useCaseExports };
}

/** A descriptor is `composition/<own segment>.contracts.*` of its feature, or a flat Host-level `composition/*.contracts.*`. */
function isDescriptor(path: string, site: FeatureSite | undefined): boolean {
  if (!CONTRACTS.test(path)) {
    return false;
  }
  const segments = path.split("/");
  const below = belowComposition(site === undefined ? segments : site.rest, site !== undefined);
  if (below === undefined || below.length !== 1) {
    return false;
  }
  return site === undefined || basename(path).replace(CONTRACTS, "") === site.name;
}

function placementViolations(path: string, context: LayoutContext): LayoutViolation[] {
  const violations: LayoutViolation[] = [];
  const site = context.sites.get(path);
  if (CONTRACTS.test(path) && !isDescriptor(path, site)) {
    violations.push(violation("descriptor-path", path,
      "a *.contracts.ts file must be composition/<own segment>.contracts.ts or a flat Host-level composition/*.contracts.ts"));
  }
  const below = belowComposition(site === undefined ? path.split("/") : site.rest, site !== undefined);
  if (below !== undefined && below.length > 1) {
    violations.push(violation("nested-composition", path, "composition/ must stay flat"));
  }
  const application = path.lastIndexOf("/application/");
  const rest = application < 0 ? "" : path.slice(application + "/application/".length);
  if (application >= 0 && !rest.includes("/") && EXTENSION.test(rest)) {
    violations.push(violation("application-file", path, "a source file must not sit directly in application/"));
  }
  if (path.includes("/application/use-cases/") && EXTENSION.test(path)) {
    const exports = context.useCaseExports.get(path) ?? [];
    if (exports.length !== 1 || exports[0]?.kind !== "function") {
      violations.push(violation("use-case-export", path, "a use-case file must export exactly one function"));
    }
  }
  return violations;
}

function moduleDeclarationViolations(path: string, context: LayoutContext): LayoutViolation[] {
  const violations: LayoutViolation[] = [];
  const site = context.sites.get(path);
  const edges = context.outgoing.get(path) ?? [];
  if (MODULE.test(path)) {
    const declares = edges.some(edge => edge.mode === "value" && DECLARATION.test(edge.to)
      && context.sites.get(edge.to)?.key === site?.key);
    if (!declares) {
      violations.push(violation("module-declaration", path,
        "a *.module.ts file must import a *.declaration.* file of its feature"));
    }
  }
  if (!DECLARATION.test(path)) {
    return violations;
  }
  const consumers = (context.importers.get(path) ?? []).filter(edge => {
    const from = context.sites.get(edge.from);
    if (from?.key !== site?.key) {
      return false;
    }
    const ownInputs = INPUTS.test(edge.from)
      && (site === undefined || basename(edge.from).replace(INPUTS, "") === site.name);
    return MODULE.test(edge.from) || ownInputs;
  });
  if (consumers.length === 0) {
    violations.push(violation("orphan-declaration", path,
      "a *.declaration.ts file must be imported by one *.module.ts file or its feature inputs file"));
  }
  for (const edge of edges) {
    if (CONTRACTS.test(edge.to) && !(context.files.has(edge.to) && isDescriptor(edge.to, context.sites.get(edge.to)))) {
      violations.push(violation("descriptor-path", path,
        "a declaration import must resolve to a collected composition/<own segment>.contracts.ts or Host-level descriptor",
        edge.to));
    }
  }
  return violations;
}

function fileViolations(context: LayoutContext): LayoutViolation[] {
  const violations: LayoutViolation[] = [];
  for (const path of context.files) {
    violations.push(...placementViolations(path, context), ...moduleDeclarationViolations(path, context));
  }
  return violations;
}

const groupPathOf = (site: FeatureSite): string => `${site.key}/composition/${site.name}.group.ts`;

function ownerViolations(context: LayoutContext): LayoutViolation[] {
  const violations: LayoutViolation[] = [];
  for (const path of context.files) {
    if (!MODULE.test(path)) {
      continue;
    }
    const site = context.sites.get(path);
    const ownGroup = site === undefined ? undefined : groupPathOf(site);
    const owners = (context.importers.get(path) ?? []).filter(edge => GROUP.test(edge.from) || ROOT.test(edge.from));
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
  for (const groupPath of context.files) {
    const site = context.sites.get(groupPath);
    if (!GROUP.test(groupPath) || site?.parent === undefined) {
      continue;
    }
    const expected = groupPathOf(site.parent);
    for (const edge of context.importers.get(groupPath) ?? []) {
      if (ROOT.test(edge.from)) {
        violations.push(violation("root-imports-sub-feature-group", edge.from,
          "a root must not import a sub-feature group", groupPath));
      } else if (edge.from !== expected) {
        violations.push(violation("child-group-outside-parent", edge.from,
          "a child group may be imported only by its parent group", groupPath));
      }
    }
  }
  return violations;
}

function metrics(context: LayoutContext): ModuleLayoutMetrics {
  const perFeature = new Map<string, number>();
  for (const [path, site] of context.sites) {
    if (site !== undefined) {
      perFeature.set(site.key, (perFeature.get(site.key) ?? 0) + (MODULE.test(path) ? 1 : 0));
    }
  }
  return {
    featureCount: perFeature.size,
    moduleCount: [...context.files].filter(path => MODULE.test(path)).length,
    modulesPerFeature: Object.freeze(Object.fromEntries([...perFeature].toSorted(([left], [right]) =>
      left < right ? -1 : 1))),
  };
}

/**
 * Checks the Get Modular rules of the Consumer Module Standard over normalized source records. It returns the
 * modules-per-feature metrics when the tree passes and throws one `conformance.layout.violation` with every
 * violation and those metrics in `details` otherwise.
 */
export function checkModuleLayout(records: ModuleLayoutRecords): ModuleLayoutReport {
  const context = buildContext(records);
  const violations = [
    ...fileViolations(context), ...ownerViolations(context), ...groupViolations(context),
  ];
  const report: ModuleLayoutReport = Object.freeze({ ...metrics(context), violations: Object.freeze(violations) });
  if (violations.length > 0) {
    throw new ConformanceError("conformance.layout.violation",
      `${String(violations.length)} layout violation${violations.length === 1 ? "" : "s"}: ${
        violations.map(entry => `${entry.code} ${entry.path}`).join("; ")}`,
      { details: report });
  }
  return report;
}
