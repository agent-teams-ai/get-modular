BEGIN_PLAN
# Module-owned resources

Date: 2026-10-01. **Round 3 of 4 fix proposal; acceptance pending.** Scope is candidate admission, the first qualified subscription TEST and a nested two-child TEST with a materially different partial-async adapter. All delivery checks below are future requirements.

## Recommended admission and dependency decisions

Recommend **`@get-modular/ownership`** at **`packages/ownership`**, version **`0.1.0-resource-candidate.1`**, `private: true`, zero runtime dependencies and Node range `>=24.18.0 <25`. Select one root-only ESM export, with `types` pointing to `./dist/index.d.ts` and `import` to `./dist/index.js`. Export `createResourceOwner` and associated types; expose no internal subpaths or test kit.

Require a **new accepted successor before package source**. It must authorize the exact callback/Promise surface below, substantive candidate admission and disposable TEST consumption before ordinary K1, and synchronized current guidance/profile/enforcement changes.

[ADR-0028](../evidence/module-resource-planning-20261001/agent-teams-ai_get-modular__docs__decisions__0028-authorize-the-optional-ownership-contract-checkpoint.md) excludes callback execution; [ADR-0029](../evidence/module-resource-planning-20261001/agent-teams-ai_get-modular__docs__decisions__0029-admit-an-optional-lifecycle-kernel-candidate.md) admits a narrower synchronous kernel. Preserve both accepted documents and frozen C0 evidence byte-for-byte.

Ordinary **S3 → G1 → K1** remains. S3 completion is unproven; **G1 stays `hold`; K1 stays pending**. These TEST slices establish neither two eligible production ownership scopes nor trusted release authority or released-artifact binding.

One cohesive feature owns one authoritative obligation ledger per managed **module instance**. Ownership imports no Core, Assembly, lifecycle-kernel, Node, IO, product types or development tooling, including type-only edges. Core, Assembly and kernel do not import ownership. TEST composition imports its public root; adapters own IO and product policy. Domain/application code uses consumer-owned ports. Helpers and construction cells are private implementation details, not composition nodes.

Bounded planning estimate: candidate source **300–450 LOC**; TEST adapters/Host/runner **250–400**; rejecting tests/type fixtures **450–700**; documentation/adoption **150–250**; total **1,150–1,800**. These are estimates, exclude unrelated K1 work and replace the alternatives table.

## Exact optional authoring surface

Select:

- `createResourceOwner(): { resources: ResourceAuthor; control: ResourceControl }`.
- `ResourceAuthor.setup<T>({setup, cleanup}): Promise<T>`.
- `setup: () => T | Promise<T>`.
- `cleanup: (outcome: SetupOutcome<T>) => CleanupResult | Promise<CleanupResult>`.
- `SetupOutcome<T>` is `{kind:"ready", value:T}` or `{kind:"failed", cause:unknown}`.
- `ResourceControl` exposes `seal(): void`, `cleanup(): void`, `recover(): void`, and synchronous `observe(): CleanupReport`.

Composition retains `control` and supplies only `resources` through the existing factory closure as optional `module.resources`. Assembly injection is unchanged. Each managed instance receives its own owner; definitions are not resource singletons. Pure and borrow-only modules need no helper or dummy callbacks. Children borrow narrow parent ports and never receive parent disposal authority.

**This slice supports serial, awaited setup during construction only. Later runtime acquisition and registration are excluded and receive no coverage claim.** Seal registration at factory settlement; pending registered setup prevents publication.

Closed setup returns a rejected Promise containing an `Error` with stable readonly code `setup-closed`; otherwise overlapping/reentrant setup rejects with `setup-busy`. Refusal invokes neither callback. Original setup throws/rejections remain the setup cause. Support ordinary Promises and non-thenable values; exotic thenables are outside coverage.

Retain the cleanup closure and adapter construction cell before invoking setup, including acquisition that can fail without returning a handle. One registration represents one cleanup obligation. Independently releasable resources need separate registrations; returned handles never register the same obligation again.

