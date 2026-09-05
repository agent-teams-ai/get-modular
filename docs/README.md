---
id: DOCS-INDEX
type: index
status: active
owner: architecture
summary: Canonical navigation for Get Modular architecture and evidence.
---

# Documentation

## Architecture

- [System boundary](architecture/system-boundary.md)
- [Current implementation contract](architecture/current-contract.md)
- [Accepted implementation readiness rules](decisions/0018-close-implementation-readiness-rules.md) - exact depth, numeric, type, trust and generated-publication rules.
- [Feature Module Standard profile](architecture/feature-module-standard.md)
- [MVP implementation roadmap](architecture/mvp-implementation-roadmap.md) - start with the [agent execution route and phase reading map](architecture/mvp-implementation-roadmap.md#agent-execution-route), [parallel delivery](architecture/mvp-implementation-roadmap.md#dependency-safe-parallel-delivery) and [phase Definition of Done](architecture/mvp-implementation-roadmap.md#phase-definition-of-done-and-evidence-map).
- [Self-composition implementation guide](architecture/self-composition-implementation-guide.md) - own feature inventory, feature skeleton, build topology and emitter contract for ADR-0008.
- [MVP decision packet](architecture/mvp-decision-packet.md) - non-authoritative choices and implementation stop points.
- [Internal engine self-composition](decisions/0008-bounded-internal-engine-self-composition.md) - accepted build-time self-use architecture; implementation evidence remains pending.
- [Self-composition evidence and release custody](decisions/0011-define-private-self-composition-evidence-and-release-custody.md) - proposed private qualification protocol for the first packed Core.

## Governance

- [Accepted decisions](decisions/README.md)
- [Open decisions](open-decisions/README.md)

## Current contract and immutable evidence

- [Module System requirements and immutable evidence](requirements/module-system-v1.md)
- [Composition schema evidence](../architecture/contracts/v1/composition.schema.json)
- [Effective resource profile evidence](../architecture/qualification/v1/resource-profile-v2.json)
- [Diagnostic catalog evidence](../architecture/contracts/v1/diagnostic-catalog.json)
- [Canonical vectors evidence](../architecture/contracts/v1/canonical-vectors.json)
- [Requirement traceability](traceability/module-system-v1.yaml)

The `V1` and `v2` path names above are historical evidence identifiers, not
parallel public API or selectable runtime profiles. The current effective
resource policy is the single profile described in the current contract.

## Evidence

- [Historical implementation-readiness audit](../research/implementation-readiness/report.md) - dispositions belong to the recorded historical subjects; use the current contract and roadmap for today's start conditions.
- [Compiler engineer handbook](qualification/compiler-engineer-handbook.md) - seventeen fact derivations, partial failure rules and independent examples.
- [Growth and first-publication readiness review](qualification/growth-and-release-readiness-review.md) - reconciled capability migration, namespace admission and release-mechanics findings.
- [Source map](provenance/source-map.yaml)
- [Five-critic bootstrap review](qualification/bootstrap-five-critic-review.md)
- [V1 contract council and resource profile](qualification/v1-contract-council-and-resource-profile.md)
