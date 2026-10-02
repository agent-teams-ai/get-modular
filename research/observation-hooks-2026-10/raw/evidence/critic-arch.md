## 1. Verdict

**Inference:** Explicit methods, consumer-owned ports and selected subscriptions are sufficient for the demonstrated settings use case. Lay down compatibility and ownership rules now; add executable hooks only where a concrete consumer needs them. The research’s direction is sound, but its extension contract and Shared-first comparison need strengthening. Effect is a conditional implementation choice for an existing Effect Host, rather than a relevant third architectural alternative here. Internet evidence was indirect through root-supplied packets; all 49 substantive manifest-listed inputs matched their SHA-256 hashes.

Citations below refer to files under `.research/input/`; **R** means `research-under-review.md`.

## 2. Confirmed defects of the research

### ARC-1 — P2 — Missing extension and compatibility contract

**Affected:** R, “Recommendation” and “Three options.”

**Proven (packet quote):** R says an optional callback “can be convenient later,” but supplies no rule for adding hook kinds without changing existing module contracts. The Assembly types define `FactoryContext = { readonly signal: AbortSignal }` and exact compatibility tokens. `root-verified-online/topic-a-opt-in-evolution.md` §1.5 quotes .NET’s selective detection: `if (hostedService is IHostedLifecycleService service)`.

**Why it matters — Inference:** Optional behavior does not itself guarantee compatibility. Adding required context members breaks context implementations and fixtures; adding variants to an exported exhaustive union breaks downstream switches. Assembly’s capability schema is invariant, so new schemas cannot simply mix previously bound handles.

**Exact correction rule:** “Introduce each new hook kind as a separately named opt-in contract in the affected composition scope. Preserve existing factory dependencies, `{ signal }`, compatibility tokens and execution semantics. Absence means existing behavior, without registration or scheduling. Rebinding affected outer composition handles may be necessary; unchanged module factories require no migration. Do not expand a public exhaustive `HookKind` union.”

### ARC-2 — P2 — Shared-first analysis skips the narrow reusable option

**Affected:** R, “Three options,” option 2.

**Proven (packet quote):** R proposes “change frames, per-instance serial work and stale-result fencing,” estimated at 700–1,200 implementation LOC, after “repeated real cases demonstrate the same semantics.” `authority/agent-teams-ai_.github__docs__engineering-quality-standard.md` says to extract after “a second real consumer or a concrete repeated need demonstrates its stable contract and owner.”

**Why it matters — Inference:** The comparison jumps from consumer-local code to a substantial supported driver. It neither evaluates sharing only the repeated mechanics nor defines the extraction trigger.

**Exact correction rule:** “Evaluate a private, owner-local helper for one active derivation, one pending snapshot and guarded publication before considering a supported hook driver. Specify its owner, dependency direction, exclusions and extraction evidence.” Section 4 supplies concrete criteria.

### ARC-3 — P2 — Effect occupies a comparison slot without demonstrated applicability

**Affected:** R, “Three options,” option 3.

**Proven (packet quote):** R limits Effect to an “already Effect-based Host” and acknowledges that “current version and stream semantics are not qualified.” The TEST `package.json` supplied here declares Core, Assembly and lifecycle-kernel, without Effect. `original-relay/primary-scale.json`, Effect Scope entry, states: “scope closing doesn’t force the task to be interrupted.”

**Why it matters — Inference:** Scope evidence does not establish notification buffering, freshness or adoption cost. The ranking obscures the cheaper distinction between direct updates, selected subscriptions and a narrowly shared driver.

**Exact correction text:** “Rank explicit methods first, selected subscriptions with bounded reuse second, and an opt-in single-event driver third. Retain Effect as a conditional adapter technology when an existing Host and exact dependency evidence justify it.”

No confirmed P1 recommendation was found.

## 3. Claims checked and found correct

- **Proven (packet quote):** Consumer Module Standard: “Construction success does not establish readiness, trust or permissions.” The research preserves this distinction.
- **Proven (packet quote):** `topic-c-hierarchy-config.md` §6: “The receiver of the IDisposable dependency shouldn’t call Dispose on that dependency.” Borrowing provides no parent cleanup authority.
- **Proven (packet quote):** `topic-b-async-errors.md` §3.2 records Svelte’s requirement that the `onMount` callback be synchronous to return cleanup. The research correctly rejects Promise-as-cleanup assumptions.
- **Proven (packet quote):** `topic-c-hierarchy-config.md` §1 distinguishes configuration `modified`, reference `updated`, and replacement bind/unbind. The research correctly separates these meanings.
- **Proven (packet quote):** The retained Spring source sets `timeoutPerShutdownPhase = 10000`; the research correctly supersedes the captured 30-second claim.
- **Proven (packet quote):** The retained AR profile pins `9c722ce…` and `33b41d5b…`; the research correctly treats older pin/recovery observations as historical.
- **Inference:** Hundreds of instances justify measuring fanout and retained work, but do not establish demand for a general lifecycle engine.

