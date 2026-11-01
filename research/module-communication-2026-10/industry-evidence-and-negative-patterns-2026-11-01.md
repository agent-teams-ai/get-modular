# Industry evidence and negative patterns for module communication

<!-- cspell:words RxJS Wonka PubSub EventTarget EventEmitter AsyncIterable Modulith Kibana EventBus Typed EventTarget -->
<!-- cspell:ignore backpressure fanout -->

**Review date:** 2026-11-01. **Status:** research evidence, not a standard,
accepted decision, released feature, or new API. Read the existing
[practice catalog](raw/practices/practices-catalog-v2.md) first.
This document adds currently verified cases and boundary tests, rather than
copying that large catalog. For binding rules, the
[Consumer Module Standard](../../docs/architecture/common-assembly.md#consumer-module-standard)
always wins.

**Source snapshots:** Get Modular PR #213 at
[24cf56ad](https://github.com/agent-teams-ai/get-modular/commit/24cf56ad4363168aaff3ab0bbfb648b2514c5f03);
Payments main at
[7052c0e](https://github.com/agent-teams-ai/payments-sdk/commit/7052c0e25ef4e145d555192806ba9c695d8a5ace).
Public framework documentation was checked on 2026-11-01. It is linked as
live vendor documentation where no fixed Git revision was available. This
review did not run a real RxJS or Wonka installation, a browser workload, or
a high-concurrency benchmark.

## 1. What industry experience actually establishes

| System and first-party source | Verified practice or warning | Appropriate lesson for Get Modular | Tempting but invalid conclusion |
| --- | --- | --- | --- |
| [VS Code event API](https://code.visualstudio.com/api/references/vscode-api) | A typed `Event<T>` exposes subscription and returns a disposer; the emitter owns `fire` and `dispose`. Its documented `fire` contract does not fail on a listener exception. | Separate publication from a receiver's read-only notification right. Keep ownership visible. | That every `EventTarget`, RxJS source or callback adapter automatically isolates failures identically. |
| [VS Code subscription leaks, issue #214234](https://github.com/microsoft/vscode/issues/214234) | Maintainers identified listeners whose disposer was lost and therefore could not be called. | Scope ownership and the failure-before-disposer race deserve executable tests, not advice alone. | A zero-leak assertion is equivalent to proof that async work physically ended. |
| [Guava: Avoid EventBus](https://github.com/google/guava/wiki/EventBusExplained) | Maintainers discourage the global style: cross-references are hard to find, reentrant behavior is surprising, failure and capacity policies are weak. | Keep explicit slots and named source capabilities. Require a visible provider-consumer edge. | Every event is bad or that a one-process application always needs an asynchronous queue. |
| [Kibana plugin boundaries](https://www.elastic.co/docs/extend/kibana/key-concepts/platform-architecture/plugins-packages-and-the-platform) and [plugin contracts](https://www.elastic.co/docs/extend/kibana/key-concepts/platform-architecture/anatomy-of-a-plugin) | Stateful services belong to an owned plugin lifecycle, other-plugin dependencies are declared. Packages can be used for imports that consumers select. Simply moving code into a package does not guarantee less loaded code. | Keep event implementations behind optional imports/ports; a separate package is only the physical boundary, not an installation guarantee. | That `Assembly` selecting only one provider proves the unused package was never imported or bundled. |
| [Spring Modulith structure checks](https://docs.spring.io/spring-modulith/reference/verification.html) | Verifies an acyclic module graph, access only through published interfaces and optional declared dependency rules. | Keep Core graph checking and cross-boundary source rules first-class. | That a dependency DAG makes event-triggered command cycles impossible at run time. |
| [Spring Modulith events and registry](https://docs.spring.io/spring-modulith/reference/events.html) | Synchronous listeners can widen business transactions; async after-commit delivery risks loss. An optional transaction-backed publication registry tracks listener progress, retry and recovery. | Separate live in-process hints from durable domain obligations and from transaction authority. Let the storage owner select infrastructure. | That `publish()` into an in-memory stream proves a payment is processed or will survive restart. |
| [Effect Queue](https://effect.website/docs/v4/concurrency/queue), [PubSub](https://effect.website/docs/v4/concurrency/pubsub) and [Layer](https://effect.website/docs/v4/requirements-management/layers) | Queue distributes to one receiver; PubSub broadcasts to current subscribers and scoped subscriptions; Layer builds dependency graphs. Bounded broadcast can slow all publishers for one slow subscriber. | Name the expected delivery mode explicitly; use the consumer's chosen execution library. Recognize Effect as a real modular system, not just a service locator. | That copying Effect's queue and worker runtime belongs in Get Modular Core or that bounded broadcast isolates slow subscribers. |
| [RxJS Observable guide](https://rxjs.dev/guide/observable) | For a cold Observable, subscribing starts independent execution and side effects for that subscriber. | Decide cold versus hot before adapting a source. If several listeners must share one operation, an adapter must provide or demand that semantics. | That `subscribe(next)` means shared, already-running event notifications across libraries. |
| [RxJS concatMap](https://github.com/ReactiveX/rxjs/blob/e5351d02e225e275ac0e497c7b66eaa5f0c88791/src/internal/operators/concatMap.ts#L24-L40) | It processes inner observables sequentially but may accumulate an unlimited pending buffer when the producer outruns it. | Bound the admission point and outstanding work as needed; an operator name is not a capacity guarantee. | That setting concurrency to one proves bounded memory or accepted work. |
| [Node EventEmitter](https://nodejs.org/api/events.html) and [events.on](https://nodejs.org/api/events.html#eventsonemitter-eventname-options) | Sync listeners run in call order; async listener rejections need explicit handling. The async iterator defaults to a huge high-water mark, and pause/resume needs a source with those operations. | Do not treat `for await` or `async` callbacks as an implicit drain, error port or producer admission gate. | That async iteration automatically handles overload for a hot push source. |
| [WHATWG Streams Standard](https://streams.spec.whatwg.org/) | `desiredSize` and `pipeTo` transmit demand across cooperative stages; an underlying source must honor that signal. A push source that cannot pause may still accumulate data. | Native streams are useful and usually need no extra library, but source admission remains its owner's responsibility. | That wrapping a hot emitter in `ReadableStream` gives back pressure to an unstoppable producer. |
| [EventTarget dispatchEvent](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/dispatchEvent) | Exceptions from handlers are reported as uncaught and do not propagate to the `dispatchEvent` caller. | A structural adapter must document actual exception behavior. Failure isolation is provider-specific. | That `dispatchEvent` gives the caller a reliable listener success or processing receipt. |
| [React useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore) | UI integration requires a stable `subscribe`, an immutable cached snapshot, and often a server snapshot. | A React-facing adapter for Observation should be consumer-owned and meet the UI contract. | That a plain occurrence event is a correct substitute for a coherent state snapshot, or that Get Modular needs to import React. |
| [GitLab on hidden callbacks](https://docs.gitlab.com/development/backend/ruby_style_guide/) | Large implicit callback networks are difficult to change and test, and can slow unrelated operations. | Prefer direct commands for one owner; reserve notifications for independent reactions. | That broad event publication is always more decoupled than a direct typed call. |

These sources represent **different choices**, not a single industry consensus.
Spring Modulith deliberately elevates domain events, whereas Guava discourages
its old bus. Their actual conflict is about **semantics and ownership**:
transactional domain publication is not a global anonymous bus, and neither is
a generic stream of transient values.

## 2. Negative-pattern register: avoid these in new modules

Each row is a review rule for the specific stated scenario. This is a research
checklist, **not** a new compiler or static policy. Only promote it to a
normative check after a concrete regression and the repository's normal
decision process.

| # | Pattern to avoid | How it can fail | Existing alternative / owner | Failure-focused proof if adopted |
| --- | --- | --- | --- | --- |
| N01 | Global singleton `publish(topic: string)` / wildcard subscriptions | Hides graph edges, leaks cross-module ownership, hard to locate and review | A named typed capability and declared required slot; Host binding | Remove provider: compilation/preparation must reject rather than silently losing messages |
| N02 | Treat an event as a command and assume somebody will act | Caller has no typed acceptance/rejection or known single owner | Direct command port for one owner; stream only for independent reactions | Command failure is visible to caller without guessing listener count |
| N03 | Encode every occurrence as a state update or growing state array | Observation intentionally merges revisions; state history grows without bound | Live event or durable operation contract, selected by occurrence and recovery needs | Two identical occurrences remain distinct in the chosen delivery contract |
| N04 | Subscribe before entering a resource scope, then register the disposer | Reentrant close can reject the registration and strand the subscription | Use existing `resources.setup`; source rolls back if acquisition throws without returning a disposer | Close synchronously inside `subscribe`, then assert zero attached listeners |
| N05 | Subscriber closes a shared publisher | Breaks peers, permits unauthorized lifetime changes | Subscriber owns only its unsubscribe; provider/Host owns source | Closing subscriber A leaves subscriber B fully usable |
| N06 | Assume unsubscribe cancels already running I/O | A callback may have launched an uncooperative promise | Operation owner retains physical work until it settles; Host retains dependencies | Abort and close while one external task ignores cancellation; no premature release |
| N07 | Pass `async` listeners as plain callbacks and ignore their results | Rejected promises can become unhandled and detach work from close | Sync listener or admitted async command with explicit error and drain protocol | Throw and reject separately; prove one failure does not silently disappear |
| N08 | Swallow listener error and claim success | Misses business failure and produces false completion evidence | Source's specified error policy; explicit result for commands | Throw from one consumer; check error report and sibling behavior |
| N09 | Assume two different `subscribe(next)` APIs have identical meaning | Cold sources can start new work for each subscriber; one may be hot, multicast, or finite | Per-library adapter under a domain-specific port and contract | Subscribe two receivers; assert expected source execution count and teardown |
| N10 | Convert to `for await` and assume bounded admission | Hot producer may ignore demand and accumulate pending values | Producer-controlled flow, or a bounded mechanism chosen by its work owner | Produce faster than consume; observe queued items and waiting producers |
| N11 | Use `concatMap`, `switchMap`, `debounce` or replay as universal fixes | Sequential buffering may be unlimited; cancellation may be logical only; dropping/replaying can change event meaning | Choose operators according to domain semantics | Slow consumer, repeated duplicate events, external work ignoring abort, subscriber reconnect |
| N12 | Share one queue between independent subscribers without stating mode | Queue distributes one item to one worker, not every subscriber | Choose one-consumer work distribution or multicast notification explicitly | Both subscribers see every event when broadcast is promised |
| N13 | Use a bounded buffer and claim bounded total memory | Waiting publishers, active I/O and payload sizes remain unbounded | Bound each relevant quantity at the admission owner | Count buffer, admitted work, waiting producers and retained bytes separately |
| N14 | Broadcast with one slow consumer and promise every other consumer stays fast | Shared back pressure may stall publishers and peers | Explicit slow-subscriber policy or independent queues when needed | One subscriber blocks; measure specified policy of other subscribers |
| N15 | Emit during module factory construction as an implicit readiness signal | Consumer may not be subscribed, ready or published by Host yet | Build inertly; Host publishes readiness and opens traffic after successful construction | Producer starts before subscriber: no false ready or silent required obligation |
| N16 | Treat a successful `emit` as durable business acceptance | Process may crash after emit and before work is retained | Domain-owned transaction, acknowledgement and recovery; payment store remains authoritative | Crash after commit, before dispatch, before receipt, and during retry |
| N17 | Treat a static module dependency DAG as proof of no runtime feedback loop | Event handler can call a command that emits another event back across declared edges | Design runtime causal flow and use state echo guards only where guaranteed | Reentrant and timer/IO-crossing cycles; prove finite termination |
| N18 | Treat a read-only TypeScript interface as security isolation | Untrusted code can still hold leaked references and perform malicious runtime behavior | Host-enforced process/isolation boundary; least authority and narrow data-only messages | Untrusted extension cannot access another tenant's publisher or mutate privileged state |
| N19 | Put tenant, plugin generation or mutable runtime state in imported singletons | Cross-instance leakage, wrong cleanup owner, stale subscriptions on replacement | Per-run scope and inputs; Host owns instance identity and retirement | Run two instances/tenants and retire one; verify the other keeps operating |
| N20 | Use the composition plan digest as the sole cache key for executable factory sets | Same graph can be backed by different factory implementations | Host key includes plan digest **and** factory-set identity | Two equivalent graphs with different selected implementation factories do not share an unintended instance |
| N21 | Force an optional library through a shared barrel, required peer or top-level import | Unselected code can still be loaded, installed or bundled | Separate consumer-owned entrypoints and optional package boundaries | A clean install, cold import and build with the optional package absent |
| N22 | Equate 1000 typed declarations with 1000 live agents/streams | Does not exercise memory, fanout, active async work or shutdown | Real Host workload and clearly scoped measurements | Representative live run with events, teardown and actual memory and latency evidence |
| N23 | Copy a framework's full runtime because it has more features | Creates a second scheduler, lifecycle authority, dependency model and upgrade burden | Keep Get Modular on composition; connect chosen runtime behind capabilities | Core/Assembly and ordinary consumers import without Effect or another event dependency |
| N24 | Fake a green check by running nested tests with an inherited test context | Test process can report zero without executing named child cases | Existing executable documentation harness checks every named result and no skips | Restore the old runner form and show the regression fails |

The historically broad catalog already analyzes failures in Kibana, Guava-like
buses, Fabric, Home Assistant, GitLab, Godot, Theia and many others. The rows
above add **concrete gates for this delivery** and reuse that catalog; they are
not a new package standard.

## 3. Two important distinctions for future authors

### Acyclic composition is not a runtime flow guarantee

A typical valid dependency graph may contain a source capability from module
A to module B and a command capability from module B to module A only if those
ports are supplied through an acyclic composition of specific owners. That
does not prevent a callback from calling a command which publishes again. The
module compiler validates **declarations and construction**; it does not
observe every future execution path. Observation can detect selected local
echo/cascade patterns, but cross-source event cycles, timer crossings and
external I/O have different guarantees.

### A shared shape is not a shared semantic contract

`subscribe(next) -> unsubscribe` describes only how a listener is attached
and removed. It does not specify source temperature, error propagation,
finite completion, replay, scheduling, ordering, back pressure, fanout,
business acceptance or completion. If a consumer needs one of those
guarantees, put it in the **consumer's own port contract** and qualify the
chosen adapter. Do not make a universal base interface with dozens of
optional methods to cover every possible library.

## 4. Scope statement

**Do in Get Modular:** compile explicit dependencies, preserve module and
resource custody contracts, document narrow event source seams and prove
existing examples in ordinary CI. Keep runtime packages optional.

**Do in the consumer or Host:** select the real stream or delivery library,
admit work, control load, retain accepted operations, manage ready state,
observe and finish active work, own transport, authorization, retries and
shutdown policy.

**Do not yet build:** a new `createEvent` runtime, general broker, work
scheduler, operator collection, event registry, global trace backend,
parallel DAG executor or cross-process delivery. Each needs a named
consumer and a new separately reviewed scope.

**Fresh production changes in this research:** none.
