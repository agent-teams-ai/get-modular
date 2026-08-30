---
id: ADR-0007
type: adr
status: proposed
owner: architecture
summary: Adds discriminated diagnostics, independent canonicalization checks, exact boundary vectors, and the corrected deterministic complexity target before V1 implementation.
related:
  - ADR-0004
  - ADR-0005
  - ADR-0006
  - GM-REQ-V1
  - OD-002
  - OD-003
---

# ADR-0007: Require executable V1 conformance amendments

## Context

Independent security, architecture, and developer-experience reviews of the
accepted V1 contract found that several narrative guarantees were not yet
executable. The base schema closes diagnostic code names but does not constrain
each code's phase, coordinate, path, and detail shape. Existing canonical
vectors hash checked-in text without independently proving RFC 8785 output.
Resource tests exercise representative graphs but do not cover every exact
limit and limit-plus-one outcome. The deterministic topological tie-break and
raw-byte entry point are now clarified by ADR-0006, but their evidence must be
portable and independently consumable before production packages claim V1
conformance.

The accepted artifacts under `architecture/contracts/v1` remain immutable.
This successor decision adds a versioned qualification layer instead of
rewriting ADR-0004, ADR-0005, or their contract ledger.

## Decision

### Additive qualification authority

While this decision is proposed, the artifacts under
`architecture/qualification/v1` are draft qualification evidence. They do not
amend the accepted base contract, promote the baseline, or authorize a
production-conformance claim. If this decision is accepted, they become
normative amendments when read together with the immutable base contract.
Their byte identities are recorded in
`architecture/authority/v1-qualification-ledger.json`, anchored as
`sha256:6f9625a3ba44837b6c03ab7a76192cc907636e476f110d07aa4cbd32b93848de`.

`qualification-case-manifest.json` records decoder and canonicalization case
categories, exact source, repair, and canonical byte identities, and the mapping
from every immutable base canonical-negative name to its complete successor
case. A closed development-only checker fixes the allowed category and accepted
fault-to-successor tuples and verifies artifacts whose byte identities are
recorded in the separate ledger; it does not create, repair, or replace
authority. Relabeling manifest rows and refreshing hashes cannot self-certify
changed evidence.

The repository gate must validate both ledgers. A future revision creates a new
artifact version and successor ADR; it never mutates an accepted ledger or
artifact in place.

### Closed diagnostic algebra

`diagnostic-contract.json` is the discriminant authority for every V1
diagnostic code. For each code it fixes:

- allowed phase or the exact limit-to-phase mapping;
- required and allowed semantic-coordinate fields;
- empty, structural, or limit-specific path policy;
- exact detail keys and any closed reason values;
- the total comparator for phase, code, coordinate, path, and RFC 8785 detail
  bytes.

`diagnostic-snapshots.json` contains one complete valid record for every code
and ordering permutations. It executes every adjacent phase and code rank. The
total comparator covers phase, code, every
coordinate field's absence or presence and value, every path segment's kind and
value, path-prefix length, and decisive differences at path positions one, two,
and the maximum supported depth. Exact nested and Unicode cases pin the RFC
8785 UTF-8 detail bytes. Every
ordering operand must pass both the accepted base diagnostic schema and this
refinement. Axis witnesses keep all higher axes equal, and dominance witnesses
make a lower axis oppose the decisive higher axis. Unknown codes, phases,
coordinate fields, detail fields, or reason values fail conformance. Empty path
policy means exactly an empty array. Structural path policy means at least one
validated path segment. Only `input.limit-exceeded` may select a limit-specific
policy through `details.limitName`; every other code executes its exact empty or
structural policy, and an absent policy always fails.

A `graph.cycle` component contains unique implementation IDs in ascending ASCII
order. Qualification derives components independently from directed graph-edge
fixtures, including a self-cycle, reciprocal multi-member cycles, a one-way
non-cycle, and disjoint components. Parallel edges with distinct IDs and equal
endpoints are legal and are deduplicated when adjacency is derived. Every node,
edge, and traversal permutation, including the parallel edge, must derive the
same membership. Component arrays use lexicographic member-array order with a
shorter equal prefix first.

