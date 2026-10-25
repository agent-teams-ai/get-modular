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
| `src/features/session/contracts/session.ts` | Public structural port/request types for the session-owned capabilities; no imports from application |
| `src/features/session/application/ports/{runner,journal,identity}.ts` | Narrow consumer contracts, function-valued properties, no GM imports |
| `src/features/session/application/use-cases/run-job.ts` | One exported `(deps, input)` function coordinating normalization, runner and journal |
| `src/features/session/composition/session.contracts.ts` | Descriptors and the session capability map; consumer owns needed contracts |
| `src/features/session/composition/session.declaration.ts` | Session module declaration with exact descriptors and required slots |
| `src/features/session/composition/session.module.ts` | Thin typed factory adapter; concrete workflow remains in the use case |
| `src/features/session/composition/{identity,journal}.declaration.ts` | Slot-free input declarations |
| `src/features/session/composition/session.inputs.ts` | Imports both own input declarations and creates inputs |
| `src/features/session/composition/session.group.ts` | Lists the session factory entry, never the input entries |
| `src/features/runner/application/use-cases/run-job.ts` | One exported `(deps, input)` function for useful bounded runner behavior |
| `src/features/runner/application/ports/release-journal.ts` | Narrow runner-owned release-journal shape, with no cross-feature application import |
| `src/features/runner/adapters/outbound/test-resource.ts` | Test resource acquisition, effect and release witness |
| `src/features/runner/composition/runner.contracts.ts` | Runner map extends the imported session feature map; descriptors come from their visible owner |
| `src/features/runner/composition/runner-a.declaration.ts` | A's implementation identity of the runner capability revision |
| `src/features/runner/composition/runner-a.module.ts` | Typed factory; `scoped` exposes its resource scope |
| `src/features/runner/composition/runner.group.ts` | One static group containing A |
| `src/composition/semantic.root.ts` | Static A recipe listing the groups, session root and named inputs; no workflow |
| `tests/features/runner/runner-b.{declaration,module}.ts` | Compatible B entry used only by the suite and deliberate wrong-provider mutation |
| `tests/features/session/session.wiring.ts` | Handwritten feature provider/input pins and any non-completed rows |
| `tests/features/session/testing.ts` | Contract-owned suite and typed fakes |
| `tests/module/semantic.test.ts` | Root's own independent root pin, consumer assertions and test-only B mutation |
| `tests/module/packed-entry.ts` | Self-contained one-operation/close entry used by the existing packed harness |
| `tests/support/{attempt-owner,journal,barriers}.ts` | Semantic test lifetime, real file journal and deterministic controls |
| `tests/negative/empty-runner.ts` | The one intentionally invalid C-04b assignment |
| `tsconfig.{types,runtime,negative}.json` | Closed positive/runtime/negative projects; materialization rules are in the handoff |

Test lifetime and journal helpers stay in `semantic/tests/support/`, outside the
production `src` inventory. All semantic TypeScript imports resolve within the
materialized semantic tree or public packages; none reaches root driver support.
The packed hook copies this canonical tree and runs only `packed-entry.js`.
The runner adapter uses typed dependency values selected by composition. Its own
consuming boundary declares the narrow release-journal shape it needs; structural
assignment in composition connects it to the input. Application code imports
neither another feature's application files nor composition descriptors.
Public descriptors parameterize the explicit types in `contracts/`; application
code uses only its own narrow ports, including for capabilities owned by that
same feature. Module wiring makes the structural assignments. The session map
owns its descriptors; the runner map extends the session map through `import type`,
so the consumer-owned abstraction does not introduce a reverse map dependency.
Use `<feature>Group` exports with one member per line. Keep feature expectations
under their mirrored `tests/features/<feature>/` roots and graph expectations
under the root's own test.
Group membership is an assembly convenience, not a privacy boundary. A is the
only supported root recipe. C-02 constructs B's deliberately wrong subject in
test code, with exactly the selected B declaration inventory; no runtime selector
or unused B module lives in `src`. A supported B recipe would require its own
static root, `profileId`, positive oracle and smoke under the accepted CMS.

