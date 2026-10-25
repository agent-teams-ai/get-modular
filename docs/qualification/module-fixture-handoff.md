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

The [plan](module-fixture-plan.md) supplies phase scope and sequencing,
subordinate to accepted authority and the explicitly assigned slice; the
[scenarios](module-fixture-scenarios.md) supply independent oracles. All new test
support uses `tests/qualification/consumer-fixtures/`. Do not retain competing
`consumer-e2e` or `consumer-scale` subtrees from earlier proposals.

| Delivery | Scope | Dependency and exit |
| --- | --- | --- |
| First PR | P0 planning plus useful P1 | Exit on C-01–C-05 and required gates; include complete P2 only when the branch brief explicitly selects it |
| Lifetime PR, separate by default | P2 only | P1; full L-row ownership protocol |
| Recovery PR | P3 snapshot/worker experiment | P2; separate exact R results for both fixture profiles |
| Foundation owner PR | Remaining public source-fact/runner gaps | Existing owner work; proceed beside runtime fixtures |
| GM source adoption PR | P4 tool pin/profile/parity | Exact released artifact and scoped A evidence; no implicit whole-repository migration |
| Growth PRs | P5 small, then one measured next size | Correctness before growth; source coverage status stays explicit |
| Load PR | P6 | P2 and the semantic assembly entry; no growth/source-tool completion prerequisite |
| Author exercise | P7, runnable early | P1 recipe plus actual P4 coverage statement; held-startup diagnosis additionally needs P2 |

For each branch, put the phase, base SHA, allowed files and expected scenario IDs
in the first agent brief, together with the question and the selected exit.
Later rows are available follow-ups, not automatic activation. The normal allowlist is the canonical subtree, named
`tests/assembly/consumer-*.test.mjs` entries, the existing conformance packed test
and these three qualification records. Changes to root config, source coverage,
quality scopes or package pins require an explicitly listed extension with a
concrete reason. Agent Runtime, production package source, release-owned
baselines, accepted ADRs and unrelated refactors are outside that boundary.

If a scenario exposes a library defect, retain a minimal reproduction and route
a separate small fix to the owning feature. A correction under current semantics
uses current authority. Any change to accepted ADR semantics, including an
indirect plan/profile override or a successor, requires explicit user approval
before implementation. Record the accepted text, proposed delta, reason,
consequences and compliant alternative; the proposal remains unimplemented
until approved. Changed public types also follow their owning decision, package
tests and release/migration policy. This review grants no successor approval.

## Existing entrypoints and proposed focused commands

These observed commands come from the current
[package scripts](../../package.json). New file names below are proposed;
commands naming them do not exist until their implementation lands.

| Use | Command or existing owner |
| --- | --- |
| Dependency-free runtime guard | `bun run runtime:preflight` |
| Prepare required source package outputs when absent/stale | `bun run assembly:build`, then `bun run resources:build`, then `bun run conformance:build` |
| Focused semantic/lifetime cases, NEW file | `node --test tests/assembly/consumer-fixtures.test.mjs` |
| Focused restart cases, NEW file | `node --test tests/assembly/consumer-restart.test.mjs` |
| Mandatory owner of those test entries | Existing `bun run assembly:test` includes `tests/assembly/**/*.test.mjs` |
| Packed archive consumer owner | Existing `bun run conformance:pack`, through `packages/conformance/tests/packed-root.test.mjs` |
| Fixture source dependency check | Existing `node architecture/tooling/runtime/command.ts tool agent-teams-foundation check architecture.source-dependencies --consumer <disposable-consumer> --format json` with its own profile |
| Integrated P4 CMS/FMS mutations and bounded P6 cases | Same `tests/assembly/consumer-fixtures.test.mjs` entry; not just the source-dependency CLI or optional growth driver |
| Changed-input routing | `bun run check:changed` |
| Before handoff | `bun run check:fast` |
| Complete repository gate | `bun run check` and the existing required CI contexts |
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
Write its own `package.json` as `{ "private": true, "type": "module" }`.
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

