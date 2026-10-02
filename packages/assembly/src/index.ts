export { assemblyFor } from "./composition/root.js";
export { AssemblyBindingError, declareModule, defineContract } from "./features/construction/factory.js";
export type {
  AnyContract, AnyFactoryHandle, AnyInputHandle, Assembly, AssemblyOutcome, AssemblyPreparationResult,
  AssemblyPrepareInput, BindingErrorCode, CapabilitiesOf, CapabilityContract, CapabilitySchema, Cardinality,
  Contract, CreatedEntry, DeclarationSpec, Declared, FactoryCapabilities, FactoryContext, FactoryDependencies,
  FactoryHandle, FactoryProduct, InputHandle, InputHandles, ObservedCancellation,
  PreparationErrorCode, PreparedAssembly, ProvidedEntry, ReturnedProduct, RootHandles, RootInstances,
  RunErrorCode, RunInputs, RunOptions, SlotEntry, SuccessfulComposition, IsUnion, ValidDeclaration,
} from "./features/construction/types.js";
