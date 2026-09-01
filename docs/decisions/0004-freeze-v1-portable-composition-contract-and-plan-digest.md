---
id: ADR-0004
type: adr
status: accepted
owner: architecture
summary: Defines the closed V1 identity, declaration, profile, plan, API, canonicalization, and digest contract.
approved_by: product-owner
accepted_at: 2026-08-30
related:
  - ADR-0001
  - ADR-0003
  - GM-REQ-V1
  - OD-002
---

# ADR-0004: Freeze V1 portable composition contract and plan digest

## Context

Several products are ready to author modules. They need one portable contract
before implementation starts; otherwise identity, binding, canonicalization,
and API choices will drift into product adapters. The contract must remain
serializable across Node.js, browsers, workers, Electron, processes, and a
future WASM host without exposing any DI or lifecycle framework.

## Decision

### Closed identity and declaration algebra

V1 uses validated ASCII strings on the wire and branded strings only after
runtime validation. `ModuleId`, `CapabilityId`, `ImplementationId`, `ProfileId`,
and compatibility tokens use the portable identifier grammar in
`architecture/contracts/v1/composition.schema.json`. `SlotId` is local to one
consumer implementation and uses the stricter local-token grammar.

The earlier phrase *profile-local SlotId* in GM-REQ-001 means that a slot has no
global registry identity. Normatively, the slot is authored by and local to the
consumer implementation; a profile only binds it. Its semantic coordinate is
`(consumerImplementationId, slotId)`.

An implementation candidate is one inert `ModuleDeclarationV1` identified by
the pair `(moduleId, implementationId)`:

- `moduleId` identifies the replaceable logical module;
- `implementationId` globally identifies one candidate for that module;
- `owner` records the candidate's navigation authority and path;
- `provides` declares capabilities and exact compatibility data;
- `slots` declares `required`, `optional`, or bounded ordered `many`
  dependencies.

Alternative and third-party implementations provide separate declarations.
They do not mutate a central module record. `(implementationId, slotId)` is the
globally unambiguous binding coordinate. A plugin may contribute the same inert
declaration shape after a product adapter verifies the artifact; plugin trust is
not part of this contract.

### Complete profiles and bindings

A `CompositionProfileV1` is complete and closed:

- roots name every intentionally independent graph root;
- selections bind every selected `moduleId` to exactly one
  `implementationId`;
- every declared slot of every selected implementation has exactly one binding
  record;
- a binding contains an ordered provider list; an empty list is legal only for
  `optional` or `many` with `min: 0`;
- every provider is selected, provides the requested capability, and has the
  exact required compatibility token;
- every selected implementation is reachable from a root; there are no hidden
  defaults or unused selections.

For `many`, provider array order is explicit business semantics from the
profile. Registration order, filesystem order, locale sorting, priority
callbacks, and implicit first-provider-wins behavior are invalid.

### Immutable plan and compile API

`compileCompositionV1` receives validated plain declarations and one complete
profile. It validates the complete world before returning a result or invoking
any product code. V1 does not accept factories and cannot load executables.

The public result is asynchronous so all supported targets can use Web Crypto:

```ts
type CompileCompositionV1Result =
  | { readonly ok: true; readonly plan: CompositionPlanV1; readonly digest: PlanDigestV1 }
  | { readonly ok: false; readonly diagnostics: readonly DiagnosticV1[] };

declare function compileCompositionV1(input: {
  readonly declarations: readonly unknown[];
  readonly profile: unknown;
}): Promise<CompileCompositionV1Result>;
```

Invalid caller data resolves to `ok: false`; it is not an exception. Exceptions
are reserved for implementation defects or unavailable platform primitives.
Returned records and arrays are deeply frozen plain JSON-compatible values.
They contain no class instances, maps, sets, symbols, functions, accessors, or
framework types.

Raw untrusted JSON uses a separate byte decoder. It rejects duplicate object
keys before ordinary JSON materialization, enforces the accepted resource
profile, and then produces the same validated plain values. The object API is a
trusted-realm boundary: it rejects non-plain objects and accessors but does not
claim to sandbox hostile JavaScript proxies or getters.

The plan contains only selected identities, capability bindings, roots, and a
deterministic dependency-before-consumer order. That order is graph data, not a
lifecycle command. The product host remains the only authority that may load,
construct, activate, publish, route, drain, or recover implementations.

### Canonical bytes and digest

The content identity is RFC 8785 JSON Canonicalization Scheme (JCS) over this
closed envelope:

```json
{
  "canonicalization": "RFC8785",
  "hashAlgorithm": "SHA-256",
  "kind": "get-modular.plan-content",
  "plan": {},
  "protocolVersion": 1
}
```

The actual `plan` value must conform to `CompositionPlanV1`. UTF-8 bytes of the
entire canonical envelope are hashed with SHA-256. The external spelling is
`gm-plan:v1:sha-256:<64-lowercase-hex>`.

Before JCS, the compiler normalizes semantic sets with ASCII code-unit ordering.
The ordered provider list for `many` is never re-sorted. V1 accepts only safe
integers and rejects floating-point values, negative zero, non-finite values,
unknown fields, lone surrogates, duplicate keys, and non-JSON values. Unicode is
not normalized; portable identities are ASCII, and arbitrary display text is
excluded from the plan.

The first adapter candidate is `canonicalize` behind an internal port, with
`json-canonicalize` used only as an independent differential oracle. Library
types never enter the public API. The RFC and checked-in vectors are authority;
either library is replaceable when it fails those vectors.

## Consequences

- Product authors can declare modules now without depending on a future loader,
  container, plugin host, or lifecycle engine.
- The same declaration and plan can cross process and language boundaries.
- Async compilation is a deliberate portability cost.
- Raw-byte and trusted-object entry points have different threat boundaries but
  converge on one semantic model.
- Rich version ranges, executable discovery, construction helpers, lifecycle,
  and hot replacement remain outside V1.

## Rejected alternatives

- TypeScript enums or symbols as identity. They do not survive JSON, process,
  language, or restart boundaries.
- A central registry of module IDs. Declarations remain feature-local and a
  generated inventory provides global navigation without creating a second
  authority.
- Deterministic CBOR or a custom binary codec. Both add implementation and
  interoperability risk without a demonstrated V1 need.
- Package version ranges as capability compatibility. Package distribution and
  capability-contract compatibility evolve independently.
- A synchronous digest API. It would either exclude browser Web Crypto or force
  an additional hashing implementation into the public contract.
