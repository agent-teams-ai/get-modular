# Module-owned resources

Date: 2026-10-01. **Round 1 fix proposal; acceptance pending.** This specifies admission plus two disposable TEST slices. It does not authorize implementation, admit a package, qualify production behavior or complete later review rounds.

## Recommended admission decision

Recommend one candidate **`@get-modular/ownership`**, root **`packages/ownership`**, version **`0.1.0-resource-candidate.1`**, with a root-only ESM export: `createResourceOwner` and its associated types. Use one private obligation ledger per **module instance**, owned by one cohesive resource feature. Internal scopes, cells and bookkeeping helpers are not composition nodes.

A new accepted successor must explicitly authorize:

- Bounded setup, cleanup and cleanup-readback callbacks and Promise execution, which ADR-0028 currently excludes.
- Substantive candidate materialization and disposable TEST consumption before ordinary K1 qualification.
- This candidate surface’s difference from the frozen C0 declaration contract.
- Candidate-specific current guidance and TEST profile changes alongside their enforcement.

Preserve accepted ADR-0028/0029 and historical C0 bytes. Their existing exceptions do not admit this helper. The ordinary **S3 → G1 → K1** release/adoption sequence remains; supplied evidence does not establish S3 completion. **G1 stays `hold`; K1 stays pending.** TEST results cannot establish two eligible production ownership scopes, trusted release authority or released-artifact binding.

Runtime dependencies are zero. Ownership imports no Core, Assembly, lifecycle-kernel, Node, IO, product types or development tooling, including type-only edges. Those runtime packages do not import ownership. Consumer composition imports only its public root and binds the author facet through the existing factory closure; Assembly’s injection contract stays intact. Consumer-owned ports keep library types outside domain/application code.

Alternatives remain proposals. Scores are design judgment; complexity 10 means greater burden.

| Choice | Confidence / reliability / complexity | Approximate candidate source / tests / docs LOC |
| --- | --- | --- |
| **Recommended: one ownership root and ledger** | 8 / 8 / 3 | 300–500 / 500–800 / 150–250 |
| Resources facade plus ownership ledger | 8 / 9 / 6 | 400–650 / 650–950 / 250–350 |
| Wait for ordinary K1 | 9 / 9 / 7 | 100–200 / 250–450 / 100–200, plus unmet K1 work |

## Authoring and ownership

The optional instance facet exposes:

`resources.setup<T>({ setup, cleanup }): Promise<T>`

`setup` returns a non-thenable handle or an ordinary Promise of one. `cleanup` receives:

`SetupOutcome<T> = { kind: "ready"; value: T } | { kind: "failed"; cause: unknown }`

The cleanup closure is retained **before setup invocation**. Failure cleanup therefore has access to its adapter’s construction cell even when setup returns no handle.

Pure and borrow-only modules need no helper, empty disposer or dummy callback. Receiving a dependency grants use authority only. Children never dispose parent resources. One definition can create multiple instances with independent owners.

Supported registration occurs during construction, with sequential awaited setup calls per instance. Same-owner setup while another setup is unsettled refuses `setup-busy`; setup after sealing refuses `setup-closed`, before invoking callbacks. If a factory returns with unsettled registered setup, Host refuses publication and retains the attempt for cleanup. Seal setup admission at factory settlement; ordinary capability admission remains a separate Host concern.

One registration represents one cleanup obligation. Multiple independently releasable resources require separate registrations; success handles must not register an existing obligation again. This slice supports independent obligations and the explicit nested protocol below, without deriving cleanup order from graph references.

## Ledger, cleanup and recovery

The proposed Host facet exposes synchronous controls:

`seal(): void`, `cleanup(): void`, `recover(): void`, `observe(): CleanupReport`.

These controls initiate or observe retained work; they do not return a promise that a callback can await as its own shutdown barrier.

Each ledger record retains its callbacks, outcome, resource cell, raw setup action, raw cleanup action and any readback action. States are `setting-up`, `ready`, `setup-failed`, `cleaning`, `unresolved`, `released`; admission is separately open/sealed.

