# Native Effect integration: design and qualification spikes

Status: implementation candidate, updated 2026-11-11; owner-authorized source delivery.
The owner selected neutral subject-specific ports at replaceable boundaries,
an optional GM integration with native Effect, deliberate breaking changes when
they improve usability, and executable spikes before committing to the design.
The native package is now implemented. Registry publication and a named product's
adoption remain separate; neither is implied by library integration tests.

The accepted source-admission decision is [ADR-0043](../../docs/decisions/0043-plan-optional-native-effect-composition.md).
The single usage reference is [Effect integration practices](../../packages/effect/docs/practices.md),
reachable from the package README, AGENTS and `.github`, and included in the
package archive. Historical designs/spikes below retain their original context;
the current implementation status is recorded next.
Read [spike evidence](spikes.md) and [review findings](reviews.md) with this plan.

## Architecture follow-up, 2026-11-12

The [source and scale audit](architecture-audit-2026-11-12.md) reviews the
implemented package against Clean Architecture, SOLID and DRY, with measured
native graph and TypeScript fixtures. It links deeper
[OpenCode research](opencode-audit-2026-11-12.md), a critical study of
[LiveStore, T3 Code and Alchemy](effect-projects-2026-11-12.md), and
[retained experiment inputs/results](raw/audit-2026-11-12/README.md).
Reusable rules remain in the packaged practices guide. These observations do
not establish a named application's concurrent capacity or authorize publication.
The [audit plan](audit-plan-2026-11-12.md) precedes the added public tests;
[PR #238](https://github.com/agent-teams-ai/get-modular/pull/238) owns delivery checks.

## Production failure paths, 2026-11-12

The [hardening report](production-hardening-2026-11-12.md) closes additional
failure-path evidence gaps with barrier-controlled partial startup, late resource
acquisition and fresh-build checks. It links the [plan](production-hardening-plan-2026-11-12.md),
the [Effect and Hazel regression study](industry-failure-patterns-2026-11-12.md)
and [ownership fix history](ownership-failure-history-2026-11-12.md) from OpenCode,
LiveStore, T3 Code and Alchemy. The existing packaged guide owns the resulting
practice rules and executable-check map. [PR #239](https://github.com/agent-teams-ai/get-modular/pull/239)
owns reviewed delivery and exact-source CI; public release and product admission
retain their separate owners.

## Production review, 2026-11-13

The [follow-up review](production-review-2026-11-13.md) covers the reproduced
combined preparation-ceiling defect, a smaller native node representation,
repeated-diamond resource ownership and malformed products after owned acquisition.
It records new upstream evidence about composed Layers, service identity, registry
isolation, concurrent disposal and packed dependency graphs. The
[upfront plan](production-review-plan-2026-11-13.md) precedes implementation;
[PR #240](https://github.com/agent-teams-ai/get-modular/pull/240) owns current review,
execution and merge evidence. The same packaged practices guide owns usage rules.

## Implementation candidate

The current source uses Effect **4.1.4**, TypeScript **7.0.2** and the repository's
existing Node/Bun runtime profiles. Frozen Effect 4.1.2 spikes are unchanged.
Assembly owns `createEntryFamily<F>()` and the three shared record/value helpers;
the optional package owns only native authoring types and lowering verified wiring
to real Layers. No Core source change, generic execution abstraction, plugin
lifecycle, cache, tag language or scheduler is added.

The selected OpenCode ideas are delivered at explicit boundaries:

| Need | Current implementation |
| --- | --- |
| Replace a live provider and omit its private graph | Typed live/fake inventories before preparation; exact construction E/R follow the chosen variant |
| Share an application resource across local sessions | Borrowed inputs and nested native scopes; the Host joins work before closing its owners |
| Respect dependency directions | Existing GM slots, ownership policy and source boundaries; no new lifetime DSL |
| Setup before starting workers | Explicit Host setup before eager native acquisition; failure prevents startup |

Maintained qualification is in `packages/effect/tests`: native exact bindings,
diamond sharing, parallel provider acquisition, typed failure, interruption,
safe metadata/input capture, memoization isolation, typed variants, real file
resources, stream completion and async finalizer ordering. The archive test
extracts matched packages into an external consumer, first executes ordinary
Assembly without Effect installed, then repeats native scenarios and public
NodeNext/Bundler declaration checks with no Node ambient types in the portable
fixture. This is the library's test Host, not an invented product adoption.

Review found and corrected a public typing hole: Effect's covariant Context key
could describe more required root fields than the graph actually produces. The
Layer constructor now checks assignability from produced roots into the caller's
key shape; rejecting and safe-widening fixtures retain that contract. Review also
moved a lazy-operation example inside Layer provision and removed duplicated
carrier validation. A mapper-owned provider/dependent FileHandle finalizer test
was added after review to cover the actual production lowering path.

Ordinary Promise consumers need no source migration. Native adoption uses the
package's public imports and explicitly migrates ownership/errors instead of
wrapping `run()`. The changeset preserves the existing Core/Assembly release pair
at 0.8.0 and selects the initial Effect 0.1.0; source candidate version 0.0.0 is
not a claim of publication. Released Assembly 0.7.1 cannot serve this new adapter.

The new application's identity is still unspecified. Product adoption must select
that consumer and verify its actual ingress, streaming and shutdown contract;
no unrelated repository is migrated to satisfy this row. Package qualification,
hosted checks and merge evidence are recorded in the PR, not inferred from the
presence of test files or from historical passing spikes.

## Decision and scope

Design `@get-modular/effect` as an optional integration that consumes one verified
GM composition and exposes native Effect construction. Keep the portable Core
wire, compiler, diagnostics and digest unchanged. Keep ordinary GM consumers
independent of Effect at installation, runtime and public-type boundaries.

GM selects module implementations and local bindings. Effect executes the chosen
construction graph and owns native resources in its Scopes. A Host owns execution
admission, application shutdown and the lifetime in which roots may be used.
Native technical ports can remain Effect/Stream values; neutral domain ports stay
free of Effect types, including callbacks, error types and configuration options.

| Owner | Responsibility |
| --- | --- |
| Core | Inert declarations, exact provider selection, closed graph validation, immutable plan |
| Assembly preparation | Captured authoring metadata, groups/profile completion, validated local injections; one shared neutral owner |
| Optional Effect package | Native factory carrier, lowering to native Layers, exact roots and construction E/R |
| Native Effect | Acquisition, memoization, interruption and finalization according to its actual contracts |
| Host / concrete facade | Admission, request context, public error mapping, active-operation and shutdown policy |
| Product ports | Subject-specific behavior, delivery guarantees, cancellation and settlement promises |

Apply the existing [composition-boundary rule](../../docs/architecture/common-assembly.md#new-composition-boundaries):
a DDD bounded context, GM module, private Effect service and resource Scope need
not map one-to-one. Use a GM entry for a real contract-selection or composition
boundary; keep cohesive private services inside their owner. Domain rules stay
independent where required, and declarations stay in the outer composition adapter.
`Host` names that application's ownership role, not a new GM runtime. A root is
its entrypoint; neighboring modules receive narrow capabilities through slots.

## What changes, and what does not

The current Assembly public factories and `PreparedAssembly.run()` are Promise
based. Wrapping `run()` with `tryPromise` is not the proposed native backend.
The native executor needs Effect factories from the beginning.

The recommended production shape shares **inert preparation** with Assembly,
while retaining two honest execution contracts. The existing Promise executor
keeps its sequential settlement, `created` journal and returned-product handoff.
Native Effect construction uses its typed error channel and scoped cleanup; it
does not pretend to provide the same journal or GM Resources retry/debt semantics.

Do not create a third authoring package, a general interpreter interface, a
`Promise | Effect` factory carrier, or a new schema generation. Existing
`defineContract`, `declareModule`, capability maps and local slots remain the
authoring foundation. A break is justified only by a concrete authoring or
preparation improvement; compatibility churn is not a goal.

## Intended author experience

The production API target is the existing declaration/group/root workflow with
native factories. The following is a design sketch, not an installed API:

```ts
const storageEntry = implement<StorageMap>()(
  storageDeclaration,
  (dependencies) => makeStorage(dependencies).pipe(
    Effect.map((storage) => ({
      instance: storage,
      capabilities: { [Storage.id]: storage },
    })),
  ),
);

const result = await effectFor<AppMap>().prepare({
  profileId: "example/default",
  modules: [infraGroup, featureGroup],
  roots: { app: appEntry },
  bindings,
});

if (result.status === "prepared") {
  const appLayer = result.prepared.layer(AppRoots);
  // Native Layer.provide / Effect.provide / ManagedRuntime consume appLayer.
}
```

The factory result is a real
`Effect<FactoryProduct<Instance, Capabilities>, E, R>`. Its dependency argument
uses the existing exact `FactoryDependencies<C, D>` shape. A prepared Layer
provides the typed roots under the caller's native Context key, retains `E`,
and leaves unsatisfied `R` visible after its construction Scope is supplied.
Native Layer provision supplies explicit ambient requirements; it does not
replace GM-selected providers inside this closed graph. Use the
[replacement recipe](../../packages/effect/docs/practices.md#2-give-inter-module-selection-one-authority)
before preparation when changing those providers.

Declared borrowed inputs must also be expressible. The complete type is
`PreparedEffectAssembly<Roots, E, R, N>`: an empty input set permits the short
call above; a nonempty `N` requires `prepared.layer(AppRoots, { inputs })`, using
the existing `RunInputs<N>` shape. The named integration error `InvalidInputs`
joins the native factory channel as `E | InvalidInputs`; it does not erase `E`.
At `.layer()` call time, safely inspect and capture the input records and exact
borrowed value references; later mutation of the supplied records cannot change
that instantiation. Do not freeze or clone the resource objects themselves.
Invalid shape produces a failing Layer with typed `InvalidInputs` before any
factory, not a synchronous throw that escapes its promised E channel.
Each `.layer()` call instantiates fresh mapper-owned Layer identities, including
when N is empty. Reuse the returned Layer deliberately to share native memoization;
do not cache implementation Layers at `prepare()` or compare input sets for reuse.
This prevents mapper-owned memoization from aliasing different inputs or ambient R.
It does not clone borrowed values or refresh private native Layers captured by a
factory. Their identities, configuration and sharing remain the factory owner's
native Effect policy; previously built external services may still be shared.
The [paired input experiment](spikes.md#input-identity-counterexample)
demonstrates why caching one implementation Layer across input sets is unsound.
Supplied inputs remain borrowed: the Layer does not register their release or
take ownership. Their external owner must outlive the Layer and its resource-using
work. Shape validation does not prove object lifetime or introduce a lease system.

Preparation may remain an asynchronous, resource-free metadata operation because
the public Core compiler already returns Promise. Do not ship a second family of
preparation wrappers merely for symmetry. Do not add a GM ManagedRuntime wrapper.
The prototype intentionally accepts a complete explicit profile; it does not yet
prove production group/completion or public-API inference parity. Its current
lowering happens once per prepared prototype graph; production per-`.layer()`
instantiation is an explicit remaining implementation requirement.

## One neutral preparation owner

The minimal shared seam belongs in existing Assembly. It must carry the exact
captured declarations, root/input membership and opaque execution payloads through
preparation without invoking a product factory. It does not abstract execution.

Its bounded work is:

1. Snapshot inert declaration data and retain the same opaque entry/factory
   references before asynchronous compilation.
2. Flatten static groups, check duplicate entry and root/input membership, and
   complete only the existing required/single-candidate bindings.
3. Compile through public Core; retain Core diagnostics. For a supplied plan,
   compare it against compilation from those same captured declarations/profile.
4. Produce immutable local injections containing slot, cardinality, capability
   and exact provider identities, associated with the captured payloads.

The compiler remains the semantic validator. The executor cannot reconstruct
cardinality from a binding row: a row with one provider may mean `T` or
`readonly T[]`. It cannot recover TypeScript error/value types from serialized
metadata. Runtime-selected catalogs must retain conservative E/R unions unless
the static API proves a narrower selection.

Extraction must retain current descriptor, bounds, root/input and identity
protections. Promise entry authentication stays owned by the Promise executor;
Effect entry authentication stays owned by the Effect executor. Any new shared
data surface must not authenticate an arbitrary factory merely by its ID or
permit re-resolution of a mutable factory table after verification.

`EntryFamily<F>` / `Wiring<F>` is one candidate for this shared boundary, not a
committed general-backend API. The first working native slice must establish the
smallest public bridge the two packages require. Its contract is to capture an
immutable declaration and authenticated entry with an opaque executable payload,
then return verified composition, local injections, roots and input metadata tied
to those same captured values. Retain the executable after its existing context
adapter, not merely the original user callback. Each executor authenticates its
own accepted family. No backend registry, stage callbacks or execution hooks.

Shared group preparation preserves concrete entry unions and used-capability
information without interpreting their factory carrier. The selected executor
rejects the wrong family in types and at runtime; forged entries and substituted
factories fail before asynchronous Core compilation. Its typed catalog remains
the authority for factory E/R; shared wiring does not recreate them.
Inputs use one authenticated neutral declaration constructor, without a dummy
throwing factory. Required input values are checked for each Layer instantiation.
Reuse the existing neutral input/product-shape checks, without moving Promise
settlement or its journal into the seam.

Protect ordinary Promise authoring calls, defaults and inference: `implement<C>()`,
`input<C>()`, `group`, `entriesOf`, `assemblyFor<C>()`, context adapters and
`PreparedAssembly.run()`. Those users must not choose a carrier/family/executor or
acquire Effect E/R parameters. Keep existing Promise-facing entry/factory types
Promise-specific; introduce a separate neutral integration view only where needed.
In particular, broadening `AnyEntry` must not make native entries typecheck in
Promise-only `Conformance.isolate`. Additive group overloads may support the native
workflow while preserving existing calls and rejecting mixed execution carriers.

Qualify the exact export and inference in step 1. Prefer a curated public root
export over another package. A subpath requires its own admitted public-surface
change. Coordinate descriptor/preflight changes with [plan 02](../architecture-guarantees-2026-11/02-resource-preflight.md)
so the two deliveries do not create competing validation owners; implementing
that entire plan is not a prerequisite for this research spike.

## Native construction invariants

- Complete selected-world validation happens before the first GM-selected factory
  call. Surrounding caller-owned Layers retain their own acquisition policy.
- Factory invocation is lazy; constructing a declaration, plan or Layer acquires
  no product resources. Synchronous factory throws remain defects at execution.
- Two slots of one capability can choose different providers. Internal service
  representation must preserve provider identity rather than using one public
  capability key for all instances.
- Reuse a stable implementation Layer on every incoming edge of its graph.
  Do not expand a diamond into separately acquired copies.
- Keep memoization lifetime explicit. Each `.layer()` call creates fresh
  mapper-owned Layer identities even inside a shared memoization domain; sharing
  those nodes requires reuse of the returned Layer. Borrowed values, external
  services and private native Layers keep their owner's sharing policy. Do not
  recursively refresh arbitrary native Layers or add a process-global cache.
- Construction E comes from native factory types. Unexpected adapter invariant
  violations are defects, not expected domain errors disguised as `unknown`.
- Preserve full native Cause/Exit where the technical owner needs it; do not
  report finalizer failure as proven cleanup success.
- Another application module is selected through a GM slot. Internal Layers and
  explicit operation context remain native; banning all nonempty R is not the
  solution to hidden dependency lookup.
- A provider resource outlives dependent operation finalizers. Parent fiber
  lifetime, lexical resource Scope and a foreign runner's work are distinct.
- Readiness, routing, drain and recovery remain with the Host. A build-only API
  does not promise to revoke escaped references or join arbitrary external I/O.
- Native Layer composition can start independent providers concurrently; this
  design promises no global startup-concurrency cap. Qualify realistic breadth
  before adoption. Do not silently import the Promise parallel-startup plan or
  introduce a scheduler to claim bounded native construction.
- GM groups organize declarations; the native path promises dependency order,
  not sequential startup of independent roots by listing order. Extra application
  startup sequencing belongs in Host; do not add an ordering DSL or fake slots.

## Adapting LayerNode within GM boundaries

The 2026-11-11 review reconsidered the earlier exclusions at the owner's request.
Adapt useful behavior where its owner is clear; do not import OpenCode's whole
application model. The [canonical guide](../../packages/effect/docs/practices.md)
contains the actual recipes and the evidence behind these decisions.

| OpenCode idea | Selected first-package treatment | Owner |
| --- | --- | --- |
| Checked substitution without acquiring old dependencies | Typed live/fake composition variants before preparation; exact selected entries, bindings and inputs | Consumer composition adapter plus existing shared GM preparation |
| Shared application resources with local instances | One application Layer, fresh local compositions with declared borrowed inputs and nested native Scopes | Effect owns native resources; Host owns using them |
| Restrictions on dependency directions | Separate closed parent/local inventories and explicit input contracts; no claim of a complete cross-composition lifetime proof | GM validates each graph; Host declares their connection |
| Ordered startup | Explicit application actions before admission; graph construction follows real dependencies | Host/application use cases |
| Decoration without duplicated wiring | Native Effect functions around owned factories/Layers | Implementation owner |

### Why automatic graph projection is not the first additional API

Current Assembly completion selects all supplied entries, and preparation requires
its inventory to match the Core plan exactly. Core rejects unreachable selections.
An automatic projection would therefore belong before ordinary preparation, under
the same neutral owner; the Effect mapper cannot silently prune a verified graph.

The difficult part is public typing as well as traversal. If projection accepts
a broad catalog, its conservative construction R and required inputs N can still
contain requirements of the pruned live database. Removing that resource at
runtime would not make a fake composition convenient. Do not erase requirements
with casts, unchecked `Exclude` or a claimed `R = never`.

Use exact typed variants first. A runtime union must be narrowed before preparing
and executing its branch, or retain an explicitly accepted common environment.
A shared projection helper remains eligible when concrete consumer variants show
repeated nontrivial selection work. Before selecting it, demonstrate a public
example without wiring casts that avoids both the old acquisition and its unused
R/N requirements, or explains the deliberately common environment. Account for
any type-level graph computation in its scope/estimate; it is not a free detail.

If justified, limit the first helper to a captured input graph, exact authenticated
replacement identities and explicit target wiring, followed by ordinary Core
validation. Preserve optional/many shapes and shared dependencies still reachable
from another root. Reject duplicate/unused replacement instructions; do not add
override chains, last-wins precedence or implicit provider deduplication. A root
replacement must also preserve its Host instance contract. This is a candidate
contract, not admitted work or a prerequisite for the native constructor.

Shared/local cache tags are a separate candidate, not another name for the input
recipe. They require a concrete sharing/configuration/ownership contract compatible
with fresh mapper identities. Native LayerMap can be a version-qualified consumer
choice when keyed reuse is actually needed; it is not a required GM dependency.

## Delivery steps and concrete stopping points

### 0. Qualify the decision with bounded spikes — retained evidence

Use public GM Core/Assembly entrypoints, the published Effect package and strict
TypeScript 7.0.2. Keep a finite complete profile and captured entries. Verify local
slot shapes, diamond sharing, factory E/R, lazy acquisition, independent scopes,
failure/cancellation and actual resource lifetime. Retain positive cases and
counterexamples with independent expected results.

The exact strictly checked and executed TypeScript sources are retained as
dated `.ts.txt` snapshots, with the original `.json.txt` configuration and command
receipts. This follows the repository's existing frozen-research convention;
the snapshots are not admitted production source or a maintained test package.
The evidence includes instructions to restore their original filenames outside
the repository and rerun them with the recorded toolchain.

The native prototype is not a product package and must not be copied into one
with its intentional validation/DX omissions. Retained experiments are dated
evidence, not a new maintained runtime or default application framework.

### 1. Admit and share preparation without changing execution

Record the scoped accepted successor for optional package identity/dependency and
the neutral preparation export. Keep prior accepted ADR bytes and Core wire intact.
Move only existing preparation mechanics; reuse existing mutation, inventory,
profile completion and supplied-plan tests. Prove that current Promise behavior
and failure/journal ownership are unchanged. Reuse the existing type fixtures for
groups, tuple inference, capability contracts and `isolate`; add rejecting cases
for cross-carrier use, including native entries passed to Promise `isolate`, and
payload substitution. Do not create a second full compiler suite.

Do not ship a standalone empty preparation refactor: land it with the first
working native construction slice and its rejecting evidence. Update the current
Consumer Module Standard and affected pinned adoption evidence when the shared
production contract changes; this research does not migrate consumers.

### 2. Deliver the optional native constructor

Implement native entries, exact factory E/R and one Layer output over the shared
instructions. Include its owner, public export, peer dependency, build, strict
typecheck, focused tests and normal repository gate in the same change.
Effect must remain absent from neutral Core/Assembly runtime dependencies and
public declarations. Version and qualify the Effect peer explicitly.

Reuse neutral binding-oracle facts from Conformance where suitable; its current
Promise execution wrappers do not automatically qualify Effect entries. Add only
the native execution adaptation actually required by the selected consumer.

### 3. Prove the public boundary and one real consumer

Run an installed/packed example through public imports, with no private path or
consumer wiring casts. Include NodeNext and Bundler type resolution and verify
that neutral imports do not install or bundle Effect. Keep platform-specific file
I/O in the test consumer; the optional integration itself must not import Node
builtins. Frontend and backend adapters keep their own application contracts.

Ship `packages/effect/docs/practices.md` with the admitted package and keep its
README link relative within the archive. Verify that guide and link in this same
packed qualification; supporting research/standard links use repository URLs.
Keep AGENTS and `.github` routed to the one source guide, not copies of its rules.

Choose an actual consumer with a concrete async orchestration/resource need.
The proposed new application is not identified yet, so synthetic results do not
claim product adoption. Do not migrate Agent Runtime or another product merely
to fill this row. Run that consumer's failure, cancellation, early stream-return
and shutdown scenarios before declaring the library contract ready for adoption.

Use two focused cases within that consumer qualification:

- A typed fake variant does not acquire its private live database and does not
  require that removed implementation's Config R or unused borrowed inputs N.
  Preserve any shared dependency still needed by another selected root.
- One shared application resource supports two independent local compositions.
  On one branch's failure, finish the owned work according to the stated fail-fast
  policy; an asynchronous finalizer can still use its resource, each local closes
  once, and the shared resource closes last. Reuse the fixture for stream early
  return. A server's ingress/drain policy is its own contract.

These are future combined-consumer cases, not additional results of the frozen
spikes. Do not create a new test framework or rerun unrelated suites for prose.

Where that consumer has background workers, qualify its actual failure policy:
an essential worker's observed failure must end the related operation when that
is the promised contract; scoped ownership alone does not propagate that failure.
Where workers start during acquisition, use the
[startup recipe](../../packages/effect/docs/practices.md#11-bound-fan-out-and-make-detached-work-deliberate)
and verify that setup precedes their first dependent operation and that failed
setup does not start them. These conditional assertions extend the same consumer
fixture; they do not add a scheduler, startup hooks or a generic supervision API.

## Breaking changes and migration

No ordinary-user source migration has yet been shown necessary. Prefer internal
extraction and additive integration exports. An unavoidable existing-public-API
break must name the affected symbols, show the concrete user benefit and
before/after call sites, and include its migration in the implementation PR.

| Change | Decision |
| --- | --- |
| Core wire/schema/digest | No demonstrated need; keep unchanged |
| Ordinary Promise authoring and execution | Preserve calls, inference, context adapters, input shapes and execution ownership; no mandatory Effect migration |
| Shared preparation internals | Extract existing rules and remove dummy input factories without broadening Promise-facing public types |
| New optional integration surface | Deliberate Effect dependency; no default import into neutral packages |
| Consumer domain ports | Remain subject-specific and neutral where replaceability is required |
| Universal Task/Fiber/Scope aliases or interpreter | Excluded |

For a consumer deliberately moving construction to the native package:

1. Select one coherent composition boundary. Use native entries/factories without
   mixing carriers in one executor. Construction migration alone need not change
   capability/slot contracts; an intentional operation-signature change requires
   its own contract revision and consumer migration. Native operation ports alone
   do not require migrating existing construction.
2. Map each owned resource to one Effect owner and keep borrowed inputs externally
   owned. Replacing `run()` with `.layer()` is not a mechanical resource migration:
   Promise journals and GM Resources debt/retry are different contracts.
3. Review native construction E/R, operation E/R, independent startup order and
   intended Layer sharing separately. Move any required extra startup sequencing
   to the Host. Keep native calls in the caller's chain inside that boundary.
4. Change test providers before preparation using the canonical replacement recipe.
   Extend the consumer's existing test to prove the live provider is not acquired;
   run the failure, cancellation and shutdown cases in
   [real-consumer qualification](#3-prove-the-public-boundary-and-one-real-consumer).

A mechanical import, call-shape or type-argument break needs the repository's
codemod and rejecting fixtures in the same implementation PR. A resource ownership
change is an explicit manual migration. A 0.x breaking release increments the
minor and carries `Better`, `Codemod`, `By hand` and `Check` migration sections.
No release is part of this research delivery.

## Engineering estimate

These are planning judgments, not observed availability or guaranteed totals.
Higher complexity means more implementation/maintenance burden.

| Option | New implementation | Existing code moved/changed | Tests/fixtures | Complexity /10 | Design confidence /10 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Recommended native package + shared preparation | 450–800 LOC | 450–850 LOC | 850–1,400 LOC | 7 | 7 |
| Explicit-profile-only native package | 350–600 LOC | 0–80 LOC | 600–1,000 LOC | 6 | 7 |
| Separate package duplicating current Assembly DX | 900–1,400 LOC | 0–80 LOC | 1,000–1,600 LOC | 8 | 5 |

Achievable reliability for the bounded native-construction contract is an
**8/10 design target after qualification**, not a rating of a shipped integration.
Docs, admission/release controls and real consumer migration are separate work.
The explicit-profile alternative is a valid smaller production scope if existing
group/profile-completion parity is deliberately unnecessary. Shared preparation
is recommended for the selected authoring workflow, not because every adapter
must change Assembly. Copying full Assembly policy is rejected. Implement only
the selected path; if the shared seam grows a generic interpreter, reduce it.

## Explicit exclusions

No plugin discovery, artifact trust, hot reload, generation replacement, routing,
distributed lifecycle, automatic construction retries, event bus, Observation
rewrite, universal resource leases, scheduler, private Context service locator,
runtime per module, mandatory Effect adoption or unrelated library upgrades.
The six earlier improvement plans retain their own scope and priority.

## Source and evidence boundary

- GM source: `5fb83478dd7b95216be92c4d3077eddf2774eef8`.
- Prior research checkpoint: `92c41b533c5ba47502a03152e98d601763d1c0a8`.
- Effect published package: `4.1.2`; registry stable tag checked for this spike.
- Effect current source observed: `ba272c5196e353794cd35bb75954548a845c6007`.
- OpenCode observed: `dc71d5f94b1800370a6de88d107f117823d85628`, whose dependency
  inputs select Effect `4.1.0`; do not relabel it as the spike's 4.1.2 environment.
- Follow-up OpenCode review: `7d5b72250890e0e89573b4cab42a003a48c20567`;
  the three intervening commits do not change the inspected LayerNode, SDK,
  lifetime or dependency inputs. The guide records its useful extra capabilities
  and their deliberate absence from this first integration scope.
- Current targeted review, 2026-11-11: GM main
  `c81fb21766e27cf3535132ec2fc2cfd396497a96` changes only CI/tooling/evidence from
  the earlier GM pin; the relevant composition source is unchanged. OpenCode
  `c4bf172532b64a02142d2da9a72d57621c48423d` retains the inspected LayerNode and
  SDK/lifetime blobs; AISDK changed elsewhere but still has the reviewed signal
  gap. Effect source `9d6b21fd80f99c7578832e9ee90562e5c5c92123` supplies the new
  LayerMap stability and RcMap ownership observations; it was not executed here.
- Further targeted review, 2026-11-11: OpenCode
  `63b42f6f02e4b74fae343eddbe567db2c53fcf21` changes only two provider implementations
  and their tests from the previous checkpoint. Effect
  `2b23262d50e5d6bec7708cab9ae738bdf7a04bdd` changes only OpenRouter workload
  identity from its previous checkpoint. The inspected integration/lifetime
  sources remain unchanged; native fork/race contracts support the clarified
  worker-failure policy. These source reads add no executed spike result.

The earlier [assessment](../architecture-guarantees-2026-11/effect-assessment.md)
and [OpenCode study](../architecture-guarantees-2026-11/opencode-effect-case-study.md)
retain their historical observations. The owner's new direction selects the
integration work described here; it supersedes earlier advice that no such
package/workstream was selected, not the six unchanged plans or their evidence.
