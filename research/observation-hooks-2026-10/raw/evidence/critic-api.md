# Lane 1 — API ergonomics

## 1. Verdict

**Inference:** The research’s recommended direction is sound: preserve module instances and introduce narrow consumer-owned ports only where changing inputs require them. Lay down compatibility and default-behavior rules now; a common lifecycle interface is unnecessary. The confirmed issues are specification gaps, not demonstrated framework errors or an existing double-cleanup defect. Internet evidence was indirect through root-supplied packets; I performed no independent browsing.

I verified all **49 non-metadata manifest inputs** against `input-hashes.json`; all matched. No writes, Git actions, builds, tests, installs or runtime flows occurred. Requested profile: **gpt-6.1-sol / XHIGH / FAST**; effective backend settings were not independently attested. Review elapsed approximately four minutes.

All source paths below are under `.research/input/`. **A**, **B**, and **C** mean the respective `root-verified-online/topic-a-opt-in-evolution.md`, `topic-b-async-errors.md`, and `topic-c-hierarchy-config.md` packets.

## 2. Confirmed defects of the research

### API-1 — P2: Nonparticipating modules have no explicit default

**Affected sections:** Recommendation; Six distinct contracts; Conditional TEST experiment.

**Proven (packet quote):** `research-under-review.md` says “Host decides rebind versus reconstruction,” but does not select the default when a module implements neither. C quotes OSGi: “If the modified attribute is not specified,” configuration modification makes the configuration unsatisfied; subsequent activation creates a new instance. A instead documents a nonreloadable `IOptions` accessor.

**Inference:** These establish different legitimate defaults. “Optional hooks” alone cannot tell authors whether their private state survives configuration changes.

**Exact correction:**

> A module that does not opt into settings observation retains its construction-time settings snapshot and instance state. A separately declared product Host policy may reconstruct that module; reconstruction creates a new instance and does not implicitly migrate private state. Dependency replacement and dependency health follow separate explicit policies.

### API-2 — P2: The extension path lacks a compatibility rule

**Affected sections:** Recommendation; Three options; authority/proof limits.

**Proven (packet quote):** The research says an optional callback “can be convenient later.” `consumer-module-standard__common-assembly.md` requires factories to receive “only their closed dependency record and `{ signal }`.” The Assembly types define `FactoryContext = { readonly signal: AbortSignal }` and exact compatibility tokens.

**Inference:** Adding required lifecycle members breaks existing implementations. Expanding a public discriminated union can break exhaustive consumers. Optional methods can collide with existing structurally typed members; method presence is insufficient evidence of intentional participation. `FactoryHandle<C>` is invariant, so expanding a shared capability schema can require Host rebinding/typechecking even when feature source remains unchanged.

**Exact correction:**

> Preserve existing factory, context, instance and capability contracts. Add each new notification through a separately named consumer port or explicit registration surface used only by participating modules. Do not extend a universal HookKind union. Preserve existing callback semantics; incompatible changes receive a new contract/token, with narrowly scoped wiring changes. Package versions, compatibility tokens and documentation pins remain separate identities.

### API-3 — P2: `onChange` has no declared execution or return contract

**Affected section:** Illustrative `watchSettings(keys, onChange)` shape.

**Proven (packet quote):** The research specifies “One computation runs per consumer,” without saying whether `onChange` is that computation or merely records desired input. A’s .NET 11 compatibility evidence warns: “The same source code still compiles” while callback overload selection changes behavior.

**Inference:** TypeScript’s `() => void` permits value-returning functions, including async callbacks. Later deciding to await them can silently change ordering and failure handling. The illustrative signature also leaves selected-key typing unspecified.

**Exact correction:**

> Notification callbacks synchronously record an immutable selected snapshot and return `undefined`. The instance’s separately owned computation performs asynchronous derivation and records its failure. Notifications never implicitly await user promises. Keys and payload values are statically related. A future awaited callback uses a separately specified API.

This is a research-contract gap, not evidence of a running implementation defect.

## 3. Claims checked and found correct

