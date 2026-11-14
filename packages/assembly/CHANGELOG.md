# Changelog

## 0.8.0

### Minor Changes

- f311b13: Add optional native Effect construction over Get Modular's verified compositions.
  Assembly exposes a neutral preparation boundary shared by its existing Promise
  executor and the new Effect package. Ordinary Promise authoring, inference and
  execution keep their existing contracts and do not acquire an Effect dependency.
  Core receives the coordinated minor version required by the existing exact
  Core/Assembly release pair; this is a release metadata change, with no Core API
  or runtime change.
  
  The initial Effect package provides native factories, precise local bindings,
  typed construction errors and requirements, declared borrowed inputs and native
  Layer ownership. Its usage guide ships in the package. Effect owns native resource
  execution; the application continues to own admission and the lifetime of work.
  
  Effect is initially qualified against the exact catalog version 4.1.4. Consumers
  adopting native construction must install the matching newly released Core,
  Assembly and Effect packages together; published Assembly 0.7.1 has no neutral bridge.
  Existing Promise consumers require no source migration. Resource ownership changes
  for intentional native adoption follow the package's integration guide.

### Patch Changes

- e6e9746: Capture preparation root aliases before awaiting Core so changes to the caller's
  root map cannot replace, swap or remove roots in an existing preparation.
  Preserve entry identities, both preparation modes and existing validation order.
  
  Advance Core with Assembly to preserve their exact version pair. Core's runtime
  semantics are unchanged; release admission and publication remain separate.
- 28500bb: Apply Assembly's existing selected-entry ceiling to ordinary modules and borrowed
  inputs together before profile completion or Core invocation. Oversized mixed
  inventories now return `assembly.prepare.limit` instead of reaching Core or
  producing an oversized unresolved-binding diagnostic. Preserve the separate
  module-tree budget and valid inventories at the exact selected-entry limit.
  
  Advance Core with Assembly to preserve their exact release pair; Core behavior
  and valid-input APIs are unchanged. The pending coordinated release retains its
  existing admission and publication gates.
- 558d3fc: Keep Assembly's returned composition consistent with the immutable instructions
  it executes, include inferred bindings in the existing preparation limits, and
  reuse frozen provider candidates across repeated unresolved slots.
  
  Close deep resource trees without call-stack overflow while preserving cleanup
  order, reentrant abort notification, debt, escalation and retry. Successfully
  detached children stop retaining their parent resource graph.
  
  Validate deep Observation data iteratively while preserving graph identity,
  cycles, descriptor checks and validation before freezing. Public APIs and
  dependency boundaries remain unchanged.
  
  Advance Core with Assembly to preserve their exact version pair. Core's runtime
  semantics are unchanged; release admission and publication remain separate.
- Updated dependencies [e6e9746]
- Updated dependencies [28500bb]
- Updated dependencies [f311b13]
- Updated dependencies [558d3fc]
  - @get-modular/core@0.8.0

## 0.7.1

### Patch Changes

- b1866ac: Update the packaged README to explain complete descriptor unions and separate
  CapabilitiesOf bases, including early conflict checks. This is a documentation-only
  package update.
- Updated dependencies [7a7c4c5]
  - @get-modular/core@0.7.1

## 0.7.0

### Minor Changes

- a824f33: Add `formatFailure` for bounded startup diagnostics from Core and Assembly failures. Authoring context is opt-in and escaped; opaque causes and runtime values remain private.

  Keep the exact Core/Assembly release pair and advance Conformance for the new
  peer minor profile; Core composition behavior is unchanged.

  Migration (Core/Assembly 0.6 -> 0.7; Conformance 0.4 -> 0.5)

  Better: one qualified peer profile includes bounded startup diagnostics.

  Codemod: none - public call shapes remain unchanged; this is a coordinated peer upgrade.

  By hand: install the exact Core/Assembly pair and matching Conformance minor,
  with one physical Resources identity. Existing structured diagnostics remain available.

  Check: typecheck, then composition smoke and packed public-package consumers.

### Patch Changes

- Updated dependencies [a824f33]
  - @get-modular/core@0.7.0

## 0.6.0

### Minor Changes

- 3e59595: Require TypeScript 7.0.2 or newer for declaration consumers and current package
  qualification (ADR-0038). Current native compiler readers and codemods retain
  their semantic checks and original fixtures. Distinct minimum/current compilers
  are checked once in each required resolution mode with `skipLibCheck: false`.
  
  Core and Assembly remain an exact version pair. This is a consumer support
  change; it adds no runtime API behavior.
  
  Authoring surface changed: yes
  
  ## Migration (0.5 -> 0.6): Core and Assembly
  
  - Better: one explicit supported compiler floor across packages and examples.
  - Codemod: none - compiler installation is owned by the consumer's toolchain.
  - By hand: update the consumer's exact TypeScript pin to 7.0.2 or newer and use
    Core and Assembly 0.6 together; keep their versions paired.
  - Check: compile the consumer's actual NodeNext and Bundler projects with
    `skipLibCheck: false` and run its existing composition and ownership tests.
  
  ## Migration (0.1 -> 0.2): resources
  
  - Better: the same explicit compiler floor as the composition packages.
  - Codemod: none - compiler installation belongs to the consumer toolchain.
  - By hand: pin TypeScript 7.0.2 or newer and resources 0.2; install observation
    0.1 alongside it when adopting subscriptions. The initial observation minor
    declares the matching resources peer range.
  - Check: typecheck the consumer with `skipLibCheck: false`, then run its
    composition smoke tests and scope ownership tests.
  
  ## Migration (0.3 -> 0.4): conformance
  
  - Better: qualification uses the same supported compiler floor as the tested
    contracts and composition packages.
  - Codemod: none - compiler installation belongs to the consumer toolchain.
  - By hand: pin TypeScript 7.0.2 or newer and conformance 0.4 with Core/Assembly
    0.6 and resources 0.2. Existing contract and wiring calls keep their shape.
  - Check: typecheck the consumer with `skipLibCheck: false`, then run its
    contract, wiring and composition smoke tests.