C-01 uses two unequal handwritten cases on the same prepared subject:
`" hello "` becomes `left:A:hello` and `" world "` becomes `left:A:world`.
Each has a distinct operation identity and exactly one matching journal effect.
B preserves the payload with tag B. These cases reject a constant-result stub.
They do not alone prove forwarding of the runner's returned value: in the same
C-01 test, use `isolate` on the session entry with a typed runner returning the
opaque literal `runner-result-7`. Require the session return and its terminal
record to equal that literal. This rejects reconstruction of an A-shaped result
after discarding the runner return, without adding another supported root.
The session-owned suite runs through `runContractSuite` against its typed fake,
A and B; implementation subjects use their actual entries through `isolate`.
Pin success/payload preservation, rejection of the named `!fail` request with
`fixture.runner.failed`, and cancellation before effect with
`fixture.operation.cancelled` and zero ordinary effects. These are fixture port
policies. L-05 separately verifies cancellation while work is pending. The wiring
oracle checks provider intent independently of the behavioral suite.

## C — Connected public consumer behavior

| ID | Schedule | Required oracle | Distinguishing negative |
| --- | --- | --- | --- |
| C-01 | Compile real files, prepare A, run the two normalized payload cases, close | Exact hello/world results, one matching effect per operation, owned resource released | A constant result or discarded runner result fails |
| C-02 | Select B while retaining A's handwritten oracle | `conformance.wiring.mismatch` identifies the wrong provider; B still passes the shared contract suite | Deriving oracle from the completed plan would incorrectly pass |
| C-03 | Reuse preparation for simultaneous `left` and `right` inputs/scopes; run another right operation after left closes | Exact independent results and a fresh right effect after left release | Shared mutable closure/scope contaminates the sibling |
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
5. Close the external journal only after startup/work settle, inner cleanup is
   `complete: true` and the required terminal write has finished.

