---
id: OD-INDEX
type: index
status: active
owner: architecture
summary: Index of active and resolved Get Modular product and compatibility decisions.
---

# Open decisions

Every active open decision in this repository blocks `runtime-conformant`
claims and the exposure of the semantics it owns. Publication surfaces in
`packages/*` manifests and registry publication are blocked only by the open
decisions listed under `publicationBlockers` in the traceability catalog, a
subset of the active set that is empty since accepted ADR-0012 resolved
OD-004. Accepted ADR-0015 admits private source inside a package identity
accepted by ADR-0003, and accepted ADR-0017 narrows publication blocking to
that subset; the governance gate in `architecture/checks/governance.mjs` and
`architecture/checks/production-artifacts.mjs` enforces both. The traceability
catalog enumerates the active set under its historical `implementationBlockers`
key, and the gate rejects any mismatch between that key, the
`publicationBlockers` subset and the active open-decision set.

## Active

- [OD-005: Raw input carrier semantics](OD-005-raw-input-carrier-semantics.md)
- [OD-006: Duplicate binding-record diagnostics](OD-006-duplicate-binding-record-diagnostics.md)

## Resolved

- [OD-004: Package carrier and resolution policy](OD-004-package-carrier-and-resolution-policy.md)
- [OD-001: Public package identity and topology](OD-001-public-package-identity-and-topology.md)
- [OD-002: Canonical plan encoding and digest](OD-002-canonical-plan-encoding-and-digest.md)
- [OD-003: V1 compatibility, diagnostics, and resource limits](OD-003-v1-compatibility-diagnostics-and-resource-limits.md)