## 4. Lane answer: what to lay now

**Inference — lay now:**

- Unchanged behavior for nonparticipants: no required hooks, dummy cleanup, subscriptions or per-instance hook machinery.
- Separate, named consumer contracts with explicit synchronous/awaited semantics, version identities and failure ownership.
- Module-instance ownership of private state and acquired resources; children receive borrowed use ports.
- A documented extraction trigger and one compatibility fixture demonstrating unchanged passive factories.
- Existing Host ownership of readiness, health policy, replacement, recovery and physical cleanup.

**Inference — do not lay now:**

- A common lifecycle base interface or expanded mandatory factory context.
- Generic change frames spanning all six events, reflective hook discovery or exhaustive public hook-kind unions.
- A universal manager, service bag, global scheduler or reactive engine.
- New release gates, repository-wide migrations or duplicate cleanup ledgers for this research.

**Hypothesis — observable driver-admission criteria:** Require at least **two independently owned consumer features**, rather than multiple instances of one feature. Both must need identical settings semantics: atomic observation registration, immutable snapshots, latest-state coalescing, one active/one pending derivation, current-revision publication fencing, independent failure handling and closure fencing. Demonstrate the same observable failure in both local implementations—for example, an obsolete completion publishing after a newer committed revision—or a repeated correction needed to prevent it. Compare extraction against retaining those implementations; share only the proven intersection.

**Inference — narrow reusable option:** The consuming Host feature owns a private `runLatestDerivedState` helper, approximately **100–180 production / 180–300 tests / 40–70 docs LOC**. Consumers supply snapshots and derivation/publication functions; the helper imports no product models, adapters, Core or Assembly. It performs no acquisition, health supervision, retries, readiness decisions or disposal. Reuse reduces duplicated concurrency reasoning but couples consumers to identical conflation semantics; differing semantics remain local.

**Inference — proportionality:** Atomic registration, bounded pending work and stale publication checks are justified. Restricting the first experiment to inert derivation is also justified. General aspect registries and reusable change-frame machinery would be premature additions. Successor governance is necessary for a shared execution surface; it should not become a prerequisite for ordinary feature-local methods.

## 5. Minimal recommended API

**Hypothesis — proposals, not existing exports:**

```ts
type SettingsView = Readonly<{
  source: object;
  revision: number;
  value: Readonly<Settings>;
}>;

// A separately opted-in consumer capability.
type SettingsUpdatesV1 = {
  applySettingsV1(next: SettingsView): Promise<void>;
};

// Alternative for a consumer needing observation.
type SettingsSourceV1 = {
  observeSettingsV1(notify: () => undefined): Readonly<{
    initial: SettingsView;
    current(): SettingsView;
    stop(): void;
  }>;
};
```

**Inference:** These are alternatives; neither belongs on every module. Registration and initial capture are atomic, notifications deferred, and `current()` authoritative. Notification callbacks only request local work; synchronous exceptions are isolated and reported through the existing Host error path. `() => undefined` expresses a synchronous callback more strictly than TypeScript’s `() => void`, which can accept async functions.

For this supported in-process source, `stop()` synchronously detaches only the subscriber’s registration. It conveys no parent cleanup authority. The subscription owner registers that stop action with existing cleanup. The update Promise observes that invocation’s settlement; it does not certify readiness or physical release.

**Inference:** Keep six independent seams:

| Event | Boundary |
| --- | --- |
| Settings change | Immutable selected values and relevant revision |
| Dependency replacement | Host-controlled old/new identity and binding epoch |
| Dependency unavailability | Immediate managed-port admission fencing; loss and recovery remain observable |
| Module state change | Instance-owned mutation and inert observation |
| Readiness | Capability-specific evidence under Host policy |
| Cleanup | Owner-observed release or retained unresolved debt |

New async semantics receive a new contract/token; an existing notification API must not silently start awaiting callbacks.

## 6. Proven practice versus hypothesis

