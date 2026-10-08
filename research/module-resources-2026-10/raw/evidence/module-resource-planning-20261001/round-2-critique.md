# Round 2 of 4 critique — Module-owned resources

**Disposition: five specification defects need correction before implementation.** These concern recovery reachability, shutdown prerequisites, private acknowledgement authority, synchronous handler reentrancy and release evidence.

Input: `.research/input/current-plan.md`  
Verified SHA-256: `c80f7c8414df783eea9eaa28576d510cdfeea79e904317999db6f7f3c607d853`

Requested profile: **gpt-6.1-sol / XHIGH / FAST**, following the latest owner rule. The earlier MAX/default request does not describe this round. This records requested configuration, not independent backend attestation.

This review read the five required inputs, retained documentation guidance, exact GM authority/package scripts, TEST sources and the supplied `scripts/evidence/run.mjs`. Source relay is indirect evidence; no independent online research occurred.

## R2-1 — High: supported cleanup failure can strand readback

**Affected:** “Ledger, cleanup and recovery”; temporary-file adapter, particularly lines 69–73 and 91.

The only specified way to supply readback is a fulfilled `{kind:"unresolved", readback}` result. A file cleanup that awaits removal can reject before returning that result. The ledger then retains responsibility and the error, but `recover()` has no readback function to invoke. Strong custody alone does not provide the promised supported recovery path.

**Precise correction:** Require the supported file adapter to catch removal failure and return unresolved with the original cause and its retained pathname readback. Specify that readback throw, rejection or malformed completion preserves unresolved custody and the existing readback function. Retain the original cleanup cause separately from subsequent observation failures. Generic callbacks that supply no readback may remain unresolved indefinitely; do not imply recoverability for them.

**Acceptance:** With a real owned file present, make the removal action reject. Recovery must remain reachable through the original failed-construction attempt. Presence remains unresolved; after controlled external removal, readback can establish absence. Acquisition and physical deletion are each invoked once, and the original setup/cleanup causes remain available.

## R2-2 — High: recovery and delegation can bypass parent prerequisites

**Affected:** “Ledger, cleanup and recovery”, lines 77–81; “Nested two-child TEST”, lines 103–107.

`recoverAttempt(originalAttempt)` explicitly seals/starts owner cleanup, and journal/instance cleanup delegates to that owner. The nested protocol separately prohibits parent cleanup until child retention and active use reach zero. The plan does not reconcile these entrypoints. Checking prerequisites only before reporting completion would still allow premature physical destruction of the parent sink.

**Precise correction:** Route parent shutdown, recovery, journal delegation and instance cleanup through the same TEST Host prerequisite check. Record the shutdown request immediately, but invoke the parent owner’s physical cleanup only after the required construction/work barriers settle and every required child cleanup is confirmed complete. Rejection or unresolved observation must retain child custody.

When prerequisites later become satisfied, the retained request must start parent cleanup once. Keep this logic in the bounded Host protocol; no generic scheduler or duplicate disposal ledger is needed.

**Acceptance:** Repeatedly request parent recovery and journal/instance shutdown while a child factory, admitted operation or unresolved cleanup remains. Parent physical cleanup must stay at zero while independent sibling cleanup progresses. Once all prerequisites are genuinely satisfied, the retained request must invoke parent cleanup exactly once.

## R2-3 — High: acknowledgement lacks bounded authority and physical-action identity

**Affected:** “Nested two-child TEST”, especially lines 101–109.

The private acknowledgement closure is described by purpose, but its invocation rules remain unspecified. Reentrant or repeated calls could append multiple acknowledgements. An append could also commit physically and then reject. Separately, file readback proving pathname absence does not prove that the required acknowledgement completed.

**Precise correction:** Define a zero-argument closure bound to the exact child attempt and an internally selected acknowledgement record. It must publish and retain one raw append action before invoking sink IO; repeated or reentrant calls join that action. It must not accept arbitrary records, return an ordinary append capability or reopen ordinary admission.

Track confirmed acknowledgement separately from resource release as a child shutdown prerequisite. Uncertain acknowledgement keeps the child and parent retained and permits only supported readback of that original action. File/listener release cannot discharge acknowledgement debt. Physical dependency loss also fences this private path.

