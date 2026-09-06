---
id: OD-005
type: open-decision
status: resolved
resolved_by: ADR-0021
owner: architecture
summary: Closes trusted-object admission and raw byte-carrier snapshot behavior before raw-input exposure.
related:
  - ADR-0021
  - ADR-0006
  - ADR-0007
  - ADR-0013
  - ADR-0017
  - ADR-0018
  - GM-REQ-V1
---

<!-- cspell:words enumerables -->

# OD-005: Raw input carrier semantics

## Decision required

Define exactly which JavaScript values the trusted-object and raw compiler
entry points admit, when caller-owned input is snapshotted, and how invalid raw
carriers fail. TypeScript types do not protect the runtime boundary from values
created in another realm, subclassed views, detached or resized buffers,
shared storage, accessors, cycles, or caller mutation. The decision covers the
top-level invocation record and declaration collection as well as individual
records, arrays and byte views.

Accepted [ADR-0018](../decisions/0018-close-implementation-readiness-rules.md)
settles exact raw integer admission and the trusted object/wrapper resource
envelope. The remaining carrier classification, descriptor, wrapper-shape, snapshot
and diagnostic evidence are adopted through ADR-0021, which carries these
clarifications into the single M2 generation.

## Constraints

- Admission and snapshotting complete synchronously before any asynchronous
  boundary or caller-observable continuation.
- Semantic code receives only owned values; it never retains caller objects,
  arrays, views, or buffers.
- Validation MUST NOT invoke getters or trust inherited properties.
- A valid offset view copies only its currently visible elements, not the whole
  backing buffer.
- Raw-view identity is checked by intrinsic brand and usable state, not by a
  same-realm `instanceof` test. Object admission does not infer an originating
  realm from a `null` prototype.
- Resource accounting counts the admitted snapshot and preserves the accepted
  occurrence rules, saturation, and diagnostic bounds.

## Candidate direction

The trusted-object entry point admits a record when its observed prototype is
either the current realm's exact `Object.prototype` or `null`, and admits dense
current-realm ordinary arrays with that realm's exact intrinsic array
prototype. A `null` prototype has no observable realm provenance, so this is an
explicit realm-neutral rule: a cross-realm null-prototype record is admitted
when every descriptor and graph rule passes, without being described as
same-realm. Records with another realm's `Object.prototype` and cross-realm
arrays are rejected. The entry point inspects own property descriptors only,
admits own enumerable data properties, and rejects accessors, symbols,
non-enumerables apart from the intrinsic array `length`, extended or sparse
arrays, custom prototypes, and cycles. Shared acyclic references are copied and
counted per occurrence.

This observable-prototype rule does not make the trusted-object entry point a
hostile-input boundary. A `null` prototype is not proof that a value is
non-Proxy or safe, and prototype, key, or descriptor inspection can invoke
Proxy traps. Product boundaries send hostile payloads as admitted raw bytes in
a trusted Host-created wrapper/list. Safely serializing or isolating a hostile
object happens upstream; the byte entry point does not make that operation safe.

The raw entry point admits a genuine, currently usable, non-shared `Uint8Array`
view, including cross-realm values, subclasses, non-zero offsets, and currently
in-bounds views over resizable storage. It synchronously copies exactly the
visible bytes to fixed owned storage. It rejects wrong brands, detached or
currently out-of-bounds views, and views backed by `SharedArrayBuffer` or
growable shared storage.

Disposable Node and Chromium observations support this candidate and reproduced
a mixed shared-buffer snapshot. They are not governed multi-runtime acceptance
evidence and make no Firefox, Safari, or release-runtime claim.

## Acceptance criteria

- One successor contract defines the exact object graph, descriptor, array,
  prototype, cycle, shared-reference, and resource-precedence rules.
- One successor diagnostic member defines raw-carrier failure code, phase,
  ordering, path, coordinate, closed reasons, prerequisites, and suppression.
- Raw-byte vectors cover same/cross realm, subclass, offset, resizable,
  detached, out-of-bounds, shared/growable shared, and caller mutation cases.
- Object vectors cover same-realm records with both allowed prototypes,
  admitted cross-realm null-prototype records, rejected cross-realm
  `Object.prototype` records and arrays, accessors without getter invocation,
  symbols, non-enumerables, custom prototypes, sparse/extended arrays, cycles,
  shared DAG references, and mutation immediately after invocation.
- Every successful vector proves that later mutation, resize, detach, transfer,
  or concurrent shared writes cannot alter the owned admitted snapshot.
- Acceptance evidence executes the successor vectors through a development-only
  Node oracle, binding exact inputs, expected outcomes, runtime identities, and
  results. The combined diagnostic generation 2 transaction and owner-scope
  expansion precede implementation in `packages/core`; that real subject must
  then execute the same suite before exposure. Execution
  on every mandatory runtime is the conformance-claim gate defined by ADR-0007,
  not an acceptance prerequisite; accepted ADR-0017 permits `not-claimed`
  publication of the object entry point before this decision closes. The normative procedure
  uses only ECMAScript intrinsics, so acceptance on Node makes no Node-specific
  claim.

## Resolution

Resolved by accepted [ADR-0021](../decisions/0021-freeze-combined-diagnostic-generation-two-for-m2.md)
on 2026-09-06. It adopts the exact semantic annex ADR-0013 together with
the combined generation 2 ledger and retained oracle evidence. The annex's
historical proposed status and pinned bytes are preserved. The owner has
authorized the bounded M2 implementation scope. Real Core object/raw replay
and the complete M2 qualification gates remain required before exposure;
acceptance does not relabel the oracle observations as compiler execution.
