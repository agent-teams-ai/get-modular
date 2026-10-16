export type LayoutImportMode = "type" | "value";

/**
 * One import edge after the collector has resolved its specifier to a repository-relative path. `from` must be a
 * collected file. `to` may lie outside the collected files (an external or unresolved target, for example
 * `some-pkg/thing.contracts.js`); only a `*.contracts.*` target outside the files is a violation.
 */
export type LayoutImport = {
  readonly from: string;
  readonly to: string;
  readonly mode: LayoutImportMode;
};

export type LayoutExportKind = "function" | "value";

export type LayoutExport = {
  readonly name: string;
  readonly kind: LayoutExportKind;
};

/** The normalized records a consumer collects. `checkModuleLayout` never reads files or imports what it scans. */
export type ModuleLayoutRecords = {
  readonly files: readonly string[];
  readonly imports: readonly LayoutImport[];
  readonly useCaseExports: Readonly<Record<string, readonly LayoutExport[]>>;
};

export type LayoutViolationCode =
  | "application-file"
  | "child-group-outside-parent"
  | "descriptor-path"
  | "group-count"
  | "module-declaration"
  | "nested-composition"
  | "orphan-declaration"
  | "orphan-module"
  | "root-imports-sub-feature-group"
  | "use-case-export";

export type LayoutViolation = {
  readonly code: LayoutViolationCode;
  readonly path: string;
  readonly relatedPath?: string | undefined;
  readonly message: string;
};

export type ModulesPerFeature = Readonly<Record<string, number>>;

export type ModuleLayoutMetrics = {
  readonly featureCount: number;
  readonly moduleCount: number;
  readonly modulesPerFeature: ModulesPerFeature;
};

export type ModuleLayoutReport = ModuleLayoutMetrics & {
  readonly violations: readonly LayoutViolation[];
};
