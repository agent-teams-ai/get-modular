---
id: ADR-0034
type: adr
status: accepted
owner: architecture
approved_by: product-owner-delegated-orchestrator
accepted_at: 2026-10-17
summary: Admits @get-modular/observation as an optional public package for state with one writer, read-only facets and subscriptions owned by the subscriber's scope, with resources as its only peer, and resolves OD-007.
related:
  - OD-007
  - ADR-0003
  - ADR-0009
  - ADR-0012
  - ADR-0015
  - ADR-0017
  - ADR-0023
  - ADR-0026
  - ADR-0029
  - ADR-0030
  - ADR-0031
  - ADR-0033
  - ADR-0035
  - ADR-0036
  - ADR-0037
---

# ADR-0034: Admit the module change observation package

## Context

Modules read settings and other state when they are constructed, and some of
them must react when that state changes. Get Modular gives them no shared way to
do either, so every module that needs it invents its own subscription, and every
Host its own fan-out, with different rules for errors, ordering, stale results
and shutdown. Studied systems show where that leads: subscribers that silence
each other, asynchronous results that overwrite newer ones, listeners that
accumulate, events that nobody can trace, and notifications that run before the
new state is consistent.

OD-007 recorded the owner's first direction on 2026-10-01: an optional public
Get Modular package, one hub per event family with opaque data-only
participants, modules that stay factories, a disposable TEST consumer as the
first proof and public `0.x` from the first release. On 2026-10-08 the owner
chose a declared peer on `@get-modular/resources` and classified OD-007 as no
publication blocker.

On 2026-10-15 and 2026-10-16 the owner widened the question to how modules
communicate at all: parent to child, child to parent, siblings and distant
modules, plugins, lifecycle and memory. The direction is that communication
stays predictable and observable at hundreds of modules, follows proven
industry patterns, uses names a broad JavaScript and TypeScript audience
recognizes, and prefers reliability to brevity, because AI agents will write
most modules. A survey of frontend frameworks, backend modular monoliths, actor
runtimes, mobile and desktop platforms, game engines, plugin platforms and
micro-frontend architectures, two independent syntheses and a catalog of best
and worst practices are archived in `research/module-communication-2026-10/`.
A first text of this record, accepted on 2026-10-09 in the unmerged pull
request #154, admitted the hub of that first direction; three findings
replaced it before the record merged:

- A hub that collects participants through a `many()` slot needs an explicit
  `many` row in the composition root that names every subscriber, repeated in
  the binding oracle (ADR-0035, ADR-0037), cannot reach participants inside
  sub-features, dynamic instances or plugins, and contradicts the Consumer
  Module Standard's rule that a subscriber registers its own subscription in
  its own scope.
- Writes reserved to the Host leave no way for a parent module to pass changed
  data to its children.
- One product-wide settings record in every module's types makes each new key a
  breaking revision for every consumer and every plugin.

The public API was then validated in the same archive: type probes on the
minimum and pinned TypeScript compilers, a runtime prototype on the released
resources package with mutation checks, five rounds of blind writer tests (the
last four on this API, nine modules each, written from the README and types
only) and four adversarial review passes. The first observation research, its
sketches and their known defects stay archived in
`research/observation-hooks-2026-10/`.

## Decision

### Package admission

Admit one optional runtime package, `@get-modular/observation` at
`packages/observation`, as an additive exception to the ADR-0003 topology, like
ADR-0023, ADR-0029 and ADR-0030. The package owns substantive behavior: state
with one writer, its read-only facets and the delivery of changes to
subscriptions owned by the subscriber's resource scope.

- `@get-modular/resources` is its only peer, declared in `peerDependencies`
  with the workspace caret range; the manifest has no `dependencies`,
  `optionalDependencies` or `devDependencies`, as the leaf checks require, and
  the package's own tests use the workspace link. It imports resources by root
  name only and imports neither Core, Assembly, the lifecycle kernel, product
  nor tooling packages. Core and Assembly do not import it.
