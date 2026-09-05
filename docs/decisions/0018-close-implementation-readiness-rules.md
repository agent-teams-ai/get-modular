---
id: ADR-0018
type: adr
status: accepted
owner: architecture
summary: Fixes residual graph depth, exact raw integers, emittable diagnostic types, trusted carrier limits and post-M3 publication gates.
approved_by: product-owner
accepted_at: 2026-09-05
related:
  - ADR-0004
  - ADR-0005
  - ADR-0006
  - ADR-0007
  - ADR-0008
  - ADR-0009
  - ADR-0012
  - ADR-0013
  - ADR-0014
  - ADR-0017
  - ARCH-CURRENT-CONTRACT
  - ARCH-MVP-IMPLEMENTATION-ROADMAP
---

# ADR-0018: Close implementation readiness rules

## Context

The product owner selected all five recommended alternatives on 2026-09-05
after the architecture and phased-MVP review. The remaining ambiguity concerns
exact failure outcomes, public types, trust guarantees and the generated
archive's publication gate. Resolving it before the corresponding code avoids
inventing these rules independently in the compiler, consumer and harness.

There is no production Core subject yet. This decision accepts the rules and
independent fixtures, not execution evidence for a compiler or permission to
expose the rest of proposed ADR-0013 or ADR-0014.

## Decision

### Residual graph depth

Use the existing selected-node census and positive-edge subgraph of wholly
valid bindings. Preserve the prerequisite row for `graphDepth`: both
`graph.selected-node-census-complete` and
`graph.positive-edge-subgraph-complete` must be valid. No new fact, diagnostic
code or configurable rule is introduced.

Find every cyclic SCC, including a singleton with a self-loop. Emit its
`graph.cycle` diagnostic under the existing member ordering and collector
rules. For depth only, remove every node of those SCCs and every incident edge.
The induced residual graph is a DAG. Measure implementations on its longest
path, with an isolated node at one. An empty residual graph has no depth-limit
candidate; do not serialize a depth for the cyclic graph itself.

The measurement covers the complete residual selected graph, including
unreachable selected nodes, just as the acyclic selected-graph rule did. A path
may remain after a cycle is removed even when it was connected to that cycle.
Never splice across a removed node, count an SCC as one node, use a partial
Kahn traversal, or search for longest simple paths inside a cycle. The original
semantic graph, reachability and cycle diagnostics are unchanged.

The limit remains 2048 and an exceeded `actual` saturates at 2049. A separate
two-node cycle and an independent 2049-node chain produce, in order, the
graph-phase `input.limit-exceeded` with empty path/coordinate and
`details: {limitName: "graphDepth", limit: 2048, actual: 2049}`, then the
`graph.cycle` record. A 2048-node companion produces only the cycle. No failure
returns a plan or digest. Independent diagnostics remain eligible even when a
cycle exists; missing prerequisites still suppress dependent candidates.

### Exact raw numeric values

A syntactically valid JSON number is admitted as a numeric value only when
its exact decimal mathematical value is an integer in
`[-9007199254740991, 9007199254740991]` and is not negative zero. Determine
that before converting to JavaScript `Number`. The ordinary schema then checks
the field's narrower bounds or constant; numeric admission is not schema
success. Invalid JSON number syntax remains `decode.invalid-json`.

`1`, `1.0`, `1e0`, and `10e-1` all represent the accepted value 1.
`1.0000000000000001`, `1e-400`, and their negative companions are non-integers,
not rounded integers or zero. Non-integers emit `schema.invalid-value` with
`invalid-type`; exact integers outside the safe range and every negative-zero
spelling emit the same code with `invalid-format`. Positive zero with a decimal
point or exponent is accepted. Preserve the existing schema-phase path,
redaction, prerequisite and document-failure rules, with no decoder diagnostic
for otherwise valid numeric syntax.

