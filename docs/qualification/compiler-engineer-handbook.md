---
id: QUAL-COMPILER-ENGINEER-HANDBOOK
type: qualification
status: reviewed
owner: architecture
summary: Derives diagnostic prerequisites from input evidence and supplies independent examples without promoting a compiler implementation.
related:
  - ADR-0006
  - ADR-0007
  - ADR-0013
  - ADR-0015
  - ADR-0018
  - ARCH-CURRENT-CONTRACT
  - ARCH-MVP-IMPLEMENTATION-ROADMAP
---

# Compiler engineer handbook

This is a reading aid, not another contract or a specification extracted from
the checker. It explains the accepted rules below and explicitly identifies
remaining derivation gaps. It neither accepts proposed ADRs nor claims that a
production compiler has passed these examples.

## Read these authorities first

- [N: normalization and entry points](../decisions/0006-clarify-v1-compiler-normalization-and-entry-points.md).
- [D: diagnostic evaluation and graph semantics](../decisions/0007-require-executable-v1-conformance-amendments.md), especially "Independent canonicalization and normalization" and the preceding diagnostic rules.
- [F: closed fact and prerequisite catalog](../../architecture/qualification/v1/diagnostic-contract.json), `prerequisiteCatalog`.
- [G: independently authored graph expectations](../../architecture/qualification/v1/normalization-vectors.json), `graphSemantics`.
- [S: accepted data schema](../../architecture/contracts/v1/composition.schema.json).
- [R: effective resource limits](../../architecture/qualification/v1/resource-profile-v2.json).
- [I: accepted implementation clarifications](../decisions/0018-close-implementation-readiness-rules.md).

The names below are private qualification facts, not a public API, extensible
rule engine, or a reason to create seventeen services. A small set of private
functions and explicit values is enough. Derive facts from input evidence;
never copy a checker result, mark all facts valid, or infer a fact's meaning
only from its name.

## State and evidence rules

`valid` means the required evidence supports that particular prerequisite.
`invalid` records a disproven condition; `unavailable` means it could not be
established because an upstream prerequisite failed. Neither permits a
dependent candidate. Independent candidates continue. A diagnostic still needs
its own failed condition and all catalog prerequisites: a valid census is not
itself an error, and an invalid census does not invent a new diagnostic code.

Evaluate document facts per document and binding facts per binding, not as one
global boolean. A census retains input occurrences before normalization;
completeness and uniqueness are different properties. Keep enough evidence to
report a positive duplicate even when negative absence cannot be established.
Do not use map overwrite or registration order to choose an ambiguous record.

The following table is a derivation worksheet. "Gap" means the accepted
sources constrain observable behavior but do not completely define the named
state transition. Resolve such a transition with a bounded input/output case,
not an invented checker predicate; changing accepted behavior requires its
own decision. Rows labelled Gap are not permission to block unrelated M1 work.

## All seventeen prerequisites

