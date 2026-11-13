# OpenCode: current Effect architecture review for Get Modular

Observed 2026-11-12. This source study supports the [architecture audit](architecture-audit-2026-11-12.md); it is not a normative standard. No upstream tests were executed and no OpenCode production result is asserted.

## Source identity and verification

- Repository: `anomalyco/opencode`, verified default branch `dev` through the connected GitHub API.
- Immutable source: `becb9c7c9f3907257d12e95993a47ccc6e3b9625`, committed 2026-11-12 18:45:04 UTC. Branches can advance; all links below deliberately use this source.
- Its root package metadata declares version `2.2.7` and catalog `effect: 4.1.0`; this is source metadata, not proof of the installed/published dependency tree. [Manifest](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/package.json).
- GM baseline reviewed for comparison: `0ff54371967e4b56a9978f784f568a48731a324d`, native candidate Effect `4.1.4`.
- GitHub reports 102 commits from the old guide's `c4bf172532b64a02142d2da9a72d57621c48423d` to this pin. Its compare file list is capped at 300 and does **not** establish that all relevant files stayed unchanged. I fetched both immutable versions directly: the following seven inspected files are byte-identical: LayerNode source and guide; SDK instances and host; Location services and service map; AISDK. This verifies those old observations on the new pin without pretending that the entire project is unchanged.
- Current LayerNode documentation supersedes earlier `hoist`, raw replacement tuples, and reconstructing nodes by spreading representation fields. Do not mix historical APIs from the prior research with the current `replace`, `compile(options)`, and `mapLayer` contract. All concrete recipes below are Effect 4-era source observations; nothing here proves Effect 3 interchangeability.
- The [retained source manifest](raw/audit-2026-11-12/opencode-source-manifest.json.txt) records the 32 inspected files. Primary content was fetched through the authorized GitHub plugin; no upstream installation was performed.

## Verdict

The current GM split remains justified: portable declarations and exact local binding selection belong to GM, preparation has one neutral owner, and native construction/finalization belong to Effect. OpenCode independently demonstrates that explicit graph policy can compile to native Layers without implementing a second resource runtime. It also demonstrates why graph cycle checks, cache identity, application scheduling, and operation lifetime must remain separate concepts.

LayerNode is more convenient for an Effect-only application that specifically wants declaration-identity replacement, automatic removal of old dependency subgraphs, ordered startup roots, and tagged shared/local caching. Those conveniences are real. They do not require putting all of them into GM. GM has different identity and portability goals and its existing typed inventory recipe is more explicit about variant-specific construction requirements.

## 1. Composition, substitution, and DRY

### What the source establishes

