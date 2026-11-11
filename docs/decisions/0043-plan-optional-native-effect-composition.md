---
id: ADR-0043
type: adr
status: proposed
owner: architecture
summary: Define the bounded native Effect integration, neutral preparation ownership, and qualification before package admission.
---

# ADR-0043: Plan optional native Effect composition

## Context

The owner selected optional native Effect integration after comparing independent
GM composition with native Effect Layers. The application requires explicit
module bindings and useful resource/concurrency semantics. Neutral subject-specific
ports remain the abstraction at boundaries that need replaceable implementations.
Breaking changes are permitted when they improve the concrete contract.

Current Assembly factories and its prepared runner use Promise. Core plans are
inert and do not encode TypeScript errors, requirements or slot cardinality. A
Promise wrapper cannot recover native Layer construction. Independently copying
Assembly's capture, profile completion and plan-verification rules would duplicate
one policy owner.

This document is proposed. It records the design and qualification scope selected
on 2026-11-09, not accepted package admission or production adoption. The detailed
[plan](../../research/effect-integration-2026-11/README.md),
[usage guidance](../../packages/effect/docs/practices.md) and
[spike evidence](../../research/effect-integration-2026-11/spikes.md) distinguish
tested native behavior from the future public implementation.

## Decision

Propose an optional `@get-modular/effect` package with native Effect factories and
a native Layer result. Core's wire, compiler, diagnostics and digest remain
unchanged. Ordinary Core/Assembly consumers do not acquire an Effect dependency
through runtime imports, declarations or installation metadata.

Share only inert preparation mechanics in the existing Assembly owner. Preserve
captured entry/factory identity, exact slots/cardinality, inventory checks,
profile completion and Core plan verification. Keep Promise and native Effect
execution as distinct contracts. Do not add a third authoring package, abstract
interpreter or universal factory carrier.
The first native slice determines the smallest neutral bridge; `EntryFamily` and
`Wiring` are candidate shapes, not an admitted extensibility API. Preserve ordinary
Promise calls, defaults and inference, including groups and context adapters. Do
not broaden Promise-facing entry types to admit native entries to Promise-only
Assembly or Conformance execution; ordinary users choose no backend or E/R types.

GM remains the authority for inter-module provider selection. Private native
Layers and explicit operation context are allowed; a second undeclared global
business-service lookup is not. Preserve construction E/R only where the typed
entry inventory proves them. A serialized plan supplies no type-level proof.
Replace GM providers before preparation; native provision supplies explicit
ambient R rather than overriding closed slots. GM entries, private native
services, DDD bounded contexts and Scopes need not correspond one-to-one.

Effect owns native resource acquisition, memoization and finalization. The Host
owns the lifetime of using roots and its execution/shutdown policy. Scope closing
does not prove that unrelated runner work or uncooperative Promise I/O has stopped.
Do not equate native cleanup with GM Resources debt/retry semantics.
Fresh identities per Layer instantiation cover mapper-owned nodes; internal or
external native Layers and borrowed values keep their owners' sharing policy.
Native execution promises dependency order, not independent-root listing order.

The 2026-11-11 extension adopts documented typed live/fake variants, nested native
application/session lifetimes with borrowed inputs, and explicit Host startup
actions. A general graph projection or shared-tag policy remains a separate
candidate: projection belongs in neutral preparation and must not leave unusable
R/input requirements after pruning; sharing must define configuration and ownership.
Neither is a prerequisite for the first native constructor. No new cache, lifetime
language, override registry or runtime is admitted by these recipes.

Before production exposure, record the exact neutral preparation API and optional
package/dependency admission, update its governed source/package boundaries,
qualify current Promise behavior plus the native path, and update the current
Consumer Module Standard and affected adoption evidence. Preserve accepted ADR
bytes. A mechanical breaking change includes its migration and codemod; resource
semantics requiring a decision are migrated explicitly by hand.
No ordinary-user source migration has yet been shown necessary. Prefer internal
extraction and additive exports. Any unavoidable public break must identify its
symbols, concrete benefit and before/after migration under the single
[migration plan](../../research/effect-integration-2026-11/README.md#breaking-changes-and-migration).

The current delivery contains design, reviewed guidance and bounded qualification
spikes. It does not publish a package, migrate an unrelated product, add plugin
lifecycle or assert production conformance. One identified real consumer and
packed/public-entry checks remain part of eventual library adoption.
The proposed package directory contains documentation only. Its README and the
agent instruction routes point to one maintained practices guide; first package
admission must include that guide in the archive and verify its internal link.

## Consequences

- GM remains usable without Effect; native consumers retain native Effect tools.
- Exact slots and one composition authority can coexist with native execution.
- One preparation owner avoids two implementations of profile/capture policy.
- The optional integration is intentionally Effect-dependent. Its internal
  implementation is not made cheaply replaceable by renaming Effect types.
- A neutral port can hide a runtime dependency, but must define cancellation,
  error, completion and streaming behavior. Not every internal module needs one.
- Native and Promise construction have different error/cleanup contracts. Sharing
  preparation does not make their execution outcomes interchangeable.
- Current scope and peer/version qualification are explicit implementation work;
  a successful finite spike is not sufficient release or product evidence.

## Rejected alternatives

- Wrapping `PreparedAssembly.run()` in `tryPromise`: retains the Promise
  construction contract and cannot recover native factory E/R or Layer semantics.
- Reimplementing full Assembly convenience and validation in a second package:
  duplicates the semantic preparation owner.
- A separate generic authoring package or runtime backend interface: expands
  topology and API without a concrete additional responsibility.
- A universal Task/Fiber/Scope/Stream abstraction: creates a new execution
  contract and limits or mirrors native Effect rather than integrating it.
- A ManagedRuntime per module: fragments ownership and caller context without a
  demonstrated lifetime boundary.
- Mandatory Effect in Core: violates the selected universal-library boundary.
