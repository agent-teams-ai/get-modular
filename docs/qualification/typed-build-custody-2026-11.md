---
id: QUAL-TYPED-BUILD-CUSTODY-2026-11
type: qualification
status: reviewed
owner: architecture/tooling
summary: Bounded plan and execution record for strict build custody, one construction witness, and independent package verification.
related:
  - ADR-0008
  - ADR-0009
  - ADR-0012
  - ADR-0016
  - ADR-0018
  - ARCH-CURRENT-CONTRACT
  - ARCH-FEATURE-MODULE-STANDARD
  - QUAL-NATIVE-TYPESCRIPT-TOOLING
  - QUAL-FOUNDATIONAL-RUNTIME-REFACTOR-2026-11
---

# Typed build custody and construction verification, November 2026

## Authority and completion claim

This is a working implementation plan and qualification record, not an accepted
architecture decision, a release admission or a conformance promotion. The
`reviewed` document status does not claim passing implementation checks. Before
implementation, the review log below must record two independent critic rounds
and the disposition of every confirmed plan finding.

The audited base is `558d3fcaaeab8c2706d105e79a502980b5b119d8` on main. The
owner requested a substantial E2E refactor, roughly 10–15 thousand added/deleted
lines, with strict scope, independent critics, important tests and autonomous
delivery. Line count is a planning estimate, never a reason to create code.

The [current contract](../architecture/current-contract.md),
[execution roadmap](../architecture/mvp-implementation-roadmap.md),
[self-composition guide](../architecture/self-composition-implementation-guide.md)
and [Feature Module Standard profile](../architecture/feature-module-standard.md)
continue to own the requirements. This work follows the existing phase 4 build
and phase 5 evidence responsibilities. Accepted decisions and retained evidence
remain authoritative at their recorded revisions.

## Research and selected problem

Three independent researchers examined runtime ownership, qualification
infrastructure and architecture boundaries. The public packages already have
the admitted dependency direction and no observed product/tooling dependency.
The most coherent large debt is the maintained build and evidence path:

- Build generation, tracked-file custody and the generated-source reader are
  unchecked JavaScript. Typed callers infer shapes through a project with
  `allowJs: true` and `checkJs: false`; this does not check those implementations.
- The 685-line construction witness has two byte-identical maintained copies.
  The live generator uses the root copy while four Core tests use the other.
- The three builders repeat compiler invocation/failure dispatch. Their common
  mechanism has real callers and warrants one small private helper.
- A TypeScript rename alone would remove migrated Core tests from the current
  `.test.mjs` command and would not include them in a strict project.

Removing these gaps improves the reliability of the path every package change
uses. It adds no public API, package, runtime dependency, service registry or
domain framework. Build custody stays repository development tooling; Core owns
its semantic compiler and emitter; the independent witness owns its finite
construction grammar and observations.

The canonical Consumer Module Standard was compared at the audited base and
current upstream main. Both equal the retained accepted-current document from
`b2fec1fa15fe3998f51449d7df249f302645973f`: Git blob
`df4eff7235ac781ec574903c6b2aec13bcd7bfaa`, SHA-256
`3c5814ebf1ab1bd17688e49955aa0baa2ee91dd3a369adcea4d38aaccd53ba86`.
The retained document is byte-identical; there is no unreviewed delta or pin
migration. No new public composition contract is intended.

## Exact large-PR scope and ownership

| Owner | Implementation and affected tests |
| --- | --- |
| Custody | Migrate `architecture/checks/tracked-file-custody.mjs` and `generated-production-source.mjs` to `.ts`; explicitly type snapshots, index/tree entries, regular-file observations, projections, read outcomes and generated readers. Migrate `tests/generated-production-source.test.mjs`; extract only custody-specific blocks from `tests/governance.test.mjs` into a focused strict `.test.ts`. |
| Construction evidence | Maintain the strict witness at `tests/qualification/support/construction-witness.ts` and generate exactly one Core-local copy at `packages/core/tests/qualification-support/support/construction-witness.ts`; cold checking and direct builds compare every byte. Retain independent finite parsing and source/export correspondence. Remove separate maintenance of the local copy. Migrate `packages/core/tests/qualification/construction-witness.test.mjs`, preserve its independent tuples and mutation expectations, and update all four live Core importers. |
| Build orchestration | Migrate `generate-core.mjs`, `build-core.mjs`, `build-assembly.mjs`, `build-leaf-package.mjs` and the directly consumed `leaf-packages.mjs` registry to `.ts`. Share only repeated compiler invocation. Migrate `production-generation.test.mjs` and `package/build-closure.test.mjs` into the required strict test project. |
| Integration | Root owner updates live callers, explicit copy inventories, script contracts, strict project files, source-dependency entrypoints, current documentation and test selection. Historical retained path records keep their original identity. |

