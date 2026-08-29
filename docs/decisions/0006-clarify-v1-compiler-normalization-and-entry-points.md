---
id: ADR-0006
type: adr
status: accepted
owner: architecture
summary: Closes deterministic ordering, raw-byte API, cardinality, resource-accounting, and implementation handoff semantics without expanding V1 runtime authority.
approved_by: product-owner
accepted_at: 2026-08-30
related:
  - ADR-0003
  - ADR-0004
  - ADR-0005
  - GM-REQ-V1
---

# ADR-0006: Clarify V1 compiler normalization and entry points

## Context

ADR-0004 and ADR-0005 close the V1 wire model, digest, compatibility family,
diagnostics, and resource profile. An implementation still needs exact answers
for two compiler entry points, cardinality edge cases, normalization tie-breaks,
and the units used by several limits. If each runtime chooses those details,
valid inputs can produce different plans, digests, or diagnostics despite using
the same schema.

This decision clarifies the accepted contract. It does not add executable
loading, construction, dependency injection, lifecycle, hot replacement, or
plugin authority to Get Modular.

## Decision

### Public compiler boundary

`@get-modular/core` exposes two semantic compiler entry points:

```ts
type CompileCompositionV1Result =
  | {
      readonly ok: true;
      readonly plan: CompositionPlanV1;
      readonly digest: PlanDigestV1;
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly DiagnosticV1[];
    };

declare function compileCompositionV1(input: {
  readonly declarations: readonly unknown[];
  readonly profile: unknown;
}): Promise<CompileCompositionV1Result>;

declare function compileCompositionJsonV1(input: {
  readonly declarations: readonly Uint8Array[];
  readonly profile: Uint8Array;
}): Promise<CompileCompositionV1Result>;
```

`compileCompositionV1` is a trusted-realm object boundary. It accepts only plain
JSON-compatible values and returns diagnostics for caller data. It does not
promise safe evaluation of hostile proxies or accessors.

`compileCompositionJsonV1` is the untrusted byte boundary. Every byte array is
one UTF-8 JSON document. It checks byte limits before decoding, rejects malformed
UTF-8, duplicate object keys, lone surrogates, excessive depth, and unknown
fields before producing the same internal validated value model as the object
entry point. JavaScript strings are not accepted at this boundary because their
original byte length and decoder behavior are no longer recoverable.

Both entry points snapshot caller-owned arrays and values before the first
asynchronous boundary. Mutation after invocation cannot alter validation, the
plan, or its digest. Invalid input resolves to `ok: false`; only implementation
defects or unavailable platform primitives reject the promise.

### Cardinality and graph semantics

- `required` has exactly one provider.
- `optional` has zero or one provider.
- `many` requires `0 <= min <= max`, and its provider count is within the
  inclusive range. The profile order is preserved exactly.
- A binding provider list contains unique implementation IDs. A duplicate is a
  `binding.duplicate` failure even when the resulting count would be valid.
- Every declared slot has exactly one binding record. Legal absence is encoded
  by an empty provider list, never by omitting the binding.
- A provider reference creates a dependency from provider to consumer. A
  self-reference is a cycle. Repeated provider-to-consumer relationships through
  different slots remain distinct plan bindings but one adjacency relation for
  cycle detection and topological ordering.

The compiler validates the complete declaration and profile world before
constructing the successful plan. It never invokes product code.

### Exact normalization

All identifier comparisons use ascending ASCII code-unit order. Locale-aware
comparison, insertion order, registration order, and filesystem order are
forbidden.

Before canonicalization, the successful plan is normalized as follows:

1. `roots` by `moduleId`;
2. `selections` by `(moduleId, implementationId)`;
3. `bindings` by `(consumerImplementationId, slotId)`;
4. provider IDs for `required` and `optional` remain their zero-or-one value;
5. provider IDs for `many` remain in explicit profile order;
6. `dependencyOrder` is the lexicographically smallest valid
   dependency-before-consumer topological order. Kahn's algorithm therefore
   chooses the smallest ready `implementationId` at every step.

Declaration input order cannot affect lookup, duplicate detection, plan order,
or diagnostics. A cycle diagnostic represents one strongly connected component;
its implementation IDs are sorted, and components are ordered by their sorted
member arrays. A self-cycle is a one-member component.

