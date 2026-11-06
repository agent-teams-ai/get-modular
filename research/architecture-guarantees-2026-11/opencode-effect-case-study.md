# Effect and Get Modular at scale: the current OpenCode example

Status: source/design research, 2026-11-07 (Europe/Kyiv). This extends the
[Effect assessment](effect-assessment.md), not the six implementation plans.
No production dependency, integration package, OpenCode fix or new workstream is
selected. The current plugin work retains its separate owner.

## Evidence identities and limits

| Source | Exact inspected identity |
| --- | --- |
| Get Modular | `5fb83478dd7b95216be92c4d3077eddf2774eef8` |
| Planning PR before this follow-up | `baafadc987d762df3c7a21d1774b12b4f864e3e2`, draft #231 |
| OpenCode | `anomalyco/opencode`, default `dev`, `de6f469a01df975521c9d953ec81c3fc76006636`; manifest 2.2.5 |
| OpenCode workspace Effect | Catalog/override and root lock select 4.1.0; tag `effect@4.1.0` points to `9a91b1926a5fbfaffd302a7a41a94d4d53a1154e` |
| Earlier Effect comparison and caller-context probe | `9428e17499ee3a144f2ac73c67213fb1336d2bdf`, manifest 4.1.2 |

The later adversarial pass rechecked live sources. GM and Effect retained those
revisions. OpenCode dev advanced to `0ce87485e81705c65c1d62cc06fd82429ab73e81`.
The [six-commit comparison][oc-refresh] lists 31 changed paths in app, TUI,
infrastructure, code mode and an unrelated Core tool test; it does not change the
production files or dependency inputs used below. Source line references remain
at the inspected `de6f469a` checkpoint, not an unexamined moving branch.

Manifest versions are not independent release/deployment verification. External
dependency metadata still mentions older Effect requirements; the inspected
resolved Effect entry and root override select 4.1.0. We did not install or audit
the physical dependency tree. The current
source lives in `core`, `server`, `schema`, `protocol`, `client`, `sdk`, `util` and
related packages. Indexed older `packages/opencode`, `AppLayer`, `EffectBridge`
and `InstanceState` examples were not treated as current implementation.

Three reviewers investigated composition, execution/lifetimes and the earlier
recommendation adversarially. Source and existing tests were read. Two narrowly
bounded source experiments ran on Node 24.22.1; commands/outputs are retained
below. OpenCode suites, real providers, installed packages, strict types and
production throughput were not exercised. Findings distinguish observed code,
source-derived implications, executed narrow observations and unqualified risks.

Six further independent perspectives reviewed the conclusion, types, ownership,
cost and OpenCode counterevidence. Their findings are in the [review record](reviews.md).
One additional experiment, C below, uses actual Effect 4.1.2 and a simulated owner
to distinguish creating a lazy operation from executing it. It is not an
OpenCode or installed GM integration test.

## Corrected recommendation

The earlier one-module Promise facade remains a reasonable **mixed application**
integration. It is not the default blueprint for every internal service boundary
of a large Effect-native application. Keep native Effect/Stream operations
composable across those internal boundaries and choose execution owners by real
Host/subsystem/request/job lifetime, not by the number of source files.

Current OpenCode already adds a substantive **LayerNode graph compiler** above
Effect. Comparing GM only with bare Context misses that application architecture.
GM must add a specific independent composition requirement; a second copy of the
same provider graph is not a useful default.