| Fact and scope | Data and derivation | Failure, suppression, and authority |
| --- | --- | --- |
| `batch.raw-bytes-admitted` / batch | Raw entry: preflight document sizes and aggregate bytes against R before decoding. Object entry has B = 0; F's three object partitions set this fact valid. | An exceeded batch budget blocks dependent decoding; document-local admission follows successful batch preflight. Gap: exotic carrier propagation is not fixed by these partitions. Never serialize objects to manufacture byte measurements. N, D, F. |
| `document.raw-bytes-admitted` / document | Raw entry: compare this document's byte length with its declaration or profile limit after batch admission. F's three object partitions set this fact valid without a byte test. | Failure excludes this document's decoder; another admitted document may continue. Gap: the partitions do not pin every downstream state after a batch failure. D, F, R. |
| `document.decoded` / document | Raw entry: bounded valid UTF-8 and strict JSON with no duplicate keys yield a value. Object entry: use the accepted trusted-value domain, not JSON round-tripping. | Failed raw decoding contributes no downstream schema or semantic facts. Gap: unresolved object-carrier cases stay outside claimed admission. N, D, F. |
| `document.schema-valid` / document | Validate the whole admitted value against the relevant S definition and accepted plain-value/identity rules. For raw JSON integer fields, I requires exact mathematical safe-integer validation on the bounded lexeme before `Number` rounding. | A schema-invalid declaration supplies no partial semantic record. `1`, `1.0`, and `1e0` are admitted; `1.0000000000000001`, `1e-400`, and every spelling of negative zero yield `schema.invalid-value`. A schema-valid record may still fail semantic checks, such as `many.min > many.max`. N, D, S, I. |
| `declaration.identity-census-complete` / batch | Retain implementation identities and their occurrences from admitted declarations; establish the relevant census before proving absence. | An invalid census suppresses negative unknown-implementation claims but preserves positively proven duplicate identities. Gap: F's partition fixes that result, not every mixed-document state transition. D, F. |
| `declaration.module-census-complete` / batch | Collect module identities from admitted declarations, including every legal alternative implementation of one module. | Multiple implementations of a module are not duplicate modules. A missing/failed declaration can prevent proving module absence; retain independently known membership. D, F, G. |
| `profile.root-census-complete` / profile | Read the complete root occurrence list and resolve roots to selected implementations for closure. | Duplicate/unknown roots are checked independently; unreachable conclusions require roots to resolve uniquely. Gap: distinguish a complete list from usable root resolution when recording the private state. D, F. |
| `profile.selection-census-complete` / profile | Read every selection row and its module/implementation identity evidence. | Do not discard rows or turn a duplicate into first-wins selection. F explicitly allows this census to be valid while uniqueness is invalid. D, F. |
| `profile.selection-uniqueness` / profile | Group selection occurrences by module identity; establish whether there is one unambiguous selection per selected module. | Duplicate selection does not suppress an independently provable implementation mismatch. The flag is not a global phase barrier. D, F. |
| `binding.consumer-census-complete` / binding | Resolve this binding's consumer against declaration identity and profile evidence. | Unknown/ambiguous consumer prevents dependent slot/provider inference, not checks on other consumers. Gap: census completeness versus successful resolution must not suppress `binding.unknown-consumer` itself. D, F. |
| `binding.slot-census-complete` / binding | Inspect the resolved consumer's full declared slot list and binding records for the relevant slot. | Missing binding differs from explicit optional `[]`; duplicate slot identities cannot be silently overwritten. Gap: a completed slot lookup may prove unknown-slot, so absence is not an upstream failure. N, D, F. |
| `binding.provider-census-complete` / binding | Retain every provider occurrence and classify it against the declaration identity census before selection, capability and compatibility checks. F's independent-SCC partition keeps this fact valid despite an unknown provider. | Valid does not mean every provider exists. Do not discard duplicate occurrences before cardinality accounting or add edges from a partially invalid binding. Gap: other mixed-state transitions must retain these exact observations. N, D, F. |
| `binding.reached-frontier-complete` / graph | Traverse consumer to provider from selected roots; every reached consumer must have its complete valid outgoing binding frontier. | An incomplete reached frontier suppresses every currently unproved unreachable conclusion. An unrelated invalid frontier does not suppress a positive SCC. D, F, G. |
| `graph.selected-node-census-complete` / graph | Establish selected implementation nodes from declaration/selection evidence, preserving uncertainty rather than choosing ambiguous selections. | Used by SCC, depth and reachability. Gap: F's duplicate-selection partition does not define all node-resolution cases; do not replace this fact with whole-profile success. D, F. |
| `graph.positive-edge-subgraph-complete` / graph | Inspect all relevant bindings; construct the subgraph of wholly valid bindings, then deduplicate provider-to-consumer adjacency pairs. | Invalid unrelated bindings may be excluded while this fact remains valid. Positive SCC evidence survives; this does not prove a complete reachability frontier. D, F, G. |
| `output.plan-eligible` / output | No current diagnostic or named-limit row in F consumes this fact. Its supplied partitions keep it valid even when errors are emitted. | Gap: there is no accepted derivation equating this flag with compiler success. Do not use it as the sole success gate or introduce a seventeenth error. N/D instead forbid plan and digest after any diagnostic. F. |
| `output.diagnostic-stream-complete` / output | Finish all eligible independent candidate generation, normalization and deduplication before finalizing the bounded collector. | Hitting K+1 is not completion. Continue counting omitted candidates with saturation; internal platform failure rejects rather than fabricating a compiler diagnostic. D, F. |

## Partially invalid input: the unit matters

1. A failed raw or schema declaration document is not a partial declaration.
   Its apparently readable IDs/slots do not enter semantic lookup. Retain its
   failure locator, continue other documents, and withhold absence claims whose
   relevant census cannot be completed.
2. A schema-valid profile with a semantically invalid binding is different.
   Do not discard the entire profile or stop at the first binding error.
   Validate independent rows and preserve already proven positive facts.
