# Independent review of lifecycle-hooks research, revision 2

Date: 2026-10-01. Read-only independent review; only this file was written. One scratch
TS fixture was compiled outside the repository (TS 7.0.2, 5.9.3).

## Verdict

Revision 2 meets the eleven owner requirements, fixes revision 1's gaps and
reintroduces no generic driver. No P1. Five P2 items should be fixed: chiefly,
"No conflict found" misses the resource plan's drain rule, so cleanup as written
could report `released` while an async derivation still runs.

## Findings

**R2-1 - P2 - Missed resource-plan conflict: cleanup does not drain the active run.**
Location: API contract, "`unsubscribe()` ... removes the active run's publication authority. It does not claim cancellation"; "Ownership: ... maps it, plus an independent detachment check, to `CleanupResult`"; Conflicts bullet 2, "matching its own subscription adapter rule".
Evidence: resource plan, "cleanup removes the exact listener and drains admitted handlers" and required rejection "Journal/instance disposal fulfills with pending construction, handlers, cleanup or child debt". critic-async ASY-2: "Observe its eventual fulfillment or rejection without publishing." critic-api §5: "observes detachment and admitted-work drainage". Both were dropped. A source-side `unsubscribe()` also cannot clear a module-owned lane's pending input.
Replacement (unsubscribe bullet): "`unsubscribe()` is idempotent. It synchronously closes this registration's source admission and drops queued deliveries. The module's derivation lane checks that admission before it starts or publishes work, drops its own pending snapshot, and still observes the active run's fulfillment or rejection without publishing. It does not claim cancellation or physical cleanup and never closes the source."
Replacement (Ownership): "...maps it to `CleanupResult`: `released` only after independently observed detachment and settlement of any active derivation run. An unsettled run yields `unresolved` and keeps the Host admitted-work barrier open."
Replacement (Conflicts bullet 2): "Its `CleanupResult` needs an adapter around `unsubscribe()`. The adapter observes detachment and drains the active derivation run, as its subscription rule requires ('removes the exact listener and drains admitted handlers')."

**R2-2 - P2 - Parent-closure rule is weaker than the resource plan.**
Location: Six contracts, "A parent closes only after every admitted borrower obligation that retains it settles".
Evidence: resource plan, "every required child resource is observed released. Child cleanup action settlement alone cannot discharge unresolved debt or its parent prerequisite."
Replacement: "A parent closes only after admitted borrower work that retains it settles and every required child obligation is observed released. Cleanup-action settlement alone does not discharge an obligation. Borrowers never close the parent; ..."

**R2-3 - P2 - The zero-migration test bypasses Assembly, and the critics' invariance caveat was dropped.**
Location: Main answer item 2, "Preserve the Assembly `FactoryContext` ... and their exact compatibility tokens"; Hypothesis, "leave hundreds of passive module factories untouched ... the TEST experiment below must show it"; Experiment, "No new Core records, composition nodes", "588 passive instances built from an unchanged fixture".
Evidence: types.ts `readonly [scope]: (capabilities: C) => C;`; standard, "`C` is invariant across handles." critic-arch ARC-1: "Rebinding affected outer composition handles may be necessary; unchanged module factories require no migration." critic-api API-2 makes the same point. The passive instances are not Assembly factories, so the slot route is untested.
Replacement (append to item 2): "`FactoryHandle<C>` is invariant in `C`. Adding a port capability to a shared schema therefore re-typechecks or rebinds outer composition handles. Passive factory source must stay unchanged."
Replacement (experiment): "...add a second, separately typed opt-in port to one more consumer through its owner-local factory closure."
Replacement (add to Remaining limitations): "The experiment covers only the closure route. The dependency-slot route changes the shared schema `C`, so its zero-migration claim remains untested."

**R2-4 - P2 - The delivery contract contradicts a fail condition.**
Location: Contract, "Delivery is at least once per committed change ... a duplicate revision is a no-op". Fail list, "or a multi-key change delivers twice".
Evidence: under at-least-once delivery, duplicates are legal. critic-hierarchy HIE-1 requires the source to "deduplicate registrations".
Replacement: "**Delivery:** after each commit that changes a selected key, the registration receives one later delivery carrying that revision or a newer one. Intermediate revisions may coalesce. One commit never yields two deliveries to one registration. A delivery whose revision is not newer than the last recorded one is a no-op and never retries failed work."

**R2-5 - P2 - "Proven" labels do not match the evidence.**
Location: Industry intro, "Behavior columns are **Proven** ... The last column is **Inference**." That last column is headed "Documented failure or limit" and mostly holds quoted facts (versions, timeouts) mixed with inferences. Item 2 says "*Proven precedents:* ... Riverpod `ref.on*` were added as registration APIs without migrating existing code."
Evidence: topic-a §2.1: "Inference: ... Existing components did not have to change." topic-a §7: "Inference: ... `ref.onX` hooks ... were extended (they now return a remover)". So "without migrating" is packet inference, and Riverpod's methods were extended, not added.
Replacement (intro): "All cells are **Proven** except phrases marked *(inference)*: Flutter 'frame-owned synchronous traversal' and '`mounted` does not prove a request is current'; OSGi 'not exclusive' and 'becomes a replacement'; IntelliJ 'no multi-owner model'."
Replacement (item 2): "*Proven:* .NET 8 added `IHostedLifecycleService`, detected by an `is` check; Angular 16 added `DestroyRef.onDestroy`; Vue 3.2 added `effectScope`; Riverpod 3 made `ref` listeners return a remover. *Inference (packet):* existing code needed no migration."