- **Proven (packet quote):** React distinguishes Effect lifetime from component lifetime: `original-relay/primary-reactive.json` says synchronization cycles can happen “multiple times.” Restarting synchronization need not reconstruct the component.
- **Proven (packet quote):** Flutter’s configuration update preserves the existing `State` association when location, `runtimeType` and key match (`original-relay/primary-flutter.json`, `didUpdateWidget`).
- **Proven (packet quote):** Vue warns that an asynchronously created watcher “won’t be bound to the owner component”; Svelte says async functions return a Promise rather than the required cleanup function (A/B).
- **Proven (packet quote):** The CMS says “receiving a capability gives no cleanup authority.” The research correctly preserves borrowing and owner cleanup.
- **Proven (packet quote):** The research explicitly says “Existing subscription cleanup owns its stop action.” A confirmed competing cleanup owner cannot be inferred from the returned `stop()` alone.
- **Inference:** Keeping all six events distinct, requiring no dummy hooks, and deferring a readiness protocol until a concrete consumer exists are appropriate conclusions. No contrary framework fact was established.

## 4. Lane answer: what to lay down now

**Inference:** Lay down a written compatibility promise and one concrete consumer seam, not a module-wide hook vocabulary.

For infrequent settings changes, an ordinary `updateSettings(snapshot)` operation is sufficient. Selected observation becomes useful when a real source must push committed changes. Keep initialization in the factory and private state in the instance; updating a derived table must preserve counters and an unchanged event subscription.

The six events remain separate:

1. **Settings change:** apply selected immutable values.
2. **Dependency replacement:** explicitly change provider identity; choose rebind or reconstruction.
3. **Dependency unavailability:** adapter health changes admission, including loss followed by recovery.
4. **Module state change:** ordinary instance-owned mutation and inert observation.
5. **Readiness:** capability-specific evidence, only where needed.
6. **Cleanup:** owner-observed release or retained unresolved responsibility.

Pure and borrow-only modules implement none of these merely to satisfy a base interface. Owned-resource setup/cleanup remains the separately governed resource proposal.

Prefer explicit injected ports/registration over scanning arbitrary instance method names. Registration composes across helpers without override chaining. However, React hooks, Angular `inject`, and Vue ambient scopes depend on framework execution contexts; their syntax should not be transplanted into arbitrary async factories. Pass the narrow port explicitly through existing consumer dependencies or an owner-local closure.

Do **not** add a lifecycle context to every Assembly factory, generic `didChangeDependencies`, default reconstruction, automatic retry, broad deep observation, universal manager, service bag, global scheduler or reactive engine.

## 5. Minimal API elements

**Proposal / Inference — TEST-local syntax, not existing exports:**

```ts
type Settings = {
  readonly locale: string;
  readonly batchSize: number;
};

declare const sourceBrand: unique symbol;
type SourceId = { readonly [sourceBrand]: true };

type SettingsSnapshot<K extends keyof Settings> = {
  readonly sourceId: SourceId;
  readonly revision: bigint; // Selected-input revision.
  readonly values: Readonly<Pick<Settings, K>>;
};

type SettingsView<K extends keyof Settings> = {
  readonly initial: SettingsSnapshot<K>;
  readonly snapshot: () => SettingsSnapshot<K>;
};

type OwnedSettingsObservation<K extends keyof Settings> =
  SettingsView<K> & {
    readonly unsubscribe: () => void;
  };

interface SettingsObservationV1 {
  readonly observe: <
    const Keys extends readonly (keyof Settings)[]
  >(
    keys: Keys,
    onChange:
      (next: SettingsSnapshot<Keys[number]>) => undefined
  ) => OwnedSettingsObservation<Keys[number]>;
}
```

The example uses primitive values; `Readonly` alone does not establish deep immutability for arbitrary nested settings.

**Inference:** `initial` is useful because atomic subscription installation plus initial capture avoids the read-then-subscribe gap. `snapshot()` is useful because queued notification delivery can lag behind committed input; publication must compare against current relevant input. Cache the immutable snapshot while selected inputs remain unchanged.

Rename `watchSettings` to `observeSettings` or `settings.observe`: explicit source observation is clearer than implying automatic dependency tracking. Rename `stop()` to `unsubscribe()` to identify listener detachment.

The **registration owner** retains `unsubscribe`; borrowers receive only `SettingsView`. Unsubscribing does not close the parent settings source. It also does not certify complete cleanup: the existing resource owner separately observes detachment and admitted-work drainage. Register this obligation once during awaited construction; do not register again on each settings change.

