# Qualification plan: 1024 live scoped module instances

<!-- cspell:words Modulith -->

**Date:** 2026-11-01
**Status:** proposed E2E qualification; no public API change or new runtime.
**Starting source:** Get Modular `main` at
[`d4e3618`](https://github.com/agent-teams-ai/get-modular/commit/d4e361819dc744bf805286bffb6403ca2db77e15).

## Why this is the highest-value narrow change

Get Modular already type-checks hundreds of distinct module entries and
probes 1000 type-level fragments. Assembly also qualifies 64 concurrent
input-bearing runs, while PR #213 qualifies a small number of
resource-scoped external event subscribers. None of these alone demonstrates
**1024 simultaneously live independent Assembly runs** with owned event
subscriptions and a common borrowed provider.

The user needs large-scale *modularity* in applications with many independent
agents, not an embedded general-purpose event transport. This plan tests
the existing composition/lifetime seam and makes no throughput superiority
claim against other frameworks.

## Scope boundaries

- **Core/Assembly:** deterministic contracts, immutable composition and
  provider selection, once prepared for repeated runs. No hidden registry.
- **Resources:** each live run has its own scope, with its own subscription
  acquired through `resources.setup`. Closing one run releases only its
  subscription and never the shared source.
- **Host/consumer:** creates the run scopes, chooses external input sources,
  closes scopes and decides business readiness. The host owns any async
  operations that a callback may start; this test uses synchronous callbacks
  only.
- **Outside this change:** event bus, event operators, retries, persistence,
  parallel DAG construction, process supervision, production scaling claims,
  browser parity, and a new runtime/peer dependency.

## Industry experience and rejected approaches

| Option | Benefit | Critical concern | Decision |
| --- | --- | --- | --- |
| **1. Single prepared template and per-run Resources, measured by an E2E correctness test** | Exercises existing explicit composition and cleanup, no new production code | Proves correctness of a fixed test workload, not resource envelope or unlimited production capacity | **Implement** |
| 2. Create an optional general `createEvent/emit/subscribe` leaf first | Could give consumers one standard emitter | The first real consumer has not qualified its broadcast, error, ordering or overload contract | Defer to a separate decision |
| 3. Import Effect/RxJS or build a scheduler into Assembly | Rich operators and execution | Adds mandatory dependency and another execution authority; operator composition is not resource custody | Reject for this scope |

Industry lessons: VS Code's typed event surface separates publication from
subscriber disposer; Guava discourages global buses because cross-references
and reentrancy are obscured; Spring Modulith verifies module structure
separately from its durable transactional publication registry; Effect
separates queues and multicast. Do not copy unrelated framework facilities
to satisfy one missing proof.

Read:

- [Existing 1000-type cost tests](../../tests/assembly/type-scale.test.mjs)
- [Existing concurrent inputs tests](../../tests/assembly/inputs.test.mjs)
- [Accepted Resources boundary](../../packages/resources/README.md)
- [Consumer Module Standard](../../docs/architecture/common-assembly.md)
- [System boundary](../../docs/architecture/system-boundary.md)
- [Prior optional event qualification PR #213](https://github.com/agent-teams-ai/get-modular/pull/213)
- [Guava's own EventBus caution](https://github.com/google/guava/wiki/EventBusExplained)
- [VS Code typed Event](https://code.visualstudio.com/api/references/vscode-api)
- [Spring Modulith event registry](https://docs.spring.io/spring-modulith/reference/events.html)

## E2E design

Add one `.ts` test in `tests/assembly/`, included in the existing strict
`tests/tsconfig.assembly-tooling.json` and normal `assembly:test` glob.

1. Declare a typed source port and a distinct consumer port. Supply the
   source through an Assembly **input entry**; one immutable prepared template
   builds consumers in separate runs. No global registry or module-local
   reference to another tenant.
2. Reserve **1024** run scopes synchronously before awaiting any factory,
   and run each with a typed input from source A or B (512 per source).
3. Use the same consumer factory for all runs. Acquire its subscription via
   `resources.setup`; check `signal` before acquiring and before listener
   effects. Keep the provider read-only and borrowed.
4. Publish two **identical occurrence values** on A, one on B. Assert only
   the appropriate recipients observed each value and that duplicates did
   not coalesce.
5. Close a deterministic half of the runs for each source and assert
   `CloseReport.complete && settled`, 512 remaining subscriptions, and
   no callback effects on closed instances. Publish another event to each
   source; remaining consumers must still receive it.
6. Close the remaining runs and assert no attached subscriptions, no
   duplicate disposer calls and no new effects on already closed consumers.
   Repeated close must report complete; borrowed emitters are not closed.
7. Repeat in a second **fresh** prepared run cohort (smaller is sufficient)
   to ensure no stale subscription survives an entire lifecycle.

The only live work is per-run event subscriptions; this is deliberately **not**
a test of async work admission, broker delivery, throughput or memory bounds.

## Adversarial plan review before code

Three analysis passes, with conflicting objectives. These are **critical
perspectives, not independent model or subagent executions**. Seek a separate
GitHub reviewer for the actual diff.

- **Architecture critic:** Is a new production API/package necessary? No:
  declared input and scoped adapter already exist. A global bus would
  destroy explicit graph information. Keep the proof in a test.
- **Correctness critic:** Large Promise.all waves can mask incomplete
  cleanup and tests may assert a counter without proving unique instances.
  Record each independent root, reserve all scopes before awaits, assert
  exact listener counts, close reports and distinct sources. Use try/finally
  to close every scope even on assertion failure. Do not rely on timers,
  sleeps or an approximate event count.
- **Maintainability/performance critic:** An arbitrary 1024 receiver test can
  inflate CI and be mistaken for a benchmark. Use three small synchronous
  occurrences per source and bounded arrays; do not assert wall-clock or
  allocate a new generic queue. Report the exact fixed cohort only.
- **Counter-critique:** One source may not represent a real tenant boundary.
  Bind two independent emitter instances through each run's declared input
  to prove that the exact same compiled consumer cannot cross channels.
  One successful test does not prove process isolation of untrusted code.

The chosen plan was narrowed after these passes: no new API, no new library,
no benchmark threshold, no 1000-module construction graph. The test
checks 1024 **live runs**, not 1024 distinct declarations.

## Acceptance and stop conditions

- All new tests run under the existing Assembly test command and pass strict
  TypeScript checking. Existing tests remain unchanged.
- A simple mutation control (e.g., omit the subscription cleanup, or share
  source A across all runs) must fail the new leak/isolation assertions.
  The control is local evidence, not committed broken code.
- The full repository CI, on the exact source SHA after fixes, must pass.
  Independent ReviewRouter findings are addressed.
- A required `commit-author-identity` **failure blocks merge** even when
  the functional suite is green. The old base `pull_request_target` caller
  still rejects the approved author alias on previous PRs; do not disable or
  bypass it. Review draft #221 as a separate, authorized CI repair.
- No changes to accepted ADRs, production packages, peer dependencies,
  release profile, CI protections, or domain delivery semantics.
- If a test fails from a real existing runtime bug, reproduce the smallest
  case and explicitly review its scope before changing production behavior.
