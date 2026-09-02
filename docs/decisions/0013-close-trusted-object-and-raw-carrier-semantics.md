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

<!-- cspell:words growable resizable subarray -->

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
only an own `length` data property and own enumerable data properties for every
canonical index from zero through `length - 1`. The following fail as
`schema.non-plain-value` with `details: {"reason":"non-plain-value"}` at the
nearest safely representable containing path:

- accessors, symbols, non-enumerable record properties, or extended array
  properties;
- sparse arrays, custom prototypes, and observably exotic objects;
- an object-reference cycle encountered on the active ancestor chain.

#### Descriptor rules

Admission inspects `Object.getPrototypeOf`, `Object.getOwnPropertySymbols`,
and `Object.getOwnPropertyDescriptors` only. The `writable`, `configurable`,
and extensibility attributes are irrelevant: frozen, sealed, and
non-extensible records and arrays are admitted when every other rule passes,
so a caller may freeze `defineModule` output before compilation. The closed
descriptor outcomes are:

| Observation | Record | Array index `0..length-1` | Array `length` | Outcome |
| --- | --- | --- | --- | --- |
| Data descriptor, enumerable | admit | admit | not applicable | admitted |
| Data descriptor, non-enumerable | reject | reject | admit | `schema.non-plain-value` for a record key or an index |
| Accessor descriptor | reject | reject | reject | `schema.non-plain-value` |
| Symbol key | reject | reject | not applicable | `schema.non-plain-value` |
| Missing index below `length` | not applicable | reject | not applicable | `schema.non-plain-value` after charging the length and every attempted occurrence |
| String key that is not a canonical index | not applicable | reject | not applicable | `schema.non-plain-value` |
| Own key `"__proto__"` | admit as an ordinary key | not applicable | not applicable | later `schema.unknown-field` through the accepted schema rules |

An own `"__proto__"` data property, such as the one `JSON.parse` materializes,
is ordinary data and never changes the snapshot prototype. The prototype and
descriptor rules are the complete observable surface: an exotic object that has
been re-prototyped to `Object.prototype` and exposes no own descriptor evidence
is indistinguishable from an empty record, which is one more reason the
trusted-object boundary is not a security boundary.

#### Value category mapping

Every own value is classified before schema validation. The closed mapping
from JavaScript value category to the accepted code is:

| Value category | Code and reason |
| --- | --- |
| `null`, boolean, string, finite safe integer | admitted and validated by the accepted schema rules |
| Finite non-integer where the schema requires an integer, or `-0` | `schema.invalid-value` with the accepted `invalid-type` or `invalid-format` reason, matching the accepted raw successor cases |
| String containing a lone surrogate | `schema.invalid-value` with `invalid-format` |
| `undefined` as an own value, `symbol`, `bigint`, function, `NaN`, `Infinity`, `-Infinity` | `schema.non-plain-value` |
| `Date`, `Map`, `Set`, `RegExp`, typed array, `ArrayBuffer`, `Promise`, `Error`, wrapper object, class instance, `arguments` | `schema.non-plain-value` |
| Record with another realm's `Object.prototype`, or cross-realm array | `schema.non-plain-value` |
| Proxy | not claimed; the outcome is whatever the traps expose |

