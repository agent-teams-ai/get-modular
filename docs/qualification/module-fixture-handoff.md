---
id: QUAL-MODULE-FIXTURE-HANDOFF
type: qualification
status: reviewed
owner: architecture/tooling
summary: Defines implementation boundaries, existing verification routes, Foundation handoff predicates and honest fixture evidence delivery.
related:
  - QUAL-MODULE-FIXTURE-PLAN
  - QUAL-MODULE-FIXTURE-SCENARIOS
  - ARCH-FEATURE-MODULE-STANDARD
  - ARCH-COMMON-ASSEMBLY
  - OD-007
---

# Module fixture implementer handoff

## Delivery boundaries and PR sequence

The [plan](module-fixture-plan.md) supplies phase authority; the
[scenarios](module-fixture-scenarios.md) supply independent oracles. All new test
support uses `tests/qualification/consumer-fixtures/`. Do not retain competing
`consumer-e2e` or `consumer-scale` subtrees from earlier proposals.

| Delivery | Scope | Dependency and exit |
| --- | --- | --- |
| First PR | P0 planning plus useful P1; include P2 if still small | Real connected consumer, assembly entry and packed hook; no scaffolding-only PR |
| Lifetime PR, if separate | P2 only | P1; full L-row ownership protocol |
| Recovery PR | P3 snapshot/worker experiment | P2; separate exact R results for both fixture profiles |
| Foundation owner PR | Remaining public source-fact/runner gaps | Existing owner work; proceed beside runtime fixtures |
| GM source adoption PR | P4 tool pin/profile/parity | Exact released artifact and scoped A evidence; no implicit whole-repository migration |
| Growth PRs | P5 small, then one measured next size | Correctness before growth; source coverage status stays explicit |
| Load and author exercise | P6/P7 | P2 and the relevant P4 recipe; no unrelated optional dependency |

For each branch, put the phase, base SHA, allowed files and expected scenario IDs
in the first agent brief. The normal allowlist is the canonical subtree, named
`tests/assembly/consumer-*.test.mjs` entries, the existing conformance packed test
and these three qualification records. Changes to root config, source coverage,
quality scopes or package pins require an explicitly listed extension with a
concrete reason. Agent Runtime, production package source, release-owned
baselines, accepted ADRs and unrelated refactors are outside that boundary.

If a scenario exposes a library defect, retain a minimal reproduction and route
a separate small fix to the owning feature. A correction under current semantics
uses current authority. Changed semantics or public types require the owning
successor decision, normal package tests and release/migration policy. The fixture
PR must not silently admit the successor or waive a failing accepted invariant.

## Existing entrypoints and proposed focused commands

These observed commands come from the current
[package scripts](../../package.json). New file names below are proposed;
commands naming them do not exist until their implementation lands.

| Use | Command or existing owner |
| --- | --- |
| Dependency-free runtime guard | `pnpm runtime:preflight` |
| Prepare required source package outputs when absent/stale | `pnpm assembly:build`, then `pnpm resources:build`, then `pnpm conformance:build` |
| Focused semantic/lifetime cases, NEW file | `node --test tests/assembly/consumer-fixtures.test.mjs` |
| Focused restart cases, NEW file | `node --test tests/assembly/consumer-restart.test.mjs` |
| Mandatory owner of those test entries | Existing `pnpm assembly:test` includes `tests/assembly/**/*.test.mjs` |
| Packed archive consumer owner | Existing `pnpm conformance:pack`, through `packages/conformance/tests/packed-root.test.mjs` |
| Fixture source dependency check | Existing `pnpm exec agent-teams-foundation check architecture.source-dependencies --consumer <disposable-consumer>` with its own profile |
| Changed-input routing | `pnpm check:changed` |
| Before handoff | `pnpm check:fast` |
| Complete repository gate | `pnpm check` and the existing required CI contexts |
| Optional growth measurement, NEW driver | `node tests/qualification/consumer-fixtures/growth/measure.mjs --size 100` |

The preparation commands are not an instruction to rebuild before every test.
Focused drivers consume ready outputs, verify the subject they were given and
report missing prerequisites. Ordinary repository gates own their existing
preparation. Separate checkouts/CI lanes may each need preparation; repeated
builds inside one unchanged consumer invocation have no evidential value.

