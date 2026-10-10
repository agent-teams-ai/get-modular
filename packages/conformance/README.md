# @get-modular/conformance

Test harness and contract suites for Get Modular modules and composition roots.
A module author builds one module the way a Host builds it, smoke-checks a
composition root, and checks a contract against every implementation. A contract
owner publishes the suite beside the contract.
[ADR-0033](https://github.com/agent-teams-ai/get-modular/blob/main/docs/decisions/0033-admit-the-module-conformance-kit.md)
admits the package. It is development tooling: production code does not import
it, and Core and Assembly do not either.

The package qualifies nothing by itself. It does not qualify Core or Assembly,
it derives no expected value from the implementation under test, and it has no
oracle for bindings: the author of a test supplies the expected data.

## Install

```sh
npm install --save-dev @get-modular/conformance
```

Supported Node.js: `>=24.18.0 <25 || >=26.10.0 <27`. Core, Assembly and
resources are peer dependencies, each with a range of one 0.x minor, and nothing
else is a dependency. Your project loads one copy of each, so the `scoped()`
brand of resources matches. The package imports no test runner and no Node
built-in module.

TypeScript consumers need `AbortSignal`, `Disposable` and `AsyncDisposable`:
either `lib` with `ES2024`, `ESNext.Disposable` and `DOM`, or `@types/node`.

## Test one module with `isolate`

```ts
import { assemblyFor } from "@get-modular/assembly";
import { isolate } from "@get-modular/conformance";

await using orders = await isolate(assemblyFor<Capabilities>(), {
  declaration: ordersDeclaration,
  factory: createOrders,
  dependencies: { db: fakeDb, audit: undefined, replicas: [] },
});
orders.capabilities["acme/orders"].list();
```

`isolate` builds the module through a real Assembly run. Each dependency
becomes an input module of its own, so the module sees the same frozen
dependency record, the same product check and the same scope as in production.
Fakes are plain typed values: the compiler checks them against the contract
port. There is no override container and no automatic fake.

- `dependencies` needs an own data property for every slot of the declaration:
  a value for `required`, an array for `many`, and a value or an explicit
  `undefined` for `optional`. Getters are never called.
- The ids of the declaration must not start with `conformance/`, which is
  reserved for the generated fakes.
- A failed build rejects with `conformance.isolate.construction-failed`. There
  are three cases. When the Assembly run did not succeed, `cause` is the
  original error and `details` holds the Assembly outcome and the close report
  of the scope. When Core rejects the composition, `details.diagnostics` holds
  the diagnostics and there is no `cause`. When Assembly fails to prepare,
  `details.preparation` holds the result, `cause` is its error cause and no
  scope was opened.
- `close()` never rejects and returns the `CloseReport`. `await using` (or
  `[Symbol.asyncDispose]`) throws `resources.close.incomplete` when a cleanup
  left a debt.
- Pass `within` to open the module scope under a scope of your own, and
  `signal` to cancel the run.

## Smoke-check a composition root with `smoke`

```ts
import { smoke } from "@get-modular/conformance";

const steps = await smoke({ api: assemblyFor<Host>(), compose: composeProduction, inputs });
```

Write the production composition root as a function of Assembly and pass it as
`compose`; `smoke` calls it once. Every factory must be bound through the `api`
passed to `compose`: a factory bound elsewhere never sees an injection, so
`smoke` rejects. It then runs the prepared root without
injection, and again with a failure and an abort injected right after each
module (`inject` and `at` narrow the list). Every attempt runs in a scope of its
own that must close with `complete: true`. It rejects with
`conformance.smoke.failed` when any step broke an expectation, and
`details.steps` lists every step with its `problem`. If the first run does not succeed there is no trustworthy order to inject into, so
`smoke` rejects after it; a first run that succeeds but leaves a debt does not stop it.

What `smoke` does not prove: that the bindings are right (write an independent
oracle for that), that anything was physically released, the order of release
inside a module, and resources acquired outside `setup` and `use`. It sets no
timers: a cleanup that never settles hangs the test, and the limit belongs to
your test runner.

## Check a contract with `contractSuite` and `runContractSuite`

```ts
import { contractSuite, runContractSuite } from "@get-modular/conformance";

export const ordersSuite = contractSuite(Orders, {
  "lists orders": async orders => { assert.equal(orders.list().length, 1); },
});

runContractSuite(ordersSuite, { name: "default", declaration, create: async () => createPort() }, test);
```

`test` is any `(name, body)` registrar: `node:test`, Vitest `it`, or your own.
`runContractSuite` registers one test per case. Each case runs against a subject
made in a fresh scope, and the scope is closed afterwards. A case failure
rethrows as it is; a cleanup debt alone throws `resources.close.incomplete`;
both together throw `conformance.suite.case-failed` with the case error as
`cause` and the report in `details`.

The declaration of the subject must provide exactly the entry that
`suite.contract.provide()` returns. A suite written for another revision throws
`conformance.suite.revision-mismatch` synchronously, before any test registers.

The contract owner decides how to publish a suite and a fake. Either publish a
separate package such as `<contract>-conformance`, or export them from an entry
point of the contract package that production code does not import. The suite is
a plain value, so it carries no path and no test runner.

## Check module identities with `checkNamespaces`

```ts
import { checkNamespaces } from "@get-modular/conformance";

checkNamespaces({ namespace: "acme/orders", declarations: [ordersDeclaration, auditDeclaration] });
```

It checks rules 1, 2 and 6 of "Identity and namespaces" in the Consumer Module
Standard: `moduleId` and `implementationId` lie in `namespace` at a segment
boundary (`agent` does not cover `agent-runtime/x`), and `owner.authority`
equals the first segment of `moduleId`. It does not check `capabilityId`, which
belongs to the contract owner and may lie in another namespace, nor the history
of IDs or session IDs. Pass every declaration of the product, input modules and
fakes included.

The call is synchronous and collects every violation before it throws
`conformance.namespaces.violation`. `details.violations` lists
`{ implementationId, rule, value, expected }`, with `rule` one of `"module-id"`,
`"implementation-id"` and `"owner-authority"`. An empty namespace, a namespace
with a leading, trailing or double `/`, declarations that are not an array and a
declaration without string ids or `owner.authority` throw
`conformance.argument.invalid`. Only own data properties are read.

## Find leaked handles with `guardHandles`

```ts
import { guardHandles } from "@get-modular/conformance";

const guard = guardHandles();
// ... run the code under test ...
await guard.check();
```

`guardHandles` is a before/after count of active handle types. `check()` waits
two turns of the event loop, counts again and rejects with
`conformance.handles.leaked` when a type grew. `allow` lists types to ignore, for
example `["TCPServerWrap"]`. It reads `process.getActiveResourcesInfo()` through
`globalThis`; without it, `guardHandles` throws
`conformance.handles.unsupported-runtime`.

It is a diagnostic, not proof of release: it sees only handle types nobody
owns, not `FileHandle`, `Worker` or unreferenced timers, and with
`--test-isolation=process` it counts per file.

## Errors

Every error of this package is a `ConformanceError` with a `code`; compare the
`code`, never the class or the message. Errors of other packages pass through
unwrapped.

Functions that return a `Promise` (`isolate`, `smoke` and `HandleGuard.check`)
always reject, including for invalid arguments; `checkNamespaces`,
`contractSuite`, `runContractSuite` and `guardHandles` throw synchronously. This differs
from `@get-modular/resources`, which throws synchronously from functions that return
a `Promise`.

| Code | Meaning |
| --- | --- |
| `conformance.argument.invalid` | a call was malformed; `isolate` and `smoke` reject, the other functions throw. An unknown `at` id is found only after the first run of `smoke` |
| `conformance.isolate.construction-failed` | the module could not be built |
| `conformance.smoke.failed` | a smoke step broke an expectation |
| `conformance.namespaces.violation` | a declaration breaks a namespace rule; `details.violations` lists them all |
| `conformance.suite.revision-mismatch` | the subject provides another revision than the suite checks |
| `conformance.suite.case-failed` | a case failed and its scope also closed with debts |
| `conformance.handles.leaked` | handles opened after the guard are still active |
| `conformance.handles.unsupported-runtime` | Node diagnostics are unavailable |

## Releases

The package is 0.x. A breaking change ships as a minor release with a changelog
entry and a migration note. Every minor release of a peer is accompanied by a
minor release of this package.
