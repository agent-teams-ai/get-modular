# Framework lifecycle hooks for modular service hierarchies

**2026-10-01 · Experimental research only · No implementation or adoption**

Keep optional, instance-local `setup/cleanup` as the default. For large service hierarchies, the useful additional seam is an explicit readiness boundary for services that start asynchronous work. Input-change hooks belong on specific configuration consumers. Importing a framework’s complete lifecycle vocabulary would introduce ordering and shutdown obligations without establishing resource ownership.

This is a design recommendation, not measured qualification at hundreds of modules.

## Evidence and limits

I read `scope.md`, `input-hashes.json`, the full `plan-improve.md`, `plan.md`, the supplied framework documents, relevant composition source, and the retained Consumer Module Standard and ADRs. Required framework and planning inputs matched their manifest SHA-256 values on reread.

Internet evidence came **indirectly through the fresh root-supplied primary-source relay**. No native browsing occurred. Framework web captures were retrieved on **2026-10-01, approximately 13:28:05 UTC**. The Angular capture identifies documentation build `v22.2.1+sha-fb7711f`; the Spring captures identify `7.0.9`. These identify captured documentation, not independently verified runtime releases.

The two Nest web captures contained only page titles. Substantive Nest evidence therefore comes from the supplied repository Markdown at exact commit:

`nestjs/docs.nestjs.com@cc4542f80d03a9f78cb255a1c11812becb2a50f7`. [N][NS]

Get Modular authority was supplied at:

`agent-teams-ai/get-modular@9c722ceff4ede307d06d7a4b63fdebe615f54c53`. [G][O][K]

Hashes establish agreement with retained inputs; they do not independently authenticate the relay or qualify framework behavior. Missing implementation evidence is listed at the end.

## What the frameworks establish

| Framework | Documented ordering | Useful boundary | Hidden cost or limitation |
| --- | --- | --- | --- |
| Angular | Initial `ngOnChanges` precedes `ngOnInit`; initialization follows input assignment and precedes the component’s template initialization. [A] | Initialize component state from inputs; respond to subsequent input changes. | This ordering belongs to Angular’s rendering/change-detection lifecycle. Same-element component/directive hook ordering is explicitly unspecified. [A] |
| Nest | Module initialization/bootstrap proceeds by import-graph distance: deepest/global modules first, root last. Each module’s hooks are awaited before the next module. Shutdown reverses module order. [N] | Await application initialization before listening; expose shutdown stages. | Import distance does not establish every resource prerequisite or intra-module provider order. Request-scoped classes receive none of these application lifecycle hooks. [N] |
| Spring | Initialization follows dependency injection. `SmartLifecycle` phases start low-to-high and stop high-to-low; documented dependency relationships start dependencies first and stop dependents first. [S] | Separate bean initialization from background-service startup and asynchronous stopping. | Creation locks, phase coordination, bounded shutdown waits, exceptional destruction paths, and scope-dependent cleanup responsibility require explicit handling. [S][SS] |

### Angular: strong input semantics, limited service-lifecycle evidence

`ngOnInit` runs once after initial inputs are initialized. `ngOnChanges` supplies previous/current values and a first-change flag. Its first invocation precedes `ngOnInit`. These are useful semantics for a module receiving explicit configuration inputs; they do not establish dependency-health notification or automatic DI rebinding. [A]

`DestroyRef.onDestroy` can place cleanup near setup and pass destruction registration to helpers. Its `destroyed` property supports avoiding delayed operations after component destruction. The supplied guide discusses component destruction; injector-owned service lifetime details need the separate API source. [A]

Angular walks components during change detection and warns against further state changes during that traversal. Frequently invoked checking hooks can impose significant performance costs. **Inference:** reproducing those hooks across a service graph would require a new notification mechanism, reentrancy rules, and scheduling policy. A static dependency graph supplies none of that automatically. [A]

The guide does not establish awaited asynchronous cleanup, hook rejection handling, or resource-release evidence. A destruction flag must therefore not become our cleanup-complete receipt.

### Nest: useful startup barrier, expensive scope and shutdown assumptions

`onModuleInit` runs after the host module’s dependencies resolve. `onApplicationBootstrap` runs after all modules initialize and before listening. Returned promises can defer initialization. **Inference:** these hooks provide a useful startup barrier only when adapters await the actual readiness condition; dependency construction alone does not demonstrate external service health. [N]

