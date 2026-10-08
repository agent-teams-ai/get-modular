---
id: ADR-0030
type: adr
status: accepted
owner: architecture
approved_by: product-owner
accepted_at: 2026-10-02
summary: Admits @get-modular/resources as an optional public cleanup-scope mechanism, supersedes ADR-0028 in full and keeps cleanup authority with the Host.
related:
  - ADR-0003
  - ADR-0009
  - ADR-0012
  - ADR-0019
  - ADR-0023
  - ADR-0025
  - ADR-0026
  - ADR-0028
  - ADR-0029
  - ADR-0031
  - ADR-0032
---

# ADR-0030: Admit the module resource scope package

## Context

Modules constructed through Assembly acquire connections, subscriptions,
processes, servers and files. Get Modular gives them no shared way to release
what they acquired, so every Host writes its own cleanup stack. Agent Runtime
alone has several with different failure policies: one stops at the first
cleanup error, another continues and never retries, a creation-recovery chain
composes closures by hand, and a disposal facade can start a second cleanup
flight before the first settles. The concern is the same; the semantics differ
by accident.

ADR-0028 reserved `@get-modular/ownership` for a synchronous, callback-free
ticket contract gated on S3 -> G1 -> K1. The owner closed S3 as not delivered
on 2026-09-25 and K1 never started. A callback-free contract cannot be awaited,
nested or ordered, so every Host would still poll, order and retry by itself.

Mature systems split this concern by knowledge: a module knows how to release
its own resources; a host or supervisor decides when, how long to wait and
whether to retry (OTP supervisors, Kubernetes grace periods, .NET and Nest
containers, Effect and TC39 scopes). Get Modular serves different Hosts, so it
fits the library scope model rather than a framework that owns shutdown.

## Decision

### Package admission

Admit one optional runtime package, `@get-modular/resources` at
`packages/resources`, as an additive exception to the ADR-0003 topology, like
ADR-0023 and ADR-0029. The package owns substantive behavior: ordered,
cooperative release of resources registered by trusted module code.

- It has zero runtime dependencies and imports neither Core, Assembly, the
  lifecycle kernel, Node built-ins nor product or tooling packages. Core,
  Assembly and the lifecycle kernel do not import it.
- It exposes one root-only ESM export (ADR-0012) and one current unversioned
  API (ADR-0009). Its engines equal the supported Node range of the other
  packages.
- It owns no timers, clocks, AsyncLocalStorage, retries or process control,
  and it starts no work that a close request did not ask for. `Resources` is a
  registration facet, not a resolver; factories still receive their
  dependencies only through the closed dependency record.

### Contract

The root exports the values `createScope`, `scoped`, `ScopeClosedError`,
`CloseIncompleteError` and `InvalidArgumentError`, and the types `Scope`,
`Resources`, `ScopeControl`, `ScopeOptions`, `CloseOptions`, `CloseReport`,
`Debt`, `SetupSpec`, `SetupContext`, `CleanupContext`, `ModuleContext` and
`ResourcesErrorCode`. The package README and its rejecting tests own the exact
invariants. In summary:

- Two facets. `Resources` registers (`setup`, `use`, `child`, `signal`);
  `ScopeControl` closes (`close`, `Symbol.asyncDispose`). A module receives only
  `Resources`. Closing authority is a reference held by the creator.
- Every scope and every entry has an explicit, non-empty name, so a debt path
  never depends on registration order.
- Registration starts when `setup` is called. A value takes its release slot
  when its setup fulfils; a child takes its slot when it is created. After a
  close is requested nothing new is accepted: `setup` rejects without calling
  its callback, `use` throws and leaves the value with the caller, `child`
  throws.
- `setup` receives `{ signal }`, which stops acquisition. `cleanup` receives
  `{ escalate }`, which asks it to release faster; it never permits skipping
  the release.
- A close request reaches the whole subtree synchronously. Release waits for
  started setups, then runs one cleanup at a time in reverse order, or all
  entries together in a scope created with `order: "concurrent"` for
  independent peers. A failed cleanup is recorded as debt with its original
  cause, and release continues.
- Each scope has one close flight. Repeated `close()` calls join it; a call
  after it completed with debts retries the failed entries.
