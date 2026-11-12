# Native Effect production hardening

Observed 2026-11-12. Comparison base:
`6169d018935444bde08d43c30bb9a6a9fa9efbd3` (merged PR #238).
[PR #239][pr] owns the reviewed delivery, exact source revision, repository gates
and final merge/CI results. This report follows the [hardening plan][plan].

## Result and scope

No production mapper defect was reproduced in this follow-up. The existing
constructor preserves its native resource/error contract under the new adversarial
cases. This delivery closes concrete evidence and guidance gaps: partial parallel
startup failure, interruption during a foreign acquisition, and rebuilding after
failure or interruption. A small command-inventory mismatch introduced while
adding the new suite was found in review and corrected before delivery.

The integration remains a small optional adapter over Assembly's one neutral
preparer. There is no new production API, executor, cache, scheduler, retry engine,
lifetime language, dependency or provider-selection authority. Ordinary
Core/Assembly remain independent of Effect. The qualified peer is still **4.1.4**;
the selected Effect upstream fixes are already present in its release source.

The resulting judgment is **qualified library construction with stronger
production failure-path coverage**. It is not a claim that an unspecified
application is ready to serve its production workload. The [accepted decision][adr]
separates library qualification, coordinated publication and actual product
adoption. Source version `0.0.0` still identifies the implemented, unreleased
candidate; this work does not publish it or substitute released Assembly 0.7.1
for the matched candidate build.

## What changed and why

| Change | Concrete protection |
| --- | --- |
| Two maintained [lifecycle cases][tests] | Exercise the actual lowered graph with real FileHandles, causal barriers, independent counts/order/identity and no successful root publication after failure |
| Same Layer reused after both failure modes | Detect stale state across independent native builds while retaining native sharing inside a build |
| Existing test commands, admission inventory and source boundary extended | The cases are required in normal verification, not an optional script or untyped scratch experiment |
| [Installed-archive suite][archive] increased from 18 to 20 native cases | Repeat both new scenarios against extracted matched public packages; keep ordinary Assembly-without-Effect and portable declaration checks |
| [One packaged guide][guide] extended | Explain atomic ownership handoff, cancellation latency, retry semantics, all supported exit paths and a discoverable failure-to-test map |
| Two additional primary-source studies | Record actual regressions, corrected mechanisms, counterevidence, version pins and applicability without copying product policy into GM |

## Deterministic observations

### Partial parallel startup

Two independent roots depend on one real file provider. One branch registers its
finalizer and signals that registration before the other may fail with a known
`BootFailure`. The first branch's cleanup waits behind a Deferred barrier.

While it waits, no root-using operation has run, the build Promise has not
completed, the provider has acquired once and released zero times, and the file
is still readable. Releasing the barrier lets dependent cleanup finish before
the provider closes. The final Cause contains the exact original failure object;
there is no defect, and the actual file descriptor is closed.

The same returned Layer is then provided again through a new native build/Scope.
The new attempt succeeds with a distinct FileHandle; both attempts acquire and
release exactly once. This demonstrates independent build recovery, not automatic
retry or resetting a failure in a still-retained shared MemoMap.

### Interruption during acquisition

The test requests cancellation after a foreign open callback enters but before
it is allowed to acquire the file. The foreign operation intentionally has no
abort contract. Default `acquireRelease` protects acquisition and installation
of its finalizer as one ownership handoff.

The late successful result is owned rather than lost. A second barrier holds
asynchronous close; the file remains readable, no successful root is published,
and the native caller stays pending. Only after actual close does the caller
complete with interruption, no expected failure and no defect. A fresh provision
of the same Layer then succeeds and closes its separate file.

This proves native joining and physical file closure in this finite fixture.
It does not prove a hard shutdown deadline, cancellation of every SDK call, or
rollback of an external operation. The adapter that owns such I/O must establish
those additional contracts. An acquisition that never settles can keep native
interruption waiting.

### Rejecting false cleanup bookkeeping

An isolated, strictly typechecked copy omitted only the first test provider's
actual `file.close()` while retaining its release counter and success event.
The test failed on `FileHandle.fd === -1`, with one assertion failure and no
cancelled tests. Its cleanup closed the intentionally retained handle.
The [retained control receipt and output][control] identify the source digest,
exact mutation, compiler and expected rejection. Production source and the
maintained test were not mutated. This checks that counters alone cannot produce
a false release pass; no mutation framework was added.

## Industry lessons selected for adoption

The [Effect/Hazel study][industry] and [ownership history][history] retain the
complete source links, dates, revisions and qualifications. All upstream tests
were read, not executed in this delivery.

| Evidence | Adopt or adapt | Do not infer or copy |
| --- | --- | --- |
| Effect semaphore and HTTP-upgrade fixes | Treat acquiring ownership and installing cleanup as one handoff; test expected failure and interruption separately | Another semaphore or generic cancellation runtime in GM |
| Effect replaced-stream scope leak | Register cleanup independently of whether a worker has started | A promise that every native combinator aggregates every losing finalizer defect |
| Effect HTTP request ownership and Hazel per-request RPC | Keep shared service identity separate from each execution's Scope/context | A request-object cache or a generic Context-pruning helper with unchecked types |
| OpenCode failed cache builds and shutdown cycles | Identify stale attempts at the cache owner; distinguish dependency, retention and finalizer-wait relationships | Automatic cache invalidation, sequential close of every owner or discarded cleanup causes |
| LiveStore Scope-close drain and reverted complex repair | Verify all supported exit paths and repair the existing owner with independent oracles | A second shutdown state machine; treating skipped specifications as passes |
| T3 Code timeout and stop fixes | Distinguish stopping a wait from settling live work; keep truthful failure/stop status | A claim that loop concurrency bounds all still-running operations |
| Hazel read retries and Alchemy diagnostics | Classify errors at the adapter, bound retries, preserve final causes and useful immediate diagnostics | Blind retries of uncertain writes or a durable resource engine inside native Scope cleanup |

The new Hazel snapshot is `21202479f5f733a6cc91ef2f5e783b661bed2b7e`, selecting
Effect 4.1.1 in its catalog. It was chosen for its request-bound full-stack
architecture and external adapters, not an asserted traffic level or popularity
ranking. Earlier OpenCode, LiveStore, T3 Code and Alchemy pins retain their own
versions. Those versions do not expand GM's exact qualified peer.

## Verification and review

Local focused execution used Node **24.22.1**, TypeScript **7.0.2**, Effect
**4.1.4** and pinned Bun **1.4.3**. Ambient `NODE_PATH` was cleared so external
tools did not affect the repository's dependency resolution.

- `bun run effect:check`: source/public-type/test-tooling checks succeeded;
  **24 tests passed** (20 native construction/consumer/lifecycle cases plus four
  package-admission cases), with zero failures, cancellations or skips.
- Installed-archive qualification: **20 native cases passed**, plus the matched
  public export surface, README example, NodeNext/Bundler portable types and
  ordinary Assembly construction while Effect was absent.
- The isolated negative control typechecked and rejected the omitted physical
  close as intended; it is not included in the successful test count.
- The repository's changed/fast/full gate and exact-head remote outcomes are
  retained by [PR #239][pr]. Focused success alone is not their substitute.

Three review rounds covered the initial boundary analysis, the concrete plan and
the actual code/docs. Review refined the two fixtures to avoid duplicate recovery
tests, clarified Scope versus memoization ownership, and corrected the new suite's
exact command/required-test inventory in `architecture/checks/leaf-packages.ts`.
The broader command gate still requires every existing case. No required check,
immutable ADR, public API baseline or compiler floor was weakened.

Existing malformed-product coverage rejects a hostile product and releases its
already-acquired synthetic dependency. It is not described here as a separate
real-resource acquisition inside the malformed factory. Existing 1,000-node graph
and type-scale evidence retains its earlier measured shapes and limits; this
delivery does not claim a new capacity benchmark.

## Production boundary and engineering judgment

The library can supply checked composition and native resource construction.
A named consumer must still qualify the workload it actually admits: startup
readiness, operation ownership, foreign-I/O settlement, resource capacity, stream
delivery, observability and shutdown behavior where relevant. These decisions
belong in that application's existing owners and tests. No universal subsystem
is required merely to complete an abstract checklist.

For a large TypeScript application with concurrent work, resourceful services,
streams and several external adapters, the engineering judgment is **9/10** for
Effect's usefulness and **8/10** for the additional difficulty of maintaining the
same guarantees without it. These are subjective design scores, not benchmark
results or a claim of eight times the effort. They assume consistent native
usage, a team familiar with Effect and preserved ownership boundaries. Straightforward CRUD
with few resource lifetimes has a smaller benefit and may not justify the same
learning and integration cost. Effect does not itself establish domain design,
idempotency, capacity, safe foreign-I/O cancellation or correct product policy.

[pr]: https://github.com/agent-teams-ai/get-modular/pull/239
[plan]: production-hardening-plan-2026-11-12.md
[adr]: ../../docs/decisions/0043-plan-optional-native-effect-composition.md
[tests]: ../../packages/effect/tests/lifecycle.test.ts
[archive]: ../../packages/effect/tests/packed-root.test.ts
[guide]: ../../packages/effect/docs/practices.md
[industry]: industry-failure-patterns-2026-11-12.md
[history]: ownership-failure-history-2026-11-12.md
[control]: raw/production-hardening-2026-11-12/README.md
