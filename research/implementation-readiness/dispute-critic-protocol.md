---
id: RESEARCH-IMPLEMENTATION-READINESS-DISPUTE-CRITIC-PROTOCOL
type: research-protocol
status: draft
owner: architecture
---

# Dispute critic protocol

This protocol is qualification-only. It cannot accept an ADR, select a public
API, authorize production source, or change product semantics.

## Fixed subject

The coordinator supplies one verified Git bundle and exact subject SHA. Read
only that checkout. Do not fetch the network, inspect a mutable branch, commit,
or edit files. Treat accepted ADRs as authority, proposed ADRs as proposals,
and disposable fixtures as observations rather than contracts.

## Assigned dimensions

Every worker receives exactly one topic and one role from the closed matrices
below. Do not expand into another topic or repeat a different worker's role.

Topics:

1. `descriptor-vs-define-module`: inert descriptor object compared with typed
   `defineModule`.
2. `cardinality-helpers`: `required`, `optional`, and `many({ min, max })`
   naming and semantics.
3. `dependency-record`: object dependency record compared with ordered tuples
   or `Map`.
4. `declaration-activation`: module declaration compared with a separate
   activation factory.
5. `stage0-stage1`: ADR-0008 and proposed ADR-0016 self-composition.
6. `identity-locality`: module ID and owner locality and navigation at 1,000
   modules.
7. `pure-di-composition`: product-owned Pure DI compared with reusable module
   composition.
8. `private-boundary`: what must remain private pending ADR-0009, ADR-0010,
   ADR-0012, ADR-0013, and ADR-0014.

Roles:

1. `correctness-determinism`.
2. `clean-architecture-solid-ddd`.
3. `security-failure-modes`.
4. `real-world-dx-maintenance`.

## Required evidence

Read the goal-relevant accepted and proposed ADRs, the implementation-readiness
report, the API authoring lab, and the common 30-scenario runner. Run only
read-only commands needed to prove a claim. Cite repository-relative paths and
line numbers from the exact subject. A finding without a reproduction or direct
source proof is an observation, not a P0-P2 defect.

For the assigned topic and role, report:

```yaml
workerId:
topic:
role:
exactSha:
claim:
authority:
sources:
observedBehavior:
applicability:
benefits:
failureModes:
counterexamples:
metrics:
rejectedPatterns:
findings:
  - severity:
    location:
    reproduction:
    minimalCorrection:
    productOwnerDecisionRequired:
openQuestions:
confidence:
recommendedDecision:
conditionsToReverse:
commands:
networkRequested: false
networkEnforced: disabled
```

Use `findings: []` when there is no reproducible P0-P2 or concrete ambiguity.
Do not count agreement with other workers as evidence. Do not edit the subject.
