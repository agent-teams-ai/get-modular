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
| `document.schema-valid` / document | Validate the whole admitted value against the relevant S definition and accepted plain-value/identity rules. | A schema-invalid declaration supplies no partial semantic record. A schema-valid record may still fail semantic checks, such as `many.min > many.max`. N, D, S. |
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

## Cycles and depth are different questions

Use provider-to-consumer adjacency for SCC and execution order, and its reverse
view for root closure. Preserve ordered provider references in plan bindings;
deduplicate only adjacency pairs. Every nontrivial SCC and self-loop is a
cycle. Sort members and then components lexicographically, not by discovery
order. Failure returns no partial plan or digest.

N defines graph depth as the number of implementation nodes on a longest path
in an **acyclic** selected graph; a single node has depth 1. It does not define
`0`, `Infinity`, a partial Kahn traversal count, or condensed-SCC depth for a
cyclic graph. Compute ordinary depth only once the measured graph is known to
be acyclic. Preserve a positive cycle diagnostic even with unrelated invalid
bindings. Whether an independently over-depth acyclic region also produces a
depth-limit diagnostic in a cyclic world is still an explicit qualification
gap, not a numeric golden hidden in a helper.

## Independent examples and what they prove

The [example corpus](../../tests/qualification/compiler-engineer/examples.json)
contains complete trusted JSON-shaped inputs and hand-authored expectations.
Only the fixture's input setup may freeze values; it never computes expected
outcomes from an implementation. Historical wire discriminators are retained
because S is accepted, not because a second API generation is being created.

Each case names its asserted surface. A plan projection or a required
diagnostic is not a claim that complete diagnostics, digest bytes, or carrier
conformance have been tested. In particular the cyclic-depth case leaves the
undefined depth combination open. Existing canonical/digest and collector
vectors remain authoritative; this corpus does not replace them.

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
| `frozen-input` | Proposed-only freeze setup; the candidate plan equals the unfrozen companion, but no accepted result is asserted. |

For the hostile-name case, `__proto__` is a separate **invalid token**, not a
legal lookup test. An engineer must reject it under S without echoing it into
a diagnostic field path. A valid identifier named `constructor` must not be
rejected just because a JavaScript object prototype has a property with that
name. Use owned-key checks or maps for lookup, without introducing a container.

The frozen-input admission rule is still in
[proposed ADR-0013](../decisions/0013-close-trusted-object-and-raw-carrier-semantics.md).
That record carries `candidateExpectation`, not an accepted `expected` result.
Checking a frozen fixture proves its setup, not snapshot timing: N's separate
mutation-after-invocation rule still needs a real asynchronous subject test.

Run `node --test tests/compiler-engineer-examples.test.mjs` to check corpus
shape, accepted input/plan schemas, exact case inventory, authority links and
freeze setup. This is **fixture consistency**, not compiler conformance: there
is no production subject. Later feed the same literal inputs to the private
M1 subject and compare the stated projections without importing a checker
implementation. Add complete result comparisons only where their authority is
settled. No new public runner/subject API is needed for that work.
