---
id: OD-002
type: open-decision
status: resolved
owner: architecture
summary: Defines portable canonical plan bytes, digest domain separation, and compatibility behavior.
resolved_by: ADR-0004
related:
  - ADR-0001
  - ADR-0004
---

# OD-002: Canonical plan encoding and digest

## Decision required

Choose the exact canonical byte representation and digest protocol for an
immutable composition plan.

## Constraints

- Equivalent declarations and profiles must produce identical bytes and digest
  across machines, processes, and supported JavaScript runtimes.
- Registration order, object insertion order, locale, clock, random values,
  absolute paths, and executable functions cannot affect the result.
- The digest requires explicit algorithm and domain/version separation.
- Unknown fields, duplicate semantic identities, unsupported schema versions,
  and non-canonical values fail closed.
- The plan identifies selected composition only. It is not an authorization,
  artifact, generation, readiness, or deployment identity.

## Options

1. A narrowly specified canonical JSON profile with UTF-8 bytes and SHA-256.
2. Deterministic CBOR with a fixed profile and SHA-256.
3. A custom binary encoding.

## Acceptance criteria

- independent golden vectors exist outside the implementation;
- Unicode normalization, numbers, object keys, arrays, absence, and duplicate
  handling are normative;
- the digest envelope contains protocol name, schema version, and algorithm;
- malformed and adversarial inputs have bounded diagnostics and resource use;
- a second implementation can reproduce the same vectors without importing
  the compiler.

## Resolution

Resolved by ADR-0004. V1 uses RFC 8785 JCS over a closed
`get-modular.plan-content` envelope and SHA-256 with external digest spelling
`gm-plan:v1:sha-256:<hex>`. Accepted contract artifacts and independent vectors
are integrity-protected by the repository V1 contract gate.
