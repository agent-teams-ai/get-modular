---
id: OD-INDEX
type: index
status: active
owner: architecture
summary: Index of active and resolved Get Modular product and compatibility decisions.
---

# Open decisions

Under the current accepted authority, every active open decision blocks
production package source, qualification promotion and publication. Proposed
ADR-0015 would narrow this rule so a private, non-publishable implementation
subject can close the remaining evidence cycle. Until that or another successor
is accepted, the governance gate remains fail-closed. The traceability catalog
enumerates the same active set under its historical `implementationBlockers`
key and the gate rejects any mismatch.

## Active

- [OD-004: Package carrier and resolution policy](OD-004-package-carrier-and-resolution-policy.md)
- [OD-005: Raw input carrier semantics](OD-005-raw-input-carrier-semantics.md)
- [OD-006: Duplicate binding-record diagnostics](OD-006-duplicate-binding-record-diagnostics.md)

## Resolved

- [OD-001: Public package identity and topology](OD-001-public-package-identity-and-topology.md)
- [OD-002: Canonical plan encoding and digest](OD-002-canonical-plan-encoding-and-digest.md)
- [OD-003: V1 compatibility, diagnostics, and resource limits](OD-003-v1-compatibility-diagnostics-and-resource-limits.md)
