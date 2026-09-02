---
id: OD-INDEX
type: index
status: active
owner: architecture
summary: Index of active and resolved Get Modular product and compatibility decisions.
---

# Open decisions

Every active open decision in this repository blocks publication surfaces in
`packages/*` manifests, registry publication, and `runtime-conformant` claims.
It does not block private source below `packages/` inside a package identity
accepted by ADR-0003 whose manifest is `private: true` and declares no
publication field. Accepted ADR-0015 records this narrowing as the successor to
the ADR-0003 sentence that deferred package creation, and the governance gate
in `architecture/checks/governance.mjs` and
`architecture/checks/production-artifacts.mjs` enforces it. The
traceability catalog enumerates the same set under its historical
`implementationBlockers` key, and the gate rejects any mismatch between that
key and the active open-decision set.

## Active

- [OD-004: Package carrier and resolution policy](OD-004-package-carrier-and-resolution-policy.md)
- [OD-005: Raw input carrier semantics](OD-005-raw-input-carrier-semantics.md)
- [OD-006: Duplicate binding-record diagnostics](OD-006-duplicate-binding-record-diagnostics.md)

## Resolved

- [OD-001: Public package identity and topology](OD-001-public-package-identity-and-topology.md)
- [OD-002: Canonical plan encoding and digest](OD-002-canonical-plan-encoding-and-digest.md)
- [OD-003: V1 compatibility, diagnostics, and resource limits](OD-003-v1-compatibility-diagnostics-and-resource-limits.md)