- It imports no Node built-in module, also not as a type. Node facilities are
  reached structurally, as ADR-0033 does: where `process.getBuiltinModule`
  exists, the package obtains `AsyncLocalStorage` and `setImmediate` through it
  when it loads; elsewhere it falls back as described under "Signals and
  scheduling". It is the first leaf that loads a built-in at run time; the leaf
  import check does not see such a call, so review and the probe without Node
  facilities cover it.
- It exposes the root and one subpath, `./testing`, each with the carrier shape
  that ADR-0012 fixes for the root (`import` with `types` and `default`, and a
  sibling `default` that names the same file), and one current unversioned API
  (ADR-0009). For this package this decision is the successor decision that
  ADR-0012 requires for a new subpath; every other leaf keeps one root. It also
  takes precedence over the ADR-0003 rejection of conformance subpaths for this
  package's `./testing` only; that subpath carries no test runner and no test
  dependency. `./testing` is for test files only. The engines equal the
  supported Node range of the other packages.
- There is no registry of participants and no hub. A Host installs one copy of
  the package; snapshots from another store or another copy are rejected at run
  time.

### Model

A store has one writer, its owner. The owner creates it in its own scope and
hands other modules a read-only facet through an ordinary contract and a
`required` slot. A consumer types that dependency with its own slice of the
record. It reads a frozen snapshot of the keys it needs and, if it must react
to changes, follows exactly the keys of that snapshot from that snapshot's
revision. The subscription is bound to the subscriber's resource scope, so it
ends when that scope starts closing. Changes are delivered in a later task,
coalesced, to synchronous handlers; asynchronous reactions go through a
latest-only load lane. Failures of subscriber callbacks go to the owner's error
sink. Any module may own a store, so a parent passes changed data to its
children by owning a derived store.

No module reaches another through global or ambient state: there is no bus, no
proxy and no automatic dependency tracking, and factories still receive only
their closed dependency record (GM-REQ-012). The package's only ambient state
is its internal delivery context for the echo and cascade guards, which no API
exposes.

### Contract

The root exports the values `createStore` and `ObservationError`, and the
types `Key`, `Keys`, `Frozen`, `FixedKeys`, `Snapshot`, `SnapshotOf`,
`LoadContext`, `Subscription`, `WatchSpec`, `LoadSpec`, `ReadonlyStore`,
`Store`, `ListenerError`, `StoreOptions` and `ObservationErrorCode`. The
`./testing` export provides the values `liveSubscriptions`, `delivered`,
`settled` and `asyncDetection` and the type `WaitOptions`. The package README
and its rejecting tests own the exact invariants. In summary:

- `createStore(initial, { name, resources, reportError })` creates a store
  whose key set is the key set of `initial`. A record type with optional
  properties or an index signature does not compile. Values are plain data;
  accessors, class instances, functions, `Date`, `Map` and `Set` are rejected,
  because they could change without a commit. The store closes when the
  owner's scope releases its entry.
- The owner's facet `Store` has `read`, `set`, `readonly` and `close`.
  `set(patch)` commits the keys in the patch, keeps every other key and returns
  the revision; a patch that changes nothing, by `Object.is` per key, commits
  nothing. `set` validates every value first, then takes ownership of the
  objects and freezes them in place. `readonly()` returns the facet other
  modules receive.
- The facet `ReadonlyStore` has `read`, `watch` and `load` and no way to write
  or close. It carries a type-only marker of its record type, so a facet of one
  record is not accepted for another through aliases, `Readonly`,
  intersections, containers, or `Pick` and hand-written port types that include
  `read`; a facet of a wider record serves a narrower slice. A port made of
  `watch` alone, or a member type of `watch`, is still accepted structurally, so
  a dependency is typed only as `ReadonlyStore<Slice>`.
- `read(keys)` returns a snapshot: the revision and the frozen values of
  exactly those keys. Snapshots are branded; a hand-built one does not compile
  and a copied or foreign one fails at run time. A revision is a commit number,
  not proof that a value changed, so handlers apply idempotently.
- `watch(snapshot, { resources, name, onChange })` follows every key of the
  snapshot, starting at the snapshot's revision. A commit between `read` and
  `watch`, also across an `await` in the factory, is delivered. There is no
  separate starting revision to pass and no key list to repeat.