**R2-6 - P3 - Framework facts are overstated.**
Location: Nest row, "teardown `allSettled` only since v12.1.1 ... no hook timeout". Cross-cutting, "Host-level systems that wait use deadlines that report rather than prove completion."
Evidence: topic-b §6a: fix commits from 2026-05-28 "are in release v12.1.1". This does not show they are absent from earlier releases. topic-b caveats: no timeout, "based ... on a grep of the named files". topic-b §7d: a Spring async destroy method "is awaited with no timeout".
Replacement: "teardown `allSettled` via 2026-05-28 fixes contained in v12.1.1 (first release not identified); no hook timeout found in the inspected files". Cross-cutting: "Host-level systems either wait under deadlines that report rather than prove completion (Spring phases, .NET, OpenClaw) or wait without a bound (Nest hooks, Spring async destroy methods)." Add the Nest grep caveat to Remaining limitations.

**R2-7 - P3 - `=> undefined` costs authors something the document does not state.**
Location: Contract, "Callbacks are synchronous, return `undefined`".
Evidence: the reviewer compiled the sketch on TS 7.0.2 and 5.9.3. `function onLocale(next) { pending = next; }` gives TS2345 ("Type 'void' is not assignable to type 'undefined'"). `(n) => m.onNext(n)` gives TS2322. `observe([], ...)` is accepted and yields `SettingsSnapshot<never>`. topic-d tested only contextually typed arrows.
Replacement (append): "Named handlers and methods must declare `: undefined`; a `void`-inferred function is rejected, which is intended. Empty `keys` is a registration error."

**R2-8 - P3 - The minimal API sketches option 2, while option 1 is the default.**
Location: "Minimal recommended API" sketches the subscription port. Option 1, "the Host calls `applySettings(next)`", has no return or await contract, yet item 3 freezes contract semantics at V1.
Replacement (insert before code): "Option 1 needs only the capability `applySettings(next: SettingsSnapshot<K>): undefined`, which the Host calls synchronously; it has no concurrency to test. The sketch below is the option-2 port that the experiment evaluates."
Also replace the comment "monotonic per source; advances only when a selected key changes" with "the source commit number of the latest commit that changed a selected key (A→B→A advances it)".

**R2-9 - P3 - One fail condition mirrors the implementation, and the fixture counts are unclear.**
Location: "dispatch for `K` enumerates the fixture topology or untouched key buckets (instrumented independently of outputs)"; "12 subscribers of key `K` and 588 passive instances".
Evidence: critique-scope, "no implementation-mirroring, source-text or mock-only tests". "Buckets" assumes the index structure. The text also does not say where the two derivation consumers, the broad subscriber and the second-port consumer sit within the 600.
Replacement: "dispatch for `K` reads the fixture topology (fixture-owned counting proxies), or its per-commit registration-visit count changes when 10,000 registrations are added on an unrelated key". Also: "600 instances: 12 subscribers of `K` (including both derivation consumers) and 588 passive. The broad subscriber and the second-port consumer are two extra instances."

**R2-10 - P3 - A severity change is not explained.**
Location: H2-10, "P3 | Effect runtime occupied a top-3 slot".
Evidence: critic-arch, "ARC-3 — P2 — Effect occupies a comparison slot".
Replacement: Sev "P3 (critic P2; downgraded because revision 1 already limited Effect to an existing Effect Host)".

**R2-11 - P3 - Two sentences contradict their surroundings.**
Location: Readiness row, "Construction success is not readiness; factory completion suffices for the current slice." Main answer, "Lay down now (rules and TEST-local types; no Get Modular package code)", while the API is "Proposal only" and the experiment is "not authorized".
Replacement: "Construction success is not readiness (the Host decides). For the current slice, factory completion is sufficient initialization, so no module readiness hook exists." And: "Lay down now (written rules only; the TEST-local types below are an unauthorized proposal; no package or consumer code)".

**R2-12 - P3 - Padding and provenance.**
Location: Provenance bullet 3 repeats "Claims checked" (Spring, AR). Limitations state "`networkAccess` allows `disabled|restricted|unrestricted`"; no retained file states that enum (flow.json: "networkAccess unrestricted requires danger-full-access sandbox; restricted used").
Replacement: delete Provenance bullet 3; use "`networkAccess: unrestricted` requires a danger-full-access sandbox (flow.json)"; cut the AppleDouble bullet to one sentence.

## Checks passed

- Hashes match: revision 1 `3709c3a7…`, resource plan `46e869ce…` (unedited), all four critic and all five original raw results. The topic-B critic copy differs from root's final copy in exactly three sentences.
- All twelve critic defects (API/ASY/HIE/ARC-1..3) map to H2-1..H2-12. None is invented, and no critic raised a P1. Option scores and LOC equal critic-arch §8, and the helper LOC equals ARC's.
- All other table and text facts (React, Vue, Svelte, Flutter, Riverpod, Angular, Spring, .NET, OSGi, IntelliJ, OpenClaw, Nest #14900/#17966) match topics A-D with correct versions.
- Topic-D TS claims reproduce; `const Keys`, `Pick<Settings,K>` and an object-literal `unsubscribe() {}` typecheck.
- Six events distinct; borrowers get no cleanup authority; no base interface, `HookKind`, registry, scheduler or reactive engine; construction-only registration fits the resource slice.
- One experiment; fail conditions observable except R2-9; no duplicated cleanup scenarios; main question answered directly.