**Acceptance:** Calling the closure twice, including synchronously during its first invocation, produces one independently observed sink record. Captured ordinary append remains refused after closure. If acknowledgement is uncertain while the file is absent or listener removed, parent cleanup remains blocked. Recovery must not append another acknowledgement.

## R2-4 — High: synchronous event delivery needs its own admission boundary

**Affected:** subscription adapter, lines 85–87; reentrancy guarantees and subscription evidence.

The ledger reserves setup/cleanup actions before callbacks, but the subscription adapter does not specify when it retains handler work. A real emitter can invoke a handler synchronously. If bookkeeping occurs after handler invocation, that handler can request shutdown before its work is visible; cleanup may observe an empty work set and release prematurely.

**Precise correction:** Require the listener wrapper to synchronously check handler admission and reserve its work identity before invoking handler code, with no intervening callback or await. Closing handler admission must use the same boundary. Synchronous throws and asynchronous rejection must finish that retained work exactly once; observer deadlines must not remove it.

**Acceptance:** Deliver an event whose handler synchronously requests shutdown and then waits on a controlled barrier. The listener must stop admitting subsequent events, while cleanup and parent release remain incomplete until the original handler actually settles. Include a synchronous-throw case that neither leaks retention nor decrements it twice. This belongs in the subscription suite.

## R2-5 — Medium: suppressed delivery does not prove listener removal

**Affected:** subscription release evidence, line 87; “Delivery and rejecting evidence”, line 127.

Independent emission verifies delivery behavior, but a listener left registered behind a closed admission flag produces the same observation. Consequently, the proposed oracle can pass while the emitter still physically retains the listener and its captured resource cell.

**Precise correction:** Add an independent observation of exact listener membership in the real emitter, alongside event emission and handler-drain observations. For an ordinary EventEmitter subscription, inspect the emitter’s actual listener collection for the registered identity. Keep the claim limited to this supported adapter.

**Acceptance:** Deliberately omit listener removal while preserving admission closure. The subscription release fixture must fail despite observing no new handler effects. Successful release requires exact listener absence and settlement of previously admitted work.

## Cross-check of the remaining plan

The optional module-local `resources.setup({setup, cleanup})` direction, instance ownership, pure/borrow-only modules and absence of parent teardown authority in children remain appropriate. None of these findings requires lifecycle hooks, production integration, dynamic loading/replacement, stream transfer, release or broad migration.

The callback limitations correctly state that arbitrary callbacks cannot prove complete partial unwind, reveal hidden effects or force settlement. Deadline/abort observations correctly leave raw actions and custody unchanged. Recovery must preserve those limitations.

The admission proposal correctly requires a **new accepted successor before package source**. ADR-0028 excludes callback execution; ADR-0029 admits its narrower synchronous kernel and does not authorize this resource helper. Accepted ADR bytes and C0 remain immutable. **G1 stays hold; K1 stays pending.** TEST evidence cannot prove arbitrary native-effect absence or production qualification.

The exact relayed GM `package.json` supports the listed `check:changed`, `check:fast`, `check`, `ownership:checkpoint:test` and `lifecycle:check` commands. TEST supports `typecheck`, `test` and `evidence`; `ownership:resource:check` is correctly marked proposed.

The supplied TEST runner confirms separate archive-pair replay, strict TAP inventory, focused lifecycle routing, installed typechecking and rejection of uncommitted replay inputs. Its `tap()` currently reads `expected.tests`; `lifecycleRuns()` slices that list by lifecycle indices. The planned separate resource inventory and routing must therefore remain separate from that lifecycle slice while participating in combined TAP validation. No additional runner defect is established.

The current TEST/GM standard hashes match. The historical AR scaffold defects must not be presented as current unfixed defects after the merged correction identified in `source-corrections.md`.

All acceptance scenarios above are **future checks**. No files were written, and no Git commands, builds, tests, installs or runtime/provider/agent/smoke flows were executed. No ADR acceptance or conformance result is claimed. Review elapsed approximately four minutes.
