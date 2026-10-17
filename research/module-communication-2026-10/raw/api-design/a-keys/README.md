# @get-modular/observation (variant A: keys and changesAfter)

Frozen after round 3 as the documented alternative to variant B. The adversarial-review fixes (type marker, cascade
guard, testing entry point, renames, per-scope limits) were applied to B only; see b-snapshot/RATIONALE.txt.

State with one writer. The module that owns a value creates a store and is its only writer. Other modules get a
read-only facet through a normal contract and `required` slot, typed with their own slice
(`ReadonlyStore<{ readonly theme: string }>`), never with the app's whole settings type.

```ts
import { createStore, type ListenerError, type ReadonlyStore } from "@get-modular/observation";
import type { ModuleContext, Resources } from "@get-modular/resources";
```

`ModuleContext` is `{ signal, resources }`, which Assembly passes to your factory: `resources` is your module's scope,
and everything registered there is released when the module closes; `signal` aborts if the run that constructs the
module is cancelled. If your factory does not need the context, name the parameter `_context`.

## Read and follow

```ts
export async function createPicker(deps: { readonly theme: ReadonlyStore<ThemeSlice> }, { resources }: ModuleContext) {
  const first = deps.theme.read(["theme"]);                  // frozen snapshot { revision, values }
  const picker = createThemePicker(first.values.theme);
  deps.theme.watch(resources, {
    name: "theme-picker/theme", keys: ["theme"], changesAfter: first,  // changesAfter: the snapshot you already read
    onChange: ({ values }) => { picker.show(values.theme); },
  });
  return { instance: picker, capabilities: { "acme/theme-picker": createPickerPort(picker) } };
}
```

- `watch(resources, { name, keys, changesAfter, onChange })`. `changesAfter` is the snapshot you already read: every
  commit to `keys` after it is delivered, even one made while your factory awaited. It must cover `keys`; pass only
  snapshots this store gave you. `watch` and `load` may follow the same keys, with different names.
- `onChange` runs in a later task, never inside `watch`. Several commits may arrive as one call and an unchanged
  value may arrive again: keep the handler idempotent.
- Handlers are synchronous and need a block body: `(next) => { f(next); }` compiles without a `return`, and so does
  `() => undefined`. `(next) => f(next)` does not compile when `f` returns anything, `void` included; nor does `async`.
- Never write, in `onChange`, to the store you are watching. Ask its owner through a command port instead.
- Need the value only at creation, or once per call or request? Call `read` and do not `watch`.
- Repeating a key list literal, as in `read(["currency", "region"])`, is fine. To reuse one list, write
  `const keys = ["currency", "region"] as const;` (a const assertion, not a type assertion) or annotate it:
  `const keys: readonly ["currency", "region"] = ["currency", "region"];`.

## Names, lifetime and limits

- Name every subscription `"<module>/<purpose>"`, for example `"catalog/models"`. Two live subscriptions with the
  same name on one store in one scope throw `observation.watch.duplicate-name`: `watch` and `load` of the same key
  in one module need different names, and so does a repeated subscription per request in the module scope.
- A subscription lives in `resources` and is detached as soon as that scope starts closing.
- For work shorter than the module, see the next section.
- `watch` and `load` throw `observation.scope.closing` and register nothing when `resources.signal` is already
  aborted: the scope started closing, or the run that constructs your module was cancelled, typically while your
  factory awaited. Do not catch it: let the factory fail. The Host releases what you registered before.
- A store accepts at most `maxWatchers` live subscriptions (default 1024, then `observation.watchers.limit`).

## Work shorter than the module: one subscription per piece of work, or one fan-out

Every live subscription counts against `maxWatchers` (default 1024) of the store you watch.

- **A child scope per piece of work** (a request, a session, a ticker): simplest when the number of open pieces stays
  well below `maxWatchers`, or when each piece also holds other resources. `resources.child({ name })` returns
  `{ resources, control }`; `await control.close()` releases the piece's entries and frees its slot in your scope.
  `control.close()` never rejects: it returns a report, so check `report.complete` yourself.
- **One module-level subscription that fans out to a set of receivers**: when many pieces may be open at once (hundreds
  or more). It costs one subscription whatever the number of receivers. Remove a receiver when its piece ends, and call
  each receiver in its own `try/catch`, collect the failures and rethrow them after the loop (for example as one
  `AggregateError`), so one throwing receiver neither stops the others nor goes unreported.