- Reserve the record and publish action identity before invoking any callback, including synchronous throws and reentrancy.
- Setup rejection retains the exact original cause. It never establishes an empty acquisition.
- `cleanup()` seals admission and starts each eligible obligation once. Pending setup remains strongly retained; its actual settlement makes failure or success cleanup eligible.
- Success after closing remains reachable for cleanup and rejects publication as `setup-closed`.
- Concurrent or reentrant cleanup requests join the same action. Independent eligible cleanup proceeds despite another unresolved obligation.
- Mark release only from the selected adapter’s observed release contract.

Cleanup returns:

`{ kind: "released" }`

or

`{ kind: "unresolved"; cause: unknown; readback?: () => CleanupResult | Promise<CleanupResult> }`.

Thrown/rejected cleanup or an invalid result, including fulfilled `void`, means unresolved responsibility. Retain its raw action and error; do not replace it with a resettable observer promise. Admitted adapters must explicitly return release evidence.

`recover()` invokes only a retained readback function, with one readback flight at a time. Concurrent requests join it. Readback may establish release or retain uncertainty. This delivery exposes **no physical-cleanup retry** and never reacquires resources.

`CleanupReport` is `{kind:"complete"}` or `{kind:"incomplete", pendingIds, unresolved:[{id,cause}]}`. Pending IDs include every remaining obligation without a settled unresolved result. Completion requires cleanup requested and all owner records released. Counts/IDs are observations, not authority tokens.

Host additionally requires construction, dependent work and required child cleanup to settle before reporting attempt completion. Its deadline/abort observation returns an incomplete receipt with reason `deadline` or `aborted`; it does not mutate owner state, cancel raw actions or release prerequisites.

Before invoking the factory, TEST Host strongly retains an attempt containing the resource owner, raw factory action, original construction cause and adapter cells. Failed construction leaves this record reachable. A private `recoverAttempt(originalAttempt)` seals/starts cleanup and requests supported readback on that same owner. A `TestConstructionError` preserves `cause`, cleanup causes and a Host recovery reference to the retained attempt.

Assembly journal entries and instance cleanup delegate to that owner. Host stores custody and original errors, not a second editable disposal ledger. Remove the attempt only after actual completion.

## Supported adapters

**First TEST: event subscription.** Use a real TEST event emitter. Prepare the cell with the exact listener and its removal closure before registration; register, then await an initialization handshake. Handshake rejection leaves the existing subscription reachable through failure cleanup.

Cleanup closes handler admission, removes that listener, waits for already admitted handler work, then reports release. Independent event emission verifies that the listener no longer receives events. Neither a failed handshake nor absence of a returned handle permits dropping the cell.

**Second TEST: partial asynchronous temporary-file creation.** In an exclusively controlled disposable directory, retain the unique pathname and removal closure before starting an exclusive high-level file write. Retain the raw write promise. Await initialization only afterward; initialization can reject with a real partial file present.

No persistent descriptor escapes this adapter. Cleanup waits for actual write settlement before removing the owned pathname, preventing a late writer from recreating it. Successful removal or observed `ENOENT` establishes release. Other failures remain unresolved. Supported recovery reads back that exact pathname: absence establishes release; presence or uncertain inspection remains unresolved. It never repeats acquisition or blindly retries deletion. Replacement of that pathname is outside this bounded protocol.

These adapters have materially different acquisition, settlement and release observations. They are TEST adapter qualifications, not K1 production scopes.

**Callback limits:** registration cannot discover hidden effects, reconstruct an unknown handle, prove complete unwind, detect arbitrary native dependency loss, revoke escaped handles, validate a dishonest release assertion or force a callback to settle. Exotic thenables, detached post-settlement acquisition and unsupported resource relationships receive no guarantee.

Reentrant controls must see the already published action. Callback setup reentry is refused while setup is unsettled; cleanup reentry joins; recovery during raw cleanup starts nothing. Author callbacks receive no Host recovery/wait controls. Arbitrary captured closures can still create self-deadlock; the helper does not provide a universal callback-ancestry detector or liveness proof.

## Nested two-child TEST