## Custody, cleanup, observation and recovery

Each record strongly retains callbacks, cell, actual setup outcome, raw setup/cleanup actions, original errors and any readback function/actions. States are `setting-up`, `ready`, `setup-failed`, `cleaning`, `unresolved`, `released`; admission is independently open/sealed.

Publish each action holder before invoking consumer code, then attach its exact raw result/Promise or synchronous exception. Reentrant controls cannot create another action. Controls initiate retained work and return no shutdown Promise that a callback could await.

Cleanup seals registration and invokes each eligible cleanup once. Pending setup stays retained until actual settlement. Late success is saved for cleanup and refused publication as `setup-closed`. Setup failure never proves empty acquisition. Independent safe obligations progress despite unresolved peers.

`CleanupResult` is `{kind:"released"}` or `{kind:"unresolved", cause:unknown, readback?:()=>CleanupResult|Promise<CleanupResult>}`. Throw, rejection or malformed completion, including `void`, preserves unresolved responsibility and the raw failure/result.

Retain the original setup cause, first cleanup cause and subsequent `observationFailures` separately. Readback throw/rejection/malformed output preserves both custody and the original readback function. Later release does not erase captured causes.

Recovery invokes only retained observational readback, one flight per obligation. Concurrent/reentrant requests join that flight; unsettled setup, cleanup or readback prevents competing actions. **No physical cleanup retry or reacquisition.** A callback without usable readback can remain unresolved indefinitely.

`CleanupReport` is a fresh inert snapshot: `{kind:"complete"}` or `{kind:"incomplete", pendingIds, unresolved:[{id, cleanupCause, observationFailures}]}`. Pending IDs cover unreleased obligations outside unresolved state. Completion requires requested cleanup and every record released; IDs grant no authority. The generic ledger records adapter assertions; independent qualification establishes their meaning for the supported adapters.

Before invoking a factory, TEST Host strongly retains its attempt, owner, cells and raw factory action. `TestConstructionError` preserves the original `cause`, retained cleanup failures and a recovery/observation reference to that **original attempt**.

Host completion additionally requires construction, admitted work and child prerequisites. Observation deadline/abort returns incomplete with reason `deadline`/`aborted`; it neither settles nor cancels raw actions. Drop strong attempt retention only after actual completion.

## Supported resource adapters

**Subscription:** use a real EventEmitter. Prepare exact listener identity, removal closure and cell before registration; register, then await initialization. Failed initialization retains the listener through failed-construction recovery.

The listener wrapper checks admission and reserves handler work synchronously before invoking handler code, without an intervening callback or await. Shutdown closes admission at that same boundary, including during initialization. Sync return/throw and actual Promise settlement end work exactly once.

After setup settlement, cleanup removes the exact listener and drains admitted handlers. Qualification combines independent `emitter.listeners(event)` membership inspection, emitted arrivals and handler-settlement observations. Closing admission alone cannot prove removal.

**Partial-async temporary file:** use an exclusively controlled disposable directory. Retain unique pathname and removal/readback closures before an exclusive high-level write; retain its raw Promise. Initialization may reject after a real partial file exists. No persistent child descriptor escapes.

Wait for actual write settlement before one removal attempt. Removal success or observed `ENOENT` supports release. Catch other removal failures and return unresolved with the original cause and retained pathname readback.

Readback only inspects absence; it never writes or deletes. Presence or inspection uncertainty remains unresolved. Controlled external removal may permit subsequent confirmation. Qualification separately inspects the exact pathname through filesystem IO, independent of the adapter result. Path replacement is excluded.

These are materially different TEST protocols, not K1 production scopes.

## Nested two-child prerequisite protocol

The parent owns one original open FileHandle used as an append sink. Parent setup writes fixed cleanup-context records for the two identified children: the subscription event and owned child pathname. Retain the handle immediately after opening, before subsequent awaits. Fixture directory/path housekeeping occurs only after managed obligations complete.