- `escalate` asks the cleanups of the current close flight of the subtree to
  release faster, including descendants that are closing on their own.
  `abandon` only ends the waiting of the caller that passed it: that caller
  receives the current report, the flight continues in order, and every other
  waiter, including the parent, keeps waiting. Nothing starts out of order and
  nothing is reported as released before its cleanup returned.
- `CloseReport` is `{ complete, settled, debts }`. `complete` means every
  registered cleanup callback returned without throwing; it is not proof of
  physical release. `settled` is false only in the snapshot that an abandoning
  caller receives while the close still runs. `Debt.path` and `Debt.state` are
  plain data; `cause` stays opaque and exists only on failed debts.
- Every error the package throws or rejects with carries a stable `code` of
  the form `resources.<area>.<reason>`. Consumers compare codes, never classes.
- No scope option lets a signal stop acquisition while the scope stays open: a
  scope ends only through `close()` of its control.
- `scoped(name, factory)` opens one child scope per factory call,
  synchronously, under the run scope that Assembly delivers as
  `FactoryContext.scope` (ADR-0031). It fails with
  `resources.scoped.invalid-run-scope` before the factory body when the run
  scope is not the `Resources` of a scope from the same package copy. The
  factory receives every other field of the Assembly context together with
  `resources`; the run scope is never forwarded. Run cancellation aborts the
  module's setups until its factory settles; the module's lifetime is not tied
  to the run signal afterwards.
- Children never subscribe to their parent's signals; attaching and detaching
  a child costs amortized constant time.

### Mechanism and authority

Get Modular provides the mechanism. A module writes how to release its own
resources. The Host decides when a scope closes, how long to wait, when to
escalate or abandon, whether to retry and how to report health. Assembly still
performs no disposal or rollback.

`docs/architecture/system-boundary.md` stays unchanged; its accepted bytes are
pinned by the authority ledger. It says Get Modular does not execute product
lifecycle and lists cleanup among Host responsibilities. That reading holds:
the package runs cleanups that trusted module code registered only as a
library call by the holder of a scope's control, as Assembly runs
Host-supplied factories only when the Host calls `run()`. Get Modular decides
no product lifecycle and holds no lifecycle or cleanup authority. This
decision and the Consumer Module Standard record that split.

### Trust

A scope is cooperative cleanup of trusted in-process code. The package cannot
revoke escaped handles or force a callback to settle. Third-party or untrusted
code is never assembled through `scoped()`. As Extension Foundation ADR-0006
requires, such code runs in a runtime the Host can terminate. That runtime is
one `setup`/`cleanup` entry in a Host scope; the README process recipe
terminates the whole process group on escalation. `Resources` is not part of
any plugin SPI. The package adds no kill, worker or plugin-manager facility;
`worker.terminate()`, `node:vm` and the Node permission model are not security
boundaries.

### Supersession

This decision supersedes ADR-0028 in full. Its C0 pseudo-contract, checkpoint
and schema stay frozen as historical evidence. The conditional
`@get-modular/ownership` identity, the K1 package and the S3 -> G1 -> K1 order
are withdrawn, and `packages/ownership` stays rejected. ADR-0028's
two-production-scope eligibility gate and A1 are withdrawn with it;
references to them in ADR-0029 and the Consumer Module Standard gate nothing.
Get Modular has one cleanup contract.

ADR-0028 keeps its accepted bytes, including its lifecycle metadata, because
its frozen C0 checkpoint authenticates the complete document. Like earlier
successors in this repository, this decision records the supersession in its
own text. It lists ADR-0028 in `related`, the decision index notes the
supersession, and this decision takes precedence wherever the two differ.

The C0 checks keep authenticating the frozen evidence and keep rejecting
`packages/ownership`. Where a check compares that evidence with the live
workspace, such as package versions, lock importers or package roots, a later
change compares it with the frozen base instead, or extends it to roots that
accepted decisions admit; it never drops the check.

ADR-0029 remains in force, including its own delivery order and release
gates. Its references to `@get-modular/ownership` as a
separate conditional cleanup-obligation contract now resolve to this decision.
Kernel custody leases and resource scopes are complementary: a dynamic Host
retains kernel custody before it creates a child scope and releases it only
after the child's report is complete. The scope is the only cleanup mechanism;
kernel custody stays admission bookkeeping.

