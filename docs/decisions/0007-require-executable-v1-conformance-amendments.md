---
id: ADR-0007
type: adr
status: proposed
owner: architecture
summary: Adds discriminated diagnostics, independent canonicalization checks, exact boundary vectors, and the corrected deterministic complexity target before V1 implementation.
related:
  - ADR-0004
  - ADR-0005
  - ADR-0006
  - GM-REQ-V1
  - OD-002
  - OD-003
---

<!-- cspell:words Eadj Einput Evalid -->

# ADR-0007: Require executable V1 conformance amendments

## Context

Independent security, architecture, and developer-experience reviews of the
accepted V1 contract found that several narrative guarantees were not yet
executable. The base schema closes diagnostic code names but does not constrain
each code's phase, coordinate, path, and detail shape. Existing canonical
vectors hash checked-in text without independently proving RFC 8785 output.
Resource tests exercise representative graphs but do not cover every exact
limit and limit-plus-one outcome. The deterministic topological tie-break and
raw-byte entry point are now clarified by ADR-0006, but their evidence must be
portable and independently consumable before production packages claim V1
conformance.

The accepted artifacts under `architecture/contracts/v1` remain immutable.
This successor decision adds a versioned qualification layer instead of
rewriting ADR-0004, ADR-0005, or their contract ledger.

## Decision

### Additive qualification authority

While this decision is proposed, the artifacts under
`architecture/qualification/v1` are draft qualification evidence. They do not
amend the accepted base contract, promote the baseline, or authorize a
production-conformance claim. If this decision is accepted, they become
normative amendments when read together with the immutable base contract.
Their byte identities are recorded in
`architecture/authority/v1-qualification-ledger.json`, anchored as
`sha256:9a25637de36a970a57d8f0165f479b270296c0b60a6ac050d19f614b826ee9e0`.

`qualification-case-manifest.json` records decoder and canonicalization case
categories, exact source, repair, and canonical byte identities, and the mapping
from every immutable base canonical-negative name to its complete successor
case. A closed development-only checker fixes the allowed category and accepted
fault-to-successor tuples and verifies artifacts whose byte identities are
recorded in the separate ledger; it does not create, repair, or replace
authority. Relabeling manifest rows and refreshing hashes cannot self-certify
changed evidence.

The repository gate must validate both ledgers. A future revision creates a new
artifact version and successor ADR; it never mutates an accepted ledger or
artifact in place.

### Closed diagnostic algebra

`diagnostic-contract.json` is the discriminant authority for every V1
diagnostic code. For each code it fixes:

- allowed phase or the exact limit-to-phase mapping;
- required and allowed semantic-coordinate fields;
- empty, structural, or limit-specific path policy;
- exact detail keys and any closed reason values;
- the total comparator for phase, code, coordinate, path, and RFC 8785 detail
  bytes.

`diagnostic-snapshots.json` contains one complete valid record for every code
and ordering permutations. It executes every adjacent phase and code rank. The
total comparator covers phase, code, every
coordinate field's absence or presence and value, every path segment's kind and
value, path-prefix length, and decisive differences at path positions one, two,
and the maximum supported depth. Exact nested and Unicode cases pin the RFC
8785 UTF-8 detail bytes. Every
ordering operand must pass both the accepted base diagnostic schema and this
refinement. Axis witnesses keep all higher axes equal, and dominance witnesses
make a lower axis oppose the decisive higher axis. Unknown codes, phases,
coordinate fields, detail fields, or reason values fail conformance. Empty path
policy means exactly an empty array. Structural path policy means at least one
validated path segment. Only `input.limit-exceeded` may select a limit-specific
policy through `details.limitName`; every other code executes its exact empty or
structural policy, and an absent policy always fails.

A `graph.cycle` component contains unique implementation IDs in ascending ASCII
order. Qualification derives components independently from directed graph-edge
fixtures, including a self-cycle, reciprocal multi-member cycles, a one-way
non-cycle, and disjoint components. Parallel edges with distinct IDs and equal
endpoints are legal and are deduplicated when adjacency is derived. Every node,
edge, and traversal permutation, including the parallel edge, must derive the
same membership. Component arrays use lexicographic member-array order with a
shorter equal prefix first.

