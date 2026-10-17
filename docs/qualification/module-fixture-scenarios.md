---
id: QUAL-MODULE-FIXTURE-SCENARIOS
type: qualification
status: reviewed
owner: architecture
summary: Specifies independent positive and rejecting oracles for semantic, restart, source, growth and concurrent consumer fixtures.
related:
  - QUAL-MODULE-FIXTURE-PLAN
  - QUAL-MODULE-FIXTURE-HANDOFF
  - ARCH-COMMON-ASSEMBLY
---

# Module fixture scenarios

## How to use the catalog

These are proposed tests, not recorded passes. Follow the phase and allowed-file
boundaries in the [plan](module-fixture-plan.md). The source baseline is Get
Modular `a3a079baca2c6af48c9d45bc08992825be1c2bbd`, observed 2026-10-17.
Use the [handoff](module-fixture-handoff.md) for actual commands and source owners.

Every schedule has named barriers, expected output and a terminal disposition.
A watchdog bounds a stuck test; elapsed sleeps do not determine the intended
interleaving. A negative passes only for its expected stage/code or specific
observable violation. An unrelated compile, install or timeout error is a failure.
Do not generate expected provider decisions from completed production plans.

## Semantic file map and ownership

All paths in this section are new and relative to
`tests/qualification/consumer-fixtures/semantic/`. The source has two flat
features. Only add role directories that contain actual behavior.

| Path or family | Responsibility |
| --- | --- |
| `src/features/session/application/ports/{runner,journal,identity}.ts` | Narrow consumer contracts, function-valued properties, no GM imports |
| `src/features/session/application/use-cases/run-job.ts` | One exported function coordinating normalization, runner and journal |
| `src/features/session/composition/session.contracts.ts` | Descriptors and the session capability map; consumer owns needed contracts |
| `src/features/session/composition/session.declaration.ts` | Session module declaration with exact descriptors and required slots |
| `src/features/session/composition/session.module.ts` | Thin typed factory adapter; concrete workflow remains in the use case |
| `src/features/session/composition/{identity,journal}.declaration.ts` | Slot-free input declarations |
| `src/features/session/composition/session.inputs.ts` | Imports both own input declarations and creates inputs |
| `src/features/session/composition/session.group.ts` | Lists the session factory entry, never the input entries |
| `src/features/runner/application/use-cases/run.ts` | Useful bounded runner behavior without a lifecycle base class |
| `src/features/runner/adapters/outbound/test-resource.ts` | Test resource acquisition, effect and release witness |
| `src/features/runner/composition/runner.contracts.ts` | Runner map and descriptor imports from the visible contract owner |
| `src/features/runner/composition/runner-{a,b}.declaration.ts` | Two implementation identities of the one runner capability revision |
| `src/features/runner/composition/runner-{a,b}.module.ts` | Owner-local typed factories; `scoped` exposes their resource scope |
| `src/features/runner/composition/runner.group.ts` | Exposes the separately selected A or B group for a test subject |
| `src/composition/semantic.root.ts` | Lists selected groups, session root and named inputs; no workflow |
| `tests/features/session/session.wiring.ts` | Handwritten provider/root pins and any explicit rows |
| `tests/features/session/testing.ts` | Contract-owned suite and typed fakes |
| `tests/module/semantic.test.ts` | Consumer assertions using public library entrypoints |
| `tests/module/packed-entry.ts` | Self-contained one-operation/close entry used by the existing packed harness |
| `tests/support/{attempt-owner,journal,barriers}.ts` | Semantic test lifetime, real file journal and deterministic controls |

Test lifetime and journal helpers stay in `semantic/tests/support/`, outside the
production `src` inventory. All semantic TypeScript imports resolve within the
materialized semantic tree or public packages; none reaches root driver support.
The packed hook copies this canonical tree and runs only `packed-entry.js`.
The runner adapter uses typed dependency values selected by composition. Its own
consuming boundary declares the narrow release-journal shape it needs; structural
assignment in composition connects it to the input. Application code imports
neither another feature's application files nor composition descriptors. Group membership is an
assembly convenience, not a privacy boundary. Only one runner implementation
is present in each prepared subject; swapping it creates another factory set.