Use one parent-owned append sink and two children borrowing only an ordinary `append(record)` port. One child owns the subscription; the other owns the temporary file. Each cleanup receives a separate private closure for its required shutdown acknowledgement through the parent sink. Neither receives parent teardown authority.

Register child retention **before its factory starts**. End it only after raw construction, admitted work and required cleanup settle.

The parent port synchronously checks admission and records active use before IO, without a callback or await between those steps. Closing ordinary admission uses that same synchronous boundary: each call is either retained or refused. Already admitted IO retains the sink until actual settlement.

Shutdown closes ordinary calls and child/setup admission, starts independent child cleanup once, and preserves the private acknowledgement path. Only after child retention and active use reach zero may parent cleanup run. Failure before factory return, pending setup, cleanup rejection or an observer deadline cannot release the parent. An independent sibling’s safe cleanup still proceeds.

Unexpected dependency loss is a separate health signal. The mediated port fences subsequent supported effects, including after awaits. Submitted IO can remain uncertain. Private cleanup access cannot resurrect a physically unavailable sink. No automatic tree destruction, replacement or replay follows.

Reject escaping lifetimes, overlapping external borrowing and cyclic cleanup prerequisites in this profile. No universal scheduler, streams custody transfer, dynamic loader/replacement, lifecycle hooks, production adoption, release or organization migration belongs to this delivery.

## Delivery and rejecting evidence

1. **Decision checkpoint:** obtain the bounded successor; retain authenticated decision identity and explicit exceptions. Before acceptance, candidate materialization remains rejected.
2. **Candidate and first TEST:** implement the substantive root, authoritative ledger, supported subscription adapter and reachable failed-construction custody together with source, declaration and packed-root checks.
3. **Nested TEST:** add the second adapter and two-child protocol, preserving independent physical observations.
4. **Guidance and evidence:** update current canonical Consumer Module Standard examples, affected TEST guidance/profile and rejecting gates together. Retain complete prior/current standard bytes, reviewed delta and exact new pin.

The current TEST standard has the same full-document hash as supplied GM authority: `33b41d5babf0a431c97e8e596a56e6ec1557ba1a0b26d39bf23e13d9a19e1fbd`. There is no demonstrated stale-pin defect. After the authorized guidance change, migrate TEST to that exact reviewed revision; retain historical pins and C0 examples.

Future fixtures must observe behavior with independent expectations:

| Fixture | Plausible regression and failing observation |
| --- | --- |
| Admission/reentry | Closed or busy setup increments an acquisition counter; recursive cleanup increments physical cleanup twice. |
| Subscription construction | Rejected handshake loses custody, or late success publishes; independently emitted events reach the supposedly released listener. |
| Temporary-file recovery | Failed initialization leaves a real file unreachable; a deadline drops the raw writer; readback reports release while the owned path still exists. |
| Nested shutdown | Parent disappears while child work/cleanup remains; failed child construction loses retention; safe sibling cleanup fails to progress; private acknowledgement is disabled with ordinary admission. |
| Health across await | After loss, a subsequent mediated append changes the independently read sink; unrelated child teardown occurs without policy. |
| Authority and admission | Borrowed teardown compiles; forbidden imports/root layouts pass Foundation; packed root/resolver consumers cannot use the intended surface. |
| Gate integrity | A required scenario disappears, a type fixture is excluded or the resource command becomes a no-op, yet the applicable gate succeeds. |

Assign each behavioral scenario one owning suite. Packed replay checks artifact compatibility; do not reproduce every Host scenario in library unit tests or derive expected traces from implementation state.

## Actual commands and runner changes

These commands exist in the relayed source. All execution below is **future verification**, not performed in this planning flow.

| Repository | Commands and intended use |
| --- | --- |
| GM | `pnpm check:changed` during implementation; `pnpm check:fast` before handoff; authoritative `pnpm check` before PR integration. |
| GM, existing limited checks | `pnpm ownership:checkpoint:test` preserves C0; `pnpm lifecycle:check` checks the pure kernel. Neither proves resource callbacks. |
| TEST | `pnpm typecheck`, `pnpm test`, `pnpm evidence`, with the resource coverage added below. |