```ts
type Screen = { readonly show: (rate: number) => void };
const openTicker = (rates: ReadonlyStore<{ readonly eurUsd: number }>, resources: Resources, screen: Screen) => {
  const work = resources.child({ name: "ticker" });
  try {
    const rate = rates.read(["eurUsd"]);
    screen.show(rate.values.eurUsd);
    rates.watch(work.resources, { name: "quotes/ticker", keys: ["eurUsd"], changesAfter: rate, onChange: ({ values }) => { screen.show(values.eurUsd); } });
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

## Asynchronous work: `load`

```ts
let state: CatalogState = { status: "loading" };
deps.settings.load(resources, {
  name: "catalog/models", keys: ["region"],
  loader: ({ values }, { signal }) => fetchModels(values.region, { signal }),
  onLoading: () => { state = { status: "loading" }; },       // a run for newer values is queued: drop older data
  onResult: (models, { values }) => { state = { status: "ready", region: values.region, models }; },
  onError: (cause, { values }) => { state = { status: "failed", region: values.region, cause }; },
});
```

`loader` runs in the next task for the newest values and again after each change. One run at a time: a change aborts
the running one and only the newest change waits. `onLoading` is called when a run is queued, the first one included;
`onResult` and `onError` arrive only for values that are still current in the store. Your state lags the store by one
task, like any subscriber. Do not fetch the first value yourself. On close the running load is aborted and drained.

## Acquiring a resource in an asynchronous factory

Acquire asynchronously only inside `resources.setup`, then follow from the snapshot you used:

```ts
export async function createAudit(deps: { readonly settings: ReadonlyStore<{ readonly retentionDays: number }> }, { resources }: ModuleContext) {
  const retention = deps.settings.read(["retentionDays"]);
  const log = await resources.setup({                         // released with the scope, even if it closes meanwhile
    name: "audit/log",
    setup: ({ signal }) => openAuditLog(retention.values.retentionDays, { signal }),
    cleanup: (opened) => opened.close(),
  });
  deps.settings.watch(resources, {                           // a change made during the await is still delivered
    name: "audit/retention", keys: ["retentionDays"], changesAfter: retention,
    onChange: ({ values }) => { log.setRetention(values.retentionDays); },
  });
  return { instance: log, capabilities: {} };
}
```

If the scope starts closing during the `await`, `setup` rejects and the log is closed when its opening finishes;
the factory fails, which is correct. Opening outside `setup` and registering later with `resources.use` would leak
the log in that case, because a closing scope refuses `use`.

## Own a store

```ts
type ErrorsPort = { readonly report: (report: ListenerError) => undefined };  // the Host's error port
type Prefs = { readonly theme: string; readonly density: "compact" | "comfortable" };
export async function createPrefs(deps: { readonly errors: ErrorsPort }, { resources }: ModuleContext) {
  const store = createStore<Prefs>({ theme: "light", density: "comfortable" }, {
    name: "prefs", resources, reportError: deps.errors.report,  // the Host's error port
  });
  const commands = { setTheme: (theme: string): undefined => { store.set({ theme }); return undefined; } };
  return { instance: undefined, capabilities: { "acme/prefs": store.readonly(), "acme/prefs/commands": commands } };
}
```

Only the owner calls `set(patch)` and `close()`; hand out `store.readonly()`, never `store`. `set({ theme })` changes
`theme` and keeps every other key. Declare every key (`T | undefined`, never `?:`); values are frozen plain data.
`set` returns the revision, and a patch that changes nothing commits nothing. The store closes with its `resources`.

## A derived store

Use one mapping function for the first value and for every update, so the two can never drift apart:

```ts
const toPricing = (values: { readonly currency: string; readonly region: string }): Pricing =>
  ({ currency: values.currency, vatRate: vatRateFor(values.region) });
const settings = deps.settings.read(["currency", "region"]);
const pricing = createStore<Pricing>(toPricing(settings.values), { name: "pricing", resources, reportError: deps.errors.report });
deps.settings.watch(resources, {
  name: "pricing/settings", keys: ["currency", "region"], changesAfter: settings,
  onChange: ({ values }) => { pricing.set(toPricing(values)); },
});
// capabilities: { "acme/pricing": pricing.readonly() }
```

## Errors

- A handler that throws (or returns a value) does not stop other subscribers. The store reports the failure to its
  owner's `reportError` as a `ListenerError` `{ store, subscription, revision, cause }`, and the owner wires
  `reportError` to the Host's error port. As a subscriber you never build a `ListenerError` and never call the
  error port yourself: let the failure throw out of your handler. Never drop it in a `try/catch`.
- After a handler throws, the same subscription stays attached and keeps receiving later revisions.
- If a value you receive can be invalid as a normal case of your domain, handle it in the handler and expose it as
  your own state, so nothing throws:

```ts
let invalidQuietHours: string | undefined;
deps.settings.watch(resources, {
  name: "notifications/quiet-hours", keys: ["quietHours"], changesAfter: deps.settings.read(["quietHours"]),
  onChange: ({ values }) => {
    const hours = tryParseQuietHours(values.quietHours);     // undefined for invalid text
    invalidQuietHours = hours === undefined ? values.quietHours : undefined;
    if (hours !== undefined) { notifier.setQuietHours(hours); }
  },
});
```

Compare `code`, never the class or message. This package throws: `observation.argument.invalid`,
`observation.keys.empty`, `observation.keys.unknown`, `observation.values.not-plain`, `observation.store.closed`,
`observation.scope.closing`, `observation.snapshot.foreign`, `observation.watch.duplicate-name`,
`observation.watchers.limit`, `observation.callback.returned-value` (reported, not thrown) and
`observation.load.still-running` (a close debt of a load that ignored its signal).
