export { createScope, scoped } from "./composition/root.js";
export { CloseIncompleteError, InvalidArgumentError, ScopeClosedError } from "./features/scope/errors.js";
export type {
  CleanupContext, CloseOptions, CloseReport, Debt, ModuleContext, Resources, ResourcesErrorCode,
  Scope, ScopeControl, ScopeOptions, SetupContext, SetupSpec,
} from "./features/scope/types.js";
