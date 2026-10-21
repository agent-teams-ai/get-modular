# Changelog

## 0.2.0

### Minor Changes

- a824f33: Keep load cleanup pending until its loader settles after escalation. Report
  `observation.load.still-running` through the owner error sink with the active
  run's revision instead of finishing cleanup with a failed debt. Earlier resources
  remain held while that loader, including its finally work, is still running.

  Migration (0.1 -> 0.2)

  Better: escalation cannot release the dependencies of a still-running load.

  Codemod: none - choosing shutdown deadlines and retained ownership is semantic.

  By hand: observe the error sink for still-running reports; use Resources abandon
  for bounded waiting and retain the original close promise and dependencies.
  Do not await an escalated close expecting a terminal failed debt or automatically
  retry cleanup to observe late completion.

  Check: typecheck, then composition smoke and held-loader shutdown tests through
  the installed public packages.

### Patch Changes

- Updated dependencies [ddf1e0b]
  - @get-modular/resources@0.2.1

## 0.1.0

### Minor Changes

- 3e59595: Add `@get-modular/observation` (ADR-0034): state with one writer, read-only facets and subscriptions owned by the
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

### Patch Changes

- Updated dependencies [3e59595]
- Updated dependencies [3e59595]
  - @get-modular/resources@0.2.0
