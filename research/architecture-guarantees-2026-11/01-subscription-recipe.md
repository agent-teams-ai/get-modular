# 01. Complete the existing safe subscription recipe correction

**Status:** bounded integration plan; implementation already belongs to
[draft PR #213](https://github.com/agent-teams-ai/get-modular/pull/213).
**Observed heads:** main `5fb83478dd7b95216be92c4d3077eddf2774eef8`;
PR #213 `24cf56ad4363168aaff3ab0bbfb648b2514c5f03` on 2026-11-06.
This planning PR does not duplicate, cherry-pick, merge or certify that work.

## Defect and target behavior

The current module-authoring recipe calls `subscribe` before `resources.use`
registers its disposer. A synchronous subscription callback can begin shutdown
in that interval. The source probe retained one live subscription while close
reported complete, because the undisclosed resource was never registered.
This is a faulty acquisition recipe, not a claim that Resources falsely reports
registered cleanup or that `use` takes custody after refusing a closed scope.

The existing `resources.setup` registers pending acquisition before invoking
the provider. PR #213 moves subscription acquisition into that protocol. Its
declared tests exercise the actual documentation example; revalidate their
current exact head rather than replacing them with another illustrative test.

## Bounded implementation route

1. Re-read #213's live head and changed files before integration. Keep its
   ownership and existing review history; resolve overlap with current CMS
   guidance by applying the same safe recipe once.
2. Retain acquisition through `setup`, cancellation checks before acquisition
   and synchronous listener effects, and module-owned unsubscribe cleanup.
3. Keep provider rollback before returning a disposer, unsubscribe failure
   debt/retry and the distinction between unsubscribe and completion of work
   started by callbacks. The external event source is borrowed and never closed.
4. Verify the extracted executable example under the strict current compiler,
   the existing example runner and Assembly/Resources public packages. Preserve
   the existing sample count and all rejecting assertions.
5. Complete ordinary exact-head review and the existing required gates in that
   PR. This plan adds no separate release workflow or duplicate correction PR.

## Acceptance and limits

| Case | Required evidence |
| --- | --- |
| Subscription synchronously requests enclosing close | No surviving subscription after close settles; exactly one unsubscribe |
| Scope already closing before acquisition | Provider not called |
| Provider fails before returning a disposer | Provider's partial acquisition rollback completes; original failure retained |
| Unsubscribe fails, then explicit Host retry succeeds | Named cleanup debt first; retained resource released on retry, successful cleanup not repeated |
| Cancelled/closed subscription receives another occurrence | No new listener effect; shared source still serves live siblings |

Callback-started asynchronous work still needs its consumer-owned drain policy.
No event bus, delivery guarantee, stream operators, worker runtime, scope API
rewrite or plugin behavior is included. Do not infer physical release merely
from a cooperative `complete` flag; the test independently counts subscriptions.

Use the existing PR's focused example and type commands, then
`bun run assembly:test`, `bun run resources:check`, `bun run check:fast` and
`bun run check`. Do not claim those results from this planning-only change.
No public runtime API break or package changeset is needed for a documentation
recipe correction unless the verified implementation diff actually changes a
published package; follow the existing PR's real diff rather than guessing.

**Incremental production code: 0.** Existing documentation and several hundred
test/fixture lines are already prepared in #213; no second test suite is planned.
**Confidence 10/10, achievable reliability for the recipe 9/10,
complexity 3/10.** Implementation acceptance is separate from this plan review.

Sources: [current example](../../docs/guides/module-authoring.md),
[setup registration semantics](../../packages/resources/src/features/scope/scope.ts),
[PR #213](https://github.com/agent-teams-ai/get-modular/pull/213).
