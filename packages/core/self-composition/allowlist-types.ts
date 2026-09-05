import type { ModuleDeclaration } from "../src/features/authoring/internal.js";

// Build-only declaration/factory handles. They are never runtime resolution data.
export interface AllowlistHandle {
  readonly declaration: ModuleDeclaration;
  readonly factory: (dependencies: never) => unknown;
  readonly importPath: string;
  readonly factoryExport: string;
  readonly declarationExport: string;
  readonly localName: string;
}
