BEGIN_PLAN
# Module-owned resources

Date: 2026-10-01. **Round 2 of 4 fix proposal; acceptance pending.** Scope is admission, the first qualified subscription TEST and a nested two-child TEST using a materially different partial-async adapter. Implementation, source admission and production qualification are not claimed.

## Recommended admission decision

Recommend **`@get-modular/ownership`**, root **`packages/ownership`**, version **`0.1.0-resource-candidate.1`**, with one root-only ESM export containing `createResourceOwner` and associated types. One cohesive resource feature owns one authoritative obligation ledger per **module instance**. Internal cells and helpers are not composition nodes.

Require a **new accepted successor before package source**. It must explicitly authorize bounded setup, cleanup and readback callbacks/Promises, substantive candidate materialization and disposable TEST consumption before ordinary K1, the difference from frozen C0, and synchronized current guidance/profile/enforcement changes.

Preserve accepted ADR-0028/0029 and historical C0 bytes. ADR-0028 excludes callback execution; ADR-0029 admits its narrower synchronous kernel. Neither admits this helper. Ordinary **S3 → G1 → K1** remains; supplied evidence does not establish S3 completion. **G1 stays `hold`; K1 stays pending.** TEST evidence does not establish two eligible production ownership scopes, trusted release authority or released-artifact binding.

Runtime dependencies are zero. Ownership imports no Core, Assembly, lifecycle-kernel, Node, IO, product types or development tooling, including type-only edges. Those runtime packages do not import ownership. Consumer composition imports the public root and supplies the author facet through the existing factory closure. Assembly injection remains unchanged; domain/application code uses consumer-owned ports.

Alternatives and estimates remain design judgments; complexity 10 means greater burden.

| Choice | Confidence / reliability / complexity | Candidate source / tests / docs LOC |
| --- | --- | --- |
| **Recommended: ownership root and one ledger** | 8 / 8 / 3 | 300–500 / 500–800 / 150–250 |
| Separate resources facade and ownership ledger | 8 / 9 / 6 | 400–650 / 650–950 / 250–350 |
| Wait for ordinary K1 | 9 / 9 / 7 | 100–200 / 250–450 / 100–200, plus unmet K1 work |

## Instance authoring contract

The optional facet is `resources.setup<T>({setup, cleanup}): Promise<T>`.

Setup returns a non-thenable value or ordinary Promise of one. Cleanup receives `SetupOutcome<T>`, either `{kind:"ready", value:T}` or `{kind:"failed", cause:unknown}`. Retain its closure and adapter construction cell **before setup invocation**, including when failure returns no handle.

Pure and borrow-only modules need no helper, empty disposer or dummy callbacks. Children borrow narrow parent ports and never dispose parent resources. Multiple instances of one definition have independent owners.

Registration occurs during construction through sequential awaited setup calls. Sealed admission refuses `setup-closed`; otherwise unsettled same-owner setup refuses `setup-busy`, before callbacks. Seal registration at factory settlement. Refuse publication if registered setup remains unsettled, retaining the original attempt.

One registration represents one cleanup obligation. Independently releasable resources need separate registrations; returned handles never register the same obligation again. Ordinary capability admission is separate from setup admission.

## Ledger, observation and recovery

The proposed Host facet has synchronous `seal()`, `cleanup()`, `recover()` and `observe(): CleanupReport`. Controls initiate retained work and return no self-awaitable shutdown Promise. Author callbacks receive only the author facet.

Each record strongly retains callbacks, cell, setup outcome, raw setup/cleanup actions, retained readback function/actions and original errors. States are `setting-up`, `ready`, `setup-failed`, `cleaning`, `unresolved`, `released`; admission is separately open/sealed.

Reserve each action identity before invoking consumer code; attach its actual raw result or Promise without replacing it with an observer flight. This includes synchronous throws and reentrancy.

Cleanup seals registration and invokes each eligible obligation once. Pending setup stays retained until actual settlement. Late success is retained for cleanup and refused publication as `setup-closed`; setup failure retains its exact cause and never proves empty acquisition. Independent eligible obligations progress despite unresolved peers.

`CleanupResult` is `{kind:"released"}` or `{kind:"unresolved", cause:unknown, readback?:()=>CleanupResult|Promise<CleanupResult>}`.

Cleanup throw/rejection or malformed completion, including `void`, retains unresolved responsibility and the raw failure/result. Release requires the selected adapter’s observed contract.