The diagnostic definition embedded in `composition.schema.json` remains a base
shape. Where it is less restrictive, the standalone diagnostic contract is the
normative refinement. Implementations must satisfy both.

The `profile.unknown-implementation` refinement continues to require
`implementationId` and permits normalized `moduleId` as optional context. That
closed optional field lets the comparator exercise both absent and present
`moduleId` operands without making either operand invalid.

Diagnostic phases classify and sort records; they are not global stop
barriers. The V1 compiler evaluates a closed prerequisite table whose facts are
internally `valid`, `invalid`, or `unavailable`. An invalid fact emits its one
closed diagnostic. An unavailable fact emits nothing because a prerequisite
failed. Independent documents and facts continue, while only dependent
derivatives are suppressed. Every emitted diagnostic prevents successful plan
and digest output.

The qualification contract maps every diagnostic code and every named resource
limit to fixed prerequisite-group IDs, an ordered list of at most four required
facts, and one suppression scope. The fact vocabulary is closed and bounded;
each fact has one fixed scope and one of `valid`, `invalid`, or `unavailable`.
A candidate is eligible only when all of its required facts are valid. Invalid
or unavailable requirements suppress that candidate without stopping
independent candidates. Missing, unknown, duplicate, unbounded, or remapped
entries fail qualification. The table contains no executable predicates,
expressions, extension mechanism, defaults, or configurable rule language; it
is a closed V1 generation oracle.

Three exact cases fix the overlapping behavior that the code-to-group mapping
alone cannot determine. A duplicate module selection does not suppress an
independently provable implementation mismatch on one of its rows. An invalid
implementation-identity census suppresses a negative
`profile.unknown-implementation` claim while retaining the positive duplicate
implementation failure. An invalid unrelated binding frontier does not
suppress a positively proven SCC from the valid-edge subgraph. The checker
executes the complete fact-state partitions for these cases and rejects
prerequisite mutations that change any eligible or suppressed code.

Raw documents are admitted independently after batch-wide resource preflight.
A failed declaration document cannot contribute schema or semantic facts, but
other declarations and the profile continue. Negative absence claims require a
complete relevant identity or key census. Valid binding edges require the
consumer, slot, provider selection, capability, and compatibility facts to be
valid. Positively proven cycles remain reportable despite unrelated invalid
edges.

Root reachability traverses from each selected root consumer to its selected
providers. `profile.unreachable-selection` is graph-phase evidence even though
its historical code prefix is `profile`. It is emitted only when roots and
selections resolve uniquely and every reached consumer has a complete valid
outgoing-binding frontier. An incomplete reached frontier suppresses every
currently unproved unreachable conclusion, while independent binding failures
and positively proven strongly connected components remain eligible.

Before a portable implementation identity is valid, declaration diagnostics
may use the bounded invocation ordinal. After identity is valid, semantic
coordinates replace caller ordering. Raw declaration paths begin with
`declarations/<document-ordinal>` and raw profile paths begin with `profile`;
those prefixes count toward the 32-segment cap. Code path policies apply to the
document-local path before that raw prefix is prepended. Consequently,
`decode.invalid-json` retains its exact empty local-path policy while its emitted
raw diagnostic preserves the non-empty invocation locator. Static expectations
are validated against the accepted base diagnostic schema and the refinement
after this composition is reversed. Paths contain only invocation roots,
schema-known field names, and bounded indices. Unknown keys, raw values, parser
text, credentials, absolute paths, transformed hashes of hostile values, and
truncation markers are never emitted. Batch-wide aggregate failures retain an
empty path because no one document is their truthful locator.

All eligible candidates are streamed through the normative comparator. The
collector continues after `K + 1`; for at most 256 candidates it returns every
record, and for 257 or more it returns the first 255 plus
`diagnostics.truncated`. Its `omitted` value is the saturating count of all
eligible candidates that were not retained. Suppressed derivatives never
affect that count.