[LayerNode's guide](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/util/docs/layer-node.md#L52-L103) and [implementation](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/util/src/effect/layer-node.ts#L65-L152) distinguish an invariant replaceable Node from a Graph that can project its outputs. Replacements target the exact declaration, not a display name or Context key. A replacement must provide every original output, add no new error type, preserve the tag, and be closed or be another wired node. Last replacement wins before traversal; replacing a node prunes its old dependencies, including unused default graphs. Decoration is parametric in requirements and cannot change that wiring contract.

[Runtime tests](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/core/test/effect/layer-node/layer-node.test.ts#L45-L217) cover exact declaration identity, stored replacements, chains, unreachable defaults/cycles, missing bindings, and omission of old acquisition. [Type tests](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/core/test/effect/layer-node/layer-node-types.test.ts#L40-L165) reject weaker outputs, new errors, forged replacement records, variance tricks, conditional branches that cannot provide promised outputs, and `mapLayer` contract changes. The [dist tsconfig](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/util/tsconfig.dist.json) points the same type fixtures at emitted declarations. Test presence and command wiring are inspected; their current CI result is not claimed.

### Decision for GM

**Adopt the invariant and test strategy, adapt the mechanism.** Replacement must be chosen at one composition boundary and must preserve the capabilities actually consumed. Retain selected live/fake inventories before `prepare`; do not bolt on a second override registry in Effect after GM has already closed the graph. A GM variant is a new typed composition and may honestly have different construction E/R/N. That differs from LayerNode replacing a fixed contract with no extra E. An ordinary fake Layer cannot rewrite a GM-selected provider already inside a closed Layer graph.

GM's private per-implementation keys and injection records preserve two local slots bound to different providers of the same capability; copying a global Context lookup as the GM injection mechanism would lose that distinction. Do not introduce parallel declaration systems merely to copy shorter LayerNode syntax.

**Keep the useful external-package test pattern:** emitted `.d.ts` and installed public-root tests are stronger evidence than source-import tests alone. GM already has this; retain it. No additional generic decoration API is justified while native `Layer`/factory composition handles the actual need.

## 2. Shared resources, local resources, and memoization

[Compilation](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/util/src/effect/layer-node.ts#L239-L339) separates shared and local resolution caches, tracks conflicting wiring for each native Layer in a memo domain, and memoizes compiled nodes per build. With a shared tag, the selected node **and its entire dependency closure** inherit the shared memo map; remaining wiring receives a new local map. Native Layer identity still decides acquisition sharing. Without `shared`, the enclosing native memo map applies throughout.

This is a substantive distinction from only calling `Layer.mergeAll` and assuming it gives isolated sessions. [The nested LayerMap fixture](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/core/test/effect/layer-node/layer-node.test.ts#L331-L465) checks shared global/support acquisition, separate locals, failed local release, cache invalidation/rebuild, and retention of globals until the owner closes. [Diamond and conflicting-wiring fixtures](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/core/test/effect/layer-node/layer-node.test.ts#L220-L256) check one acquisition and reject one native Layer wired to incompatible dependencies.

**Adopt explicit cache domains and ownership in documentation; do not adopt a new GM cache.** GM creates mapper identities per `.layer()` call and supports sharing borrowed application resources across local compositions. This isolates mapper-owned input capture without taking ownership of borrowed values or refreshing private Layers supplied by factories. A private static Layer capturing configuration can still be reused with the wrong first input. Distinct configuration needs distinct native identity or an intentional native refresh policy.

**Critical limit:** sharing is not lifetime certification. A borrower may retain a graph or return a service after its scope closes. Tag rules and memo maps do not prove that arbitrary escaped values remain valid. Similarly, infinite idle TTL is an explicit retention policy, not by itself evidence of a memory leak; operational admission/eviction remains the Host's responsibility.

## 3. Tag direction checks are useful but partial

[The tag checker](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/util/src/effect/layer-node.ts#L154-L189) accepts allowed direct tagged dependencies and also permits `undefined` tags. [Application tags](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/util/src/effect/app-node.ts) allow locations to depend on globals and prohibit the directly declared opposite direction. [Negative fixtures](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/core/test/effect/layer-node/layer-node-types.test.ts#L167-L210) enforce those explicit cases, including groups.

An untagged intermediate does not carry an arbitrary transitive lifetime proof. The compiler's `inherited || tag === shared` propagates shared ownership down its closure. Therefore a long-lived node's complete closure must actually be suitable for that lifetime. This is a source-based limit of the check, not a reproduced OpenCode production defect.

**Adapt to GM's existing source/dependency policy.** Keep directions, contracts, and actual scope ownership explicit. Do not present a new lifetime tag DSL as a solution to domain boundary correctness or escaped resource safety. Add such policy only if a named consumer demonstrates a recurring requirement, including rejecting transitive cases relevant to that policy.

## 4. Captured Context must not steal the operation's Scope

[SDK instance configuration](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/sdk/src/internal/instances.ts#L16-L36) captures services at the embedding boundary, but merges the active ambient context last so the current instance Scope wins over the earlier build Scope. [The fixture](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/sdk/test/instances-effect.test.ts#L242-L300) checks that a failed configuration releases its acquisition while the Host remains alive, and a later success lives until Host shutdown.

**Adopt directly as an ownership rule.** Capture only intended services, preserve the operation's scope/context, and exercise failed acquisition while the enclosing application remains alive. Merely testing eventual cleanup at process shutdown would miss retention until the wrong owner closes. In GM, private resource Layer acquisition must stay inside the factory construction Scope; lazy operations must be consumed inside their valid owner. Neither `R = never` nor successful acquisition proves lifetime safety.

## 5. Resource ownership can cycle even when the composition graph cannot

[Instance configuration](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/sdk/src/internal/instances.ts#L64-L103) provides borrowed selector and Location-map values instead of retaining their owner Layers. Its comments describe the shutdown self-retention cycle being avoided. Failed cache builds invalidate through a fiber owned by the enclosing scope, so invalidation does not join its own lookup fiber. [Location-map construction](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/core/src/location-services.ts#L20-L58) also checks build identity so a late failure cannot evict a newer replacement.

[A targeted SDK regression](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/sdk/test/instances-lifecycle.test.ts#L13-L65) cancels the borrower while cached construction is pending, lets that construction fail later, then checks cleanup and a successful retry. This is a better failure scenario than only constructing and immediately disposing a happy path.

**Adopt the reasoning and consumer acceptance case, keep caches outside GM.** Graph DAG validation cannot detect reference-count or finalizer wait cycles. Reuse borrowed inputs where the outer owner already controls the resource, and never have an owner retain itself indirectly through cached children. A future application cache must specify failed-entry eviction, generation/identity guards, and join behavior. Adding those mechanisms to the GM mapper would duplicate the Host's lifecycle policy.

## 6. Request completion is not response-body completion

[OwnedFetch](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/sdk/src/internal/fetch.ts#L3-L116) owns active request controllers, forwards caller aborts, retains delivered response bodies through consumption/cancellation, and preserves the first close Promise. Host close rejects further admission, aborts active requests, awaits their tracked lifetimes, and disposes the runtime afterward. [Request-retention tests](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/sdk/test/request-retention.test.ts#L11-L131) inspect repeated completed/failed requests while the Host stays open and cancellation of an open body before disposal.

**Adopt at the application HTTP/stream adapter, not the composition library.** Acceptance should test a long-lived process, not merely that every resource eventually vanishes on process exit. A successful `fetch` response header promise does not mean its body is complete. This does not prove that OwnedFetch handles arbitrary foreign handlers ignoring abort and resolving late: the concrete HTTP adapter's guarantees and scope behavior matter. Its garbage-collection thresholds are Bun-specific test heuristics, not portable memory budgets.

## 7. Cancellation, settlement, and scheduling need separate contracts

[SessionRunCoordinator](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/core/src/session/run-coordinator.ts#L6-L68) serializes one key while allowing different keys concurrently. It distinguishes accepting interruption from cleanup settlement and exposes a separate `awaitIdle`. [Its implementation](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/core/src/session/run-coordinator.ts#L69-L175) uses a scoped FiberSet, coalesces wakes, preserves late wakes across the settling window, and yields before synchronous reentry to avoid stack growth. [Tests](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/core/test/session-run-coordinator.test.ts) separately exercise failing/defect exits, interrupted waiters, cleanup-era admissions, settlement defects, cross-key concurrency, and synchronous self-wake.

**Adapt to Host-owned operation policy.** A bounded slot queue or per-key serialization does not bound total active keys, total waiting publishers, bytes, CPU, or foreign IO. The GM composition graph is not a work scheduler. Do not add a per-module ManagedRuntime or implicit queue to compensate. Each concrete product should choose admission limits, deadlines, retry/idempotency, and a supervised work owner.

[Recovery explicitly says at-least-once](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/core/src/session/execution/restart.ts#L32-L72): process-local coordination does not prevent repeated external effects after a crash. This is a positive example of an honest guarantee. Native interruption or a green library lifecycle test cannot establish durable exactly-once business behavior.

## 8. Observed limitations and counterevidence

| Source observation | Classification and consequence | GM lesson |
| --- | --- | --- |
| [AISDK call options](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/core/src/aisdk.ts#L478-L500) do not include `abortSignal`; [the `tryPromise` doStream callback](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/core/src/aisdk.ts#L706-L729) ignores its callback signal | Confirmed forwarding gap on that path. Separate timeout controllers, stream cancellation, and middleware forwarding exist. No actual network/provider/cost impact was measured. | Forward cancellation explicitly at each foreign boundary; test the actual signal recipient. |
| [Location shutdown](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/core/src/location-services.ts#L60-L71) wraps each close in `Effect.exit` and discards results | Confirmed loss of returned causes on that path. This is not a claim that cleanup failures are never logged. Concurrent close is intentional: [a regression](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/core/test/location-layer.test.ts#L236-L272) prevents locations waiting behind one another. | Preserve cleanup outcomes while deciding concurrency; changing to sequential close blindly can introduce deadlock. |
| [Reload](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/core/src/location-service-map.ts#L20-L35) invalidates and boots all known locations using unbounded concurrency | Workload-dependent risk, not a reproduced incident. It collects all results before reporting the first failure. | Bound expensive fan-out at the application owner and account for aggregate cleanup pressure. |
| [Embedded Host](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/sdk/src/internal/host.ts#L30-L70) makes one ManagedRuntime per embedded host and disposes it after warmup failure | Positive boundary choice. One runtime per isolated Host is different from one runtime per module or method. | Keep one intentional external runtime boundary, with failed-start cleanup. |
| [Embedding options](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/sdk/src/internal/host.ts#L18-L28) expose LayerNode replacements and the [Promise API](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/sdk/src/promise.ts) accepts those options | Intentional technical coupling may be useful, but a Promise return type alone does not make the complete API runtime-neutral. | Audit options/callbacks/errors as part of neutral ports; preserve explicitly native APIs when intended. |
| [LayerNode release tracking](https://github.com/anomalyco/opencode/blob/becb9c7c9f3907257d12e95993a47ccc6e3b9625/packages/util/src/effect/layer-node.ts#L341-L363) brackets release with diagnostic callbacks | Observability enhancement, not a cleanup-completion proof or retry-debt contract. | Instrument native ownership without adding a second disposer. |

## Scale: what this research does not establish

The inspected code and fixtures show graph sharing, finite local-isolation cases, and race regressions. They do not qualify thousand-module compiler/editor cost, a thousand active sessions, bounded RSS under churn, database pool saturation, or thousands of simultaneous external IO operations. LayerNode's recursive resolver also uses a linear `stack.indexOf` cycle lookup; a deep-chain compile does not warrant a blanket linear-time or stack-safe claim. This is static algorithm inspection, not an observed failure or measured comparison with GM.

For GM, keep four measurements separate: inert prepare/validation cost; Layer construction and finalization cost by graph shape; TypeScript public-consumer compile cost; actual concurrent application workload. A diamond test proves one provider is acquired once, not that all these axes scale. Report nodes and edges, chain depth/fan-out, iterations, runtime/compiler versions, and whether resources/IO are synthetic or real. Repeated create/use/close in one process is useful when ownership retention is the risk. Broadening production APIs without those observations would be premature.

## Suggested integration into the maintained GM guide

1. Retain existing rules; they already reflect most LayerNode and ownership lessons correctly.
2. Add one short rule under lifetime/context: resource wait/reference cycles are distinct from composition DAG cycles; borrow existing owners instead of retaining parent owner Layers through caches.
3. Expand the fan-out paragraph with separate limits for active jobs, queued jobs, queued bytes, and foreign IO, and distinguish accepted interruption from settled cleanup.
4. Add a compact evidence statement separating module graph scale, typechecker scale, and concurrent application scale.
5. Put the full source-backed case studies and source manifest in research, linking from the one practices guide. Do not duplicate the whole guide or add a second normative checklist.
6. Do not add LayerNode replacement chains, a tag/lifetime DSL, Location/instance caches, a ManagedRuntime wrapper, or a scheduler in this audit. Existing GM contracts already support the selected mechanisms; a future real consumer can justify a narrower reusable helper.

These are recommendations from source inspection, not claims of independent GitHub approval, executed OpenCode E2E, or qualified product adoption.