For the focused assembly driver, copy each ready package's `package.json` and
complete `dist/` into the temporary consumer's
`node_modules/@get-modular/{core,assembly,resources,conformance}`. Copy the
canonical semantic tree beside that directory and hash the copied outputs.
There is one physical copy of each public package, with all four resolutions
inside the consumer. No package manager runs, so workspace peer ranges remain
manifest metadata. This is runtime evidence from built outputs; only the packed
hook qualifies archive bytes. Reuse this snapshot for the unchanged subject,
without mutable workspace links or another build/pack loop.

Use existing `testAssemblyTypes({ directory, project })` from
[the compiler helper](../../architecture/tooling/test-assembly-types.mjs)
for minimum/current TypeScript and NodeNext/Bundler type checks on the small
fixture. Its optional runtime mode expects `types-positive.js`; it is not a
generic consumer runtime runner. Compile the fixture's actual entry separately
with pinned current TypeScript and execute emitted JavaScript once per chosen
subject. Do not invoke runtime smoke in every type-check mode.

Use a fixture `tsconfig.types.json` with `strict: true`, `noEmit: true`,
`skipLibCheck: false`, target/lib ES2024 plus ESNext.Disposable and DOM,
and `types: ["node"]`. Materialization sets `typeRoots` to the absolute parent
of the pinned repository `@types/node` package directory resolved through
`createRequire`; TypeScript resolves its declared dependencies from that installed
development tree. Record the pin and resolved locations. The four extracted GM
archives alone do not provide Node declarations. No handwritten Node shims,
`any` declarations, network install or production-source alias fills this gap.
A separate `tsconfig.runtime.json` uses current TypeScript, NodeNext, real emit
and an isolated output directory. Copy all of `semantic/`, including its
`tests/support/`, then execute `out/tests/module/packed-entry.js` for the packed
hook or the selected semantic test entry for the assembly driver. Root
`consumer-fixtures/support/` contains only driver tooling and is not imported
by the copied consumer. Verify every relative import after materialization.

## Keep the two current packed harnesses distinct

The [conformance packed test](../../packages/conformance/tests/packed-root.test.mjs)
already runs pinned pnpm pack for conformance, Assembly, Core and resources,
then uses `tar -xzf --strip-components=1` into the disposable consumer's
`node_modules/@get-modular/<name>`. Extend that consumer hook with the semantic
fixture's real files and one operation/close. Reuse its package extraction and
compiler selection. Its development boundary does not permit an import of root
qualification support. Read/copy the canonical consumer source bytes and keep
tiny invocation glue local; root assembly drivers alone import the root helper.
Consumer and conformance must resolve one physical copy of
Assembly and resources. Preserve its existing export, peer and deep-import tests.

The [SDK growth packed consumer](../../tests/qualification/sdk-growth-packed-consumers.mjs)
is different: it installs Core/Assembly archives using offline npm and checks
public imports. Do not transplant that installer into the conformance hook,
rerun either pack loop inside the fixture, or replace the existing SDK check.
Local archive evidence verifies packed current-source bytes; it is not proof of
registry publication or installation of a released version. A registry claim
requires its own existing owner path and exact artifact identity.

## Fast feedback without removing the complete gate

Run the changed scenario first, then `check:changed` at a coherent patch.
Current code-extension routing already selects `check:fast`; inspect whether a
new JSON fixture configuration needs an explicit routing path. Existing
`architecture`, docs and manifest changes can select full scans.
Before handoff, retain a valid fast result and one complete `pnpm check` result
on the final relevant inputs. Reuse a completed matching result instead of
mechanically repeating it because two instructions name the same command.
A narrow command does not replace the complete gate or existing OS/Node lanes.

The small suite uses the existing assembly glob. It needs neither a second
mandatory root command nor a new identity-contract framework. Existing critical
quality-test contracts retain their own scope. Review the new entry's inclusion
in the glob and use meaningful scenario assertions; do not mirror implementation
mappings just to create more tests.

If later measurements justify making a heavy qualification command mandatory,
change its exact obligations in one separate PR: `package.json`,
`architecture/checks/feature-module-standard-profile.mjs`,
`.github/workflows/ci.yml`, `tests/ci-check-lanes.test.mjs`, and relevant routing
in `architecture/foundation/repository-agent-workflow.yaml`. The profile and
lane tests bind closed command lists. The native lane runner only validates safe
script identifiers. Never append a command while bypassing the closed-list checks.
Current required Windows/Node lanes remain required even if a future
Windows-specific product workload has not been selected.

## Foundation source-fact handoff

