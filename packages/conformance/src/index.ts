export {
  checkModuleLayout, checkNamespaces, checkWiring, contractSuite, describeWiring, guardHandles, isolate,
  runContractSuite, smoke,
} from "./composition/root.js";
export { ConformanceError } from "./features/errors/errors.js";
export type { ConformanceErrorCode } from "./features/errors/errors.js";
export type { Isolated, SmokeInjection, SmokeStep } from "./features/harness/types.js";
export type { NamespaceViolation } from "./features/namespaces/check.js";
export type {
  WiringDifference, WiringDifferenceRule, WiringOracle, WiringRow,
} from "./features/wiring/types.js";
export type {
  LayoutExport, LayoutExportKind, LayoutImport, LayoutImportMode, LayoutViolation, LayoutViolationCode,
  ModuleLayoutMetrics, ModuleLayoutRecords, ModuleLayoutReport, ModulesPerFeature,
} from "./features/layout/types.js";
export type { HandleGuard } from "./features/handles/guard.js";
export type {
  CaseContext, ContractCase, ContractSubject, ContractSuite, ContractValue, TestFn,
} from "./features/suites/types.js";