### Publication and versioning

The package is public from 0.1.0. Versions come from Changesets in a release
pull request. Uploads follow the ordering of ADR-0019 and the bounded release
operator of ADR-0025, as for Core and Assembly; no unattended publisher is
created. Pre-1.0 breaking changes ship as minor releases with a CHANGELOG
entry and a migration note, without compatibility aliases (ADR-0009). Version
1.0.0 needs a separate decision. While G1 is on hold, the package is not
enrolled in `package.public-api-compatibility` or G1 SDK growth. Module
packages declare Get Modular packages as peer dependencies. The Host must
install one copy of this package; peer ranges surface version conflicts at
install time, and `scoped()` rejects a run scope from another copy. The
Consumer Module Standard states the packaging rules.

### Admission evidence

Admission extends the existing leaf-package checks instead of copying them:

- exact identity, root and public manifest shape;
- zero dependencies, root-only exports, no install scripts;
- no forbidden imports, including type-only edges;
- governed development output;
- non-no-op build, typecheck, test and pack commands in the fast and full gates;
- Foundation v3 `packageRoots` and the FMS layout.

The admission entry arrives in the same change as the package root and its
implementation. No entry, stub or pending root precedes them; until then the
existing checks keep rejecting `packages/resources`.

Rejecting tests cover the invariants above and a subprocess memory probe for
detached children. Typed fixtures cover TypeScript 7.0.2 and 5.8.3 with
NodeNext and Bundler resolution. A packed-root test installs the exact archive,
and the Node 26 job installs it on the supported Node 26 line.

### Non-goals

Release order derived from the composition graph, reference counting or shared
ownership, early per-entry release or `move`, durable crash recovery, hot
replacement, retry policies, a dependency-loss health contract, lifecycle
hooks, plugin managers, process or worker control and development-mode
registration stacks.

## Consequences

- Hosts share one ordered cleanup mechanism. Partial construction is released
  in reverse order without changes to Core.
- Debts are reported with stable paths instead of being logged and lost.
- Cleanup remains a promise of trusted code; untrusted code still needs Host
  isolation.
- A Host deadline never reorders release. A cleanup that never settles blocks
  the rest of its scope and the remaining entries of its ancestors until the
  process exits; process exit releases descriptors and sockets, not child
  processes or temporary files.
- Release continues past a failed entry, so an entry that a failed cleanup
  needs again on retry belongs to an outer scope that the Host closes only
  after the inner report is complete.
- A cleanup that must not run twice guards itself, because a Host may retry.
- A value passed to `use()` after close started stays with the caller, who
  must release it; asynchronous acquisition belongs in `setup`.
- Dependencies hidden outside declared slots can still break the order; the
  Consumer Module Standard and review address that, not the library.
- A new public package adds release and admission maintenance.

## Rejected alternatives

- Keep cleanup Host-only: every consumer keeps a diverging stack with its own
  failure policy, which is the observed state.
- Framework-managed shutdown in the style of NestJS or Spring: conflicts with
  Hosts that own their process lifecycle.
- Continue ADR-0028 ownership tickets: callback-free bookkeeping cannot order,
  await or nest cleanup.
- Put scopes into Core or Assembly: Core stays an inert compiler and Assembly
  stays a construction leaf without disposal.
- Capture the parent scope when factories are bound: one prepared assembly
  run twice puts both runs under the first scope, and closing one run releases
  the other's resources.
- Look up the parent scope through a map keyed by the run signal: an ambient
  registry that depends on signal identity.
- Let `abandon` stop the shared close: a waiting parent then releases entries
  below a child whose cleanup still runs (compare Effect-TS/effect #8484
  and #8512).
- Release a value passed to `use()` after close started: it either runs
  concurrently with the active cleanup or escapes the parent's report.
- A scope option `signal` that stops acquisition without closing: callers read
  it as cancellation and leak until an explicit close.
- Optional names with generated labels: debt paths would change with unrelated
  edits, and Hosts alert on those paths.
- One context type with `signal` for setup and cleanup: a cleanup written as
  `if (signal.aborted) return` would report a held resource as released.
- Mark ADR-0028 as superseded in its own metadata: that rewrites the bytes its
  frozen C0 checkpoint authenticates.