Retain the original setup cause and first cleanup cause separately from subsequent `observationFailures`. Release never erases captured causes. Readback throw, rejection or malformed completion preserves unresolved custody **and the existing readback function**; an unsuccessful observation cannot replace or discard it.

Recovery invokes only that retained, observational readback, with one flight per obligation. Concurrent/reentrant requests join it. Recovery during unsettled setup, cleanup or readback starts no competing action. There is **no physical-cleanup retry or reacquisition**. Generic callbacks supplying no readback can remain unresolved indefinitely.

`CleanupReport` is `{kind:"complete"}` or `{kind:"incomplete", pendingIds, unresolved:[{id, cleanupCause, observationFailures}]}`. Pending IDs cover remaining unsettled obligations. Owner completion requires requested cleanup and every record released; IDs/counts grant no authority.

Before any factory, TEST Host retains the attempt, resource owner, raw factory action, cells and original construction cause. Failed construction requests shutdown through the protocol below. `TestConstructionError` preserves `cause`, cleanup causes and a Host recovery reference exposing recovery/observation of that **original attempt**.

Host observation additionally requires construction, dependent work and required child shutdown prerequisites. Deadline/abort returns incomplete with reason `deadline`/`aborted`; it removes no custody and cancels no raw action. Remove Host retention only after actual completion.

## Supported adapter protocols

**Subscription TEST:** use an ordinary real EventEmitter subscription. Prepare the exact listener identity, removal closure and construction cell before registration; register, then await initialization. Rejected initialization leaves the listener reachable through failed-construction cleanup.

The listener wrapper synchronously checks handler admission and reserves work **before invoking handler code**, without intervening callback or await. Shutdown closes that admission at the same boundary, even while initialization remains pending. Sync return/throw and actual Promise fulfillment/rejection settle work exactly once; observation deadlines do not settle it.

After setup settles, cleanup removes the exact listener and drains admitted handlers. Qualification independently inspects `emitter.listeners(event)` for that identity, emits events and observes handler settlement. Closed admission alone cannot establish physical removal.

**Partial-async temporary-file TEST:** within an exclusively controlled disposable directory, retain the unique pathname and removal/readback closures before an exclusive high-level write. Retain the raw write Promise. Initialization follows writing and may reject with a real partial file present; no persistent descriptor escapes.

Cleanup waits for actual write settlement before its single removal attempt. Successful removal or observed `ENOENT` establishes release. **Catch other removal failures** and return unresolved with the original cause and retained pathname readback.

Readback establishes release only from absence; presence or uncertain inspection remains unresolved. Recovery never writes or deletes. Throwing/rejecting/malformed readback preserves its function and prior causes. Controlled external removal may enable subsequent absence confirmation. Path replacement is outside this protocol.

These are materially different TEST acquisition/release contracts, not K1 production scopes.

## Nested two-child shutdown protocol

Use one parent-owned append sink. Two children borrow only ordinary `append(record)`; one owns the subscription and one the temporary file. Neither receives parent teardown authority.

Retain each child attempt before its factory starts. Ordinary append synchronously checks admission and reserves active use before IO, without intervening callback/await. Closure uses the same boundary: a call is retained or refused. End active use only on raw settlement.

**Every parent shutdown entrypoint uses one private TEST Host gate:** explicit shutdown, `recoverAttempt(originalAttempt)`, journal delegation and instance cleanup. None exposes the parent owner’s raw cleanup control.

Record the shutdown request immediately; close ordinary, child and setup admission. Start safe independent child cleanup. Invoke parent physical cleanup only after all started construction/setup and admitted-work barriers settle, every required child resource is released, and every required child acknowledgement is confirmed.

Re-evaluate the retained request when an actual prerequisite settles or supported readback confirms it. Start parent cleanup once. Rejection, unresolved observation and deadlines preserve child/parent custody. Host references authoritative observations rather than maintaining a second disposal ledger.

Each child cleanup protocol has a **zero-argument private acknowledgement closure**, bound to its exact attempt and an internally selected immutable record. It accepts no record argument and grants no ordinary append capability.

Publish one retained append-action record before sink IO; attach its exact raw result/Promise. Repeated or synchronous reentrant calls join its precreated completion observation, never append again. Retain it in the original child attempt.

Child construction/work must settle before acknowledgement begins. Resource release and acknowledgement confirmation are separate prerequisites: the cleanup result describes local resource release; the acknowledgement cell owns acknowledgement evidence, which Host reads. File absence or listener removal cannot discharge acknowledgement debt.

