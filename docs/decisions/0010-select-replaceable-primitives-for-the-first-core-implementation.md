---
id: ADR-0010
type: adr
status: proposed
owner: architecture
summary: Keeps the semantic compiler owned while qualifying narrow replaceable platform and open-source adapters.
related:
  - ADR-0001
  - ADR-0003
  - ADR-0004
  - ADR-0006
  - ADR-0007
  - ADR-0008
---

<!-- cspell:words Avvio deepseek tsyringe -->

# ADR-0010: Select replaceable primitives for the first core implementation

## Context

No general module, graph, validation, dependency-injection, or lifecycle library
implements Get Modular's closed semantics: complete profiles, exact
cardinalities, deterministic graph ordering, bounded diagnostics, strict raw
admission, immutable plans, and portable content digests.

Implementing every low-level primitive ourselves would add risk without product
value. Letting a library's types, errors, traversal order, or lifecycle model
become the contract would instead create framework lock-in and a second
authority. The first Core needs an explicit boundary between owned semantics and
replaceable mechanics.

## Decision

- Get Modular owns the semantic compiler, diagnostic algebra, resource
  accounting, graph rules, plan model, canonical envelope, and failure mapping.
  These are ordinary TypeScript and are not delegated to a framework.
- Wrap every selected primitive in a small private feature-owned adapter. Package
  types and error objects do not cross into public exports or semantic code.
- The same feature-owned adapter implementation participates in the direct
  stage0 root and generated stage1 wiring required by ADR-0008. Qualification
  subjects use isolated instances, caches, and output roots; an adapter cannot
  become a hidden shared authority between assembly paths.
- Use the platform fatal `TextDecoder` for UTF-8 mechanics and Web Crypto
  SHA-256 for hashing. Core still owns byte limits, framing, availability
  failures, domain separation, and external digest spelling.
- Qualify `canonicalize@4.0.0` as the first private RFC 8785 production adapter.
  It is accepted only after exact-byte vectors pass in Node, browser windows,
  and workers. Adapter failures reject as implementation failures.
- Use `json-canonicalize@3.0.0` only as a development differential oracle. It is
  not a runtime dependency or independent contract authority; fixed RFC bytes
  and checked-in vectors remain authoritative.
- Spike `jsonc-parser@3.3.1` only through scanner and visitor APIs. Its tolerant
  `parse` API, error text, recursion behavior, and types are forbidden at the
  production boundary. Adoption requires fatal UTF-8, duplicate decoded-key,
  lone-surrogate, depth, two-pass materialization, redaction, fuzz, and
  browser-worker evidence. Use a small owned iterative scanner if it fails.
- Use `fast-check@4.9.0` as development-only property-test machinery through the
  existing Engineering Foundation testing boundary. Pin seeds, preserve replay
  data, and convert every minimized defect into a literal regression fixture.
  Generated agreement never becomes the expected-value oracle.
- Do not use Graphology, Ajv, Zod, Cordis, Effect, Awilix, Inversify, tsyringe,
  or Avvio in Core. Ajv may continue as independent development schema evidence.
- `@deepseek-ai/cordis@4.0.2` is additionally disqualified as Product Host
  lifecycle or resource authority by the reproduced exporter-disposal ownership
  defect. A newer exact release may be reconsidered only as a private
  non-authoritative Host adapter after the reproducer and product cleanup policy
  pass.
- `AsyncDisposableStack` may be qualified as a target-local Product Host
  primitive for reverse asynchronous cleanup. It is not part of Core and does
  not own Host state, cancellation, readiness, generations, cutover, drain,
  rollback, or recovery.

## Consequences

- Most high-risk semantics remain visible, testable, and portable ordinary code.
- Small libraries remove tokenization, canonicalization, hashing, and property
  generation work without defining product architecture.
- Any selected package can be replaced by preserving the private port and
  executing the same conformance vectors.
- Strict raw admission and bounded diagnostics remain the largest owned
  implementation areas; no suitable package removes that work.
- Product Hosts make their own lifecycle decision rather than inheriting one
  from Core.

## Rejected alternatives

- Adopt Cordis or another container as the Core composition authority. It does
  not implement compiler semantics and would leak a second resolution and
  lifecycle model.
- Use a generic graph library. Exact edge populations, reachability, SCC
  diagnostics, ordering, and resource accounting still require custom wrappers
  larger than the saved traversal mechanics.
- Use Ajv or Zod as production semantic authority. Their traversal and error
  models do not provide the accepted prerequisite suppression, metering,
  redaction, or diagnostic ordering.
- Write custom UTF-8 decoding, SHA-256, canonicalization, and property-testing
  machinery. Mature replaceable primitives exist and are cheaper to qualify.
