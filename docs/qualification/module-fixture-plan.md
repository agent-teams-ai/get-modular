---
id: QUAL-MODULE-FIXTURE-PLAN
type: qualification
status: reviewed
owner: architecture
summary: Bounds implementation of public-package consumer fixtures, restart experiments, source checks and measured growth without changing Agent Runtime.
related:
  - ARCH-SYSTEM-BOUNDARY
  - ARCH-COMMON-ASSEMBLY
  - QUAL-MODULE-FIXTURE-SCENARIOS
  - QUAL-MODULE-FIXTURE-HANDOFF
---

# Module fixture implementation plan

## Status and intended result

This is a reviewed implementation plan, not implemented evidence or an adoption
of a new public API. The observed Get Modular source is
`a3a079baca2c6af48c9d45bc08992825be1c2bbd` on 2026-10-17.
Every fixture path below is proposed unless identified as existing.
No phase changes Agent Runtime, its adapters, decisions, dependency pins or gates.

The delivery is an executable TEST consumer of the existing public packages,
plus a bounded recovery comparison and a measured file-tree growth experiment.
It tests composition, useful output, resource ownership and actual failures
through connected boundaries. It does not implement a replacement Runtime.
The [system boundary](../architecture/system-boundary.md) and
[Consumer Module Standard](../architecture/common-assembly.md#consumer-module-standard)
remain authoritative; this plan selects test subjects and acceptance evidence.

Accepted ADR semantics are binding. Changing their meaning through code, a
profile, this plan or a successor requires the user's explicit approval before
implementation. A proposal must identify the accepted text, proposed change,
reason, consequences and a compliant alternative. Review, passing tests and an
open successor PR do not supply that approval. Corrections that preserve accepted
semantics can proceed within the assigned owner scope.

The phase map is context, not automatic activation of every phase. Each agent
brief selects one useful slice, its question, allowed files and exit. P0+P1 is
the default first delivery; P2 is separate unless its complete ownership protocol
fits that same bounded change. No empty future-phase scaffolding is required.

Keep four results separate: public runtime behavior, packed-package behavior,
source architecture coverage, and measured scale/load. A passing result in one
column cannot fill a missing result in another. Source checks may remain
incomplete while runtime experiments proceed; that is not permission to call
the authoring recipe structurally qualified or to replicate it at scale as an
accepted architecture. No production promotion is requested.

## Read only the relevant route

Read repository `AGENTS.md` first, including its organization quality route.
Then use the following bounded route instead of rereading the entire research
archive for each edit. The [handoff](module-fixture-handoff.md) owns commands,
source pins, change boundaries and evidence reuse; the
[scenario catalog](module-fixture-scenarios.md) owns exact test oracles.

| Work | Required additional reading |
| --- | --- |
| P0/P1: consumer | CMS ownership, packages, inputs and testing sections; module-authoring guide sections 1, 3–6, 9, 11–14, 17; scenarios C |
| P2: lifetime | resources README closing contract; existing assembly-scope tests; scenarios L |
| P3: recovery | scenario catalog recovery profile and R rows; system boundary; handoff limitations |
| P4: source facts | local FMS profile, conformance layout README, handoff Foundation acceptance table; scenarios A |
| P5/P6: growth/load | scenarios G/W, current limits, smoke implementation and type-scale helper; measurement handoff |
| P7: author exercise | accepted recipe files and ordinary diagnostics only; no design-history knowledge assumed |

Existing roadmap authority still applies when a fixture exposes a library bug.
Admission, graph or diagnostic changes additionally require the compiler
engineer route in `AGENTS.md`; this plan does not authorize those changes.

## One subtree, two deliberately different profiles

The canonical new subtree is `tests/qualification/consumer-fixtures/`.
Keep qualification helpers there, as required by `AGENTS.md`.
Do not create a production or Host package, copy library implementations,
copy the Runtime scanner, or introduce a third parser.

| Profile | Purpose | Shape |
| --- | --- | --- |
| `semantic` | Human-readable end-to-end behavior and lifetime | One static A root, two factory entries and two inputs; B is a test-only provider mutation |
| `growth` | Compiler, composition, disk and scanner cost | Generated flat tree, initially 8 entries, then 100, 500 and 1000 in separate measurements |

Both use public package roots and ordinary typed factories. Share only boring
file materialization, compiler invocation, barriers and report formatting.
Do not turn the two graphs into one generic graph, operation or Host framework.
The small runtime load experiment uses the semantic graph; it does not increase
feature count while also increasing concurrent work.

The semantic owner map is fixed for the first delivery:

- `session` owns command normalization and the accepted operation callbacks.
- `runner` owns its test resource and implements a narrow consumer-owned port.
  A and test-only B satisfy one revision and produce distinct observable results.
- `identity` and borrowed `journal` are explicit per-run inputs. Their values
  are not closure singletons or entries hidden in a group.
- A test attempt owner retains startup, readiness, facade publication and stop.
  It does not become a public Host abstraction or a second task ledger.
- The outer test owner keeps the journal operational and authorized through
  terminal writes, cleanup failures and retries, then closes it explicitly.

## P0 — Freeze the implementation slice and its file map

**Purpose and prerequisites.** Start from a fresh reviewed base and make the
first PR small enough that one agent can finish it. P0 is planning inside the
useful P1 delivery, never a separate scaffolding-only PR. No future delivery, SLO,
transport or trust choice blocks this TEST profile comparison.

**Allowed paths.** This document set and the proposed subtree; P1/P2 later add
only the named existing test integration files. Root navigation is maintained
with the documentation delivery. Production source, public baselines, accepted
ADRs and dependency upgrades are outside the default branch boundary.

**Ordered work.**

1. Record the exact base/head, relevant source hashes and clean/dirty state.
   Read changed owner contracts if main has advanced; do not silently replace
   the pinned premise with historical research.
2. Write `tests/qualification/consumer-fixtures/README.md` with the two profiles,
   scenario-to-entrypoint map and test-only policy choices. Freeze the concrete
   port/request shapes and effect/release witnesses in those actual files;
   do not leave the first implementer to invent competing contracts.
3. Lay out the semantic files listed in the scenario catalog. Start with actual
   useful factories and tests; do not create empty domain or adapter layers.
4. Record `runtime`, `packed`, `source` and `measurement` statuses independently.
   These are report fields, not a new persistent manifest platform.

**Exit and handoff.** Another agent can identify each file's owner, the public
entrypoints used, and the exact next scenario. If the file map needs a public
contract change, stop that change and open a separate owner issue/PR route.
Hand off the bounded diff and C-01 through C-05, not the whole roadmap.

## P1 — Implement the useful semantic consumer

**Prerequisites.** P0 and current compiled authoring examples; no Foundation
migration, Observation package or new lifetime library is required.

**Allowed paths.** `consumer-fixtures/semantic/`, `consumer-fixtures/support/`,
new `tests/assembly/consumer-fixtures.test.mjs`, and the existing
`packages/conformance/tests/packed-root.test.mjs` integration point.
The handoff names the narrow extension for configuration-only routing in the
existing workflow configuration and its regression test.
The assembly driver may import root qualification support. The packed package
test instead reads/copies canonical consumer files and uses small local invocation
glue; it must not import root support across its current development boundary.
No source-policy change is needed merely to share that helper.

**Ordered work and APIs.**

1. Declare contracts with `defineContract`, declarations with `declareModule`,
   factories with `implement<C>()`, inputs with `input`, and groups with `group`.
   Use `required` for the initial slots. Domain/application code imports none
   of Core, Assembly, resources, conformance or Foundation. Public provided
   port types live in the owning feature's `contracts/`; each application uses
   its own narrow ports, connected structurally by composition. Use cases have
   the accepted `(deps, input)` shape. Feature maps extend the consumed feature
   maps through type imports rather than flattening their descriptors.
2. Prepare through `assemblyFor<C>()` and the fixture root's `api.prepare`.
   Keep one prepared object for an unchanged factory set. Run with
   `prepared.run({ signal, scope: attempt.resources, inputs })`; allocate each
   attempt before construction begins. Inputs are capability records keyed
   by the root's input names, following the current guide.
   P1 retains the allocated scope and startup promise through settlement and
   close, with its real file journal usable through terminal writes and complete
   cleanup. P2 extends that same owner with the full stop/readiness/retry
   protocol; do not create a second owner or empty future-phase helpers.
3. Compile real TypeScript files and execute emitted JavaScript. Preserve
   literal types; no `any`, double cast, runtime type assertion or private
   import may hide an entry, slot or capability mismatch.
4. Add C-01 through C-05: meaningful output, independent provider oracle,
   two isolated runs, negative revision and closed package boundary cases.
   Run the owner's success/error/cancellation suite against its typed fake,
   A and B, using the actual implementation entries through `isolate`.
   Within C-01, isolate the session with one opaque runner result and assert
   that both its return and terminal record preserve that exact result.
   `checkWiring` uses exactly the selected declarations; `checkNamespaces`
   also checks the alternative/fake inventory. Keep feature provider pins in
   feature tests and root pins in the root test. Run one full A-root `smoke`.
5. Add the same small consumer to the existing packed conformance test. That
   test already packs and extracts four archives into its temporary
   `node_modules`. Consume those ready files; do not invoke another build,
   installer, pack loop or full small smoke inside the hook.

**Success oracle.** The fake and both implementations pass the same owner suite.
A's static root passes its independent oracle and both normalized payload cases;
test-only B is rejected by A's provider expectation. B is not a second supported
root recipe. Both instances retain their own identity, and right remains usable
after left closes.
The packed consumer executes one connected operation and close with all four
package resolutions inside its extracted consumer directory.

**Stop/defer and handoff.** A library defect becomes a minimal reproducible
owner fix. A missing source-fact producer marks the A rows incomplete and routes
to P4; it does not turn C rows into failed runtime behavior. Hand off the exact
files, completed cases, public diagnostics and prepared-subject identity to P2.

## P2 — Retain the attempt through stop and cleanup

**Prerequisites.** P1; the resources close/retry contract and L rows.
**Allowed paths.** The same subtree and assembly test entrypoint; no production
Host, lifecycle-kernel adoption, TaskSet or reusable scheduler package.

**Ordered work.**

1. Add a minimal attempt owner retaining startup, ingress/publication state,
   close authority, one active stop flight and its last settled report.
   Session owns accepted work once. Do not permanently memoize an incomplete
   stop result or replace the owner's result with an abandoning waiter's snapshot.
2. Make `requestStop()` synchronously close ingress and signal the session's
   operation controller, then return without awaiting its own participants.
   Signal construction cancellation too. External test code awaits stop.
3. Retain construction/readiness until settlement. A late result remains
   owned but cannot publish after stop. Commit publication synchronously,
   without foreign callbacks, after the live stopping check.
4. Await startup/readiness and the work owner after initiating cancellation,
   then close the attempt resources. Before the session exists, stop still
   closes ingress and aborts construction; no operation can be admitted.
5. Inspect `{ complete, settled, debts }`; `control.close()` does not reject
   for cleanup failure. After an incomplete settled flight, call `stop()` again
   on the same retained attempt owner to retry its debts; direct resource-control
   retry alone does not qualify that owner. Keep the journal usable until
   work/startup settle, inner cleanup is `complete: true` and terminal writes
   finish. An incomplete or abandoned observation retains close authority and
   the live journal.
6. Execute L-01 through L-10 with explicit barriers and an outer watchdog.
   Keep one case where work actually waits on the selected cancellation
   signal; manually releasing every barrier would miss a drain deadlock.

**Success oracle.** The L table's concrete event orders, external journal
records and resource usability checks pass. Stop-before-publication never
publishes; publication-before-stop is not retroactively erased. A participant
requesting stop can finish, and cleanup retry works after the first report is
discarded. L-06 requires actual partial release; an unresolved label is not a pass.

**Stop/defer and handoff.** Unknown physical release stays unknown. Do not
invent per-factory inspection by importing private Assembly state. Report the
attempt phase/identity and known deadline only. Hand off retained ownership and
remaining debts; P1/P2 alone do not prove restart or durable acceptance.

## P3 — Compare restart profiles using a real persistent fixture

**Prerequisites.** P2 and the exact R-row schedules; this is a separate PR.
**Allowed paths.** `consumer-fixtures/recovery/`, small reusable fixture helpers,
and new `tests/assembly/consumer-restart.test.mjs`. No database service,
provider SDK, product migration or Runtime operation engine is introduced.

**Concrete store and topology.** Use one bounded JSON snapshot in a temporary
directory. The test process is the live supervisor and directly spawns both
the worker writer and effect child, retaining their actual handles. The worker
runs the semantic consumer and requests child launch through IPC. A transition writes
a new temporary file in that directory, syncs and closes it, then renames it
over the current snapshot. Acknowledgement follows successful replacement.
Failed/ambiguous write, sync, close or rename freezes ordinary owner transitions
and new launches until canonical reread/reconciliation succeeds; no success
acknowledgement is fabricated. Local stop and exit observation remain available.
Malformed/missing expected state fails closed; it is not silently reset.
This profile tests process restart on a live machine, not power-loss durability,
filesystem rollback protection, concurrent writers or an HA store.

**Ordered work.**

1. Implement only fixture operations `submit`, `claim`, `cancel`, `recordResult`
   and read/reconcile, serialized by the single operation owner. This is a
   finite test adapter; serialize transitions, not the whole child lifetime.
2. The supervisor allocates one worker writer grant after confirming the old
   worker's exit. With valid state and no incumbent, exactly one competing
   startup wins. Separately consume one launch permission per operation/claim
   before spawning; cancellation/freeze revokes it. Replayed or delayed requests
   cannot spawn again. Restored snapshot data grants neither kind of authority.
3. Persist identity, chosen profile, pending/claimed/terminal state and the
   minimum effect witness needed by the named scenarios. Use the catalog's
   bounded full-record schema and retain space for terminal transitions at
   admission. Reject overflow explicitly; these are fixture caps, not product limits.
4. Execute both `record-only` and `restart-pending` under identical schedules.
   Start a genuinely fresh worker reading the same directory. New objects
   in the old process do not count as a restart.
5. Let the supervisor retain child custody when a worker dies. Use observed
   spawn/handshake/exit, not a send callback or `killed` flag, as evidence.
   Cooperative stop uses child IPC on every supported lane. Never relabel
   that retained custody as discovery of an orphan after supervisor death.
6. Run R-01 through R-10, including exact positive launch counts, unknown-start
   quarantine, control during store failure and read/reconcile-only restore.

**Success oracle.** Every row has its exact count and final state. In particular,
restarted committed pending work launches once and produces the expected result
before any resubmission;
pre-claim cancellation launches zero times; claimed unknown work never gets a
second launch. Record-only no-start is accepted only in its named loss schedule.

**Stop/defer and handoff.** Failure to establish the replacement/read contract
on a supported lane blocks that recovery claim; keep the failure, not a memory
fallback. Unknown child occupancy remains reserved. Hand off profile-specific
results and limits; future Runtime policy selection remains a separate task.

## P4 — Qualify source facts through their existing owners

**Prerequisites.** A real P1 source tree; the Foundation acceptance table in the
handoff. This branch may proceed in parallel with P2/P3.
**Allowed paths.** Test consumer source profile and source-check adapter inside
the canonical subtree, its existing assembly fixture entry and the handoff's
configuration-routing extension. Foundation changes and GM dependency/adoption
changes belong to their separate owner branches.

**Ordered work.** Independently enumerate actual disk source; run the installed
source dependency gate with a fixture-specific profile; supply observed facts
to existing FMS and CMS owners. Never use a generator's expected edges as the
observed import graph. Freeze the TEST profile's exact standard pin and selected
surfaces, then use the catalog's A-row applicability table. Run integrated
checks/mutations through `tests/assembly/consumer-fixtures.test.mjs`.
Main/source, open PR, released tarball, installed dependency and qualified
consumer are separate statuses. Recheck those statuses before adopting tools.

**Success oracle.** The selected flat scope has actual-disk positives and
rejecting mutations, with full observed inventory and no dropped unresolved
facts. The root GM FMS profile's pass is not this result. Missing facts route
to the existing Foundation owner with the exact acceptance predicate. The eight
A rows cover named source facts; other accepted CMS/FMS constraints retain their
existing enforcement/review or an explicit incomplete status.

**Stop/defer and handoff.** Preserve `source: incomplete` until the needed chain
exists. No copied parser or private import is an interim substitute. The flat
recipe's CMS composition contracts still need their applicable A-06 evidence;
they cannot be waived by deferring nested features. Broader v1.1/nested adoption
remains unselected; an old flat check cannot authorize it. A flat
experiment does not wait for an unrelated whole-repository migration.

## P5 — Measure one real growth step at a time

**Observed research status (2026-10-17).** The corrected inherited-map subject
passed at 8 and 100 features. Its 500-feature cold TypeScript compilation timed
out after 180.047 seconds at the unchanged 180-second cap; the corrected
1000-feature subject was neither created nor run. Earlier shallow-map timings
do not qualify this subject. The next step is a separate bounded investigation
by the compiler/package owner, preserving accepted maps and public type
semantics. These are selected spike results, not completion of P5; see the
[retained research summary in PR #184](https://github.com/agent-teams-ai/get-modular/pull/184).

**Prerequisites.** P1 helper contract and G-01; P4 for a complete structural claim.
**Allowed paths.** `consumer-fixtures/growth/`, plus one small case in the existing
assembly fixture test. Generated source/output stays in temporary directories.

**Ordered work.** Materialize the corrected 8-feature tree, run literal small
oracle and full smoke once, then measure 100, 500 and 1000 in order. Every selected
root also passes independently owned provider/input/root pins through `checkWiring`.
Each next
size follows a report of the preceding size; do not create a Cartesian matrix.
Use the scenario catalog's deduplicated edges, `7N+3` TypeScript file census,
compiler edits and separate scanner budgets. Keep inputs outside groups.

The optional command proposed for this phase is
`node tests/qualification/consumer-fixtures/growth/measure.mjs --size 100`.
It is **NEW and unavailable until implemented**. It consumes ready package
outputs and reports missing preparation; it does not rebuild during each stage.
Only the 8-entry correctness case joins ordinary mandatory `assembly:test`.

**Success oracle.** G rows pass, actual census matches the topology, complete
smoke coverage is retained, and cold/incremental/scanner/runtime costs are
reported with identities. No time budget is selected from a pleasing result.
**Stop/defer.** Limit, watchdog or declared stage/aggregate budget failure stops
growth with nonzero status and retained evidence. A later 2000-feature run needs
its own question and budget. At 3500 this topology already exceeds accepted
walk/depth limits; it is not a positive growth target. Do not raise limits or
split roots to make a result pass. Hand off one measured delta.

## P6 — Exercise bounded concurrent work separately

**Prerequisites.** P2; P3 only for a claimed restart workload.
**Allowed paths.** Semantic fixture load scenarios and
`tests/assembly/consumer-fixtures.test.mjs`; no shared admission/queueing library
or prerequisite on the optional growth driver. P4's actual status remains visible.

**Ordered work.** Run W-01 on two semantic instances, then W-02 with 16 instances,
four requests each and 16 active admissions globally. Use W-02's uneven accepted
distribution to distinguish global admission from per-instance serialization.
These are experimental constants, not product SLOs. Hold accepted work and record
all admission outcomes before cancellation returns a permit. Cancel one through
its signal, finish the other work, observe one failed cleanup report, retry, then
close prerequisites. There is no hidden queue.
After stop/retry settlement, compare the final observed runner-entry IDs with
the accepted IDs as sorted lists, preserving duplicate entries. A check only
at the admission barrier misses late entry. Report the observed IDs.
Do not run a full graph smoke per operation or per instance.

**Success oracle.** Exact accepted/rejected counts, effects, identities and
settlement match W rows. Every instance, including one without accepted work,
has settled work, complete inner cleanup, an external release witness and a
closed borrowed journal. Physical capacity and storage debt remain separate.
**Stop/defer and handoff.** Keep watchers at zero and remote services absent.
Stop on leaked work, lost custody or missing terminal evidence. Report raw
observations; no Runtime throughput or reliability claim follows.

## P7 — Validate authoring and deliver the bounded result

**Prerequisites.** Working P1 recipe and P4's current coverage statement, which
may be incomplete. Held-startup diagnosis also needs P2. P3/P5/P6 are not
prerequisites; run the author exercise before accepting broad recipe replication.
**Allowed paths.** Fixture examples, their tests and these qualification records.
A fresh author completes H-01's withheld test-only B provider; another completes
the fixed C-02 wiring and L-01 held-startup diagnoses in H-02/H-03. Use only the
specified public and attempt-owner observations. Exact pending-factory attribution
is unavailable; an honest attempt-level diagnosis is the expected result.
The separate diagnostician's packet excludes the authoring tests, injector code,
answer annotations and the author's report. Reuse the existing observations;
no second runtime execution is needed merely to separate the readers.

Use the handoff's existing focused/changed/fast/full route once per relevant
input state. Record unexplained guesses, unnecessary cross-owner edits and
repeated mechanical work. Propose a generator or public successor only when
this exercise demonstrates a specific missing contract; do not add one by default.

**Exit.** One authored patch and both diagnoses either satisfy the stated oracle
or finish with a reproducible bounded blocker and the missing recipe instruction.
Record selected/passed, failed, incomplete and not-selected statuses on exact
inputs. Do not activate a successor to make the exercise finish. The next Runtime
rewrite receives ports and scenario contracts, not a new production framework.
The optional branches and their triggers are listed in the handoff.
