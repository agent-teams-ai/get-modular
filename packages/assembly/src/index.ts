export { assemblyFor } from "./composition/root.js";
export { AssemblyBindingError } from "./features/construction/factory.js";
export type {
  AnyFactoryHandle, Assembly, AssemblyOutcome, AssemblyPreparationResult,
  AssemblyPrepareInput, BindingErrorCode, CapabilityContract, CapabilitySchema,
  CreatedEntry, FactoryCapabilities, FactoryContext, FactoryDependencies,
  FactoryHandle, FactoryProduct, ObservedCancellation, PreparationErrorCode,
  PreparedAssembly, ReturnedProduct, RootHandles, RootInstances, RunErrorCode,
  RunOptions, SuccessfulComposition, IsUnion, ValidDeclaration,
} from "./features/construction/types.js";
