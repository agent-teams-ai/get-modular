export { assemblyFor } from "./composition/root.js";
export { AssemblyBindingError, declareModule, defineContract, entriesOf, group, implement, input } from "./features/construction/factory.js";
export type {
  AnyContract, AnyEntry, AnyInputEntry, AnyModuleEntry, Assembly, AssemblyOutcome, AssemblyPreparationResult,
  AssemblyPrepareInput, BindingErrorCode, CapabilitiesOf, CapabilityBrand, CapabilityContract, CapabilitySchema,
  CapabilitiesProvidedBy, Cardinality, ContextAdapter, Contract, CreatedEntry, DeclarationSpec, Declared,
  DependenciesOf, DuplicateModule, EntriesOf, EntryFactory, FactoryCapabilities, FactoryContext, FactoryDependencies,
  FactoryProduct, InputEntries, InputEntry, InstanceOf, KnownCapabilities, KnownModules, ModuleEntry, ModuleFactory,
  ModuleGroup, ModuleItem, ObservedCancellation, PreparationErrorCode, PreparedAssembly, ProvidedEntry,
  ReturnedProduct, RootEntries, RootInstances, RunErrorCode, RunInputs, RunOptions, SlotEntry, SuccessfulComposition,
  TupleOnly, UnresolvedBinding, UsedCapability, UsedKeysOf, UsedMap, IsUnion, ValidDeclaration,
} from "./features/construction/types.js";
