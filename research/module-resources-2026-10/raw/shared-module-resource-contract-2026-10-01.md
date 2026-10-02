> **SUPERSEDED on 2026-10-01 by the owner. Do not implement this plan.**
> Current direction: [module-resource-scopes-design-2026-10-01.md](module-resource-scopes-design-2026-10-01.md)
> and its implementation plan `module-resource-scopes-implementation-plan-2026-10-01.md`.
> Reasons: [review](shared-module-resource-contract-2026-10-01.review.md). Text below this banner is unchanged.

# Module-owned resources

Date: 2026-10-01. **Four critique/fix rounds complete; successor acceptance and implementation pending.** Scope is candidate admission, the planned subscription TEST and a nested two-child TEST with a materially different partial-async adapter. Delivery checks below are future requirements.

## Recommended admission and dependency decisions

Recommend **`@get-modular/ownership`**, root **`packages/ownership`**, version **`0.1.0-resource-candidate.1`**, `private: true`, zero runtime dependencies and Node `>=24.18.0 <25`. Select one root-only ESM export: `types: ./dist/index.d.ts`, `import: ./dist/index.js`. Export `createResourceOwner` and associated types; no internal subpaths or runtime test kit.

Require a **new accepted successor before package source**. It must authorize this exact callback/Promise surface, substantive candidate admission, disposable TEST consumption before ordinary K1, and synchronized guidance/profile/enforcement changes. A private flag does not admit source.

[ADR-0028](evidence/module-resource-planning-20261001/gm__adr-0028.md) excludes callback execution; [ADR-0029](evidence/module-resource-planning-20261001/gm__adr-0029.md) admits a narrower synchronous kernel. Preserve accepted ADRs and frozen C0 evidence byte-for-byte.

Ordinary **S3 → G1 → K1** remains. S3 completion is unproven; **G1 stays `hold`; K1 stays pending**. These TEST slices establish neither two eligible production ownership scopes nor trusted release authority or released-artifact binding.

One cohesive feature owns one authoritative obligation ledger per managed **module instance**. Ownership imports no external runtime or type dependency, including Core, Assembly, lifecycle-kernel, XF, Node, IO, product types or development tooling. Core, Assembly and kernel do not import ownership. TEST composition imports the public root; adapters own IO and product policy. Application code uses consumer-owned ports. Helpers and construction cells are private details, not composition nodes.

Bounded estimates: candidate source **300–450 LOC**; TEST adapters/Host/runner **250–400**; rejecting tests/type fixtures **450–700**; documentation/adoption **150–250**; total **1,150–1,800**, excluding unrelated K1 work.

## Exact optional authoring surface

Select:

- `createResourceOwner(): {resources: ResourceAuthor, control: ResourceControl}`.
- `ResourceAuthor.setup<T>({setup, cleanup}): Promise<T>`.
- `setup: () => T | Promise<T>`.
- `cleanup: (outcome: SetupOutcome<T>) => CleanupResult | Promise<CleanupResult>`.
- `SetupOutcome<T>`: `{kind:"ready", value:T}` or `{kind:"failed", cause:unknown}`.
- `ResourceControl`: `seal(): void`, `cleanup(): void`, `recover(): void`, synchronous `observe(): CleanupReport`.

Composition retains `control` and optionally supplies `module.resources` through the existing factory closure. Assembly injection stays unchanged. Pure and borrow-only modules need neither owners nor dummy callbacks. Children borrow narrow parent ports and never receive parent cleanup authority.

**Serial, awaited construction-only setup is a deliberate first-slice restriction. Later runtime acquisition/registration is excluded.**

Closed registration rejects with an Error carrying stable readonly code `setup-closed`; otherwise overlapping/reentrant setup rejects with `setup-busy`. Neither refusal invokes callbacks. Preserve original setup throws/rejections. Support ordinary Promises and non-thenable values; exotic thenables are outside coverage.

Retain the cleanup closure and adapter construction cell before fallible setup. One registration represents one cleanup obligation; independently releasable resources require separate registrations. Returned handles do not register the same obligation again.

At actual factory settlement, Host seals registration and reads authoritative `pendingSetupIds`. Nonempty IDs refuse publication and retain the original attempt, owner and raw factory product for cleanup. Correctly awaited setup may publish while its resource remains in cleanup `pendingIds`. These checks detect overlap/unsettled registration; they cannot prove `await` syntax or hidden-effect discipline.