- `load(snapshot, { resources, name, loader, onLoading, onResult, onError })`
  keeps an asynchronous result in step with the snapshot's keys. It uses the
  snapshot for the keys only; its first run uses the newest values. It has one
  active run and at most one pending, a change aborts the running run through
  its signal, `onLoading` runs when a newer run is queued, and a result or
  failure is delivered only if no commit has touched the keys since its run
  started.
- `resources` is required. A watch binds to `resources.signal` and is detached
  whenever that signal aborts: when the scope or an ancestor starts closing,
  and when the run that constructs the module is cancelled before its factory
  settles (ADR-0030). Nothing is registered in the scope for a watch. A load
  also opens a child scope `load:<name>` that drains its running run; a run
  still going after the Host escalates is a failed debt.
- `name` is required and unique per store within one scope; a duplicate throws.
  The owner sets two limits on live subscriptions: per subscriber scope
  (default 64 per store), so a leak inside one scope fails there, and per store
  (default 8192), a safety net that stops a leak of unclosed child scopes; once
  it is reached, every new subscription to that store fails until the leak is
  released. Its message gives the number of scopes and the largest count in
  one.
- `onChange`, `onLoading`, `onResult` and `onError` are synchronous and typed
  to return `undefined`. Each runs isolated: a throw or a returned value is
  reported to the owner's `reportError` with the subscription's name and the
  revision, never stops another delivery, and leaves the subscription active.
  `ListenerError` is branded, so only the store creates reports. `reportError`
  is synchronous and must not throw; a throw from it is rethrown as an uncaught
  exception, which the package does not isolate.
- A subscription that is detached is never called again, also in the middle of
  a delivery; one added during a delivery waits for the next. Within one
  delivery the call order is deterministic but not part of the contract; no
  module relies on it.
- `close()` detaches every live subscription, sends each one report
  `observation.source.closed` and aborts running loads. After it, `set`,
  `watch`, `load` and the facet's `read` throw `observation.store.closed`; the
  owner's own `read` still returns the last values, so it can save them.
- Every error the package itself creates is an `ObservationError` with a
  stable `code` of the form `observation.<area>.<reason>`; consumers compare
  codes, never classes. A report keeps what a handler threw unchanged as its
  `cause`. If `resources.signal` is already aborted, `watch` and `load`
  register nothing and rethrow its reason as it is: `resources.scope.closed`
  when the scope started closing, or the Host's own reason when the run that
  constructs the module was cancelled.
- The record type parameter of `Store` is invariant and that of
  `ReadonlyStore` is covariant; the type marker, not the variance annotation,
  carries the slice check.

### Echo and cascade guards

A handler never changes what notified it. Deliveries and load runs carry a
delivery context. A commit made in a live context that changes a key the
delivering subscription follows on the same store fails at once with
`observation.delivery.echo`. Every other commit made in a live context is one
step deeper than its delivery; a commit outside any live context has depth
zero, and a delivery takes the largest depth among the commits it coalesces. A
commit deeper than 64 steps fails with `observation.delivery.cascade`. A
failing commit changes nothing, is reported to the `reportError` of the store
it was made to and then throws. In a fire-and-forget continuation that is an
unhandled rejection, which Node's default policy turns into a process exit: a
programming bug fails fast instead of looping silently. A Host may choose its
own unhandled-rejection policy.

The context is carried synchronously everywhere and, where `AsyncLocalStorage`
is available, through `await` and promise jobs. It counts only while it is
live: a handler's context until the end of its delivery task, a loader's
context while its run is active. When work started in a context, such as a
timer, a server or a connection, commits after the context's window has ended,
the commit has depth zero, so work a handler starts never raises a false echo.
A loader's window is its whole run, so a loader does not start long-lived work:
a write that such work makes to a key the load follows during the run counts as
an echo.

### Signals and scheduling