| Classification | Evidence or proposal | Architectural consequence |
| --- | --- | --- |
| **Proven (packet quote)** | `topic-a-opt-in-evolution.md` §1.5: optional `IHostedLifecycleService` detection | Extra lifecycle behavior can coexist with unchanged implementations |
| **Proven (packet quote)** | Same file §3.2: snapshots “must be immutable”; subscribe returns an unsubscribe function | Observation and detachment need explicit contracts |
| **Proven (packet quote)** | Same file §1.4: new async overload binding “is silent” | Source compatibility can conceal execution changes |
| **Proven (packet quote)** | `topic-b-async-errors.md` §6.1: Nest init uses `Promise.all`; destruction uses `Promise.allSettled` | Different phases have different failure semantics |
| **Inference** | Separate consumer contracts preserve existing factories | A new hook need not migrate nonparticipants |
| **Hypothesis** | Two-consumer extraction threshold and LOC ranges | Validate through concrete delivery; these are not industry guarantees |

Packet authors’ suggested universal contexts, blanket coalescing or synchronous teardown defaults are interpretations, not recommendations adopted here.

## 7. Conflicts with the resource plan snapshot

**Inference: None identified.** Its construction-only setup restriction does not prohibit later inert settings derivation. Both documents preserve instance ownership, borrowed parent ports, unchanged Assembly injection and separate hook delivery.

**Proven (packet quote):** The snapshot says “G1 stays `hold`; K1 stays pending.” Accepted ADR bytes remain immutable, and any shared callback surface needs its explicit successor decision. Hook research neither blocks nor qualifies the resource delivery; TEST never qualifies production.

## 8. Top three approaches, best first

**Hypothesis:** Scores are design judgments, not measured reliability. LOC estimates are incremental future work, roughly ×2 uncertain, excluding the resource package, physical adapters and release work.

| Rank and approach | 🎯 Confidence /10 | 🛡️ Reliability /10 | 🧠 Complexity /10 | Production LOC | Tests LOC | Docs LOC |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **1. Explicit feature methods and consumer-owned ports** | 9 | 8 | 2 | 60–140 | 180–300 | 60–100 |
| **2. Selected subscriptions, with the narrow private helper when justified** | 8 | 8 | 4 | 180–320 | 350–550 | 90–150 |
| **3. Supported opt-in driver for one event family, after extraction criteria pass** | 6 | 7 | 6 | 450–750 | 650–1,000 | 140–220 |

**Inference:** Option 1 suits infrequent deliberate updates. Option 2 suits continuing observation while preserving instance state. Option 3 earns a supported shared surface only through repeated semantics and failure evidence. Effect may implement an already justified option inside an existing Effect Host; it does not replace this architectural choice.

## 9. One bounded TEST experiment refinement

**Hypothesis — future checks only:** Use one settings source, two distinct inert derivation consumers, and 600 lightweight instances: 12 selected subscribers and 588 passive nonparticipants. Preserve instance counters and an unchanged event subscription. Hold one derivation, commit 1,000 settings updates, then settle it; also inject one computation failure and close a consumer during pending work.

Fail the experiment if:

- Registration misses the latest committed view or produces mixed settings.
- Any passive instance changes, acquires hook machinery, or recreates its subscription.
- An obsolete result publishes, per-consumer computations overlap, pending work grows beyond one snapshot, or final output fails to converge.
- One failure stops an independent consumer or loses its original cause.
- Closing permits later publication or detached delivery starts new work.
- Adding a separate opt-in capability breaks unchanged passive factory/type fixtures.

Observe actual source commits, public derived outputs and listener membership with independent expectations. A narrowly scoped work counter may expose unnecessary full-registry traversal. No source-text assertions or duplicated resource scenarios are needed. This experiment evaluates mechanics; it does not establish the production-consumer extraction threshold.

## 10. Remaining limitations and missing primary sources

No files, Git state, builds, tests, installs or runtime/provider flows were changed or executed. The requested profile was **gpt-6.1-sol / XHIGH / FAST**; effective backend settings were not independently attested. Review elapsed approximately **3½ minutes**.

Missing evidence for conditional later choices:

- https://effect.website/docs/v3/state-management/subscriptionref/ — What registration, buffering and conflation guarantees apply? Supply exact applicable release/source identities before considering Effect integration.
- https://github.com/agent-teams-ai/modularity-host-test/tree/fcc10b2501420aacf9f904e976a4d230d3f02e68 — Which concrete Host/source fixtures and evidence-runner routes would own the proposed settings experiment?
- https://www.typescriptlang.org/docs/handbook/2/functions.html#function-assignability — Retain primary documentation and pinned compiler evidence for synchronous callback assignability before publishing that API.

Hash agreement proves retained byte identity, not independent remote authenticity, freshness, execution behavior or production qualification.