### Independent canonicalization and normalization

Every canonical vector is recomputed by two independent development-only RFC
8785 implementations, initially `canonicalize` and `json-canonicalize`. Both
must equal the checked-in UTF-8 string byte for byte before SHA-256 is checked.
Neither package type or API enters `@get-modular/core`.

`canonicalization-vectors.json` covers object ordering, JSON escaping, Unicode
property ordering, RFC number spelling, and safe-integer boundaries.
`normalization-vectors.json` covers declaration and profile permutations,
multiple roots, branching dependencies, explicit `many` order, the
lexicographically smallest topological order, canonical envelope bytes, and the
domain-separated digest.

Reachability and execution ordering use opposite views of one validated
binding world. Root closure follows consumer to provider. SCC traversal and
dependency ordering use distinct provider-to-consumer adjacency, so providers
precede consumers. Unselected declarations still count toward input-resource
limits but are inert for binding, reachability, and plan validation. The
qualification layer distinguishes:

- `Einput`: every provider-list occurrence on a selected-consumer binding,
  counted before semantic validation;
- `Evalid`: provider references that survive complete binding validation;
- `Eadj`: distinct valid provider-to-consumer endpoint pairs used by graph
  traversal, SCCs, and topological ordering.

The deterministic heap tie-break and complete input accounting change the
implementation target from the simplified bound in ADR-0005 to:

```text
O(B + J + (V + Eadj) log V + D log K)
```

`B` is admitted raw input bytes and is zero for the object entry point. `J` is
every admitted JSON value occurrence across all supplied declaration and
profile values. `V` is selected implementations, `D` candidate diagnostics,
and `K` the fixed diagnostic cap. `Einput` and validation of all supplied
declarations are bounded by `J` and the named structural limits. A future
linear ready-set implementation is allowed only when it preserves the same
exact order.

### Decoder and resource boundaries

`decoder-vectors.json` fixes one-document framing, strict UTF-8, duplicate-key
rejection, comments, trailing commas, trailing root values, and malformed byte
sequences. Every malformed non-EOF UTF-8 category is exercised inside a JSON
string; replacing only the authoritative malformed sequence with one valid
scalar must make JSON syntax valid. Separate true two-, three-, and four-byte
EOF truncations cannot be otherwise-valid framed JSON, but still execute fatal
UTF-8 before JSON parsing. An accepted control contains valid two-, three-, and
four-byte scalars. A UTF-8 BOM is rejected. Lone-surrogate
escapes and negative zero are valid JSON tokens but fail later semantic
validation.

Every repaired negative binds one exact fault identity and has exactly one
semantic fault before its exact one-span byte repair and zero afterward. The
repaired result must pass the accepted schema and semantic checks. The
negative-zero case uses a numeric field where positive zero is valid, and the
lone-surrogate evidence includes a high surrogate at the end of a string. An
unrelated schema defect in both the source and repair cannot satisfy the
evidence.

The first decoder spike uses `jsonc-parser` only through `createScanner` and
`visit`, behind a replaceable internal adapter. It checks bytes and fatal UTF-8
first, performs an iterative depth preflight before the library's recursive
visitor, keeps one decoded-key set per open object, validates surrogate pairing
and saturating string counters, and materializes values only in a second pass
after the complete batch succeeds. `jsonc-parser.parse`, parser error text, and
package types cannot enter the public API. If the browser/worker, fuzz, boundary,
or redaction gates fail, the fallback is a small independently reviewed
iterative scanner under the same vectors, not a weakened contract.

`resource-profile-v2.json` is the complete flat successor resource authority
for Composition V1. It retains profile ID
`get-modular/resource-profile/v1-standard`, uses `profileVersion: 2`, preserves
every unaffected version-1 value, replaces the uniform `rawDocumentBytes` with
`declarationRawDocumentBytes: 1,048,576` and
`profileRawDocumentBytes: 8,388,608`, and adds
`jsonValueOccurrences: 2,097,152`. It is not an overlay, inheritance document,
or negotiable runtime profile. The immutable version-1 artifact remains
historical evidence.

