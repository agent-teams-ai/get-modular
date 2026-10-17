# @get-modular/conformance

Test harness and contract suites for Get Modular modules and composition roots.
A module author builds one module the way a Host builds it, smoke-checks a
composition root, and checks a contract against every implementation. A contract
owner publishes the suite beside the contract.
[ADR-0033](https://github.com/agent-teams-ai/get-modular/blob/main/docs/decisions/0033-admit-the-module-conformance-kit.md)
admits the package. It is development tooling: production code does not import
it, and Core and Assembly do not either.

The package qualifies nothing by itself. It does not qualify Core or Assembly,
it derives no expected value from the implementation under test: the author of
a test supplies the expected data, including the provider decisions that
`checkWiring` compares with a completed composition.

## Install

```sh
npm install --save-dev @get-modular/conformance
```

Supported Node.js: `>=24.18.0 <25 || >=26.10.0 <27`. Core, Assembly and
resources are peer dependencies, each with a range of one 0.x minor, and nothing
else is a dependency. Exactly one copy of `@get-modular/assembly` must resolve:
`smoke` calls its public `implement` and `group` functions to rebuild entries and
groups, and their private authentication must see the production objects. Your
project also loads one copy of resources, so the `scoped()` brand matches. The
package imports no test runner and no Node built-in module.

TypeScript consumers need `AbortSignal`, `Disposable` and `AsyncDisposable`:
either `lib` with `ES2024`, `ESNext.Disposable` and `DOM`, or `@types/node`.

## Test one module with `isolate`

```ts
import { isolate } from "@get-modular/conformance";

await using orders = await isolate(ordersEntry, {
  dependencies: { db: fakeDb, audit: undefined, replicas: [] } });
orders.capabilities["acme/orders"].list();
```

`isolate(entry, { dependencies, signal?, within? })` builds the entry through a
real Assembly run. The entry carries its adapter, so no adapter is applied here.
Each dependency
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
- After construction, `isolate` checks the module's own capabilities as port
  objects; the fakes it supplies are run inputs and are not checked.

## Smoke-check a composition root with `smoke`

```ts
import { smoke } from "@get-modular/conformance";

const steps = await smoke({ api: assemblyFor<Host>(), compose: composeProduction, inputs });
```

Write the production composition root as a function of Assembly and pass it as
`compose`; `smoke` calls it once. It first calls the real `prepare` with the
input as given and returns any failure unchanged. It then rebuilds every entry
with `implement()(entry.declaration, wrap(entry.factory))`, every group with
`group(name, members)`, remaps roots by identity and prepares the rebuilt tree.
If `compose` resolves with a preparation that its wrapped `prepare` did not
produce, `smoke` rejects. It then runs the prepared root without
injection, and again with a failure and an abort injected right after each
module (`inject` and `at` narrow the list). Every attempt runs in a scope of its
own that must close with `complete: true`. It rejects with
`conformance.smoke.failed` when any step broke an expectation, and
`details.steps` lists every step with its `problem`. If the first run does not succeed there is no trustworthy order to inject into, so
`smoke` rejects after it; a first run that succeeds but leaves a debt does not stop it.
After that first run and the `at` check, `smoke` checks the capabilities of the
factory-built modules in `created` before it starts an injected run.

What `smoke` does not prove: that the bindings are right (write an independent
oracle for that), that anything was physically released, the order of release
inside a module, and resources acquired outside `setup` and `use`. It sets no
timers: a cleanup that never settles hangs the test, and the limit belongs to
your test runner.

## Capabilities are port objects

A port object keeps its callable members as own properties. After a module is
constructed, every object-valued capability it provides must meet that rule.
Functions, primitives, `null` and arrays are skipped. For every other value,
the check walks its prototype chain until `null` or this realm's
`Object.prototype`.

The walk stops at the captured prototype of a container: `Array`, `Map`, `Set`,
`WeakMap`, `WeakSet`, `Date`, `RegExp`, `Promise`, `Error`, `ArrayBuffer`,
`SharedArrayBuffer`, `DataView`, every typed array and `Buffer`. It also stops
at the `Object.prototype` of another realm. On every other prototype, each own
string or symbol key except `constructor` is a member when its descriptor is a
function-valued data property or an accessor. The check reads descriptors only
and never invokes a getter.

```ts
class Orders {
  list(): readonly Order[] {
    return readOrders();
  }
}

const orders = new Orders();
export const ordersPort = {
  list: (): readonly Order[] => orders.list(),
};
```

The fix is a port object of arrow functions in front of the class. The class
stays behind the port and keeps its implementation and its `this` binding.
Members survive destructuring because each function is already bound to the
state it needs.

`isolate` runs the check after its run succeeds and the module is found in
`created`. It checks only the capabilities of the module under test, never its
instance, dependencies or run inputs, and never the fakes that `isolate` adds.
Before it rejects, `isolate` closes its own scope. When `within` is used, the
caller's scope remains open.

`smoke` runs the check after its first successful run, once the `at` ids have
been checked. It checks every factory-built module in that run's `created`, in
created order and then capability order, and rejects before any injected run
starts. `details.steps` contains the first run and its close report.

The result is `conformance.ports.prototype-member`. `details.violations` has
one entry per failing capability with its `implementationId`, `capabilityId`
and distinct `members`, nearest prototype first.

This check does not prove that every callable member is bound correctly:

- an own method in an object literal may still use `this`;
- a method handed out unbound as a function-valued capability is invisible;
- nested objects are not checked;
- run inputs and the fakes of `isolate` are not checked;
- own accessors on the capability itself are not checked;
- a `Map` capability passes because `Map.prototype` stops the walk;
- a `Map`, `Date` or `Buffer` from another realm is reported, because only
  this realm's container prototypes are captured;
- Proxy traps for `getPrototypeOf`, `ownKeys` and `getOwnPropertyDescriptor`
  run during the walk, and their errors pass through unchanged.

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

## Check a completed root with the wiring oracle

```ts
import { checkWiring, describeWiring } from "@get-modular/conformance";

const ordersWiring = {
  providers: {
    "acme/db": "acme/db/postgres",
    "acme/orders": "acme/orders/default",
  },
  roots: ["acme/orders/default"],
};

checkWiring(composition, [ordersWiring], { declarations });
console.log(describeWiring(composition));
```

`checkWiring(composition, oracles, { declarations })` compares a completed
composition with hand-written `WiringOracle` parts. Pass the same declarations
you pass to `compileComposition` and `checkNamespaces`: the plan shows neither
the capabilities a module provides nor the cardinality of a slot, so the
declarations supply them. Keep each oracle part in test code at
`<test-root>/features/<feature>/<feature>.wiring.ts`; never derive it from the
profile, plan or implementation. Equal parts may repeat a pin or row. Parts
that pin one capability to different provider sets, or list different provider
orders for one `consumer` and `slot`, conflict.

The merged oracle pins the implementation providing every capability a selected
module provides, the root implementations and every row that profile completion
does not produce: optional, `many`, explicit and several-provider rows. The
check reports a difference when:

- plan selections differ from pinned providers plus roots, or plan roots differ
  from the oracle roots (`selection`, `root`);
- the declarations do not cover the plan selections exactly, by
  `implementationId` (`declaration-selection`);
- a selected declaration provides a capability that the oracle does not pin to
  it (`provided-capability`), or a pinned implementation that is selected and
  declared does not provide its pinned capability (`pinned-provider`);
- a listed row differs from its plan row, provider order included (`row`,
  `row-order`), or a listed row is absent from the plan;
- an unlisted plan row is not a `required` slot bound to the single pinned
  provider of its capability (`unlisted-row`); an unlisted `optional` or `many`
  row, and every row of a several-provider capability, must be listed;
- a plan row names a slot its consumer's declaration lacks (`row-slot`) or uses
  another capability than the declared slot (`row-capability`).

A newly declared `required` slot bound to its single pinned provider therefore
needs no oracle change; review that as a declaration change. Every difference is
collected before one `conformance.wiring.mismatch` is thrown, with the rows in
`details.differences`.

`describeWiring` is a debugging view, not an oracle format. It prints roots and
selections, then one `consumer.slot <- providers [capability rN]` row per line.

## Check source layout with `checkModuleLayout`

```ts
import { checkModuleLayout } from "@get-modular/conformance";

const report = checkModuleLayout({
  files,
  imports,
  useCaseExports,
});
```

The caller resolves source paths and import specifiers and passes normalized
records: repository-relative `files`, `imports` with `from`, `to` and a `type`
or `value` mode, and the runtime exports of each `application/use-cases` file.
The function is pure and imports nothing it scans.

Pass production files only, never tests: `isolate` tests import module files
too, and only production importers may count for ownership. Every `from` must
be one of `files`. A `to` may lie outside `files` (an external package or an
unresolved specifier); the collector drops Node builtins. Only `value` imports
own, place or use a file; a `type` import never does. A feature is the
directory below the last `features/` segment, and its key in the metrics is
that directory's path, so the same feature name under two source roots stays
apart. Host-level files (`src/composition/`) belong to no feature. A Host-level
file under a directory literally named `composition` (for example
`packages/composition/src/index.ts`) is reported as `nested-composition`.

It reports every Get Modular rule with a stable violation code:
`module-declaration` (a module imports no declaration of its feature),
`orphan-module`, `orphan-declaration`, `group-count`,
`child-group-outside-parent`, `root-imports-sub-feature-group`,
`nested-composition`, `descriptor-path`, `use-case-export` and
`application-file`. A `*.contracts.*` file must be
`composition/<own segment>.contracts.*` of its feature or a flat Host-level
`composition/*.contracts.*`, and a declaration import of a contracts file must
resolve to such a collected file. Whether a declaration imports anything else
(`node:fs`, a module file, an application file) stays with the lint rules. A
passing call returns `featureCount`, `moduleCount` and `modulesPerFeature`. A
failing call throws one `conformance.layout.violation`; `details.violations`
lists every violation and `details` also carries the same metrics.

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
| `conformance.ports.prototype-member` | a capability that a constructed module provides has methods or accessors on its prototype chain; `details.violations` lists every such capability with its members |
| `conformance.wiring.mismatch` | a completed plan or its declarations differ from the provider oracle; `details.differences` lists every difference. Malformed declarations are `conformance.argument.invalid` |
| `conformance.layout.violation` | source records break a Get Modular layout rule; `details.violations` lists every violation |
| `conformance.suite.revision-mismatch` | the subject provides another revision than the suite checks |
| `conformance.suite.case-failed` | a case failed and its scope also closed with debts |
| `conformance.handles.leaked` | handles opened after the guard are still active |
| `conformance.handles.unsupported-runtime` | Node diagnostics are unavailable |

## Releases

The package is 0.x. A breaking change ships as a minor release with a changelog
entry and a migration note. Every minor release of a peer is accompanied by a
minor release of this package.
