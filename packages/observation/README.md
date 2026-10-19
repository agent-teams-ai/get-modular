# @get-modular/observation

State with one writer. The module that owns a value creates a store and is its only writer. Other modules get a
read-only facet through a contract and a `required` slot, typed with their own slice, and follow what they read.

## Checklist

Each line says what catches a violation.

- MUST pass `resources` and a non-empty `name` to every `watch` and `load` (compile error; empty name: `observation.argument.invalid`).
- MUST follow from the snapshot you read: `facet.watch(facet.read(keys), …)` (hand-built snapshot: compile error; copied or foreign: `observation.snapshot.foreign`).
- MUST write handlers with a block body that returns nothing; annotate a named handler `: undefined` (`async`, `(n) => f(n)`, `: void`: compile error; a returned value at run time is reported as `observation.callback.returned-value`).
- NEVER change a key your subscription follows, from its handler or from what the handler goes on to do (a command, an awaited step, a promise job) or from the `loader` body: the commit fails at the first round with `observation.delivery.echo`. Writing your own, different store from a handler is fine; that is the derived-store recipe. A chain across stores fails after 64 steps with `observation.delivery.cascade`. What is caught: synchronous chains everywhere; in Node also asynchronous steps within the same delivery task, and the loader body while its run is active; not an echo that crosses a timer or real I/O. Both failures are reported first and then thrown: in a fire-and-forget async continuation that is an unhandled rejection, and Node's default policy ends the process. That is intended fail-fast for a programming bug (the alternative is a silent endless loop); a Host may set its own unhandled-rejection policy.
- MUST name subscriptions `"<module>/<purpose>"`, unique per store in one scope (`observation.subscription.duplicate-name`).
- MUST release work shorter than the module, by one of two designs: a `resources.child()` per piece of work that you close when it ends, or one module-level subscription that fans out to receivers you remove when they end (more than 64 live subscriptions of one store in one scope, or more than 8192 in total: `observation.subscriptions.limit`).
- MUST use `load` with `onLoading` for asynchronous data that follows values; NEVER fetch the first value yourself (missing `onLoading` or `onError`: compile error).
- NEVER start timers, connections or servers from a `loader`: work it starts runs in its delivery context while the run is active, so a write it makes to a key the load follows fails as an echo. Start long-lived work in the factory or in the owner's `setup`.
- MUST acquire asynchronously only inside `resources.setup` (otherwise a scope that closes during the `await` leaks the resource: `use` refuses it with `resources.scope.closed`).
- NEVER catch what `watch` or `load` rethrow from an aborted `resources.signal` (`resources.scope.closed`, or the Host's cancel reason); let the factory fail.
- MUST type a dependency as `ReadonlyStore<Slice>`; NEVER as `Pick`, `Omit` or member types of it (a wrong slice through `ReadonlyStore<…>`: compile error).
- NEVER build a `ListenerError` or call the error port from a handler; let the handler throw (building one: compile error).
- Owner: MUST hand out `store.readonly()`, never `store` (compile error), and MUST wire `reportError` to the Host's error port.
- Owner: pass ordinary, non-Proxy records and arrays at every level, including the initial or patch record. `set` takes ownership of the objects you pass; NEVER mutate them afterwards (they are frozen: `TypeError`), and copy objects you got from another module before passing them.
- MUST declare readonly domain types for values that come from a store (a mutable array type does not accept a frozen value: compile error), and write `watch` on concrete types, not in generic helpers.
- Store record: declare every key; no `?:`, no index signature (compile error).
- Tests: MUST close scopes and assert the store-wide `liveSubscriptions(facet) === 0`; wait with `delivered({ stores })` or `settled({ stores })` from `@get-modular/observation/testing`, never with a tick count. Import `/testing` only from test files.

## Quick start

```ts
import { createStore, type ListenerError, type ReadonlyStore, type Snapshot } from "@get-modular/observation";
import type { ModuleContext, Resources } from "@get-modular/resources";
```

The resources `scoped` adapter converts Assembly's `{ signal, scope }` context into `ModuleContext`,
`{ signal, resources }`, for your module factory: `resources` is your module's scope,
and everything registered there is released when the module closes; `signal` aborts if the run that constructs the
module is cancelled. If your factory does not need the context, name the parameter `_context`. Call `watch` and `load`
in the module's composition file: domain and application code never see `Resources`. The `openTicker` helper in
the recipes below is local to that same composition file.

A module that follows a value:

```ts
export async function createPicker(deps: { readonly theme: ReadonlyStore<ThemeSlice> }, { resources }: ModuleContext) {
  const theme = deps.theme.read(["theme"]);                  // frozen snapshot { revision, values }
  const picker = createThemePicker(theme.values.theme);
  deps.theme.watch(theme, {                                  // follows every key of `theme`, from its revision
    resources, name: "theme-picker/theme",
    onChange: ({ values }) => { picker.show(values.theme); },
  });
  return { instance: picker, capabilities: { "acme/theme-picker": createPickerPort(picker) } };
}
```

`watch(snapshot, { resources, name, onChange })` follows every key of the snapshot from its revision: a commit after
your `read`, even one made while your factory awaited, is delivered. Read exactly the keys you want to follow, and
pass a snapshot read through the same facet. `onChange` runs in a later task, never inside `watch`; several commits
may arrive as one call and an unchanged value may arrive again, so keep it idempotent. `(next) => { f(next); }`
compiles without a `return`; `(next) => f(next)` does not when `f` returns anything, `void` included. Need the value
only at creation, or once per call or request? Call `read` and do not `watch`.

The owner of a value:

```ts
type ErrorsPort = { readonly report: (report: ListenerError) => undefined };  // the Host's error port
type Preferences = { readonly theme: string; readonly density: "compact" | "comfortable" };
const themes = new Set(["light", "dark"]);
export async function createPreferences(deps: { readonly errors: ErrorsPort }, { resources }: ModuleContext) {
  const store = createStore<Preferences>({ theme: "light", density: "comfortable" }, {
    name: "preferences", resources, reportError: deps.errors.report,
  });
  const commands = {
    requestTheme: (theme: string): "accepted" | "rejected" => {   // the command returns a typed result
      if (!themes.has(theme)) return "rejected";
      store.set({ theme });
      return "accepted";
    },
  };
  return { instance: undefined, capabilities: { "acme/preferences": store.readonly(), "acme/preferences/commands": commands } };
}
```

Asynchronous data that follows a value:

```ts
let state: CatalogState = { status: "loading" };
deps.settings.load(deps.settings.read(["region"]), {        // this snapshot only says which keys to follow
  resources, name: "catalog/models",
  loader: ({ values }, { signal }) => fetchModels(values.region, { signal }),
  onLoading: () => { state = { status: "loading" }; },       // a run for newer values is queued: drop older data
  onResult: (models, { values }) => { state = { status: "ready", region: values.region, models }; },
  onError: (cause, { values }) => { state = { status: "failed", region: values.region, cause }; },
});
```

`loader` runs in the next task for the newest values and again after each change. One run at a time: a change aborts
the running one and only the newest change waits. `onResult` and `onError` arrive in a later delivery task after
the loader's Promise settles, only for values that are still current in the store immediately before the callback.
`onLoading` is called once in every delivery (several coalesced changes are one delivery), before the older run can
finish, so the state above never shows models of an older region once the change is delivered: no extra region check at call time is
needed. Like every subscriber, the state updates in later tasks: code that calls `current()` in the same
synchronous turn as `set` still sees the previous state. One snapshot may be passed to both `watch` and `load`, with
different names.

## Recipes

Acquiring a resource in an asynchronous factory. Acquire inside `resources.setup`, then follow from the snapshot you used:

```ts
export async function createAudit(deps: { readonly settings: ReadonlyStore<{ readonly retentionDays: number }> }, { resources }: ModuleContext) {
  const retention = deps.settings.read(["retentionDays"]);
  const log = await resources.setup({                         // released with the scope, even if it closes meanwhile
    name: "audit/log",
    setup: ({ signal }) => openAuditLog(retention.values.retentionDays, { signal }),
    cleanup: (opened) => opened.close(),
  });
  deps.settings.watch(retention, {                           // a change made during the await is still delivered
    resources, name: "audit/retention",
    onChange: ({ values }) => { log.setRetention(values.retentionDays); },
  });
  return { instance: log, capabilities: {} };
}
```

If the scope starts closing during the `await`, `setup` rejects and the log is closed when its opening finishes; the
factory fails, which is correct.

A derived store: one mapping function for the first value and for every update, so the two can never drift apart:

```ts
const toPricing = (values: { readonly currency: string; readonly region: string }): Pricing =>
  ({ currency: values.currency, vatRate: vatRateFor(values.region) });
const settings = deps.settings.read(["currency", "region"]);
const pricing = createStore<Pricing>(toPricing(settings.values), { name: "pricing", resources, reportError: deps.errors.report });
deps.settings.watch(settings, { resources, name: "pricing/settings", onChange: ({ values }) => { pricing.set(toPricing(values)); } });
// capabilities: { "acme/pricing": pricing.readonly() }
```

Work shorter than the module. Subscriptions in one scope count against the per-scope limit (64 per store in one
scope); with a child scope per piece of work each piece is its own scope, so only the store-wide limit (8192) bounds
how many pieces may be open at once:

- **A child scope per piece of work** (a request, a session, a ticker), when each piece also holds other resources or
  the pieces are few. `resources.child({ name })` returns `{ resources, control }`; `await control.close()` releases the
  piece's entries and frees its slot in your scope. `control.close()` never rejects: check `report.complete` yourself.
- **One module-level subscription that fans out to a set of receivers**, when many pieces may be open at once. Remove a
  receiver when its piece ends; call each receiver in its own `try/catch`, collect the failures and rethrow them after
  the loop as one `AggregateError`, so one throwing receiver neither stops the others nor hides another failure.

```ts
type Screen = { readonly show: (rate: number) => void };
const openTicker = (rates: ReadonlyStore<{ readonly eurUsd: number }>, resources: Resources, screen: Screen) => {
  const work = resources.child({ name: "ticker" });
  try {
    const rate = rates.read(["eurUsd"]);
    screen.show(rate.values.eurUsd);
    rates.watch(rate, { resources: work.resources, name: "quotes/ticker", onChange: ({ values }) => { screen.show(values.eurUsd); } });
  } catch (error) {
    void work.control.close();   // release the child even though subscribing failed; close() never rejects
    throw error;
  }
  return {
    close: async (): Promise<void> => {
      const report = await work.control.close();
      if (!report.complete) { throw new Error(`the ticker was not fully released (${report.debts.length} debts)`); }
    },
  };
};
```

Errors the Host must see, and errors that are a normal case. If a failure in a handler must reach the Host, let it throw out of the handler: the store reports it with your
subscription name, and later revisions still arrive. If a value can be invalid as a normal case of your domain and the
Host need not see it, handle it in the handler and expose it as your own state instead:

```ts
let invalidQuietHours: string | undefined;
deps.settings.watch(deps.settings.read(["quietHours"]), {
  resources, name: "notifications/quiet-hours",
  onChange: ({ values }) => {
    const hours = tryParseQuietHours(values.quietHours);     // undefined for invalid text
    invalidQuietHours = hours === undefined ? values.quietHours : undefined;
    if (hours !== undefined) { notifier.setQuietHours(hours); }
  },
});
```

Pagination is a loop inside one `loader`, never an echo through a watched cursor (that fails at the first round):

```ts
deps.settings.load(deps.settings.read(["region"]), {
  resources, name: "catalog/all-pages",
  loader: async ({ values }, { signal }) => {
    const all: Model[] = [];
    for (let cursor: string | undefined = ""; cursor !== undefined;) {
      const page = await fetchPage(values.region, cursor, { signal });
      all.push(...page.items);
      cursor = page.next;
    }
    return all;
  },
  onLoading: () => { state = { status: "loading" }; },
  onResult: (models, { values }) => { state = { status: "ready", region: values.region, models }; },
  onError: (cause, { values }) => { state = { status: "failed", region: values.region, cause }; },
});
```

A "load more" button is a command of the owner (an input), not an echo.

Save on close. The owner's `read` still works after `close`. Register the save after `createStore`, so it runs first,
and make it an `asyncDispose` entry when the write is asynchronous, so that the scope waits for it before the next
cleanup closes the file:

```ts
export async function createSavedPreferences(deps: { readonly errors: ErrorsPort }, { resources }: ModuleContext) {
  const saved = await resources.setup({ name: "preferences/file", setup: () => openPreferencesFile(), cleanup: (file) => file.close() });
  const store = createStore<Preferences>(saved.initial, { name: "preferences", resources, reportError: deps.errors.report });
  resources.use({ [Symbol.asyncDispose]: async () => { await saved.write(store.read(["theme", "density"]).values); } }, "preferences/save");
  return { instance: undefined, capabilities: { "acme/preferences": store.readonly() } };
}
```

Slices through contracts. The owner publishes a few area contracts (theme, logging, region) and hands out the same
facet under each; a consumer slots its area contract and narrows further in its own port type:

```ts
type ThemeArea = { readonly theme: string; readonly density: "compact" | "comfortable" };
export const ThemeSettings = defineContract<ReadonlyStore<ThemeArea>>()({ id: "acme/settings/theme", revision: 1 });
// Owner: provides: [ThemeSettings.provide(), …]; capabilities: { "acme/settings/theme": store.readonly(), … }
// Consumer: slots: [ThemeSettings.slot("theme", required())]; its own port type is ReadonlyStore<{ readonly theme: string }>.
```

Small things:

```ts
declare const changedTheme: string | undefined;
declare const preferences: ReturnType<typeof createStore<Preferences>>;
if (changedTheme !== undefined) { preferences.set({ theme: changedTheme }); }      // a conditional patch
const preferenceKeys = ["theme", "density"] as const;                                // a reused key list (a const assertion)
const onTheme = (next: Snapshot<Preferences, "theme">): undefined => { void next.values.theme; return undefined; };  // a named handler
```

## Reference

Lifetime. A `watch` is bound to the `resources` you pass through its `signal`: it is detached the moment that scope
starts closing, before any cleanup runs, and nothing else is registered in the scope. A `load` also opens a child
scope `load:<name>` with a `drain` entry for its running run. After a handler throws, the same subscription stays attached and keeps receiving later revisions. If
`resources.signal` is already aborted, `watch` and `load` register nothing and rethrow its reason
(`signal.throwIfAborted()`): `resources.scope.closed`, or the Host's reason for a cancelled run.

The source closes first. When a store closes while other modules still follow it, every subscription is detached (a
watch's signal listener is removed, a load's `load:<name>` scope is closed), so a long-lived subscriber scope keeps
nothing per closed source; running loads are aborted, and each subscription gets one report with `observation.source.closed` in the
owner's `reportError`. Afterwards `set`, `watch`, `load` and the facet's `read` throw `observation.store.closed`; the
owner's `read` keeps returning the last values. With static composition this does not happen: consumers close first.

Limits and costs. Per store: at most 64 live subscriptions in one subscriber scope (`maxSubscriptionsPerScope`) and
8192 in total (`maxSubscriptions`, a safety net the owner may change); one more throws
`observation.subscriptions.limit`. Until resources provides a scope path, the message identifies this scope and, for the total limit, the number of scopes and the
largest count in one (child scopes per piece of work that are never closed show up as many scopes of one each).
The research fixture observed roughly 1 KB per live watch; this is not a worst-case byte bound. A subscription buffers at most one undelivered revision; a load
has one running and at most one waiting run; `set` visits only the subscriptions of the keys it changed.

Echo and cascades. A delivery callback (`onChange`, `onLoading`, `onResult`, `onError`) and a `loader` run in a
delivery context. A commit made in that context that changes a key the same subscription follows on the same store
fails at once with `observation.delivery.echo`. Every other commit made in a context is one step deeper than its
delivery (commits outside any context have depth 0; a delivery has the largest depth among the commits it coalesces);
a commit deeper than 64 fails with `observation.delivery.cascade`. A failing commit changes nothing, is reported to the
`reportError` of the store it was made to, and then throws.
How long a context counts: a handler's context until the end of its delivery task, including what that task does
through `await` and promise jobs; a loader's context until its returned Promise settles. `onResult` and `onError`
receive a separate delivery task and context; their currentness is checked again immediately before the callback.
Timers, servers and connections that a
handler creates do not inherit it: their later commits start at depth 0, so a heartbeat or a restarted server never
reports a false echo. Where it is carried: synchronously everywhere; across `await` and promise jobs in Node, which
provides AsyncLocalStorage (reached through `process.getBuiltinModule`, no import). Not caught: an echo that crosses a
timer or real I/O (a command that awaits a network call before it writes); and, where `getBuiltinModule` is absent
(browsers, some Jest environments), any asynchronous echo: there, tests miss what production on Node would throw.
Environments: Node 24 and 26 are supported. Bun 1.3 was observed to behave the same except that an unhandled rejection does not end its process; it is not part of the admission matrix. Elsewhere the package imports and works, with synchronous detection
only and no ordering guarantee beyond "a later task" (`setImmediate` where it exists, else `setTimeout(…, 0)`).

State versus events. A store holds state: commits coalesce, and a subscriber sees the newest value, not every
change. A one-off fact that must not be lost (an order was placed) is an event; events come later as
`createEvent`/`emit`/`subscribe`. Never encode an event as a store key.

Ownership. Values are plain data: supported primitives, ordinary local objects and ordinary arrays, without
Proxy wrappers at any level. This also applies to the initial and patch records. `createStore` and `set` validate
the graph and all commit guards before taking ownership and freezing objects in place. For this supported
ordinary-data domain, a rejected call freezes nothing. Previously admitted frozen objects are not walked again.
Copy objects that belong to another module before passing them; materialize an owned plain value from a reactive
draft or wrapper in the owning module.

On supported Node 24 and 26, the native `util.types.isProxy` check rejects proxies before inspecting their
properties or freezing any new object, using `observation.values.not-plain`. Where that native facility is
unavailable, callers must still provide ordinary non-Proxy data: portable reflection cannot prove proxy absence.
Detected reflection or freeze failures use the same error code and preserve their cause. Unsupported proxy traps
can execute arbitrary code or partly freeze supplied objects; the fallback promises no rollback of those effects.
Neither validation nor freezing copies or unwraps a proxy.

Errors. Compare `code`, never the class or message. A `ListenerError` is
`{ source, subscription, path?, revision, cause }`; `path` is the subscriber's scope path once
`@get-modular/resources` provides `Resources.path`.
Thrown: `observation.argument.invalid`, `observation.keys.empty`, `observation.keys.unknown`,
`observation.values.not-plain`, `observation.store.closed`, `observation.snapshot.foreign`,
`observation.subscription.duplicate-name`, `observation.subscriptions.limit`; thrown and reported:
`observation.delivery.echo`, `observation.delivery.cascade`. Reported only: what a handler threw,
`observation.callback.returned-value`, `observation.source.closed`. From `/testing`: `observation.testing.timeout`.
A close debt: `observation.load.still-running`, when a load ignored its signal after the Host escalated.

Testing. `@get-modular/observation/testing` exports `liveSubscriptions(facet, resources?)`, `delivered(options?)`
(resolves when no delivery of `options.stores`, or of any store, is scheduled), `settled(options?)` (also waits for
their running and queued loads) and `asyncDetection` (true where asynchronous echoes are detected; a test preset
asserts it). The waits always have a deadline: `options.timeoutMs`, 5000 ms of real time by default (`Infinity` only
when passed); `options.signal`, for example `t.signal`, ends a wait earlier but never switches the deadline off.
Both give `observation.testing.timeout`. In Node the package captures `setImmediate` from `node:timers` and
`performance.now` from `node:perf_hooks` through `process.getBuiltinModule`. With those builtins unmodified,
replacing the global timers or `globalThis.performance` before or after import stalls neither deliveries nor the
deadline. Patching `performance.now` on Node's shared performance object also changes the builtin clock: install
that mock after import. The same import order applies to mocks of other builtins, including node:test
`mock.timers` for `node:timers`.
Without the builtins, the available global scheduler and clock are captured at import; that fallback cannot make
a previously faked clock or scheduler real. Queued `onResult` and `onError` deliveries count toward `delivered()`;
`settled()` also waits for running and queued loads. Import this entry point only from test files.

## Choosing state, commands and asynchronous work

Ask: would dropping every intermediate update and keeping only the newest state preserve the meaning?
Use `watch` for configuration or projections when it would. Several `set` calls can coalesce: an
`idle -> running -> idle` burst can deliver only the final `idle`, with a later revision. Closing before
that delivery can produce no callback after a successful commit. A throwing handler receives a report,
not an automatic replay; an identical-value write does not retry it.

Use an ordinary typed command port for work with an acceptance or completion outcome. The owner validates
and performs the transition, alone writes its state, and returns that outcome. If every occurrence matters,
it requires a separately designed event or operation contract. A counter, timestamp or growing array in a
store does not provide reliable occurrence delivery. Events remain outside this package.

Correlated state belongs in one aggregate, committed atomically. Several calls to `set` are several states,
even when notification coalesces. Keep an optional pure `decide(current, command)` function inside the owner
if it simplifies that transition; no reducer interface is required.

```ts
type OrderState = { readonly status: "idle" } | { readonly status: "placed"; readonly orderId: string };
type Orders = { readonly state: OrderState };
const orders = createStore<Orders>({ state: { status: "idle" } }, {
  name: "orders", resources, reportError: deps.errors.report,
});
orders.set({ state: { status: "placed", orderId: "order-1" } });
// @ts-expect-error A placed order requires its orderId.
orders.set({ state: { status: "placed" } });
const orderFacet = orders.readonly();
orderFacet.watch(orderFacet.read(["state"]), { resources, name: "orders/view", onChange: ({ values }) => {
  if (values.state.status === "placed") { void values.state.orderId; }
} });
```

Narrow each newly delivered value. A starting snapshot narrowed to `"ready"` does not make future values
`"ready"`. Fixed read tuples preserve required keys; a dynamic selection makes merely possible keys optional.
A read-only facet describes the consumer's area contract; it is not a field-level authorization projection.

A consumer must not depend on one subscriber updating a cache before another runs. An uneven diamond of
derived stores may temporarily expose different commits. When those fields must be consistent, one owner
publishes their aggregate in one commit. No cross-store transaction or ordering API is implied.

A loader's returned promise covers all work it starts, including cleanup. A `Promise.race` timeout does not
terminate the losing operation, and abort does not retract an external write. Use latest-only `load` for
queries and replaceable projections. Sending a message, placing an order or consuming quota belongs to an
explicit command owner that retains final completion and any required idempotency or reconciliation.
Acquire, use and release temporary resources within the run; do not return an open resource through a result
that can be discarded. An uncooperative run may block later runs indefinitely. Bounded lane slots impose no
completion deadline. Start independently long-lived timers and services in factory/setup ownership.

`onLoading` chooses whether to clear old output, mark it stale or keep it. It means that a newer job was
offered; that job can be superseded before its loader starts. Synchronous callback types reject returned
promises but cannot prevent block-bodied fire-and-forget work. Types do not prove physical completion.

## Mechanism and trust

A Host installs one copy. Stores and subscribers are trusted in-process module code. The Host controls which
facets and command ports a plugin receives, and a subscriber's callback failures go to the source owner's
error sink. Untrusted plugins require a runtime the Host can terminate. Observation and resources are not
plugin SPIs. A kept supported plain value is not a revocable capability; closing a store does not erase it.

The load drain is a cleanup entry that waits for the package's own runs; it does not drain product traffic.
Currentness checks compare one store's data and do not fence routes or generations. A first result or failure
is data; readiness, waiting policy, escalation and abandonment remain the Host's decisions. A dynamic Host
closes a plugin's subscription scope when retiring it, or a child scope at quiesce. Observation does not check
lifecycle-kernel call admission.

A listener added to any signal supplied by Get Modular must not throw. The platform reports a throwing abort
listener as an uncaught exception; delivery to other subscriptions continues. `reportError` must not throw:
its failure is rethrown as an uncaught exception after delivery continues. The Host chooses its process policy.
Under Node's default policy, a fire-and-forget echo/cascade rejection ends the process after one report.

Ordinary callback reports identify the delivering source, subscription and delivered revision. Guard reports
identify the committing target store and its current revision, using the origin subscription's name; the
rejected write creates no revision. A source-close report uses the close-time current revision. Compose names
from the Host's existing instance identity and purpose for distinct live instances. Revisions are store-local,
not global causal IDs or business operation IDs. `path` is absent in this version. Brands prevent ordinary
construction mistakes; they do not authenticate hostile in-process code.

Closing a store preserves the owner's final read. A long-lived owner creating temporary stores should give
each a child scope, close it and release its owner handles when finished. Zero live subscriptions proves
subscription release, not absence of intentionally retained final data. Filtered waits cover only named stores,
not a transitive graph or production readiness.

For C changed keys, a commit performs C index lookups and visits the subscriptions indexed under those keys.
A subscription following several changed keys may be visited several times but delivers once per flush.
The 100-subscription, 50-key, 100-commit fixture therefore performs 5000 lookups and 500000 visits. Limits bound
registrations and buffered jobs, not user bytes or execution time. Replacing a collection scans its container
even when its children were previously frozen. Start with meaningful aggregates and area contracts; selectors
and per-entity storage require a measured consumer need. Reading a durable authority directly for each operation
remains valid; observation is not a mandatory cache.

## Known items and revisit triggers

[ADR-0034](../../docs/decisions/0034-admit-the-module-change-observation-package.md) records the accepted boundaries and known items.

| Known item | Owner | Trigger |
| --- | --- | --- |
| Echoes across timers or real I/O are not detected. | Observation | AsyncContext support, or the first such incident. |
| Report paths are absent until resources provides `Resources.path`. | Resources | A resources minor that adds the read-only path. |
| Without AsyncLocalStorage through `process.getBuiltinModule`, only synchronous chains are detected. A browser has not been tested. | Observation | The first non-Node consumer or test runner where `asyncDetection` is false. |
| Long-lived work from a loader is discouraged by a rule rather than prevented. | Observation | The first false-echo incident from such work. |
| A throwing signal listener is not isolated by the platform. | Observation | The first incident or a platform API with isolation. |
| Bounds of 64 cascade steps, 64 subscriptions per scope and 8192 per store are judgment calls. | Observation | A real consumer legitimately reaches a bound. |

The only runtime peer is `@get-modular/resources`. A resources minor release requires a matching observation
minor release. The API is public from 0.1.0; pre-1.0 breaking changes ship as minors with migration notes.
Core and Assembly do not import observation. The root owns no retries, deadlines or process control; deadlines
belong only to the testing entry. The package imports no Node builtin and performs no work merely on import.