The raw scanner keeps enough lexical information to enforce this policy before
precision loss. Bound scanning by the existing document budgets; compare sign,
significant decimal digits, trailing zeros and exponent with saturating length
counters. Do not expand an exponent into a digit buffer or allocate an
unbounded BigInt. The object entry checks the Number value actually supplied;
it cannot recover an earlier source lexeme. Both boundaries converge on the
same admitted integer values, while raw input rejects lossy representations.

### Emittable public diagnostic types

`DiagnosticCode` is exactly `Diagnostic['code']`: the closed set of emittable
codes in the effective diagnostic contract, in catalog order. Reserved codes
are excluded. `Diagnostic` remains the corresponding discriminated union with
per-code details. Hosts can write total maps over exactly the reachable codes.
No `DiagnosticCatalogCode` or additional root export is introduced.

`output.canonicalization-failed` stays historical, reserved and non-emittable.
An internal canonicalizer, hash or platform failure rejects the Promise as
ADR-0007 requires. It does not resolve to a diagnostic and receives no new
serialized rejection shape. A later accepted diagnostic generation extends
the public union only with its emittable codes, in the same release as its
successor evidence. Packed type tests must reject the reserved string, catch
a missing real map key, and permit exhaustive narrowing on `Diagnostic.code`.

### Trusted carriers and bounded compiler work

The object graph and the invocation record/declaration list of both entry
points are cooperative, bounded, Host-created data in a trusted realm. The
raw payload may contain hostile bytes; its outer JavaScript wrapper and list
are not hostile executable objects. Core is not responsible for safely
serializing an arbitrary Proxy into bytes. That conversion or isolation
belongs to the upstream trust boundary.

Within the admitted domain, retain synchronous owned snapshotting before any
asynchronous boundary, no retained caller aliases, iterative traversal,
occurrence accounting, saturating counters and bounded diagnostic retention.
Reject observable disallowed properties without invoking getters. Native
own-key/descriptor reflection can allocate a whole key list or descriptor
table before Core can inspect its size; these intrinsic temporary allocations
and the caller's existing graph are outside a portable hard peak-heap budget.
Core must still avoid proportional downstream allocation after rejecting a
dimension. No fixed wall-time, process-wide heap ceiling, arbitrary Proxy
trap safety or universal Proxy detector is promised.

Raw document and aggregate byte limits apply before copying or decoding the
payload after carrier classification. This policy does not select the proposed
detached/resizable/shared/cross-realm classification outcomes, descriptor
algorithm, new carrier error, or wrapper-shape diagnostics in ADR-0013. OD-005
remains open and its full carrier successor is still required before raw
exposure. This trust-envelope clarification applies to the existing M1 object
entry without making the rest of ADR-0013 normative.

### Publication after self-composition

The following gates bind the exact pack-once production archive. Every row
retains ADR-0003 preconditions, ADR-0012 exports and Node/TypeScript consumer
checks, the four TypeScript modes and type-scale fixture, archive/declaration
audits, honest support limitations and exact registry read-back.

| Publication or claim | Additional required evidence |
| --- | --- |
| Pre-M3 direct `0.x not-claimed` | Complete substantive M1 direct compiler; label direct assembly as ADR-0017 requires |
| Post-M3 generated `0.x not-claimed` | Complete M3 finite-construction gate: P0/P1 plan/digest equality, W0/W1 tuple equality, static and behavioral witnesses, independent vectors on both subjects, clean/poisoned bootstrap, no concrete fallback, no caller-time bootstrap and generated-only archive closure |
| `runtime-conformant` or `release-eligible` | The full accepted runtime matrix, required resolved semantics and promotion authority; release custody remains separately governed |

Passing a publication row does not itself assert `runtime-conformant`,
`self-composed-qualified` or `release-eligible`. Post-M3 production remains
generated stage1 only; direct stage0 is qualification-only. Reuse evidence only
for unchanged bound inputs and the exact archive; a failed relevant check
blocks that publication. Never repack inside a platform job.