A delivery runs in a later task. The package resolves "a later task" once, when
it loads: `setImmediate` from `node:timers` through `process.getBuiltinModule`,
otherwise a global `setImmediate`, otherwise a zero-delay timer. Deferred
delivery keeps `set` non-reentrant and lets one commit reach many
subscriptions once. The root export owns no deadlines, retries or process
control, and starts no work that a call did not ask for; only the waits of
`./testing` have a deadline.

The package aborts a load run through an `AbortController` it owns. A listener
that module code adds to such a signal must not throw: the platform reports
such an exception as an uncaught error and the package cannot isolate it. The
same holds for every signal that Get Modular packages hand to module code.

Supported environments: Node 24 and 26, with asynchronous detection and
`setImmediate` ordering. Bun 1.3 was observed to behave the same, except that
an unhandled rejection does not end its process; it is not part of the
admission matrix. Where `process.getBuiltinModule` or `AsyncLocalStorage` is
missing, the package imports and works with synchronous detection only and no
ordering beyond "a later task"; this was checked with a simulated runtime, not
in a browser.

### Testing entry point

`./testing` gives tests `liveSubscriptions(facet, resources?)`, the waits
`delivered()` and `settled()` with an optional store filter, a signal and a
deadline, and `asyncDetection`. The deadline is on by default (`timeoutMs`,
5000 ms of real time); only an explicit `timeoutMs: Infinity` removes it, and a
passed signal ends a wait earlier without removing it. Where
`process.getBuiltinModule` exists, the package takes `setImmediate` from
`node:timers` and captures it and the clock when it loads, so fake global
timers, installed before or after the import, stall neither deliveries nor
waits; node:test `mock.timers`, which also replaces `node:timers`, is enabled
after the import. Elsewhere it captures the global `setImmediate` at load, so
fake timers installed before the import can stall deliveries. A module test
closes its scopes and asserts the store-wide `liveSubscriptions(facet) === 0`.
Production code does not import `./testing`; its waits would be a hidden global
synchronization point between modules.

### Mechanism and authority

Get Modular provides the mechanism. The owner of a store decides what to
commit and when, and validates input before it commits. A subscriber decides
what to do with a value. The Host decides how long to wait, when to escalate or
abandon, whether a module that does not follow a change needs a reconstruction
with a new identity, and whether the product is ready.

`docs/architecture/system-boundary.md` stays unchanged. The package runs
subscriber callbacks and load runs only in response to a library call (`set`,
`watch`, `load` or a close), as Assembly runs factories only when the Host
calls `run()` and resources runs cleanups only on `close()`. Unlike resources,
it defers them to a later task and carries a delivery context; its root export
still owns no deadline, retry or process control. Get Modular decides no product
lifecycle and holds no lifecycle authority, and nothing is discovered by
reflection. Three words of the boundary need a precise reading:

- **Drain.** A load's drain is a cleanup entry in the `load:<name>` child of the
  subscriber's scope; it runs when the Host closes that scope or the store
  closes. It waits only for the package's own load runs and never drains
  product traffic or routes.
- **Fencing.** Delivering a load result only for values still current is a
  data check on one store, not fencing of routes or generations.
- **Readiness.** A first result or failure is data. Whether the product is
  ready stays the Host's decision.

The Consumer Module Standard asks for an explicit demonstrated need before a
consumer adopts a runtime mechanism for independently managed lifecycle. For
this package and its disposable TEST consumer, the owner direction recorded in
OD-007 and in this record is that need, and the owner accepted that no
production consumer lands in the same delivery. A production consumer that
adopts a store demonstrates its own need under the Consumer Module Standard it
pins.

### Trust

Stores and subscriptions run trusted in-process module code, including plugin
modules that a Host assembles in process. The package cannot stop a loader
that ignores its signal or revoke a value a module kept. A Host that follows a
plugin's store sends its own handler failures to that plugin's `reportError`;
this is acceptable for trusted in-process code only. Third-party or untrusted
code runs in a runtime the Host can terminate, as ADR-0030 requires for
cleanup; observation, like `Resources`, is not part of any plugin SPI.
`readonly()` carries no `set` or `close`, and a module never receives a
`ScopeControl` (ADR-0030); which facets and command ports a plugin receives is
Host policy.