## Custody, transitions and observation

Unreleased records strongly retain callbacks, resource cells, actual setup outcomes, raw setup/cleanup/readback actions and original failures. Admission is independently open/sealed.

Publish action holders before invoking consumer code; attach the exact raw result/Promise or synchronous exception afterward. Reentrancy cannot start another action. `seal` only closes registration; `cleanup` records the request, seals and dispatches eligible obligations; `recover` starts only supported observational readback. Controls return no shutdown Promise.

| Before | Observation/request | Result |
| --- | --- | --- |
| `setting-up` | Actual setup fulfillment/rejection | `ready`/`setup-failed`; retain outcome. After seal, fulfillment cannot publish and setup rejects `setup-closed`. Original rejection remains its cause. |
| `setting-up` | Cleanup requested | Retain pending setup; no cleanup invocation until settlement. |
| `ready` / `setup-failed` | Cleanup requested | `cleaning`; invoke the retained cleanup once. |
| `cleaning` | Valid released result | `released`. |
| `cleaning` | Unresolved, throw, rejection or malformed result | `unresolved`; retain original action and failure/result. |
| `unresolved` | Supported readback | One flight; released confirmation becomes `released`; other outcomes preserve debt. |
| `released` | Repeated cleanup/recovery | Inert; no callbacks or acquisition. |

Setup failure does not prove empty acquisition. Safe independent obligations progress despite unresolved peers.

`CleanupResult` is `{kind:"released"}` or `{kind:"unresolved", cause:unknown, readback?:()=>CleanupResult|Promise<CleanupResult>}`. `void` is malformed. Keep the original setup cause, first cleanup cause and subsequent `observationFailures` separately. Readback failure preserves its original function and custody; later release does not erase causes.

Concurrent/reentrant recovery joins retained readback. Unsettled setup, cleanup or readback prevents competing actions. **No physical cleanup retry or reacquisition.** Unsupported readback can leave debt unresolved indefinitely.

Both `CleanupReport` variants contain `pendingSetupIds`, `pendingIds` and `unresolved:[{id,cleanupCause,observationFailures}]`, plus `kind:"complete"|"incomplete"`:

- `pendingSetupIds` derives exclusively from `setting-up` records.
- `pendingIds` covers unreleased obligations outside `unresolved`.
- Complete requires requested cleanup and every obligation released; all three projections are empty.

Reports copy/freeze their inert structure; opaque causes retain identity and may themselves contain references. IDs grant no authority. Host keeps no mirrored setup/disposal ledger. Generic bookkeeping records adapter assertions; qualification establishes their meaning for supported adapters.

On accepted release, clear unnecessary owner-held setup/cleanup/readback callbacks, cells, `SetupOutcome.value`, raw actions and settled observer closures. Retain inert identities/outcomes and required original causes. Unresolved records retain everything needed for recovery.

## TEST Host construction and disposer contract

Before factory invocation, Host strongly retains the original attempt, owner, cells and raw factory action. Preserve the raw product before publication checks. Shutdown-requested attempts cannot publish. `TestConstructionError` retains the original cause when present, cleanup failures and observation/recovery access to that original attempt.

Select **`dispose(): Promise<void>`** for journal delegation and instance disposal. It requests the private shutdown gate, then observes authoritative owner reports and existing construction, admitted-work and prerequisite barriers. TEST fixtures supply a required finite Host observation budget; clocks/timers remain Host-owned.

Fulfill only after complete owner observation and satisfied Host barriers. Unresolved debt, observation deadline or observer abort rejects `TestCleanupIncompleteError` with readonly code `cleanup-incomplete`, reason `unresolved|deadline|aborted`, a snapshot of owner reports/unmet Host barriers and original-attempt observation/recovery access.

Deadline/abort neither settles nor cancels raw actions. Never install `ResourceControl.cleanup(): void` directly in a successful disposer slot.

Observation does not dispatch physical cleanup. Recovery joins the original gate and supported readback; satisfying prerequisites can permit a never-started parent close, never redispatch an existing action. Later genuine completion can satisfy a fresh observation without another physical invocation.

Drop active attempt retention only after actual completion. Completed recovery holders clear attempt, factory-product and action references, retaining an inert receipt and required causes. No generic scheduler, extra resource barrier or early construction timeout is introduced.

## Supported adapters

