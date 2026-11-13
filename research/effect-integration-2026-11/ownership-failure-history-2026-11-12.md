# Effect ownership failures: fixes and verification methods

Observed 2026-11-12 for the [production-hardening plan](production-hardening-plan-2026-11-12.md).
This supplements the [OpenCode audit](opencode-audit-2026-11-12.md) and
[project comparison](effect-projects-2026-11-12.md) with actual fix history.
It is source research, not a second usage standard or an upstream test run.
The [packaged practices guide](../../packages/effect/docs/practices.md) owns usage
guidance; ADR-0043 retains the native-construction boundary.

## Evidence selection

The reviewed snapshots are unchanged from the first audit. Their relevant files,
commit patches and regression definitions were fetched again through GitHub.
Historical fixes establish what changed and what their tests target, not that a
current deployment still has that defect. PR descriptions are attributed reports;
their claimed runtime reproductions were not independently repeated here.

| Project | Inspected snapshot | Source-selected Effect |
| --- | --- | --- |
| OpenCode | `becb9c7c9f3907257d12e95993a47ccc6e3b9625` | [4.1.0][oc-version] |
| LiveStore | `54e5a23a29e2c48a8abeff2253fb314767c4243a` | [4.0.3][ls-version] |
| T3 Code | `fc2b5de20cb572d2333e03284466e3c804d25c84` | [4.1.2][t3-version] |
| Alchemy | `21c601276a5c34eeb25bd7dc81dcca03be9e72eb` | [4.1.4 override][al-version] |

These manifest/lock selections are not installed-tree evidence. Historical fixes
can predate those selections; LiveStore's history includes Effect 4 prereleases.
Nothing here broadens GM's exact qualified peer, Effect 4.1.4, or proves equivalent
behavior across versions. GM comparison base is `6169d018935444bde08d43c30bb9a6a9fa9efbd3`.

## 1. OpenCode: failure and invalidation need attempt identity