`undefined` is never treated as an absent property, because `JSON.parse`
cannot produce it and treating it as absence would make the object and raw
entry points disagree. The diagnostic path is the value position when its key
is schema-known and otherwise stops before the unknown key, following the
accepted `stop-before-unknown-key` policy.

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
  "details": {
    "reason": "not-uint8array | unusable-view | shared-storage | not-document-list"
  }
}
```

The actual `reason` is exactly one member of the closed four-member set, not
the displayed union string. For the three per-document reasons,
`invocation-prefix` means the accepted raw declaration prefix or raw profile
prefix, including the declaration document ordinal where applicable; the
wrapper reason `not-document-list` uses the path defined below. The new code
sorts before `decode.invalid-json`, has prerequisite group
`decode.byte-carrier`, an empty prerequisite list, path policy `structural`
satisfied by the invocation prefix, and document suppression scope. The prefix
is bounded by the accepted clipping rule; no hostile key or runtime error text
is reflected.

#### Carrier classification and copy procedure

Classification and copying use only intrinsics captured once when the adapter
module is evaluated in the entry-point realm. No property, method, or symbol is
ever read from the candidate value itself, so a subclass or a patched prototype
cannot influence the outcome:

- `brandOf`: the getter of `%TypedArray%.prototype[@@toStringTag]`; it returns
  `"Uint8Array"` only for a genuine `Uint8Array` view from any realm and
  `undefined` for every other value, including proxies and fake objects;
- `bufferOf` and `lengthOf`: the intrinsic `buffer` and `length` getters of
  `%TypedArray%.prototype`;
- `sharedProbe`: the intrinsic `byteLength` getter of `ArrayBuffer.prototype`,
  which throws for every `SharedArrayBuffer`, including growable and
  cross-realm shared storage;
- `usableProbe`: the intrinsic `%TypedArray%.prototype.at` invoked as
  `usableProbe.call(view, 0)`; its ValidateTypedArray step throws for a
  detached, fixed-length out-of-bounds, or length-tracking out-of-bounds view
  and returns for every usable view, including an empty in-bounds view;
- `OwnedUint8Array`: the `Uint8Array` constructor of the entry-point realm.

The normative procedure is:

```text
classify(value):
  if brandOf.call(value) !== "Uint8Array"        -> reason "not-uint8array"
  buffer = bufferOf.call(value)
  try sharedProbe.call(buffer) catch             -> reason "shared-storage"
  try usableProbe.call(value, 0) catch           -> reason "unusable-view"
  return admitted with visibleLength = lengthOf.call(value)

copy(value):
  return new OwnedUint8Array(value)