The shutdown sequence is:

1. `onModuleDestroy`;
2. `beforeApplicationShutdown`;
3. underlying connection closure;
4. `onApplicationShutdown`. [N]

This creates placement constraints. Cleanup requiring an available transport must occur before its closure. The supplied contract does not establish that application traffic or background work has already drained when destruction hooks begin; admission and drain need an explicit service protocol.

Signal-triggered shutdown requires `enableShutdownHooks()`. Its listeners consume resources and can produce listener warnings when multiple Nest applications share a process. Explicit `app.close()` runs shutdown without terminating the Node process; intervals and background tasks can keep it alive. [N]

Request scope bubbles toward consumers: introducing a request-scoped dependency can make a large dependent subtree request-scoped. Transient scope does not bubble in the same way. Nest documents repeated construction costs and recommends singleton scope for most uses. Request-scoped classes are garbage-collected after requests and receive no listed application lifecycle hooks. Consequently, request-owned resources need a separate deterministic cleanup protocol. [N][NS]

The documentation describes waiting for promise settlement, but does not prove exactly which subsequent hooks execute after rejection. Do not infer complete rollback or best-effort cleanup traversal from that wording.

### Spring: richer lifecycle control, substantial coordination responsibility

Spring initialization callbacks run after properties/dependencies are supplied. The supplied guide places `@PostConstruct` and initialization methods within the singleton creation lock, warns against external bean activity there, and recommends later mechanisms such as `SmartInitializingSingleton` or context-refresh events for expensive post-initialization work. Initialization also occurs on the raw bean before AOP interceptors apply. [S]

Combining mechanisms creates ordered callbacks: `@PostConstruct`, `afterPropertiesSet`, then custom initialization; destruction similarly orders `@PreDestroy`, `destroy`, then custom destruction. Distinct method names cause distinct invocations; configuring the same method through multiple mechanisms invokes it once. **Inference:** mixed conventions can multiply effects unless their ownership is reviewed. [S]

`SmartLifecycle.stop(Runnable)` supports asynchronous shutdown: the callback must run after shutdown completes, and the lifecycle processor waits within a configured phase budget. The supplied guide states a **30-second default per phase**. That is a captured documentation claim; the effective version-specific default requires implementation confirmation. [S]

**Inference:** multiple phase groups can accumulate shutdown delay. A phase timeout is an observation boundary, not proof of physical release.

Regular shutdown normally stops lifecycle beans before destruction. Hot refresh or failed refresh can invoke destruction without a preceding stop; the guide also warns about destruction following exceptional bootstrap/shutdown conditions. Cleanup must therefore work independently of a successful start/stop sequence. [S]

Prototype beans receive initialization callbacks but no automatic configured destruction callbacks; clients own their cleanup. Injecting a prototype directly into a singleton supplies one instance at singleton construction, not a replacement on every use. Scoped proxies and providers offer contextual lookup, which is different from dependency-health observation or explicit replacement notification. [SS]

### Inheritance and mixins remain an evidence gap

Angular and Nest describe optional lifecycle interfaces; that does not establish automatic composition of base, override, and mixin callbacks. The supplied Spring guide explains lifecycle mechanisms but not inherited annotation discovery or overridden-method dispatch. [A][N][S]

Do not qualify “all inherited hooks run” from these documents. For our proposed seam, use explicit callback composition and registration. Base and derived helpers may each register their owned obligation; never depend on reflective discovery or implicit chaining. Confirm framework behavior through the relay requests below before publishing framework-specific guarantees.

## Separate the events before selecting hooks

The following are **proposed distinctions**, consistent with the owner contract and Get Modular’s separation of construction, readiness, lifecycle, and cleanup. [G][O][K]

| Event | Owner and expected behavior |
| --- | --- |
| Dependency identity changes | Explicit composition/replacement decision. Existing references do not silently change or replay work. |
| Dependency becomes unavailable | Adapter health event with local product policy; no blanket tree destruction. |
| Configuration value changes | Named, typed configuration operation for affected consumers. |
| Module-owned state changes | Ordinary module operations; no graph-wide lifecycle notification. |
| Construction completes | Capability exists; publication still requires the applicable readiness proof. |
| Cleanup completes | Effect owner observes release; unresolved work remains reachable with required dependencies retained. |

