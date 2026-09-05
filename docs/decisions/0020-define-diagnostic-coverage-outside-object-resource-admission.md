---
id: ADR-0020
type: adr
status: accepted
owner: architecture
summary: Bounds object resource diagnostic coverage while preserving precise early failures and full determinism inside the admitted envelope.
approved_by: product-owner
accepted_at: 2026-09-05
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

The product owner selected option A on 2026-09-05: bounded early rejection
with a precise named failure outside the object resource envelope.

### Coverage and precedence

Within the trusted, cooperative object entry domain of ADR-0018, preserve
complete deterministic eligible diagnostics under the existing equivalence,
normalization, prerequisite, ordering and truncation rules whenever resource
admission completes without JSON occurrence, aggregate string or depth overflow.
Malformed in-envelope inputs retain those guarantees. This does not broaden
M1 to unresolved repeated binding records or raw-carrier classifications.

Outside that envelope, reject with at least one truthfully established
`input.limit-exceeded` and no plan or digest. Do not promise the same selected
limit or complete diagnostic set under property, document or binding
permutations. The returned named resource failure still uses the existing
phase, path, coordinate and details shape; `actual` saturates at `limit + 1`.
Every emitted candidate must be independently justified. Sorting the returned
subset does not make it exhaustive, and missing diagnostics prove nothing
about unvisited input. Do not continue unbounded traversal to improve coverage.

This narrowly supersedes GM-REQ-007's unconditional diagnostic determinism
wording and ADR-0006/ADR-0007's complete independent resource coverage only
outside that object admission envelope. Resource-admitted success, plans,
digests, eligible semantic diagnostics and all numerical limits are unchanged.
Existing immutable requirements, catalogs, prerequisite facts, qualification
vectors and ledgers remain byte-identical. Their unaffected assertions still
apply. The supplement below records this single fixed successor rule.

### Failure propagation and allocation

- `jsonValueOccurrences` and `aggregateStringBytes` are batch-wide limits.
  Once either is proved, stop resource traversal for that invocation. Admit
  no document snapshot or resource-only semantic profile, including earlier
  valid documents. Keep already established diagnostic candidates only.
- `jsonDepth` remains document-local. Stop the affected document, exclude it
  from semantic data, preserve its document path, and continue independent
  documents with the same invocation-wide occurrence/string counters. Retain
  an earlier depth diagnostic even if a later batch limit stops admission.
- Preserve independently established shallow `totalCapabilities` and
  `totalSlots` overflow candidates. Complete those bounded counts before a
  later JSON traversal can stop. Declaration-count preflight still precedes
  copying or inspecting a rejected declaration list.
- Reserve attempted array positions from length before a proportional
  descriptor scan. A hidden string or deep value in an oversized array need
  not be visited. Never invent a failure for such an unmeasured dimension.
- Observable accessors are never invoked. The existing symbol/non-index tail
  rule terminates only that frame; parent siblings remain eligible. Shared
  DAG occurrences are counted separately, cycles remain non-plain values.
  Traversal state and diagnostic data retain no caller aliases.

ADR-0018's exclusion of unavoidable intrinsic reflection allocations from a
portable heap promise remains. Core-owned work and retained state stay bounded.
No new port, resource profile, policy engine, container or Host lifecycle is
introduced. The admission feature remains the sole runtime owner of this rule.

### Executable evidence and delivery

The closed [contract](../../architecture/qualification/object-resource-coverage/contract.json)
and [case vectors](../../architecture/qualification/object-resource-coverage/cases.json)
pin coverage, propagation and permitted complete failure results. They include
all three council permutation families, hidden string/depth values at both
ends of an oversized array, multiple documents, prior depth plus later batch
failure, independent shallow aggregates, malformed in-envelope input and cycles
beside shared DAGs. Recipes construct the inputs independently of Core.

The actual admission/semantic tests require membership in the permitted result
set outside the envelope, not equality across permutations. In-envelope
permutations still require exact equality. Structural tests observe saturated
counters, zero rejected-array descriptor scans, no getters, no document
snapshot after batch rejection and no retained caller aliases. Existing
boundary/plus-one, DAG occurrence and tail-work tests remain mandatory.

Run these cases against the M1 object facade before its public qualification,
and later against generated M3 as part of direct/generated parity. Document
the coverage boundary in public API documentation and the handbook. The
private-stage tests alone do not establish a public compiler or packed gate.
A later M2 successor must explicitly carry forward this object rule; this
acceptance does not select raw-byte diagnostics or resolve OD-005/OD-006.

The object resource coverage ledger `architecture/authority/object-resource-coverage-ledger.json` is anchored as `sha256:358413860f9a47204f211a1787ebbca402e8a7d93b3b6d0e798b00897b897ab3`.

## Consequences

- Useful named errors survive with bounded rejection and truthful coverage.
- Hosts can rely on deterministic complete eligible diagnostics inside the
  envelope. Beyond it they can rely on rejection, not a stable winning limit.
- Existing bounded admission needs no new traversal algorithm. Authority,
  independent vectors and API/agent guidance close the ambiguity explicitly.
- Acceptance permits this M1 correction, not a publication, merge, runtime
  conformance claim or expansion of the recorded implementation scope.

## Rejected alternatives

- Option B, one generic batch failure: loses precise limit diagnostics and
  document-local depth behavior without a current consumer need.
- Option C, a second structural-work gate: adds another resource contract and
  larger traversal state merely to preserve more rejected-input diagnostics.
- Scan every rejected object, prioritize an unvisited limit, or sort all input
  first: none resolves the bounded-work versus unread-position proof above.
