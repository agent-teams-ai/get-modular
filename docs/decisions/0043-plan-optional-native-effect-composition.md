---
id: ADR-0043
type: adr
status: accepted
owner: architecture
approved_by: product-owner-delegated-orchestrator
accepted_at: 2026-11-11
summary: Admit optional native Effect construction over Assembly-owned neutral preparation, preserving ordinary Promise consumers and explicit resource ownership.
---

# ADR-0043: Admit optional native Effect composition

## Context

The owner selected a native optional Effect integration, reviewed its bounded
spikes and authorized production implementation on 2026-11-11. GM must remain
usable in frontend and backend applications without Effect. Native consumers need
exact module bindings together with Effect errors, environments and resource
semantics. Neutral subject-specific ports remain the boundary where independent
implementations are useful; pure domain code needs no execution library.

Assembly's existing factories and runner use Promise. Wrapping that runner cannot
recover native Layer construction or erased error/environment types. Duplicating
its metadata capture, profile completion and plan verification would introduce a
second owner of the same composition policy.

## Decision

Admit `@get-modular/effect` as an optional public package, using only the public
Core and Assembly roots and the exact qualified peer **Effect 4.1.4**. It has no
Node builtin imports, no platform adapter and no runtime dependency flowing back
into Core or Assembly. Core wire, compiler, diagnostics and digest do not change.
Ordinary Promise authoring, context adapters, group inference, execution outcomes
and Conformance behavior remain intact.

Assembly owns one bounded, inert preparation mechanism. Its additive public
bridge is `createEntryFamily<F>()` for callable factory carriers, returning
`capture`, `group`, `entriesOf` and `prepare`. An authenticated family captures
immutable declarations and the exact executable reference. Preparation returns
existing failures or verified `Wiring<F>` plus its successful composition. Wiring
contains ordered metadata/injections, roots and input declarations, never a
runtime, Scope or executor. An input branch has no dummy executable factory.

The same owner exposes `snapshotFactoryProduct`, `captureWiringInputs` and
`injectionDependencies` to preserve exact records, safe descriptor handling and
slot cardinality in both executors. The compiler is selected in Assembly's
composition root; there is no public compiler replacement, backend registry or
abstract interpreter. Entry families are not plugin loading or trust boundaries.
Promise-facing entry types do not admit foreign/native factories.

The optional package provides native `implement`, `group`, `entriesOf`, `input`
and `effectFor<C>().prepare`. A successful `prepared.layer(Roots, { inputs })`
returns a real Effect Layer. Its selected typed inventory supplies construction
`E` and `R`; native Layer ownership supplies construction `Scope`. Operation
errors/environments stay on the returned native operations. A serialized plan
alone supplies no type-level proof. Invalid input shape fails as `InvalidInputs`
before factories; expected factory failures, defects and interruption keep their
native meanings rather than becoming Promise Assembly outcomes.

GM remains the authority for inter-module provider selection. Private native
Layers and explicit request, transaction and tracing context remain native.
Undeclared global lookups of neighboring business services would make the GM
graph incomplete and are outside this architecture. Replace GM providers by
selecting a typed live/fake inventory before preparation; native provision supplies
ambient `R`, not a second override mechanism for already closed GM slots. GM
entries, native services, Scopes and DDD bounded contexts need not be one-to-one.

Map each selected implementation to one stable Layer identity within a graph.
Different local slots may still select different implementations of one capability.
Every `.layer()` invocation captures fresh mapper identities and input records;
explicitly reusing its returned Layer retains native memoization. Captured private
Layers and borrowed values keep their owners' identity/configuration policies.
Independent acquisition uses native Layer composition. Dependency order is
preserved; independent-root listing order is not a startup guarantee.

Effect owns native resource acquisition and finalization. The application Host
owns ingress, shutdown and the work using roots. A service, Effect or Stream
escaping its resource Scope is not automatically kept alive or tracked. Borrowed
inputs register no disposer and their owner must outlive their users. Native
cleanup is not GM Resources debt/retry semantics. A foreground/worker relationship
needs an explicit failure policy in addition to scoped lifetime ownership.

Adopt recipes for typed live/fake variants, shared application resources with
local session scopes and borrowed inputs, and explicit setup before worker
acquisition. Do not add automatic graph projection, shared/local tags, a lifetime
DSL, cache, override registry or Host runtime. A later shared projection helper
would belong in neutral preparation and must prove useful E/R/input typing after
pruning. These later candidates do not block the current native constructor.

## Delivery and migration

Ship the package manifest, source, public entrypoint, strict type and runtime
qualification, existing architecture/build/CI admission, and one packaged
[practices guide](../../packages/effect/docs/practices.md) together. Route AGENTS
and `.github` to that source. Verify matched archive imports, NodeNext/Bundler
public types, input isolation, local provider selection, failure/interruption,
resource-using finalizers and stream lifetime through public entrypoints. Ordinary
Core/Assembly imports and execution must work with Effect absent.

The source candidate starts at `0.0.0`. A coordinated release intent selects
Core/Assembly **0.8.0** (the existing paired-version rule) and Effect **0.1.0**.
Core's coordinated version change introduces no Core source/API behavior. Do not
publish this candidate beside released Assembly 0.7.1, which lacks the new bridge.
Registry publication and release-baseline promotion retain their existing gates;
this decision admits source/package scope, not a completed npm publication.

No ordinary-user source migration is required. Native adoption is explicit:
choose native factories, move acquisition and resource-using work into their
proper Effect scopes, retain operation error/context types, and select the native
preparation API. This semantic resource decision is not a mechanical codemod.
Any later actual signature break needs its own named migration and codemod where
mechanical. Existing accepted ADR bytes and release baselines remain unchanged.

The [implementation plan](../../research/effect-integration-2026-11/README.md)
separates executable library qualification from product adoption. No real product
has been identified by the owner yet. The real-resource test Host is library
integration evidence, not product adoption; do not migrate an unrelated product
or certify production behavior merely to fill that evidence row. A named
consumer must qualify its actual ingress, failure, stream and shutdown policies.

## Consequences

- One preparation owner prevents drift between Promise and native composition.
- Existing consumers remain independent of the optional Effect package.
- Native consumers retain Effect tools, errors and environments without a new
  execution abstraction or an artificial Promise facade between native modules.
- Exact local binding and native resource ownership are compatible, but neither
  proves correct domain boundaries or prevents arbitrary escaped values.
- The optional adapter is deliberately Effect-dependent. Replacing Effect still
  requires migrating native implementations; neutral subject-specific ports can
  limit that change where their complete contracts are actually runtime-neutral.
- Typed variants and explicit Host sequencing have less automation than some
  OpenCode LayerNode policies; that tradeoff keeps this package bounded.

## Rejected alternatives

- `tryPromise(() => prepared.run())` as a native executor: it retains the Promise
  contract and cannot recover native construction E/R or Layer composition.
- A second complete Assembly preparer, or a third authoring package: duplicated
  policy or extra topology without a new concrete responsibility.
- A universal Task/Fiber/Scope/Stream abstraction: a new runtime contract that
  limits or mirrors Effect instead of integrating it.
- One ManagedRuntime per module, or two independent disposers for one resource:
  fragments caller context and lifetime responsibility.
- Mandatory Effect in Core/Assembly, a scheduler, retries, event bus or plugin
  lifecycle in the adapter: violates the selected universal-library boundary.