3. Within one binding, a valid provider reference next to an unknown reference
   is not a partially usable edge set. G's
   `invalid-reference-suppresses-only-dependent-reachability` makes that binding
   graph-inert. Record its provable error; do not manufacture reachability from
   its surviving references. Other wholly valid bindings can still prove SCCs.
4. A duplicate selection and a wrong implementation on one row can both be
   proved. Neither a whole-profile abort nor last-row-wins is permitted.
   Repeated binding *records*, unlike repeated provider occurrences, remain
   outside M1's claimed domain pending the separate decision.

### M1 error-combination worksheet

This table fixes the implementation handoff at the observable boundary. A
"failed condition" is the positive evidence that creates the named candidate;
it is not an extra fact ID. Where the accepted sources do not distinguish
`invalid` from `unavailable`, the table does not choose between them: both
states suppress the same dependent candidate under F.

| Situation | Knowledge state | Diagnostics that remain eligible | Suppressed derivatives | Accepted rule |
| --- | --- | --- | --- | --- |
| One declaration document is schema-invalid | That document's `document.schema-valid` is `invalid`; semantic facts from it are `unavailable`. Relevant batch identity/module censuses cannot support negative absence claims. Other admitted documents remain independent. | Its structural schema diagnostic. Positive failures from other valid documents still continue. | Unknown module/implementation/root claims that depend on the incomplete census; all slots, capabilities and edges apparently read from the invalid declaration. | D: failed documents contribute no semantic facts and negative claims require a complete census. F: schema candidate prerequisites and census-dependent rows. |
| Two selection rows select one module and one row names an implementation owned by another module | `profile.selection-census-complete` is `valid`; `profile.selection-uniqueness` is `invalid`. F's exact partition keeps both declaration censuses and the selected-node/edge facts `valid`. | `profile.duplicate-selection` and the independently proven `profile.implementation-mismatch`. | No candidate in the exact partition. Never choose either row to build a successful plan. | F: `diag.object.duplicate-selection-with-mismatch.v1`; D: no first/last-row wins and any diagnostic forbids plan/digest. |
| A binding names a consumer absent from a complete declaration identity census | `declaration.identity-census-complete` is `valid`; the consumer failed condition is proven. `binding.consumer-census-complete` is non-valid for that binding, so its slot/provider derivatives are unavailable. | `binding.unknown-consumer`; diagnostics for other bindings. | Unknown-slot, provider, cardinality, capability, compatibility and graph-edge candidates for that binding. | F: unknown-consumer prerequisites omit the consumer fact; dependent binding rows require it. |
| A binding has a known consumer but an absent slot | Consumer knowledge is `valid`; the slot failed condition is proven. `binding.slot-census-complete` is non-valid for that binding. | `binding.unknown-slot`; diagnostics for other slots/bindings. | Provider, cardinality, capability, compatibility and graph-edge candidates for that record. | F: unknown-slot prerequisites stop before the slot fact; dependent rows require it. |
| A known consumer/slot contains an unknown provider | Consumer and slot facts are `valid`. F's independent-SCC partition keeps `binding.provider-census-complete` `valid`; the provider occurrence is still a failed condition. It makes `binding.reached-frontier-complete` non-valid only if traversal reaches this consumer; an unreached consumer's invalid binding does not invalidate the reached frontier. | `binding.unknown-provider`; an SCC proven entirely by other wholly valid bindings; unreachable-selection diagnostics when the reached frontier remains complete. | No edge from the partially invalid binding; reachability conclusions that need its frontier. Do not additionally classify the same absent provider as merely not selected. | F: `diag.object.independent-scc-with-invalid-edge.v1`; D/G: positive-valid-binding graph and complete reached frontier are separate. |

The closed facts do not expose a separate "consumer exists" or "slot exists"
fact. For the two absence rows above, F determines the emitted and suppressed
candidates but does not distinguish whether an implementation stores the
dependent fact as `invalid` or `unavailable`. That private choice is not an
observable M1 contract and must not change the complete diagnostics shown in
the corpus. Repeated binding records remain outside this worksheet.

## Cycles and depth are different questions

Use provider-to-consumer adjacency for SCC and execution order, and its reverse
view for root closure. Preserve ordered provider references in plan bindings;
deduplicate only adjacency pairs. Every nontrivial SCC and self-loop is a
cycle. Sort members and then components lexicographically, not by discovery
order. Failure returns no partial plan or digest.