Retain one active stop flight and its last settled close report. Cleanup failure
is an incomplete report, not a rejected `control.close()` promise. A subsequent
call to the same attempt owner's `stop()` after that flight settles retries debts;
do not cache the incomplete result
forever. An observer's `abandon` snapshot does not replace the owner's report or
release its authority/journal. `Symbol.asyncDispose` has a distinct throwing
contract. A cleanup awaiting its own or an ancestor's close deadlocks under the
[resources contract](../../packages/resources/README.md#closing).

| ID | Controlled schedule | Exact success oracle |
| --- | --- | --- |
| L-01 | Register the resource successfully, hold the valid factory return, stop, then release that return | Cancelled construction retains the created record; no facade/effect; external witness proves release |
| L-02 | Construction succeeds; hold test-owned readiness; stop; finish readiness | Readiness cannot reopen ingress/publish; attempt settles and closes; no Assembly readiness API is assumed |
| L-03 | Run stop-before-publication and publication-before-stop as separate schedules | First schedule has zero publication; second has one publication followed by closed ingress; no callback runs inside commit |
| L-04 | Accepted callback calls `requestStop`, then finishes | Callback completes; externally awaited stop completes; stop is not in its own drain set |
| L-05 | Accepted work waits for the operation cancellation signal | Stop itself triggers settlement without manually releasing that wait; journal remains writable until completion |
| L-06 | Acquire, then inject failure before returning the setup value; adapter catches it, awaits its successful partial release, then rethrows the named setup error | Exactly one physical release and the expected setup failure; no unowned partial handle or green-report-only substitute |
| L-07 | First cleanup fails before release; discard its report; invoke `stop()` on the same retained attempt owner after that flight settles | First report is settled/incomplete with the named failed debt; two cleanup attempts, one release; journal append/read works during retry, and journal closes last |
| L-08 | Two observers join one close flight; one abandons while release is held, then release finishes | Abandoning observer gets `settled: false`; the other gets complete settlement; exactly one cleanup flight and one release |
| L-09 | Hold immediately before the effect port's post-await permission check; revoke ordinary effect permission, then release the hold | Exact effect refusal and zero ordinary effects; cleanup/terminal journal operations remain authorized and succeed |
| L-10 | With capacity 1 and no queue, hold one operation waiting on cancellation; reject a second; request private stop; submit a third after stop | Stop signal settles the first without manual release; second overloads without runner entry; third refuses closed ingress; zero effects |

For L-07 include one test-local counterexample that closes the journal too early:
retry must fail because the borrowed prerequisite is actually unusable. For
L-04/L-05 the positive schedules are sufficient; do not add a deliberately
hanging variant to every mandatory lane merely to wait out its watchdog.
Logs contain bounded fixture identities and codes, not arbitrary causes,
capability objects or resource handles. Resource labels need not be unique IDs.

## R — Persistent snapshot and fresh worker

### One explicitly bounded profile

The store is a test-only JSON snapshot. Admit at most **32 records** and keep the
**64 KiB** canonical-byte cap. Each complete record is bounded by **1792 bytes**,
including every legal terminal field; the envelope is bounded by 4096 bytes.
Thus `32*1792+4096 = 61440 < 65536`: count admission leaves room for terminal
growth without a reservation allocator or compaction.

Let `B(v) = Buffer.byteLength(JSON.stringify(v), "utf8")`. Use this closed record
schema with all keys present, reconstructed plain values and compact JSON:

| Field | Allowed value and bound |
| --- | --- |
| `scope`, `id` | Strings with `B(value) <= 64` each; together identify the operation |
| `input`, `fingerprint` | Strings with `B(input) <= 896` and `B(fingerprint) <= 128` |
| `state` | `pending`, `claimed`, `terminal` or `quarantined` |
| `claim` | `null` or one 32-character lowercase hexadecimal claim identity |
| `cancel`, `cleanupDebt` | Booleans |
| `child` | `null` or `{ pid, started, exited, code, signal }`; positive safe-integer PID, boolean flags, null/signed-32-bit code, null/`SIGTERM`/`SIGKILL` signal |
| `result` | `null` or a fixed fixture result with `B(value) <= 192` |

The envelope is exactly `{ format: 1, profile, generation, records }`; profile
is one of the two below, and generation is a 32-character lowercase hexadecimal
provenance value. Reject unknown/missing fields and out-of-bound values on both
admission and recovery. Encoded-byte bounds include quotes and escaping. The
fixed result catalog must fit before accepting work; never truncate a result.
The maximal full record is 1596 bytes with all four boolean fields set to
`false` (five bytes each, compared with four for `true`). Envelope/commas for
32 records add at most 132 bytes. Verify that upper-bound vector once, including escaped strings;
it is not a new runtime quota mechanism. Keep diagnostics and histories outside
canonical state. Persisted claim/generation values grant no live authority.

The operation owner serializes transitions, not child lifetime. The adapter
performs validated read and replacement; it does not choose claim/cancel/retry policy.

Write a complete temp file in the same directory, sync it, close it, then rename
it to the canonical filename. Never delete the canonical file before rename.
Only the canonical filename is authoritative on recovery. Temp files, modification times,
intended memory values and undelivered acknowledgements cannot resurrect state.
A write/sync/close/rename error freezes the owner's ordinary transitions and
new launches until canonical reread/reconciliation succeeds, without a success
acknowledgement for the ambiguous command. Failed reread keeps admission closed.
Local cancellation, launch revocation and exit observation bypass blocked storage.
Create a valid empty canonical snapshot during setup; missing expected state on
recovery fails closed instead of resetting the store.

The test process is the live supervisor. It directly spawns worker and effect
child as siblings, retains their real handles, and receives child messages
directly. The worker runs the semantic consumer; its runner requests launch by
IPC and receives a child identity, never a transferred `ChildProcess` handle.
The supervisor confirms old-worker exit before allocating a fresh writer grant.
Separately, it checks the live grant, scoped operation and claim, then consumes
one launch permission synchronously before spawning. Replay cannot spawn twice;
cancellation/freeze revokes an unused permission. Snapshot data cannot restore it.
Two startup requests test live-supervisor exclusivity, not database locking.

Compare two fixture policies without choosing a future product policy:

| Profile | Accepted unclaimed work after worker loss | Claimed work without terminal evidence |
| --- | --- | --- |
| `record-only` | Retained/queryable; this profile does not automatically dispatch it | Reconcile/quarantine, never blind retry |
| `restart-pending` | Fresh worker continues it once after reconciliation and admission | Reconcile/quarantine, never blind retry |

Register IPC/event observers before releasing their named barriers. The supervisor
counts actual spawn/handshake and observes exit; a send callback, disconnect or
`killed` flag is not exit evidence. Cooperative stop uses an IPC message on every
supported lane; watchdog killing is failed-test cleanup only. That proves
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
| R-02 | Replace acceptance before claim, lose response, terminate worker, restart; observe reconciliation/dispatch before any resubmit, then query/duplicate | `restart-pending`: **1** launch/result before resubmit and no additional launch. `record-only`: **0** total launches, including after query/duplicate, and an explicit unclaimed record |
| R-03 | Commit cancellation before any claim; restart | **0** launches; cancellation remains recorded; duplicate submit does not start work |
| R-04 | Commit claim, kill before physical launch permission | **0** launches; quarantined/reconcile state with no new launch permission; a fresh worker may still receive a writer grant. Quarantine is not a live CPU occupant |
| R-05 | Supervisor creates child, kill worker before handle acknowledgement/result | **1** launch, no relaunch; supervisor retains the real handle, requests stop and observes exit |
| R-06 | Persist terminal result, lose response, restart/query/duplicate | **1** total launch; query returns the identical committed result without re-execution |
| R-07 | Establish one successful claim/launch, then commit cancel while work is held | **1** launch; cooperative child stops; explicit cancelled outcome; a late success cannot overwrite the chosen terminal state |
| R-08 | Below 32 records, hold one child at capacity 1, queue 0; check duplicates/conflict/unrelated submit. Separately exercise a fresh store with no process admission | **1** total physical launch; duplicate lookup precedes admission, conflict rejects, unrelated work hits active-capacity overload. Store-only acceptance 33 returns `fixture.store.record-cap` with unchanged canonical bytes; legal existing-record terminal growth succeeds |
| R-09 | Fail canonical replacement during cancellation while child is alive | Local control stops the child; total launch stays **1**; no durable-cancel acknowledgement is fabricated; query/reconcile reports last known committed facts |
| R-10 | With valid state and no incumbent, compete startup requests; send stale old-grant launch message; open older snapshot in read/reconcile-only mode | Exactly one writer grant; **0** launches from denied/stale/restore requests; no activation from the restored file |

R-02 additionally checks liveness: a pending implementation that never dispatches
fails even though its launch count is at most one. R-04 and R-05 are distinct:
claim is not physical start, and absence of a worker handle is not proof that no
child exists. R-05 verifies actual exit before returning its process slot, while
a separately injected file cleanup debt may remain.

Also hold a current-grant launch request after claim, establish revocation, then
deliver the delayed request: it launches zero children. Replaying an already
consumed valid request adds zero launches. These small permission checks do not
add a second writer or a generic fencing engine. Keep R-08's live-child assertions
below 32 records, so storage capacity cannot mask the active-child limit; stop
and observe that child's exit. Its separate store-only case starts with a
fresh valid snapshot and no worker, child, dispatcher or active-child admission
predicate. Through the store interface accept 32 valid pending records, require
the fixture-only `fixture.store.record-cap` outcome for record 33 with unchanged
canonical bytes, then prove legal cancel/child/result growth of existing records
within the byte cap. Synthetic stored child fields are adapter-capacity evidence,
not physical-child evidence. One escaping-aware schema boundary vector covers
byte limits separately from process scheduling.

Mutate canonical bytes to invalid state. Parameterize one storage-failure check
over write, sync, close and rename using a narrow filesystem-call fault seam;
keep the real files and retain handles for teardown. Do not multiply these faults
by every R row/profile or depend on OS permission tricks. For faults known to
precede replacement, verify that old canonical bytes remain unchanged. After
ambiguous completion, reread and reconcile the actual canonical bytes instead.
Verify that no ordinary command/launch passes the freeze. Admission fails closed;
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

The initial TEST scope is flat, with the composition contracts already prescribed
by the accepted CMS file map. Record the v1 base authority
(`d0bfff2033faf544fe65268c1dcdfd524d093015`), current CMS source and its pinned v1.1
composition-contract reference (`bd949a9a670862fea851a7791fce772fdef3b4fc`) as
distinct research predicates. Do not hide the `*.contracts.ts` surfaces to make
a flat pass. The adopted GM v1 profile stays unchanged; a candidate v1.1 tool
neither migrates that profile nor proves complete standard adoption by installation.

| ID | Source mutation or positive | Required evidence |
| --- | --- | --- |
| A-01 | Complete flat semantic/growth tree; delete an expected source file | Disk census and compiler identify missing input; no reduced green fixture |
| A-02 | Valid public feature edge, then private relative/alias/workspace/self-package edge | Allowed edge passes; each unsupported/private edge is resolved and rejected or rejected by an explicit syntax gate |
| A-03 | Missing relative target, unknown external and parse failure | Each remains visible in the report; no dropped fact creates an `ok` result |
| A-04 | Dynamic import with a computed specifier or loader alias | Shared collector supplies the fact, or an actual complementary gate rejects the unsupported form |
| A-05 | Observe flat re-export/import-then-export as dependency uses; separately scoped nested republication cases remain deferred | Flat provenance or an enforced subset; no claim of declared nested republication from a flat tree |
| A-06 | Actual flat type/runtime edges and the recipe's composition contracts | Declare the actual contract surfaces and pass `moduleComposition`; reject application-to-composition-contract use; preserve use/load-cycle distinctions |
| A-07 | Input declarations consumed through `session.inputs.ts` (or growth's `f000.inputs.ts`); delete an import, then separately place an input in a group | CMS `conformance.layout.violation` with `orphan-declaration`; separately Assembly `assembly.bind.invalid-group` |
| A-08 | Valid single-function use case, extra runtime export, missing root and scanner overflow | Observed export facts and full inventory drive the rejection; generator assertions do not substitute for scanning |

| Predicate scope | Baseline applicability | Additional scope |
| --- | --- | --- |
| A-01–A-04, A-07, A-08 | Required for selected flat source; missing observations are incomplete | Repeat only for changed syntax/ownership predicates |
| A-05 | Flat re-exports remain observed ordinary uses | Declared/undeclared nested republication and visibility are deferred |
| A-06 | Flat edge/cycle and CMS composition-contract predicates are required; missing observations remain incomplete | Nested visibility, upward-use and republication cases are deferred |

Use one oversized disposable source for A-08's overflow at the selected reader's
observed per-file bound; no huge file swarm is needed. Its export mutation must
reach CMS `use-case-export` through real source observations. Missing required
facts are `incomplete`; unselected additional semantics are `not-selected`, never
passed. Generator records can test a pure function, not source integration.
Keep broader CMS/FMS rules mapped to their actual check/review or incomplete
coverage. The root repository gate and Runtime's historical scanner envelope
do not supply this fixture's structural result.

## G — A real file tree with bounded useful computation

For N features, generate seven files per feature: `contracts/value.ts`,
`application/ports/value.ts`, `application/use-cases/read-value.ts`,
`composition/<feature>.contracts.ts`,
`composition/value.declaration.ts`, `composition/value.module.ts`, and
`composition/<feature>.group.ts`. Add the root and, in `f000/composition/`,
`input.declaration.ts` plus `f000.inputs.ts`. The latter imports the declaration
and exports the input entry; root includes it only in `inputs`.
Thus the baseline is **7N+3 TypeScript files**, plus separately counted configs,
feature cards, test oracle files and generated output. No file is counted twice.

The provided port type lives in `contracts/value.ts`; each application owns its
narrow read port and never imports another feature's application or its own
public contracts. The `(deps, input)` use case reads those local ports; the
module maps provider values into them. Under
[ADR-0041](../decisions/0041-preserve-complete-feature-maps-with-descriptor-unions.md),
each feature exports a complete `FeatureContracts` union of its own descriptors
and its predecessors' complete contract unions, imported through `import type`.
Its interface extends a separate `CapabilitiesOf` base for each predecessor
union plus its own descriptors, one member per line. Derive both lists from one
predecessor list and verify full key/value/token parity, including unused keys.
Do not combine predecessor unions in one mapped base: separate bases retain
TS2320 for conflicting unused contracts. Historical direct map-inheritance
subjects keep their identities and results. A shallow direct-used-descriptor
map does not qualify either complete-map recipe, and old compiler timings do
not transfer to the new recipe. Keep counters in test-owned wrappers
using public `implement`, with module source limited to typed wiring. Groups and
feature/root oracle ownership follow the semantic recipe's accepted rules.

Entry 0 consumes the input. Entry 1 consumes entry 0. Entry i for i >= 2 consumes
the sorted unique set `{i-1, floor(i/2)}`. In particular i=2 has one predecessor,
not two duplicate slot names. The last entry is the root, all entries are
reachable, and every feature has one group of depth 1.

Each factory reads predecessor scalar values once and stores its own scalar.
Its exported port returns that scalar in O(1); it does not recursively traverse
the dependency DAG on each call. Freeze input seeds to **17 and 23**.
With M=1,000,003 and selected seed s:

- `value[0] = (31*s + 1) mod M`.
- `value[i] = (17*(i+1) + sum((j+1)*value[j])) mod M`, over its unique predecessors.

For the selected N <= 1000, intermediates remain exact JavaScript integers.
Use each feature's own typed contract and literal descriptor map, without type
casts that erase capability identity. Independent expected arithmetic does not
import the generator, fixture factory, completed plan or emitted implementation.
Feature names are `f000` through `f999`; provider capability IDs are
`fixture/growth/<feature>/value`, module IDs `fixture/growth/<feature>`, and
implementation IDs `fixture/growth/<feature>/default`, at revision 1.
The input uses capability `fixture/growth/seed` and implementation
`fixture/growth/seed-input/default`; the last provider is the root. Expected
pins are a separate test-owned routine over this written naming rule, never
imports from the generator or its generated provider table. Required rows are
completed normally; do not duplicate them in an expected-row catalog.
The literal small oracle for seed 17 is
`[528, 562, 1175, 4717, 22478, 116017, 715089, 24612]`;
seed 23 yields root `603377`. These values make ignored dependency results visible.

| N | Declarations, including input | Entries + groups | Required rows/occurrences/distinct edges | DAG path nodes | TS source files | Full smoke attempts / factory calls |
| --- | --- | --- | --- | --- | --- | --- |
| 8 | 9 | 16 | 13 | 9 | 59 | 17 / 80 |
| 100 | 101 | 200 | 197 | 101 | 703 | 201 / 10,200 |
| 500 | 501 | 1000 | 997 | 501 | 3503 | 1001 / 251,000 |
| 1000 | 1001 | 2000 | 1997 | 1001 | 7003 | 2001 / 1,002,000 |

Full ordinary smoke is `1+2N` attempts and `N(N+2)` factory calls, excluding
preparation, allocations, lookup and cleanup costs. For 1-based construction
position i and fan-in e_i, dependency-capability retrievals contribute
`sum(e_i * (1 + 2*(N-i+1)))` under these ordinary terminating factories.
Record actual values and distribution; these formulas are not timings.

| ID | Experiment | Oracle and stop condition |
| --- | --- | --- |
| G-01 | 8-feature compile/run/oracle/full smoke | Exact literal values and census; compatible wrong provider changes result and violates independent pin |
| G-02 | 100, then 500, then 1000 as separate comparisons | Independent `checkWiring` provider/input/root pins, checksum, inventory and full smoke at every size; stop at first ceiling/watchdog/budget failure |
| G-03 | Cold build, no-op incremental, leaf-body edit, shared-contract edit | Fixed semantically valid edits and isolated build-info; record compiler counters and elapsed stage times |
| G-04 | One targeted 64-provider ordered-many case, only when fan-in is the investigated risk | Independent pins include the exact ordered `many` row; order-sensitive value and one complete root smoke; no blanket matrix |

The sparse profile already contains a chain; another chain is unnecessary until
a specific depth boundary is investigated. G-03 uses fixed patches: the last
feature changes its own checksum term from `17*(i+1)` to `17*(i+1)+1`; its expected
root changes by one modulo M. The shared-contract patch changes exactly six
files: f003's public port renames `read` to `readValue`, its descriptor revision
advances from 1 to 2, its provider module implements the renamed method, and the
module mappings in f004, f006 and f007 adapt that method into their unchanged
local read ports. Consumer application ports/use cases do not change. All consumers
use the same descriptor, the checksum stays equal, and no type cast bridges the
change. Freeze those patches before comparing baseline and candidate. Current compiler/NodeNext measures growth; the small
case retains the supported current/minimum compiler and NodeNext/Bundler checks.

## W — Runtime instances are a separate dimension

| ID | Fixed schedule | Exact oracle |
| --- | --- | --- |
| W-01 | Two instances; hold left, complete right, cancel/close left, then run another right operation | Fresh right result/effect after left release; left settles from cancellation; no cross-instance contamination |
| W-02 | 16 instances, four requests each, no queue, one shared limit 16; hold accepted counts `(2, 1×14, 0)` across instances 0–15, then submit the rest | Exactly 16 accepted/48 overloaded and peak 16; only accepted IDs enter runner; cancel a singleton instance before effect, giving 15 successes and one cancellation |
| W-03 | After W-02 work settles, fail instance 15's resource cleanup before physical release; discard the first report, then call the same attempt owner's `stop()` again | First report is settled/incomplete with the named debt; second flight completes; 17 total cleanup attempts and 16 single physical releases; every attempt/journal closes, including instance 15 with no accepted work |

The shared synchronous admission count is test orchestration; each accepted
operation remains owned only by its session. Release its permit on terminal work
settlement. There is no additional per-instance limit of one from L-10's separate
case. Use fixture-owned overload/closed discriminants, not invented Assembly codes.
Record all 64 admission outcomes before cancelling or releasing work. Cancellation
must settle its held operation through the signal alone. Then release other holds.
Each of the 16 instances acquires one witnessed runner resource; W-03's injected
failure is before release, not a post-release storage debt. Final active work is
zero, every inner close is settled/complete without debts, and terminal writes
and retries precede each borrowed journal's close.
At the existing final journal read after stop/retry settlement, compare the
complete observed runner-entry list with the accepted IDs, sorting both lists
without removing duplicates. Serialize that observed list. A check only at the admission
barrier cannot exclude a rejected or duplicate request entering later.
Watchers are zero. Preparation is reused for the unchanged factory set;
per-run inputs, scopes and state are distinct. Neither this workload nor G-02
establishes a product SLO, network behavior, OS containment or Runtime capacity.

## H — One fresh author and bounded diagnosis

These exercises can run before growth. Use a disposable copy and retain the
patch/report; they do not add a permanent provider or another supported root.

| ID | Supplied task and allowed edit | Exact outcome |
| --- | --- | --- |
| H-01 | Withhold B's two test-owned declaration/module files from the P1 exercise copy; supply its existing identity, unchanged Runner contract and owner suite. Author only those files and its module-test subject/oracle | Fake/A/B suite passes; B produces exact `left:B:hello` and `left:B:world` effects and closes; A's unchanged pin rejects B before the separately specified B pin passes |
| H-02 | Give the diagnostician C-02's public provider mismatch, recipe and file map, without the injector's answer | Identify compatible-but-unintended B, expected A and the minimal test/root selection repair; do not repair the deliberately correct A oracle |
| H-03 | Give L-01's bounded attempt identity, startup pending/stopping state, cancellation request, publication count and deadline | Diagnose retained pending construction and unavailable public factory attribution; then external stop/release yields cancellation, zero publication/effects and witnessed cleanup |

H-01 keeps B test-only, A's production group/root and all contracts unchanged;
there is no extra supported-root smoke obligation. The supplied owner suite and
independent expected identities are not editable to hide a failure. H-02/H-03
reuse their existing cases, not another diagnostic framework. Injector knowledge
is test-control evidence, not a public inspection result. Use a separate fresh
diagnostician with only the public error code/details, recipe/file map and owner
observations; exclude authoring tests, injector code, answer annotations and the
author's report. A watchdog alone does
not pass H-03. Record actual changed files and unexplained guesses once. One
successful task/diagnosis or one reproducible blocker ends each exercise; full
gates run on the coherent final patch, not on every intentionally broken mutation.