The leaf registry is included only because every leaf builder consumes it and
the migrated builder needs its checked contract. This is not permission to
migrate unrelated leaf test infrastructure. The compiler helper remains a
function receiving the existing project/root inputs, not a subprocess framework.

The witness has one authored owner in `repository.development`. The generator
imports that root implementation; the four Core consumers import a checked-in,
byte-identical projection inside their existing development boundary. Run
`node architecture/tooling/construction-witness-projection.ts --write` after
editing the root source. Verification uses `--check` and never repairs drift.
Both files and the fixed-path helper belong to strict checking; direct builds
check parity before compilation and capture both files as inputs. No new package,
public export, boundary permission or general copying framework is introduced.
The full-graph findings and reviewed amendment appear below.

Every implementation worker uses an isolated checkout at an explicit shared
base, owns a disjoint file set, and supplies a patch or immediately pushed
commit. Root owns integration files and publication. No worker runs destructive
builds in another worker's checkout or changes a shared policy independently.

## Preserved invariants and implementation constraints

1. **Cold bootstrap:** `runtime:policy:typecheck` precedes Core build. New tooling
   types cannot import generated Core `dist`, the production barrel or stage1.
   Use narrow owner-local inert models at dynamic seed boundaries, with runtime
   checks where data is unknown. Do not duplicate the complete Core API.
2. **One source observation:** source/index snapshot identity, index modes,
   allowed working-tree projections and both read passes retain their meaning.
   Generated tracked input is rejected before destructive cleanup. Git context
   remains hermetic; unsafe paths, symlinks, special files and partial streams
   remain refusals, including supported SHA-256 Git object identities.
3. **Fresh construction:** keep the fresh-process generation guard, stage0
   compilation, own-profile compilation, independent direct witness, emission,
   generated witness, exact input rechecks and exclusive generated-file write.
   No prior output or candidate-supplied bytes may authorize generated source.
4. **Independent proof:** preserve factory/declaration/source correspondence,
   exact tuple/digest expectations, finite grammar, cardinality and dependency
   ordering. Never derive expected answers from the emitter or its plan.
5. **Failure and cleanup:** unsafe production output is removed on failure;
   primary and material cleanup failures remain visible. Preserve physical Node
   compiler execution, subprocess completion, output bounds and current error
   classifications. No generic retry or fallback success.
6. **Strict maintained code:** every migrated implementation and test is ordinary
   `.ts`, checked with the existing strict TypeScript 7.0.2 settings, including
   unchecked-index and exact-optional checks. Do not bridge the migration with
   `any`, blanket casts, suppressions, weaker compiler flags or unchecked wrappers.
   Deliberate JavaScript text fixtures retain their tested syntax.
7. **Public compatibility:** runtime/public declaration output and package
   closure remain equivalent. No public export, dependency, support interval,
   release baseline or accepted decision changes. Generic consumers continue to
   use public package roots without repository tooling.

## Separate urgent Assembly correction

The runtime audit reproduced a distinct preparation race: in profile-completion
mode, root alias names are copied synchronously but their values are read from
the caller's map after awaiting Core. Swapping two valid aliases during that
await changes the resulting root map. The existing contract requires capture
before the first await.

Deliver this as a separate small PR with its own source/tests/changeset and
review. Capture aliases into an owner-private representation and permit only
that representation after the first await. Preserve validation order, diagnostic
codes, accessors-without-invocation checks and both preparation modes. Do not
introduce another feature node or package.
Read already-validated data descriptors synchronously, retaining exact entry
identities; keep membership, input-versus-module, uniqueness and plan-root
validation at their existing positions rather than validating earlier.

