---
id: ADR-0013
type: adr
status: proposed
owner: architecture
summary: Defines owned synchronous snapshots for trusted objects and non-shared Uint8Array carriers.
related:
  - ADR-0005
  - ADR-0006
  - ADR-0007
  - GM-REQ-V1
  - OD-005
---

<!-- cspell:words growable resizable -->

# ADR-0013: Close trusted-object and raw-carrier semantics

## Context

ADR-0006 defines object and raw compiler entry points. ADR-0007 bounds object
preflight and raw decoding but leaves JavaScript carrier edge cases unresolved.
Without exact rules, two conforming implementations could disagree on realms,
subclasses, offsets, resizable or detached storage, shared buffers, descriptor
inspection, cycles, or the moment at which caller-owned state becomes immutable
compiler input.

Disposable probes support one narrow model: snapshot admitted values
synchronously into owned storage and reject shared byte storage. Those probes
are feasibility evidence only. Acceptance still requires successor contracts,
vectors, checker, and ledger evidence against the real compiler subject.

## Decision

This decision is proposed and becomes normative only if accepted with the
evidence below.

### Synchronous ownership boundary

Both public entry points perform carrier classification, bounded structural
preflight, and snapshotting synchronously before returning or crossing any
`await`, promise assimilation, callback, worker message, or other
caller-observable continuation. Semantic compilation receives only the owned
snapshot. No caller object, array, typed-array view, or backing buffer is
retained.

Mutation, resize, detach, transfer, realm teardown, or concurrent activity after
the entry point returns cannot alter the admitted snapshot or the result. A
failed admission publishes no partial snapshot.

### Trusted-object entry point

An admitted record's observed prototype is either exactly the current
entry-point realm's `Object.prototype` or `null`. The `null` case is
deliberately realm-neutral: `null` carries no originating-realm identity, so a
null-prototype record is admitted regardless of the realm in which it was
created when all descriptor and graph rules below pass. The adapter MUST NOT
claim that such a record is same-realm. An admitted array is a genuine ordinary
array with the current entry-point realm's intrinsic array prototype.
Inspection uses own property descriptors and never reads a value through a
getter. Records whose prototype is another realm's `Object.prototype` and
cross-realm arrays are rejected. A cross-realm caller that cannot supply a
cooperative null-prototype record uses the realm-neutral raw-byte entry point
instead.

Records admit only own enumerable string-keyed data properties. Arrays admit
only a normal nonnegative `length` data property and own enumerable data
properties for every canonical index from zero through `length - 1`. The
following fail as `schema.non-plain-value` with
`details: {"reason":"non-plain-value"}` at the nearest safely representable
containing path:

- accessors, symbols, non-enumerable record properties, or extended array
  properties;
- sparse arrays, custom prototypes, exotic objects, and invalid descriptors;
- an object-reference cycle encountered on the active ancestor chain.

Shared acyclic references are permitted. Each occurrence is copied, metered,
and validated independently; snapshot identity is not observable in the
normalized compiler model. Sparse array length and every attempted occurrence
are charged before density rejection, preserving ADR-0007 resource precedence.
Hostile Proxy safety is not claimed; product boundaries MUST NOT label
untrusted executable objects as trusted object input. In particular, observing
a `null` prototype is not proof that a value is non-Proxy, same-realm, or safe:
prototype, key, and descriptor inspection can invoke Proxy traps. Values that
may be hostile or proxied MUST cross the raw-byte boundary instead.

### Raw entry point

An admitted raw document is a genuine `Uint8Array` view whose typed-array
internal slots are currently usable and whose backing storage is not shared.
Admission is realm-neutral and does not rely on same-realm `instanceof`.
Subclasses, non-zero offsets, and currently in-bounds views over resizable
`ArrayBuffer` storage are admitted when their intrinsic brand and usable state
are valid.

The adapter synchronously copies exactly the view's currently visible elements
into new fixed, non-shared owned storage. It does not copy bytes outside the
view. It rejects:

- any value without the genuine `Uint8Array` brand as `not-uint8array`;
- a detached or currently out-of-bounds view as `unusable-view`;
- any view backed by `SharedArrayBuffer` or growable shared storage as
  `shared-storage`.

These failures use the proposed successor diagnostic:

```json
{
  "code": "input.invalid-byte-carrier",
  "phase": "decode",
  "path": "invocation-prefix",
  "coordinate": {},
  "details": { "reason": "not-uint8array | unusable-view | shared-storage" }
}
```