Observed Foundation main is `9a950bd3170530a091747194b0aef7cf2ead7159`.
Its [opt-in FMS package README](https://github.com/agent-teams-ai/engineering-foundation/blob/9a950bd3170530a091747194b0aef7cf2ead7159/packages/feature-module-standard/README.md)
describes the existing pure kernel and the then-pending Node runner/first release.
The [neutral source-graph entry](https://github.com/agent-teams-ai/engineering-foundation/blob/9a950bd3170530a091747194b0aef7cf2ead7159/packages/engineering-foundation/src/source-graph.ts)
is source evidence, not proof of inclusion in an installed published tarball.
PR400 was observed open/draft at
`bad38466c9130275d136eba71a3d97935acb4706`; it proposes the Node runner and
re-export fact. Refresh main, PR head, release and installed artifact before work.
An open PR with conflicts is not an admitted dependency or merge authorization.

The neutral graph/source facts belong to Foundation. FMS rules belong to its
existing opt-in package. CMS rules belong to `@get-modular/conformance`.
Fixture scope, permitted edges and stricter syntax choices belong to this test
consumer. Keep production independent of all development tooling.

| Required fact | Handoff acceptance predicate |
| --- | --- |
| Files and coverage | Independent on-disk inventory covers every selected root; absent root, unseen file, path identity and overflow fail closed |
| Unresolved/external references | Facts survive producer-to-runner projection; missing relative target and unknown specifier cannot silently disappear |
| Aliases/workspace/self imports | Resolve the real owned target or enforce an explicit supported subset; public positive and private negative are separate cases |
| Loading with computed specifiers | Existing owner exposes the reference or a real complementary gate rejects it; no local parser copy |
| Republication | Direct re-export and import-then-export retain provenance, or an enforced subset rejects unsupported syntax |
| Timing and composition | Pass `moduleComposition` to the kernel; distinguish allowed type-only relations, use cycles and actual load-time cycles |
| CMS runtime exports | Observe use-case export kind/count from actual source through the owned public chain; no generator-supplied expected records |
| Execution | The actual consumer command runs the selected checks and returns nonzero for its named mutations; a passing pure kernel alone is insufficient |

Close the handoff only when an exact packed tool artifact processes actual-disk
positive and A-row mutations, with no unsupported form falling through as pass.
Support for every JavaScript syntax form is not required; truthful enforced
restrictions are acceptable. Keep a short fact-to-producer/coverage table, not
a new governance platform. A source candidate can support an explicitly labeled
research run before release; it cannot silently become an approved main dependency.

Fallback: use current public source-dependency checking with a fixture-specific
flat profile and continue independent C/L/R/G/W observations. Preserve any
incomplete A cells. The root repository's broad `repository.development`
boundary does not enforce the fixture's internal feature architecture for it.
In the disposable consumer, `foundation.config.yaml` maps
`capabilities["architecture.source-dependencies"].configPath` to
`architecture/foundation/source-dependencies.yaml`. Use the existing
`runPolicyFixture` materialization pattern in
[source dependency tests](../../tests/source-dependencies.test.mjs), with the
fixture's own roots and edges; do not import the test file as a runner.
Do not copy the Runtime collector or deep-import Foundation internals.
Nested v1.1 and composition-contract claims remain deferred until their selected
facts/rules chain is qualified; whole-repository migration is not a prerequisite.

## Source freshness and measurement evidence

Capture source head plus relevant dirty-file hashes, lockfile, package/output
hashes, compiler versions, generator/profile/config identities and environment.
A Git SHA alone does not identify modified outputs. A prepared object's reuse
also requires the same factory set, not only an equal plan digest.
Baseline and candidate use separate directories and build-info files.
No shared writable output or cache can stand in for immutable subject evidence.

One compact report per comparison contains scenario IDs and their stage statuses,
actual source census, limits, command/stage/exit, values, expected/actual attempts,
effects, admission peak, unresolved obligations and raw log paths.
Measure cold preparation, reused run/close, full smoke, compiler cold/incremental
stages, scanner cost and the complete CI wall time plus summed lane time.
Use pinned current TypeScript with `--extendedDiagnostics`, `--incremental` and
a subject-specific `--tsBuildInfoFile` for G-03. Measure subprocess wall time with
the parent's monotonic clock and retain raw diagnostics, including Types,
Instantiations, Memory used and check/total time when emitted. Use the scenario
catalog's fixed patches. Compiler Memory used is not subprocess RSS; record RSS
only with an available platform observer, otherwise report `not-collected` rather
than estimating it from TypeScript output.

Start with one full measurement of each subject. If timing affects the decision
and noise prevents comparison, add two independent samples and show all samples
and their median. Three samples do not establish tail percentiles or an SLO.
Keep existing 180-second compiler subprocess and 600-second type-test watchdogs
as engineering caps, not promised latency. New experiment budgets are declared
before a run; do not raise ceilings, reduce smoke targets or split roots for green.

At the observed source, Core accepts at most 4096 declarations; Assembly counts
entries plus groups separately up to 4096, with group depth 16. Input entries
consume Core declarations but not that Assembly walk. Other active source/graph
limits still apply. The 1000-entry recipe writes 6003 TypeScript files; no claim
follows that an old 4096-file scanner can process it. Report actual disk bytes,
import occurrences and source inventory along with graph counts.

## Optional successors and final handoff

| Trigger | Separate owner route; not baseline work |
| --- | --- |
| Concrete live watch/load consumer | Existing Observation admission/implementation work; first update authority and qualify its package, then add one consumer scenario |
| Need exact pending factory attribution | Named Assembly-owned inspection successor and experiment; retain honest attempt-level diagnostics meanwhile |
| Demonstrated repeated task-ownership contract | Consider TaskSet with one owner; direct fixture session ledger remains the baseline |
| Independently released mixed revisions | Named compatibility-window successor; exact revision remains the current default |
| Runtime discovery/replacement | Separately justified registry/admission/lifetime scope |
| Independently deployed operation/custody owner | Reuse prior remote evidence with a delta; choose transport and trust policy in that delivery |
| Measured authoring mechanism gap | Named fragment/authoring successor with fresh-agent evidence, not a resurrected DSL by default |

At the observed GM baseline,
[OD-007](../open-decisions/OD-007-module-change-observation-package.md) is open;
the [communication study](../../research/module-communication-2026-10/README.md)
and [implementation brief](../../research/module-communication-2026-10/implementation-brief.md)
are research/pending admission evidence. Refresh that existing work before any
Observation scenario. Do not copy a sketch engine into these fixtures or begin a
parallel unapproved package. Passive consumers and the selected load experiment
need no Observation dependency.

Final delivery states which phase/scenario ran on which exact inputs, which
predicates failed or remain incomplete, and which guarantees are intentionally
unclaimed. Preserve retained physical custody and storage debts in the report.
The future Runtime rewrite still owns product acceptance, trust, restoration,
legacy writers, rollout, target environment and SLOs; none is selected by a TEST
profile. These future questions do not block the fixture comparisons now.

## Primary source map

The following existing sources were read at GM
`a3a079baca2c6af48c9d45bc08992825be1c2bbd`; paths remain navigation to their owners.

- [AGENTS](../../AGENTS.md), [system boundary](../architecture/system-boundary.md),
  [current contract](../architecture/current-contract.md),
  [CMS](../architecture/common-assembly.md), and
  [module authoring](../guides/module-authoring.md).
- [Resources API](../../packages/resources/README.md),
  [assembly resource tests](../../tests/resources/assembly-scope.test.mjs),
  [conformance API](../../packages/conformance/README.md),
  [layout rules](../../packages/conformance/src/features/layout/check.ts),
  [smoke implementation](../../packages/conformance/src/features/harness/smoke.ts).
- [Current type-scale source](../../tests/assembly/type-scale.mjs),
  [type-scale tests](../../tests/assembly/type-scale.test.mjs),
  [Core limits](../../packages/core/src/features/input-admission/resource-limits.ts),
  [Assembly group limits](../../packages/assembly/src/features/construction/group.ts).
- [FMS adoption profile](../architecture/feature-module-standard.md),
  [profile gate](../../architecture/checks/feature-module-standard-profile.mjs),
  [lane parity tests](../../tests/ci-check-lanes.test.mjs),
  [changed-file routing](../../architecture/foundation/repository-agent-workflow.yaml).

The organization Engineering Quality Standard was refreshed on 2026-10-17
(content blob `86b82be3e5bd212e7d78e50d92349e323026347e`); its
[maintained route](https://github.com/agent-teams-ai/.github/blob/main/docs/engineering-quality-standard.md)
requires practical ownership, independent failure evidence and proportional
checks. It does not supersede the repository's pinned FMS or accepted decisions.