**Subscription:** use a real EventEmitter. Prepare exact listener identity, removal closure and cell before registration; register, then await initialization. Failed initialization retains listener custody through construction recovery.

The listener wrapper checks admission and reserves handler work synchronously before handler invocation, without an intervening callback/await. Shutdown closes admission at the same boundary, including during initialization. Sync return/throw and actual Promise settlement end work exactly once.

After setup settlement, cleanup removes the exact listener and drains admitted handlers. Independently inspect `emitter.listeners(event)`, emitted arrivals and handler settlement. Closed admission alone cannot prove detachment.

**Partial-async temporary file:** use an exclusively controlled disposable directory. Retain unique pathname and removal/readback closures before an exclusive high-level write; retain its raw Promise. Initialization may reject after a real partial file exists. No persistent child descriptor escapes.

Wait for actual write settlement before one removal attempt. Successful removal or observed `ENOENT` supports release. Other removal failures remain unresolved with their original cause and pathname readback.

Readback only inspects absence; it never writes/deletes. Presence or inspection uncertainty remains unresolved. Controlled external removal can permit confirmation. Qualification independently inspects the exact pathname through filesystem IO. Path replacement is excluded.

These are materially different TEST protocols, not K1 production scopes.

## Nested two-child prerequisite protocol

The parent owns one original read/write FileHandle used as an append sink. Setup writes cleanup-context records identifying the subscription event and child pathname; retain the handle immediately after opening, before further awaits.

Children receive ordinary `append(record)` without parent teardown authority. Append checks admission and reserves active use synchronously before IO; closure uses the same boundary. End use only on raw settlement.

Each child cleanup receives one zero-argument private read closure bound to its exact attempt, original parent handle and numeric record offset/length. Use actual numeric positions in `FileHandle.read` and child-local buffers; neither read consumes or repositions a shared cursor.

Publish the read-action holder before invocation. Retain its raw operation/native read Promise; repeated/reentrant calls join that action. Cleanup awaits the actual read, validates the returned context against its construction cell, then uses that parameter for listener removal/file cleanup. Cached metadata cannot replace the read. Pending, rejected, short or uncertain reads preserve custody; no retry/replacement guarantee applies.

**Every shutdown entrypoint uses one private Host gate:** explicit shutdown, original-attempt recovery, journal delegation and instance cleanup. Raw parent controls remain private.

Record the request and atomically close ordinary, child and setup admission. Readiness stays closed; narrowly bound private cleanup reads remain available while the dependency is healthy. Start safe independent child cleanup.

Invoke parent cleanup only after started construction/setup, admitted work and private reads settle **and every required child resource is observed released**. Child cleanup action settlement alone cannot discharge unresolved debt or its parent prerequisite. Re-evaluate the retained request on actual settlement/supported readback; start parent close once.

Select the parent release rule:

- One actually fulfilled supported `FileHandle.close()` establishes its adapter release result.
- Rejected/unknown close retains the original handle, action and cause as unresolved.
- Wrapper flags, `fd === -1` and subsequent read rejection cannot refine failed close to released. This slice supplies no release readback and never blind-retries close.

Successful reads through the original handle prove healthy prerequisite retention. Post-successful-close read rejection is supplementary behavior. Reopening the pathname proves neither retention nor original-handle release. Fixture housekeeping follows managed completion.

Signalled dependency loss fences new ordinary/private access and subsequent mediated effects after awaits; submitted IO may remain uncertain. Private cleanup cannot revive an unavailable sink. Loss is a health event with local policy, not automatic tree destruction, replacement or replay. Reject escaping lifetimes, overlapping external borrowing and cyclic prerequisites; support only this explicit nesting. No acknowledgement-append protocol remains.

## Trust limits and rejecting evidence

Arbitrary callbacks cannot expose hidden effects, reconstruct unknown handles, prove complete partial unwind, revoke escaped handles, detect unsignalled native loss, validate dishonest release assertions or force settlement. Captured closures can self-deadlock. Facet separation provides neither JavaScript isolation nor universal liveness proof. Detached post-settlement acquisition receives no guarantee.

Exclude production adoption, dynamic loading/replacement, streams custody transfer, release, organization migration, lifecycle hooks, global managers, service bags, reactive hook engines and durable recovery.

Future evidence must fail plausible observable regressions:

