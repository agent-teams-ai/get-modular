# Module-owned resources: round 4 critique

**Four remaining defects need correction before implementation.** They concern observable setup settlement, cleanup delegation, failed-close evidence and terminal reference retention. No broader architecture change is needed.

Reviewed [current plan](../evidence/module-resource-planning-20261001/current-plan.md) SHA-256:

`43a6ac34b1ab3f024eb6be2bf8b7921997d4621b95b0fde03b581f5c47586bbd`

The plan’s embedded `310c519f…` identifies its previous input, not these reviewed bytes. Requested profile for this round: **gpt-6.1-sol, XHIGH, FAST**. The earlier MAX/default request is historical; these labels describe owner requests, not backend attestation.

## R4-1 — High: pending setup is indistinguishable from outstanding cleanup

**Affected sections:** “Exact optional authoring surface”; “Custody, cleanup, observation and recovery.”

Factory publication must be refused while registered setup remains unsettled. However, `observe()` exposes only cleanup `pendingIds`, which include both `setting-up` records and ready resources awaiting cleanup. A factory can return after starting setup without awaiting it; the selected public surface cannot distinguish that attempt from a correctly constructed resource.

**Precise correction:** Add an inert `pendingSetupIds` projection to `CleanupReport`, derived exclusively from authoritative `setting-up` records. Expose it in both report variants; a complete report necessarily contains an empty projection. Keep it separate from cleanup `pendingIds`.

At actual factory settlement, Host seals registration and checks this projection before publication. A nonempty projection refuses publication and retains the original attempt, raw factory product and owner for cleanup. Late setup settlement remains attached to that attempt. Host must not maintain a mirrored setup ledger.

This enforces the admitted **serial, awaited, construction-only profile** through observable pending work. It does not introspect whether callers actually used `await`, or extend coverage to later runtime acquisition.

**Acceptance:** A held setup followed by factory fulfillment cannot publish. A correctly awaited setup can publish even though its resource still appears in cleanup `pendingIds`. After refused publication, late fulfillment preserves custody and receives cleanup without reacquisition.

## R4-2 — High: cleanup dispatch lacks an exact Host disposer contract

**Affected sections:** “Custody, cleanup, observation and recovery”; “Nested two-child prerequisite protocol”; acceptance criteria.

`ResourceControl.cleanup(): void` dispatches retained work. Passing it directly as a journal or instance disposer would allow successful disposal observation while cleanup remains pending or unresolved. The common parent gate establishes ordering, but the plan does not select the return behavior of its Host cleanup adapter.