The proposed projects are `tsconfig.types.json`, `tsconfig.runtime.json` and
`tsconfig.negative.json` under `tests/qualification/consumer-fixtures/semantic/`.
Add them during implementation and copy them to the disposable semantic root.
No project there extends a path back into the repository.
The positive project explicitly includes `src/**/*.ts`, `tests/features/**/*.ts`,
`tests/module/**/*.ts` and `tests/support/**/*.ts`, excluding `out/` and
`tests/negative/`. Use `strict: true`, `noEmit: true`,
`skipLibCheck: false`, target/lib ES2024 plus ESNext.Disposable and DOM,
and `types: ["node"]`. Materialization sets `typeRoots` to the absolute parent
of the pinned repository `@types/node` package directory resolved through
`createRequire`; TypeScript resolves its declared dependencies from that installed
development tree. Record the pin and resolved locations. The four extracted GM
archives alone do not provide Node declarations. No handwritten Node shims,
`any` declarations, network install or production-source alias fills this gap.
A separate `tsconfig.runtime.json` uses current TypeScript, NodeNext, real emit,
`rootDir: "."` and `outDir: "out"`, with the same positive inventory.
Copy all of `semantic/`, including its
`tests/support/`, then execute `out/tests/module/packed-entry.js` for the packed
hook or the selected semantic test entry for the assembly driver. Root
`consumer-fixtures/support/` contains only driver tooling and is not imported
by the copied consumer. Verify every relative import after materialization.

C-04b uses `tsconfig.negative.json` with only
`tests/negative/empty-runner.ts`, `include: []`, strict NodeNext/noEmit and the
same language libraries. Invoke each supported compiler directly, once, through
a bounded local process call and require exactly one TS2741 at the intended
assignment, nonzero exit and no other diagnostic/timeout. Do not pass this
project to `testAssemblyTypes.negativeProject`: that existing option deliberately
expects eight TS2307 closed-import errors. Keep the helper unchanged.

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
Preserve the four existing declaration projects' `types: []` environment and
`check.ts` inventory. Adding Node ambient declarations to them would weaken their
current guarantee. The focused fixture owns its four compatibility modes; the
packed hook adds only one current-compiler NodeNext emit and operation/close with
the fixture's declared Node types, not another four-mode fixture matrix.

The [SDK growth packed consumer](../../tests/qualification/sdk-growth-packed-consumers.mjs)
is different: it installs Core/Assembly archives using offline npm and checks
public imports. Do not transplant that installer into the conformance hook,
rerun either pack loop inside the fixture, or replace the existing SDK check.
Local archive evidence verifies packed current-source bytes; it is not proof of
registry publication or installation of a released version. A registry claim
requires its own existing owner path and exact artifact identity.

## Fast feedback without removing the complete gate

Run the changed scenario first, then `check:changed` at a coherent patch.
Current code-extension routing selects `check:fast`, but the new JSON projects
need explicit routing. In the P1 PR, extend existing `fullScanPaths` in
`architecture/foundation/repository-agent-workflow.yaml` for the three semantic
`tsconfig.*.json` paths above, and extend the configuration-only case in
`tests/repository-agent-workflow.test.mts`. This narrow two-file extension is in
scope; do not globally route all JSON. P4 adds its exact checked-in
`consumer-fixtures/source/source-dependencies.yaml` path to the same route.
Other new configuration paths must be named there when introduced. Existing
`architecture`, docs and manifest changes can select full scans.
Before handoff, retain a valid fast result and one complete `bun run check` result
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
The installed 1.7.4 manifest does not export `./source-graph`. Main's graph
projection omits computed-loader unresolved records, direct export provenance
and runtime-export kind/count; aliases/workspace/self imports remain external.
Its file inventory has no directory inventory. Preserve complementary installed
policy rejections instead of dropping these facts or claiming completion.

The neutral graph/source facts belong to Foundation. FMS rules belong to its
existing opt-in package. CMS rules belong to `@get-modular/conformance`.
Fixture scope, permitted edges and stricter syntax choices belong to this test
consumer. Keep production independent of all development tooling.

