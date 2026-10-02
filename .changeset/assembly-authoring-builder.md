---
"@get-modular/assembly": minor
---

Add the authoring builder and capability-scoped handles (ADR-0032).

- `defineContract<Value>()({ id, revision })` creates one descriptor per capability. `revision` is an integer
  from 1 to 2147483647. `provide()` and `slot(slotId, cardinality)` produce declaration entries in the current
  wire generation, where a revision is the exact token `<id>/r<revision>`.
- `declareModule(spec)` supplies `kind` and `schemaVersion` and refuses a spec that carries either field.
  Its type accepts only entries produced by a descriptor, so declarations never spell `compatibility`.
- `CapabilitiesOf<typeof A | typeof B>` derives a capability map from descriptors. Name a map over many
  descriptors as `interface Map extends CapabilitiesOf<...> {}`.
- A handle is invariant only in the capabilities its declaration uses. `prepare` accepts handles bound under
  different maps when each used capability has the identical contract in the preparing map, and rejects a
  handle that uses a capability the preparing map lacks. Pass handles as a literal array: an array typed as
  `AnyFactoryHandle<C>[]` beforehand skips that check, and so does an explicit `prepare<R>()` type argument.
- `ModuleFactory<C, D, Instance, Context>` types a module factory with the module's own map.
- New types: `AnyContract`, `CapabilitiesOf`, `CapabilityBrand`, `Cardinality`, `Contract`, `DeclarationSpec`,
  `Declared`, `KnownCapabilities`, `ModuleFactory`, `ProvidedEntry`, `SlotEntry`, `UsedCapability`.
  `AssemblyPrepareInput` gains a fourth, defaulted parameter for the factory tuple.

Migration: declarations written with Core's helpers and hand-written `CapabilityContract` maps keep working in
0.3.0, and so does `AssemblyPrepareInput<C, R>`. Code that relied on whole-map handle invariance, or that names
the internal brand of `FactoryHandle`, `AnyFactoryHandle` or `AnyInputHandle`, moves to the capability-scoped
form. In 0.2.0 `FactoryHandle<C>` meant any handle of map `C`; use `AnyFactoryHandle<C>` for that now.

Authoring surface changed: yes