Use an exact, simple operation result: identity `left`, payload `hello` and
implementation A produce `left:A:hello`; B produces `left:B:hello`.
The journal records that exact result and operation identity. Normalization has
a handwritten input/output assertion so a stub that ignores the payload fails.
The port suite checks its semantic contract for both implementations; the wiring
oracle separately checks that the chosen implementation is the intended one.

## C — Connected public consumer behavior

| ID | Schedule | Required oracle | Distinguishing negative |
| --- | --- | --- | --- |
| C-01 | Compile real files, prepare A, run one command, close | Exact `left:A:hello`, one matching journal effect, owned resource released | Returning a constant or discarding the runner result changes the asserted output |
| C-02 | Select B while retaining A's handwritten oracle | `conformance.wiring.mismatch` identifies the wrong provider; B still passes the shared contract suite | Deriving oracle from the completed plan would incorrectly pass |
| C-03 | Reuse preparation for simultaneous `left` and `right` inputs/scopes | Exact independent results; closing left leaves right operational | Shared mutable closure/scope contaminates the sibling |
| C-04a | Register the session-owned contract suite against an otherwise valid subject declaration of revision 2 while its suite contract is revision 1 | Synchronous `conformance.suite.revision-mismatch`, before any test registration | Another error or registration before rejection fails the case |
| C-04b | In a separate no-emit negative project assign `{}` to the fixture `RunnerPort`, which has one required `run` property; then reference the variable | Exactly TypeScript diagnostic TS2741 on that assignment under both supported compilers | Casts, disabled strictness or acceptance of the empty fake fail the case |
| C-05 | Run the same small operation from extracted package archives | All four public entries resolve in the disposable consumer; exact result and successful close | Deep package import rejects with `ERR_PACKAGE_PATH_NOT_EXPORTED`; source fallback is forbidden |

Run the complete standard `smoke` once for the semantic graph. With two ordinary
factory entries and two inputs it has five attempts and eight factory calls;
inputs are not factory calls. Smoke checks construction/registered cleanup,
not provider intent, physical disposal or all of the lifetime schedules below.
Keep the existing package-copy and conformance suite regressions; do not copy
them into this fixture to inflate coverage.

## L — Attempt, work and staged teardown

The selected baseline stop sequence is concrete:

1. Allocate and retain the attempt before calling `prepared.run`.
2. `requestStop()` closes ingress, aborts construction and signals the session's
   operation controller immediately. It never awaits the requesting participant.
3. The external stop owner waits for startup and the session-owned work to
   settle; those operations observe the signal already sent in step 2.
4. Close attempt resources, inspect the report and retry failed cleanup while
   borrowed journal operations remain usable and authorized.
5. Perform the required terminal write, then close the external journal owner.

