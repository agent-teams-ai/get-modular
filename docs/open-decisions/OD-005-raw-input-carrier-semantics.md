---
id: OD-005
type: open-decision
status: open
owner: architecture
summary: Closes trusted-object admission and raw byte-carrier snapshot behavior before compiler implementation.
related:
  - ADR-0006
  - ADR-0007
  - ADR-0013
  - GM-REQ-V1
---

# OD-005: Raw input carrier semantics

## Decision required

Define exactly which JavaScript values the trusted-object and raw compiler
entry points admit, when caller-owned input is snapshotted, and how invalid raw
carriers fail. TypeScript types do not protect the runtime boundary from values
created in another realm, subclassed views, detached or resized buffers,
shared storage, accessors, cycles, or caller mutation.

## Constraints

- Admission and snapshotting complete synchronously before any asynchronous
  boundary or caller-observable continuation.
- Semantic code receives only owned values; it never retains caller objects,
  arrays, views, or buffers.
- Validation MUST NOT invoke getters or trust inherited properties.
- Shared storage is rejected because copying it does not provide an atomic
  snapshot and can observe mixed concurrent writes.
- A valid offset view copies only its currently visible elements, not the whole
  backing buffer.
- Cross-realm identity is checked by intrinsic brand and usable state, not by a
  same-realm `instanceof` test.
- Resource accounting counts the admitted snapshot and preserves the accepted
  occurrence rules, saturation, and diagnostic bounds.

## Candidate direction

The trusted-object entry point admits ordinary records with `Object.prototype`
or `null` prototypes and dense ordinary arrays with the intrinsic array
prototype. It inspects own property descriptors only, admits own enumerable data
properties, and rejects accessors, symbols, non-enumerables, extended or sparse
arrays, custom prototypes, and cycles. Shared acyclic references are copied and
counted per occurrence.

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
- Executable vectors cover same/cross realm, subclass, offset, resizable,
  detached, out-of-bounds, shared/growable shared, and caller mutation cases.
- Object vectors cover accessors without invocation, symbols, non-enumerables,
  custom prototypes, sparse/extended arrays, cycles, shared DAG references, and
  mutation immediately after invocation.
- Every successful vector proves that later mutation, resize, detach, transfer,
  or concurrent shared writes cannot alter the owned admitted snapshot.
- Evidence executes against the real entry points in every mandatory runtime and
  binds exact inputs, expected outcomes, runtime identities, and results.

## Resolution

Open. ADR-0013 is a proposed resolution and MUST NOT authorize raw-entry or
trusted-object implementation until it is accepted with successor diagnostics
and executable evidence.