Each child receives ordinary `append(record)` without parent teardown authority. Ordinary append checks admission and reserves active use synchronously before IO; closure uses the same boundary. End use only on raw settlement.

Each child cleanup receives one **zero-argument private read closure**, bound to its exact attempt, fixed record position and **original parent handle**. It accepts no arbitrary record or pathname and grants no ordinary append capability.

Publish its read-action holder before invocation; retain the raw operation/native read Promise in the original child cell. Repeated/reentrant calls join that action. Cleanup awaits the actual handle read, validates the returned event/path against its retained construction cell, then uses that parameter for its actual listener removal/file cleanup. Cached metadata or an arbitrary success marker cannot substitute for the read.

Pending, failed or uncertain reads preserve custody. A rejected read has no retry/replacement guarantee in this slice. Remove acknowledgement appends, their identities and commit/readback machinery entirely.

**Every parent shutdown entrypoint uses one private Host gate:** explicit shutdown, original-attempt recovery, journal delegation and instance cleanup. None exposes raw parent cleanup controls.

Record the request immediately and atomically close ordinary, child and setup admission. Parent readiness stays closed; narrowly bound cleanup reads remain available while the dependency is healthy. Start safe independent child cleanup.

Invoke parent cleanup only after all started construction/setup, admitted work and private reads settle **and every required child resource is observed released**. Settled child cleanup actions with unresolved debt still retain the parent prerequisite. Host reads authoritative owner observations and retained barriers rather than maintaining another disposal ledger.

Re-evaluate the retained request on actual settlement or supported readback confirmation; start parent close once. Parent close failure retains its original handle/action and cause; only supported observation of that handle’s closed state can refine release.

Independently read through the original handle while prerequisites remain unresolved. After genuine completion, reading through that same handle must fail with closed-handle behavior. Reopening the pathname cannot prove original-handle retention.

Signalled dependency loss fences new ordinary/private access and subsequent mediated effects after awaits. Already submitted IO may remain uncertain. Private cleanup access cannot revive an unavailable sink. No automatic tree destruction, replacement or replay follows. Reject escaping lifetimes, overlapping external borrowing and cyclic prerequisites; support only this explicit nesting.

## Limits and focused rejecting evidence

Arbitrary callbacks cannot expose hidden effects, reconstruct unknown handles, prove complete partial unwind, revoke escaped handles, detect unsignalled native loss, validate dishonest release assertions or force settlement. Captured closures can self-deadlock; facet separation provides neither arbitrary-JavaScript isolation nor universal liveness proof. Detached post-settlement acquisition receives no guarantee.

Exclude production adoption, dynamic loaders/replacement, streams custody transfer, release, organization migration, lifecycle hooks, global managers, service bags, reactive hook engines, durable recovery and universal schedulers.

Future suites use independent observations and plausible regressions:

| Owner | Regression that must fail |
| --- | --- |
| Owner/public types | Closed/busy setup acquires; late success publishes; reentrant cleanup duplicates an action; deadline loses raw custody; instances share obligations; author facet exposes controls or borrowed ports expose teardown. |
| Subscription | Failed initialization loses recovery; synchronous handler shutdown releases before handler settlement; sync throw leaks/double-settles work; omitted removal passes despite retained listener membership. |
| Nested/file | Failed initialization leaves a real file; removal rejection loses either cause/readback; presence or inspection error reports release. Omitted deletion or false absence assertion must fail direct pathname inspection. External removal permits readback without another acquisition/deletion. |
| Nested/prerequisites | Hold delivery of one real handle-read result: parent stays usable while safe sibling cleanup progresses. Every shutdown entrypoint must preserve the original handle through pending construction/work, rejected reads and unresolved child deletion. Actual satisfaction closes it once. |
| Nested/health | Loss across an await permits subsequent mediated effects or reopens readiness. Independent sink/path inspection must expose the effect. |
| Admission/replay | Wrong roots/edges pass; packed exports fail; deleting a required scenario/type fixture or making a gate a no-op leaves verification green. |

