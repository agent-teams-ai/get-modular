# Changelog

## 0.3.0

### Minor Changes

- 345bad1: Add the authoring builder and capability-scoped handles (ADR-0032).
  
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
- fcb3a32: Pass a per-run scope and declared inputs to runs (ADR-0031). One prepared assembly now serves many isolated runs.
  
  - `FactoryContext` is `{ signal, scope }`. `scope` is the value passed to `run()`; Assembly never reads it.
  - `run({ signal, scope, inputs })`: every option may be omitted or `undefined`.
  - `bindInput(declaration)` binds a declaration without slots whose capability record each run supplies.
    `prepare({ composition, factories, roots, inputs })` accepts input handles only in `inputs`.
  - New codes: `assembly.prepare.input-handles` and `assembly.run.invalid-inputs` with failed phase `"inputs"`.
  
  Migration: code that constructs `FactoryContext` or `RunOptions` itself or implements `PreparedAssembly` adds
  `scope`. Exhaustive maps over `PreparationErrorCode`, `RunErrorCode` or the failed `phase` add the new members.
  Custom implementations of `Assembly<C>` (for example test doubles) must also implement `bindInput`.
  Factories and ordinary `run()` calls need no change.
  
  Authoring surface changed: yes

### Patch Changes

- Updated dependencies [fcb3a32]
  - @get-modular/core@0.3.0

## 0.2.0

### Minor Changes

- f4e6137: Establish a new versioned API evidence point for Core and Assembly while retaining
  the historical 0.1.0 baseline erratum. Preserve Assembly's intentional public
  IsUnion and ValidDeclaration type aliases and their existing inference behavior.
  The historical baseline did not describe all released 0.1.0 declarations; the
  new baseline describes only the new release and does not rewrite that history.

### Patch Changes

- d555dfd: Support Node.js 26 from 26.10.0 while retaining Node.js 24 from
  24.18.0 and excluding Node.js 25.
- 6373d7f: Adopt the shared typed quality gate and harden invalid-input
  handling. Preserve factory receivers, observe cancellation after final
  fulfillment, and retain null-prototype result records.
- Updated dependencies [f4e6137]
  - @get-modular/core@0.2.0

## Unreleased

- Match root handles by their selected module identity when module and
  implementation IDs differ.
- Add an executable consumer example and Host integration guidance.

## 0.1.0

- Prepare first public pre-1.0 publication with exactly Core 0.1.0.

- Add authenticated factory handles and synchronous declaration snapshots.
- Add bounded preparation and complete verification through public Core.
- Add typed sequential construction, cancellation and explicit ownership handoff.