| Required fact | Handoff acceptance predicate |
| --- | --- |
| Files and coverage | Independent disk inventory covers selected roots; missing root/file, path identity and overflow fail closed; empty-role claims additionally need directory coverage |
| Unresolved/external references | Facts survive producer-to-runner projection; missing relative target and unknown specifier cannot silently disappear |
| Aliases/workspace/self imports | Resolve the real owned target or enforce an explicit supported subset; public positive and private negative are separate cases |
| Loading with computed specifiers | Existing owner exposes the reference or a real complementary gate rejects it; no local parser copy |
| Republication | Direct re-export and import-then-export retain provenance, or an enforced subset rejects unsupported syntax |
| Timing and composition | Pass `moduleComposition` to the kernel; distinguish allowed type-only relations, use cycles and actual load-time cycles |
| CMS runtime exports | Observe use-case export kind/count from actual source through the owned public chain; no generator-supplied expected records |
| Execution | The existing assembly fixture entry invokes the selected CMS/FMS checks and A mutations; the source-dependency CLI alone is insufficient |

Close the selected handoff only when an exact packed tool artifact processes
actual-disk positives and applicable A mutations, with no unsupported selected
form falling through as pass. Use the catalog's flat/nested applicability table;
record the consumer's v1 pin separately from a candidate kernel's v1.1 identity.
The flat recipe already contains CMS composition contracts: its A-06 surfaces and
`moduleComposition` are required research predicates, not deferred nested work.
Keep the accepted GM adoption profile separate from those test observations.
Support for every JavaScript syntax form is not required; truthful enforced
restrictions are acceptable. Keep a short fact-to-producer/coverage table, not
a new governance platform. A source candidate can support an explicitly labeled
research run before release; it cannot silently become an approved main dependency.

Fallback: use current public source-dependency checking with a fixture-specific
flat profile and continue independent C/L/R/G/W and flat P7 observations. Preserve any
incomplete A cells. The root repository's broad `repository.development`
boundary does not enforce the fixture's internal feature architecture for it.
In the disposable consumer, `foundation.config.yaml` maps
`capabilities["architecture.source-dependencies"].configPath` to
`architecture/foundation/source-dependencies.yaml`. Use the existing
`runPolicyFixture` materialization pattern in
[source dependency tests](../../tests/source-dependencies.test.mjs), with the
fixture's own roots and edges; do not import the test file as a runner.
Do not copy the Runtime collector or deep-import Foundation internals.
The selected installed policy reports capability-owned rejection codes, including
`cross-boundary-local-import-not-entrypoint`, `unresolved-local-import`,
`undeclared-external-dependency`, `source-parse-error` and
`unresolved-runtime-reference`; require the intended code/stage, not any failure.
At the observed Foundation source, reader bounds are 100,000 files, 4 MiB per
file and 512 MiB total. One oversized source tests overflow cheaply; refresh
the selected artifact's limits before adoption rather than making these public policy.
Missing facts for the recipe's composition contracts remain incomplete. Nested
v1.1 adoption and republication remain unselected; whole-repository migration is
not a prerequisite for the flat experiment.

## Source freshness and measurement evidence

The current G recipe follows
[ADR-0041](../decisions/0041-preserve-complete-feature-maps-with-descriptor-unions.md):
complete descriptor unions and separate mapped predecessor bases replace deep
feature-map inheritance while retaining unused and private-child metadata.
Capture the new generator identity and cold source hashes. Do not transfer old
inherited-map timings, source passes or compiler-patch evidence to these bytes.
Keep the same graph, useful computation, independent pins, fixed edits and caps;
qualify exact keys, value/token parity and early unused conflicts before scale.
The compiler/runtime and source reports remain separate observations of the
same named recipe. For N=100, 500 and 1000, independently compare the source
series' SHA-256, file census and byte count with each fresh compiler cold subject.
The current generator's results do not inherit historical cold hashes or PASS
labels. The source-only runner records current input byte identities and does
not perform compiler/runtime work. This authoring successor adds no public API
or runtime owner.

The [2026-10-23 current receipt](../../tests/qualification/consumer-fixtures/growth/descriptor-aggregate-evidence/2026-10-23/observations.json)
records this comparison for code `8ad16885`: all eight supported-compiler/runtime
stages passed at N100, 500 and 1000, and all three source-series identities match
their fresh cold subjects. N8 correctness, source controls and restoration also
passed. The current G recipe has supported N1000 evidence; historical compiler
blockers remain evidence about their original direct-inheritance recipe. Keep
that distinction when handing off the old reports. The current receipt's
repository checks do not replace final delivery-head CI.