For diagnostic ordering, an absent semantic-coordinate field sorts before a
present field. Path segments sort by `field` before `index`, then field tokens by
ASCII order and indexes numerically. Semantic diagnostics use normalized
coordinates and paths rather than original array positions once identity is
known. Canonical detail bytes use the same RFC 8785 adapter as plan content.

At most 256 diagnostics are returned. Counts from zero through 256 are returned
without a truncation record. For 257 or more failures, the compiler returns the
first 255 diagnostics plus one `diagnostics.truncated` record; `omitted` is the
saturating count of all failures not represented by those 255 records.

### Resource-accounting units

The fixed profile in `resource-profile.json` is interpreted consistently:

- `rawDocumentBytes` is the length of each `Uint8Array` before decoding;
- `aggregateRawBytes` is the saturating sum of every declaration document and
  the profile document;
- `jsonDepth` is the number of object or array containers on a root-to-value
  path, with a root container at depth one;
- `aggregateStringBytes` is the saturating UTF-8 byte sum of every decoded
  object-key and string-value occurrence;
- `identifierBytes` is the UTF-8 length after grammar validation; V1 identifiers
  are ASCII, so bytes and code units coincide;
- declaration, capability, and slot totals cover the complete supplied
  declaration world, including unselected candidates;
- root, selection, and binding totals cover the supplied profile;
- `graphEdges` counts provider references across selected bindings, while graph
  traversal may deduplicate equal provider-to-consumer adjacency relations;
- `graphDepth` is the number of implementations on the longest path in an
  acyclic selected graph; a single implementation has depth one;
- `diagnosticPathSegments` counts emitted structural path segments.

Raw-byte, depth, aggregate-string, and container-count limits are checked before
or during decoding. Aggregate declaration and graph limits are checked before
allocating structures proportional to the rejected dimension. Counters saturate
at the corresponding diagnostic maximum rather than overflowing or traversing
unbounded input to improve an error count.

### Authoring helpers and package handoff

The wire schema is the conformance authority. The first `@get-modular/core`
implementation also provides pure ergonomic helpers named `defineModule`,
`required`, `optional`, and `many`. They create or validate inert plain data,
perform no I/O or registration, and expose no container or framework type.
`required`, `optional`, and `many` are the accepted names; `requiredOne` and
`optionalOne` are not aliases.

An implementation ID is declared inside its own feature-local module
declaration. There is no handwritten central ID registry. Generated inventories
may aggregate declarations for navigation and profile compilation but cannot
become an identity authority or load executable code during discovery.

The exact generic signatures and inference ergonomics of the helpers are tested
with packed TypeScript consumers before publication. They may not change the
wire shape, error semantics, compiler entry points, or dependency cardinalities
defined here.

`@get-modular/conformance` remains a separate development-only package. It owns
independent vectors and runners and may depend on core. It must not calculate
expected values by calling the implementation under test. The root workspace
package remains private.

## Consequences

- Core implementation can proceed without choosing machine-specific order,
  byte-boundary behavior, or resource units.
- Products can author declarations before any loader or lifecycle framework
  exists and can later pass the same inert data through plugin adapters.
- The raw-byte entry point adds a strict decoder qualification task, but avoids
  pretending that ordinary `JSON.parse` can detect duplicate keys.
- Authoring-helper TypeScript ergonomics remain test-driven while the portable
  wire and compiler semantics stay fixed.
- Dynamic enable/disable remains a product desired-profile and host cutover
  concern; this decision does not implement runtime unload.

## Rejected alternatives

- Let each implementation choose a valid topological order. Plan digests would
  differ across runtimes.
- Accept raw JavaScript strings as the security boundary. Original byte limits
  and decoder behavior cannot be reconstructed reliably.
- Omit legal optional bindings. Absence would become an implicit default and
  profiles would no longer be closed.
- Sort `many` providers. It would erase explicit profile semantics.
- Create a central module-ID registry. Feature locality plus generated inventory
  gives navigation without introducing a second authority.
- Put conformance under a core subpath export. Production installations could
  accidentally include or depend on test-only tooling.