| Boundary | Required rejection |
| --- | --- |
| Owner/public types | Closed/busy setup acquires; held setup publishes; correctly awaited setup is refused merely because cleanup is pending; late fulfillment loses custody; reentrancy duplicates actions; instances share obligations; author/borrowed ports expose teardown. |
| Host disposal | Journal/instance disposal fulfills with pending construction, handlers, cleanup or child debt; deadline loses raw custody; later observation repeats physical cleanup. |
| Subscription | Failed initialization loses recovery; synchronous shutdown releases before handler settlement; sync throw leaks/double-settles work; omitted removal passes listener-membership inspection. |
| File | Real partial file escapes recovery; removal/readback loses causes; presence/inspection error reports release; omitted deletion or false absence passes independent pathname inspection. |
| Nested | Held real-read delivery closes the parent early or blocks safe sibling cleanup; unresolved child debt loses its prerequisite; children consume shared cursor state; private reads reopen ordinary admission. |
| Close/health | Unusable wrapper after rejected close falsely reports release; recovery retries close; post-await mediated effects proceed after signalled loss. |
| Admission/replay | Wrong roots/edges, broken packed exports, deleted required scenarios/type fixtures or no-op gates remain green. |

Counters supplement physical observations. Parameterize shutdown entrypoints within the owning suite; avoid duplicate layer checks. Review released-transition and completed-recovery paths for reference clearing; add no source-text, WeakRef or GC-guarantee tests.

## Delivery, pins and actual verification

After successor acceptance, deliver substantive admission, ledger, subscription and construction recovery together; then the second adapter/nested slice.

Atomically govern manifest/version, lock importer, Foundation v3 `packageRoots`, retained `rootPackage: true`, non-overlapping source/development boundaries and cohesive FMS adoption. Reuse Foundation enforcement. Reject nested manifests, install scripts, forbidden runtime/type edges, deep imports, ungoverned output and missing/no-op chains; no exclusions or pending-root suppression.

