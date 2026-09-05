---
id: ADR-0020
type: adr
status: proposed
owner: architecture
summary: Proposes an explicit bounded failure contract for object resource exhaustion and records the completeness versus bounded-work conflict.
related:
  - ADR-0006
  - ADR-0007
  - ADR-0018
  - GM-REQ-V1
  - ARCH-MVP-IMPLEMENTATION-ROADMAP
---

# ADR-0020: Define diagnostic coverage outside object resource admission

## Context

The corrective council reproduced resource diagnostics changing with property
or binding enumeration at source `74f178618c81e1ee9e5df5793e8388a8646cca2e`.
GM-REQ-007 requires deterministic diagnostics; ADR-0007 gives string, value and
depth checks independent prerequisites; ADR-0006 forbids scanning unbounded
rejected input merely to improve an error count. Those promises need an explicit
coverage boundary for rejected objects.

Consider an ordinary dense array with N positions, where N exceeds the JSON
occurrence limit. Length proves that overflow immediately. One unread
position may contain an oversized string or a deep container. Distinguishing
the version without that value from the version containing it requires N
position inspections in the worst case. Native reflection does not remove the
cost of the Core's own loop. Saturation, sorting returned errors and independent
counters cannot make an unvisited value known.

The same conflict occurs with schema-shaped bindings, without unknown fields:
2048 rows of 1024 three-byte provider IDs plus 64 rows of 1024 128-byte provider
IDs exceed both value and string limits. Their order selects the current first
failure. This is not a Proxy, raw-carrier or public-facade issue.

## Decision

No option is accepted by this proposal. In particular, do not mark the current
first-failure behavior conformant or silently weaken GM-REQ-007. Close this
decision before the next public M1 integration checkpoint; independent C1,
Unicode, partial-membership, package and oracle fixes can proceed.

### Option A: bounded first failure outside the resource envelope

Recommended for the smallest MVP contract: retain precise named failures and
bounded early rejection. Guarantee complete deterministic diagnostics for the
resource-admitted domain; outside it, guarantee rejection, a truthful saturated
resource failure and no plan/digest, but do not promise the same selected limit
under enumeration changes. Independently established shallow aggregate errors
remain; no downstream snapshot is built after batch rejection. Depth remains
document-local as in the existing implementation. Document this limitation at
the object API and in the handbook, rather than calling the result exhaustive.

This deliberately narrows the public determinism promise for over-budget input.
It does not change results for resource-admitted malformed input or valid plans.
Acceptance needs a scoped successor to GM-REQ-007/ADR-0006/ADR-0007, executable
coverage rules and independent vectors. It is not only an implementation fix.

### Option B: one deterministic resource-admission failure

Preserve bounded traversal and deterministic public rejection by introducing a
single closed diagnostic for any J/string/depth admission failure. Once any
such limit is proved, reject the whole batch with that stable diagnostic and
omit order-dependent individual resource discoveries. Existing independently
computed shallow aggregate candidates retain their fixed behavior. The complete
failure has a fixed batch path and no observed first-limit name.

This loses limit-specific detail and the current document-local depth behavior,
but needs no longer traversal or larger stack. A successor must define the exact
catalog/details shape, scope, deprecation implications and full-result vectors;
never invent a `limitName` or actual count for an unmeasured limit. Per-limit
development instrumentation must not enter the public deterministic result.

### Option C: a separate bounded structural-work gate

Add a fully specified structural-work budget before claiming complete J/S/depth
coverage. Charge root/value occurrences, attempted array positions and record
descriptor keys independently of string length; charge accessors even though
their values are never read. A completed scan supplies independent saturated
J/S/depth facts. If the structural budget itself exceeds its fixed limit,
return only its stable gate failure and suppress partial J/S/depth discoveries.
String code-unit scanning still stops after string saturation. Forbidden array
and symbol tails terminate their frame by the C1 ordering rule.

The initial design target is a structural budget of twice the accepted J limit:
ordinary admitted JSON has no more record keys than value occurrences. Prove
that bound and all descriptor accounting before acceptance. The traversal must
continue below depth 32 when needed for complete structural coverage, so its
explicit stack can grow to the structural bound. This changes the peak-memory
contract and requires allocation evidence, unlike A/B. The total own work is
bounded by structural budget plus string budget; no unlimited traversal is
permitted. Do not introduce this extra gate merely to retain every diagnostic
without evaluating that cost.

### Required decision and evidence

Choose the coverage promise first. Then create successor machine-readable
authority and case vectors without changing immutable accepted artifacts in
place, implement its bounded algorithm, and independently review the exact
result. No new Core/Host port, container or runtime lifecycle is required.

For each option, exercise the three concrete council permutations, a string and
deep value at both ends of an oversized array, multiple documents, accessor and
symbol tails, shared DAGs and cycles. Verify complete result shape, truthful
limit saturation, no getters, no retained caller references, no snapshot after
rejection, and structural counters. For A, assert the permitted first-failure
set explicitly; do not require equality outside its declared envelope. For B/C,
assert exact equal results for equivalent permutations.

## Consequences

- The distinction between rejection, complete diagnostics and resource safety
  becomes explicit before the first public implementation claim.
- A is the smallest change and keeps useful named errors; B buys strict failure
  determinism by reducing detail; C buys more detail with a new budget and
  larger bounded traversal state.
- Proposed status does not authorize any of these changed semantics.

## Rejected alternatives

- Continue through every rejected object to find all errors: violates bounded
  work for arbitrarily large input.
- Report whichever observed limit has the highest priority: cannot account for
  an unvisited higher-priority failure and preserves enumeration dependence.
- Sort the input or add round-robin traversal: the sorting and coverage cost
  itself needs admission; it does not resolve the unread-position proof.