An ownership tree and a dependency graph also differ. A child may need a parent resource during cleanup; a sibling borrower may extend that resource’s required lifetime. Reverse traversal alone cannot prove safe release. [G][O]

## Three bounded options

Scores are design judgment: confidence and reliability increase with the number; complexity increases with the number. LOC estimates are **incremental prospective changes beyond the existing resource proposal**, with roughly ×2 uncertainty. Nothing is authorized for implementation here.

| Option | Confidence /10 | Reliability /10 | Complexity /10 | Production LOC | Test LOC | Docs LOC |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **1. Explicit factories plus optional setup/cleanup** | 9 | 8 | 2 | 0–60 | 120–220 | 60–100 |
| **2. Explicit readiness/start and cooperative stop in one TEST Host** | 8 | 8 | 4 | 100–200 | 250–450 | 100–160 |
| **3. Typed configuration changes for one fixed consumer set** | 7 | 7 | 5 | 140–260 | 300–550 | 110–180 |

### Option 1 — recommended default

Keep `module.resources.setup({ setup, cleanup })` instance-local and optional. Await required setup inside existing factories. Pure and borrow-only modules have no dummy hooks.

Each fallible setup needs a strong attempt owner before execution. Partial acquisition, late completion, and unresolved cleanup retain custody. Normal parent cleanup waits for dependent work and required child cleanup. This remains the resource-plan lane; the research adds no lifecycle dispatcher.

This option fits static service hierarchies whose readiness can be completed during bounded construction. Its limitation is services that must be assembled first and started afterward.

### Option 2 — conditional readiness experiment

Justification: one background consumer needs fully assembled dependencies before starting, and readiness requires a real adapter handshake.

Use one consumer-owned interface with explicit `start(): Promise<void>` and `stop(): Promise<void>` operations. The TEST Host invokes it directly; Core/Assembly discover or invoke no hooks.

Specify:

- `constructed → starting → ready` only after the readiness promise fulfills;
- start failure preserves its original cause and partial-resource recovery owner;
- closing prevents publication and new ordinary work;
- late start success becomes cleanup responsibility;
- stop closes ordinary admission and drains the selected work before release;
- destruction remains possible after failed start;
- concurrent shutdown observers join one physical action;
- deadlines leave the action and prerequisites retained.

Use only known dependency relationships in the slice. Reject unsupported cycles and overlapping cleanup relationships. No global phase numbers, automatic restart, callback registry, or framework-method scanning.

### Option 3 — conditional configuration experiment

Justification: a named setting must change without replacing the module’s dependency identity.

Expose a normal typed operation such as `applyConfig({ expectedRevision, next })`. Limit the first slice to synchronous, side-effect-free validation and snapshot replacement. Reject stale revisions, recursive updates, and updates after closing. Validation failure preserves the previous snapshot.

Notify only explicitly participating consumers. Resource replacement, dependency rebinding, asynchronous effect reconciliation, and global change detection are outside this option.

This captures the useful explicit-input aspect of `ngOnChanges` without adopting a general reactive lifecycle runtime.

## Future rejecting evidence and acceptance boundary

These are **future checks**, not executed tests.

| Observable regression | Evidence that must reject it |
| --- | --- |
| Capability publishes before readiness | Hold the adapter handshake pending; externally observable calls/publication remain zero. |
| Failed or late setup loses custody | Allocate a disposable resource before failure/closing; its recovery owner remains reachable and late success never publishes. |
| Shutdown releases prerequisites early | Child cleanup performs a real managed operation through the parent’s private shutdown path before parent release. |
| Deadline or duplicate observers change physical cleanup | Observe one cleanup action; timeout retains its raw flight and unresolved responsibility. |
| Explicit composition skips or duplicates cleanup | Base/derived/helper fixtures own distinct disposable resources; each closes exactly once. |
| Configuration creates broad notification storms | A synthetic 500-module hierarchy with three participants observes only the declared recipients and no extra acquisitions. |
| Stale configuration overwrites current state | Submit an outdated revision; externally observed current configuration remains unchanged. |

The 500-module fixture would establish bounded observable behavior, not throughput or latency qualification.

The supplied TEST consumer already lists `pnpm typecheck` and `pnpm test`; new fixtures must be connected before those commands can prove this proposal. Any later repository implementation must also use its applicable changed, fast, and full gates. No commands were executed here.