For a new predominantly Effect-native scope with sufficient native composition,
do not add GM by default. For an existing explicitly adopted GM scope, preserve
that authority while selecting the bounded execution integration. See the
[decision and counterargument](effect-assessment.md#decision-after-the-adversarial-review):
a portable profile and exact slot policy can justify GM, especially when they
replace repeated cross-product policy. Module count alone cannot.

No overall "OpenCode versus GM modularity" score is justified by this evidence.
The meaningful comparison is the same concrete guarantee, including its actual
implementation and adoption, not a product against a library or future plans
against existing code.

## What "modularity" means in this comparison

| Dimension | Effect and current OpenCode | Current Get Modular |
| --- | --- | --- |
| Typed service construction | Layer/Context provide service requirements, outputs, errors and acquisition; LayerNode adds checked declared wiring and substitution | Assembly consumes closed declared dependency records and publishes opaque capability values |
| Validation before acquisition | LayerNode resolves replacements and rejects reachable cycles/unbound nodes/conflicting Layer wiring before building | Core checks inert declarations and explicit profiles, including selected bindings and cardinalities, before application factories |
| Independent composition artifact | LayerNode holds Layer objects and exact declaration-object identities; compilation returns an executable Layer | Separate portable declarations, stable identities, canonical immutable plan and digest |
| Public/private service outputs | LayerNode groups expose selected roots and hide transitive dependency outputs | A factory receives only declared dependency slots; public capabilities are explicit |
| Source import/domain policy | Real package and selected bundle/lint boundaries; these are not a complete Core feature privacy or DDD proof | Separately adopted CMS/FMS/Conformance rules; stronger actual-membership/parity checks in plan 03 remain proposed |
| Work and resource lifetime | Effect supplies execution/scopes; OpenCode adds Host, Location and Session policy | GM assigns product lifecycle to the Host; Resources has its distinct optional cleanup/debt protocol |

Thus "Effect composes typed services and their acquisition" is accurate.
Equating that with complete module governance would be too broad. Neither a
Context service nor a capability ID automatically establishes a bounded context,
forbids arbitrary imports, or supplies a process/security sandbox.
Sources: [LayerNode][oc-node], [GM boundary][gm-boundary],
[current GM layout checker][gm-layout].

## What OpenCode actually implements

### A graph above the Effect graph

`LayerNode` declares dependencies, keeps node replacement contracts invariant,
requires replacement outputs and allowed errors, supports unbound declarations,
and resolves the effective graph before acquisition. Replaced old dependencies
are pruned; one native Layer object cannot be wired to conflicting dependencies
within the same memoization domain. Groups expose roots rather than every
transitive service. These are real composition mechanisms, not just guidelines.

The application tags distinguish Global and Location nodes. Typed direct edges
allow Location to use Global, but reject a declared Global-to-Location edge.
Compilation can use the enclosing MemoMap for shared subgraphs and a fresh map
for local wiring. Dependencies build concurrently while group roots retain their
declared order. `Agent` is a concrete Effect-returning service with a private Layer
and `Bus.node` dependency. `Instance.graph` lists 54 roots; the count illustrates
the example, not quality. `LocationWatcher` deliberately follows boot-critical
filesystem/Git work.

Existing tests assert private outputs, exact replacements, pruning, cycles,
diamond sharing, conflicting wiring and startup order. Negative type fixtures
cover missing dependencies, invalid replacements/tags and variance weakening;
an existing dist configuration checks those contracts against emitted declarations.
These tests were inspected, not executed here. Sources:
[node source][oc-node], [tags][oc-tags], [Agent][oc-agent],
[Instance][oc-instance], [runtime tests][oc-node-tests],
[type fixtures][oc-node-types], [dist configuration][oc-dist].

Important differences from GM are deliberate policies, not automatic defects:

- Replacements target declaration objects; the last replacement for a source
  wins. GM uses separate explicit identities/profile bindings.
- Distinct roots can provide the same Context key. From the inspected LayerNode
  reduction and exact Effect 4.1.0 Context merge semantics, the later root can
  shadow the earlier output while both acquire. No failing real configuration
  was reproduced. Private branches can legitimately use different implementations
  of the same service.
- Layer requirements do not express GM's separately named required, optional and
  bounded-many slots with their bindings.
- Tag checks are not an arbitrary-source lifetime proof. Untagged helpers can
  hide transitive tags from a direct check in principle; the inspected production
  untagged Observability helper has no dependencies, so a violating production
  graph was not established.

The same-key observation follows [LayerNode][oc-node] plus Effect 4.1.0
[provideMerge][effect-merge] and [Context.merge][effect-context].

### Real public package boundaries

Schema holds common values; Core consumes them; Protocol describes the network
contract; Server joins Core and Protocol. Client has separate Promise and Effect
entrypoints. SDK owns embedded hosting and reuses Client, Core and Server.

The client bundle tests inspect actual build inputs: the Promise entry has no
Effect/Schema/Protocol/Core/Server runtime inputs; the Effect entry intentionally
includes Effect and shared contracts, but excludes Core/Server. The embedded SDK
tests expect the host packages. This is runtime import/bundle isolation, **not**
absence of Effect from the dependency installation tree. Core/Server/Util wildcard
exports also do not establish per-feature source privacy.

Sources: [client manifest][oc-client-package], [client boundary tests][oc-client-tests],
[SDK boundary tests][oc-sdk-tests]. Tests were read, not run.

### Lifetime follows the application, not service count

The embedded SDK Host creates its ManagedRuntime around the application routes.
Its failed warmup has an explicit `onError` disposal path. Effect and Promise SDKs
reuse that Host. The examined production Core/Server/Client/SDK/CLI/Util roots
contain one `ManagedRuntime.make` site, at this boundary; that is not a claim
about every package or every number of runtime instances created at execution.

LocationServiceMap uses canonical keys, failed-build eviction and identity checks
so an old failing build cannot evict its replacement. Invalidation detaches new
routing while borrowers may retain the old graph. SDK configuration deliberately
captures services while letting the current acquisition Scope override a captured
Scope. Borrowed map values use `Layer.succeed` to avoid a self-retaining cycle.

SessionRunCoordinator owns its FiberSet and serializes work per Session key while
allowing different keys concurrently. Cancelling a joined observer does not cancel
the shared business execution. `interrupt` acknowledges a request; `awaitIdle`
waits through cleanup/settlement. This is explicit ownership, not a defect in
structured concurrency. Durable restart claims remain application policy; fibers
alone do not provide crash recovery or exactly-once external effects.

Sources: [SDK Host][oc-host], [SDK instances][oc-sdk-instances],
[Location services][oc-locations], [coordinator][oc-coordinator],
[coordinator tests][oc-coordinator-tests], [cancelled-borrower test][oc-borrower-test].

### An external lifecycle adapter with explicit limits

`OwnedFetch` rejects new requests after closing starts, forwards caller abort,
retains the handler and the body of a normally delivered response, aborts and
awaits tracked request lifetimes before runtime disposal, and retains its first
close Promise. If abort wins before the handler settles, its error path waits
for that handler, but does not pass a late Response through `trackResponse`.
The actual [Effect HTTP handler][effect-http-handler] additionally interrupts the
request fiber and binds stream/scope lifetime to its signal; a failing embedded
OpenCode path was not established. The helper alone is not a universal guarantee
for arbitrary late resources or an uncooperative handler/stream.

Direct Effect SDK methods also require callers to respect the acquired Host
lifetime; several direct service methods bypass the fetch guard. Their types do
not promise post-close revocation. That borrowing contract is not inherently a
defect or a reason to wrap every internal operation in a lease.
Sources: [OwnedFetch][oc-fetch], [retention tests][oc-retention],
[Effect SDK][oc-effect-sdk].

## Why a Promise and runtime at every module boundary is the wrong default

A caller-local Reference in the executed probe produced:

| Operation path | Result |
| --- | --- |
| Native Effect-returning port in the caller's operation | `request-17` |
| Effect to Promise to a separate ManagedRuntime to Effect, signals forwarded | `default` |

The runner starts a new root fiber from its runtime context. Forwarding an
AbortSignal does not also transfer the caller's Effect context. Native operations
remain in the caller's chain; normal child forks preserve parent context/ownership.
The probe used Effect 4.1.2 source, not OpenCode or its installed 4.1.0 package.

This matters for behavior: OpenCode's actual SQLite transaction code uses the
current fiber context to supply the transaction to its body. A separate runtime
entry inside such a body could miss it. This is a counterexample to the proposed
integration boundary, **not an accusation that OpenCode makes that mistake**.
Similarly, normal Promise types lose the expected error parameter and require
explicit Cause/error conversion. Source also shows that aborting a `tryPromise`
controller does not itself join the inner runtime's asynchronous finalizers.
The latter is source reasoning, not an additional executed test.

Sources: [Effect execution][effect-execution], [Promise cancellation][effect-promise],
[OpenCode transaction context][oc-transaction]. A meaningful foreign or isolated
subsystem boundary can still justify these adapters.

## Three bounded choices for Get Modular consumers

| Application | Recommended arrangement | Admission limit |
| --- | --- | --- |
| Mixed application with one Effect-heavy subsystem | GM selects its external ports; that subsystem owns its private Effect services and neutral facade | Deliberate error/context/cancellation/lifetime mapping at that boundary |
| Cooperating modules already use Effect, and GM's separate artifact/policy is needed | GM selects native Effect-returning capability ports; the Host owns execution | Preserve current GM construction and resource contracts; qualify one real native chain |
| Existing Effect/LayerNode graph already meets the actual need | Keep that graph as the composition authority | Add GM only for a demonstrated extra requirement, not a feature-list comparison |

In the native choice, the **construction factory's Promise** and a **capability
method's Effect** belong to different phases. GM leaves capability values opaque.
A constructor can capture narrow declared ports and publish ordinary objects
whose methods compose those Effects; no runner or mirrored Layer graph is needed
for each operation. This is source-supported API shape, not a qualified installed
consumer integration.

Native operation ports do not make GM construction native Layer acquisition.
Current GM factories use ordinary sequential Promises and opaque construction
causes; native Layers combine typed acquisition errors, sharing and scopes.
Replacing an already resourceful Layer graph has a real integration cost that
passive operation objects do not. A compiler from one authoritative GM graph
to a Layer representation could be valid in principle, but is not qualified or
selected here; two representations are not inherently two competing authorities.

Keep the existing ownership route. GM Resources can own module resources while
Host request/job scopes own work; stop/drain the latter under existing Host/debt
policy before releasing their dependencies. Host-owned resources may instead be
declared borrowed inputs. Prepare GM before starting their acquisition if claiming
preflight-before-effects. Current CMS admits only `scoped` as the factory context
adapter; injecting an unrestricted Context, Scope or runtime through a new
`FactoryContext` is not an already supported shortcut. A common backend for
arbitrary acquiring Layers remains unqualified and out of scope.

Effect-native public ports intentionally depend on Effect and its compatible
version. Close undeclared business-provider requirements, but keep legitimate
operation requirements such as `Scope.Scope` truthful. `R = never` only closes
the required-service type parameter: References and optional lookups can still
read context. It neither guarantees lifetime nor authorizes capturing a long-lived Scope to evade an
operation requirement. Independent Hosts/tenants/workers can have independent
runtimes; choose those from actual ownership needs.
Sources: [Assembly types][gm-types], [runner][gm-run], [CMS][gm-cms].

At an existing owner/retirement facade, admission must occur when a lazy Effect
executes, and its borrow must last through settlement/finalization. For Stream,
it lasts through consumption/cancellation. Bracketing the JS method that returns
the value releases too early; [experiment C](#c-lazy-operation-admission-and-finalization)
demonstrates the distinction. Preserve one provider-selection authority, one
physical-resource owner and an explicit work/admission owner. Static native calls
inside that protected lifetime need no extra lifecycle wrapper.

## Good patterns and cautions grounded in this example

| Pattern | Disposition and lesson |
| --- | --- |
| Native Effect service chains, external Promise/Effect APIs | Reuse the separation; neutral SDK callers need not dictate every internal service method |
| Resolve effective replacements before acquisition | Good existing LayerNode behavior; GM already has its own preflight authority, so do not duplicate the graph |
| Global/Location sharing with actual lifetime tests | Good deliberate ownership; shared caches are not inherently wrong when their domain is explicit |
| Separate job owner, joined observer and cancellation acknowledgement | Good coordinator behavior for many concurrent agents; observer cancellation is not automatically business cancellation |
| Retain the first close result and normally delivered response-body lifetime | Useful OwnedFetch behavior; late results still rely on the underlying handler, and repeated idempotent close is not physical retry |
| SDK Promise bridge without its operation signal | A specific before-response forwarding gap is confirmed below; do not copy this pattern |
| Convert cleanup to Exit then discard every result | Source-visible loss of cleanup-cause information; continuing all releases and reporting their failures are separate responsibilities |
| Infinite idle cache retention with unbounded sharing keys | A scale/lifetime policy to evaluate, not automatically a leak. Session count, Location count and key count are different quantities |
| Low-level RcMap state/entry-scope handling | Public in Effect 4.1.0, but stronger representation coupling; retain focused upgrade regressions, do not copy the manager into GM Core |
| Two independently authoritative graphs for the same providers | Avoid: replacements, construction order and sharing can disagree without a defined owner |

### Confirmed narrow AI SDK signal gap

OpenCode's `callOptions` does not set `abortSignal`; its fallback route passes the
prepared value unchanged. `streamLanguage` uses a zero-argument `tryPromise`
callback for `language.doStream(options)`, including its optional middleware
branch. The extracted-function experiment used real Effect 4.1.0 and a controlled
SDK Promise. After interrupting the consumer, the SDK had received no signal and
its Promise remained pending. Exact function bytes and evidence limits are below.

This proves missing operation-signal forwarding on that path. It does not show
that all OpenCode cancellation fails, that a provider continued physical network
work or that usage charges resulted. Provider header/chunk/overall timeout
controllers and cancellation of an already acquired stream exist separately.
A future bounded fix would forward the callback signal to the SDK's `abortSignal`
while preserving middleware, with one regression in the existing suite. An SDK
that ignores signals or returns a resource late needs its actual contract; no
universal cancellation platform is justified.
Sources: [AISDK][oc-aisdk], [route caller][oc-ai-route]. No upstream edit is made.

### Cleanup reporting and other qualification limits

Location shutdown calls `Effect.exit(Scope.close(entry.scope, ...))` concurrently
with `discard: true`. This preserves continuation across failures but loses the
Exit/Cause values from that result. Scope is marked closed before finalizers run,
so a subsequent ordinary close cannot replay the failure. Teardown tracking only
retains pending labels; an individual finalizer may log its own failure. This is
a source-visible reporting tradeoff, not an observed production incident or a
proved breach of a documented OpenCode promise. No extra probe was run.
Sources: [location finalizer][oc-locations], [teardown][oc-teardown],
[Effect 4.1.0 Scope close][effect-scope].

The web fetch bootstrap uses `forkDetach` for its initial recovery sweep, unlike
the managed process/SDK paths. Recovered jobs have an owned Scope; calling all
recovery unowned would be wrong. Initial-sweep interruption is a bounded future
qualification question if that Host is adopted, not a confirmed bug or new
campaign. [Fetch entrypoint][oc-server-fetch], [recovery owner][oc-recovery].

## What follows for the six plans

No new implementation workstream follows. Plans 02 and 03 strengthen GM's
distinct contract independently of adopting Effect; 04/05 remain conditional.
For 05, preserve real readiness and source boundaries when measuring existing
local Layer concurrency versus remaining inter-module delay.

If a consumer later selects native integration, the smallest useful proof is two
actual communicating GM modules, one caller-local reference and one resource,
using installed public imports and existing checks. Cover provider identity,
native context/error behavior, cancellation and join before resource release,
preflight ordering, and absence of a second provider graph. At an owner boundary,
observe deferred execution after retirement and finalizer/stream retention.
Actually execute the lazy operations in the existing consumer contract cases;
GM Conformance awaits its case and does not interpret Effect automatically.
Keep the current strict compiler and package gates. Choosing a consumer comes before a credible
LOC estimate; no invented cost or reliability improvement is claimed here.

[oc-node]: https://github.com/anomalyco/opencode/blob/de6f469a01df975521c9d953ec81c3fc76006636/packages/util/src/effect/layer-node.ts
[oc-tags]: https://github.com/anomalyco/opencode/blob/de6f469a01df975521c9d953ec81c3fc76006636/packages/util/src/effect/app-node.ts
[oc-agent]: https://github.com/anomalyco/opencode/blob/de6f469a01df975521c9d953ec81c3fc76006636/packages/core/src/agent.ts
[oc-instance]: https://github.com/anomalyco/opencode/blob/de6f469a01df975521c9d953ec81c3fc76006636/packages/core/src/instance.ts
[oc-node-tests]: https://github.com/anomalyco/opencode/blob/de6f469a01df975521c9d953ec81c3fc76006636/packages/core/test/effect/layer-node/layer-node.test.ts
[oc-node-types]: https://github.com/anomalyco/opencode/blob/de6f469a01df975521c9d953ec81c3fc76006636/packages/core/test/effect/layer-node/layer-node-types.test.ts
[oc-dist]: https://github.com/anomalyco/opencode/blob/de6f469a01df975521c9d953ec81c3fc76006636/packages/util/tsconfig.dist.json
[oc-client-package]: https://github.com/anomalyco/opencode/blob/de6f469a01df975521c9d953ec81c3fc76006636/packages/client/package.json
[oc-client-tests]: https://github.com/anomalyco/opencode/blob/de6f469a01df975521c9d953ec81c3fc76006636/packages/client/test/import-boundaries.test.ts
[oc-sdk-tests]: https://github.com/anomalyco/opencode/blob/de6f469a01df975521c9d953ec81c3fc76006636/packages/sdk/test/import-boundaries.test.ts
[oc-host]: https://github.com/anomalyco/opencode/blob/de6f469a01df975521c9d953ec81c3fc76006636/packages/sdk/src/internal/host.ts
[oc-sdk-instances]: https://github.com/anomalyco/opencode/blob/de6f469a01df975521c9d953ec81c3fc76006636/packages/sdk/src/internal/instances.ts
[oc-locations]: https://github.com/anomalyco/opencode/blob/de6f469a01df975521c9d953ec81c3fc76006636/packages/core/src/location-services.ts
[oc-coordinator]: https://github.com/anomalyco/opencode/blob/de6f469a01df975521c9d953ec81c3fc76006636/packages/core/src/session/run-coordinator.ts
[oc-coordinator-tests]: https://github.com/anomalyco/opencode/blob/de6f469a01df975521c9d953ec81c3fc76006636/packages/core/test/session-run-coordinator.test.ts
[oc-borrower-test]: https://github.com/anomalyco/opencode/blob/de6f469a01df975521c9d953ec81c3fc76006636/packages/sdk/test/instances-lifecycle.test.ts
[oc-fetch]: https://github.com/anomalyco/opencode/blob/de6f469a01df975521c9d953ec81c3fc76006636/packages/sdk/src/internal/fetch.ts
[oc-retention]: https://github.com/anomalyco/opencode/blob/de6f469a01df975521c9d953ec81c3fc76006636/packages/sdk/test/request-retention.test.ts
[oc-effect-sdk]: https://github.com/anomalyco/opencode/blob/de6f469a01df975521c9d953ec81c3fc76006636/packages/sdk/src/effect/opencode.ts
[oc-transaction]: https://github.com/anomalyco/opencode/blob/de6f469a01df975521c9d953ec81c3fc76006636/packages/core/src/database/drizzle/effect-sqlite/session.ts#L140-L174
[oc-aisdk]: https://github.com/anomalyco/opencode/blob/de6f469a01df975521c9d953ec81c3fc76006636/packages/core/src/aisdk.ts
[oc-ai-route]: https://github.com/anomalyco/opencode/blob/de6f469a01df975521c9d953ec81c3fc76006636/packages/ai/src/route/client.ts
[oc-teardown]: https://github.com/anomalyco/opencode/blob/de6f469a01df975521c9d953ec81c3fc76006636/packages/util/src/teardown.ts
[oc-server-fetch]: https://github.com/anomalyco/opencode/blob/de6f469a01df975521c9d953ec81c3fc76006636/packages/server/src/fetch.ts
[oc-recovery]: https://github.com/anomalyco/opencode/blob/de6f469a01df975521c9d953ec81c3fc76006636/packages/core/src/session/execution/restart.ts
[gm-boundary]: https://github.com/agent-teams-ai/get-modular/blob/5fb83478dd7b95216be92c4d3077eddf2774eef8/docs/architecture/system-boundary.md
[gm-layout]: https://github.com/agent-teams-ai/get-modular/blob/5fb83478dd7b95216be92c4d3077eddf2774eef8/packages/conformance/src/features/layout/check.ts
[gm-types]: https://github.com/agent-teams-ai/get-modular/blob/5fb83478dd7b95216be92c4d3077eddf2774eef8/packages/assembly/src/features/construction/types.ts
[gm-run]: https://github.com/agent-teams-ai/get-modular/blob/5fb83478dd7b95216be92c4d3077eddf2774eef8/packages/assembly/src/features/construction/run.ts
[gm-cms]: https://github.com/agent-teams-ai/get-modular/blob/5fb83478dd7b95216be92c4d3077eddf2774eef8/docs/architecture/common-assembly.md
[effect-merge]: https://github.com/Effect-TS/effect/blob/9a91b1926a5fbfaffd302a7a41a94d4d53a1154e/packages/effect/src/Layer.ts#L1582-L1622
[effect-context]: https://github.com/Effect-TS/effect/blob/9a91b1926a5fbfaffd302a7a41a94d4d53a1154e/packages/effect/src/Context.ts#L1154-L1192
[effect-scope]: https://github.com/Effect-TS/effect/blob/9a91b1926a5fbfaffd302a7a41a94d4d53a1154e/packages/effect/src/internal/effect.ts
[effect-execution]: https://github.com/Effect-TS/effect/blob/9428e17499ee3a144f2ac73c67213fb1336d2bdf/packages/effect/src/internal/effect.ts#L5600-L5879
[effect-promise]: https://github.com/Effect-TS/effect/blob/9428e17499ee3a144f2ac73c67213fb1336d2bdf/packages/effect/src/internal/effect.ts#L1150-L1229
[effect-http-handler]: https://github.com/Effect-TS/effect/blob/9a91b1926a5fbfaffd302a7a41a94d4d53a1154e/packages/effect/src/http/HttpEffect.ts#L226-L353
[oc-refresh]: https://github.com/anomalyco/opencode/compare/de6f469a01df975521c9d953ec81c3fc76006636...0ce87485e81705c65c1d62cc06fd82429ab73e81

## Retained source experiments

These commands are retained one-off evidence, not maintained tooling or a new
test harness. None is strict typecheck or package/application E2E.

### A. Caller context across an extra runtime boundary

Executed from `/workspace/scratch/44ef6f5b5546/research-layers/effect` at the Effect
source SHA listed above, Node `v24.22.1`. No files or dependencies were created.
This retained one-off command uses native TypeScript stripping; it is not new
maintained JavaScript tooling or strict typechecking.

```bash
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import * as Context from './packages/effect/src/Context.ts';
import * as Effect from './packages/effect/src/Effect.ts';
import * as Layer from './packages/effect/src/Layer.ts';
import * as ManagedRuntime from './packages/effect/src/ManagedRuntime.ts';
const Request = Context.Reference('research/caller-request', { defaultValue: () => 'default' });
const runtime = ManagedRuntime.make(Layer.empty);
const nativePort = { read: () => Request };
const promisePort = { read: (signal) => runtime.runPromise(Request, { signal }) };
const caller = new AbortController();
try {
  await runtime.runPromise(Effect.void);
  const observed = await Effect.runPromise(
    Effect.gen(function* () {
      const direct = yield* nativePort.read();
      const viaPromise = yield* Effect.tryPromise((signal) => promisePort.read(signal));
      return { direct, viaPromise };
    }).pipe(Effect.provideService(Request, 'request-17')),
    { signal: caller.signal },
  );
  assert.deepEqual(observed, { direct: 'request-17', viaPromise: 'default' });
  console.log(JSON.stringify({ node: process.version, ...observed }));
} finally {
  await runtime.dispose();
}
JS
```

Exit code: `0`. Observed output:

```json
{"node":"v24.22.1","direct":"request-17","viaPromise":"default"}
```

### B. OpenCode AI SDK before-response cancellation

On the exercised pre-response path, the only substituted application behavior is a controlled SDK implementation whose `doStream` records the options and returns a pending Promise. The tested `streamLanguage` body is extracted exactly from pinned OpenCode source and passed only through Node's built-in TypeScript stripping. `StepStart` uses its exact source declaration with actual Effect Schema. Effect, Stream, Fiber, Exit and Schema are actual 4.1.0 source modules. Error/event mappers which the pre-response path must not reach are fail-fast sentinels; their observed call count is zero. The optional middleware branch is not enabled by this probe; source inspection shows the same missing signal in both branches.

The real runtime sources were materialized from the already fetched local tag into a fresh scratch folder; no install or network call was involved. The probe completed with exit code 0 in about 0.55 seconds. No strict compiler, Bun runner, installed OpenCode package, provider endpoint or production service was exercised.

#### Materializing the exact runtime source

Run from `/workspace/scratch/44ef6f5b5546`:

```bash
python - <<'PY'
from pathlib import Path
import io, subprocess, tarfile
src=Path('/workspace/scratch/44ef6f5b5546/research-layers/effect')
dest=Path('/workspace/scratch/44ef6f5b5546/opencode-effect-4.1.0-probe')
dest.mkdir(exist_ok=True)
revision=subprocess.check_output(['git','rev-parse','effect@4.1.0'],cwd=src,text=True).strip()
assert revision=='9a91b1926a5fbfaffd302a7a41a94d4d53a1154e'
archive=subprocess.check_output(['git','archive','effect@4.1.0','packages/effect/src'],cwd=src)
with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
    tar.extractall(dest,filter='data')
print({'revision':revision,'destination':str(dest),'archive_bytes':len(archive)})
PY
```

Observed:

```text
{'revision': '9a91b1926a5fbfaffd302a7a41a94d4d53a1154e', 'destination': '/workspace/scratch/44ef6f5b5546/opencode-effect-4.1.0-probe', 'archive_bytes': 19292160}
```

#### Executed command

```bash
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import * as Effect from './opencode-effect-4.1.0-probe/packages/effect/src/Effect.ts';
import * as Stream from './opencode-effect-4.1.0-probe/packages/effect/src/Stream.ts';
import * as Fiber from './opencode-effect-4.1.0-probe/packages/effect/src/Fiber.ts';
import * as Exit from './opencode-effect-4.1.0-probe/packages/effect/src/Exit.ts';
import * as Schema from './opencode-effect-4.1.0-probe/packages/effect/src/Schema.ts';
const source = readFileSync('./research-opencode/packages/core/src/aisdk.ts', 'utf8');
const start = source.indexOf('function streamLanguage(');
const end = source.indexOf('\ntype Fragment =', start);
assert.ok(start >= 0 && end > start);
const exactFunction = source.slice(start, end);
const eventSource = readFileSync('./research-opencode/packages/ai/src/schema/events.ts', 'utf8');
const eventStart = eventSource.indexOf('export const StepStart =');
const eventEnd = eventSource.indexOf('\nexport type StepStart', eventStart);
assert.ok(eventStart >= 0 && eventEnd > eventStart);
const stepStartDeclaration = eventSource.slice(eventStart, eventEnd).replace(/^export /, '');
const StepStart = new Function('Schema', `${stepStartDeclaration}\nreturn StepStart;`)(Schema);
let unexpectedHelpers = 0;
const unreachable = () => { unexpectedHelpers++; throw new Error('Unexpected path outside the observed pre-response boundary'); };
const streamLanguage = new Function('Effect', 'Stream', 'LLMEvent', 'llmError', 'streamPartEvents', 'httpMiddleware',
  `${stripTypeScriptTypes(exactFunction)}\nreturn streamLanguage;`
)(Effect, Stream, { stepStart: StepStart.make }, unreachable, unreachable, undefined);
const entered = Promise.withResolvers();
const result = Promise.withResolvers();
let receivedOptions;
let aborts = 0;
let providerSettled = false;
let lateBodyCancelled = 0;
const pendingProvider = result.promise.then(value => { providerSettled = true; return value; });
const language = { doStream(options) {
  receivedOptions = options;
  options.abortSignal?.addEventListener('abort', () => aborts++, { once: true });
  entered.resolve();
  return pendingProvider;
}};
const options = { prompt: [] };
const fiber = Effect.runFork(Stream.runDrain(streamLanguage(language, options)));
await entered.promise;
await Effect.runPromise(Fiber.interrupt(fiber));
const exit = await Effect.runPromise(Fiber.await(fiber));
const beforeProviderResolution = {
  optionsUnchanged: receivedOptions === options,
  sdkAbortSignalProvided: receivedOptions.abortSignal instanceof AbortSignal,
  consumerInterrupted: Exit.hasInterrupts(exit),
  sdkAbortEvents: aborts,
  providerSettled,
};
result.resolve({ stream: new ReadableStream({ cancel() { lateBodyCancelled++; } }) });
await pendingProvider;
await new Promise(resolve => setImmediate(resolve));
assert.equal(beforeProviderResolution.optionsUnchanged, true);
assert.equal(beforeProviderResolution.sdkAbortSignalProvided, false);
assert.equal(beforeProviderResolution.consumerInterrupted, true);
assert.equal(beforeProviderResolution.providerSettled, false);
assert.equal(aborts, 0);
assert.equal(unexpectedHelpers, 0);
console.log(JSON.stringify({
  node: process.version,
  opencode: 'de6f469a01df975521c9d953ec81c3fc76006636',
  effect: 'effect@4.1.0 / 9a91b1926a5fbfaffd302a7a41a94d4d53a1154e',
  extractedFunctionSha256: createHash('sha256').update(exactFunction).digest('hex'),
  beforeProviderResolution,
  afterProviderResolution: { providerSettled, lateBodyCancelled, unexpectedHelpers },
}));
JS
```

Observed output (plus Node's expected experimental `stripTypeScriptTypes` warning):

```json
{"node":"v24.22.1","opencode":"de6f469a01df975521c9d953ec81c3fc76006636","effect":"effect@4.1.0 / 9a91b1926a5fbfaffd302a7a41a94d4d53a1154e","extractedFunctionSha256":"89b47ffe21a891636ea00ed14c72b225448e9bd75d69021664b2b8fc431988ae","beforeProviderResolution":{"optionsUnchanged":true,"sdkAbortSignalProvided":false,"consumerInterrupted":true,"sdkAbortEvents":0,"providerSettled":false},"afterProviderResolution":{"providerSettled":true,"lateBodyCancelled":0,"unexpectedHelpers":0}}
```

The post-resolution observation is bounded to the recorded next event-loop turn; do not turn it into a measured claim about a real SDK's eventual network cleanup. The central proof is the absence of an operation signal in the SDK options while the consumer is interrupted.

### C. Lazy operation admission and finalization

Working directory: `/workspace/scratch/44ef6f5b5546/research-layers/effect`.
Exit code: 0. Wall time reported by exec: 0.195390151 seconds.
This is executable illustrative evidence, not maintained test infrastructure. The simulated owner implements only retirement, a borrow count and a fake resource-live flag. Actual Effect controls lazy execution, interruption and finalization; no real database or GM runtime is substituted or claimed.

```bash
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import * as Effect from './packages/effect/src/Effect.ts';
import * as Deferred from './packages/effect/src/Deferred.ts';
import * as Fiber from './packages/effect/src/Fiber.ts';
import * as Exit from './packages/effect/src/Exit.ts';
const watchdog = setTimeout(() => process.exit(124), 2000);
watchdog.unref();

function makeOwner() {
  let retired = false, borrowed = 0, alive = true, uses = 0, closes = 0;
  const events = [];
  const closeIfIdle = () => {
    if (retired && borrowed === 0 && alive) {
      alive = false; closes++; events.push('resource-closed');
    }
  };
  return {
    events,
    snapshot: () => ({ retired, borrowed, alive, uses, closes }),
    begin: () => {
      if (retired) throw new Error('owner-retired');
      borrowed++; events.push('borrow');
    },
    end: () => { borrowed--; events.push('release'); closeIfIdle(); },
    retire: () => { retired = true; events.push('retire'); closeIfIdle(); },
    use: () => { uses++; return alive; }
  };
}
function protectedOperation(owner, operation) {
  return Effect.acquireUseRelease(
    Effect.try({ try: owner.begin, catch: cause => cause }),
    () => Effect.suspend(operation),
    () => Effect.sync(owner.end)
  );
}

// The unsafe facade brackets only creation of the lazy Effect value.
const unsafeOwner = makeOwner();
const unsafePort = { read: () => Effect.sync(unsafeOwner.use) };
function unsafeFacade() {
  unsafeOwner.begin();
  try { return unsafePort.read(); } finally { unsafeOwner.end(); }
}
const delayedUnsafe = unsafeFacade();
assert.equal(unsafeOwner.snapshot().uses, 0);
unsafeOwner.retire();
const unsafeUseSawLiveResource = await Effect.runPromise(delayedUnsafe);
assert.equal(unsafeUseSawLiveResource, false);

// A deferred facade obtains admission on execution, not when the value is made.
const refusedOwner = makeOwner();
const delayedSafe = protectedOperation(refusedOwner, () => Effect.sync(refusedOwner.use));
assert.equal(refusedOwner.snapshot().borrowed, 0);
refusedOwner.retire();
const refusal = await Effect.runPromiseExit(delayedSafe);
assert.equal(Exit.isFailure(refusal), true);
assert.equal(refusedOwner.snapshot().uses, 0);

// An already admitted operation retains the resource through asynchronous finalization.
const activeOwner = makeOwner();
const started = Deferred.makeUnsafe();
const finalizerStarted = Deferred.makeUnsafe();
const permitFinalizer = Deferred.makeUnsafe();
const activeWork = Effect.gen(function* () {
  assert.equal(activeOwner.use(), true);
  yield* Deferred.succeed(started, undefined);
  yield* Effect.never;
}).pipe(Effect.ensuring(Effect.gen(function* () {
  activeOwner.events.push('inner-finalizer-start');
  yield* Deferred.succeed(finalizerStarted, undefined);
  yield* Deferred.await(permitFinalizer);
  assert.equal(activeOwner.snapshot().alive, true);
  activeOwner.events.push('inner-finalizer-end');
})));
const active = Effect.runFork(protectedOperation(activeOwner, () => activeWork));
await Effect.runPromise(Deferred.await(started));
activeOwner.retire();
const interruption = Effect.runPromise(Fiber.interrupt(active));
await Effect.runPromise(Deferred.await(finalizerStarted));
const duringFinalizer = activeOwner.snapshot();
assert.equal(duringFinalizer.borrowed, 1);
assert.equal(duringFinalizer.alive, true);
assert.equal(duringFinalizer.closes, 0);
Effect.runSync(Deferred.succeed(permitFinalizer, undefined));
await interruption;
assert.equal(Exit.isFailure(await Effect.runPromise(Fiber.await(active))), true);
const afterSettlement = activeOwner.snapshot();
assert.equal(afterSettlement.borrowed, 0);
assert.equal(afterSettlement.alive, false);
assert.equal(afterSettlement.closes, 1);
assert.deepEqual(activeOwner.events, [
  'borrow', 'retire', 'inner-finalizer-start', 'inner-finalizer-end', 'release', 'resource-closed'
]);
console.log(JSON.stringify({
  node: process.version,
  effect: '9428e17499ee3a144f2ac73c67213fb1336d2bdf / 4.1.2',
  unsafe: { useSawLiveResource: unsafeUseSawLiveResource, ...unsafeOwner.snapshot() },
  deferredSafe: { refused: Exit.isFailure(refusal), ...refusedOwner.snapshot() },
  activeSafe: { duringFinalizer, afterSettlement, events: activeOwner.events }
}, null, 2));
clearTimeout(watchdog);
NODE
```

Observed output:

```json
{
  "node": "v24.22.1",
  "effect": "9428e17499ee3a144f2ac73c67213fb1336d2bdf / 4.1.2",
  "unsafe": {
    "useSawLiveResource": false,
    "retired": true,
    "borrowed": 0,
    "alive": false,
    "uses": 1,
    "closes": 1
  },
  "deferredSafe": {
    "refused": true,
    "retired": true,
    "borrowed": 0,
    "alive": false,
    "uses": 0,
    "closes": 1
  },
  "activeSafe": {
    "duringFinalizer": {
      "retired": true,
      "borrowed": 1,
      "alive": true,
      "uses": 1,
      "closes": 0
    },
    "afterSettlement": {
      "retired": true,
      "borrowed": 0,
      "alive": false,
      "uses": 1,
      "closes": 1
    },
    "events": [
      "borrow",
      "retire",
      "inner-finalizer-start",
      "inner-finalizer-end",
      "release",
      "resource-closed"
    ]
  }
}
```