[Fix #46957][oc-retry-fix] changed failed Location initialization from a retained
failed lookup into a retryable cache entry. Its implementation associates a
distinct object with each build. A late failure only invalidates the entry if it
still owns that identity; it cannot remove a replacement installed under the same
Location key. Failed-build cleanup runs in the owner scope because invalidating
an entry with no borrowers can close its scope and join the lookup fiber that failed.
Doing that join from the same fiber would create a self-wait.

The patch's regressions cover repaired configuration, concurrent failed borrowers,
explicit replacement before the old build fails, and all acquisition scopes
closing before a late failure. They use Deferred handshakes for the in-flight
build. Some filesystem cases are intentionally skipped on platforms where the
chosen failure cannot be induced; those skips are not successful execution.
The [inspected implementation][oc-map] retains the attempt-identity guard and also
shuts down a successful build that was detached while still starting.

**Transfer to GM:** one failed graph attempt must release its owned resources;
a later independent build must be usable without stale state from the first.
Exercise reuse of the prepared graph with fresh native build ownership. This is
not a mandate for GM to add a cache or invalidate Effect's intentionally memoized
failure inside an existing memoization domain. Location identity, eviction and
replacement remain the application's concerns.

## 2. OpenCode: shutdown order and retention are separate problems

[Fix #59326][oc-close-fix] added concurrent closing of Location scopes, including
borrowed ones. Its regression makes three finalizers wait until all three have
started. Sequential closing would leave the first waiting alone. The fixture uses
a Deferred rendezvous with a five-second timeout to detect that missing overlap;
it is not a throughput benchmark. A valid dependency DAG says nothing about this
additional finalizer-wait relationship.

There is important counterevidence to copying the patch literally: its close loop
converts each result to an Exit and discards those values. That enables attempted
sibling cleanup but does not preserve the returned causes for its caller. This
same limitation was recorded in the first audit. GM must retain the native Cause
contract already tested; concurrency and error reporting are different decisions.

[Fix #59399][oc-holder-fix] addressed a different ownership edge. Long-lived socket
holders now release their Location when shutdown is signalled, allowing its scope
to close. The same change prevents idle eviction from repeatedly closing and
reopening active terminals or MCP sockets. Its warning test advances TestClock
and distinguishes a borrower that remains from one that releases on shutdown.
Its idle-sweep test instead uses a custom clock plus polling; it is not wholly
barrier-controlled. These are inspected definitions, not new local pass counts.

**Transfer to GM:** distinguish keeping a resource alive from joining work that
uses it. A partial-startup test should hold a dependent finalizer behind a barrier
and prove that its provider remains usable and the build has not completed.
Do not introduce Location retention, socket supervision or universal parallel
finalization into the adapter. The consumer owns those relationships.

## 3. LiveStore: the same guarantee must cover every exit path

[Commit `be15cefd`][ls-scope-fix] fixes a concrete gap between explicit
`store.shutdown()` and closing the Scope that created the store. Previously the
latter directly closed the lifetime scope, potentially interrupting a leader push
before the last admitted event was acknowledged. The fix routes both paths through
one teardown owner; failed/interrupted exits retain their different drain policy.
The [current store code][ls-store] shares the first teardown fiber and separates
the caller's one-second wait from the drain timeout and eventual scope closure.

The [store-level regression][ls-scope-test] commits one event and closes the owner
scope. It checks acknowledgement after close, using a deliberately slow leader
with a 50-millisecond sleep. That is useful boundary coverage, but it does not
justify copying sleeps into new GM race tests. GM can park acquisition/finalization
with explicit handshakes and assert the same ordering without a timing assumption.

The wider [processor regressions][ls-barriers] already demonstrate that method:
an in-flight push signals entry, shutdown waits for drain admission, and the test
then permits the push to complete. The oracles inspect actual persisted batches,
FIFO order and maximum active push count, not just queue constructor options.
Separate rebase tests park at named transition points; comments identify them as
replacements for flaky virtual-time injection. Their source checks no-loss after
admitting an event during rebase and after shutdown intersects rebase.

The [soft-timeout regression][ls-soft-test] deliberately verifies that the public
wait completes while a blocked push is neither completed nor interrupted, then
releases it and observes completion. This is positive evidence for an explicit
contract, not proof of physical cleanup by the first return. A drain-phase timeout
also cannot impose a hard deadline on arbitrary uninterruptible finalizers.

### The useful warning against overengineering

LiveStore [PR #1439][ls-revert] reverted an earlier fix for real shutdown event loss
because its pull, rebase, recovery and terminal-failure states had become too
interdependent. The PR reported twelve retained but skipped specifications and
explicitly acknowledged restoring the known bug. Skipped specifications preserve
intent; they do not prove the implementation satisfies it.

The narrower [replacement #1451][ls-replacement] introduced one processor shutdown
owner and serialized existing ownership rather than redesigning the entire rebase
state machine. Its description still reported three skipped simulation cases.
Those historical counts must not be presented as current execution. The inspected
later snapshot contains the explicit barrier cases described above.

**Transfer to GM:** adopt the independent failure oracles and bounded repair
discipline. GM has no client event log or durable-drain promise, so adding a queue,
rebase state machine or detached teardown manager would copy the wrong owner.
Existing native construction tests can cover partial failure, cancellation and
rebuilding while preserving the small mapper.

## 4. T3 Code: a freed worker slot is not a finished operation

[Fix #35027][t3-worker-fix] prevents unanswered provider starts from occupying every
daemon loop. The patch forks each attempt into the daemon scope and times out only
the loop's wait. The underlying attempt and its persisted running row survive.
The [regression][t3-worker-test] blocks selected starts, advances TestClock and
checks that another thread can begin. It does not assert that the blocked requests
have ended. Existing per-thread claim exclusion and the title-generation limit
still apply; this is not unrestricted overlap for every job.

[Fix #27252][t3-stop-fix] separately stopped interpreting an unresponsive interrupt
request as a successfully stopped agent. Its source adds a typed interrupt-timeout
error and preserves the still-open turn. Shared-session release checks other busy
threads and verifies runtime identity before accepting work on a captured runtime.
Its [manager tests][t3-stop-tests] include a never-answering interrupt and attempts
to use a released runtime after a replacement appears under the same ID.

**Transfer to GM:** preserve failure/interruption distinctions and make the unit
of a limit explicit. A timeout does not erase outstanding work from capacity
accounting. Process termination, user-facing stop status, outbox scheduling and
shared-session fencing belong to the product; they are not missing GM APIs.
The first audit already identified the slot-wait distinction; the fix history
explains why it is a deliberate availability tradeoff, not an inferred leak.

## 5. Alchemy: retain complete causes and useful immediate diagnostics

[Fix #3218][al-diagnostics] adds the underlying error to failed deletion and drift
status events. The complete Cause was already aggregated at the end; the change
makes the failed resource explain itself while siblings are still settling. Its
regression checks both overall failure and the per-resource diagnostic. Preserving
a final error and making ongoing failure observable are separate obligations.

The earlier [destroy fix #899][al-destroy] keeps failed resource state for a later
attempt and rejects missing provider identity before partial apply. That is a
durable infrastructure protocol. It cannot be replaced by, or inferred from,
native Scope finalization. GM already has a regression for multiple finalizer
defects and dependency-safe file closure; this study does not justify duplicating
Alchemy's state store or cleanup-retry engine in the Effect mapper.

## Consequences for this delivery

| Observed risk | Smallest relevant GM evidence | Boundary retained |
| --- | --- | --- |
| Partial startup publishes failure while sibling cleanup is unfinished | Barrier-controlled parallel startup failure; original error, no root-use publication, provider alive through dependent cleanup | No universal startup coordinator |
| Cancellation overlaps successful resource acquisition | Controlled acquisition handoff; native interrupt request, late success, exactly-once release and joined cleanup | No promise that arbitrary foreign I/O aborts or rolls back |
| A failed attempt contaminates the next | Reuse the prepared graph in independent native scopes; distinct resource identity and complete release counts | No new retry/cache policy |
| A race test accidentally relies on scheduling speed | Explicit Deferred handshakes and independent counts/order/identity; timeout only as a hung-test guard | No synthetic benchmark marketed as a capacity guarantee |

These proposals inform the maintained public-package tests and guide; their
implementation and actual results belong to the production-hardening delivery.
The histories do not reveal a new GM production defect by themselves. Their value
is identifying precise failure transitions to verify before a consumer relies on
the library, while leaving application policy with its existing owner.

[oc-version]: https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/package.json#L78
[ls-version]: https://github.com/livestorejs/livestore/blob/54e5a23a29e2c48a8abeff2253fb314767c4243a/pnpm-workspace.yaml#L36-L42
[t3-version]: https://github.com/pingdotgg/t3code/blob/fc2b5de20cb572d2333e03284466e3c804d25c84/pnpm-lock.yaml#L339-L341
[al-version]: https://github.com/alchemy-run/alchemy/blob/21c601276a5c34eeb25bd7dc81dcca03be9e72eb/pnpm-workspace.yaml#L292-L295
[oc-retry-fix]: https://github.com/anomalyco/opencode/commit/36da0d5c77b58bca73ed0776d6f628723a9b8813
[oc-map]: https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/core/src/location-services.ts#L20-L55
[oc-close-fix]: https://github.com/anomalyco/opencode/commit/0ca7885f2656d53f37627146f23370b0ce113cc5
[oc-holder-fix]: https://github.com/anomalyco/opencode/commit/1908fcb8b7f6ed7172bebc33ef5c8ebc07575af0
[ls-scope-fix]: https://github.com/livestorejs/livestore/commit/be15cefd3023fe4655d78ad81273e90a8f8be705
[ls-store]: https://github.com/livestorejs/livestore/blob/54e5a23a29e2c48a8abeff2253fb314767c4243a/packages/@livestore/livestore/src/store/create-store.ts#L324-L430
[ls-scope-test]: https://github.com/livestorejs/livestore/blob/54e5a23a29e2c48a8abeff2253fb314767c4243a/tests/package-common/src/client-session/ClientSessionSyncProcessor.test.ts#L1640-L1680
[ls-barriers]: https://github.com/livestorejs/livestore/blob/54e5a23a29e2c48a8abeff2253fb314767c4243a/tests/package-common/src/client-session/ClientSessionSyncProcessor.test.ts#L681-L935
[ls-soft-test]: https://github.com/livestorejs/livestore/blob/54e5a23a29e2c48a8abeff2253fb314767c4243a/tests/package-common/src/client-session/ClientSessionSyncProcessor.test.ts#L1293-L1333
[ls-revert]: https://github.com/livestorejs/livestore/pull/1439
[ls-replacement]: https://github.com/livestorejs/livestore/pull/1451
[t3-worker-fix]: https://github.com/pingdotgg/t3code/commit/cbc38a1b0f9a23f823a0e7e0189fcb0d88f38872
[t3-worker-test]: https://github.com/pingdotgg/t3code/blob/cbc38a1b0f9a23f823a0e7e0189fcb0d88f38872/apps/server/src/orchestration-v2/FoundationPersistence.test.ts#L3257-L3349
[t3-stop-fix]: https://github.com/pingdotgg/t3code/commit/6b1245cceda1d504b6f16b438e16f2a2e08f3388
[t3-stop-tests]: https://github.com/pingdotgg/t3code/blob/6b1245cceda1d504b6f16b438e16f2a2e08f3388/apps/server/src/orchestration-v2/ProviderSessionManager.test.ts#L1373-L1527
[al-diagnostics]: https://github.com/alchemy-run/alchemy/commit/5891dbeceef3514142c0af4214014cafb3d69785
[al-destroy]: https://github.com/alchemy-run/alchemy/commit/eb63af6d2eefdfbcbcbd354b88cd04074c975657