Decisive proof uses actual compiled and installed package roots: two distinct
root instances, immediate alias swap/replacement/deletion, and independently
expected original outputs. Retain existing tests for null-prototype maps,
ordinary special names, borrowed inputs, invalid/duplicate roots and zero-Core-
call precedence. Add a focused missing case only where existing coverage is
insufficient. Required Assembly strict checks and package E2E remain mandatory.

Use the existing `tests/assembly/preparation-ownership.test.ts`, its owning
`tests/tsconfig.assembly-tooling.json`, and `tests/assembly/packed-root.test.mjs`
route. Update the packed harness's exact execution/pass counts and require the
new named scenario to execute; an inherited child test environment or an empty
successful child run cannot stand in for installed-package evidence.

The separate ambiguity about 4,096 module/group nodes plus input entries is
unconditionally outside this correction. Current Core rejection remains;
interpretation and any combined Assembly census require a separate review.

## Explicit exclusions and remaining inventory

- No M3 Chromium/Electron/native-controller rewrite or wholesale deletion of the
  59 Core/root qualification pairs. Several current controllers genuinely drift;
  their source inventories and native transports need separate proof.
- No Resources settlement/state-machine optimization, Core algorithm redesign,
  Observation rewrite, lifecycle-kernel adoption or Conformance graph expansion.
- No changes to immutable historical M1/M2/M3 evidence, accepted ADRs, public API
  baselines, runtime pins, required checks, Actions permissions or protections.
- No future release-cohort admission, version branch or package publication.
  The existing ADR-0042 metadata-cohort refusal is separate from source checks.
- No new general test runner, copying framework, process supervisor, validation
  library or ceremonial DDD layer. Existing independent oracles stay independent.

This removes the selected debt completely; it does not claim that every legacy
file in the repository disappears. Remaining candidates are the broader M3
duplication, Resources report-materialization costs and the small Conformance
adjacency-copy issue. They do not enlarge this PR.

## Size and risk accounting

The measured existing scope is approximately 4,853 lines: six build/custody files
(1,124), leaf registry (280), two witness copies (1,370), witness tests (795),
generation tests (674), generated-source tests (169), build-closure test (60)
and identified custody blocks (381), before shared setup and caller edits.

Migration and explicit contracts plausibly produce 10–13k gross added/deleted
lines, with a much smaller rename-aware diff. Final reporting must show both
`git diff --no-renames --numstat` and rename-aware totals and identify moved
code separately. The 685-line witness loses its second authored owner; the Core-local projection
is generated and checked, not maintained independently.
Do not add work merely to meet a line target.

Engineering judgments on a ten-point scale: scope coherence 9, reliability
benefit 9, complexity 6–7, change risk 5–6. These are review estimates, not
measured reliability. The highest risks are an initial typecheck dependency cycle,
silently omitted tests, weakened custody through broad type assertions and
incorrectly treating historical evidence as a live caller.

## Delivery and verification sequence

1. Publish this plan after two critic rounds. Record exact scope decisions and
   open findings. Push each commit immediately and open a draft PR before the
   large implementation. Deliver the independent Assembly correction separately.
2. Implement custody, witness and build work in disjoint checkouts. Root updates
   exact integrations together; remove the old implementations, not just imports.
   Inspect the complete changed-path inventory for accidental historical edits.
3. Run strict tooling typecheck with Core `dist`, `dist-stage0`, `dist-seed`,
   `dist-test` and the generated root absent, and record that exact cold setup.
   Verify all migrated tests are included in both strict project and
   ordinary command selection. Reject production access to the witness helper.
4. Run existing focused custody, generated-source, construction-witness,
   production-generation and build-closure tests. Keep independent negative
   controls: index/source drift, symlink/replacement races, Git redirection,
   intent-to-add, modes, SHA-256 objects, bounded blob streams, factory/alias/
   declaration substitution, missing/extra bindings, stale and poisoned output,
   and failure cleanup. Add only demonstrated missing boundary cases.