The diagnostic definition embedded in `composition.schema.json` remains a base
shape. Where it is less restrictive, the standalone diagnostic contract is the
normative refinement. Implementations must satisfy both.

The `profile.unknown-implementation` refinement continues to require
`implementationId` and permits normalized `moduleId` as optional context. That
closed optional field lets the comparator exercise both absent and present
`moduleId` operands without making either operand invalid.

### Independent canonicalization and normalization

Every canonical vector is recomputed by two independent development-only RFC
8785 implementations, initially `canonicalize` and `json-canonicalize`. Both
must equal the checked-in UTF-8 string byte for byte before SHA-256 is checked.
Neither package type or API enters `@get-modular/core`.

`canonicalization-vectors.json` covers object ordering, JSON escaping, Unicode
property ordering, RFC number spelling, and safe-integer boundaries.
`normalization-vectors.json` covers declaration and profile permutations,
multiple roots, branching dependencies, explicit `many` order, the
lexicographically smallest topological order, canonical envelope bytes, and the
domain-separated digest.

The deterministic heap tie-break in ADR-0006 changes the implementation target
from the simplified bound in ADR-0005 to:

```text
O(B + (V + E) log V + D log K)
```

`B` is the admitted raw input bytes, `V` selected implementations, `E` provider
references, `D` candidate diagnostics, and `K` the fixed diagnostic cap. A
future linear ready-set implementation is allowed only when it preserves the
same exact order.

### Decoder and resource boundaries

`decoder-vectors.json` fixes one-document framing, strict UTF-8, duplicate-key
rejection, comments, trailing commas, trailing root values, and malformed byte
sequences. Every malformed non-EOF UTF-8 category is exercised inside a JSON
string; replacing only the authoritative malformed sequence with one valid
scalar must make JSON syntax valid. Separate true two-, three-, and four-byte
EOF truncations cannot be otherwise-valid framed JSON, but still execute fatal
UTF-8 before JSON parsing. An accepted control contains valid two-, three-, and
four-byte scalars. A UTF-8 BOM is rejected. Lone-surrogate
escapes and negative zero are valid JSON tokens but fail later semantic
validation.

Every repaired negative binds one exact fault identity and has exactly one
semantic fault before its exact one-span byte repair and zero afterward. The
repaired result must pass the accepted schema and semantic checks. The
negative-zero case uses a numeric field where positive zero is valid, and the
lone-surrogate evidence includes a high surrogate at the end of a string. An
unrelated schema defect in both the source and repair cannot satisfy the
evidence.

The first decoder spike uses `jsonc-parser` only through `createScanner` and
`visit`, behind a replaceable internal adapter. It checks bytes and fatal UTF-8
first, performs an iterative depth preflight before the library's recursive
visitor, keeps one decoded-key set per open object, validates surrogate pairing
and saturating string counters, and materializes values only in a second pass
after the complete batch succeeds. `jsonc-parser.parse`, parser error text, and
package types cannot enter the public API. If the browser/worker, fuzz, boundary,
or redaction gates fail, the fallback is a small independently reviewed
iterative scanner under the same vectors, not a weakened contract.

`resource-boundary-vectors.json` covers every named V1 limit at the accepted
value and at value plus one. Development-only qualification constructs bounded
fixtures for every row and meters the resulting structure with an independent
oracle. These outcomes are static qualification of fixture construction and
oracle expectations; they are not production-subject execution or
packed-subject enforcement. The aggregate-string boundary fixtures contain
repeated decoded object-key and string-value occurrences with multi-byte Unicode
scalars at both the accepted 8 MiB limit and limit plus one. Their oracle counts
the UTF-8 bytes of every key and value occurrence; explicit UTF-16-code-unit and
value-only mutations must disagree with both boundaries.
It also fixes inclusive `many` ranges and semantically rejects `min > max`
without changing the immutable accepted schema, rejects duplicate provider
identities, and distinguishes 256
ordinary diagnostics from the 257-failure truncation case. The phrase
"container-count limits" in ADR-0006 means the explicitly named structural
limits only; V1 introduces no unnamed container-count limit.