N defines graph depth as the number of implementation nodes on a longest path
in an acyclic graph; a single node has depth 1. I closes the former mixed-cycle
gap: remove every node in a nontrivial cyclic SCC or self-loop and all incident
edges from the positive-valid-binding graph, then calculate `graphDepth` on the
residual DAG. Do not assign a depth to a cycle and do not use `0`, `Infinity`,
a partial Kahn traversal count, or condensed-SCC depth. Preserve cycle
diagnostics, and independently emit the depth-limit diagnostic when the
residual DAG exceeds 2048 nodes; its reported actual is capped at 2049.

## Independent examples and what they prove

The [example corpus](../../tests/qualification/compiler-engineer/examples.json)
contains complete trusted JSON-shaped inputs and hand-authored expectations.
Only the fixture's input setup may freeze values; it never computes expected
outcomes from an implementation. Historical wire discriminators are retained
because S is accepted, not because a second API generation is being created.

Each case names its asserted surface. A plan projection or a required
diagnostic is not a claim that complete diagnostics, digest bytes, or carrier
conformance have been tested. The former cyclic-depth combination is fixed by
I, but this corpus remains fixture-only evidence until the dedicated
implementation-clarification cases exercise a real subject. Existing
canonical/digest and collector vectors remain authoritative; this corpus does
not replace them.

| Case | Independent expectation |
| --- | --- |
| `optional-empty` | One explicit binding with `[]` is valid and remains in the plan. |
| `optional-missing` | Omitting that record yields `binding.missing`, not optional absence. |
| `many-zero` | `min: 0` permits zero providers; the binding still exists. |
| `many-minimum` | The inclusive minimum permits one provider in the example. |
| `many-maximum` | The inclusive maximum permits two; profile order survives normalization. |
| `many-overflow` | Three providers against max 2 yield actual cardinality 3. |
| `many-duplicate` | Repeating one provider is a duplicate, even within numeric bounds. |
| `cycle-with-tail` | The SCC excludes the downstream tail; no invented numeric cyclic depth. |
| `hostile-slot-names` | `constructor` and `then` are legal local tokens, not prototype lookups or callbacks. |
| `invalid-declaration-suppresses-absence` | A schema-invalid declaration emits its structural failure without inventing unknown root/module/implementation diagnostics from an incomplete census. |
| `renamed-unknown-declaration-field` | Changing the unknown key preserves the complete failure and the safe `declarations/0` locator; neither spelling enters the path. |
| `duplicate-selection-with-mismatch` | F's exact partition retains both independently proven profile diagnostics; no selection row wins. |
| `unknown-binding-coordinates` | Unknown consumer, slot and provider failures on independent records retain their exact closed coordinates and comparator order. |
| `partial-binding-with-independent-cycle` | A mixed valid/unknown provider record contributes no partial edge, while a wholly independent SCC remains reportable. |
| `unreached-invalid-binding-preserves-unreachable` | An invalid binding on an unreached selected consumer retains both its unknown-provider diagnostic and the independently proven unreachable-selection diagnostic. |
| `frozen-input` | Proposed-only freeze setup; the candidate plan equals the unfrozen companion, but no accepted result is asserted. |

For the hostile-name case, `__proto__` is a separate **invalid token**, not a
legal lookup test. An engineer must reject it under S without echoing it into
a diagnostic field path. A valid identifier named `constructor` must not be
rejected just because a JavaScript object prototype has a property with that
name. Use owned-key checks or maps for lookup, without introducing a container.

I now accepts synchronous no-alias snapshotting for the cooperative Host-owned
outer wrapper, lists and nested object graph within the admitted domain. It
does not accept proposed ADR-0013 as a whole or resolve OD-005's raw-carrier
cells. The existing frozen case still carries `candidateExpectation`, not an
accepted complete compiler result. Checking a frozen fixture proves its setup,
not snapshot timing; that requires a real subject test.

The [qualification supplement](../../architecture/qualification/implementation-clarifications/contract.json)
and its sibling `cases.json` pin complete mixed-graph failure results and raw
scalar numeric-admission projections. Those artifacts remain fixture-only
evidence and never count as Core source or production conformance by themselves.

Run `node --test tests/compiler-engineer-examples.test.mjs` to check corpus
shape, accepted input/plan schemas, exact case inventory, authority links and
freeze setup. This is **fixture consistency**, not compiler conformance: there
is no production subject. Later feed the same literal inputs to the private
M1 subject and compare the stated projections without importing a checker
implementation. Add complete result comparisons only where their authority is
settled. No new public runner/subject API is needed for that work.