**Proposed, NOT existing:** `pnpm ownership:resource:check`. Its substantive chain must build ownership, compile runtime and positive/negative public-root fixtures under supported NodeNext/Bundler resolvers and minimum/pinned compilers, and run resource-owner plus packed-root suites. Route it into GM changed-file feedback, fast and full gates. Existing gates currently contain no resource-helper coverage.

Atomically add the exact ownership package/lock importer and Foundation v3 `packageRoots`, retaining `rootPackage: true` and non-overlapping production/development boundaries. Reject unknown/differently named roots, nested manifests, install scripts, forbidden type/runtime imports, deep imports, ungoverned output and missing/no-op checks. Do not use exclusions or weaken existing Core/Assembly guards.

**Extend TEST `scripts/evidence/run.mjs` under existing `pnpm evidence`.** Its current implementation already replays separate published-0.1 and candidate-0.2 Core/Assembly installations with the exact kernel archive, strict required TAP names and explicit focused-file routing.

Add the ownership archive and its pin separately to both installation manifests/locks; retain each exact Core/Assembly pair and kernel identity. Record ownership’s candidate provenance separately even beside published Core/Assembly.

Keep existing lifecycle scenario lists/index boundaries intact. Add a distinct required resource-name list and explicit name-to-file routing for subscription and nested suites. Combined TAP validation must reject missing, duplicate, unexpected, failed, skipped, cancelled or todo scenarios; focused resource replay must run each required name exactly once. Route the new type fixtures into installed typechecking and source capture.

Extend archive verification and installed-root resolution for ownership. Evidence must bind candidate source SHA, executed worktree digest, authenticated successor, archive SHA-256/SRI, manifest/export conditions, locks, Node/pnpm/compiler versions, complete standard bytes/hash and observed outcomes.

The runner already rejects uncommitted replay inputs. Controller integration must therefore establish the exact reviewed source before accepted replay. This read-only worker performs no Git action.

Frozen offline installation and installed typechecking must pass. Archive-only diagnostics remain **pending** and never qualify lock installation. Preserve existing runner checks and claim boundaries.

## Acceptance, compatibility and retained review

Completion requires the accepted bounded successor, substantive candidate admission, both supported TEST slices, reachable failure recovery, one owner/action per obligation, enforced dependency boundaries, synchronized guidance/pins and accepted exact-archive replay. Admission, TEST conformance, K1 eligibility, publication and production adoption remain separate claims.

Existing passive consumers and Core/Assembly factory contracts remain compatible. Rollback removes only this candidate TEST integration; unresolved attempts retain their original owners until cleanup is observed. Never run parallel fallback ledgers for one obligation.

Retain [baseline reviews](evidence/module-resource-contract-20261001/README.md), [original identities](.research/input/previous-source-identities.json), [input hashes](.research/input/input-hashes.json), [current authority](.research/input/current-source-identities.json), [TEST identity](.research/input/test-consumer-identities.json), [round-one critique](.research/input/current-critique.md) and [supplement identities](.research/input/source-supplement/identities.json).

Baseline plan SHA-256 is `90ddd653e155b9731277e56ddc0e8e2cc6417c1ac0f137b27bc3468c71c7e0d2`; GM authority is `9c722ceff4ede307d06d7a4b63fdebe615f54c53`; TEST is `fcc10b2501420aacf9f904e976a4d230d3f02e68`. AR merged correction `b0bcb265d1466da3272078f9dfdb7c6784624283` supersedes historical scaffold gaps without qualifying this API. The Spring 7.0.9 supplement records a **10-second shutdown-phase default**, not physical-release proof.

Retained industry evidence supports paired cleanup and creator ownership; it does not supply our partial-async guarantees. Lifecycle-hook research stays separate.

Baseline reviews requested `gpt-6.1-sol/MAX/priority`; round-one critique requested MAX/default without fast; this fix requested XHIGH/fast. These are requested profiles, not independent backend attestations. Fresh internet evidence arrived through root relay; native browsing was disabled.

This read-only fix took approximately five minutes. No writes, Git, builds, tests, installs or runtime/provider flows occurred. Root retains the complete evidence and inspects this exact output before publication. Subsequent rounds and implementation checks remain unperformed.