```

The reason order is closed: brand, then shared storage, then usable state. A
shared view cannot become detached or out of bounds, so the order never changes
an outcome, but implementations MUST report exactly this classification.

`new OwnedUint8Array(view)` is the only permitted copy. The typed-array branch
of that constructor reads the source through internal slots and never consults
`@@species`, `@@iterator`, an own or inherited `slice`, `subarray`, `buffer`,
`length`, or `byteOffset` property, or `constructor`. It allocates a new fixed,
non-shared buffer in the entry-point realm and copies exactly the visible
elements of an offset view. Implementations MUST NOT copy through
`view.slice()`, `view.subarray()`, `Array.from`, spread, `Uint8Array.from`,
`Buffer.prototype.slice`, `Buffer.from(view)`, or an
`Object.prototype.toString` check: those paths invoke observable methods,
respect `@@species`, or alias the source memory.

Because classification and copying execute no caller-observable step, the
visible length cannot change between the two in single-threaded JavaScript;
shared storage, the only concurrent writer, is rejected before copying.

The procedure is portable by construction. It uses only ECMAScript intrinsics
that every supported runtime provides. Production code MUST NOT use `Buffer`,
`node:*` built-in modules, `process`, or any other platform-specific API for
classification, copying, or snapshotting; a Node `Buffer` is admitted only
because it is a genuine `Uint8Array`, never because the code recognizes it.
Node is only the environment in which the development-only oracle and the
acceptance evidence execute, not a dependency of the adapter. The runtime boundary that
the first private package declares in `architecture/foundation/source-dependencies.yaml`
MUST allow no built-in modules and no packages, so that the Foundation gate
rejects any platform dependency mechanically once that file exists.

#### Resource preflight before allocation

The visible length is read once through `lengthOf` and compared with the
accepted byte limits before any owned buffer is allocated:

1. read the wrapper (below) and classify every declaration and profile carrier;
2. compute `aggregateRawBytes` as the saturating sum of the visible lengths of
   admitted carriers, counting a rejected carrier as zero bytes;
3. compare every admitted carrier with `declarationRawDocumentBytes` or
   `profileRawDocumentBytes`, and the sum with `aggregateRawBytes`;
4. copy only carriers whose document and batch byte facts are `valid`;
5. release every caller reference, then allow the first `await`.

A limit-plus-one carrier emits `input.limit-exceeded` with the accepted
saturated `actual` value and MUST NOT be copied; the qualification case for
that limit asserts that no owned buffer proportional to the rejected carrier
was allocated. Step 4 preserves ADR-0007's rule that raw documents are admitted
independently only after batch-wide resource preflight.

#### Wrapper admission and index bound

The `input` value and its `declarations` list are read the same way on both
entry points: `Object.getOwnPropertyDescriptor(input, "declarations")` and
`Object.getOwnPropertyDescriptor(input, "profile")` supply own data values,
getters are never invoked, inherited properties are ignored, and additional own
keys are ignored. `declarations` MUST be an array whose elements are read
through own data descriptors of their canonical index; an own data `length`
supplies the count.

On the raw entry point the wrapper is realm-neutral: `Array.isArray` admits a
cross-realm array because the carriers themselves are classified by intrinsic
brand. A missing, non-array, or accessor-backed `declarations` list, or a
missing `profile`, fails as `input.invalid-byte-carrier` with the fourth closed
reason `not-document-list` at path `[declarations]` or `[profile]`; every
document fact then becomes `unavailable`. On the object entry point the same
shapes fail as `schema.non-plain-value` at the same paths, because that
boundary already requires a same-realm genuine array.

Document ordinals above the accepted maximum index of `65535` cannot be
represented in a diagnostic path. The successor contract therefore adds the
bounded-emission rule `indexOverflow: stop-before-unrepresentable-index`: the
path stops before the unrepresentable index segment, identical normalized
candidates deduplicate under the accepted candidate key, and the `declarations`
count limit is evaluated from the wrapper length before any carrier beyond
that limit is classified.

#### Carrier failure and facts

The successor contract adds exactly one document-scoped fact,
`document.byte-carrier-admitted`:

| State | Meaning |
| --- | --- |
| `valid` | the document carrier is a genuine, usable, non-shared `Uint8Array`; on the object entry point the fact is always `valid` |
| `invalid` | classification failed; the document emits `input.invalid-byte-carrier` |
| `unavailable` | the wrapper failed as `not-document-list`, so no document was classified |

The accepted facts are refined rather than replaced. `document.raw-bytes-admitted`
is `unavailable` for a document whose carrier fact is `invalid` or
`unavailable`; the accepted `declarationRawDocumentBytes` and
`profileRawDocumentBytes` limit rows gain `document.byte-carrier-admitted` as
their single prerequisite. `batch.raw-bytes-admitted` counts a rejected carrier
as zero bytes and does not become `unavailable` because of a carrier failure.
A failed carrier therefore emits its carrier diagnostic and no decoder, schema,
or byte-limit derivative, while independently admitted documents continue
unless the batch byte fact itself is `invalid`.

### Owned snapshot representation

The owned snapshot handed to semantic compilation is built from primitives,
genuine entry-point-realm arrays, and null-prototype records. Record properties
are defined with `Object.defineProperty`, never by assignment, so an admitted
`"__proto__"` key becomes an ordinary own key instead of silently changing the
prototype. Traversal is iterative and tracks the set of active ancestors, so a
shared acyclic reference is copied per occurrence while a cycle is detected on
the first repeated ancestor. The completed snapshot is deep-frozen before the
first `await`. Snapshot identity, key insertion order, and integer-like key
reordering are not observable in the normalized compiler model.

### Precedence

If accepted, this ADR narrowly supplements ADR-0006 and ADR-0007 for carrier
classification, synchronous snapshot ownership, trusted-object representation,
the new raw-carrier diagnostic and its document fact, the wrapper rule, and the
index-overflow emission rule. It does not change UTF-8, JSON, schema,
resource limits, semantic normalization, graph behavior, canonicalization,
digest, or Product Host lifecycle.

The accepted diagnostic contract and snapshots remain byte-identical. This
decision requires additive versioned successor artifacts; file presence or
chronology does not activate the proposal.

## Acceptance evidence

Acceptance requires a successor diagnostic contract, snapshot set, closed case
manifest, recipe manifest, mutation manifest, checker, results, and immutable
qualification ledger. Following ADR-0007, which was itself accepted on static
artifacts, those successor artifacts plus the development-only qualification
tooling under `tests/qualification` (the oracle), executed on Node, are
sufficient to accept this decision. That tooling meters and classifies
fixtures; it is not a compiler fixture and does not implement composition
semantics. The six-case runtime
matrix is the conformance-claim and publication gate, not an acceptance
prerequisite. The candidate entrypoints that execute the case inventory live in
the private `packages/core` subject admitted by the governance gate; it is not
production or public API before acceptance, and the production entrypoints must
rerun the same closed suite before exposure.
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
  derivative after carrier failure;
- mutations that copy through an own `slice`, `@@iterator`, or `@@species`
  path, alias memory through `Buffer.prototype.slice`, allocate the copy before
  the byte-limit check, assign snapshot properties instead of defining them,
  echo an unrepresentable index, invoke a wrapper getter, treat an own
  `undefined` value as absent, or reject a frozen record.

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
