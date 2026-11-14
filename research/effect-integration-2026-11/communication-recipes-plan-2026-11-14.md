# Communication recipes: boundary review and delivery plan

Date: 2026-11-14. Base: `6c91ff1c3c8ce7088db215af9705f7ee3a9db103`.
Status: reviewed implementation plan; execution evidence belongs to the PR.

## Goal and authority

Make the optional Effect integration convenient for an application that chooses
it as its primary executor, without making Core, Assembly, neutral contracts or
ordinary consumers depend on Effect. Extend the existing packaged
[practices guide](../../packages/effect/docs/practices.md); do not create a
second usage standard. ADR-0043 and the Consumer Module Standard retain authority.
No npm publication or product adoption is part of this change. Release PR #241
is a separate owner's work and must not be changed here.

GM selects providers through declared slots. The provider defines event meaning
and delivery guarantees. Effect executes native operations and owns their native
resources. A neutral callback source retains its own lifetime; an adapter owns
only the subscription it acquires. Observation remains replaceable state, not an
occurrence log. This is abstraction over declared dependencies, not a universal
abstraction over every delivery or execution model.

## Alternatives and breaking-change decision

| Alternative | Benefit | Cost or rejected claim | Decision |
| --- | --- | --- | --- |
| Native technical ports plus narrow neutral adapters and one-way state projection | Keeps native errors, Scope and stream composition; neutral users need no Effect | Every boundary still states its real delivery contract | Select |
| A universal neutral Task/Stream/Scope/event facade | One spelling for different executors | Recreates an executor and hides cancellation, buffering and completion differences | Reject |
| Make all communication Effect-native | Simple inside one selected application | Violates optionality for Core and neutral consumers | Reject |
| Add a new public events package immediately | Could remove repeated consumer code | No demonstrated missing shared mechanism; overlaps native PubSub/Stream | Defer |

The owner allows deliberate breaks. No source defect or missing public primitive
has yet justified one: the current native and neutral APIs express these recipes.
Do not break Observation to make it look like SubscriptionRef. A later proven
API defect requires its own smallest reproduction and migration; these tests
must not weaken an existing contract to fit a convenient example.

## Critical review before implementation

These are four analytical passes in one assistant session, not independent agents.
A separately executed repository review is separate evidence.

1. Boundary critic: a GM slot selects a provider, not a delivery policy. Keep
   shared event data plain; use distinct native and neutral port contracts when
   their error or lifetime requirements differ. Do not expose a writable PubSub
   or Host close authority to a reader.
2. Correctness critic: a lazy stream is not a ready subscription. The native
   recipe acquires its subscription before publication; each subscriber owns a
   separate Scope. A synchronous callback may emit during registration or throw;
   protect the disposer handoff and require provider rollback on failed subscribe.
3. Capacity critic: a synchronous callback cannot await backpressure. Use a
   bounded queue and explicit overflow failure, not one detached fiber per event.
   State projection may deliberately keep only the latest snapshot; never reuse
   that loss policy for indispensable occurrences. An item bound is not a byte,
   producer-population or whole-process bound.
4. Lifetime critic: Observation reports source closure to its source owner;
   ReadonlyStore.watch has no terminal callback. Its one-way stream recipe must
   require the source owner to outlive the consumer and must not invent graceful
   completion. Close only the adapter-owned Resources scope and inspect its close
   report. Native Scope finalization does not become Resources debt/retry.

Counter-critique: adapters can accumulate into a second framework. Keep examples
as concrete, typed consumer recipes, not package exports. Split the neutral
contract from native code, and check a real Effect-absent installed consumer.
Keep one state authority; no automatic two-way synchronization or global bus.

## Bounded implementation

- Add complete TypeScript recipes under the existing Effect test/qualification
  owner, linked from the packaged guide: scoped native multicast, a borrowed
  callback source with explicit overflow, and one-way Observation projection.
- Exercise the same recipes through public GM composition and installed archives.
  Reuse existing build, strict TypeScript and packed-consumer gates; do not add a
  second runner, dependency pin, runtime export or package.
- Cover two subscribers, duplicate values, readiness, independent unsubscribe,
  early termination, processing failure, interruption, synchronous registration,
  failed acquisition, overflow, latest-state coalescing and source ownership.
- Keep pure domain/event records free of Effect imports. Prove ordinary Assembly
  and the neutral source work with Effect physically absent, not merely unselected.
- Preserve the existing 23 installed native cases and their explicit TAP checks.
  Add recipe counts independently; no cancelled/skipped job counts as success.

Estimated incremental work: 0 production runtime lines; 150-250 recipe lines;
300-500 test/qualification lines; 150-220 guidance/review lines. Complexity 6/10,
expected reliability within this scope 8/10, confidence 8/10. These are engineering
estimates, not availability or performance measurements.

## Verification and stop conditions

Use the repository's pinned TypeScript 7.0.2 and Effect 4.1.4. Run the existing
changed, fast and complete gates where the approved toolchain is available and
inspect the complete hosted CI on the actual final SHA. This session's local
container has Node 22, no approved installed toolchain and no network resolution;
do not describe local syntax inspection as typecheck or a passing repository gate.
Hosted verification must execute the maintained tests, not temporary assertions
that bypass the repository runner. Retain errors and fix them on this Draft PR.

No accepted ADR edits, release-baseline changes, dependency downgrades, product
migration, protection bypass or fake review approval. If an integration cannot
preserve a guarantee, state the limit rather than silently adding it to the port.

## Primary-source observations

- [Qualified native decision](../../docs/decisions/0043-plan-optional-native-effect-composition.md)
- [Observation contract](../../packages/observation/src/features/store/types.ts)
- [Effect stream constructors](https://effect.website/docs/v4/stream/creating)
- [Effect PubSub semantics](https://effect.website/docs/v4/concurrency/pubsub)
- [Effect Queue API](https://effect.website/docs/v4/api/effect/Queue)

The package README and frozen lock remain the exact peer authority. Live upstream
API pages inform the review; only compilation and execution against the repository
peer qualify the delivered recipes.

## Complete-gate review: shared qualification owner

The first complete local gate rejected the Observation/Resources imports placed
inside the Effect package's development boundary. They are cross-package
consumer qualification, not dependencies of the native Effect leaf. Move the
recipes to `tests/qualification/effect-communication` and their scenario suite to
`tests/effect-communication.test.ts`. Native mapper tests stay with the Effect
package and consume the two explicitly exposed qualification helpers. The root
consumer scenarios import Effect itself, not the native GM mapper, so the
existing package-to-root archive harness cannot form a runtime package cycle.
The root already declares all selected
packages as development dependencies; record its exact Effect import edges in
the existing source-dependency policy. Keep the Effect package's peer set and
production boundary unchanged. Extend its existing test-tooling project to
check these root-owned fixtures, and keep execution/archive checks mandatory.
Do not solve this rejection by adding Observation as an Effect peer, excluding
the examples from checking, or weakening the dependency rule.

Execution also rejected two incorrect test expectations: a shut-down native
PubSub returns `false` on publication; combined processing and finalizer errors
retain their identities as native defects in the qualified peer. The recipes
now document and test those outcomes, including the typed processing failure
when cleanup succeeds. These are corrections to the new qualification, not
changes to Effect or to a Get Modular public API.
