---
id: ADR-0005
type: adr
status: accepted
owner: architecture
summary: Defines exact V1 compatibility, bounded deterministic diagnostics, and measured resource limits.
approved_by: product-owner
accepted_at: 2026-08-30
related:
  - ADR-0001
  - ADR-0004
  - GM-REQ-V1
  - OD-003
---

# ADR-0005: Freeze V1 compatibility diagnostics and resource profile

## Context

Deterministic graph semantics are incomplete without an exact compatibility
algorithm, bounded errors, and limits that prevent hostile or accidental input
from consuming unbounded CPU or memory. Product-specific settings would make
the same input behave differently between products and would break portable
conformance.

## Decision

### Exact compatibility only

V1 supports one closed family:

```json
{
  "family": "exact",
  "familyVersion": 1,
  "token": "owner/capability-contract/v1"
}
```

A provider is compatible only when `family`, `familyVersion`, and `token` are
byte-for-byte equal to the slot requirement. The token versions the capability
contract, not the npm package. Unknown families, family versions, or fields fail
closed. SemVer ranges may be introduced only as a separately named,
independently versioned family with new vectors and an accepted ADR.

### One fixed V1 resource profile

Every conforming core enforces `get-modular/resource-profile/v1-standard` from
`architecture/contracts/v1/resource-profile.json`. Products may reject input
earlier with stricter limits, but they cannot raise a core maximum and still
claim V1 conformance.

The accepted contract ledger is anchored as
`sha256:201234e1e9be2be3b469b3288c0630846206e3407d4da2bf7eec83777ba52e48`.
The repository contract gate verifies that ledger against every V1 artifact;
the immutable ADR baseline prevents silent ledger replacement.

The profile is based on three current product inventories plus chain, wide,
layered-dense, giant-cycle, duplicate, and diagnostic-storm fixtures recorded in
`QUAL-V1-CONTRACT`. It deliberately leaves substantial growth room while
bounding every allocation-driving dimension. Implementations check raw-byte and
structural limits before expensive normalization or traversal and use iterative
graph algorithms.

Raising a limit is not a semantic compatibility change when all V1-valid inputs
retain identical outputs, but it requires updated cross-runtime measurements,
vectors, and an accepted profile revision. Lowering a limit is breaking.

### Closed bounded diagnostics

Diagnostics conform to the closed union and code catalog in
`architecture/contracts/v1/composition.schema.json`. Each code has an exact
detail shape. Diagnostics may contain only validated semantic identities,
bounded numeric values, known field tokens, and bounded structural paths. They
must not echo raw values, credentials, arbitrary error messages, absolute paths,
stack traces, factories, or product authorization data.

Ordering is independent of discovery order:

1. phase rank: `decode`, `schema`, `declaration`, `profile`, `binding`,
   `graph`, `output`;
2. the normative code rank in `diagnostic-catalog.json`;
3. semantic coordinate: module, implementation, slot, provider;
4. structural path tokens;
5. canonical detail bytes.

The collector keeps at most 256 diagnostics. If more failures exist, it returns
the first 255 by the normative ordering and one final `diagnostics.truncated`
record containing only the bounded omitted count. Implementations must use a
bounded top-K strategy; they cannot allocate every possible diagnostic and trim
afterward. Cycle reporting returns deterministic strongly connected component
summaries and never enumerates every cycle.

Numeric `actual` and `omitted` fields use saturating values when the real count
exceeds their schema maximum. Diagnostics never allocate or traverse beyond a
limit merely to report a more precise overflow count.

### Failure and complexity contract

- Limit overflow, malformed input, unsupported versions, unknown references,
  missing or duplicate bindings, incompatible providers, ambiguity, and cycles
  resolve to `ok: false`.
- No declaration factory or product callback exists in V1, so invalid input
  cannot cause partial activation.
- Compilation time is bounded by accepted input dimensions and targets
  `O(V + E + D log K)`, where `K` is the diagnostic cap.
- A conforming implementation passes independent positive, negative, boundary,
  permutation, and packed-consumer vectors in `@get-modular/conformance`.

## Consequences

- Every product gets identical compatibility and failure behavior.
- V1 intentionally cannot express version ranges or product-defined predicates.
- Fixed limits make denial-of-service behavior reviewable and portable.
- Diagnostics remain useful for humans and AI without becoming a data-leakage
  channel.
- A later richer family or larger profile is additive only after independent
  evidence; it is not silently enabled by a package update.

## Rejected alternatives

- Configurable per-product maxima. They fragment conformance and make plan
  portability depend on deployment configuration.
- SemVer in V1. It introduces prerelease, range, and ecosystem-policy semantics
  before any real capability requires them.
- Executable compatibility callbacks. They destroy serialization,
  determinism, and isolation.
- Collect all diagnostics and truncate at the end. Hostile inputs could consume
  unbounded memory before the cap is applied.
- Registration or discovery order for diagnostic or provider ordering. It is
  ambient state, not explicit business data.
