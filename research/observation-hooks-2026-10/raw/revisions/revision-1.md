# Module lifecycle hooks: experimental research

Date: 2026-10-01. Status: five completed research reports, root synthesis.
**Experimental design advice, not an admitted hook API or implementation task.**
The [module resource proposal](shared-module-resource-contract-2026-10-01.md)
is a separate delivery. This document adds no hooks to that proposal.

## Recommendation

Keep the module **instance** as the normal owner of resources and private state.
Use optional `setup/cleanup` for owned resources. For changing inputs, start
with explicit consumer-owned ports and methods. A module observes only inputs
it selects; an unchanged dependency must not recreate its subscription.

Hundreds of modules justify selective notification and bounded work, but do not
by themselves justify a global reactive engine or mandatory lifecycle methods.
No empty `dispose`, `init` or `didChangeDependencies` is required for pure or
borrow-only modules. Factory completion is sufficient initialization for the
current resource slice; a separate readiness protocol needs a concrete user.

An optional lifecycle callback can be convenient later. Its contract must say
**what changed, whose revision changed and whether work may be repeated**.
Copying Flutter's callback names supplies none of those guarantees.

## What the industry evidence supports

Documented behavior below is sourced; the recommendation is our inference.

| System | Useful mechanism | Limit when applying it to modules |
| --- | --- | --- |
| [Flutter State](https://api.flutter.dev/flutter/widgets/State-class.html), [InheritedModel](https://api.flutter.dev/flutter/widgets/InheritedModel-class.html) | Distinct initialization, config replacement, registered inherited changes, temporary removal and terminal disposal; aspect selection. | Frame-owned synchronous traversal is not an async Host cleanup protocol. `mounted` does not prove an old request still matches current inputs. |
| [React Effects](https://react.dev/learn/lifecycle-of-reactive-effects), [useEffect](https://react.dev/reference/react/useEffect) | Setup and cleanup stay together; synchronization can restart while component state survives. | `Object.is`, stale closures and unstable object identities can cause missing or excessive synchronization. Development setup/cleanup rehearsal is not safe replay of irreversible effects. |
| [Vue watchers](https://vuejs.org/guide/essentials/watchers.html), [Svelte lifecycle](https://svelte.dev/docs/svelte/lifecycle-hooks) | Explicit sources or fine-grained effects; cleanup near the subscription. | Dependency tracking is limited to synchronous reads; an async-created Vue watcher may lack automatic component ownership. A Promise returned from Svelte `onMount` is not its cleanup callback. |
| [Angular lifecycle](https://angular.dev/guide/components/lifecycle) | Local teardown registration; hooks belong to a defined traversal. | Frequent checking and state changes during traversal introduce cost and order dependence. UI hooks do not establish service resource custody. |
| [Nest lifecycle](https://github.com/nestjs/docs.nestjs.com/blob/cc4542f80d03a9f78cb255a1c11812becb2a50f7/content/fundamentals/lifecycle-events.md), [Spring lifecycle](https://docs.spring.io/spring-framework/reference/core/beans/factory-nature.html) | Explicit awaited application phases and dependency-aware start/stop. | Application, request and object scopes differ. A phase deadline does not prove physical release; initialization and shutdown failures require separate handling. |
| [.NET DI](https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/guidelines), [IntelliJ Disposer](https://plugins.jetbrains.com/docs/intellij/disposers.html) | Consumers do not dispose injected dependencies; children clean up before their owning parent. | .NET scopes are not automatically hierarchical. An ownership tree alone cannot represent cross-branch borrowers or resources that outlive a call. |
| [OSGi DS 8.1](https://docs.osgi.org/specification/osgi.cmpn/8.1.0/service.component.html) | Explicit bind, updated properties, unbind and configuration modification; static/dynamic policy. | Dynamic changes can be concurrent; successor binding can precede old unbinding. Continuity is not exclusive replacement. Some callback failures are logged rather than rolled back. |
| [OpenClaw, exact `c3425e1d`](https://github.com/openclaw/openclaw/blob/c3425e1d7b9550c7ff36deda1c1b0fc0f97332a1/src/plugins/plugin-instance.ts) | Explicit quiescence, consumers, retained call settlement and cleanup registration. | Final module disposal can wait for timed-out calls while some cleanup callbacks start earlier. Retention and best-effort cleanup do not prove absence of native effects or unloading ESM. |

[Flutter's setState design discussion](https://api.flutter.dev/flutter/widgets/State/setState.html)
also supports an ergonomic lesson: make the action concrete rather than offer
a vague notification method that callers invoke excessively. Here that means
`updateSettings` or a selected settings subscription before a universal
`somethingChanged` hook.

## Six distinct contracts

| Event | Required information and owner |
| --- | --- |
| Configuration/value change | Immutable desired snapshot, selected fields and revision; consumer decides how to recompute. |
| Dependency replacement | Old/new provider identity and binding epoch; Host decides rebind versus reconstruction and exclusivity. |
| Dependency unavailable | Health epoch and immediate managed-port admission change; product decides degradation, stop or recovery. |
| Module state change | Instance-owned mutation and inert observation; observers gain no cleanup authority. |
| Readiness change | Capability-specific evidence; hook completion alone is not readiness. |
| Cleanup | Actual observed release or retained unresolved responsibility; a timeout or health loss is not completion. |

Do not coalesce unavailable-then-available into a harmless config notification.
Do not interpret every change as resource teardown or recursively destroy all
dependents. A child may borrow a parent's port without acquiring the right to
clean it up; cross-branch borrowers require explicit lifetime retention.

## Three options

Scores are design judgments out of 10, not measured reliability. Higher
complexity is worse. Estimates are incremental changed LOC, roughly x2 uncertain;
they exclude the resource proposal, new physical adapters and release work.
Overlapping worker estimates are not added together.

1. **Explicit ports and consumer methods - recommended now.** Keep updates local;
   introduce a typed subscription only for a concrete observed input.
   🎯 9/10   🛡️ 8/10   🧠 3/10.
   Approximately **120-240 implementation + 240-420 tests + 80-140 docs =
   440-800 lines** for one modest subscription slice. A stronger scale experiment
   below is approximately **260-460 + 420-750 + 100-180 = 780-1,390 lines**.
2. **Optional selected-change callback driver.** Explicit aspects, change frames,
   per-instance serial work and stale-result fencing. Consider only after
   repeated real cases demonstrate the same semantics.
   🎯 7/10   🛡️ 7/10   🧠 7/10.
   Approximately **700-1,200 implementation + 950-1,600 tests + 180-300 docs =
   1,830-3,100 lines**. Shared admission would be separate.
3. **Existing Effect runtime inside an already Effect-based Host.** Reuse its
   scope and state machinery through consumer-owned ports.
   🎯 7/10   🛡️ 8/10   🧠 8/10.
   Approximately **350-650 integration + 550-950 tests + 150-260 docs =
   1,050-1,860 lines**, excluding adoption cost. Not recommended as a new dependency
   for a plain-Promise Host; current version and stream semantics are not qualified.

No option is proved more reliable than the reference systems. The intended
advantage is fewer hidden contracts and explicit failure evidence.

## Conditional TEST experiment, not authorized implementation

Use a settings-derived lookup table while preserving instance counters and an
unchanged event subscription. Keep the port and source in the TEST consumer;
no new Core records, composition nodes, package or generic HookManager.

Illustrative local shape: `watchSettings(keys, onChange)` returns an initial
immutable view, a current `snapshot()` and `stop()`. The source owner atomically
installs observation and captures the initial view; callbacks are deferred.
Source identity and monotonic relevant-input revision distinguish stale work.
Related settings commit together; no cross-source/distributed atomicity claim.

One computation runs per consumer with one latest pending configuration.
Configuration snapshots may coalesce; commands and health-loss transitions may
not use that lossy channel. Before publication, compare instance admission and
the current relevant revision, not merely the last delivered notification.
Failed computation retains its cause and stale/degraded status; independent
consumers may continue. Desired and applied revisions remain distinct.

The first experiment is limited to deriving inert state. It cannot open new
resources, replace dependencies, write its own source or await its own next
notification. Existing subscription cleanup owns its stop action. This avoids
building a second async resource engine inside the hook experiment.

Suggested evidence, once separately requested:

- No missed update or mixed-version result during registration.
- In a 600-instance adversarial model, an aspect used by 12 consumers changes
  only their state; no full hierarchy scan on every notification. This is a
  behavioral model, not a benchmark or qualified maximum hierarchy depth.
- A held computation plus 1,000 snapshots retains bounded pending work and
  converges to the latest snapshot without overlapping per-instance runs.
- Old completion cannot publish after a newer input or shutdown.
- One failed computation preserves its cause without stopping an independent
  consumer. Updates preserve local counters; reconstruction has a new identity.

Resourceful async hooks are a later extension: they need an attempt owner before
callbacks, retained partial/late-resource cleanup, explicit producer stop/drain
and dependency retention. Reuse unchanged resource evidence; do not repeat it
at every layer. State-preserving reparenting, dynamic replacement, cross-source
transactions and a global reactive scheduler remain outside this experiment.

## Source corrections and proof limits

Five read-only hosted jobs completed using requested `gpt-6.1-sol max`,
`serviceTier: default`, without fast; every result has `changedFiles: []`.
The profile is recorded in manifests, not independently attested backend tier.
Each verified 38 retained input hashes. No builds, tests, installs or real
runtime/agent/provider flows ran. These are research conclusions, not passing
conformance evidence.

Native worker web search was disabled and egress limited to provider API.
Internet access was **indirect**: root fetched 26 primary HTTP pages on Oct 1,
relayed exact GitHub sources via `gh`, and inspected 13 additional exact source
files (including the TEST evidence runner). No network or credential controls were bypassed. Further uninspected
implementation questions in reports remain research limits, not evidence.

Root resolved two important stale/contradictory observations:

- AR's worker scaffold `c9b8efe4` and its `ac49bb33` standard pin are historical.
  [Current retained AR profile at `b0bcb265`](https://github.com/agent-teams-ai/agent-runtime/blob/b0bcb265d1466da3272078f9dfdb7c6784624283/architecture/get-modular/consumer-profile.json)
  pins GM `9c722cef` and CMS bytes
  `33b41d5babf0a431c97e8e596a56e6ec1557ba1a0b26d39bf23e13d9a19e1fbd`.
  PR #185's retained journal and creation-error code preserves cleanup
  uncertainty/recovery. The old bug and pin must not be reported as current.
- The captured Spring reference text says 30 seconds per shutdown phase, while
  [exact Spring 7.0.9 implementation](https://github.com/spring-projects/spring-framework/blob/82a6b40b9366ec181ededdad282b307ee5381a52/spring-context/src/main/java/org/springframework/context/support/DefaultLifecycleProcessor.java#L124)
  sets **10 seconds** and documents that default since 6.2. Use the inspected
  implementation for this fact. Neither duration proves release after timeout.

Original worker reports are preserved without rewriting those historical
claims. [Raw results and source identities](evidence/module-resource-planning-20261001/README.md)
retain their limits and these root corrections. This proposal accepts no new
ADR, closes neither G1 nor K1, and grants no public release or production adoption.
