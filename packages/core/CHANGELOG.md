# Changelog

## 0.1.0 - release candidate

### Added

- Generated production assembly through verified current-source stage0 planning,
  finite rendering and independent construction checks before wiring publication.
  The production barrel and archive use generated stage1 with unchanged public
  compiler signatures, package exports and diagnostic generation.
- Public object and raw JSON compilation through one private facade pipeline.
  Raw input uses synchronously owned UTF-8 `Uint8Array` views and exact safe
  integer checks before rounding.
- Additive `input.invalid-byte-carrier` and `binding.duplicate-record`
  diagnostics. M1 consumers must extend exhaustive diagnostic handling;
  repeated consumer/slot records now fail instead of providing graph edges.
- Ordinary production/direct successor, mutation/isolation and ordered-many
  checks, plus installed Node and TypeScript consumer coverage.

- Private semantic analysis joins censuses, binding validation, resource gates
  and graph checks into a frozen normalized plan or complete bounded diagnostics.
  Require all selections and the reached binding frontier for unreachable
  conclusions; preserve independent cycles and original provider order.
- Enforce the accepted many-range refinement during admission, producing
  `schema.invalid-value` before invalid definitions reach binding validation.
- Private selected-binding validation for explicit presence, cardinality,
  duplicate providers, provider selection, capabilities and exact compatibility.
  Preserve complete valid rows and per-consumer frontier observations separately
  from compiler success; public compilation uses the same feature-owned ports.
- Private owned canonicalization feature with RFC 8785 byte vectors and tests.
- Inert authoring helpers and wire types with discriminated diagnostics.
- Private immutable plan output with the accepted envelope and SHA-256 digest.
- Private diagnostic comparator and bounded collector for unique candidates.
- Private bounded object-resource accounting inside input admission.
- Private immutable snapshots of validated declarations and profiles.
- Private closed document-shape checks with streamed structural violations,
  exact array bounds, portable identity grammar and no getter invocation.
- Private iterative identity grammar and safe schema diagnostic projection,
  including unsupported-version suppression and exact numeric failure reasons.
- Private synchronous object admission with batch preflight, independent
  document snapshots, streamed resource/schema diagnostics and explicit
  resource-only profile observations for later semantic prerequisites.
- Private iterative selected-graph SCC, dependency order, root closure and
  residual depth with streamed cycle/depth diagnostics and operation counters.
- Private declaration/profile censuses with ambiguous identity lookups,
  normalized duplicate diagnostics and independent absence/mismatch checks.
- Package typecheck, build and tests with Foundation source-dependency checks.

The initial release candidate includes generated assembly and both compiler
entries. Core M1/M2/M3 end-to-end qualification completed at source `f41dfe7`,
whose full tree matches merged `4bca9d0`. This release candidate changes package
metadata and requires a new retained archive and packed-consumer evidence
before upload. It has not been published.

Node support is `>=24.18.0 <25`; TypeScript consumers require 5.8.3 or later.
Browser Web Crypto requires a secure context. No official browser support,
structural or runtime conformance, or `release-eligible` claim is made.
The publication status is `not-claimed`. Core compiles plans and does not
execute product factories or manage application lifecycle.
