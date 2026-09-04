---
id: ADR-0009
type: adr
status: accepted
owner: architecture
summary: Uses one current pre-1.0 contract with unversioned public names and no parallel public API generations.
approved_by: product-owner
accepted_at: 2026-09-04
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

- Before 1.0, `@get-modular/core` exposes one current public API. Its exhaustive
  runtime value exports are `compileComposition`, `compileCompositionJson`,
  `defineModule`, `required`, `optional`, and `many`. Its exhaustive type exports
  are `CompileCompositionResult`, `ModuleDeclaration`, `CompositionProfile`,
  `CompositionPlan`, `Diagnostic`, `DiagnosticCode`, and `PlanDigest`. No other
  root export is admitted without a successor decision and packed
  declaration-surface evidence.
- `DiagnosticCode` is the closed string literal union of the accepted
  diagnostic catalog codes in catalog order, and `Diagnostic` is a discriminated
  union over its `code` member whose `details` member narrows per code to the
  accepted diagnostic contract. Hosts write total translation maps against
  `DiagnosticCode`; TypeScript reports a missing code, and an unknown code at
  run time still fails closed. A new catalog generation extends the union in
  the same release that ships the successor evidence.
- The closed naming map is:

  | Accepted evidence name | Public name |
  | --- | --- |
  | `compileCompositionV1` | `compileComposition` |
  | `compileCompositionJsonV1` | `compileCompositionJson` |
  | `CompileCompositionV1Result` | `CompileCompositionResult` |
  | `ModuleDeclarationV1` | `ModuleDeclaration` |
  | `CompositionProfileV1` | `CompositionProfile` |
  | `CompositionPlanV1` | `CompositionPlan` |
  | `DiagnosticV1` | `Diagnostic` |
  | `PlanDigestV1` | `PlanDigest` |

  The already accepted authoring-helper names `defineModule`, `required`,
  `optional`, and `many` remain unchanged.
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
- `governance:check` rejects any identifier in package source whose name ends
  in `V` followed by a decimal generation. The rule is syntactic: the checker
  reads tracked source below `packages/` and does not judge intent. A second
  public compiler generation is rejected by the exhaustive export set above,
  which the packed declaration-surface evidence of each release verifies.
  Internal qualification file names may retain historical generation labels
  while they are immutable authority.
- The naming rule covers the whole package source, not only the public barrel.
  An identifier whose name ends in `V` followed by a decimal digit is
  prohibited in production modules, private modules, build tooling and tests.
  The rule is deliberately syntactic and rejects a superset of the names that
  denote a contract generation: `apiV2` and `uuidV4` are refused alongside
  `compileCompositionV1`. A name that would collide is spelled differently
  rather than exempted, because an exemption list would reopen the question the
  rule closes. The historical evidence names such as
  `compileCompositionV1` remain only inside the immutable qualification
  artifacts, the checkers under `architecture/checks` that validate them, and
  the qualification harnesses under `tests/qualification` that execute those
  checkers. Those files are immutable authority or its direct executor, never
  package source.
- Before 1.0 a breaking change needs no compatibility layer, alias or versioned
  name. It raises the package minor version under the SemVer rules for `0.x`,
  is recorded in the package `CHANGELOG.md` under that release together with
  the list of changed exports and the migration for first-party consumers, and
  updates those consumers in the same migration.
- `CHANGELOG.md` is created together with the first package and is maintained
  by hand in the Keep a Changelog format, one section per release.
- The same-migration rule is the whole compatibility policy while every
  consumer is first-party. Once a consumer outside the organization is recorded
  in the traceability ledger, removing or renaming a public export first ships
  one minor release that marks the old export `@deprecated` in the packed
  declaration surface and names the replacement in `CHANGELOG.md`; the removal
  lands in the next minor release together with a `MIGRATION.md` entry. This
  window is a release discipline, not a compatibility alias, and it does not
  reintroduce versioned names.
- This decision changes production naming only. It does not weaken the accepted
  validation, graph, diagnostic, resource, canonicalization, digest, or
  portability semantics.

### Precedence

This decision supersedes ADR-0004 and ADR-0006 only for every
prospective TypeScript name in the closed map above. It supersedes ADR-0007 only
for its prospective requirement to publish parallel versioned helper or
compiler exports. The exhaustive unversioned export set in this decision
becomes the only public naming authority; the accepted validation, result,
graph, diagnostic, resource, canonicalization and digest semantics remain
unchanged.

Before 1.0, a changed helper or compiler contract replaces the one current
unversioned export set in a coordinated package and first-party consumer
migration. The replacement still requires a successor decision, a new evidence
ledger, and all applicable packed-subject gates before publication. Existing
helper semantics and immutable qualification artifacts remain authority for the
contract they record; this decision neither mutates them nor relabels them as
evidence for the replacement contract.

## Consequences

- Product code uses short stable names and has one obvious import path.
- Pre-1.0 breaking changes stay explicit in package releases and coordinated
  consumer migrations instead of accumulating compatibility layers; every such
  change is visible in one place, the release changelog, and never as a second
  symbol name.
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
