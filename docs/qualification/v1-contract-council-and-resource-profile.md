---
id: QUAL-V1-CONTRACT
type: qualification
status: reviewed
owner: architecture
summary: Records the multi-critic V1 contract review, product inventory baseline, and executable resource-boundary evidence.
related:
  - ADR-0004
  - ADR-0005
  - GM-REQ-V1
  - OD-002
  - OD-003
---

# V1 contract council and resource profile

This is reviewed decision evidence, not a claim that a production compiler
already conforms. Production conformance begins only after independently owned
core and conformance packages exist.

## Hosted council

Eight isolated hosted workers reviewed the same exact Get Modular baseline
`c0df3df08528480359a083daef980a90217884ff` and Extension Foundation baseline
`5aa3da7ff6f5e202e65115e4712e3ef638895e10`. Each used `gpt-5.6-sol`,
`xhigh`, and fast mode with a distinct scope: API, packages, canonicalization,
compatibility, security, operations, minimalism, or MVP delivery.

Consensus was unanimous for:

- RFC 8785 JCS plus SHA-256;
- exact-match compatibility only in V1;
- one fixed measured resource profile;
- no loader, lifecycle, construction helper, service locator, or plugin host in
  the first production packages;
- no production implementation before the contract decisions are accepted.

Six workers preferred the scoped core/conformance split; one preferred an
unscoped runtime package and one preferred a single package. The product owner
selected the scoped split in ADR-0003. The council results are corroborating
review, not a vote or a substitute for executable vectors.

## Product inventory baseline

Read-only inventories were measured from exact `origin/main` revisions:

| Product | Revision | Feature directories | TypeScript files |
| --- | --- | ---: | ---: |
| Agent Runtime | `3e1b977d9ab6147eb702b62497bd0be62acb8cf7` | 26 | 191 |
| Orchestrator | `f68d3d391c32d6c58bb0b11b0736831e5057743b` | 4 | 51 |
| Frontend | `9a0bbc8f7e0827e13eada4340d0177a9a553504f` | 30 | 3,852 |

A feature is not automatically a runtime module. The count is a conservative
navigation baseline only. The V1 cap of 4,096 declarations is more than 68
times the combined current feature count and still bounds adversarial graphs.

## Executable boundary fixtures

`tests/qualification/v1-resource-profile.mjs` exercises iterative traversal at
the accepted limits. On Node.js 24.18.0, Darwin arm64, Apple M1 Max:

| Fixture | Nodes | Edges | Outcome | Observed time |
| --- | ---: | ---: | --- | ---: |
| Chain at depth limit | 2,048 | 2,047 | acyclic | 1.129 ms |
| Wide graph at declaration limit | 4,096 | 4,095 | acyclic | 0.874 ms |
| Layered dense graph | 4,096 | 258,048 | acyclic | 8.352 ms |
| Giant ring | 4,096 | 4,096 | cyclic | 0.292 ms |

A 65,536-candidate diagnostic storm retains 255 ordered diagnostics and one
truncation record. Timings are informative and not a conformance SLO; graph
sizes, bounded output, and pass/fail behavior are normative. CI must execute the
same fixtures on every supported release target.

## Package meaning

`@get-modular/conformance` follows the common industry use of *conformance
suite*: development-only tests that determine whether an implementation obeys
a protocol. Ordinary applications install `@get-modular/core` only. Adapter,
alternative implementation, and host authors install conformance as a
`devDependency`.

The conformance package may provide a default runner for core, but its expected
plans, canonical bytes, digests, diagnostics, and boundaries are independent
fixtures. It must never calculate its own expected values by calling the core
under test.

Package registry verification on 2026-08-30 identified `canonicalize@4.0.0`
(Apache-2.0) as the first JCS adapter candidate and
`json-canonicalize@3.0.0` (MIT) as the differential oracle. Neither is a public
contract or a production dependency yet.

## Exact-SHA adversarial review

Three independent hosted reviewers examined PR head
`be10802fa8e90a9608b7512019d6c9d825a782c8` with `gpt-5.6-sol`, `ultra`, and
fast execution. Security, architecture, and real-world developer-experience
reviews independently found the same contract gaps:

- plan-array and topological tie-breaks were narrative rather than executable;
- `many` allowed an invalid range and duplicate provider ambiguity;
- diagnostics did not form an exact discriminated algebra;
- the raw-byte compiler boundary and resource units were not fully specified;
- canonical checks hashed supplied text without independently producing JCS;
- the feature profile made the first production package impossible to admit.

ADR-0006 closes the semantic entry-point, normalization, cardinality, and
accounting rules. ADR-0007 adds immutable qualification artifacts, two
independent JCS oracles, strict decoder vectors, complete diagnostic snapshots,
exact boundary-plus-one cases, and the staged production-admission rule. The
new checks contain deliberate mutation tests so a weakened artifact or
validator fails CI.

A separate hosted parser review rejected every candidate as a direct raw-byte
drop-in. `jsonc-parser@3.3.1` (MIT, zero runtime dependencies) is admitted only
as the first internal spike candidate through `createScanner` and `visit`.
Production use requires fatal UTF-8 decoding, iterative depth preflight,
decoded-key duplicate detection, surrogate and string-byte validation, bounded
redacted diagnostics, two-pass materialization, browser-worker execution, and
fuzz or differential evidence. Its fault-tolerant `parse` object builder is
forbidden at the untrusted boundary.

## Reversal conditions

Revisit the decisions only when evidence shows at least one of:

- an accepted input cannot fit the fixed profile;
- two independent consumers require a compatibility relation that exact tokens
  cannot model;
- RFC 8785 cannot be reproduced on a supported target;
- bounded diagnostics cannot preserve the semantic coordinate needed to repair
  an error;
- the scoped package split causes measurable runtime or maintenance cost that a
  subpath export removes.