The [Assembly contract](../evidence/module-resource-planning-20261001/agent-teams-ai_get-modular__docs__architecture__common-assembly.md#outcomes-and-ownership-transfer) assigns cleanup policy to Host; Assembly construction does not establish resource release.

**Precise correction:** Specify the TEST Host’s journal/instance `dispose(): Promise<void>` adapter. It requests cleanup through the existing private gate, then uses a bounded Host observation of the authoritative owner and existing construction, work and prerequisite barriers.

The disposer fulfills only after complete owner observation and satisfied Host prerequisites. An incomplete observation—including unresolved debt, pending work at an observation deadline, or observer abort—rejects with a cleanup-incomplete error carrying observation/recovery access to the original attempt. It preserves raw actions and custody. Observation/recovery must not redispatch physical cleanup.

Keep direct `ResourceControl.cleanup` out of successful disposer slots. This requires no generic scheduler, new resource barrier or early construction timeout.

**Acceptance:** Journal delegation and instance disposal cannot fulfill while setup, admitted handlers, cleanup or child debt remains outstanding. A deadline reports incomplete without settling the raw action. Later genuine completion can be observed successfully without another physical cleanup invocation.

## R4-3 — High: failed FileHandle close can be mistaken for release

**Affected section:** “Nested two-child prerequisite protocol,” especially close-state refinement and closed-handle observations.

The plan permits refinement through observation of the original handle’s closed state and requires reads to fail after completion. These observations are insufficient following a failed close: a wrapper flag, `fd === -1`, or rejected read can describe an unusable JavaScript handle without establishing native release.

The retained [AR descriptor owner](../evidence/module-resource-planning-20261001/source-supplement/agent-teams-ai_agent-runtime__packages__apps__embedded-runtime__src__features__ordinary-session-runtime__adapters__ordinary-observation-journal.ts) already treats thrown close as uncertainty and prohibits blind retry. This is counterevidence to the proposed inference, not an unfixed AR bug.

**Precise correction:** Select the parent TEST adapter’s rule explicitly:

- One actually fulfilled supported `FileHandle.close()` establishes the adapter’s release result.
- Rejected or unknown close remains unresolved, retaining the original handle, action and cause.
- Wrapper state, descriptor sentinel values and subsequent read rejection cannot refine that failure to released. This slice supplies no such release readback and never blind-retries close.

Keep successful original-handle reads as prerequisite-retention evidence while the dependency is healthy. Treat post-close read rejection as supplementary behavior only.

The already specified fixed record positions must be actual numeric file positions in `FileHandle.read`, using a read/write handle and child-local buffers. Neither child read may consume or reposition a shared mutable cursor.

**Acceptance:** A failed-close fixture that makes the wrapper unusable still reports unresolved and retains custody after recovery requests. Successful close is invoked once. Both children read their own fixed context despite ordinary appends. Ordinary append admission remains closed throughout shutdown; private reads never restore readiness.

## R4-4 — Medium: released records can retain every resource indefinitely

**Affected sections:** “Custody, cleanup, observation and recovery”; original-attempt recovery.

“Each record strongly retains” callbacks, cells, setup outcomes and raw actions has no terminal exception. Dropping Host attempt retention alone does not help when a retained owner or recovery closure still reaches released records, resolved Promises containing resource values, or cleanup closures capturing those resources.

**Precise correction:** On an accepted released transition, clear unnecessary owner-maintained setup/cleanup/readback callbacks, resource cells, `SetupOutcome.value`, raw actions and settled observer closures. Retain inert identity/outcome information and required original causes. Completed recovery holders must likewise clear their active attempt/action references.

Unresolved records continue to retain strong custody of everything needed for observation and recovery. Preserve opaque original causes unchanged, acknowledging that they may themselves contain references.

**Acceptance:** Review the released transition and completed recovery-holder paths to establish that these unnecessary references are cleared. Existing repeated cleanup/recovery behavior remains inert, while unresolved attempts retain their original actions. Do not add WeakRef tests, a registry, GC guarantees or claims of native-effect absence.

## Previous corrections and whole-plan consistency

The [prior fix](../evidence/module-resource-planning-20261001/prior-fix-report.md) is reflected in the reviewed plan:

- Optional module-local setup/cleanup, instance ownership and child borrowing remain intact. Pure and borrow-only modules require no dummy callbacks.
- Serial construction-only setup is a deliberate first-slice restriction. Later runtime acquisition remains excluded.
- Child cleanup **action settlement** is explicitly distinct from **observed resource release**. Unresolved child debt retains its parent prerequisite.
- Subscription evidence independently inspects exact listener membership, emitted arrivals and handler settlement. A closed admission flag cannot substitute for detachment.
- Temporary-file readback only observes absence. Independent exact-path inspection rejects false release assertions, retained files and inspection uncertainty.
- Timeout/abort never settles cleanup. Arbitrary callbacks cannot prove partial unwind, revoke escaped handles or validate dishonest release assertions. Private cleanup access cannot reopen ordinary work.
- Package identity, root-only exports, dependency direction and substantive admission remain bounded. A **new accepted successor must precede package source**; accepted ADR-0028/0029 and frozen C0 remain immutable. **G1 stays hold; K1 stays pending.**
- Current standard-byte equality is recorded without claiming migration complete. Authorized shared changes still require reviewed old/new bytes and an exact new revision, with synchronized TEST guidance/profile/enforcement.
- The bounded estimate totals **1,150–1,800 LOC**. No additional framework or qualification work is justified by these findings.

The [GM manifest](../evidence/module-resource-planning-20261001/agent-teams-ai_get-modular__package.json) and [TEST manifest](../evidence/module-resource-planning-20261001/test-consumer__package.json) support the named existing commands. `ownership:resource:check` is correctly marked proposed.

Review of the exact [evidence runner](../evidence/module-resource-planning-20261001/source-supplement/agent-teams-ai_modularity-host-test__scripts__evidence__run.mjs) confirms separate archive-pair installations, lifecycle inventory slicing, committed-input checks and frozen offline installation/typechecking. The planned ownership extension explicitly covers both manifests/locks, archive/root resolution, resource inventories/routes and hashed replay inputs. Archive-only diagnostics cannot replace installed replay.

Rollback remains bounded to candidate TEST integration, preserving unresolved original owners without parallel fallback disposal. Portable snapshot export, hash/link verification and authentic retention of historical reviews remain root publication prerequisites; missing reviews were not treated as inspected.

No genuine unresolved architectural choice warrants scored alternatives. The four corrections above are local specification fixes.

This was a read-only review using supplied and root-relayed sources, including the retained Engineering Quality Standard and docs-authoring instructions. Native web research was unavailable; relay evidence is indirect. No files, Git operations, builds, tests, installs or runtime/provider/agent flows were performed. Review elapsed approximately 3½ minutes. Successor acceptance, implementation verification and qualification remain pending.