Update the [current Consumer Module Standard](evidence/module-resource-planning-20261001/agent-teams-ai_get-modular__docs__architecture__common-assembly.md#consumer-module-standard), examples and affected TEST profile/docs/rejecting checks in the same delivery. Current GM bytes and the documented TEST pin hash agree: `33b41d5babf0a431c97e8e596a56e6ec1557ba1a0b26d39bf23e13d9a19e1fbd`.

Before implementation, inspect the actual consumer pin, compare its retained bytes with current upstream, and review the authorized delta. Bind the migration to one exact reviewed new commit/full-document hash and accepting decision; retain old/new bytes and synchronize pin enforcement. Current equality does not complete future migration. Until migration/checks finish, adoption remains pending.

Existing commands from [GM](evidence/module-resource-planning-20261001/agent-teams-ai_get-modular__package.json) and [TEST](evidence/module-resource-planning-20261001/test-consumer__package.json):

| Repository | Future commands |
| --- | --- |
| GM | `pnpm check:changed`; `pnpm check:fast` before handoff; authoritative `pnpm check` before PR integration. |
| GM preservation | `pnpm ownership:checkpoint:test`, `pnpm lifecycle:check`; neither verifies this helper. |
| TEST | `pnpm typecheck`, `pnpm test`, `pnpm evidence`. |

**Proposed, NOT existing:** `pnpm ownership:resource:check`: substantive build, owner tests, public-root positive/negative NodeNext/Bundler fixtures with minimum TS 5.8.3/pinned compiler, and exact packed-root checks. Route into changed-file, fast and full gates.

Extend the actual [runner](evidence/module-resource-planning-20261001/source-supplement/test__evidence-run.mjs) inside `pnpm evidence`. Preserve separate published-0.1/candidate-0.2 Core/Assembly installations and kernel identities.

Add ownership archive/pin to both manifests/locks, archive validation and installed-root resolution. Preserve `expected.tests` and lifecycle index slicing. Add a separate required resource-name inventory with explicit routes to proposed `tests/resources/subscription.test.mjs` and `tests/resources/nested.test.mjs`.

Combined TAP uses both inventories; focused resource replay requires each name exactly once. Reject missing, duplicate, unexpected, failed, skipped, cancelled or todo scenarios. Hash/copy resource inventories, routes, fixtures, type fixtures and owning documentation into both replay installations.

Bind successor authentication, source SHA/worktree digest, archive SHA-256/SRI, exports, locks, standard bytes/hash and Node/pnpm/compiler versions. Preserve reviewed Node patches, pnpm 11.20.0 and TEST compiler 7.0.2. The runner rejects uncommitted replay inputs; controller integration establishes reviewed source before accepted replay. **Frozen offline lock installation and installed typechecking must pass. Archive-only diagnostics cannot qualify either.**

## Acceptance, rollback and portable evidence

Acceptance requires accepted successor, substantive admission, both observed TEST protocols, reachable original-attempt recovery, single cleanup actions, prerequisite-safe disposal, terminal reference clearing, enforced boundaries, synchronized guidance/pins and exact installed replay. Candidate admission, TEST conformance, K1 eligibility and release remain distinct.

Rollback removes bounded candidate TEST integration while unresolved attempts retain original owners/actions. Existing passive consumers and Core/Assembly remain compatible. Never install parallel fallback disposal ledgers.

Before publication, root must export complete supplied snapshots/identity manifests beneath `evidence/module-resource-planning-20261001/`, retain originals separately, verify hashes/plan links and inspect this exact output. Links resolve from `plans/shared-module-resource-contract-2026-10-01.md`; exports are required, not worker-created artifacts.

Retain [baseline](evidence/module-resource-planning-20261001/plan.md), [input plan](evidence/module-resource-planning-20261001/round-3-plan.md), [round-four critique](evidence/module-resource-planning-20261001/round-4-critique.md), [prior fix](evidence/module-resource-planning-20261001/round-3-fix.md), [input hashes](evidence/module-resource-planning-20261001/input-hashes.json), [original identities](evidence/module-resource-planning-20261001/previous-source-identities.json), [authority identities](evidence/module-resource-planning-20261001/current-source-identities.json), [TEST identity](evidence/module-resource-planning-20261001/test-consumer-identities.json) and [supplement identities](evidence/module-resource-planning-20261001/source-supplement/identities.json).

This input plan is SHA-256 `43a6ac34b1ab3f024eb6be2bf8b7921997d4621b95b0fde03b581f5c47586bbd`; its embedded `310c519f…` identifies its previous input. GM: `9c722ceff4ede307d06d7a4b63fdebe615f54c53`; TEST: `fcc10b2501420aacf9f904e976a4d230d3f02e68`.

Earlier baseline research reports remain historical inputs. This run retained five completed hook-research reports separately from eight successful critique/fix reports. Hook research and round-one critique requested gpt-6.1-sol MAX/default; all fixes and rounds two through four requested XHIGH/FAST under the later Oct 1 instruction. These are requested profiles, not backend attestations. Root inspected and retained all eight successful round reports; individual workers received their bounded current/prior inputs, not the complete history.

[Root corrections](evidence/module-resource-planning-20261001/source-corrections.md) establish AR `b0bcb265d1466da3272078f9dfdb7c6784624283` superseding scaffold gaps without qualifying this API. [Spring evidence](evidence/module-resource-planning-20261001/primary-frameworks.json) and [source](evidence/module-resource-planning-20261001/source-supplement/spring-projects_spring-framework__spring-context__src__main__java__org__springframework__context__support__DefaultLifecycleProcessor.java) support the 7.0.9 ten-second shutdown-phase default, not physical release.

Planning workers changed no source files. Root saved the plan, full reports, source snapshots and identities, checked retained hashes and local plan links, and inspected the final correction against R4-1 through R4-4. No implementation, builds, tests, installs, commits or application runtime/agent/provider flows were performed. Sources were supplied/root-relayed; native worker browsing remained unavailable. Successor acceptance, implementation verification, K1 and release qualification remain pending.

## Planning delivery record

The [flow and evidence index](evidence/module-resource-planning-20261001/README.md) retains the exact critique/fix chain, original source bytes, failures before output and actual requested worker profiles. The raw fourth-round plan is retained unchanged; root publication adjusts status, provenance and local links only. It makes no new ADR decision or implementation claim.

The [experimental hook synthesis](lifecycle-hooks-research-2026-10-01.md) is separate. It recommends explicit selected-input ports first; no generic didChangeDependencies driver is added to this resource delivery. Five workers analyzed relayed primary sources; this is not five independently browsing online researchers. The installed worker runtime lacked the required admitted research network/tool profile.

Node/pnpm/compiler values above bind the reviewed GM/TEST baseline, not a new organization runtime policy. If the separately owned runtime migration changes that baseline before implementation, review and bind that exact delta before candidate admission/replay; do not reinstall old versions or follow moving main silently. This plan does not own Node migration.