Bounded diagnostic evidence streams structured diagnostics through the one
normative comparator and retains at most `K` candidates. It fixes the exact
retained evidence IDs across ascending, reverse, and stride permutations: 256
failures retain all 256 without truncation, while 257 retain the first 255 and
report `omitted: 2`. A reverse-order 258 case requires replacement after
`K + 1`, so collectors that stop considering later candidates fail. Additional
cases fix the exact omitted value at its schema
maximum and its saturating behavior above that maximum.

These vectors are contract evidence, not a substitute for executing the same
cases against a production subject. A package may be implemented while the
repository profile remains `not-claimed`, but it cannot claim V1 conformance or
be published as conforming until every applicable vector executes against the
packed artifact on the supported runtime matrix.

### Conformance subject and runtime matrix

`@get-modular/conformance` exposes fixtures plus one structural subject and
runner boundary:

```ts
interface V1ConformanceSubject {
  compileCompositionV1(input: {
    readonly declarations: readonly unknown[];
    readonly profile: unknown;
  }): Promise<CompileCompositionV1Result>;

  compileCompositionJsonV1(input: {
    readonly declarations: readonly Uint8Array[];
    readonly profile: Uint8Array;
  }): Promise<CompileCompositionV1Result>;
}

declare function runV1Conformance(input: {
  readonly subjectLabel: string;
  readonly subject: V1ConformanceSubject;
}): Promise<V1ConformanceReport>;
```

The report contains the contract version, subject label supplied by the caller,
case IDs, pass or fail status, bounded failure evidence, and aggregate counts.
It contains no credentials, absolute paths, stack traces, or implementation
objects. The runner does not discover implementations, load plugins, or create
a lifecycle authority. Core remains independent from conformance.

The first V1 conformance claim requires the same packed subject and vectors on:

- Node.js 24 on Linux, macOS, and Windows;
- the Chromium build pinned by the repository's exact browser-test dependency,
  in a browser window;
- the same pinned Chromium build in a dedicated worker.

The report records Node, operating-system, browser, and package versions.
Electron is covered by the Node and Chromium surfaces plus one packed smoke on
the exact Electron release used by a Desktop product. A future WASM or
non-JavaScript implementation must run the portable vector subset through its
own adapter before making a claim. Runtime coverage is a publication and
conformance gate, not a blocker to writing the first source package.

### Product navigation and production admission

`owner.authority` is allocated by the owning product or repository;
`owner.path` is a logical feature route, not a filesystem path. Get Modular
validates their portable syntax but does not resolve source files. Build tooling
may generate an AI-readable inventory by joining declarations with the
product's package catalog. The generated inventory is derived navigation, not
an identity authority, registry, or runtime discovery mechanism. Collisions in
`(moduleId, implementationId)` remain compiler failures regardless of inventory
source.

The repository's `not-claimed` feature-profile state means only that structural
conformance has not yet been proven. It must not prohibit creation of the first
production package. Open implementation decisions remain enforced separately
by the governance gate. Promotion to a conformance claim requires production
source boundaries, positive and negative fixtures, packed-artifact execution,
and an accepted promotion decision.

## Consequences

- Implementers receive exact byte, graph, diagnostic, and runner handoff rules
  without adding a loader, DI container, plugin host, or lifecycle framework.
- Independent JCS libraries and executable vectors reduce correlated oracle
  mistakes, at the cost of development-only dependencies and more CI work.
- The first package can now be built under an honest `not-claimed` state, while
  publication remains fail-closed on cross-runtime conformance.
- Owner metadata stays product-neutral; source navigation remains a generated
  product concern rather than leaking repository paths into portable plans.

## Rejected alternatives

- Modify accepted ADRs or the base contract ledger. That would erase history
  and violate immutable decision custody.
- Let the core generate expected conformance values. A shared defect could make
  implementation and tests agree incorrectly.
- Keep diagnostics as an open object keyed only by code. Different cores could
  expose different phases, coordinates, details, or sensitive values.
- Require structural conformance before any production file exists. That makes
  the first implementation impossible to admit and confuses evidence state with
  source admission.
- Claim every JavaScript host from Node-only CI. Portability is accepted only
  after the packed subject executes on the declared matrix.
