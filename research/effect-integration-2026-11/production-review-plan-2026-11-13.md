# GM + Effect production review — 2026-11-13

Status: planned; implementation and verification are pending.
Base: `144cbde065c00afbf98905b79a1db12234572857` (merged PR #239).
Owner: Assembly's existing preparation boundary and the optional native Effect
constructor, with their maintained tests and packaged practices guide.

## Goal and authority

The owner requested another careful review, useful refactoring and complete E2E
delivery. Fix concrete defects and simplify duplicated knowledge within its
existing owner. Preserve the contracts in
[ADR-0043](../../docs/decisions/0043-plan-optional-native-effect-composition.md)
and the [Consumer Module Standard](../../docs/architecture/common-assembly.md#consumer-module-standard).
This is library qualification. The coordinated registry release and adoption by
a named application remain separate recorded outcomes.

The previous audit and hardening records remain historical evidence. This pass
adds a mixed-inventory boundary, a reconvergent graph topology and rejection after
a factory acquires its own real resource. It does not repeat the previous scale
measurements or assume that more lines mean stronger architecture.

## Findings and selected changes

1. **Combined selected-entry ceiling.** The current preparer caps the module tree
   at 4,096 nodes, then appends borrowed input entries without checking the total
   selected declaration count. Check the combined entry count before allocating
   the collected metadata and completing profiles. Preserve the separate module
   tree budget: borrowed inputs are not group nodes. Verify both the exact limit
   and overflow, including rejection before compiler invocation and before any
   factory. Reproduce the current failure before implementing the correction.
2. **One owner for each lowered node.** Replace coordinated private key/Layer maps
   with one node record. Resolve a step's providers once during inert lowering;
   use that same captured selection for native provision and dependency reads.
   This removes repeated provider enumeration and the deferred lookup into a
   mutable whole-graph map. It is a bounded implementation refactor, not a new
   runtime, cache, public API or changed memoization policy.
3. **Repeated diamonds.** Add a finite public-entrypoint graph with repeated
   reconvergence, a real FileHandle provider and dependent asynchronous cleanup.
   Assert exact acquisition/finalization counts, shared instance identities,
   provider liveness and physical close. A hung-test timeout is not a performance
   assertion. Leaf acquisition counts alone do not prove linear native traversal;
   retain the narrower claim and the separate upstream composed-Layer evidence.
4. **Malformed product after owned acquisition.** Acquire a real resource inside
   the factory that returns an invalid product. Reject accessor-bearing product
   data without invoking the accessor. Hold cleanup behind a barrier and prove
   that no roots are published, completion waits for cleanup, and the file closes
   exactly once. Keep defects distinguishable from typed failures/interruption.
5. **New industry evidence.** Read the actual fixes and regression tests for
   Effect composed-Layer memoization, atom identity and registry isolation, and
   OpenCode's packed dependency mismatch. Pin source revisions and versions,
   preserve counterevidence, and verify inclusion in the exact Effect 4.1.4 peer.
   Unmerged proposals and upstream reported executions are not our test results.
6. **One practical guide.** Add concise guidance and test links to the existing
   packaged practices guide. Keep detailed source analysis in one dated research
   note. Update current common preparation guidance for the clarified combined
   ceiling; preserve immutable accepted decisions and public release baselines.

## Ownership, compatibility and limits

Assembly remains the sole owner of metadata capture, bounds and verified wiring.
The Effect package translates that wiring into native Layers; Effect owns resource
acquisition, memoization, interruption and finalization. The application owns
ingress, operations, request isolation, resource budgets and shutdown policy.

Keep ordinary Core/Assembly independent of Effect. Preserve E/R/input inference,
fresh mapper identities per `.layer()` call, intentional reuse of returned Layers,
exact local bindings and borrowed-resource ownership. No new dependency, scheduler,
retry policy, platform adapter, global registry or lifecycle language is planned.
All new maintained code is TypeScript 7.0.2 or newer under existing strict projects.

Changing invalid oversized input rejection to the existing
`assembly.prepare.limit` outcome is a correction to the accepted envelope, not a
new public error code or a change to valid-input semantics. Add an Assembly patch
changeset if the correction is confirmed. Candidate Effect implementation changes
retain their already-pending coordinated release intent.

## Review and delivery

Round 1: independent review of native lowering, shared preparation and new primary
industry evidence; challenge the suspected defects and their ownership.

Round 2: review the actual source diff and test synchronization. Confirm that the
combined ceiling preserves the exact valid boundary and that the node refactor
does not accidentally share identities or retain unrelated graph state.

Round 3: review the final frozen source, rejecting controls, strict type checks,
installed-package tests and research claims. Additional review addresses concrete
findings rather than expanding the scope without evidence.

Push this plan first in a draft PR, then each coherent implementation commit.
Run focused Assembly/Effect checks, the existing installed-archive suite, docs
checks, `bun run check:changed`, `bun run check:fast` and the full applicable gate.
Use exact-head CI and normal protected squash merge, then verify merged identity
and complete post-merge checks. Do not count skipped, cancelled or pending jobs as
passes; use normal waiting and a justified retry only for a classified transient.

Acceptance requires no unresolved in-scope findings, independent regression
oracles, the maintained guide and research links, successful required checks and
verified merged source. It does not claim a named product's SLO, workload capacity
or registry publication.

## Incremental estimate

| Work | Expected lines |
| --- | ---: |
| Production changes | 20–70 changed lines; small net reduction is preferable |
| Tests and fixture integration | 220–400 |
| Guide, plan and source evidence | 180–350 |

Complexity: **3/10**. Confidence in the bounded plan: **9/10**. Achievable reliability
within the stated construction contract: **9/10**. These are engineering judgments,
not measured availability. The existing native runtime and verification tools
remain the only execution mechanisms.
