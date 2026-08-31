---
id: ADR-0009
type: adr
status: proposed
owner: architecture
summary: Uses one current pre-1.0 contract with unversioned public names and no parallel public API generations.
related:
  - ADR-0003
  - ADR-0004
  - ADR-0005
  - ADR-0006
  - ADR-0007
---

# ADR-0009: Keep pre-1.0 public API unversioned

## Context

The accepted contract was qualified before any production package or external
consumer existed. Its documents use `V1` consistently to preserve exact
evidence, but carrying that generation into every TypeScript export would make
the first implementation look permanently multi-versioned.

Get Modular is still pre-1.0. First-party consumers can move with breaking
changes, and there is no evidence that two public compiler generations must run
in parallel. We still need inert persisted profiles to identify their data
shape without evaluating executable code or guessing from object structure.

## Decision

- Before 1.0, `@get-modular/core` exposes one current public API. Public
  TypeScript functions and types do not carry generation suffixes. Use names
  such as `compileComposition`, `compileCompositionJson`,
  `CompileCompositionResult`, `ModuleDeclaration`, `CompositionProfile`,
  `CompositionPlan`, `Diagnostic`, and `PlanDigest`.
- Keep the already accepted unversioned authoring-helper names `defineModule`,
  `required`, `optional`, and `many`.
- Do not publish parallel `V1`, `V2`, or `V3` exports, versioned package entry
  points, compatibility aliases, or multiple compiler implementations during
  pre-1.0 development. A breaking change replaces the current 0.x contract and
  updates all first-party consumers in the same migration.
- Package SemVer is the public software compatibility signal. Accepted
  qualification records remain immutable historical evidence and are
  superseded by a new decision and evidence ledger when the current contract
  changes; they do not dictate production symbol names.
- Inert JSON records retain one numeric `schemaVersion` discriminator. It is a
  data-migration guard, not a request to keep multiple engine APIs alive.
  Declaration and profile authors, or product-owned generation tooling, supply
  the one current literal value. The four authoring helpers do not read,
  default, or alter `schemaVersion`; their accepted pass-through semantics stay
  unchanged. No second value is introduced without a concrete persisted-data
  migration requirement and a successor decision.
- Capability compatibility tokens are product-owned semantic identities. The
  core does not require `/v1`, `/v2`, or another generation suffix in those
  tokens.
- CI rejects public core exports whose names end in `V` followed by a decimal
  generation and rejects a second public compiler generation. Internal
  qualification file names may retain historical generation labels while they
  are immutable authority.
- This decision changes production naming only. It does not weaken the accepted
  validation, graph, diagnostic, resource, canonicalization, digest, or
  portability semantics.

### Precedence

When accepted, this decision supersedes ADR-0007 only for the prospective rule
that a changed pre-1.0 authoring-helper generation must use parallel versioned
exports. Before 1.0, a changed helper or compiler contract replaces the one
current unversioned export set in a coordinated package and first-party consumer
migration. The replacement still requires a successor decision, a new evidence
ledger, and all applicable packed-subject gates before publication. ADR-0007's
existing helper semantics and immutable qualification artifacts remain the
authority for the contract they record; this decision neither mutates them nor
relabels them as evidence for the replacement contract.

## Consequences

- Product code uses short stable names and has one obvious import path.
- Pre-1.0 breaking changes stay explicit in package releases and coordinated
  consumer migrations instead of accumulating compatibility layers.
- Persisted inert data remains self-describing enough to fail closed rather than
  relying on structural heuristics.
- Implementers need a mechanical naming map from immutable qualification terms
  to the unversioned production API.
- A future requirement to run multiple contract generations concurrently needs
  new evidence and a separate accepted decision.

## Rejected alternatives

- Publish generation-suffixed TypeScript exports from the first release. This
  creates permanent API clutter before a parallel-generation requirement
  exists.
- Remove every wire discriminator. Persisted profiles and plugin-provided inert
  declarations could not fail closed or migrate reliably after a format change.
- Mutate accepted decisions and ledgers to erase `V1`. They are immutable
  evidence; production naming is changed through this successor decision.