A dynamic Host that uses the lifecycle kernel (ADR-0029) closes the scope in
which a plugin subscribed when it retires the plugin, or has the plugin
subscribe in a child scope that it closes at quiesce: a watch calls its handler
until its scope starts closing, and the package does not check kernel call
admission.

### Module communication rules

The Consumer Module Standard and its examples change in the delivery that adds
the package; the reviewed bytes of the Standard are pinned again where the
repository pins them today, the frozen SDK-growth observation of the Standard
stays as recorded, and every consumer that pins the Standard reviews the delta
and migrates its pin in that delivery or records the outstanding work:

- Rule 5 of the module resource scopes: a subscriber subscribes in its own
  scope through an API that takes its `resources` and binds to its signal; work
  shorter than the module subscribes in a `child()` scope that it closes when
  the work ends; a provider API that still returns a disposer is wrapped as
  `{ [Symbol.dispose]: unsubscribe }` and registered with `resources.use`.
- Rule 6 notes that a subscription bound to the scope's signal detaches before
  any cleanup, whatever its registration order; the order applies to
  subscriptions released by a disposer.
- Rule 11 gains one sentence: `watch` and `load` are called in the module's
  composition file, which receives `resources`; adapters receive values or a
  consumer-owned port, because domain and application code never see
  `Resources` and the CMS lint snippet keeps `@get-modular/*` out of
  `adapters/`.
- A module that needs a value only at construction reads it and does not
  follow it. A module that follows a value depends on its own slice. An owner
  publishes a few area contracts, such as theme, logging and region, and hands
  out the same facet under each, so a new key changes only its area's
  consumers.
- A child asks its owner for a change through a command port that returns a
  typed result; the confirmed change comes back as new state. A module never
  writes another module's state.
- `./testing` is imported from test files only: the CMS oxlint snippet gains a
  `no-restricted-imports` path for `@get-modular/observation/testing` in every
  non-test file, and the admission evidence includes a fixture that the snippet
  rejects with the pinned oxlint.
- The Standard's list of error-code namespaces gains
  `observation.<area>.<reason>`.
- The resources documentation of `Resources.signal` states that it also
  aborts when the run that constructs the module is cancelled before its
  factory settles, and that subscriptions bound to it detach then.
- The module authoring guide (`docs/guides/module-authoring.md`) gains a module
  communication section built from the archived catalog of best and worst
  practices; the Standard links it.

Reading a durable authority, such as a database or a file, at the moment of
each operation stays valid; a store is for state that modules follow, not a
cache in front of such an authority.

### Dependencies and leaf admission

`@get-modular/resources` is a peer declared with the workspace caret range, so a
packed archive names exactly one 0.x minor of resources. Every minor release of
resources is accompanied by a minor release of observation, as ADR-0033
requires for conformance; the release that bumps resources carries its own
minor changeset for observation, because Changesets 3.0.2
(`@changesets/assemble-release-plan` 7.0.0) gives an out-of-range peer
dependent only a patch. Admission extends the existing leaf-package checks: the
row declares resources as its only peer and lists after the resources row. The
row also lists its subpaths, the root and `./testing`: the export-map checks
admit exactly those two for this row and keep one root for every other row, and
the leaf build requires `dist/testing.js` and `dist/testing.d.ts`. The
packed-root test resolves both through `import` and `require(esm)` and keeps
the negative deep-import, package-manifest and unknown-subpath cases of
ADR-0012. The admission entry arrives in the same change as the package root
and its implementation. No entry, stub or pending root precedes them; until
then the existing checks keep rejecting `packages/observation`.

### Publication and versioning

The package is public from 0.1.0. Versions come from Changesets in a release
pull request; 0.1.0 ships in the first release pull request after the package
and its rejecting tests are on `main`, and the bounded TEST consumer then runs
on that pull request's archives (see "Admission evidence"). Uploads follow the
release rules that ADR-0030 applies to resources; no unattended publisher is
created. Pre-1.0 breaking changes ship as minor releases with a CHANGELOG entry
and a migration note, without compatibility aliases (ADR-0009). Version 1.0.0
needs a separate decision. While G1 is on hold, the package is not enrolled in
`package.public-api-compatibility` or G1 SDK growth.