The supported TEST sink gives each bound record an exact identity and independent inspection. After raw append settlement, readback can confirm that record exists exactly once. Commit-then-reject remains unresolved until this observation succeeds. Absence, ambiguous inspection or observation failure retains uncertainty and original append cause. Recovery only reads back the original action; it never appends another acknowledgement.

Unexpected dependency loss is a separate health signal. Fence new ordinary/private writes and subsequent mediated effects after awaits. Submitted IO may remain uncertain; private access cannot revive an unavailable sink. No automatic tree destruction, replacement or replay follows.

Reject escaping lifetimes, overlapping external borrowing and cyclic cleanup prerequisites. Support only this explicit nested protocol.

## Callback limits and exclusions

Registration cannot reveal hidden effects, reconstruct unknown handles, prove complete partial unwind, revoke escaped handles, detect arbitrary native loss, validate dishonest release assertions or force settlement. Exotic thenables, detached post-settlement acquisition and unsupported relationships receive no guarantee.

Reentrant setup is refused while busy; cleanup joins its published action. Arbitrary captured closures can still self-deadlock; no universal ancestry detector or liveness proof is claimed.

Exclude production adoption, dynamic loading/replacement, streams custody transfer, release, organization migration, lifecycle hooks, service bags, global managers, reactive hook engines, durable recovery and universal schedulers.

## Delivery and rejecting evidence

1. Accept the bounded successor and retain authenticated identity; reject materialization beforehand.
2. Deliver substantive candidate admission, ledger, subscription adapter and failed-construction recovery together.
3. Add the second adapter and nested protocol with independent observations.
4. Update current canonical Consumer Module Standard guidance/examples and affected TEST profile, documentation and rejecting gates together.

Current TEST and relayed GM standard bytes share SHA-256 `33b41d5babf0a431c97e8e596a56e6ec1557ba1a0b26d39bf23e13d9a19e1fbd`; no stale-pin defect is demonstrated. After authorized guidance changes, review the exact delta, migrate TEST to its reviewed revision and retain complete old/new bytes and historical C0 examples.

Future suites own distinct scenarios; expected observations must not derive from implementation state.

| Owning suite | Plausible regression and required failing observation |
| --- | --- |
| Owner | Closed/busy setup acquires; reentrant cleanup duplicates physical action; late success publishes; deadline loses raw custody. |
| Subscription | Failed initialization loses recovery; a handler requests shutdown synchronously then waits, yet release completes early. Later events must be refused; sync throw must neither leak nor double-settle work. |
| Subscription release | Omit listener removal while closing admission: exact membership inspection must fail despite suppressed delivery. |
| Nested/file recovery | With a real file and failed initialization, make removal reject. Original-attempt recovery must retain both causes; presence remains unresolved, controlled external removal enables confirmation. Acquisition and deletion invocation each remain one. |
| Nested/prerequisites | Repeated recovery, journal and instance shutdown during child construction/work/unresolved cleanup must leave parent cleanup at zero while safe sibling cleanup progresses; eventual satisfaction starts it once. |
| Nested/acknowledgement | Duplicate/reentrant closure calls create one independently read record. Uncertain acknowledgement blocks parent release despite local resource absence; recovery never appends again. |
| Nested/health | After loss across await, mediated writes change no independently inspected sink data; unrelated teardown is not automatic. |
| Admission/artifacts | Borrowed teardown compiles, forbidden roots/imports pass, intended packed exports fail resolution, or removed scenarios/type fixtures/no-op commands leave gates green. |

No scenario duplication at every layer. Packed replay verifies artifact compatibility.

## Actual commands and proposed gate changes

All commands below are **future verification**, not executed here.

| Repository | Existing commands |
| --- | --- |
| GM | `pnpm check:changed` during implementation; `pnpm check:fast` before handoff; authoritative `pnpm check` before PR integration. |
| GM limited preservation | `pnpm ownership:checkpoint:test` for C0; `pnpm lifecycle:check` for the pure kernel. Neither verifies this helper. |
| TEST | `pnpm typecheck`, `pnpm test`, `pnpm evidence`. |

**Proposed, NOT existing:** `pnpm ownership:resource:check`. Require substantive build, runtime/public-root positive/negative type fixtures under NodeNext/Bundler and minimum/pinned compilers, owner tests and packed-root tests. Route into changed-file feedback, fast and full gates.

Atomically add exact manifest/lock importer and Foundation v3 `packageRoots`, retaining `rootPackage: true` and non-overlapping production/development boundaries. Adopt the cohesive feature under FMS. Reject wrong roots, nested manifests, install scripts, forbidden type/runtime edges, deep imports, ungoverned output and missing/no-op enforcement. Preserve existing guards without exclusions.