Counters supplement physical observations; owner reports alone cannot prove release. Do not mirror private implementation transitions or duplicate these scenarios at every layer.

## Delivery and actual verification

After successor acceptance, deliver substantive candidate admission, ledger, subscription and failed-construction recovery together; then the second adapter/nested slice. Atomically govern the exact manifest/version, lock importer, Foundation v3 `packageRoots`, retained `rootPackage: true`, non-overlapping source/development boundaries and cohesive FMS adoption. Reuse Foundation enforcement; add no import parser, exclusions or pending-root suppression.

Reject wrong roots, nested manifests, install scripts, forbidden runtime/type edges, deep imports, ungoverned output and missing/no-op command chains.

Update [current Consumer Module Standard guidance](../evidence/module-resource-planning-20261001/agent-teams-ai_get-modular__docs__architecture__common-assembly.md#consumer-module-standard), examples, affected TEST profile/docs and rejecting checks in the same authorized delivery. Supplied GM and TEST standard bytes agree at SHA-256 `33b41d5babf0a431c97e8e596a56e6ec1557ba1a0b26d39bf23e13d9a19e1fbd`. Review the authorized delta, migrate to an exact reviewed revision and retain old/new bytes; never follow moving main silently.

Existing commands from the [GM](../evidence/module-resource-planning-20261001/agent-teams-ai_get-modular__package.json) and [TEST](../evidence/module-resource-planning-20261001/test-consumer__package.json) manifests:

| Repository | Future commands |
| --- | --- |
| GM | `pnpm check:changed` during implementation; `pnpm check:fast` before handoff; authoritative `pnpm check` before PR integration. |
| GM preservation | `pnpm ownership:checkpoint:test` and `pnpm lifecycle:check`; neither verifies this helper. |
| TEST | `pnpm typecheck`, `pnpm test`, `pnpm evidence`. |

**Proposed, NOT existing:** `pnpm ownership:resource:check`, covering substantive build, owner tests, public-root positive/negative NodeNext/Bundler fixtures with minimum/pinned compilers, and exact packed-root tests. Route it into changed-file, fast and full gates.

Extend the actual [TEST runner](../evidence/module-resource-planning-20261001/source-supplement/agent-teams-ai_modularity-host-test__scripts__evidence__run.mjs) **inside `pnpm evidence`**. Preserve its separate published-0.1/candidate-0.2 Core/Assembly installations and kernel identities.

Add ownership archive/pin to both manifests/locks, archive validation and installed-root resolution. Preserve `expected.tests` and lifecycle index slicing. Add a separate required resource-name inventory and explicit routing to proposed `tests/resources/subscription.test.mjs` and `tests/resources/nested.test.mjs`.

Combined TAP validation uses both inventories; focused resource replay requires each name exactly once. Reject missing, duplicate, unexpected, failed, skipped, cancelled or todo scenarios. Include resource inventory, routes, fixtures and owning documentation in the hashed replay snapshot and both installations; include all type fixtures in installed typechecking.

Bind successor authentication, candidate source SHA/worktree digest, archive SHA-256/SRI, manifests/exports, locks, standard bytes/hash and Node/pnpm/compiler versions. The runner rejects uncommitted replay inputs; controller integration establishes reviewed source before accepted replay. **Frozen offline lock installation and installed typechecking must pass; archive-only diagnostics cannot qualify either.**

## Acceptance, rollback and portable evidence

Delivery acceptance requires accepted successor, substantive admission, both observed TEST protocols, reachable original-attempt recovery, one cleanup owner/action, prerequisite-safe shutdown, enforced boundaries, synchronized guidance/pins and exact installed replay. Candidate admission, TEST conformance, K1 eligibility and release remain distinct.

Rollback removes bounded candidate TEST integration while unresolved attempts retain their original owners. Existing passive consumers and Core/Assembly contracts remain compatible. Never run parallel fallback disposal ledgers.

**Before publication, root must mechanically export the complete supplied snapshots and identity manifests beneath `evidence/module-resource-planning-20261001/`, retain original evidence separately, verify hashes and every plan link, and inspect this exact output.** Links here resolve relative to `plans/shared-module-resource-contract-2026-10-01.md`; they specify required exports, not files created by this worker.

Retain [baseline](../evidence/module-resource-planning-20261001/plan.md), [input plan](../evidence/module-resource-planning-20261001/current-plan.md), [round-three critique](../evidence/module-resource-planning-20261001/current-critique.md), [prior fix](../evidence/module-resource-planning-20261001/prior-fix-report.md), [input hashes](../evidence/module-resource-planning-20261001/input-hashes.json), [original identities](../evidence/module-resource-planning-20261001/previous-source-identities.json), [authority identities](../evidence/module-resource-planning-20261001/current-source-identities.json), [TEST identity](../evidence/module-resource-planning-20261001/test-consumer-identities.json) and [supplement identities](../evidence/module-resource-planning-20261001/source-supplement/identities.json).

Input plan SHA-256: `310c519fc5692d078483861f46997f8904297b633a1459dc2e872fcb088fc8ce`. GM: `9c722ceff4ede307d06d7a4b63fdebe615f54c53`; TEST: `fcc10b2501420aacf9f904e976a4d230d3f02e68`. Baseline/prior-round identities remain in retained records. A standalone round-two critique was not supplied; do not mislabel the round-three file or claim that missing artifact was inspected.

The original four research results remain separate from four-round fix evidence. Original requests were MAX/priority; round-one critique MAX/default; fixes/current round XHIGH/FAST. These are requested profiles, not backend attestations.

[Root corrections](../evidence/module-resource-planning-20261001/source-corrections.md) establish AR `b0bcb265d1466da3272078f9dfdb7c6784624283` superseding historical scaffold gaps without qualifying this API. [Spring source](../evidence/module-resource-planning-20261001/source-supplement/spring-projects_spring-framework__spring-context__src__main__java__org__springframework__context__support__DefaultLifecycleProcessor.java) and [relayed documentation](../evidence/module-resource-planning-20261001/primary-frameworks.json) support the 7.0.9 ten-second shutdown-phase default; it proves no physical release. Industry evidence does not establish this helper’s async guarantees.

This read-only rewrite took approximately four minutes. No files, Git operations, builds, tests, installs or agent/runtime/provider flows were performed. Internet sources were root-relayed; native browsing remained disabled. **Round-four review/fix, successor acceptance and implementation verification remain unperformed; status remains proposal.**
END_PLAN

| Finding | Correction |
| --- | --- |
| R3-1: Unnecessary acknowledgement machinery | Replaced uncertain appends with exact-child-bound real reads through the original parent handle. Retained one action per read; unresolved child debt still blocks parent cleanup. |
| R3-2: Indirect release evidence | Added independent exact-path inspection and original-handle usability/closed-handle observations. False release assertions and omitted deletion must fail. |
| R3-3: Unselected public interface | Selected factory return shape, callback signatures, void controls, synchronous observation and rejected-Promise refusal codes. Composition supplies only the author facet. |
| R3-4: Scope and estimates | Explicitly restricted setup to serial awaited construction. Removed scored alternatives and bounded estimates by delivery component. |
| R3-5: Nonportable evidence chain | Replaced worker paths with relative export destinations under the requested evidence directory. Root must retain snapshots and verify links/hashes before publication. |
| Prior valid fixes | Preserved partial-failure readback, original causes, shared prerequisite gate, atomic handler retention and independent listener-membership evidence. |
| Remaining prerequisites | No unresolved R3 design choice. Root export/link audit and authentic retention of the missing standalone round-two critique remain pending, alongside successor acceptance and future implementation checks. Four-round completion is not claimed. |
