export { assemblyFor, createEntryFamily } from "./composition/root.js";
export { AssemblyBindingError, captureWiringInputs, declareModule, defineContract, entriesOf, group, implement, injectionDependencies, input, snapshotFactoryProduct } from "./features/construction/factory.js";
export { formatFailure } from "./features/construction/format-failure.js";
export type {
  AnyContract, AnyEntry, AnyInputEntry, AnyModuleEntry, Assembly, AssemblyOutcome, AssemblyPreparationResult,
  AssemblyPrepareInput, BindingErrorCode, CapabilitiesOf, CapabilityBrand, CapabilityContract, CapabilitySchema,
  CapabilitiesProvidedBy, Cardinality, ContextAdapter, Contract, CreatedEntry, DeclarationSpec, Declared,
  DependenciesOf, DuplicateModule, EntriesOf, EntryFactory, FactoryCapabilities, FactoryContext, FactoryDependencies,
  FactoryProduct, InputEntries, InputEntry, InstanceOf, KnownCapabilities, ModuleEntry, ModuleFactory,
  ModuleGroup, ModuleItem, ObservedCancellation, PreparationErrorCode, PreparedAssembly, ProvidedEntry,
  ReturnedProduct, RootEntries, RootInstances, RunErrorCode, RunInputs, RunOptions, SlotEntry, SuccessfulComposition,
  TupleOnly, UnresolvedBinding, UsedCapability, UsedKeysOf, UsedMap, IsUnion, ValidDeclaration,
} from "./features/construction/types.js";
export type {
  EntryFamily, FamilyEntriesOf, FamilyEntry, FamilyGroup, FamilyItem, Wiring, WiringInjection,
  WiringInputMetadata, WiringMetadata, WiringPreparationResult, WiringPrepareInput,
} from "./features/construction/wiring-types.js";