### Patch Changes

- Updated dependencies [3e59595]
  - @get-modular/core@0.6.0

## 0.5.0

### Minor Changes

- 2f33631: Replace bound handles with immutable module entries and static groups: `implement`, `input`, `group`, `entriesOf` and `prepare({ modules })` author modules once, keep feature shape in types, flatten in depth-first order and fail closed on duplicate module identities.
  
  Migration (0.4 -> 0.5)
  
  - Better: a module is a declaration and one entry beside it, a feature is one static group, and a root lists features without losing the capability-map check.
  - Codemod: `pnpm --dir <get-modular> codemod 0.4-0.5 <repo> --write`
  - By hand: move code into the feature layout; replace a `scoped` name other than `D.implementationId` (module scope names and debt paths would change); replace a declaration or factory picked by a conditional; resolve an unresolved receiver (a local `assemblyFor()` value or an `Assembly<M>` parameter); move handles stored outside a `prepare` call (`bindRuntimeSetup` returns `{ factories }`; rename such a property and its callers to `modules`); give `prepare` one object literal without a spread and a `modules` tuple literal without a spread; pass `isolate` one entry and one options literal; rename local bindings that collide with `implement`, `input`, `scoped` or the new type names; review re-exports of renamed types; drop `bindFactory` and `bindInput` from custom `Assembly` objects and mocks, since only `prepare` remains; pass `bindFactory` exactly a declaration and a factory and `bindInput` exactly one declaration before running the codemod; give a factory that captures a Host value (a singleton or adapter from its enclosing scope) an entry created by a function of the composition adapter, whose module list never depends on it (see section "Host values, inputs and variants" of `docs/guides/module-authoring.md` in the Get Modular repository); module packages raise their peer range on `@get-modular/core` and `@get-modular/assembly` to `^0.5.0`; update exhaustive maps over `BindingErrorCode` and `PreparationErrorCode` to add `assembly.bind.invalid-group` and `assembly.prepare.duplicate-module`; handle duplicates that failed with `assembly.prepare.handles` or `assembly.prepare.input-handles` now fail with `assembly.prepare.duplicate-module`, so update code that matched them; `KnownCapabilities<C, F, N>` now takes the `modules` list as its second parameter (entries and groups), not a factory tuple.
  - Check: typecheck, then the composition smoke tests.
  
  Authoring surface changed: yes

### Patch Changes

- Updated dependencies [2f33631]
  - @get-modular/core@0.5.0

## 0.4.0

### Minor Changes

- d171008: `CapabilitiesOf` maps each contract once (ADR-0035): type-check cost of large capability maps drops from quadratic to about linear (500 handles under one map: 1,383,390 to 542,552 instantiations on TypeScript 7, 1,560,108 to 715,445 on 5.8.3). Results for contracts with literal ids are unchanged.
  
  Migration:
  
  - Better: a 1,000-module root checks in about 2 s instead of about 5 s on TypeScript 7, and the cost no longer grows with the square of the module count.
  - Codemod: none. The only affected pattern is generic and too varied to rewrite mechanically.
  - By hand: in code generic over contracts `T`, an entry of `CapabilitiesOf<T>` is no longer known to be a capability contract. `CapabilitiesOf<T>[T["id"]]["value"]` now fails with TS2536: replace it with `T extends Contract<string, infer V, number> ? V : never`. `assemblyFor<CapabilitiesOf<T>>()` now fails with TS2344: make the helper generic over the map, `<C extends CapabilitySchema<C>>`, and pass `CapabilitiesOf<typeof A | typeof B>` at the call site.
  - Check: run your TypeScript build; concrete maps need no change.
  
  Authoring surface changed: no
- 2a83057: `prepare` accepts `profileId` (and optional `bindings`) instead of a compiled `composition` and completes the profile from the bound handles (ADR-0035). A `required` slot without a row takes its only other provider; any other slot without a row fails with the new code `assembly.prepare.unresolved-binding`, listing every such slot with its candidates before any factory runs. A prepared result also carries `composition`.
  
  Migration:
  
  - Better: adding a module to a composition root is one `bindFactory` line, and the profile follows the module list.
  - Codemod: none. `prepare({ composition })` keeps working.
  - By hand: update exhaustive handling of `PreparationErrorCode` and custom `Assembly` implementations for the new code and the `composition` result field. Moving production roots to `profileId` is optional until the CMS revision for 0.4.0 (ADR-0035): replace `compileComposition` and the written profile with `profileId`, keep rows only for `optional`, `many` and several-candidate slots, and compare every row of `composition.plan.bindings` against a hand-written table.
  - Check: run your TypeScript build and your composition root's smoke and binding-oracle tests.
  
  Authoring surface changed: no

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @get-modular/core@0.4.0

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