### Admission evidence

Rejecting tests cover the invariants above. They carry over from the archived
API design and run in the package: the negative type probes, the structural
slice probes and the probes against Assembly's `implement` and `scoped` on the
repository's minimum and pinned TypeScript compilers (today 5.8.3 and 7.0.2),
with NodeNext resolution and, as a new check, Bundler resolution; the runtime
probes for release on close, retention under garbage collection, bounded
buffers and dispatch by key (through an internal counter hook that the package
does not export), limits, load drain and debts, echo and cascade at the first
step and at the bound, no false report from work that outlives a delivery
(heartbeat, server, depth), the testing deadline and fake timers installed
before and after the import, an import and delivery without `setImmediate`
and `process.getBuiltinModule`, and a fixture that the CMS oxlint snippet
rejects for an import of `@get-modular/observation/testing` outside a test
file. Every runtime probe runs on each supported Node
line in the Linux, macOS and Windows lanes, and probes assert counts and order,
not wall-clock thresholds. A mutation check applies each defect of the archived
list (one patched copy of the source per defect, never a switch in shipped
code) and requires at least one probe to fail for each. The reference
solutions of the writer tasks pass, and every negative control fails, against
the package build. Subprocess tests assert that an unhandled echo in a
fire-and-forget continuation ends a Node process with a non-zero exit after
exactly one report, that a throwing abort listener on a load signal surfaces as
an uncaught exception while the store keeps delivering to other subscriptions,
and that a throwing `reportError` surfaces as an uncaught exception. A
packed-root test installs the exact archive together with the resources archive
on the supported Node lines. A bounded TEST consumer, defined with the writer
tasks in `research/module-communication-2026-10/`, runs on the release archives
and must pass before the release pull request merges; a failure stops the
release of those archives, the fix lands on `main`, and the experiment runs
again on regenerated archives. A successor decision is needed only if this
decision itself changes.

### Known items

Each item has an owner and a trigger for revisiting it:

- An echo that crosses a timer or real I/O is not detected. Owner: observation.
  Trigger: AsyncContext in the supported runtimes, or the first such incident.
- Reports and limit messages name the subscriber's scope by path only once
  resources provides a read-only `Resources.path`. Owner: resources. Trigger:
  `Resources.path` in a resources minor release.
- Runtimes without `AsyncLocalStorage` reached through
  `process.getBuiltinModule` (browsers, Electron renderers without Node
  integration, some Jest environments) detect synchronous chains only, and a
  browser has not been tested. Owner: observation. Trigger: the first consumer
  outside Node, or a test runner where `asyncDetection` is false.
- A loader that starts long-lived work is a documented rule, not a prevented
  one. Owner: observation. Trigger: the first report of such a false echo.
- A throwing abort listener on a load signal is not isolated, by design of the
  platform; a subprocess test pins that the store keeps delivering. Owner:
  observation. Trigger: the first incident, or a platform API that isolates
  abort listeners.
- The bounds of 64 cascade steps, 64 subscriptions per scope and 8192 per store
  are judgment calls. Owner: observation. Trigger: a real consumer that reaches
  one of them legitimately.

### Resolution of OD-007

This decision resolves OD-007. It admits the public package that option A
proposed, designed library-first, with A's keyed source as a store, and takes
option C's placement: every subscription belongs to the subscriber's scope and
there is no hub. The owner decision of 2026-10-16 replaced item 2 and the first
sentence of item 3 (participation as one `provides` entry) of the direction of
2026-10-01; modules still stay factories without lifecycle methods, base
classes or reflective discovery, and what OD-007 called the escape hatch is now
the only form. Of option C's recorded weaknesses, only self-reported readiness
remains: the package owns every load lane and registers its drain in the
subscriber's scope, so the drain of asynchronous work at close is observed
through resources rather than self-reported; whether a first load has settled
is still the subscriber's own state, which a Host reads through that module's
port when it decides readiness; a watch is bound to the scope's signal; and a
subscription is one call. Option A's hub, participants and Host-only writes
are not adopted.