The actual `reason` is exactly one member of the closed set, not the displayed
union string. `invocation-prefix` means the accepted raw declaration prefix or
raw profile prefix, including the declaration document ordinal where
applicable. The new code sorts before `decode.invalid-json`, has prerequisite
group `decode.byte-carrier`, an empty prerequisite list, and document
suppression scope. The prefix is bounded by the accepted clipping rule; no
hostile key or runtime error text is reflected.

If carrier admission fails, its document has no `document.raw-bytes-admitted`
fact and no decoder/schema derivative. Other independently admitted documents
continue unless an accepted batch resource fact makes them unavailable.

### Precedence

If accepted, this ADR narrowly supplements ADR-0006 and ADR-0007 for carrier
classification, synchronous snapshot ownership, trusted-object representation,
and the new raw-carrier diagnostic. It does not change UTF-8, JSON, schema,
resource limits, semantic normalization, graph behavior, canonicalization,
digest, or Product Host lifecycle.

The accepted diagnostic contract and snapshots remain byte-identical. This
decision requires additive versioned successor artifacts; file presence or
chronology does not activate the proposal.

## Acceptance evidence

Acceptance requires a successor diagnostic contract, snapshot set, closed case
manifest, recipe manifest, mutation manifest, checker, results, and immutable
qualification ledger. A private non-publishable qualification subject provides
the candidate entrypoints before acceptance; it is not production or public API.
One closed subject-evidence key binds the exact source tree and subject bytes,
subject digest, runner and checker bytes and digests, command, toolchain,
operating system, architecture, realm, and every result. Each case binds that
key, a stable ID, exact candidate entry point, complete input or closed generator
recipe, exact complete expected result, runtime identity, and observed result.

The closed case inventory covers:

- same-realm and cross-realm genuine views, subclasses, offsets, empty and
  nonempty views, fixed and resizable buffers, in-bounds and out-of-bounds
  transitions, detachment, transfer, shared and growable shared storage;
- caller mutation, resize, detach, transfer, and realm teardown immediately
  after invocation and before compilation continues;
- same-realm records with both allowed prototypes, cross-realm null-prototype
  records, same-realm arrays, rejected cross-realm `Object.prototype` records
  and arrays, every rejected descriptor/property category, sparse/extended
  arrays, cycles, and repeated DAG references;
- limit and limit-plus-one resource cases, multi-document independence,
  diagnostic ordering, top-K behavior, and safe path prefixes;
- mutations that retain caller storage, await before copying, use
  `instanceof`, copy an entire backing buffer, accept shared storage, invoke a
  getter, deduplicate shared references, miss a cycle, or emit a decoder
  derivative after carrier failure.

After acceptance, mandatory release runtimes execute the same retained vectors
against the production entrypoints and bind the production subject through the
same evidence-key schema. Node or Chromium-only observations cannot qualify
other runtimes. The checker rejects missing, duplicate, substituted, unexecuted,
cross-subject, or subject-derived evidence.

## Consequences

- Semantic compilation is deterministic with respect to the invocation-time
  snapshot rather than later caller mutation.
- Cross-realm and offset byte views work without broadening the byte domain.
  Cross-realm ordinary-prototype object graphs use that raw boundary; a
  null-prototype record is admitted by observable shape without an
  unverifiable originating-realm claim.
- Shared byte storage is explicitly unsupported instead of pretending a normal
  copy is atomic.
- Trusted objects remain an efficiency API for cooperative callers, not a safe
  boundary for hostile Proxies.
- Implementations pay one bounded copy at each public boundary and can keep the
  semantic compiler free of realm and aliasing concerns.

## Rejected alternatives

- Accept only same-realm fixed-buffer views. This is simpler but rejects valid
  Electron, iframe, worker, and resizable-buffer callers without improving the
  owned snapshot after classification.
- Accept shared buffers and copy once. Concurrent writes can produce a mixed
  snapshot with no atomicity guarantee.
- Retain caller objects or views until the async compiler needs them. Results
  then depend on mutation timing.
- Require a null-prototype record to be current-realm. ECMAScript exposes no
  realm provenance through a `null` prototype, so that rule cannot be
  implemented or independently verified.
- Reuse `decode.invalid-json` or `schema.invalid-value` for carrier failures.
  Those codes claim facts that do not exist before a byte carrier is admitted.
