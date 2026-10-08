# @get-modular/resources

Ordered, cooperative cleanup scopes for module instances. A module registers
how to release what it acquired; the Host decides when a scope closes, how long
to wait, when to escalate or abandon, whether to retry and how to report
health. [ADR-0030](https://github.com/agent-teams-ai/get-modular/blob/main/docs/decisions/0030-admit-the-module-resource-scope-package.md)
admits the package. Core and Assembly do not import it, and pure or
borrow-only modules need nothing from it.

A scope is cooperative cleanup of trusted in-process code. `complete: true`
means that every registered cleanup callback returned without throwing; it is
not proof of physical release. Never assemble third-party or untrusted code
through `scoped()`: run it in a runtime the Host can terminate and register
that runtime as one `setup`/`cleanup` entry in a Host scope.

## Install

```sh
npm install @get-modular/resources
```

Supported Node.js: `>=24.18.0 <25 || >=26.10.0 <27`. The package has no
runtime dependencies. A Host loads exactly one copy of it; module packages list
Get Modular packages only in `peerDependencies` with a range of one 0.x minor,
such as `^0.1.0`.

TypeScript consumers need `AbortSignal`, `Disposable` and `AsyncDisposable`:
either `lib` with `ES2024`, `ESNext.Disposable` and `DOM`, or `@types/node`.

## A module

```ts
import type { ModuleContext } from "@get-modular/resources";

export async function createOrders(deps: { db: Db }, { resources }: ModuleContext) {
  const conn = await resources.setup({
    name: "conn",
    setup: ({ signal }) => connect(deps.db, { signal }),
    cleanup: (c, { escalate }) => (escalate.aborted ? c.destroy() : c.close()),
  });
  return { instance: conn, capabilities: { "acme/orders": createOrdersPort(conn) } };
}
```

The Host wraps the factory with `scoped(implementationId, factory)` when it
binds it, and passes one scope per run:
`prepared.run({ signal, scope: attempt.resources })` with Assembly 0.3.0 or
later. Pass `scope.resources`, never the `Scope` itself.

## The two facets

`createScope({ name })` returns `{ resources, control }`.

- `resources` registers: `setup`, `use`, `child` and `signal`. Modules receive
  only this facet.
- `control` closes: `close(options)` and `Symbol.asyncDispose`. Whoever holds
  it owns the scope; transfer ownership by transferring `control`.

Every scope and entry has an explicit, non-empty name. Names form the debt
paths that Hosts alert on.

## Registration and release

- `setup({ name, setup, cleanup })` calls `setup({ signal })` at once. The value
  takes its release slot when the setup fulfils. `signal` stops acquisition: it
  aborts when the scope or an ancestor starts closing, or when the run that
  constructs the module is cancelled.
- `use(value, name)` registers a value already in hand that implements
  `Symbol.asyncDispose` or `Symbol.dispose`. Its `then` method is never read,
  and the result of a synchronous `Symbol.dispose` is not awaited.
- `child({ name, order })` opens a nested scope that takes its slot when it is
  created. `order: "concurrent"` releases its entries together; use it only for
  independent peers such as sessions. Everything else releases in reverse
  order, one cleanup at a time.
- After a close is requested nothing new is accepted: `setup` rejects without
  calling its callback, `use` throws and the value stays with the caller, and
  `child` throws. Acquire asynchronously only inside `setup`.
- Close waits for started setups, then releases. A failed cleanup is recorded
  as a debt with its original cause and release continues.

## Closing

`close({ escalate, abandon })` never rejects. Invalid options throw a coded
`TypeError` synchronously before any state change.

- One close flight per scope. Repeated `close()` calls join it. A call after it
  completed with debts retries the failed entries, so a cleanup that must not
  run twice guards itself.
- `cleanup` receives `{ escalate }`. Aborting the `escalate` signal you passed
  to `close` asks every cleanup of the current flight of the subtree to release
  faster. It never permits skipping a release.
- `abandon` ends only the waiting of the caller that passed it. That caller
  receives a snapshot with `settled: false`; the flight continues in order and
  every other waiter, including the parent, keeps waiting. Abandon never means
  released.
- `CloseReport` is `{ complete, settled, debts }`. A debt is
  `{ path, state }` with state `failed`, `pending` or `not-run`; only a failed
  debt carries `cause`. `path` is an array; join it only for display.
- `await using` and `Symbol.asyncDispose` throw `CloseIncompleteError` with the
  report when it is not complete.
- A cleanup that awaits `close()` of its own or an ancestor scope deadlocks.

## Errors

Compare `code`, never classes or messages:

| Code | Thrown by |
| --- | --- |
| `resources.scope.closed` | `setup`, `use` or `child` after a close request (`ScopeClosedError`) |
| `resources.close.incomplete` | `Symbol.asyncDispose` with debts (`CloseIncompleteError`) |
| `resources.argument.invalid` | an invalid spec, name or option (`InvalidArgumentError`) |
| `resources.scoped.invalid-run-scope` | `scoped()` when the run scope is not the `resources` of a scope from this package copy |

## Adapter recipes

These recipes react to `escalate`; `use()` releases bluntly.

- Child process (POSIX): spawn with `detached: true`, send `SIGTERM` to the
  process group, send `SIGKILL` to the group when `escalate` aborts, and
  signal the group again after the leader exits so no member survives.
- `http.Server`: call `close()`; when `escalate` aborts, call
  `closeAllConnections()`.
- `Writable`: call `end()` and wait for `finish`; destroy it when `escalate`
  aborts.
- A thenable resource is wrapped: `setup: () => ({ proc: spawnProcess() })`.

The package has no timers, retries, process control or plugin manager. Those
are Host policy.
