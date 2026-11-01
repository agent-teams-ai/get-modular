# Changelog

## 0.7.1

### Patch Changes

- 7a7c4c5: Coordinate Core package metadata with the exact Assembly patch release; the public API and compiler behavior are unchanged.

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

## 0.5.0

### Minor Changes

- 2f33631: Align Core with Assembly 0.5.0 under the exact-pair rule (ADR-0027, ADR-0036). No API or behavior change.
  
  Authoring surface changed: no

## 0.4.0

### Minor Changes

- Align Core with Assembly 0.4.0 under the exact-pair rule (ADR-0027, ADR-0035). No API or behavior change.
  
  Authoring surface changed: no

### Patch Changes

- Internal hardening carried from the Node 26 qualification (#149): the composition-semantics graph and selected-graph checks compare their `Uint8Array` marks explicitly with 1, and the owned raw scanner returns an invalid token when asked to read past the input. Observable behavior, declarations and the public API are unchanged.
  
  Authoring surface changed: no

## 0.3.0

### Minor Changes

- fcb3a32: Align Core with Assembly 0.3.0 under the exact-pair rule (ADR-0027, ADR-0031). No API or behavior change.
  
  Authoring surface changed: no

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
  handling.

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
