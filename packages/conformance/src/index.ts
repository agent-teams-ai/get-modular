export { checkNamespaces, contractSuite, guardHandles, isolate, runContractSuite, smoke } from "./composition/root.js";
export { ConformanceError } from "./features/errors/errors.js";
export type { ConformanceErrorCode } from "./features/errors/errors.js";
export type { Isolated, SmokeInjection, SmokeStep } from "./features/harness/types.js";
export type { NamespaceViolation } from "./features/namespaces/check.js";
export type { HandleGuard } from "./features/handles/guard.js";
export type {
  CaseContext, ContractCase, ContractSubject, ContractSuite, ContractValue, TestFn,
} from "./features/suites/types.js";
