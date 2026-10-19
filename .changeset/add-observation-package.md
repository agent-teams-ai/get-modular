---
"@get-modular/observation": minor
---

Add `@get-modular/observation` (ADR-0034): state with one writer, read-only facets and subscriptions owned by the
subscriber's resource scope.

- `createStore(initial, { name, resources, reportError })` creates a store whose key set is fixed by `initial`. The
  owner keeps `read`, `set`, `readonly` and `close`; other modules receive `store.readonly()`, which has `read`,
  `watch` and `load`.
- `watch(snapshot, { resources, name, onChange })` follows exactly the keys of a snapshot from its revision.
  `load(snapshot, { resources, name, loader, onLoading, onResult, onError })` keeps an asynchronous result in step
  with them: one run at a time, stale results dropped.
- Subscriptions bind to the subscriber's `resources.signal` and end when that scope starts closing; a load drains its
  running run in a `load:<name>` child scope.
- Delivery runs in a later task, coalesced, and every callback is isolated: failures go to the owner's `reportError`.
  A handler that changes a key it follows fails with `observation.delivery.echo`; chains deeper than 64 steps fail
  with `observation.delivery.cascade`.
- `@get-modular/observation/testing` gives test files `liveSubscriptions`, `delivered`, `settled` and `asyncDetection`.
- Errors carry stable `observation.<area>.<reason>` codes. `@get-modular/resources` is the only peer dependency.

Authoring surface changed: yes