For resource diagnostics only, version 2 takes precedence over conflicting
version-1 wording in ADR-0005 and ADR-0006 after this decision and its exact
qualification ledger bytes are accepted. File presence, chronology, or merge
order never activates the successor profile. Declaration/profile raw limits are
decode-phase and document-local. `aggregateRawBytes` remains decode-phase with
an empty path. `jsonValueOccurrences` is schema-phase for both entry points with
an empty path because its population is the shared decoded value model even
when the raw adapter meters it before materialization.

Value-occurrence admission counts every root, container, and scalar occurrence
across all supplied declaration and profile values. Unknown and wrong-type
values count before schema rejection; shared references count per occurrence; a
cycle back-reference counts once and then stops descent; sparse-array length
consumes attempted positions before density rejection. Accessors, symbols,
non-enumerable properties, and extended-array properties are rejected without
invoking a getter. The trusted object entry point does not claim safety against
hostile Proxy traps. The preflight is iterative, and every over-limit `actual`
value saturates at `limit + 1`.

`resource-boundary-vectors.json` covers every profile-v2 limit at the accepted
value and at value plus one. Development-only qualification constructs bounded
fixtures for every row and meters the resulting structure with independent
oracles. These outcomes qualify fixture construction and oracle expectations;
they are not production-subject execution, packed enforcement, or a latency
claim. Aggregate-string fixtures count UTF-8 bytes of every decoded object-key
and string-value occurrence. Explicit UTF-16-code-unit and value-only mutations
must disagree with both boundaries.

The same evidence fixes inclusive `many` ranges, rejects `min > max`, rejects
duplicate provider identities, and counts `providersPerManySlot` from provider
list occurrences before duplicate rejection. It distinguishes 256 ordinary
diagnostics from the 257-failure truncation case. The phrase "container-count
limits" in ADR-0006 means only the explicitly named structural limits.

One closed deterministic mixed-cardinality P500 generator must produce a valid,
acyclic, fully reachable profile that exceeds the historical 1 MiB profile
document limit and remains below every version-2 limit. Two independent
generators reproduce its exact counts, UTF-8 byte sizes, and SHA-256 identities.
Bounded P100 and P1000 observations are sizing evidence only. Expanded
megabyte-scale JSON and elapsed-time conformance thresholds are prohibited.

Bounded diagnostic evidence streams structured diagnostics through the one
normative comparator and retains at most `K` candidates. It fixes the exact
retained evidence IDs across ascending, reverse, and stride permutations: 256
failures retain all 256 without truncation, while 257 retain the first 255 and
report `omitted: 2`. A reverse-order 258 case requires replacement after
`K + 1`, so collectors that stop considering later candidates fail. Additional
cases fix the exact omitted value at its schema
maximum and its saturating behavior above that maximum.

These vectors are contract evidence, not a substitute for executing the same
cases against a production subject. A package may be implemented while the
repository profile remains `not-claimed`, but it cannot claim V1 conformance or
be published as conforming until every applicable vector executes against the
packed artifact on the supported runtime matrix.

### Static conformance protocol and future runtime matrix

The qualification case manifest defines static expectations, not executed
evidence. Every case has one stable unique ID, one compiler entry point, exactly
one complete inline input or closed bounded generator ID, and one exact complete
result. Partial, code-only, pattern, alternate, and subject-derived expectations
are prohibited. Raw inline inputs are the exact UTF-8 declaration/profile bytes
without caller-side normalization.

Every inline negative also carries one complete companion world whose
declarations and profile pass the accepted base schema. Companion profiles obey
the accepted non-empty `roots` and `selections` constraints; they are positive
schema controls, not alternate expected results. The bounded raw depth generator
likewise includes one valid companion declaration and a one-root profile that
selects it. The checker validates every companion and every exact expected
diagnostic, including raw invocation-prefix composition, so an invalid empty
profile or a diagnostic that merely resembles the refinement cannot qualify.