Acceptance requires a demonstrated use case, an explicit failure/ownership contract, rejecting behavioral evidence, and removal of unjustified machinery. Options 2 and 3 remain separate experiments; neither is merged into the resource implementation plan.

## Authority, compatibility, and rollback

The supplied Consumer Module Standard keeps Core/Assembly pure and distinguishes construction success from readiness. ADR-0028 admits conditional bookkeeping without callbacks; ADR-0029 admits a synchronous kernel without promises, physical resources, or product-code execution. A shared callback surface therefore needs a new explicit admission/successor decision. **G1 remains hold; K1 remains pending.** [G][O][K]

Read-only comparison found the local passive CMS pin at `ac49bb3374946330ec820591f8195a22d2c90900`; supplied current bytes add dynamic-candidate guidance. Before future shared behavior changes, review that delta and migrate affected pins, guidance, profiles, and rejecting checks together. No migration occurred here.

Preserve existing factories and passive consumers. Rollback removes only the experimental TEST integration after its owned work settles; unresolved owners cannot be discarded to complete rollback. No production adoption, dynamic loading, durable recovery, or general hooks runtime follows from this research.

**Worker changes:** none. No source/scratch writes, Git actions, builds, tests, installs, or agent/runtime flows. Owner-requested execution profile: `gpt-6.1-sol`, `max`, `serviceTier: default`, fast disabled; effective backend settings were not independently attested. Research elapsed approximately nine minutes.

## Primary-source gaps and relay requests

Requests are inline under report-only ownership. These URLs are **requested sources, not inspected evidence**.

- https://angular.dev/guide/components/inheritance — Establish inherited hook behavior, overriding, explicit `super` requirements, and mixin limitations.
- https://angular.dev/api/core/DestroyRef — Establish component versus injector/service lifetime, callback registration/removal, and destruction guarantees.
- https://github.com/angular/angular/blob/main/packages/core/src/render3/hooks.ts — Supply the full commit corresponding to the captured release; establish promise handling, exceptions, and inherited-method dispatch.
- https://github.com/nestjs/nest/blob/master/packages/core/hooks/on-module-init.hook.ts — Pin runtime source; establish intra-module concurrency, inheritance/transient handling, and initialization rejection behavior.
- https://github.com/nestjs/nest/blob/master/packages/core/hooks/on-module-destroy.hook.ts — Establish which destroy handlers run after another rejects.
- https://github.com/nestjs/nest/blob/master/packages/core/nest-application-context.ts — Establish actual shutdown traversal, error handling, connection closure, and repeated-close behavior.
- https://github.com/spring-projects/spring-framework/blob/v7.0.9/spring-context/src/main/java/org/springframework/context/support/DefaultLifecycleProcessor.java — Resolve to a full commit; verify phase waits/defaults, failed startup, stop exceptions, and timeout continuation.
- https://github.com/spring-projects/spring-framework/blob/v7.0.9/spring-beans/src/main/java/org/springframework/beans/factory/annotation/InitDestroyAnnotationBeanPostProcessor.java — Verify inherited annotations, overridden methods, callback ordering, and exceptions.

[A]: https://angular.dev/guide/components/lifecycle
[N]: https://github.com/nestjs/docs.nestjs.com/blob/cc4542f80d03a9f78cb255a1c11812becb2a50f7/content/fundamentals/lifecycle-events.md
[NS]: https://github.com/nestjs/docs.nestjs.com/blob/cc4542f80d03a9f78cb255a1c11812becb2a50f7/content/fundamentals/provider-scopes.md
[S]: https://docs.spring.io/spring-framework/reference/core/beans/factory-nature.html
[SS]: https://docs.spring.io/spring-framework/reference/core/beans/factory-scopes.html
[G]: https://github.com/agent-teams-ai/get-modular/blob/9c722ceff4ede307d06d7a4b63fdebe615f54c53/docs/architecture/common-assembly.md#consumer-module-standard
[O]: https://github.com/agent-teams-ai/get-modular/blob/9c722ceff4ede307d06d7a4b63fdebe615f54c53/docs/decisions/0028-authorize-the-optional-ownership-contract-checkpoint.md
[K]: https://github.com/agent-teams-ai/get-modular/blob/9c722ceff4ede307d06d7a4b63fdebe615f54c53/docs/decisions/0029-admit-an-optional-lifecycle-kernel-candidate.md