Capture source head plus relevant dirty-file hashes, lockfile, package/output
hashes, compiler versions, generator/profile/config identities and environment.
A Git SHA alone does not identify modified outputs. A prepared object's reuse
also requires the same factory set, not only an equal plan digest.
Baseline and candidate use separate directories and build-info files.
No shared writable output or cache can stand in for immutable subject evidence.

One compact report identifies the selected scenarios, command/stage/exit,
expected/actual values, retained obligations and raw logs. Scope other fields
to the question instead of imposing every phase's measurements on each PR:

| Work | Additional evidence |
| --- | --- |
| P1/P2/P3 | Output/package/compiler identity, selected C/L/R results, effects/releases and retained ownership |
| P4 | Selected profile/tool pins, real disk census, observed fact coverage and mutation diagnostics |
| P5 | Census/graph counts, independent pins/checksum, prepare/run/close/full-smoke cost, selected compiler/scanner stages |
| P6 | All admission/runner-entered IDs, peak/final active count, terminal records, cleanup attempts/reports/releases for every instance |
| P7 | One author's patch and fixed diagnoses, successful result or reproducible blocker, actual missing recipe instructions |

Use pinned current TypeScript/NodeNext with `--singleThreaded`,
`--extendedDiagnostics`, `--incremental` and a subject-specific
`--tsBuildInfoFile` for G-03. Use real emit as in the fixture runtime project.
Per subject, start with empty output/build-info; run cold, unchanged incremental,
then the leaf patch. Restore baseline source and rewarm before applying the
independent shared-contract patch; label rewarm as setup. Measure subprocess wall time with
the parent's monotonic clock and retain raw diagnostics, including Types,
Instantiations, Memory used and check/total time when emitted. Use the scenario
catalog's fixed patches. Compiler Memory used is not subprocess RSS; record RSS
only with an available platform observer, otherwise report `not-collected` rather
than estimating it from TypeScript output.

Start with one measurement of each selected stage. If timing affects the decision
and noise prevents comparison, add at most two samples of that stage only, showing
all samples and their median. Do not repeat unrelated smoke, compiler modes or CI
to resolve another stage's noise. Reuse the final-input CI evidence; collect wall
and summed lane time only for an actual gate-cost question, otherwise `not-collected`.
Three samples do not establish tail percentiles or an SLO.
Keep existing 180-second compiler subprocess and 600-second type-test watchdogs
as engineering caps, not promised latency. Declare compiler, scanner, runtime/smoke
and aggregate experiment deadlines before running. Enforce the aggregate deadline
with an external supervisor enclosing generation, copying, patching, hashing and
all compiler/runtime child work; terminate its owned descendants on expiry.
An in-process timer cannot interrupt `spawnSync`.
A ceiling/watchdog failure stops the experiment, not another sample. Do not raise
ceilings, reduce smoke targets or split roots for green.

At the observed source, Core accepts at most 4096 declarations; Assembly counts
entries plus groups separately up to 4096, with group depth 16. Input entries
consume Core declarations but not that Assembly walk. Other active source/graph
limits still apply. The 1000-entry recipe writes 7003 TypeScript files; no claim
follows that an old 4096-file scanner can process it. Report actual disk bytes,
import occurrences and source inventory along with graph counts.

## Optional successors and final handoff

Every successor below remains subject to the explicit user-approval rule in
the delivery boundary if it changes accepted ADR semantics. A measured gap
supports a proposal; it does not activate that proposal's implementation.

| Trigger | Separate owner route; not baseline work |
| --- | --- |
| Required larger target exceeds its compiler budget on the prescribed feature maps | Preserve the failing consumer, reduced type-only witness and exact compiler pins; route a bounded investigation to the compiler/package owner. A representation or standard change remains a separate approval proposal |
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

Final delivery distinguishes selected-and-passed, failed, incomplete and
not-selected work on exact inputs. Unselected later phases do not prevent the
assigned slice from finishing. Preserve retained physical custody and storage
debts in the report.
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