### Ownership and applicability

Clean Architecture, SOLID, DDD and DRY follow the existing Feature Module
Standard mapping: one owner for composition semantics, feature-owned rules,
consumer-owned ports, immutable inert data and one composition root. Domain
logic stays independent from codecs, hashes, tooling and product lifecycle.
Replaceable adapters obey the same contract and independent vectors. Each
domain rule has one implementation owner; independent test oracles are
intentional duplication of evidence, not a second runtime authority.

This decision adds no module, shared platform, service locator, public
generator, generic policy engine or ceremonial layer. M1 implements the
accepted object, diagnostic-type and depth rules. Raw-number policy joins the
existing M2 carrier/duplicate-record acceptance transaction. The current
owner-start record keeps its M1 scope; expansion to M2, generated construction
claims or another package still updates that record and its closed checker
together before the affected work. This decision does not start implementation
or authorize a publication or merge action in this change.

### Precedence and evidence

This decision narrowly supersedes:

- ADR-0006's acyclic selected-graph depth definition, only by defining the
  residual measurement for cyclic inputs above. ADR-0007's independent-fact
  policy and existing depth prerequisites continue unchanged.
- The ambiguous safe-integer wording of ADR-0004/0006/0007, only for raw
  numeric lexemes before Number conversion and the exact outcomes above.
- ADR-0009's inclusion of every catalog code in `DiagnosticCode`, replacing
  it with the emittable subset. All other names and evolution rules survive.
- Allocation-before-rejection wording in ADR-0005/0006/0007, only to separate
  unavoidable trusted-carrier reflection from Core's own bounded work. It
  does not relax payload byte limits, snapshot ownership or retained bounds.
- The publication half of ADR-0007's runtime-coverage gate and ADR-0017's
  pre-self-composition-only limitation, extending the Node/TypeScript path to
  post-M3 `not-claimed` archives only with the full M3 gate above. ADR-0008's
  construction, generated-only distribution and reversal requirements survive.

The accepted base schema, diagnostic catalog, seventeen facts, code rank,
resource profile and old qualification ledger remain byte-identical.
`architecture/qualification/implementation-clarifications/contract.json`
is one closed additive supplement, not a selectable profile or arbitrary
overlay engine. Its `cases.json` pins complete diagnostic results for the
mixed cycle/depth recipes and numeric-admission projections with their exact
asserted scope. The checker verifies custody, fixture consistency and negative
mutations; it does not execute an absent production compiler. The affected
M1/M2/M3 subject gates must execute these cases before their respective claims
or publications. Generation 2 must carry these rules forward without creating
a separate raw-number or resource-profile generation.

The implementation clarification ledger `architecture/authority/implementation-clarifications-ledger.json` is anchored as `sha256:9a813cd8b7b7fe26d249569d02b25710c3f47895b330ad0858a68c483aa7c345`.

## Consequences

- Implementers have one chosen rule for each reviewed ambiguity.
- The diagnostic type is smaller; malformed raw numbers fail without rounding.
- Useful cycle/depth failures coexist at linear graph cost.
- Trusted object ergonomics survive with explicit, achievable guarantees.
- Generated delivery retains full construction proof without making every
  `not-claimed` release a cross-runtime conformance promotion.

## Rejected alternatives

- Suppress depth globally on any cycle, or discard the entire connected
  component: both hide independently provable over-depth paths.
- Round raw values first, or reject all decimal/exponent spelling: the former
  loses values and the latter rejects exact integer representations needlessly.
- Export a second catalog type, or force an impossible host-map branch:
  neither has a current consumer requirement.
- Replace the raw signature or introduce one combined byte envelope: the
  trusted Host wrapper already supplies a clean boundary at lower cost.
- Require all runtime/custody gates before every generated `not-claimed`
  release: the full M3 and packed Node/TypeScript gates cover its stated scope.