This decision does not publish a TypeScript subject interface, runner function,
package API, report instance, or attestation. Those boundaries require the first
packed production subject and a separate compatibility decision. A future
execution report must at minimum bind one packed-package byte digest, the exact
accepted base-contract ledger identity, the exact accepted qualification-ledger
identity, one compiler entry point, and a closed runtime identity. It contains
no arbitrary caller label, credentials, absolute paths, stack traces,
implementation objects, or copied actual subject output.

`@get-modular/conformance` remains the planned development-only owner of
fixtures and future packed-subject execution. `@get-modular/core` remains
independent from it. Neither package is created in this decision.

The first V1 conformance claim requires the same packed subject and vectors on:

- Node.js 24 on Linux, macOS, and Windows;
- the Chromium build pinned by the repository's exact browser-test dependency,
  in a browser window;
- the same pinned Chromium build in a dedicated worker.

Future reports record exact Node, operating-system, browser, architecture, and
package identities. Electron is covered by the Node and Chromium surfaces plus
one packed smoke on the exact Electron release used by a Desktop product. A
future WASM or non-JavaScript implementation must run the portable vector subset
through its own adapter before making a claim. Runtime coverage is a publication
and conformance gate, not a claim made by the current static evidence.

### Product navigation and production admission

`owner.authority` is allocated by the owning product or repository;
`owner.path` is a logical feature route, not a filesystem path. Get Modular
validates their portable syntax but does not resolve source files. Build tooling
may generate an AI-readable inventory by joining declarations with the
product's package catalog. The generated inventory is derived navigation, not
an identity authority, registry, or runtime discovery mechanism. Collisions in
`(moduleId, implementationId)` remain compiler failures regardless of inventory
source.

This decision does not define `defineProfile`, profile-fragment merge semantics,
desired-state rollout, or a portable inventory format. Those remain
product-owned until real authoring and runtime consumers prove a common
boundary.

The repository's `not-claimed` feature-profile state means only that structural
conformance has not yet been proven. It must not prohibit creation of the first
production package. Open implementation decisions remain enforced separately
by the governance gate. Promotion to a conformance claim requires production
source boundaries, positive and negative fixtures, packed-artifact execution,
and an accepted promotion decision.

Before any path exists below `packages`, the feature-profile gate permits this
pre-production state without an empty source policy or ceremonial package. The
first materializing change must atomically enable Engineering Foundation's
`architecture.source-dependencies` capability at
`architecture/foundation/source-dependencies.yaml`. The profile gate fails
closed if package content appears without that binding or policy file. The
Foundation capability remains the sole source parser and dependency-policy
engine; Get Modular does not duplicate it. Positive and negative structural
fixtures are added with that first package and are required before structural
conformance can be claimed. Packed runtime evidence remains a later, separate
promotion gate.

## Consequences

- Implementers receive exact byte, graph, diagnostic, resource, and static-case
  handoff rules without adding a runner, loader, DI container, plugin host, or
  lifecycle framework.
- Independent JCS libraries and executable vectors reduce correlated oracle
  mistakes, at the cost of development-only dependencies and more CI work.
- The first package can now be built under an honest `not-claimed` state, while
  publication remains fail-closed on cross-runtime conformance.
- Owner metadata stays product-neutral; source navigation remains a generated
  product concern rather than leaking repository paths into portable plans.

## Rejected alternatives

- Modify accepted ADRs or the base contract ledger. That would erase history
  and violate immutable decision custody.
- Let the core generate expected conformance values. A shared defect could make
  implementation and tests agree incorrectly.
- Keep diagnostics as an open object keyed only by code. Different cores could
  expose different phases, coordinates, details, or sensitive values.
- Require structural conformance before any production file exists. That makes
  the first implementation impossible to admit and confuses evidence state with
  source admission.
- Publish a runner or subject interface before a packed implementation exists.
  Static expectations cannot prove that an unimplemented API is usable or
  portable.
- Claim every JavaScript host from Node-only CI. Portability is accepted only
  after the packed subject executes on the declared matrix.