5. Exercise real cold seed-to-generated builds and the actual packed consumer
   routes, including public runtime/declaration closure and the current 272-case
   M2 inventory. Record immutable source, actual Node/compiler versions, packed
   archive digest and completed case count; retain empty-pending and no-failure
   assertions from the existing harness. A child exiting zero without required completion evidence is
   not a pass. No source probe or type-stripped run substitutes for these E2Es.
6. Run `check:changed` during integration, `check:fast` before handoff and complete
   `check` on an immutable clean source. Use the official Bun default and the
   separate official Node/pnpm projection; never mix installations. Preserve
   architecture, API, release-owned-file, compiler-floor and integrity gates.
7. Conduct at least two independent final critic rounds. Review ownership,
   hostile/failure paths, actual test selection and lack of overengineering.
   Resolve every confirmed finding; re-review affected code and repeat relevant
   proof until none remain. Record non-reproduced observations honestly.
8. Inspect the actual final PR head, owner attribution, review threads and
   required checks. Merge through the protected expected-head route only after
   successful qualification. Verify actual merge tree/metadata and successful
   CI on the resulting main. Source qualification does not imply publication or
   that every unrelated workflow is green.

## Plan review log

Round 1: independent architecture, qualification and runtime critics approved
the bounded plan with no blocking finding. Corrections applied before round 2:
the duplicate has four Core importers; the CMS pin comparison has no delta;
the cold check names all absent outputs; packed receipts bind the actual source,
archive and completion; Assembly reuses its existing strict/packed route and
keeps semantic validation in place. The combined-limit ambiguity is an
unconditional exclusion. Current build-path inventories migrate while retained
source identities remain historical.

Round 2: all three critics independently reviewed the revised plan and approved
implementation with no remaining blocker. Architecture review confirmed the
single narrow development entrypoint and no CMS delta; qualification review
confirmed cold bootstrap, independent oracles and source-bound packed receipts;
runtime review confirmed preserved validation positions and the separate
Assembly scope. No implementation or passing qualification is claimed by these
plan approvals.

## Reviewed implementation amendments

The first complete Foundation checks on the Bun and Node profiles exposed a
package cycle at source `61dc14b5e77c6cc4dd6ed13844d67fffe721de05`:
Core tests imported the root witness while repository consumers already imported
Core and Assembly. The initial reduced fixture admitted the individual edge but
omitted the reverse package dependency. Its success did not prove the full graph
acyclic. A proposed move into Core development was then rejected by the actual
checker because root tooling cannot import a private Core file by a relative
path, even through an allowed boundary entrypoint. That move was not published.

All three critics approved the bounded compatible amendment: one maintained root
witness and one generated, byte-identical Core-local projection. The small fixed-
path synchronization command is explicit; cold strict checking and direct builds
only compare bytes and reject divergence. The generator captures the helper and
both witness files as source inputs. Required fixtures copy those exact inputs.
The boundary regression represents root's public Core consumption and rejects
both production use of the development witness and a Core-to-root back-edge.
No cycle exception, public export, new package or runtime-projection allowance
is introduced; unrelated qualification copies remain outside this scope.

Historical release operations also require their own source's build paths.
The ordinary admitted-cohort E2E exposed an incorrect `.ts` replacement inside
an authenticated historical checkout. The release controller's two build calls,
their policy inputs and the bounded metadata-pack experiment retain `.mjs`;
current build operations use `.ts`. Two critics reviewed this correction, and
the actual public promotion and independent replay passed. A separate critic
executed the metadata-pack experiment against the genuine historical release
source, including exact unchanged Resources and Observation archive checks.
No historical fixture or release admission was rewritten.

The native Windows failure path stalled after `LOCK_OPENING` in the unmodified
physical lock test. A reviewed nine-line adjustment qualifies the existing
PowerShell JSON command and adds three flushed stderr stage markers. JSON fields,
stdout acknowledgments, exit codes, deadlines and failure assertions remain
unchanged. Module discovery is a hypothesis, not an established cause; native
Windows execution must verify the result. This adjustment does not claim a
successful Windows run by itself.

## Execution record

Implementation, independent final reviews, immutable-source test receipts and
protected delivery remain pending.