Extend actual TEST **`scripts/evidence/run.mjs` inside `pnpm evidence`**. It currently replays separate exact published-0.1/candidate-0.2 Core/Assembly pairs plus kernel, validates strict TAP names and explicitly routes focused lifecycle files.

Add ownership’s exact archive/pin to both manifests/locks, preserving pair/kernel identities and separate candidate provenance. Extend archive validation and installed-root resolution.

Keep `expected.tests` lifecycle inventory/index slicing unchanged. Add a separate required resource-name inventory and proposed explicit routing to `tests/resources/subscription.test.mjs` and `tests/resources/nested.test.mjs`. Combined TAP validation must use both inventories and reject missing, duplicate, unexpected, failed, skipped, cancelled or todo scenarios. Focused resource replay requires each name exactly once. Capture/typecheck all new fixtures.

Bind candidate source SHA, executed worktree digest, successor authentication, archive SHA-256/SRI, manifests/exports, locks, Node/pnpm/compiler versions, standard bytes/hash and outcomes.

The runner rejects uncommitted replay inputs; controller integration must establish reviewed source before accepted replay. Frozen offline installation and installed typechecking must pass. **Archive-only fallback remains pending and cannot qualify lock installation.**

## Acceptance, rollback and retained evidence

Future delivery acceptance requires the successor, substantive admission, both supported TEST slices, reachable recovery, one owner/action per obligation, prerequisite-safe shutdown, enforced boundaries, synchronized pins/guidance and accepted exact-archive replay. Admission, TEST conformance, K1 eligibility and release remain distinct.

Existing passive consumers and Core/Assembly contracts remain compatible. Rollback removes bounded candidate TEST integration; unresolved attempts retain their original owners. Never run parallel fallback ledgers.

Retain [original reviews](evidence/module-resource-contract-20261001/README.md), [original identities](.research/input/previous-source-identities.json), [input hashes](.research/input/input-hashes.json), [prior fix](.research/input/prior-fix-report.md), [round-two critique](.research/input/current-critique.md), [authority](.research/input/current-source-identities.json), [TEST identity](.research/input/test-consumer-identities.json) and [supplement identities](.research/input/source-supplement/identities.json).

Baseline plan: `90ddd653e155b9731277e56ddc0e8e2cc6417c1ac0f137b27bc3468c71c7e0d2`. Round-two input: `c80f7c8414df783eea9eaa28576d510cdfeea79e904317999db6f7f3c607d853`. GM: `9c722ceff4ede307d06d7a4b63fdebe615f54c53`; TEST: `fcc10b2501420aacf9f904e976a4d230d3f02e68`.

AR correction `b0bcb265d1466da3272078f9dfdb7c6784624283` supersedes historical scaffold gaps without qualifying this API. Spring 7.0.9 uses a **10-second shutdown-phase default**, which proves no physical release.

Original research requested gpt-6.1-sol/MAX/priority; round-one critique MAX/default; fixes and this round request XHIGH/FAST. These are requests, not backend attestations. Internet evidence is root-relayed; native browsing remains disabled. Industry evidence does not establish our async guarantees; hooks research stays separate.

This read-only round took approximately three minutes. No files, Git, builds, tests, installs or runtime/provider flows were performed. Root must mechanically retain all evidence and inspect this exact output before publication. Rounds three/four and implementation verification remain unperformed.
END_PLAN

| Current finding | Correction |
| --- | --- |
| R2-1: Removal rejection strands readback | Supported file cleanup catches failure and returns its retained pathname readback. Original causes survive observation failures and release; generic callback recovery remains explicitly limited. |
| R2-2: Recovery/delegation bypass prerequisites | Every parent shutdown entrypoint records a request through one Host gate. Physical cleanup waits for actual construction/work settlement and confirmed child prerequisites, then starts once. |
| R2-3: Acknowledgement authority/action ambiguous | Bind a zero-argument closure to one child record/action. Reentrant calls join; acknowledgement and resource release remain separate. Recovery performs only original-action readback. |
| R2-4: Synchronous handler shutdown races retention | Reserve handler work atomically before invocation; close admission at the same boundary and settle work exactly once on actual completion. |
| R2-5: Suppressed delivery masks retained listener | Require independent exact listener-membership inspection alongside emission and drain observations. Omitting removal must fail qualification. |
| Remaining prerequisites | No unresolved specification blocker from these findings. Successor acceptance, implementation and future verification remain pending; this is not completed four-round evidence. |