If a lane's cancellation is initiated by its child-scope cleanup, close that
child before awaiting its drain. Do not close the journal ancestor to signal
work. This exception does not authorize raw parent close before debt retries.
A cleanup that waits for its own or an ancestor's close would deadlock under the
existing [resources contract](../../packages/resources/README.md#closing).

| ID | Controlled schedule | Exact success oracle |
| --- | --- | --- |
| L-01 | Hold factory return; stop; release the late return | No published facade or command effect; returned resource remains owned until release |
| L-02 | Construction succeeds; hold readiness; stop; finish readiness | Readiness result cannot reopen ingress or publish; attempt settles and closes |
| L-03 | Run stop-before-publication and publication-before-stop as separate schedules | First schedule has zero publication; second has one publication followed by closed ingress; no callback runs inside commit |
| L-04 | Accepted callback calls `requestStop`, then finishes | Callback completes; externally awaited stop completes; stop is not in its own drain set |
| L-05 | Accepted work waits for the operation cancellation signal | Stop itself triggers settlement without manually releasing that wait; journal remains writable until completion |
| L-06 | Acquire resource, then throw before returning the setup value | Adapter's retained partial-acquisition record either releases the resource or reports its unresolved custody; a green scope report alone is insufficient |
| L-07 | First cleanup fails; discard the caller's error; invoke stop/close again | Retained owner retries; append/read of borrowed journal works during retry; physical release precedes journal close |
| L-08 | Abandon a wait while release is held; then complete release | Initial report has `settled: false`; work remains owned; another waiter observes final settlement; no premature release claim |
| L-09 | Revoke fixture effect permission during an awaited operation | Effect port checks current permission after the await and rejects the effect; zero journal effect records |
| L-10 | Fill the work admission budget; request private cancel/stop | Control does not join the blocked work queue; admitted work settles; no new ordinary effects are admitted |

For L-07 include one test-local counterexample that closes the journal too early:
retry must fail because the borrowed prerequisite is actually unusable. For
L-04/L-05 the positive schedules are sufficient; do not add a deliberately
hanging variant to every mandatory lane merely to wait out its watchdog.
Logs contain bounded fixture identities and codes, not arbitrary causes,
capability objects or resource handles. Resource labels need not be unique IDs.

## R — Persistent snapshot and fresh worker

### One explicitly bounded profile

The store is a test-only JSON snapshot with a format revision, bounded records,
scoped operation identity, request fingerprint and state. Initial caps are 64
records, 64 KiB canonical bytes and 1 KiB per request fingerprint/input. These
limits are test safety caps; overflow rejects before mutation. The operation owner
serializes transitions. The adapter performs only validated read and atomic
replacement; it does not choose claim/cancel/retry policy.

Write a complete temp file in the same directory, sync it, close it, then rename
it to the canonical filename. Never delete the canonical file before rename.
Only the canonical filename is authoritative on recovery. Temp files, modification times,
intended memory values and undelivered acknowledgements cannot resurrect state.
A write/sync/rename error freezes further mutation/effects for that flight;
reread canonical state and continue only through recovery/query, without a
success acknowledgement for the ambiguous command. Invalid canonical state
closes admission rather than opening an empty store.

A live supervisor owns one writer grant and confirms the old retained worker
handle's exit before issuing the next grant. Snapshot generation is provenance,
not authority. The supervisor rejects stale messages by grant and scoped
operation identity. Two startup requests test this supervisor's exclusivity;
they do not establish database locking or distributed multi-writer exclusion.

Compare two fixture policies without choosing a future product policy:

| Profile | Accepted unclaimed work after worker loss | Claimed work without terminal evidence |
| --- | --- | --- |
| `record-only` | Retained/queryable; this profile does not automatically dispatch it | Reconcile/quarantine, never blind retry |
| `restart-pending` | Fresh worker continues it once after reconciliation and admission | Reconcile/quarantine, never blind retry |

The supervisor may retain actual test-child custody across worker death. It
counts physical child creation/handshake and later observes exit. That proves
retained external custody, not orphan discovery after supervisor or machine
failure. Process slots follow observed child liveness; operation quarantine and
storage cleanup debts are independent facts.

### Exact crash and cancellation rows

Each row uses a fresh disposable directory unless it explicitly restarts the
same subject. The original scoped operation identity is held constant across
query/retry. A conflicting request fingerprint must reject, not create a second
operation. A crash is a real worker termination followed by a new process.

| ID | Barrier and schedule | Exact launch count and terminal evidence |
| --- | --- | --- |
| R-01 | Sync/close new acceptance temp file, kill before replacement, start new worker without resubmit | **0** launches; canonical state lacks the new acceptance; temp file is ignored |
| R-02 | Replace acceptance, lose response, restart; duplicate same submit | `restart-pending`: **1** launch and exact expected result. `record-only`: **0** automatic launches and an explicit retained unclaimed record |
| R-03 | Commit cancellation before any claim; restart | **0** launches; cancellation remains recorded; duplicate submit does not start work |
| R-04 | Commit claim, kill before physical launch permission | **0** launches; unknown/reconcile state with no new grant. Quarantine does not invent a live CPU occupant |
| R-05 | Supervisor creates child, kill worker before handle acknowledgement/result | **1** launch, no relaunch; supervisor retains the real handle, requests stop and observes exit |
| R-06 | Persist terminal result, lose response, restart/query/duplicate | **1** total launch; query returns the identical committed result without re-execution |
| R-07 | Establish one successful claim/launch, then commit cancel while work is held | **1** launch; cooperative child stops; explicit cancelled outcome; a late success cannot overwrite the chosen terminal state |
| R-08 | Competing same-ID submits at full admission; then conflicting fingerprint | One authoritative accepted record and **1** launch for the already admitted operation; same submit returns that identity, conflict rejects, unrelated new request overloads |
| R-09 | Fail canonical replacement during cancellation while child is alive | Local control stops the child; total launch stays **1**; no durable-cancel acknowledgement is fabricated; query/reconcile reports last known committed facts |
| R-10 | Compete startup requests; send stale old-grant launch message; open older snapshot in read/reconcile-only mode | At most one writer grant; **0** launches from denied/stale/restore requests; no activation from the restored file |

R-02 additionally checks liveness: a pending implementation that never dispatches
fails even though its launch count is at most one. R-04 and R-05 are distinct:
claim is not physical start, and absence of a worker handle is not proof that no
child exists. R-05 verifies actual exit before returning its process slot, while
a separately injected file cleanup debt may remain.

Also mutate a canonical snapshot to invalid bytes and trigger a replacement
failure without deleting the old canonical file. Admission must fail closed;
restore of an older file is permitted only through the named read/reconcile-only
entrypoint. These are test storage checks, not production backup or rollback
protection. Same-machine process restart is the only persistence claim here;
power loss, filesystem guarantees on other environments, HA and supervisor-loss
orphan recovery remain unqualified.

## A — Actual source facts and scoped architecture

The root GM FMS gate checks its own profile; `checkModuleLayout` accepts records
and does not inspect disk. A separate fixture profile declares its source roots,
curated entrypoints, permitted edges and standards pin. The neutral fact producer
observes files and imports independently from those declarations. Tests are
excluded from production ownership facts but remain in the ordinary test census.

| ID | Source mutation or positive | Required evidence |
| --- | --- | --- |
| A-01 | Complete flat semantic/growth tree; delete an expected source file | Disk census and compiler identify missing input; no reduced green fixture |
| A-02 | Valid public feature edge, then private relative/alias/workspace/self-package edge | Allowed edge passes; each unsupported/private edge is resolved and rejected or rejected by an explicit syntax gate |
| A-03 | Missing relative target, unknown external and parse failure | Each remains visible in the report; no dropped fact creates an `ok` result |
| A-04 | Dynamic import with a computed specifier or loader alias | Shared collector supplies the fact, or an actual complementary gate rejects the unsupported form |
| A-05 | Declared direct republication, undeclared re-export and import-then-export | Correct provenance or an enforced subset; indirect republication cannot disappear |
| A-06 | Module composition and cross-feature type/runtime edges | `moduleComposition` reaches the kernel; use cycles and load-time cycles retain their distinct rules |
| A-07 | Own input declaration consumed through `f000.inputs.ts`; delete that import or put input in a group | Positive passes; CMS rejects orphan declaration and Assembly rejects an input group member |
| A-08 | Valid single-function use case, extra runtime export, missing root and scanner overflow | Observed export facts and full inventory drive the rejection; generator assertions do not substitute for scanning |

Until the required public chain passes these rows, mark the affected source
coverage incomplete. A record populated from the generator can test the pure
CMS function, but cannot prove integration from source. Nested v1.1 and
composition-contract semantics need their own qualified scope even when another
flat fixture passes. Do not expand the Runtime's old scanner scope or claim that
its historical 4096-file envelope covers this experiment.

## G — A real file tree with bounded useful computation

For N features, generate six files per feature: `application/ports/value.ts`,
`application/use-cases/read.ts`, `composition/<feature>.contracts.ts`,
`composition/value.declaration.ts`, `composition/value.module.ts`, and
`composition/<feature>.group.ts`. Add the root and, in `f000/composition/`,
`input.declaration.ts` plus `f000.inputs.ts`. The latter imports the declaration
and exports the input entry; root includes it only in `inputs`.
Thus the baseline is **6N+3 TypeScript files**, plus separately counted configs,
feature cards, test oracle files and generated output. No file is counted twice.

Entry 0 consumes the input. Entry 1 consumes entry 0. Entry i for i >= 2 consumes
the sorted unique set `{i-1, floor(i/2)}`. In particular i=2 has one predecessor,
not two duplicate slot names. The last entry is the root, all entries are
reachable, and every feature has one group of depth 1.

Each factory reads predecessor scalar values once and stores its own scalar.
Its exported port returns that scalar in O(1); it does not recursively traverse
the dependency DAG on each call. With M=1,000,003 and integer input seed s:

- `value[0] = (31*s + 1) mod M`.
- `value[i] = (17*(i+1) + sum((j+1)*value[j])) mod M`, over its unique predecessors.

For the selected N <= 1000, intermediates remain exact JavaScript integers.
Use each feature's own typed contract and literal descriptor map, without type
casts that erase capability identity. Independent expected arithmetic does not
import the generator, fixture factory, completed plan or emitted implementation.
The literal small oracle for seed 17 is
`[528, 562, 1175, 4717, 22478, 116017, 715089, 24612]`;
seed 23 yields root `603377`. These values make ignored dependency results visible.

| N | Declarations, including input | Entries + groups | Required rows/occurrences/distinct edges | DAG path nodes | TS source files | Full smoke attempts / factory calls |
| --- | --- | --- | --- | --- | --- | --- |
| 8 | 9 | 16 | 13 | 9 | 51 | 17 / 80 |
| 100 | 101 | 200 | 197 | 101 | 603 | 201 / 10,200 |
| 500 | 501 | 1000 | 997 | 501 | 3003 | 1001 / 251,000 |
| 1000 | 1001 | 2000 | 1997 | 1001 | 6003 | 2001 / 1,002,000 |

Full ordinary smoke is `1+2N` attempts and `N(N+2)` factory calls, excluding
preparation, allocations, lookup and cleanup costs. For 1-based construction
position i and fan-in e_i, input lookups contribute
`sum(e_i * (1 + 2*(N-i+1)))` under these ordinary terminating factories.
Record actual values and distribution; these formulas are not timings.

| ID | Experiment | Oracle and stop condition |
| --- | --- | --- |
| G-01 | 8-feature compile/run/oracle/full smoke | Exact literal values and census; compatible wrong provider changes result and violates independent pin |
| G-02 | 100, then 500, then 1000 as separate comparisons | Correct root checksum, complete inventory and full smoke; stop at first ceiling/watchdog/budget failure |
| G-03 | Cold build, no-op incremental, leaf-body edit, shared-contract edit | Fixed semantically valid edits and isolated build-info; record compiler counters and elapsed stage times |
| G-04 | One targeted 64-provider ordered-many case, only when fan-in is the investigated risk | Provider order/value matters; no blanket topology-size-compiler-instance matrix |

The sparse profile already contains a chain; another chain is unnecessary until
a specific depth boundary is investigated. G-03 uses fixed patches: the last
feature changes its own checksum term from `17*(i+1)` to `17*(i+1)+1`; its expected
root changes by one modulo M. The shared-contract patch renames f003's port method
from `read` to `readValue`, changes that provider and its actual consumers f004,
f006 and f007, and advances f003's descriptor revision from 1 to 2. All consumers
use the same descriptor, the checksum stays equal, and no type cast bridges the
change. Freeze those patches before comparing baseline and candidate. Current compiler/NodeNext measures growth; the small
case retains the supported current/minimum compiler and NodeNext/Bundler checks.

## W — Runtime instances are a separate dimension

| ID | Fixed schedule | Exact oracle |
| --- | --- | --- |
| W-01 | Two semantic instances; hold left work, complete right, cancel left and close it | Right keeps its own result/scope; left settles from cancellation; no cross-instance state or effect |
| W-02 | 16 semantic instances, four requests each, no queue, limit 16 active; accept each instance's first request before submitting its other three | Exactly 16 accepted and 48 overloaded, peak active <=16; cancel one before its effect, so exactly 15 successful effect records and one cancelled result |
| W-03 | During W-02 fail one cleanup once, then retry | Work results unchanged; journal remains operational through retry; observed resource release and final close settle; storage debt does not invent a process occupant |

The constants are a calibration workload. Release barriers only after the
accepted/rejected set is recorded so admission counts are deterministic.
Watchers are zero. Preparation is reused for the unchanged factory set;
per-run inputs, scopes and state are distinct. Neither this workload nor G-02
establishes a product SLO, network behavior, OS containment or Runtime capacity.