It departs from two constraints that OD-007 recorded, by the same owner
decision: the owner of a store, not the Host, decides what to commit, and the
package keeps one internal deferral queue per package copy, which no
production module configures or reaches; pluggable schedulers stay a non-goal.

### Non-goals

Lifecycle methods or base types on modules, a notification context in every
factory, reflective discovery, a source status or health contract, a readiness
protocol, in-place dependency replacement, cross-store transactions, selectors
and per-subscriber equality, a computed graph, a `readonly(keys)` projection, a
watch over several stores at once, adapters to signals, observables or other
stores, pluggable schedulers, history or replay, dual CommonJS builds and
compatibility shims. Events (`createEvent`, `emit`, `subscribe`) and a registry
for contributions that come and go are later additions with their first real
consumer; they reuse the delivery context, the guards and `ListenerError`.

## Consequences

- Modules get one way to read state and one way to follow changes; modules
  that do not follow changes are untouched.
- A parent passes changed data to its children by owning a store; a child asks
  for changes through a command; no module writes another module's state.
- Making a module a subscriber edits nothing outside it: its dependency is a
  `required` slot that Assembly completes, and its subscription lives in its
  own scope; a new module is still listed in its feature's group (ADR-0036).
  Plugins and dynamic instances subscribe the same way through inputs.
- Stale asynchronous results, subscribers that silence each other, listener
  leaks, echoes and runaway cascades are excluded or reported by the mechanism
  instead of by review.
- An echo through a timer or real I/O is not detected; it loops at the speed of
  that I/O.
- Under Node's default policy an echo or a cascade in a fire-and-forget
  continuation, or a throwing `reportError`, ends the Host process; a Host that
  wants otherwise sets its own policy for unhandled rejections and uncaught
  exceptions.
- A loader that ignores its abort signal can keep running after its scope
  closed; escalation reports it as a debt, it does not stop it.
- A revision is not a value comparison; handlers apply idempotently.
- A resources minor release forces an observation minor release.
- The first public API is shaped by TEST and writer evidence; deliberate 0.x
  breaks are expected once production consumers arrive.
- A new public package and its subpath add release and admission maintenance.

## Rejected alternatives

- A hub per event family collecting opaque participants through `many()`: one
  root row that names every subscriber, private sub-feature identities named in
  the root, no reach into dynamic instances or plugins, and a second
  subscription rule next to the Consumer Module Standard's.
- Writes reserved to the Host: a parent module could not pass changed data to
  its children.
- One product-wide settings record in every module's types: every new key
  would be a breaking revision for every consumer and plugin.
- A watch with a separate key list and a starting revision: the information is
  repeated and can drift; forgetting the revision loses a change silently.
- A watch that returns the snapshot it starts from: one `await` between the
  call and the use of the result lost a change without any error.
- A global or string-topic event bus, a mediator or automatic dependency
  tracking: links become invisible in code and in the composition plan.
- Runtime dependencies on signal, observable or event-emitter libraries: none
  isolates listener errors, cancels stale asynchronous work and fits a leaf
  package.
- The test helpers in `@get-modular/conformance`: every user of conformance
  would install observation as a peer, and the waits need the scheduler of the
  observation copy under test, which no public API exposes. The subpath imports
  no test runner and no test dependency, the risk for which ADR-0003 rejected
  conformance subpaths.
- A required handler for a closed source in every watch: boilerplate that is
  nearly always unused; a coded report covers the case.
- One subscription limit per store only: one leaking module made an innocent
  module's factory fail.
- A child scope per watch: three times the memory of a signal binding with the
  same release behavior.
- A delivery context without a lifetime: timers and servers started in a
  handler inherited it and raised false echoes.
- The same mechanism inside one product Host: every consumer would grow its own
  variant, which is the state this package ends.
- Lifecycle methods or classes for modules: they couple every module to a hook
  set and force migrations when a hook is added.
