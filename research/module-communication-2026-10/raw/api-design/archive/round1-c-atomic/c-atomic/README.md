# @get-modular/observation (variant C: watch returns the snapshot)

State with one writer. The owner hands out a read-only facet through a normal contract and `required` slot. Depend
on your own slice type (`ReadonlyStore<{ readonly theme: string }>`), not on the app's settings type.

```ts
export async function createPicker(deps: { theme: ReadonlyStore<ThemeSlice> }, { resources }: ModuleContext) {
  let picker: ThemePicker | undefined;                         // the handler exists before the picker
  const theme = deps.theme.watch({                             // subscribes and returns the starting snapshot
    resources, keys: ["theme"],                                // name is optional: defaults to "theme"
    onChange: ({ values }) => { picker?.show(values.theme); }, // block body, returns nothing
  });
  picker = createThemePicker(theme.values.theme);
  return { instance: picker, capabilities: { "acme/theme-picker": createPickerPort(picker) } };
}
```

- `watch({ resources, name?, keys, onChange })` subscribes and returns `{ revision, values }` in one step, so no commit
  falls between reading and subscribing. `onChange` can run before your factory finishes if it awaits after `watch`.
- `onChange` runs in a later task, never inside `watch`; several commits may arrive as one call and an unchanged
  value may arrive again, so keep it idempotent. It is synchronous: `async` and `(n) => f(n)` bodies do not compile.
- Lifetime: the subscription lives in `resources` and is detached as soon as that scope starts closing. Never write,
  in `onChange`, to the store you are watching. Need the value only at creation? `read` and do not `watch`.
- Per request or other short work: watch in `resources.child({ name })` and close it. `name` is unique per store in
  a scope (`observation.watch.duplicate-name`); a store takes at most `maxWatchers` (default 1024) subscriptions.

Asynchronous work goes through `load`, also for the first value: `loader` runs in the next task and after each change,
one run at a time; a change aborts it, only the newest waits, stale results drop, and close aborts and drains it.
```ts
deps.settings.load({
  resources, name: "catalog", keys: ["region"],
  loader: ({ values }, { signal }) => fetchModels(values.region, { signal }),
  onResult: (models, { values }) => { state = { status: "ready", region: values.region, models }; },
  onError: (cause, { values }) => { state = { status: "failed", region: values.region, cause }; },
});
```

Own a store: `createStore<V>(initial, { name, resources, reportError })`; only the owner calls `set(patch)` and
`close()`; hand out `store.readonly()`, never `store`. Declare every key (`T | undefined`, never `?:`). Other codes:
`observation.keys.unknown`, `observation.store.closed`, `observation.values.not-plain`.