A future hook receives its own narrow port/capability. Do not append required methods to `SettingsObservationV1` or silently change its token.

## 6. Proven practice versus inference/hypothesis

| System | Proven (packet quote) | Inference or hypothesis for this design |
|---|---|---|
| .NET options and hosting | A: `IOptionsMonitor` supports “Change notifications”; Host selects `IHostedLifecycleService` with `is`. | Separate accessor/sub-interface preserves older consumers. Nominal .NET detection is stronger than a TypeScript method-name check. |
| Angular and Nest | A: lifecycle interfaces are optional; Angular reads prototype hooks. Nest source tests `isFunction(...onModuleInit)`. `DestroyRef.onDestroy` registers a scoped callback. | Both discovery and registration avoid dummy hooks; explicit registration avoids accidental name matches and override loss. |
| React | A: “over 50,000 React components” motivated gradual UNSAFE migration; old names remain in inspected 19.2 source. | Preserving names does not preserve execution guarantees. New opt-in hooks are useful precedent, not proof that scheduler changes are compatible. |
| Vue | A: hooks must register “synchronously”; callback-bound cleanup avoids ambient-scope restrictions. | Explicit owner-bound handles suit async factories better than implicit current-scope capture. |
| Riverpod | A: lifecycle listeners use an “‘addListener’ style API”; C: selected properties filter rebuilds, but state “will always be destroyed” on recomputation. | `listen/select/onDispose` demonstrate selective participation. They do not prove preservation of provider state across recomputation. |
| Android | A: `DefaultLifecycleObserver` has default empty method bodies; reflection/code-generation annotations were deprecated. | An explicitly registered observer implements only needed overrides. TypeScript interfaces have no equivalent default implementations. |
| OSGi and Spring Cloud | C: OSGi activation always creates a new instance; RefreshScope creates “a new instance” on next access, while rebinding mutates the existing bean. | State retention versus reconstruction must be explicit. Field-by-field mutation is unsuitable for a coherent immutable snapshot. |
| Proposed zero-migration extension | No packet demonstrates this exact API across hundreds of modules. | **Hypothesis:** separate typed ports preserve unaffected module source; a bounded compatibility experiment must establish that claim. |

## 7. Conflicts with the resource-plan snapshot

**None established.**

**Proven (packet quote):** The snapshot restricts setup to “Serial, awaited construction-only setup” and says returned handles must not register the same obligation again. The hooks research installs one subscription, derives inert state, and assigns its stop action to existing cleanup.

**Inference:** Runtime resubscription or resource acquisition during updates would exceed that slice. The proposed read-only borrower facet clarifies the existing ownership rule; it does not redesign the resource plan or block its delivery.

## 8. Ranking

**Inference:** I agree with the research’s ranking: explicit ports first, a selected-change driver only after repeated need, and an existing Effect runtime only in an already Effect-based Host. No replacement scores or LOC estimates are warranted from this lane.

## 9. One bounded TEST refinement

**Future experiment:** Extend the existing settings experiment with one unchanged snapshot-only consumer beside one opted-in consumer, then add a separately typed notification port to a third consumer.

Fail if adding that port requires editing the old consumer, settings commits silently reconstruct it, its construction snapshot changes, the opted-in consumer loses counters/recreates its unchanged subscription, or a held obsolete computation publishes after a newer commit or closure.

Use actual publisher/consumer interactions, visible derived results and independently inspected listener membership. Reuse existing ownership evidence; do not duplicate cleanup scenarios or substitute mock callback counts for behavior.

## 10. Remaining limitations and missing primary sources

Native search was disabled. Packet hashes prove retained-byte agreement, not remote authenticity or production qualification. No experiment or compiler verification ran.

Missing primary TypeScript excerpts:

- https://www.typescriptlang.org/docs/handbook/2/functions.html — `void` callback assignability and explicit `undefined` returns.
- https://www.typescriptlang.org/docs/handbook/2/objects.html — structural optional-member compatibility and name collisions.
- https://www.typescriptlang.org/docs/handbook/2/narrowing.html#exhaustiveness-checking — breakage when a consumed discriminated union gains a variant.

Exact packets resolve the listed framework contrasts, but not production behavior of this proposed API. A shared callback surface still requires an accepted successor; accepted ADR bytes remain immutable, **G1 remains hold, K1 remains pending, and TEST never qualifies production**.
